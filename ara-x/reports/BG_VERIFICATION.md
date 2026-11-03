# BG2 · Verificación E2E del BitrateGuard y bandas v26/v30

**Tarea:** `t39` (BG2) · **Autor:** `integration-verifier` · **Fecha:** 2026-10-31 (America/Bogota)
**Repo:** `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · **HEAD:** `54e8b78` (`fix(player): enforce bitrate floor alert after 8s and cap prefetch bursts`)
**Device:** ONN 4K (`onn. 4K Streaming Box`, Android 14 / SDK 34) · serial ADB `192.168.1.7:5555`
**Sin editar código de producto. Sin tocar `/sync`, `/ara`, `/lists/`, VPS ni canary.** Solo: build release, `aapt`, instalación en el ONN autorizado, launch de `PlayerActivity`, logcat y force-stop.

## 0 · Veredicto (leer primero)

| # | Criterio del brief | Resultado |
|---|---|---|
| 1 | `./gradlew --offline :app:assembleRelease` exit 0 | **PASS** |
| 2 | versionCode **26** / versionName **3.4.0-bitrate-guard** | **FAIL literal** — el árbol/APK actual es **versionCode 30 / 3.4.4-bitrate-guard-alerttimer**. No aparece v26 en `ara-x/app-dist/`, en `app/build/outputs` ni en el historial git; fabricarlo exigiría editar código o cambiar de commit (prohibido por el brief). Ver §3. |
| 3 | Instalar en ONN y capturar `adb logcat -s ApeBitrateGuard ApePlayer` | **PASS (sobre v30)**; fuente pública 1080p, no 4K ⇒ la banda 4K dinámica queda **NO_MEDIDO** (declarado, sin inventar) |
| 4 | Tabla de bandas (480→2K 7–12 · 1080→8K 12–14 · 4K→4K 13–22 · 4K→8K 19–22 · floor≤ceil) | **PASS** (valores exactos 7.000–12.000 · 11.600–14.000 · 13.000–22.000 · 18.850–22.000; el brief está redondeado a k; 40/40 combinaciones floor≤ceil) |
| 5 | `StatsDataSource` envuelve el factory real; `FillController` persiste `never_stop_filling=true`, prefetch 5, conexiones 6/4 | **PASS** (código + log dinámico) |

**Veredicto global: PASS de la verificación técnica sobre los bytes actuales (v30) · 1 discrepancia declarada: el brief pide v26 y el producto actual es v30 (coherente con t38). No se declara PASS del literal "v26/3.4.0".** Si el owner exige v26, hace falta el fuente/artefacto v26 (no aparece en el material actual); no se puede cumplir sin editar producto.

---

## 1 · Entorno y método

| Dato | Valor |
|---|---|
| JDK | `C:\Users\HFRC\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot\bin\java.exe` |
| Gradle wrapper | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/gradlew.bat` (`--offline`) |
| Android SDK / build-tools | `C:\Users\HFRC\AppData\Local\Android\Sdk` · build-tools `34.0.0` |
| adb | `C:\Android\platform-tools\adb.exe` (device `192.168.1.7:5555`) |
| Device | `onn. 4K Streaming Box` · Android 14 / SDK 34 · `product:onn_4k_gtv` |
| Código de producto | **sin cambios**: `git status --porcelain -- IPTV_v5.4_MAX_AGGRESSION/android` = vacío |

---

## 2 · Build release (criterio 1) y artefacto

```powershell
cd IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent
.\gradlew.bat --offline :app:assembleRelease
```

Salida cruda (cola):

```text
> Task :app:packageRelease UP-TO-DATE
> Task :app:createReleaseApkListingFileRedirect UP-TO-DATE
> Task :app:assembleRelease UP-TO-DATE

BUILD SUCCESSFUL in 7s
47 actionable tasks: 1 executed, 46 up-to-date
```

`exit 0`. Nota honesta: Gradle reporta `UP-TO-DATE` porque los inputs no cambiaron desde el build de t38 (mismo commit `54e8b78`, árbol Android limpio); no se hizo `clean` para no alterar el artefacto de referencia. El build del árbol actual sí valida la tarea.

| Artefacto | Bytes | sha256 |
|---|---|---|
| `app/build/outputs/apk/release/app-release.apk` | 23.772.126 | `5035701e68ef21636b5169b103aa1b402365d4b12ff8657a9e103156c87b09e8` |
| `ara-x/app-dist/ARA_X_APP_v30_bitrate_guard_20261031_0355.apk` (distribución t38) | 23.772.126 | **idéntico** `5035701e…b09e8` |

`aapt dump badging` (crudo):

