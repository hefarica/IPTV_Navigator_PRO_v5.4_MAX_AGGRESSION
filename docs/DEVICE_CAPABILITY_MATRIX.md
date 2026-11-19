# PKG-4 — Matriz homologada de capacidades por familia de dispositivo

Requisito del operador (literal): *"Independiente del dispositivo, el APK tiene que tener implementada
absolutamente todas las versiones para diferentes dispositivos y configuraciones homologadas para sacar
el máximo provecho a todos los dispositivos y sus máximas capacidades y prestaciones."*

Implementación: [`CapabilityMatrix.kt`](../IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/CapabilityMatrix.kt)
(núcleo puro: matriz + escalera + gating) y
[`DeviceCapabilities.kt`](../IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/DeviceCapabilities.kt)
(probe medido: MediaCodecList / Display / Build / Settings).

**Regla de oro del diseño:** ninguna decisión de códec, nivel, resolución o filtro se toma por el nombre
del modelo. `Family` sólo etiqueta la fila y elige **qué vocabulario de claves sondear**; todo lo demás
sale de `Caps`, que viene de APIs medidas.

---

## 0 · Estado de la evidencia en esta sesión — leer antes de la tabla

| Verificación | Estado | Evidencia |
|---|---|---|
| Código compila en el APK real | **PASS** | `gradlew :app:compileReleaseKotlin` → EXIT 0 |
| Núcleo puro (matriz, escalera, gating) | **PASS** | `CapabilityMatrix.selfCheck()` → `PASS escalera=nivel↔resolucion(5 casos) paso_abajo=1 target>=4K=si sin_nivel=NO_COMPUTADO gating=presente/ausente/sin_permiso matriz=4familias qualcomm_no_computado=si marca_no_decide=si` |
| Detección **on-device** por familia | **NO COMPUTADO** | `adb devices` → `List of devices attached` y **cero** dispositivos. Sin device no hay `MediaCodecList`, ni `Display.hdrCapabilities`, ni `settings list`. Se declara NO COMPUTADO, nunca PASS. |
| Device sin VPP / sin HDR arrancando | **NO COMPUTADO** | no hay device conectado de ninguna familia |

---

## 1 · DETECCIÓN: de dónde sale cada dato (comando para reproducirlo)

| Dato | Fuente en el APK | Comando equivalente para pegar la salida |
|---|---|---|
| SoC crudo | `Build.SOC_MODEL` (API≥31) o `Build.HARDWARE` | `adb shell getprop ro.soc.model` · `adb shell getprop ro.hardware` |
| Familia | `SyncProtocol.canonicalSoc` + `Build.BOARD/HARDWARE/DEVICE` | `adb shell getprop ro.board.platform` |
| ABI | `Build.SUPPORTED_ABIS` | `adb shell getprop ro.product.cpu.abilist` |
| Nivel HEVC (Main/Main10/L…) | `MediaCodecList(REGULAR_CODECS)` + `profileLevels` | `adb shell dumpsys media.player \| grep -iE 'hevc\|h265\|profileLevel'` |
| HDR (PQ/HLG/DV) | `Display.getHdrCapabilities().supportedHdrTypes` | `adb shell dumpsys display \| grep -iE 'hdr\|supportedHdrTypes'` |
| Resolución y fps máx. | `Display.mode` / `supportedModes` | `adb shell dumpsys display \| grep -iE 'mDisplayId\|refreshRate\|real '` |
| RAM | `ActivityManager.MemoryInfo.totalMem` | `adb shell cat /proc/meminfo \| head -1` |
| Claves VPP presentes | `Settings.Global/System/Secure.getString` por clave | `adb shell settings list global \| grep -E 'pq_\|ai_\|com.amazon.tv'` |
| Permiso de escritura | `KeyGuard.hasSecure` (`SettingsCatalog.kt:36`) | `adb shell dumpsys package com.ape.crystalagent \| grep -i WRITE_SECURE_SETTINGS` |

`DeviceCapabilities.matrixReport(ctx)` imprime exactamente esto en el diagnóstico de la app
(`Ajustes → diagnóstico ARA`), con cada campo marcado NO COMPUTADO cuando no se pudo medir.

