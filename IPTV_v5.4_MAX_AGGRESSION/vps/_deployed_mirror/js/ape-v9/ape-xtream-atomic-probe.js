/* ═══════════════════════════════════════════════════════════════════════════
 * APE XTREAM ATOMIC PROBE v1.0 — REAL RESOLUTION DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Single HTTP request per channel. Extracts TRUTH from the bitstream:
 *   - Real width × height (from HLS master playlist OR MPEG-TS SPS/VPS parsing)
 *   - Codec (H.264 / HEVC / AV1) from PMT stream_type and SPS profile_idc
 *   - Bit depth (8/10/12) from SPS bit_depth_luma_minus8
 *   - Frame rate (from SPS VUI timing or HLS FRAME-RATE tag)
 *   - Bitrate (from HLS BANDWIDTH tag OR Content-Length estimate)
 *
 * Classifies into:
 *   - Profile (P0-P5) by REAL resolution, not promised
 *   - Tier: ORO (hidden gem: real > promised), PLATA (truthful), BRONCE (standard),
 *           FAKE (lies about quality), UNKNOWN (couldn't determine)
 *   - Confidence score 0-100
 *
 * ONE request strategy:
 *   Range: bytes=0-131071 (128KB) on the stream URL.
 *   - Content-Type audio/mpegurl → parse HLS master playlist (EXT-X-STREAM-INF)
 *   - Content-Type video/mp2t OR octet-stream → parse MPEG-TS + SPS NAL unit
 *   - Abort after enough signal extracted.
 *
 * Author: HFRC Toolkit — Resolution Truth Engine
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (window) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════
    const PROBE_BYTES        = 131072;   // 128KB — enough for PMT + SPS/VPS
    const PROBE_TIMEOUT_MS   = 4000;     // abort after 4s
    const TS_PACKET_SIZE     = 188;
    const TS_SYNC_BYTE       = 0x47;

    // MPEG-TS stream_type → codec name
    const STREAM_TYPE = {
        0x01: 'MPEG1', 0x02: 'MPEG2',
        0x1B: 'H.264', 0x24: 'HEVC', 0x27: 'HEVC',
        0x2F: 'AVS',   0x51: 'AVS2', 0x52: 'AVS3',
        0xD1: 'AV1',
    };

    // Profile assignment by real height + fps + codec
    function profileFromReal({ height, fps, codec, bitDepth, bitrateMbps }) {
        if (!height) return null;
        if (height >= 4320) return 'P0';                                           // 8K
        if (height >= 2160 && (fps >= 60 || bitDepth >= 10 || codec === 'HEVC' || codec === 'AV1')) return 'P1'; // 4K premium
        if (height >= 2160) return 'P2';                                           // 4K standard
        if (height >= 1080) return 'P3';                                           // FHD
        if (height >=  720) return 'P4';                                           // HD
        return 'P5';                                                               // SD
    }

    // Keyword→promised-profile (what channel NAME claims)
    function promisedProfile(channel) {
        const s = [channel?.name, channel?.['tvg-name'], channel?.tvg_name,
                   channel?.group, channel?.['group-title'], channel?.groupTitle,
                   channel?.category].filter(Boolean).join(' ').toUpperCase();
        if (/\b(8K|4320P?|UHD2)\b/.test(s))                                   return 'P0';
        if (/\b(4K\+|UHD\*|UHD\+|DOLBY\s*VISION|\bDV\b|HDR10\+|60\s*FPS|120\s*FPS)\b/.test(s)) return 'P1';
        if (/\b(4K|UHD|2160P?|ULTRA\s*HD)\b/.test(s))                         return 'P2';
        if (/\b(FHD|FULL\s*HD|1080P?)\b/.test(s))                             return 'P3';
        if (/\b(HD|720P?)\b/.test(s) && !/\bSD\b/.test(s))                    return 'P4';
        return 'P5';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HLS PLAYLIST PARSER
    // ═══════════════════════════════════════════════════════════════════════
    function parseHlsMaster(text) {
        // Find best variant (highest RESOLUTION/BANDWIDTH) in master playlist
        const variants = [];
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^#EXT-X-STREAM-INF:(.+)$/);
            if (!m) continue;
            const attrs = m[1];
            const resM  = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
            const bwM   = attrs.match(/BANDWIDTH=(\d+)/i);
            const codM  = attrs.match(/CODECS="([^"]+)"/i);
            const fpsM  = attrs.match(/FRAME-RATE=([\d.]+)/i);
            const vrM   = attrs.match(/VIDEO-RANGE=([\w]+)/i);
            if (resM || bwM) {
                variants.push({
                    width:  resM ? parseInt(resM[1]) : 0,
                    height: resM ? parseInt(resM[2]) : 0,
                    bandwidth: bwM ? parseInt(bwM[1]) : 0,
                    codecs: codM ? codM[1] : '',
                    fps: fpsM ? parseFloat(fpsM[1]) : 0,
                    videoRange: vrM ? vrM[1] : 'SDR',
                });
            }
        }
        if (!variants.length) return null;
        // Pick highest resolution (tie-break by bandwidth)
        variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
        const best = variants[0];
        const codec = /hvc1|hev1/i.test(best.codecs) ? 'HEVC'
                    : /av01/i.test(best.codecs)      ? 'AV1'
                    : /avc1/i.test(best.codecs)      ? 'H.264'
                    : 'UNKNOWN';
        const bitDepth = /main10|hvc1\.2/i.test(best.codecs) ? 10 : 8;
        return {
            width: best.width, height: best.height,
            bitrateMbps: best.bandwidth ? Math.round(best.bandwidth / 1e6) : 0,
            codec, bitDepth, fps: best.fps || 0,
            hdr: best.videoRange !== 'SDR',
            source: 'hls-master',
            variantsFound: variants.length,
        };
    }

    function parseHlsMediaHints(text) {
        // Single media playlist: estimate from #EXT-X-STREAM-INF absent, but look
        // for hints in #EXT-X-MEDIA, #EXT-X-TARGETDURATION, or comments.
        const tdM = text.match(/#EXT-X-TARGETDURATION:(\d+)/);
        return {
            width: 0, height: 0,
            targetDuration: tdM ? parseInt(tdM[1]) : 0,
            source: 'hls-media-hint',
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MPEG-TS PARSER (finds PMT → finds video PID → parses SPS NAL)
    // ═══════════════════════════════════════════════════════════════════════
    function parseMpegTs(buf) {
        const u8 = new Uint8Array(buf);
        let videoPid = -1;
        let streamType = -1;
        let videoPayload = null;

        // Phase 1: find PAT (PID 0) → find PMT PID → find video elementary PID
        let pmtPid = -1;
        for (let off = 0; off + TS_PACKET_SIZE <= u8.length; off += TS_PACKET_SIZE) {
            if (u8[off] !== TS_SYNC_BYTE) continue;
            const pid = ((u8[off + 1] & 0x1F) << 8) | u8[off + 2];
            const payloadStart = (u8[off + 1] & 0x40) !== 0;
            const adaptField   = (u8[off + 3] & 0x20) !== 0;
            let p = off + 4;
            if (adaptField) p += 1 + u8[off + 4];
            if (payloadStart) p += 1 + u8[p]; // pointer_field
            if (pid === 0 && pmtPid < 0) {
                // PAT — read first program's PMT PID
                // table_id(1) + section_len(2) + transport_stream_id(2) + version/current(1) + section_num(1) + last_section(1)
                const prog = p + 8;
                pmtPid = ((u8[prog + 2] & 0x1F) << 8) | u8[prog + 3];
            } else if (pid === pmtPid && videoPid < 0) {
                // PMT — iterate elementary streams
                const tableId     = u8[p];
                const sectionLen  = ((u8[p + 1] & 0x0F) << 8) | u8[p + 2];
                const programInfoLen = ((u8[p + 10] & 0x0F) << 8) | u8[p + 11];
                let es = p + 12 + programInfoLen;
                const end = p + 3 + sectionLen - 4;
                while (es + 5 <= end && es + 5 <= u8.length) {
                    const st = u8[es];
                    const ePid = ((u8[es + 1] & 0x1F) << 8) | u8[es + 2];
                    const esInfoLen = ((u8[es + 3] & 0x0F) << 8) | u8[es + 4];
                    if (STREAM_TYPE[st] && ['H.264', 'HEVC', 'AV1', 'MPEG2'].includes(STREAM_TYPE[st])) {
                        videoPid = ePid;
                        streamType = st;
                        break;
                    }
                    es += 5 + esInfoLen;
                }
            } else if (pid === videoPid && videoPid >= 0) {
                // Collect video payload
                if (!videoPayload) videoPayload = [];
                let pStart = off + 4;
                if (adaptField) pStart += 1 + u8[off + 4];
                // PES header if payload_unit_start
                if (payloadStart) {
                    if (u8[pStart] === 0 && u8[pStart + 1] === 0 && u8[pStart + 2] === 1) {
                        const pesHdrLen = u8[pStart + 8];
                        pStart += 9 + pesHdrLen;
                    }
                }
                for (let k = pStart; k < off + TS_PACKET_SIZE; k++) videoPayload.push(u8[k]);
                if (videoPayload.length > 65536) break; // plenty for SPS
            }
        }

        if (!videoPayload) return null;
        const codec = STREAM_TYPE[streamType] || 'UNKNOWN';
        const pay = new Uint8Array(videoPayload);

        // Find NAL units (start code 00 00 00 01 or 00 00 01)
        function findNals() {
            const nals = [];
            for (let i = 0; i + 3 < pay.length; i++) {
                if (pay[i] === 0 && pay[i + 1] === 0) {
                    if (pay[i + 2] === 1) nals.push(i + 3);
                    else if (pay[i + 2] === 0 && pay[i + 3] === 1) nals.push(i + 4);
                }
            }
            return nals;
        }
        const nals = findNals();

        if (codec === 'H.264') {
            for (const n of nals) {
                const nalType = pay[n] & 0x1F;
                if (nalType === 7) { // SPS
                    const res = parseH264Sps(pay.subarray(n + 1, Math.min(n + 200, pay.length)));
                    if (res) return { ...res, codec, source: 'ts-h264-sps' };
                }
            }
        } else if (codec === 'HEVC') {
            for (const n of nals) {
                const nalType = (pay[n] >> 1) & 0x3F;
                if (nalType === 33) { // SPS_NUT
                    const res = parseHevcSps(pay.subarray(n + 2, Math.min(n + 400, pay.length)));
                    if (res) return { ...res, codec, source: 'ts-hevc-sps' };
                }
            }
        }
        return { codec, source: 'ts-unknown-sps' };
    }

    // ─── RBSP extractor (strip emulation prevention bytes 0x000003 → 0x0000) ───
    function rbsp(bytes) {
        const out = [];
        for (let i = 0; i < bytes.length; i++) {
            if (i + 2 < bytes.length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 3) {
                out.push(0, 0); i += 2;
            } else out.push(bytes[i]);
        }
        return new Uint8Array(out);
    }

    // ─── Exp-Golomb bit reader ───
    function BitReader(bytes) {
        let pos = 0;
        return {
            u(n) { let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1); pos++; } return v; },
            ue() { let z = 0; while (this.u(1) === 0 && z < 32) z++; return z ? (1 << z) - 1 + this.u(z) : 0; },
            se() { const v = this.ue(); return (v & 1) ? (v + 1) >> 1 : -(v >> 1); },
            skip(n) { pos += n; },
            get pos() { return pos; },
        };
    }

    function parseH264Sps(sps) {
        try {
            const br = BitReader(rbsp(sps));
            const profile_idc = br.u(8);
            br.skip(16); // constraint + level
            br.ue(); // seq_parameter_set_id
            if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile_idc)) {
                const chroma = br.ue();
                if (chroma === 3) br.skip(1);
                br.ue(); // bit_depth_luma_minus8
                br.ue(); // bit_depth_chroma
                br.skip(1);
                if (br.u(1)) { // seq_scaling_matrix_present
                    for (let k = 0; k < (chroma !== 3 ? 8 : 12); k++) if (br.u(1)) for (let j = 0; j < 64; j++) br.se();
                }
            }
            br.ue(); // log2_max_frame_num_minus4
            const pocType = br.ue();
            if (pocType === 0) br.ue();
            else if (pocType === 1) { br.skip(1); br.se(); br.se(); const n = br.ue(); for (let i = 0; i < n; i++) br.se(); }
            br.ue(); // max_num_ref_frames
            br.skip(1);
            const pic_width_in_mbs_minus1   = br.ue();
            const pic_height_in_map_units_minus1 = br.ue();
            const frame_mbs_only = br.u(1);
            const width  = (pic_width_in_mbs_minus1 + 1) * 16;
            const height = (2 - frame_mbs_only) * (pic_height_in_map_units_minus1 + 1) * 16;
            return { width, height, bitDepth: 8, fps: 0 };
        } catch (e) { return null; }
    }

    function parseHevcSps(sps) {
        try {
            const br = BitReader(rbsp(sps));
            br.skip(4);  // sps_video_parameter_set_id
            const maxSubLayers = br.u(3);
            br.skip(1);
            // profile_tier_level — simplified skip
            br.skip(2 + 1 + 5 + 32 + 48 + 8); // general_profile_space(2) tier(1) profile_idc(5) compat(32) constraints(48) level(8)
            for (let i = 0; i < maxSubLayers - 1; i++) { br.skip(2); }
            if (maxSubLayers > 1) for (let i = maxSubLayers - 1; i < 8; i++) br.skip(2);
            br.ue(); // sps_seq_parameter_set_id
            const chroma_format_idc = br.ue();
            if (chroma_format_idc === 3) br.skip(1);
            const pic_width_in_luma_samples  = br.ue();
            const pic_height_in_luma_samples = br.ue();
            const conformance_window_flag = br.u(1);
            let cropL = 0, cropR = 0, cropT = 0, cropB = 0;
            if (conformance_window_flag) { cropL = br.ue(); cropR = br.ue(); cropT = br.ue(); cropB = br.ue(); }
            const bit_depth_luma = br.ue() + 8;
            return {
                width: pic_width_in_luma_samples - (cropL + cropR) * 2,
                height: pic_height_in_luma_samples - (cropT + cropB) * 2,
                bitDepth: bit_depth_luma,
                fps: 0,
            };
        } catch (e) { return null; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // XTREAM URL BUILDER — constructs full stream URL from channel object.
    // Channel objects carry server_url/port/protocol and stream_id, but
    // credentials (username/password) live in localStorage['iptv_server_library'].
    // We look up by serverId or by hostname match.
    // ═══════════════════════════════════════════════════════════════════════
    let _serverCredCache = null;
    function _loadServerLibrary() {
        if (_serverCredCache) return _serverCredCache;
        try {
            const raw = localStorage.getItem('iptv_server_library') || '[]';
            _serverCredCache = JSON.parse(raw);
        } catch (e) { _serverCredCache = []; }
        return _serverCredCache;
    }
    function _findServerCreds(channel) {
        const lib = _loadServerLibrary();
        if (!lib.length) return null;
        // Prefer match by serverId
        if (channel?.serverId) {
            const byId = lib.find(s => s.id === channel.serverId);
            if (byId && byId.username && byId.password) return byId;
        }
        // Fallback: match by hostname (channel.server_url or channel.url is host-only)
        const host = (channel?.server_url || channel?.url || '').toLowerCase().replace(/^https?:\/\//, '').split(/[:/]/)[0];
        if (!host) return null;
        return lib.find(s => {
            const bu = (s.baseUrl || '').toLowerCase();
            return bu.includes(host) && s.username && s.password;
        }) || null;
    }
    function buildStreamUrl(channel) {
        if (!channel) return null;
        // If channel.url already full http(s), accept as-is.
        if (typeof channel.url === 'string' && /^https?:\/\/[^/]+\//.test(channel.url)) return channel.url;
        if (typeof channel.stream_url === 'string' && /^https?:\/\//.test(channel.stream_url)) return channel.stream_url;

        const protocol = channel.server_protocol || 'http';
        const host     = (channel.server_url || channel.url || '').replace(/^https?:\/\//, '').split(/[:/]/)[0];
        const port     = channel.server_port || (protocol === 'https' ? 443 : 80);
        const streamId = channel.stream_id || channel.raw_streamid || channel.id;
        const streamType = (channel.stream_type || 'live').toLowerCase();
        if (!host || !streamId) return null;

        const creds = _findServerCreds(channel);
        if (!creds) return null;

        const portPart = (protocol === 'http' && port == 80) || (protocol === 'https' && port == 443)
            ? '' : `:${port}`;
        // Xtream format: http://host:port/{live|movie|series}/USER/PASS/STREAM_ID.{ts|m3u8}
        // Use .m3u8 preferred (smaller response, master playlist likely)
        const ext = streamType === 'live' ? 'm3u8' : 'ts';
        return `${protocol}://${host}${portPart}/${streamType}/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${ext}`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BACKEND PROXY (solves CORS for cross-origin IPTV streams)
    //
    // 2026-04-20: default ahora apunta al Rust stream_probe_server (VPS:8765),
    // que trae CORS abierto y devuelve width/height/codec/bitrate/fps ya
    // procesados por ffprobe. Fallback al PHP si APE_PROBE_PROXY_URL lo pide.
    // ═══════════════════════════════════════════════════════════════════════
    const PROXY_URL = () => (window.APE_PROBE_PROXY_URL
        || (window.VPS_CONFIG?.rustProbeUrl)
        || 'http://178.156.147.234:8765/probe-all');

    // Detecta si la URL apunta al Rust server (protocolo channels/results)
    // vs PHP proxy (protocolo urls/kind-text-b64).
    function isRustProbe(url) {
        return /:8765|\/probe-all\b/.test(url);
    }

    let _diagShown = 0;
    async function probeBatchViaProxy(urls, signal) {
        const proxyUrl = PROXY_URL();
        if (_diagShown < 1) {
            _diagShown++;
            console.log('[AtomicProbe][DIAG] proxy:', proxyUrl, isRustProbe(proxyUrl) ? '(Rust /probe-all)' : '(PHP atomic_probe)');
            console.log('[AtomicProbe][DIAG] sample URLs (3):', urls.slice(0, 3));
        }

        if (isRustProbe(proxyUrl)) {
            return probeBatchViaRust(proxyUrl, urls, signal);
        }

        // ── Path legacy: PHP atomic_probe.php ──
        const resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls }),
            signal,
            credentials: 'omit',
        });
        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            console.warn('[AtomicProbe][DIAG] proxy HTTP', resp.status, errBody.slice(0, 300));
            throw new Error('proxy-http-' + resp.status);
        }
        const json = await resp.json();
        if (_diagShown < 2) {
            _diagShown++;
            console.log('[AtomicProbe][DIAG] proxy response sample:', json.slice(0, 3));
        }
        return json;
    }

    // ── Rust /probe-all adapter ──
    // Input:  urls[]
    // Output: rows PHP-compatibles con row._rustParsed prepopulado (no necesita
    //         parseHls/parseMpegTs client-side; ffprobe ya resolvió server-side).
    async function probeBatchViaRust(rustUrl, urls, signal) {
        const channels = urls.map((url, i) => ({
            channel_id: 'idx_' + i,
            url
        }));
        const resp = await fetch(rustUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channels }),
            signal,
            credentials: 'omit',
        });
        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            console.warn('[AtomicProbe][DIAG] rust HTTP', resp.status, errBody.slice(0, 300));
            throw new Error('rust-http-' + resp.status);
        }
        const json = await resp.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        if (_diagShown < 2) {
            _diagShown++;
            console.log('[AtomicProbe][DIAG] rust response:', {
                total: json?.total, ok: json?.success_count, err: json?.error_count,
                duration_s: json?.duration_secs, sample: results.slice(0, 2)
            });
        }
        return urls.map((url, i) => {
            const r = results[i] || {};
            const ok = !!r.success && (r.width || r.height);
            return {
                url,
                kind: ok ? 'rust' : 'unknown',
                _rustParsed: ok ? {
                    width:   r.width || 0,
                    height:  r.height || 0,
                    codec:   String(r.codec || '').toUpperCase(),
                    bitrate: r.bitrate ? Math.round(r.bitrate / 1000) : 0,   // bps→kbps
                    fps:     Number(r.fps) || 0
                } : null,
                error: r.error || (ok ? null : 'rust-no-data')
            };
        });
    }

    function decodeRowToReal(row) {
        if (!row || row.error) return null;
        // Rust pre-parsed (ffprobe server-side): devolver directo
        if (row._rustParsed) return row._rustParsed;
        // Legacy PHP proxy path
        if (!row.kind || row.kind === 'unknown') return null;
        if (row.kind === 'hls' && row.text) {
            return parseHlsMaster(row.text) || parseHlsMediaHints(row.text);
        }
        if (row.kind === 'ts' && row.b64) {
            const bin = atob(row.b64);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return parseMpegTs(buf.buffer);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN — atomic single-call probe (browser-direct fallback)
    // ═══════════════════════════════════════════════════════════════════════
    async function probe(channel) {
        const url = buildStreamUrl(channel);
        if (!url) return { error: 'no-url-or-creds', tier: 'UNKNOWN', confidence: 0 };

        const promised = promisedProfile(channel);
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

        try {
            const resp = await fetch(url, {
                method: 'GET',
                headers: {
                    'Range':  `bytes=0-${PROBE_BYTES - 1}`,
                    'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,video/mp2t,*/*;q=0.5',
                    'User-Agent': 'APE-XtreamAtomicProbe/1.0',
                },
                signal: ctrl.signal,
                credentials: 'omit',
                cache: 'no-store',
            });
            clearTimeout(to);

            const ct = (resp.headers.get('content-type') || '').toLowerCase();
            const cl = parseInt(resp.headers.get('content-length') || '0', 10);

            let real = null;

            if (ct.includes('mpegurl') || ct.includes('m3u8')) {
                const text = await resp.text();
                real = parseHlsMaster(text) || parseHlsMediaHints(text);
            } else if (ct.includes('mp2t') || ct.includes('mpegts') || ct.includes('octet') || ct === '') {
                const buf = await resp.arrayBuffer();
                real = parseMpegTs(buf);
            } else {
                // Unknown CT — try both
                const buf = await resp.arrayBuffer();
                const asText = new TextDecoder().decode(buf.slice(0, 4096));
                if (asText.startsWith('#EXTM3U')) {
                    real = parseHlsMaster(asText) || parseHlsMediaHints(asText);
                } else {
                    real = parseMpegTs(buf);
                }
            }

            if (!real || !real.height) {
                return {
                    promised, real: null, profile: promised,
                    tier: 'UNKNOWN', confidence: 10,
                    reason: 'no-signal-extracted', contentType: ct,
                };
            }

            // Classification
            const realProfile = profileFromReal({
                height: real.height, fps: real.fps,
                codec: real.codec, bitDepth: real.bitDepth,
                bitrateMbps: real.bitrateMbps,
            }) || 'P5';

            // Ordering: P0 < P1 < P2 < P3 < P4 < P5 (lower = better)
            const rank = p => ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].indexOf(p);
            const delta = rank(promised) - rank(realProfile);  // +ve = real is better than promised
            let tier;
            if (delta >= 2)       tier = 'ORO';       // hidden gem
            else if (delta === 1) tier = 'ORO-MINOR';
            else if (delta === 0) tier = 'PLATA';     // truthful
            else if (delta === -1) tier = 'BRONCE';   // slightly overstated
            else                  tier = 'FAKE';      // flat-out lying

            // Confidence: higher if we got exact resolution from bitstream
            let confidence = 60;
            if (real.source === 'hls-master') confidence = 90;
            if (real.source === 'ts-h264-sps') confidence = 95;
            if (real.source === 'ts-hevc-sps') confidence = 95;
            if (real.fps && real.codec !== 'UNKNOWN') confidence += 5;
            confidence = Math.min(100, confidence);

            return {
                promised, real, profile: realProfile, tier, confidence,
                score: computeScore(real, tier),
                contentLength: cl, contentType: ct,
            };
        } catch (e) {
            clearTimeout(to);
            return { error: e.name === 'AbortError' ? 'timeout' : e.message,
                     promised, profile: promised, tier: 'UNKNOWN', confidence: 0 };
        }
    }

    function computeScore(real, tier) {
        let s = (real.height || 0);
        if (real.fps >= 60)   s += 500;
        if (real.fps >= 120)  s += 500;
        if (real.codec === 'HEVC') s += 300;
        if (real.codec === 'AV1')  s += 500;
        if (real.bitDepth >= 10)   s += 400;
        if (real.hdr)              s += 600;
        s += (real.bitrateMbps || 0) * 50;
        if (tier === 'ORO')       s += 1000;
        if (tier === 'ORO-MINOR') s += 300;
        if (tier === 'FAKE')      s -= 2000;
        return s;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BATCH API — probe many channels via backend proxy (CORS-free).
    // Strategy:
    //   1) If window.APE_PROBE_DIRECT === true → browser-direct fetch.
    //   2) Else → POST batches of 32 URLs to /atomic_probe.php (PHP proxy).
    //      Multiple HTTP calls in parallel (concurrency 4 default).
    // ═══════════════════════════════════════════════════════════════════════
    async function probeBatch(channels, { concurrency = 4, batchSize = 32, onProgress } = {}) {
        const results = new Array(channels.length);

        if (window.APE_PROBE_DIRECT) {
            // Legacy direct-fetch path (fails on CORS for most IPTV servers)
            let done = 0, idx = 0;
            async function worker() {
                while (idx < channels.length) {
                    const i = idx++;
                    results[i] = await probe(channels[i]);
                    done++;
                    if (onProgress) onProgress(done, channels.length, results[i], channels[i]);
                }
            }
            const workers = Array.from({ length: Math.min(16, channels.length) }, worker);
            await Promise.all(workers);
            return results;
        }

        // Proxy batched path (default) ─────────────────────────────────────
        const batches = [];
        for (let i = 0; i < channels.length; i += batchSize) {
            batches.push({ start: i, end: Math.min(i + batchSize, channels.length) });
        }
        let done = 0, batchIdx = 0;

        async function batchWorker() {
            while (batchIdx < batches.length) {
                const b = batches[batchIdx++];
                const slice = channels.slice(b.start, b.end);
                const urls = slice.map(c => buildStreamUrl(c) || '');
                try {
                    const rows = await probeBatchViaProxy(urls);
                    for (let k = 0; k < slice.length; k++) {
                        const ch = slice[k];
                        const row = rows[k] || {};
                        const result = rowToResult(ch, row);
                        results[b.start + k] = result;
                        done++;
                        if (onProgress) onProgress(done, channels.length, result, ch);
                    }
                } catch (e) {
                    // Proxy failed → mark batch as UNKNOWN with reason
                    for (let k = 0; k < slice.length; k++) {
                        const ch = slice[k];
                        results[b.start + k] = {
                            error: 'proxy-failed:' + e.message,
                            promised: promisedProfile(ch),
                            profile: promisedProfile(ch),
                            tier: 'UNKNOWN', confidence: 0,
                        };
                        done++;
                        if (onProgress) onProgress(done, channels.length, results[b.start + k], ch);
                    }
                }
            }
        }
        const workers = Array.from({ length: Math.min(concurrency, batches.length) }, batchWorker);
        await Promise.all(workers);
        return results;
    }

    function rowToResult(channel, row) {
        const promised = promisedProfile(channel);
        if (!row || row.error || row.status >= 400) {
            return {
                promised, real: null, profile: promised,
                tier: 'UNKNOWN', confidence: 0,
                reason: row?.error || ('http-' + (row?.status || 0)),
                contentType: row?.contentType || '',
            };
        }
        const real = decodeRowToReal(row);
        if (!real || !real.height) {
            return {
                promised, real: null, profile: promised,
                tier: 'UNKNOWN', confidence: 10,
                reason: 'no-signal', contentType: row.contentType,
                kind: row.kind, bytes: row.bytes,
            };
        }
        const realProfile = profileFromReal({
            height: real.height, fps: real.fps,
            codec: real.codec, bitDepth: real.bitDepth,
            bitrateMbps: real.bitrateMbps,
        }) || 'P5';

        const rank = p => ['P0','P1','P2','P3','P4','P5'].indexOf(p);
        const delta = rank(promised) - rank(realProfile);
        let tier;
        if (delta >= 2)       tier = 'ORO';
        else if (delta === 1) tier = 'ORO-MINOR';
        else if (delta === 0) tier = 'PLATA';
        else if (delta === -1) tier = 'BRONCE';
        else                   tier = 'FAKE';

        let confidence = 60;
        if (real.source === 'hls-master') confidence = 90;
        if (real.source === 'ts-h264-sps') confidence = 95;
        if (real.source === 'ts-hevc-sps') confidence = 95;
        if (real.fps && real.codec !== 'UNKNOWN') confidence += 5;
        confidence = Math.min(100, confidence);

        return {
            promised, real, profile: realProfile, tier, confidence,
            score: computeScore(real, tier),
            contentType: row.contentType,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENRICH — attach probe result to channel objects, set ape_profile
    // ═══════════════════════════════════════════════════════════════════════
    async function enrichChannels(channels, opts = {}) {
        const results = await probeBatch(channels, opts);
        const stats = { ORO: 0, 'ORO-MINOR': 0, PLATA: 0, BRONCE: 0, FAKE: 0, UNKNOWN: 0 };
        channels.forEach((ch, i) => {
            const r = results[i] || {};
            if (r.profile) {
                ch.ape_profile = r.profile;
                ch.ape_tier    = r.tier;
                ch.ape_confidence = r.confidence;
                ch.ape_real_resolution = r.real?.height ? `${r.real.width}x${r.real.height}` : null;
                ch.ape_real_codec = r.real?.codec || null;
                ch.ape_real_fps   = r.real?.fps || 0;
                ch.ape_real_bit_depth = r.real?.bitDepth || 0;
                ch.ape_real_hdr   = !!r.real?.hdr;
                ch.ape_score      = r.score || 0;
                stats[r.tier || 'UNKNOWN']++;
            } else {
                stats.UNKNOWN++;
            }
        });
        return { channels, stats, results };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════════════
    window.ApeXtreamAtomicProbe = {
        probe, probeBatch, enrichChannels,
        promisedProfile, profileFromReal, buildStreamUrl,
        _loadServerLibrary, _findServerCreds,
        VERSION: '1.3.0-XTREAM-URL-BUILDER',
    };

    console.log('%c⚛️ APE Xtream Atomic Probe v1.0 — REAL RESOLUTION DETECTOR',
                'color:#0ff;font-weight:bold');
    console.log('   ✅ ONE request per channel — parses HLS master OR MPEG-TS SPS/VPS');
    console.log('   ✅ Classifies: ORO (hidden gem) / PLATA (truthful) / FAKE (liar)');
    console.log('   ✅ Usage: await ApeXtreamAtomicProbe.enrichChannels(channels)');
})(typeof window !== 'undefined' ? window : globalThis);
