# PROMPT CON LOOP — Implementación del recetario de imagen APE (muchos más settings, mejores)

> Prompt de ejecución para un agente. Copiar tal cual. Está diseñado para correr en **loop**
> hasta que todos los gates pasen o el loop se declare bloqueado con evidencia.

---

## MISIÓN

Convertir el recetario de imagen de APE —hoy declarado en la cabecera del manifiesto e inerte en
los players— en **tres proyecciones ejecutables, validadas y verificables**, con **más settings y
mejores** que la lista de referencia:

1. `vlc` — cadena nativa de módulos VLC para `#EXTVLCOPT:video-filter=`
2. `ffmpeg` — cadena `-lavfi` para el carril de laboratorio/VPS
3. `manifest` — objeto JSON compacto que viaja en la playlist como metadata dinámica

Fuente única de verdad: `tools/ape-image-recipes/recipes.json`.
Compilador: `tools/ape-image-recipes/compile.js`.
Decodificador del LAB de referencia: `tools/ape-image-recipes/decode_lab_metadata.js`.

---

## VERDAD MEDIDA (no reabrir, usar como base)

De `APE_LISTA_1793589060441.m3u8` (604.593.696 B, sha256 `523d52a6…`):

- Cabecera: 188 líneas. El LAB viaja en 20 chunks `#EXT-X-APE-LAB-METADATA:i/20:<base64>`;
  decodifica a 51.890 B JSON, schema `ape-lab-metadata-v1`, perfil `P0`.
- `fields.quality_levels` trae **L1…L7**, cada uno con `video_filter` (L1 8K/200 Mbps,
  L2 4K/100, L3 1080p/40, L4 720p/20, L5 480p/10, L6 360p/4, L7 240p/1.5).
- El `video_filter` de **todos** los niveles usa sintaxis de filtergraph ffmpeg
  (`nlmeans=…,bwdif=…,gradfun=…,unsharp=…,zscale=…,minterpolate=…:me=epzs:scd=5`).
- VLC **no tiene plugin avfilter** y esas cadenas se rechazan: medido en
  `scratch/avisynth_probe_2026/vlc_chain_list_style.log` → `no video filter modules matched` +
  11 × `Failed to create video filter`.
- VLC **sí** ejecuta estos módulos, con estas opciones (verbatim medido):
  `gradfun{strength,radius}` · `deinterlace{mode}` · `sharpen{sigma}` · `hqdn3d` (sin opciones).
  `deinterlace-mode` y `luma_spatial`/`luma-spatial` son **rechazadas**.
- ffmpeg 8.0.1: `pp` no existe; `gradfun.strength ∈ [0.51,64]`; `minterpolate` usa `me_mode`
  (int 0..1) y `scd` (int 0..1) + `scd_threshold` (double); `zscale` no tiene `bt1886` ni
  `blue-noise` ni `accurate_rnd`.
- El LAB de referencia confiesa: `#EXT-X-APE-LAB-DNA:sha256=unverified`.
- Los píxeles reales los mejora el **VPP del SoC vía ARA** (`actor_injections.soc_vpp_dnr`,
  `vps/prisma/cli/push_pq_profile.php`), no la cadena de filtros.

**Regla que se desprende:** el manifiesto es un plano de control. Un string de filtros en la
playlist solo ejecuta si el motor de reproducción es VLC y la sintaxis es de módulo VLC.

---

## INVARIANTES — no negociables

1. **Cero mentira al parser.** Nunca emitir en `#EXTVLCOPT:video-filter=` un token que no sea
   módulo VLC real. El compilador falla cerrado.
2. **Cero mock, cero dato inventado.** Todo valor sale de la receta o de una medición.
3. **Toda afirmación cuantitativa cita su artefacto** (ruta, comando, log, hash).
4. **Lo no medido se reporta `NO COMPUTADO`** con su razón; nunca se rellena.
5. **Un módulo solo se emite si está verificado** (`vlc_verified: true`) con su log.
6. **No se degrada la imagen**: nada de bajar 4K a FHD, HEVC a H.264, HDR a SDR, fps o bitrate
   para "que funcione". Si un nivel no es viable, se declara no viable, no se degrada.
