# REA 05 — Matriz player/device DV · HDR10+ · HLG y límites de declaración

**Snapshot:** `git HEAD a8ff0e9` (`a8ff0e946524f945f89858c9c6c620aeb5f31813`) · **Fecha:** 2026-10-27 · **Disciplina:** S9 (player compatibility)
**Naturaleza:** documento de **doctrina + evidencia documental**. **No se ejecutó ningún dispositivo, player ni VPS** (`iptv-vps-touch-nothing`). Ninguna celda de esta matriz es una prueba de reproducción: lo medido en el repo se cita con `archivo:línea`; lo externo con URL; lo no verificable queda `NO_VERIFICADO`.
**Regla de honestidad:** una ausencia de fuente **no** es un "no soportado", y una fuente del fabricante **no** es una medición. Prohibido promover a SÍ lo no verificado.

## Leyenda

| Estado | Significado |
|---|---|
| **SÍ** | Soporte **documentado** por fuente citada (fabricante/player) o evidencia de código del repo. No implica medición |
| **PARCIAL** | Condicionado: depende de SoC/versión/modelo/navegador, o solo cubre una parte de la cadena (p. ej. extracción sin decode) |
| **NO** | Documentado como no soportado por la plataforma/fabricante |
| **NO_VERIFICADO** | Sin fuente utilizable **o** requiere dispositivo. No se promueve |

`[R]` = evidencia del repo citada como `archivo:línea` (no es fuente externa, pero es verificable byte a byte).

Fuentes externas: `[1]` hls.js README <https://github.com/video-dev/hls.js#readme> · `[2]` Media3 supported formats <https://developer.android.com/media/media3/exoplayer/supported-formats> · `[3]` Android HDR <https://source.android.com/docs/core/display/hdr> · `[4]` HLS bis (VIDEO-RANGE) <https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis> · `[5]` HDR10+ certified (Samsung QN900F) <https://hdr10plus.org/certified-products/qa65qn900fj/> · `[6]` LG OLED (DV + HDR10) <https://www.lg.com/sg/tvs-soundbars/oled-evo/oled48c5psa/> · `[7]` Samsung sin DV (secundaria) <https://www.bgr.com/2260222/why-samsung-tv-doesnt-support-dolby-vision/> · `[8]` Ultra HD Forum Violet Book (DV P8.1/DVB) <https://ultrahdforum.org/wp-content/uploads/VioletBook-Real_World_Ultra_HD_3.2.0.pdf> · `[9]` Kodi 19 HDR (secundaria) <https://www.guru3d.com/story/kodi-19-codenamed-matrix-is-released-and-sees-av1hdrtvos-support/> · `[10]` webOS DV playback (foro dev) <https://forum.webostv.developer.lge.com/t/dolby-vision-video-playback-via-media-player-app/1358>

## 1. Matriz player × capacidad

| Player (stack) | DV P5 | DV P8.1 | HDR10 | HDR10+ | HLG | 10-bit | 4K | 8K |
|---|---|---|---|---|---|---|---|---|
| **hls.js** (MSE/MMS) | PARCIAL [1] | PARCIAL [1] | SÍ [1] | NO_VERIFICADO | SÍ [1] | SÍ [1] | SÍ [1] | NO_VERIFICADO |
| **ExoPlayer / Media3** | PARCIAL [2] | PARCIAL [2] | PARCIAL [2] | PARCIAL [2] | PARCIAL [2] | PARCIAL [2] | PARCIAL [2] | NO_VERIFICADO |
| **TiviMate** (ExoPlayer, `ape-profiles-config.js:6042`) | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO |
| **OTT Navigator** (ExoPlayer/libVLC según `vps/prisma/lib/vlcopt_enhancer.php:10`) | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO |
| **VLC / libVLC** | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO | NO_VERIFICADO |
| **Kodi (ISA)** | NO_VERIFICADO | NO_VERIFICADO | PARCIAL [9] | NO_VERIFICADO | NO_VERIFICADO | PARCIAL [9] | PARCIAL [9] | NO_VERIFICADO |
| **Smart TV Tizen (Samsung)** | NO [5][7] | NO [5][7] | SÍ [5] | SÍ [5] | SÍ [5] | SÍ [5] | SÍ [5] | PARCIAL [5] |
| **Smart TV webOS (LG)** | SÍ [6][10] | SÍ [6] | SÍ [6] | NO_VERIFICADO | SÍ [6] | SÍ [6] | SÍ [6] | PARCIAL [6] |

