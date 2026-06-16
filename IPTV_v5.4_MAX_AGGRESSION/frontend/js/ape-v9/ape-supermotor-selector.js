/**
 * APE SUPERMOTOR SELECTOR — MOTOR 2 ("DEVUELVE LO MEJOR" por player)
 * -----------------------------------------------------------------
 * Consume el canonical_record del homologador (Motor 1) + el perfil del player
 * y devuelve la MEJOR config HONESTA que ESE player puede decodificar.
 *
 * "Lo mejor" = el tier visual más alto decodificable por el device, SIN mentir:
 *   - piso codec HEVC Main10 (hvc1.2.*) si el device lo soporta; si no, baja por
 *     la cadena hasta el rung terminal AVC (nunca pierde el canal → FREEZELESS).
 *   - usa la resolución REAL del probe (resolution_real), no la declarada inflada
 *     (detecta y BLOQUEA fake-4K). HDR solo si hay probe (range/hdr_mode reales).
 *   - URL de reproducción VERBATIM (SHIELDED 5). Headers sin los 9 tóxicos.
 *   - Main10 sin probe → marcado PREFERRED-not-verified (no -REAL).
 *
 * Esta es la lógica de DECISIÓN que el hot-path Rust del VPS replica (mismas reglas,
 * enteros/µs). Aquí, portable JS (Node/browser), validable y testeable. AUTOPISTA:
 * cómputo puro, sin I/O bloqueante.
 */
