# LA VERDAD EN TRES CAPAS SOBRE EL VPP DEL ONN 4K · 2026-11-13

**Corrección acumulada.** He dado tres diagnósticos sobre el mismo síntoma y los tres son ciertos, pero incompletos hasta hoy. Esta es la versión final, con medición directa en el aparato.

El síntoma: `pq_ai_sr_enable = null` en el ONN. La pregunta: ¿por qué la imagen no mejora por el VPP?

---

## Capa 1 — El bloque `ape_vpp` no viaja (GAP-03, GAP-04)

Documentado por el propio repo en `ara-x/spec/actuator_allowlist.json` → `open_gaps`:

> **GAP-04:** «Los 13 levers VPP sólo llegan al APK con `APE_4K_BRIDGE_ENABLED=1` (**default OFF**): en producción **se aplican 3 filas, no 14**.»
> **GAP-03:** «El bloque `ape_vpp` **NO viaja** en el SSE que consume el APK.»

**Evidencia:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php:95` — `getenv('APE_4K_BRIDGE_ENABLED') === '1'`.

**Cierto. Y arreglarlo no basta**, como demuestra la capa 2.

---

## Capa 2 — Dos bloqueos más, también reales

### 2a · La allowlist de la APK no tiene los levers

`SettingsCatalog.kt` sólo contiene **2 de los 13**: `match_content_frame_rate` y `minimal_post_processing_allowed`. Los 11 `pq_*`/`ai_*` **no están**, y `SettingsApplier` rechaza y loggea lo que no está en la lista.

**Cierto. Y arreglarlo tampoco basta.**

### 2b · El vocabulario se midió sobre un MT8696, no sobre este Amlogic

Cada clave de la allowlist tiene un campo de procedencia:

```json
{ "key": "display_color_mode", "observed_in_mt8696_global_dump": true }
{ "key": "match_content_frame_rate", "observed_in_mt8696_global_dump": false,
  "note": "base del SSE; su AUSENCIA en 'global' haría el skip silencioso" }
```

**`mt8696` es el Fire TV 4K Max, un MediaTek.** No hay ningún campo equivalente para Amlogic. **El inventario de claves nunca se midió en este aparato.**

Y el propio contrato avisa de la consecuencia: si la clave no existe, **skip silencioso**. Sin error, sin log, sin efecto.

---

## Capa 3 — La medición que cierra el caso: 11 de 13 no existen

Sondeo directo en el ONN 4K (`192.168.1.3`), el 2026-11-13:

| Lever | Namespace | Valor |
|---|---|---|
| `pq_ai_sr_enable` | **—** | `null` |
| `ai_sr_level` | **—** | `null` |
| `ai_pq_mode` | **—** | `null` |
| `aipq_enable` | **—** | `null` |
| `pq_sharpness_enable` | **—** | `null` |
| `pq_ai_dnr_enable` | **—** | `null` |
| `pq_dnr_enable` | **—** | `null` |
| `pq_nr_enable` | **—** | `null` |
| `pq_ai_fbc_enable` | **—** | `null` |
| `pq_hdr_enable` | **—** | `null` |
| `pq_hdr_mode` | **—** | `null` |
| `match_content_frame_rate` | `secure` | **2** |
| `minimal_post_processing_allowed` | `secure` | **0** |

`ns = —` significa que la clave **no existe en `global` ni en `secure`**. No está en `null`: **no está**.

Y las dos que sí existen **ya tienen el valor correcto**:

- `minimal_post_processing_allowed = 0` → según el contrato, *«0 = NO permitir post-proceso mínimo (**VPP completo**)»*. **Ya está en la posición más permisiva.**
- `match_content_frame_rate = 2` → ALWAYS, pero el firmware lo anula (`ro.surface_flinger.enable_frame_rate_override = false`).

## Conclusión de las tres capas

> **En este ONN 4K, la mejora de imagen por VPP a través de Android Settings no tiene camino.** No porque nadie lo haya activado, sino porque **11 de las 13 claves que el sistema sabe mandar no existen en este SoC**, y las 2 que existen ya están en su valor óptimo.

**Encender el puente GAP-04 y añadir los levers a la allowlist no cambiaría nada en este televisor.** Sería trabajo correcto que no produce ningún píxel.

**No es que el chip carezca de post-proceso.** Es que en Amlogic el PQ lo gobierna `tvserver`/DroidLogic, no `Settings`. Y en esta build no es alcanzable — y esto hay que decirlo con precisión, porque en una primera lectura me equivoqué:

**Lo que existe y lo que no, medido (`ls -ld` + `ls` + `/proc/modules`):**

| Ruta | Directorio | Contenido | Módulo cargado |
|---|---|---|---|
| `/sys/class/amvecm` | **SÍ** (`drwxr-xr-x root root`) | `ls` → **Permission denied** (SELinux) | **NO** |
| `/sys/class/video` | **SÍ** (`drwxr-xr-x root root`) | `ls` → **Permission denied** (SELinux) | — |
| `/sys/class/ppmgr` | **NO existe** | — | — |
| `/sys/class/display/fr_hint` | **SÍ** | `cat` → **Permission denied** | — |

`/proc/modules` carga `aml_dhp`, `aml_smmu`, `firmware` y la familia de **decodificadores** `amvdec_*` (`amvdec_h265`, `amvdec_av1`, `amvdec_vp9`, `amvdec_mmpeg12`, …). **No aparece ningún módulo `amvecm`, `amvpp` ni `vpp`.** Y `/sys/module/` no tiene entrada para ellos.

**Traducción:** el nodo de clase `/sys/class/amvecm` existe porque lo crea la maquinaria de clases del kernel, **pero el módulo que expondría los controles del VPP no está cargado**, y además SELinux bloquea el listado aunque el directorio sea 755 de root.

**Corrección de una afirmación mía anterior:** dije «`/sys/class/amvecm` no existe». **Falso.** Existe; lo que falla es el acceso y el módulo de fondo.

---

## Lo que SÍ existe y no estaba en ninguna lista

Al barrer las claves reales de imagen del aparato aparece una que nadie había señalado:

```
nrdp_platform_capabilities = {"vp9Disabled":"false","hdrOutputType":"playback",
                              "minVideoFramesForPlaybackStart":"11"}
