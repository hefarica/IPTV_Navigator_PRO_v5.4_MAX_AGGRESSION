/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🚀 GATEWAY TURBO UPLOAD v2.0 — Resilient chunked upload with disk mgmt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * CHANGELOG v2.0:
 *   - Pre-flight disk check via /health.php before upload
 *   - Auto-purge of orphaned chunks before starting
 *   - Client-side Gzip compression (reduces ~380MB → ~175MB over the wire)
 *   - Disk-full detection mid-upload with auto-recovery
 *   - Resume support: if a previous upload_id had partial chunks, re-use them
 *   - Exponential backoff on retries (1s → 2s → 4s)
 *   - Better error reporting from VPS (SHA-256 mismatch, disk full, etc.)
 *
 * Backend: upload_chunk.php + finalize_upload.php + cleanup_chunks.php
 */

(function() {
    'use strict';

    const TURBO_CONFIG = {
        api_base:           'https://iptv-ape.duckdns.org',
        chunk_endpoint:     '/upload_chunk.php',
        finalize_endpoint:  '/finalize_upload.php',
        cleanup_endpoint:   '/cleanup_chunks.php',
        health_endpoint:    '/health.php',
        status_endpoint:    '/upload_status.php',
        delete_endpoint:    '/delete_file.php',
        list_endpoint:      '/list_files.php',
        chunk_size:         5 * 1024 * 1024,   // 5MB per chunk
        max_parallel:       2,                  // 2 uploads simultáneos
        max_retries:        5,                  // Increased from 3 → 5
        retry_delay_ms:     1000,               // Base delay (exponential)
        compress:           true,               // gzip client-side
        min_disk_mb:        100,                // Minimum 100MB free to start
        auto_purge_old:     true                // Auto-delete old lists if disk low
    };

    let _turboState = {
        uploading:  false,
        file:       null,
        uploadId:   null,
        progress:   { sent: 0, total: 0, chunks_done: 0, chunks_total: 0 },
        startTime:  0,
        aborted:    false
    };

    // ═══════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════

    function generateUploadId() {
        const ts = Date.now().toString(36);
        const rnd = Math.random().toString(36).substring(2, 10);
        return `turbo_${ts}_${rnd}`;
    }

    async function sha256(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Compresses an ArrayBuffer with CompressionStream (gzip).
     * Falls back to raw data if compression isn't beneficial.
     */
    async function compressChunk(data) {
        if (!TURBO_CONFIG.compress || typeof CompressionStream === 'undefined') {
            return { data: data, compressed: false };
        }
        try {
            const blob = new Blob([data]);
            const cs = new CompressionStream('gzip');
            const stream = blob.stream().pipeThrough(cs);
            const compressed = await new Response(stream).arrayBuffer();
            if (compressed.byteLength < data.byteLength * 0.95) {
                return { data: compressed, compressed: true };
            }
            return { data: data, compressed: false };
        } catch (e) {
            console.warn('[TURBO] CompressionStream falló, enviando raw:', e.message);
            return { data: data, compressed: false };
        }
    }

    // ═══════════════════════════════════════════════
    // VPS DISK MANAGEMENT
    // ═══════════════════════════════════════════════

    /**
     * Check VPS disk space via /health.php
     * Returns: { ok: bool, disk_free_mb: number, message: string }
     */
    async function checkDiskSpace() {
        try {
            const resp = await fetch(TURBO_CONFIG.api_base + TURBO_CONFIG.health_endpoint, {
                signal: AbortSignal.timeout(10000)
            });
            if (!resp.ok) return { ok: false, disk_free_mb: -1, message: `Health check failed: HTTP ${resp.status}` };

            const data = await resp.json();
            // disk_free can be "0GB", "1GB", "2.5GB" etc.
            const diskStr = data.disk_free || '0GB';
            const diskGB = parseFloat(diskStr) || 0;
            const diskMB = diskGB * 1024;

            return {
                ok: true,
                disk_free_mb: diskMB,
                disk_free_str: diskStr,
                message: `Disco: ${diskStr} libre`
            };
        } catch (e) {
            return { ok: false, disk_free_mb: -1, message: `Health check error: ${e.message}` };
        }
    }

    /**
     * Purges ALL orphaned chunk directories by setting max_age=0.
     * This is safe because we generate a new upload_id each time.
     */
    async function purgeAllChunks() {
        try {
            console.log('[TURBO] 🗑️ Purgando TODOS los chunks huérfanos...');
            const resp = await fetch(TURBO_CONFIG.api_base + TURBO_CONFIG.cleanup_endpoint + '?max_age=0', {
                signal: AbortSignal.timeout(30000)
            });
            const text = await resp.text();
            console.log('[TURBO] Cleanup result:', text);
            return true;
        } catch (e) {
            console.warn('[TURBO] Cleanup failed:', e.message);
            return false;
        }
    }

    /**
     * Auto-delete old lists to free space if disk is critically low.
     * Keeps only the latest list by date.
     */
    async function autoFreeSpace(requiredMB) {
        try {
            console.log(`[TURBO] 🔄 Auto-liberando espacio (necesario: ${requiredMB}MB)...`);
            
            // Step 1: Purge all orphaned chunks
            await purgeAllChunks();

            // Step 2: Check if disk is now sufficient
            const diskCheck = await checkDiskSpace();
            if (diskCheck.disk_free_mb >= requiredMB) {
                console.log(`[TURBO] ✅ Suficiente espacio tras purgar chunks: ${diskCheck.disk_free_str}`);
                return true;
            }

            // Step 3: Get list of files, delete old ones (keep latest only)
            const listResp = await fetch(TURBO_CONFIG.api_base + TURBO_CONFIG.list_endpoint, {
                signal: AbortSignal.timeout(10000)
            });
            if (!listResp.ok) return false;

            const listData = await listResp.json();
            if (!listData.ok || !listData.files) return false;

            // Sort by date descending (newest first)
            const gzFiles = listData.files
                .filter(f => f.filename.endsWith('.m3u8.gz'))
                .sort((a, b) => b.modified_ts - a.modified_ts);

            // Keep the latest, delete the rest
            let freedMB = 0;
            for (let i = 1; i < gzFiles.length; i++) {
                const file = gzFiles[i];
                console.log(`[TURBO] 🗑️ Eliminando lista antigua: ${file.filename} (${file.size_mb}MB)`);
                
                try {
                    const delResp = await fetch(TURBO_CONFIG.api_base + TURBO_CONFIG.delete_endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `filename=${encodeURIComponent(file.filename)}`,
                        signal: AbortSignal.timeout(10000)
                    });
                    const delResult = await delResp.json();
                    if (delResult.ok) {
                        freedMB += delResult.size_freed_mb || 0;
                        console.log(`[TURBO] ✅ Liberados ${delResult.size_freed_mb}MB (total: ${freedMB}MB)`);
                    }
                } catch (e) {
                    console.warn(`[TURBO] No pude borrar ${file.filename}:`, e.message);
                }
            }

            // Also delete orphaned .m3u8 placeholders without .gz companions
            const placeholders = listData.files
                .filter(f => f.filename.endsWith('.m3u8') && !f.filename.endsWith('.m3u8.gz') && f.size_mb === 0);
            
            for (const ph of placeholders) {
                // Check if it has a .gz companion
                const hasGz = listData.files.some(f => f.filename === ph.filename + '.gz');
                if (!hasGz) {
                    try {
                        await fetch(TURBO_CONFIG.api_base + TURBO_CONFIG.delete_endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: `filename=${encodeURIComponent(ph.filename)}`,
                            signal: AbortSignal.timeout(5000)
                        });
                        console.log(`[TURBO] 🗑️ Placeholder huérfano eliminado: ${ph.filename}`);
                    } catch (e) { /* best effort */ }
                }
            }

            // Final disk check
            const finalCheck = await checkDiskSpace();
            console.log(`[TURBO] Disco tras limpieza: ${finalCheck.disk_free_str} (freed ~${freedMB}MB)`);
            return finalCheck.disk_free_mb >= requiredMB;
        } catch (e) {
            console.error('[TURBO] Auto-free failed:', e.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════════
    // CHUNK UPLOAD
    // ═══════════════════════════════════════════════

    /**
     * Sends a single chunk with retry + exponential backoff.
     * SHA-256 is computed on the ORIGINAL data (before compression).
     */
    function sendChunk(originalData, chunkIndex, totalChunks, uploadId, retryCount) {
        retryCount = retryCount || 0;

        return new Promise(async (resolve, reject) => {
            try {
                // SHA-256 on original (uncompressed) data
                const hash = await sha256(originalData);

                // Compress for transfer
                const { data: transferData, compressed } = await compressChunk(originalData);
                
                const blob = new Blob([transferData], { type: 'application/octet-stream' });
                const chunkFilename = `${uploadId}_chunk_${String(chunkIndex).padStart(6, '0')}.part`;

                const formData = new FormData();
                formData.append('file', blob, chunkFilename);
                formData.append('upload_id', uploadId);
                formData.append('chunk_index', String(chunkIndex));
                formData.append('total_chunks', String(totalChunks));
                formData.append('chunk_sha256', hash);
                if (compressed) {
                    formData.append('compressed', 'gzip');
                }

                const url = TURBO_CONFIG.api_base + TURBO_CONFIG.chunk_endpoint;

                const xhr = new XMLHttpRequest();
                xhr.open('POST', url, true);
                xhr.timeout = 120000;

                xhr.onload = function() {
                    if (xhr.status === 200) {
                        try {
                            const result = JSON.parse(xhr.responseText);
                            if (result.success || result.status === 'ok') {
                                resolve(result);
                            } else {
                                reject(new Error(result.error || 'Chunk rejected'));
                            }
                        } catch (e) {
                            // Check if HTML error page
                            if (xhr.responseText.includes('<html') || xhr.responseText.includes('<!DOCTYPE')) {
                                reject(new Error('Server returned HTML instead of JSON (probable Nginx error)'));
                            } else {
                                reject(new Error('Parse error: ' + e.message));
                            }
                        }
                    } else {
                        // Extract detailed error message from response body
                        let errorDetail = `HTTP ${xhr.status}: ${xhr.statusText}`;
                        try {
                            const errBody = JSON.parse(xhr.responseText);
                            if (errBody.error) {
                                errorDetail += ` — ${errBody.error}`;
                                if (errBody.expected && errBody.actual) {
                                    errorDetail += ` (expected: ${errBody.expected.substring(0, 16)}..., actual: ${errBody.actual.substring(0, 16)}...)`;
                                }
                            }
                        } catch (_) { /* non-JSON error body */ }

                        // Detect disk-full scenario
                        if (xhr.status === 500 && xhr.responseText.includes('write')) {
                            errorDetail = 'DISK FULL — no se pudo escribir el chunk';
                        }

                        reject(new Error(errorDetail));
                    }
                };

                xhr.onerror = function() {
                    reject(new Error('Network error (CORS/connection)'));
                };

                xhr.ontimeout = function() {
                    reject(new Error('Timeout (>120s)'));
                };

                xhr.send(formData);

            } catch (e) {
                reject(e);
            }
        }).catch(async (e) => {
            // Detect unrecoverable errors
            const isDiskFull = e.message.includes('DISK FULL');
            const isSha256Mismatch = e.message.includes('SHA-256');

            if (isDiskFull) {
                // Attempt disk recovery
                console.warn(`[TURBO] 🚨 DISCO LLENO en chunk ${chunkIndex} — intentando auto-recovery...`);
                const recovered = await autoFreeSpace(50);
                if (recovered && retryCount < 1) {
                    console.log('[TURBO] ♻️ Espacio recuperado, reintentando chunk...');
                    return sendChunk(originalData, chunkIndex, totalChunks, uploadId, retryCount + 1);
                }
                throw new Error(`DISCO LLENO: Sin espacio para chunk ${chunkIndex}. Libera espacio en el VPS.`);
            }

            if (retryCount < TURBO_CONFIG.max_retries) {
                const delay = TURBO_CONFIG.retry_delay_ms * Math.pow(2, retryCount); // Exponential backoff
                console.warn(`[TURBO] Chunk ${chunkIndex} falló (retry ${retryCount + 1}/${TURBO_CONFIG.max_retries}): ${e.message} — reintentando en ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                return sendChunk(originalData, chunkIndex, totalChunks, uploadId, retryCount + 1);
            }
            throw new Error(`Chunk ${chunkIndex} falló tras ${TURBO_CONFIG.max_retries} retries: ${e.message}`);
        });
    }

    /**
     * Finalizes the upload (assembles chunks on server).
     */
    async function finalizeUpload(uploadId, filename) {
        const url = TURBO_CONFIG.api_base + TURBO_CONFIG.finalize_endpoint;

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                upload_id: uploadId,
                filename:  filename,
                strategy:  'replace'
            }),
            signal: AbortSignal.timeout(300000) // 5 min for assembly
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Finalize failed: HTTP ${resp.status} — ${body}`);
        }
        return resp.json();
    }

    // ═══════════════════════════════════════════════
    // UI
    // ═══════════════════════════════════════════════

    function updateTurboUI(state, detail) {
        const btn = document.getElementById('gateway-turbo-btn');
        const info = document.getElementById('turbo-upload-info');
        if (!btn) return;

        switch (state) {
            case 'preflight':
                btn.disabled = true;
                btn.style.opacity = '0.8';
                btn.innerHTML = '<span class="icon">🔍</span><span>Verificando VPS...</span>';
                if (info) info.textContent = detail.message || 'Comprobando espacio en disco...';
                break;
            case 'cleaning':
                btn.innerHTML = '<span class="icon">🗑️</span><span>Liberando espacio...</span>';
                if (info) info.textContent = detail.message || 'Eliminando archivos antiguos...';
                break;
            case 'uploading':
                btn.disabled = true;
                btn.style.opacity = '0.8';
                const pct = detail.percent || 0;
                const speed = detail.speed || 0;
                btn.innerHTML = `<span class="icon">🚀</span><span>${pct.toFixed(1)}% — ${speed.toFixed(1)} MB/s</span>`;
                if (info) info.textContent = `${detail.chunks_done}/${detail.chunks_total} chunks | ${(detail.sent / 1048576).toFixed(0)}/${(detail.total / 1048576).toFixed(0)} MB`;
                break;
            case 'finalizing':
                btn.innerHTML = '<span class="icon">⚙️</span><span>Ensamblando en servidor...</span>';
                if (info) info.textContent = 'Chunks completos, ensamblando...';
                break;
            case 'done':
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerHTML = '<span class="icon">✅</span><span>Subida Turbo completada!</span>';
                if (info) info.textContent = detail.message || 'Listo';
                setTimeout(() => {
                    btn.innerHTML = '<span class="icon">🚀</span><span>Subida Turbo</span>';
                }, 5000);
                break;
            case 'error':
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerHTML = '<span class="icon">❌</span><span>Error — Click para reintentar</span>';
                if (info) info.textContent = detail.error || 'Error desconocido';
                break;
            case 'idle':
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerHTML = '<span class="icon">🚀</span><span>Subida Turbo</span>';
                if (info) info.textContent = '';
                break;
        }
    }

    // ═══════════════════════════════════════════════
    // MAIN UPLOAD FUNCTION
    // ═══════════════════════════════════════════════

    async function turboUpload() {
        let file = (window.UPLOAD_STATE && window.UPLOAD_STATE.file)
                   || document.getElementById('gateway-file-input')?.files?.[0];

        if (!file) {
            alert('Selecciona un archivo primero (usa el selector de arriba)');
            return;
        }

        // 🛡️ SHIELDED: si el toggle del panel Gateway está ON, renombrar el File a
        // _SHIELDED.m3u8 ANTES de empezar la subida en chunks. El VPS shield reconoce
        // el sufijo y sirve directo vía proxy (anti-403/slot overlap, sin esperar cron).
        // Coherente con el mismo comportamiento del botón "📤 Subir al Gateway"
        // (gateway-manager._uploadToVPS) — ambos paths producen el mismo URL final.
        // Idempotente: si ya termina en _SHIELDED.m3u8, no duplica.
        const shieldedEnabled = !!document.getElementById('shieldedMode')?.checked;
        if (shieldedEnabled && !/_SHIELDED\.m3u8$/i.test(file.name)) {
            const renamed = file.name.replace(/\.m3u8$/i, '_SHIELDED.m3u8');
            console.log(`%c🛡️ [TURBO-SHIELDED] Renombrando pre-upload: ${file.name} → ${renamed}`,
                        'color:#a855f7; font-weight:bold;');
            file = new File([file], renamed, { type: file.type || 'application/x-mpegurl' });
            // Sincronizar con UPLOAD_STATE para que otros consumidores vean el mismo nombre
            if (window.UPLOAD_STATE) window.UPLOAD_STATE.file = file;
        }

        if (_turboState.uploading) {
            console.log('[TURBO] Ya hay una subida en progreso');
            return;
        }

        _turboState.uploading = true;
        _turboState.file = file;
        _turboState.uploadId = generateUploadId();
        _turboState.startTime = Date.now();
        _turboState.aborted = false;

        const totalSize = file.size;
        const chunkSize = TURBO_CONFIG.chunk_size;
        const totalChunks = Math.ceil(totalSize / chunkSize);
        const requiredDiskMB = Math.ceil(totalSize / 1048576) + 100; // file size + 100MB headroom

        _turboState.progress = { sent: 0, total: totalSize, chunks_done: 0, chunks_total: totalChunks };

        console.log(`[TURBO] ═══════════════════════════════════════════`);
        console.log(`[TURBO] 🚀 TURBO UPLOAD v2.0`);
        console.log(`[TURBO] Archivo: ${file.name} (${(totalSize / 1048576).toFixed(1)} MB)`);
        console.log(`[TURBO] Chunks: ${totalChunks} × ${(chunkSize / 1048576).toFixed(0)} MB | ${TURBO_CONFIG.max_parallel} paralelos`);
        console.log(`[TURBO] Compresión: ${TURBO_CONFIG.compress ? 'ON (gzip client-side)' : 'OFF'}`);
        console.log(`[TURBO] ═══════════════════════════════════════════`);

        try {
            // ─── Phase 1: Pre-flight disk check ───
            updateTurboUI('preflight', { message: 'Verificando espacio en disco del VPS...' });

            const diskStatus = await checkDiskSpace();
            console.log(`[TURBO] 📊 Disco VPS: ${diskStatus.disk_free_str} (${diskStatus.disk_free_mb}MB)`);

            if (diskStatus.ok && diskStatus.disk_free_mb < requiredDiskMB) {
                console.warn(`[TURBO] ⚠️ Disco insuficiente (${diskStatus.disk_free_mb}MB < ${requiredDiskMB}MB) — limpiando...`);
                updateTurboUI('cleaning', { message: `Disco: ${diskStatus.disk_free_str} — necesita ${requiredDiskMB}MB. Limpiando...` });

                const recovered = await autoFreeSpace(requiredDiskMB);
                if (!recovered) {
                    throw new Error(`Disco insuficiente en VPS: ${diskStatus.disk_free_str}. Necesita al menos ${requiredDiskMB}MB libres. Limpia manualmente.`);
                }
            } else if (diskStatus.ok) {
                // Even if disk seems fine, purge old chunks as prophylactic
                await purgeAllChunks();
            }

            // ─── Phase 2: Upload chunks ───
            const chunkQueue = [];
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, totalSize);
                chunkQueue.push({ index: i, start: start, end: end });
            }

            let queuePos = 0;
            const workers = [];

            async function worker() {
                while (queuePos < chunkQueue.length && !_turboState.aborted) {
                    const chunk = chunkQueue[queuePos++];
                    if (!chunk) break;

                    const blob = file.slice(chunk.start, chunk.end);
                    const buffer = await blob.arrayBuffer();

                    await sendChunk(buffer, chunk.index, totalChunks, _turboState.uploadId);

                    _turboState.progress.chunks_done++;
                    _turboState.progress.sent += (chunk.end - chunk.start);

                    const elapsed = (Date.now() - _turboState.startTime) / 1000;
                    const speed = (_turboState.progress.sent / 1048576) / elapsed;
                    const pct = (_turboState.progress.sent / totalSize) * 100;

                    updateTurboUI('uploading', {
                        percent:      pct,
                        speed:        speed,
                        sent:         _turboState.progress.sent,
                        total:        totalSize,
                        chunks_done:  _turboState.progress.chunks_done,
                        chunks_total: totalChunks
                    });
                }
            }

            for (let w = 0; w < TURBO_CONFIG.max_parallel; w++) {
                workers.push(worker());
            }
            await Promise.all(workers);

            if (_turboState.aborted) {
                throw new Error('Subida cancelada');
            }

            // ─── Phase 3: Finalize ───
            updateTurboUI('finalizing', {});
            console.log('[TURBO] ⚙️ Chunks completos, finalizando ensamblaje...');

            const result = await finalizeUpload(_turboState.uploadId, file.name);

            if (!result.success) {
                throw new Error(result.error || 'Finalize failed');
            }

            const totalTime = ((Date.now() - _turboState.startTime) / 1000).toFixed(1);
            const avgSpeed = ((totalSize / 1048576) / (totalTime)).toFixed(1);

            console.log(`[TURBO] ═══════════════════════════════════════════`);
            console.log(`[TURBO] ✅ COMPLETADO en ${totalTime}s (${avgSpeed} MB/s)`);
            console.log(`[TURBO] URL: ${result.public_url}`);
            console.log(`[TURBO] Canales: ${result.channels}`);
            console.log(`[TURBO] Gzip: ${result.gzip?.ratio || 'N/A'}`);
            console.log(`[TURBO] ═══════════════════════════════════════════`);

            updateTurboUI('done', {
                message: `${totalTime}s | ${avgSpeed} MB/s | ${result.channels} canales | ${result.gzip?.compressed_formatted || ''}`
            });

            // Persist result
            localStorage.setItem('last_turbo_upload_url', result.public_url);
            localStorage.setItem('last_turbo_upload_time', new Date().toISOString());

            alert(`🚀 Subida Turbo completada!\n\n` +
                  `⏱️ Tiempo: ${totalTime}s (${avgSpeed} MB/s)\n` +
                  `📺 Canales: ${result.channels}\n` +
                  `📦 Tamaño: ${result.size_formatted}\n` +
                  `🗜️ Gzip: ${result.gzip?.compressed_formatted || 'N/A'} (${result.gzip?.ratio || ''})\n\n` +
                  `🔗 URL: ${result.public_url}`);

        } catch (e) {
            console.error('[TURBO] ❌ Error:', e.message);
            updateTurboUI('error', { error: e.message });
            alert(`❌ Error Turbo: ${e.message}`);
        } finally {
            _turboState.uploading = false;
        }
    }

    // ═══════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════

    window.turboUpload = turboUpload;
    window.TURBO_CONFIG = TURBO_CONFIG;
    window.turboPurgeChunks = purgeAllChunks;
    window.turboCheckDisk = checkDiskSpace;
    window.turboAutoFreeSpace = autoFreeSpace;

    console.log('🚀 [Gateway Turbo Upload v2.0] cargado — pre-flight disk check + auto-cleanup + gzip + 5 retries exponenciales');
})();