**Lectura obligatoria de la matriz (no promediar):**
1. **hls.js no decodifica**: "relies on HTML5 video and MediaSource Extensions" y el `<video>` "handles decoding" [1]. DV figura como "subject to runtime support" y el CODECS depende del navegador/SO [1]. Por eso DV = PARCIAL y HDR10+ = NO_VERIFICADO.
2. **ExoPlayer extrae DV en MP4 y HDR10+ en Matroska/WebM, pero "decoding and displaying HDR content depends on support from the Android platform and device"** [2]. Usa decoders de plataforma y el selector de `MediaCodec` puede elegir **software** si el stream excede al hardware [2] ⇒ PARCIAL en toda la fila. 8K = NO_VERIFICADO.
3. **TiviMate / OTT / VLC**: son *shells* sobre el decoder del SoC. Sin documentación del app ni dispositivo, **no hay base para SÍ ni para NO** ⇒ NO_VERIFICADO, no "no soporta".
4. **Tizen**: Samsung certifica HDR10+ (p. ej. QN900F, que es 8K) [5]; su línea no incluye DV [7] ⇒ DV = NO. 8K = PARCIAL (solo modelos 8K).
5. **webOS**: LG publica DV + HDR10 en su ficha [6] y el foro de desarrolladores documenta reproducción DV vía Media Player [10]. HDR10+ = NO_VERIFICADO (depende de modelo/año).

## 2. Qué ocurre al declarar lo que el device no decodifica

