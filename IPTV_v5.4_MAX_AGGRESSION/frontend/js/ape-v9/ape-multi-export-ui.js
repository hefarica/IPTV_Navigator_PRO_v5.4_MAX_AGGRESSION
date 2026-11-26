/**
 * APE MULTI-EXPORT UI v1.0
 *
 * Conecta APEMultiParser con la interfaz de IPTV Navigator:
 *   - Exporta la vista actual de canales a un ZIP con todos los dialectos.
 *   - Permite elegir un archivo .m3u/.m3u8 y multiparsearlo a ZIP.
 *   - No modifica el estado de la app ni la lista original.
 *
 * API:
 *   window.APEMultiExport.exportCurrentView()
 *   window.APEMultiExport.pickAndExport()
 *   window.APEMultiExport.exportText(text, filename)
 *   window.APEMultiExport.buildBundleFromChannels(channels)
 *   window.APEMultiExport.buildBundleFromText(text, filename)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const VERSION = '1.0.0';

    function MP() {
        return global.APEMultiParser || null;
    }

    function app() {
        return global.app || null;
    }

    function getChannels() {
        const a = app();
        const st = a && a.state;
        if (!st) return [];
        return st.filteredChannels || st.channels || st.channelsMaster || [];
    }

    function setStatus(msg) {
        const el = global.document && global.document.getElementById('apeMultiParserStatus');
        if (el) el.textContent = msg;
    }

    function toast(msg, type) {
        setStatus(msg);
        const a = app();
        if (a && typeof a.showToast === 'function') {
            try { a.showToast(msg, type || 'info'); return; } catch (e) { /* noop */ }
        }
        if (global.console && console.log) console.log('[APE-MULTI-EXPORT] ' + msg);
    }

    function stamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    function downloadBytes(filename, bytes, mime) {
        const blob = new Blob([bytes], { type: mime || 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = global.document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        global.document.body.appendChild(a);
        a.click();
        global.document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
        return { filename: filename, bytes: blob.size };
    }

    function buildBundleFromChannels(channels, opts) {
        const parser = MP();
        if (!parser) throw new Error('APEMultiParser no está cargado');
        const model = parser.modelFromChannels(channels || [], { sourceName: (opts && opts.sourceName) || 'app-view' });
        const bundle = parser.buildBundleZip(model, Object.assign({ includeSidecars: true }, opts || {}));
        return { model: model, bundle: bundle };
    }

    function buildBundleFromText(text, filename, opts) {
        const parser = MP();
        if (!parser) throw new Error('APEMultiParser no está cargado');
        const model = parser.parse(text, { sourceName: filename || 'input' });
        const bundle = parser.buildBundleZip(model, Object.assign({ includeSidecars: true }, opts || {}));
        return { model: model, bundle: bundle };
    }

    function summary(result, name) {
        const report = result && result.bundle ? result.bundle.report : null;
        const a = report && report.anomalies ? report.anomalies : {};
        let msg = 'ZIP generado: ' + name +
            ' · ' + result.model.channels.length + ' canales' +
            ' · ' + result.bundle.dialects.length + ' dialectos';
        if (a.c2aCount) msg += ' · c2.a en ' + a.c2aCount + ' línea(s)';
        if (a.http403Count) msg += ' · 403 en ' + a.http403Count + ' línea(s)';
        return msg;
    }

    function exportCurrentView(opts) {
        const channels = getChannels();
        if (!channels.length) {
            toast('No hay canales en la vista actual. Abre una lista o usa “Multiparsear archivo”.', 'warn');
            return null;
        }

        try {
            const result = buildBundleFromChannels(channels, opts);
            const name = 'APE_MULTIPLAYER_' + stamp() + '.zip';
            const shouldDownload = !opts || opts.download !== false;
            const info = shouldDownload
                ? downloadBytes(name, result.bundle.zip, 'application/zip')
                : { filename: name, bytes: result.bundle.zip.length };
            toast(summary(result, name), 'success');
            return {
                filename: name,
                bytes: info.bytes,
                channels: channels.length,
                dialects: result.bundle.dialects.length,
                report: result.bundle.report
            };
        } catch (e) {
            console.error('[APE-MULTI-EXPORT] exportCurrentView', e);
            toast('No se pudo generar el ZIP: ' + e.message, 'error');
            return null;
        }
    }

    function pickAndExport(opts) {
        const input = global.document.createElement('input');
        input.type = 'file';
        input.accept = '.m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain';
        input.style.display = 'none';

        input.addEventListener('change', function () {
            const file = input.files && input.files[0];
            if (!file) return;

            const done = function (text) {
                try {
                    const result = buildBundleFromText(text, file.name, opts);
                    const base = file.name.replace(/\.[^.]+$/, '');
                    const name = 'APE_MULTIPLAYER_' + base + '_' + stamp() + '.zip';
                    const info = downloadBytes(name, result.bundle.zip, 'application/zip');
                    toast(summary(result, name), 'success');
                } catch (e) {
                    console.error('[APE-MULTI-EXPORT] pickAndExport', e);
                    toast('No se pudo multiparsear el archivo: ' + e.message, 'error');
                } finally {
                    if (input.parentNode) input.parentNode.removeChild(input);
                }
            };

            if (typeof file.text === 'function') {
                file.text().then(done).catch(function (e) {
                    toast('No se pudo leer el archivo: ' + e.message, 'error');
                    if (input.parentNode) input.parentNode.removeChild(input);
                });
            } else {
                const reader = new FileReader();
                reader.onload = function () { done(String(reader.result || '')); };
                reader.onerror = function () {
                    toast('No se pudo leer el archivo', 'error');
                    if (input.parentNode) input.parentNode.removeChild(input);
                };
                reader.readAsText(file, 'utf-8');
            }
        });

        global.document.body.appendChild(input);
        input.click();
        return true;
    }

    function exportText(text, filename, opts) {
        try {
            const result = buildBundleFromText(text, filename || 'input.m3u8', opts);
            const base = String(filename || 'input').replace(/\.[^.]+$/, '');
            const name = 'APE_MULTIPLAYER_' + base + '_' + stamp() + '.zip';
            const info = downloadBytes(name, result.bundle.zip, 'application/zip');
            toast('ZIP generado: ' + name + ' · ' + result.model.channels.length + ' canales', 'success');
            return { filename: name, bytes: info.bytes, channels: result.model.channels.length };
        } catch (e) {
            console.error('[APE-MULTI-EXPORT] exportText', e);
            toast('No se pudo multiparsear el texto: ' + e.message, 'error');
            return null;
        }
    }

    function install() {
        const a = app();
        if (a) {
            a.exportAllPlayerDialects = exportCurrentView;
            a.multiParseAndExport = pickAndExport;
            return true;
        }
        return false;
    }

    global.APEMultiExport = {
        VERSION: VERSION,
        exportCurrentView: exportCurrentView,
        pickAndExport: pickAndExport,
        exportText: exportText,
        buildBundleFromChannels: buildBundleFromChannels,
        buildBundleFromText: buildBundleFromText,
        install: install,
        getChannels: getChannels
    };

    let attempts = 0;
    const timer = setInterval(function () {
        attempts++;
        if (install() || attempts >= 120) clearInterval(timer);
    }, 250);

    if (global.console && console.log) {
        console.log('%c🧬 APE MultiExport v' + VERSION + ' cargado', 'color:#8b5cf6;font-weight:bold;');
    }

})(typeof window !== 'undefined' ? window : globalThis);
