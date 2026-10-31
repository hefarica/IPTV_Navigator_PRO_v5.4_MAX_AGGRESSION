'use strict';

/**
 * ARA-X policy engine (I5) — matriz D2 aplicada al wire + reglas de auditoría R1/R2.
 *
 * Puro y determinista: sin `fs`, sin red, sin reloj, sin RNG. La I/O vive en
 * `ara-x/scripts/policy/validate_catalog.js`.
 *
 * Contrato de salida del motor de decisión: `ara-x/spec/ara_x_codec_policy.schema.json`
 * (spec `ara-x-codec-policy.v1`). Vectores: `ara-x/spec/ara_x_codec_cases.json`.
 *
 * API
 *   canonicalSoc(raw)                       -> {soc, reason, allowed}
 *   familyFromCodec(str) / levelFromCodec(str)
 *   codecFor(family, resolution, fps)       -> {codec, level} | null
 *   requiredLevel(resolution, fps)          -> HEVC level_idc requerido | null
 *   avcLevelFor(resolution, fps)            -> level_idc AVC requerido | null
 *   parseStreamInf(line)                    -> atributos tipados de #EXT-X-STREAM-INF
 *   decide(input)                           -> decisión D2 completa (schema)
 *   classifyVariant(ctx)                    -> {classification, findings, wire_target}
 *   RULES                                   -> catálogo {id: {severity, title, fix}}
 *   RULE_IDS                                -> ids en orden
 */

const SPEC = 'ara-x-codec-policy.v1';

const CANON = ['mt8696', 'amlogic', 's905x4', 's905x3'];
const ALIAS = {
  amlogic_s905x4: 's905x4',
  'amlogic-s905x4': 's905x4',
  s905x4_amlogic: 's905x4',
  amlogic_s905x3: 's905x3',
  'amlogic-s905x3': 's905x3',
  s905x3_amlogic: 's905x3',
  firetv_mt8696: 'mt8696',
  mediatek_mt8696: 'mt8696'
};

const FPS_SET = [24, 25, 30, 50, 60];
const AUDIO = ',mp4a.40.2';