| Declaración indebida | Efecto observable | Evidencia / porqué | Cómo evitarlo |
|---|---|---|---|
| `CODECS="hvc1…"` sobre bytes AVC | **Freeze / pantalla negra**: init del decoder HEVC falla y no hay frame | `ape-fallback-resolver.js:238` asigna `probeData.videoCodec \|\| 'hvc1.2.4.L150.B0'` (HEVC sin probe); `vps/nginx/lua/ape_virtual_4k.lua:14,21,33` declara `hvc1.2.4.L153.B0` + `RESOLUTION=3840x2160` | No declarar codec sin verdad del probe; bajar a F3/F4/F5 u omitir `CODECS=` |
| `RESOLUTION=7680x4320` sobre fuente 4K | El decoder acepta y el player muestra **upscale etiquetado como 8K** (mentira, no mejora) | `vps/nginx/lua/ape_virtual_4k.lua:21` (rewrite fijo a 3840) + `_vps_stage/lua/ape_uhd.lua:26-27,44-46` (TARGET_4K/8K) | Declarar la resolución real o marcar `-PREFERRED`, nunca `-REAL` |
| `VIDEO-RANGE=PQ` sobre SDR sin daemon | **Tono lavado / color shift** (verde-grisáceo), no freeze; en players estrictos, handshake HDR fallido → negro | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:2428-2433` (riesgo aceptado por el propietario); `ape_virtual_4k.lua:33` añade `HDR=PQ,COLOR-PRIMARIES=9,TRANSFER-CHARACTERISTICS=16` | PQ condicionado a daemon/capability; override por canal; o declarar SDR |
| DV P5 en device no-DV | **Verde/morado o lavado**: P5 es una capa IPT-PQ **sin fallback** | `[R]` `.agents/skills/dolby-vision-profile5-emitter/SKILL.md:3,12` ("single-layer IPT-PQ, no fallback") vs `dolby-vision-profile8-emitter/SKILL.md:3,12` ("cross-compat with HDR10 fallback"); `[8]` (snippet) menciona P8.1 en broadcast/DVB | Preferir **P8.1**; P5 solo si el device es DV |
| HDR10+ declarado sin SEI ST 2094-40 | Player/TV cae a HDR10 o SDR **en silencio** (fallback no anunciado) | El repo **sí declara** HDR10+ en metadata: `X-HDR-TYPE="DV-P8+HDR10+"` (`m3u8-typed-arrays-ultimate.js:3032`), `X-Transport-HDR-Matrix:…hdr10+…` (`:3712`), cadenas `:1644-1645`; **no hay** evidencia de SEI ST 2094-40 en bitstream (el repo no toca píxeles) | Declarar HDR10+ solo con SEI real; si no, HDR10 |
| DV declarado sin RPU (sin `dvcC`/`dvvC`) | Ignorado o error de parseo; el TV muestra SDR/HDR10 | Regla de declaración (§5) | No emitir `dvh1`/`dvhe` sin RPU verificable |

**Regla general:** declarar de más nunca mejora píxeles; a veces **rompe** (freeze) y a veces **engaña** (tono/upscale). La única mejora real es bitstream mejor o VPP del device (§4).

## 3. Cadena de fallback honesta: DV → HDR10 → HLG → SDR BT.709

| Nivel | Cuándo es legítimo | Requisito de bitstream | Si falta |
|---|---|---|---|
| 1. **DV P8.1** (base HDR10 + RPU) | Device DV o TV DV; flota heterogénea | RPU + base layer HDR10 (`[R]` `dolby-vision-profile8-emitter/SKILL.md:3,12`) | Cae a HDR10 **sin** re-etiquetar |
| 1b. **DV P5** | Solo flota DV (sin fallback HDR10) (`[R]` `dolby-vision-profile5-emitter/SKILL.md:3,12`) | IPT-PQ una capa | **No** es fallback de nada: device no-DV = lavado |
| 2. **HDR10** (PQ + ST 2086) | Device HDR10, no DV | SEI/mastering display | HLG o SDR |
| 3. **HLG** (BT.2100) | Broadcast/TV HLG; compatibilidad SDR razonable | `VIDEO-RANGE=HLG` [4] | SDR |
| 4. **SDR BT.709** | Todo lo demás (siempre debe existir) | `VIDEO-RANGE=SDR` [4] | — |

- La cadena del repo está declarada: `"codec_chain_hdr": "dolby-vision,hdr10+,hdr10,hlg,sdr"` (`ape-profiles-config.js:349`; P1 `:984`) y la skill `.agents/skills/hdr-fallback-cascade-builder/SKILL.md:3,12`. **Declarar la cadena no crea las capas**: si el proveedor solo sirve AVC SDR, la cadena es una mentira de metadata.
- Orden honesto: **P8.1 antes que P5** en flotas mixtas; HDR10 antes que HLG para contenido cinematográfico; SDR siempre como último nivel real.

## 4. Metadata vs VPP del device: qué mejora la imagen y qué solo la etiqueta

| Lever | Dónde vive | Qué hace de verdad | Evidencia | Veredicto |
|---|---|---|---|---|
| `declare_auto` / `VIDEO-RANGE` (edge) | VPS Lua | **Reescribe etiquetas**: `RESOLUTION=3840x2160`, `hvc1.2.4.L153.B0`, `HDR=PQ,VIDEO-RANGE=PQ…`; opcional `VIDEO-RANGE=PQ` si `add_pq` | `_vps_stage/lua/ape_uhd.lua:31,48-49,92`; `_vps_stage/lua/ape_gateway.lua:281` (`add_pq=flag("uhd_pq",false)`); `ape_virtual_4k.lua:14,21,33`; guard LEVER B **desactivado**: `combined_body_filter.lua:335` `CHINA_BOX_FAKE_4K = true` (comentario :330-331) | **ETIQUETA**, no píxeles. Puede mejorar percepción solo si el player/TV hace upscale/tone-map mejor de lo que haría sin el hint; puede empeorar (color shift) o romper (freeze) |
| `hdr_conversion_mode` (device) | Ajuste Android | **Passthrough entre tipos HDR**; SDR queda SDR. **NO hace SDR→HDR** (corrección 2026-06-17, Fire TV mt8696) | `CLAUDE.md:220-231`; en el repo sigue la afirmación contraria: `vps/prisma/lib/ape_mesh.php:57-63` ("hdr_conversion_mode=1 … Android convierta SDR->HDR … incondicional") | **NO mejora**; evita degradar HDR real. **Contradicción viva** entre código y corrección |
| **AI-PQ / AI-SR por hardware (VPP del SoC)** | ARA + `settings` del device (MediaTek: `pq_ai_sr_enable`,`ai_sr_level`,`ai_pq_mode`,`pq_sharpness_enable`,`pq_*_dnr`,`pq_hdr_*`) | Post-procesa el frame **decodificado**: super-resolución, denoise, sharpen, HDR-PQ. **Único lever que mejora píxeles sin transcode** | `CLAUDE.md:234-236,633-652`; `vps/prisma/cli/push_pq_profile.php:3,11,23-27` (perfiles `max_image/sports/cinema/off`) | **MEJORA REAL**, solo en SoC allowlisted y con daemon/ARA vivo. Sin dispositivo ⇒ **NO_VERIFICADO** |

**Conclusión:** el VPS **selecciona y declara** metadata (no toca píxeles); `hdr_conversion_mode` solo hace passthrough; el **VPP del SoC** es el único que cambia la imagen. Presentar `declare_auto` o `VIDEO-RANGE=PQ` como "mejora de imagen" es una mentira de doctrina, salvo que el display aplique su propio tone-map/upscale (efecto no medido aquí).

## 5. Reglas de declaración — qué NUNCA declarar

1. **DV (`dvh1`/`dvhe`) sin RPU** (`dvcC`/`dvvC`). Sin RPU no hay Dolby Vision: el TV cae a HDR10/SDR o ignora la variante.
2. **DV P5 en flota mixta** como si fuera universal: P5 no tiene fallback HDR10 (`[R]` `dolby-vision-profile5-emitter/SKILL.md:3,12`). Si no se sabe el parque, **P8.1**.
3. **HDR10+ sin SEI ST 2094-40**: se declara dinámico y no lo es; el player degrada en silencio.
4. **8K sobre 4K** (o 4K sobre 1080p) como `-REAL`: `ape_uhd.lua:26-27,44-46` y `ape_virtual_4k.lua:21` pueden reescribir resolución; solo válido como `-PREFERRED`/hint, nunca `-REAL`.
5. **Codec que el decoder no soporta**: `hvc1` sobre AVC (`ape-fallback-resolver.js:238`), HEVC en devices H.264-only, AV1 en decoders sin AV1, perfil/level por encima del techo (Ley Cardinal 1: `L153`=4K@60).
6. **`VIDEO-RANGE=PQ` sobre SDR sin daemon** sin declarar el riesgo aceptado: color shift documentado (`m3u8-typed-arrays-ultimate.js:2428-2433`).
7. **`SUPPLEMENTAL-CODECS` inventado** (p. ej. `lcev.1.1.1`): el repo hoy tiene **0 emisiones** (solo 3 comentarios) ⇒ mantenerlo así.
8. **`EXT-X-MAP`/CMAF sin init segment real**: el generador tiene **0** `#EXT-X-MAP`; no declarar `fmp4-cmaf` sin `init.mp4`/`.m4s` verificados.
9. **`HDCP-LEVEL=TYPE-1` universal sin el override adaptativo**: la doctrina vigente emite `TYPE-1` por defecto **con** override por canal (`CLAUDE.md:211,272-286`) y el generador lo parametriza (`m3u8-typed-arrays-ultimate.js:6910`, superviviente en `:10157`); hardcodearlo sin override rompe HDMI HDCP 1.4 sin recovery.
10. **`#EXTINF:-1` + `TARGETDURATION` ausente** en un catálogo presentado como HLS: no es una capacidad de player, pero invalida la playlist para parsers estrictos (`council/S1_hls_m3u8.md` F13).

