# CADENA POLIMÓRFICA Y CENSO DE CANALES DE METADATA · 2026-11-13

**Diseño aprobado por el operador:** desarrollar todas las vías, sin perder ninguna, y que cada dispositivo use la que pueda. El que no puede, no la usa y no bloquea a los demás.

Implementado: `tools/probe/probe_capabilities.ps1` — sonda que **mide** cada vector por ADB y emite `ape.device_capabilities.v1`. Estados posibles, ninguno inventado:

```
SUPPORTED_MEASURED   existe y se comprobó con un comando
NOT_SUPPORTED        se comprobó que NO existe
BLOCKED              existe pero el acceso está denegado
NOT_COMPUTED         no se pudo medir, con su razón
```

---

## 1 · Snapshot real del ONN 4K (`docs/sistema/capabilities_ONN4K.json`)

| Vector | Estado | Evidencia |
|---|---|---|
| `settings_display` | **SUPPORTED_MEASURED** | 5 claves presentes en `global`/`secure` |
| `settings_vpp_pq` | **NOT_SUPPORTED** | 0 de 11 claves `pq_*`/`ai_*` existen |
| `settings_vpp_gate` | **SUPPORTED_MEASURED** | `minimal_post_processing_allowed=0`, `match_content_frame_rate=2` |
| `display_modes` | **SUPPORTED_MEASURED** | 16 modos 4K/1080p a 23.976–60 fps |
| `colordisplaymanager` | **BLOCKED** | servicio `color_display` presente, `@SystemApi` |
| `amlogic_vpp_sysfs` | **BLOCKED** | `/sys/class/amvecm` existe; `ls` → Permission denied; 0 módulos VPP |
| `agent_permissions` | **SUPPORTED_MEASURED** | `WRITE_SECURE_SETTINGS=true`, `SYSTEM_ALERT_WINDOW=false` |
| `hdr_panel` | **SUPPORTED_MEASURED** | `mSupportedHdrTypes=[2, 3, 4]` |
| `thermal` | **SUPPORTED_MEASURED** | `soc_thermal` capturado |
| `soc_identity` | **SUPPORTED_MEASURED** | ver §2 |

### Cadena que resuelve para este aparato

```
vpp_gate -> hdr_passthrough -> cadence_match -> manifest_metadata
```

**Excluidos, con razón:** `own_player_gl` = **BROKEN_MEASURED** (`effects=on` → 16.280 B de PNG = negro, vs 1.694.782 B con `off`).

**Lo que NO se usa aquí y sí se usará en otros dispositivos:** `vpp_pq_settings` (MT8696), `vpp_amlogic_sysfs`, `color_display_manager`, `overlay_frames`. **Cada uno entra en la cadena el día que un aparato lo mida como `SUPPORTED_MEASURED`.** Nada se borra; nada se finge.

---

## 2 · El `soc_gate` falla con el nombre real de este SoC — reproducido en vivo

El heartbeat de la APK reporta `Build.SOC_MODEL` si `SDK >= 31` y no está vacío; si no, `Build.HARDWARE`.

```
SDK                       = 34              (>= 31)
ro.soc.model              = 'AMLS905Y4'
ro.hardware               = 'amlogic'
ro.board.platform         = 's4'

valor que reporta el heartbeat : 'AMLS905Y4'
soc_gate.default_allow         : [mt8696, amlogic, s905x4, s905x3]
match (strtolower + trim, exacto): 'amls905y4' ∉ lista  →  allowed = FALSE
```

**El ONN 4K lleva un Amlogic S905Y4.** La allowlist tiene `s905x4` y `s905x3`, **no `s905y4`**. Y como usa `Build.SOC_MODEL` (que no está vacío), **no cae al `ro.hardware='amlogic'` que sí pasaría**.

**Eso es GAP-01 reproducido con el dato del aparato, no con un ejemplo del protocolo.** La puerta se cierra antes de enviar nada, y el motivo es un vocabulario incompleto, no una incapacidad del hardware.

**Arreglo mínimo y quirúrgico:** añadir `s905y4` / `amls905y4` a `default_allow`, o normalizar por prefijo (`aml…` → familia). No toca ninguna otra lógica.

