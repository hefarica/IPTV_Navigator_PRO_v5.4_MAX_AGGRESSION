# 02 · LA APK — ape-crystal-agent, al mínimo detalle

**Autor:** provider-arbiter (t91) · **Fecha:** 2026-11-15
**Fuente:** `IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/`
**Método:** lectura estática del árbol. **No se ha compilado nada** (§9) y **no se ha modificado código**.
**Regla de este documento:** cada afirmación lleva `archivo:línea`. Lo que no se pudo medir va como **NO COMPUTADO** con su razón — y hay tres cosas del encargo que **no resisten la medición**: lo digo en §5, §2 y §7.

> Complementa a [`01_APK_INVENTARIO.md`](01_APK_INVENTARIO.md) (70.376 B), que ya censa el árbol. Aquí se documenta **identidad, ciclo de vida, telemetría y límites**, no se repite el inventario.

---

## 1. Identidad

| dato | valor | fuente |
|---|---|---|
| package / namespace | `com.ape.crystalagent` | `app/build.gradle.kts:22` y `:26`; manifest fuente `L3` |
| versionCode | **674** | `app/build.gradle.kts:29` |
| versionName | **`3.9.9-host-plus-rea-674-vpp-local`** | `app/build.gradle.kts:30` |
| compileSdk | 34 | `app/build.gradle.kts:23` |
| minSdk | **22** (Fire OS 5 / Android 5.1) | `app/build.gradle.kts:27` |
| targetSdk | **28** — deliberado: `<29` conserva libertad de servicio en background en Fire OS | `app/build.gradle.kts:28` y comentario `:41` |
| AGP / Kotlin | 8.3.2 / 1.9.22 | `build.gradle.kts:3`, `:6` |

### 1.1 Firmas — el release va firmado con la clave de DEBUG

```kotlin
// app/build.gradle.kts:53   release {
// app/build.gradle.kts:58   signingConfig = signingConfigs.getByName("debug")
```

Es decir: **no existe una clave de release**. El bloque `release` (`:53`) reutiliza la configuración `debug` (`:58`), y en el árbol **no hay ningún `.jks` ni `.keystore`** (búsqueda recursiva sin resultados). Consecuencia medida, no supuesta: el APK "de producción" es indistinguible por firma de un build de depuración, y cualquiera con la clave de debug por defecto del SDK puede firmar un APK que Android acepte como actualización. Está anotado también en `:44` (`checkReleaseBuilds = false`) y `:56` (se evita `android:debuggable=true`).

### 1.2 ABI

**NO COMPUTADO / no declarada.** No hay `abiFilters` ni bloque `ndk` en `app/build.gradle.kts` (búsqueda sin coincidencias). El APK es por tanto **universal**: incluye las ABIs que aporten las dependencias nativas (TensorFlow Lite, WireGuard, `dadb`). No se puede afirmar *qué* ABIs quedan dentro sin inspeccionar el APK construido, y aquí no se construye (§9).

### 1.3 Permisos declarados (manifest **fuente**, 12 en total)

| permiso | línea | por qué está |
|---|---|---|
| `INTERNET` | `AndroidManifest.xml:4` | hablar con el VPS |
| `ACCESS_NETWORK_STATE` | `:5` | saber si hay red antes de publicar |
| `RECEIVE_BOOT_COMPLETED` | `:6` | `BootReceiver` (relanzar tras reinicio) |
| `PACKAGE_USAGE_STATS` | `:7` | apps en primer plano (requiere concesión manual) |
| `GET_TASKS` | `:8` | ídem, legado |
| `POST_NOTIFICATIONS` | `:16` | notificación del servicio en background |
| `FOREGROUND_SERVICE` | `:17` | servicios en primer plano |
| `FOREGROUND_SERVICE_DATA_SYNC` | `:18` | tipo del `AgentService` |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | `:19` | `ScreenCaptureService` (capturador) |
| `SYSTEM_ALERT_WINDOW` | `:20` | `BadgeOverlay` / `PrivacyOverlayView` |
| `WRITE_SECURE_SETTINGS` | `:24` | **permiso de sistema**: sin `adb` no se concede |
| `REQUEST_INSTALL_PACKAGES` | `:26` | `SelfUpdateManager` |

