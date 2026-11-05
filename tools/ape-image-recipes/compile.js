#!/usr/bin/env node
/**
 * APE Image Recipe Compiler — una receta, tres proyecciones.
 *
 *   recipes.json  →  { vlc_video_filter, ffmpeg_lavfi, manifest_json }
 *
 * Proyecciones:
 *   1. vlc      : cadena nativa de módulos VLC para #EXTVLCOPT:video-filter=
 *                 (solo se emiten etapas con vlc_verified === true; fail-closed)
 *   2. ffmpeg   : cadena -lavfi para el carril ffmpeg (VPS / LAB transcode)
 *   3. manifest : objeto JSON compacto que viaja en la playlist como metadata
 *
 * Uso:
 *   node compile.js --profile P5 --emit manifest
 *   node compile.js --profile P5 --emit vlc
 *   node compile.js --profile P5 --emit ffmpeg
 *   node compile.js --profile P5 --emit m3u --url "http://host/x/y/123"
 *   node compile.js --all
 *
 * Sin dependencias externas. No escribe red ni toca el VPS.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RECIPES_PATH = path.join(__dirname, 'recipes.json');

/**
 * Tokens que VLC NO resuelve como módulo de video. Si alguno aparece en la
 * proyección `vlc`, se aborta la emisión: es exactamente el fallo medido en
 * APE_LISTA_1793589060441.m3u8 (11 pseudo-módulos rechazados).
 */
const VLC_FORBIDDEN_TOKENS = [
  'nlmeans', 'bwdif', 'yadif=', 'zscale', 'minterpolate',
  'unsharp', 'cas=', 'libplacebo', 'pp=', 'ffmpeg{'
];