```text
package: name='com.ape.crystalagent' versionCode='30' versionName='3.4.4-bitrate-guard-alerttimer' platformBuildVersionName='14' platformBuildVersionCode='34' compileSdkVersion='34' compileSdkVersionCodename='14'
sdkVersion:'22'
targetSdkVersion:'28'
application-label:'APE Crystal Agent'
```

## 3 · Comprobación de versión (criterio 2) — discrepancia declarada

| Dato | Brief | Medido | ¿Coincide? |
|---|---|---|---|
| versionCode | 26 | **30** | **NO** |
| versionName | `3.4.0-bitrate-guard` | **`3.4.4-bitrate-guard-alerttimer`** | **NO** |
| sha256 APK | (no fijado en el brief) | `5035701e…b09e8` = APK de t38 | — |

Evidencia de que v26 no aparece en el material actual: `ara-x/app-dist/` contiene 17 APKs (v2, v3, v4, v5, v6, v7, v17…v25, **v30**, debug) y **ninguno v26**; `git log -S 'versionCode = 26' --all` no devuelve commits y `app/build/outputs` solo contiene el v30; `app/build.gradle.kts` declara `versionCode = 30` / `3.4.4-bitrate-guard-alerttimer` desde el commit de t38 (`54e8b78`). El propio resultado de dependencia t38 confirma que BG1 validó **v30**. Por tanto: **el criterio literal v26 es FAIL por brief obsoleto, no por defecto del producto.** Se verifica el artefacto actual (v30), que es el que el equipo declaró.

---

## 4 · Instalación en ONN y captura dinámica (criterio 3)

### 4.1 Instalación y verificación del APK instalado

```powershell
adb -s 192.168.1.7:5555 install -r app\build\outputs\apk\release\app-release.apk
# Performing Streamed Install
# Success   (exit 0)

adb -s 192.168.1.7:5555 shell pm path com.ape.crystalagent
# package:/data/app/~~UP8jgM8cjLxcfio8iyLTlw==/com.ape.crystalagent-Rm1ekYnSuxXfS6JYWK-uvQ==/base.apk
adb -s 192.168.1.7:5555 pull <base.apk> %TEMP%\bg2_installed_base.apk
# 1 file pulled: 23.772.126 bytes
# sha256 = 5035701e68ef21636b5169b103aa1b402365d4b12ff8657a9e103156c87b09e8  ⇒ instalado == APK construido
adb -s 192.168.1.7:5555 shell dumpsys package com.ape.crystalagent | findstr version
# versionCode=30  versionName=3.4.4-bitrate-guard-alerttimer
```

### 4.2 Prueba de reproducción (fuente pública, **no** del proveedor)

```powershell
adb -s 192.168.1.7:5555 logcat -c
adb -s 192.168.1.7:5555 shell am start -n com.ape.crystalagent/.PlayerActivity `
  --es url 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
