/* ═══════════════════════════════════════════════════════════════════════════
 * CASCADA DE CODECS CON SERIALES + FALLBACK ARMABLE
 *
 * Fuente: codec-cascade-actual.csv (13 tiers, Main 10, L3.0 -> L6.2).
 * El SERIAL de un tier es su codec string completo (RFC 6381), que es unico:
 *   hvc1.2.4.L153.B0  ==  Main10 / Level 5.1 / 4096x2160 @ 60
 *
 * GOLDEN RULE del repo que aqui se respeta: `hvc1.*` va en STREAM-INF y
 * `hev1.*` en KODIPROP/EXTVLCOPT. NUNCA cruzados. Cada tier guarda los dos
 * seriales y se elige el que corresponde al destino.
 *
 * FALLBACK: si el decoder del player no soporta el tier elegido, se baja por la
 * cascada hasta el primero que SI cabe. Cada salto se declara con su motivo. Un
 * fallback silencioso es una degradacion invisible; aqui se ve.
 * ═══════════════════════════════════════════════════════════════════════════ */

const CODEC_CASCADE = [
  { tier: 1,  hvc1: 'hvc1.2.4.L186.B0', hev1: 'hev1.2.4.L186.B0', profile: 'Main 10', level: '6.2', maxW: 8192, maxH: 4320, maxFps: 120, role: 'CORONA ABSOLUTA - 8K@120 HDR' },
  { tier: 2,  hvc1: 'hvc1.2.4.L183.B0', hev1: 'hev1.2.4.L183.B0', profile: 'Main 10', level: '6.1', maxW: 8192, maxH: 4320, maxFps: 60,  role: '8K@60 HDR' },
  { tier: 3,  hvc1: 'hvc1.2.4.L180.B0', hev1: 'hev1.2.4.L180.B0', profile: 'Main 10', level: '6',   maxW: 8192, maxH: 4320, maxFps: 30,  role: '8K@30 HDR' },
  { tier: 4,  hvc1: 'hvc1.2.4.L156.B0', hev1: 'hev1.2.4.L156.B0', profile: 'Main 10', level: '5.2', maxW: 4096, maxH: 2160, maxFps: 120, role: '4K@120 HDR' },
  { tier: 5,  hvc1: 'hvc1.2.4.L153.B0', hev1: 'hev1.2.4.L153.B0', profile: 'Main 10', level: '5.1', maxW: 4096, maxH: 2160, maxFps: 60,  role: '4K@60 HDR' },
  { tier: 6,  hvc1: 'hvc1.2.4.L150.B0', hev1: 'hev1.2.4.L150.B0', profile: 'Main 10', level: '5',   maxW: 4096, maxH: 2160, maxFps: 30,  role: '4K@30 HDR' },
  { tier: 7,  hvc1: 'hvc1.2.4.L123.B0', hev1: 'hev1.2.4.L123.B0', profile: 'Main 10', level: '4.1', maxW: 2048, maxH: 1080, maxFps: 60,  role: '1080p@60 HDR' },
  { tier: 8,  hvc1: 'hvc1.2.4.L123.B0', hev1: 'hev1.2.4.L123.B0', profile: 'Main 10', level: '4.1', maxW: 1920, maxH: 1080, maxFps: 50,  role: '1080p@50 HDR broadcast EU' },
  { tier: 9,  hvc1: 'hvc1.2.4.L120.B0', hev1: 'hev1.2.4.L120.B0', profile: 'Main 10', level: '4',   maxW: 2048, maxH: 1080, maxFps: 30,  role: '1080p@30 10-bit' },
  { tier: 10, hvc1: 'hvc1.2.4.L93.B0',  hev1: 'hev1.2.4.L93.B0',  profile: 'Main 10', level: '3.1', maxW: 1280, maxH: 720,  maxFps: 60,  role: '720p@60 HDR alto framerate' },
  { tier: 11, hvc1: 'hvc1.2.4.L93.B0',  hev1: 'hev1.2.4.L93.B0',  profile: 'Main 10', level: '3.1', maxW: 1280, maxH: 720,  maxFps: 34,  role: '720p HDR 10-bit' },
  { tier: 12, hvc1: 'hvc1.2.4.L90.B0',  hev1: 'hev1.2.4.L90.B0',  profile: 'Main 10', level: '3',   maxW: 854,  maxH: 480,  maxFps: 30,  role: '480p HDR (16:9 SD-wide)' },
  { tier: 13, hvc1: 'hvc1.2.4.L90.B0',  hev1: 'hev1.2.4.L90.B0',  profile: 'Main 10', level: '3',   maxW: 720,  maxH: 480,  maxFps: 30,  role: '480p HDR (NTSC 4:3)' }
];

function cascadeByTier(t) { return CODEC_CASCADE.filter((c) => c.tier === Number(t))[0] || null; }
function cascadeBySerial(s) { return CODEC_CASCADE.filter((c) => c.hvc1 === String(s) || c.hev1 === String(s))[0] || null; }

/* Elige el serial segun el destino. GOLDEN RULE: hvc1 en STREAM-INF,
 * hev1 en KODIPROP/EXTVLCOPT. Nunca cruzados. */
function serialFor(tier, where) {
  const c = cascadeByTier(tier);
  if (!c) return null;
  return where === 'kodiprop' || where === 'extvlcopt' ? c.hev1 : c.hvc1;
}

