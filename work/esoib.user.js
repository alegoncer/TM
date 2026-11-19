// ==UserScript==
// @name         E-SOIB: recoger preinscripciones y marcar contactado
// @namespace    https://github.com/alegoncer/TM
// @version      0.8.1
// @description  Recorre las convocatorias que elijas, baja un único CSV con las preinscripciones con ✗ en «Contactado» y las pasa a ✓. Con ventana previa, barra de progreso y copia de seguridad.
// @author       alegoncer
// @match        https://intranet.caib.es/esoib/*
// @run-at       document-idle
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/work/esoib.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/work/esoib.user.js
// @homepageURL  https://github.com/alegoncer/TM
// @supportURL   https://github.com/alegoncer/TM/issues
// ==/UserScript==

(function () {
'use strict';
// ---- config.js ----
// CONFIG: lo único que se toca para añadir expedientes, entidades o ajustar esperas.
// Solo datos. El código de los demás ficheros no se edita para esto.
//
// - Convocatoria nueva: añadir su número a la lista de la entidad.
// - Curso nuevo: no hace falta hacer nada, el script lo encuentra en la lista de la convocatoria.
// - Entidad nueva: añadir un bloque con su nombrePagina y sus convocatorias.
const CONFIG = {
  // true = descarga los CSV pero NO pulsa «Contactado» (ensayo). false = marca de verdad.
  modoEnsayo: false,

  // Máximo de personas por pasada. null = sin límite. Para probar algo nuevo, poner 1.
  limitePersonas: null,

  // Excel en español abre bien el CSV con «;», BOM y saltos CRLF.
  separador: ';',

  // Orden y nombres de la hoja Nuevo (TablaNuevo). NOMBRE va como «Apellidos, Nombre».
  columnas: [
    'FECHA', 'DNI', 'NOMBRE', 'CIUDAD', 'SITUACIÓN LABORAL', 'NIVEL EDUCATIVO',
    'DISCAPACIDAD', 'MAIL', 'TELÉFONO', 'CURSO E-SOIB',
  ],

  // Esperas en milisegundos.
  esperas: {
    paginaMs: 1500,        // tras pasar de página en una lista
    fichaMs: 2500,         // tras abrir una ficha
    marcarMs: 8000,        // tras pulsar «Contactado» (E-SOIB a veces tarda en guardar)
  },

  // Convocatorias que se proponen en la ventana previa la primera vez que se usa una entidad. A partir de ahí
  // el script recuerda, por entidad, los códigos que se usaron la última vez (ver arranque.js).
  convocatoriasPorDefecto: ['206', '207', '222', '223'],

  // Opcional. Para dar nombre corto y códigos propios a una entidad concreta; p. ej.:
  //   MI_ENTIDAD: { nombrePagina: 'texto que sale en E-SOIB', convocatorias: ['206', '207', '208'] },
  // Con la actualización automática del script, lo que se escriba aquí se pierde: para eso están los códigos recordados.
  entidades: {},

  // Selectores y textos de la página de E-SOIB (estructura de E-SOIB al escribir este script).
  // Los ids de PrimeFaces llevan «:», por eso en CSS se escapan como «\\:».
  selectores: {
    base: '/esoib',
    menuPresente: '#frmMenus',
    entidadTexto: '#profile-options .profile-role',
    lista: {
      url: '/esoib/expedient/expedients.xhtml?te=COTEX-FORM',
      // E-SOIB recuerda en la sesión la última búsqueda (p. ej. un curso concreto). Antes de buscar
      // se vacían estos campos para que la lista salga completa (estructura observada en E-SOIB).
      prefijoId: 'frmExpedients:',
      limpiarCampos: ['txtReferencia', 'txtNumOrdre', 'modulNomCE'],
      limpiarSelects: ['cbxFamiliaProfessional_input', 'cbxEspecialitat_input', 'municipi_input'],
      convocatoriaId: 'frmExpedients:convocatoria_input',
      botonBuscaId: 'frmExpedients:btnSearchAdv2',
      cuerpo: '#frmExpedients\\:lstExpedients_data',
      pie: '#frmExpedients\\:lstExpedients .ui-paginator',
      columnaConvocatoria: 14,       // celda «Conv.» (222, 223…): sirve para saber que la tabla es de la búsqueda nueva
      columnaReferencia: 1,          // celda con «Ref.» + la referencia del curso
      tituloReferencia: 'Ref.',
    },
    preinscripciones: {
      urlConId: '/esoib/expedient/expedient_preinscripcions.xhtml?id=',   // + data-rk del curso
      cuerpo: '#frmExpedientSolicituds\\:lstSolicituds_data',
      pie: '#frmExpedientSolicituds\\:lstSolicituds .ui-paginator',
      columnaNif: 1,
      columnaContactado: 7,
      iconoNo: 'i.pi-times',         // ✗ = nueva
      iconoSi: 'i.pi-check',         // ✓ = ya contactada
      celdaParaAbrir: 1,             // clic en esta celda abre la ficha
    },
    // Preinscripciones: botón «siguiente». Lista de cursos: sin botón, solo números de página (con la activa marcada).
    paginador: { siguiente: '.ui-paginator-next', deshabilitado: 'ui-state-disabled', paginas: '.ui-paginator-page', activa: 'ui-state-active' },
    ficha: {
      dialogo: '#frmExpedientSolicituds\\:dlgCursModulSolicitud',
      cerrar: '.ui-dialog-titlebar-close',
      prefijoId: 'frmExpedientSolicituds:',
      // columna del CSV -> id del campo de la ficha (sin prefijo)
      campos: {
        FECHA: 'txtDataSolicitut', DNI: 'txtDni', CIUDAD: 'txtMunicipi',
        'SITUACIÓN LABORAL': 'txtSituacioLab', 'NIVEL EDUCATIVO': 'txtNivellEducatiu',
        MAIL: 'txtEmail', 'TELÉFONO': 'txtTelefon2',
      },
      nombre: { apellidos: ['txtCognom1', 'txtCognom2'], nombre: 'txtNom' },   // sale «Apellido1 Apellido2, Nombre»
      discapacidadCasilla: 'chkDiscap_input',
      contactadoBoton: '#frmExpedientSolicituds\\:chkContactat',
      contactadoCasilla: 'chkContactat_input',
    },
  },
};

if (typeof module !== 'undefined') module.exports = { CONFIG };

// ---- nucleo.js ----
// Núcleo: funciones puras, sin navegador. Se prueban en Node.

function validarConfig(config) {
  const errores = [];
  if (!config || typeof config !== 'object') return { ok: false, errores: ['config ausente'] };
  if (!Array.isArray(config.columnas) || config.columnas.length === 0) errores.push('columnas vacías');
  if (typeof config.separador !== 'string' || config.separador === '') errores.push('separador vacío');
  if (!config.esperas || typeof config.esperas !== 'object') errores.push('esperas ausentes');
  if (!config.selectores || typeof config.selectores !== 'object') errores.push('selectores ausentes');
  // Las entidades son opcionales (sirven para nombres cortos y códigos propuestos); si hay, deben estar bien.
  const entidades = config.entidades || {};
  {
    for (const [nombre, e] of Object.entries(entidades)) {
      if (!e || !String(e.nombrePagina || '').trim()) errores.push(`entidad ${nombre}: nombrePagina vacío`);
      if (!e || !Array.isArray(e.convocatorias) || e.convocatorias.length === 0) {
        errores.push(`entidad ${nombre}: convocatorias vacías`);
      }
    }
  }
  return { ok: errores.length === 0, errores };
}

function convocatoriasDe(config, entidad) {
  const e = config.entidades && config.entidades[entidad];
  if (!e) throw new Error(`Entidad desconocida: ${entidad}`);
  return e.convocatorias.slice();
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function entidadPorNombrePagina(config, textoPagina) {
  const texto = normalizar(textoPagina);
  if (!texto) return null;
  for (const [nombre, e] of Object.entries(config.entidades || {})) {
    const trozo = normalizar(e && e.nombrePagina);
    if (trozo && texto.includes(trozo)) return nombre;
  }
  return null;
}

// Los CSV sueltos llevan «borrar-» delante: son la red de seguridad de la pasada y se pueden borrar
// cuando el CONJUNTO está comprobado. Solo el conjunto se queda.
const PREFIJO_BORRAR = 'borrar-';

function nombreFichero(curso, orden) {
  const base = String(curso).trim().replace(/[\\/:*?"<>|\s]+/g, '-');
  return `${PREFIJO_BORRAR}${base}_${String(orden).padStart(2, '0')}.csv`;
}

function celdaCsv(valor, separador) {
  let s = valor === undefined || valor === null ? '' : String(valor);
  // Excel ejecuta como fórmula lo que empieza por = @ + - (y tabulador o retorno). Se neutraliza con un apóstrofo,
  // salvo números y teléfonos con prefijo (un «+» seguido de cifras, o un «-» seguido de cifras).
  if (/^[=@\t\r]/.test(s) || /^[+-][^0-9\s]/.test(s)) s = "'" + s;
  const necesitaComillas = s.includes(separador) || s.includes(',') || s.includes('"') || /[\r\n]/.test(s);
  return necesitaComillas ? `"${s.replace(/"/g, '""')}"` : s;
}

function construirCsv(filas, columnas, separador) {
  const lineas = [columnas.map((c) => celdaCsv(c, separador)).join(separador)];
  for (const fila of filas) {
    lineas.push(columnas.map((c) => celdaCsv(fila[c], separador)).join(separador));
  }
  return '\uFEFF' + lineas.join('\r\n') + '\r\n';
}

function claveVista(nif, curso) {
  return `${String(nif).trim().toUpperCase()}|${String(curso).trim()}`;
}

// «Encontrados 67 resultados. Página 2 de 5»  (preinscripciones)
// «Encontrados 9 resultados (1 págines).»      (lista de cursos)
function parsePaginacion(texto) {
  const s = String(texto || '');
  let m = s.match(/Encontrados\s+(\d+)\s+resultados?\.?\s+P[áa]gina\s+(\d+)\s+de\s+(\d+)/i);
  if (m) return { total: Number(m[1]), pagina: Number(m[2]), paginas: Number(m[3]) };
  m = s.match(/Encontrados\s+(\d+)\s+resultados?\s*\((\d+)\s+p[áa]gin/i);
  if (m) return { total: Number(m[1]), pagina: 1, paginas: Number(m[2]) };
  return null;
}

function quitarTitulo(texto, titulo) {
  return String(texto || '').replace(titulo, '').trim();
}

function nombreCompleto(apellidos, nombre) {
  const aps = apellidos.map((a) => String(a || '').trim()).filter(Boolean).join(' ');
  return `${aps}, ${String(nombre || '').trim()}`;
}

// Códigos de convocatoria escritos por la persona: «206, 207 222;223». Devuelve los válidos (solo cifras,
// sin repetir y en orden) y aparta lo que no lo es para poder avisar.
function parseCodigos(texto) {
  const partes = String(texto || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const codigos = [];
  const invalidos = [];
  for (const p of partes) {
    if (/^\d{1,4}$/.test(p)) { if (!codigos.includes(p)) codigos.push(p); } else invalidos.push(p);
  }
  return { codigos, invalidos };
}

// Nombre corto para el panel y el fichero: el de CONFIG si la entidad es conocida; si no, el primer trozo
// del texto de la página limpio («Otra Entidad, S.L.» -> OTRA-ENTIDAD).
function etiquetaEntidad(config, textoPagina) {
  const conocida = entidadPorNombrePagina(config, textoPagina);
  if (conocida) return conocida;
  let base = normalizar(String(textoPagina || '').split(',')[0]).toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (base.length > 40) {   // se corta por palabras, sin dejar una a medias
    base = base.slice(0, 41);
    base = base.includes('-') ? base.slice(0, base.lastIndexOf('-')) : base.slice(0, 40);
  }
  return base || 'ENTIDAD';
}

// Convocatorias que se proponen al abrir la ventana: las de la entidad si está en CONFIG y, si no, la lista general.
function convocatoriasPorDefecto(config, textoPagina) {
  const conocida = entidadPorNombrePagina(config, textoPagina);
  if (conocida) return config.entidades[conocida].convocatorias.slice();
  return (config.convocatoriasPorDefecto || []).slice();
}

// Enlace para pasar a la página siguiente de una tabla, o null si ya es la última. Las preinscripciones tienen botón
// «siguiente»; la LISTA DE CURSOS no (solo «primera», números de página y «última»): en ese caso, el número que
// va después del activo. `pie` y los enlaces solo necesitan querySelector/querySelectorAll/classList.
function enlaceSiguiente(pie, pag) {
  const sig = pie.querySelector(pag.siguiente);
  if (sig) return sig.classList.contains(pag.deshabilitado) ? null : sig;
  const paginas = [...pie.querySelectorAll(pag.paginas)];
  const i = paginas.findIndex((a) => a.classList.contains(pag.activa));
  return i >= 0 && i + 1 < paginas.length ? paginas[i + 1] : null;
}

// Id con el que se abre la página de preinscripciones de un curso. En la lista, la fila lleva ese id a secas
// (cursos T…) o con un sufijo «id-otro» (cursos FO-…); la página solo entiende la parte de antes del guion.
function idCurso(rk) {
  return String(rk == null ? '' : rk).split('-')[0].trim();
}

// Códigos que se proponen en la ventana: lo que esa entidad usó la última vez; si no hay nada, la lista general.
function codigosIniciales(config, etiqueta, guardados) {
  const mios = guardados && Array.isArray(guardados[etiqueta]) ? guardados[etiqueta] : [];
  return mios.length > 0 ? mios.slice() : (config.convocatoriasPorDefecto || []).slice();
}

// Devuelve un objeto nuevo con los códigos de esa entidad (el anterior no se toca).
function recordarCodigos(guardados, etiqueta, codigos) {
  return { ...(guardados || {}), [etiqueta]: codigos.slice() };
}

if (typeof module !== 'undefined') {
  module.exports = {
    validarConfig, convocatoriasDe, entidadPorNombrePagina, nombreFichero, construirCsv, claveVista,
    parsePaginacion, quitarTitulo, nombreCompleto, parseCodigos, etiquetaEntidad, convocatoriasPorDefecto,
    codigosIniciales, recordarCodigos, enlaceSiguiente, idCurso,
  };
}

// ---- motor.js ----
// Motor del recorrido. No toca el navegador: habla con la página a través de `pagina`
// y con las descargas a través de `descargar`. Así el orden de seguridad se prueba en Node.
//
// Orden por persona: abrir ficha → comprobar NIF → descargar CSV → (solo si se descargó) marcar → comprobar ✓.
// Ante cualquier anomalía se para y se devuelve el motivo en `paradaPor`; nunca lanza.

const _N = (typeof module !== 'undefined')
  ? require('./nucleo.js')
  : { entidadPorNombrePagina, convocatoriasDe, nombreFichero, construirCsv, claveVista };

const RONDAS_MAX = 5; // veces que se vuelve a mirar un curso por si han entrado preinscripciones nuevas

// descargar(nombre, texto, fila): guarda la copia de la persona y devuelve true si quedó guardada. Solo con eso se marca.
// convocatorias / entidad: si vienen (ventana previa), se usan tal cual; si no, se detecta la entidad como antes.
// alProgreso(estado): aviso opcional para la barra de progreso; si falla, no afecta a la pasada.
async function ejecutarPasada({ config, pagina, descargar, deboParar, convocatorias, entidad, alProgreso }) {
  const resumen = {
    entidad: null, cursos: 0, cursosTotal: 0, vistas: 0, marcadas: 0, ficheros: [], csvConjunto: '', paradaPor: null,
  };
  const avisar = (fase, extra) => {
    if (!alProgreso) return;
    try { alProgreso({ fase, cursos: resumen.cursos, cursosTotal: resumen.cursosTotal, personas: resumen.vistas, marcadas: resumen.marcadas, ...extra }); } catch (e) { /* la barra no puede romper la pasada */ }
  };
  const filas = [];
  const vistas = new Set();

  const cerrar = (motivo) => {
    resumen.paradaPor = motivo;
    resumen.csvConjunto = _N.construirCsv(filas, config.columnas, config.separador);
    return resumen;
  };

  try {
    if (!(await pagina.sesionValida())) return cerrar('Sesión no válida: entra en E-SOIB con tu certificado.');

    let lista;
    if (convocatorias && convocatorias.length > 0) {
      lista = convocatorias;
      resumen.entidad = entidad || '—';
    } else {
      const detectada = _N.entidadPorNombrePagina(config, await pagina.textoEntidad());
      if (!detectada) return cerrar('Entidad no reconocida: no coincide con ninguna de CONFIG.');
      resumen.entidad = detectada;
      lista = _N.convocatoriasDe(config, detectada);
    }

    // Primero se listan los cursos de todas las convocatorias (así se sabe el total para la barra)...
    const todos = [];
    for (let i = 0; i < lista.length; i += 1) {
      if (deboParar && deboParar()) return cerrar('Parada pedida por el usuario.');
      avisar('buscando', { convocatoria: lista[i], convocatoriasHechas: i, convocatoriasTotal: lista.length });
      for (const curso of await pagina.cursosDe(lista[i])) todos.push({ convocatoria: lista[i], curso });
    }
    resumen.cursosTotal = todos.length;

    // ...y después se revisa curso a curso.
    for (const { curso } of todos) {
      if (deboParar && deboParar()) return cerrar('Parada pedida por el usuario.');
      resumen.cursos += 1;
      avisar('revisando', { curso: curso.referencia });
      let ordenEnCurso = 0;

      // Cada solicitud se identifica por su id (rk) si la página lo da; solo por NIF, una persona con dos
      // solicitudes en el mismo curso perdería la segunda.
      const idDe = (p) => _N.claveVista(p.nif, curso.referencia) + (p.rk ? `|${p.rk}` : '');
      const pendientesNuevas = async () => (await pagina.pendientesDe(curso)).filter((p) => !vistas.has(idDe(p)));

      let cursoCompleto = false;
      for (let ronda = 0; ronda < RONDAS_MAX; ronda += 1) {
        const nuevas = await pendientesNuevas();
        if (nuevas.length === 0) { cursoCompleto = true; break; }

        for (const p of nuevas) {
          const nif = p.nif;
          const clave = idDe(p);
          if (vistas.has(clave)) continue;

          if (deboParar && deboParar()) return cerrar('Parada pedida por el usuario.');
          if (!(await pagina.sesionValida())) return cerrar('Sesión caducada a mitad de la pasada.');

          const ficha = await pagina.abrirFicha(curso, nif, p.rk);
          if (!ficha) return cerrar(`No se pudo abrir la ficha de una persona del curso ${curso.referencia}.`);
          if (_N.claveVista(ficha.nif, curso.referencia) !== _N.claveVista(nif, curso.referencia)) {
            return cerrar(`El NIF de la ficha no coincide con el de la fila (curso ${curso.referencia}).`);
          }

          ordenEnCurso += 1;
          const nombre = _N.nombreFichero(curso.referencia, ordenEnCurso);
          const fila = { ...ficha.datos, DNI: ficha.datos.DNI || nif, 'CURSO E-SOIB': curso.referencia };

          let descargada = false;
          try {
            descargada = await descargar(nombre, _N.construirCsv([fila], config.columnas, config.separador), fila);
          } catch (e) {
            descargada = false;
          }
          if (!descargada) return cerrar(`Falló la copia de seguridad (descarga) de ${nombre}: no se marca a nadie más.`);

          resumen.ficheros.push(nombre);
          filas.push(fila);
          vistas.add(clave);
          resumen.vistas += 1;
          avisar('revisando', { curso: curso.referencia });

          if (!config.modoEnsayo) {
            await pagina.marcar(ficha);
            if (!(await pagina.comprobarMarcada(curso, nif, ficha.rk))) {
              return cerrar(`Tras marcar, la fila sigue en ✗ (curso ${curso.referencia}, fichero ${nombre}).`);
            }
            resumen.marcadas += 1;
            avisar('revisando', { curso: curso.referencia });
          }

          if (config.limitePersonas && resumen.vistas >= config.limitePersonas) {
            return cerrar(`Límite de ${config.limitePersonas} persona(s) alcanzado (prueba): no se sigue.`);
          }
        }
      }

      // Si se agotaron las rondas sin ver un curso limpio, se mira una última vez: no se da por bueno un curso
      // en el que siguen entrando pendientes.
      if (!cursoCompleto && (await pendientesNuevas()).length > 0) {
        return cerrar(`Quedan pendientes sin tratar en el curso ${curso.referencia} (siguen entrando): se para para revisarlo.`);
      }
    }
    resumen.csvConjunto = _N.construirCsv(filas, config.columnas, config.separador);
    avisar('fin');
    return resumen;
  } catch (e) {
    return cerrar(`Error inesperado: ${e && e.message ? e.message : e}. Comprueba a mano la última persona por si quedó marcada sin terminar de comprobarse.`);
  }
}

if (typeof module !== 'undefined') module.exports = { ejecutarPasada };

// ---- pagina-esoib.js ----
// Adaptador de la página real de E-SOIB. Implementa la interfaz `pagina` que usa el motor.
// Trabaja con un iframe oculto del mismo origen, así la página donde se pulsa el botón no se recarga
// y el recorrido no se pierde. Todo lo que depende de la página (ids, columnas, textos) está en CONFIG.selectores.
//
// Regla general de este fichero: ante cualquier cosa que no cuadre con lo esperado (tabla distinta, filas que no
// suman el total, columnas cambiadas, ficha incompleta) se lanza un error. El motor lo convierte en una parada con aviso:
// es mejor parar que dar por buena una lectura incompleta.

const _P = (typeof module !== 'undefined')
  ? require('./nucleo.js')
  : { parsePaginacion, quitarTitulo, nombreCompleto, enlaceSiguiente, idCurso };

function crearPagina(config, ventana) {
  const S = config.selectores;
  const doc = ventana.document;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let marco = null;

  async function esperarHasta(cond, maxMs = 20000, paso = 250) {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = cond(); } catch (e) { v = null; }   // p. ej. SecurityError si E-SOIB redirige a Cl@ve
      if (v) return v;
      if (Date.now() - t0 > maxMs) throw new Error('Tiempo agotado esperando a la página de E-SOIB (¿sesión caducada?)');
      await dormir(paso);
    }
  }

  const q = (sel) => marco.contentDocument.querySelector(sel);
  const porId = (id) => marco.contentDocument.getElementById(id);

  async function cargar(url) {
    if (marco) marco.remove();
    marco = doc.createElement('iframe');
    marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;';
    doc.body.appendChild(marco);
    await new Promise((res, rej) => { marco.onload = res; marco.onerror = () => rej(new Error('No se pudo cargar ' + url)); marco.src = url; });
  }

  const filasDe = (cuerpo) => [...cuerpo.rows].filter((r) => r.dataset.rk);
  const primeraClave = (cuerpo) => (cuerpo.rows[0] && cuerpo.rows[0].dataset.rk) || '';

  // Pasa a la página siguiente de la tabla; devuelve false si ya era la última.
  async function siguientePagina(cuerpoSel, pieSel) {
    const pie = q(pieSel);
    const sig = pie && _P.enlaceSiguiente(pie, S.paginador);
    if (!sig) return false;
    const antes = primeraClave(q(cuerpoSel));
    sig.click();
    await esperarHasta(() => { const t = q(cuerpoSel); return t && primeraClave(t) !== antes; });
    await dormir(config.esperas.paginaMs);
    return true;
  }

  // Lee todas las páginas de una tabla aplicando `leerFilas(cuerpo)`. Devuelve lo leído y cuántas filas había en total,
  // para poder comprobar que coincide con lo que E-SOIB dice («Encontrados N resultados»).
  async function recorrerPaginas(cuerpoSel, pieSel, leerFilas) {
    const items = [];
    let totalFilas = 0;
    for (let guarda = 0; guarda < 500; guarda += 1) {
      const cuerpo = await esperarHasta(() => q(cuerpoSel));
      totalFilas += filasDe(cuerpo).length;
      items.push(...leerFilas(cuerpo));
      if (!(await siguientePagina(cuerpoSel, pieSel))) break;
    }
    return { items, totalFilas };
  }

  // Busca por todas las páginas la primera fila que cumpla `predicado`.
  async function buscarFila(predicado) {
    const P = S.preinscripciones;
    for (let guarda = 0; guarda < 500; guarda += 1) {
      const cuerpo = await esperarHasta(() => q(P.cuerpo));
      const fila = filasDe(cuerpo).find(predicado);
      if (fila) return fila;
      if (!(await siguientePagina(P.cuerpo, P.pie))) return null;
    }
    return null;
  }

  // Abre la página de preinscripciones de un curso y comprueba que es la de ese curso.
  async function cargarCurso(curso) {
    const P = S.preinscripciones;
    await cargar(P.urlConId + curso.id);
    // Si E-SOIB no abre la página de preinscripciones sino otra (p. ej. la de inicio), se dice claro en vez de esperar al tiempo agotado.
    let ruta = '';
    try { ruta = marco.contentWindow.location.pathname; } catch (e) { ruta = ''; }
    if (ruta && !ruta.includes('expedient_preinscripcions')) {
      throw new Error(`E-SOIB no abrió las preinscripciones del curso ${curso.referencia} (llevó a ${ruta}).`);
    }
    await esperarHasta(() => q(P.cuerpo));
    await esperarHasta(() => { const pie = q(P.pie); return pie && _P.parsePaginacion(pie.innerText); });
    const titulo = marco.contentDocument.title || '';
    if (!titulo.includes(curso.referencia)) {
      throw new Error(`La página abierta no es la del curso ${curso.referencia} (título: «${titulo.slice(0, 60)}»).`);
    }
  }

  const esNo = (r) => r.cells[S.preinscripciones.columnaContactado].querySelector(S.preinscripciones.iconoNo);
  const esSi = (r) => r.cells[S.preinscripciones.columnaContactado].querySelector(S.preinscripciones.iconoSi);
  const nifDe = (r) => r.cells[S.preinscripciones.columnaNif].innerText.trim().toUpperCase();

  return {
    async sesionValida() {
      return !!doc.querySelector(S.menuPresente);
    },

    async textoEntidad() {
      const e = doc.querySelector(S.entidadTexto);
      return e ? e.innerText : '';
    },

    // Códigos de convocatoria que existen en el desplegable de E-SOIB (para avisar de un código mal escrito).
    async convocatoriasDisponibles() {
      const L = S.lista;
      await cargar(L.url);
      const sel = await esperarHasta(() => porId(L.convocatoriaId));
      return [...sel.options].map((o) => o.value).filter(Boolean);
    },

    async cursosDe(convocatoria) {
      const L = S.lista;
      await cargar(L.url);
      const sel = await esperarHasta(() => porId(L.convocatoriaId));
      // Vaciar los filtros que E-SOIB recuerda de la sesión.
      for (const id of L.limpiarCampos) { const e = porId(L.prefijoId + id); if (e) e.value = ''; }
      for (const id of L.limpiarSelects) { const s = porId(L.prefijoId + id); if (s && s.options.length) s.value = s.options[0].value; }
      const opcion = [...sel.options].find((o) => o.value === String(convocatoria));
      if (!opcion) throw new Error(`La convocatoria ${convocatoria} no aparece en E-SOIB`);
      sel.value = opcion.value;
      sel.dispatchEvent(new marco.contentWindow.Event('change', { bubbles: true }));
      await dormir(500);

      // Al cargar, el buscador ya trae la tabla de la búsqueda anterior (E-SOIB la recuerda en la sesión). No se da por
      // buena hasta que llega la de ESTA búsqueda: se espera a que esa tabla se sustituya por otra distinta...
      const tablaVieja = q(L.cuerpo);
      porId(L.botonBuscaId).click();
      await esperarHasta(() => { const t = q(L.cuerpo); return t && t !== tablaVieja; });
      // ...a que no quede nada pendiente en PrimeFaces (si es visible desde aquí) y a que todas las filas sean de la convocatoria.
      await dormir(800);
      const PF = marco.contentWindow.PrimeFaces;
      await esperarHasta(() => !(PF && PF.ajax && PF.ajax.Queue) || PF.ajax.Queue.isEmpty());
      const info = await esperarHasta(() => {
        const pie = q(L.pie);
        const i = pie && _P.parsePaginacion(pie.innerText);
        if (!i) return null;
        if (i.total === 0) return i;
        const filas = filasDe(q(L.cuerpo));
        const todasDeEsta = filas.length > 0
          && filas.every((r) => r.cells[L.columnaConvocatoria].innerText.trim() === String(convocatoria));
        return todasDeEsta ? i : null;
      });
      if (info.total === 0) return [];
      const { items, totalFilas } = await recorrerPaginas(L.cuerpo, L.pie, (cuerpo) => filasDe(cuerpo)
        .map((r) => ({
          referencia: _P.quitarTitulo(r.cells[L.columnaReferencia].innerText, L.tituloReferencia),
          id: _P.idCurso(r.dataset.rk),
        })));
      if (totalFilas !== info.total) {
        throw new Error(`La lista de la convocatoria ${convocatoria} trae ${totalFilas} cursos y E-SOIB dice ${info.total}: se para para no dejar cursos sin revisar.`);
      }
      return items;
    },

    // Devuelve las solicitudes con ✗ de un curso: { nif, rk } (rk = id de la solicitud).
    async pendientesDe(curso) {
      const P = S.preinscripciones;
      await cargarCurso(curso);
      const esperado = _P.parsePaginacion(q(P.pie).innerText).total;
      const { items, totalFilas } = await recorrerPaginas(P.cuerpo, P.pie, (cuerpo) => {
        const filas = filasDe(cuerpo);
        // Si una fila no es ni ✗ ni ✓, E-SOIB ha cambiado la tabla (columnas o iconos) y no se puede fiar de lo leído.
        if (filas.some((r) => !esNo(r) && !esSi(r))) {
          throw new Error(`En el curso ${curso.referencia} hay filas sin ✗ ni ✓: E-SOIB parece haber cambiado la tabla.`);
        }
        return filas.filter(esNo).map((r) => ({ nif: r.cells[P.columnaNif].innerText.trim(), rk: r.dataset.rk }));
      });
      if (totalFilas !== esperado) {
        throw new Error(`En el curso ${curso.referencia} se leyeron ${totalFilas} preinscripciones y E-SOIB dice ${esperado}: se para para no dejar a nadie sin revisar.`);
      }
      return items;
    },

    async abrirFicha(curso, nif, rk) {
      const P = S.preinscripciones;
      const F = S.ficha;
      await cargarCurso(curso);
      // Por id de solicitud si se conoce (dos solicitudes del mismo NIF no se confunden); si no, por NIF y con ✗.
      const objetivo = String(nif).trim().toUpperCase();
      const fila = await buscarFila(rk ? (r) => r.dataset.rk === rk && esNo(r) : (r) => nifDe(r) === objetivo && esNo(r));
      if (!fila) return null;
      fila.cells[P.celdaParaAbrir].click();
      const campo = (n) => porId(F.prefijoId + n);
      const valor = (n) => ((campo(n) || {}).value || '').trim();
      await esperarHasta(() => valor(F.campos.DNI) && valor(F.campos.FECHA));
      await dormir(config.esperas.fichaMs);
      const datos = {};
      for (const [columna, id] of Object.entries(F.campos)) datos[columna] = valor(id);
      datos.NOMBRE = _P.nombreCompleto(F.nombre.apellidos.map((a) => valor(a)), valor(F.nombre.nombre));
      const disc = campo(F.discapacidadCasilla);
      datos.DISCAPACIDAD = disc && disc.checked ? 'Sí' : 'No';
      // Una copia con la ficha a medias no vale: nombre, apellido, fecha y DNI son imprescindibles.
      const faltan = [];
      if (!datos.DNI) faltan.push('DNI');
      if (!datos.FECHA) faltan.push('FECHA');
      if (!valor(F.nombre.nombre)) faltan.push('NOMBRE');
      if (!valor(F.nombre.apellidos[0])) faltan.push('APELLIDO');
      if (faltan.length) throw new Error(`La ficha no trae ${faltan.join(', ')} (curso ${curso.referencia}): se para para no guardar una copia incompleta.`);
      return { nif: datos.DNI, datos, rk: fila.dataset.rk, referenciaCurso: curso.referencia };
    },

    async marcar() {
      const F = S.ficha;
      const casilla = porId(F.prefijoId + F.contactadoCasilla);
      const boton = q(F.contactadoBoton);
      if (!casilla || !boton) throw new Error('No se encuentra el botón «Contactado» en la ficha');
      if (casilla.checked) throw new Error('La ficha ya estaba marcada como contactada');
      boton.click();
      await dormir(config.esperas.marcarMs);
    },

    // Recarga y mira la MISMA solicitud (por id; por NIF solo si no se conoce el id).
    async comprobarMarcada(curso, nif, rk) {
      const objetivo = String(nif).trim().toUpperCase();
      for (let intento = 0; intento < 2; intento += 1) {
        await cargarCurso(curso);                 // recarga: lo que se ve es lo guardado
        const fila = await buscarFila(rk ? (r) => r.dataset.rk === rk : (r) => nifDe(r) === objetivo);
        if (fila && esSi(fila)) return true;
        if (intento === 0) await dormir(config.esperas.marcarMs);   // a veces E-SOIB tarda en guardar
      }
      return false;
    },

    // Para limpiar al terminar.
    cerrar() { if (marco) { marco.remove(); marco = null; } },
  };
}

if (typeof module !== 'undefined') module.exports = { crearPagina };

// ---- arranque.js ----
// Arranque: panel, ventana previa, barra de progreso, copia de seguridad y un único archivo al final.
// Solo se usa dentro de Tampermonkey.
//
// Qué ve la persona:
//  1. Una burbuja flotante (se puede mover) abajo a la derecha. Al pulsarla se abre un panel con «Descargar preinscripciones».
//     Con el panel cerrado, la burbuja enseña el avance (37%), ✓ si terminó bien y ! si se paró o falló.
//  2. Al pulsar ese botón, una ventana con la entidad y los códigos de convocatoria que se van a mirar (editables).
//     Se recuerdan, por entidad, los códigos de la última vez.
//  3. Una barra de progreso mientras trabaja.
//  4. Al terminar, UN archivo CSV con las personas que estaban con ✗ y ahora están con ✓.
//
// Copia de seguridad: antes de marcar a cada persona se guarda en el almacén privado de Tampermonkey
// (GM_setValue) y se comprueba leyéndola de nuevo. Si Tampermonkey no ofrece ese almacén, no se marca nada.
// «Volver a bajar la última pasada» recupera el archivo aunque se pierda o se cierre la pestaña.

(function () {
  if (window.top !== window) return;

  const cfg = CONFIG;
  const CLAVE_COPIA = 'esoib_ultima_pasada';
  const CLAVE_CODIGOS = 'esoib_codigos';
  const CLAVE_BLOQUEO = 'esoib_en_curso';
  const BLOQUEO_MAX_MS = 10 * 60 * 1000;   // un bloqueo más viejo se da por abandonado (pestaña cerrada a mitad)

  // ---------- almacén privado de Tampermonkey ----------
  const gm = {
    disponible: typeof GM_setValue === 'function' && typeof GM_getValue === 'function',
    leer(clave) {
      try { const t = GM_getValue(clave, ''); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    },
    escribir(clave, valor) { GM_setValue(clave, JSON.stringify(valor)); },
    borrar(clave) { if (typeof GM_deleteValue === 'function') GM_deleteValue(clave); },
  };

  const almacen = {
    leer() { return gm.leer(CLAVE_COPIA); },
    // Guarda y vuelve a leer: solo devuelve true si lo leído coincide (cantidad y última persona).
    guardar(reg) {
      if (!gm.disponible) return false;
      gm.escribir(CLAVE_COPIA, reg);
      const v = this.leer();
      if (!v || !Array.isArray(v.filas) || v.filas.length !== reg.filas.length) return false;
      if (reg.filas.length === 0) return true;
      return v.filas[v.filas.length - 1].DNI === reg.filas[reg.filas.length - 1].DNI;
    },
    borrar() { gm.borrar(CLAVE_COPIA); },
  };

  // Impide dos pasadas a la vez entre pestañas.
  const bloqueo = {
    activo() { const v = gm.leer(CLAVE_BLOQUEO); return !!v && Date.now() - v.t < BLOQUEO_MAX_MS; },
    poner() { if (gm.disponible) gm.escribir(CLAVE_BLOQUEO, { t: Date.now() }); },
    quitar() { gm.borrar(CLAVE_BLOQUEO); },
  };

  // ---------- utilidades de pantalla ----------
  const p2 = (x) => String(x).padStart(2, '0');
  const sello = (d) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const fechaLegible = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  function el(tag, css, texto) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // Descarga normal de Chrome (carpeta Descargas). El navegador no avisa de si se guardó.
  function bajarArchivo(nombre, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const nombreArchivo = (reg) => `CONJUNTO_${reg.entidad}_${reg.sello}${reg.parado ? '_PARADO' : ''}.csv`;
  const bajarRegistro = (reg) => bajarArchivo(nombreArchivo(reg), construirCsv(reg.filas, cfg.columnas, cfg.separador));

  // ---------- estilos propios (con prefijo esoib- para no chocar con los de E-SOIB) ----------
  const ESTILOS = `
  .esoib-x, .esoib-x * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .esoib-burbuja { position: fixed; z-index: 99999; width: 54px; height: 54px; padding: 0; border-radius: 50%; border: 3px solid #fff;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 65%, #fff), var(--c)); color: #fff; font-weight: 700; line-height: 1;
    letter-spacing: .5px; cursor: grab; box-shadow: 0 4px 14px rgba(50,10,70,.45); transition: transform .15s, box-shadow .15s;
    touch-action: none; user-select: none; -webkit-user-select: none; }
  .esoib-burbuja:hover { transform: scale(1.08); }
  .esoib-burbuja.esoib-arrastra { cursor: grabbing; transform: scale(1.14); box-shadow: 0 10px 26px rgba(50,10,70,.5); transition: none; }
  .esoib-burbuja.esoib-trabaja { animation: esoib-pulso 1.6s ease-out infinite; }
  @keyframes esoib-pulso { 0% { box-shadow: 0 4px 14px rgba(50,10,70,.45), 0 0 0 0 rgba(122,46,142,.55); }
    100% { box-shadow: 0 4px 14px rgba(50,10,70,.45), 0 0 0 16px rgba(122,46,142,0); } }
  @keyframes esoib-sube { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  @keyframes esoib-fade { from { opacity: 0; } to { opacity: 1; } }
  .esoib-panel { position: fixed; z-index: 99999; width: 330px; max-width: calc(100vw - 16px); background: #fff; border-radius: 16px;
    overflow: hidden; color: #2b2233; font-size: 13px; line-height: 1.45; box-shadow: 0 12px 34px rgba(40,0,60,.38); animation: esoib-sube .18s ease-out; }
  .esoib-cab { display: flex; align-items: center; gap: 10px; padding: 12px 14px; color: #fff; background: linear-gradient(135deg, #8a35a0, #4f1a62); }
  .esoib-cab-t { flex: 1; font-weight: 700; font-size: 15px; }
  .esoib-cab-s { font-weight: 400; font-size: 11.5px; opacity: .85; }
  .esoib-icono { width: 36px; height: 36px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-size: 19px; }
  .esoib-cerrar { border: none; background: rgba(255,255,255,.18); color: #fff; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 13px; padding: 0; line-height: 1; }
  .esoib-cerrar:hover { background: rgba(255,255,255,.34); }
  .esoib-cuerpo { padding: 14px; }
  .esoib-principal { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 13px 14px; border: none; border-radius: 12px;
    color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; background: linear-gradient(135deg, #9b3fb3, #5b1f6e);
    box-shadow: 0 4px 12px rgba(91,31,110,.35); transition: transform .12s, box-shadow .12s, filter .12s; }
  .esoib-principal:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 7px 16px rgba(91,31,110,.42); }
  .esoib-principal:active:not(:disabled) { transform: none; }
  .esoib-principal:disabled { filter: grayscale(.8) opacity(.6); cursor: default; }
  .esoib-nota { margin: 8px 2px 0; font-size: 12px; color: #6b5d73; text-align: center; }
  .esoib-estado { margin: 12px 0 4px; white-space: pre-wrap; background: #f7f1fa; border-radius: 10px; padding: 9px 11px; font-size: 12.5px; }
  .esoib-estado:empty { display: none; }
  .esoib-barra { width: 100%; height: 12px; margin-top: 8px; accent-color: #8a35a0; }
  .esoib-fila { display: flex; gap: 8px; flex-wrap: wrap; }
  .esoib-sec { border: 1.5px solid #c9a6d6; background: #fff; color: #6a2a80; border-radius: 9px; padding: 6px 11px; font-size: 12.5px; font-weight: 600; cursor: pointer; margin-top: 8px; }
  .esoib-sec:hover:not(:disabled) { background: #f7f1fa; }
  .esoib-sec:disabled { opacity: .5; cursor: default; }
  .esoib-copia { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #d9c6e0; font-size: 12px; color: #4a3d52; }
  .esoib-fondo { position: fixed; inset: 0; z-index: 100000; background: rgba(30,10,45,.5); backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center; animation: esoib-fade .15s ease-out; }
  .esoib-caja { width: 450px; max-width: 94vw; max-height: 94vh; overflow: auto; background: #fff; border-radius: 18px; color: #2b2233;
    font-size: 14px; line-height: 1.45; box-shadow: 0 20px 50px rgba(30,0,50,.5); animation: esoib-sube .2s ease-out; }
  .esoib-caja .esoib-cab { padding: 16px 20px; }
  .esoib-caja .esoib-icono { width: 42px; height: 42px; font-size: 22px; }
  .esoib-caja-cuerpo { padding: 16px 20px 20px; }
  .esoib-etq { display: block; font-weight: 700; margin: 12px 0 4px; }
  .esoib-campo { width: 100%; padding: 9px 11px; font-size: 15px; letter-spacing: .3px; border: 1.5px solid #d9c6e0; border-radius: 10px; outline: none; color: #2b2233; background: #fff; }
  .esoib-campo:focus { border-color: #8a35a0; box-shadow: 0 0 0 3px rgba(138,53,160,.18); }
  .esoib-ayuda { font-size: 12px; color: #6b5d73; margin: 5px 1px 0; }
  .esoib-entidad { padding: 9px 12px; background: #f7f1fa; border-radius: 10px; }
  .esoib-ensayo { display: flex; gap: 8px; align-items: center; margin: 12px 0 0; cursor: pointer; }
  .esoib-aviso { margin: 14px 0 4px; padding: 10px 12px; background: #fbf6e9; border-left: 4px solid #e0a82e; border-radius: 8px; font-size: 13px; }
  .esoib-error { color: #b00020; min-height: 18px; margin: 6px 0 0; white-space: pre-wrap; font-size: 13px; }
  .esoib-pie { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
  .esoib-pie .esoib-sec { margin-top: 0; padding: 10px 18px; font-size: 14px; border-radius: 11px; }
  .esoib-pie .esoib-principal { width: auto; padding: 10px 24px; font-size: 14px; }
  `;
  const hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.appendChild(hoja);

  function elc(tag, clase, texto) { const e = document.createElement(tag); e.className = clase; if (texto !== undefined) e.textContent = texto; return e; }

  // ---------- burbuja y panel ----------
  const COLOR = '#7a2e8e';
  const CLAVE_POS = 'esoib_burbuja';
  const TAM = 54;
  const burbuja = elc('button', 'esoib-x esoib-burbuja', 'SOIB');
  burbuja.title = 'Preinscripciones E-SOIB (arrástrala si estorba)';
  burbuja.style.setProperty('--c', COLOR);

  const panel = elc('div', 'esoib-x esoib-panel');
  panel.style.display = 'none';
  const tituloBase = cfg.modoEnsayo ? 'Preinscripciones · ENSAYO (no marca)' : 'Preinscripciones';
  const titulo = elc('div', '', tituloBase);
  const cabT = elc('div', 'esoib-cab-t');
  cabT.append(titulo, elc('div', 'esoib-cab-s', 'E-SOIB'));
  const cerrarPanel = elc('button', 'esoib-cerrar', '✕');
  cerrarPanel.title = 'Cerrar (si está trabajando, sigue)';
  const cab = elc('div', 'esoib-cab');
  cab.append(elc('div', 'esoib-icono', '📋'), cabT, cerrarPanel);

  const boton = elc('button', 'esoib-principal');
  boton.append(elc('span', '', '⬇'), elc('span', '', 'Descargar preinscripciones'));
  const nota = elc('div', 'esoib-nota', 'Recoge las que tienen ✗ y las marca como contactadas.');
  const estado = elc('div', 'esoib-estado');
  const barra = elc('progress', 'esoib-barra');
  barra.max = 100; barra.value = 0; barra.style.display = 'none';
  const parar = elc('button', 'esoib-sec', 'Parar'); parar.style.display = 'none';
  const bajar = elc('button', 'esoib-sec', 'Volver a descargar el archivo'); bajar.style.display = 'none';
  const filaBotones = elc('div', 'esoib-fila');
  filaBotones.append(parar, bajar);
  const copiaZona = elc('div', 'esoib-copia'); copiaZona.style.display = 'none';
  const cuerpo = elc('div', 'esoib-cuerpo');
  cuerpo.append(boton, nota, estado, barra, filaBotones, copiaZona);
  panel.append(cab, cuerpo);
  document.body.append(panel, burbuja);
  if (!gm.disponible) estado.textContent = 'Tampermonkey no ofrece el almacén para la copia de seguridad: no se puede marcar.';

  // Dónde está la burbuja (se recuerda) y dónde se abre el panel (hacia el lado donde hay sitio).
  // Hasta que se mueva, la burbuja va pegada abajo a la derecha (CSS); al moverla pasa a coordenadas fijas.
  burbuja.style.right = '16px'; burbuja.style.bottom = '16px';
  let movida = false;
  function posBurbuja() { const r = burbuja.getBoundingClientRect(); return { x: r.left, y: r.top }; }
  function fijarBurbuja(x, y) {
    const bx = Math.max(4, Math.min(x, window.innerWidth - TAM - 4));
    const by = Math.max(4, Math.min(y, window.innerHeight - TAM - 4));
    burbuja.style.left = bx + 'px'; burbuja.style.top = by + 'px';
    burbuja.style.right = 'auto'; burbuja.style.bottom = 'auto';
    movida = true;
    if (panel.style.display !== 'none') colocarPanel();
  }
  function colocarPanel() {
    const { x, y } = posBurbuja();
    const abajo = y + TAM / 2 > window.innerHeight / 2;     // burbuja en la mitad de abajo: el panel sale por encima
    const derecha = x + TAM / 2 > window.innerWidth / 2;    // burbuja en la mitad derecha: el panel se alinea a su derecha
    panel.style.top = abajo ? 'auto' : (y + TAM + 10) + 'px';
    panel.style.bottom = abajo ? (window.innerHeight - y + 10) + 'px' : 'auto';
    panel.style.left = derecha ? 'auto' : x + 'px';
    panel.style.right = derecha ? (window.innerWidth - x - TAM) + 'px' : 'auto';
  }
  const abrirPanel = (abrir) => { panel.style.display = abrir ? '' : 'none'; if (abrir) colocarPanel(); };
  {
    const guardada = gm.leer(CLAVE_POS);
    if (guardada && Number.isFinite(guardada.x) && Number.isFinite(guardada.y)) fijarBurbuja(guardada.x, guardada.y);
    window.addEventListener('resize', () => { if (movida) { const p = posBurbuja(); fijarBurbuja(p.x, p.y); } });
  }

  // Arrastrar: si el ratón se mueve más de unos píxeles es un arrastre; si no, es un clic y se abre/cierra el panel.
  let arrastre = null;
  burbuja.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const p = posBurbuja();
    arrastre = { px: ev.clientX, py: ev.clientY, x0: p.x, y0: p.y, movido: false };
    try { burbuja.setPointerCapture(ev.pointerId); } catch (e) { /* no pasa nada */ }
  });
  burbuja.addEventListener('pointermove', (ev) => {
    if (!arrastre) return;
    const dx = ev.clientX - arrastre.px, dy = ev.clientY - arrastre.py;
    if (!arrastre.movido && Math.hypot(dx, dy) < 5) return;
    arrastre.movido = true;
    burbuja.classList.add('esoib-arrastra');
    fijarBurbuja(arrastre.x0 + dx, arrastre.y0 + dy);
  });
  const soltar = () => {
    if (!arrastre) return;
    const movido = arrastre.movido;
    arrastre = null;
    burbuja.classList.remove('esoib-arrastra');
    if (movido) { try { if (gm.disponible) gm.escribir(CLAVE_POS, posBurbuja()); } catch (e) { /* solo comodidad */ } }
    else abrirPanel(panel.style.display === 'none');
  };
  burbuja.addEventListener('pointerup', soltar);
  burbuja.addEventListener('pointercancel', () => { arrastre = null; burbuja.classList.remove('esoib-arrastra'); });
  burbuja.addEventListener('click', (ev) => { if (ev.detail === 0) abrirPanel(panel.style.display === 'none'); });   // teclado (Intro/Espacio)
  cerrarPanel.onclick = () => abrirPanel(false);

  // La burbuja avisa de lo que pasa aunque el panel esté cerrado: «37%» trabajando, ✓ terminó bien, ! se paró o falló.
  function pintarBurbuja(texto, color, trabajando) {
    burbuja.textContent = texto;
    burbuja.style.setProperty('--c', color);
    burbuja.style.fontSize = texto.length > 3 ? '13px' : '17px';
    burbuja.classList.toggle('esoib-trabaja', !!trabajando);
  }
  pintarBurbuja('SOIB', COLOR, false);
  burbuja.style.fontSize = '14px';

  function pintarCopia() {
    const reg = almacen.leer();
    copiaZona.textContent = '';
    if (!reg || !reg.filas || reg.filas.length === 0) { copiaZona.style.display = 'none'; return; }
    copiaZona.style.display = '';
    copiaZona.append(elc('div', '', `Última pasada guardada: ${reg.entidad} · ${reg.fecha} · ${reg.filas.length} persona(s)${reg.parado ? ' · PARADA' : ''}`));
    const fila = elc('div', 'esoib-fila');
    const b1 = elc('button', 'esoib-sec', 'Volver a bajarla');
    b1.onclick = () => { bajarRegistro(reg); };
    const b2 = elc('button', 'esoib-sec', 'Borrar la copia guardada');
    b2.onclick = () => {
      if (window.confirm('Se borra del Tampermonkey la copia de la última pasada (' + reg.filas.length + ' personas). ¿Seguro?')) { almacen.borrar(); pintarCopia(); }
    };
    fila.append(b1, b2);
    copiaZona.append(fila);
  }
  pintarCopia();

  // ---------- ventana previa ----------
  function abrirVentana() {
    return new Promise((resolve) => {
      const fondo = elc('div', 'esoib-x esoib-fondo');
      const caja = elc('div', 'esoib-caja');
      const cabV = elc('div', 'esoib-cab');
      const cabVT = elc('div', 'esoib-cab-t', 'Descargar preinscripciones');
      cabVT.append(elc('div', 'esoib-cab-s', 'Elige qué convocatorias mirar'));
      cabV.append(elc('div', 'esoib-icono', '⬇'), cabVT);
      const cuerpoV = elc('div', 'esoib-caja-cuerpo');
      const lEnt = elc('div', 'esoib-entidad', 'Entidad: …');
      const lCod = elc('label', 'esoib-etq', 'Códigos de convocatoria (separados por comas)');
      const inCod = elc('input', 'esoib-campo');
      inCod.type = 'text';
      const ayuda = elc('div', 'esoib-ayuda', 'Puedes quitar los que no quieras o añadir otros. Se recuerdan para la próxima vez con esta entidad.');
      const lEns = elc('label', 'esoib-ensayo');
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!cfg.modoEnsayo;
      lEns.append(chk, elc('span', '', 'Solo ensayo: no marca nada en E-SOIB'));
      const aviso = elc('div', 'esoib-aviso',
        'Se descargará UN archivo con las personas que estaban con ✗ y se marcarán como contactadas (✗ pasa a ✓) en E-SOIB. Antes de marcar a cada una se guarda una copia de seguridad.');
      const msg = elc('div', 'esoib-error');
      const botones = elc('div', 'esoib-pie');
      const bEmpezar = elc('button', 'esoib-principal', 'Empezar');
      const bCancelar = elc('button', 'esoib-sec', 'Cancelar');
      botones.append(bCancelar, bEmpezar);

      const previa = almacen.leer();
      cuerpoV.append(lEnt, lCod, inCod, ayuda, lEns, aviso);
      if (previa && previa.filas && previa.filas.length) {
        cuerpoV.append(elc('div', 'esoib-ayuda',
          `Hay una copia guardada de la pasada anterior (${previa.entidad}, ${previa.filas.length} persona(s)). Al empezar se sustituye; si la quieres, bájala antes con «Volver a bajarla» del panel.`));
      }
      cuerpoV.append(msg, botones);
      caja.append(cabV, cuerpoV);
      fondo.appendChild(caja);
      document.body.appendChild(fondo);
      setTimeout(() => inCod.focus(), 0);   // el foco en el campo, no en un botón: un Enter suelto no empieza nada

      const alTeclear = (ev) => { if (ev.key === 'Escape' && !bCancelar.disabled) cerrar(null); };
      document.addEventListener('keydown', alTeclear);
      const cerrar = (valor) => { document.removeEventListener('keydown', alTeclear); fondo.remove(); resolve(valor); };
      bCancelar.onclick = () => cerrar(null);

      let textoEntidad = '';
      let etiqueta = 'ENTIDAD';
      (async () => {
        if (!gm.disponible) { msg.textContent = 'Tampermonkey no ofrece el almacén para la copia de seguridad: no se puede empezar.'; bEmpezar.disabled = true; return; }
        const pagina = crearPagina(cfg, window);
        if (!(await pagina.sesionValida())) { msg.textContent = 'No hay sesión de E-SOIB abierta: entra con tu certificado y vuelve a pulsar.'; bEmpezar.disabled = true; return; }
        textoEntidad = await pagina.textoEntidad();
        etiqueta = etiquetaEntidad(cfg, textoEntidad);
        lEnt.textContent = '';
        lEnt.append('Entidad: ', elc('b', '', etiqueta), el('span', 'color:#6b5d73;font-size:12px', '  ' + textoEntidad.replace(/\s+/g, ' ').trim().slice(0, 70)));
        inCod.value = codigosIniciales(cfg, etiqueta, gm.leer(CLAVE_CODIGOS)).join(', ');
      })();

      bEmpezar.onclick = async () => {
        msg.textContent = '';
        if (bloqueo.activo()) { msg.textContent = 'Ya hay una pasada en curso (en esta u otra pestaña de E-SOIB). Espera a que termine.'; return; }
        const { codigos, invalidos } = parseCodigos(inCod.value);
        if (invalidos.length) { msg.textContent = 'No son códigos válidos (solo cifras): ' + invalidos.join(', '); return; }
        if (codigos.length === 0) { msg.textContent = 'Pon al menos un código de convocatoria.'; return; }
        bEmpezar.disabled = true; bCancelar.disabled = true; msg.style.color = '#6b5d73'; msg.textContent = 'Comprobando los códigos en E-SOIB…';
        const pagina = crearPagina(cfg, window);
        let disponibles = [];
        try { disponibles = await pagina.convocatoriasDisponibles(); } catch (e) { disponibles = null; } finally { pagina.cerrar(); }
        msg.style.color = '#b00020';
        if (disponibles === null) { msg.textContent = 'No se pudo comprobar la lista de convocatorias de E-SOIB. Inténtalo de nuevo.'; bEmpezar.disabled = false; bCancelar.disabled = false; return; }
        const noExisten = codigos.filter((c) => !disponibles.includes(c));
        if (noExisten.length) { msg.textContent = 'Estos códigos no existen en E-SOIB: ' + noExisten.join(', '); bEmpezar.disabled = false; bCancelar.disabled = false; return; }
        gm.escribir(CLAVE_CODIGOS, recordarCodigos(gm.leer(CLAVE_CODIGOS), etiqueta, codigos));
        cerrar({ convocatorias: codigos, soloEnsayo: chk.checked, entidad: etiqueta });
      };
    });
  }

  // ---------- recorrido ----------
  let pararPedido = false;
  parar.onclick = () => { pararPedido = true; estado.textContent += '\nParando al terminar la persona actual…'; };
  let ultimoRegistro = null;
  bajar.onclick = () => { if (ultimoRegistro) bajarRegistro(ultimoRegistro); };
  let enCurso = false;   // se pone antes de cualquier espera: un doble clic no puede abrir dos pasadas

  boton.onclick = async () => {
    if (enCurso) return;
    enCurso = true; boton.disabled = true;
    let bloqueado = false;
    let pagina = null;
    try {
      const eleccion = await abrirVentana();
      if (!eleccion) return;

      const ahora = new Date();
      const registro = { entidad: eleccion.entidad, sello: sello(ahora), fecha: fechaLegible(ahora), convocatorias: eleccion.convocatorias, filas: [], parado: false };
      ultimoRegistro = null;
      if (!almacen.guardar(registro)) {   // sustituye la copia anterior; si no se puede guardar, no se empieza
        estado.textContent = 'No se pudo guardar la copia de seguridad en Tampermonkey: no se ha hecho nada.';
        return;
      }
      bloqueo.poner(); bloqueado = true;
      const cfgPasada = { ...cfg, modoEnsayo: eleccion.soloEnsayo };

      bajar.style.display = 'none'; parar.style.display = ''; pararPedido = false;
      barra.style.display = ''; barra.value = 0;
      titulo.textContent = eleccion.soloEnsayo ? 'Preinscripciones · ENSAYO (no marca)' : 'Preinscripciones · MARCANDO';
      estado.textContent = `Entidad ${eleccion.entidad} · convocatorias ${eleccion.convocatorias.join(', ')}\nBuscando cursos… no cierres esta pestaña.`;

      pintarBurbuja('0%', COLOR, true);
      const alProgreso = (e) => {
        bloqueo.poner();   // sigue vivo mientras trabaja
        if (e.fase === 'buscando') {
          barra.value = Math.round((e.convocatoriasHechas / e.convocatoriasTotal) * 10);
          estado.textContent = `Buscando cursos… convocatoria ${e.convocatoria} (${e.convocatoriasHechas + 1} de ${e.convocatoriasTotal})`;
        } else if (e.fase === 'revisando') {
          barra.value = 10 + Math.round(((e.cursos - 1) / Math.max(e.cursosTotal, 1)) * 90);
          estado.textContent = `Curso ${e.cursos} de ${e.cursosTotal} (${e.curso})\n${e.personas} persona(s) con ✗ · ${e.marcadas} marcada(s)`;
        } else if (e.fase === 'fin') { barra.value = 100; }
        try { pintarBurbuja(`${Math.round(barra.value)}%`, COLOR, true); } catch (x) { /* solo adorno */ }
      };

      // Copia de seguridad de cada persona: se guarda y se comprueba ANTES de que el motor la marque.
      const guardarCopia = async (nombre, texto, fila) => {
        registro.filas.push(fila);
        if (almacen.guardar(registro)) return true;
        registro.filas.pop();
        return false;
      };

      pagina = crearPagina(cfgPasada, window);
      const r = await ejecutarPasada({
        config: cfgPasada, pagina, descargar: guardarCopia, deboParar: () => pararPedido,
        convocatorias: eleccion.convocatorias, entidad: eleccion.entidad, alProgreso,
      });

      registro.parado = !!r.paradaPor;
      almacen.guardar(registro);
      ultimoRegistro = registro;
      pintarCopia();
      estado.textContent = [
        `Entidad: ${eleccion.entidad}`,
        `Cursos revisados: ${r.cursos} de ${r.cursosTotal} · Personas: ${r.vistas} · Marcadas: ${r.marcadas}`,
        registro.filas.length > 0
          ? `Archivo: ${nombreArchivo(registro)} (carpeta Descargas). Si no aparece, pulsa «Volver a descargar el archivo».`
          : 'No había ninguna persona con ✗: no se baja ningún archivo.',
        r.paradaPor ? `PARADO: ${r.paradaPor}` : 'Terminado sin incidencias.',
        r.paradaPor && registro.filas.length > 0 ? 'El archivo incluye a quienes se guardaron antes de parar.' : '',
      ].filter(Boolean).join('\n');
      pintarBurbuja(r.paradaPor ? '!' : '✓', r.paradaPor ? '#b00020' : '#1e7e34', false);
      abrirPanel(true);   // al terminar, el resultado se enseña solo
      if (registro.filas.length > 0) {
        bajar.style.display = '';
        try { bajarRegistro(registro); } catch (e) { estado.textContent += '\nNo se pudo bajar solo: pulsa «Volver a descargar el archivo».'; }
      }
    } catch (e) {
      estado.textContent = `Error del script: ${e && e.message ? e.message : e}\nSi ya se había empezado, mira «Última pasada guardada» y comprueba a mano la última persona.`;
      pintarCopia();
      pintarBurbuja('!', '#b00020', false);
      abrirPanel(true);
    } finally {
      if (pagina) pagina.cerrar();
      if (bloqueado) bloqueo.quitar();
      titulo.textContent = tituloBase;
      parar.style.display = 'none';
      enCurso = false;
      boton.disabled = false;
    }
  };
})();

})();
