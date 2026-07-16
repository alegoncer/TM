// ==UserScript==
// @name         SEPE - Exportar especialidades inscritas
// @namespace    https://github.com/alegoncer/TM
// @version      1.1.1
// @description  Descarga las especialidades inscritas de un CIF desde el buscador de centros del SEPE.
// @author       alegoncer
// @match        https://sede.sepe.gob.es/FOET_BuscadorDeCentros_SEDE/flows/buscadorReef*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sepe.gob.es
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @grant        none
// @run-at       document-idle
//
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/work/exportador-inscripciones-centros.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/work/exportador-inscripciones-centros.user.js
// @homepageURL  https://github.com/alegoncer/TM
// @supportURL   https://github.com/alegoncer/TM/issues
// ==/UserScript==

/*
 * CÓMO FUNCIONA (resumen técnico)
 * --------------------------------
 * La web es una app JSF + Spring WebFlow: cada paso es un POST con javax.faces.ViewState
 * y una clave de flujo (?execution=eNsM) que caduca. No hay GET/API estable, así que este
 * script NO reconstruye peticiones: pilota la propia página (rellena el campo NIF, pulsa
 * los botones y navega) usando una máquina de estados persistida en sessionStorage, porque
 * cada acción recarga la página y el userscript se vuelve a ejecutar.
 *
 * Flujo por centro:
 *   root -> abrir filtros -> escribir NIF -> Aplicar -> "Mostrar más" hasta cargar todos
 *        -> (1ª vez) capturar los códigos de todos los centros
 *        -> abrir la ficha del centro idx -> leer tabla de especialidades -> generar .xlsx
 *        -> volver a root y repetir con idx+1
 *
 * La tabla de especialidades es un DataTable client-side: todas las filas están en memoria
 * aunque solo se muestren 10, así que se leen todas por la API de DataTables.
 */

