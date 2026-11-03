# BG_REPAIR_r2 — BitrateGuard v32 (reparación de F04/F03 y cierres F09/F10 sobre v31)

**Task:** t44 / BG7 · `device-ara-engineer` · attempt `ab51ee78-bf91-4f48-9ac2-fa596a5fe4bf`
**Fecha:** 2026-10-31 (America/Bogota)
**Alcance:** APK on-device. **NO** se tocó VPS, auth, `/sync`, `/ara`, `/lists/` ni canary.

## 0. Truth-guards de este reporte

- **No se declara 4K real.** El test es un stream público 1080p AVC (`test-streams.mux.dev/x36xhzz`),
  no la fuente del proveedor. `wm size` en el ONN: `Physical 3840x2160` + `Override 1920x1080`.
- Todo lo del device está medido con `logcat`; el caso de window vacío está **ejecutado** en JVM
  sobre la MISMA función de producción (`BitrateWindow.kt`), no inferido de una captura.

## 1. Artefactos

| Artefacto | Bytes | sha256 |
|---|---|---|
| `app-release.apk` (v32) | 23.775.281 | `0fc099a95b8c68edd5092e56f591b2cc186f3d8d24c7439afcf2d53e5ca1f089` |
| `BitrateGuard.kt` | 10.098 | `dfde7c1b29bd222dbfd385a730baf3065e9f18930329b41fddc19eb962ed135b` |
| `BitrateWindow.kt` (nuevo) | 2.259 | `fca3d7d02ce4ae4c4cc250fa5eef750a20995e48a74f32f12682b3ba493de426` |
| `BitrateMeter.kt` | 1.734 | `5f9de63d0ac19bedb9aeaf66d5cb35ab56760b3ae0425164e9c5572f1ce216a3` |
| `MainActivity.kt` | 13.847 | `1690c3074ee690f64880f1408f1686b8cd43735fa7ba8d7e7307c7f26c8b1edd` |
| `app/build.gradle.kts` | 5.328 | `51f553fe695eff2fe1a25290f73703d0b50c279b9cd5c28c0c575eac0b64731e` |
| `BG_REPAIR_r1.md` (corregido) | 10.205 | `6d47f44d7266a5f5ce9a49398f974e736f93d3d2ea7101084c14d8d320c3d7a9` |

`versionCode=32`, `versionName=3.4.6-bitrate-guard-r2` (instalado; `dumpsys` confirma 32).

## 2. Hallazgos

### F04 — HIGH — fallback fuera del window (bloqueo)
```
Síntoma: `candidates = if (inWindow.isNotEmpty()) inWindow else variants`. Con window vacío se podía
         fijar un bitrate de OTRA resolución y no se relajaba el window ⇒ grupo sin variante
         seleccionable (pantalla negra).
Corrección (3 capas):
  1. Se ELIMINA el fallback. `inWindow` vacío ⇒ estado `NO_WINDOW`, se cancela el timer, se publica
     panel con max/floor/ceil a 0 y **no se llama a lockTo**: el selector queda intacto.
     Log: `NO_WINDOW: 0/<n> variantes dentro de win=<minW>x<minH>-<maxW>x<maxH> — no se toca el
     selector (lock preservado=<kbps>)`.
  2. `lockTo` re-verifica pertenencia con `BitrateWindow.contains(...)` contra los parámetros ACTUALES
     y, si no pertenece, escribe `lockTo REFUSED: … fuera del window` y NO toca el selector.
  3. La lógica de ventana vive en `BitrateWindow.kt` (Kotlin puro, sin Android/Media3) para poder
     ejecutarla fuera del APK.
Prueba (JVM, ejecutada — ver §3): `EMPTY_WINDOW filter=0 pickTarget=null` y
     `CONTAINS_720_in_1080=false` / `CONTAINS_1080_in_1080=true`.
En device no se forzó un window vacío (no se inyectan manifests artificiales); la ruta queda probada
por la función de producción ejecutada + el log de guarda en el código.
Estado: CORREGIDO.
```

### F03 — MEDIUM — una sola muestra ya decidía
```
Síntoma: con 1 muestra `kbps()=0` y `hasFresh` sólo miraba edad ⇒ podía decidir con dato inexistente.
Corrección: `BitrateMeter.samples()` + `hasFresh()`; el guard exige `samples >= 2 && age <= 6 s`.
Si no ⇒ `NO_DATA` (sin ALERT, sin lock). El log ahora imprime `samples=` y `sample_age=`.
Prueba en device: primera decisión con `samples=5` (nunca con 1) y transición a
     `state=NO_DATA samples=9156 sample_age=7878ms → 19351ms`.
Estado: CORREGIDO.
```

### F09 — LOW — multiplicador sin UI ni test
```
Estado: DOCUMENTADO + verificable. `upscale_demand_<out>` (out ∈ {4k, 2k}) es config por prefs con
default en `BitrateConfig.defaultDemand = {2k:1.00, 4k:1.15}`; se lee con `FluidStore.prefs(ctx).getFloat`
y se acota `coerceIn(1.0, 2.0)` antes de calcular el piso. No hay pantalla nueva (fuera de alcance) y
NO se inventa una: se documenta aquí y en el KDoc de `BitrateConfig`.
```