/* ── catálogo de reglas ─────────────────────────────────────────────────── */
const RULES = {
  'I5-R01': { severity: 'critical', title: 'Wire 8K declarado (7680x4320)', fix: 'Emitir 3840x2160 como techo y marcar 8K solo como TARGET=DISPLAY (NEVER_REAL=1).' },
  'I5-R02': { severity: 'high', title: 'Nivel HEVC/AVC por debajo de la resolucion declarada', fix: 'Nivel = required(RESOLUTION, FRAME-RATE); si no cabe, bajar fps o resolucion declarada, nunca el nivel.' },
  'I5-R02H': { severity: 'medium', title: 'Hint de nivel por debajo de la resolucion declarada', fix: 'Alinear CODEC-PREFERRED con la resolucion in-band o no promoverlo a CODECS publico.' },
  'I5-R03': { severity: 'critical', title: 'FZ-01: familia AVC con CODECS hvc1 publico', fix: 'Publicar avc1.640033 (4K<=30fps) / avc1.64002A (1080p>=50) / avc1.640028, o exigir cascade_type verificado.' },
  'I5-R04': { severity: 'critical', title: 'FZ-01 agravado: hvc1 + VIDEO-RANGE=PQ sobre fuente AVC', fix: 'Codec veraz y, si se mantiene PQ como intencion, marcador HDR-INTENT con VERIFIED=0.' },
  'I5-R05': { severity: 'high', title: 'CMAF ficticio (contenedor mpegts / sin EXT-X-MAP)', fix: 'Retirar el claim CMAF o declarar LL-HLS sobre TS; CMAF exige fMP4 + EXT-X-MAP real.' },
  'I5-R06': { severity: 'high', title: 'LCEVC anunciado sin capa en el bitstream', fix: 'Eliminar LCEVC o marcarlo SYNTHETIC=1;SCOPE=DEVICE;PIXELS=0 (no es procesamiento del VPS).' },
  'I5-R07': { severity: 'high', title: 'Dolby Vision anunciado sin codec DV', fix: 'Exigir dvh1.08.* en CODECS/SUPPLEMENTAL + BL HEVC; si no, retirar DV.' },
  'I5-R08': { severity: 'medium', title: 'AI-SR/AI-FI sin scope de device', fix: 'Marcar SCOPE=DEVICE;PIXELS=0 o retirar; el VPS no procesa pixeles.' },
  'I5-R09': { severity: 'medium', title: 'PQ publico sobre fuente SDR sin marcador de intencion', fix: 'Anadir #EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0.' },
  'I5-R10': { severity: 'high', title: 'Metadata HDR fisicamente imposible (MaxFALL > MaxCLL / AVG > PEAK)', fix: 'MaxFALL <= MaxCLL y AVG <= PEAK; corregir a min().' },
  'I5-R11': { severity: 'medium', title: 'FRAME-RATE declarado por encima del fps medido', fix: 'FRAME-RATE = fps medido (o declarado si no hay medido); el target de display va en marcador.' },
  'I5-R12': { severity: 'medium', title: '4K declarado con bitrate 9-15 Mbps y familia AVC', fix: 'No declarar 4K real; mantener 4K solo como presentacion marcada y codec veraz.' },
  'I5-R13': { severity: 'low', title: 'CODECS malformado en el tag CMAF (coma final)', fix: 'Emitir lista de codecs RFC 6381 sin elementos vacios.' },
  'I5-R14': { severity: 'high', title: 'Knobs de player empujan 8K/120 sobre decoder 4K@60', fix: 'Clamp adaptive-maxwidth<=3840, adaptive-maxheight<=2160, video_vrr_max<=60, minterpolate fps<=60.' },
  'I5-R15': { severity: 'low', title: 'FPS declarado multiple y contradictorio', fix: 'Un solo FPS por canal coherente en EXTINF, STREAM-INF, EXTVLCOPT y EXTHTTP.' },
  'I5-R16': { severity: 'high', title: 'EXT-X-I-FRAME-STREAM-INF sin URI', fix: 'Emitir URI real o retirar el tag (RFC 8216 §4.3.4.3).' },
  'I5-R17': { severity: 'high', title: 'Gramatica HLS hibrida (Master + Media + Media Segment)', fix: 'No anadir gramatica: la lista es M3U Plus; separar tipos o retirar tags media-only.' },
  'I5-R18': { severity: 'high', title: 'LL-HLS declarado e inexistente (0 EXT-X-PART, PART-HOLD-BACK < 3x)', fix: 'Retirar LL-HLS o emitir PART reales con PART-HOLD-BACK >= 3x PART-TARGET.' },
  'I5-R19': { severity: 'medium', title: 'EXT-X-START duplicado con offsets contradictorios', fix: 'Una sola declaracion EXT-X-START por archivo.' },
  'I5-R20': { severity: 'medium', title: 'Footer VALIDATED con errors=0 no confiable', fix: 'Contar channels_without_variant y missing_uri como warnings; no declarar errors=0 en falso.' },
  'I5-R21': { severity: 'low', title: 'tvg-name duplicados', fix: 'Hacer unicos tvg-name (o declarar alias por tvg-id).' },
  'I5-R22': { severity: 'low', title: 'SID de idempotencia duplicado', fix: 'Semilla/ID unica por generacion.' },
  'I5-R23': { severity: 'high', title: '4K declarado sobre fuente in-band <4K sin marcador de presentacion', fix: 'Anadir #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;src=<WxH>;can8k=0.' },
  'I5-R24': { severity: 'medium', title: 'Canal sin EXT-X-STREAM-INF', fix: 'Emitir variante veraz (codec real) o dejar F5; contar channels_without_variant.' },
  'I5-R25': { severity: 'low', title: 'Marcador 8KFAKE ausente en canal con wire 4K', fix: 'Emitir #EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY de forma consistente entre generaciones.' },
  'I5-R26': { severity: 'critical', title: 'CODEC-VERIFIED:true sin CODEC-REAL', fix: 'Nunca declarar verificado sin probe; usar CODEC-VERIFIED:false + CODEC-PREFERRED.' },
  'I5-R27': { severity: 'critical', title: 'SUPPLEMENTAL-CODECS inventado', fix: 'Solo si el probe encontro la capa (dvh1/lcev); si no, retirar.' },
  'I5-R28': { severity: 'medium', title: 'Transfer declarado contradictorio (BT1886 SDR vs TRANSFER=16 PQ)', fix: 'Coherencia CICP: PQ => TRANSFER-CHARACTERISTICS=16 y APE-HDR-TRANSFER=PQ; SDR => BT1886 y no PQ.' },
  'I5-R31': { severity: 'medium', title: 'Canal sin evidencia de codec (CODEC-PREFERRED/VERIFIED)', fix: 'Emitir evidencia o marcar NO_CODEC_DECLARED de forma explicita.' }
};
const RULE_IDS = Object.keys(RULES);