(function () {
  'use strict';

  const BASE = 'https://sede.sepe.gob.es/FOET_BuscadorDeCentros_SEDE/flows/buscadorReef';
  const STATE_KEY = 'sepeCoremsaDL';
  const HEADERS = ['CÓDIGO', 'VERSIÓN', 'TIPO', 'DENOMINACIÓN'];

  // Atajos de CIF (se muestran como botones en el panel)
  const CIFS = [
    { cif: 'B29751369', nombre: 'LEVEL' },
    { cif: 'B29681327', nombre: 'DATA' },
    { cif: 'A92194844', nombre: 'CESUR' },
    { cif: 'B73531139', nombre: 'DAVEL' },
    { cif: 'B92982651', nombre: 'COREMSA' },
  ];

  // ------- utilidades de estado -------
  const loadState = () => {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); }
    catch (e) { return null; }
  };
  const saveState = (s) => sessionStorage.setItem(STATE_KEY, JSON.stringify(s));
  const clearState = () => sessionStorage.removeItem(STATE_KEY);

  // ------- utilidades varias -------
  const $id = (id) => document.getElementById(id);
  const nifField = () => $id('formulario:nifEmpresa');
  const filtrosBtn = () => $id('formulario:botonFiltros');
  const aplicarBtn = () => $id('formulario:botonaplicar');
  const siguienteBtn = () => $id('formulario:siguiente'); // "Mostrar más"

  const centerAnchors = () =>
    [...document.querySelectorAll('a[id*=":j_id_"]')]
      .filter(a => /^\s*\d{7,}\b/.test(a.textContent.trim()));

  const parseCode = (a) => (a.textContent.trim().match(/^\d{7,}/) || [''])[0];

  const isDetail = () =>
    !!$id('formulario:tablaEspecialidades') ||
    /DETALLE DEL CENTRO/i.test(document.body.innerText);

  const getIdentificador = () => {
    const m = document.body.innerText.match(/Identificador del centro:\s*(\d+)/i);
    return m ? m[1] : null;
  };

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  };

  const cellText = (html, suffix) => {
    const div = document.createElement('div');
    div.innerHTML = html == null ? '' : String(html);
    if (suffix) {
      const el = div.querySelector('span[id$="' + suffix + '"]');
      if (el) return el.textContent.trim();
    }
    return div.textContent.replace(/\s+/g, ' ').trim();
  };

  // Lee TODAS las filas de la tabla de especialidades (DataTable client-side)
  const readEspecialidades = () => {
    const rows = [];
    const jq = (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery;
    const sel = '#formulario\\:tablaEspecialidades';
    try {
      if (jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable(sel)) {
        const api = jq(sel).DataTable();
        api.rows().data().each((row) => {
          rows.push([
            cellText(row[0], ':codigo'),
            cellText(row[1], ':version'),
            cellText(row[2], ':tipo'),
            cellText(row[3], ':denominacion'),
          ]);
        });
        return rows;
      }
    } catch (e) { /* cae al fallback */ }

    // Fallback: leer solo las filas presentes en el DOM (por si DataTables no está listo)
    const domTable = $id('formulario:tablaEspecialidades');
    if (domTable) {
      domTable.querySelectorAll('tbody tr').forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 4) {
          rows.push([
            cellText(tds[0].innerHTML, ':codigo'),
            cellText(tds[1].innerHTML, ':version'),
            cellText(tds[2].innerHTML, ':tipo'),
            cellText(tds[3].innerHTML, ':denominacion'),
          ]);
        }
      });
    }
    return rows;
  };

  // ------- generación y descarga del .xlsx -------
  const descargarXlsx = (code, filas) => {
    const aoa = [HEADERS, ...filas];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(code).slice(0, 31) || 'Centro');
    const nombre = `${code}_${stamp()}.xlsx`;

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);

    if (typeof GM_download === 'function') {
      GM_download({ url, name: nombre, saveAs: false,
        onerror: () => anchorDownload(url, nombre),
        ontimeout: () => anchorDownload(url, nombre) });
    } else {
      anchorDownload(url, nombre);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const anchorDownload = (url, nombre) => {
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ------- interfaz flotante -------
  const ui = { box: null, msg: null };
  const renderPanel = () => {
    if ($id('sepeCoremsaPanel')) { return; }
    const box = document.createElement('div');
    box.id = 'sepeCoremsaPanel';
    box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff;border:2px solid #005a9c;border-radius:8px;padding:12px 14px;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);width:280px;color:#222';

    const atajos = CIFS.map((c) =>
      '<button class="sepeChip" data-cif="' + c.cif + '" title="' + c.cif + '" ' +
      'style="flex:1 1 auto;padding:5px 6px;background:#eef4fa;color:#005a9c;border:1px solid #b8d2ea;border-radius:4px;cursor:pointer;font-weight:700;font-size:12px">' +
      c.nombre + '</button>').join('');

    box.innerHTML =
      '<div style="font-weight:700;color:#005a9c;margin-bottom:8px">Descarga por CIF · SEPE</div>' +
      '<label style="display:block;margin-bottom:4px">Atajos:</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">' + atajos + '</div>' +
      '<label style="display:block;margin-bottom:4px">NIF/CIF del titular:</label>' +
      '<input id="sepeCif" type="text" placeholder="Escribe un CIF o usa un atajo" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #aaa;border-radius:4px;text-transform:uppercase;margin-bottom:8px">' +
      '<button id="sepeStart" style="width:100%;padding:8px;background:#005a9c;color:#fff;border:0;border-radius:4px;cursor:pointer;font-weight:700">Descargar todos los centros</button>' +
      '<div id="sepeMsg" style="margin-top:8px;color:#555;min-height:16px"></div>';
    document.body.appendChild(box);
    ui.box = box;
    ui.msg = $id('sepeMsg');

    // Atajos: rellenan el campo (un clic pone el CIF; se descarga con el botón)
    box.querySelectorAll('.sepeChip').forEach((btn) => {
      btn.addEventListener('click', () => {
        $id('sepeCif').value = btn.dataset.cif;
        ui.msg.textContent = btn.textContent + ' (' + btn.dataset.cif + '). Pulsa Descargar.';
      });
    });

    const start = () => {
      const cif = $id('sepeCif').value.trim().toUpperCase();
      if (!cif) { ui.msg.textContent = 'Elige un atajo o escribe un CIF.'; return; }
      saveState({ cif, codes: null, idx: 0, running: true, hechos: [] });
      location.href = BASE; // empezar limpio
    };
    $id('sepeStart').addEventListener('click', start);
    $id('sepeCif').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  };

  const renderProgress = (s, extra) => {
    let box = $id('sepeCoremsaPanel');
    if (!box) { renderPanel(); box = $id('sepeCoremsaPanel'); }
    const hechos = s.hechos ? s.hechos.length : 0;
    const total = s.codes ? s.codes.length : null;
    const pct = total ? Math.round((hechos / total) * 100) : 0;
    const totalTxt = total != null ? total : '?';
    const numActual = Math.min(s.idx + 1, total != null ? total : s.idx + 1);

    box.innerHTML =
      '<div style="font-weight:700;color:#005a9c;margin-bottom:8px">Descargando… CIF ' + s.cif + '</div>' +
      '<div style="display:flex;justify-content:space-between;font-weight:700">' +
        '<span>Centro ' + numActual + ' de ' + totalTxt + '</span><span>' + pct + '%</span>' +
      '</div>' +
      '<div style="height:10px;background:#e6e6e6;border-radius:5px;overflow:hidden;margin:6px 0">' +
        '<div style="height:100%;width:' + pct + '%;background:#1e7e34;transition:width .3s"></div>' +
      '</div>' +
      '<div style="color:#555">' + hechos + '/' + totalTxt + ' descargados</div>' +
      '<div style="margin-top:4px;color:#888;font-size:12px">' + (extra || '') + '</div>' +
      '<button id="sepeStop" style="margin-top:8px;width:100%;padding:6px;background:#c0392b;color:#fff;border:0;border-radius:4px;cursor:pointer">Detener</button>';
    const stop = $id('sepeStop');
    if (stop) stop.addEventListener('click', () => { clearState(); location.href = BASE; });
  };

  const finish = (s) => {
    clearState();
    let box = $id('sepeCoremsaPanel');
    if (!box) { renderPanel(); box = $id('sepeCoremsaPanel'); }
    box.innerHTML =
      '<div style="font-weight:700;color:#1e7e34;margin-bottom:8px">✔ Descarga completada</div>' +
      '<div>' + (s.hechos ? s.hechos.length : 0) + ' centros del CIF ' + s.cif + '.</div>' +
      '<button id="sepeReset" style="margin-top:8px;width:100%;padding:6px;background:#005a9c;color:#fff;border:0;border-radius:4px;cursor:pointer">Nueva búsqueda</button>';
    const r = $id('sepeReset');
    if (r) r.addEventListener('click', () => location.href = BASE);
  };

  // Espera a que el DataTable de la ficha esté inicializado antes de leer
  const whenTableReady = (cb, intentos = 0) => {
    const jq = (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery;
    const listo = jq && jq.fn && jq.fn.dataTable && jq.fn.dataTable.isDataTable('#formulario\\:tablaEspecialidades');
    const noTabla = !$id('formulario:tablaEspecialidades'); // ficha sin especialidades
    if (listo || noTabla || intentos > 40) { cb(); return; }
    setTimeout(() => whenTableReady(cb, intentos + 1), 200);
  };

  // ------- máquina de estados (se ejecuta en cada carga) -------
  const tick = () => {
    const s = loadState();
    if (!s || !s.running) { renderPanel(); return; }

    // 1) Estamos en una FICHA -> leer, descargar y pasar al siguiente
    if (isDetail()) {
      renderProgress(s, 'Leyendo especialidades…');
      whenTableReady(() => {
        const code = getIdentificador() || (s.codes ? s.codes[s.idx] : 'centro');
        const filas = readEspecialidades();
        descargarXlsx(code, filas);
        s.hechos = s.hechos || [];
        s.hechos.push(code);
        s.idx += 1;
        if (s.codes && s.idx >= s.codes.length) { saveState(s); finish(s); return; }
        saveState(s);
        setTimeout(() => { location.href = BASE; }, 600); // margen para la descarga
      });
      return;
    }

    const nif = nifField();
    const anchors = centerAnchors();

    // 2) Aún no conocemos los códigos -> buscar por NIF y capturarlos todos
    if (!s.codes) {
      if (!nif && anchors.length === 0) { renderProgress(s, 'Abriendo filtros…'); filtrosBtn() && filtrosBtn().click(); return; }
      if (nif && anchors.length === 0) { renderProgress(s, 'Aplicando NIF…'); nif.value = s.cif; aplicarBtn() && aplicarBtn().click(); return; }
      if (anchors.length > 0) {
        if (siguienteBtn()) { renderProgress(s, 'Cargando listado completo…'); siguienteBtn().click(); return; }
        s.codes = anchors.map(parseCode).filter(Boolean);
        s.idx = 0; saveState(s);
        renderProgress(s, 'Abriendo primer centro…');
        const a = anchors.find(x => parseCode(x) === s.codes[0]) || anchors[0];
        a.click();
        return;
      }
    }

    // 3) Ya conocemos los códigos -> navegar hasta el centro idx
    else {
      const want = s.codes[s.idx];
      if (!nif && anchors.length === 0) { renderProgress(s, 'Abriendo filtros…'); filtrosBtn() && filtrosBtn().click(); return; }
      if (nif && anchors.length === 0) { renderProgress(s, 'Aplicando NIF…'); nif.value = s.cif; aplicarBtn() && aplicarBtn().click(); return; }
      if (anchors.length > 0) {
        const a = anchors.find(x => parseCode(x) === want);
        if (a) { renderProgress(s, 'Abriendo centro ' + want + '…'); a.click(); return; }
        if (siguienteBtn()) { renderProgress(s, 'Buscando centro ' + want + '…'); siguienteBtn().click(); return; }
        // No encontrado ni tras expandir -> saltar
        s.idx += 1;
        if (s.idx >= s.codes.length) { saveState(s); finish(s); return; }
        saveState(s); location.href = BASE; return;
      }
    }
  };

  // arranque
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 400));
  } else {
    setTimeout(tick, 400);
  }
})();