(function (global) {
    'use strict';

    // Tabla nivel HEVC ↔ resolución+fps (Annex A; el nivel debe cargar res+fps)
    // value = [maxWxH-area-ok-hint, label]. Se usa para elegir el nivel correcto.
    var HEVC_LEVEL = [
        { lvl: 'L90', w: 854, h: 480, fps: 30 },
        { lvl: 'L93', w: 1280, h: 720, fps: 30 },
        { lvl: 'L120', w: 1920, h: 1080, fps: 30 },
        { lvl: 'L123', w: 1920, h: 1080, fps: 60 },
        { lvl: 'L126', w: 1920, h: 1080, fps: 120 },   // 1080p@120 (Level 4.2) — evita sobre-declarar 4K@120 con MEMC fps=120 (council S6/S3)
        { lvl: 'L150', w: 3840, h: 2160, fps: 30 },
        { lvl: 'L153', w: 3840, h: 2160, fps: 60 },
        { lvl: 'L156', w: 3840, h: 2160, fps: 120 },
        { lvl: 'L180', w: 7680, h: 4320, fps: 30 },
        { lvl: 'L183', w: 7680, h: 4320, fps: 60 },
        { lvl: 'L186', w: 7680, h: 4320, fps: 120 }
    ];
    var TOXIC = { 'range': 1, 'if-none-match': 1, 'if-modified-since': 1, 'te': 1, 'priority': 1, 'upgrade-insecure-requests': 1, 'dnt': 1 };

    function parseRes(s) {
        var m = String(s || '').match(/(\d{2,5})\s*[xX]\s*(\d{2,5})/);
        return m ? { w: +m[1], h: +m[2] } : null;
    }
    // nivel HEVC MÍNIMO que carga (w,h,fps) — nunca por debajo (anti-freeze)
    function levelFor(w, h, fps) {
        fps = fps || 30;
        for (var i = 0; i < HEVC_LEVEL.length; i++) {
            var L = HEVC_LEVEL[i];
            if (L.w >= w && L.h >= h && L.fps >= fps) return L.lvl;
        }
        return 'L186';
    }
    function main10(level) { return 'hvc1.2.4.' + level + '.B0'; } // Main10 floor

    /**
     * select(record, player) → selection_response
     * record  : canonical_record del Motor 1 (con B/C/D/E)
     * player  : { family, ua, caps:{hevc_main10,hevc_main8,av1,avc,max_resolution,max_fps,hdr,adb_plane} }
     */
    function select(record, player) {
        record = record || {}; player = player || {};
        var B = record.B || {}, C = record.C || {}, D = record.D || {}, E = record.E || {};
        var caps = player.caps || {}; var blocked = [];

        // 1) DECODE HONESTO (freeze-safe): el codec/nivel SIGUE la resolución REAL del stream,
        //    porque el decoder decodifica el stream real. NUNCA declarar 4K al decoder sobre fuente
        //    1080p (eso es el freeze 2026-06-08). El 4K es target de RENDER (upscale del device), aparte.
        var declared = parseRes(C.resolution);
        var real = parseRes(C.resolution_real);
        var decode = real || declared || { w: 1920, h: 1080 };
        var devRes = parseRes(caps.max_resolution);
        if (devRes && (devRes.w < decode.w || devRes.h < decode.h)) decode = devRes;   // cap de DECODE por device
        var fps = Math.min(Number(C.framerate) || 30, Number(caps.max_fps) || 120);

        // 2) ENHANCEMENT — MÉTODO HEVC CRYSTAL (doctrina ape-vps-hevc-crystal-integrator + usuario 2026-06-11):
        //    "aumenta los valores que llegan de la forma que sea, da más definición a la señal".
        //    SIEMPRE activo: sube un tier lo que llegue (sub-4K→4K, ≥4K→8K) con el set Crystal completo.
        //    Es una DIRECTIVA al device (post-decode: su MEMC/SR/SoC la aplica); el VPS NO renderiza píxeles.
        //    El decode/codec quedan HONESTOS (nivel = resolución real → freeze-safe); player incompatible
        //    ignora la directiva (RFC 8216 §6.3.1, inerte → nunca freeze). NO es un claim falso en STREAM-INF.
        var FOURK = { w: 3840, h: 2160 }, EIGHTK = { w: 7680, h: 4320 };
        var hdrIntent = C.hdr_mode || (C.range === 'PQ' || C.range === 'HLG' ? C.range : 'SDR');
        var atLeast4K = (decode.w >= FOURK.w && decode.h >= FOURK.h);
        // RANGO 480p..1080p (sub-4K) → TODAS las técnicas China Box + Crystal al MÁXIMO (usuario 2026-06-11).
        // ≥4K → target 8K, intensidad alta. Intención PRIVADA + lo aplica el device (MEMC/SR/SoC); decode
        // HONESTO (freeze-safe); player incompatible la ignora (RFC 8216 §6.3.1). NO claim público falso.
        var sub4K = !atLeast4K;
        var target = atLeast4K ? EIGHTK : FOURK;
        var intensity = sub4K ? 0.92 : 0.80;
        var srcIsHDR = (C.range === 'PQ' || C.range === 'HLG');
        var enhancement = {
            activate: true,
            method: 'HEVC-CRYSTAL+CHINA-BOX',
            intensity: intensity,
            virtual_uhd: true,
            target_resolution: target.w + 'x' + target.h,
            upscale_engine: 'ZSCALE-LANCZOS',
            super_resolution: { ai_sr: true, model: 'realesrgan', scale: sub4K ? 4 : 2, strength: sub4K ? 'max' : 'strong' },
            memc: { enabled: true, fps_target: 120, model: 'rife_v4', mode: 'mci_aobmc' },
            sharpen: { unsharp: true, luma: sub4K ? 1.2 : 1.0, chroma: 0.3 },
            denoise: { hqdn3d: true, nr_low_on_motion: true },          // bajo en deporte → anti-judder (China Box ref)
            color: {
                // IA SDR→HDR (inverse tone-mapping NEURAL, no un simple tone-map) cuando la fuente es SDR.
                ai_sdr2hdr: {
                    enabled: !srcIsHDR, model: 'hdrnet_itm', strength: sub4K ? 'max' : 'strong',
                    inverse_tone_map: true, peak_nits: 1000, expand_gamut: true, highlight_recovery: true
                },
                sdr2hdr: !srcIsHDR,                                     // flag legacy (device sin engine IA)
                hdr_target: (hdrIntent !== 'SDR') ? hdrIntent : 'HDR10',
                bt2020: true, tone_mapping: 'hable'
            },
            bitrate_overdrive: { vbr: true, factor: 2 },
            // CHINA BOX P0-P5 propagación al MÁXIMO para 480-1080 (intención PRIVADA + upscale del device)
            china_box: {
                propagation: sub4K ? 'P0-P5_MAX_480_TO_1080' : 'high_ge_4k',
                floor_lock: { enabled: true, strength: sub4K ? 'max' : 'strong', anti_washout: true, anti_crush: true },
                device_scaler_pref: ['device_ai_sr', 'huawei_ai_sr', 'amlogic', 'tv_scaler'],
                virtual_label: 'virtual_uhd_appearance_intent_private',  // INTENT privada, NO claim público
                artifact_suppression: { deblock: true, deband: true, mosquito: true, strength: sub4K ? 'very_strong_guarded' : 'strong' },
                motion_and_refresh: { memc: true, refresh_match: true, judder_guard: true },
                vendor_hints: { hdr_policy: 'sink_or_source_private', sdr2hdr_enable: 'hint_only', persist_vendor: 'hint_only' },
                source_truth_policy: 'no_public_pq_hlg_or_uhd_claim_without_probe',
                validation_guards: { fake_hdr_public_blocked: true, fake_uhd_public_blocked: true }
            },
            requires_device_engine: true                                // el device aplica; si no puede, ignora (inerte)
        };

        // 3) CODEC: piso Main10 si el device decodifica 10-bit; si no, baja por la cadena.
        //    El nivel sigue la resolución de DECODE (real), NO el target de enhancement (freeze-safe).
        var chain = [];
        var lvl = levelFor(decode.w, decode.h, fps);
        if (caps.hevc_main10 !== false) chain.push(main10(lvl));            // preferido Main10
        if (caps.av1) chain.push('av01.0.15M.10');                          // alternativa avanzada
        if (caps.hevc_main8) chain.push('hvc1.1.6.' + lvl + '.B0');         // 8-bit si solo eso
        chain.push('avc1.640028');                                         // rung terminal AVC (NUNCA falta)

        var chosenCodec = chain[0];
        // ¿hay probe que confirme la fuente como ese codec? si no → PREFERRED-not-verified
        var verified = !!(record._probe_verified || C.codec_verified);
        // si el device NO hace Main10, el chosen baja al primer rung que sí soporta
        if (chosenCodec.indexOf('hvc1.2') === 0 && caps.hevc_main10 === false) {
            chosenCodec = chain.find(function (c) { return c.indexOf('hvc1.2') !== 0; }) || 'avc1.640028';
        }

        // 4) headers seguros (sin los 9 tóxicos)
        var headersSafe = {};
        var H = (D.headers) || {};
        Object.keys(H).forEach(function (k) { if (!TOXIC[k.toLowerCase()]) headersSafe[k] = H[k]; });
        // marcar tóxicos detectados en E
        Object.keys(E).forEach(function (k) { if (k.indexOf('_toxic.') === 0) blocked.push('toxic-header:' + k.slice(7)); });

        // 5) cubo E evasión/exploit → BLOCK (no se propaga)
        Object.keys(E).forEach(function (k) {
            if (/bypass|sandvine|exploit|spoof|phantom|hydra|circuit-breaker/i.test(k + JSON.stringify(E[k]))) blocked.push('cubo-E:' + k);
        });

        // 6) score de confianza (solo penaliza codec no verificado + cubo E real, NO el enhancement)
        var score = 100;
        if (!verified) score -= 15;             // codec no verificado
        if (blocked.length) score -= Math.min(40, blocked.length * 8);
        if (score < 0) score = 0;

        return {
            session_id: player.session_id || null,
            channel_key: record._key || null,
            playback_url: record._provider_url || '',   // VERBATIM
            chosen: {
                codec: chosenCodec,
                codec_preferred_not_verified: !verified,
                resolution: decode.w + 'x' + decode.h,   // DECODE real (el codec/nivel le corresponde)
                framerate: fps,
                hdr: hdrIntent,                          // intent del catálogo, NO se fuerza a SDR
                enhancement: enhancement,                // upgrade activado para sub-4K (virtual-4K/MEMC/SDR2HDR)
                buffer_knobs: D.qoe || {},
                headers_safe: headersSafe,
                subtitles_link2: record._subtitles_uri || null
            },
            score: score,
            fallback_chain: chain,
            blocked: blocked
        };
    }

    // selecciona para N players a la vez (20+) sobre el mismo record (por-player distinto)
    function selectMany(record, players) {
        return (players || []).map(function (p) { return select(record, p); });
    }

    var APESupermotorSelector = {
        VERSION: '1.0.0-motor2',
        select: select,
        selectMany: selectMany,
        levelFor: levelFor
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = APESupermotorSelector;
    global.APESupermotorSelector = APESupermotorSelector;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