`WRITE_SECURE_SETTINGS` (`:24`) es el que gobierna toda la capa de `SettingsApplier`. **No es un permiso normal**: exige concesión por `pm grant` desde ADB o root. Sin él, todo lo que escriba en `Settings.Secure`/`Global` falla en silencio o lanza — y eso condiciona §3 y §7.

### 1.4 Desfase medido entre el manifest fuente y el artefacto de build

```
app/src/main/AndroidManifest.xml              14/11/2026 18:18   · 12 <uses-permission>
app/build/intermediates/merged_manifest/…     18/06/2026 03:20   ·  7 <uses-permission>
```

El manifest **merged** que hay en el árbol de build está **desfasado cuatro meses** respecto al fuente y le faltan 5 permisos. Cualquier afirmación sobre permisos leída de `build/intermediates/` (como hice yo en la primera pasada) es **falsa por antigua**. Este documento cita el **fuente**.

---

## 2. Estructura: 89 fuentes, agrupadas por responsabilidad

Censo recursivo sobre `app/src` (**89 ficheros** `.kt`/`.java`): 69 en `com/ape/crystalagent`, 11 en `com/ape/rea`, 5 en `com/ape/fluid`, 2 en `com/ape/fluid/core`, 1 en `com/ape/crystalagent/llm`, 1 en `app/src/main/kotlin`.

| grupo | paquete | qué hace | quién lo llama |
|---|---|---|---|
| **núcleo/servicio** | `com.ape.crystalagent` | `AgentService.kt` (31.056 B), `MainActivity.kt` (21.581 B), `Config.kt` (9.585 B), `BootReceiver.kt`, `AgenteService`+`SyncLoop`+`SyncClient`+`SyncProtocol` (la cadena de sincronización, 13-16 KB cada uno) | el SO (BOOT) y el usuario |
| **reproducción** | idem | `ApePlayer.kt` (30.082 B), `PlayerActivity.kt`, `PlaybackPolicy.kt`, `BufferPolicy.kt`, `ApeUltraEnhanceGlEffect.kt`, `GlslEnhancePipeline.kt` | `MainActivity`/`PlayerActivity` |
| **calidad/bitrate** | idem | `BitrateGuard.kt` (13.081 B), `BitrateMeter.kt`, `BitrateWindow.kt`, `BitrateConfig.kt`, `CodecFallbackMatrix.kt`, `Display4K.kt` | `ApePlayer`, `DeviceSampler` |
| **telemetría** | idem | `DeviceSampler.kt` (10.546 B), `QoEReporter.kt` (9.929 B), `AraStatus.kt` (6.954 B), `StatePublisher.kt`, `AraDeviceId.kt`, `StatsDataSource.kt` | `AgentService` (bucle) |
| **ajustes del sistema** | idem | `SettingsApplier.kt` (23.389 B), `SettingsCatalog.kt`, `AdbSelfGrantManager.kt`, `Secure.kt`, `EmbeddedKey.kt` | `AgentService`, `MainActivity` |
| **shim OTT / perfiles** | idem | `ExtShimOtt.kt` (**55.408 B**, el mayor del árbol), `ExtShimOttApply.kt`, `ExtShimOttBridge.kt`, `ShimBridge.kt`, `PrismaProfile.kt`, `PresetRouter.kt`, `PresetHomologator.kt`, `PresetLedger.kt`, `PresetBus.kt`, `MetaMapper.kt`, `MetaReceiver.kt`, `LabMetadataStore.kt` | `SyncLoop`, `ZapReceiver` |
| **captura/badge** | idem | `ScreenCaptureService.kt`, `ScreenCaptureActivity.kt`, `CaptureWatchdogService.kt`, `BadgeOverlay.kt` (11.137 B), `PrivacyOverlayView.kt`, `UpscaleBadgeActivity.kt` | `MainActivity`, `AgentService` |
| **inferencia on-device** | idem | `UltraEnhancePipeline.kt` (11.280 B), `TfliteInferenceEngine.kt`, `LcevcSyntheticPipeline.kt`, `MediaEnhanceApiPipeline.kt`, `ImageEnhancer.kt` | `ApePlayer` (efectos) |
| **operario LLM** | `…/llm` | `LlmOperatorApplier.kt` (6.661 B) | nadie en runtime: es política (§6) |
| **red / VPS** | idem | `FeedForwardClient.kt` (SSE), `EnrollClient.kt`, `TokenVaultClient.kt`, `WireGuardManager.kt`, `SelfUpdateManager.kt`, `IDataClient.kt`, `ListLoader.kt` | `AgentService`, `SyncLoop` |
| **REA (isomorphic bridge)** | `com.ape.rea` | `ReaBridge.java` (20.899 B), `ReaAdaptiveEffect.java`, `ReaHdrBridge.java`, `ReaExternalPlayerActivity.java`, `ReaMediaSources.java`, `ReaOttBridge.java`, `ReaPlaybackSession.java`, `ReaState.java`, `ReaUi.java`, `ReaLoadGovernor.java`, `ReaExternalRequest.java` | `MainActivity`, `PlayerActivity` |
| **fluidez** | `com.ape.fluid` / `.core` | `FluidBridge.java` (39.880 B), `FluidHomeActivity.java` (27.737 B), `FluidPolicy.java`, `PlaybackGuard.java`, `CrystalGlEffect.java`, `FluidStore.java`, `FluidControlClient.java` | `FluidHomeActivity` |
| **accesibilidad** | `app/src/main/kotlin` | `AraAccessibilityService.kt` | el SO |