7. **No se toca** `configs/app.toml` `paper_mode`, `live_exec_policy.rs`, el broadcast path de
   `bundle_builder.rs`, ni el VPS de producción.
8. **Nada de bare-commit** (`git add -A` / `commit -a` / `--amend`) mientras haya trabajo en vuelo.

---

## CICLO (repetir hasta salir por gate o por bloqueo)

```
PARA CADA nivel L ∈ {L1,L2,L3,L4,L5,L6,L7}:
  PARA CADA lane ∈ {ffmpeg, vlc, manifest}:

  1. LEER     la definición de L en recipes.json y el video_filter de referencia del LAB
              (scratch/…/lab_decoded/lab_metadata.json → fields.quality_levels.Lx.video_filter)
  2. TRADUCIR cada etapa del reference a la sintaxis del lane
              (ffmpeg → filtergraph; vlc → módulo{opciones}; manifest → array de etapas)
  3. VALIDAR  con el arnés del lane:
              ffmpeg:  node compile.js --profile Lx --emit ffmpeg  →  ffmpeg -filter_script  → exit 0
              vlc:     node compile.js --profile Lx --emit vlc     →  VLC --video-filter         →
                       log debe traer `using video filter module "<modulo>"` y 0 × `Failed to create`
              manifest: /#EXT-X-APE-IMAGE-RECIPE:\{.*\}$/ debe parsear con JSON.parse y no exceder
                       1024 B en la línea
  4. REGISTRAR el resultado en el ledger: nivel, lane, cadena, veredicto, ruta del log
  5. SI falla:  aislar la etapa que falla (probar cada etapa sola), corregir solo esa etapa,
                volver a 3. Máximo 3 iteraciones por etapa; si a la 3ª sigue fallando, marcar la
                etapa `NO_VIABLE` con el error literal y CONTINUAR con la siguiente.
  6. SI pasa:   pasar al siguiente lane.
FIN
```

**Criterio de salida del ciclo:** los 3 lanes de L1…L7 con veredicto explícito (PASS / NO_VIABLE +
razón). Ningún nivel queda sin veredicto.

---

## SETTINGS A IMPLEMENTAR (más que la referencia)

Por nivel, además de `video_filter`, incorporar como campos de primera clase — cada uno con su
proyección por lane y su validación:

### A. Denoise / deband / sharpen
- `denoise`: hqdn3d (spatial/temporal) o nlmeans (solo carril ffmpeg)
- `deband`: gradfun radio/fuerza (respetar `strength ≥ 0.51`)
- `sharpen`: `unsharp` en ffmpeg (luma/chroma size + amount) · `sharpen{sigma}` en VLC
- `contrast_adaptive`: `cas` en ffmpeg; en VLC **no existe** → marcar `NO_VIABLE` en ese lane

### B. Desentrelazado
- `deinterlace`: `bwdif` (ffmpeg) · `deinterlace{mode=yadif2x}` (VLC)
- `deint_policy`: `auto | force | off` por nivel y por tipo de contenido

### C. Color / HDR
- `linear_light`: escalar en linear y volver (ffmpeg `zscale=transfer=linear` → `transfer=709|smpte2084|arib-std-b67`)
- `transfer`, `primaries`, `matrix`, `range`, `chromal`, `npl`
- `tone_mapping`: `hable | mobius | bt2390 | none` (VLC expone `tonemap=`)
- `bit_depth` de salida (`yuv420p10le` / `p12le`), `chroma` de salida
- En VLC usar los options reales ya presentes en el LAB: `video-color-space`,
  `video-transfer-function`, `video-color-primaries`, `video-color-range`, `video-hdr`,
  `video-hdr-nits`, `video-tone-mapping-peak`, `video-tone-mapping-reference`, `video-bit-depth`

