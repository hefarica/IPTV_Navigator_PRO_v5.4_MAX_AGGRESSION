# 01 · Inventario completo de la APK `com.ape.crystalagent` (APE Crystal Agent)

**Documento:** `docs/sistema/01_APK_INVENTARIO.md`
**Tarea:** inventario de extremo a extremo de la APK Android del agente APE.
**Fecha de medición:** 2026-11-12 (America/Bogota).
**Autor:** miembro `[apk]` del equipo de documentación del sistema APE.

---

## 0. Alcance, método y estado de la evidencia

### 0.1 Rutas exactas

| Elemento | Ruta |
|---|---|
| Raíz del módulo Gradle | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/` |
| Fuentes Kotlin (mayoría) | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/` |
| Fuente Kotlin (raíz `kotlin/`) | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/kotlin/com/ape/crystalagent/` |
| Paquete Java `com.ape.fluid` | `…/app/src/main/java/com/ape/fluid/` |
| Paquete Java `com.ape.rea` | `…/app/src/main/java/com/ape/rea/` |
| Manifest | `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/AndroidManifest.xml` |
| Módulo `:shim` (fuente externa) | `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\ottshim\app\src\main\kotlin\dev\venice\ottshim\` |

> **Corrección al enunciado de la tarea.** El enunciado decía "unos 85 ficheros .kt". **Medido: 64 ficheros `.kt`** y **19 ficheros `.java`**, total **83 ficheros de código** bajo `app/src/main` (549 652 B). El resto hasta ~85 son los `.java` de los paquetes `com.ape.fluid` y `com.ape.rea`, que **sí están** en este árbol y son parte del APK instalado. Ningún fichero se omitió: el conteo es recursivo, sin `-First` ni truncado.

### 0.2 Comandos ejecutados (reproducibles)

```powershell
# Conteo exhaustivo de .kt (sin truncar)
Get-ChildItem -Path "IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\src\main" -Recurse -File -Include *.kt
# → KT count = 64 | bytes = 339094

Get-ChildItem -Path "IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\src\main" -Recurse -File -Include *.java
# → JAVA count = 19 | bytes = 210558

