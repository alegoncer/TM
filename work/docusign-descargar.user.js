// ==UserScript==
// @name         DocuSign - COREMSA descarga simple combinada
// @namespace    https://github.com/alegoncer/TM
// @version      1.0.0
// @description  Descarga PDFs combinados de DocuSign de forma ligera y marca filas descargadas.
// @match        https://apps.docusign.com/*
// @match        https://*.docusign.com/*
// @match        https://*.docusign.net/*
// @include      https://apps.docusign.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/work/docusign-descargar.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/work/docusign-descargar.user.js


(function () {
  'use strict';

  const WAIT_MODAL_MS = 12000;
  const WAIT_AFTER_DOWNLOAD_MS = 6000;
  const WAIT_BETWEEN_DOWNLOADS_MS = 1000;

  const COLORS = {
    dark: '#050038',
    blue: '#3F53D9',
    yellow: '#FFD02F',
    pink: '#FF6575',
    green: '#58D382',
    light: '#F2F2F2',
    white: '#FFFFFF'
  };

  let running = false;
  let stopRequested = false;
  let processed = new Set();
  let downloaded = new Set();
  let count = 0;

  console.log('[COREMSA DocuSign Simple] Cargado:', location.href);

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function norm(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function setStatus(text) {
    const el = document.getElementById('coremsa-status');
    if (el) el.textContent = text;
    console.log('[COREMSA]', text);
  }

  function setCounter() {
    const el = document.getElementById('coremsa-counter');
    if (el) el.textContent = `Procesados: ${count}`;
  }

  function click(el) {
    if (!el) return false;

    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (e) {}

    try {
      el.click();
      return true;
    } catch (e) {
      console.warn('[COREMSA] No se pudo hacer click:', e);
      return false;
    }
  }

  function createTopBar() {
    if (document.getElementById('coremsa-topbar')) return;
    if (!document.body) return;

    const bar = document.createElement('div');
    bar.id = 'coremsa-topbar';

    bar.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 54px !important;
      z-index: 2147483647 !important;
      background: ${COLORS.dark} !important;
      border-bottom: 4px solid ${COLORS.yellow} !important;
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 8px 14px !important;
      box-sizing: border-box !important;
      font-family: Arial, sans-serif !important;
    `;

    bar.innerHTML = `
      <div style="
        color:${COLORS.yellow};
        font-weight:900;
        font-size:15px;
        white-space:nowrap;
      ">
        COREMSA · DocuSign
      </div>

      <button id="coremsa-start" type="button" style="
        background:${COLORS.blue};
        color:white;
        border:3px solid ${COLORS.yellow};
        border-radius:10px;
        padding:8px 14px;
        font-weight:900;
        cursor:pointer;
      ">
        Descargar combinados
      </button>

      <button id="coremsa-stop" type="button" style="
        background:${COLORS.pink};
        color:white;
        border:2px solid white;
        border-radius:10px;
        padding:8px 12px;
        font-weight:900;
        cursor:pointer;
      ">
        Parar
      </button>

      <div style="
        background:${COLORS.light};
        color:${COLORS.dark};
        border:2px solid ${COLORS.green};
        border-radius:10px;
        padding:5px 10px;
        min-width:260px;
        font-size:12px;
        font-weight:800;
      ">
        <div id="coremsa-status">Listo</div>
        <div id="coremsa-counter" style="font-weight:500;">Procesados: 0</div>
      </div>
    `;

    document.body.prepend(bar);
    document.body.style.setProperty('padding-top', '54px', 'important');

    document.getElementById('coremsa-start').addEventListener('click', run);
    document.getElementById('coremsa-stop').addEventListener('click', stop);
  }

  function getRow(button) {
    return (
      button.closest('tr[data-qa^="manage-envelopes-list.row."]') ||
      button.closest('[role="row"]') ||
      button.closest('tr') ||
      button.closest('li') ||
      button.closest('section') ||
      button.parentElement
    );
  }

  function getKey(button) {
    const dataQa = button.getAttribute('data-qa') || '';
    const match = dataQa.match(/manage-envelopes-list-row-([a-f0-9-]+)-actions-download_envelope/i);

    if (match) return match[1];

    const row = getRow(button);
    const rowQa = row?.getAttribute('data-qa') || '';
    const rowMatch = rowQa.match(/manage-envelopes-list\.row\.([a-f0-9-]+)/i);

    if (rowMatch) return rowMatch[1];

    return norm(row?.innerText || button.innerText || dataQa).slice(0, 300);
  }

  function getStudentName(button) {
    const row = getRow(button);
    const rowText = row?.innerText || row?.textContent || '';
    const match = rowText.match(/Para:\s*([^\n\r]+)/i);

    let name = match ? match[1].trim() : 'Alumno';

    if (name.includes(',')) {
      name = name.split(',')[0].trim();
    }

    return name || 'Alumno';
  }

  function markDownloaded(button) {
    const key = getKey(button);
    downloaded.add(key);

    button.dataset.coremsaDownloaded = '1';
    button.disabled = true;
    button.textContent = 'Descargado';

    button.style.setProperty('background', COLORS.green, 'important');
    button.style.setProperty('color', COLORS.dark, 'important');
    button.style.setProperty('border', `2px solid ${COLORS.dark}`, 'important');
    button.style.setProperty('font-weight', '900', 'important');
    button.style.setProperty('opacity', '1', 'important');
    button.style.setProperty('cursor', 'default', 'important');

    const row = getRow(button);
    if (row) {
      row.style.setProperty('background', 'rgba(88, 211, 130, 0.13)', 'important');
    }
  }

  function findDownloadButtons() {
    return [...document.querySelectorAll('button[data-qa*="actions-download_envelope"], button[aria-label^="Descargar"]')]
      .filter(visible)
      .filter(button => {
        if (button.closest('[role="dialog"], [aria-modal="true"], .modal, #ModalContainer')) return false;
        if (button.dataset.coremsaDownloaded === '1') return false;

        const key = getKey(button);
        if (!key) return false;
        if (processed.has(key)) return false;
        if (downloaded.has(key)) return false;

        return true;
      });
  }

  function findModal() {
    const exact =
      document.querySelector('#ModalContainer [role="dialog"][aria-label="Descargar archivos"]') ||
      document.querySelector('[data-dsui-modal="true"][aria-label="Descargar archivos"]');

    if (exact && visible(exact)) return exact;

    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal')]
      .filter(visible)
      .find(modal => {
        const text = norm(modal.innerText || modal.textContent);
        return text.includes('descargar archivos') || text.includes('combinar todos los archivos pdf');
      }) || null;
  }

  async function waitForModal() {
    const start = Date.now();

    while (Date.now() - start < WAIT_MODAL_MS) {
      const modal = findModal();
      if (modal) return modal;
      await sleep(250);
    }

    return null;
  }

  async function checkCombine(modal) {
    const input =
      modal.querySelector('input[data-qa="download-combined-label"]') ||
      modal.querySelector('#download-combined-label') ||
      document.querySelector('#ModalContainer input[data-qa="download-combined-label"]') ||
      document.querySelector('#download-combined-label');

    if (!input) {
      setStatus('Error: no encuentro el check de combinar');
      return false;
    }

    if (input.checked) return true;

    const label =
      modal.querySelector('label[for="download-combined-label"]') ||
      modal.querySelector('label[data-qa="download-combined-label-label"]');

    if (label) {
      label.click();
      await sleep(500);
      if (input.checked) return true;
    }

    input.click();
    await sleep(500);
    if (input.checked) return true;

    // Último recurso ligero para React.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
    if (descriptor?.set) {
      descriptor.set.call(input, true);
    } else {
      input.checked = true;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(300);

    return !!input.checked;
  }

  function findModalDownloadButton(modal) {
    return (
      modal.querySelector('button[data-qa="download-document-button"]') ||
      [...modal.querySelectorAll('button')]
        .filter(visible)
        .find(button => norm(button.innerText || button.textContent) === 'descargar')
    );
  }

  async function waitModalClosed(modal) {
    const start = Date.now();

    while (Date.now() - start < 12000) {
      if (!modal || !visible(modal)) return true;
      await sleep(250);
    }

    return false;
  }

  async function processOne(button, index) {
    const key = getKey(button);
    const student = getStudentName(button);

    processed.add(key);

    setStatus(`Abriendo ${index + 1}: ${student}`);

    if (!click(button)) {
      setStatus('Error: no se pudo pulsar Descargar');
      processed.delete(key);
      return false;
    }

    const modal = await waitForModal();

    if (!modal) {
      setStatus('Error: no apareció el modal');
      processed.delete(key);
      return false;
    }

    await sleep(500);

    setStatus(`Marcando combinar: ${student}`);

    const checked = await checkCombine(modal);

    if (!checked) {
      setStatus('Error: no se pudo marcar combinar');
      processed.delete(key);
      return false;
    }

    const downloadButton = findModalDownloadButton(modal);

    if (!downloadButton) {
      setStatus('Error: no encuentro botón Descargar');
      processed.delete(key);
      return false;
    }

    setStatus(`Descargando: ${student}`);

    // Click único. Evita doble descarga.
    downloadButton.click();

    await waitModalClosed(modal);
    await sleep(WAIT_AFTER_DOWNLOAD_MS);

    count++;
    setCounter();

    markDownloaded(button);

    return true;
  }

  async function run() {
    if (running) return;

    running = true;
    stopRequested = false;
    processed = new Set();
    count = 0;

    setStatus('Iniciando...');
    setCounter();

    const startButton = document.getElementById('coremsa-start');
    if (startButton) {
      startButton.textContent = 'Descargando...';
      startButton.style.background = COLORS.green;
      startButton.style.color = COLORS.dark;
    }

    try {
      let index = 0;

      while (!stopRequested) {
        const buttons = findDownloadButtons();

        if (!buttons.length) {
          setStatus('Finalizado');
          break;
        }

        const ok = await processOne(buttons[0], index);
        index++;

        if (!ok) break;

        await sleep(WAIT_BETWEEN_DOWNLOADS_MS);
      }

      if (stopRequested) {
        setStatus('Detenido manualmente');
      }
    } catch (error) {
      console.error('[COREMSA] Error general:', error);
      setStatus('Error general. Mira consola.');
    } finally {
      running = false;
      stopRequested = false;

      if (startButton) {
        startButton.textContent = 'Descargar combinados';
        startButton.style.background = COLORS.blue;
        startButton.style.color = COLORS.white;
      }
    }
  }

  function stop() {
    stopRequested = true;
    setStatus('Parando...');
  }

  function init() {
    createTopBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();