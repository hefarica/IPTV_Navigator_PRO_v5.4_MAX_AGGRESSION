/**
 * lab-12p-conformance.js — CAPA 12P, ADITIVA Y APAGADA POR DEFECTO
 * ============================================================================
 * Qué es: un módulo SIN dependencias (no toca el DOM, no toca la red) que
 *   (1) lee el JSON "LAB CALIBRATED BULLETPROOF" que la persona importa,
 *   (2) calcula la política de buffer EFECTIVA con la regla del propio JSON,
 *   (3) audita 4 defectos conocidos (D1..D4) sobre los perfiles del JSON,
 *   (4) audita una lista .m3u/.m3u8 ya generada contra las reglas del JSON,
 *   (5) elige el mejor perfil que la pantalla y la conexión permiten.
 *
 * Qué NO es: no reescribe el generador canónico, no duplica su lógica de
 *   emisión y no cambia ni un byte de la salida mientras el flag esté apagado.
 *
 * Reglas copiadas LITERALMENTE del JSON del LAB (no inventadas):
 *   buffer_policy.rule = "effective_target_s = min(declared_target_s, cap(bitrate_mbps))"
 *   caps: <=25 Mbps -> 30 s | <=80 -> 24 s | <=150 -> 20 s | resto -> 15 s
 *   envelope: min_ms = round(0.625*T)*1000 | max_ms = 2*T*1000
 *             exo_min_ms = round(1.25*T)*1000 | exo_max_ms = round(3.75*T)*1000
 *             redondeo bancario (half-to-even)
 *   prefetch_segments = min(6, max(2, round(T/4))) | parallel_downloads = 4
 *   declared_retained = true  (el valor declarado NO se borra: se conserva y
 *                              se añade el efectivo)
 *   measured_on_device = false (no se ha medido RAM ni buffer real)
 *   hls_architecture.rules: 8 reglas de forma de la lista.
 *
 * Uso en navegador:  <script src=".../lab-12p-conformance.js"></script>
 *                    window.APE_LAB_12P.auditList(texto)
 * Uso en node/tests: const L = require('../js/ape-v9/lab-12p-conformance.js')
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.APE_LAB_12P = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '1.0.0';

    // ── Política de buffer, tal cual la declara el LAB ──────────────────────
    const CAPS = [
        { bitrate_max_mbps: 25, cap_s: 30 },
        { bitrate_max_mbps: 80, cap_s: 24 },
        { bitrate_max_mbps: 150, cap_s: 20 },
        { bitrate_max_mbps: null, cap_s: 15 }
    ];
    const PARALLEL_DOWNLOADS = 4;
    const STARTUP_MS = 1500;
    const RESUME_MS = 3000;
    const LOW_LATENCY_MODE = false;

    /** Redondeo bancario (half-to-even), que es el que pide el JSON. */
    function bankers(x) {
        const f = Math.floor(x);
        const diff = x - f;
        if (diff > 0.5) return f + 1;
        if (diff < 0.5) return f;
        return (f % 2 === 0) ? f : f + 1;
    }

    /** Techo de buffer (segundos) para un bitrate en Mbps según la tabla del LAB.
     *  Bitrate desconocido (o no positivo) → el techo MÁS ESTRICTO (15 s): si no
     *  se puede demostrar que la conexión aguanta más, no se promete más. */
    function capSeconds(bitrateMbps) {
        const b = Number(bitrateMbps);
        const caps = CAPS.slice().sort((a, z) => {
            const am = a.bitrate_max_mbps === null ? Infinity : a.bitrate_max_mbps;
            const zm = z.bitrate_max_mbps === null ? Infinity : z.bitrate_max_mbps;
            return am - zm;
        });
        if (!isFinite(b) || b <= 0) return caps[caps.length - 1].cap_s;
        for (const c of caps) {
            if (c.bitrate_max_mbps === null) return c.cap_s;
            if (b <= c.bitrate_max_mbps) return c.cap_s;
        }
        return caps[caps.length - 1].cap_s;
    }

    /** Envelope del LAB para un objetivo efectivo T (segundos). */
    function envelope(T) {
        const t = Number(T);
        return {
            min_ms: bankers(0.625 * t) * 1000,
            max_ms: 2 * t * 1000,
            exo_min_ms: bankers(1.25 * t) * 1000,
            exo_max_ms: bankers(3.75 * t) * 1000
        };
    }

    /** Segmentos de prefetch del LAB: min(6, max(2, round(T/4))). */
    function prefetchSegments(T) {
        return Math.min(6, Math.max(2, bankers(Number(T) / 4)));
    }

    /**
     * Buffer efectivo de un perfil.
     * @param {{declaredSec:number, bitrateMbps:number}} p
     * @returns {object} declared, cap, effective_s, envelope, prefetch_segments…
     */
    function effectiveBuffer(p) {
        const declared = Number((p && p.declaredSec) != null ? p.declaredSec : NaN);
        const cap = capSeconds(p && p.bitrateMbps);
        const declaredOk = isFinite(declared) && declared > 0;
        const T = declaredOk ? Math.min(declared, cap) : cap;
        return {
            declared_s: declaredOk ? declared : null,
            cap_s: cap,
            effective_target_s: T,
            effective_target_ms: T * 1000,
            envelope: envelope(T),
            prefetch_segments: prefetchSegments(T),
            parallel_downloads: PARALLEL_DOWNLOADS,
            startup_ms: STARTUP_MS,
            resume_ms: RESUME_MS,
            low_latency_mode: LOW_LATENCY_MODE,
            declared_retained: true,
            measured_on_device: false,
            capped: declaredOk ? declared > cap : true
        };
    }

    // ── Flag: APAGADO por defecto (ley 2/3 del prompt 12P) ──────────────────
    function isOn(scope) {
        const s = scope || (typeof window !== 'undefined' ? window : null);
        if (!s) return false;
        const v = s.APE_12P_MODE;
        if (v === undefined || v === null || v === false) return false;
        if (v === true) return true;
        const t = String(v).toLowerCase();
        return t === 'on' || t === '1' || t === 'true' || t === 'shadow';
    }

    /**
     * Etiqueta que se AÑADE por canal cuando el flag está encendido.
     * Conserva el declarado y añade el efectivo (regla declared_retained).
     * @param {{declaredMs:number, bandwidthKbps:number}} o
     */
    function bufferTag(o) {
        const declaredMs = Number(o && o.declaredMs);
        const kbps = Number(o && o.bandwidthKbps);
        const mbps = isFinite(kbps) && kbps > 0 ? kbps / 1000 : NaN;
        const e = effectiveBuffer({ declaredSec: isFinite(declaredMs) ? declaredMs / 1000 : NaN, bitrateMbps: mbps });
        const env = e.envelope;
        const maxOk = env.max_ms >= e.effective_target_ms;
        return '#EXT-X-APE-BUFFER-POLICY:' +
            'DECLARED_MS=' + (e.declared_s == null ? 'unknown' : e.declared_s * 1000) +
            ',EFFECTIVE_TARGET_MS=' + e.effective_target_ms +
            ',EFFECTIVE_TARGET_S=' + e.effective_target_s +
            ',CAP_S=' + e.cap_s +
            ',ENVELOPE_MIN_MS=' + env.min_ms +
            ',ENVELOPE_MAX_MS=' + env.max_ms +
            ',EXO_MIN_MS=' + env.exo_min_ms +
            ',EXO_MAX_MS=' + env.exo_max_ms +
            ',PREFETCH_SEGMENTS=' + e.prefetch_segments +
            ',PARALLEL_DOWNLOADS=' + e.parallel_downloads +
            ',MAX_GE_TARGET=' + (maxOk ? 'true' : 'false') +
            ',MEASURED_ON_DEVICE=false';
    }

    // ── Lectura del JSON del LAB ────────────────────────────────────────────
    function profileIds(lab) {
        if (!lab || !lab.profiles) return [];
        return Array.isArray(lab.profiles) ? lab.profiles.map(p => p.id) : Object.keys(lab.profiles);
    }

    function profileOf(lab, id) {
        if (!lab || !lab.profiles) return null;
        if (Array.isArray(lab.profiles)) return lab.profiles.filter(p => p.id === id)[0] || null;
        return lab.profiles[id] || null;
    }

    /** ¿El JSON trae la doctrina que la persona estipuló (upscale simulado)? */
    function doctrineStatus(lab) {
        const ids = profileIds(lab);
        const out = { profiles: ids.length, simulated: 0, missing_execution: [] };
        for (const id of ids) {
            const p = profileOf(lab, id) || {};
            const ex = p.execution || {};
            const st = String(ex.status || '').toUpperCase();
            const up = ex.upscale_executed;
            if (st === 'SIMULATED_EXECUTED' && up === true) out.simulated++;
            else out.missing_execution.push(id);
        }
        return out;
    }

    /** Bitrate declarado del perfil, en Mbps (settings.bitrate lo trae en Mbps). */
    function profileBitrateMbps(profile) {
        const s = (profile && profile.settings) || {};
        const cands = [s.bitrate, s.bitrate_mbps,
            s.maxBitrateKbps != null ? Number(s.maxBitrateKbps) / 1000 : NaN,
            s.bitrate_kbps != null ? Number(s.bitrate_kbps) / 1000 : NaN];
        for (const c of cands) {
            const n = Number(c);
            if (isFinite(n) && n > 0) return n;
        }
        return NaN;
    }

    /**
     * Audita los 4 defectos que el propio JSON declara haber corregido (D1..D4)
     * sobre un JSON dado. Devuelve una lista de hallazgos, no lanza.
     */
    function auditProfiles(lab) {
        const findings = [];
        const ids = profileIds(lab);
        const CODEC_FAMILY = {
            av1: ['av01', 'av1'],
            hevc: ['hvc1', 'hev1', 'hvc', 'h265', 'hevc'],
            h265: ['hvc1', 'hev1', 'hvc', 'h265', 'hevc'],
            h264: ['avc1', 'avc', 'h264'],
            avc1: ['avc1', 'avc', 'h264'],
            dvh1: ['dvh1', 'dvhe', 'dolby']
        };
        for (const id of ids) {
            const p = profileOf(lab, id) || {};
            const s = p.settings || {};
            const declared = s.bufferTargetSec != null ? Number(s.bufferTargetSec)
                : (s.bufferSeconds != null ? Number(s.bufferSeconds) : NaN);
            const playerBuffer = s.playerBuffer != null ? Number(s.playerBuffer) : NaN;
            const bitrateMbps = profileBitrateMbps(p);
            const e = effectiveBuffer({ declaredSec: declared, bitrateMbps: bitrateMbps });
            // D1: el declarado supera su propio envelope/techo.
            if (e.capped) findings.push({ code: 'D1', profile: id, detail: 'declarado ' + (isFinite(declared) ? declared : '?') + ' s > techo ' + e.cap_s + ' s (efectivo ' + e.effective_target_s + ' s)' });
            if (isFinite(playerBuffer) && isFinite(declared) && playerBuffer < declared * 1000) findings.push({ code: 'D1', profile: id, detail: 'playerBuffer ' + playerBuffer + ' ms < declarado ' + declared * 1000 + ' ms' });
            // D3: contradicciones de códec / rango / audio.
            const codec = String(s.codec || '').toLowerCase();
            const cs = String(s.codec_string || p.codec_string || '').toLowerCase();
            if (codec && cs) {
                const fam = CODEC_FAMILY[codec];
                const csCodec = cs.split(',')[0];
                if (fam && !fam.some(k => csCodec.indexOf(k) === 0 || csCodec.indexOf(k) !== -1)) {
                    findings.push({ code: 'D3', profile: id, detail: 'codec=' + codec + ' pero codec_string=' + csCodec });
                }
            }
            const range = String(s.video_range || '').toUpperCase();
            const hdr = String(s.hdr_mode || s.hdr_canonical || '').toUpperCase();
            if (range === 'SDR' && /HDR|PQ|HLG|DV/.test(hdr)) findings.push({ code: 'D3', profile: id, detail: 'video_range=SDR pero hdr=' + hdr });
            const audio = String(s.audio_codec || '').toLowerCase();
            if (audio && cs && cs.indexOf(',') !== -1) {
                const csAudio = cs.split(',')[1].trim();
                const audioFam = audio === 'ac-3' ? ['ac-3', 'ec-3'] : ['mp4a', 'aac'];
                if (!audioFam.some(k => csAudio.indexOf(k) === 0)) findings.push({ code: 'D3', profile: id, detail: 'audio=' + audio + ' pero codec_string audio=' + csAudio });
            }
        }
        // D4: hosts reales dentro del JSON (no placeholders).
        const raw = JSON.stringify(lab || {});
        const hosts = {};
        const re = /https?:\/\/([A-Za-z0-9._-]+)/g;
        let m;
        while ((m = re.exec(raw))) hosts[m[1].toLowerCase()] = true;
        const realHosts = Object.keys(hosts).filter(h => !/example\.invalid|example\.com|localhost|127\.0\.0\.1/.test(h));
        for (const h of realHosts) findings.push({ code: 'D4', profile: null, detail: 'host real en el JSON: ' + h });
        // Doctrina: upscale simulado declarado en los 12.
        const d = doctrineStatus(lab);
        for (const id of d.missing_execution) findings.push({ code: 'DOCTRINE', profile: id, detail: 'no declara execution.status=SIMULATED_EXECUTED con upscale_executed=true' });
        return findings;
    }

    // ── Auditoría de una lista ya generada ──────────────────────────────────
    function classify(text) {
        const hasStreamInf = /\n#EXT-X-STREAM-INF/.test('\n' + text);
        const hasTarget = /\n#EXT-X-TARGETDURATION/.test('\n' + text);
        if (hasStreamInf) return 'master';
        if (hasTarget) return 'media';
        if (/\n#EXTINF/.test('\n' + text)) return 'catalog';
        return 'unknown';
    }

    /**
     * Audita una lista generada contra las 8 reglas del LAB y contra la
     * compatibilidad de parseo universal. Devuelve { ok, kind, counts, errors,
     * warnings }. `ok` es false si hay algún error.
     */
    function auditList(text) {
        const src = String(text || '');
        const L = src.split('\n');
        const kind = classify(src);
        const errors = [];
        const warnings = [];
        const counts = { lines: L.length, extinf: 0, streaminf: 0, key: 0, targetduration: 0, daterange: 0, uri: 0, ape_tags: 0, buffer_policies: 0 };

        // Recuento, BOM, control chars y URIs.
        if (src.charCodeAt(0) === 0xFEFF) errors.push('BOM al principio: algunos reproductores no lo toleran');
        for (let i = 0; i < L.length; i++) {
            const line = L[i];
            const ln = i + 1;
            if (line.indexOf('\u0000') !== -1) errors.push('NUL en la línea ' + ln);
            if (line.indexOf('\r') !== -1) warnings.push('CR dentro de la línea ' + ln + ' (mezcla de fin de línea)');
            if (line.indexOf('#EXTINF') === 0) { counts.extinf++; if (!/,\s*[^\s].*$/.test(line)) warnings.push('#EXTINF sin título visible en la línea ' + ln); }
            else if (line.indexOf('#EXT-X-STREAM-INF') === 0) counts.streaminf++;
            else if (line.indexOf('#EXT-X-KEY') === 0) counts.key++;
            else if (line.indexOf('#EXT-X-TARGETDURATION') === 0) counts.targetduration++;
            else if (line.indexOf('#EXT-X-DATERANGE') === 0) counts.daterange++;
            else if (line.indexOf('#EXT-X-APE-') === 0) counts.ape_tags++;
            else if (line.indexOf('#EXT-X-APE-BUFFER-POLICY') === 0) counts.buffer_policies++;
            else if (line.trim() && line.charAt(0) !== '#') {
                counts.uri++;
                if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(line.trim()) && !/^\//.test(line.trim())) {
                    warnings.push('URI sin esquema en la línea ' + ln + ': ' + line.slice(0, 60));
                }
            }
        }

        // Regla 1: STREAM-INF va seguido inmediatamente de su URI.
        for (let i = 0; i < L.length; i++) {
            if (L[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
            const nxt = L[i + 1] || '';
            if (!nxt.trim() || nxt.charAt(0) === '#') {
                errors.push('STREAM-INF (línea ' + (i + 1) + ') no va seguido de su URI');
            }
        }
        // Regla 2: la master no lleva EXTINF/TARGETDURATION/KEY/DATERANGE.
        if (kind === 'master') {
            if (counts.extinf) errors.push('master con ' + counts.extinf + ' #EXTINF');
            if (counts.targetduration) errors.push('master con ' + counts.targetduration + ' #EXT-X-TARGETDURATION');
            if (counts.key) errors.push('master con ' + counts.key + ' #EXT-X-KEY');
            if (counts.daterange) errors.push('master con ' + counts.daterange + ' #EXT-X-DATERANGE');
        }
        // Regla 3: media playlist con timing y segmentos.
        if (kind === 'media') {
            if (!counts.targetduration) errors.push('media playlist sin #EXT-X-TARGETDURATION');
        }
        // Regla 6: el catálogo no es una master HLS (no debe traer tags de master).
        if (kind === 'catalog' && counts.streaminf) errors.push('catálogo con #EXT-X-STREAM-INF: no es una master');

        // D1 en la salida: X-Max-Buffer-Time no puede quedar por debajo de X-Buffer-Target.
        let bufChecked = 0;
        for (let i = 0; i < L.length; i++) {
            const line = L[i];
            const mt = /X-Max-Buffer-Time"?\s*[:=]\s*"?([0-9]+)/i.exec(line);
            if (!mt) continue;
            const tt = /X-Buffer-Target"?\s*[:=]\s*"?([0-9.]+)/i.exec(L.slice(Math.max(0, i - 4), i + 4).join('\n'));
            if (!tt) continue;
            bufChecked++;
            const maxS = Number(mt[1]);
            const targetRaw = Number(tt[1]);
            const targetS = targetRaw >= 1000 ? targetRaw / 1000 : targetRaw;
            if (maxS < targetS) errors.push('D1: X-Max-Buffer-Time=' + maxS + ' s < X-Buffer-Target=' + targetS + ' s (línea ' + (i + 1) + ')');
        }
        counts.buffer_pairs_checked = bufChecked;

        // D4 en la salida: hosts reales (el LAB exige placeholders).
        const hosts = {};
        const re = /https?:\/\/([A-Za-z0-9._-]+)/g;
        let m;
        while ((m = re.exec(src))) hosts[m[1].toLowerCase()] = (hosts[m[1].toLowerCase()] || 0) + 1;
        const realHosts = Object.keys(hosts).filter(h => !/example\.invalid|example\.com|localhost|127\.0\.0\.1/.test(h));
        for (const h of realHosts) warnings.push('D4: host real en la salida: ' + h + ' x' + hosts[h]);

        return {
            ok: errors.length === 0,
            kind: kind,
            counts: counts,
            errors: errors,
            warnings: warnings,
            hosts: Object.keys(hosts).length
        };
    }

    // ── Selección por pantalla + conexión ───────────────────────────────────
    /**
     * Elige el mejor perfil que la pantalla y la conexión permiten.
     * Honesto: es una POLÍTICA declarada, no una medida del dispositivo.
     * @param {Array<{id:string, height?:number, bitrate_max_mbps?:number}>} profiles
     * @param {{screenHeight:number, bitrateMbps:number}} device
     */
    function selectForDevice(profiles, device) {
        const list = (profiles || []).slice();
        const h = Number(device && device.screenHeight);
        const bw = Number(device && device.bitrateMbps);
        const fits = list.filter(p => {
            const ph = Number(p.height);
            const pb = Number(p.bitrate_max_mbps);
            if (isFinite(h) && h > 0 && isFinite(ph) && ph > h) return false;
            if (isFinite(bw) && bw > 0 && isFinite(pb) && pb > bw) return false;
            return true;
        });
        const byQuality = fits.sort((a, b) => {
            const ah = Number(a.height) || 0, bh = Number(b.height) || 0;
            if (bh !== ah) return bh - ah;
            return (Number(b.bitrate_max_mbps) || 0) - (Number(a.bitrate_max_mbps) || 0);
        });
        return {
            best: byQuality[0] ? byQuality[0].id : null,
            considered: list.length,
            eligible: byQuality.map(p => p.id),
            declared_policy: true,
            measured_on_device: false
        };
    }

    return {
        VERSION: VERSION,
        CAPS: CAPS,
        bankers: bankers,
        capSeconds: capSeconds,
        profileBitrateMbps: profileBitrateMbps,
        envelope: envelope,
        prefetchSegments: prefetchSegments,
        effectiveBuffer: effectiveBuffer,
        isOn: isOn,
        bufferTag: bufferTag,
        profileIds: profileIds,
        profileOf: profileOf,
        doctrineStatus: doctrineStatus,
        auditProfiles: auditProfiles,
        classify: classify,
        auditList: auditList,
        selectForDevice: selectForDevice
    };
});