# Starting: Intent { cmp=com.ape.crystalagent/.PlayerActivity (has extras) }   (exit 0)
Start-Sleep -Seconds 30
adb -s 192.168.1.7:5555 logcat -d -s ApeBitrateGuard ApePlayer
adb -s 192.168.1.7:5555 shell am force-stop com.ape.crystalagent
```

Logcat crudo (11 líneas, buffer limpio antes del test; device time EDT):

```text
--------- beginning of main
10-31 04:56:55.023 17660 17660 I ApePlayer: policy target=3840x2160 max=3840x2160 neverDownscale=true buffer=30/120s cache=256MiB
10-31 04:56:55.322 17660 17660 I ApePlayer: playChannel HEVC-first no-downscale ua=Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager url=https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
10-31 04:56:56.527 17660 17660 I ApePlayer: LOCK resolución 1920x1080 (neverDownscale=true, min_resolution=1920x1080)
10-31 04:56:56.527 17660 17660 I ApePlayer: 4k_upscaled: fuente 1920x1080 < target 3840x2160 (upscale de display, wire intacto)
10-31 04:56:56.527 17660 17660 I ApePlayer: VIDEO elegido: mime=video/avc codecs=avc1.640028 1920x1080 bps=6221600
10-31 04:56:56.527 17660 17660 I ApePlayer: 4k_upscaled: seleccionado 1920x1080 < 3840x2160 (display upscale)
10-31 04:56:56.533 17660 17660 I ApeBitrateGuard: fill aggressive=true conn=6 prefetch=5 never_stop=true
10-31 04:56:56.534 17660 17660 I ApeBitrateGuard: bitrate=6221kbps floor=9200 ceil=14000 max=6221 state=FLOOR_BREAK buf=6% lock=6221 cand=1/5 win=1920x1080-1920x1080
10-31 04:57:02.554 17660 17660 I ApeBitrateGuard: bitrate=6221kbps floor=9200 ceil=14000 max=6221 state=FLOOR_BREAK buf=96% lock=6221 cand=1/5 win=1920x1080-1920x1080
10-31 04:57:04.532 17660 17660 I ApeBitrateGuard: bitrate state=ALERT timer=8s belowSince=376575747
```

Comprobación de crash: `adb logcat -d | Select-String 'FATAL EXCEPTION|AndroidRuntime.*com.ape.crystalagent'` ⇒ **sin coincidencias** (0 crashes).

**Lectura:** fuente 1080p AVC 6,221,600 bps ⇒ `LOCK 1920x1080` (no downscale), selección `avc1.640028 1920x1080`, marcador `4k_upscaled` (display upscale, wire intacto). BG: `floor=9200 ceil=14000 max=6221`; medido 6221 < floor ⇒ `state=FLOOR_BREAK` manteniendo el máximo (lock 6221, **no baja a una variante peor**, **no inventa 13–22 Mbps**), y promoción a `ALERT` exactamente **8 s** después (`04:56:56.534 → 04:57:04.532`). Buffer 6%→96%. Coincide con t38 en lo reproducible; la prueba es independiente (build+install+launch propios).

**NO_MEDIDO declarado:** no se dispone de una fuente 4K real con variantes 13–22 Mbps; la banda 4K está implementada (§5) pero **no validada dinámicamente** contra un origen 4K. El test es un stream público de test, no un canal del proveedor.

---

## 5 · Tabla de bandas desde `BitrateConfig.kt` (criterio 4)

Script (Node, lectura del fuente real; sin recompilar):

```powershell
node -e "<lee BitrateConfig.kt, extrae bySource/defaultDemand, aplica band(): factor=src==out?1:clamp(demand,1,2); floor=round(baseFloor*factor) acotado a baseCeil; ceil=baseCeil>"
```

Salida cruda (resumen):

```json
{
  "cases": [
    {"case":"480→2K","src":"sd480","out":"2k","base":[7000,12000],"factor":1,"floor":7000,"ceil":12000,"floorK":7,"ceilK":12,"match_brief_krounded":true},
    {"case":"1080→8K","src":"fhd1080","out":"8k","base":[8000,14000],"factor":1.45,"floor":11600,"ceil":14000,"floorK":12,"ceilK":14,"match_brief_krounded":true,"match_brief_exact":false},
    {"case":"4K→4K","src":"4k","out":"4k","base":[13000,22000],"factor":1,"floor":13000,"ceil":22000,"floorK":13,"ceilK":22,"match_brief_krounded":true},
    {"case":"4K→8K","src":"4k","out":"8k","base":[13000,22000],"factor":1.45,"floor":18850,"ceil":22000,"floorK":19,"ceilK":22,"match_brief_krounded":true,"match_brief_exact":false}
  ],
  "all_combos":{"checked":40,"floor_le_ceil":40,"bad":[]},
  "sourceBandMap":{"480":"sd480","1080":"fhd1080","1440":"2k","2160":"4k","4320":"8k"},
  "ok":true
}
```

| Caso | Base (kbps) | Factor | Exacto floor–ceil | Brief (k) | ¿Coincide? |
|---|---|---|---|---|---|
| 480 → 2K | 7.000–12.000 (sd480) | 1,00 | **7.000–12.000** | 7–12 | sí (exacto) |
| 1080 → 8K | 8.000–14.000 (fhd1080) | 1,45 | **11.600–14.000** | 12–14 | sí (brief redondeado a k; exacto 11,6–14) |
| 4K → 4K | 13.000–22.000 (4k) | 1,00 (src==out) | **13.000–22.000** | 13–22 | sí (exacto) |
| 4K → 8K | 13.000–22.000 (4k) | 1,45 | **18.850–22.000** | 19–22 | sí (brief redondeado a k; exacto 18,85–22) |

- `floor ≤ ceil` en **40/40** combinaciones (8 fuentes × 5 salidas) con los defaults; el techo **nunca** se multiplica (código: `BitrateBand(floor, base.second)`).
- El brief usa valores **redondeados a k**; los exactos son 11.600 y 18.850 kbps. Ambos redondean a 12 y 19 ⇒ la tabla del brief es correcta a esa precisión.
- Override por dispositivo: `upscale_demand_<out>` en `FluidStore` prefs (defaults 2k=1.00 / 4k=1.15 / 6k=1.30 / 8k=1.45; clamp 1.0–2.0). El log dinámico confirma la fórmula en 1080→4K: `8000 × 1.15 = 9200` (`floor=9200 ceil=14000`).

## 6 · Criterio 5 — `StatsDataSource` y `FillController`

| Requisito | Evidencia en código (HEAD `54e8b78`) |
|---|---|
| `StatsDataSource` envuelve el factory real | `ApePlayer.kt:93`: `val ds = StatsDataSource.Factory(base, meter)` · `ApePlayer.kt:94`: `HlsMediaSource.Factory(ds)` · `StatsDataSource.kt:9-30`: `class StatsDataSource(private val upstream: DataSource, …)` con `Factory(upstream: DataSource.Factory)`; `read()` cuenta bytes reales (`meter.add(n)`) y delega `open/read/close/getUri` al upstream. |
| `FillController` persiste `never_stop_filling=true` | `BitrateGuard.kt:139-157`: `object FillController { fun sustain(ctx, aggressive) { … FluidStore.prefs(ctx).edit() … } }`; `:154` `.putBoolean("never_stop_filling", true)`. |
| prefetch 5 | `BitrateGuard.kt:152` `.putInt("prefetch_segments", 5)`. |
| conexiones 6/4 | `BitrateGuard.kt:153` `.putInt("buffer_connections", if (aggressive) 6 else 4)`; `buffer_profile=max` (`:151`). |
| Confirmación dinámica | Logcat: `ApeBitrateGuard: fill aggressive=true conn=6 prefetch=5 never_stop=true` (04:56:56.533). |

Notas de diseño verificadas: el medido se **capa** al máximo real de la variante para decidir (`BitrateGuard.kt:71-73`, BG1-FIX2) y se conserva el raw en `AraStatus.bitrateNetworkKbps`; la promoción a `ALERT` usa `postDelayed(promoteAlert, 8_000L)` (`:83`). No hay reconfiguración en caliente del `LoadControl`: se construye al iniciar el player (`ApePlayer.build()`), como ya declaró t38.

---

## 7 · Límites (explícitos)

- La prueba dinámica se hizo con **v30** (el brief pedía v26; ver §3). Sobre el artefacto actual, todo lo reproducible pasó.
- **No** se midió una fuente 4K real (13–22 Mbps); la banda 4K es verificación estática + fórmula, **NO_MEDIDO** dinámico.
- Fuente pública de test (`test-streams.mux.dev`), **no** un canal del proveedor; la 1080p AVC 6,22 Mbps es la limitación de la fuente, no del player.
- `LoadControl` se construye al iniciar el player; no se demostró reconfiguración en caliente. `FillController` solo reescribe prefs cuando cambia `aggressive` (anti-churn).
- Se limpió el buffer de logcat del device antes del test (para aislar la corrida); no se modificó ninguna otra configuración del ONN.
- **No** se tocó `/sync`, `/ara`, `/lists/`, VPS ni canary. No se editó código de producto. No hay commits nuevos.

## 8 · Reproducir

```powershell
# 1) build + artefacto
cd IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent
.\gradlew.bat --offline :app:assembleRelease
Get-FileHash app\build\outputs\apk\release\app-release.apk -Algorithm SHA256
& "$env:ANDROID_HOME\build-tools\34.0.0\aapt.exe" dump badging app\build\outputs\apk\release\app-release.apk