/* ── utilidades RFC 6381 / niveles ──────────────────────────────────────── */
function familyFromCodec(s) {
  const v = String(s == null ? '' : s).toLowerCase();
  if (/^hvc1|^hev1/.test(v)) return 'hevc';
  if (/^avc1|^avc3/.test(v)) return 'h264';
  if (/^av01/.test(v)) return 'av1';
  if (/^vp09/.test(v)) return 'vp9';
  return null;
}
function firstVideoCodec(codecs) {
  const s = String(codecs == null ? '' : codecs);
  for (const part of s.split(',')) {
    const t = part.trim();
    if (/^(hvc1|hev1|avc1|avc3|dvh1|dvhe|av01|vp09|vvc1)\./.test(t)) return t;
  }
  return null;
}
function levelFromCodec(codec) {
  const v = String(codec == null ? '' : codec);
  let m = /\.L(\d{3})\.?/.exec(v);
  if (m) return Number(m[1]);
  m = /^avc1\.[0-9a-fA-F]{2}[0-9a-fA-F]{2}([0-9a-fA-F]{2})/.exec(v);
  if (m) return parseInt(m[1], 16);
  return null;
}
function requiredLevel(resolution, fps) {
  const f = Number(fps) || 30;
  switch (resolution) {
    case '7680x4320': return f <= 30 ? 180 : (f <= 60 ? 183 : 186);
    case '3840x2160': return f <= 30 ? 150 : 153;
    case '1920x1080': return f <= 30 ? 120 : 123;
    case '1280x720': return f <= 30 ? 93 : 120;
    default: return null;
  }
}
function avcLevelFor(resolution, fps) {
  const f = Number(fps) || 30;
  switch (resolution) {
    case '3840x2160': return f <= 30 ? 51 : 52;
    case '1920x1080': return f <= 30 ? 40 : 42;
    case '1280x720': return 31;
    default: return null;
  }
}
function codecFor(family, resolution, fps) {
  const f = Number(fps) || 30;
  if (family === 'hevc') {
    if (resolution === '3840x2160') return f <= 30 ? { codec: 'hvc1.2.4.L150.B0', level: 150 } : { codec: 'hvc1.2.4.L153.B0', level: 153 };
    if (resolution === '1920x1080') return f >= 50 ? { codec: 'hvc1.2.4.L123.B0', level: 123 } : { codec: 'hvc1.2.4.L120.B0', level: 120 };
    if (resolution === '1280x720') return { codec: 'hvc1.2.4.L93.B0', level: 93 };
    return null;
  }
  if (family === 'h264') {
    if (resolution === '3840x2160') return f <= 30 ? { codec: 'avc1.640033', level: 51 } : null;
    if (resolution === '1920x1080') return f >= 50 ? { codec: 'avc1.64002A', level: 42 } : { codec: 'avc1.640028', level: 40 };
    if (resolution === '1280x720') return { codec: 'avc1.640028', level: 40 };
    return null;
  }
  if (family === 'av1') {
    if (resolution === '3840x2160') return { codec: 'av01.0.13M.10', level: null };
    return { codec: 'av01.0.08M.08', level: null };
  }
  return null;
}
function canonicalSoc(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (CANON.includes(s)) return { soc: s, reason: 'soc_allowlisted', allowed: true };
  if (ALIAS[s]) return { soc: ALIAS[s], reason: 'soc_alias_used', allowed: true };
  if (s === 'unknown' || s === '') return { soc: 'unknown', reason: 'soc_unknown', allowed: false };
  return { soc: 'unknown', reason: 'soc_not_allowlisted', allowed: false };
}