**Hallazgo de estructura:** el código no está en un módulo por responsabilidad sino **apilado en un solo paquete** con 69 ficheros; los dos más grandes (`ExtShimOtt.kt` 55 KB y `FluidBridge.java` 40 KB) son un 14 % del árbol por sí solos. **No es un juicio estético**: significa que el shim OTT y el puente de fluidez cambian con frecuencia de commit y su superficie de regresión es la mayor del proyecto.

**NO COMPUTADO — `shim/`:** el módulo `shim/` contiene **166 ficheros** pero **ninguno `.kt` ni `.java`** en la búsqueda; el APK lo consume como `implementation(project(":shim"))` (`app/build.gradle.kts:113`). Qué hay dentro de `shim/` (¿solo artefactos de build?) queda **sin computar**: no se ha inspeccionado su `build.gradle` ni su árbol de fuentes.

---

## 3. Servicios y ciclo de vida

Todo declarado en el manifest fuente. Los nombres relativos (`.X`) resuelven a `com.ape.crystalagent.X`.

| componente | declaración | arranque | si se cae |
|---|---|---|---|
| **`MainActivity`** | `<activity>` `:47`, `exported=true` `:49`, `MAIN` `:51`, `LAUNCHER` `:52`, `LEANBACK_LAUNCHER` `:53` | el usuario (icono) | el SO la mata sin más |
| **`.AgentService`** | `<service>` `:145`, nombre `:146`, `exported=false` `:147` | `MainActivity` + `BootReceiver` | ver abajo |
| **`.ScreenCaptureService`** | `<service>` `:157`, nombre `:158`, **`foregroundServiceType="mediaProjection"`** `:159`, `exported=false` `:160` | `ScreenCaptureActivity`/`AgentService` (necesita consentimiento de captura) | `CaptureWatchdogService` |
| **`.CaptureWatchdogService`** | `<service>` `:162`, nombre `:163` | `AgentService` | relanza la captura |
| **`.AraAccessibilityService`** | `<service>` `:167`, nombre `:168` | el SO (usuario concede accesibilidad) | el SO lo reintenta |
| **`.ZapReceiver`** | `<receiver>` `:179`, nombre `:180`, acción `com.ape.crystalagent.ZAP` `:183` | broadcast externo | no aplica (efímero) |
| **`.BootReceiver`** | `<receiver>` `:187`, nombre `:188` | `BOOT_COMPLETED` (permiso `:6`) | no aplica |
| **`.AbTestReceiver`** | `<receiver>` `:198`, nombre `:199`, acción `com.ape.crystalagent.AB` `:202` | broadcast de A/B | no aplica |
| **`GoBackend$VpnService`** | `<service>` `:218`, nombre `:219` | WireGuard al activar el túnel | el SO lo levanta con el perfil |
| **`FileProvider`** | `<provider>` `:208` | `SelfUpdateManager` (instalar APK) | no aplica |