---

## 2 · MATRIZ HOMOLOGADA por familia

Cada celda: **valor · estado · evidencia**. `REPO_EVIDENCE` = medición previa documentada **en este
repo** (no re-medida aquí). `NO COMPUTADO` = no hay medición y no se inventa.

### 2.1 MediaTek MT8696 (Fire TV 4K Max / AFTKRT)

| Campo | Valor | Estado | Evidencia |
|---|---|---|---|
| Códec máx. | HEVC Main10 (`hvc1.2`) por HW; AV1 no declarado | REPO_EVIDENCE | `SettingsApplier.kt:363-379` (comentario medido en AFTKRT, `ro.board.platform=mt8696`) |
| Nivel máx. | NO COMPUTADO | NO_COMPUTADO | falta `MediaCodecList` del Fire TV (`dumpsys media.player`) |
| HDR | HDR10/PQ y HLG; DV no declarado | REPO_EVIDENCE | `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md` + `SettingsApplier.kt:333` |
| Resolución objetivo | 3840x2160 (4K simulado); 6K/8K sólo presentación | DERIVED | `PlaybackPolicy.kt:21-34` + ley anti-degradación |
| VPP disponible | `ai_sr`, `ai_pq`, `dnr`, `sharpness`, `memc` (`motion_smoothness`), `picture_mode`, `color_temperature`, `noise_reduction` | REPO_EVIDENCE | `SettingsApplier.kt:344-378` (11 claves MediaTek + 6 Amazon, con valores reales medidos) |
| Límites | exige *Apps de orígenes desconocidos*; `minimal_post_processing_allowed=0` abre el VPP | REPO_EVIDENCE | `tools/README-INSTALADOR.md` + `SettingsApplier.kt:323` |

### 2.2 Amlogic (ONN 4K / S905X4)

| Campo | Valor | Estado | Evidencia |
|---|---|---|---|
| Códec máx. | HEVC Main10; techo doctrinal 4K@60 (L153) | REPO_EVIDENCE | `CLAUDE.md` (Ley Cardinal 1: `L153`=4K@60) + `ApePlayer.kt:525` (onn. 4K / Amlogic s4) |
| Nivel máx. REAL | NO COMPUTADO (L153 es doctrina, no medición del decoder) | NO_COMPUTADO | falta `dumpsys media.player` del ONN |
| HDR | HDR10/PQ y HLG; DV no declarado | REPO_EVIDENCE | `CLAUDE.md` (VIDEO-RANGE=PQ) — no re-medido |
| Resolución objetivo | 3840x2160; 8K sólo presentación | REPO_EVIDENCE | `PlaybackPolicy.kt:21-34` |
| VPP disponible | **0 de 11 claves `pq_*` en el ONN 4K medido** | REPO_EVIDENCE | `DeviceSampler.kt:28-29` → `ai_sr=false`, `no_vendor_keys` |
| Límites | sin VPP: el APK debe seguir funcionando (SDR + sin filtros) | REPO_EVIDENCE | `DeviceSampler.vppCapability()` (`:50-54`) |

### 2.3 Qualcomm

| Campo | Valor | Estado | Evidencia |
|---|---|---|---|
| Códec máx. | NO COMPUTADO | NO_COMPUTADO | no hay ningún device Qualcomm medido en el repo ni conectado |
| Nivel máx. | NO COMPUTADO | NO_COMPUTADO | idem |
| HDR | NO COMPUTADO | NO_COMPUTADO | idem |
| Resolución objetivo | 3840x2160 si el decoder lo declara (decide `MediaCodecList`, no la marca) | DERIVED | `CapabilityMatrix.ladder` |
| VPP disponible | sólo compuertas estándar (`match_content_frame_rate`, `minimal_post_processing_allowed`, `hdr_conversion_mode`, resolución) | DERIVED | `ALLOW_KEY` no tiene ninguna clave Qualcomm específica |
| Límites | sin vocabulario VPP propio: **no se inventan claves** | DERIVED | idem |