### D. Movimiento
- `frame_interpolation`: `minterpolate` en ffmpeg con `mi_mode`, `mc_mode`, `me_mode`,
  `mb_size`, `scd`, `scd_threshold`, `fps`
- En VLC **no existe interpolación de movimiento** → `NO_VIABLE`, declararlo

### E. Ajustes de display (los que VLC sí tiene)
- `saturation`, `contrast`, `brightness`, `gamma`, `hue`, `sharpen-sigma`
- `zoom` / `margins` / `aspect-ratio` por nivel

### F. Buffer y continuidad (carril manifiesto)
- `network-caching`, `live-caching`, `file-caching`, `clock-jitter`, `clock-synchro`,
  `http-max-retries`, `http-reconnect`, `http-continuous-stream`, `network-reconnect-count`
- `#EXT-X-SERVER-CONTROL` (PART-HOLD-BACK, CAN-SKIP-UNTIL, HOLD-BACK), `#EXT-X-PART-INF`,
  `#EXT-X-START` (TIME-OFFSET, PRECISE)
- `#EXT-X-SESSION-DATA` por player: `exoplayer.load_control`, `exoplayer.track_selection`,
  `com.ape.live_sync`, `com.ape.recovery_policy`, `com.ape.network_resilience`,
  `com.ape.abr_quality_policy`

### G. Selección de códec / variante
- `codec-priority`, `max_resolution`, `max_bitrate`, `min_bandwidth`,
  `preferred_video_frame_rate`, `audio_codec_priority`, `audio_passthrough`
- KODIPROP espejo: `inputstream.adaptive.*`

### H. VPP del dispositivo (el único que mejora píxeles)
- `soc_vpp_dnr.settings`: `pq_ai_sr_enable`, `ai_sr_level`, `ai_pq_mode`, `aipq_enable`,
  `pq_sharpness_enable`, `pq_ai_dnr_enable`, `pq_dnr_enable`, `pq_nr_enable`,
  `pq_ai_fbc_enable`, `pq_hdr_enable`, `pq_hdr_mode`, `match_content_frame_rate`,
  `hdr_conversion_mode`
- Gate: solo se escriben claves **PRESENTES** en el device (`get` antes de `put`); ausentes se
  ignoran sin error. Control desde VPS con `push_pq_profile.php <perfil> [device] [channel]`.
- Truth-guard obligatorio: el VPS **no transcodifica**; aplica a cualquier códec y a todos los
  players del device.

---

## GATES DE ACEPTACIÓN (todos deben pasar)

| # | Gate | Comando | Éxito |
|---|---|---|---|
| G1 | JSON válido | `python -m json.tool recipes.json` | exit 0 |
| G2 | Compilador íntegro | `node -c compile.js` | exit 0 |
| G3 | ffmpeg L1–L7 | `node compile.js --profile Lx --emit ffmpeg` → `ffmpeg -filter_script … -f null -` | exit 0 los 7 |
| G4 | VLC módulos | `node compile.js --profile Lx --emit vlc` → VLC `--video-filter` | 0 × `Failed to create video filter` |
| G5 | Sin tokens prohibidos | grep de `nlmeans|zscale|minterpolate|unsharp|pp=|libplacebo` en la proyección vlc | 0 |
| G6 | Manifiesto parseable | `JSON.parse` del payload de `#EXT-X-APE-IMAGE-RECIPE:` | válido, ≤ 1024 B |
| G7 | Ledger completo | tabla L1–L7 × 3 lanes con veredicto | 21 celdas sin huecos |
| G8 | Sin credenciales | grep de user/pass/host reales en los artefactos | 0 |
| **G9** | **Conformidad HTTP 200/206/302** | `node tools/ape-http-conformance/verify_http_matrix.js --list <lista> --base <url>` | **exit 0** en TODAS las configuraciones |

### G9 — GATE DURO DEL OPERADOR (bloqueante)