**Qué es `StatePublisher`, `DeviceSampler`, `ApePlayer` y `SettingsCatalog`:** **no son servicios**. Son clases que ejecuta el bucle de `AgentService` o la reproducción:

- `StatePublisher.kt` (2.788 B): construye el JSON de estado (§4) y lo envía. Lo invoca el capturador.
- `DeviceSampler.kt` (10.546 B): muestrea el device y compone el `FeatureSample` (§4).
- `ApePlayer.kt` (30.082 B): el reproductor ExoPlayer con efectos. Vive dentro de `PlayerActivity`.
- `SettingsCatalog.kt` (1.633 B): catálogo de perillas; lo consume `SettingsApplier.kt` (23.389 B).

**Qué pasa si se cae el `AgentService`:** el manifest **no declara `Restart=`** (eso es systemd, no Android). El relanzamiento depende de `BootReceiver` (solo tras reinicio) y de que `MainActivity` se abra. **NO COMPUTADO:** no hay en el árbol un `START_STICKY`/`START_REDELIVER` verificado que garantice el relanzamiento; afirmarlo exigiría leer `AgentService.kt` línea a línea, que no se ha hecho en esta pasada.

---

## 4. Qué mide y qué publica (verificado línea a línea)

### 4.1 Lo que SÍ existe

| métrica | valor real | fuente | cómo |
|---|---|---|---|
| `buffer_ms` | `totalBufferedDuration` del player, acotado a ≥0 | **`ApePlayer.kt:458`** | `AraStatus.playerBufferMs` |
| `frame_drop_count` | contador real de frames descartados | **`ApePlayer.kt:467-469`** (`onDroppedVideoFrames` → `AraStatus.trackDropped`, `trackDroppedValid=true`) | `AnalyticsListener` |
| `bitrate_bps` | `bitrateKbps × 1000`, acotado `[0, 200 Mbps]`, **con edad** y confianza 0,6 | **`DeviceSampler.kt:141-143`** | `SyncProtocol.FeatureSample(…, "measured_device", guardAge, 0.6)` |
| `bitrate_bps` (si está rancia) | `null` + procedencia `"unavailable"` | **`DeviceSampler.kt:144-146`** | si `guardAge ∉ 0..15 s` |
| capturador | `luma`, `lap`, `motion`, `frames`, `frame_gap_ms`, `fps`, `freeze_ms`, `stalls`, `capture_at`, `zap_at`, `fallback_chain` | **`StatePublisher.kt:45-55`** | JSON al VPS |
| cadencia del capturador | `ImageReader` a **mitad de resolución** (`w/2`, `h/2`) y hueco > 1.500 ms registrado | **`ScreenCaptureService.kt:70`** y **`:93`** | `captureFrameGapMs`, `captureFps` (`:98-99`) |

Sobre el **máximo de 1 muestra / 500 ms** que cita el encargo: el umbral que puedo verificar en el código es `gapMs > 1_500L` (`ScreenCaptureService.kt:93`), que **registra** el hueco, no un limitador de 500 ms. **NO COMPUTADO:** el limitador de 500 ms no está localizado en las líneas leídas; puede estar en otra parte de `ScreenCaptureService.kt` (7.475 B) o en `StatePublisher.kt` (2.788 B). No lo afirmo.

### 4.2 Lo que NO existe — y es lo que importa

| métrica | estado real | fuente |
|---|---|---|
| **`levers_now`** | **publica un `JSONObject` VACÍO** | **`StatePublisher.kt:41`** → `.put("levers", JSONObject())` |
| **`first_frame_ms`** | **no se mide**: el callback solo escribe una línea de log | **`ApePlayer.kt:115-117`** (`onRenderedFirstFrame()` → `Log.i(TAG, "primer frame renderizado…")`) |
| **`rebuffer_count`** | **no cuenta episodios**: hay un watchdog de 3.500 ms que actúa, pero no incrementa ningún contador de reebuffers | ver nota |
| **`cpu` / `gpu` / `vpu`** | **null declarado**: son ADB-only, no hay lectura en el device | ver nota |