# Búsqueda exhaustiva de nombres (repo completo, incluye build/)
Get-ChildItem -Path "." -Recurse -File -Filter "SessionTap.kt"
```

### 0.3 Dispositivo medido (solo lectura)

```powershell
adb -s 192.168.1.3:5555 shell dumpsys package com.ape.crystalagent
adb -s 192.168.1.3:5555 shell pm list packages com.ape
adb -s 192.168.1.3:5555 shell settings get secure enabled_accessibility_services
adb -s 192.168.1.3:5555 shell settings get secure enabled_notification_listeners
```

| Dato | Valor medido |
|---|---|
| Paquete instalado | `package:com.ape.crystalagent` |
| `versionCode` | `657` |
| `versionName` | `3.9.9-host-plus-rea-657` |
| `minSdk` / `targetSdk` | `22` / `28` |
| `firstInstallTime` | `2026-11-07 12:26:55` |
| `lastUpdateTime` | `2026-11-09 02:45:17` |

Contraste con el build declarado: `app/build.gradle.kts:27-30` (`minSdk = 22`, `targetSdk = 28`, `versionCode = 657`, `versionName = "3.9.9-host-plus-rea-657"`). **Coinciden.**

### 0.4 Convención de evidencia de este documento

- Toda afirmación cuantitativa lleva su artefacto en la misma línea: `ruta:línea`, bytes, o comando ejecutado.
- `NO COMPUTADO` = no se midió, con la razón declarada. **No** significa cero.
- Nada se declara ausente desde un listado truncado (§9 usa conteo exhaustivo repo-wide).

---

## 1. Corpus de código

### 1.1 Totales medidos

| Métrica | Valor | Artefacto |
|---|---|---|
| Ficheros `.kt` | **64** | conteo recursivo `app/src/main` |
| Bytes `.kt` | **339 094 B** | `Measure-Object -Property Length -Sum` |
| Ficheros `.java` | **19** | idem |
| Bytes `.java` | **210 558 B** | idem |
| Total fuentes | **83** ficheros / **549 652 B** | suma |
| Assets | 9 ficheros (3 `.tflite` + 6 `.glsl`) | `app/src/main/assets/**` |
| Recursos XML | 2 (`ara_accessibility.xml` 433 B, `provider_paths.xml` 103 B) + `strings.xml` 198 B | `app/src/main/res/**` |

### 1.2 Tabla de los 64 ficheros `.kt`

Ruta base de la columna *Fichero*: `app/src/main/java/com/ape/crystalagent/`, **salvo** `AraAccessibilityService.kt`, que vive en `app/src/main/kotlin/com/ape/crystalagent/`. Bytes medidos con `Get-Item.Length`. La columna *Qué hace* resume el KDOC de cabecera del propio fichero.

| # | Fichero | Bytes | Qué hace |
|---:|---|---:|---|
| 1 | `AbCapture.kt` | 1 532 | Captura `PixelCopy` de la `SurfaceView`/`TextureView` del player a PNG (sin KDOC; deduce del código: `PixelCopy.request` en línea 25). |
| 2 | `AbTestReceiver.kt` | 1 450 | Receiver exportado de A/B por broadcast adb: `off`/`on`/`freeze`/`resume`/`seek`/`shot`. |
| 3 | `AdbSelfGrantManager.kt` | 5 178 | Auto-concesión de `WRITE_SECURE_SETTINGS` por Wireless Debugging local + cliente ADB embebido (`dadb`), estilo Shizuku y sin PC. |
| 4 | `AgentService.kt` | 9 675 | Servicio foreground persistente = el daemon **aplicador puro**: orquesta SSE, `SettingsApplier`, QoE, `/sync`, self-update, WG y UltraEnhance. |
| 5 | `ApePlayer.kt` | 30 082 | Player propio media3/ExoPlayer con track-selection **HEVC-first** y 4K-first/no-downscale; no transcodifica. |
| 6 | `ApeUltraEnhanceGlEffect.kt` | 3 222 | Efecto GL frame-a-frame (media3-effect) para denoise + unsharp GPU-directo sobre el player propio. |
| 7 | `AraCommandBridge.kt` | 2 153 | Puente de comandos SSE de producción: `MetaReceiver → MetaMapper → FluidStore/ApePlayer`. |
| 8 | `AraDeviceId.kt` | 617 | Id estable y no reversible del device = `SHA-256(ANDROID_ID)` en hex. |
| 9 | `AraStatus.kt` | 5 322 | Estado compartido en memoria del proceso para el panel ARA (no es telemetría inventada). |
| 10 | `BitrateConfig.kt` | 2 619 | Banda efectiva = banda de origen × multiplicador de salida; el techo nunca se multiplica. |
| 11 | `BitrateGuard.kt` | 13 081 | Guard de banda v32: lock de variante con medición REAL del `DataSource`, con estados `NO_DATA`/`NO_WINDOW`. |
| 12 | `BitrateMeter.kt` | 1 734 | Mide bytes reales que entran por el `DataSource` en ventana deslizante de 4 s y expone la edad de la muestra. |
| 13 | `BitrateWindow.kt` | 2 259 | Ventana de resolución **pura** (sin Android ni Media3), testeable fuera del APK; único lugar donde se decide pertenencia al window. |
| 14 | `BootReceiver.kt` | 1 154 | Revive el agente tras `BOOT_COMPLETED` / `QUICKBOOT_POWERON` (no en `MY_PACKAGE_REPLACED`). |
| 15 | `BufferPolicy.kt` | 450 | Política de buffer I15: piso 60 %, sin techo; frontera de política/observabilidad. |
| 16 | `CaptureWatchdogService.kt` | 7 253 | Mantiene `MediaProjection` disponible cuando hay un player IPTV en foreground; no recrea el consentimiento en silencio. |
| 17 | `CodecFallbackMatrix.kt` | 4 160 | Matriz de fallback de códec (SSOT con `ape-hevc-cascade.js`), política `BEST_4K_THEN_NATIVE`; solo decide el orden. |
| 18 | `Config.kt` | 9 585 | Configuración persistente + provisión del token por fichero (nunca por `am --es token`); fija `DEFAULT_VPS`. |
| 19 | `DeviceSampler.kt` | 7 173 | Mide lo que el APK puede medir y declara `unavailable` lo que no; `value=null ⟺ prov=unavailable`. |
| 20 | `Display4K.kt` | 1 408 | Fija el modo de display 4K del panel si existe (§7 de este documento). |
| 21 | `EmbeddedKey.kt` | 1 923 | Key de `/sync` cifrada dentro del APK; el propio KDOC lo declara ofuscación, no seguridad fuerte. |
| 22 | `EnrollClient.kt` | 4 243 | Auto-enrolamiento WireGuard: keypair + `POST /ara/enroll` con secreto baked + pubkey, idempotente. |
| 23 | `FeedForwardClient.kt` | 4 124 | Consumidor del bus SSE **device-keyed** del VPS; aplicador puro de `device_settings` por evento. |
| 24 | `GlslEnhancePipeline.kt` | 9 694 | GLSL offscreen (EGL14 pbuffer + FBO): denoise bilateral + unsharp; API conceptual/test, el camino real es media3-effect. |
| 25 | `IDataClient.kt` | 2 271 | Round-trip iData contra `ape-match.php`: sube esperado/real, recibe `{codec, tier, adb_settings}`. |
| 26 | `ImageEnhancer.kt` | 2 187 | Fija valores moderados de mejora en el shader GL del player y refresca el efecto vivo. |
| 27 | `LabMetadataStore.kt` | 2 547 | Aplana toda la metadata LAB en `lab_meta_flat` como `seccion.clave`, sin hardcodear campos. |
| 28 | `LcevcSyntheticPipeline.kt` | 2 491 | "LCEVC sintético": realce de residual por unsharp separable. **No** es V-Nova LCEVC real (lo dice su KDOC). |
| 29 | `ListLoader.kt` | 6 069 | Descarga y parsea la lista en **streaming**, línea a línea; conserva la URL verbatim. |
| 30 | `MainActivity.kt` | 20 231 | Panel ARA: estado, métricas UHD/HDR/VPP, VPS/SSE, entrada de tokens y controles; refresco cada segundo. |
| 31 | `MediaEnhanceApiPipeline.kt` | 1 622 | Motor 5: Media Enhancement API de Google detectada **por reflexión**; hoy `isSupported()=false`. |
| 32 | `MetaMapper.kt` | 2 587 | Aplica solo levers de imagen allowlisted, con clamp; levers desconocidos ignorados. |
| 33 | `MetaReceiver.kt` | 4 191 | Receptor SSE contra `/ara/events` con Bearer; el token lo aporta un provider y nunca se loguea. |
| 34 | `OnboardingFlow.kt` | 4 421 | Máquina de estados idempotente de primer arranque que cablea F1 (AgentService), F2 (self-grant ADB) y F3 (player). |
| 35 | `PlaybackPolicy.kt` | 3 857 | Política 4K-first/no-downscale: 3840×2160, buffer 30/120 s, caché 256 MiB, timeouts 15/30 s. |
| 36 | `PlayerActivity.kt` | 3 219 | Activity del player MVP (HEVC-first) sobre la URL verbatim del intent (§8: efectos por defecto OFF). |
| 37 | `PlayerHub.kt` | 1 601 | Holder del player vivo + perfiles `neutral()`/`profile()` que escriben prefs del shader y refrescan (§7). |
| 38 | `PresetBus.kt` | 1 732 | Bus caliente de presets homologados solo en memoria; mide p50/p95/p99/max y coalesce si p99 > 30 ms. |
| 39 | `PresetHomologator.kt` | 4 587 | Homologa las 41 etiquetas de la directiva ARA a prefs de app + filas `device_settings` allowlisted. |
| 40 | `PresetLedger.kt` | 1 227 | Verdad por preset: `APPLIED` solo si un sink real consumió el valor. |
| 41 | `PresetRouter.kt` | 3 320 | Router real de los 41 tags: marca `APPLIED`/`STORED`/`DECLARED` según exista consumidor. |
| 42 | `PrismaProfile.kt` | 11 092 | Lee y aplica el plan de mejora por perfil (PRISMA) desde `#EXT-X-APE-LAB-METADATA` y `ape-profile`. |
| 43 | `PrivacyOverlayView.kt` | 4 235 | `TextureView` con `setSkipScreenshot`; fail-closed: si falla, `privacyAvailable=false`. |
| 44 | `QoEReporter.kt` | 8 159 | Sube QoE + heartbeats a `conviva-event.php` sin `READ_LOGS`; heartbeat 30 s y `quality_change` bajo demanda. |
| 45 | `ScreenCaptureActivity.kt` | 1 111 | Pide consentimiento de `MediaProjection` y arranca el servicio; no hay captura silenciosa (§6). |
| 46 | `ScreenCaptureService.kt` | 7 475 | Captura con `MediaProjection` a media resolución y **descarta** el fotograma: mide luma/freeze/stalls (§6). |
| 47 | `Secure.kt` | 1 418 | Almacén seguro de secretos: `EncryptedSharedPreferences` API ≥ 23, fallback privado en API 22. |
| 48 | `SelfUpdateManager.kt` | 6 024 | Auto-update: `/ara/version` → `/ara/agent.apk`, con SHA-256 **y pin de firma**, fail-closed. |
| 49 | `SettingsApplier.kt` | 17 626 | **Aplicador puro** de `device_settings` del VPS con allowlist estricta + regex (§5). |
| 50 | `SettingsCatalog.kt` | 1 633 | Catálogo (10 global + 3 secure + 0 system) y `KeyGuard` de permisos de escritura (§5). |
| 51 | `ShimBridge.kt` | 5 511 | Puente ARA ⇄ `:shim` (ottshim); arranque manual y explícito, no mejora la imagen por sí solo. |
| 52 | `SseTestActivity.kt` | 2 520 | Activity **test-only**: lee `sse_token` de `/sdcard/ape`, arranca SSE y muestra overlay rojo. |
| 53 | `StatePublisher.kt` | 2 788 | Publica el estado real del clasificador a `/ara/state`; nunca inventa confianza. |
| 54 | `StatsDataSource.kt` | 1 118 | `DataSource` de paso que cuenta bytes antes de entregarlos al parser HLS. |
| 55 | `SyncClient.kt` | 13 201 | Transporte y validación de `/sync` (D3 v2): firma, envía y valida `ARA-X-SYNC-RESP-V1`; no aplica nada. |
| 56 | `SyncLoop.kt` | 12 430 | Lazo `/sync` de 30 s, offline-first, con backoff y `Result` tipado; nunca lanza. |
| 57 | `SyncProtocol.kt` | 16 487 | Contrato `/sync` v2 en Kotlin **puro**: canonicalización, HMAC-SHA256, request y `state.apply`. |
| 58 | `SyncStore.kt` | 4 328 | Persistencia `/sync`: last-known-good + `seq` + safe defaults de D4. |
| 59 | `TfliteInferenceEngine.kt` | 5 030 | Wrapper TFLite con GPU delegate (fallback CPU), 1 o 2 entradas, resize dinámico por frame. |
| 60 | `TokenVaultClient.kt` | 3 086 | Token vault cifrado en el VPS; auth siempre Bearer de eventos, nunca el token de estado. |
| 61 | `UltraEnhancePipeline.kt` | 11 280 | Orquestador de motores de mejora on-device (motores 1–5) + plan PRISMA (§8). |
| 62 | `WireGuardManager.kt` | 2 436 | WireGuard embebido (`GoBackend` sobre `VpnService`), full-tunnel `0.0.0.0/0` + DNS `10.200.0.1`. |
| 63 | `ZapReceiver.kt` | 875 | Señal de zap local y no invasiva; **nunca** controla la reproducción. |
| 64 | `AraAccessibilityService.kt` | 980 | Sensor foreground de fallback del capture watchdog: observa `TYPE_WINDOW_STATE_CHANGED` y **no** lee contenido de ventanas. |

**Verificación de integridad de la tabla:** 64 filas; suma de bytes = 339 094 B (comando en §0.2).

### 1.3 Los 19 ficheros `.java` (también dentro del APK)

| # | Fichero | Bytes | Qué hace |
|---:|---|---:|---|
| 1 | `crystalagent/JitLinkActivity.java` | 10 277 | Pantalla "REA · Catálogo JIT": lee `GET /jit/api/config`, copia las URLs de catálogo y abre OTT. **No** registra el proveedor en OTT. |
| 2 | `fluid/CrystalGlEffect.java` | 9 924 | `GlEffect` de realce espacial SDR con escalado GPU acotado y preserve de aspecto; en HDR hace passthrough. |
| 3 | `fluid/FluidBridge.java` | 39 880 | Puente de integración con el player: sesiones, caché de disco, decoder fallback y composición de efectos (`effects()` en línea 122). |
| 4 | `fluid/FluidControlClient.java` | 5 150 | Control HTTPS opcional (`POST /api/v1/telemetry`); un fallo de red nunca bloquea el hilo del player. |
| 5 | `fluid/FluidHomeActivity.java` | 27 737 | UI local de configuración y entrada a reproducción; nunca arranca el servicio base. |
| 6 | `fluid/FluidStore.java` | 8 645 | Prefs privadas + registro de fuentes por canal; ninguna URL de fuente entra en telemetría. |
| 7 | `fluid/core/FluidPolicy.java` | 11 986 | Lógica de selección **pura** con reloj monotónico (`SELECTED`/`KEEP_CURRENT`/`NO_SAFE_CANDIDATE`). |
| 8 | `fluid/core/PlaybackGuard.java` | 11 613 | Watchdog del player independiente de callbacks de render; no descarga, no cambia canal, no ejecuta acciones. |
| 9 | `rea/ReaAdaptiveEffect.java` | 14 768 | Reconstrucción espacial adaptativa media3 1.3.1; precondición HDR lineal BT.2020 PQ; no inventa capacidad HDR. |
| 10 | `rea/ReaBridge.java` | 20 899 | Integración para el player APE en foreground; las peticiones de fuente siguen siendo del APE. |
| 11 | `rea/ReaExternalPlayerActivity.java` | 6 714 | Recibe la fuente delegada por el "reproductor externo" de OTT; **rechaza** cualquier extra de DRM/licencia. |
| 12 | `rea/ReaExternalRequest.java` | 7 685 | Normalización pura de la petición; nunca decodifica/re-codifica una URI firmada. |
| 13 | `rea/ReaHdrBridge.java` | 10 750 | SDR → FP16 lineal BT.2020 → OETF PQ nativa; la salida real exige device físico. |
| 14 | `rea/ReaLoadGovernor.java` | 3 174 | Política adaptativa por pérdida real de frames y estado térmico, no por tiempo de GPU ficticio. |
| 15 | `rea/ReaMediaSources.java` | 3 642 | Adaptador exacto media3 1.3.1: caché HLS solo para chunks HLS. |
| 16 | `rea/ReaOttBridge.java` | 5 502 | Observa la `MediaSession` de OTT (`studio.scillarium.ottnavigator`); **nunca** recibe frames de vídeo de otra app. |
| 17 | `rea/ReaPlaybackSession.java` | 2 793 | `MediaSession` del renderer propio del ARA, no del pipeline de píxeles de OTT. |
| 18 | `rea/ReaState.java` | 1 678 | Controles compartidos del renderer; los tiempos de CPU no son tiempos de GPU. |
| 19 | `rea/ReaUi.java` | 7 741 | Controles nativos Android/TV; la UI y los ajustes existentes siguen usables. |

### 1.4 Módulo `:shim` — fuente **fuera** de este árbol

`settings.gradle.kts:16-19` incluye dos módulos (`:app`, `:shim`). El módulo `:shim` **no copia** fuentes:

```kotlin
// shim/build.gradle.kts:37
sourceSets["main"].kotlin.srcDir("../../../../ottshim/app/src/main/kotlin")
```

Resuelto con `[System.IO.Path]::GetFullPath` desde `…/ape-crystal-agent/shim` →
**`C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\ottshim\app\src\main\kotlin`** (existe = `True`).

Contenido real de esa fuente externa (11 ficheros, paquete `dev.venice.ottshim`):

| Fichero | Bytes |
|---|---:|
| `LoopbackProxy.kt` | 23 169 |
| `QoeEngine.kt` | 13 870 |
| `ProxyService.kt` | 5 706 |
| `Rewriter.kt` | 4 504 |
| `SessionTap.kt` | 4 387 |
| `MainActivity.kt` | 3 432 |
| `AbrPolicy.kt` | 2 329 |
| `QoeSources.kt` | 1 162 |
| `SegmentMeter.kt` | 1 123 |
| `TokenBucket.kt` | 786 |
| `Log.kt` | 201 |

`shim/build.gradle.kts:22` fija `namespace = "dev.venice.ottshim"` y `:26-27` `minSdk = 22`.
`shim/src/main/AndroidManifest.xml` declara **solo dos services**: `dev.venice.ottshim.ProxyService` (líneas 19-22, `exported=false`, `foregroundServiceType=dataSync`) y `dev.venice.ottshim.SessionTap` (líneas 25-31, `exported=true` + `BIND_NOTIFICATION_LISTENER_SERVICE`). El comentario del manifiesto (líneas 2-14) explica que **no** se mergean la `MainActivity` ni los atributos de `<application>` de ottshim para no duplicar icono/tema.

`app/build.gradle.kts:113` → `implementation(project(":shim"))`: el shim **entra dentro del mismo APK**, sin segundo install.

### 1.5 Assets y recursos

| Asset | Bytes | Naturaleza |
|---|---:|---|
| `assets/car_denoise_f32.tflite` | 1 676 | Pesos fijos **baseline** (gaussiana low-pass), **no** red entrenada |
| `assets/sr_unsharp_f32.tflite` | 1 580 | Pesos fijos **baseline** (unsharp), **no** red entrenada |
| `assets/rife_blend_f32.tflite` | 1 484 | Pesos fijos **baseline** (blend lineal), **no** red entrenada |
| `assets/shaders/ape_enhance_fragment.glsl` | 2 483 | Shader de realce |
| `assets/shaders/ape_vertex.glsl` | 273 | Vertex shader |
| `assets/shaders/crystal_uhd_fragment.glsl` | 6 038 | Shader Crystal UHD |
| `assets/shaders/rea_adaptive.glsl` | 5 133 | Shader REA adaptativo |
| `assets/shaders/rea_sdr_to_hdr_external.glsl` | 1 485 | Shader SDR→HDR externo |
| `assets/shaders/rea_vertex.glsl` | 257 | Vertex shader REA |
| `res/xml/ara_accessibility.xml` | 433 | `canRetrieveWindowContent="false"`, solo `typeWindowStateChanged` |
| `res/xml/provider_paths.xml` | 103 | Rutas del `FileProvider` del self-update |
| `res/values/strings.xml` | 198 | Descripción del servicio de accesibilidad |

La calificación de los `.tflite` como *baseline de pesos fijos* **no es interpretación**: está escrita por el propio autor en `UltraEnhancePipeline.kt:16-18` y `PrismaProfile.kt` (KDOC: "Los `.tflite` son baseline de pesos fijos (no CNNs entrenadas)"). El generador de esos modelos es `tools/build_ape_models.py` (4 615 B).

---

## 2. Componentes declarados en `AndroidManifest.xml`

`AndroidManifest.xml` tiene **180 líneas** y **8 861 B**. No declara atributo `package=`; el namespace y el `applicationId` vienen de `app/build.gradle.kts:22` y `:26` (`com.ape.crystalagent`).

### 2.1 Tabla de componentes

| Tipo | `android:name` | Línea | `exported` | Detalle |
|---|---|---:|---|---|
| Activity | `.MainActivity` | 39-47 | **true** | `MAIN` + `LAUNCHER` + `LEANBACK_LAUNCHER` (Fire TV) |
| Activity | `.PlayerActivity` | 50-54 | **true** | `launchMode=singleTask`; el comentario de línea 49 dice que está exportada "para test por adb `am start`" |
| Activity | `com.ape.crystalagent.JitLinkActivity` | 71-77 | **true** | "REA · Catálogo JIT", `singleTop`, sin icono propio (líneas 67-70) |
| Activity | `com.ape.rea.ReaExternalPlayerActivity` | 79-96 | **true** | `singleTask` + `intent-filter` `VIEW` con `http`,`https`,`application/x-mpegURL`,`application/vnd.apple.mpegurl`,`video/*`,`audio/*` |
| Activity | `.ScreenCaptureActivity` | 102-104 | **true** | Pide consentimiento de captura |
| Activity | `.SseTestActivity` | 106-108 | **true** | Test-only |
| Service | `.AgentService` | 98-100 | false | Daemon foreground |
| Service | `.ScreenCaptureService` | 110-113 | false | `foregroundServiceType="mediaProjection"` |
| Service | `.CaptureWatchdogService` | 115-118 | false | `foregroundServiceType="dataSync"` |
| Service | `.AraAccessibilityService` | 120-130 | **true** + `permission=BIND_ACCESSIBILITY_SERVICE` | Accesibilidad; `meta-data` → `@xml/ara_accessibility` |
| Service | `com.wireguard.android.backend.GoBackend$VpnService` | 171-178 | false + `permission=BIND_VPN_SERVICE` | VpnService del WG embebido |
| Receiver | `.ZapReceiver` | 132-138 | **true** | acción `com.ape.crystalagent.ZAP` |
| Receiver | `.BootReceiver` | 140-148 | **true** | `BOOT_COMPLETED`, `QUICKBOOT_POWERON`, `MY_PACKAGE_REPLACED` |
| Receiver | `.AbTestReceiver` | 151-157 | **true** | acción `com.ape.crystalagent.AB` |
| Provider | `androidx.core.content.FileProvider` | 160-168 | **false** + `grantUriPermissions=true` | `authorities="${applicationId}.provider"` para el self-update |

**Etiquetas `<queries>`:** 0 ocurrencias en el fichero (verificado leyendo las 180 líneas).

**`<uses-feature>`:** `android.hardware.touchscreen` `required=false` (línea 21) y `android.software.leanback` `required=false` (línea 22) — Fire TV no tiene pantalla táctil.

**Comportamiento de `<application>` (líneas 34-37):** `allowBackup="false"`, **`usesCleartextTraffic="true"`**, `label="APE Crystal Agent"`. **No** declara `android:icon` a propósito: el comentario de líneas 24-33 documenta que `@android:drawable/*` no resuelve en el framework del dispositivo y hacía fallar la instalación (`PackageManager` rechaza el paquete) — medido el 2026-11-07 sobre los 19 APK del repo.

### 2.2 Componentes efectivamente presentes en el APK instalado (medido)

`adb shell dumpsys package com.ape.crystalagent` → tablas de resolución. Las tablas de resolución **solo listan componentes con `intent-filter`**; la ausencia de un componente sin filtro en estas tablas no prueba su ausencia (fail-honest).

Medido presente:

```
com.ape.crystalagent/.MainActivity filter f0531c4
com.ape.crystalagent/com.ape.rea.ReaExternalPlayerActivity filter 2f567e2
com.ape.crystalagent/com.ape.rea.ReaExternalPlayerActivity
com.ape.crystalagent/.ZapReceiver filter c05a630
com.ape.crystalagent/.BootReceiver filter 286202e
com.ape.crystalagent/.AbTestReceiver filter 556f55c
com.ape.crystalagent/.AraAccessibilityService filter 58113a permission android.permission.BIND_ACCESSIBILITY_SERVICE
com.ape.crystalagent/com.wireguard.android.backend.GoBackend$VpnService filter d0c0b48 permission android.permission.BIND_VPN_SERVICE
com.ape.crystalagent/dev.venice.ottshim.SessionTap filter 260706 permission android.permission.BIND_NOTIFICATION_LISTENER_SERVICE
com.ape.crystalagent/androidx.core.content.FileProvider
```

> **Hallazgo relevante:** `dev.venice.ottshim.SessionTap` está presente en el APK instalado (verificado también por el comando del §0.3). Esto **prueba** que el módulo `:shim` está compilado dentro de la APK, aunque su fuente viva fuera de este árbol (§1.4).
> `ProxyService` **NO COMPUTADO** por esta vía: no tiene `intent-filter`, por lo que no aparece en la tabla de resolución; su presencia en el APK instalado requeriría inspeccionar el DEX o el manifiesto fusionado del APK.

---

## 3. Permisos

### 3.1 Declarados en `AndroidManifest.xml` (11 `<uses-permission>`)

| # | Permiso | Línea | Comentario en el manifiesto |
|---:|---|---:|---|
| 1 | `android.permission.INTERNET` | 4 | — |
| 2 | `android.permission.ACCESS_NETWORK_STATE` | 5 | — |
| 3 | `android.permission.RECEIVE_BOOT_COMPLETED` | 6 | — |
| 4 | `android.permission.PACKAGE_USAGE_STATS` | 7 | — |
| 5 | `android.permission.GET_TASKS` | 8 | — |
| 6 | `android.permission.FOREGROUND_SERVICE` | 9 | — |
| 7 | `android.permission.FOREGROUND_SERVICE_DATA_SYNC` | 10 | — |
| 8 | `android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION` | 11 | — |
| 9 | `android.permission.SYSTEM_ALERT_WINDOW` | 12 | — |
| 10 | `android.permission.WRITE_SECURE_SETTINGS` | 16 | Líneas 13-15: "aplicador puro: **NO** lee logs (no `READ_LOGS`)"; concedible por `adb shell pm grant` |
| 11 | `android.permission.REQUEST_INSTALL_PACKAGES` | 18 | Self-update desde `/ara/agent.apk` con consentimiento 1 vez |

### 3.2 Permisos **fusionados** en el APK (21) — medido

`requested permissions:` del `dumpsys` del APK instalado. A los 11 anteriores se suman 10 por *manifest merging* de librerías (media3 / androidx / WireGuard):

```
android.permission.INTERNET
android.permission.ACCESS_NETWORK_STATE
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.PACKAGE_USAGE_STATS
android.permission.GET_TASKS
android.permission.FOREGROUND_SERVICE
android.permission.FOREGROUND_SERVICE_DATA_SYNC
android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION
android.permission.SYSTEM_ALERT_WINDOW
android.permission.WRITE_SECURE_SETTINGS
android.permission.REQUEST_INSTALL_PACKAGES
com.ape.crystalagent.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION   ← fusionado
android.permission.WRITE_EXTERNAL_STORAGE                        ← fusionado
android.permission.READ_PHONE_STATE                              ← fusionado
android.permission.READ_EXTERNAL_STORAGE                         ← fusionado
android.permission.POST_NOTIFICATIONS                            ← fusionado
android.permission.ACCESS_MEDIA_LOCATION                         ← fusionado
android.permission.READ_MEDIA_AUDIO                              ← fusionado
android.permission.READ_MEDIA_VIDEO                              ← fusionado
android.permission.READ_MEDIA_IMAGES                             ← fusionado
android.permission.READ_MEDIA_VISUAL_USER_SELECTED                ← fusionado
```

Coincide con el comentario de `shim/src/main/AndroidManifest.xml:11-13` ("los permisos se declaran en el manifest de ARA: en un AAR el merger los combina").

### 3.3 Estado de concesión **real** en el dispositivo (medido)

| Permiso | Concedido | Artefacto |
|---|---|---|
| `WRITE_SECURE_SETTINGS` | **true** *(userId 0)* · **false** en `userId=10` | `dumpsys package` → `android.permission.WRITE_SECURE_SETTINGS: granted=true` / `…: granted=false, userId=10` |
| `SYSTEM_ALERT_WINDOW` | **false** | `dumpsys package` → `android.permission.SYSTEM_ALERT_WINDOW: granted=false` |
| `INTERNET` | true | idem |
| `ACCESS_NETWORK_STATE` | true | idem |
| `RECEIVE_BOOT_COMPLETED` | true | idem |
| `GET_TASKS` | true | idem |
| `FOREGROUND_SERVICE` | true | idem |
| `FOREGROUND_SERVICE_DATA_SYNC` | true | idem |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | true | idem |
| `PACKAGE_USAGE_STATS` | **false** | idem |
| `REQUEST_INSTALL_PACKAGES` | **false** | idem |
| `POST_NOTIFICATIONS` (runtime) | true | `dumpsys` sección `runtime permissions` |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_PHONE_STATE`, `READ_MEDIA_*`, `ACCESS_MEDIA_LOCATION` | todas **false** | idem |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | true | idem |

**Concordancia con el dato aportado por el operador:** `WRITE_SECURE_SETTINGS = granted TRUE` y `SYSTEM_ALERT_WINDOW = granted FALSE` — **confirmados por medición propia**, no asumidos.

**Matiz fail-honest sobre `WRITE_SECURE_SETTINGS`:** el `dumpsys` muestra **dos** líneas — `granted=true` (usuario 0, el usuario real del device) y `granted=false, userId=10` (perfil de trabajo / usuario secundario). En user 0 el permiso **sí** está concedido. La app opera en user 0 (ver `User 0: ceDataInode=311125 installed=true`).

**Consecuencia operativa medida:** `SettingsApplier` solo puede escribir con `KeyGuard.writable(...)` (`SettingsCatalog.kt:43-48`). Con `WRITE_SECURE_SETTINGS=true` en user 0, `secure` y `global` son escribibles; **nada depende** de `SYSTEM_ALERT_WINDOW` (no hay overlay de sistema en el camino del aplicador — el único overlay es `PrivacyOverlayView`, usado por `SseTestActivity`, que es test-only).

### 3.4 Estado de los servicios privilegiados (medido)

| Servicio | Estado | Artefacto |
|---|---|---|
| `AraAccessibilityService` | **NO habilitado** | `settings get secure enabled_accessibility_services` → `null` |
| `dev.venice.ottshim.SessionTap` (notification listener) | **NO habilitado** (solo el listener del launcher) | `settings get secure enabled_notification_listeners` → `com.google.android.apps.tv.launcherx/…TvNotificationListenerService` |

> Esto es un dato duro: el sensor de accesibilidad y el `SessionTap` del shim **están declarados y compilados pero no activados** en este device. Cualquier afirmación de que "el ARA lee la posición del player de OTT" es **falsa hoy en este dispositivo**.

---

## 4. Agrupación por subsistema

Cada fichero aparece en su **subsistema primario**. Los `.java` se incluyen donde son parte del mecanismo.

### 4.1 Captura / medición

| Fichero | Rol |
|---|---|
| `ScreenCaptureService.kt` | Mide el frame compuesto con `MediaProjection` y lo descarta (§6) |
| `ScreenCaptureActivity.kt` | Pide el consentimiento (`createScreenCaptureIntent`) |
| `CaptureWatchdogService.kt` | Mantiene la captura disponible cuando hay player en foreground |
| `AraAccessibilityService.kt` | Sensor de paquete en foco por accesibilidad (`canRetrieveWindowContent="false"`) |
| `ZapReceiver.kt` | Token de zap local (`zap-<epoch>`) sin controlar reproducción |
| `PrivacyOverlayView.kt` | Overlay con `setSkipScreenshot` fail-closed |
| `DeviceSampler.kt` | Puente de features del device; `null` ⇔ `unavailable` |
| `AraStatus.kt` | Estado compartido que consume el panel |

**Qué hace el subsistema:** observa **el display compuesto**, no el buffer privado de otro player (`ScreenCaptureService.kt:22-25`). No usa root, DRM ni hooks. Con la accesibilidad **desactivada** (§3.4), la detección de foreground depende de `UsageStats`, que con `PACKAGE_USAGE_STATS=false` (§3.3) tampoco está disponible: el watchdog arranca pero su detección primaria queda degradada — **NO COMPUTADO** cuál de los dos caminos opera realmente en este device.

### 4.2 Aplicación de ajustes

| Fichero | Rol |
|---|---|
| `SettingsApplier.kt` | Aplicador puro con allowlist + regex (§5) |
| `SettingsCatalog.kt` | Catálogo de claves + `KeyGuard` (§5) |
| `AgentService.kt` | Orquesta la pasada: `ds + SAFE_ROWS + hom.androidSettings` → `applier.apply(rows)` (`AgentService.kt:105-106`) |
| `PresetHomologator.kt` | Homologa 41 tags → prefs + filas Android reales |
| `PresetRouter.kt` | Router de tags con verdad `APPLIED`/`STORED`/`DECLARED` |
| `PresetLedger.kt` | Ledger de verdad por preset |
| `PresetBus.kt` | Bus caliente en memoria con percentiles |
| `MetaMapper.kt` | Aplica levers de imagen allowlisted con clamp |
| `LabMetadataStore.kt` | Aplana la metadata LAB para consulta por clave |

**Qué hace el subsistema:** recibe el contrato `device_settings` (`"<ns> <key> <val>"`) del VPS por SSE y lo escribe en Android Settings **solo si está allowlisted y el valor pasa su regex**. Es el único camino por el que el VPS influye en el hardware.

### 4.3 Player

| Fichero | Rol |
|---|---|
| `ApePlayer.kt` | ExoPlayer propio: HEVC-first, 4K-first, no-downscale, decoder fallback |
| `PlayerActivity.kt` | Activity del player (§7, §8) |
| `PlayerHub.kt` | Holder del player + perfiles on/off (§7) |
| `Display4K.kt` | Fija el modo de display 4K (§7) |
| `PlaybackPolicy.kt` | Política canónica 4K-first (3840×2160, 30/120 s, 256 MiB, 15/30 s) |
| `CodecFallbackMatrix.kt` | Orden de fallback `BEST_4K_THEN_NATIVE` |
| `BitrateGuard.kt` / `BitrateMeter.kt` / `BitrateWindow.kt` / `BitrateConfig.kt` | Banda y lock de variante con medición real |
| `BufferPolicy.kt` | Piso de buffer 60 % |
| `StatsDataSource.kt` | Contador de bytes en el `DataSource` |
| `ListLoader.kt` | Parser M3U en streaming |

**Verificado:** la selección es `setMaxVideoSize` + `setAllowVideoMixedMimeTypeAdaptiveness(false)` (`ApePlayer.kt:91-94`), y el "lock" a la mayor resolución real está en `ApePlayer.kt:341-345`.

### 4.4 Efectos / GL

| Fichero | Rol |
|---|---|
| `UltraEnhancePipeline.kt` | Orquestador de motores 1–5 + PRISMA (§8) |
| `ApeUltraEnhanceGlEffect.kt` | Efecto media3 GPU-directo sobre cada frame propio |
| `GlslEnhancePipeline.kt` | GLSL offscreen EGL14+FBO (camino test) |
| `TfliteInferenceEngine.kt` | Wrapper TFLite GPU/CPU |
| `LcevcSyntheticPipeline.kt` | Residual sintético (no LCEVC real) |
| `MediaEnhanceApiPipeline.kt` | Motor 5 por reflexión, hoy no soportado |
| `PrismaProfile.kt` | Plan por perfil: qué carril se enciende |
| `ImageEnhancer.kt` | Perfiles moderados sobre el shader del player |
| `fluid/CrystalGlEffect.java` | Efecto compuesto que hoy se instala en el player |
| `fluid/FluidBridge.java` | Compone la lista de efectos (`effects()` línea 122) |
| `rea/ReaAdaptiveEffect.java`, `rea/ReaHdrBridge.java` | Efectos REA (adaptativo / SDR→PQ) |

Ver §8 para el **estado medido** (OFF por defecto y pantalla negra documentada en el propio código).

### 4.5 Red / SSE

| Fichero | Rol |
|---|---|
| `FeedForwardClient.kt` | SSE device-keyed (`ape-feedforward-stream.php`) |
| `MetaReceiver.kt` | SSE contra `/ara/events` |
| `SyncClient.kt` | Transporte + validación de `/sync` |
| `SyncLoop.kt` | Lazo de 30 s offline-first |
| `SyncProtocol.kt` | HMAC/canonical del contrato v2 |
| `SyncStore.kt` | Last-known-good + `seq` |
| `IDataClient.kt` | Ida/vuelta iData (`ape-match.php`) |

### 4.6 Registro / enrolamiento

| Fichero | Rol |
|---|---|
| `EnrollClient.kt` | `POST /ara/enroll`, idempotente |
| `EmbeddedKey.kt` | Key de `/sync` en el APK (ofuscación) |
| `Config.kt` | Persistencia, provisión por fichero, `DEFAULT_VPS` |
| `AraDeviceId.kt` | Identidad del device |
| `Secure.kt` | Keystore / prefs privadas |
| `OnboardingFlow.kt` | Máquina de estados de primer arranque (F1/F2/F3) |
| `SelfUpdateManager.kt` | `/ara/version` + `/ara/agent.apk` con sha256 + pin de firma |
| `WireGuardManager.kt` | Túnel embebido (hoy gobernado por `cfg.useWg`) |

`AgentService.kt:71-83` deja constancia medible de la decisión vigente: **el túnel WG se intenta solo si `cfg.useWg`**; en caso contrario registra `"WG DESACTIVADO (modo directo HTTPS/SSE)"`.

### 4.7 Token vault

| Fichero | Rol |
|---|---|
| `TokenVaultClient.kt` | Respaldo cifrado AES-256-GCM en el VPS (`/prisma/api/token-vault.php`) |
| `Config.kt` | Ingesta del token por fichero (`dataDir` 0600 o `/sdcard/ape/token`), nunca por `argv` |
| `MainActivity.kt` | Entrada de Bearer y SSE token separados; exige que sean **distintos** (`MainActivity.kt:86`) |
| `ScreenCaptureService.kt` | Dispara `restoreIfMissing` + `backup` al arrancar la captura (`:54-58`) |

### 4.8 ADB

| Fichero | Rol |
|---|---|
| `AdbSelfGrantManager.kt` | `pair → connect localhost → pm grant` a sí mismo (estilo Shizuku, sin PC) |
| `OnboardingFlow.kt` | Cablea F2 (`selfGrant`) — el KDOC advierte que estaba "HOY SIN CALLER" y que lo cablea el onboarding |

**Honesto:** los *toggles* de "Opciones de desarrollador" y "Depuración inalámbrica" los pone el **usuario**; Android no permite activarlos por código (`AdbSelfGrantManager.kt` KDOC). En este device `WRITE_SECURE_SETTINGS` **ya está concedido** (§3.3), por lo que el self-grant no es necesario para operar.

### 4.9 Telemetría

| Fichero | Rol |
|---|---|
| `QoEReporter.kt` | Heartbeat 30 s + `quality_change` a `conviva-event.php` |
| `StatePublisher.kt` | Publica estado del clasificador a `/ara/state` (throttle 500 ms) |
| `AraStatus.kt` | Estado en memoria que se reporta |
| `DeviceSampler.kt` | Capacidades del device |
| `IDataClient.kt` | Telemetría de codec real vs esperado |
| `ScreenCaptureService.kt` | Fuente de las métricas de captura (`:152-154`, publica cada 5 frames) |

**Regla dura del subsistema:** no hay `READ_LOGS` (no concedible a una app sideloaded) — lo declara `AndroidManifest.xml:13-15` y `QoEReporter.kt` KDOC.

### 4.10 (extra) Player externo REA / OTT

| Fichero | Rol |
|---|---|
| `rea/ReaExternalPlayerActivity.java` | Aparece en el selector "abrir en reproductor externo"; rechaza extras de DRM |
| `rea/ReaExternalRequest.java` | Normaliza cabeceras y URI firmada sin re-codificar |
| `rea/ReaOttBridge.java` | Lee **solo** metadata/control de la `MediaSession` de `studio.scillarium.ottnavigator` |
| `rea/ReaPlaybackSession.java` | Publica la `MediaSession` del renderer propio |
| `rea/ReaMediaSources.java` | HLS/DASH con caché solo en chunks HLS |
| `rea/ReaBridge.java`, `rea/ReaState.java`, `rea/ReaUi.java`, `rea/ReaLoadGovernor.java`, `rea/ReaAdaptiveEffect.java`, `rea/ReaHdrBridge.java` | Integración, estado, UI, gobernador de carga y efectos |
| `crystalagent/JitLinkActivity.java` | Catálogo JIT (`GET /jit/api/config`) |
| `fluid/*` (7 ficheros) | Player "fluid": política pura, guard, store, bridge, control, home |

**Límite arquitectónico escrito en el código:** `ReaOttBridge.java` (KDOC) — "MediaSession observes metadata/control only. It **never receives another app's video frames**."

### 4.11 (extra) Shim / proxy loopback

| Fichero | Rol |
|---|---|
| `ShimBridge.kt` | Puente ARA ⇄ `:shim`, arranque manual |
| `:shim` (11 `.kt` externos) | `LoopbackProxy`, `ProxyService`, `QoeEngine`, `Rewriter`, `SessionTap`, `AbrPolicy`, etc. |

---

## 5. `SettingsApplier.kt` + `SettingsCatalog.kt` + `KeyGuard` — el aplicador puro

### 5.1 Contrato declarado

`SettingsApplier.kt:8-18` (KDOC literal):

> *APLICADOR PURO. Escribe el subconjunto de Android Settings que el VPS dicta (device_settings). NO observa, NO cambia canales, NO abre apps. Solo aplica lo que llega.*
> *SEGURIDAD: ALLOWLIST estricta — solo (ns,key) doctrinales + valor validado por regex. Cualquier cosa fuera de la lista se RECHAZA y se loggea, de modo que el VPS NO puede escribir settings arbitrarios pese a tener el device WRITE_SECURE_SETTINGS.*

Cadena de entrada: `AgentService.kt:94-114` recibe el SSE → `PresetHomologator.apply(...)` (`:103`) → `rows = (ds + SyncStore.SAFE_ROWS + hom.androidSettings).distinct()` (`:105`) → `applier.apply(rows)` (`:106`).

### 5.2 Formato de fila y parseo

- Formato: `"<ns> <key> <val>"` (`SettingsApplier.kt:30`).
- Parseo: `s.trim().split(Regex("\\s+"), limit = 3)` (`:38`); si no hay exactamente 3 partes → **rechazo** (`:39`).
- Orden físico de aplicación (`:37` + `orderOf` `:102-115`): `display_size_forced`=0 → `display_density_forced`=1 → `user_preferred_refresh_rate`=2 → `hdr*`=3 → `pq_`/`db_id_pq`=4 → `audio`=5 → `db_id_*`=6 → `resolution`=7 → resto 90. Razón escrita en `:36`: *"el cambio de tamaño/densidad recrea el surface; va primero"*.

### 5.3 Las **dos** allowlists (discrepancia medida con el enunciado)

El enunciado de la tarea describe "allowlist de 13 claves (10 global + 3 secure + 0 system)". **Medido: eso es el catálogo, no la allowlist operativa.**

**A) `SettingsCatalog.known` (`SettingsCatalog.kt:12-31`) = 13 claves**

| Ns | N | Claves |
|---|---:|---|
| `global` | **10** | `hdr_conversion_mode`, `hdr_force_conversion_type`, `user_preferred_resolution_width`, `user_preferred_resolution_height`, `user_preferred_refresh_rate`, `are_user_disabled_hdr_formats_allowed`, `user_disabled_hdr_formats`, `display_size_forced`, `db_id_audio_drc_mode`, `db_id_droidlogic_audio_digital_mode` |
| `secure` | **3** | `match_content_frame_rate`, `minimal_post_processing_allowed`, `display_density_forced` |
| `system` | **0** | `emptySet()` (`SettingsCatalog.kt:30`) |

Uso: `isKnown(ns,key)` (`SettingsCatalog.kt:33`) — condición de **existencia declarada**, no de escritura.

**B) `SettingsApplier.ALLOW_KEY` (`SettingsApplier.kt:237-296`) = 42 claves con regex**

Conteo exacto por comando (`Select-String -Pattern 'to Regex\('` sobre el fichero → `42`):

| Grupo | N | Claves |
|---|---:|---|
| frame-rate / post-proceso / color | 10 | `match_content_frame_rate`, `minimal_post_processing_allowed`, `display_size_forced`, `display_density_forced`, `user_preferred_refresh_rate`, `are_user_disabled_hdr_formats_allowed`, `user_disabled_hdr_formats`, `db_id_audio_drc_mode`, `db_id_droidlogic_audio_digital_mode`, `display_color_mode` |
| HDR display-driven | 6 | `hdr_conversion_mode`, `hdr_force_conversion_type`, `hdr_output_type`, `always_hdr`, `hdr_brightness_boost`, `sdr_brightness_in_hdr` |
| AI Super-Resolution | 4 | `ai_sr_level`, `ai_sr_mode`, `aisr_enable`, `pq_ai_sr_enable` |
| AI Picture Quality | 5 | `ai_pq_mode`, `ai_pic_mode`, `aipq_enable`, `pq_ai_dnr_enable`, `pq_ai_fbc_enable` |
| PQ sharpness/denoise/HDR | 5 | `pq_sharpness_enable`, `pq_dnr_enable`, `pq_nr_enable`, `pq_hdr_enable`, `pq_hdr_mode` |
| Formato de salida SoC | 6 | `color_depth`, `hdmi_color_space`, `color_mode_ycbcr422`, `hdr_bit_depth`, `user_preferred_resolution_height`, `user_preferred_resolution_width` |
| Fire TV / Amazon (MT8696) | 6 | `com.amazon.tv.motion_smoothness`, `com.amazon.tv.picture_sharpness`, `com.amazon.tv.dynamic_contrast`, `com.amazon.tv.picture_mode`, `com.amazon.tv.noise_reduction`, `com.amazon.tv.color_temperature` |

> **Discrepancia reportada, no silenciada:** el comentario del propio código (`SettingsApplier.kt:229-236`) documenta que la allowlist se **expandió el 2026-06-18** al "set COMPLETO del VPP MediaTek MT8696 (AI-SR + AI-PQ + sharpness/denoise + HDR display-driven)" y el **2026-11-05** se añadieron las 6 claves `com.amazon.tv.*` para Fire TV. El "13 (10/3/0)" describe el **catálogo**; la superficie real de escritura son **42 claves**. Cualquier auditoría de seguridad debe usar 42, no 13.

### 5.4 Validación por regex

`isAllowed(ns, key, value)` (`SettingsApplier.kt:127-130`):

```kotlin
val rx = ALLOW_KEY[key] ?: return false
return rx.matches(value)
```

- El **ns no participa** en la decisión (`:126` lo documenta: *"Allowlist por KEY (cualquier ns): el ns real del lever varia por SoC"*). El `ns` del VPS es un **hint**.
- Validación por **coincidencia completa** (`matches`, no `contains`).
- Ejemplos de regex medidos: `^[012]$` (`match_content_frame_rate`, `:239`), `^[0-9]{3,5}x[0-9]{3,5}$` (`display_size_forced`, `:241`), `^[0-3]$` (`ai_sr_level`, `:257`), `^(8|10|12)$` (`color_depth`, `:274`), `^(cool|normal|warm)$` (`com.amazon.tv.color_temperature`, `:295`), `^$` (`user_disabled_hdr_formats` — **solo cadena vacía**, `:245`).

### 5.5 Rechazo y log de lo no allowlisted

```kotlin
// SettingsApplier.kt:41-43
if (!isAllowed(ns, key, value)) {
    Log.w(TAG, "RECHAZADO (no allowlist o valor inválido): $ns/$key=$value"); rejected.add(s); continue
}
```

`TAG = "ApeSettingsApplier"` (`:198`). El rechazo se **cuenta** y se **reporta**: `ApplyReport(applied, rejected)` (`:28`), `lastApplied`/`lastRejected` (`:22-23`), `AraStatus.lastApplied/lastRejected` (`:60-61`), y el ack de `/sync` (`SyncLoop.kt:233`). Log final por pasada: `"device_settings aplicados=${applied.size} rechazados=${rejected.size}"` (`:58`).

### 5.6 Idempotencia y guardas

| Guarda | Línea | Efecto |
|---|---|---|
| Caché `lastWritten` | `:25`, `:49-52` | No reescribe el mismo valor en cada SSE de 3 s |
| Guard `match_content_frame_rate` | `:46-48` | Si `value=="1"` y ya se escribió `"2"`, se **acepta sin bajar** el QUALITY-LOCK |
| `try-both-ns` | `:136-195` | Orden `global→system→secure` (o prioriza el hint) y **solo escribe donde la clave ya existe** (`:149-157`) para no crear keys inertes |
| Fallback `NS_HINT` | `:175-192` + `:201-227` (19 entradas) | Claves que existen pero `getString()` no expone (p. ej. `match_content_frame_rate`) se escriben en el ns doctrinal |
| `KeyGuard.writable` | `:145`, `:177` | Sin permiso → `SKIPPED_DENIED` y no se intenta |

`KeyGuard` (`SettingsCatalog.kt:36-48`):

```kotlin
"system" -> Settings.System.canWrite(ctx)            // WRITE_SETTINGS
"global" -> Settings.System.canWrite(ctx) || hasSecure(ctx)
"secure" -> hasSecure(ctx)                            // WRITE_SECURE_SETTINGS
else     -> false
```

`hasSecure` comprueba con `checkPermission("android.permission.WRITE_SECURE_SETTINGS", …) == PERMISSION_GRANTED` (`SettingsCatalog.kt:37-41`). **Medido en el device (§3.3): `WRITE_SECURE_SETTINGS granted=true` → `KeyGuard` habilita `global` y `secure`.**

### 5.7 Panel de diagnóstico

`diagnosticReport()` (`SettingsApplier.kt:66-100`) recorre las 42 claves del allowlist y las lee en los 3 ns, reportando `claves presentes: N/42` y la frase: *"Si una clave no aparece en ningún ns, este SoC no la expone y no se puede aplicar."* Se invoca desde `MainActivity.kt:151`.

---

## 6. `ScreenCaptureService.kt` — mide y **descarta** el fotograma

KDOC literal (`ScreenCaptureService.kt:22-25`):
> *Captura de display con consentimiento (MediaProjection). Mide el frame compuesto, no el buffer privado de ExoPlayer de otra app. No usa root, DRM ni hooks.*

### 6.1 Secreto del consentimiento (no hay captura silenciosa)

- `ScreenCaptureActivity.kt` lanza `mpm.createScreenCaptureIntent()` y, con `RESULT_OK`, arranca el servicio con `resultCode` + `data`.
- `ScreenCaptureService.kt:43-51`: sin `resultCode`/`data` válidos → `Log.w("MediaProjection no autorizado")` y `stopSelf()`.
- `CaptureWatchdogService.kt` (KDOC): *"It cannot silently recreate the consent token; it launches the consent Activity (or an actionable notification when Android blocks background activity starts)."*

### 6.2 Resolución: **media**, no nativa

```kotlin
// ScreenCaptureService.kt:70-71
val ir = ImageReader.newInstance((w / 2).coerceAtLeast(2), (h / 2).coerceAtLeast(2),
    PixelFormat.RGBA_8888, 2)
```

`w`,`h` son la métrica del display (`:64-66`). El `VirtualDisplay` se crea con `ir.width × ir.height` (`:81-84`), es decir **mitad de ancho y mitad de alto** (¼ de píxeles). Bandera: `VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR` (`:83`), captura del display completo.
`ScreenCaptureService.kt:79-80` deja escrito el límite de plataforma: *"API 34 de este build no expone MediaProjectionConfig.createVirtualDisplay; la captura de una sola app es API 35."*

### 6.3 **measure + close**: el fotograma se descarta

```kotlin
// ScreenCaptureService.kt:73-78
ir.setOnImageAvailableListener({ r ->
    runCatching {
        val img = r.acquireLatestImage() ?: return@setOnImageAvailableListener
        try { measure(img) } finally { img.close() }
    }.onFailure { Log.w(TAG, "frame: ${it.message}") }
}, handler)
```

- El `Image` se adquiere, se **mide** y se **cierra** en el mismo bloque (`:76`).
- **No** se convierte a `Bitmap`, **no** se escribe a disco, **no** se envía a ningún motor de mejora, **no** se sube a red.
- El `Surface` del `ImageReader` solo se usa como sumidero del `VirtualDisplay` (`:81-84`).

**Conclusión verificable: este subsistema NO procesa imagen.** Es instrumentación.

### 6.4 Qué mide exactamente

| Métrica | Fórmula / umbral | Línea |
|---|---|---|
| `gapMs` | `(frameAt - lastFrameAt)/1e6` | `:91` |
| `freezeMs` | Acumula `gapMs` cuando `gapMs > 1500 ms` | `:93-96` |
| `stalls` | `++` en el mismo caso de freeze | `:95` |
| `fps` | `1000.0 / gapMs` | `:97` |
| `luma` | BT.601 `0.299R + 0.587G + 0.114B`, muestreo `stride = 4` | `:113-136` |
| `lap` (nitidez) | media de `|luma(x) − luma(x+1)|` | `:127`, `:136` |
| `motion` | `|luma_actual − luma_anterior|` | `:137` |
| `kind` | `SLATE` si `frames>30 && lap<1.0 && motion<0.8`; `DETAIL` si `lap>8.0`; `MOTION` si `motion>4.0`; si no `FLAT` | `:140-145` |

Los valores se publican en `AraStatus` (`:98-101`, `:146-150`) y `StatePublisher.publish(...)` **cada 5 frames** (`:152-154`). Log cada 15 frames (`:151`). Hilo propio `HandlerThread("ARA-SCREEN")` (`:67`).

### 6.5 Efectos colaterales del arranque

`ScreenCaptureService.kt:54-59`: al arrancar la captura se ejecuta `TokenVaultClient.restoreIfMissing` + `backup` (en `Thread` aparte) y `AraCommandBridge.start(this)`. Es decir: **la captura es también el disparador del token vault y del puente de comandos SSE**.

### 6.6 Lo que este servicio NO hace

- NO lee la posición ni el estado de otro player.
- NO captura el `MediaCodec` de otra app (imposible por plataforma; `:22-24`).
- NO procesa ni mejora el fotograma (§6.3).
- NO persiste imágenes.

---

## 7. `PlayerHub.kt` y `Display4K.kt`

### 7.1 `Display4K.kt` — fija el modo de panel (línea 21, citada)

```kotlin
// Display4K.kt:14-32
fun apply(activity: Activity) {
    if (Build.VERSION.SDK_INT < 23) return
    try {
        val display = activity.windowManager.defaultDisplay
        val modes = display.supportedModes ?: return
        val best = modes
            .filter { it.physicalWidth >= 3840 && it.physicalHeight >= 2160 }   // :19-20
            .maxByOrNull { it.refreshRate }                                      // :21  ← LÍNEA CITADA
        if (best == null) {
            Log.w(TAG, "display_no_4k: el TV/HDMI no expone 3840x2160")
            AraStatus.display4k = false
            return
        }
        val lp = activity.window.attributes
        lp.preferredDisplayModeId = best.modeId                                  // :28  ← FUERZA EL MODO
        activity.window.attributes = lp
        AraStatus.display4k = true
        AraStatus.displayMode = "${best.physicalWidth}x${best.physicalHeight}@${"%.0f".format(best.refreshRate)}"  // :31
```

**Hecho 1 — la línea 21 existe y hace lo que se afirma del mecanismo:** `maxByOrNull { it.refreshRate }` sobre el subconjunto de modos con `physicalWidth ≥ 3840 && physicalHeight ≥ 2160`.
**Hecho 2 — la línea 28 impone el modo a la ventana:** `lp.preferredDisplayModeId = best.modeId`.
**Hecho 3 — se aplica al abrir el player de la APK:** `PlayerActivity.kt:25` (`Display4K.apply(this)`) y `MainActivity.kt:48` (`Display4K.apply(this)`). Son los **dos únicos** call sites (verificado con `Select-String -Pattern "Display4K"` sobre todo `app/src/main`: **8 hits** = 5 en `Display4K.kt` (11, 12, 24, 30, 35) + 1 en `AraStatus.kt:57` (declaración del campo `display4k`) + los 2 call sites).

**Corrección fail-honest al enunciado ("fuerza el panel a 60 Hz"):** el código **no** escribe `60` en ninguna parte (línea 21 selecciona el **mayor** `refreshRate` disponible del conjunto 4K; `:8` y `:31` mencionan `≤60`/`@` formato). Por tanto:
- Lo **demostrado por el código**: la APK impone un `preferredDisplayModeId` concreto al abrir el player, **anulando de facto** `user_preferred_refresh_rate` y `match_content_frame_rate` — claves que el propio aplicador controla (`SettingsApplier.kt:243`, `:239`) y que el panel de Ajustes del usuario escribe.
- Lo que **depende del panel**: que ese modo sea exactamente 60 Hz. Ocurre si el modo 4K de mayor refresco del TV/HDMI es 60 Hz (el caso típico, y el que el KDOC asume: `:8` "3840x2160@**<=60** si el TV/HDMI lo soporta").
- **NO MEDIDO:** el `refreshRate` real del modo elegido en este device. Requeriría `dumpsys display` + una ejecución de la APK; no se ejecutó (análisis de solo lectura). Queda **NO COMPUTADO** con esa razón.

**Efecto neto verificable:** al abrir `PlayerActivity` (y `MainActivity`), la APK **re-escribe** el modo de display del panel. Si el usuario fijó otro modo en Ajustes, la selección de la APK gana mientras esa Activity esté en primer plano.

### 7.2 `PlayerHub.kt` — holder del player vivo

55 líneas, **sin KDOC de cabecera** (empieza directo en `object PlayerHub`). Contenido:

| Miembro | Línea | Efecto |
|---|---|---|
| `activity`, `videoView`, `player` | `:10-12` | Referencias al player vivo (una sola sesión) |
| `attach(a,v,p)` / `detach()` | `:14-24` | Enganche/desenganche desde `PlayerActivity.kt:53` y `:85` (`onDestroy`) |
| `neutral()` | `:27-37` | Off **real**: `sharpen=0, denoise=0, vibrance=0, microcontrast=0` en `FluidStore.prefs` + `player.refreshEffects()` |
| `profile()` | `:40-50` | On "medido": `sharpen=40, denoise=16, vibrance=7, microcontrast=8` + refresh |
| `pause/resume/seekTo` | `:52-54` | Delegación pura al player |

`TAG = "ApeImageEnhancer"` (`:9`).
**Consumidor real:** `AbTestReceiver.kt` (receiver exportado `com.ape.crystalagent.AB`) mapea `cmd=off` → `PlayerHub.neutral()` (`:14`), `on` → `PlayerHub.profile()` (`:18`), `freeze`/`resume`/`seek`/`shot` (`:20-33`). Es decir: `PlayerHub` es el **actuador de A/B por adb**, no un camino de producción.

**Nota honesta sobre `profile()`:** los valores 40/16/7/8 se escriben en prefs y luego `ApePlayer.refreshEffects()` llama a `FluidBridge.effects()` — pero el efecto solo se instala si `suppressVideoEffects == false` (`ApePlayer.kt:496-503`), y ese flag es **`true` por defecto** (`ApePlayer.kt:530`, §8). Con el default, `profile()` no cambia un solo píxel.

---

## 8. `UltraEnhancePipeline.kt` y los efectos GL

### 8.1 El techo arquitectónico (Android, no una decisión de producto)

`UltraEnhancePipeline.kt:12-15` (KDOC, literal):
> *Procesar frames requiere que NUESTRO APK reproduzca el video (F3 ExoPlayer): **Android NO permite capturar el MediaCodec de un player de terceros**. El feed real de frames se conecta en F3 vía `androidx.media3:media3-effect` (GlShaderProgram, GPU-directo). `processFramePair(Bitmap)` es la API CONCEPTUAL/test (round-trip Bitmap) — **NO es el camino de tiempo real** (sería demasiado lento).*

Lo mismo, desde el otro lado, en `ScreenCaptureService.kt:22-24` ("Mide el frame compuesto, no el buffer privado de ExoPlayer de otra app") y en `ReaOttBridge.java` ("never receives another app's video frames").

**Consecuencia:** los efectos de mejora del ARA **solo** pueden tocar frames cuando **la APK reproduce** (ExoPlayer propio). Para OTT Navigator / TiviMate / VLC no hay mejora de píxeles del ARA: el techo real es el VPP del SoC vía `SettingsApplier`.

### 8.2 Motores (5) y su naturaleza real

| Motor | Clase | Qué hace | Estado |
|---|---|---|---|
| 5 | `MediaEnhanceApiPipeline.kt` | Media Enhancement API de Google, detectada **por reflexión** (no se añade la dep) | `isSupported()=false` → cae a 1–4 (`MediaEnhanceApiPipeline.kt` KDOC) |
| 1 | `TfliteInferenceEngine` + `car_denoise_f32.tflite` | Denoise de artefactos | `.tflite` = **baseline de pesos fijos** (gaussiana low-pass) |
| 2 | `LcevcSyntheticPipeline.kt` / `sr_unsharp_f32.tflite` | "Super-resolution": residual sintético / unsharp separable | **No** es V-Nova LCEVC ni ESRGAN entrenado |
| 3 | `TfliteInferenceEngine` + `rife_blend_f32.tflite` | Interpolación de frames | **blend lineal**, no RIFE entrenado; modo elegido por benchmark real (`:86-97`) |
| 4 | `GlslEnhancePipeline.kt` / `CrystalGlEffect.java` / `ApeUltraEnhanceGlEffect.kt` | GLSL EGL14+FBO y efectos media3 | Ver §8.3 |

La negociación es explícita y trazable: `negotiate()` (`UltraEnhancePipeline.kt:56-127`) prueba motor 5, luego 1, 2, 3, 4, y **cruza** el resultado del SoC con el plan del perfil: `levels = PrismaProfile.applyTo(prismaPlan, socLevels)` (`:116`).

### 8.3 Camino de frame real (media3-effect) y su estado **medido**

Composición de la cadena:

```java
// FluidBridge.java:122-164
public static List<Object> effects(Context context) {
    return effectsFor(context, FluidStore.prefs(context).getString("image_profile", "crystal_uhd"));
}
private static List<Object> effectsFor(Context context, String profile) {
    if (!FluidStore.prefs(context).getBoolean("enhance_enabled", true)) return Collections.emptyList(); // :127
    if ("natural".equals(profile)) return Collections.emptyList();                                       // :128
    …
    if (!"lite".equals(profile)) {
        int[] output = "crystal_uhd".equals(profile) ? outputLimit(context) : new int[]{0, 0};
        return Collections.<Object>singletonList(new CrystalGlEffect(sharpen, denoise, vibrance, contrast, output[0], output[1])); // :155
    }
    if (sharpen == 0f && denoise == 0f) return Collections.emptyList();                                   // :157
    return Collections.singletonList(create("com.ape.crystalagent.ApeUltraEnhanceGlEffect", …));          // :158
}
```

Instalación en el player: `ApePlayer.kt:136` → `p.setVideoEffects(FluidBridge.effects(ctx) as List<Effect>)`.

**Estado medido, y es el dato más importante de esta sección — los efectos están APAGADOS por defecto y se sabe ROTOS en el device del operador:**

```kotlin
// ApePlayer.kt:530
@Volatile var suppressVideoEffects: Boolean = true      // ← DEFAULT: efectos OFF
```

```kotlin
// PlayerActivity.kt:32-48
/* Efectos de imagen: SOLO con "effects=on" explicito.
 *
 * MEDIDO EN EL ONN 4K (2026-11-08) — A/B con captura de pantalla:
 *   effects=on  -> 16.280 B de PNG  = PANTALLA NEGRA
 *   effects=off -> 1.694.782 B      = video real
 * La cadena CrystalGlEffect (FluidBridge.effectsFor -> configure() con
 * outputWidth/Height) NO entrega frames en este device. Se habia puesto
 * un auto-encendido cuando la lista trae plan PRISMA; se retira porque
 * metia una regresion de pantalla negra al operador.
 * Hasta que se arregle CrystalGlEffect, los efectos quedan OPT-IN y se
 * sabe roto: no se encienden solos. */
