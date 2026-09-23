// ==UserScript==
// @name         Suno - Grabador de audio
// @namespace    https://github.com/alegoncer/TM
// @version      1.0.0
// @description  Añade botones para grabar el audio reproducido en Suno y guardarlo localmente.
// @author       Alejandro
// @match        https://suno.com/*
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/alegoncer/TM/main/other/suno-grabador-audio.user.js
// @downloadURL  https://raw.githubusercontent.com/alegoncer/TM/main/other/suno-grabador-audio.user.js
// @homepageURL  https://github.com/alegoncer/TM
// @supportURL   https://github.com/alegoncer/TM/issues
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    let recorder = null;
    let chunks = [];
    let currentMedia = null;
    let currentStream = null;
    let recording = false;

    // ============================================================
    // INTERFAZ
    // ============================================================

    const panel = document.createElement('div');
    panel.id = 'suno-recorder-panel';

    panel.innerHTML = `
        <div id="suno-recorder-status">
            <span id="suno-recorder-dot"></span>
            <span id="suno-recorder-text">Preparado</span>
        </div>

        <div id="suno-recorder-buttons">
            <button id="suno-recorder-start">
                ● Grabar
            </button>

            <button id="suno-recorder-stop" disabled>
                ■ Parar y guardar
            </button>
        </div>
    `;

    document.body.appendChild(panel);

    const style = document.createElement('style');

    style.textContent = `
        #suno-recorder-panel {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 999999;

            background: rgba(20, 20, 22, 0.96);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 14px;

            padding: 12px;

            box-shadow:
                0 8px 30px rgba(0,0,0,0.40);

            backdrop-filter: blur(12px);

            font-family:
                Inter,
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
        }

        #suno-recorder-status {
            display: flex;
            align-items: center;
            gap: 7px;

            margin-bottom: 9px;

            color: #aaa;
            font-size: 12px;
            font-weight: 500;
        }

        #suno-recorder-dot {
            width: 8px;
            height: 8px;

            border-radius: 50%;

            background: #777;
        }

        #suno-recorder-buttons {
            display: flex;
            gap: 7px;
        }

        #suno-recorder-panel button {
            border: none;
            border-radius: 9px;

            padding: 8px 12px;

            font-size: 12px;
            font-weight: 600;

            cursor: pointer;

            transition:
                transform .12s ease,
                opacity .12s ease,
                background .12s ease;
        }

        #suno-recorder-panel button:hover:not(:disabled) {
            transform: translateY(-1px);
        }

        #suno-recorder-panel button:active:not(:disabled) {
            transform: translateY(0);
        }

        #suno-recorder-start {
            background: #f4f4f5;
            color: #111;
        }

        #suno-recorder-stop {
            background: #e5484d;
            color: white;
        }

        #suno-recorder-panel button:disabled {
            opacity: .35;
            cursor: default;
        }

        #suno-recorder-panel.recording
        #suno-recorder-dot {
            background: #ff3b3b;

            box-shadow:
                0 0 0 4px rgba(255,59,59,.15);

            animation:
                sunoRecorderPulse 1.2s infinite;
        }

        #suno-recorder-panel.recording
        #suno-recorder-status {
            color: #fff;
        }

        @keyframes sunoRecorderPulse {

            0% {
                opacity: 1;
            }

            50% {
                opacity: .35;
            }

            100% {
                opacity: 1;
            }
        }
    `;

    document.head.appendChild(style);

    // ============================================================
    // ELEMENTOS
    // ============================================================

    const startButton =
        document.getElementById('suno-recorder-start');

    const stopButton =
        document.getElementById('suno-recorder-stop');

    const statusText =
        document.getElementById('suno-recorder-text');

    // ============================================================
    // LOCALIZAR REPRODUCTOR
    // ============================================================

    function findMedia() {

        const mediaElements =
            [...document.querySelectorAll('audio, video')];

        if (!mediaElements.length) {
            return null;
        }

        const playing =
            mediaElements.find(media =>
                !media.paused &&
                !media.ended
            );

        if (playing) {
            return playing;
        }

        const loaded =
            mediaElements.find(media =>
                media.currentSrc ||
                media.src
            );

        if (loaded) {
            return loaded;
        }

        return mediaElements[0];
    }

    // ============================================================
    // MIME TYPE
    // ============================================================

    function getBestMimeType() {

        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'video/webm;codecs=opus',
            'video/webm'
        ];

        for (const type of types) {

            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return '';
    }

    // ============================================================
    // NOMBRE DEL ARCHIVO
    // ============================================================

    function getFileName(extension) {

        let title =
            document.title || 'Suno';

        title = title
            .replace(/\\s*[|–—-]\\s*Suno.*$/i, '')
            .replace(/[<>:"/\\\\|?*]/g, '')
            .trim();

        if (!title) {
            title = 'Suno';
        }

        return `${title}.${extension}`;
    }

    // ============================================================
    // EXTENSIÓN
    // ============================================================

    function getExtension(mimeType) {

        if (mimeType.includes('ogg')) {
            return 'ogg';
        }

        return 'webm';
    }

    // ============================================================
    // ESTADO
    // ============================================================

    function setStatus(text, isRecording = false) {

        statusText.textContent = text;

        panel.classList.toggle(
            'recording',
            isRecording
        );
    }

    // ============================================================
    // EMPEZAR GRABACIÓN
    // ============================================================

    async function startRecording() {

        if (recording) {
            return;
        }

        currentMedia = findMedia();

        if (!currentMedia) {

            alert(
                'No encuentro el reproductor de Suno.\\n\\n' +
                'Pulsa Play en la canción y vuelve a intentarlo.'
            );

            return;
        }

        try {

            let stream;

            if (
                typeof currentMedia.captureStream === 'function'
            ) {

                stream =
                    currentMedia.captureStream();

            } else if (
                typeof currentMedia.mozCaptureStream === 'function'
            ) {

                stream =
                    currentMedia.mozCaptureStream();

            } else {

                alert(
                    'Este navegador no permite capturar directamente ' +
                    'el audio del reproductor.\\n\\n' +
                    'Prueba con Firefox, Chrome o Edge.'
                );

                return;
            }

            let audioTracks =
                stream.getAudioTracks();

            if (!audioTracks.length) {

                try {

                    await currentMedia.play();

                    await new Promise(resolve =>
                        setTimeout(resolve, 300)
                    );

                    audioTracks =
                        stream.getAudioTracks();

                } catch (error) {
                    // Continuamos para mostrar el error apropiado.
                }
            }

            if (!audioTracks.length) {

                alert(
                    'He encontrado el reproductor, pero no puedo ' +
                    'capturar su pista de audio.'
                );

                return;
            }

            currentStream =
                new MediaStream(audioTracks);

            const mimeType =
                getBestMimeType();

            if (mimeType) {

                recorder =
                    new MediaRecorder(
                        currentStream,
                        {
                            mimeType: mimeType,
                            audioBitsPerSecond: 192000
                        }
                    );

            } else {

                recorder =
                    new MediaRecorder(currentStream);
            }

            chunks = [];

            recorder.ondataavailable = event => {

                if (event.data && event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            recorder.onerror = event => {

                console.error(
                    '[Suno Recorder]',
                    event
                );

                setStatus(
                    'Error en la grabación'
                );
            };

            recorder.onstop = () => {

                saveRecording();

                recording = false;

                startButton.disabled = false;
                stopButton.disabled = true;

                panel.classList.remove(
                    'recording'
                );
            };

            recorder.start(1000);

            recording = true;

            startButton.disabled = true;
            stopButton.disabled = false;

            setStatus(
                'Grabando…',
                true
            );

            if (currentMedia.paused) {

                try {
                    await currentMedia.play();
                } catch (error) {

                    console.warn(
                        'No se pudo iniciar automáticamente ' +
                        'la reproducción.',
                        error
                    );
                }
            }

            currentMedia.addEventListener(
                'ended',
                autoStopRecording,
                {
                    once: true
                }
            );

            console.log(
                '🔴 Grabación iniciada'
            );

        } catch (error) {

            console.error(
                '[Suno Recorder]',
                error
            );

            alert(
                'No se pudo iniciar la grabación.\\n\\n' +
                error.message
            );

            resetRecorder();
        }
    }

    // ============================================================
    // PARAR
    // ============================================================

    function stopRecording() {

        if (
            !recorder ||
            recorder.state === 'inactive'
        ) {
            return;
        }

        setStatus(
            'Guardando…'
        );

        recorder.stop();

        if (currentStream) {

            currentStream
                .getTracks()
                .forEach(track =>
                    track.stop()
                );
        }

        console.log(
            '⏹ Grabación detenida'
        );
    }

    function autoStopRecording() {

        if (recording) {

            console.log(
                '🎵 La canción ha terminado.'
            );

            stopRecording();
        }
    }

    // ============================================================
    // GUARDAR
    // ============================================================

    function saveRecording() {

        if (!chunks.length) {

            setStatus(
                'No se grabó audio'
            );

            return;
        }

        const mimeType =
            recorder.mimeType ||
            'audio/webm';

        const blob =
            new Blob(
                chunks,
                {
                    type: mimeType
                }
            );

        const url =
            URL.createObjectURL(blob);

        const extension =
            getExtension(mimeType);

        const a =
            document.createElement('a');

        a.href = url;

        a.download =
            getFileName(extension);

        a.style.display =
            'none';

        document.body.appendChild(a);

        a.click();

        a.remove();

        setTimeout(
            () => {
                URL.revokeObjectURL(url);
            },
            10000
        );

        chunks = [];

        setStatus(
            'Guardado ✓'
        );

        setTimeout(
            () => {

                if (!recording) {
                    setStatus('Preparado');
                }

            },
            2500
        );
    }

    // ============================================================
    // RESET
    // ============================================================

    function resetRecorder() {

        recorder = null;
        currentMedia = null;

        if (currentStream) {

            currentStream
                .getTracks()
                .forEach(track =>
                    track.stop()
                );
        }

        currentStream = null;

        chunks = [];
        recording = false;

        startButton.disabled = false;
        stopButton.disabled = true;

        setStatus(
            'Preparado'
        );
    }

    // ============================================================
    // EVENTOS
    // ============================================================

    startButton.addEventListener(
        'click',
        startRecording
    );

    stopButton.addEventListener(
        'click',
        stopRecording
    );

})();
