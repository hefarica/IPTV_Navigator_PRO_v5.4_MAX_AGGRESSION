#!/usr/bin/env node
/**
 * ape-profile-classifier.js — Clasificador ATOMICO de perfil APE por canal.
 *
 * MISION: dado un canal, devolver {profile, fallback, score, signals[], confidence, reason}
 * sin tocar el generador (m3u8-typed-arrays-ultimate.js) ni ape-profiles-config.js.
 *
 * FUENTES (no se inventa ninguna):
 *   - Tabla de perfiles: contracts/ape_profiles_12.json  (autoridad)
 *     valores medidos en: artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json
 *       sha256 71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30, 586587 B
 *     Los 12 = P0..P5 canonicos + P0.5..P5.5 derivados 6K emulados.
 *   - Vocabulario de verdad del VPS: #EXT-X-APE-STREAM-TRUTH (src=probe|fake-4k|fake-8k|...)
 *     Ver .agents/skills/iptv-real-resolution-verifier (7 valores de src, 5 no-evidencias).
 *   - Doctrina de degradacion: .agents/skills/iptv-profile-fallback-doctrine
 *     + docs/policies/ANTI_DEGRADATION_LAW.md
 *
 * REGLAS DURAS QUE ESTE CODIGO IMPONE:
 *   R1. Con probe VERIFICADO el perfil se DERIVA de resolucion/codec reales.
 *       Ley Cardinal 1: el nivel de codec nunca por debajo de la resolucion.
 *       L153 = 4K@60 es TECHO. Se JAMAS declara L153 en 8K (freeze 2026-06-08).
 *   R2. Sin probe pero con tokens premium en nombre/grupo -> perfil superior de su
 *       cadena con confidence BAJA y reason explicita. Nunca se presenta como medido.
 *   R3. Sin evidencia -> P5 con reason 'no_evidence'.
 *   R4. NUNCA degrada 4K real a FHD (Ley Anti-Degradacion). La unica bajada es
 *       incapacidad de decoder MEDIDA, un escalon, registrada.
 *   R5. src=fake-4k / fake-8k NUNCA se clasifica como 4K/8K: se clasifica por la
 *       fuente real. Corregir un metadato falso NO es degradar (el bitstream no cambia).
 *   R6. El fallback es SIEMPRE el perfil inmediatamente inferior que el device
 *       pueda decodificar.
 *
 * SIN dependencias externas. Determinista. Sin red.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ────────────────────────────────────────────────────────────────────────────
 * 1. CARGA DE LA TABLA DE PERFILES
 * ──────────────────────────────────────────────────────────────────────────── */

const CONTRACT_CANDIDATES = [
  path.resolve(__dirname, '../../../contracts/ape_profiles_12.json'),
  path.resolve(__dirname, '../../contracts/ape_profiles_12.json'),
  path.resolve(process.cwd(), 'contracts/ape_profiles_12.json')
];

/**
 * Copia embebida SOLO como red de seguridad para cuando el contrato no viaja
 * con el script (p. ej. en el VPS). Se verifica contra el contrato cuando este
 * existe; si divergen, el contrato gana y se emite un aviso por stderr.
 * Estos valores son los medidos en el LAB v24 (ver cabecera), no una invencion.
 */
