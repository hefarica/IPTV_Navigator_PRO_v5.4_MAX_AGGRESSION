# REA 10 — TiviMate / OTT Navigator: settings que activan el VPP sin pantallas negras

**Tarea:** t40 · **Disciplina:** S9 (player/device) · **Snapshot:** `git HEAD 2f8861c` · **Fecha:** 2026-10-28
**Alcance:** solo documentación. **Cero cambios en apps, device, APKs o código**; cero DRM/licencias. **No se ejecutó ningún dispositivo** ⇒ toda observación de comportamiento en device es `NOT_RUN`.
**Leyenda:** `SÍ`/`PARCIAL`/`NO` = documentado por la fuente citada; `NO_VERIFICADO` = sin fuente o requiere device; `[R]` = repo `archivo:línea`; `[S#]` = URL.

**Fuentes:** `[S1]` Media3 supported formats <https://developer.android.com/media/media3/exoplayer/supported-formats> · `[S2]` OTT Navigator FAQ (sitio del proyecto) <https://github.com/ottnav/ottnav.github.io/blob/main/faq.md> · `[S3]` Guía TiviMate **no oficial** <https://www.tvimate.co/best-tivimate-settings-for-firestick/> · `[S4]` Android frame-rate <https://developer.android.com/media/optimize/performance/frame-rate> · `[S5]` `DisplayManager` MATCH_CONTENT_FRAMERATE <https://developer.android.com/reference/android/hardware/display/DisplayManager> · `[R]` `CLAUDE.md:226-236,633-652` · `frontend/js/ape-v9/ape-profiles-config.js:6042` · `vps/prisma/cli/push_pq_profile.php:3,11,23-27` · `docs/rea/05_PLAYER_COMPAT.md` §§1,4,5.

## 1. Cómo decodifican (ExoPlayer/MediaCodec) y cuándo el VPP se activa o se bypassa

| Hecho | Evidencia | Estado |
|---|---|---|
| Ambas apps usan **ExoPlayer** en su ruta hardware: TiviMate declara `ExoPlayer/2.19.1`; OTT Navigator declara `ExoPlayerLib/2.15.1` cuando usa códecs hardware | `[R]` `ape-profiles-config.js:6042`; `[S2]` (sección *Default app user-agent*) | **SÍ** |
| ExoPlayer extrae y **selecciona decoder por perfil**; si el stream excede al HW puede caer a **software**; el decode/display depende de plataforma y device | `[S1]` (sección *HDR video playback*) | **SÍ** |
| Ruta **software** = decode en CPU: no pasa por el decoder del SoC ⇒ **sin VPP de vídeo** (AI-SR/PQ/MEMC). OTT lo confirma al decir que solo con software controla el deinterlacing; con hardware depende del firmware | `[S2]` (*Buffering*, *Horizontal scrolling text*) | **SÍ** (consecuencia) |
| **Tunneled playback** (audio/vídeo tunelizado por el decoder al display) existe en la pila Android/Media3, pero **no hay ajuste documentado en TiviMate/OTT** y su efecto sobre el post-proceso del SoC es **vendor-specific** | Sin URL de app; `[S1]` no lo cubre | **NO_VERIFICADO** |
| **Surface / secure path**: si el decoder entrega a una superficie segura (DRM) o tunelizada, el frame puede no pasar por el compositor/GPU donde el VPP hace SR/PQ. Es dependencia del SoC/firmware | Sin doc del fabricante | **NO_VERIFICADO** (hipótesis declarada) |
| **Refresh-rate switching**: Android puede cambiar el modo del display para igualar fps (`MATCH_CONTENT_FRAMERATE_*`); el cambio de modo HDMI puede producir **pantalla negra transitoria** | `[S4]`, `[S5]` | **PARCIAL** (documentado el mecanismo; el negro depende del display) |
| **AI-SR/AI-PQ por hardware**: el VPP del SoC post-procesa el frame decodificado; el VPS solo **comanda** settings, no píxeles | `[R]` `CLAUDE.md:234-236,633-652`; `push_pq_profile.php:3,11,23-27` (perfiles `max_image/sports/cinema/off`, claves `pq_ai_sr_enable/ai_sr_level/ai_pq_mode/pq_sharpness_enable/pq_*_dnr`) | **SÍ** (doctrina) / efecto real **NO_VERIFICADO** sin device |

**Regla de oro del VPP:** lo que activa el VPP es **decodificar por hardware y presentar en la superficie normal del display**. Todo lo que saque el frame de esa ruta (software, superficie segura/tunelizada, player externo) lo **bypassa**. El "8K fake" no nace del decoder: nace del **escalado del SoC/panel** + una declaración de metadata trazable (`#EXT-X-APE-UPSCALE:…;src=…;declared=…;can8k=…`), no de un bitstream 8K real.

## 2. TiviMate — settings relevantes

Nombres de UI según guía **no oficial** `[S3]` (la app no publica manual de settings): *Settings > Playback* → **Buffer Size**, **Decoder** (Hardware/Software), **Frame Rate Matching**, **Audio Passthrough**. Se marcan **PARCIAL** (nombre verificado en fuente secundaria, no en doc del fabricante).

