/**
 * APE HEVC CASCADE SSOT — Tier-CodecString-Profile-Level-Capacidad-Rol
 * Mandato 2026-05-20/22 (HFRC): TODOS LOS CANALES CON hvc1.2.4.*** MÍNIMO.
 *                               SIN AV1, SIN H.264, SIN HEVC 8-bit.
 *                               13 tiers PURE HEVC Main 10 per CSV canónico.
 *
 * Fuente: HEVC_Cascada_Tier_Levels.csv (usuario, 2026-05-22)
 * Doctrina: MAX IMAGE FIRST (CLAUDE.md) + NO PLAYER-BREAKING LIES.
 * CORONA_TIER_NUMBER = 9 (L153 = 4K@60 UHD — slot CORONA del generador).
 *
 * Esta lib es PURO datos + helpers de inferencia. NO hace fetch, NO toca DOM,
 * NO escribe en lista. Solo se importa desde m3u8-typed-arrays-ultimate.js y
 * ape-fallback-resolver.js para resolver el codec string per-resolución.
 */
(function (global) {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // CASCADA 13-TIER (CSV SSOT) — PURE HEVC Main 10 / hvc1.2.4.***
    // Orden: T1 = mínimo absoluto (L30), T13 = techo absoluto (L186 8K@120)
    // CORONA_TIER_NUMBER = 9 → hvc1.2.4.L153.B0 (4K@60 UHD) — el generador
    // usa siempre TIER_BY_NUMBER[CORONA_TIER_NUMBER] para fake-4K y premium.
    // ────────────────────────────────────────────────────────────────────────
    const CORONA_TIER_NUMBER = 9;

    const HEVC_CASCADE_13TIER = Object.freeze([
        { tier: 1,  codec: 'hvc1.2.4.L30.B0',  codec_hev1: 'hev1.2.4.L30.B0',  profile: 'Main 10', level: '1.0', width: 128,  height: 96,   fps: 33.7, hdr: true, family: 'HEVC', role: 'Mínimo absoluto HEVC Main 10' },
        { tier: 2,  codec: 'hvc1.2.4.L60.B0',  codec_hev1: 'hev1.2.4.L60.B0',  profile: 'Main 10', level: '2.0', width: 352,  height: 288,  fps: 30,   hdr: true, family: 'HEVC', role: 'CIF baseline' },
        { tier: 3,  codec: 'hvc1.2.4.L63.B0',  codec_hev1: 'hev1.2.4.L63.B0',  profile: 'Main 10', level: '2.1', width: 640,  height: 360,  fps: 30,   hdr: true, family: 'HEVC', role: '360p HDR' },
        { tier: 4,  codec: 'hvc1.2.4.L90.B0',  codec_hev1: 'hev1.2.4.L90.B0',  profile: 'Main 10', level: '3.0', width: 960,  height: 540,  fps: 30,   hdr: true, family: 'HEVC', role: '540p HDR ultra-fallback' },
        { tier: 5,  codec: 'hvc1.2.4.L93.B0',  codec_hev1: 'hev1.2.4.L93.B0',  profile: 'Main 10', level: '3.1', width: 1280, height: 720,  fps: 30,   hdr: true, family: 'HEVC', role: '720p HDR 10-bit' },
        { tier: 6,  codec: 'hvc1.2.4.L120.B0', codec_hev1: 'hev1.2.4.L120.B0', profile: 'Main 10', level: '4.0', width: 1920, height: 1080, fps: 30,   hdr: true, family: 'HEVC', role: '1080p@30 10-bit (Main 12 Mbps / High 30 Mbps)' },
        { tier: 7,  codec: 'hvc1.2.4.L123.B0', codec_hev1: 'hev1.2.4.L123.B0', profile: 'Main 10', level: '4.1', width: 1920, height: 1080, fps: 60,   hdr: true, family: 'HEVC', role: '1080p@60 HDR (Main 20 Mbps / High 50 Mbps)' },
        { tier: 8,  codec: 'hvc1.2.4.L150.B0', codec_hev1: 'hev1.2.4.L150.B0', profile: 'Main 10', level: '5.0', width: 3840, height: 2160, fps: 30,   hdr: true, family: 'HEVC', role: '4K@30 HDR (Main 25 Mbps / High 100 Mbps)' },
        { tier: 9,  codec: 'hvc1.2.4.L153.B0', codec_hev1: 'hev1.2.4.L153.B0', profile: 'Main 10', level: '5.1', width: 3840, height: 2160, fps: 60,   hdr: true, family: 'HEVC', role: 'CORONA — 4K@60 HDR (Main 40 Mbps / High 160 Mbps)' },
        { tier: 10, codec: 'hvc1.2.4.L156.B0', codec_hev1: 'hev1.2.4.L156.B0', profile: 'Main 10', level: '5.2', width: 3840, height: 2160, fps: 120,  hdr: true, family: 'HEVC', role: '4K@120 HDR (Main 60 Mbps / High 240 Mbps)' },
        { tier: 11, codec: 'hvc1.2.4.L180.B0', codec_hev1: 'hev1.2.4.L180.B0', profile: 'Main 10', level: '6.0', width: 7680, height: 4320, fps: 30,   hdr: true, family: 'HEVC', role: '8K@30 HDR (Main 60 Mbps / High 240 Mbps)' },
        { tier: 12, codec: 'hvc1.2.4.L183.B0', codec_hev1: 'hev1.2.4.L183.B0', profile: 'Main 10', level: '6.1', width: 7680, height: 4320, fps: 60,   hdr: true, family: 'HEVC', role: '8K@60 HDR (Main 120 Mbps / High 480 Mbps)' },
        { tier: 13, codec: 'hvc1.2.4.L186.B0', codec_hev1: 'hev1.2.4.L186.B0', profile: 'Main 10', level: '6.2', width: 7680, height: 4320, fps: 120,  hdr: true, family: 'HEVC', role: '8K@120 HDR techo absoluto (Main 240 Mbps / High 800 Mbps)' }
    ]);

    // Acceso rápido por tier number (1-indexed, T1=mínimo, T13=máximo)
    const TIER_BY_NUMBER = Object.freeze(
        HEVC_CASCADE_13TIER.reduce((acc, t) => { acc[t.tier] = t; return acc; }, {})
    );

    // ────────────────────────────────────────────────────────────────────────
    // OVERRIDE RUNTIME (2026-05-21) — el widget Quality Manifest puede subir un
    // CSV que reemplaza los codec strings/profile/level por tier SIN editar JS.
    // La tabla ACTIVA (_activeTierByNumber) es la que consultan resolveTier* y el
    // generador. El default frozen se conserva para reset. El override solo
    // cambia la DECLARACIÓN CODECS= (no fuerza el códec físico del proveedor).
    // Persistencia: localStorage 'APE_CODEC_CASCADE_OVERRIDE' (in-browser, lo lee
    // el generador al grabar la lista). El widget además lo respalda en el VPS.
    // ────────────────────────────────────────────────────────────────────────
    const LS_KEY = 'APE_CODEC_CASCADE_OVERRIDE';
    let _activeCascade = HEVC_CASCADE_13TIER;
    let _activeTierByNumber = TIER_BY_NUMBER;

    function _familyFromCodec(c) {
        c = String(c || '').toLowerCase();
        if (c.indexOf('dvh1') === 0 || c.indexOf('dvhe') === 0) return 'DV';
        if (c.indexOf('hvc1') === 0 || c.indexOf('hev1') === 0) return 'HEVC';
        if (c.indexOf('av01') === 0) return 'AV1';
        if (c.indexOf('avc1') === 0) return 'H264';
        return '';
    }

    // Mezcla las filas del CSV SOBRE el default por número de tier. Solo sobre-
    // escribe los campos presentes en el CSV (codec/profile/level/role/capability);
    // preserva la geometría (width/height/fps/hdr) del tier — el routing por
    // resolución NO cambia, solo el codec string que se declara en ese escalón.
    function _mergeOntoDefault(rows) {
        return HEVC_CASCADE_13TIER.map((def) => {
            const ov = rows.find((r) => Number(r.tier) === def.tier);
            if (!ov) return def;
            const codec = (ov.codec && String(ov.codec).trim()) || def.codec;
            const codec_hev1 = (ov.codec_hev1 && String(ov.codec_hev1).trim())
                || (codec.startsWith('hvc1') ? codec.replace(/^hvc1/, 'hev1') : codec);
            return Object.freeze({
                tier: def.tier,
                codec: codec,
                codec_hev1: codec_hev1,
                profile: (ov.profile && String(ov.profile).trim()) || def.profile,
                level: (ov.level !== undefined && ov.level !== '') ? String(ov.level).trim() : def.level,
                width: Number(ov.width) || def.width,
                height: Number(ov.height) || def.height,
                fps: Number(ov.fps) || def.fps,
                hdr: (ov.hdr !== undefined) ? !!ov.hdr : def.hdr,
                family: (ov.family && String(ov.family).trim()) || _familyFromCodec(codec) || def.family,
                role: (ov.role && String(ov.role).trim()) || def.role,
                capability: (ov.capability && String(ov.capability).trim()) || def.capability || def.role
            });
        });
    }

    // setCascade(rows) — aplica un override (no persiste si persist=false).
    // rows: [{tier, codec, profile?, level?, role?, capability?}], tiers 1..13.
    function setCascade(rows, persist) {
        if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'cascade vacía' };
        const valid = rows.filter((r) => r && Number(r.tier) >= 1 && Number(r.tier) <= 13 && r.codec);
        if (valid.length === 0) return { ok: false, error: 'ninguna fila válida (tier 1-13 + codec requerido)' };
        const merged = _mergeOntoDefault(valid);
        _activeCascade = Object.freeze(merged);
        _activeTierByNumber = Object.freeze(merged.reduce((a, t) => { a[t.tier] = t; return a; }, {}));
        if (persist !== false && typeof localStorage !== 'undefined') {
            try { localStorage.setItem(LS_KEY, JSON.stringify(valid)); } catch (_) {}
        }
        return { ok: true, tiers: merged.length, overridden: valid.length };
    }

    function resetCascade() {
        _activeCascade = HEVC_CASCADE_13TIER;
        _activeTierByNumber = TIER_BY_NUMBER;
        if (typeof localStorage !== 'undefined') {
            try { localStorage.removeItem(LS_KEY); } catch (_) {}
        }
        return { ok: true };
    }

    function getActiveCascade() { return _activeCascade; }
    function isOverridden() { return _activeCascade !== HEVC_CASCADE_13TIER; }

    // parseCascadeCSV — SSOT del parseo. Acepta separador ';' (ES-ES) o ','.
    // Formato legacy (6 cols): Tier;Codec String;Profile;Level;Capacidad;Rol
    // Formato dual  (7 cols): Tier;Codec String hvc1;Codec String hev1;Profile;Level;Capacidad;Rol
    // Autodetección por presencia de 'hev1' en el header.
    function parseCascadeCSV(text) {
        const out = [];
        const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
        if (lines.length === 0) return out;
        const sep = (lines[0].indexOf(';') >= 0) ? ';' : ',';
        let start = 0;
        // saltar header si la primera celda no es numérica
        const firstCell = lines[0].split(sep)[0].trim().toLowerCase();
        if (isNaN(Number(firstCell)) || firstCell === '') start = 1;
        // Detectar formato dual: header contiene 'hev1'
        const headerLine = start > 0 ? lines[0].toLowerCase() : '';
        const isDual = headerLine.indexOf('hev1') >= 0;
        for (let i = start; i < lines.length; i++) {
            const cols = lines[i].split(sep).map((c) => c.trim());
            const tier = Number(cols[0]);
            if (!(tier >= 1 && tier <= 13)) continue;
            if (isDual) {
                // Formato dual: Tier | hvc1 | hev1 | Profile | Level | Capacidad | Rol
                const c = cols[1] || '';
                out.push({
                    tier:       tier,
                    codec:      c,
                    codec_hev1: cols[2] || (c.startsWith('hvc1') ? c.replace(/^hvc1/, 'hev1') : c),
                    profile:    cols[3] || '',
                    level:      cols[4] || '',
                    capability: cols[5] || '',
                    role:       cols[6] || ''
                });
            } else {
                // Formato legacy: Tier | Codec String | Profile | Level | Capacidad | Rol
                const c = cols[1] || '';
                out.push({
                    tier:       tier,
                    codec:      c,
                    codec_hev1: c.startsWith('hvc1') ? c.replace(/^hvc1/, 'hev1') : c,
                    profile:    cols[2] || '',
                    level:      cols[3] || '',
                    capability: cols[4] || '',
                    role:       cols[5] || ''
                });
            }
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────────────
    // resolveTierByResolution — mapea (width, height, fps) → tier object
    // ────────────────────────────────────────────────────────────────────────
    // Búsqueda MAX-RESOLUCIÓN → mínimo dentro de hvc1.2.4.*** (mismo familia).
    // T1=mínimo absoluto (L30) ... T13=techo absoluto (L186 8K@120).
    // CORONA = T9 (L153 = 4K@60 UHD) — usar CORONA_TIER_NUMBER para fake-4K.
    //
    //   opts.preferAv1         → ignorado (no AV1 en esta familia), usa T7 (1080p@60)
    //   opts.forceH264Fallback → ignorado (no H264), usa T5 (720p HEVC fallback)
    //   opts.degradeToBottom   → fuerza T1 (mínimo absoluto L30)
    //
    // Default cuando entrada inválida → T6 (1080p@30 Main 10 = L120).
    function resolveTierByResolution(width, height, fps, opts) {
        opts = opts || {};
        const T = _activeTierByNumber; // tabla ACTIVA (default o override CSV)
        if (opts.degradeToBottom)   return T[1];
        // H264/AV1 opts → remap al tier HEVC más cercano en capacidad
        if (opts.forceH264Fallback) return T[5];  // 720p HEVC → era H264 High
        if (opts.preferAv1)         return T[7];  // 1080p@60 HEVC → era AV1 1080p@60

        const w = Number(width)  || 1920;
        const h = Number(height) || 1080;
        const f = Number(fps)    || 30;

        // 8K (7680×4320 o superior)
        if (w >= 7680 && h >= 4320) {
            if (f >= 100) return T[13];  // 8K@120 — techo absoluto
            if (f >= 50)  return T[12];  // 8K@60
            return T[11];                // 8K@30
        }
        // 4K (3840×2160 o superior, incluye DCI 4096)
        if (w >= 3840 && h >= 2160) {
            if (f >= 100) return T[10];  // 4K@120
            if (f >= 50)  return T[9];   // CORONA — 4K@60 UHD
            return T[8];                 // 4K@30
        }
        // QHD (2560×1440) → asimilar a 4K@30 por bandwidth
        if (w >= 2560 && h >= 1440) {
            return T[8];
        }
        // FHD (1920×1080)
        if (w >= 1920 && h >= 1080) {
            return f >= 50 ? T[7] : T[6];
        }
        // HD (1280×720)
        if (w >= 1280 && h >= 720) {
            return T[5];
        }
        // 540p (960×540)
        if (w >= 960 && h >= 540) {
            return T[4];
        }
        // 360p (640×360)
        if (w >= 640 && h >= 360) {
            return T[3];
        }
        // CIF / 288p
        if (w >= 352 && h >= 288) {
            return T[2];
        }
        // Default: 1080p@30 (T6 = L120) — tier más común y seguro
        return T[6];
    }

    // ────────────────────────────────────────────────────────────────────────
    // inferResolutionFromChannel — derive {width, height} desde nombre/grupo/perfil
    // ────────────────────────────────────────────────────────────────────────
    // Prioridad: nombre/grupo > perfil > default 1920×1080.
    // P0/P1/P2/P3/P4/P5 son perfiles APE (8K/4K/QHD/FHD/HD/SD nominalmente).
    function inferResolutionFromChannel(channel, profile) {
        const name  = String(channel?.name  || '').toLowerCase();
        const group = String(channel?.group || channel?.group_title || '').toLowerCase();
        const both  = name + ' ' + group;

        // Detección por nombre/grupo (más confiable que perfil)
        if (/\b(8k|4320p?|7680)\b/i.test(both)) return { width: 7680, height: 4320, source: 'NAME_8K' };
        if (/\b(4k|uhd|2160p?|3840)\b/i.test(both)) return { width: 3840, height: 2160, source: 'NAME_4K' };
        if (/\b(qhd|1440p?|2560)\b/i.test(both))    return { width: 2560, height: 1440, source: 'NAME_QHD' };
        if (/\b(fhd|full[\s-]?hd|1080p?|1920)\b/i.test(both)) return { width: 1920, height: 1080, source: 'NAME_FHD' };
        if (/\bhd\b|\b720p?\b|\b1280\b/i.test(both)) return { width: 1280, height: 720, source: 'NAME_HD' };
        if (/\b(sd|480p?|640x480)\b/i.test(both))   return { width: 640,  height: 480, source: 'NAME_SD' };
        if (/\b360p?\b/i.test(both))                return { width: 640,  height: 360, source: 'NAME_360' };

        // Fallback por perfil APE (P0=8K nominal pero suele ser falso → degradamos a 4K
        // para evitar declarar 8K en canales turcos mal taggeados).
        const p = String(profile || '').toUpperCase();
        if (p === 'P0') return { width: 3840, height: 2160, source: 'PROFILE_P0_AS_4K' };  // ⚠️ P0 nominal 8K, degradamos
        if (p === 'P1') return { width: 3840, height: 2160, source: 'PROFILE_P1' };
        if (p === 'P2') return { width: 2560, height: 1440, source: 'PROFILE_P2' };
        if (p === 'P3') return { width: 1920, height: 1080, source: 'PROFILE_P3' };
        if (p === 'P4') return { width: 1280, height: 720,  source: 'PROFILE_P4' };
        if (p === 'P5') return { width: 854,  height: 480,  source: 'PROFILE_P5' };

        // Default global: FHD 1080p (el más común y seguro)
        return { width: 1920, height: 1080, source: 'DEFAULT_FHD' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // inferFpsFromChannel — derive frame rate desde nombre/perfil
    // ────────────────────────────────────────────────────────────────────────
    function inferFpsFromChannel(channel, profile) {
        // Si el canal trae frame rate explícito (probe o LAB), respetarlo.
        if (channel && typeof channel.frames === 'number' && channel.frames > 0) {
            return channel.frames;
        }
        if (channel && typeof channel.frameRate === 'number' && channel.frameRate > 0) {
            return channel.frameRate;
        }

        const name  = String(channel?.name  || '').toLowerCase();
        const group = String(channel?.group || channel?.group_title || '').toLowerCase();
        const both  = name + ' ' + group;

        if (/\b(120fps|@120)\b/i.test(both)) return 120;
        if (/\b(60fps|@60)\b/i.test(both))   return 60;
        if (/\b(50fps|@50)\b/i.test(both))   return 50;
        if (/\b(24fps|@24)\b/i.test(both))   return 24;
        if (/\b(25fps|@25)\b/i.test(both))   return 25;

        // Deportes / live de movimiento → asumir 60fps (player respeta hint)
        if (/sport|deporte|dazn|espn|f1|ufc|liga|champions|nba|nfl|nhl|mlb|tennis/i.test(both)) {
            return 60;
        }

        return 30;
    }

    // ────────────────────────────────────────────────────────────────────────
    // resolveCodecForChannel — atajo all-in-one: canal + perfil → codec string
    // ────────────────────────────────────────────────────────────────────────
    function resolveCodecForChannel(channel, profile, opts) {
        const res = inferResolutionFromChannel(channel, profile);
        const fps = inferFpsFromChannel(channel, profile);
        const tier = resolveTierByResolution(res.width, res.height, fps, opts);
        return {
            codec: tier.codec,
            tier: tier.tier,
            tierObj: tier,
            width: res.width,
            height: res.height,
            fps: fps,
            resolutionSource: res.source
        };
    }

    // ────────────────────────────────────────────────────────────────────────
    // resolveCodecHev1ForChannel — igual que resolveCodecForChannel pero retorna
    // también codec_hev1 (para KODIPROP/EXTVLCOPT). Regla de oro:
    //   codec     → hvc1.* → manifest parser (STREAM-INF)
    //   codec_hev1 → hev1.* → decoder runtime (KODIPROP, EXTVLCOPT)
    // ────────────────────────────────────────────────────────────────────────
    function resolveCodecHev1ForChannel(channel, profile, opts) {
        const base = resolveCodecForChannel(channel, profile, opts);
        const tierObj = base.tierObj;
        return {
            codec:      base.codec,
            codec_hev1: tierObj.codec_hev1 || (base.codec.startsWith('hvc1')
                ? base.codec.replace(/^hvc1/, 'hev1')
                : base.codec),
            tier:             base.tier,
            tierObj:          tierObj,
            width:            base.width,
            height:           base.height,
            fps:              base.fps,
            resolutionSource: base.resolutionSource
        };
    }

    // ────────────────────────────────────────────────────────────────────────
    // generateProfileCascadeArrays — per-profile codec primary + fallback chain
    // ────────────────────────────────────────────────────────────────────────
    // Retorna un objeto P0-P5 donde cada perfil tiene:
    //   primary        → codec string del tier más alto aplicable a ese perfil
    //   tier           → número de tier (1-13)
    //   level          → nivel HEVC (e.g. "5.1")
    //   resolution     → WxH del tier seleccionado
    //   fps            → fps del perfil
    //   chain          → [{tier, codec, level, role}, ...] de primary→T1
    //   chain_codecs   → ['hvc1.2.4.Lxxx.B0', ...] flat, para codec_chain_video
    //
    // Mandato 2026-05-22 (HFRC): el generador usa esto como SSOT per-perfil;
    // cada perfil recibe su codec correcto de la familia hvc1.2.4.*** por resolución.
    // ────────────────────────────────────────────────────────────────────────
    const PROFILE_DIMS = Object.freeze({
        P0: { width: 3840, height: 2160, fps: 60 },   // 4K@60 CORONA
        P1: { width: 3840, height: 2160, fps: 60 },   // 4K@60
        P2: { width: 2560, height: 1440, fps: 60 },   // QHD@60
        P3: { width: 1920, height: 1080, fps: 30 },   // FHD@30
        P4: { width: 1280, height: 720,  fps: 30 },   // HD@30
        P5: { width: 854,  height: 480,  fps: 30 }    // SD@30
    });

    function generateProfileCascadeArrays() {
        const result = {};
        for (const profileName in PROFILE_DIMS) {
            const d = PROFILE_DIMS[profileName];
            const topTier = resolveTierByResolution(d.width, d.height, d.fps, {});
            // Cadena descendente: topTier → T1 (todos hvc1.2.4.*)
            const chain = [];
            for (let t = topTier.tier; t >= 1; t--) {
                const to = _activeTierByNumber[t];
                if (to) chain.push({ tier: t, codec: to.codec, level: to.level, role: to.role });
            }
            result[profileName] = Object.freeze({
                primary:      topTier.codec,
                tier:         topTier.tier,
                level:        topTier.level,
                resolution:   d.width + 'x' + d.height,
                fps:          d.fps,
                chain:        Object.freeze(chain),
                chain_codecs: Object.freeze(chain.map(function (c) { return c.codec; }))
            });
        }
        return Object.freeze(result);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Premium detection helper — replica regex del fallback resolver para que
    // el generador pueda decidir T1 (CORONA 4K@60) sin re-clasificar canal.
    // ────────────────────────────────────────────────────────────────────────
    const PREMIUM_RE = /4k|uhd|fhd|hevc|h265|h\.265|hdr|dolby|premium|dazn|espn|sport|sports|event|evento|movie|cine|ppv|liga|champions|nba|f1|ufc|hbo|max|netflix|disney|fox|sky|bein/i;

    function isPremiumChannel(channel) {
        const name  = String(channel?.name  || '');
        const group = String(channel?.group || channel?.group_title || '');
        return PREMIUM_RE.test(name) || PREMIUM_RE.test(group);
    }

    // [Council 2026-06-07 · S3+S9+S12 consensus] Detección "anti-freeze premium" más
    // estricta que PREMIUM_RE: NO incluye 'fhd|hevc|h265|h\.265' porque son tokens de
    // RESOLUCIÓN/FORMATO, no de CONTENIDO premium. Un canal "MyChannel FHD" genérico
    // NO debe quedar protegido como HEVC por incluir 'FHD' en el nombre — eso bypasea
    // el fix F4 anti-freeze para H.264 upstream común en FHD/HD genéricos.
    // BEIN/DAZN/HBO/etc. SÍ siguen siendo premium (contienen sus tokens reales).
    const ANTI_FREEZE_PREMIUM_RE = /4k|uhd|hdr|dolby|premium|dazn|espn|sport|sports|event|evento|movie|cine|ppv|liga|champions|nba|f1|ufc|hbo|max|netflix|disney|fox|sky|bein/i;

    function isAntiFreezePremium(channel) {
        const name  = String(channel?.name  || '');
        const group = String(channel?.group || channel?.group_title || '');
        return ANTI_FREEZE_PREMIUM_RE.test(name) || ANTI_FREEZE_PREMIUM_RE.test(group);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CODEC HOMOLOGATION CASCADE — REGLA UNIVERSAL 2026-06-07 HFRC mandato
    // ════════════════════════════════════════════════════════════════════════
    // DOCTRINA: cada player parsea con su propio dialecto del mismo codec
    //   • HEVC: hevc | hev1 | h265 | H265 | h.265 | H.265 | MPEG-H | x265 …
    //   • AVC:  h264 | H264 | h.264 | H.264 | avc | AVC | x264 …
    //   • AAC:  mp4a.40.2 | mp4a | aac | AAC …
    //   • AC3:  ac-3 | ac3 | AC3 | AC-3 …
    //   • EC3:  ec-3 | ec3 | eac3 | EAC3 …
    //
    // Declarar la cascada con TODOS los aliases en CADA emit site (preferred_codec,
    // codec-priority, avcodec-codec, etc.) garantiza que el matcher del player
    // encuentre al menos UN alias que reconoce — sin importar su naming convention
    // interna. Si solo declaramos "hevc", un player que internamente busca "h.265"
    // no degrada y freeza.
    //
    // GOLDEN RULE preservada: STREAM-INF CODECS= sigue RFC 6381 estricto (hvc1.*,
    // avc1.*). Las cascadas homologadas SOLO van en campos family-name
    // (KODIPROP preferred_codec, EXTVLCOPT preferred-codec/codec-priority).
    //
    // Orden: HEVC primero (MAX IMAGE FIRST), AVC fallback (compat universal).
    // Si el caller necesita AVC primero (F4 sin probe sin premium), use _AVC_FIRST.
    // ════════════════════════════════════════════════════════════════════════
    // MAXIMAL HOMOLOGATION 2026-06-07/2 — cada codec con TODAS sus variantes documentadas:
    // family + RFC (hev1/hvc1/avc1/avc3) + dot/dash/case mixed + ISO/IEC formal + encoder name.
    // Cubre cualquier parser/player ISO BMFF / DASH / HLS / DVB / Web / Smart TV / móvil.
    // Doctrina HEVC-FIRST: TODOS los HEVC homologs siempre antes que cualquier H264.
    const _HEVC_ALIASES = 'hevc,hev1,hev2,hvc1,hvc2,h265,H265,h.265,H.265,h-265,H-265,MPEG-H,mpeg-h,MPEG-H Part2,MPEG-H Part 2,mpegh,x265,x.265,ISO/IEC 23008-2';
    const _AVC_ALIASES  = 'h264,H264,h.264,H.264,h-264,H-264,avc,AVC,avc1,avc3,MPEG-4 AVC,mpeg4-avc,MPEG4-AVC,x264,ISO/IEC 14496-10';
    const _AV1_ALIASES  = 'av1,av01,AV1,AOM-AV1,libaom-av1';
    const _VP9_ALIASES  = 'vp9,VP9,vp09,vp9.0';
    const _AAC_ALIASES  = 'mp4a.40.2,mp4a.40.5,mp4a.40.29,mp4a,aac,AAC,aac-lc,AAC-LC,he-aac,HE-AAC,MPEG-4 AAC,MP4A';
    const _AC3_ALIASES  = 'ac-3,ac3,AC3,AC-3,dolby-digital,DOLBY-DIGITAL,Dolby Digital';
    const _EC3_ALIASES  = 'ec-3,ec3,eac3,EAC3,EC-3,ddp,DDP,dolby-digital-plus,Dolby Digital Plus';

    const CODEC_HOMOLOGATION = {
        // HEVC-FIRST CON TODOS LOS HOMOLOGOS, luego H264 homologs, AV1 al final como fallback.
        video_hevc_first: _HEVC_ALIASES + ',' + _AVC_ALIASES + ',' + _AV1_ALIASES,
        // Si caller necesita H264 primero (improbable post-doctrina HEVC-FIRST).
        video_avc_first:  _AVC_ALIASES  + ',' + _HEVC_ALIASES + ',' + _AV1_ALIASES,
        // Solo HEVC.
        video_hevc_only:  _HEVC_ALIASES,
        // Solo AVC.
        video_avc_only:   _AVC_ALIASES,
        // AUDIO: AAC universal primero, luego AC3, luego EC3/DDP.
        audio_aac_first:  _AAC_ALIASES + ',' + _AC3_ALIASES + ',' + _EC3_ALIASES,
    };

    // Helper de selección — caller solicita 'hevc_first' | 'avc_first' | ...
    // Si LAB provee cfg.codec_chain_video, retorna eso (LAB SSOT no-clamp).
    function getCodecCascade(kind, labChain) {
        // LAB override siempre gana — no clampamos values de LAB.
        if (labChain && typeof labChain === 'string' && labChain.length > 0) return labChain;
        const key = String(kind || 'video_hevc_first');
        return CODEC_HOMOLOGATION[key] || CODEC_HOMOLOGATION.video_hevc_first;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Exposición global (browser) + module.exports (Node test)
    // ────────────────────────────────────────────────────────────────────────
    const api = {
        VERSION: '1.2.0-dual-hvc1-hev1-20260522',
        CSV_SOURCE: 'Tier-CodecHvc1-CodecHev1-Profile-Level-Capacidad-Rol.csv',
        // CORONA_TIER_NUMBER = 9 → T9 = hvc1.2.4.L153.B0 (4K@60 UHD).
        // El generador usa esta constante para fake-4K y canales premium.
        CORONA_TIER_NUMBER: CORONA_TIER_NUMBER,
        resolveTierByResolution: resolveTierByResolution,
        inferResolutionFromChannel: inferResolutionFromChannel,
        inferFpsFromChannel: inferFpsFromChannel,
        resolveCodecForChannel: resolveCodecForChannel,
        resolveCodecHev1ForChannel: resolveCodecHev1ForChannel,
        isPremiumChannel: isPremiumChannel,
        isAntiFreezePremium: isAntiFreezePremium,
        PREMIUM_RE: PREMIUM_RE,
        ANTI_FREEZE_PREMIUM_RE: ANTI_FREEZE_PREMIUM_RE,
        CODEC_HOMOLOGATION: CODEC_HOMOLOGATION,
        getCodecCascade: getCodecCascade,
        // Per-profile cascade arrays (primary + fallback chain hvc1.2.4.*)
        generateProfileCascadeArrays: generateProfileCascadeArrays,
        PROFILE_DIMS: PROFILE_DIMS,
        // Override runtime (widget Quality Manifest)
        DEFAULT_CASCADE: HEVC_CASCADE_13TIER,
        setCascade: setCascade,
        resetCascade: resetCascade,
        getActiveCascade: getActiveCascade,
        isOverridden: isOverridden,
        parseCascadeCSV: parseCascadeCSV
    };
    // TIER_BY_NUMBER / HEVC_CASCADE_13TIER como getters → siempre la tabla ACTIVA,
    // para que el generador vea el override CSV sin cambios de referencia.
    Object.defineProperty(api, 'TIER_BY_NUMBER', { enumerable: true, get: function () { return _activeTierByNumber; } });
    Object.defineProperty(api, 'HEVC_CASCADE_13TIER', { enumerable: true, get: function () { return _activeCascade; } });
    // Alias backward-compat: el generador antiguo leía HEVC_CASCADE_12TIER
    Object.defineProperty(api, 'HEVC_CASCADE_12TIER', { enumerable: true, get: function () { return _activeCascade; } });

    // Auto-cargar override persistido (in-browser) — el generador lo usará al grabar.
    if (typeof localStorage !== 'undefined') {
        try {
            const _raw = localStorage.getItem(LS_KEY);
            if (_raw) {
                const _rows = JSON.parse(_raw);
                if (Array.isArray(_rows) && _rows.length) setCascade(_rows, false);
            }
        } catch (_) {}
    }

    if (typeof window !== 'undefined') {
        window.APE_HEVC_CASCADE = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})(typeof globalThis !== 'undefined' ? globalThis : this);