---

## 3 · Censo completo de los canales de metadata de la lista real

Fichero `downloaded_list_4K.m3u8`, **220.194.640 B**, escaneado entero (2.051.453 líneas):

| Directiva | Total | Por canal |
|---|---|---|
| `#EXTINF` (canales) | **2.754** | — |
| `#EXTVLCOPT` | **261.630** | **95,00** |
| con `video-filter` | **2.754** | **100,0 % de los canales** |
| `#EXT-X-APE-*` | **1.434.554** | **520,9** |
| `#EXTHTTP` | **2.754** | **1** |
| `#KODIPROP` | **148.720** | **54** |

**≈ 671 directivas de metadata por canal.** La información *está* en el fichero.

Y las cadenas de `video-filter` son reales (ffmpeg/VLC):

```
nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=...
hqdn3d=luma_spatial=2.0:chroma_spatial=1.5:luma_tmp=3.0:chroma_tmp=2.5,yadif=mode=1:...
```

`bwdif` / `yadif` (desentrelazado), `nlmeans` / `hqdn3d` (denoise), `gradfun` (debanding), `unsharp` (realce). **En el 100 % de los canales.**

---

## 4 · Pedir la máxima resolución al proveedor: lo que hay y lo que falta

| Mecanismo | ¿Existe? | ¿Efecto? |
|---|---|---|
| `#EXTATTRFROMURL:quality=top,resolution=highest,bitrate=max` | **SÍ, 100 % canales** | **Ninguno** — etiqueta propietaria; RFC 8216 §6.3.1 manda ignorar lo desconocido |
| `#EXTATTRFROMURL:preferred-codec=hevc,hev1,hvc1,h265,…` | SÍ | Ninguno, mismo motivo |
| Query en la URL (`?quality=…`) | **NO** — las URLs son `https://iptv-ape.duckdns.org/live/N.m3u8` **sin query** | — |
| Selección/reordenación de variante en el master | **NO** — `sort.*bandwidth` = 0 hits, `variantSelector` = 0 hits, `selectVariant` = 0 hits | — |
| `RESOLUTION=3840x2160` declarado | SÍ (39 hits) | Declara, no garantiza |

**`#EXTATTRFROMURL:resolution=highest` no pide nada: declara una intención que el reproductor no puede ejecutar.**

**La única vía que conseguiría de verdad la mejor variante es selección en el master.** El VPS ya reescribe `#EXT-X-STREAM-INF` (`ape_uhd.lua`); lo que falta es que **filtre o reordene** para dejar primero la variante de mayor resolución real. Eso sí lo consume el reproductor, porque un master playlist es estándar.

---

## 5 · Lo que queda por construir, sin perder ninguna vía

| # | Vía | Estado | Qué falta |
|---|---|---|---|
| 1 | `manifest_metadata` | activa | nada |
| 2 | `cadence_match` | activa | `Display4K.kt:21` deja de pisar la cadencia |
| 3 | `hdr_passthrough` | activa | nada (`hdr_conversion_mode=1`) |
| 4 | `vpp_gate` | activa | nada (`minimal_post_processing_allowed=0`) |
| 5 | `vpp_pq_settings` | **no soportada aquí** | existe en MT8696; se activa sola cuando se mida ahí |
| 6 | `vpp_amlogic_sysfs` | **BLOCKED aquí** | módulo VPP no cargado + SELinux; requiere firmware o root |
| 7 | `color_display_manager` | **BLOCKED aquí** | APK con privilegio de sistema (`CONTROL_DISPLAY_COLOR_TRANSFORMS`) |
| 8 | `overlay_frames` | **cerrada aquí** | `SYSTEM_ALERT_WINDOW` no concedido |
| 9 | `own_player_gl` | **BROKEN_MEASURED** | arreglar `CrystalGlEffect` (no entrega frames) |
| 10 | selección de variante | **no implementada** | filtrar/reordenar `STREAM-INF` por resolución real |

**La sonda está escrita para que las vías 5–10 entren solas el día que el aparato las mida como soportadas.** Esa es la propiedad polimórfica: no se decide a mano, se mide.