## 6. Recomendaciones

| # | Acción | Dueño | Criterio de cierre |
|---|---|---|---|
| R1 | Cablear la emisión **por player** (hoy `emitTivimateSafe` = `emitStandardHls` + etiqueta, `parsers/ape-player-profile-emitter.js:60-64`): variantes/atributos por target | S9 | Test que demuestre ≥2 salidas distintas por target |
| R2 | **Cerrar LEVER B**: `CHINA_BOX_FAKE_4K = false` o acta del propietario (`combined_body_filter.lua:335`) | S3+S4 / propietario | `grep` del flag = `false` o acta citada |
| R3 | Quitar el default HEVC sin probe (`ape-fallback-resolver.js:238`) | S3 | Sin `videoCodec`, sin `CODECS=` HEVC |
| R4 | **Probe de capability antes de declarar** DV/HDR10+/8K: `MediaCapabilities.decodingInfo` (hls.js/Web) y `Display.getHdrCapabilities` (Android) [2][3]; si no hay respuesta, SDR/AVC | S9 | Emisor con gate por capability; 0 declaraciones sin probe |
| R5 | Preferir **DV P8.1** sobre P5 en flotas mixtas y conservar la base HDR10 [8] | S3+S4 | `codec_chain_hdr` con P8.1 antes que P5 |
| R6 | `VIDEO-RANGE=PQ` condicionado a daemon presente o a decisión explícita del propietario (hoy incondicional en doctrina, `CLAUDE.md:220`) | propietario | Acta + flag por perfil/canal |
| R7 | AI-PQ solo en SoC allowlisted; medir `dumpsys` antes/después; no anunciar mejora sin medición | S9 + S7 | Evidencia de device con `dumpsys` |
| R8 | **Matriz de dispositivos real** (Fire TV Stick 4K Max, ONN 4K, Shield, Tizen, webOS, Android phone) con `dumpsys MediaCodec`/`SurfaceFlinger`; hasta entonces toda celda app-level queda NO_VERIFICADO | S9 (con owner del device) | 6 dispositivos × 8 capacidades con captura |

## 7. Límites (declarados, no PASS)

- **Sin dispositivos**: ninguna celda se midió reproduciendo. Celdas SÍ/PARCIAL/NO son **documentales**; las de TiviMate/OTT/VLC son NO_VERIFICADO por falta de documentación **y** de device.
- **Sin VPS**: `declare_auto`, `virtual_4k` y `CHINA_BOX_FAKE_4K` se leen del **repo**; su efecto en producción es `NO_VERIFICADO` (el VPS medido es rebase-only, `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md`).
- Fuentes externas consultadas el 2026-10-27; son documentación de fabricante/proyecto, no mediciones. `[7]`, `[9]`, `[10]` son **secundarias**; de `[8]` solo se consultó el **snippet de búsqueda**, no el PDF ⇒ no se usa como fuente de detalle (la semántica P5/P8.1 se apoya en `[R]`).
- **Cero secretos y cero credenciales** en este documento: no se imprime ninguna clave, token ni `user:pass`.
- Lo que cerraría cada NO_VERIFICADO: R8 (dispositivo + `dumpsys`) y R4 (capability probe en runtime). Sin eso, se queda como está.