val effectsExtra = intent.getStringExtra("effects")
ApePlayer.suppressVideoEffects = when (effectsExtra) {
    "on" -> false     // pedido explicito (ojo: hoy deja pantalla negra)
    "off" -> true
    else -> true      // default: SIN efectos
}
```

Auto-protección adicional: `ApePlayer.kt:128-129` (`if (!suppressVideoEffects && effectsPoisoned()) { suppressVideoEffects = true }`), `:424` (`if (suppressVideoEffects) return`), `:437`, `:494-503` (`refreshEffects` respeta el flag).

> **Afirmación exacta que sostiene la evidencia:** el *pipeline* de efectos está cableado y solo puede tocar frames del ExoPlayer propio (§8.1); pero en el APK, en el estado actual del repo, **no se aplica por defecto** (default OFF, `ApePlayer.kt:530`) y con `effects=on` está **documentado como pantalla negra** en el ONN 4K (`PlayerActivity.kt:34-36`). Cualquier documento que afirme "el ARA mejora la imagen del player propio" está contradiciendo este artefacto.

### 8.4 `.tflite` = pesos fijos, no redes entrenadas

Evidencia en el propio código, sin interpretación:

- `UltraEnhancePipeline.kt:16-18`: *"Los modelos .tflite (car_denoise/sr_unsharp/rife_blend) son **BASELINE de pesos fijos** = operaciones reales (gaussiana low-pass, unsharp, blend lineal), **NO redes entrenadas** (honesto: mejora modesta, nunca basura; swap por entrenados sin tocar firmas)."*
- `PrismaProfile.kt` (KDOC): *"Los `.tflite` son baseline de pesos fijos (no CNNs entrenadas). Se aplican con la mejora modesta que dan, nunca se anuncian como mas."*
- Tamaños que corroboran el baseline: **1 676 B / 1 580 B / 1 484 B** (§1.5) — un modelo entrenado de denoise/SR/RIFE real ocupa de MB, no de KB.
- Generador: `tools/build_ape_models.py` (4 615 B).

### 8.5 PRISMA: el perfil del canal manda, el SoC pone el techo

`UltraEnhancePipeline.kt:112-116`: *"el SoC negocia lo que PUEDE; el perfil decide que SE QUIERE. Se aplica la interseccion, que es lo unico que de verdad se ejecuta."*
`PrismaProfile.kt` (KDOC) fija la doctrina: un carril se enciende **solo si el valor es `"1"` Y el motor existe**; `cmaf`, `hdr10plus` y `quantum_pixel` se leen para reportar pero **nunca se aplican** (no hay motor en el APK).

Reajuste por canal: `renegotiateFor(channelProfile)` (`:139-169`), invocado al cambiar de canal.

---

## 9. Qué **NO** existe en este árbol — verificación exhaustiva

### 9.1 Método (sin truncado)

```powershell
# Paso 1 — en el árbol del módulo (incluye build/)
Get-ChildItem -Path "IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent" -Recurse -File -Filter "<NOMBRE>"
# Paso 2 — repo COMPLETO (desde la raíz del workspace)
Get-ChildItem -Path "." -Recurse -File -Filter "<NOMBRE>"
# Paso 3 — por raíz de nombre sobre todas las fuentes (.kt + .java) de app/src
$src | Where-Object { $_.Name -like "*<stem>*" }
```

Ningún paso usa `-First` ni `head`. Conteos completos.

### 9.2 Resultado medido

| Fichero buscado | En el árbol `ape-crystal-agent` | En el **repo completo** | Lectura honesta |
|---|---:|---:|---|
| `OTTShim.kt` | **0** | **0** | **No existe con ese nombre en ningún sitio.** El motor existe con otro nombre y otro paquete: `dev.venice.ottshim` (§9.3) |
| `ReaBridge.kt` | **0** | **0** | **No existe como `.kt`.** Existe como **`ReaBridge.java`** (20 899 B) en `app/src/main/java/com/ape/rea/` |
| `ReaOttBridge.kt` | **0** | **0** | **No existe como `.kt`.** Existe como **`ReaOttBridge.java`** (5 502 B) en `app/src/main/java/com/ape/rea/` |
| `SessionTap.kt` | **0** | **1** | **No está en este árbol.** Existe en `…\ottshim\app\src\main\kotlin\dev\venice\ottshim\SessionTap.kt` (4 387 B) |
| `LoopbackProxy.kt` | **0** | **1** | **No está en este árbol.** Existe en `…\ottshim\app\src\main\kotlin\dev\venice\ottshim\LoopbackProxy.kt` (23 169 B) |
| `ProxyService.kt` (extra) | **0** | **1** | Igual: `…\ottshim\…\ProxyService.kt` (5 706 B) |

Búsqueda por raíz de nombre sobre las 83 fuentes de `app/src/main`:

```
[STEM] OTTShim      -> 0
[STEM] OttShim      -> 0
[STEM] SessionTap   -> 0
[STEM] LoopbackProxy-> 0
[STEM] Rea*         -> 12 :: ScreenCaptureActivity.kt, ReaAdaptiveEffect.java, ReaBridge.java,
                        ReaExternalPlayerActivity.java, ReaExternalRequest.java, ReaHdrBridge.java,
                        ReaLoadGovernor.java, ReaMediaSources.java, ReaOttBridge.java,
                        ReaPlaybackSession.java, ReaState.java, ReaUi.java