/* ── FALLBACK ARMABLE ──────────────────────────────────────────────────────
 * Dada una lista de tiers pedida (o un serial), un player y un target, baja por
 * la cascada hasta el primer tier que el decoder soporta Y que cubre el target.
 * Devuelve la traza COMPLETA: cada tier con su veredicto y su motivo.
 */
function resolveFallback(opts) {
  const o = opts || {};
  const playerId = String(o.player || 'onn-4k');
  const caps = PLAYER_CAPS[playerId];
  if (!caps) return { ok: false, error: 'player desconocido: ' + playerId };

  const targetId = String(o.target || 'UHD_4K');
  const target = OUTPUT_TARGETS[targetId];
  if (!target) return { ok: false, error: 'target desconocido: ' + targetId };

  const fps = Number(o.fps) || 25;

  /* Cadena pedida: o un tier concreto, o una lista custom del operador, o la
   * cascada entera como fallback por defecto. */
  let chain = [];
  if (Array.isArray(o.tiers) && o.tiers.length) {
    chain = o.tiers.map(Number).filter((t) => cascadeByTier(t));
  } else if (o.tier != null) {
    chain = [Number(o.tier)];
  } else if (o.serial) {
    const c = cascadeBySerial(o.serial);
    chain = c ? [c.tier] : [];
  }
  if (!chain.length) chain = CODEC_CASCADE.map((c) => c.tier);

  // el player solo decodifica HEVC si lo declara
  const playerHevc = caps.codecs.some((c) => c === 'hvc1' || c === 'hvc1_8');

  const trace = [];
  let chosen = null;

  for (const t of chain) {
    const c = cascadeByTier(t);
    if (!c) continue;
    const diag = { tier: c.tier, serial: c.hvc1, level: c.level, role: c.role, verdict: null, reason: null };

    // 1. el player tiene decoder HEVC?
    if (!playerHevc) {
      diag.verdict = 'SKIP';
      diag.reason = caps.label + ' no declara decoder HEVC (codecs: ' + caps.codecs.join(',') + ')';
      trace.push(diag); continue;
    }
    // 2. el nivel cubre el target?
    if (c.maxW < target.w || c.maxH < target.h) {
      diag.verdict = 'SKIP';
      diag.reason = 'tier ' + c.tier + ' llega a ' + c.maxW + 'x' + c.maxH + ', el target es ' + target.w + 'x' + target.h;
      trace.push(diag); continue;
    }
    // 3. el decoder del player llega a esa resolucion?
    if (c.maxW > caps.maxW || c.maxH > caps.maxH) {
      diag.verdict = 'SKIP';
      diag.reason = 'decoder de ' + caps.label + ' limita a ' + caps.maxW + 'x' + caps.maxH
        + ' y el tier llega a ' + c.maxW + 'x' + c.maxH;
      trace.push(diag); continue;
    }
    // 4. fps: el tier debe cubrir la cadencia pedida
    if (c.maxFps < fps) {
      diag.verdict = 'SKIP';
      diag.reason = 'tier ' + c.tier + ' llega a ' + c.maxFps + ' fps, se piden ' + fps;
      trace.push(diag); continue;
    }
    // 5. HDR pide Main10 (todos los tiers lo son) y el player debe soportarlo
    if (target.hdr && !caps.main10) {
      diag.verdict = 'SKIP';
      diag.reason = caps.label + ' no tiene Main10: no puede sostener HDR';
      trace.push(diag); continue;
    }

    diag.verdict = 'USADO';
    diag.reason = 'primer tier que el decoder acepta y que cubre ' + target.w + 'x' + target.h + ' @ ' + fps + 'fps';
    trace.push(diag);
    chosen = c;
    break;
  }

  // si ninguno sirve: AVC seguro a 1080p como ultimo recurso, declarado
  if (!chosen) {
    return {
      ok: true,
      player: { id: playerId, label: caps.label, maxW: caps.maxW, maxH: caps.maxH },
      target: { id: targetId, label: target.label, w: target.w, h: target.h, hdr: target.hdr },
      fps,
      chosen: null,
      fallbackToAvc: {
        serial: 'avc1.640028',
        reason: 'ningun tier de la cascada cabe en ' + caps.label + '; se declara AVC High 1080p como ultimo recurso',
        safe: true
      },
      trace,
      impossible: ['ningun tier HEVC de los ' + CODEC_CASCADE.length + ' sirve para este player+target']
    };
  }

  return {
    ok: true,
    player: { id: playerId, label: caps.label, maxW: caps.maxW, maxH: caps.maxH },
    target: { id: targetId, label: target.label, w: target.w, h: target.h, hdr: target.hdr },
    fps,
    chosen: {
      tier: chosen.tier,
      serial: chosen.hvc1,
      serialKodiprop: chosen.hev1,
      level: chosen.level,
      role: chosen.role,
      profile: chosen.profile
    },
    // cuantos se saltaron y por que
    skipped: trace.filter((t) => t.verdict === 'SKIP').length,
    trace,
    // la cadena que el operador puede armar a mano, ya resuelta
    chainResolved: trace.map((t) => t.tier + ':' + t.verdict),
    impossible: []
  };
}