/* ── parser de atributos ────────────────────────────────────────────────── */
function attrAny(line, name) {
  const re = new RegExp('(?:^|[\\s,:])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=("[^"]*"|[^,\\s]*)');
  const m = re.exec(line);
  if (!m) return null;
  let v = m[1];
  if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}
function parseStreamInf(line) {
  const codecs = attrAny(line, 'CODECS') || '';
  const video = firstVideoCodec(codecs);
  const bw = Number(attrAny(line, 'BANDWIDTH'));
  const abw = Number(attrAny(line, 'AVERAGE-BANDWIDTH'));
  const fr = Number(attrAny(line, 'FRAME-RATE'));
  return {
    raw: line,
    bandwidth: Number.isFinite(bw) ? bw : null,
    averageBandwidth: Number.isFinite(abw) ? abw : null,
    resolution: attrAny(line, 'RESOLUTION'),
    frameRate: Number.isFinite(fr) ? fr : null,
    codecs,
    videoCodec: video,
    family: familyFromCodec(video),
    level: levelFromCodec(video),
    videoRange: attrAny(line, 'VIDEO-RANGE'),
    colorPrimaries: attrAny(line, 'COLOR-PRIMARIES'),
    transfer: attrAny(line, 'TRANSFER-CHARACTERISTICS'),
    matrix: attrAny(line, 'MATRIX-COEFFICIENTS'),
    hdcp: attrAny(line, 'HDCP-LEVEL'),
    supplemental: attrAny(line, 'SUPPLEMENTAL-CODECS'),
    stableId: attrAny(line, 'STABLE-VARIANT-ID')
  };
}

/* ── motor de decisión D2 (spec ara-x-codec-policy.v1) ──────────────────── */
function uniqueFlags(a) { return [...new Set(a)]; }