function loadRecipes() {
  const raw = fs.readFileSync(RECIPES_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (data.schema !== 'ape.image-recipe/1') {
    throw new Error(`schema inesperado: ${data.schema}`);
  }
  return data;
}

function buildVlcChain(profile) {
  const emitted = [];
  const skipped = [];
  for (const stage of profile.stages) {
    if (stage.vlc === null || stage.vlc === undefined) {
      skipped.push({ id: stage.id, reason: 'sin modulo VLC equivalente' });
      continue;
    }
    if (stage.vlc_verified !== true) {
      skipped.push({ id: stage.id, reason: 'vlc_verified !== true (fail-closed)' });
      continue;
    }
    emitted.push(stage.vlc);
  }
  // t4 (medido): ':' separa modulos; ',' NO (carga solo el primero).
  const chain = emitted.join(':');
  for (const token of VLC_FORBIDDEN_TOKENS) {
    if (chain.includes(token)) {
      throw new Error(
        `proyeccion vlc contiene token no resoluble por VLC: "${token}" en "${chain}"`
      );
    }
  }
  return { chain, emitted, skipped };
}

function buildFfmpegChain(profile) {
  const parts = [];
  const skipped = [];
  for (const stage of profile.stages) {
    if (!stage.ffmpeg) {
      skipped.push({ id: stage.id, reason: 'sin etapa ffmpeg' });
      continue;
    }
    parts.push(stage.ffmpeg);
  }
  // Higiene sintactica: filtros y valores que ffmpeg 8 rechaza (medido).
  const chain = parts.join(',');
  const banned = [
    [/\bpp=/, 'el filtro pp no existe en ffmpeg 8'],
    [/transfer=bt1886/, 'zimg no tiene transfer bt1886'],
    [/dither=blue-noise/, 'zscale no acepta blue-noise'],
    [/accurate_rnd/, 'accurate_rnd es flag de swscale, no de zscale'],
    [/\bme=(umh|tss|epzs)/, 'minterpolate usa me_mode, no me']
  ];
  for (const [re, why] of banned) {
    if (re.test(chain)) throw new Error(`proyeccion ffmpeg invalida: ${why}`);
  }
  const gradfun = /gradfun=radius=(\d+):strength=([\d.]+)/g;
  let m;
  while ((m = gradfun.exec(chain)) !== null) {
    const strength = parseFloat(m[2]);
    if (strength < 0.51 || strength > 64) {
      throw new Error(`gradfun strength fuera de rango [0.51,64]: ${strength}`);
    }
  }
  return { chain, skipped };
}

function buildManifestObject(profileKey, profile, vlc) {
  return {
    s: 'ape.image-recipe/1',
    p: profileKey,
    tier: profile.tier,
    src: profile.source_resolution,
    dst: profile.target_resolution,
    fps: profile.fps,
    hdr: profile.hdr,
    vlc: vlc.emitted,
    vlc_separator: ':',
    executed_by: 'vlc-cli-only',
    policy_block: 'VLC 3.0.24 ignora video-filter cuando viene de un item de playlist: "unsafe option ... ignored for security reasons" (medido por t4). El filtro solo ejecuta por linea de comandos.',
    note: 'metadata declarativa; la aplica el runtime VLC por CLI. Un player sin motor VLC la ignora.'
  };
}

function emitM3uBlock(profileKey, profile, url, vppIntensity, emitVlcopt) {
  const vlc = buildVlcChain(profile);
  const manifest = buildManifestObject(profileKey, profile, vlc);
  const lines = [];
  // Por defecto NO se emite: en playlist VLC lo descarta por politica (t4). Se activa con
  // --emit-vlcopt solo para laboratorios/fork concretos que lo permitan.
  if (emitVlcopt) {
    lines.push(`#EXTVLCOPT:video-filter=${vlc.chain}`);
  }
  lines.push(`#EXT-X-APE-IMAGE-RECIPE:${JSON.stringify(manifest)}`);
  lines.push(url || `http://host:port/user/pass/${profileKey.toLowerCase()}-channel.ts`);

  // Layout medido en APE_LISTA_1793589060441.m3u8 (t1): el URI NO es la ultima
  // linea del bloque. Tras el URI vienen 2 tags y luego una linea vacia
  // (lines_after_uri=3 en 10.572 canales).
  //
  // VPP_INTENSITY solo se emite si el operador lo aporta: el unico valor
  // observado en la lista real es P3 -> 55. Inventarlo seria mock.
  lines.push('#EXTVLCOPT:clock-jitter=0');
  let crystal = `#EXT-X-APE-CRYSTAL-UHD:PROFILE=${profileKey};SCOPE=DISPLAY;PIXELS=0`;
  if (typeof vppIntensity === 'number' && Number.isFinite(vppIntensity)) {
    crystal = `#EXT-X-APE-CRYSTAL-UHD:PROFILE=${profileKey};VPP_INTENSITY=${vppIntensity};SCOPE=DISPLAY;PIXELS=0`;
  }
  lines.push(crystal);
  lines.push('');
  return lines;
}

function main(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  const data = loadRecipes();
  const profiles = data.profiles;

  // ── --emit bundle ────────────────────────────────────────────────────────
  // Empaqueta TODAS las recetas para el navegador: una sola verdad
  // (recipes.json) → un global `window.APE_IMAGE_RECIPES` que consume el
  // generador. Sin esto el generador tendría que duplicar las cadenas.
  if (args.emit === 'bundle' || args.bundle) {
    const bundle = {
      schema: 'ape.image-recipes-bundle/1',
      source: 'tools/ape-image-recipes/recipes.json',
      recipe_version: data.version,
      generated_at: new Date().toISOString(),
      profiles: {}
    };
    for (const key of Object.keys(profiles)) {
      const profile = profiles[key];
      const vlc = buildVlcChain(profile);
      const ffmpeg = buildFfmpegChain(profile);
      bundle.profiles[key] = {
        source_resolution: profile.source_resolution,
        target_resolution: profile.target_resolution,
        vlc: vlc.chain,
        vlc_skipped: vlc.skipped,
        ffmpeg: ffmpeg.chain,
        ffmpeg_skipped: ffmpeg.skipped,
        manifest: buildManifestObject(key, profile, vlc)
      };
    }
    const js =
      '/* AUTO-GENERADO — no editar a mano.\n' +
      ' * Fuente: tools/ape-image-recipes/recipes.json\n' +
      ' * Regenerar: node tools/ape-image-recipes/compile.js --emit bundle\n' +
      ' * Una sola verdad (settings) → proyecciones por idioma de player:\n' +
      ' *   vlc    = cadena de MÓDULOS VLC (verificados: gradfun/deinterlace/sharpen/hqdn3d)\n' +
      ' *   ffmpeg = filtergraph -lavfi REAL (rangos ffmpeg 8.0.1)\n' +
      ' *   manifest = objeto JSON declarativo\n' +
      ' */\n' +
      '(function (root, R) {\n' +
      '  if (typeof window !== "undefined") window.APE_IMAGE_RECIPES = R;\n' +
      '  if (root && typeof root === "object") root.APE_IMAGE_RECIPES = R;\n' +
      '  if (typeof module !== "undefined" && module.exports) module.exports = R;\n' +
      '})(typeof globalThis !== "undefined" ? globalThis : this, ' + JSON.stringify(bundle) + ');\n';
    const defaultOut = path.join(
      __dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'ape-image-recipes-bundle.js'
    );
    const outPath = typeof args.out === 'string' ? args.out : defaultOut;
    fs.writeFileSync(outPath, js, 'utf8');
    process.stderr.write(`bundle escrito: ${outPath} (${js.length} B, ${Object.keys(bundle.profiles).length} perfiles)\n`);
    return 0;
  }

  if (args.all || Object.keys(args).length === 0) {
    const out = [];
    for (const key of Object.keys(profiles)) {
      const profile = profiles[key];
      const vlc = buildVlcChain(profile);
      const ffmpeg = buildFfmpegChain(profile);
      out.push({
        profile: key,
        target: profile.target_resolution,
        vlc: vlc.chain,
        vlc_skipped: vlc.skipped,
        ffmpeg: ffmpeg.chain,
        ffmpeg_skipped: ffmpeg.skipped
      });
    }
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return 0;
  }

  const key = args.profile;
  if (!key || !profiles[key]) {
    process.stderr.write(
      `perfil invalido: ${key}. Disponibles: ${Object.keys(profiles).join(', ')}\n`
    );
    return 2;
  }
  const profile = profiles[key];
  const mode = args.emit || 'summary';

  if (mode === 'vlc') {
    process.stdout.write(buildVlcChain(profile).chain + '\n');
    return 0;
  }
  if (mode === 'ffmpeg') {
    process.stdout.write(buildFfmpegChain(profile).chain + '\n');
    return 0;
  }
  if (mode === 'manifest') {
    const vlc = buildVlcChain(profile);
    process.stdout.write(JSON.stringify(buildManifestObject(key, profile, vlc)) + '\n');
    return 0;
  }
  if (mode === 'm3u') {
    const vpp = args['vpp-intensity'] !== undefined ? parseInt(args['vpp-intensity'], 10) : undefined;
    const emitVlcopt = Boolean(args['emit-vlcopt']);
    for (const line of emitM3uBlock(key, profile, args.url, vpp, emitVlcopt)) {
      process.stdout.write(line + '\n');
    }
    return 0;
  }

  const vlc = buildVlcChain(profile);
  const ffmpeg = buildFfmpegChain(profile);
  process.stdout.write(
    JSON.stringify({ profile: key, vlc: vlc.chain, vlc_skipped: vlc.skipped, ffmpeg: ffmpeg.chain }, null, 2) + '\n'
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    process.stderr.write(`compile.js ERROR: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { loadRecipes, buildVlcChain, buildFfmpegChain, buildManifestObject, VLC_FORBIDDEN_TOKENS };
