#!/usr/bin/env node
'use strict';
/**
 * Reemplaza el helper apeFilterDialects del generador por la versión que consume
 * el bundle SSOT (window.APE_IMAGE_RECIPES). Reescritura por conteo de llaves para
 * no depender de un texto exacto frágil.
 */
const fs = require('fs');
const path = require('path');

const GEN = path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-v9', 'm3u8-typed-arrays-ultimate.js');
const src = fs.readFileSync(GEN, 'utf8');

const MARK = 'function apeFilterDialects(profile, cfg) {';
const start = src.indexOf(MARK);
if (start < 0) { console.error('NO SE ENCONTRÓ apeFilterDialects'); process.exit(1); }

let i = src.indexOf('{', start);
let depth = 0;
let end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) { console.error('NO SE CERRÓ LA FUNCIÓN'); process.exit(1); }

const NEW = `function apeFilterDialects(profile, cfg) {
        // ── FUENTE ÚNICA: tools/ape-image-recipes/recipes.json ──────────────
        // El bundle \`ape-image-recipes-bundle.js\` publica window.APE_IMAGE_RECIPES
        // (generado por: node tools/ape-image-recipes/compile.js --emit bundle).
        // De la MISMA receta salen todas las proyecciones: no hay dos verdades.
        const c = cfg || {};
        const W = (c.width > 0 && c.width <= 7680) ? c.width : 3840;
        const H = (c.height > 0 && c.height <= 4320) ? c.height : 2160;
        const R = (typeof window !== 'undefined' && window.APE_IMAGE_RECIPES) ? window.APE_IMAGE_RECIPES : null;
        const rec = (R && R.profiles && R.profiles[profile]) ? R.profiles[profile] : null;

        // Fail-closed: si el bundle no está, se usa la receta P3 documentada
        // (módulos VLC verificados + ffmpeg dentro de rango). Nunca una cadena
        // con módulos que VLC/ffmpeg no resuelven.
        const vlcChain = (rec && rec.vlc)
            ? rec.vlc
            : 'hqdn3d:gradfun{strength=1.6,radius=12}:sharpen{sigma=0.4}';
        const ffmpeg = (rec && rec.ffmpeg)
            ? rec.ffmpeg
            : 'hqdn3d=1:0.8:3:2.5,zscale=w=3840:h=2160:filter=lanczos,gradfun=radius=12:strength=1.6,unsharp=lx=3:ly=3:la=0.28,format=yuv420p10le';
        const target = (rec && rec.target_resolution) ? rec.target_resolution : (W + 'x' + H);
        const skipped = (rec && Array.isArray(rec.vlc_skipped))
            ? rec.vlc_skipped.map(function (s) { return s.id; }).join(',')
            : 'upscale,output';
        const bundleOk = !!rec;

        const exo = {
            schema: 'ape.image-recipe/1',
            profile: profile,
            target: target,
            vlc: vlcChain,
            ffmpeg: ffmpeg,
            lane: 'manifest',
            apply: 'device',
            vlc_policy: 'playlist-video-filter-inert-in-vlc-3.0.24',
            kodi: 'no_playlist_filter_dsl',
            source: bundleOk ? 'recipes.json' : 'fallback-P3'
        };
        const exoJson = JSON.stringify(exo);
        let exoB64 = '';
        try {
            if (typeof btoa === 'function') {
                exoB64 = btoa(exoJson).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
            } else if (typeof Buffer !== 'undefined') {
                exoB64 = Buffer.from(exoJson, 'utf8').toString('base64')
                    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
            }
        } catch (e) { exoB64 = ''; }

        const canonical = [
            'SCHEMA=ape.image-recipe/1',
            'PROFILE=' + profile,
            'TARGET=' + target,
            'VLC=' + vlcChain,
            'FFMPEG=' + ffmpeg,
            'VLC_SKIPPED=' + (skipped || 'none'),
            'SOURCE=' + (bundleOk ? 'recipes.json' : 'fallback-P3')
        ].join(';');

        const metadata = [
            '#EXT-X-APE-FILTERS:' + canonical,
            // Carril VLC: módulos REALES verificados (gradfun/deinterlace/sharpen/hqdn3d).
            // OJO MEDIDO: VLC 3.0.24 IGNORA video-filter venido de playlist por política
            // (\`unsafe option ... ignored for security reasons\`). Se emite igual porque es
            // el carril canónico de la receta y otros motores/CLI sí lo usan; la verdad
            // va declarada en el tag siguiente.
            '#EXT-X-APE-VLC-FILTERS:' + vlcChain,
            '#EXT-X-APE-VLC-POLICY:MEASURED=VLC-3.0.24;PLAYLIST_VIDEO_FILTER=INERT_UNSAFE_OPTION;EXECUTES_ONLY_VIA_CLI=1',
            // Carril ffmpeg/mpv: filtergraph ejecutable (rangos ffmpeg 8.0.1, chroma 3:3).
            '#EXT-X-APE-FFMPEG-FILTERS:' + ffmpeg,
            '#EXT-X-APE-MPV-FILTERS:--vf=' + ffmpeg,
            // Carril manifest: ExoPlayer/Media3 no tiene DSL de filtros → intención declarada.
            '#EXT-X-APE-EXO-FILTERS:' + exoJson,
            // Kodi no tiene DSL de filtros por playlist: se declara el límite, no se finge.
            '#EXT-X-APE-KODI-FILTERS:NONE;REASON=kodi_no_playlist_filter_dsl'
        ];
        if (exoB64) {
            metadata.push('#EXT-X-SESSION-DATA:DATA-ID="ape.filters",VALUE="' + exoB64 + '"');
        }
        return { vlc: { chain: vlcChain, opts: [] }, ffmpeg: ffmpeg, canonical: canonical, exo: exo, metadata: metadata, target: target, skipped: skipped };
    }`;

fs.writeFileSync(GEN, src.slice(0, start) + NEW + src.slice(end), 'utf8');
console.log('helper reemplazado: ' + (end - start) + ' B -> ' + NEW.length + ' B');