| Ajuste (nombre) | Valor recomendado | Efecto en VPP | Riesgo de freeze/negro | Cómo verificar | Fuente |
|---|---|---|---|---|---|
| Decoder = **Hardware (HW)** | HW | Mantiene MediaCodec del SoC ⇒ **VPP posible** | Con HW sobre codec no soportado: negro/artefacto (el player no cae solo) | `logcat -s MediaCodecRenderer MediaCodec` (ver `c2.*`/`OMX.*` y `codec=`) | `[S3]`, `[S1]` |
| Decoder = **Software** | Solo como diagnóstico | **Bypassa** el VPP (CPU) | Puede no decodificar HEVC 10-bit/4K en tiempo real → freeze | Mismo logcat: ausencia de decoder HW + CPU alta | `[S3]`, `[S2]` |
| **Frame Rate Matching** | **ON** si el display soporta cambio *seamless*; **OFF** si el TV parpadea/negro al cambiar de canal | No cambia el VPP; evita judder | **Negro transitorio** en TVs que re-negocian HDMI al cambiar modo | `dumpsys display | grep -i mode` antes/después del zap; cronometrar el negro | `[S3]`, `[S4]`, `[S5]` |
| **Buffer Size** | 15–30 s (IPTV live); 60 s si hay jitter | Neutro | Buffer muy bajo → rebuffer; muy alto → zapping lento (no negro) | `dumpsys media.metrics` / tiempo de primer frame | `[S3]` |
| **Audio Passthrough** | OFF salvo AVR/soundbar | Neutro para vídeo | Passthrough a un sink que no soporta el códec → silencio (no negro) | `logcat -s AudioTrack` / `dumpsys media.audio_flinger` | `[S3]` |
| HDR/DV | No hay toggle documentado; depende del decoder y del panel | DV P5 en panel no-DV = **lavado/verde**, no negro | `dumpsys SurfaceFlinger | grep -iE 'hdr|dataspace'` | `[S1]`, `05 §3/§5` |

**Combinación que maximiza calidad sin freeze:** `Decoder=HW` + `Frame Rate Matching=OFF si el TV parpadea (o ON si es seamless)` + `Buffer 30 s` + `Audio Passthrough=OFF`. **Combinaciones que producen negro:** `SW` en HEVC 10-bit/4K; `Frame Rate Matching ON` en displays sin cambio seamless; DV P5 en device no-DV; codec declarado que el decoder no soporta (`hvc1` sobre AVC — ver `05 §2`).

## 3. OTT Navigator — settings relevantes

Rutas y valores **reales** del FAQ del proyecto `[S2]` (oficial):

| Ajuste (ruta real) | Valor recomendado | Efecto en VPP | Riesgo de freeze/negro | Cómo verificar | Fuente |
|---|---|---|---|---|---|
| `settings - player - codec` = **`hard`** (o `exo1`) | `hard` primero; `exo1` si `hard` falla | Ruta ExoPlayer/MediaCodec ⇒ **VPP posible** | Codec HW no soportado por el SoC → negro; la app recuerda el códec por canal | `logcat -s MediaCodecRenderer` + UA con `ExoPlayerLib` | `[S2]` |
| `codec = soft_vlc` | Solo diagnóstico | **Bypassa** VPP | Alto CPU; HEVC 10-bit/4K puede no ir en tiempo real | CPU alta + ausencia de decoder HW en logcat | `[S2]` |
| `codec = external` (player externo) | No para VPP | El VPP depende del player externo (p. ej. VLC), no de ExoPlayer | Negro si el player externo no soporta DV/HDR | Abrir el player externo y ver su superficie | `[S2]` |
| `settings - player - codec - hardware quality` | **best match** para 4K/HEVC; **compatibility** si hay fallos | `best match` usa el decoder específico del perfil (mejor VPP); `compatibility` puede caer a un decoder genérico | `compatibility` en 4K puede no iniciar → negro | `logcat` del códec elegido | `[S2]` |
| `settings - player - codec - amlogic` | Desactivar el “AmLogic fix” si el device no es Amlogic y hay buffering | Neutro | Forzarlo en no-Amlogic puede degradar | Comparar rebuffer antes/después | `[S2]` |
| `settings - player - network - buffer` | mínimo si hay buffering; máximo si hay packet loss | Neutro | No causa negro | Métricas de rebuffer | `[S2]` |

**No verificado en OTT:** *tunneled playback*, *refresh-rate matching*, *HDR toggle* — **no aparecen en el FAQ oficial** ⇒ **NO_VERIFICADO** (no se inventan nombres).

## 4. Matriz consolidada (setting | recomendado | VPP | riesgo | verificación | fuente)