# 2) device (ONN autorizado)
adb -s 192.168.1.7:5555 install -r app\build\outputs\apk\release\app-release.apk
adb -s 192.168.1.7:5555 logcat -c
adb -s 192.168.1.7:5555 shell am start -n com.ape.crystalagent/.PlayerActivity --es url 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
Start-Sleep -Seconds 30
adb -s 192.168.1.7:5555 logcat -d -s ApeBitrateGuard ApePlayer
adb -s 192.168.1.7:5555 shell am force-stop com.ape.crystalagent

# 3) bandas (script Node de §5) y wiring (§6, líneas citadas)
```

## 9 · Hashes de evidencia

| Artefacto | Bytes | sha256 |
|---|---|---|
| APK release construido (== dist t38 == instalado en ONN) | 23.772.126 | `5035701e68ef21636b5169b103aa1b402365d4b12ff8657a9e103156c87b09e8` |
| `BitrateConfig.kt` | 2.294 | `643bf8958e1eb9f0c1fd38d777a02ab78c019459cdb01aa8c9f80788fad1d6a1` |
| `BitrateGuard.kt` | 7.469 | `99b1cd251ce2940a3342ef2ae0b831e3551fabc0b75917a6dc9791ed71190e53` |
| `StatsDataSource.kt` | 1.118 | `1290068a5d9c0dd8959ed31c346d9cb693ee2922f6a57a83f687db18e2e4729d` |
| `ApePlayer.kt` | 11.986 | `e02e9214340bff7013efbad61d2552dc214ed2b833604bfd614f4bae149e5a77` |
| `PlaybackPolicy.kt` | 3.857 | `108b8c18f8782ab7b75d16c5c630a297b97ce597618fee4593aad702e010a83e` |
| HEAD | — | `54e8b78` (árbol Android limpio) |

**Firma BG2:** `integration-verifier` · 2026-10-31 · PASS técnico (v30) con discrepancia v26 declarada · 0 crashes · 4K dinámico NO_MEDIDO.