```

### 9.3 Dónde viven de verdad — y por qué es correcto

1. **`SessionTap.kt`, `LoopbackProxy.kt`, `ProxyService.kt`** están en el módulo **`ottshim`** de la **raíz del workspace** (`C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\ottshim\`), **fuera** de `IPTV_v5.4_MAX_AGGRESSION\`. No se copian: se **inyectan** en el build del APK por `shim/build.gradle.kts:37` (`sourceSets["main"].kotlin.srcDir("../../../../ottshim/app/src/main/kotlin")`) y se empaquetan por `app/build.gradle.kts:113` (`implementation(project(":shim"))`).

   **Prueba de que el código entra al APK:** el APK **instalado** declara `dev.venice.ottshim.SessionTap` en su tabla de resolución de servicios (§2.2), medido con `dumpsys package`.

2. **`ReaBridge`, `ReaOttBridge` y todo el paquete `com.ape.rea`** existen en **Java**, no en Kotlin: **11 ficheros / 85 346 B** (medido con `Measure-Object` sobre `app/src/main/java/com/ape/rea`; §1.3). **No** son de otro paquete ausente: están en `app/src/main/java/com/ape/rea/` de este mismo árbol y se declaran en el manifiesto vía `com.ape.rea.ReaExternalPlayerActivity` (`AndroidManifest.xml:80`).

3. **`OTTShim.kt`**: no existe con ese nombre en ningún punto del workspace. El sistema que la tarea llama "OTTShim" es el módulo `dev.venice.ottshim` (§1.4), cuyo punto de entrada es `ProxyService.kt` + `LoopbackProxy.kt`, no `OTTShim.kt`.

> **Contra-hipótesis del enunciado, corregida:** el enunciado sugería que `ReaBridge`/`ReaOttBridge` podrían vivir en "otro paquete (`com.ape.crystalagent.rea`) que no está en este árbol". **Falso medido:** el paquete es `com.ape.rea` (sin `.crystalagent`), **sí está** en este árbol, y los ficheros son `.java`. La sugerencia correcta para `SessionTap`/`LoopbackProxy` es la contraria: **no** están en este árbol, pero **sí** en el build (módulo `:shim`).

---

## 10. Superficie APK → VPS (endpoints referenciados en código)

`Config.kt:214` fija `DEFAULT_VPS = "https://iptv-ape.duckdns.org"`. Rutas por fichero:

| Endpoint | Método/uso | Fichero:línea |
|---|---|---|
| `/ara/events` | SSE (Bearer) | `Config.kt:220` (`PATH_EVENTS`) |
| `/ara/state` | POST estado del clasificador | `Config.kt:221` (`PATH_STATE`), `StatePublisher.kt` |
| `/prisma/api/token-vault.php` | vault cifrado | `Config.kt:222` (`PATH_VAULT`), `TokenVaultClient.kt` |
| `/ara/enroll` | `POST` enrolamiento WG | `EnrollClient.kt:53` |
| `/prisma/api/ape-feedforward-stream.php?device=…&iv=3&dur=110` | SSE device-keyed | `FeedForwardClient.kt:53` |
| `/prisma/api/conviva-event.php` | POST QoE + heartbeat | `QoEReporter.kt:161` |
| `/sync` | POST firmado HMAC (v2) | `Config.kt:209`, `SyncClient.kt:74` |
| `/ara/version` | GET versión | `SelfUpdateManager.kt:54` |
| `/ara/agent.apk` | GET APK (sha256 + pin de firma) | `SelfUpdateManager.kt:71` |
| `/jit/api/config` | GET catálogo JIT | `JitLinkActivity.java` |
| `/api/v1/telemetry` | POST control del player "fluid" | `FluidControlClient.java` |

**Nota de honestidad sobre `/sync`:** `SyncLoop.kt:22-26` afirma que el endpoint *"todavía devuelve 404"* en el VPS. El estado del VPS se documenta en el documento hermano `02_VPS_*` de este mismo directorio; este documento **no** lo verifica (análisis local, sin red al VPS desde esta tarea).

---

## 11. Hallazgos (contradicciones medidas, no interpretadas)

| ID | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **H1** | **Cleartext HTTP permitido**, pese a que el contrato de `/sync` asume lo contrario | `AndroidManifest.xml:36` `usesCleartextTraffic="true"` vs `SyncLoop.kt:31` *"targetSdk 28 ⇒ cleartext bloqueado por defecto"* | La frase de `SyncLoop.kt:31` es falsa para esta app: el manifest **habilita** cleartext explícitamente. La seguridad de transporte no puede apoyarse en `targetSdk` |
| **H2** | La allowlist de escritura es de **42** claves, no de 13 | `SettingsApplier.kt:237-296` (42 × `to Regex`); `SettingsCatalog.kt:12-31` (10/3/0) | Auditar con 13 deja 29 claves sin revisar, incluidas 6 `com.amazon.tv.*` y todo el bloque AI-SR/AI-PQ del VPP |
| **H3** | Los efectos de imagen están **OFF por defecto** y **rotos** (pantalla negra) en el ONN 4K | `ApePlayer.kt:530` (default `true` = suprimido); `PlayerActivity.kt:32-48` (A/B medido 2026-11-08) | Toda afirmación de "mejora de imagen del ARA sobre su propio player" es falsa en el estado actual |
| **H4** | Accesibilidad y notification-listener **declarados pero NO habilitados** | `settings get secure enabled_accessibility_services` → `null`; `enabled_notification_listeners` → solo el del launcher | `AraAccessibilityService` y `dev.venice.ottshim.SessionTap` no operan en este device |
| **H5** | `PACKAGE_USAGE_STATS=false` | `dumpsys package` | La detección de "player IPTV en foreground" del `CaptureWatchdogService` pierde su fuente primaria |
| **H6** | `WRITE_SECURE_SETTINGS` concedido en user 0 pero **denegado en user 10** | `dumpsys`: `granted=true` + `granted=false, userId=10` | Si el operador abre la app en un perfil de trabajo, el aplicador queda en `SKIPPED_DENIED` |
| **H7** | `REQUEST_INSTALL_PACKAGES=false` | `dumpsys` | Hoy incumple el requisito de `SelfUpdateManager` en el primer intento de update |

> H1, H3, H4, H5, H6 y H7 son **estado medido en un device concreto** (`192.168.1.3:5555`), no una propiedad universal del código. H2 es propiedad del código.

---

## 12. NO COMPUTADO y pendientes (con razón)

| # | Qué no se midió | Razón |
|---|---|---|
| 1 | `refreshRate` real del modo de display que `Display4K` selecciona en el ONN 4K | Requiere `dumpsys display` durante una ejecución del player; esta tarea es solo lectura y no lanzó Activities |
| 2 | Si `dev.venice.ottshim.ProxyService` está en el APK **instalado** | Sin `intent-filter`, no aparece en las tablas de resolución del `dumpsys`; habría que inspeccionar el DEX/manifiesto fusionado del APK, fuera del alcance de esta tarea |
| 3 | Qué motores UltraEnhance negocian **realmente** en este SoC | Requiere `logcat` de `negotiate()` en ejecución; no se capturó log |
| 4 | Estado real de `/sync` en el VPS (404 vs operativo) | Sin acceso al VPS desde esta tarea; corresponde a `02_VPS_*` |
| 5 | Contenido de `ottshim` desde el punto de vista de contrato (qué reescribe, qué mide) | Fuera del alcance asignado (inventario de la APK); aquí solo se acredita su **presencia y wiring** |
| 6 | Estado de los 41 tags de la directiva ARA por preset en este device | Requiere ejecución + volcado de `PresetLedger`; no se ejecutó |
| 7 | `strings.xml` (198 B) y `provider_paths.xml` (103 B) leídos en detalle | Se midieron bytes y se citó su función desde el manifiesto; el contenido literal no se reproduce aquí por no ser material para el inventario |

---

## 13. Resumen ejecutivo verificable

1. La APK tiene **64 `.kt` (339 094 B)** + **19 `.java` (210 558 B)** = **83 fuentes / 549 652 B** bajo `app/src/main`, más un módulo `:shim` que **toma su fuente de `…\ottshim\` de la raíz del workspace** (`shim/build.gradle.kts:37`).
2. El manifiesto (180 líneas) declara **6 activities (todas exported), 5 services (1 exported: accesibilidad), 3 receivers (todos exported) y 1 provider (no exported)**, con `usesCleartextTraffic="true"` y sin `android:icon` (decisión documentada).
3. **11 permisos** declarados → **21 fusionados**; medido en device: `WRITE_SECURE_SETTINGS=true` (user 0), `SYSTEM_ALERT_WINDOW=false`, `PACKAGE_USAGE_STATS=false`, `REQUEST_INSTALL_PACKAGES=false`.
4. El aplicador escribe **42 claves allowlisted con regex** (no 13: 13 es el catálogo), rechaza y loguea lo que no casa (`SettingsApplier.kt:41-43`), es idempotente y ordena la escritura por impacto físico.
5. `ScreenCaptureService` captura a **¼ de píxeles** y hace **`measure` + `close`**: no procesa imagen. Mide luma/lap/motion/fps/freeze(>1500 ms)/stalls.
6. `Display4K.kt:21` (`maxByOrNull { it.refreshRate }`) → `:28` (`preferredDisplayModeId`) **impone el modo de panel** desde `PlayerActivity.kt:25` y `MainActivity.kt:48`. El "60 Hz" depende del panel: **NO COMPUTADO** para este device.
7. El pipeline de efectos **solo** toca frames del ExoPlayer propio (imposible tocar el `MediaCodec` ajeno) y está **OFF por defecto** (`ApePlayer.kt:530`) con **pantalla negra medida** al encenderlo (`PlayerActivity.kt:34-36`). Los `.tflite` son **baseline de pesos fijos** de 1 484–1 676 B, no redes entrenadas.
8. **`OTTShim.kt`, `SessionTap.kt` y `LoopbackProxy.kt` no están en este árbol** (0 coincidencias); `SessionTap.kt`/`LoopbackProxy.kt` existen en `…\ottshim\` y **sí entran al APK** (probado por `dumpsys`). **`ReaBridge.kt`/`ReaOttBridge.kt` no existen como `.kt`**: existen como **`.java`** en `com/ape/rea/` **dentro de este árbol**.
