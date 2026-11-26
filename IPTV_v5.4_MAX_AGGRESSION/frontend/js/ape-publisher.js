/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🚀 APE PUBLISHER v1.0 — Subida resumible + Placeholder Streaming
 * ═══════════════════════════════════════════════════════════════════════
 *
 * QUÉ HACE
 *   Sube una lista al VPS por chunks SHA-256 verificados y la publica con
 *   el patrón medido en producción:
 *
 *     <base>.m3u8      -> placeholder de 8 bytes ("#EXTM3U\n")
 *     <base>.m3u8.gz   -> payload REAL byte a byte (si el origen ya era .gz)
 *                         o comprimido una sola vez en el servidor
 *
 *   El edge sirve el .gz con gzip_static always; los clientes sin gzip
 *   reciben la descompresión streaming de nginx (gunzip on). Cero
 *   recompresión por request.
 *
 * POR QUÉ NO SE COMPRIME EN EL NAVEGADOR
 *   Si el archivo ya es .gz, recomprimir produce gzip-de-gzip (corrupto).
 *   Si es plano, lo comprime el servidor una vez con gzip -9. El cliente
 *   NUNCA altera el contenido: lo que subes es lo que se publica.
 *
 * GARANTÍAS
 *   - SHA-256 por chunk (lo verifica upload_chunk.php)
 *   - SHA-256 del fichero completo (lo calcula el servidor al ensamblar)
 *   - gzip -t completo + conteo real de canales en el servidor
 *   - reanudación: reusa upload_id y salta chunks ya recibidos
 *   - si el POST de publish se corta, verifica list_files.php antes de
 *     declarar fallo (nunca "falló" sin comprobar)
 *
 * USO
 *   await APEPublisher.publish(blobOrFile, {
 *     filename: 'APE_LISTA_..._CDN.m3u8.gz',
 *     shielded: true,
 *     strategy: 'replace',
 *     vps: 'https://iptv-ape.duckdns.org',
 *     onProgress: (p) => console.log(p.percent, p.message)
 *   });
 *
 *   await APEPublisher.probeGz(file) -> { declared, isM3U, magicOk }
 */