const EMBEDDED = {
  P0: { id: 'P0', level: 6, resolution_cap: '7680x4320', fps: 30, hdr: 'DOLBY_VISION_P8', codec_full: 'dvh1.08.06', design_bps: 60000000, fuse_bps: 15000000, buffer_seconds: 15, fallback: 'P1', fallback_chain: ['P1', 'P2', 'P3', 'P4', 'P5'], emulated: false, base_profile: null },
  'P0.5': { id: 'P0.5', level: 6, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 60000000, fuse_bps: 15000000, buffer_seconds: 15, fallback: 'P0', fallback_chain: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'], emulated: true, base_profile: 'P0' },
  P1: { id: 'P1', level: 5, resolution_cap: '3840x2160', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L153.B0', design_bps: 22000000, fuse_bps: 12000000, buffer_seconds: 12, fallback: 'P2', fallback_chain: ['P2', 'P3', 'P4', 'P5'], emulated: false, base_profile: null },
  'P1.5': { id: 'P1.5', level: 5, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 22000000, fuse_bps: 12000000, buffer_seconds: 12, fallback: 'P1', fallback_chain: ['P1', 'P2', 'P3', 'P4', 'P5'], emulated: true, base_profile: 'P1' },
  P2: { id: 'P2', level: 4, resolution_cap: '3840x2160', fps: 30, hdr: 'HDR10', codec_full: 'hvc1.2.4.L150.B0', design_bps: 12000000, fuse_bps: 8000000, buffer_seconds: 10, fallback: 'P3', fallback_chain: ['P3', 'P4', 'P5'], emulated: false, base_profile: null },
  'P2.5': { id: 'P2.5', level: 4, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 12000000, fuse_bps: 8000000, buffer_seconds: 10, fallback: 'P2', fallback_chain: ['P2', 'P3', 'P4', 'P5'], emulated: true, base_profile: 'P2' },
  P3: { id: 'P3', level: 3, resolution_cap: '1920x1080', fps: 60, hdr: 'SDR', codec_full: 'hvc1.2.4.L123.B0', design_bps: 9000000, fuse_bps: 5000000, buffer_seconds: 8, fallback: 'P4', fallback_chain: ['P4', 'P5'], emulated: false, base_profile: null },
  'P3.5': { id: 'P3.5', level: 3, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 9000000, fuse_bps: 5000000, buffer_seconds: 8, fallback: 'P3', fallback_chain: ['P3', 'P4', 'P5'], emulated: true, base_profile: 'P3' },
  P4: { id: 'P4', level: 2, resolution_cap: '1280x720', fps: 30, hdr: 'SDR', codec_full: 'hvc1.2.4.L93.B0', design_bps: 6500000, fuse_bps: 3000000, buffer_seconds: 6, fallback: 'P5', fallback_chain: ['P5'], emulated: false, base_profile: null },
  'P4.5': { id: 'P4.5', level: 2, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 6500000, fuse_bps: 3000000, buffer_seconds: 6, fallback: 'P4', fallback_chain: ['P4', 'P5'], emulated: true, base_profile: 'P4' },
  P5: { id: 'P5', level: 1, resolution_cap: '854x480', fps: 30, hdr: 'SDR', codec_full: 'avc1.42c01e', design_bps: 4000000, fuse_bps: 1500000, buffer_seconds: 5, fallback: null, fallback_chain: [], emulated: false, base_profile: null },
  'P5.5': { id: 'P5.5', level: 1, resolution_cap: '5760x3240', fps: 60, hdr: 'HDR10PLUS', codec_full: 'hvc1.2.4.L183.B0', design_bps: 4000000, fuse_bps: 1500000, buffer_seconds: 5, fallback: 'P5', fallback_chain: ['P5'], emulated: true, base_profile: 'P5' }
};

let _cache = null;

function loadProfiles() {
  if (_cache) return _cache;

  for (const p of CONTRACT_CANDIDATES) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const list = Array.isArray(raw.profiles) ? raw.profiles : null;
      if (!list || list.length !== 12) continue;
      const table = {};
      for (const prof of list) table[prof.id] = prof;
      _cache = { table, source: 'contract', contract_path: p };
      verifyEmbeddedAgainst(table);
      return _cache;
    } catch (_e) {
      /* se prueba el siguiente candidato */
    }
  }

  process.stderr.write(
    '[ape-profile-classifier] AVISO: no se encontro contracts/ape_profiles_12.json; ' +
    'se usa la tabla embebida (misma medida LAB v24). El resultado es valido pero ' +
    'sin verificacion de deriva contra el contrato.\n'
  );
  _cache = { table: EMBEDDED, source: 'embedded', contract_path: null };
  return _cache;
}