### 2.4 Genérico (cualquier Android / device sin VPP y sin HDR)

| Campo | Valor | Estado | Evidencia |
|---|---|---|---|
| Códec máx. | lo que declare `MediaCodecList` (HEVC Main/Main10 si existe; si no, AVC) | DERIVED | selección por capacidad medida |
| Nivel máx. | el declarado; si falta → NO COMPUTADO (nunca "cabe" por defecto) | DERIVED | `ladder()` |
| HDR | lo que declare `Display.hdrCapabilities`; vacío = SDR-only | DERIVED | requisito 5: SDR es legítimo |
| Resolución objetivo | 3840x2160 declarado; decode ≤1 paso abajo | DERIVED | ley anti-degradación |
| VPP disponible | ninguno garantizado: se sondea y se aplica **sólo lo presente** | DERIVED | `vppPlan()` |
| Límites | debe funcionar sin VPP y sin HDR (caso por defecto) | DERIVED | requisito 5 |

---

## 3 · GATING (implementado)

`SettingsApplier` ya escribe sólo claves allowlisted y hace *get antes de put* (`putSetting`, `:144-262`).
Encima, `CapabilityMatrix.vppPlan(caps, keys)` clasifica cada clave:

| Situación | Acción | Declaración |
|---|---|---|
| clave presente + `WRITE_SECURE_SETTINGS` | **APPLY** | "clave presente y escribible: se aplica por la allowlist" |
| clave ausente en el SoC | **IGNORE** | "la clave NO existe en este device: se ignora (no se escribe una clave que el SoC no soporta)" |
| clave presente sin permiso | **IGNORE** | "existe pero falta WRITE_SECURE_SETTINGS: se ignora y se declara" |

Nunca se escribe una clave que el SoC no soporta; lo ignorado se declara con su motivo (no hay silencios).

## 4 · ESCALERA POR CAPACIDAD (Ley Cardinal 1)

`CapabilityMatrix.ladder(requestedHeight, fps, caps)`:

1. Nivel requerido por altura/fps: 1080p30→`L120`, 1080p60→`L123`, 1440p→`L150`, **2160p→`L153`**,
   3240p (6K)→`L183`, 4320p→`L186`.
2. Si el nivel medido del device ≥ requerido → `fits=true`, sin tocar nada.
3. Si no llega → **un solo paso abajo** de decodificación (`decodeStep`) y `hardwareLimited=true`, declarado.
4. **El target declarado NUNCA baja de 2160p** (`FLOOR_HEIGHT`): si el hardware no llega, se declara el
   límite **sin degradar la señal**. La ley anti-degradación manda sobre la escalera.
5. Sin nivel medido → `fits=false`, `hardwareLimited=false`, motivo **NO COMPUTADO**: no se afirma que
   quepa ni que no quepa.

## 5 · Device sin VPP y sin HDR

Es el caso por defecto del diseño, no una excepción: `hdrTypes` vacío ⇒ se declara SDR; `vppPlan` devuelve
IGNORE para todas las claves ausentes; `ladder` con nivel desconocido ⇒ NO COMPUTADO. El APK no requiere
VPP para arrancar ni para aplicar: sólo deja de aplicar lo que el hardware no tiene. Degradar así es
legítimo (falta de hardware), no es degradar la señal.

---

## 6 · Cómo completar las celdas NO COMPUTADO (cuando haya device)

```bash
adb connect <IP_FIRETV>:5555 && adb devices
adb shell getprop ro.soc.model; adb shell getprop ro.board.platform; adb shell getprop ro.product.cpu.abilist
adb shell dumpsys media.player | grep -iE 'hevc|h265|profileLevel'   # nivel real del decoder
adb shell dumpsys display | grep -iE 'hdr|supportedHdrTypes|refreshRate'
adb shell settings list global | grep -E 'pq_|ai_|com.amazon.tv'
```
Cada salida se pega en la tabla sustituyendo el NO COMPUTADO por el valor + el comando. Sin eso, la celda
sigue NO COMPUTADO: no se rellena a ojo.
