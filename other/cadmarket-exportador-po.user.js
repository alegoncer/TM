// ==UserScript==
// @name         Cardmarket - Extractor Perfect Order desde Wants
// @namespace    https://github.com/alegoncer/TM
// @version      1.1.0
// @description  Añade un panel integrado en Cardmarket Wants para extraer ofertas faltantes de Perfect Order en Español + NM/MT.
// @author       Alejandro
// @match        https://www.cardmarket.com/*
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/cadmarket-exportador-po.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/cadmarket-exportador-po.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /************************************************************
   * CONFIGURACIÓN GENERAL
   ************************************************************/

  const UI = {
    panelId: 'cm-po-extractor-panel',
    styleId: 'cm-po-extractor-style',
    logId: 'cm-po-extractor-log',
    progressId: 'cm-po-extractor-progress',
    progressTextId: 'cm-po-extractor-progress-text',
    runBtnId: 'cm-po-extractor-run',
    cancelBtnId: 'cm-po-extractor-cancel',
    statusId: 'cm-po-extractor-status',
    statTargetsId: 'cm-po-stat-targets',
    statProductsId: 'cm-po-stat-products',
    statOffersId: 'cm-po-stat-offers'
  };

  let isRunning = false;
  let cancelRequested = false;

  /************************************************************
   * DATOS DEL EXTRACTOR
   ************************************************************/

  const RAW_MISSING = [
    ['003', 'Shaymin', 'Uncommon', 'Reverse Holo', 'Base/reverse'],
    ['010', 'Rowlet', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['020', 'Staryu', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['029', 'Dedenne', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['032', 'Mawile', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['037', 'Nosepass', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['052', 'Drapion', 'Uncommon', 'Reverse Holo', 'Base/reverse'],
    ['054', 'Chien-Pao', 'Rare', 'Reverse Holo', 'Base/reverse'],
    ['057', 'Doublade', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['063', 'Snorlax', 'Common', 'Reverse Holo', 'Base/reverse'],
    ['073', 'Energy Swatter', 'Uncommon', 'Reverse Holo', 'Base/reverse'],
    ['084', "Rosa's Encouragement", 'Uncommon', 'Reverse Holo', 'Base/reverse'],
    ['086', 'Growing Grass Energy', 'Rare', 'Reverse Holo', 'Base/reverse'],

    ['089', 'Spewpa', 'Illustration Rare', 'Holo', 'Premium'],
    ['090', 'POR 090 - pendiente validar nombre', 'Illustration Rare', 'Holo', 'Premium'],
    ['092', 'Aurorus', 'Illustration Rare', 'Holo', 'Premium'],
    ['093', 'Dedenne', 'Illustration Rare', 'Holo', 'Premium'],
    ['094', 'Clefairy', 'Illustration Rare', 'Holo', 'Premium'],
    ['095', 'Espurr', 'Illustration Rare', 'Holo', 'Premium'],
    ['096', 'Probopass', 'Illustration Rare', 'Holo', 'Premium'],

    ['101', 'Salazzle ex', 'Ultra Rare', 'Holo', 'Premium'],
    ['102', 'Mega Starmie ex', 'Ultra Rare', 'Holo', 'Premium'],
    ['103', 'Mega Clefable ex', 'Ultra Rare', 'Holo', 'Premium'],
    ['106', 'Mega Skarmory ex', 'Ultra Rare', 'Holo', 'Premium'],

    ['108', 'Reciclaje de Energía / Energy Recycler', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['109', 'Bosque Vitalidad / Vitality Forest', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['110', 'POR 110 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['111', 'POR 111 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['112', 'POR 112 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['113', 'POR 113 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['114', 'POR 114 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['115', 'POR 115 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['116', 'POR 116 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['117', 'POR 117 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['118', 'POR 118 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['119', 'POR 119 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['120', 'POR 120 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['121', 'POR 121 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['122', 'POR 122 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['123', 'POR 123 - pendiente validar nombre', 'Secret/Special Rare', 'Holo', 'Premium'],
    ['124', 'Mega Zygarde ex', 'Special Illustration Rare / chase', 'Holo', 'Premium']
  ];

  const MISSING = RAW_MISSING.map(([numero, carta, rareza, versionMaster, categoria]) => ({
    numero,
    carta,
    rareza,
    version_master: versionMaster,
    categoria_version: categoria,
    clave: `POR-${numero}-${versionMaster === 'Reverse Holo' ? 'Reverse Holo' : 'Premium'}`,
    idioma_objetivo: 'Español',
    condicion_minima: 'NM',
    condiciones_validas: 'MT;NM',
    tipo_version_cardmarket: versionMaster === 'Reverse Holo' ? 'Reverse Holo' : 'Normal/Holo no reverse',
    filtro_reverse_holo: versionMaster === 'Reverse Holo' ? 'Y' : 'N',
    cardmarket_set_list_url: 'https://www.cardmarket.com/es/Pokemon/Products/Singles/Perfect-Order?mode=list'
  }));

  const CONFIG = {
    origin: location.origin,
    setListPath: '/es/Pokemon/Products/Singles/Perfect-Order',
    delayMs: 1400,
    maxSetPages: 4,
    maxOfferPagesPerCard: 30,
    csvDelimiter: ';',
    iframeTimeoutMs: 30000,
    iframePostLoadDelayMs: 900
  };

  /************************************************************
   * UTILIDADES
   ************************************************************/

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const clean = (value) => {
    return (value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const absUrl = (href) => {
    return new URL(href, CONFIG.origin).href.split('#')[0];
  };

  const csvEscape = (value) => {
    const s = value == null ? '' : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  };

  const parseEuro = (txt) => {
    const m = clean(txt).match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/);
    if (!m) return '';
    return m[1].replace(/\./g, '').replace(',', '.');
  };

  function assertNotCancelled() {
    if (cancelRequested) {
      throw new Error('Extracción cancelada por el usuario.');
    }
  }

  function pageLooksLikeCloudflareChallenge(doc) {
    const text = clean(doc?.body?.innerText || '');
    const title = clean(doc?.title || '');

    return (
      /just a moment/i.test(text) ||
      /checking your browser/i.test(text) ||
      /verificando/i.test(text) ||
      /cloudflare/i.test(text) ||
      /challenge/i.test(text) ||
      /just a moment/i.test(title)
    );
  }

  /************************************************************
   * UI
   ************************************************************/

  function isWantsPage() {
    const path = location.pathname.toLowerCase();
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body?.innerText || '').toLowerCase();

    return (
      path.includes('/wants') ||
      title.includes('wants') ||
      bodyText.includes('my wants') ||
      bodyText.includes('mis wants')
    );
  }

  function injectStyles() {
    if (document.getElementById(UI.styleId)) return;

    const style = document.createElement('style');
    style.id = UI.styleId;

    style.textContent = `
      #${UI.panelId} {
        margin: 16px 0 18px 0;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 14px;
        overflow: hidden;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 8px 26px rgba(15, 23, 42, .08);
        font-family: inherit;
      }

      .cm-po-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(0,0,0,.08);
        background: #fff;
      }

      .cm-po-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .cm-po-icon {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f766e;
        color: #fff;
        flex-shrink: 0;
        box-shadow: 0 5px 14px rgba(15,118,110,.25);
      }

      .cm-po-icon svg {
        width: 21px;
        height: 21px;
      }

      .cm-po-title-wrap {
        min-width: 0;
      }

      .cm-po-title {
        font-size: 16px;
        line-height: 1.2;
        font-weight: 750;
        color: #111827;
        margin: 0;
      }

      .cm-po-subtitle {
        margin-top: 3px;
        font-size: 12px;
        color: #64748b;
      }

      .cm-po-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .cm-po-btn {
        border: 0;
        border-radius: 999px;
        padding: 9px 13px;
        font-size: 12px;
        line-height: 1;
        font-weight: 750;
        cursor: pointer;
        transition: transform .08s ease, filter .12s ease, opacity .12s ease;
        white-space: nowrap;
        text-decoration: none !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .cm-po-btn:hover {
        filter: brightness(.97);
        text-decoration: none !important;
      }

      .cm-po-btn:active {
        transform: scale(.98);
      }

      .cm-po-btn:disabled {
        opacity: .55;
        cursor: not-allowed;
      }

      .cm-po-btn-primary {
        background: #0f766e;
        color: #fff !important;
      }

      .cm-po-btn-danger {
        background: #fee2e2;
        color: #991b1b;
      }

      .cm-po-btn-secondary {
        background: #e5e7eb;
        color: #111827 !important;
      }

      .cm-po-body {
        padding: 13px 16px 15px 16px;
      }

      .cm-po-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .cm-po-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 9px;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
        font-size: 11px;
        font-weight: 700;
      }

      .cm-po-badge.green {
        background: #dcfce7;
        color: #166534;
      }

      .cm-po-badge.amber {
        background: #fef3c7;
        color: #92400e;
      }

      .cm-po-progress-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: center;
      }

      .cm-po-progress-track {
        height: 9px;
        border-radius: 999px;
        background: #e5e7eb;
        overflow: hidden;
      }

      #${UI.progressId} {
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: linear-gradient(90deg, #0f766e, #22c55e);
        transition: width .18s ease;
      }

      #${UI.progressTextId} {
        font-size: 12px;
        color: #475569;
        white-space: nowrap;
      }

      .cm-po-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 12px;
      }

      .cm-po-stat {
        background: #fff;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 12px;
        padding: 10px 11px;
      }

      .cm-po-stat-label {
        font-size: 11px;
        color: #64748b;
      }

      .cm-po-stat-value {
        margin-top: 2px;
        font-size: 18px;
        font-weight: 800;
        color: #111827;
      }

      .cm-po-status {
        margin-top: 11px;
        font-size: 12px;
        color: #475569;
      }

      .cm-po-log-wrap {
        margin-top: 12px;
      }

      .cm-po-log-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }

      .cm-po-log-title {
        font-size: 12px;
        color: #334155;
        font-weight: 700;
      }

      #${UI.logId} {
        height: 130px;
        overflow: auto;
        border-radius: 12px;
        background: #0f172a;
        color: #dbeafe;
        padding: 10px 11px;
        font-family: Consolas, Menlo, Monaco, monospace;
        font-size: 11px;
        line-height: 1.45;
        white-space: pre-wrap;
        scrollbar-width: thin;
      }

      @media (max-width: 760px) {
        .cm-po-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .cm-po-actions {
          justify-content: flex-start;
        }

        .cm-po-stats {
          grid-template-columns: 1fr;
        }

        .cm-po-progress-row {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function iconSvg() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.75 4.5h10.5v15H6.75v-15Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;
  }

  function findMountPoint() {
    const h1 = document.querySelector('h1');

    if (h1?.parentElement) {
      return {
        parent: h1.parentElement,
        before: h1.nextSibling
      };
    }

    const candidates = [
      'main',
      '#mainContent',
      '#content',
      '.content',
      '.container',
      '.page-content',
      'body'
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el) {
        return {
          parent: el,
          before: el.firstChild
        };
      }
    }

    return {
      parent: document.body,
      before: document.body.firstChild
    };
  }

  function createPanel() {
    if (document.getElementById(UI.panelId)) return;

    injectStyles();

    const panel = document.createElement('section');
    panel.id = UI.panelId;

    panel.innerHTML = `
      <div class="cm-po-head">
        <div class="cm-po-brand">
          <div class="cm-po-icon">${iconSvg()}</div>
          <div class="cm-po-title-wrap">
            <p class="cm-po-title">Extractor Perfect Order</p>
            <div class="cm-po-subtitle">Ofertas para faltantes · Español · NM/MT · descarga CSV</div>
          </div>
        </div>

        <div class="cm-po-actions">
          <button type="button" id="${UI.runBtnId}" class="cm-po-btn cm-po-btn-primary">Extraer ofertas</button>
          <button type="button" id="${UI.cancelBtnId}" class="cm-po-btn cm-po-btn-danger" disabled>Cancelar</button>
          <a class="cm-po-btn cm-po-btn-secondary" href="${CONFIG.origin}${CONFIG.setListPath}?mode=list" target="_blank" rel="noopener">Abrir set</a>
        </div>
      </div>

      <div class="cm-po-body">
        <div class="cm-po-badges">
          <span class="cm-po-badge green">Español</span>
          <span class="cm-po-badge green">NM o mejor</span>
          <span class="cm-po-badge amber">Reverse / Premium</span>
          <span class="cm-po-badge">CSV con separador ;</span>
          <span class="cm-po-badge">Carga interna por iframe</span>
        </div>

        <div class="cm-po-progress-row">
          <div class="cm-po-progress-track">
            <div id="${UI.progressId}"></div>
          </div>
          <div id="${UI.progressTextId}">0%</div>
        </div>

        <div class="cm-po-stats">
          <div class="cm-po-stat">
            <div class="cm-po-stat-label">Faltantes</div>
            <div id="${UI.statTargetsId}" class="cm-po-stat-value">${MISSING.length}</div>
          </div>
          <div class="cm-po-stat">
            <div class="cm-po-stat-label">Productos encontrados</div>
            <div id="${UI.statProductsId}" class="cm-po-stat-value">0</div>
          </div>
          <div class="cm-po-stat">
            <div class="cm-po-stat-label">Ofertas capturadas</div>
            <div id="${UI.statOffersId}" class="cm-po-stat-value">0</div>
          </div>
        </div>

        <div id="${UI.statusId}" class="cm-po-status">Preparado. Pulsa “Extraer ofertas” para iniciar.</div>

        <div class="cm-po-log-wrap">
          <div class="cm-po-log-head">
            <div class="cm-po-log-title">Registro</div>
            <button type="button" class="cm-po-btn cm-po-btn-secondary" data-cm-po-clear-log>Limpiar log</button>
          </div>
          <div id="${UI.logId}"></div>
        </div>
      </div>
    `;

    const mount = findMountPoint();
    mount.parent.insertBefore(panel, mount.before?.nextSibling || null);

    document.getElementById(UI.runBtnId)?.addEventListener('click', runExtractorSafely);

    document.getElementById(UI.cancelBtnId)?.addEventListener('click', () => {
      cancelRequested = true;
      setStatus('Cancelando cuando termine la operación actual…');
      uiLog('Cancelación solicitada por el usuario.', 'warn');
    });

    panel.querySelector('[data-cm-po-clear-log]')?.addEventListener('click', () => {
      const log = document.getElementById(UI.logId);
      if (log) log.textContent = '';
    });
  }

  function setRunningState(running) {
    isRunning = running;

    const runBtn = document.getElementById(UI.runBtnId);
    const cancelBtn = document.getElementById(UI.cancelBtnId);

    if (runBtn) {
      runBtn.disabled = running;
      runBtn.textContent = running ? 'Extrayendo…' : 'Extraer ofertas';
    }

    if (cancelBtn) {
      cancelBtn.disabled = !running;
    }
  }

  function setStatus(text) {
    const el = document.getElementById(UI.statusId);
    if (el) el.textContent = text;
  }

  function setProgress(current, total, label = '') {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;

    const bar = document.getElementById(UI.progressId);
    const txt = document.getElementById(UI.progressTextId);

    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (txt) txt.textContent = label ? `${pct}% · ${label}` : `${pct}%`;
  }

  function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function uiLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '•';
    const line = `[${timestamp}] ${prefix} ${message}`;

    const log = document.getElementById(UI.logId);

    if (log) {
      log.textContent += line + '\n';
      log.scrollTop = log.scrollHeight;
    }

    if (type === 'error') {
      console.error(message);
    } else if (type === 'warn') {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  /************************************************************
   * CARGA DE DOCUMENTOS
   ************************************************************/

  async function fetchDoc(url) {
    assertNotCancelled();
    return cargarDocumentoConIframe(url);
  }

  async function cargarDocumentoConIframe(url) {
    assertNotCancelled();

    const iframe = document.createElement('iframe');

    iframe.setAttribute('aria-hidden', 'true');

    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-99999px',
      top: '-99999px',
      width: '10px',
      height: '10px',
      opacity: '0',
      pointerEvents: 'none',
      border: '0'
    });

    const promesa = new Promise((resolve, reject) => {
      let terminado = false;

      const limpiar = () => {
        iframe.onload = null;
        iframe.onerror = null;

        setTimeout(() => {
          iframe.remove();
        }, 500);
      };

      const timer = setTimeout(() => {
        if (terminado) return;

        terminado = true;
        limpiar();

        reject(new Error(`Timeout cargando ${url}`));
      }, CONFIG.iframeTimeoutMs);

      iframe.onload = async () => {
        if (terminado) return;

        try {
          await sleep(CONFIG.iframePostLoadDelayMs);
          assertNotCancelled();

          const doc = iframe.contentDocument || iframe.contentWindow?.document;

          if (!doc) {
            throw new Error(`No se pudo acceder al documento cargado: ${url}`);
          }

          if (pageLooksLikeCloudflareChallenge(doc)) {
            throw new Error(
              `Cardmarket/Cloudflare ha mostrado una página de verificación en ${url}. ` +
              `Abre esa página manualmente en otra pestaña, espera a que cargue correctamente y vuelve a ejecutar.`
            );
          }

          const html = doc.documentElement.outerHTML;

          terminado = true;
          clearTimeout(timer);
          limpiar();

          resolve(new DOMParser().parseFromString(html, 'text/html'));
        } catch (error) {
          terminado = true;
          clearTimeout(timer);
          limpiar();
          reject(error);
        }
      };

      iframe.onerror = () => {
        if (terminado) return;

        terminado = true;
        clearTimeout(timer);
        limpiar();

        reject(new Error(`Error cargando iframe: ${url}`));
      };
    });

    document.body.appendChild(iframe);
    iframe.src = url;

    return promesa;
  }

  /************************************************************
   * EXTRACTOR CARDMARKET
   ************************************************************/

  function getAttrText(el) {
    if (!el) return '';

    return Array.from(el.querySelectorAll('[title], [aria-label], img[alt]'))
      .map(node => {
        return (
          node.getAttribute('title') ||
          node.getAttribute('aria-label') ||
          node.getAttribute('alt') ||
          ''
        );
      })
      .filter(Boolean)
      .map(clean)
      .join(' | ');
  }

  function detectNumeroFromText(text, href) {
    const combined = `${text} ${href || ''}`;

    let m = combined.match(/POR\s*[- ]?0?(\d{1,3})/i);

    if (!m) {
      m = combined.match(/\((?:POR)?\s*0?(\d{1,3})\)/i);
    }

    return m ? String(parseInt(m[1], 10)).padStart(3, '0') : '';
  }

  async function buildProductMap() {
    const map = new Map();

    for (let page = 1; page <= CONFIG.maxSetPages; page++) {
      assertNotCancelled();

      const url = `${CONFIG.origin}${CONFIG.setListPath}?mode=list&perSite=100&site=${page}`;

      uiLog(`Leyendo listado del set, página ${page}: ${url}`);
      setStatus(`Leyendo listado del set, página ${page}…`);

      const doc = await fetchDoc(url);

      const links = Array.from(
        doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/Perfect-Order/"]')
      );

      let added = 0;

      for (const a of links) {
        const href = absUrl(a.getAttribute('href'));

        if (/Perfect-Order-Additionals/i.test(href)) {
          continue;
        }

        const container = a.closest('tr, .row, .product-row, div') || a;
        const text = clean(`${a.textContent} ${getAttrText(container)}`);
        const numero = detectNumeroFromText(text, href);

        if (numero && !map.has(numero)) {
          map.set(numero, href.split('?')[0]);
          added++;
        }
      }

      uiLog(`Página ${page}: ${added} productos nuevos.`);
      setStat(UI.statProductsId, map.size);

      if (added === 0 && page > 1) {
        break;
      }

      await sleep(CONFIG.delayMs);
    }

    return map;
  }

  function maxPaginationPage(doc) {
    const nums = Array.from(doc.querySelectorAll('a[href*="site="]'))
      .map(a => new URL(absUrl(a.getAttribute('href'))).searchParams.get('site'))
      .map(x => parseInt(x || '', 10))
      .filter(Number.isFinite);

    return nums.length ? Math.max(...nums) : 1;
  }

  function detectCondition(text) {
    const m = text.match(/\b(MT|MINT|NM|NEAR MINT|EX|EXCELLENT|GD|GOOD|LP|LIGHT PLAYED|PL|PLAYED|PO|POOR)\b/i);

    if (!m) return '';

    const v = m[1].toUpperCase();

    if (v === 'MINT') return 'MT';
    if (v === 'NEAR MINT') return 'NM';

    return v;
  }

  function isSpanish(text) {
    return /\b(Español|Espanol|Spanish|Espagnol|Spanisch|Spagnolo)\b/i.test(text);
  }

  function isNmOrBetter(text) {
    const condition = detectCondition(text);
    return condition === 'MT' || condition === 'NM';
  }

  function rowLooksLikeOffer(el) {
    const txt = clean(el.innerText || el.textContent || '');

    return (
      /\d{1,3}(?:\.\d{3})*,\d{2}\s*€/.test(txt) &&
      !!el.querySelector('a[href*="/Users/"]')
    );
  }

  function parseOfferRows(doc, target, productUrl, offerPageUrl) {
    const candidates = Array.from(
      doc.querySelectorAll('.article-row, [class*="article-row"], .table-body .row, tr')
    );

    const rows = candidates.filter(rowLooksLikeOffer);
    const out = [];

    for (const row of rows) {
      const rowText = clean(row.innerText || row.textContent || '');
      const attrText = getAttrText(row);
      const allText = clean(`${rowText} | ${attrText}`);

      const spanishDetected = isSpanish(allText);
      const nmDetected = isNmOrBetter(allText);

      const urlFiltered =
        /language=4/.test(offerPageUrl) &&
        /minCondition=2/.test(offerPageUrl);

      if (!urlFiltered && (!spanishDetected || !nmDetected)) {
        continue;
      }

      const targetReverse = /reverse/i.test(target.version_master);
      const reverseDetected = /Reverse\s*Holo|Holo\s*Reverse|Revers[ao]|Inversa/i.test(allText);

      if (!targetReverse && reverseDetected) {
        continue;
      }

      if (
        targetReverse &&
        /isReverseHolo=Y/i.test(offerPageUrl) === false &&
        !reverseDetected
      ) {
        continue;
      }

      const sellerA = row.querySelector('a[href*="/Users/"]');
      const seller = clean(sellerA?.textContent || '');
      const sellerUrl = sellerA ? absUrl(sellerA.getAttribute('href')) : '';

      const priceText = (rowText.match(/\d{1,3}(?:\.\d{3})*,\d{2}\s*€/) || [''])[0];

      const qty =
        (
          allText.match(/(?:Cantidad|Available|Disponible|Stock)\D{0,8}(\d+)/i) ||
          allText.match(/\b(\d+)\s*x\b/i) ||
          ['', '']
        )[1];

      out.push({
        fecha_extraccion: new Date().toISOString(),
        numero: target.numero,
        carta: target.carta,
        rareza: target.rareza,
        version_master: target.version_master,
        clave: target.clave,
        product_url: productUrl,
        offer_page_url: offerPageUrl,
        seller,
        seller_url: sellerUrl,
        seller_pais_o_info: clean(attrText),
        seller_ventas_o_reputacion: '',
        precio_texto: priceText,
        precio_eur: parseEuro(priceText),
        cantidad_disponible: qty,
        condicion_detectada: detectCondition(allText),
        idioma_detectado: spanishDetected ? 'Español' : '',
        version_detectada: reverseDetected ? 'Reverse Holo' : 'Normal/Holo',
        info_producto: clean(attrText),
        texto_fila_original: rowText
      });
    }

    return out;
  }

  async function collectOffersForTarget(target, productUrl) {
    const offers = [];

    const base = new URL(productUrl);

    base.searchParams.set('language', '4');
    base.searchParams.set('minCondition', '2');
    base.searchParams.set('perSite', '100');
    base.searchParams.set('isReverseHolo', target.filtro_reverse_holo);

    let maxPage = 1;

    for (let page = 1; page <= Math.min(maxPage, CONFIG.maxOfferPagesPerCard); page++) {
      assertNotCancelled();

      base.searchParams.set('site', String(page));

      const url = base.href;

      uiLog(`Ofertas ${target.numero} ${target.carta} ${target.version_master}, página ${page}`);

      const doc = await fetchDoc(url);

      if (page === 1) {
        maxPage = Math.max(1, maxPaginationPage(doc));
      }

      const rows = parseOfferRows(doc, target, productUrl, url);

      offers.push(...rows);

      if (page >= maxPage) {
        break;
      }

      await sleep(CONFIG.delayMs);
    }

    return offers;
  }

  function downloadCsv(rows) {
    const headers = [
      'fecha_extraccion',
      'numero',
      'carta',
      'rareza',
      'version_master',
      'clave',
      'product_url',
      'offer_page_url',
      'seller',
      'seller_url',
      'seller_pais_o_info',
      'seller_ventas_o_reputacion',
      'precio_texto',
      'precio_eur',
      'cantidad_disponible',
      'condicion_detectada',
      'idioma_detectado',
      'version_detectada',
      'info_producto',
      'texto_fila_original'
    ];

    const lines = [
      headers.map(csvEscape).join(CONFIG.csvDelimiter)
    ];

    for (const row of rows) {
      lines.push(
        headers
          .map(header => csvEscape(row[header]))
          .join(CONFIG.csvDelimiter)
      );
    }

    const blob = new Blob(
      ['\ufeff' + lines.join('\r\n')],
      { type: 'text/csv;charset=utf-8' }
    );

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);

    const d = new Date();
    const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, '-');

    a.download = `cardmarket_ofertas_faltantes_perfect_order_ES_NM_${stamp}.csv`;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  async function runExtractor() {
    cancelRequested = false;

    setRunningState(true);
    setProgress(0, 100, 'Iniciando');
    setStatus('Iniciando extractor…');
    setStat(UI.statProductsId, 0);
    setStat(UI.statOffersId, 0);

    uiLog(`Iniciando extractor. Faltantes: ${MISSING.length}`);

    const productMap = await buildProductMap();

    uiLog(`Productos encontrados en listado principal: ${productMap.size}`);
    setStat(UI.statProductsId, productMap.size);

    const allOffers = [];
    const notFound = [];

    for (let i = 0; i < MISSING.length; i++) {
      assertNotCancelled();

      const target = MISSING[i];
      const productUrl = productMap.get(target.numero);

      setProgress(i, MISSING.length, `POR ${target.numero}`);
      setStatus(`Procesando ${target.numero} · ${target.carta} · ${target.version_master}`);

      if (!productUrl) {
        uiLog(`No encontrado producto POR ${target.numero} ${target.carta}`, 'warn');
        notFound.push(target);
        continue;
      }

      const offers = await collectOffersForTarget(target, productUrl);

      uiLog(`POR ${target.numero} ${target.carta} ${target.version_master}: ${offers.length} ofertas capturadas`);

      allOffers.push(...offers);
      setStat(UI.statOffersId, allOffers.length);

      await sleep(CONFIG.delayMs);
    }

    setProgress(MISSING.length, MISSING.length, 'Completado');

    if (notFound.length) {
      uiLog(`Productos no encontrados: ${notFound.length}`, 'warn');
      console.warn('Productos no encontrados:', notFound);
    }

    uiLog(`Total ofertas capturadas: ${allOffers.length}`);
    console.table(allOffers.slice(0, 20));

    downloadCsv(allOffers);

    setStatus(`Completado. Ofertas capturadas: ${allOffers.length}. CSV descargado.`);
  }

  async function runExtractorSafely() {
    if (isRunning) return;

    try {
      await runExtractor();
    } catch (error) {
      const msg = error?.message || String(error);

      if (/cancelada/i.test(msg)) {
        uiLog(msg, 'warn');
        setStatus('Extracción cancelada.');
      } else {
        uiLog(`Error en extractor Cardmarket: ${msg}`, 'error');
        setStatus('Error. Revisa el registro y la consola.');
        alert('Error en extractor Cardmarket. Revisa la consola para ver el detalle.');
      }
    } finally {
      setRunningState(false);
    }
  }

  /************************************************************
   * INICIO
   ************************************************************/

  function init() {
    if (!isWantsPage()) return;

    createPanel();
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(UI.panelId)) {
      init();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

})();