/** Compara la tabla embebida con el contrato y avisa si derivan (no aborta: el contrato gana). */
function verifyEmbeddedAgainst(table) {
  const drift = [];
  for (const id of Object.keys(EMBEDDED)) {
    const a = EMBEDDED[id];
    const b = table[id];
    if (!b) { drift.push(`${id}: ausente en contrato`); continue; }
    if (a.resolution_cap !== b.resolution_cap) drift.push(`${id}: resolution_cap ${a.resolution_cap} != ${b.resolution_cap}`);
    if (a.design_bps !== b.design_bps) drift.push(`${id}: design_bps ${a.design_bps} != ${b.design_bps}`);
    if (a.fuse_bps !== b.fuse_bps) drift.push(`${id}: fuse_bps ${a.fuse_bps} != ${b.fuse_bps}`);
    if (a.codec_full !== b.codec_full) drift.push(`${id}: codec_full ${a.codec_full} != ${b.codec_full}`);
    if (a.fallback !== b.fallback) drift.push(`${id}: fallback ${a.fallback} != ${b.fallback}`);
  }
  if (drift.length) {
    process.stderr.write(
      '[ape-profile-classifier] AVISO de deriva embebido-vs-contrato: ' + drift.join(' | ') + '\n'
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. UTILIDADES DE MEDIDA
 * ──────────────────────────────────────────────────────────────────────────── */

function num(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** Altura declarada de un resolution_cap tipo "3840x2160" -> 2160 */
function capHeight(resolutionCap) {
  const m = /^(\d+)x(\d+)$/.exec(String(resolutionCap || '').trim());
  return m ? parseInt(m[2], 10) : 0;
}

function capWidth(resolutionCap) {
  const m = /^(\d+)x(\d+)$/.exec(String(resolutionCap || '').trim());
  return m ? parseInt(m[1], 10) : 0;
}

/** Familia de codec a partir del string RFC 6381. No decide perfil: solo informa. */
function codecFamily(codec) {
  const c = String(codec || '').toLowerCase();
  if (!c) return 'UNKNOWN';
  if (c.startsWith('dvh1') || c.startsWith('dvhe')) return 'DOLBY_VISION';
  if (c.startsWith('hvc1') || c.startsWith('hev1')) return 'HEVC';
  if (c.startsWith('av01')) return 'AV1';
  if (c.startsWith('avc1')) return 'AVC';
  if (c.startsWith('vvc1') || c.startsWith('vvi1')) return 'VVC';
  if (c.startsWith('mp2v')) return 'MPEG2';
  return 'UNKNOWN';
}

/** Nivel HEVC declarado en un string tipo hvc1.2.4.L153.B0 -> 153 */
function hevcLevel(codec) {
  const m = /\.L(\d{2,3})\./i.exec(String(codec || ''));
  return m ? parseInt(m[1], 10) : null;
}

/** Techo de nivel HEVC requerido por resolucion@fps (Ley Cardinal 1). */
function requiredHevcLevel(height, fps) {
  const h = num(height) || 0;
  const f = num(fps) || 30;
  if (h >= 4320) return f >= 100 ? 186 : 183;   // 8K@120 -> L186 ; 8K@60 -> L183
  if (h >= 3240) return 183;                    // 6K (declarado) usa L183
  if (h >= 2160) return f >= 100 ? 156 : (f >= 50 ? 153 : 150);
  if (h >= 1080) return f >= 50 ? 123 : 120;
  if (h >= 720) return 93;
  return 90;
}

function normalizeHdr(v) {
  const s = String(v || '').toUpperCase().replace(/[\s_-]+/g, '');
  if (!s) return 'UNKNOWN';
  if (s.includes('DOLBYVISION') || s === 'DV' || s.startsWith('DV')) return 'DOLBY_VISION';
  if (s.includes('HDR10PLUS') || s.includes('HDR10+')) return 'HDR10+';
  if (s.includes('HDR10')) return 'HDR10';
  if (s.includes('HLG')) return 'HLG';
  if (s.includes('SDR')) return 'SDR';
  if (s.includes('PQ') || s.includes('HDR')) return 'HDR10';
  return 'UNKNOWN';
}

function isHdr(h) {
  return h === 'DOLBY_VISION' || h === 'HDR10+' || h === 'HDR10' || h === 'HLG';
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. TOKENS PREMIUM (regla R2)
 * ────────────────────────────────────────────────────────────────────────────
 * Union de la lista del operador (mision) y la lista canonica de CLAUDE.md
 * (§Premium Channel Detection). Se exige frontera de palabra para que "Max"
 * no case con "MAXIMUM" ni "F1" con "F10" o "MF1".
 */

const TOKENS = [
  // resolucion explicita -> perfil implicito
  { re: /\b8\s*k\b/i, kind: 'resolution', profile: 'P1', label: '8K' },
  { re: /\b4\s*k\b/i, kind: 'resolution', profile: 'P1', label: '4K' },
  { re: /\buhd\b/i, kind: 'resolution', profile: 'P1', label: 'UHD' },
  { re: /\bfhd\b/i, kind: 'resolution', profile: 'P3', label: 'FHD' },
  { re: /\bhd\b/i, kind: 'resolution', profile: 'P4', label: 'HD' },
  // codec / rango
  { re: /\bhevc\b/i, kind: 'codec', profile: 'P1', label: 'HEVC' },
  { re: /\bh\.?265\b/i, kind: 'codec', profile: 'P1', label: 'H265' },
  { re: /\bhdr\b/i, kind: 'codec', profile: 'P1', label: 'HDR' },
  { re: /\bdolby\b/i, kind: 'codec', profile: 'P1', label: 'Dolby' },
  // premium / evento / marca
  { re: /\bpremium\b/i, kind: 'brand', profile: 'P1', label: 'Premium' },
  { re: /\bdazn\b/i, kind: 'brand', profile: 'P1', label: 'DAZN' },
  { re: /\bespn\b/i, kind: 'brand', profile: 'P1', label: 'ESPN' },
  { re: /\bsky\b/i, kind: 'brand', profile: 'P1', label: 'Sky' },
  { re: /\bbein\b|\bbein\s*sports\b/i, kind: 'brand', profile: 'P1', label: 'BeIN' },
  { re: /\bfox\b/i, kind: 'brand', profile: 'P1', label: 'Fox' },
  { re: /\bhbo\b/i, kind: 'brand', profile: 'P1', label: 'HBO' },
  { re: /\bmax\b/i, kind: 'brand', profile: 'P1', label: 'Max' },
  { re: /\bnetflix\b/i, kind: 'brand', profile: 'P1', label: 'Netflix' },
  { re: /\bdisney\b/i, kind: 'brand', profile: 'P1', label: 'Disney' },
  { re: /\bsports?\b/i, kind: 'event', profile: 'P1', label: 'Sports' },
  { re: /\bevents?\b|\beventos?\b/i, kind: 'event', profile: 'P1', label: 'Evento' },
  { re: /\bppv\b/i, kind: 'event', profile: 'P1', label: 'PPV' },
  { re: /\bliga\b/i, kind: 'event', profile: 'P1', label: 'Liga' },
  { re: /\bchampions\b/i, kind: 'event', profile: 'P1', label: 'Champions' },
  { re: /\bnba\b/i, kind: 'event', profile: 'P1', label: 'NBA' },
  { re: /\bf1\b/i, kind: 'event', profile: 'P1', label: 'F1' },
  { re: /\bufc\b/i, kind: 'event', profile: 'P1', label: 'UFC' },
  { re: /\bmovie\b|\bcine\b/i, kind: 'event', profile: 'P1', label: 'Cine' }
];

/** Devuelve los tokens premium hallados en name+group. */
function findTokens(name, group) {
  const hay = `${name || ''} ${group || ''}`;
  const hits = [];
  for (const t of TOKENS) {
    if (t.re.test(hay)) hits.push({ label: t.label, kind: t.kind, profile: t.profile });
  }
  return hits;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. DERIVACION DE PERFIL DESDE RESOLUCION REAL (regla R1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Banda de resolucion -> perfil base. Solo devuelve perfiles CANONICOS:
 * los .5 son enhancement de display y NUNCA se seleccionan desde un probe
 * (contract: "Un perfil .5 NUNCA se selecciona desde un probe").
 */
function profileForMeasured(width, height, fps, hdr) {
  const h = num(height) || 0;
  const f = num(fps);
  const hdrNorm = normalizeHdr(hdr);

  if (h >= 4320) {
    // 8K real: solo P0 tiene cap 7680x4320. Nunca un .5.
    return { profile: 'P0', band: '8k' };
  }
  if (h >= 3240) {
    // 6K REAL no existe como fuente declarable (todo .5 es enhancement).
    // Se clasifica por su base mas cercana sin inventar una fuente 6K.
    return { profile: 'P0', band: '6k-as-8k-ceiling-guard' };
  }
  if (h >= 2160) {
    // 4K: P1 = 4K@60 HDR ; P2 = 4K@30
    const highFrame = f !== null && f >= 50;
    if (isHdr(hdrNorm) || highFrame) return { profile: 'P1', band: '4k' };
    return { profile: 'P2', band: '4k' };
  }
  if (h >= 1080) return { profile: 'P3', band: 'fhd' };
  if (h >= 720) return { profile: 'P4', band: 'hd' };
  return { profile: 'P5', band: 'sd' };
}

/**
 * Suelo anti-degradacion (R4): ningun perfil cuyo cap de resolucion quede por
 * DEBAJO de la altura medida. Escala al perfil canonico mas bajo que si la carga.
 */
function enforceResolutionFloor(profileId, measuredHeight, table) {
  const h = num(measuredHeight);
  if (!h) return { profile: profileId, escalated: false };
  const cap = capHeight((table[profileId] || {}).resolution_cap);
  if (cap >= h) return { profile: profileId, escalated: false };

  // Orden de capacidad descendente entre canonicos.
  const order = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  for (const id of order) {
    if (capHeight((table[id] || {}).resolution_cap) >= h) {
      return { profile: id, escalated: true, from: profileId, to: id };
    }
  }
  return { profile: 'P0', escalated: true, from: profileId, to: 'P0' };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. FALLBACK (regla R6)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Devuelve el perfil INMEDIATAMENTE inferior de la cadena que el device pueda
 * decodificar. Si no se conoce el device, devuelve el fallback declarado por el
 * contrato y lo dice (device_unknown), sin fingir que se comprobo capacidad.
 */
function resolveFallback(profileId, table, device) {
  const prof = table[profileId] || {};
  const chain = Array.isArray(prof.fallback_chain) ? prof.fallback_chain : [];

  if (!device || typeof device !== 'object') {
    return {
      fallback: prof.fallback === undefined ? null : prof.fallback,
      basis: 'contract_declared',
      detail: 'device_unknown: no se aporto capacidad de decoder, se usa el fallback declarado en el contrato'
    };
  }

  const devMaxH = num(device.max_height);
  const devCodecs = Array.isArray(device.codecs)
    ? device.codecs.map((c) => String(c).toLowerCase())
    : null;

  for (const id of chain) {
    const cand = table[id] || {};
    const candH = capHeight(cand.resolution_cap);
    if (devMaxH !== null && candH > devMaxH) continue;

    if (devCodecs) {
      const fam = codecFamily(cand.codec_full);
      const token = fam === 'DOLBY_VISION' ? 'dvh1'
        : fam === 'HEVC' ? 'hvc1'
          : fam === 'AV1' ? 'av01'
            : fam === 'AVC' ? 'avc1'
              : fam.toLowerCase();
      const ok = devCodecs.some((c) => c.includes(token));
      if (!ok) continue;
    }
    return {
      fallback: id,
      basis: 'device_capability',
      detail: `un escalon por debajo de ${profileId}; device max_height=${devMaxH === null ? 'n/d' : devMaxH}`
    };
  }

  return {
    fallback: null,
    basis: 'device_capability',
    detail: `el device no puede decodificar ningun escalon de la cadena de ${profileId}; no se degrada mas sin autorizacion Art. 9`
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. CLASIFICADOR
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} channel  {name, group, url, probe:{width,height,codec,fps,hdr,bitrate,verified}, truth?}
 * @param {object} [opts]   {device:{max_height, codecs[]}}
 * @returns {{profile:string, fallback:string|null, score:number, signals:string[], confidence:string, reason:string}}
 */
function classify(channel, opts) {
  const { table, source } = loadProfiles();
  const options = opts || {};
  const ch = channel || {};
  const probe = ch.probe || null;
  const truth = ch.truth || null;

  const signals = [];
  if (source === 'embedded') signals.push('table:embedded');

  /* ── Lectura de la verdad STREAM-TRUTH (R5) ─────────────────────────────── */
  const truthSrc = truth && truth.src ? String(truth.src).toLowerCase() : null;
  const truthIsProbe = truthSrc === 'probe';
  const truthIsFake = truthSrc !== null && truthSrc.indexOf('fake') !== -1;
  if (truthSrc) signals.push(`truth_src:${truthSrc}`);
  if (truthIsFake) signals.push('guard:fake_uhd_never_4k');

  /* ── Lectura del probe ──────────────────────────────────────────────────── */
  const pW = probe ? num(probe.width) : null;
  const pH = probe ? num(probe.height) : null;
  const pFps = probe ? num(probe.fps) : null;
  const pCodec = probe && probe.codec ? String(probe.codec) : null;
  const pHdrRaw = probe && probe.hdr ? probe.hdr : null;
  const pVerified = !!(probe && probe.verified === true);
  const pHasDims = pH !== null && pW !== null && pH > 0 && pW > 0;

  if (pCodec) signals.push(`codec:${pCodec}`);
  if (pFps !== null) signals.push(`fps:${pFps}`);
  if (pHdrRaw) signals.push(`hdr:${normalizeHdr(pHdrRaw)}`);

  /* ── CASO A: probe VERIFICADO -> perfil derivado de la medida (R1) ──────── */
  if (pVerified && pHasDims) {
    const derived = profileForMeasured(pW, pH, pFps, pHdrRaw);
    signals.push(`probe_verified:${pW}x${pH}`);

    let chosen = derived.profile;

    // Ley Cardinal 1: el nivel jamás por debajo de la resolución.
    const reqLevel = requiredHevcLevel(pH, pFps);
    const declaredLevel = pCodec ? hevcLevel(pCodec) : null;
    if (declaredLevel !== null) {
      if (declaredLevel < reqLevel) {
        signals.push(`cardinal1_violation:declared_L${declaredLevel}<required_L${reqLevel}`);
      } else {
        signals.push(`cardinal1_ok:L${declaredLevel}>=L${reqLevel}`);
      }
    }

    // L153 = 4K@60 es TECHO: prohibido sobre 8K.
    if (pH >= 4320 && declaredLevel === 153) {
      signals.push('contradiction:L153_on_8K_forbidden');
      chosen = 'P0';
    }

    // Suelo anti-degradacion.
    const floored = enforceResolutionFloor(chosen, pH, table);
    if (floored.escalated) {
      signals.push(`anti_degradation_floor:${floored.from}->${floored.to}`);
      chosen = floored.profile;
    }

    // Un .5 nunca se selecciona desde probe.
    if (table[chosen] && table[chosen].emulated) {
      signals.push('guard:emulated_never_from_probe');
      chosen = table[chosen].base_profile || 'P1';
    }

    const fb = resolveFallback(chosen, table, options.device);

    const hdrNorm = normalizeHdr(pHdrRaw);
    const reasonBits = [`probe verificado ${pW}x${pH}`];
    if (pFps !== null) reasonBits.push(`${pFps}fps`);
    if (hdrNorm !== 'UNKNOWN') reasonBits.push(hdrNorm);
    if (pCodec) reasonBits.push(pCodec);
    reasonBits.push(`banda=${derived.band}`);

    return {
      profile: chosen,
      fallback: fb.fallback,
      score: scoreFor('verified_probe', pH),
      signals,
      confidence: 'high',
      reason: `perfil derivado de la MEDIDA real: ${reasonBits.join(' ')}. ` +
        `Nunca se degrada una medida real (Ley Anti-Degradacion). ${fb.detail}.`
    };
  }

  /* ── CASO B: STREAM-TRUTH declara fake-4k/fake-8k (R5) ─────────────────────
   * El generador sobrescribe w/h con el default fake-UHD, asi que una dimension
   * declarada no prueba nada. Si ademas parece el override (3840x2160/7680x4320)
   * o no hay dimensiones, se clasifica por la fuente real por defecto: 1920x1080
   * (vocabulario `default` de __apeStreamTruth, m3u8-typed-arrays-ultimate.js
   * lineas 2692-2694). Corregir un metadato falso NO es degradar.
   */
  if (truthIsFake) {
    let effectiveW = pHasDims ? pW : 1920;
    let effectiveH = pHasDims ? pH : 1080;

    const looksLikeOverride = pHasDims && ((pW === 3840 && pH === 2160) || (pW === 7680 && pH === 4320));
    if (looksLikeOverride || !pHasDims) {
      effectiveW = 1920;
      effectiveH = 1080;
      signals.push('fake_uhd_override_rejected_fallback_default:1920x1080');
    } else {
      signals.push('fake_uhd_scalar_confirmed_by_dims');
    }

    const derived = profileForMeasured(effectiveW, effectiveH, pFps, pHdrRaw);
    let chosen = derived.profile;

    const floored = enforceResolutionFloor(chosen, effectiveH, table);
    if (floored.escalated) {
      signals.push(`anti_degradation_floor:${floored.from}->${floored.to}`);
      chosen = floored.profile;
    }
    if (table[chosen] && table[chosen].emulated) {
      chosen = table[chosen].base_profile || 'P1';
    }

    const fb = resolveFallback(chosen, table, options.device);

    return {
      profile: chosen,
      fallback: fb.fallback,
      score: scoreFor('fake_with_dims', effectiveH),
      signals,
      confidence: 'low',
      reason: `STREAM-TRUTH declara src=${truthSrc}: la resolucion declarada NO es evidencia. ` +
        `Se clasifica por la fuente real (${effectiveW}x${effectiveH}). Corregir un metadato falso no es degradar ` +
        `(ANTI_DEGRADATION_LAW Art. 6): el bitstream no cambia. ${fb.detail}.`
    };
  }

  /* ── R5b: una declaracion 4K/8K NO verificada tampoco es evidencia ─────────
   * MEDIDO en scratch/LISTA_ACTUAL.m3u8 (604.593.696 B): el canal 1 (tvg-id=3)
   * declara #EXT-X-STREAM-INF:RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0"
   * mientras su propio #KODIPROP:inputstream.adaptive.max_resolution=1920x1080,
   * su #EXT-X-CMAF:RESOLUTION=1920x1080 y su ape-codec-family="h264" dicen FHD.
   * Esa lista NO trae #EXT-X-APE-STREAM-TRUTH (0 ocurrencias en 604 MB), asi que
   * no hay forma de distinguir un 4K real de una declaracion inflada.
   * Doctrina (iptv-real-resolution-verifier §4/§10): solo `probe` cuenta. Por
   * tanto una dimension >=2160 SIN verificar se trata como no-evidencia y se
   * falla hacia los tokens/nombre en vez de promocionar el canal a 4K.
   */
  const uhdUnverified = pHasDims && !truthIsProbe && pH >= 2160;
  if (uhdUnverified) {
    signals.push(`probe_unverified_declared:${pW}x${pH}`);
    signals.push('guard:unverified_uhd_dims_not_evidence');
  }

  /* ── CASO C: dimensiones usables (por debajo del techo 4K) sin verificar ── */
  if (pHasDims && !uhdUnverified) {
    signals.push(`probe_unverified:${pW}x${pH}`);

    const derived = profileForMeasured(pW, pH, pFps, pHdrRaw);
    let chosen = derived.profile;

    const floored = enforceResolutionFloor(chosen, pH, table);
    if (floored.escalated) {
      signals.push(`anti_degradation_floor:${floored.from}->${floored.to}`);
      chosen = floored.profile;
    }
    if (table[chosen] && table[chosen].emulated) {
      chosen = table[chosen].base_profile || 'P1';
    }

    const fb = resolveFallback(chosen, table, options.device);

    return {
      profile: chosen,
      fallback: fb.fallback,
      score: scoreFor('unverified_probe', pH),
      signals,
      confidence: 'medium',
      reason: `probe NO verificado pero aporta ${pW}x${pH}; se usa como mejor evidencia disponible ` +
        `con confidence media. ${fb.detail}.`
    };
  }

  /* ── CASO C: sin probe -> tokens premium (R2) ───────────────────────────── */
  const tokens = findTokens(ch.name, ch.group);
  if (tokens.length) {
    for (const t of tokens) signals.push(`token:${t.label}(${t.kind})`);

    // "El perfil superior de su cadena": el mas capaz de los implicados.
    const order = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
    let top = 'P5';
    for (const t of tokens) {
      if (order.indexOf(t.profile) < order.indexOf(top)) top = t.profile;
    }

    // Un 8K SOLO por nombre no se promueve a P0: seria declarar 8K sin medida,
    // justo el caso que produce el freeze por L153-sobre-8K. Se queda en P1.
    if (tokens.some((t) => t.label === '8K') && top === 'P1') {
      signals.push('guard:8k_by_name_not_promoted_without_probe');
    }

    const fb = resolveFallback(top, table, options.device);

    return {
      profile: top,
      fallback: fb.fallback,
      score: scoreFor('premium_hint', null),
      signals,
      confidence: 'low',
      reason: `probe ausente o fallido; se usa el perfil superior de la cadena implicada por los tokens ` +
        `[${tokens.map((t) => t.label).join(', ')}] -> ${top}. ES UNA HIPOTESIS, no una medida: ` +
        `confidence baja. ${fb.detail}.`
    };
  }

  /* ── CASO D: sin evidencia (R3) ─────────────────────────────────────────── */
  const fb = resolveFallback('P5', table, options.device);
  return {
    profile: 'P5',
    fallback: fb.fallback,
    score: 0,
    signals: signals.concat(['no_evidence']),
    confidence: 'low',
    reason: 'no_evidence: sin probe, sin dimensiones y sin tokens premium en nombre ni grupo. ' +
      'P5 es la ultima linea de defensa (SD_FAILSAFE_UNIVERSAL). ' +
      'No se inventa una resolucion que no se midio.'
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. SCORE (calidad de la EVIDENCIA, 0..100; no es calidad de imagen)
 * ──────────────────────────────────────────────────────────────────────────── */

function scoreFor(kind, height) {
  const h = num(height);
  switch (kind) {
    case 'verified_probe':
      if (!h) return 70;
      if (h >= 2160) return 100;
      if (h >= 1080) return 95;
      if (h >= 720) return 90;
      return 85;
    case 'unverified_probe':
      return h && h >= 2160 ? 70 : 62;
    case 'fake_with_dims':
      return 40;
    case 'premium_hint':
      return 25;
    default:
      return 0;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. UTILIDADES DE INVARIANTE (usadas por los tests)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Comprueba fuse_bps <= design_bps y devuelve los que lo violan. */
function checkBandwidthInvariant() {
  const { table } = loadProfiles();
  const bad = [];
  for (const id of Object.keys(table)) {
    const p = table[id];
    const d = num(p.design_bps);
    const f = num(p.fuse_bps);
    if (d === null || f === null) { bad.push(`${id}: bps no computado`); continue; }
    if (f > d) bad.push(`${id}: fuse_bps ${f} > design_bps ${d}`);
  }
  return bad;
}

/** Devuelve los ids de perfil en el contrato. */
function profileIds() {
  return Object.keys(loadProfiles().table);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 9. EXPORTS / CLI
 * ──────────────────────────────────────────────────────────────────────────── */

module.exports = {
  classify,
  loadProfiles,
  profileIds,
  checkBandwidthInvariant,
  // utilidades expuestas para test y auditoria
  profileForMeasured,
  resolveFallback,
  enforceResolutionFloor,
  findTokens,
  requiredHevcLevel,
  codecFamily,
  capHeight,
  capWidth,
  normalizeHdr
};

if (require.main === module) {
  const demo = {
    name: 'DAZN F1 4K',
    group: 'Deportes',
    url: 'http://example/stream.m3u8',
    probe: { width: 1920, height: 1080, codec: 'hvc1.2.4.L123.B0', fps: 60, hdr: 'SDR', bitrate: 8, verified: true }
  };
  process.stdout.write(JSON.stringify(classify(demo), null, 2) + '\n');
  process.stdout.write(
    'invariante fuse_bps<=design_bps: ' +
    (checkBandwidthInvariant().length === 0 ? 'OK (12/12)' : 'FALLA: ' + checkBandwidthInvariant().join('; ')) + '\n'
  );
  process.stdout.write('perfiles cargados: ' + profileIds().length + ' -> ' + profileIds().join(',') + '\n');
}
