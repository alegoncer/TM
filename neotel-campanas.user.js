// ==UserScript==
// @name         Neotel PBX - Campañas Coremsa
// @namespace    https://github.com/alegoncer/TM
// @version      1.5.2
// @description  Mejora la pantalla de campañas de Neotel: filtros, ordenación, panel derecho oculto y secciones colapsables.
// @author       Coremsa
// @match        https://pbx.neotel2000.com/pbx/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/neotel-campanas.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/neotel-campanas.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CFG = {
    pagePathNeedle: '/pbx/client/pred/campaigns',

    campaignRowSelector: '.launcher_campaigns_view_campaigns_list_class_campaign_item',
    activityRowSelector: '.launcher_campaigns_view_campaigns_list_class_campaign_activity',

    toolbarId: 'tm-neotel-campaigns-toolbar',
    oldDetailNavId: 'tm-neotel-campaign-detail-nav',

    bodyClass: 'tm-neotel-campaigns-enhanced',

    storageKey: 'tm.neotel.campaigns.filters.v6',
    detailCollapseStorageKey: 'tm.neotel.campaigns.detail.collapsed.v4'
  };

  const DEFAULT_STATE = {
    q: '',
    callbotOnly: false,
    activeCallsOnly: false,
    sort: 'name_asc'
  };

  const DETAIL_SECTIONS = [
    { key: 'datos_generales', label: 'Datos generales' },
    { key: 'configuracion', label: 'Configuración' },
    { key: 'leads_por_tipos', label: 'Leads por tipos' },
    { key: 'campos', label: 'Campos' }
  ];

  let applying = false;
  let observerTimer = null;
  let detailEnhanceTimer = null;
  let lastTable = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function num(value) {
    const raw = String(value || '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return 0;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function installCss() {
    if ($('#tm-neotel-campaigns-style')) return;

    const style = document.createElement('style');
    style.id = 'tm-neotel-campaigns-style';
    style.textContent = `
      body.tm-neotel-campaigns-enhanced {
        --tm-coremsa-primary: #3F53D9;
        --tm-coremsa-dark: #050038;
        --tm-coremsa-soft: #f5f7ff;
        --tm-coremsa-border: #dfe3ef;
        --tm-neotel-orange: #ff751c;
      }

      /* Ocultar panel derecho / softphone / widget lateral */
      body.tm-neotel-campaigns-enhanced .aside-menu,
      body.tm-neotel-campaigns-enhanced aside.aside-menu,
      body.tm-neotel-campaigns-enhanced .app-body .aside-menu,
      body.tm-neotel-campaigns-enhanced #aside-menu,
      body.tm-neotel-campaigns-enhanced [class*="aside-menu"] {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
        right: -9999px !important;
        transform: translateX(110%) !important;
        pointer-events: none !important;
      }

      body.tm-neotel-campaigns-enhanced main.main,
      body.tm-neotel-campaigns-enhanced .main,
      body.tm-neotel-campaigns-enhanced .app-footer {
        margin-right: 0 !important;
        right: 0 !important;
      }

      body.tm-neotel-campaigns-enhanced .navbar-toggler-icon-widget,
      body.tm-neotel-campaigns-enhanced button:has(.navbar-toggler-icon-widget),
      body.tm-neotel-campaigns-enhanced a:has(.navbar-toggler-icon-widget) {
        display: none !important;
      }

      body.tm-neotel-campaigns-enhanced .main,
      body.tm-neotel-campaigns-enhanced main.main {
        background: #f6f7fb !important;
      }

      body.tm-neotel-campaigns-enhanced .card,
      body.tm-neotel-campaigns-enhanced .panel,
      body.tm-neotel-campaigns-enhanced .content,
      body.tm-neotel-campaigns-enhanced .container-fluid > .row > [class*="col"] > .card {
        border-radius: 10px !important;
        border-color: var(--tm-coremsa-border) !important;
        box-shadow: 0 6px 16px rgba(5,0,56,.045);
      }

      body.tm-neotel-campaigns-enhanced .tm-neotel-campaigns-table {
        background: #fff;
        border-collapse: separate !important;
        border-spacing: 0 !important;
        border-radius: 10px;
        overflow: hidden;
      }

      body.tm-neotel-campaigns-enhanced .tm-neotel-campaigns-table thead th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: #ffffff !important;
        color: #33394d;
        border-bottom: 1px solid var(--tm-coremsa-border) !important;
        box-shadow: 0 1px 0 rgba(0,0,0,.05);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .02em;
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector} > td {
        vertical-align: middle !important;
        border-top: 1px solid #edf0f7 !important;
        padding-top: 7px !important;
        padding-bottom: 7px !important;
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector}:hover {
        background: #f7f9ff !important;
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector} > td:first-child {
        font-weight: 650;
        min-width: 360px;
        max-width: 620px;
        white-space: normal;
        line-height: 1.25;
        color: #1e2438;
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector} > td:nth-child(7) {
        font-weight: 700;
        color: var(--tm-coremsa-primary);
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector} .btn {
        padding: 2px 6px !important;
        margin: 1px !important;
        font-size: 11px !important;
        line-height: 1.25 !important;
        border-radius: 6px !important;
      }

      body.tm-neotel-campaigns-enhanced ${CFG.campaignRowSelector} .badge {
        font-size: 11px !important;
        border-radius: 999px !important;
      }

      body.tm-neotel-campaigns-enhanced .tm-campaign-hidden,
      body.tm-neotel-campaigns-enhanced .tm-force-hidden,
      body.tm-neotel-campaigns-enhanced .tm-section-hidden {
        display: none !important;
      }

      #${CFG.toolbarId} {
        position: sticky;
        top: 0;
        z-index: 30;
        background: #ffffff;
        border: 1px solid var(--tm-coremsa-border);
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(5,0,56,.08);
        margin: 0 0 12px 0;
        padding: 12px;
      }

      #${CFG.toolbarId} .tm-row {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) minmax(220px, 270px) auto auto auto;
        align-items: end;
        gap: 10px;
      }

      #${CFG.toolbarId} .tm-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      #${CFG.toolbarId} label.tm-label {
        margin: 0;
        font-size: 11px;
        font-weight: 750;
        color: #444b5f;
        text-transform: uppercase;
        letter-spacing: .03em;
      }

      #${CFG.toolbarId} input[type="text"],
      #${CFG.toolbarId} select {
        height: 34px;
        border: 1px solid #cfd5e7;
        border-radius: 8px;
        padding: 4px 10px;
        font-size: 13px;
        background: #fff;
        width: 100%;
      }

      #${CFG.toolbarId} input[type="text"]:focus,
      #${CFG.toolbarId} select:focus {
        outline: none;
        border-color: var(--tm-coremsa-primary);
        box-shadow: 0 0 0 3px rgba(63,83,217,.12);
      }

      #${CFG.toolbarId} .tm-check,
      #${CFG.toolbarId} .tm-toggle {
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 11px;
        border: 1px solid #cfd5e7;
        border-radius: 8px;
        background: #f8f9fd;
        color: #22283b;
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }

      #${CFG.toolbarId} .tm-toggle.tm-active {
        background: var(--tm-coremsa-primary);
        border-color: var(--tm-coremsa-primary);
        color: #fff;
        box-shadow: 0 4px 12px rgba(63,83,217,.18);
      }

      #${CFG.toolbarId} .tm-actions {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
        white-space: nowrap;
      }

      #${CFG.toolbarId} .tm-btn {
        height: 34px;
        border: 0;
        border-radius: 8px;
        padding: 0 12px;
        font-weight: 750;
        cursor: pointer;
        white-space: nowrap;
      }

      #${CFG.toolbarId} .tm-btn-primary {
        background: var(--tm-coremsa-primary);
        color: #fff;
      }

      #${CFG.toolbarId} .tm-btn-secondary {
        background: #eef1fb;
        color: var(--tm-coremsa-dark);
      }

      #${CFG.toolbarId} .tm-summary {
        margin-top: 9px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        color: #3b4254;
        font-size: 12px;
      }

      #${CFG.toolbarId} .tm-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 999px;
        padding: 4px 9px;
        background: #f1f3fb;
        border: 1px solid #e2e6f3;
        font-weight: 650;
      }

      #${CFG.toolbarId} .tm-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--tm-coremsa-primary);
      }

      #${CFG.oldDetailNavId} {
        display: none !important;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected {
        font-size: 13px;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected > p {
        margin-bottom: 6px !important;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-title {
        cursor: pointer !important;
        user-select: none;
        position: relative;
        display: block !important;
        width: 100%;
        border-radius: 5px !important;
        padding: 6px 28px 6px 10px !important;
        margin-top: 10px !important;
        margin-bottom: 6px !important;
        background: var(--tm-neotel-orange) !important;
        color: #ffffff !important;
        font-weight: 800 !important;
        text-align: center !important;
        box-shadow: 0 2px 5px rgba(0,0,0,.08);
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-title::after {
        content: "▾";
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 12px;
        color: #ffffff;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-title.tm-collapsed::after {
        content: "▸";
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-row {
        transition: background .12s ease;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-row:hover {
        background: #f8f9ff;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-row.row {
        margin-left: 0 !important;
        margin-right: 0 !important;
        border-bottom-color: #d9dce6 !important;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .tm-detail-section-row.row > [class*="col-"] {
        padding: 5px 8px !important;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected .badge-light {
        border-radius: 4px !important;
        background: #eef1f5 !important;
        color: #111827 !important;
        font-weight: 700;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected button.btn-block {
        border-radius: 7px !important;
        min-height: 31px;
        margin-bottom: 7px !important;
        font-weight: 700 !important;
        box-shadow: 0 2px 5px rgba(0,0,0,.07);
      }

      #launcher_campaigns_view_campaign_details_campaign_selected button.btn-success {
        background: #42b86a !important;
        border-color: #42b86a !important;
      }

      #launcher_campaigns_view_campaign_details_campaign_selected button.btn-primary {
        background: var(--tm-neotel-orange) !important;
        border-color: var(--tm-neotel-orange) !important;
      }

      @media (max-width: 1200px) {
        #${CFG.toolbarId} .tm-row {
          grid-template-columns: 1fr 1fr;
        }

        #${CFG.toolbarId} .tm-actions {
          justify-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function forceHideRightPanel() {
    document.body.classList.add(
      CFG.bodyClass,
      'aside-menu-hidden',
      'aside-menu-hidden-widget'
    );

    document.body.classList.remove(
      'aside-menu-show',
      'aside-menu-lg-show',
      'aside-menu-fixed',
      'aside-menu-maximized'
    );

    const main = $('main.main');
    const footer = $('.app-footer');

    if (main) {
      main.style.marginRight = '0px';
      main.style.right = '0px';
    }

    if (footer) {
      footer.style.marginRight = '0px';
      footer.style.right = '0px';
    }

    const asideCandidates = [
      '.aside-menu',
      'aside.aside-menu',
      '.app-body .aside-menu',
      '#aside-menu'
    ];

    asideCandidates.forEach(selector => {
      $$(selector).forEach(el => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.width = '0px';
        el.style.minWidth = '0px';
        el.style.maxWidth = '0px';
        el.style.right = '-9999px';
        el.style.pointerEvents = 'none';
      });
    });

    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  }

  function isCampaignsAreaPresent() {
    return Boolean($(CFG.campaignRowSelector)) || location.pathname.includes(CFG.pagePathNeedle);
  }

  function loadState() {
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(CFG.storageKey) || '{}') };
    } catch (_) {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState(state) {
    localStorage.setItem(CFG.storageKey, JSON.stringify(state));
  }

  function loadDetailCollapsedState() {
    try {
      return JSON.parse(localStorage.getItem(CFG.detailCollapseStorageKey) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveDetailCollapsedState(state) {
    localStorage.setItem(CFG.detailCollapseStorageKey, JSON.stringify(state));
  }

  function getCampaignTable() {
    const firstRow = $(CFG.campaignRowSelector);
    return firstRow ? firstRow.closest('table') : null;
  }

  function getTbody(table) {
    return table ? table.tBodies[0] : null;
  }

  function getItemRows(tbody) {
    return Array.from(tbody ? tbody.children : []).filter(row => row.matches(CFG.campaignRowSelector));
  }

  function getActivityRow(tbody, campaignId) {
    if (!campaignId || !tbody) return null;

    return Array.from(tbody.children).find(row => {
      return row.matches(CFG.activityRowSelector) && row.dataset.campaign_id === campaignId;
    });
  }

  function getRowData(row) {
    const cells = row.cells;

    const name = cleanText(cells[0]?.textContent);
    const total = num(cells[1]?.textContent);
    const remaining = num(cells[2]?.textContent);
    const effectiveness = num(cells[3]?.textContent);
    const status = cleanText(cells[4]?.textContent);
    const execution = cleanText(cells[5]?.textContent);
    const activeCalls = num(cells[6]?.textContent);
    const id = row.dataset.campaign_id || '';

    return {
      id,
      idNum: num(id),
      name,
      nameNorm: norm(name),
      total,
      remaining,
      effectiveness,
      status,
      statusNorm: norm(status),
      execution,
      executionNorm: norm(execution),
      activeCalls,
      allTextNorm: norm(`${id} ${name} ${status} ${execution} ${total} ${remaining} ${effectiveness} ${activeCalls}`)
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createToolbar(table) {
    const old = $(`#${CFG.toolbarId}`);

    if (old && old.dataset.boundTable === String(table.dataset.tmTableId || '')) return old;
    if (old) old.remove();

    if (!table.dataset.tmTableId) table.dataset.tmTableId = `${Date.now()}-${Math.random()}`;

    const state = loadState();
    const toolbar = document.createElement('div');

    toolbar.id = CFG.toolbarId;
    toolbar.dataset.boundTable = table.dataset.tmTableId;

    toolbar.innerHTML = `
      <div class="tm-row">
        <div class="tm-field">
          <label class="tm-label" for="tm-camp-q">Campaña</label>
          <input id="tm-camp-q" type="text" placeholder="Escribe parte del nombre o ID..." value="${escapeHtml(state.q)}">
        </div>

        <div class="tm-field">
          <label class="tm-label" for="tm-camp-sort">Ordenar</label>
          <select id="tm-camp-sort">
            <option value="name_asc">Nombre A-Z</option>
            <option value="name_desc">Nombre Z-A</option>
            <option value="id_asc">ID menor a mayor</option>
            <option value="id_desc">ID mayor a menor</option>
            <option value="total_asc">Total menor a mayor</option>
            <option value="total_desc">Total mayor a menor</option>
            <option value="remaining_asc">Restantes menor a mayor</option>
            <option value="remaining_desc">Restantes mayor a menor</option>
            <option value="effectiveness_desc">Efectividad mayor a menor</option>
            <option value="effectiveness_asc">Efectividad menor a mayor</option>
            <option value="active_calls_desc">Llamadas activas mayor a menor</option>
            <option value="active_calls_asc">Llamadas activas menor a mayor</option>
          </select>
        </div>

        <button type="button" class="tm-toggle" id="tm-camp-callbot" title="Filtra campañas que contengan callbot">Callbot</button>

        <label class="tm-check" title="Muestra solo campañas con llamadas activas mayores que cero">
          <input id="tm-camp-active-only" type="checkbox">
          Con llamadas activas
        </label>

        <div class="tm-actions">
          <button type="button" class="tm-btn tm-btn-secondary" id="tm-camp-clear">Limpiar</button>
          <button type="button" class="tm-btn tm-btn-primary" id="tm-camp-refresh">Reaplicar</button>
        </div>
      </div>

      <div class="tm-summary" id="tm-camp-summary"></div>
    `;

    const parentScrollBox = table.parentElement;
    parentScrollBox.insertBefore(toolbar, table);

    $('#tm-camp-sort', toolbar).value = state.sort;
    $('#tm-camp-active-only', toolbar).checked = Boolean(state.activeCallsOnly);
    $('#tm-camp-callbot', toolbar).classList.toggle('tm-active', Boolean(state.callbotOnly));
    $('#tm-camp-callbot', toolbar).setAttribute('aria-pressed', String(Boolean(state.callbotOnly)));

    const trigger = debounce(() => applyFiltersAndSort(table), 120);

    toolbar.addEventListener('input', trigger);
    toolbar.addEventListener('change', trigger);

    $('#tm-camp-callbot', toolbar).addEventListener('click', () => {
      const btn = $('#tm-camp-callbot', toolbar);
      btn.classList.toggle('tm-active');
      btn.setAttribute('aria-pressed', String(btn.classList.contains('tm-active')));
      applyFiltersAndSort(table);
    });

    $('#tm-camp-clear', toolbar).addEventListener('click', () => {
      $('#tm-camp-q', toolbar).value = '';
      $('#tm-camp-sort', toolbar).value = 'name_asc';
      $('#tm-camp-active-only', toolbar).checked = false;
      $('#tm-camp-callbot', toolbar).classList.remove('tm-active');
      $('#tm-camp-callbot', toolbar).setAttribute('aria-pressed', 'false');
      applyFiltersAndSort(table);
    });

    $('#tm-camp-refresh', toolbar).addEventListener('click', () => applyFiltersAndSort(table));

    return toolbar;
  }

  function readToolbarState(toolbar) {
    return {
      q: $('#tm-camp-q', toolbar)?.value || '',
      callbotOnly: Boolean($('#tm-camp-callbot', toolbar)?.classList.contains('tm-active')),
      activeCallsOnly: Boolean($('#tm-camp-active-only', toolbar)?.checked),
      sort: $('#tm-camp-sort', toolbar)?.value || 'name_asc'
    };
  }

  function passesFilter(data, state) {
    const q = norm(state.q);

    if (q && !data.allTextNorm.includes(q)) return false;
    if (state.callbotOnly && !data.allTextNorm.includes('callbot')) return false;
    if (state.activeCallsOnly && data.activeCalls <= 0) return false;

    return true;
  }

  function compareBySort(a, b, sortKey) {
    const dir = sortKey.endsWith('_desc') ? -1 : 1;

    switch (sortKey) {
      case 'name_asc':
      case 'name_desc':
        return dir * a.data.name.localeCompare(b.data.name, 'es', { sensitivity: 'base', numeric: true });

      case 'id_asc':
      case 'id_desc':
        return dir * (a.data.idNum - b.data.idNum);

      case 'total_asc':
      case 'total_desc':
        return dir * (a.data.total - b.data.total);

      case 'remaining_asc':
      case 'remaining_desc':
        return dir * (a.data.remaining - b.data.remaining);

      case 'effectiveness_asc':
      case 'effectiveness_desc':
        return dir * (a.data.effectiveness - b.data.effectiveness);

      case 'active_calls_asc':
      case 'active_calls_desc':
        return dir * (a.data.activeCalls - b.data.activeCalls);

      default:
        return a.index - b.index;
    }
  }

  function setRowHidden(row, hidden) {
    if (!row) return;
    row.classList.toggle('tm-campaign-hidden', hidden);
  }

  function applyFiltersAndSort(table) {
    if (!table || applying) return;

    const toolbar = $(`#${CFG.toolbarId}`);
    const tbody = getTbody(table);

    if (!toolbar || !tbody) return;

    applying = true;

    try {
      const state = readToolbarState(toolbar);
      saveState(state);

      const items = getItemRows(tbody).map((row, index) => {
        const data = getRowData(row);

        return {
          row,
          activityRow: getActivityRow(tbody, data.id),
          data,
          index,
          visible: passesFilter(data, state)
        };
      });

      items.sort((a, b) => compareBySort(a, b, state.sort));

      const fragment = document.createDocumentFragment();

      items.forEach(item => {
        setRowHidden(item.row, !item.visible);
        setRowHidden(item.activityRow, !item.visible);

        fragment.appendChild(item.row);
        if (item.activityRow) fragment.appendChild(item.activityRow);
      });

      tbody.appendChild(fragment);
      updateSummary(toolbar, items);
      hideUnwantedButtons(table);
    } finally {
      applying = false;
    }
  }

  function updateSummary(toolbar, items) {
    const visible = items.filter(item => item.visible);
    const totalCampaigns = items.length;
    const visibleCampaigns = visible.length;
    const totalLeads = visible.reduce((sum, item) => sum + item.data.total, 0);
    const remaining = visible.reduce((sum, item) => sum + item.data.remaining, 0);
    const activeCalls = visible.reduce((sum, item) => sum + item.data.activeCalls, 0);

    const summary = $('#tm-camp-summary', toolbar);
    if (!summary) return;

    summary.innerHTML = `
      <span class="tm-pill"><span class="tm-dot"></span>${visibleCampaigns} / ${totalCampaigns} campañas</span>
      <span class="tm-pill">Leads visibles: ${formatNumber(totalLeads)}</span>
      <span class="tm-pill">Restantes: ${formatNumber(remaining)}</span>
      <span class="tm-pill">Llamadas activas: ${formatNumber(activeCalls)}</span>
    `;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('es-ES');
  }

  function hideUnwantedButtons(root = document) {
    const badTexts = [
      'enviar sms',
      'gestion de permisos',
      'gestión de permisos'
    ];

    $$('button, a, .btn, [role="button"]', root).forEach(el => {
      if (el.closest(`#${CFG.toolbarId}`)) return;

      const text = norm([
        el.innerText,
        el.textContent,
        el.title,
        el.getAttribute('aria-label'),
        el.getAttribute('data-original-title'),
        el.getAttribute('data-title')
      ].filter(Boolean).join(' '));

      if (badTexts.some(bad => text.includes(norm(bad)))) {
        el.classList.add('tm-force-hidden');
      }
    });
  }

  function removeOldDetailNavigation() {
    const oldNav = $(`#${CFG.oldDetailNavId}`);
    if (oldNav) oldNav.remove();
  }

  function getDetailSelectedContainer() {
    return $('#launcher_campaigns_view_campaign_details_campaign_selected');
  }

  function getSectionKeyFromTitle(text) {
    const normalized = norm(text);
    const found = DETAIL_SECTIONS.find(section => norm(section.label) === normalized);
    return found ? found.key : null;
  }

  function isSectionHeaderParagraph(element) {
    if (!element || element.tagName !== 'P') return false;

    const badge = $('span.badge', element);
    if (!badge) return false;

    return Boolean(getSectionKeyFromTitle(badge.textContent));
  }

  function getSectionTitleElement(headerParagraph) {
    return $('span.badge', headerParagraph);
  }

  function getSectionContentNodes(headerParagraph) {
    const nodes = [];
    let current = headerParagraph.nextElementSibling;

    while (current) {
      if (isSectionHeaderParagraph(current)) break;
      nodes.push(current);
      current = current.nextElementSibling;
    }

    return nodes;
  }

  function setDetailSectionCollapsed(headerParagraph, collapsed) {
    const title = getSectionTitleElement(headerParagraph);
    const key = getSectionKeyFromTitle(title?.textContent);

    if (!title || !key) return;

    title.classList.toggle('tm-collapsed', collapsed);

    getSectionContentNodes(headerParagraph).forEach(node => {
      node.classList.add('tm-detail-section-row');
      node.dataset.tmSectionKey = key;
      node.classList.toggle('tm-section-hidden', collapsed);
    });
  }

  function toggleDetailSection(headerParagraph) {
    const title = getSectionTitleElement(headerParagraph);
    const key = getSectionKeyFromTitle(title?.textContent);

    if (!title || !key) return;

    const nextCollapsed = !title.classList.contains('tm-collapsed');

    setDetailSectionCollapsed(headerParagraph, nextCollapsed);

    const state = loadDetailCollapsedState();
    state[key] = nextCollapsed;
    saveDetailCollapsedState(state);
  }

  function enhanceCampaignDetailSections() {
    clearTimeout(detailEnhanceTimer);

    detailEnhanceTimer = setTimeout(() => {
      removeOldDetailNavigation();

      const container = getDetailSelectedContainer();
      if (!container) return;

      Array.from(container.children).forEach(child => {
        child.classList.remove('tm-section-hidden', 'tm-detail-section-row');
        delete child.dataset.tmSectionKey;
      });

      const collapsedState = loadDetailCollapsedState();

      Array.from(container.children).forEach(child => {
        if (!isSectionHeaderParagraph(child)) return;

        const title = getSectionTitleElement(child);
        const key = getSectionKeyFromTitle(title.textContent);

        title.classList.add('tm-detail-section-title');

        if (title.dataset.tmCollapseReady !== '1') {
          title.dataset.tmCollapseReady = '1';
          title.title = 'Mostrar / ocultar sección';
          title.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            toggleDetailSection(child);
          });
        }

        setDetailSectionCollapsed(child, Boolean(collapsedState[key]));
      });
    }, 160);
  }

  function debounce(fn, wait) {
    let timer = null;

    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function initCampaignEnhancements() {
    installCss();
    forceHideRightPanel();

    if (!isCampaignsAreaPresent()) return;

    hideUnwantedButtons(document);
    enhanceCampaignDetailSections();

    const table = getCampaignTable();

    if (!table || !getTbody(table)) return;

    document.body.classList.add(CFG.bodyClass);
    table.classList.add('tm-neotel-campaigns-table');
    lastTable = table;

    createToolbar(table);
    applyFiltersAndSort(table);
  }

  function scheduleInit() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(initCampaignEnhancements, 180);
  }

  const bodyObserver = new MutationObserver(() => {
    if (!applying) scheduleInit();
  });

  bodyObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  initCampaignEnhancements();
  setTimeout(initCampaignEnhancements, 600);
  setTimeout(initCampaignEnhancements, 1500);
  setTimeout(initCampaignEnhancements, 3000);

  setInterval(() => {
    forceHideRightPanel();
    hideUnwantedButtons(document);
    enhanceCampaignDetailSections();

    if (lastTable && document.contains(lastTable) && !applying) {
      applyFiltersAndSort(lastTable);
    }
  }, 5000);
})();