| # | Setting | Recomendado | Efecto VPP | Freeze/negro | Verificación | Fuente |
|---|---|---|---|---|---|---|
| 1 | Decoder HW/SW (ambas apps) | **HW** | HW = VPP posible; SW = bypass | SW en 4K/HEVC = freeze | `logcat -s MediaCodecRenderer` | `[S1]`,`[S3]`,`[S2]` |
| 2 | Calidad de códec HW (OTT) | **best match** | Mejor decoder por perfil | `compatibility` puede no iniciar 4K | logcat del códec | `[S2]` |
| 3 | Frame Rate Matching (TiviMate) | ON si seamless / OFF si parpadea | Neutro | **Negro** en HDMI no-seamless | `dumpsys display` + tiempo de negro | `[S3]`,`[S4]`,`[S5]` |
| 4 | Buffer (ambas) | 15–30 s | Neutro | Rebuffer si bajo | métricas de rebuffer | `[S2]`,`[S3]` |
| 5 | Audio Passthrough | OFF sin AVR | Neutro | Silencio, no negro | `dumpsys media.audio_flinger` | `[S3]` |
| 6 | AmLogic fix (OTT) | OFF salvo Amlogic | Neutro | No negro | rebuffer antes/después | `[S2]` |
| 7 | AI-PQ/AI-SR (device) | Perfil `max_image`/`sports`/`cinema` según contenido | **Único lever real de píxeles** | No negro; puede saturar color | `settings get` de `pq_*` + `dumpsys SurfaceFlinger` | `[R]` `CLAUDE.md:234-236`, `push_pq_profile.php` |
| 8 | `hdr_conversion_mode` | No tocar para “mejorar SDR”: es **passthrough** | No mejora SDR | No negro | `settings get global hdr_conversion_mode` | `[R]` `CLAUDE.md:226-231` |
| 9 | Declaración de 8K fake (edge) | 8K solo con `uhd8k=1`+`L183`; marcador `src=`/`can8k=1`; nunca `-REAL` | No cambia píxeles: es metadata | Codec declarado incompatible = negro | `curl /_ape/uhd` + `dumpsys` | `[R]` `_vps_stage/lua/ape_uhd.lua:101` + `FASE0_DEPLOY` |
| 10 | DV P5 en panel no-DV | Evitar P5; preferir P8.1 | DV real solo con decoder DV | **Lavado/verde** (no negro) | `dumpsys SurfaceFlinger | grep -i hdr` | `05 §3/§5` |

## 5. Plan de prueba en device autorizado (6 casos) — **todos NOT_RUN** (sin device)

Criterio general: **PASS** = arranca ≤3 s, sin negro >300 ms, sin freeze 60 s, `dumpsys` muestra decoder HW y dataspace HDR coherente con la fuente, VPP activo si el SoC lo expone. **FAIL** = negro, freeze, decoder software, o dataspace incoherente.

| # | Caso | Señal | PASS esperado | FAIL típico |
|---|---|---|---|---|
| 1 | 1080p AVC SDR | H.264 1080p | Decoder HW; VPP SR a panel; sin negro | SW forzado o negro por `hvc1` declarado |
| 2 | 1080p HEVC | H.265 1080p | HW HEVC; VPP; sin negro | Decoder no soporta HEVC → SW/freeze |
| 3 | 4K HEVC HDR | H.265 2160p PQ | HW + dataspace HDR; VPP tonemap | HDR sin metadata o negro por modo |
| 4 | 4K DV | dvh1/dvhe | Solo si el device es DV; si no, **cae a HDR10/SDR** sin negro | DV P5 en no-DV = lavado (no PASS) |
| 5 | 720p | H.264 720p | VPP SR fuerte; sin negro | Negro por upscale forzado + decoder incompatible |
| 6 | Master ascendente | 720p + 4K | Elige la variante 4K si hay ancho de banda; sin negro | Salto de modo/negro por refresh-rate |

**Cómo medir (adb, solo lectura):** `adb shell dumpsys SurfaceFlinger | grep -iE 'hdr|dataspace'` · `adb shell dumpsys display | grep -i mode` · `adb logcat -s MediaCodecRenderer MediaCodec` · `adb shell settings get global hdr_conversion_mode` · `adb shell dumpsys media.metrics`. **Sin device: NOT_RUN; no se declara PASS.**

## 6. Legal / ético

- Solo **configuraciones de la app y del VPP del propio device autorizado**. **Nada** de bypass de DRM, modificación de APKs, redistribución de apps, licencias evadidas ni cambios en el VPS/device desde esta tarea.
- Los settings de AI-PQ se aplican por el canal autorizado (ARA/settings del dueño); este documento no los ejecuta.

## 7. Límites

- **0 dispositivos**: ningún ajuste se probó; VPP, negro y freeze son `NOT_RUN`/`NO_VERIFICADO`.
- Los nombres de TiviMate son de fuente **secundaria no oficial**; los de OTT son del **FAQ del proyecto**. Lo que no está en esas fuentes (tunneled, refresh-rate en OTT, toggle HDR) queda **NO_VERIFICADO** y no se inventa.
- El efecto del VPP es **vendor-specific** (MediaTek/Qualcomm/Amlogic): no se extrapola entre SoCs.