function decide(input) {
  const flags = [];
  const markers = [];
  const F = (f) => flags.push(f);

  const socInfo = canonicalSoc(input.soc_raw);
  if (socInfo.reason === 'soc_alias_used') F('soc_alias_used');
  if (socInfo.reason === 'soc_unknown') F('soc_unknown');
  if (socInfo.reason === 'soc_not_allowlisted') F('soc_not_allowlisted');
  const socOk = socInfo.allowed;

  let fam = input.source_family || 'unknown';
  const probeFam = familyFromCodec(input.probe_codec_string);
  let probeVerified = false;
  if (probeFam) {
    if (probeFam !== fam) F('family_fixed');
    fam = probeFam;
    probeVerified = true;
  }
  const declaredFam = familyFromCodec(firstVideoCodec(input.declared && input.declared.codecs));
  if (declaredFam && declaredFam !== fam) F('declared_codec_mismatch');

  const cascade = input.cascade_type === 'dual-hvc1-hev1';
  if (cascade) F('cascade_verified');

  let fps, fpsKind;
  if (FPS_SET.includes(input.measured_fps)) { fps = input.measured_fps; fpsKind = 'measured'; }
  else if (FPS_SET.includes(Number(input.declared && input.declared.frame_rate))) { fps = Number(input.declared.frame_rate); fpsKind = 'declared'; }
  else { fps = 30; fpsKind = 'default'; }
  if (input.measured_fps === 120) { fps = 60; fpsKind = 'measured'; F('fps_clamped_120'); }
  const ceiling = socOk ? 60 : 30;
  if (fps > ceiling) { fps = Math.min(fps, ceiling); F('fps_clamped_soc'); }

  const eightKDeclared = input.declared && input.declared.resolution === '7680x4320';
  const eightKSrc = input.source_resolution === '7680x4320';
  const eightKReq = Boolean(input.requested_8k) || eightKDeclared || eightKSrc;
  if (eightKReq) F('wire_8k_suppressed');

  let srcRes = input.source_resolution || 'unknown';
  const srcCapped = srcRes === '7680x4320';
  if (srcCapped) srcRes = '3840x2160';

  const tier = input.evidence_tier;
  let res = null, resKind = 'none', pres = false;

  if (tier === 'F5') { res = null; resKind = 'none'; }
  else if (fam === 'unknown') { res = null; resKind = 'unknown'; F('codec_unknown'); }
  else if (srcRes === 'unknown') { res = null; resKind = 'unknown'; }
  else if (srcCapped) { res = '3840x2160'; resKind = 'capped'; }
  else if (socOk && srcRes !== '3840x2160') {
    const cand = codecFor(fam, '3840x2160', fps);
    if (cand) { res = '3840x2160'; resKind = 'presentation'; pres = true; F('presentation_marked'); }
    else { res = srcRes; resKind = 'native'; F('presentation_blocked_level'); }
  } else { res = srcRes; resKind = 'native'; }

  let mode, codec = null, level = null;
  if (tier === 'F5') mode = 'PASSTHROUGH_F5';
  else if (fam === 'unknown' || fam === 'vp9') {
    mode = socOk ? 'TRUTHFUL_SIGNAL' : 'TRUTHFUL_ONLY';
    F('truthful_signal');
    if (fam === 'vp9') F('codec_family_unverified');
  } else if (!socOk) { mode = 'TRUTHFUL_ONLY'; F('truthful_only'); }
  else if (tier === 'F0' && probeVerified) { mode = 'NATIVE_VERIFIED'; F('probe_verified'); }
  else if (cascade && fam === 'hevc' && !probeVerified) { mode = 'DAEMON_VERIFIED'; }
  else { mode = 'TRUTHFUL_SIGNAL'; F('truthful_signal'); }

  if (mode !== 'PASSTHROUGH_F5' && fam !== 'unknown' && fam !== 'vp9' && res) {
    let c = codecFor(fam, res, fps);
    if (!c && res === '3840x2160' && fam === 'h264') { fps = 30; c = codecFor(fam, res, fps); F('fps_clamped_avc_4k60'); }
    if (c) { codec = c.codec; level = c.level; }
  }
  if (codec && declaredFam === fam) {
    const dl = levelFromCodec(firstVideoCodec(input.declared && input.declared.codecs));
    if (dl != null && level != null && dl < level) F('level_fixed');
  }

  if (codec) {
    markers.push('#EXT-X-APE-CODEC-VERIFIED:' + (mode === 'NATIVE_VERIFIED' ? 'true' : 'false'));
    const pref = codecFor(fam, srcCapped ? '3840x2160' : srcRes, fps);
    if (pref) markers.push('#EXT-X-APE-CODEC-PREFERRED:' + pref.codec);
  }
  if (pres) markers.push('#EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k;src=' + srcRes + ';can8k=0');
  if (eightKReq) markers.push('#EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY');

  let thermalBase = 0, thermalTier = 'T2', fpsStep = 0, thermalReason = 'thermal_unavailable';
  const status = input.thermal_status;
  if (status === 'unknown' || status == null) { F('thermal_unavailable'); }
  else {
    thermalReason = 'thermal_measured';
    if (status <= 1) { thermalTier = 'T3'; thermalBase = 0; }
    else if (status === 2) { thermalTier = 'T2'; thermalBase = 1; fpsStep = 0; }
    else if (status <= 4) { thermalTier = 'T1'; thermalBase = 3; fpsStep = 1; }
    else { thermalTier = 'T0'; thermalBase = 6; fpsStep = 2; }
  }
  const fpsApplied = input.player_has_selector !== false;
  let post = thermalBase;
  if (!fpsApplied && fpsStep > 0) { F('fps_unavailable'); post = Math.max(post, Math.min(2 * fpsStep, 9)); }
  if (Number(input.external_post_step) > 0) post = Math.max(post, Number(input.external_post_step));

  const hdrHint = post >= 8 ? 'SDR' : 'PQ';
  if (post >= 8) F('pq_rollback');
  if (hdrHint === 'PQ') markers.push('#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0');

  const hdr = Object.assign({ max_cll: 400, max_fall: 100, avg: 1000, peak: 400, dv_requested: false }, input.hdr || {});
  if (Number(hdr.max_fall) > Number(hdr.max_cll)) {
    F('hdr_metadata_fixed');
    markers.push('#EXT-X-APE-HDR-MAXFALL:' + Number(hdr.max_cll));
  }
  if (hdr.dv_requested) F('dv_without_codec');

  const qoe = input.qoe || {};
  if (qoe.observed === false) F('qoe_unknown');
  if (qoe.modeled_only === true) F('modeled_not_measured');
  if (input.variant_present === false) F('channels_without_variant');
  if (input.declared_url) F('url_not_in_decision');
  if (input.missing_codec_evidence) F('missing_codec_evidence');

  const kIn = input.player_knobs || {};
  const knobs = {
    vlc_adaptive_maxwidth: Math.min(3840, Number.isFinite(kIn.vlc_maxwidth) ? kIn.vlc_maxwidth : 3840),
    vlc_adaptive_maxheight: Math.min(2160, Number.isFinite(kIn.vlc_maxheight) ? kIn.vlc_maxheight : 2160),
    vlc_vrr_max: Math.min(60, Number.isFinite(kIn.vlc_vrr_max) ? kIn.vlc_vrr_max : 60),
    vlc_video_fps: Math.min(fps, 60),
    vlc_minterpolate_fps: 0,
    kodi_video_codec: fam === 'hevc' ? 'hvc1' : fam === 'h264' ? 'h264' : fam === 'av1' ? 'av1' : fam === 'vp9' ? 'vp9' : 'none'
  };
  if (Number(kIn.vlc_maxwidth) !== knobs.vlc_adaptive_maxwidth || Number(kIn.vlc_maxheight) !== knobs.vlc_adaptive_maxheight ||
      Number(kIn.vlc_vrr_max) !== knobs.vlc_vrr_max || Number(kIn.vlc_minterpolate_fps) !== 0) F('knobs_clamped');
  if (Number(kIn.vlc_video_fps) !== knobs.vlc_video_fps) F('fps_fixed');

  const tierName = post === 0 ? 'max_image' : post <= 3 ? 'quality' : post <= 6 ? 'balanced' : 'minimal';
  const fcReasons = [];
  if (socInfo.reason === 'soc_unknown') fcReasons.push('soc_unknown');
  if (socInfo.reason === 'soc_not_allowlisted') fcReasons.push('soc_not_allowlisted');
  if (fam === 'unknown') fcReasons.push('family_unknown');
  if (tier === 'F5') fcReasons.push('tier_f5');

  const reason = mode === 'PASSTHROUGH_F5' ? 'passthrough_f5'
    : mode === 'NATIVE_VERIFIED' ? 'probe_verified'
      : mode === 'DAEMON_VERIFIED' ? 'cascade_verified'
        : fam === 'unknown' ? 'codec_unknown'
          : !socOk ? (socInfo.reason === 'soc_unknown' ? 'soc_unknown' : 'soc_not_allowlisted')
            : pres ? 'presentation_4k_truthful_codec'
              : 'truthful_family';

  return {
    spec: SPEC,
    channel: {
      id: String(input.channel_id || 'unknown'),
      evidence_tier: tier,
      source_family: input.source_family || 'unknown',
      source_resolution: input.source_resolution || 'unknown',
      measured_fps: input.measured_fps == null ? null : input.measured_fps,
      cascade,
      probe_verified: probeVerified
    },
    wire: {
      mode,
      resolution: res,
      resolution_kind: resKind,
      video_codec: codec,
      codecs: codec ? codec + AUDIO : null,
      video_range: hdrHint,
      video_range_kind: hdrHint === 'PQ' ? 'display_intent' : 'none',
      frame_rate: fps,
      frame_rate_kind: fpsKind,
      supplemental_codecs: null,
      level_idc: level,
      reason
    },
    markers: uniqueFlags(markers).slice(0, 6),
    device: { allowed: socOk, soc: socInfo.soc, reason: socInfo.reason },
    display: {
      mode: res === '3840x2160' ? '4k' : 'native',
      wire_resolution: '3840x2160',
      min_resolution: '3840x2160',
      never_downscale: true,
      eight_k: 'presentation_only',
      hdr_hint: hdrHint
    },
    fps: { target: [60, 30, 24][fpsStep], current: input.measured_fps == null ? null : input.measured_fps, min: 24, step: fpsStep, applied: fpsApplied },
    processing: { tier: tierName, post_step: post },
    degrade: { order: ['fps', 'processing'], resolution: 'forbidden' },
    knobs,
    thermal: { status: status == null ? 'unknown' : status, tier: thermalTier, clamps: thermalBase, reason: thermalReason },
    flags: uniqueFlags(flags).filter((f) => /^[a-z0-9_]+$/.test(f)).slice(0, 16),
    fail_closed: { active: !socOk || fam === 'unknown' || tier === 'F5', reasons: uniqueFlags(fcReasons).slice(0, 4) }
  };
}

