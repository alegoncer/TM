// ==UserScript==
// @name         pkmn.gg - Exportar colección a CSV
// @namespace    https://github.com/alegoncer/TM
// @version      1.0.0
// @description  Añade un botón nativo en Collection para exportar la colección del usuario logado a CSV.
// @match        https://www.pkmn.gg/*
// @match        https://pkmn.gg/*
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/pkgg-exportador-coleccion.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/pkgg-exportador-coleccion.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /************************************************************
   * CONFIGURACIÓN
   ************************************************************/

  const BASE_API = 'https://api.tcg.gg/pkmn/v1';

  const UI = {
    id: 'pkmn-export-csv-widget',
    styleId: 'pkmn-export-csv-style',
    rowClass: 'pkmn-export-csv-mounted-row',
    buttonId: 'pkmn-export-csv-button',
    statusId: 'pkmn-export-csv-status',
    progressId: 'pkmn-export-csv-progress',
    hintId: 'pkmn-export-csv-hint'
  };

  const state = {
    userId: '',
    token: '',
    running: false,
    tokenResolvers: [],
    uiInstalled: false
  };

  const headersBase = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  /************************************************************
   * UTILIDADES BÁSICAS
   ************************************************************/

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function log(...args) {
    console.log('[PKMN EXPORT]', ...args);
  }

  function warn(...args) {
    console.warn('[PKMN EXPORT]', ...args);
  }

  function error(...args) {
    console.error('[PKMN EXPORT]', ...args);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function nowStampForFilename() {
    const d = new Date();
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  }

  function getDownloadFilename() {
    return `pkmn.gg ${nowStampForFilename()}.csv`;
  }

  function safeText(value) {
    return String(value ?? '').trim();
  }

  function escCsv(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  /************************************************************
   * TOKEN / SESIÓN
   ************************************************************/

  function extractJwt(text) {
    if (!text || typeof text !== 'string') return null;

    const bearerMatch = text.match(/Bearer\s+(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/);
    if (bearerMatch) return bearerMatch[1];

    const jwtMatch = text.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    return jwtMatch ? jwtMatch[0] : null;
  }

  function decodeJwtPayload(token) {
    try {
      const payload = token.split('.')[1];
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');

      const json = decodeURIComponent(
        atob(padded)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(json);
    } catch (err) {
      error('No se pudo decodificar el token JWT:', err);
      return null;
    }
  }

  function getHeader(headers, name) {
    if (!headers) return null;

    if (headers instanceof Headers) {
      return headers.get(name);
    }

    if (Array.isArray(headers)) {
      const found = headers.find(([k]) => String(k).toLowerCase() === name.toLowerCase());
      return found ? found[1] : null;
    }

    if (typeof headers === 'object') {
      const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : null;
    }

    return null;
  }

  function saveToken(token, source = 'desconocido') {
    if (!token || state.token === token) return;

    state.token = token;
    window.PKMN_BEARER_TOKEN = token;

    const payload = decodeJwtPayload(token);

    if (payload?.sub) {
      state.userId = payload.sub;
      log(`Usuario logado detectado: ${state.userId}`);
    }

    log(`Bearer token capturado desde: ${source}`);

    const pending = [...state.tokenResolvers];
    state.tokenResolvers = [];
    pending.forEach(resolve => resolve(token));

    setHint('');
    setStatus('Sesión detectada. Listo para exportar.', 'ok');
  }

  function findTokenInStorage() {
    const stores = [];

    try { stores.push(localStorage); } catch (_) {}
    try { stores.push(sessionStorage); } catch (_) {}

    for (const store of stores) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        const value = store.getItem(key);

        const token = extractJwt(value);
        if (token) {
          saveToken(token, `storage: ${key}`);
          return token;
        }

        try {
          const parsed = JSON.parse(value);
          const token2 = extractJwt(JSON.stringify(parsed));

          if (token2) {
            saveToken(token2, `storage JSON: ${key}`);
            return token2;
          }
        } catch (_) {}
      }
    }

    return null;
  }

  function waitForToken() {
    if (state.token) return Promise.resolve(state.token);

    findTokenInStorage();

    if (state.token) return Promise.resolve(state.token);

    setStatus('Esperando sesión...', 'warn');
    setHint('Abre el detalle de cualquier carta o entra en un set para que pkmn.gg cargue tu sesión. El exportador continuará solo.');

    return new Promise(resolve => {
      state.tokenResolvers.push(resolve);
    });
  }

  function installInterceptors() {
    if (window.__PKMN_EXPORT_INTERCEPTORS_INSTALLED__) return;

    window.__PKMN_EXPORT_INTERCEPTORS_INSTALLED__ = true;

    const originalFetch = window.fetch;

    if (typeof originalFetch === 'function') {
      window.fetch = async (...args) => {
        const [resource, config] = args;

        try {
          const authFromConfig = getHeader(config?.headers, 'authorization');
          const authFromRequest =
            resource instanceof Request
              ? resource.headers.get('authorization')
              : null;

          const token =
            extractJwt(authFromConfig) ||
            extractJwt(authFromRequest);

          if (token) saveToken(token, 'fetch');
        } catch (_) {}

        return originalFetch(...args);
      };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__pkmn_method = method;
      this.__pkmn_url = url;
      this.__pkmn_headers = {};
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      this.__pkmn_headers[name.toLowerCase()] = value;

      if (name.toLowerCase() === 'authorization') {
        const token = extractJwt(value);
        if (token) saveToken(token, 'XMLHttpRequest');
      }

      return originalSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      try {
        const token = extractJwt(this.__pkmn_headers?.authorization);
        if (token) saveToken(token, 'XMLHttpRequest send');
      } catch (_) {}

      return originalSend.call(this, ...args);
    };

    log('Interceptores instalados.');
  }

  async function ensureLoggedUser() {
    if (state.userId) return state.userId;

    await waitForToken();

    const payload = decodeJwtPayload(state.token);

    if (!payload?.sub) {
      throw new Error('No se pudo obtener el userId del usuario logado desde el Bearer token.');
    }

    state.userId = payload.sub;
    return state.userId;
  }

  /************************************************************
   * API
   ************************************************************/

  async function fetchJson(url, options = {}, authRequired = false) {
    let attempts = 0;

    while (attempts < 3) {
      attempts++;

      const headers = {
        ...headersBase,
        ...(options.headers || {})
      };

      if (authRequired) {
        await waitForToken();
        headers.Authorization = `Bearer ${state.token}`;
      }

      const res = await fetch(url, {
        ...options,
        headers
      });

      if ((res.status === 401 || res.status === 403) && authRequired) {
        warn(`Token rechazado con estado ${res.status}. Esperando nuevo token...`);

        state.token = '';
        window.PKMN_BEARER_TOKEN = '';

        await waitForToken();
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Error ${res.status} en ${url}\n${text.slice(0, 1000)}`);
      }

      return await res.json();
    }

    throw new Error(`No se pudo obtener respuesta válida de ${url}`);
  }

  async function getRecentPage(marker = null) {
    const url = `${BASE_API}/collection/recent?userId=${encodeURIComponent(state.userId)}&ascending=false`;

    return await fetchJson(
      url,
      {
        method: 'POST',
        body: JSON.stringify(marker ? { marker } : {})
      },
      false
    );
  }

  async function getAllRecent() {
    const all = [];
    let marker = null;
    let page = 1;
    const seenMarkers = new Set();

    while (true) {
      setStatus(`Cargando colección reciente · página ${page}...`, 'working');
      log(`Cargando página recent ${page}...`);

      const data = await getRecentPage(marker);
      const rows = data.value || [];

      all.push(...rows);

      log(`Página ${page}: ${rows.length} registros. Total acumulado: ${all.length}`);

      const nextMarker = data.pagingKey || null;

      if (!nextMarker) break;

      if (seenMarkers.has(nextMarker)) {
        warn('Marker repetido. Corto para evitar bucle infinito.');
        break;
      }

      seenMarkers.add(nextMarker);
      marker = nextMarker;
      page++;

      await sleep(120);
    }

    return all;
  }

  async function getSetCollection(setId) {
    const url = `${BASE_API}/collection?setId=${encodeURIComponent(setId)}`;

    return await fetchJson(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      true
    );
  }

  /************************************************************
   * TRANSFORMACIÓN DE DATOS
   ************************************************************/

  function getVariantData(row) {
    const variant = row.variant || '';
    const variantMap = row.variantMap || {};

    return variantMap[variant] || Object.values(variantMap)[0] || {};
  }

  function flattenRecent(rows) {
    return rows.map(x => {
      const card = x.card || {};
      const variant = x.variant || '';
      const variantData = getVariantData(x);

      return {
        CardId: card.id || '',
        Carta: card.name || '',
        Numero: card.numberDisplay || card.number || '',
        NumberKey: card.numberKey || '',
        TotalSet: card.totalDisplay || '',
        SetId: card.setId || '',
        Set: card.set || '',
        Serie: card.series || '',
        Rareza: card.rarity || '',
        Variante: variant,
        TipoVariante: variantData.tcgPlayerSubtype || variant,
        PrecioUnitarioUSD: variantData.price ?? card.sortPrice ?? '',
        PrecioTexto: variantData.priceDisplay || card.formattedPrice || '',
        SinPrecioMercado: variantData.notMarket ?? '',
        DescripcionVariante: variantData.description || '',
        TcgPlayerId: variantData.tcgPlayerId || '',
        Artista: card.artist || '',
        Categoria: card.category || '',
        FechaLanzamiento: card.releaseDate || '',
        Imagen: card.largeImageUrl || card.thumbImageUrl || '',
        TcgPlayerMassEntry: card.tcgPlayerMassEntry || '',
        TcgLiveCode: card.tcgLiveCode || ''
      };
    });
  }

  function normalizeVariant(v) {
    return String(v || '').trim();
  }

  function normalizeCardId(v) {
    return String(v || '').trim();
  }

  function parseSk(sk) {
    const raw =
      typeof sk === 'string'
        ? sk
        : sk?.S || '';

    const parts = raw.split('#');

    if (parts.length >= 5 && parts[0] === 'CARD' && parts[1] === 'collection') {
      return {
        SetId: parts[2],
        CardId: parts[3],
        Variante: parts.slice(4).join('#')
      };
    }

    return null;
  }

  function addQuantity(map, item) {
    if (!item || typeof item !== 'object') return;

    const parsedSk = parseSk(item.sk);

    const cardId = normalizeCardId(
      item.cardId ||
      item.id ||
      item.card?.id ||
      item.card?.cardId ||
      parsedSk?.CardId ||
      ''
    );

    const variant = normalizeVariant(
      item.variant ||
      item.variantName ||
      item.key ||
      item.variantKey ||
      parsedSk?.Variante ||
      ''
    );

    const quantity =
      item.quantity ??
      item.qty ??
      item.count ??
      item.owned ??
      item.amount ??
      item.value?.quantity ??
      null;

    if (!cardId || !variant || quantity === null || quantity === undefined) return;

    const qtyNumber = Number(quantity);

    if (!Number.isFinite(qtyNumber)) return;

    map.set(`${cardId}||${variant}`, {
      CardId: cardId,
      Variante: variant,
      Cantidad: qtyNumber,
      Raw: item
    });
  }

  function looksLikeCardId(value) {
    return typeof value === 'string' && /^[a-z0-9]+(?:pt[0-9]+)?-[A-Za-z0-9]+$/i.test(value);
  }

  function extractQuantitiesFromJson(data) {
    const map = new Map();

    const knownVariants = [
      'normal',
      'holofoil',
      'reverseHolofoil',
      'stamp',
      'holofoilAlternate',
      'playPokemonStampNormal',
      'playPokemonStampHolofoil',
      'cosmosHolofoil',
      'etchedHolofoil'
    ];

    function scanVariantFields(node) {
      if (!node || typeof node !== 'object') return;

      const parsedSk = parseSk(node.sk);

      const cardId = normalizeCardId(
        node.cardId ||
        node.id ||
        node.card?.id ||
        parsedSk?.CardId ||
        ''
      );

      if (!cardId) return;

      for (const variant of knownVariants) {
        const value = node[variant];

        if (typeof value === 'number') {
          addQuantity(map, {
            cardId,
            variant,
            quantity: value
          });
        }

        if (value && typeof value === 'object') {
          addQuantity(map, {
            cardId,
            variant,
            ...value
          });
        }
      }

      const containers = [
        node.variants,
        node.quantityMap,
        node.quantities,
        node.variantMap
      ];

      for (const container of containers) {
        if (!container || typeof container !== 'object') continue;

        for (const [variant, value] of Object.entries(container)) {
          if (typeof value === 'number') {
            addQuantity(map, {
              cardId,
              variant,
              quantity: value
            });
          }

          if (value && typeof value === 'object') {
            addQuantity(map, {
              cardId,
              variant,
              ...value
            });
          }
        }
      }
    }

    function walk(node) {
      if (node === null || node === undefined) return;

      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }

      if (typeof node !== 'object') return;

      addQuantity(map, node);
      scanVariantFields(node);

      for (const [key, value] of Object.entries(node)) {
        if (looksLikeCardId(key) && value && typeof value === 'object') {
          for (const [variantKey, variantValue] of Object.entries(value)) {
            if (typeof variantValue === 'number') {
              addQuantity(map, {
                cardId: key,
                variant: variantKey,
                quantity: variantValue
              });
            }

            if (variantValue && typeof variantValue === 'object') {
              addQuantity(map, {
                cardId: key,
                variant: variantKey,
                ...variantValue
              });
            }
          }
        }

        walk(value);
      }
    }

    walk(data);

    return map;
  }

  async function getAllQuantitiesBySet(setIds) {
    const quantityMap = new Map();
    const debugResponses = {};

    let i = 1;

    for (const setId of setIds) {
      setStatus(`Leyendo cantidades · set ${i}/${setIds.length}: ${setId}`, 'working');
      setProgress(35 + Math.round((i / Math.max(1, setIds.length)) * 50));

      log(`Consultando cantidades del set ${i}/${setIds.length}: ${setId}`);

      try {
        const data = await getSetCollection(setId);
        debugResponses[setId] = data;

        const setQtyMap = extractQuantitiesFromJson(data);

        for (const [key, value] of setQtyMap.entries()) {
          quantityMap.set(key, value);
        }

        log(`Set ${setId}: ${setQtyMap.size} cantidades detectadas.`);
      } catch (err) {
        error(`Error consultando set ${setId}:`, err);
      }

      i++;
      await sleep(150);
    }

    return {
      quantityMap,
      debugResponses
    };
  }

  function toCsv(rows) {
    const headers = [
      'CardId',
      'Carta',
      'Cantidad',
      'CantidadEncontrada',
      'Numero',
      'NumberKey',
      'TotalSet',
      'SetId',
      'Set',
      'Serie',
      'Rareza',
      'Variante',
      'TipoVariante',
      'PrecioUnitarioUSD',
      'PrecioTexto',
      'ValorTotalUSD',
      'SinPrecioMercado',
      'DescripcionVariante',
      'TcgPlayerId',
      'Artista',
      'Categoria',
      'FechaLanzamiento',
      'Imagen',
      'TcgPlayerMassEntry',
      'TcgLiveCode'
    ];

    return [
      headers.join(';'),
      ...rows.map(row => headers.map(h => escCsv(row[h])).join(';'))
    ].join('\n');
  }

  function downloadCsv(filename, csvText) {
    const blob = new Blob(['\uFEFF' + csvText], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /************************************************************
   * EXPORTACIÓN
   ************************************************************/

  async function runExport() {
    if (state.running) return;

    state.running = true;

    setButtonLoading(true);
    setProgress(0);
    setHint('');

    try {
      installInterceptors();
      findTokenInStorage();

      setStatus('Preparando sesión...', 'working');
      await ensureLoggedUser();

      setProgress(8);
      setStatus('Cargando colección reciente...', 'working');

      const recentRaw = await getAllRecent();
      const recentFlat = flattenRecent(recentRaw);

      log(`Registros de colección detectados: ${recentFlat.length}`);

      setProgress(30);

      const setIds = [...new Set(recentFlat.map(x => x.SetId).filter(Boolean))];

      log(`Sets detectados: ${setIds.length}`);
      console.table(setIds.map(x => ({ SetId: x })));

      const { quantityMap, debugResponses } = await getAllQuantitiesBySet(setIds);

      log(`Cantidades detectadas en total: ${quantityMap.size}`);

      setProgress(88);
      setStatus('Construyendo CSV...', 'working');

      const finalRows = recentFlat.map(row => {
        const key = `${row.CardId}||${row.Variante}`;
        const qtyData = quantityMap.get(key);

        const cantidad = qtyData?.Cantidad ?? 1;
        const precio = Number(row.PrecioUnitarioUSD);

        const valorTotal =
          Number.isFinite(precio)
            ? Number((precio * cantidad).toFixed(2))
            : '';

        return {
          ...row,
          Cantidad: cantidad,
          CantidadEncontrada: qtyData ? 'Sí' : 'No',
          ValorTotalUSD: valorTotal
        };
      });

      finalRows.sort((a, b) => {
        const setCompare = String(a.SetId).localeCompare(String(b.SetId));

        if (setCompare !== 0) return setCompare;

        const numA = Number(a.Numero);
        const numB = Number(b.Numero);

        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return numA - numB;
        }

        return String(a.Numero).localeCompare(String(b.Numero));
      });

      const sinCantidad = finalRows.filter(x => x.CantidadEncontrada === 'No');
      const conMasDeUna = finalRows.filter(x => Number(x.Cantidad) > 1);

      const totalValor = finalRows.reduce((acc, row) => {
        const v = Number(row.ValorTotalUSD);
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0);

      log(`Filas finales: ${finalRows.length}`);
      log(`Filas con cantidad encontrada: ${finalRows.length - sinCantidad.length}`);
      log(`Filas sin cantidad encontrada, usando 1 por defecto: ${sinCantidad.length}`);
      log(`Cartas/variantes con cantidad mayor que 1: ${conMasDeUna.length}`);
      log(`Valor total aproximado USD: ${totalValor.toFixed(2)}`);

      if (conMasDeUna.length > 0) {
        console.table(conMasDeUna);
      }

      if (sinCantidad.length > 0) {
        warn('Hay filas sin cantidad encontrada. Se les ha puesto 1 por defecto.');
        console.table(sinCantidad.slice(0, 20));
      }

      const csv = toCsv(finalRows);
      const filename = getDownloadFilename();

      downloadCsv(filename, csv);

      window.pkmnCollectionExport = {
        userId: state.userId,
        recentRaw,
        recentFlat,
        finalRows,
        quantityMap,
        debugResponses,
        csv,
        filename
      };

      setProgress(100);
      setStatus(`CSV descargado · ${finalRows.length} filas`, 'ok');
      setHint(`Archivo: ${filename}`);

      log(`Archivo descargado: ${filename}`);
      log('Terminado.');
      log('Datos disponibles en window.pkmnCollectionExport.finalRows');
    } catch (err) {
      error('El script se ha detenido:', err);

      setStatus('Error al exportar', 'error');
      setHint(safeText(err?.message || err));
    } finally {
      state.running = false;
      setButtonLoading(false);
    }
  }

  /************************************************************
   * UI NATIVA
   ************************************************************/

  function injectStyles() {
    if (document.getElementById(UI.styleId)) return;

    const style = document.createElement('style');
    style.id = UI.styleId;

    style.textContent = `
      .${UI.rowClass} {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        flex-wrap: wrap !important;
      }

      #${UI.id} {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 2px;
        font-family: inherit;
        color: #ffffff;
      }

      #${UI.buttonId} {
        height: 42px;
        padding: 0 15px;
        border: 1px solid rgba(255, 213, 74, 0.42);
        border-radius: 9px;
        background: #FFD54A;
        color: #15181F;
        font-family: inherit;
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 8px 18px rgba(255, 213, 74, 0.12);
        transition:
          transform 120ms ease,
          filter 120ms ease,
          opacity 120ms ease,
          box-shadow 120ms ease;
        white-space: nowrap;
      }

      #${UI.buttonId}:hover {
        filter: brightness(1.03);
        box-shadow: 0 10px 22px rgba(255, 213, 74, 0.18);
      }

      #${UI.buttonId}:active {
        transform: translateY(1px) scale(0.99);
      }

      #${UI.buttonId}:disabled {
        opacity: 0.62;
        cursor: progress;
      }

      #${UI.buttonId} svg {
        width: 17px;
        height: 17px;
        flex-shrink: 0;
      }

      .pkmn-export-meta {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 190px;
        max-width: 360px;
      }

      #${UI.statusId} {
        font-size: 12px;
        font-weight: 700;
        color: #AEB5C5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${UI.statusId}[data-state="ok"] {
        color: #63D471;
      }

      #${UI.statusId}[data-state="warn"] {
        color: #FFD54A;
      }

      #${UI.statusId}[data-state="error"] {
        color: #FF6575;
      }

      #${UI.statusId}[data-state="working"] {
        color: #AEB5C5;
      }

      .pkmn-export-progress-track {
        width: 100%;
        height: 5px;
        border-radius: 999px;
        overflow: hidden;
        background: #2B313F;
        border: 1px solid rgba(255,255,255,0.04);
      }

      #${UI.progressId} {
        width: 0%;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #FFD54A, #FFE88A);
        transition: width 180ms ease;
      }

      #${UI.hintId} {
        width: 100%;
        max-width: 620px;
        margin-top: 7px;
        font-size: 12px;
        line-height: 1.35;
        color: #7F8596;
      }

      #${UI.hintId}:empty {
        display: none;
      }

      @media (max-width: 760px) {
        #${UI.id} {
          width: 100%;
        }

        .pkmn-export-meta {
          flex: 1;
          min-width: 180px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function exportIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M7.5 9.5 12 14l4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 17.5v1.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-1.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = UI.id;

    widget.innerHTML = `
      <button id="${UI.buttonId}" type="button" title="Exportar colección a CSV">
        ${exportIcon()}
        <span>Exportar a CSV</span>
      </button>

      <div class="pkmn-export-meta">
        <div id="${UI.statusId}" data-state="idle">Listo para exportar</div>
        <div class="pkmn-export-progress-track">
          <div id="${UI.progressId}"></div>
        </div>
      </div>

      <div id="${UI.hintId}"></div>
    `;

    widget.querySelector(`#${UI.buttonId}`).addEventListener('click', runExport);

    return widget;
  }

  function setStatus(text, type = 'idle') {
    const el = document.getElementById(UI.statusId);
    if (!el) return;

    el.textContent = text;
    el.dataset.state = type;
  }

  function setHint(text) {
    const el = document.getElementById(UI.hintId);
    if (!el) return;

    el.textContent = text || '';
  }

  function setProgress(percent) {
    const el = document.getElementById(UI.progressId);
    if (!el) return;

    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    el.style.width = `${safePercent}%`;
  }

  function setButtonLoading(isLoading) {
    const btn = document.getElementById(UI.buttonId);
    if (!btn) return;

    btn.disabled = !!isLoading;
    btn.querySelector('span').textContent = isLoading ? 'Exportando...' : 'Exportar a CSV';
  }

  function findCollectionSearchInput() {
    const inputs = Array.from(document.querySelectorAll('input'));

    return inputs.find(input => {
      const placeholder = input.getAttribute('placeholder') || '';
      return /search\s+cards\s+by\s+name/i.test(placeholder);
    }) || null;
  }

  function findSearchBox(input) {
    if (!input) return null;

    let current = input;

    for (let i = 0; i < 5; i++) {
      if (!current?.parentElement) break;

      current = current.parentElement;

      const rect = current.getBoundingClientRect();

      if (rect.width >= 250 && rect.height >= 34 && rect.height <= 70) {
        return current;
      }
    }

    return input.parentElement;
  }

  function isCollectionPage() {
    if (!/\/u\/[^/]+/i.test(location.pathname)) return false;

    const input = findCollectionSearchInput();

    if (input) return true;

    const text = document.body?.innerText || '';

    return (
      /Collection/i.test(text) &&
      /Card Type/i.test(text) &&
      /Energy Type/i.test(text)
    );
  }

  function mountWidget() {
    if (!document.body) return;

    injectStyles();

    if (!isCollectionPage()) {
      const existing = document.getElementById(UI.id);
      if (existing) existing.remove();

      document.querySelectorAll(`.${UI.rowClass}`).forEach(el => {
        el.classList.remove(UI.rowClass);
      });

      return;
    }

    if (document.getElementById(UI.id)) return;

    const input = findCollectionSearchInput();
    const searchBox = findSearchBox(input);

    if (!searchBox) return;

    const row = searchBox.parentElement;

    if (!row) return;

    row.classList.add(UI.rowClass);

    const widget = createWidget();

    if (searchBox.nextSibling) {
      row.insertBefore(widget, searchBox.nextSibling);
    } else {
      row.appendChild(widget);
    }

    findTokenInStorage();

    if (state.token) {
      setStatus('Sesión detectada. Listo para exportar.', 'ok');
    } else {
      setStatus('Listo para exportar', 'idle');
    }
  }

  function debounce(fn, delay = 200) {
    let timer = null;

    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /************************************************************
   * SPA / INIT
   ************************************************************/

  function patchHistory() {
    if (window.__PKMN_EXPORT_HISTORY_PATCHED__) return;

    window.__PKMN_EXPORT_HISTORY_PATCHED__ = true;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(mountWidget, 350);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(mountWidget, 350);
      return result;
    };

    window.addEventListener('popstate', () => {
      setTimeout(mountWidget, 350);
    });
  }

  function initDom() {
    patchHistory();

    const observer = new MutationObserver(debounce(mountWidget, 250));

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    mountWidget();

    setInterval(mountWidget, 1500);
  }

  installInterceptors();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDom);
  } else {
    initDom();
  }

})();
