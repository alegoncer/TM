// ==UserScript==
// @name         InnoApp - Visor y ZIP de adjuntos
// @namespace    https://github.com/alegoncer/TM
// @version      1.1
// @description  Añade Ver documentos y Descargar ZIP en la línea de DATOS ADJUNTOS.
// @match        *://repositorio.iformalia.es/*
// @match        *://*.iformalia.es/*
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/inno-visor-adjuntos.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/inno-visor-adjuntos.js
// ==/UserScript==

(function () {
    'use strict';

    const APP = {
        toolbarId: 'tm-doczip-toolbar',
        modalId: 'tm-doczip-modal',
        styleId: 'tm-doczip-style',
        iframeId: 'Formulario',
        solicitudTitleId: 'Texto22'
    };

    const TYPE_EXT = {
        'application/pdf': '.pdf',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'text/plain': '.txt',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/zip': '.zip'
    };

    ready(() => {
        console.log('[TM Adjuntos] Cargado en:', location.href);

        if (isAdjuntosPage(window)) {
            installInAdjuntosDocument(document, window);
        }

        if (window.top === window) {
            observeParentIframe();
        }
    });

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function observeParentIframe() {
        const iframe = document.querySelector(`#${APP.iframeId}`);
        if (!iframe) return;

        const tryInstall = () => {
            const frameWindow = safeFrameWindow(iframe);
            if (!frameWindow || !isAdjuntosPage(frameWindow)) return;

            try {
                installInAdjuntosDocument(frameWindow.document, frameWindow);
            } catch (err) {
                console.warn('[TM Adjuntos] No se pudo instalar en iframe:', err);
            }
        };

        iframe.addEventListener('load', () => setTimeout(tryInstall, 250));
        setTimeout(tryInstall, 500);
        setTimeout(tryInstall, 1500);
    }

    function isAdjuntosPage(win) {
        try {
            return /FormularioAdjuntos\.aspx/i.test(String(win.location.href));
        } catch (_) {
            return false;
        }
    }

    function safeFrameWindow(iframe) {
        try {
            return iframe.contentWindow || null;
        } catch (_) {
            return null;
        }
    }

    function installInAdjuntosDocument(targetDocument, sourceWindow) {
        if (!targetDocument || !targetDocument.body) return;
        if (!isAdjuntosPage(sourceWindow)) return;
        if (targetDocument.getElementById(APP.toolbarId)) return;

        injectCss(targetDocument);

        const header = findDatosAdjuntosHeader(targetDocument);
        if (!header) {
            console.warn('[TM Adjuntos] No encuentro el título DATOS ADJUNTOS.');
            return;
        }

        makeHeaderInline(header);

        const toolbar = targetDocument.createElement('span');
        toolbar.id = APP.toolbarId;
        toolbar.innerHTML = `
            <button type="button" class="tm-doczip-btn" data-action="viewer">Ver documentos</button>
            <button type="button" class="tm-doczip-btn tm-doczip-primary" data-action="zip">Descargar ZIP</button>
        `;

        header.appendChild(toolbar);

        toolbar.querySelector('[data-action="viewer"]').addEventListener('click', async (ev) => {
            await withBusy(ev.currentTarget, 'Cargando...', async () => {
                const docs = collectDocuments(targetDocument, sourceWindow);
                if (!docs.length) {
                    alert('No he encontrado documentos descargables en Adjuntos.');
                    return;
                }

                openViewerModal(docs);
            });
        });

        toolbar.querySelector('[data-action="zip"]').addEventListener('click', async (ev) => {
            await withBusy(ev.currentTarget, 'Comprimiendo...', async () => {
                const docs = collectDocuments(targetDocument, sourceWindow);
                if (!docs.length) {
                    alert('No he encontrado documentos descargables en Adjuntos.');
                    return;
                }

                await downloadZip(docs);
            });
        });
    }

    function findDatosAdjuntosHeader(doc) {
        const all = Array.from(doc.querySelectorAll('td, div, span, font, b, strong, legend, label'));

        return all.find(el => {
            const txt = cleanText(el.textContent);
            return /^DATOS ADJUNTOS$/i.test(txt);
        }) || all.find(el => /DATOS ADJUNTOS/i.test(cleanText(el.textContent)));
    }

    function makeHeaderInline(header) {
        const row = header.closest('tr');
        const cell = header.closest('td, div') || header;

        if (row) {
            const cells = Array.from(row.cells || []);
            const targetCell = cells.find(td => td.contains(header)) || cell;
            targetCell.classList.add('tm-doczip-header-cell');
            return;
        }

        cell.classList.add('tm-doczip-header-cell');
    }

    function collectDocuments(targetDocument, sourceWindow) {
        const controls = Array.from(targetDocument.querySelectorAll(
            'a, button, input[type="button"], input[type="submit"], input[type="image"], img[onclick], [onclick]'
        ));

        const docs = [];
        const seen = new Set();

        for (const rawControl of controls) {
            const control = normalizeClickable(rawControl);
            if (!control || control.closest(`#${APP.toolbarId}, #${APP.modalId}`)) continue;

            const action = getAction(control, sourceWindow);
            if (!action) continue;
            if (!isDocumentControl(control, action)) continue;

            const category = getCategoryName(control) || `Documento ${docs.length + 1}`;
            const key = `${action.type}|${action.url || ''}|${action.target || ''}|${action.name || ''}|${category}`;

            if (seen.has(key)) continue;
            seen.add(key);

            docs.push({
                control,
                sourceWindow,
                action,
                category: sanitizeDisplayName(category)
            });
        }

        console.log('[TM Adjuntos] Documentos detectados:', docs.map(d => d.category));
        return docs;
    }

    function normalizeClickable(el) {
        if (!el || !el.closest) return el;
        return el.closest('a, button, input, [onclick]') || el;
    }

    function getAction(control, sourceWindow) {
        const href = control.tagName === 'A' ? control.getAttribute('href') || '' : '';
        const onclick = control.getAttribute('onclick') || '';
        const combined = `${href}\n${onclick}`;

        const postback = parsePostBack(combined);
        if (postback) {
            return {
                type: 'postback',
                target: postback.target,
                argument: postback.argument
            };
        }

        if (href && !/^\s*(javascript:|#|void)/i.test(href)) {
            return {
                type: 'url',
                url: new sourceWindow.URL(href, sourceWindow.location.href).href
            };
        }

        const tag = control.tagName;
        const type = String(control.getAttribute('type') || '').toLowerCase();
        const name = control.getAttribute('name') || control.id || '';

        if ((tag === 'INPUT' || tag === 'BUTTON') && name) {
            return {
                type: type === 'image' ? 'image-submit' : 'submit',
                name,
                value: control.getAttribute('value') || control.textContent || ''
            };
        }

        return null;
    }

    function parsePostBack(text) {
        const direct = text.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
        if (direct) return { target: direct[1], argument: direct[2] || '' };

        const options = text.match(/WebForm_DoPostBackWithOptions\(\s*new\s+WebForm_PostBackOptions\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/i);
        if (options) return { target: options[1], argument: options[2] || '' };

        return null;
    }

    function isDocumentControl(control, action) {
        const meta = [
            control.textContent || '',
            control.getAttribute('title') || '',
            control.getAttribute('alt') || '',
            control.getAttribute('aria-label') || '',
            control.getAttribute('href') || '',
            control.getAttribute('onclick') || '',
            control.id || '',
            control.getAttribute('name') || '',
            control.className || '',
            control.src || ''
        ].join(' ');

        if (/subir|adjuntar|añadir|agregar|guardar|enviar|eliminar|borrar|quitar|cancelar|volver|buscar|examinar/i.test(meta)) {
            return false;
        }

        if (action.type === 'url') {
            if (/\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|zip|txt)(?:[?#]|$)/i.test(action.url)) return true;
            if (/descarg|download|document|adjunt|archivo|fichero|file|getfile|verarchivo/i.test(action.url)) return true;
        }

        return /descarg|download|bajar|abrir|visualiz|ver\b|documento|archivo|fichero|pdf/i.test(meta);
    }

    function getCategoryName(control) {
        const row = control.closest('tr');

        if (row) {
            const categoryFromRow = extractCategoryFromRow(row, control);
            if (categoryFromRow) return categoryFromRow;
        }

        const parent = control.closest('td, div, li, fieldset');
        if (parent) {
            const categoryFromParent = extractCategoryFromText(textWithoutControls(parent));
            if (categoryFromParent) return categoryFromParent;
        }

        return '';
    }

    function extractCategoryFromRow(row, control) {
        const rowText = getRowTextKeepingLabels(row);
        const fromFullRow = extractCategoryFromText(rowText);

        if (fromFullRow) return fromFullRow;

        const cells = Array.from(row.cells || []);
        const idx = cells.findIndex(cell => cell.contains(control));

        const candidates = [];

        if (idx > -1) {
            for (let i = 0; i < idx; i++) {
                candidates.push(textWithoutControls(cells[i]));
            }
        }

        cells.forEach(cell => {
            if (!cell.contains(control)) candidates.push(textWithoutControls(cell));
        });

        for (const candidate of candidates) {
            const cleaned = extractCategoryFromText(candidate);
            if (cleaned) return cleaned;
        }

        return '';
    }

    function getRowTextKeepingLabels(row) {
        const clone = row.cloneNode(true);

        clone.querySelectorAll(`#${APP.toolbarId}, script, style`).forEach(el => el.remove());

        clone.querySelectorAll('input[type="file"]').forEach(el => {
            el.replaceWith(' Examinar... ');
        });

        clone.querySelectorAll('input, select, button, textarea').forEach(el => {
            const value = el.getAttribute('value') || el.textContent || '';
            el.replaceWith(` ${value} `);
        });

        clone.querySelectorAll('img').forEach(el => {
            const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
            el.replaceWith(` ${alt} `);
        });

        return clone.textContent || '';
    }

    function extractCategoryFromText(text) {
        let t = cleanText(text);

        t = t.replace(/^»+\s*/g, '');
        t = t.replace(/^>+\s*/g, '');

        t = t.split(/\bExaminar\b/i)[0];
        t = t.split(/\bFecha\s*:/i)[0];
        t = t.split(/\bNo\.{0,4}\b/i)[0];
        t = t.split(/\bFalta\s+Adjunto\b/i)[0];
        t = t.split(/\bOK\b/i)[0];

        t = cleanText(t);
        t = t.replace(/^[-–—:;,.\s»>]+|[-–—:;,.\s]+$/g, '');

        t = t.replace(/\b(descargar|download|bajar|ver|visualizar|abrir|documento|archivo|fichero|fecha)\b/gi, ' ');
        t = t.replace(/\b[\wÁÉÍÓÚÜÑáéíóúüñ()\-.\s]+\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|zip|txt)\b/gi, ' ');
        t = cleanText(t);

        if (t.length < 2 || t.length > 100) return '';
        if (/^(si|no|true|false|ver|abrir|descargar|documento|archivo|fichero|fecha|ok)$/i.test(t)) return '';

        return t;
    }

    function textWithoutControls(node) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll('script, style, button, input, select, textarea, img, a').forEach(el => el.remove());
        return clone.textContent || '';
    }

    async function fetchDocument(doc) {
        const { action, sourceWindow } = doc;
        const fetcher = (sourceWindow.fetch || window.fetch).bind(sourceWindow);
        let response;

        if (action.type === 'url') {
            response = await fetcher(action.url, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            });
        } else {
            response = await fetchPostBackDocument(doc);
        }

        if (!response || !response.ok) {
            throw new Error(`No se pudo descargar "${doc.category}".`);
        }

        let blob = await response.blob();

        const headerName = filenameFromContentDisposition(response.headers.get('content-disposition') || '');
        const urlName = filenameFromUrl(action.url || '');
        const sourceName = headerName || urlName || doc.category;
        const contentType = response.headers.get('content-type') || blob.type || '';

        const normalized = await normalizeDownloadedFile(blob, sourceName, contentType);

        return {
            blob: normalized.blob,
            sourceName,
            extension: normalized.extension,
            mime: normalized.mime
        };
    }

    async function normalizeDownloadedFile(blob, sourceName, contentType) {
        const signature = await readBlobSignature(blob);
        const originalType = String(contentType || blob.type || '').split(';')[0].toLowerCase();
        const lowerName = String(sourceName || '').toLowerCase();

        let mime = originalType;
        let extension = guessExtension(sourceName, mime);

        if (signature.startsWith('%PDF') || lowerName.endsWith('.pdf')) {
            mime = 'application/pdf';
            extension = '.pdf';
        } else if (signature.startsWith('\x89PNG')) {
            mime = 'image/png';
            extension = '.png';
        } else if (signature.startsWith('\xFF\xD8\xFF')) {
            mime = 'image/jpeg';
            extension = '.jpg';
        } else if (signature.startsWith('GIF8')) {
            mime = 'image/gif';
            extension = '.gif';
        } else if (signature.startsWith('PK')) {
            if (lowerName.endsWith('.docx')) {
                mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                extension = '.docx';
            } else if (lowerName.endsWith('.xlsx')) {
                mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                extension = '.xlsx';
            } else {
                mime = mime || 'application/zip';
                extension = extension || '.zip';
            }
        }

        if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
            mime = mimeFromExtension(extension) || 'application/octet-stream';
        }

        if (!extension || extension === '.bin') {
            extension = guessExtension(sourceName, mime);
        }

        if (blob.type !== mime) {
            blob = new Blob([blob], { type: mime });
        }

        return {
            blob,
            mime,
            extension
        };
    }

    async function readBlobSignature(blob) {
        const slice = blob.slice(0, 16);
        const buffer = await slice.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        return Array.from(bytes)
            .map(b => String.fromCharCode(b))
            .join('');
    }

    async function fetchPostBackDocument(doc) {
        const { action, sourceWindow, control } = doc;
        const form = control.closest('form') || sourceWindow.document.forms[0];

        if (!form) {
            throw new Error(`No encuentro el formulario para "${doc.category}".`);
        }

        const fetcher = (sourceWindow.fetch || window.fetch).bind(sourceWindow);
        const formData = new sourceWindow.FormData(form);
        const actionUrl = new sourceWindow.URL(form.getAttribute('action') || sourceWindow.location.href, sourceWindow.location.href).href;
        const method = String(form.getAttribute('method') || 'POST').toUpperCase();

        if (action.type === 'postback') {
            formData.set('__EVENTTARGET', action.target || '');
            formData.set('__EVENTARGUMENT', action.argument || '');
        } else if (action.type === 'image-submit') {
            formData.set(`${action.name}.x`, '1');
            formData.set(`${action.name}.y`, '1');
        } else if (action.type === 'submit') {
            formData.set(action.name, action.value || '');
        }

        return await fetcher(actionUrl, {
            method,
            body: formData,
            credentials: 'include',
            cache: 'no-store'
        });
    }

    async function openViewerModal(docs) {
        const rootWindow = getRootWindow();
        const rootDocument = rootWindow.document;

        injectCss(rootDocument);

        const old = rootDocument.getElementById(APP.modalId);
        if (old) old.remove();

        let activeUrl = null;

        const modal = rootDocument.createElement('div');
        modal.id = APP.modalId;
        modal.innerHTML = `
            <div class="tm-doczip-card">
                <div class="tm-doczip-modal-header">
                    <div>
                        <strong>Visor de documentos</strong>
                        <span>${escapeHtml(getSolicitudName())}</span>
                    </div>
                    <button type="button" class="tm-doczip-close">×</button>
                </div>
                <div class="tm-doczip-body">
                    <div class="tm-doczip-list"></div>
                    <div class="tm-doczip-preview">Selecciona un documento.</div>
                </div>
            </div>
        `;

        rootDocument.body.appendChild(modal);

        const list = modal.querySelector('.tm-doczip-list');
        const preview = modal.querySelector('.tm-doczip-preview');

        const close = () => {
            if (activeUrl) rootWindow.URL.revokeObjectURL(activeUrl);
            modal.remove();
        };

        modal.querySelector('.tm-doczip-close').onclick = close;
        modal.addEventListener('click', ev => {
            if (ev.target === modal) close();
        });

        docs.forEach((doc, index) => {
            const btn = rootDocument.createElement('button');
            btn.type = 'button';
            btn.className = 'tm-doczip-item';
            btn.textContent = doc.category;
            btn.onclick = () => render(index);
            list.appendChild(btn);
        });

        async function render(index) {
            const doc = docs[index];

            list.querySelectorAll('.tm-doczip-item').forEach((btn, i) => {
                btn.classList.toggle('active', i === index);
            });

            preview.innerHTML = `<div class="tm-doczip-status">Cargando ${escapeHtml(doc.category)}...</div>`;

            try {
                const file = await fetchDocument(doc);

                if (activeUrl) rootWindow.URL.revokeObjectURL(activeUrl);
                activeUrl = rootWindow.URL.createObjectURL(file.blob);

                const fileName = buildFileName(doc, file, new Set());
                const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(fileName);
                const isImage = /^image\//i.test(file.mime) || /\.(jpe?g|png|gif|webp)$/i.test(fileName);
                const isText = /^text\//i.test(file.mime) || /\.(txt|csv)$/i.test(fileName);

                if (isPdf) {
                    preview.innerHTML = `
                        <object class="tm-doczip-frame" data="${activeUrl}#toolbar=1&navpanes=0" type="application/pdf">
                            <iframe class="tm-doczip-frame" src="${activeUrl}#toolbar=1&navpanes=0"></iframe>
                        </object>
                    `;
                } else if (isImage) {
                    preview.innerHTML = `<div class="tm-doczip-imgwrap"><img src="${activeUrl}" alt=""></div>`;
                } else if (isText) {
                    const text = await file.blob.text();
                    preview.innerHTML = `<pre class="tm-doczip-text"></pre>`;
                    preview.querySelector('pre').textContent = text;
                } else {
                    preview.innerHTML = `
                        <div class="tm-doczip-status">
                            <strong>Este tipo de archivo no se puede previsualizar aquí.</strong>
                            <span>${escapeHtml(fileName)}</span>
                            <span>Tipo detectado: ${escapeHtml(file.mime || 'desconocido')}</span>
                        </div>
                    `;
                }
            } catch (err) {
                preview.innerHTML = `<div class="tm-doczip-error">${escapeHtml(err.message || String(err))}</div>`;
            }
        }

        render(0);
    }

    async function downloadZip(docs) {
        if (typeof JSZip === 'undefined') {
            alert('No se ha cargado JSZip. Revisa Tampermonkey o la conexión al CDN.');
            return;
        }

        const zip = new JSZip();
        const usedNames = new Set();
        const errors = [];

        for (const doc of docs) {
            try {
                const file = await fetchDocument(doc);
                zip.file(buildFileName(doc, file, usedNames), file.blob);
            } catch (err) {
                errors.push(`${doc.category}: ${err.message || String(err)}`);
            }
        }

        if (!Object.keys(zip.files).length) {
            alert('No se pudo añadir ningún documento al ZIP.');
            return;
        }

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE'
        });

        downloadBlob(zipBlob, `${sanitizeFileName(getSolicitudName(), 'Solicitudes')}.zip`);

        if (errors.length) {
            alert(`ZIP descargado, pero algunos documentos fallaron:\n\n${errors.join('\n')}`);
        }
    }

    function buildFileName(doc, file, usedNames) {
        let base = sanitizeFileName(doc.category || stripExtension(file.sourceName), 'Documento');
        let ext = file.extension || guessExtension(file.sourceName, file.mime) || '.bin';

        if (!ext.startsWith('.')) ext = `.${ext}`;

        if (new RegExp(`${escapeRegex(ext)}$`, 'i').test(base)) {
            ext = '';
        }

        let candidate = `${base}${ext}`;
        let n = 2;

        while (usedNames.has(candidate.toLowerCase())) {
            candidate = `${base} (${n})${ext}`;
            n++;
        }

        usedNames.add(candidate.toLowerCase());
        return candidate;
    }

    function getRootWindow() {
        try {
            if (window.top && window.top.document) return window.top;
        } catch (_) {}
        return window;
    }

    function getSolicitudName() {
        const rootWindow = getRootWindow();
        const rootDocument = rootWindow.document;

        const title = cleanText(rootDocument.querySelector(`#${APP.solicitudTitleId}`)?.textContent || '');
        if (title) return title;

        const pageText = cleanText(rootDocument.body?.innerText || '');
        const found = pageText.match(/\(\d+\)\s*-\s*Solicitudes\s+[^\n\r]+/i);
        if (found) return cleanText(found[0]);

        const id = new URLSearchParams(rootWindow.location.search).get('Id');
        return id ? `(${id}) - Solicitudes` : 'Solicitudes';
    }

    function filenameFromContentDisposition(header) {
        if (!header) return '';

        const star = header.match(/filename\*\s*=\s*([^;]+)/i);
        if (star) {
            let value = star[1].trim().replace(/^UTF-8''/i, '').replace(/^['"]|['"]$/g, '');
            try {
                return decodeURIComponent(value);
            } catch (_) {
                return value;
            }
        }

        const normal = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
        return normal ? cleanText(normal[1] || normal[2] || '') : '';
    }

    function filenameFromUrl(url) {
        if (!url) return '';

        try {
            const u = new URL(url, location.href);
            const last = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
            return last && last.includes('.') ? last : '';
        } catch (_) {
            return '';
        }
    }

    function guessExtension(fileName, mime) {
        const fromName = String(fileName || '').match(/\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|zip|txt|csv)$/i);
        if (fromName) return `.${fromName[1].toLowerCase().replace('jpeg', 'jpg')}`;

        const cleanMime = String(mime || '').split(';')[0].toLowerCase();
        return TYPE_EXT[cleanMime] || '.bin';
    }

    function mimeFromExtension(ext) {
        ext = String(ext || '').toLowerCase();

        if (ext === '.pdf') return 'application/pdf';
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        if (ext === '.png') return 'image/png';
        if (ext === '.gif') return 'image/gif';
        if (ext === '.webp') return 'image/webp';
        if (ext === '.txt') return 'text/plain';
        if (ext === '.doc') return 'application/msword';
        if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (ext === '.xls') return 'application/vnd.ms-excel';
        if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (ext === '.zip') return 'application/zip';

        return '';
    }

    function stripExtension(name) {
        return String(name || '').replace(/\.(pdf|jpe?g|png|gif|webp|docx?|xlsx?|zip|txt|csv|bin)$/i, '');
    }

    function sanitizeDisplayName(name) {
        return cleanText(name)
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function sanitizeFileName(name, fallback) {
        const safe = sanitizeDisplayName(name || fallback || 'Documento').replace(/[.\s]+$/g, '');
        return safe || fallback || 'Documento';
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function downloadBlob(blob, filename) {
        const rootWindow = getRootWindow();
        const rootDocument = rootWindow.document;
        const url = rootWindow.URL.createObjectURL(blob);
        const a = rootDocument.createElement('a');

        a.href = url;
        a.download = filename;
        rootDocument.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => rootWindow.URL.revokeObjectURL(url), 1500);
    }

    async function withBusy(button, text, fn) {
        const old = button.textContent;
        button.disabled = true;
        button.textContent = text;

        try {
            await fn();
        } catch (err) {
            console.error('[TM Adjuntos]', err);
            alert(err.message || String(err));
        } finally {
            button.disabled = false;
            button.textContent = old;
        }
    }

    function escapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"]/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        }[ch]));
    }

    function injectCss(targetDocument) {
        if (!targetDocument || targetDocument.getElementById(APP.styleId)) return;

        const style = targetDocument.createElement('style');
        style.id = APP.styleId;
        style.textContent = `
            .tm-doczip-header-cell {
                position: relative !important;
                white-space: nowrap !important;
            }

            #${APP.toolbarId} {
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin-left: 16px !important;
                vertical-align: middle !important;
                font-family: Arial, Helvetica, sans-serif !important;
            }

            .tm-doczip-btn {
                border: 1px solid #ccd3dd !important;
                border-radius: 7px !important;
                padding: 6px 10px !important;
                background: #ffffff !important;
                color: #263238 !important;
                font: 700 12px Arial, Helvetica, sans-serif !important;
                cursor: pointer !important;
                box-shadow: none !important;
            }

            .tm-doczip-btn:hover {
                filter: brightness(.96) !important;
            }

            .tm-doczip-btn:disabled {
                opacity: .6 !important;
                cursor: wait !important;
            }

            .tm-doczip-primary {
                border-color: #2d6cdf !important;
                background: #2d6cdf !important;
                color: #ffffff !important;
            }

            #${APP.modalId} {
                position: fixed !important;
                inset: 0 !important;
                z-index: 2147483646 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: rgba(15, 23, 42, .55) !important;
                font-family: Arial, Helvetica, sans-serif !important;
            }

            .tm-doczip-card {
                width: min(1180px, calc(100vw - 36px)) !important;
                height: min(780px, calc(100vh - 36px)) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                border-radius: 12px !important;
                background: #ffffff !important;
                box-shadow: 0 20px 50px rgba(0,0,0,.35) !important;
            }

            .tm-doczip-modal-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                gap: 12px !important;
                padding: 12px 16px !important;
                background: #1f2937 !important;
                color: #ffffff !important;
            }

            .tm-doczip-modal-header div {
                display: flex !important;
                flex-direction: column !important;
                gap: 2px !important;
            }

            .tm-doczip-modal-header strong {
                font-size: 15px !important;
            }

            .tm-doczip-modal-header span {
                font-size: 12px !important;
                opacity: .8 !important;
            }

            .tm-doczip-close {
                width: 32px !important;
                height: 32px !important;
                border: 0 !important;
                border-radius: 50% !important;
                background: rgba(255,255,255,.16) !important;
                color: #ffffff !important;
                font-size: 24px !important;
                line-height: 28px !important;
                cursor: pointer !important;
            }

            .tm-doczip-body {
                flex: 1 !important;
                min-height: 0 !important;
                display: grid !important;
                grid-template-columns: 285px minmax(0, 1fr) !important;
                background: #f3f5f8 !important;
            }

            .tm-doczip-list {
                overflow: auto !important;
                padding: 10px !important;
                border-right: 1px solid #d8dee8 !important;
                background: #ffffff !important;
            }

            .tm-doczip-item {
                width: 100% !important;
                display: block !important;
                margin-bottom: 7px !important;
                padding: 9px 10px !important;
                border: 1px solid #e1e6ef !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                color: #111827 !important;
                font: 700 12px Arial, Helvetica, sans-serif !important;
                text-align: left !important;
                cursor: pointer !important;
            }

            .tm-doczip-item:hover,
            .tm-doczip-item.active {
                border-color: #2d6cdf !important;
                background: #eef4ff !important;
            }

            .tm-doczip-preview {
                min-width: 0 !important;
                min-height: 0 !important;
                padding: 12px !important;
                overflow: hidden !important;
            }

            .tm-doczip-frame {
                width: 100% !important;
                height: 100% !important;
                border: 1px solid #cfd7e3 !important;
                border-radius: 8px !important;
                background: #ffffff !important;
            }

            .tm-doczip-imgwrap {
                width: 100% !important;
                height: 100% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: auto !important;
                border: 1px solid #cfd7e3 !important;
                border-radius: 8px !important;
                background: #1f2937 !important;
            }

            .tm-doczip-imgwrap img {
                max-width: 100% !important;
                max-height: 100% !important;
                object-fit: contain !important;
            }

            .tm-doczip-text {
                width: 100% !important;
                height: 100% !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 12px !important;
                overflow: auto !important;
                border: 1px solid #cfd7e3 !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                white-space: pre-wrap !important;
            }

            .tm-doczip-status,
            .tm-doczip-error {
                width: 100% !important;
                height: 100% !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 10px !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 18px !important;
                border: 1px dashed #cfd7e3 !important;
                border-radius: 8px !important;
                background: #ffffff !important;
                color: #4b5563 !important;
                font-size: 13px !important;
                text-align: center !important;
            }

            .tm-doczip-error {
                color: #b91c1c !important;
                background: #fff7f7 !important;
            }
        `;

        targetDocument.head.appendChild(style);
    }
})();