/* ── clasificación de una variante del catálogo ─────────────────────────── */
function severityRank(sev) {
  return { critical: 3, high: 2, medium: 1, low: 0 }[sev] != null ? { critical: 3, high: 2, medium: 1, low: 0 }[sev] : 0;
}

function classifyVariant(ctx) {
  const d = ctx.declared || {};
  const ib = ctx.inband || {};
  const kn = ib.knobs || {};
  const findings = [];
  const add = (id) => { if (RULES[id] && !findings.includes(id)) findings.push(id); };

  const fam = ctx.family || null;
  const measured = Number(ctx.measured_fps);
  const hasMeasured = FPS_SET.includes(measured);
  const declFps = d.frameRate != null ? Number(d.frameRate) : (hasMeasured ? measured : 30);

  // R01 wire 8K
  if (d.resolution === '7680x4320' || (ib.present_resolution === '7680x4320')) add('I5-R01');

  // R02 public level vs declared resolution/fps
  if (d.resolution && d.videoCodec) {
    if (d.family === 'hevc' && d.level != null) {
      const req = requiredLevel(d.resolution, declFps);
      if (req != null && d.level < req) add('I5-R02');
    } else if (d.family === 'h264' && d.level != null) {
      const req = avcLevelFor(d.resolution, declFps);
      if (req != null && d.level < req) add('I5-R02');
    }
  }

  // R02H hint level vs its own evidence
  if (ib.codecPreferred) {
    const hFam = familyFromCodec(ib.codecPreferred);
    const hLevel = levelFromCodec(ib.codecPreferred);
    const hintRes = d.resolution || ib.cmafRes;
    if (hFam === 'hevc' && hLevel != null && hintRes) {
      const req = requiredLevel(hintRes, declFps);
      if (req != null && hLevel < req) add('I5-R02H');
    }
  }

  // R03/R04 FZ-01
  if (fam === 'h264' && d.family === 'hevc') {
    add('I5-R03');
    if (d.videoRange === 'PQ') add('I5-R04');
  }
  if (fam === 'unknown' && d.family === 'hevc') add('I5-R03');

  // R05 fake CMAF
  if (ib.cmafContainer && String(ib.cmafContainer).toLowerCase() === 'mpegts') add('I5-R05');
  else if (ib.cmafInit && !ctx.fileHasMap) add('I5-R05');

  // R06 fake LCEVC
  if (ib.lcevcEnabled && !/lcev/.test(String(d.codecs || '')) && !/lcev/.test(String(d.supplemental || ''))) add('I5-R06');

  // R07 fake DV
  if (ib.dvProfile && !/dvh1|dvhe/.test(String(d.codecs || '')) && !/dvh1|dvhe/.test(String(d.supplemental || ''))) add('I5-R07');

  // R08 AI-SR without device scope
  if (ib.aiSrEnabled && !/SCOPE=DEVICE/i.test(String(ib.aiSrRaw || ''))) add('I5-R08');
  if (ib.aiFiEnabled && !/SCOPE=DEVICE/i.test(String(ib.aiFiRaw || ''))) add('I5-R08');

  // R09 PQ over SDR without intent marker
  const inbandSdr = /^SDR/i.test(String(ib.cmafHdr || '')) || /^SDR/i.test(String(ib.daterangeHdr || ''));
  if (d.videoRange === 'PQ' && inbandSdr && !ib.hdrIntent) add('I5-R09');

  // R10 impossible HDR metadata
  if (Number(ib.hdrMaxFall) > Number(ib.hdrMaxCll)) add('I5-R10');
  if (Number(ib.hdrAvg) > Number(ib.hdrPeak)) add('I5-R10');

  // R11 frame-rate overclaim
  if (hasMeasured && d.frameRate != null && Number(d.frameRate) > measured) add('I5-R11');

  // R12 4K 9-15 Mbps with AVC family
  if (d.resolution === '3840x2160' && fam === 'h264' && d.bandwidth != null && d.bandwidth >= 9000000 && d.bandwidth < 15000000) add('I5-R12');

  // R13 malformed CMAF codecs
  if (ib.cmafCodecs && /(^|,)\s*(,|$)/.test(String(ib.cmafCodecs).trim())) add('I5-R13');

  // R14 knobs
  if (Number(kn.vlcMaxWidth) > 3840 || Number(kn.vlcMaxHeight) > 2160 || Number(kn.vlcVrrMax) > 60 || Number(kn.vlcMinterpolateFps) > 60) add('I5-R14');

  // R15 FPS conflict
  const fpsVals = [measured, Number(d.frameRate), Number(kn.vlcVideoFps), Number(kn.xFramerate)].filter((v) => FPS_SET.includes(v));
  if (new Set(fpsVals).size > 1) add('I5-R15');

  // R23 blanket 4K without presentation marker
  if (d.resolution === '3840x2160' && (ib.cmafRes === '1280x720' || ib.cmafRes === '1920x1080') && !ib.upscaleMarker) add('I5-R23');

  // R25 8KFAKE absent on a 4K wire channel
  if (d.resolution === '3840x2160' && !ib.eightKFake) add('I5-R25');

  // R26/R27 verified/supplemental
  if (ib.codecVerified === true && !ib.codecReal) add('I5-R26');
  if (d.supplemental && !ctx.fileHasSupplemental) add('I5-R27');

  // R28 transfer contradiction
  if (ib.hdrTransfer === 'BT1886' && d.transfer === '16') add('I5-R28');

  // R31 no codec evidence
  if (!ib.codecPreferred && !ib.codecVerifiedPresent) add('I5-R31');

  // proposed wire target (D2)
  const wireTarget = decide({
    channel_id: ctx.tvg_id || 'unknown',
    evidence_tier: ctx.evidenceTier || 'F2',
    source_family: fam || 'unknown',
    source_resolution: ib.cmafRes || 'unknown',
    measured_fps: hasMeasured ? measured : null,
    cascade_type: null,
    probe_codec_string: null,
    declared: { resolution: d.resolution, codecs: d.codecs, video_range: d.videoRange, frame_rate: d.frameRate },
    player_knobs: {
      vlc_maxwidth: Number(kn.vlcMaxWidth) || 3840,
      vlc_maxheight: Number(kn.vlcMaxHeight) || 2160,
      vlc_vrr_max: Number(kn.vlcVrrMax) || 60,
      vlc_video_fps: Number(kn.vlcVideoFps) || 30,
      vlc_minterpolate_fps: Number(kn.vlcMinterpolateFps) || 0,
      kodi_video_codec: kn.kodiVideoCodec || 'none'
    },
    soc_raw: ctx.socRaw || 's905x4',
    thermal_status: 0,
    qoe: { observed: true, modeled_only: false },
    player_has_selector: true,
    requested_8k: false,
    variant_present: ctx.hasVariant !== false,
    missing_codec_evidence: !ib.codecPreferred,
    hdr: { max_cll: Number(ib.hdrMaxCll) || 400, max_fall: Number(ib.hdrMaxFall) || 100, avg: Number(ib.hdrAvg) || 0, peak: Number(ib.hdrPeak) || 0, dv_requested: Boolean(ib.dvProfile) }
  });

  let classification = 'PASS';
  if (findings.some((id) => severityRank(RULES[id].severity) >= 2)) classification = 'VIOLATION';
  else if (findings.length > 0) classification = 'WARN';

  return { classification, findings, wire_target: wireTarget.wire, markers: wireTarget.markers };
}

module.exports = {
  SPEC,
  CANON,
  ALIAS,
  RULES,
  RULE_IDS,
  canonicalSoc,
  familyFromCodec,
  firstVideoCodec,
  levelFromCodec,
  requiredLevel,
  avcLevelFor,
  codecFor,
  attrAny,
  parseStreamInf,
  decide,
  classifyVariant,
  severityRank
};