### F10 — LOW — reset incompleto en zap/release
```
Corrección: `BitrateGuard.reset()` limpia además `bitrateMaxVariantKbps`, `bitrateFloorKbps`,
`bitrateCeilKbps`, `bitrateSourceBand`, `bitrateOutBand`, `bitrateAt` y `bufferPct` (antes sólo
belowSince/timer/lock/state). `ApePlayer.playChannel()` y `release()` ya lo invocan.
Estado: CORREGIDO.
```

### LOW — claim “0 ocurrencias” de `BG_REPAIR_r1.md`
```
Corrección: r1 ahora dice “0 ocurrencias **en código ejecutable**” y explica que en v31 quedaban 2
menciones en el KDoc (sin efecto). Además, v32 reescribió ese KDoc sin los literales: grep sobre
`app/src/main` ⇒ **0 ocurrencias** reales (verificado en este run).
Estado: CORREGIDO.
```

### F07/F08 (arrastrados de r1, sin cambios)
`defaultDemand` limitado a {2k,4k}; `outBand()` no devuelve "4k" por debajo de 1440p. Las bandas de
ORIGEN 6k/8k siguen como defensa inalcanzable (decode capado a 4K): documentado.

## 3. Caso window vacío — ejecución real de la función de producción (JVM)

Se compiló `BitrateWindow.kt` (el MISMO fichero del APK, sin Android) con el compilador Kotlin de la
caché de Gradle y se ejecutó con un master de 5 variantes (240p…1080p):

```
EMPTY_WINDOW filter=0 pickTarget=null                       ← window 3840x2160..3840x2160 (vacío)
WINDOW_1080 count=1 target_kbps=6221                        ← window 1920x1080..1920x1080
CONTAINS_720_in_1080=false                                  ← lockTo rechazaría 720p en window 1080
CONTAINS_1080_in_1080=true
PICK_inband_kbps=9000                                       ← F05: in-band preferido (5M/9M/25M)
PICK_over_ceiling_kbps=9000                                 ← F05: con techo 14M no elige 25M
PICK_all_below_floor_kbps=5000 below_floor=true             ← origen bajo el piso ⇒ máximo + FLOOR_BREAK
```

## 4. Verificación en device (ONN `192.168.1.7:5555`)

```
./gradlew --offline :app:assembleRelease   → BUILD SUCCESSFUL (exit 0) 1m49s
adb install -r app-release.apk             → Success · versionCode=32 / 3.4.6-bitrate-guard-r2
adb shell am start … PlayerActivity --es url <stream 1080p público> → Status: ok (WaitTime 3112 ms)
adb shell pidof com.ape.crystalagent       → 22188 (vivo; sin crash)
```

`adb logcat -d -s ApeBitrateGuard` (literal):

```
I ApeBitrateGuard: LOCK 1920x1080@6221kbps reason=below_floor
I ApeBitrateGuard: bitrate=559kbps net=559 maxvar=6221 floor=9200 ceil=14000 state=FLOOR_BREAK buf=0% lock=6221 cand=1/5 win=1920x1080-1920x1080 samples=5 sample_age=0ms
I ApeBitrateGuard: bitrate=6221kbps net=240201 maxvar=6221 floor=9200 ceil=14000 state=FLOOR_BREAK buf=100% lock=6221 cand=1/5 win=1920x1080-1920x1080 samples=9156 sample_age=3282ms
I ApeBitrateGuard: bitrate state=ALERT timer=8s below_floor_ms=8004
I ApeBitrateGuard: bitrate=6221kbps … state=ALERT … samples=9156 sample_age=5290ms
I ApeBitrateGuard: bitrate=0kbps … state=NO_DATA buf=0% sample_age=7878ms
I ApeBitrateGuard: bitrate=0kbps … state=NO_DATA … sample_age=19351ms
```

Sin `NO_WINDOW` ni `lockTo REFUSED` en este run: coherente, el window del master 1080p es válido
(`cand=1/5`). Ambas guardas existen y están probadas por la vía de la función pura (§3).

## 5. Límites reales (no se maquillan)

1. **LoadControl inmutable** tras construir el player: `buffer_profile`/`buffer_min_s`/`buffer_max_s`/
   `cache_mib` aplican en el siguiente `ApePlayer.build()`; no hay re-tune en caliente.
2. **Media3 no expone** knobs de prefetch/nº de conexiones: siguen fuera del código (0 ocurrencias).
3. **NO_WINDOW no se forzó en device**: probado en JVM con la función de producción; en hardware haría
   falta un master artificial, que no se inyecta.
4. Fuente medida = **stream público 1080p AVC**, no el proveedor ⇒ **sin medición de 4K/HEVC real**.
5. Display con **override 1920x1080** sobre panel 4K ⇒ **4K real = NO_MEDIDO**.
6. `NO_DATA` es esperado cuando la reproducción queda 100% bufferizada (no entran bytes nuevos).
7. `upscale_demand_*` sigue sin UI (config por prefs, documentado en F09).

## 6. Para t45 (re-revisión)

- Ficheros: `BitrateGuard.kt` (F04 sin fallback + lockTo con pertenencia; F03 samples≥2; F10 reset),
  `BitrateWindow.kt` (nuevo, puro), `BitrateMeter.kt` (`samples()`), `MainActivity.kt`
  ("banda objetivo"), `app/build.gradle.kts` (v32), `ara-x/reports/BG_REPAIR_r1.md` (claim corregido).
- Reproducir el test: `adb shell am start -n com.ape.crystalagent/.PlayerActivity --es url <stream>`.
- Para medir banda real hace falta una fuente del proveedor (4K/HEVC): **hasta entonces, 4K = NO_MEDIDO**.