**Ninguna entrega se cierra sin que la matriz HTTP devuelva 200, 206 y 302.**
El operador hace las puertas visuales; este gate es la puerta de máquina, y emite telemetría
JSONL para saber si la información fluye.

Matriz mínima por cada configuración de lista:

| Caso | Aserción dura |
|---|---|
| GET de la lista | **200** + `Content-Type` mpegurl + cuerpo > 0 |
| HEAD de la lista | **200** coherente con GET |
| GET con `Range: bytes=0-1023` | **206** + `Content-Range` + exactamente 1024 B |
| Range sobre endpoint que anuncia `Accept-Ranges: bytes` | **prohibido responder 200**: si lo hace, FALLO doctrinal |
| GET del canal en el origen | **302** + `Location` |
| Seguir la cadena del canal | **200** `application/x-mpegURL` |
| Condicional `If-None-Match` | **304** |

**Estado medido 2026-11-02 (baseline):** 200 ✅ · 302 ✅ · 304 ✅ · **206 ❌**.
La lista servida anuncia `Accept-Ranges: bytes` y responde **200 con los 604.593.696 B**
ante un Range, sin `Content-Range`. El 206 **no existe** hoy.
Exit del gate: **1**.

**Causa probable y ruta de arreglo:** un `body_filter` Lua que rebasa el cuerpo por petición es
incompatible con byte-ranges. Las salidas posibles son (a) materializar la lista como **archivo
estático** y servirlo como tal — el rebase pasa a tiempo de generación, no de petición;
o (b) dejar de anunciar `Accept-Ranges: bytes`. La (a) es la única que satisface el requisito.
**Tocar el VPS de producción requiere autorización explícita del operador** (`iptv-vps-touch-nothing`).

**Configuraciones a cubrir con G9:** catálogo M3U directo · master playlist (`#EXT-X-STREAM-INF`) ·
media playlist (LL-HLS con `#EXT-X-PART`) · variante `_SHIELDED.m3u8` · con y sin `#EXT-X-BYTERANGE` ·
GET y HEAD · `identity` y `gzip` · dentro y fuera del túnel WireGuard.

---

## ANTI-PATRONES — si aparecen, el trabajo está mal

- Emitir `video-filter=ffmpeg{…}` — ese módulo no existe.
- Emitir filtergraph ffmpeg en `#EXTVLCOPT` y llamarlo "aplicado".
- Declarar un nivel `PASS` sin log.
- Copiar el `video_filter` del LAB sin traducirlo por lane.
- "Arreglar" un gate bajando resolución, fps, bitrate o código de color.
- Rellenar un hueco con un valor plausible en vez de `NO_COMPUTADO`.
- Tocar el VPS de producción o el Excel mientras el loop corre.

---

## SALIDA ESPERADA

1. `tools/ape-image-recipes/recipes.json` extendido: L1–L7 × todos los grupos A–H, cada campo con
   `ffmpeg`, `vlc`, `vlc_verified`, `note`.
2. `tools/ape-image-recipes/compile.js` con las 3 proyecciones y fallo cerrado.
3. `tools/ape-image-recipes/LEDGER.md`: 21 celdas con veredicto + ruta del log que lo prueba.
4. `tools/ape-image-recipes/validate.js`: corre G3, G4, G5, G6, G8 y devuelve exit ≠ 0 si algo falla.
5. Un bloque M3U de ejemplo por nivel, con `#EXTVLCOPT` + `#EXT-X-APE-IMAGE-RECIPE` + URI.

---

## NOTA DE HONESTIDAD (debe ir en el ledger)

El carril `vlc` solo ejecuta si el player usa el motor VLC (OTT Navigator: codec → VLC; VLC
desktop). Con ExoPlayer/sistema el `video-filter` es decorado. La mejora real de píxeles en
cualquier player la da el **VPP del SoC vía ARA**. El carril `ffmpeg` mejora de verdad, pero
**transcodifica** y no es tiempo real a 8K: es laboratorio/VOD, no directo.