```

**`minVideoFramesForPlaybackStart = 11`** es una palanca **real, presente y consumida** de arranque de reproducción. Eso sí toca lo que el operador llama «arranque lo más rápido posible».

Y las de imagen que existen de verdad:

```
hdr_conversion_mode = 1                        (PASSTHROUGH)
are_user_disabled_hdr_formats_allowed = 1
user_disabled_hdr_formats =                    (vacío: ningún HDR bloqueado)
match_content_frame_rate = 2
minimal_post_processing_allowed = 0
```

**Eso es todo el vocabulario de imagen que este aparato acepta por Settings.** Cinco claves, no trece.

---

## Dónde SÍ está la mejora de imagen real en este aparato

| Vía | Estado en el ONN | Por qué |
|---|---|---|
| VPP por Settings (`pq_*`) | **NO EXISTE** | 11/13 claves ausentes (medido hoy) |
| VPP por `tvserver` (Amlogic) | **NO ALCANZABLE** en esta build | `/sys/class/amvecm` existe pero `ls` → Permission denied (SELinux) y **no hay módulo `amvecm`/`amvpp` cargado** en `/proc/modules`; `/sys/class/ppmgr` ausente |
| `IColorDisplayManager` (saturación por app) | **API de sistema** | `@SystemApi`; shell no tiene `CONTROL_DISPLAY_COLOR_TRANSFORMS` |
| Overlay (procesar el frame de OTT) | **CERRADO** | `SYSTEM_ALERT_WINDOW = granted FALSE` |
| Efectos GL del player propio | **ROTO, medido** | `effects=on` → 16.280 B de PNG (negro) vs 1.694.782 B con `off` |
| **Cadencia del panel** | **FUNCIONA** | Ajustes del TV → 50 Hz → `mActiveModeId=125`, `renderFrameRate 50.0` |
| **Metadata del manifiesto (Canal 1)** | **FUNCIONA** | Es lo que OTT Navigator consume en cada recarga |
| **HDR passthrough** | **FUNCIONA** | `hdr_conversion_mode=1` |

**Las dos vías vivas para mejorar lo que el operador ve en OTT Navigator son el Canal 1 (metadata del manifiesto) y la cadencia del panel.** El resto, en este SoC, no tiene sustrato.

---

## La decisión que esto deja sobre la mesa

Es del operador, no mía:

1. **Aceptar que en el ONN 4K la mejora es por manifiesto y cadencia**, y concentrar ahí el esfuerzo. El VPP queda para los MT8696 (Fire TV), donde las claves sí existen.
2. **O abrir la vía Amlogic**: montar `tvserver`/DroidLogic con una API alcanzable, o una APK con privilegio de sistema que use `IColorDisplayManager`. Es ingeniería nueva, no configuración.

Lo que **no** es una opción honesta: encender `APE_4K_BRIDGE_ENABLED=1` y reportar que la imagen mejoró. Serían filas escritas en claves que este aparato no lee.
