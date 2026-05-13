/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌐 IPTV GATEWAY WORKER v15.1 (COMPLETE MERGE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * MERGES:
 *  1. FIXED: /stream with Base64 Decoding + HTTP 302 Redirect (APE v15.1)
 *  2. RESTORED: R2 Multipart Uploads (/api/r2/*)
 *  3. RESTORED: KV/R2 Hybrid Session Management
 * 
 * ENDPOINTS:
 *   GET  /                    - Home
 *   GET  /health              - Status & Version (v15.1)
 *   GET  /stream              - APE v15.1 Redirector (Base64 -> 302)
 *   GET  /playlist.m3u8       - Serve Playlist (Dynamic/R2)
 *   POST /api/upload          - Upload M3U8 (Standard)
 *   POST /api/r2/*            - Multipart Uploads (Large Files)
 *   PUT  /api/sessions/*      - Session Management
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS Headers (Comprehensive from Backup)
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding, Authorization, X-Action, X-Upload-Id, X-Key, X-Part-Number, X-Original-Size, X-Session-Count, X-Shard, X-Chunk-Id',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // ════════════════════════════════════════════════════════════════
            // RUTAS PRINCIPALES
            // ════════════════════════════════════════════════════════════════

            // GET / - Página de inicio
            if (path === '/' && request.method === 'GET') {
                return new Response(this.getHomePage(), {
                    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
                });
            }

            // ════════════════════════════════════════════════════════════════
            // GET /health - APE v15.1 Health Check
            // ════════════════════════════════════════════════════════════════
            if (path === '/health' && request.method === 'GET') {
                return new Response(JSON.stringify({
                    status: 'ok',
                    version: '15.1.0-REDIRECT-CF-FULL',
                    timestamp: new Date().toISOString(),
                    features: ['base64_redirect', 'r2_multipart', 'kv_hybrid'],
                    endpoints: {
                        stream: '/stream?channel_id=X&original_url=BASE64',
                        upload_multipart: '/api/r2/initiate-multipart'
                    }
                }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // GET /api/health - Legacy Health Check (Keep for compatibility)
            if (path === '/api/health' && request.method === 'GET') {
                let kvMetrics = null;
                try {
                    if (env.KV_STATS) {
                        kvMetrics = await env.KV_STATS.get('metrics', 'json') || { kv_hits: 0, r2_fallbacks: 0, warmup_count: 0 };
                    }
                } catch (e) {
                    console.log('[HEALTH] Could not read KV stats:', e.message);
                }
                return Response.json({
                    status: 'ok',
                    version: '1.2.0-merged',
                    timestamp: new Date().toISOString(),
                    kv_metrics: kvMetrics
                }, { headers: corsHeaders });
            }

            // ════════════════════════════════════════════════════════════════
            // GET /stream - APE v15.1 REDIRECT FIX (Base64 -> 302)
            // ════════════════════════════════════════════════════════════════
            if (path === '/stream' && request.method === 'GET') {
                try {
                    const channelId = url.searchParams.get('channel_id') || 'unknown';
                    const originalUrlEncoded = url.searchParams.get('original_url');

                    if (!originalUrlEncoded) {
                        return new Response('Missing required parameter: original_url', {
                            status: 400,
                            headers: corsHeaders
                        });
                    }

                    // Decodificar Base64 URL (M3U8 Transformer Fixed v1.0 standard)
                    let originalUrl;
                    try {
                        // Step 1: URL decode (quitar %XX encoding si existe)
                        const base64Decoded = decodeURIComponent(originalUrlEncoded);
                        // Step 2: Base64 decode
                        originalUrl = atob(base64Decoded);
                        // Step 3: Validar URL
                        new URL(originalUrl);
                    } catch (error) {
                        return new Response(`Invalid URL format or encoding: ${error.message}`, {
                            status: 400,
                            headers: corsHeaders
                        });
                    }

                    // CDN Whitelist Validation
                    const ALLOWED_CDN_DOMAINS = [
                        'cdn.tivi.com',
                        'tivi.com',
                        'line.tivi.com',
                        'stream.tivi.com',
                        'media.tivi.com',
                        'tv.tivi.com',
                        'tivi-ott.net',
                        'line.tivi-ott.net'
                    ];

                    const urlDomain = new URL(originalUrl).hostname;
                    const isAllowed = ALLOWED_CDN_DOMAINS.some(domain =>
                        urlDomain.includes(domain) || domain.includes(urlDomain)
                    );

                    if (!isAllowed) {
                        console.log(`[REDIRECT] Blocked: ${urlDomain} not in whitelist`);
                        return new Response(`Forbidden: CDN domain not whitelisted (${urlDomain})`, {
                            status: 403,
                            headers: corsHeaders
                        });
                    }

                    console.log(`[REDIRECT] ${channelId} → ${originalUrl.substring(0, 80)}...`);

                    // HTTP 302 Redirect
                    return new Response(null, {
                        status: 302,
                        headers: {
                            ...corsHeaders,
                            'Location': originalUrl,
                            'Cache-Control': 'public, max-age=60',
                            'X-APE-Mode': 'pure_redirect',
                            'X-APE-Version': '15.1.0-REDIRECT-CF',
                            'X-Channel-ID': channelId
                        }
                    });

                } catch (error) {
                    console.error('❌ Stream endpoint error:', error.message);
                    return new Response(`Internal error: ${error.message}`, {
                        status: 500,
                        headers: corsHeaders
                    });
                }
            }

            // ════════════════════════════════════════════════════════════════
            // R2 MULTIPART STREAMING UPLOAD (Chunked - RESTORED)
            // ════════════════════════════════════════════════════════════════

            // POST /api/r2/initiate-multipart
            if (path === '/api/r2/initiate-multipart' && request.method === 'POST') {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }

                try {
                    const { filename, size } = await request.json();
                    const timestamp = Date.now();

                    const sanitizedFilename = filename
                        .replace(/\s+/g, '_')
                        .replace(/[()]/g, '')
                        .replace(/[^a-zA-Z0-9._-]/g, '_');

                    const key = `playlists/${timestamp}_${sanitizedFilename}`;
                    const multipartUpload = await env.R2_BUCKET.createMultipartUpload(key);

                    console.log(`[R2-MULTIPART] Initiated: ${key}, size: ${size}`);

                    return Response.json({
                        uploadId: multipartUpload.uploadId,
                        key: key,
                        chunkSize: 5 * 1024 * 1024
                    }, { headers: corsHeaders });

                } catch (e) {
                    console.error('[R2-MULTIPART] Init error:', e);
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // POST /api/r2/upload-part
            if (path === '/api/r2/upload-part' && request.method === 'POST') {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }

                try {
                    const { uploadId, key, partNumber, data } = await request.json();

                    const binaryString = atob(data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    const multipartUpload = await env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
                    const uploadedPart = await multipartUpload.uploadPart(partNumber, bytes);

                    return Response.json({
                        success: true,
                        partNumber: partNumber,
                        etag: uploadedPart.etag
                    }, { headers: corsHeaders });

                } catch (e) {
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // POST /api/r2/complete-multipart
            if (path === '/api/r2/complete-multipart' && request.method === 'POST') {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }

                try {
                    const { uploadId, key, parts } = await request.json();
                    const r2Parts = parts.map(p => ({
                        partNumber: p.partNumber || p.PartNumber,
                        etag: p.etag || p.ETag || p.etag
                    }));

                    const multipartUpload = await env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
                    await multipartUpload.complete(r2Parts);

                    // Update 'latest_r2_key.txt' so /playlist.m3u8 points to this new file
                    await env.R2_BUCKET.put('latest_r2_key.txt', key, {
                        httpMetadata: { contentType: 'text/plain' }
                    });

                    // Update metadata
                    await env.R2_BUCKET.put('metadata.json', JSON.stringify({
                        last_upload: new Date().toISOString(),
                        source: 'multipart',
                        key: key
                    }));

                    return Response.json({
                        success: true,
                        key: key,
                        public_url: `${url.origin}/playlist.m3u8`
                    }, { headers: corsHeaders });

                } catch (e) {
                    console.error('[R2-MULTIPART] Complete error:', e);
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // POST /api/r2/abort-multipart
            if (path === '/api/r2/abort-multipart' && request.method === 'POST') {
                // Verify Auth
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }
                try {
                    const { uploadId, key } = await request.json();
                    if (!uploadId || !key) {
                        return Response.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders });
                    }
                    // Resume and abort
                    const multipartUpload = await env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
                    await multipartUpload.abort();
                    return Response.json({ success: true, status: 'aborted' }, { headers: corsHeaders });
                } catch (e) {
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ════════════════════════════════════════════════════════════════
            // GET /playlist.m3u8 - Serve Playlist (Dynamic/R2)
            // ════════════════════════════════════════════════════════════════
            if ((path === '/playlist.m3u8' || path === '/v1/feed' || path === '/feed') && request.method === 'GET') {
                // Check if we have a dynamic key reference
                let r2Key = 'latest.m3u8';
                try {
                    const keyFile = await env.R2_BUCKET.get('latest_r2_key.txt');
                    if (keyFile) {
                        const dynamicKey = await keyFile.text();
                        if (dynamicKey && dynamicKey.trim()) r2Key = dynamicKey.trim();
                    }
                } catch (e) { }

                // Try R2
                const r2Object = await env.R2_BUCKET.get(r2Key);
                if (r2Object) {
                    return new Response(r2Object.body, {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/x-mpegURL',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'ETag': r2Object.httpEtag
                        }
                    });
                }

                // Fallback to KV
                const kvContent = await env.PLAYLISTS_KV.get('latest');
                if (kvContent) {
                    return new Response(kvContent, {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/x-mpegURL',
                            'Cache-Control': 'no-cache'
                        }
                    });
                }

                return new Response('#EXTM3U\n# No playlist uploaded yet', { status: 404, headers: corsHeaders });
            }

            // ════════════════════════════════════════════════════════════════
            // LEGACY / OTHER ENDPOINTS (Preserved)
            // ════════════════════════════════════════════════════════════════

            // POST /api/upload (Standard)
            if (path === '/api/upload' && request.method === 'POST') {
                // ... (Simplified standard upload logic for small files)
                // This endpoint is less critical if Multipart is used, but good to have fallback
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }
                const payload = await request.json();
                const { playlist_content } = payload;
                if (!playlist_content) return Response.json({ error: 'Missing content' }, { status: 400, headers: corsHeaders });

                await env.R2_BUCKET.put('latest.m3u8', playlist_content, { httpMetadata: { contentType: 'application/x-mpegURL' } });
                await env.R2_BUCKET.delete('latest_r2_key.txt'); // Reset dynamic key
                await env.PLAYLISTS_KV.put('latest', playlist_content);

                return Response.json({ success: true, method: 'standard' }, { headers: corsHeaders });
            }

            // PUT /api/sessions/* (Bulk/Sharded Session Uploads)
            // Essential for high channel counts to avoid OOM
            if (path.startsWith('/api/sessions')) {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== env.GATEWAY_SECRET) {
                    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
                }
                try {
                    // Check specific sub-paths
                    if (path === '/api/sessions') { // GZIP dump
                        const data = await request.arrayBuffer();
                        await env.R2_BUCKET.put('sessions.json.gz', data, { httpMetadata: { contentType: 'application/gzip' } });
                        return Response.json({ success: true }, { headers: corsHeaders });
                    }
                    const shardMatch = path.match(/^\/api\/sessions\/([0-9a-f])$/i);
                    if (shardMatch) {
                        const shardId = shardMatch[1];
                        const data = await request.arrayBuffer();
                        await env.R2_BUCKET.put(`sessions/shard_${shardId}.json.gz`, data, { httpMetadata: { contentType: 'application/gzip' } });
                        return Response.json({ success: true, shard: shardId }, { headers: corsHeaders });
                    }
                    const chunkMatch = path.match(/^\/api\/sessions\/chunk\/(\d+)$/);
                    if (chunkMatch) {
                        const chunkId = chunkMatch[1];
                        const data = await request.arrayBuffer();
                        await env.R2_BUCKET.put(`sessions/chunk_${chunkId}.json.gz`, data, { httpMetadata: { contentType: 'application/gzip' } });
                        return Response.json({ success: true, chunk: chunkId }, { headers: corsHeaders });
                    }
                    if (path === '/api/sessions/index') {
                        const data = await request.arrayBuffer();
                        await env.R2_BUCKET.put('sessions/index.json.gz', data, { httpMetadata: { contentType: 'application/gzip' } });
                        return Response.json({ success: true, type: 'index' }, { headers: corsHeaders });
                    }
                } catch (e) {
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('❌ Worker error:', error.message);
            return new Response(`Worker Error: ${error.message}`, {
                status: 500,
                headers: corsHeaders
            });
        }
    },

    getHomePage() {
        return `<!DOCTYPE html>
<html>
<head><title>APE v15.1 Gateway</title><style>body{font-family:sans-serif;background:#111;color:#eee;padding:2rem;text-align:center}</style></head>
<body><h1>🐘 APE v15.1 Gateway</h1><p>Status: <strong>OPERATIONAL</strong></p><p>Features: R2 Multipart + Base64 Redirect</p></body>
</html>`;
    },

    // Helper stubs to satisfy any legacy calls, though mostly moved inline
    async rewriteUrls(content, env) { return { rewrittenContent: content, mappingsCreated: 0 }; },
    extractPrefetchConfig(content) { return {}; },
    async cleanupOldVersions(env) { }
};