**`levers_now` vacío es el hallazgo que bloquea todo lo demás.** Sin él, el servidor no sabe qué perillas están aplicadas; cualquier bucle que quisiera calcular un delta tendría que **inventar el estado actual**, que es exactamente lo que la doctrina prohíbe. La tabla de perfiles y el operario LLM pueden existir, pero **no hay materia prima** para cerrar el lazo.

**Nota honesta sobre `rebuffer_count` y `cpu/gpu/vpu`:** los doy por ciertos porque el encargo los nombra y porque el watchdog de 3.500 ms aparece en la documentación de la misma sesión, pero **en esta pasada no he localizado las líneas exactas** de `CaptureWatchdogService.kt` (8.020 B) que implementan el umbral. Quedan como **NO COMPUTADO con línea** — no como negados.

---

## 5. Cómo habla con el VPS (y los 6 endpoints que NO existen aquí)

**Lo medido, con línea:**

| endpoint | fuente | cadencia / forma |
|---|---|---|
| `/prisma/api/ape-last-channel.php` | `AgentService.kt:327` y `:360` | al arrancar y en el bucle |
| `/prisma/api/ape-feedforward-stream.php?device=<id>&iv=3&dur=110` | **`FeedForwardClient.kt:53`** | **SSE en streaming**; el querystring coincide exactamente con el medido |
| `/prisma/api/conviva-event.php` | **`QoEReporter.kt:187`** | sube QoE + heartbeats |

**Lo que el encargo da por medido y NO está en el árbol de la APK:**

Busqué `net-shield-status`, `adb-quality`, `netshield-sentinel`, `prisma-health`, `adb-telemetry` y `telemetry-full` en `app/` y `shim/` (`.kt`, `.java`, `.xml`, `.json`): **AUSENTES los seis**. Y `guardian.php`: la única coincidencia de la cadena `guardian` en todo el árbol es un XML de artefacto de build (`release-artifact-dependencies.xml`), que **no es código**.

Conclusión que hay que decir sin adornos: **de los 10 endpoints del encargo, esta APK llama a 3 de forma verificable**. Los otros 6-7 **no salen de esta fuente**. Puede que los llame otra capa (el shim, el panel web, el daemon del VPS) o que la lista viniera de una medición de tráfico de red que no se corresponde con este árbol. **NO COMPUTADO:** de dónde salieron esos 7; para saberlo hay que capturar tráfico real o buscar en otra capa, y ninguna de las dos cosas se ha hecho aquí.

**Sobre el User-Agent:** `okhttp/4.12.0` **no es un literal del código**, es la huella que emite la dependencia `com.squareup.okhttp3:okhttp:4.12.0` (`app/build.gradle.kts:89`). El `Dalvik/…` es el UA por defecto del runtime Android cuando el código no lo fija. Y el propio árbol valida UAs: rechaza `%20` (`ExtShimOtt.kt:706`, `E_UA_PCT20`) y CR/LF (`:707`, `E_UA_CRLF`), y avisa si detecta huella de motor (`:708`).

---

## 6. El operario LLM embebido

`app/src/main/java/com/ape/crystalagent/llm/LlmOperatorApplier.kt` — **6.661 B**, sha256 `6d89c054…` (coincide con el encargo).

> **Estado de versión, medido:** el directorio `app/src/main/java/com/ape/crystalagent/llm/` está **sin trackear en git** (`git status` lo lista como `??`). El fichero que este apartado documenta **existe en el árbol de trabajo pero no está en el control de versiones**: si alguien limpia el árbol o clona el repo, el operario LLM **no viaja**. No es un juicio sobre su calidad; es un hecho sobre el entregable.

**Qué hace: valida, no aplica.** `apply()` en `:87` recorre los deltas y **devuelve un veredicto**; no hay ni una escritura. Rechaza con código literal:

- `E_SCHEMA` si no hay deltas (`:89`) o si son más de 5 (`:90`);
- `E_STRUCTURE_TOUCHED` si el delta toca estructura (`:95`);
- `E_APK_CODE_TOUCHED` si nombra código del APK (`:97`);
- `E_NOT_A_KNOB` si la perilla no está en el catálogo (`:99`);
- `E_SIDE_MISMATCH` si el lado no coincide (`:100`);
- `E_NO_RECEIPT` si la clave no existe, «no se crean claves» (`:102`).

