/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APE LINE TRANSFORM v2.0 — transformación de playlist línea a línea,
 * BYTE-EXACTA (preserva CRLF/LF) y AGRUPADA EN LOTES
 * ═══════════════════════════════════════════════════════════════════════════
 * v1.0 emitía un chunk por línea. Con la lista real (1.118 GB · 3.291.400
 * líneas) eso son 3,29 MILLONES de `write()` al FileSystemWritableFileStream
 * y 3,29 M de TextEncoder.encode → el hilo principal se satura y la página
 * parece CONGELADA. Verificado por el reporte del propietario.
 *
 * v2.0 acumula la salida en un String y lo codifica en lotes de ~256 KB:
 *   · 3,29 M líneas → ~4.000 chunks (≈800× menos operaciones)
 *   · mismo resultado byte a byte (solo se reescriben líneas ^https?://)
 *   · informe de progreso cada `progressBytes` (por defecto 64 MB)
 *
 * API:
 *   apeLineTransform(fn, { block, chunkChars, progressBytes, onProgress, onDone })
 *
 * Sin dependencias: sirve en navegador y en Node (module.exports).
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
    'use strict';

    function apeLineTransform(fn, opts) {
        opts = opts || {};
        var block = typeof opts.block === 'string' ? opts.block : '';
        var injectBlock = block.length > 0;
        var MAX_CHARS = opts.chunkChars || 262144;             // ~256 KB de texto
        var PROGRESS = opts.progressBytes || (64 * 1024 * 1024); // 64 MB

        var dec = new TextDecoder();
        var enc = new TextEncoder();

        var pending = '';        // resto de línea sin '\n'
        var out = '';            // acumulador de salida (texto)
        var emitted = 0;         // bytes emitidos
        var nextLog = PROGRESS;
        var state = { injected: !injectBlock, lines: 0, urls: 0, changed: 0 };

        function emit(ctrl) {
            if (out === '') return;
            var u8 = enc.encode(out);
            out = '';
            emitted += u8.length;
            ctrl.enqueue(u8);
            if (emitted >= nextLog) {
                nextLog += PROGRESS;
                if (typeof opts.onProgress === 'function') opts.onProgress(emitted);
            }
        }

        function mapLine(raw) {
            // raw puede o no traer su terminador
            var hasNL = raw.charCodeAt(raw.length - 1) === 10;
            var nl = '';
            var body = raw;
            if (hasNL) {
                var hasCR = raw.length >= 2 && raw.charCodeAt(raw.length - 2) === 13;
                nl = hasCR ? '\r\n' : '\n';
                body = hasCR ? raw.slice(0, -2) : raw.slice(0, -1);
            }

            var pre = '';
            if (!state.injected && body.indexOf('#EXTINF') === 0) {
                pre = block;
                state.injected = true;
            }

            state.lines++;
            var res = body;
            if (/^https?:\/\//i.test(body)) {
                state.urls++;
                var t = fn(body);
                if (typeof t === 'string' && t !== body) { res = t; state.changed++; }
            }
            return pre + res + nl;
        }

        return new TransformStream({
            transform: function (chunk, ctrl) {
                pending += dec.decode(chunk, { stream: true });
                var start = 0, i;
                while ((i = pending.indexOf('\n', start)) >= 0) {
                    out += mapLine(pending.slice(start, i + 1));
                    start = i + 1;
                    if (out.length >= MAX_CHARS) emit(ctrl);
                }
                pending = pending.slice(start);
            },
            flush: function (ctrl) {
                if (pending.length) out += mapLine(pending);
                emit(ctrl);
                if (typeof opts.onDone === 'function') opts.onDone(state, emitted);
            }
        });
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { apeLineTransform: apeLineTransform };
    if (typeof window !== 'undefined') window.apeLineTransform = apeLineTransform;
})(typeof window !== 'undefined' ? window : globalThis);
