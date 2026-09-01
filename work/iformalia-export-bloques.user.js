// ==UserScript==
// @name         iFormalia - Exportacion por bloques con nombre y fecha
// @namespace    coremsa.formacion
// @version      1.4.0
// @description  Descarga de una tacada todos los bloques del listado de iFormalia respetando el filtro activo, y nombra cada fichero como "N. De X a Y - AAAA-MM-DD_HH-MM-SS.csv"
// @author       Grupo Coremsa
// @match        https://grupocoremsa.iformalia.es/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/alegoncer/TM
// @supportURL   https://github.com/alegoncer/TM/issues
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/work/iformalia-export-bloques.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/work/iformalia-export-bloques.user.js
// ==/UserScript==

// ---------------------------------------------------------------------------
// AUTOACTUALIZACION
// Tampermonkey compara la @version de arriba con la del fichero que hay en
// @updateURL. Si la del repositorio es mayor, se actualiza solo.
//
// Para publicar un cambio: sube la version (1.4.0 -> 1.4.1) y haz commit en
// main. Si no subes la version, Tampermonkey NO se actualiza aunque el
// contenido haya cambiado.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  // ----------------------------------------------------------------------
  // CONFIGURACION
  // ----------------------------------------------------------------------
  const CFG = {
    eventTarget: 'Export_Parcial_ContentListado_ctrl_listado',
    filasPorBloque: 50000,   // tamano de bloque que usa iFormalia
    pausaMs: 3000,           // espera entre bloques
    extension: 'csv',        // la exportacion devuelve text/csv, no xlsx real
    reintentos: 2,
    margenIcono: 14,         // px de separacion entre el ultimo icono y el boton
  };

  // ----------------------------------------------------------------------
  // GUARDAS: solo el documento de la rejilla, y solo en Oferta Formativa
  // ----------------------------------------------------------------------
  const form = document.forms[0];
  if (!form) return;
  if (!form.querySelector('input[name="__EVENTTARGET"]')) return;
  if (!document.querySelector('.rgInfoPart')) return;

  function esOfertaFormativa() {
    const patron = /OFERTA\s+FORMATIVA/i;

    // Miga de pan del propio listado. Solo los primeros nodos de texto, para no
    // forzar un recalculo de toda la rejilla.
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let i = 0; i < 400; i++) {
      const n = tw.nextNode();
      if (!n) break;
      if (patron.test(n.nodeValue || '')) return true;
    }

    // Pestana activa en algun frame padre del mismo dominio.
    let w = window;
    for (let i = 0; i < 6 && w !== w.parent; i++) {
      w = w.parent;
      let d;
      try { d = w.document; } catch (e) { break; }
      if (!d) break;
      const activas = d.querySelectorAll(
        '.rtsSelected, li.selected, td.selected, .TabActiva, .tabSeleccionada, [class*="select" i]'
      );
      for (const el of activas) if (patron.test(el.textContent || '')) return true;
    }
    return false;
  }

  if (!esOfertaFormativa()) {
    console.info('[iFormalia] Pestana distinta de Oferta Formativa: no se inyecta nada.');
    return;
  }

  // ----------------------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------------------
  const p2 = (n) => String(n).padStart(2, '0');

  /** "AAAA-MM-DD_HH-MM-SS" en hora local, en el momento de la llamada. */
  function sello() {
    const d = new Date();
    return [d.getFullYear(), p2(d.getMonth() + 1), p2(d.getDate())].join('-') +
      '_' + [p2(d.getHours()), p2(d.getMinutes()), p2(d.getSeconds())].join('-');
  }

  /** Quita los caracteres que Windows no admite en un nombre de fichero. */
  const limpiar = (s) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

  /** Total de registros, leido del pie de la rejilla. */
  function totalRegistros() {
    const pie = document.querySelector('.rgInfoPart');
    if (!pie) return null;
    const m = pie.textContent.match(/Elementos\s+\d+\s+de\s+\d+\s+de\s+([\d.,]+)/i);
    return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : null;
  }

  /** Misma lista de bloques que la ventana de iFormalia, sin abrirla. */
  function calcularBloques() {
    const total = totalRegistros();
    if (!total) return [];
    const n = Math.ceil(total / CFG.filasPorBloque);
    const out = [];
    for (let i = 0; i < n; i++) {
      const desde = i * CFG.filasPorBloque + 1;
      const hasta = Math.min((i + 1) * CFG.filasPorBloque, total);
      out.push({
        indice: i,
        etiqueta: `${i + 1}. De ${desde} a ${hasta}`,
        argumento: `${i}_${CFG.filasPorBloque}`,
      });
    }
    return out;
  }

  /** Lanza un bloque replicando el postback y guarda el fichero con nuestro nombre. */
  async function descargarBloque(bloque) {
    const datos = new FormData(form);
    datos.set('__EVENTTARGET', CFG.eventTarget);
    datos.set('__EVENTARGUMENT', bloque.argumento);

    const resp = await fetch(form.action, { method: 'POST', body: datos, credentials: 'same-origin' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const blob = await resp.blob();
    const tipo = (resp.headers.get('content-type') || '').toLowerCase();
    if (tipo.includes('text/html')) throw new Error('El servidor devolvio HTML: sesion caducada');
    if (blob.size < 1024) throw new Error('Fichero sospechosamente pequeno (' + blob.size + ' bytes)');

    const nombre = limpiar(`${bloque.etiqueta} - ${sello()}`) + '.' + CFG.extension;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    return { nombre, bytes: blob.size };
  }

  // ----------------------------------------------------------------------
  // ANCLAJE
  // No insertamos nada dentro del HTML del sitio: la celda de los iconos tiene
  // ancho fijo y cualquier cosa que se meta dentro la desborda y los tapa.
  // Medimos el ultimo icono y colocamos nuestra barra en position:fixed a su
  // derecha, en el hueco vacio de la cabecera.
  // ----------------------------------------------------------------------
  function iconos() {
    const porSrc = [
      'img[src*="excel" i]', 'img[src*="xls" i]', 'img[src*="export" i]',
      'input[type="image"][src*="excel" i]',
      'input[type="image"][src*="xls" i]',
      'input[type="image"][src*="export" i]',
    ].join(',');

    let ref = document.querySelector(porSrc);
    if (!ref) {
      ref = [...document.querySelectorAll('a,img,input')].find((e) => {
        const oc = e.getAttribute('onclick') || '';
        return /export/i.test(oc + (e.id || '')) && !/Export_Parcial/.test(oc);
      });
    }
    if (!ref) return [];

    let cont = ref.closest('td, div, span, p') || ref.parentElement;
    for (let i = 0; i < 3 && cont && cont.parentElement; i++) {
      if (cont.querySelectorAll('img, input[type="image"]').length >= 2) break;
      cont = cont.parentElement;
    }

    const lista = [...cont.querySelectorAll('img, input[type="image"]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return lista.length ? lista : [ref];
  }

  /** Rectangulo que ocupa el grupo de iconos, o null si no se puede medir. */
  function rectIconos() {
    const lista = iconos();
    if (!lista.length) return null;
    let der = -Infinity, arr = Infinity, aba = -Infinity;
    for (const el of lista) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      der = Math.max(der, r.right);
      arr = Math.min(arr, r.top);
      aba = Math.max(aba, r.bottom);
    }
    if (der === -Infinity) return null;
    return { right: der, top: arr, bottom: aba, centro: (arr + aba) / 2 };
  }

  // ----------------------------------------------------------------------
  // INTERFAZ
  // Barra de una sola linea: boton + resumen. En reposo NO tapa nada, va en el
  // hueco libre a la derecha de los iconos. El detalle se abre solo si lo pides.
  // ----------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    .cor-bar{
      position:fixed;z-index:2147483000;display:flex;align-items:center;gap:10px;
      font:11px/1.5 Segoe UI,Arial,sans-serif;color:#4a4a4a;white-space:nowrap;
    }
    .cor-bar button.cor-go{
      padding:2px 9px;cursor:pointer;font:600 11px/1.5 Segoe UI,Arial,sans-serif;
      color:#fff;background:#b9922f;border:1px solid #96751e;border-radius:3px;
    }
    .cor-bar button.cor-go:hover:not(:disabled){background:#a8842a}
    .cor-bar button.cor-go:disabled{opacity:.6;cursor:default}
    .cor-resumen{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
    .cor-panel{
      position:fixed;z-index:2147483001;width:360px;overflow:auto;display:none;
      font:12px/1.45 Segoe UI,Arial,sans-serif;color:#1c1c1c;background:#fff;
      border:1px solid #b9922f;border-radius:5px;box-shadow:0 6px 18px rgba(0,0,0,.25);
      padding:8px 10px;
    }
    .cor-panel.cor-on{display:block}
    .cor-panel h4{
      margin:0 0 5px;font-size:12px;color:#8a6d1e;
      display:flex;justify-content:space-between;align-items:center;
    }
    .cor-panel h4 button{
      background:none;border:0;font-size:16px;line-height:1;cursor:pointer;color:#8a6d1e;padding:0 2px;
    }
    .cor-log{white-space:pre-wrap;font:11px/1.4 Consolas,monospace;margin:0}
  `;
  document.head.appendChild(css);

  const barra = document.createElement('div');
  barra.className = 'cor-bar';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'cor-go';
  boton.textContent = 'Descargar bloques';
  boton.title = 'Descarga todos los bloques con el filtro actual, nombrados con fecha y hora';

  const resumen = document.createElement('span');
  resumen.className = 'cor-resumen';
  resumen.title = 'Ver el detalle de las descargas';

  barra.append(boton, resumen);
  document.body.appendChild(barra);

  const panel = document.createElement('div');
  panel.className = 'cor-panel';
  const h4 = document.createElement('h4');
  h4.textContent = 'Detalle de la exportacion';
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.textContent = '×';
  cerrar.title = 'Cerrar';
  h4.appendChild(cerrar);
  const log = document.createElement('pre');
  log.className = 'cor-log';
  log.textContent = 'Todavia no se ha descargado nada en esta sesion.';
  panel.append(h4, log);
  document.body.appendChild(panel);

  // -------------------------------- colocacion
  function colocar() {
    const r = rectIconos();
    if (r) {
      barra.style.left = Math.round(r.right + CFG.margenIcono) + 'px';
      barra.style.top = Math.round(r.centro - barra.offsetHeight / 2) + 'px';
      barra.style.right = '';
      barra.style.bottom = '';
      // Si se saliera por la derecha, lo pegamos al borde.
      const rb = barra.getBoundingClientRect();
      if (rb.right > window.innerWidth - 8) {
        barra.style.left = Math.max(8, window.innerWidth - 8 - rb.width) + 'px';
      }
    } else {
      barra.style.left = '';
      barra.style.top = '';
      barra.style.right = '12px';
      barra.style.bottom = '12px';
    }
    colocarPanel();
  }

  /**
   * El panel solo se abre bajo demanda. Se cuelga de la barra y se le recorta
   * el alto para que nunca llegue a la barra de paginacion de abajo.
   */
  function colocarPanel() {
    if (!panel.classList.contains('cor-on')) return;

    const rb = barra.getBoundingClientRect();
    const ancho = panel.offsetWidth || 360;
    let izq = rb.left;
    if (izq + ancho > window.innerWidth - 8) izq = window.innerWidth - ancho - 8;
    if (izq < 8) izq = 8;

    const arriba = rb.bottom + 6;

    const pie = document.querySelector('.rgInfoPart');
    const barraPie = pie ? (pie.closest('.rgPager, tr, table') || pie) : null;
    const suelo = barraPie
      ? Math.min(barraPie.getBoundingClientRect().top, window.innerHeight)
      : window.innerHeight;

    panel.style.left = izq + 'px';
    panel.style.top = arriba + 'px';
    panel.style.maxHeight = Math.max(90, suelo - arriba - 10) + 'px';
  }

  function abrirPanel(v) {
    panel.classList.toggle('cor-on', v);
    if (v) colocarPanel();
  }

  cerrar.addEventListener('click', () => abrirPanel(false));
  resumen.addEventListener('click', () => abrirPanel(!panel.classList.contains('cor-on')));
  window.addEventListener('resize', colocar);
  window.addEventListener('scroll', colocar, true);

  // -------------------------------- estado
  let ultimoConteo = '';

  function refrescar() {
    const bloques = calcularBloques();
    const total = totalRegistros();
    ultimoConteo = total
      ? `${total.toLocaleString('es-ES')} registros con el filtro actual = ${bloques.length} bloque(s)`
      : 'No se ha podido leer el total de registros';
    resumen.textContent = ultimoConteo;
    boton.disabled = bloques.length === 0;
    colocar();
    return bloques;
  }

  function anotar(linea) {
    if (log.textContent.startsWith('Todavia no')) log.textContent = '';
    log.textContent += (log.textContent ? '\n' : '') + linea;
    panel.scrollTop = panel.scrollHeight;
  }

  // -------------------------------- descarga
  boton.addEventListener('click', async () => {
    const bloques = refrescar();
    if (!bloques.length) return;

    const ok = confirm(
      `Se van a descargar ${bloques.length} ficheros con el filtro que tienes puesto ahora mismo.\n\n` +
      `No cambies de pantalla ni recargues hasta que termine.\n\n¿Continuar?`
    );
    if (!ok) return;

    log.textContent = '';
    boton.disabled = true;

    let fallos = 0;
    for (const bloque of bloques) {
      let hecho = false;
      for (let intento = 0; intento <= CFG.reintentos && !hecho; intento++) {
        try {
          boton.textContent = `Descargando ${bloque.indice + 1}/${bloques.length}`;
          resumen.textContent = `${bloque.etiqueta} en curso...`;
          const r = await descargarBloque(bloque);
          anotar(`OK  ${r.nombre}  (${(r.bytes / 1048576).toFixed(1)} MB)`);
          hecho = true;
        } catch (e) {
          if (intento === CFG.reintentos) {
            fallos++;
            anotar(`ERR ${bloque.etiqueta}: ${e.message}`);
          } else {
            anotar(`... reintento ${intento + 1} de ${bloque.etiqueta}`);
            await new Promise((r) => setTimeout(r, CFG.pausaMs * 2));
          }
        }
      }
      colocar();
      await new Promise((r) => setTimeout(r, CFG.pausaMs));
    }

    boton.textContent = 'Descargar bloques';
    boton.disabled = false;
    anotar(fallos ? `\nTerminado con ${fallos} bloque(s) fallidos.` : '\nTerminado sin errores.');
    resumen.textContent = fallos
      ? `${bloques.length - fallos} de ${bloques.length} descargados, ${fallos} con error (ver detalle)`
      : `${bloques.length} bloques descargados. ${ultimoConteo}`;
    colocar();
  });

  // -------------------------------- arranque
  refrescar();
  // Telerik termina de maquetar despues del load: recolocamos un par de veces.
  setTimeout(colocar, 300);
  setTimeout(colocar, 1200);
  if (window.ResizeObserver) {
    try { new ResizeObserver(colocar).observe(document.body); } catch (e) { /* nada */ }
  }
})();