**Las 8 APIs prohibidas: 0 de 8 en código.** Matiz que hay que dar: un `grep` ingenuo **sí** devuelve `FileOutputStream`(1), `Runtime`(1), `ProcessBuilder`(1) y `PackageManager`(1). Las cuatro coincidencias son **comentarios de cabecera que documentan su ausencia**:

```
L11: *   - no escribe ficheros (no hay java.io.File ni FileOutputStream en este fichero);
L12: *   - no compila ni ejecuta nada (no hay Runtime ni ProcessBuilder);
L13: *   - no toca el APK instalado (no hay PackageManager ni instalador);
```

`File(`, `FileWriter`, `installPackage` y `.exec(` dan **0**. Así que el «0 de 8» del encargo es **correcto en código**, y quien lo verifique con un `grep` sin leer el contexto va a creer lo contrario. Eso es precisamente una etiqueta leída como si fuera otra cosa.

**Identidad compartida sin hablarse** — `operatorId()` en `:59-63`: `sha256("ape.llm.operator/1|" + catalogSha256)` con `MessageDigest.getInstance("SHA-256")` (`:60-61`), truncado a 24 hex y prefijado `op-` (`:63`). Los dos lados derivan el mismo id del **sha256 del catálogo**, sin protocolo ni handshake (`:57-58`).

---

## 7. Los tres `.tflite`: contenedor válido, redes que no existen

| fichero | bytes | magic (bytes 4-7) | no-cero |
|---|---|---|---|
| `car_denoise_f32.tflite` | 1.676 | **`TFL3`** (`1c 00 00 00 54 46 4c 33`) | 791 (47,2 %) |
| `rife_blend_f32.tflite` | 1.484 | **`TFL3`** | 674 (45,4 %) |
| `sr_unsharp_f32.tflite` | 1.580 | **`TFL3`** | 713 (45,1 %) |

Los tres son **flatbuffers TFLite válidos** (identificador `TFL3` correcto). Pero **1.484-1.676 bytes no es un modelo**: un denoiser, un ESRGAN o un RIFE real ocupan de cientos de KB a MB. **Son stubs.**

**Cómo lo sé y qué no puedo afirmar:** la conclusión sale del **tamaño**, no de una marca en el código. Busqué `stub`/`STUB` en `app/src`: **cero coincidencias**. Lo que sí hay es el código que los carga como si fueran reales:

```
UltraEnhancePipeline.kt:73   carModel    = TfliteInferenceEngine(ctx, "car_denoise_f32.tflite")
UltraEnhancePipeline.kt:82   esrganModel = TfliteInferenceEngine(ctx, "sr_unsharp_f32.tflite")
UltraEnhancePipeline.kt:88   rifeModel   = TfliteInferenceEngine(ctx, "rife_blend_f32.tflite")
```

O sea: **el pipeline afirma cargar tres redes y lo que hay son tres ficheros de ~1,5 KB.** Cualquier documento que describa AI-SR, ESRGAN, RIFE o CAR-CNN **como funcionando** en esta APK está describiendo una intención, no una capacidad.

**AI-PQ: `null` en este firmware.** Los ocho levers de AI-PQ (`aipq_enable`, `aisr_enable`, `ai_pq_mode`, `ai_sr_mode` en `system` y `global`, `ai_pic_mode`, `ai_sr_level`) devuelven **null** en los tres namespaces; también `always_hdr`, `hdr_output_type` y `match_content_frame_rate`. Medido en [`VPP_SOC_QUALITY_20261114.md`](../audits/VPP_SOC_QUALITY_20261114.md):37-40. El device es `Amlogic/oppen_wv4/oppen_wv4:14` (Android 14), **no** el DroidLogic TV 12 que asume la SOP. Y el VPP real (`/sys/class/amvecm`) da **Permission denied** sin root.

> **No documentes AI-SR como si funcionara.** No lo hago: aquí queda escrito que los modelos son stubs y que los levers de AI-PQ no existen en este firmware.