(function (root) {
    'use strict';

    const DEFAULT_VPS = 'https://iptv-ape.duckdns.org';
    const CHUNK_SIZE = 16 * 1024 * 1024;       // 16 MiB
    const CONCURRENCY = 4;
    const MAX_RETRIES = 5;
    const CHUNK_TIMEOUT_MS = 180000;
    const PUBLISH_TIMEOUT_MS = 15 * 60 * 1000;
    const SESSION_KEY = 'ape_publisher_session_v1';
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

    // ─────────────────────────────────────────────────────────────
    // UTILIDADES
    // ─────────────────────────────────────────────────────────────

    function canonicalVps(vps) {
        let base = '';
        try {
            base = vps || root.VPS_CONFIG?.DEFAULT_URL || root.localStorage?.getItem('vps_base_url') || '';
        } catch (_) { base = vps || ''; }
        base = String(base || '').trim().replace(/\/+$/, '');
        if (!base) return DEFAULT_VPS;
        if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
        try {
            const u = new URL(base);
            // Un VPS guardado como localhost es el panel local, nunca el edge real.
            if (['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)) return DEFAULT_VPS;
            return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''));
        } catch (_) {
            return DEFAULT_VPS;
        }
    }

    function sanitizeName(name) {
        return String(name || '')
            .replace(/[()]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9._-]/g, '')
            .replace(/_+/g, '_')
            .replace(/^[._-]+|[._-]+$/g, '');
    }

    function isGzName(name) {
        return /\.(m3u8|m3u)\.gz$/i.test(String(name || ''));
    }

    /**
     * Deja el nombre coherente con el CONTENIDO real (magia gzip), no con la
     * extensión declarada. Evita publicar un .gz con bytes planos o viceversa.
     */
    function normalizeFilename(name, contentIsGzip) {
        let n = sanitizeName(name);
        if (!n) n = 'APE_UPLOAD';
        n = n.replace(/\.gz$/i, '');
        if (!/\.(m3u8|m3u)$/i.test(n)) {
            n = n.replace(/\.(m3u8|m3u).*$/i, '');
            n += '.m3u8';
        }
        return contentIsGzip ? n + '.gz' : n;
    }

    function withShieldedSuffix(name) {
        if (/_SHIELDED\.(m3u8|m3u)(\.gz)?$/i.test(name)) return name;
        return name.replace(/(\.(m3u8|m3u))(\.gz)?$/i, '_SHIELDED$1$3');
    }

    function randomId() {
        const rnd = (root.crypto?.getRandomValues
            ? Array.from(root.crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('')
            : Math.random().toString(36).slice(2, 14));
        return `ape_${Date.now().toString(36)}_${rnd}`;
    }

    async function sha256Hex(buffer) {
        const digest = await root.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function readMagic(blob) {
        const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        return { gzip: head.length === 2 && head[0] === 0x1f && head[1] === 0x8b, hex: Array.from(head).map(b => b.toString(16).padStart(2, '0')).join('') };
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function loadSession() {
        try {
            const raw = root.localStorage?.getItem(SESSION_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.uploadId || !s.key || (Date.now() - (s.createdAt || 0)) > SESSION_TTL_MS) return null;
            return s;
        } catch (_) {
            return null;
        }
    }

    function saveSession(session) {
        try {
            root.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
        } catch (_) { /* modo privado / Node sin localStorage */ }
    }

    function clearSession() {
        try {
            root.localStorage?.removeItem(SESSION_KEY);
        } catch (_) { /* noop */ }
    }

    function fileKey(blob, filename) {
        return [filename, blob.size, blob.lastModified || 0].join('|');
    }

    // ─────────────────────────────────────────────────────────────
    // HTTP
    // ─────────────────────────────────────────────────────────────

    async function fetchJson(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
        try {
            const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
            const text = await res.text();
            let data = null;
            try { data = JSON.parse(text); } catch (_) { data = null; }
            return { ok: res.ok, status: res.status, data, text };
        } finally {
            clearTimeout(timer);
        }
    }

    async function serverReceivedChunks(vps, uploadId) {
        try {
            const r = await fetchJson(`${vps}/upload_status.php?upload_id=${encodeURIComponent(uploadId)}`, { method: 'GET' }, 15000);
            if (r.ok && r.data && Array.isArray(r.data.received)) return new Set(r.data.received.map(Number));
        } catch (_) { /* sin estado => subir todo */ }
        return new Set();
    }

    async function verifyPublished(vps, filename) {
        try {
            const r = await fetchJson(`${vps}/list_files.php`, { method: 'GET' }, 20000);
            if (!r.ok || !r.data || !Array.isArray(r.data.files)) return null;
            const base = filename.replace(/\.gz$/i, '');
            const hit = r.data.files.find(f => f.filename === base || f.filename === base + '.gz');
            return hit || null;
        } catch (_) {
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SONDA DE CABECERA (lee sólo el prefijo, nunca 1.4 GB)
    // ─────────────────────────────────────────────────────────────

    async function probeGz(blob) {
        const magic = await readMagic(blob);
        const out = { magicOk: magic.gzip, magicHex: magic.hex, declared: null, isM3U: false, firstLine: '' };
        if (!magic.gzip || typeof DecompressionStream !== 'function') return out;
        const prefix = blob.slice(0, Math.min(blob.size, 4 * 1024 * 1024));
        const reader = prefix.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const parts = [];
        let bytes = 0;
        try {
            while (bytes < 4 * 1024 * 1024) {
                const { value, done } = await reader.read();
                if (done) break;
                parts.push(value);
                bytes += value.length;
            }
        } catch (_) {
            // Prefijo truncado: DecompressionStream lanza al final; lo leído es válido.
        } finally {
            try { await reader.cancel(); } catch (_) { /* noop */ }
        }
        const text = new TextDecoder().decode(concatUint8(parts));
        out.isM3U = text.trimStart().startsWith('#EXTM3U');
        out.firstLine = (text.split(/\r?\n/)[0] || '').slice(0, 300);
        const m = text.match(/^#EXT-X-APE-CHANNELS:\s*(\d+)/m);
        if (m) out.declared = parseInt(m[1], 10);
        return out;
    }

    function concatUint8(chunks) {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        return out;
    }

    async function probePlain(blob) {
        const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer());
        const text = new TextDecoder().decode(head);
        const m = text.match(/^#EXT-X-APE-CHANNELS:\s*(\d+)/m);
        return {
            magicOk: true,
            isM3U: text.trimStart().startsWith('#EXTM3U'),
            firstLine: (text.split(/\r?\n/)[0] || '').slice(0, 300),
            declared: m ? parseInt(m[1], 10) : null
        };
    }

    // ─────────────────────────────────────────────────────────────
    // SUBIDA DE UN CHUNK
    // ─────────────────────────────────────────────────────────────

    async function uploadChunk(vps, uploadId, index, totalChunks, blob, onRetry) {
        let attempt = 0;
        let lastError = null;
        while (attempt <= MAX_RETRIES) {
            attempt++;
            try {
                const buffer = await blob.arrayBuffer();
                const digest = await sha256Hex(buffer);
                const res = await fetch(`${vps}/upload_chunk.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Upload-Id': uploadId,
                        'X-Chunk-Index': String(index),
                        'X-Total-Chunks': String(totalChunks),
                        'X-Chunk-SHA256': digest
                    },
                    body: buffer,
                    signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS)
                });
                const text = await res.text();
                let data = null;
                try { data = JSON.parse(text); } catch (_) { data = null; }
                if (res.ok && data && (data.success === true)) {
                    return { index, bytes: buffer.byteLength, sha256: digest, data };
                }
                const detail = data?.error || `HTTP ${res.status}`;
                lastError = new Error(`chunk ${index}: ${detail}`);
                // Un 4xx de integridad/parámetros no mejora reintentando.
                if (res.status === 400 || res.status === 422) throw lastError;
            } catch (e) {
                lastError = e;
                if (e && /^(chunk \d+: (SHA-256|Missing|Empty))/.test(String(e.message))) throw e;
            }
            if (attempt <= MAX_RETRIES) {
                const delay = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
                if (typeof onRetry === 'function') onRetry({ index, attempt, delay, error: lastError });
                await sleep(delay);
            }
        }
        throw lastError || new Error(`chunk ${index}: fallo desconocido`);
    }

    // ─────────────────────────────────────────────────────────────
    // API PÚBLICA
    // ─────────────────────────────────────────────────────────────

    const APEPublisher = {

        CHUNK_SIZE,
        sanitizeName,
        normalizeFilename,
        withShieldedSuffix,
        probeGz,
        probePlain,
        canonicalVps,

        /**
         * Publica un Blob/File. Devuelve el JSON del servidor enriquecido.
         */
        async publish(blob, options = {}) {
            if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
                throw new Error('Archivo vacío o inválido');
            }
            const vps = canonicalVps(options.vps);
            const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
            const strategy = ['replace', 'version', 'both'].includes(options.strategy) ? options.strategy : 'replace';

            // 1. Contenido real vs extensión declarada.
            const magic = await readMagic(blob);
            const contentIsGzip = magic.gzip;
            let filename = normalizeFilename(options.filename || blob.name || 'APE_UPLOAD.m3u8', contentIsGzip);
            if (options.shielded) filename = withShieldedSuffix(filename);

            const probe = contentIsGzip ? await probeGz(blob) : await probePlain(blob);
            if (!probe.isM3U) {
                throw new Error('El archivo no empieza por #EXTM3U: no parece una lista M3U/M3U8');
            }
            if (contentIsGzip && !probe.magicOk) {
                throw new Error('El archivo no es gzip válido (magia 1F 8B ausente)');
            }

            const totalBytes = blob.size;
            const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
            onProgress({ phase: 'prepare', percent: 1, totalBytes, totalChunks, message: `Preparado: ${totalChunks} chunks · ${(totalBytes / 1048576).toFixed(1)} MB` });

            // 2. Reanudación: mismo fichero + mismo TTL => mismo upload_id.
            const key = fileKey(blob, filename);
            let session = loadSession();
            let uploadId;
            let received = new Set();
            if (session && session.key === key && session.chunkSize === CHUNK_SIZE && session.totalChunks === totalChunks) {
                uploadId = session.uploadId;
                received = await serverReceivedChunks(vps, uploadId);
                if (received.size > 0) {
                    onProgress({ phase: 'resume', percent: 2, totalBytes, totalChunks, message: `Reanudando: ${received.size}/${totalChunks} chunks ya en el VPS` });
                }
            } else {
                uploadId = randomId();
                session = { key, uploadId, chunkSize: CHUNK_SIZE, totalChunks, createdAt: Date.now() };
                saveSession(session);
            }

            // 3. Subida con pool de workers.
            const pending = [];
            for (let i = 0; i < totalChunks; i++) if (!received.has(i)) pending.push(i);

            let done = received.size;
            let uploadedBytes = done * CHUNK_SIZE;
            let startedAt = Date.now();
            const update = () => {
                const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
                const speed = (uploadedBytes / 1048576) / elapsed;
                const percent = Math.min(85, Math.round((done / totalChunks) * 85));
                onProgress({
                    phase: 'upload',
                    percent,
                    uploadedBytes,
                    totalBytes,
                    totalChunks,
                    chunksDone: done,
                    speedMBps: speed,
                    message: `📤 ${done}/${totalChunks} chunks · ${(uploadedBytes / 1048576).toFixed(0)}/${(totalBytes / 1048576).toFixed(0)} MB · ${speed.toFixed(1)} MB/s`
                });
            };

            if (pending.length > 0) {
                let cursor = 0;
                const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
                    while (cursor < pending.length) {
                        const index = pending[cursor++];
                        const start = index * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, totalBytes);
                        const part = blob.slice(start, end);
                        await uploadChunk(vps, uploadId, index, totalChunks, part, (info) => {
                            onProgress({
                                phase: 'retry',
                                percent: Math.min(85, Math.round((done / totalChunks) * 85)),
                                totalBytes, totalChunks,
                                message: `↻ chunk ${info.index} reintento ${info.attempt}/${MAX_RETRIES} en ${Math.round(info.delay / 1000)}s (${info.error?.message || ''})`
                            });
                        });
                        done++;
                        uploadedBytes = Math.min(totalBytes, uploadedBytes + (end - start));
                        update();
                    }
                });
                await Promise.all(workers);
            }

            // 4. Publicar (servidor: gzip -t + canales + placeholder + rename atómico).
            onProgress({ phase: 'publish', percent: 90, totalBytes, totalChunks, message: '🔎 Verificando gzip y publicando placeholder…' });
            const body = {
                upload_id: uploadId,
                filename,
                mode: contentIsGzip ? 'precompressed' : 'raw',
                expected_size: totalBytes,
                expected_chunks: totalChunks,
                strategy
            };
            let published = null;
            try {
                const res = await fetchJson(`${vps}/ape_publish.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }, PUBLISH_TIMEOUT_MS);
                if (res.ok && res.data && res.data.success) {
                    published = res.data;
                } else {
                    const detail = res.data?.error || res.text?.slice(0, 300) || `HTTP ${res.status}`;
                    // Si el servidor publicó pero la respuesta se cortó, list_files lo confirma.
                    const verified = await verifyPublished(vps, filename);
                    if (verified) {
                        published = {
                            success: true,
                            filename: verified.filename.replace(/\.gz$/i, ''),
                            public_url: `${vps}/lists/${verified.filename.replace(/\.gz$/i, '')}`,
                            gz_url: `${vps}/lists/${verified.filename.replace(/\.gz$/i, '')}.gz`,
                            mode: contentIsGzip ? 'precompressed' : 'raw',
                            recovered: true,
                            server_error: detail,
                            size_gz: verified.size,
                            channels_declared: probe.declared,
                            channels_actual: null,
                            channels_match: null
                        };
                    } else {
                        throw new Error(`Publicación rechazada: ${detail}`);
                    }
                }
            } catch (e) {
                // Red caída justo después de publicar: comprobar antes de mentir.
                const verified = await verifyPublished(vps, filename);
                if (verified) {
                    published = {
                        success: true,
                        filename: verified.filename.replace(/\.gz$/i, ''),
                        public_url: `${vps}/lists/${verified.filename.replace(/\.gz$/i, '')}`,
                        gz_url: `${vps}/lists/${verified.filename.replace(/\.gz$/i, '')}.gz`,
                        mode: contentIsGzip ? 'precompressed' : 'raw',
                        recovered: true,
                        server_error: e.message,
                        size_gz: verified.size,
                        channels_declared: probe.declared,
                        channels_actual: null,
                        channels_match: null
                    };
                } else {
                    throw new Error(`No se pudo publicar: ${e.message}`);
                }
            }

            clearSession();
            published.upload_id = uploadId;
            published.publisher = 'APE_PUBLISHER_v1';
            published.source_was_gzip = contentIsGzip;
            published.expected_sha256 = null;
            published.total_bytes = totalBytes;
            published.chunk_size = CHUNK_SIZE;
            published.chunks = totalChunks;
            published.public_url = published.public_url || `${vps}/lists/${published.filename}`;
            published.gz_url = published.gz_url || published.public_url + '.gz';
            published.probed_declared = probe.declared;
            onProgress({ phase: 'done', percent: 100, totalBytes, totalChunks, message: '✅ Publicado' });
            return published;
        },

        /** Sólo comprobación de cabecera para la UI (sin subir nada). */
        async inspect(blob) {
            const magic = await readMagic(blob);
            return magic.gzip ? probeGz(blob) : probePlain(blob);
        }
    };

    root.APEPublisher = APEPublisher;
    if (typeof module !== 'undefined' && module.exports) module.exports = APEPublisher;

})(typeof globalThis !== 'undefined' ? globalThis : this);