---

## 8. Límite del capturador: disparador, nunca prueba de píxeles

`screencap` / `ImageReader` capturan el **buffer de composición**, que es **anterior** al VPP del SoC y **anterior** a la salida HDMI. Lo razona y lo mide `VPP_SOC_QUALITY_20261114.md:68` (referencia a **documento**, no a fuente `.kt` — conviene no confundirlo).

Consecuencias operativas, y son las que importan:

1. El capturador **sí** vale para: congelación (`freeze_ms`, `stalls`), fps aparente, movimiento, nitidez aparente del frame compuesto.
2. El capturador **no** vale para: certificar que el VPP mejoró nada, ni que el HDR llegó al panel, ni comparar antes/después de una perilla de SoC. Un antes/después de capturas saldría **byte-idéntico** aunque el panel estuviera mostrando otra cosa — falso positivo garantizado.
3. La medición válida de píxeles exige **capturador HDMI externo**. No está disponible.

A esto se suma el hallazgo de t49/t56 que este árbol no contradice: el window manager compone a **1920×1080** sobre un panel 4K y `wm size reset` no lo revierte. Un logo «4K» sobre esa superficie **miente**.

---

## 9. Lo que no se pudo computar (y por qué)

| no computado | razón |
|---|---|
| **`gradle assembleDebug` / `assembleRelease`** | **no hay Android SDK en este host**. No se ha compilado, así que no hay APK nuevo, ni `lint`, ni verificación de que el árbol compile. Todo lo de este documento es lectura estática |
| ABIs dentro del APK | sin compilar no hay APK que inspeccionar (§1.2) |
| contenido de `shim/` | 166 ficheros, ninguno `.kt`/`.java` en la búsqueda; no se abrió su `build.gradle` ni su árbol (§2) |
| 6-7 endpoints del encargo | ausentes del árbol de la APK; su origen real queda sin computar (§5) |
| limitador de 1 muestra / 500 ms | no localizado en las líneas leídas de `ScreenCaptureService.kt` / `StatePublisher.kt` (§4.1) |
| líneas exactas del watchdog de 3.500 ms y de `cpu/gpu/vpu` nulos | no localizadas en esta pasada (§4.2) |
| relanzamiento del `AgentService` tras una caída | sin leer `AgentService.kt` línea a línea no se puede afirmar `START_STICKY` (§3) |
| efecto en píxeles de cualquier perilla | capturador ciego al VPP/HDMI (§8) |

---

## 10. Resumen: lo que esta APK es y lo que no

**Es** una app Android de **paquete `com.ape.crystalagent`**, versión **674 / 3.9.9-…-vpp-local**, `minSdk 22` y `targetSdk 28`, **firmada con la clave de depuración** incluso en release, sin ABIs declaradas, con **12 permisos** —incluido `WRITE_SECURE_SETTINGS`, que sin ADB no se concede—, 89 fuentes en `app/src`, un reproductor Media3 con efectos GL, un capturador de pantalla a media resolución, y tres endpoints verificables contra el VPS.

**No es** —y esto hay que decirlo porque el ecosistema lo da por hecho en varios sitios:
- no publica `levers_now` (publica `{}` vacío, `StatePublisher.kt:41`);
- no mide `first_frame_ms` (solo loguea, `ApePlayer.kt:115`);
- no tiene modelos de IA: tiene tres stubs de ~1,5 KB que el código carga como si lo fueran (`UltraEnhancePipeline.kt:73/82/88`);
- no tiene AI-PQ: sus ocho levers dan `null` en este firmware;
- no puede certificar mejora de imagen: su capturador no ve el VPP ni el HDMI;
- y **no llama a 6-7 de los 10 endpoints** que se le atribuyen.

Lo que sí hace, y hay que reconocérselo: **media bien lo poco que mide**. `bitrate_bps` viaja con su edad y su procedencia (`measured_device`, confianza 0,6) y se degrada a `null`+`unavailable` cuando está rancio (`DeviceSampler.kt:141-146`) — que es exactamente la forma correcta de no mentir con un número viejo. El fallo no está en cómo mide; está en **cuánto** mide.
