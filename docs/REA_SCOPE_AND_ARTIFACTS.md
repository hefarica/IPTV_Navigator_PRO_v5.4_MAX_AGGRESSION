# REA · R1 — Gate de inventario, identidad de paquete y frontera legal

> **Tarea:** `t1` (R1) · **Intento:** `ec868c5d-6a35-451f-9629-6bc800a3f487` · **Miembro:** `recon-lead`
> **Ventana de medición:** 2026-10-25, desde las 21:27 (-05:00, America/Bogota)
> **Host:** estación del propietario (`C:\Users\HFRC`, Windows) · **Alcance:** **solo local, nada remoto**
> **Regla de la sesión:** no se ejecutó ningún APK, no se instaló nada, no se conectó a ningún dispositivo,
> no se tocó el VPS ni ningún servicio remoto.

**Etiquetas de evidencia por afirmación (obligatorias en todo el entregable):**

| Etiqueta | Significado |
|---|---|
| `[observado]` | Medido/leído ahora mismo sobre el artefacto local o la herramienta, con comando reproducible (§A) |
| `[derivado]` | Inferencia directa de una o más observaciones; se declara el razonamiento |
| `[público]` | Conocimiento externo verificable (documentación/estándar/registro público); no se midió aquí |
| `[no disponible]` | No existe artefacto, no se midió, o no se puede establecer con la evidencia actual |

---

## 0. Resumen ejecutivo

**El gate R1 se cumple y cambia el plan a mejor:** el objetivo prioritario del propietario (**OTT Navigator**)
**sí está en disco** desde esta sesión, en dos builds. No hay TiviMate, ni Disney+, ni Prime Video, ni un APK
de Conviva. **No hay dispositivo ADB conectado.** La frontera legal queda fijada: **nada de DRM bypass**.

| # | Pregunta del gate | Respuesta | Etiqueta |
|---|---|---|---|
| 1 | ¿Qué APK existen de verdad? | **9 archivos APK = 8 artefactos únicos** (1 duplicado byte a byte): OTT ×2 builds, SFA/sing-box ×3, v2rayNG ×1, `ape-crystal-agent` debug ×1, X-plore ×1 (fuera de alcance) | `[observado]` |
| 2 | ¿Está OTT Navigator? | **SÍ — 2 builds**: `1.7.3.3` (vc `25110201`, 20,84 MiB) y `1.6.9.4` (vc `23072804`, 70,69 MiB, universal, **Play-stamped**) | `[observado]` |
| 3 | ¿Está TiviMate? | **NO.** Ningún archivo coincide; no hay dispositivo ADB | `[observado]` / `[no disponible]` |
| 4 | ¿Están Disney+ y Prime Video? | **NO.** Y además su eje DRM queda **fuera de alcance** por doctrina y ley | `[observado]` + `[público]` |
| 5 | ¿Hay Conviva? | **No como APK.** 0 coincidencias del SDK dentro de los dex de OTT; en el repo hay 16 archivos propios con ese nombre (14 fuentes JS/PHP/Lua/Python + 2 `.pyc`) | `[observado]` |
| 6 | ¿Dispositivo ADB? | **0 dispositivos** (`adb devices` vacío; adb 36.0.2) | `[observado]` |
| 7 | ¿Qué es analizable? | **7 APK únicos** (OTT ×2, SFA ×3, v2rayNG, `ape-crystal-agent`): los 7 son APK válidos y **3 ya se decompilaron con JADX 0.7.1** (OTT ×2 + agente) | `[observado]` |
| 8 | ¿La vía Java/Dalvik de REA funciona? | **SÍ**, validada en esta sesión con `inspect_android_package` (JADX headless 0.7.1) sobre 3 APK | `[observado]` |

**Hallazgo que corrige una suposición del plan:** los dos OTT **no son el mismo binario ni la misma firma**.
El `1.6.9.4` universal está firmado con la clave `2e1275…` y trae **Play Source Stamp**; el `1.7.3.3`
está firmado con **otra clave** (`6cf278…`), **solo esquema v2**, sin Source Stamp y sin linaje de rotación
→ **no se puede afirmar que sea el artefacto oficial de Play** (`[observado]` + `[derivado]`, §5.1.6).

**Veredicto operativo:** R1 **pasa**. t2 (deep dive) puede arrancar **ya** sobre OTT Navigator. TiviMate y
las apps de streaming comercial quedan como *no disponibles* con instrucciones exactas de aportación (§9.2),
y Disney+/Prime quedan además **excluidas por frontera legal** en todo lo que huela a DRM (§8).

---

## 1. Método, herramientas y cobertura

| Paso | Herramienta | Versión / ruta | Qué produjo | Etiqueta |
|---|---|---|---|---|
| Inventario workspace | `glob` (recursivo, incluye ocultos/ignorados) | — | 5 APK | `[observado]` |
| Inventario Downloads | `Get-ChildItem` + `Get-FileHash` | PowerShell 7 | 4 APK, SHA-256 completo | `[observado]` |
| Identidad de paquete | `aapt` de Android build-tools | `34.0.0` (`C:\Users\HFRC\AppData\Local\Android\Sdk\build-tools\34.0.0\aapt.exe`, v0.2) | package, versión, SDK, ABIs, componentes, flags | `[observado]` |
| Identidad "autoritativa" + clases | REA `inspect_android_package` | `jadx-headless-mcp 0.7.1` | package/SDK/componentes + `class_count`/`resource_count` | `[observado]` |
| Firmas declaradas | REA `inspect_apk_signature` | REA 1 | esquemas, cert SHA-256, Source Stamp, linaje | `[observado]` |
| ADB | REA `list_adb_devices` / `inspect_adb_client` | adb `36.0.2-14143358` (`C:\Android\platform-tools\adb.exe`) | lista de dispositivos **vacía** | `[observado]` |
| Motor de reproducción | Escaneo de bytes de `classes*.dex` (ASCII, case-insensitive) + extracción de `.so` y búsqueda de marcadores | PowerShell / .NET | huellas ExoPlayer/VLC/FFmpeg/Conviva | `[observado]` |
| Contenido del ZIP | `tar -tf` + `System.IO.Compression` | Windows bsdtar + .NET | `lib/**/*.so`, nº de dex, hashes de `classes*.dex` y `resources.arsc` | `[observado]` |

**Cobertura y límites honestos de R1:**

- El barrido del perfil fue **acotado**: workspace completo (glob recursivo) + `Downloads` completo +
  comprobaciones de nombre por patrón (`*tivimate*`, `*disney*`, `*prime*`, `*conviva*`, `*.apk`, `*.xapk`).
  **No se indexó todo el disco**: una búsqueda recursiva sin límites en el perfil (OneDrive/AppData) no
  terminó en tiempo razonable y se canceló. Por tanto: **la ausencia está probada para workspace y
  Downloads, y es "no observada" para el resto del perfil** → `[no disponible]` fuera de esas rutas.
- **No se verificó criptográficamente ninguna firma.** REA reporta lo que el APK *declara*; la autenticidad
  y las cadenas de certificados quedan `[no disponible]` (§B.4).
- **No se ejecutó** ningún APK; los `class_count` son metadatos de JADX, no comportamiento.
- Todo el análisis es **estático y offline**. Cero red, cero dispositivo, cero VPS.

---

## 2. Inventario en disco — los artefactos que EXISTEN

**Rutas base:** `WS = C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · `DL = C:\Users\HFRC\Downloads`

| # | Archivo | Ruta | Bytes | MiB | SHA-256 | mtime local |
|---|---|---|---:|---:|---|---|
| A1 | `studio-scillarium-ottnavigator-25110201-72288060-be45e5b3…apk` | `DL` | 21.849.704 | 20,84 | `b964c27457b43be633ee5828a2dabeb09d7f56a3d39b82172e110ed26039b6fd` | 2026-01-25T10:37:08 |
| A2 | `ott-navigator-1-6-9-4.apk` | `DL` | 74.121.056 | 70,69 | `bd509c0cb24b32deaae19c311b5537f60d5eb4c853163829f625a13d997d6854` | 2025-12-06T20:37:02 |
| A2′ | `ott-navigator-1-6-9-4 (1).apk` | `DL` | 74.121.056 | 70,69 | `bd509c0cb24b32deaae19c311b5537f60d5eb4c853163829f625a13d997d6854` **← idéntico a A2** | 2025-12-06T20:37:19 |
| A3 | `SFA-1.13.11-arm64-v8a.apk` | `WS` | 28.190.211 | 26,88 | `9adfa37e09e8b58c4476cb5ac233e56fd09cdb4e9a30e8ac2cc3f3315999e3b4` | 2026-04-29T19:43:07 |
| A4 | `SFA-1.13.11-armeabi-v7a.apk` | `WS` | 27.919.469 | 26,63 | `1b5e0d84c76ca31f7e979257659c931980ddfc7e63ddf7526d5f0b8ac4fb3e7a` | 2026-04-29T20:03:54 |
| A5 | `SFA-1.11.11-armeabi-v7a.apk` | `WS` | 13.706.426 | 13,07 | `83e2d08f070427c6e047510d4ea4c99b5ad792ef0a659d169d5e0281c48229b0` | 2026-04-29T20:20:09 |
| A6 | `v2rayNG.apk` | `WS` | 30.905.560 | 29,47 | `52a79ed8c0e3ac669a74ad9a988d746e70497044db7de84bfd8c47e419dac56e` | 2026-04-29T20:28:40 |
| A7 | `app-debug.apk` (ape-crystal-agent) | `WS\IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\debug\app-debug.apk` | 34.192.621 | 32,61 | `11101de8979ad68e895af1a29df6496b1f648284a8c5f38e6cf463d70e86b1c1` | 2026-06-18T02:44:50 |
| A8 | `x-plore-file-manager-4-46-00.apk` | `DL` | 11.251.127 | 10,73 | `1f019bde72fd4b6fefb273e57222d26e27449f36d0ecff370448db205c793a3d` | 2026-02-02T08:55:03 |

**Totales:** 9 archivos = **316.257.230 bytes (301,6 MiB)**; **8 artefactos únicos**;
**conjunto analizable (excluye A2′ duplicado y A8 fuera de alcance) = 230.885.047 bytes (220,2 MiB)**. `[observado]`

**Duplicado confirmado:** `A2` y `A2′` tienen el **mismo SHA-256 completo** → **byte a byte idénticos**;
no son dos builds ni dos firmas distintas. `[observado]`

> **Cómo se generó el hash:** `Get-FileHash -Algorithm SHA256` (PowerShell). Comando exacto en §A.1.
> **No hay XAPK/APKS/APKM** en el workspace ni en `Downloads` (glob `*.xapk` = 0; no aparecieron contenedores
> de splits). `[observado]`

---

## 3. Identidad de paquete — tabla consolidada

| APK | `package` | `versionName` | `versionCode` | minSdk | targetSdk | compileSdk | Label | ABIs con nativas |
|---|---|---|---:|---:|---:|---:|---|---|
| A1 · OTT `1.7.3.3` | `studio.scillarium.ottnavigator` | **1.7.3.3** | **25110201** | **26** | **30** | 36 | OTT Navigator | `arm64-v8a`, `armeabi-v7a`, `x86_64` |
| A2 · OTT `1.6.9.4` | `studio.scillarium.ottnavigator` | **1.6.9.4** | **23072804** | **23** | **33** | 33 | OTT Navigator | `arm64-v8a`, `armeabi`, `armeabi-v7a`, `mips`, `mips64`, `x86`, `x86_64` |
| A3 · SFA `1.13.11` arm64 | `io.nekohasekai.sfa` | 1.13.11 | 662 | 23 | 35 | 36 | sing-box | `arm64-v8a` |
| A4 · SFA `1.13.11` armv7 | `io.nekohasekai.sfa` | 1.13.11 | 662 | 23 | 35 | 36 | sing-box | `armeabi-v7a` |
| A5 · SFA `1.11.11` armv7 | `io.nekohasekai.sfa` | 1.11.11 | 520 | 21 | 35 | 35 | sing-box | `armeabi-v7a` |
| A6 · v2rayNG | `com.v2ray.ang` | 1.9.31 | 4000627 | 21 | 35 | 35 | v2rayNG | `armeabi-v7a` |
| A7 · ape-crystal-agent | `com.ape.crystalagent` | 1.0.0 | 1 | 22 | 28 | 34 | APE Crystal Agent | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |
| A8 · X-plore | `com.lonelycatgames.Xplore` | 4.46.00 | 44600 | 26 | 36 | 36 | X-plore | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |

`[observado]` (aapt badging + REA `inspect_android_package`)

**Cuatro datos que importan para el resto del plan:**

1. **OTT `1.7.3.3` sube el mínimo a Android 8.0** (`minSdk 26`) frente a Android 6.0 (`minSdk 23`) del
   `1.6.9.4`. En un parque con Fire OS 7 (Android 9) y Android TV modernos no hay problema, pero un box
   Android 6/7 **solo** puede instalar el `1.6.9.4`. `[observado]` + `[público]` (mapeo API↔versión Android)
2. **`targetSdk` bajó de 33 a 30** entre builds (`1.6.9.4`→`1.7.3.3`), mientras `compileSdk` subió a 36.
   Es una decisión del publicador; a nosotros nos importa una consecuencia concreta: **ambos permiten
   tráfico en claro** (§5.1.7). `[observado]`
3. **v2rayNG 1.9.31 solo trae nativas `armeabi-v7a`** → depende de la compatibilidad 32-bit del equipo;
   en un Android TV *solo-64-bit* no tendría `libgojni.so` que cargar. `[observado]` + `[derivado]`
4. **`ape-crystal-agent` es `debug` y `debuggable=true`**, `targetSdk 28`: es un artefacto de desarrollo
   del propietario, no un release. Analizarlo es legítimo (código propio) y además **existe el proyecto
   Gradle completo** al lado del APK → para este artefacto la fuente manda sobre el binario. `[observado]`

---

## 4. Librerías nativas observadas (lo que realmente se puede cargar)

| APK | `lib/<abi>` observadas |
|---|---|
| A1 · OTT 1.7.3.3 | `libapplovin-native-crash-reporter.so`, `libchelper.so`, **`libffmpegJNI.so`**, `libmmkv.so`, `librtmp-jni.so`, `libzstd-jni-1.5.7-4.so` (× `arm64-v8a`, `armeabi-v7a`, `x86_64`). **No hay `libvlc.so` ni `libvlcjni.so`** |
| A2 · OTT 1.6.9.4 | **`libvlc.so`**, **`libvlcjni.so`**, `libffmpegJNI.so`, `libchelper.so`, `librtmp-jni.so`, `libmmkv.so`, `libimagepipeline.so`, `libnative-filters.so`, `libnative-imagetranscoder.so`, `libc++_shared.so` (× `arm64-v8a`, `armeabi-v7a`, `x86`; `librtmp-jni` además en `armeabi`, `mips`, `mips64`) |
| A3/A4 · SFA 1.13.11 | **`libbox.so`** (sing-box core), `libandroidx.graphics.path.so`, `libimage_processing_util_jni.so`, `libsurface_util_jni.so` |
| A5 · SFA 1.11.11 | **`libbox.so`**, `libimage_processing_util_jni.so`, `libsurface_util_jni.so` |
| A6 · v2rayNG | **`libgojni.so`** (Xray core), **`libhysteria2.so`**, `libtun2socks.so`, `libmmkv.so`, `libimage_processing_util_jni.so` — **solo `armeabi-v7a`** |
| A7 · ape-crystal-agent | **`libtensorflowlite_jni.so`**, **`libtensorflowlite_gpu_jni.so`**, **`libwg-go.so`**, `libwg-quick.so`, `libwg.so` (× `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) |

`[observado]` (listado de entradas `lib/**/*.so` del ZIP, §A.3)

**Huellas de motor de reproducción (escaneo de `classes*.dex`):**

| Motor | OTT `1.6.9.4` | OTT `1.7.3.3` |
|---|---:|---:|
| `com/google/android/exoplayer` (ExoPlayer 2.x) | **97** hits | **369** hits |
| `org/videolan` (bindings VLC) | 150 | 152 |
| `libvlc` | 178 | 182 |
| `ffmpeg` | 34 | 34 |
| `androidx/media3` | **0** | **0** |
| `mpv` / `ijkplayer` | 3 / 0 | 1 / 0 |
| **`conviva`** | **0** | **0** |

`[observado]` (búsqueda ASCII case-insensitive sobre los dex)

`[derivado]` En `1.7.3.3` el motor principal es **ExoPlayer 2** con decodificador de software FFmpeg:
`libffmpegJNI.so` contiene las cadenas `ExoPlayer` (9 hits) y `Lavc58.54.100` (FFmpeg 4.2). Las clases de
VLC siguen en el dex, pero **el binario nativo de VLC no está empaquetado** en ese build → en `1.7.3.3`
la ruta VLC no tiene librería que cargar; en `1.6.9.4` sí (`libvlc.so`). `[observado]` (ausencia del `.so`)
+ `[derivado]` (consecuencia). Esto se confirmará/refutará en t2 leyendo el código de selección de player.

**Conviva:** `0` hits en ambos dex → **el SDK de Conviva no está embebido en OTT Navigator**.
La plataforma Conviva del proyecto es **código propio del repo** (15 archivos JS/PHP/Lua, §6.4), no un APK.

---

## 5. Deep dive de identidad por app (nivel gate; el código es t2)

### 5.1 OTT Navigator — `studio.scillarium.ottnavigator` (objetivo prioritario)

#### 5.1.1 Build `1.7.3.3` (vc `25110201`, 20,84 MiB) — el más reciente

| Campo | Valor | Etiqueta |
|---|---|---|
| `versionName` / `versionCode` | `1.7.3.3` / `25110201` | `[observado]` |
| SDK | min 26 · target 30 · compile 36 | `[observado]` |
| Clases / recursos | **13.492 clases** · 3.124 recursos | `[observado]` (JADX metadata) |
| Componentes | **62 activities · 11 services · 12 receivers · 6 providers** · 95 `meta-data` · 4 `uses-library` | `[observado]` |
| Actividades propias | `MainActivity` (LAUNCHER + **LEANBACK_LAUNCHER**), `EditProviderActivity`, **`PlayerActivity`**, `StudioActivity`, **`VodPlayActivity`** | `[observado]` |
| Receiver propio | `bootr.BootUtils` (`BOOT_COMPLETED`, `QUICKBOOT_POWERON`) | `[observado]` |
| Dex | 2 (`classes.dex` 9.659.224 B · `classes2.dex` 8.058.336 B) | `[observado]` |
| `resources.arsc` | 6.695.364 B | `[observado]` |
| Permisos notables | `INTERNET`, `ACCESS_NETWORK_STATE`, `READ/WRITE_EXTERNAL_STORAGE`, `READ/WRITE_EPG_DATA`, `SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, **`QUERY_ALL_PACKAGES`**, `com.appcoins.BILLING`, `com.android.vending.CHECK_LICENSE`, `AD_ID` | `[observado]` |
| SDKs de terceros visibles en el manifiesto | Google Mobile Ads + Cast, **AppLovin MAX** (19 activities, 14 de ellas debuggers), **Huawei Ads/PPS** (30 activities), **AppCoins billing**, `ru.ok.tracer`, WorkManager, Room | `[observado]` |
| Flags de `application` | `usesCleartextTraffic=true` · `largeHeap=true` · `requestLegacyExternalStorage=true` · `extractNativeLibs=true` · `allowBackup=true` · **sin `networkSecurityConfig`** | `[observado]` |

#### 5.1.2 Build `1.6.9.4` (vc `23072804`, 70,69 MiB) — universal, con Provenance de Play

| Campo | Valor | Etiqueta |
|---|---|---|
| SDK | min 23 · target 33 · compile 33 | `[observado]` |
| Clases / recursos | **10.315 clases** · 2.394 recursos | `[observado]` |
| Componentes | **11 activities · 11 services · 11 receivers · 2 providers** · 15 `meta-data` · 3 `uses-library` | `[observado]` |
| Actividades propias | las mismas 5 (`MainActivity`, `EditProviderActivity`, `PlayerActivity`, `StudioActivity`, `VodPlayActivity`) | `[observado]` |
| Receiver propio | `studio.scillarium.ottnavigator.utils.BootUtils` | `[observado]` |
| Dex | 2 (`classes.dex` 9.596.272 B · `classes2.dex` 769.288 B) | `[observado]` |
| `resources.arsc` | 4.717.952 B | `[observado]` |
| Permisos notables | mismos ejes; aquí `com.android.vending.BILLING` (no `com.appcoins.BILLING`), **sin** `QUERY_ALL_PACKAGES` | `[observado]` |
| Terceros | Google Mobile Ads + Cast, Play Core/AssetPacks, WorkManager, Room, billing | `[observado]` |
| Metadatos de split | `com.android.vending.splits`, `com.android.vending.derived.apk.id`, `com.android.dynamic.apk.fused.modules` → el manifiesto declara provenir de un **App Bundle** (build "fused"/universal) | `[observado]` |
| Flags de `application` | `usesCleartextTraffic=true` · `largeHeap=true` · `requestLegacyExternalStorage=true` · `extractNativeLibs=true` · `allowBackup=true` · **sin `networkSecurityConfig`** | `[observado]` |

#### 5.1.3 Diff de contenido entre A1 y A2 (lo que el capitán pidió: "¿difiere el dex?")

| Entrada | A2 (`1.6.9.4`) | A1 (`1.7.3.3`) | ¿Igual? |
|---|---|---|---|
| `AndroidManifest.xml` | 26.568 B · `f2466435…` | 64.304 B · `a49f0995…` | **No** |
| `classes.dex` | 9.596.272 B · `82eaa527…` | 9.659.224 B · `56ecf729…` | **No** |
| `classes2.dex` | 769.288 B · `b265d9f1…` | 8.058.336 B · `554b2d01…` | **No** |
| `resources.arsc` | 4.717.952 B · `eb191ec9…` | 6.695.364 B · `109b1b41…` | **No** |

`[observado]` → **son builds distintos**, como corresponde a versiones distintas. Hashes completos en §C.

#### 5.1.4 Comparación útil: A3 vs A4 (SFA mismo build, dos ABIs)

`AndroidManifest.xml`, `classes.dex` y `resources.arsc` son **idénticos byte a byte** entre
`SFA-1.13.11-arm64-v8a.apk` y `SFA-1.13.11-armeabi-v7a.apk` (`fbe0d90c…`, `7a7d9a29…`, `a99f8b37…`).
`[observado]` → **misma compilación**, solo cambia `lib/<abi>`. Analizar uno de los dos cubre el código;
el otro solo aporta la variante nativa. (El `1.11.11` **sí** es otro build: dex `a0f54efb…`, 3,59 MB.)

#### 5.1.5 Firmas declaradas (lo que el APK dice de sí mismo)

| APK | Esquemas | Cert SHA-256 | Source Stamp (Play) | Linaje de rotación | Fuerte |
|---|---|---|---|---|---|
| A1 OTT `1.7.3.3` | **solo v2** | `6cf278ec532189b3dbb36436c5fab655bb30de413da32472d044051de1364e86` | **No** | No | v2 |
| A2 OTT `1.6.9.4` | v1 + v2 + **v3** | `2e12755bee0b69aac72bb0613ea8d5b9e8683ecc3df3f7534fbb99b054be267d` | **Sí** (`3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d`) | No | v3 |
| A3/A4 SFA `1.13.11` | v1 + v2 | `32250a4b5f3a6733df57a3b9ec16c38d2c7fc5f2f693a9636f8f7b3be3549641` | No | No | v2 |
| A5 SFA `1.11.11` | v1 + v2 | `32250a4b5f3a6733df57a3b9ec16c38d2c7fc5f2f693a9636f8f7b3be3549641` | No | No | v2 |
| A6 v2rayNG | v1 + v2 | `b7dc883e7678d6c618569e48a1c8c267a134a75f8bcb763510c8bffb3b90b077` | No | No | v2 |
| A7 ape-crystal-agent | v1 + v2 | `1935b44070faa3a59386ebe3c83aeedf5b834d4b0bd4bed0c256439adc08faf2` | No | No | v2 |

`[observado]` (REA `inspect_apk_signature`). **Caveat:** REA **no verifica** las firmas; reporta lo
declarado. La autenticidad real de cada clave es `[no disponible]` sin una referencia oficial.

#### 5.1.6 Consecuencia de la firma (importante para el propietario)

- A2 (`1.6.9.4`) es el único OTT con **Source Stamp de Play** y v3 → `[derivado]` es un artefacto
  distribuido por Google Play (o extraído de una instalación de Play).
- A1 (`1.7.3.3`) declara **otra clave**, sin v3 y sin Source Stamp. Si fuera el build oficial de Play del
  mismo publicador debería conservar la clave `2e1275…` o, si hubiera rotación, traer **linaje v3** — no
  ocurre ninguna de las dos. `[derivado]` **Procedencia no establecida**: es un build re-firmado (patrón
  habitual de espejos tipo APKPure/APKCombo) o una firma alternativa; **no se puede afirmar que sea el
  binario oficial**.
- Efecto práctico: **A1 no se puede instalar "encima" de A2** (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` por
  firma distinta). Instalar A1 implica **desinstalar** la versión Play y **perder las actualizaciones de
  Play**. `[derivado]` (regla estándar de Android sobre identidad de firma) + `[público]`
- **Nada de esto impide el análisis estático**: ambos se abren y decompilan; la diferencia es de
  **procedencia**, y debe declararse así en todo entregable.

#### 5.1.7 Lectura para el stack IPTV (compatibilidad)

- **`usesCleartextTraffic=true`** en ambos builds → OTT **puede** abrir `http://` sin TLS (Xtream/M3U8
  legados). `[observado]` (atributo en manifiesto). Sin `networkSecurityConfig` que lo restrinja.
- `QUERY_ALL_PACKAGES` en `1.7.3.3` → puede enumerar apps instaladas (relevante para "abrir en player
  externo" y para la matriz de players del equipo). `[observado]`
- `SYSTEM_ALERT_WINDOW` + `FOREGROUND_SERVICE` → overlays y reproducción en segundo plano.
- `largeHeap=true` + `PlayerActivity`/`VodPlayActivity` separadas → arquitectura de reproducción con
  proceso principal pesado; el buffer real se mide en t2 (código), no aquí.
- `minSdk 26` en A1 vs `23` en A2 → la matriz de compatibilidad por dispositivo debe considerar **qué
  build** tiene el propietario; hoy **no sabemos qué versión corre en su equipo** (`[no disponible]`, §9.2).

### 5.2 SFA / sing-box — `io.nekohasekai.sfa` (A3, A4, A5)

| Campo | `1.13.11` (A3/A4) | `1.11.11` (A5) | Etiqueta |
|---|---|---|---|
| `versionCode` | 662 | 520 | `[observado]` |
| SDK | min 23 · target 35 · compile 36 | min 21 · target 35 · compile 35 | `[observado]` |
| Componentes | **1 activity · 8 services · 6 receivers · 5 providers** | 12 · 11 · 11 · 3 | `[observado]` |
| UI | `io.nekohasekai.sfa.compose.MainActivity` (**Jetpack Compose**) | 12 activities View/XML (`ui.MainActivity`, `NewProfileActivity`, `EditProfileActivity`, `QRScanActivity`, `DebugActivity`, `VPNScanActivity`, `PerAppProxyActivity`, …) | `[observado]` |
| Núcleo | servicios `VPNService`, `ProxyService`, `RootServer`, `TileService` | idem | `[observado]` |
| Integraciones | `ShizukuProvider`, `XposedProvider`, `WorkingDirectoryProvider` (root/Shizuku opt-in) | `FileProvider` + ML Kit de códigos de barras | `[observado]` |
| Nativo | `libbox.so` | `libbox.so` | `[observado]` |
| Firma | v1+v2 · `32250a4b…` | v1+v2 · **`32250a4b…` (misma clave)** | `[observado]` |

`[derivado]` Que `1.11.11` y `1.13.11` declaren **la misma clave** es la señal esperable de una cadena de
release oficial (misma identidad de firma a través de versiones), a diferencia de lo que ocurre entre los dos
OTT (§5.1.6). No sustituye una verificación criptográfica contra el certificado publicado por el proyecto.

`[derivado]` A3 y A4 son el **mismo build** (§5.1.4): para análisis de código basta uno; el segundo solo
aporta la variante `arm64`. A5 es un **build anterior** (UI clásica, ML Kit, dex 2,5× menor) y sirve como
**línea base de comparación de versiones** (t2/t6). `[público]` "SFA" = cliente Android oficial de
sing-box; `libbox` es el core embebido.

### 5.3 v2rayNG — `com.v2ray.ang` (A6)

| Campo | Valor | Etiqueta |
|---|---|---|
| Versión | `1.9.31` (vc `4000627`) | `[observado]` |
| SDK | min 21 · target 35 · compile 35 | `[observado]` |
| Componentes | **20 activities · 10 services · 12 receivers · 2 providers** | `[observado]` |
| Servicios propios | `V2RayVpnService` (con `SUPPORTS_ALWAYS_ON`), `V2RayProxyOnlyService`, `V2RayTestService`, `QSTileService` | `[observado]` |
| Actividades propias | `ui.MainActivity`, `ServerActivity`, `ServerCustomConfigActivity`, `SettingsActivity`, `PerAppProxyActivity`, `ScannerActivity`, `LogcatActivity`, `RoutingSettingActivity`, `RoutingEditActivity`, `SubSettingActivity`, `SubEditActivity`, `UserAssetActivity`, `UserAssetUrlActivity`, `ScScannerActivity`, `ScSwitchActivity`, `UrlSchemeActivity`, `AboutActivity`, `TaskerActivity` | `[observado]` |
| Nativas | `libgojni.so`, `libhysteria2.so`, `libtun2socks.so`, `libmmkv.so` — **solo `armeabi-v7a`** | `[observado]` |
| Firma | v1+v2 `b7dc883e…` | `[observado]` |

Nota de alcance: se analiza como **cliente de routing autorizado del propietario**. No se analiza para
evadir autenticación de terceros ni para saltar términos de servicio de un proveedor (doctrina AGENTS.md).

### 5.4 `ape-crystal-agent` — `com.ape.crystalagent` (A7, código propio)

| Campo | Valor | Etiqueta |
|---|---|---|
| Versión | `1.0.0` (vc `1`) · **debug** | `[observado]` |
| SDK | min 22 · target **28** · compile 34 | `[observado]` |
| Clases / recursos | **5.648 clases** · 413 recursos | `[observado]` |
| Dex | 5 (`classes.dex` 8.153.236 · `classes2.dex` 62.020 · `classes3.dex` 137.208 · `classes4.dex` 2.412.420 · `classes5.dex` 9.417.328) | `[observado]` |
| Componentes | `MainActivity` (LAUNCHER + **LEANBACK**, exported) · `PlayerActivity` (exported) · `AgentService` (no exported) · `BootReceiver` (`BOOT_COMPLETED`/`QUICKBOOT`/`MY_PACKAGE_REPLACED`) · `FileProvider` (`com.ape.crystalagent.provider`) · **`com.wireguard.android.backend.GoBackend$VpnService`** (`BIND_VPN_SERVICE`) | `[observado]` |
| Permisos | `INTERNET`, `ACCESS_NETWORK_STATE`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, **`WRITE_SECURE_SETTINGS`**, `REQUEST_INSTALL_PACKAGES`, storage, `READ_PHONE_STATE`, `INTERNET` | `[observado]` |
| Nativas | TFLite (CPU + **GPU delegate**) + **WireGuard-go** (`libwg-go.so`, `libwg-quick.so`, `libwg.so`) | `[observado]` |
| `uses-native-library` | `libOpenCL.so`, `libOpenCL-car.so`, `libOpenCL-pixel.so` (opcionales) | `[observado]` |
| Flags | **`debuggable=true`** · `usesCleartextTraffic=true` · `allowBackup=false` · `extractNativeLibs=true` | `[observado]` |
| Firma | v1+v2 `1935b440…` (clave de debug, no Play) | `[observado]` |

`[derivado]` Es coherente con lo que el proyecto declara: agente on-device con inferencia TFLite (y delegate
GPU/OpenCL) y túnel WireGuard, más `WRITE_SECURE_SETTINGS` para aplicar ajustes del sistema. Al ser **código
propio y build debug**, t2 puede analizar **la fuente Gradle** (más fuerte que el dex) y usar el APK solo
para confirmar el empaquetado.

### 5.5 X-plore (A8) — fuera de alcance

Gestor de archivos (`com.lonelycatgames.Xplore`, 4.46.00, min 26 / target 36). Se inventaría para completitud,
no se analiza: no es player, ni transporte, ni parte del stack de streaming. `[observado]`

---

## 6. Presencia/ausencia de los objetivos pedidos

### 6.1 Tabla de veredicto

| Objetivo | ¿APK en disco? | Evidencia | Estado |
|---|---|---|---|
| **OTT Navigator** | **SÍ — 2 builds** (A1 `1.7.3.3`, A2 `1.6.9.4` universal) | §2, §5.1 | **ANALIZABLE** |
| **TiviMate** | **NO** | Glob `*tivimate*` en workspace = 0; `Downloads` sin coincidencias; sin dispositivo ADB; sin contenedores XAPK/APKS | **NO DISPONIBLE** |
| **Disney+** | **NO** | Glob `*disney*` = 0; `Downloads` sin coincidencias; sin ADB | **NO DISPONIBLE + FUERA DE ALCANCE DRM** |
| **Prime Video** | **NO** | Glob `*prime*` = 0; `Downloads` sin coincidencias; sin ADB | **NO DISPONIBLE + FUERA DE ALCANCE DRM** |
| **Conviva** | **NO como APK** | Glob `*conviva*` solo devuelve módulos propios del repo (15 archivos, §6.4); **0 hits** de "conviva" en los dex de OTT | **NO DISPONIBLE (SDK no embebido)** |

### 6.2 Lo que sí existe y se parece a los objetivos (para no confundir)

- `SFA-*.apk` **no** es una app de streaming: es **sing-box** (`io.nekohasekai.sfa`), cliente de túnel.
- `v2rayNG.apk` es un cliente de proxy/túnel, no un player.
- `ape-crystal-agent` es el agente propio (TFLite + WireGuard), no un player comercial.
- OTT Navigator es **el único player real** en disco. Es exactamente el objetivo prioritario del propietario.

### 6.3 ADB — no hay dispositivo

`list_adb_devices` → `{"devices": [], "may_have_started_adb_server": false}`; cliente `adb 36.0.2-14143358`
en `C:\Android\platform-tools\adb.exe`. `[observado]`
Por tanto **no se puede extraer ningún APK del equipo del propietario en esta sesión**. La extracción legítima
solo es posible con el dispositivo conectado y **autorizado por RSA en el propio dispositivo** (ver §9.2).
`[público]` + truth-guard #3 del manifiesto APE: *"ADB no se habilita remoto"*.

### 6.4 Conviva: qué hay realmente

No hay APK de Conviva (Conviva es un SDK de QoE que se embebe en apps; no se distribuye como app suelta).
En este repo **sí** existe la implementación propia compatible/equivalente: **16 archivos** (14 fuentes +
2 `.pyc` compilados), según el glob `*conviva*`:

```
IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-qoe-engine.js
IPTV_v5.4_MAX_AGGRESSION/frontend/js/conviva-stream-widget.js
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva-qoe-engine.js
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_persistence.php
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_qoe_server.php
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/conviva_event_schema.json
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-stream.php
IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-conviva-event.conf
IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/prisma-conviva-stream.conf
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/test_conviva_phase2_static.py
IPTV_v5.4_MAX_AGGRESSION/tools/adb_conviva_push_agent.py
IPTV_v5.4_MAX_AGGRESSION/tools/adb-conviva-push.sh
IPTV_v5.4_MAX_AGGRESSION/tools/adb-conviva-push.service
IPTV_v5.4_MAX_AGGRESSION/tools/__pycache__/adb_conviva_push_agent.cpython-314.pyc
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/__pycache__/test_conviva_phase2_static.cpython-314-pytest-9.0.3.pyc
```

`[observado]` (glob `*conviva*`). Ojo: son **nombres de archivo**; su contenido y vigencia se validan en la
tarea de matriz de headers / QoE, no en R1.

---

## 7. Dispositivo y extracción legítima (ADB)

**Estado:** sin dispositivos. `[observado]`

**Qué haría falta para extraer APK del propietario de forma legítima** (todo en el equipo del propietario,
nunca en remoto):

1. En el dispositivo: **Ajustes → Información → 7 toques en "Número de compilación"** → Opciones de
   desarrollador → **Depuración USB / ADB** ON (en Android TV: "Depuración de red" si es por LAN).
2. Conectar por USB (o `adb connect <IP>:5555` en la misma LAN **autorizada**).
3. En el PC: `adb devices` debe mostrar el equipo como **`device`** (si dice `unauthorized`, aceptar el
   diálogo RSA **en el televisor/box**; si dice `offline`, reconectar).
4. Resolver paquete y extraer (comandos exactos en §9.2 / §A.5).

**Prohibido en este proyecto:** habilitar ADB por vía remota/desde la playlist, o automatizar el "accept"
RSA sin intervención del propietario. Es un truth-guard del manifiesto y además un riesgo de seguridad.

---

## 8. Frontera legal — nada de DRM bypass

### 8.1 La regla (cardinal, no negociable)

> Trabajamos **solo** con artefactos, streams, credenciales, servidores y tráfico **del propietario y
> autorizados**. **No** implementamos evasión de DRM: ni handshake de licencias, ni extracción de claves,
> ni Widevine/PlayReady para evadir, ni HDCP para saltarse una ruta protegida, ni descifrado de contenido,
> ni redistribución de señal. (`AGENTS.md` §"REGLA LEGAL Y ÉTICA"; `CLAUDE.md` misma regla.)

`[público]` Base legal del límite (categorías, sin pretender asesoría jurídica): la elusión de **medidas
tecnológicas de protección** (TPM/DRM) está prohibida en EE. UU. (**17 U.S.C. §1201 DMCA**), en la UE
(**Directiva 2001/29/CE, art. 6**) y en Colombia la **Ley 1915 de 2018** (que implementa los tratados de
la OMPI e incorpora protección de TPM), además de los **ToS** de cada servicio. Cualquier caso concreto
debe revisarlo un abogado; este documento solo fija el **límite operativo del proyecto**.

### 8.2 Preguntas que caen FUERA y por qué (con alternativa lícita)

| # | Petición (típica) | Veredicto | Por qué | Alternativa lícita que sí ofrecemos |
|---|---|---|---|---|
| L1 | "Replicar el **handshake de licencia** de Disney+/Prime" (license request/response, `licenseUrl`) | **PROHIBIDO** | Es el corazón de la TPM: obtener/emitir licencias sin ser el licenciatario es elusión + acceso no autorizado | Documentar **cómo un player propio integra su propio DRM licenciado** (media3 + Widevine L1/L3 del device) para **contenido del propietario** |
| L2 | "Implementar **Widevine/PlayReady para evadir**" (L3→L1, CDM parcheado, emulación de device) | **PROHIBIDO** | Suplantar el nivel de seguridad del CDM es elusión pura | Medir **capacidades declaradas** del dispositivo (`MediaDrm` security level) para la matriz de compatibilidad, sin alterarlas |
| L3 | "Extraer **keys** (KID/KEY) / descifrar segmentos" | **PROHIBIDO** | Extracción de claves = circunvención; además convierte el repo en herramienta de piratería | Analizar **cifrado legítimo del propio stack** (`#EXT-X-KEY` de nuestros streams, AES-128/SAMPLE-AES) y su correcta emisión |
| L4 | "**HDCP bypass** / forzar 4K saltándose HDCP" | **PROHIBIDO** | Es la evasión de la protección de la ruta de vídeo | Diagnosticar **por qué** el device negocia HDCP 1.4/2.x y proponer la configuración **soportada** (o degradar con etiqueta honesta) |
| L5 | "Capturar el **manifest de Disney+** y re-servirlo desde el VPS" | **PROHIBIDO** | Redistribución de señal + elusión + ToS | Re-servir **solo** streams del proveedor autorizado del propietario (Xtream/M3U propio) |
| L6 | "**Desbloquear el premium** de OTT Navigator / TiviMate (AppCoins/Play Billing)" | **PROHIBIDO** | Es circunvención de un mecanismo de licencia de software (pago) | Analizar el **comportamiento del player** (ABR, buffer, headers, códecs) que no depende del premium |
| L7 | "Usar **credenciales/tokens de un tercero** o saltar la autenticación del proveedor" | **PROHIBIDO** | Acceso no autorizado | Trabajar con **las credenciales del propietario** y diagnosticar sus 401/403 legítimos |
| L8 | "Descargar el APK de Disney+/Prime de un espejo y parchearlo" | **PROHIBIDO** | Combina obra derivada + elusión + ToS | Si el propietario **quiere** compatibilidad, se mide en **su** dispositivo con **su** suscripción, sin tocar el binario |
| L9 | "Analizar el **DRM** de OTT Navigator" (tiene referencias Widevine/PlayReady en dex) | **FUERA** en su eje DRM | 3 hits de `widevine` / 3 de `playready` son **API estándar** de `MediaDrm`, no un bypass; analizarlos *para evadir* sería elusión | Se analiza **solo** la selección de player/códecs/ABR/headers; el eje DRM se documenta como "no analizado" |
| L10 | "Verificar que mi TV reproduce **mi** contenido DRM" | **PERMITIDO** | Es reproducción lícita del propietario | Prueba de capability + logs del player + matriz de compatibilidad |

### 8.3 Lo que SÍ entra (y es el 90 % del valor del plan)

1. **REA estático de los APK del propietario** (OTT ×2, SFA ×3, v2rayNG, agente propio) — incluido
   descompilar, leer clases, comparar versiones, extraer cadenas y mapear flujos.
2. **Base de conocimiento pública** de ExoPlayer/media3, hls.js, Shaka y dash.js sobre **ABR / buffer /
   bandwidth**, citando `file:line` del código abierto (esto no toca ningún DRM).
3. **Matriz de headers** solo donde haya evidencia del propio stack (EXTHTTP, matriz v9 de 139 headers).
4. **Diagnóstico de la infraestructura propia** (bounce de nginx, breaker del gateway, 4K NO-GO) — ya
   cubierto por `docs/REA_DIAGNOSIS_AND_FIXES.md` (H1–H4), que R1 **no duplica**.
5. **Compatibilidad de players** por dispositivo/codec/HDR/DRM-como-capacidad, no como evasión.

---

## 9. Veredicto del gate

### 9.1 Artefactos ANALIZABLES (orden recomendado)

| Prioridad | Artefacto | Por qué | Qué sacar (t2 y siguientes) | Etiqueta |
|---|---|---|---|---|
| **P0** | **OTT `1.7.3.3`** (A1) | Es el objetivo del propietario y el build **más reciente**; 13.492 clases; ExoPlayer2 + FFmpeg | Selección de player, ABR/buffer/bandwidth, headers HTTP que emite, timeouts, códecs/HDR declarados, endpoints de telemetría/ads, `PlayerActivity` vs `VodPlayActivity`, `StudioActivity` | `[observado]` |
| **P1** | **OTT `1.6.9.4` universal** (A2) | Build **Play-stamped** y con **VLC nativo**; línea base de comparación | Diff 1.6.9.4→1.7.3.3 (qué se eliminó: VLC nativo), comportamiento VLC vs ExoPlayer, headers | `[observado]` |
| P2 | **SFA `1.13.11`** (A3 **o** A4 — mismo build) | Core `libbox` + patrones de túnel/Shizuku | Cómo expone perfiles, routing, DNS, y su servicio VPN (para el stack de red autorizado) | `[observado]` |
| P3 | **SFA `1.11.11`** (A5) | Build anterior | Comparación de versiones (qué cambió de UI y de core) | `[observado]` |
| P4 | **v2rayNG `1.9.31`** (A6) | Cliente de transporte alternativo | Routing, hysteria2, tun2socks, gestión de perfiles | `[observado]` |
| P5 | **`ape-crystal-agent` debug** (A7) | **Código propio**; fuente Gradle disponible | Pipeline TFLite/GPU, WireGuard, aplicación de settings (`WRITE_SECURE_SETTINGS`), `/ara/*` si aplica | `[observado]` |

> **Matiz sobre "cuál OTT usar para el código" (corrección al plan inicial):** el capitán propuso el
> universal (A2) para el análisis de código. Con la evidencia de esta sesión, la recomendación es
> **analizar A1 como primario** (es la versión vigente del producto y la que el propietario probablemente
> ejecuta) y **A2 como línea base/diff** (es el único con procedencia Play y el único con VLC nativo).
> Motivo: el código de 1.6.9.4 **no** es el de la app actual (13.492 vs 10.315 clases; difiere el motor
> de reproducción). Si el propietario confirma que su equipo corre 1.6.9.4, el orden se invierte.
> `[derivado]` de §5.1.3/§5.1.6. **No sabemos qué versión está instalada en su equipo** → `[no disponible]`.

### 9.2 Artefactos NO DISPONIBLES — instrucciones exactas para aportarlos

Convención de destino propuesta (para que t2 no adivine rutas):
`C:\Users\HFRC\Downloads\<app>-<version>.apk` (o `<app>-base.apk` + `split_*.apk`).

#### (a) TiviMate — falta

**Opción 1 — copia local (más simple).** En el equipo donde esté instalado, usar un gestor de archivos
(X-plore ya está en `Downloads`) o la opción "compartir app" y dejar el APK en:
`C:\Users\HFRC\Downloads\tivimate-<version>.apk`. Si hay **splits**, copiar todos los `.apk` del paquete.

**Opción 2 — por ADB (recomendada: trae base + splits exactos).** En el PC, con el equipo conectado y
**autorizado**:

```powershell
# 1) ¿está conectado y autorizado?
adb devices
#    debe listar "<serial>    device"  (si dice "unauthorized": aceptar RSA en el TV/box)

# 2) encontrar el paquete (por nombre, sin fijar un id a ciegas)
adb shell pm list packages | Select-String -Pattern 'tivimate'
#    p.ej.  package:ar.tvplayer.tv

# 3) ver TODOS los APK del paquete (base + splits)
adb shell pm path ar.tvplayer.tv        # sustituir por el id real del paso 2

# 4) traerlos (repetir por cada ruta que devuelva el paso 3)
adb pull /data/app/.../base.apk C:\Users\HFRC\Downloads\tivimate-base.apk
```

`[público]` El id de TiviMate suele citarse como `ar.tvplayer.tv`, pero **no se fija aquí sin verificación
en el dispositivo**; por eso el paso 2 busca por nombre.

> **Alcance del análisis de TiviMate cuando llegue:** comportamiento de player, ABR/buffer/bandwidth,
> headers, compatibilidad de códecs/HDR. **NO** se analiza el desbloqueo de TiviMate Premium (L6).

#### (b) Disney+ y Prime Video — faltan y además tienen eje DRM fuera de alcance

**Cómo aportarlos (si el propietario quiere análisis de compatibilidad):** mismo procedimiento que TiviMate
(`pm list packages` → `pm path` → `adb pull`), con el APK de **su propia instalación y suscripción**.
Nunca desde un espejo ni parcheado.

**Qué se haría y qué no:** se podría mirar **superficie de compatibilidad** (qué exige el device: códecs,
nivel de DRM declarado, HDR) y comportamiento de reproducción **observable**, pero **no** handshake de
licencias, ni claves, ni CDM, ni HDCP (L1–L4). En la práctica, para el objetivo del plan (ABR/buffer/
bandwidth), la vía lícita y suficiente es la **base de conocimiento pública** (§8.3-2) más **nuestro**
stack. `[público]`

#### (c) Conviva — no hay APK (no aplica)

Conviva es un SDK embebido; no existe "APK de Conviva". Si el propietario quiere análisis de una app
**que sí lo embeba**, debe aportar ese APK (y declararlo). Para nuestro stack, lo que hay es la
implementación propia del repo (§6.4) + el observer server-side de nginx documentado en `CLAUDE.md`.

#### (d) Dispositivo (para todo lo anterior)

Ver §7. Sin dispositivo autorizado no hay extracción. **No** se habilita ADB en remoto.

### 9.3 Checklist de aceptación de R1

| # | Criterio del encargo | Estado | Evidencia |
|---|---|---|---|
| 1 | Inventario real (workspace + perfil), tamaño y SHA-256; presencia/ausencia de TiviMate, OTT, Disney+, Prime, Conviva | **CUMPLIDO** | §2, §6 (9 archivos, 8 únicos, SHA-256 completo) |
| 2 | Identidad de los APK disponibles: package, versión, min/targetSdk, componentes, nativas | **CUMPLIDO** | §3, §4, §5 (aapt + JADX + ZIP) |
| 3 | Comprobar ADB y, si hay dispositivo, resolver tivimate/ott | **CUMPLIDO** (0 dispositivos; procedimiento listo) | §6.3, §7, §9.2 |
| 4 | Frontera legal: qué queda fuera y alternativa lícita | **CUMPLIDO** | §8 (L1–L10 + lo que sí entra) |
| 5 | Veredicto: analizables vs no disponibles + instrucciones exactas | **CUMPLIDO** | §9.1, §9.2 |
| — | Entregable `docs/REA_SCOPE_AND_ARTIFACTS.md` | **CUMPLIDO** | este archivo |

---

## 10. Handoff explícito a las siguientes tareas

**Para t2 (deep dive de OTT Navigator):**

- Vía Java/Dalvik de REA **operativa**: `inspect_android_package` (jadx-headless-mcp 0.7.1) ya corrió sobre
  A1, A2 y A7. Siguientes: `search_android_classes`, `inspect_android_class`, `inspect_android_method`,
  `trace_android_references`.
- **Filtrar por prefijo** `studio.scillarium.ottnavigator` para no ahogarse en ads: en A1, de 62 activities,
  **solo 5 son de la app**; el resto es AppLovin/Huawei/GMS/AppCoins/WorkManager. Igual con las 13.492 clases.
- Puntos de entrada del player ya identificados: `PlayerActivity` y `VodPlayActivity`; el motor es
  **ExoPlayer 2** (no media3) y hay ruta FFmpeg (`libffmpegJNI`, `Lavc58.54.100`). En A1 **no hay** `libvlc.so`.
- Lo que t2 **no** debe hacer: tocar `com.appcoins`/`com.android.vending`/billing para desbloquear premium
  (L6), ni el eje DRM (L9).
- Entregable esperado: ABR/buffer/bandwidth y headers **con `file:line` o clase:método** del código del APK,
  etiquetando `[observado]` lo que se lea del dex y `[público]` lo que venga de docs del motor.

**Para el resto del equipo:**

- **TiviMate**: toda fila de la matriz debe ser `[público]`/`[no disponible]` hasta que el propietario aporte
  el APK (§9.2a). **No inventar** comportamiento.
- **Disney+/Prime**: solo conocimiento público y compatibilidad; **cero** DRM (§8).
- **Conviva**: no hay SDK; se usa el motor propio del repo (§6.4) y el observer server-side de nginx.
- **Diagnóstico previo** (bounce nginx 20 min, breaker gateway, 4K NO-GO): ya está resuelto/refrendado en
  `docs/REA_DIAGNOSIS_AND_FIXES.md` (H1–H4). R1 no lo repite; confirma que **no depende de ningún APK**.

---

## Anexo A — Comandos reproducibles (todas las cifras de este documento)

### A.1 Inventario + SHA-256

```powershell
# Workspace (vía herramienta glob del agente): **/*.apk  → 5 APK
# Perfil (acotado): Downloads + comprobaciones por patrón
Get-ChildItem -LiteralPath "C:\Users\HFRC\Downloads" -Filter *.apk -File |
  ForEach-Object { $h=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower();
                   "{0}|{1}|{2}" -f $_.Name,$_.Length,$h }
```

### A.2 Identidad de paquete (aapt 34.0.0)

```powershell
$aapt = "C:\Users\HFRC\AppData\Local\Android\Sdk\build-tools\34.0.0\aapt.exe"
& $aapt dump badging "C:\Users\HFRC\Downloads\ott-navigator-1-6-9-4.apk" |
  Select-String -Pattern "^package:|^sdkVersion|^targetSdkVersion|^native-code|^launchable-activity"
```

### A.3 Nativas + número de dex

```powershell
$entries = & tar -tf "C:\Users\HFRC\Downloads\ott-navigator-1-6-9-4.apk"
$entries | Where-Object { $_ -match '^lib/[^/]+/.+\.so$' } | Sort-Object -Unique
($entries | Where-Object { $_ -match '^classes\d*\.dex$' }).Count
```

### A.4 Componentes del manifiesto

```powershell
$aapt = "C:\Users\HFRC\AppData\Local\Android\Sdk\build-tools\34.0.0\aapt.exe"
& $aapt dump xmltree "C:\Users\HFRC\Downloads\ott-navigator-1-6-9-4.apk" AndroidManifest.xml |
  Select-String -Pattern 'E: (activity|service|receiver|provider) \(line=|A: [^\s]+:name\(0x'
```

### A.5 ADB (cuando haya dispositivo)

```powershell
adb devices
adb shell pm list packages | Select-String -Pattern 'tivimate|ottnavigator'
adb shell pm path <package.id>            # devuelve 1..N rutas (base + splits)
adb pull <ruta_del_paso_anterior> C:\Users\HFRC\Downloads\<app>-base.apk
```

### A.6 Firmas (REA) y ADB (REA)

```
REA inspect_apk_signature(path=...)      # esquemas, cert SHA-256, source stamp, lineage
REA list_adb_devices()                   # devices: []
REA inspect_android_package(path=...)    # package/SDK/componentes/class_count (JADX 0.7.1)
```

---

## Anexo B — Evidencia REA y límites

### B.1 Bundle durable exportado

`docs/evidence/REA_R1_evidence_bundle.json.gz` — **20 registros**, 37.064.073 B en claro → **5.792.208 B**
comprimido (ratio 0,156). Se descomprime con:

```powershell
tar -xzf docs\evidence\REA_R1_evidence_bundle.json.gz -C docs\evidence
```

`[observado]` (REA `export_evidence_bundle` + gzip verificado). Se guarda comprimido para no meter 37 MB
en el árbol de trabajo. **No está pensado para commit**: de hecho `.gitignore:133` (`*.gz`) ya lo excluye
del repo → queda como **evidencia local durable** para t2/t7, no como entregable versionado.

### B.2 IDs de evidencia de la sesión REA

| Operación | `evidence_id` (vista) | `parent_evidence_id` (registro completo) |
|---|---|---|
| `list_adb_devices` | `ev_7e71441545b56bcf421844c99c6da08681b90fae3e9a0ad552657a2f5f6d6bb6` | — |
| `inspect_adb_client` | `ev_f6b00a67d26378cd5fbbbc8bfee830642d13988a627ed245d410c81093e5177b` | — |
| `inspect_android_package` OTT 1.7.3.3 | `ev_3381e919131af59b367f440f407d915ce39d5306c1052e3f317204599b06e29b` | `ev_7669c10118d42a4f77c6022948b8d00bec954afd981f2f1294e07f21dc22431f` |
| `inspect_android_package` OTT 1.6.9.4 | `ev_8f6fc676200915ec46009b80a327489d96bd4f5fa93772013e1934d027350f2e` | `ev_68b6813cdd67c1467fe1f3ca157a9fbf7a0e30ab0ac254c6bdd9d4f02fc971ae` |
| `inspect_android_package` ape-crystal-agent | `ev_d41f3143af3580847470570a3466fa9370557722c6d9494695bc4c3eec750b8a` | `ev_77020fd4ebf377ac56e26025871fc59b596817056a9e07447a3fa17b0ca9e0f8` |
| `inspect_apk_signature` OTT 1.7.3.3 | `ev_7a8a717efd948c67fc2dcfaa111839045570808309034a7bb7471f720757535d` | `ev_fa38216951c6e5f920e9a8114a46841d0b8dda21f0da01e774fd78ed6ebdc67c` |
| `inspect_apk_signature` OTT 1.6.9.4 | `ev_cb513291d9a52c965185dd9a8d4a6cedb165f568334a2ccbc516264e1e602e8d` | `ev_63a0c96ba5da8b15efaecfd007f04ec6303a368a7187d98602cdea723b2a3c44` |
| `inspect_apk_signature` SFA 1.13.11 | `ev_88134ac94b1d2debcb7ec0461e597d422b3f90b75880d0b52847decfb424dccf` | `ev_509f89839bab79a5ff3b2402c8014e8314ae153c2497f187f04f82d85d673b88` |
| `inspect_apk_signature` SFA 1.11.11 | `ev_d2d74fe3841a3ea6e84f562fc12d14577a94e08d8f32d9889462bdba9f6ff409` | `ev_6005f76f654604165fdba9e2d5de6889b8c7b7028c93bad75c4c02d6b306b764` |
| `inspect_apk_signature` v2rayNG | `ev_85713f5418745a586c3dd7c34fc6d9df6bd8823832d6be1dd35e05a5e926b171` | `ev_4cace570220cf9c0df2f47049e5bad6c193a12fe999ed1780e85faaf26f01fbc` |
| `inspect_apk_signature` ape-crystal-agent | `ev_55f0d0e4b7b8fcafac05a89c0549ddffb7a8ea9457f1668771fe5177f356b70c` | `ev_74d4bbef49c6ce12d4aa2018d0b66ce93a29fbcc1f5840b5d528e4fb9aef6a60` |

> Los IDs son **de la sesión REA**; el bundle (§B.1) los conserva de forma durable. Si el servidor REA se
> reinicia, usar el bundle.

### B.3 Límites declarados de los proveedores

- JADX: los `class_count` son metadatos pre-codegen (incluyen sintéticos); las firmas de método usan tipos
  de display; las posiciones de fuente son desconocidas. `[observado]` (límites del proveedor)
- Firma: **no se verifica** criptográficamente; `self_consistent` solo compara el digest declarado con los
  bytes actuales. `[observado]` (límites del proveedor)
- ADB: no contactado ningún dispositivo; `may_have_started_adb_server=false`. `[observado]`

### B.4 Desconocidos honestos que quedan abiertos

| # | Desconocido | Por qué importa | Cómo se cerraría |
|---|---|---|---|
| U1 | ¿Qué versión de OTT corre el propietario? | Decide si A1 o A2 es el primario para t2 | `adb shell dumpsys package studio.scillarium.ottnavigator \| Select-String versionName` |
| U2 | ¿La clave `6cf278…` (A1) es la oficial del publicador? | Determina si A1 es binario oficial o build de espejo | Comparar con el certificado público del publicador / linaje de Play App Signing |
| U3 | ¿VLC sigue siendo seleccionable en A1 pese a no traer `libvlc.so`? | Afecta la matriz de players | t2: leer el selector de motor en el dex |
| U4 | ¿Hay algún otro APK relevante fuera de workspace/Downloads? | Completitud del inventario | Indexar el perfil completo (Everything/W Search) o conectar el equipo |
| U5 | ¿El `ape-crystal-agent` release (no debug) existe en algún lado? | El debug no es representativo de producción | `android/ape-crystal-agent/app/build/outputs/apk/release/` o pedirlo al propietario |
| U6 | Contenido real de los `conviva-*.js/php` del repo (¿vigentes o stubs?) | Influye en la matriz QoE | Auditoría de la tarea de headers/QoE |

---

## Anexo C — Hashes de dex/recursos por APK (para atar evidencia en t2)

| APK | Entrada | Bytes | SHA-256 |
|---|---|---:|---|
| A1 OTT 1.7.3.3 | `AndroidManifest.xml` | 64.304 | `a49f09953642cf3e0fcf450f5e3d1364bb94713619d7e2afa736c9795d8cf692` |
| A1 | `classes.dex` | 9.659.224 | `56ecf729940cb1473ba41947305d32c0d2a7b31707a91d13f76a744baa4cc6f6` |
| A1 | `classes2.dex` | 8.058.336 | `554b2d014470247001a95802260dbd5b7675832681f86ed2949ab8672eea6ca3` |
| A1 | `resources.arsc` | 6.695.364 | `109b1b4132cff19f576d0c4adf88c75c0b924606b3a5a7a156c7465c1aefa0e3` |
| A2 OTT 1.6.9.4 | `AndroidManifest.xml` | 26.568 | `f24664354b6a54aa8ee19d8f79f35acf7a5809ec264688e6208be0371675e70c` |
| A2 | `classes.dex` | 9.596.272 | `82eaa527540fc0a6f8d14a1890b8e8eda02e45edb1a8e9014e114d9c7808d4c8` |
| A2 | `classes2.dex` | 769.288 | `b265d9f1b3f9b7308c67d378dfec03c7bcd1ed3a700ee328a200812c0c3c921c` |
| A2 | `resources.arsc` | 4.717.952 | `eb191ec986d9d75debcfd74e53b1757363cec6c941eddd72aa1462448ad9799e` |
| A3 SFA arm64 | `AndroidManifest.xml` | 20.912 | `fbe0d90cb155937cdd3e216cc607551f026b7776f29ab4d96f4fa2f0aaf44bc9` |
| A3 | `classes.dex` | 9.091.856 | `7a7d9a291de69ab5bfbc4a1ccc8bd53c6c05d881c1b824f3a415814057f2eb2f` |
| A3 | `resources.arsc` | 1.834.804 | `a99f8b37a625ecb12bf56979420f4061942c30f037af131de1ad8909d23ca0fe` |
| A4 SFA armv7 | `AndroidManifest.xml` / `classes.dex` / `resources.arsc` | — | **idénticos a A3** |
| A5 SFA 1.11.11 | `AndroidManifest.xml` | 26.804 | `d57000bbcf3b3a1b1e86bcd873c57faf1d6aa2b6a120c8827569bf52cf4d15d4` |
| A5 | `classes.dex` | 3.593.348 | `a0f54efb7d0c143a1d4b8b5de18cf549358a556c5da6f4b8bc2f7425abd1a095` |
| A5 | `resources.arsc` | 1.359.892 | `2c455f7b83f2f897bfce6eaa472632fbc9d14b23634910b0dbd3378f6b4e5b39` |
| A6 v2rayNG | `AndroidManifest.xml` | 26.636 | `7324ce4bf5d071f706683945996a5b8c243e274dd481295652f89b90fe772060` |
| A6 | `classes.dex` | 8.587.648 | `613696636801f5851f5636dbf2e940034710c4a1ec23ee121a1b1d2fe8a79508` |
| A6 | `classes2.dex` | 908 | `b2f0f61304d63d038990d0d679b3b99ca83672c66a9388a89bf913130f121822` |
| A6 | `classes3.dex` | 643.804 | `1106175b527cb43f3110be614fe0bf1450806899ad1811f81ffebf2165c81be1` |
| A6 | `classes4.dex` | 8.393.456 | `71bf58adabd26f085a9b02794ce8d346f1b1d1d7526f1aed190ccecb5519bbd0` |
| A6 | `resources.arsc` | 1.404.896 | `fde2e3f49b671a7c5a58e3a9efb571dba8072603c6585c16a35605111521f4f8` |
| A7 agente | `AndroidManifest.xml` | 7.656 | `b81b52e75748a67108edbd3ee66453fd7be4b306574845210e1736557c4659e6` |
| A7 | `classes.dex` | 8.153.236 | `008604b169a95c79728c8e6afce0ce5cc1b21278540942e863054e45308aa76b` |
| A7 | `classes2.dex` | 62.020 | `ff692389e1c99ec029bb3d318fd7b1709735e92793a9a2973753d8ebff9f8913` |
| A7 | `classes3.dex` | 137.208 | `9da371b7a2a8d6c9f838b409c660f24a72302cfc7e59337b2a04302ae0ecfde5` |
| A7 | `classes4.dex` | 2.412.420 | `370a06bc8160c638680a8808322f71e52249864e93faa1019086ded44c6869ff` |
| A7 | `classes5.dex` | 9.417.328 | `d1754ba87d5a4771d7a5463856244b4ba8b94ba71e792585aa63c253d8f1abc3` |
| A7 | `resources.arsc` | 352.968 | `14dc5e0a5f15b303076018ce3d96de01ad878347000ef12b77586aefe3b9614d` |

`[observado]` (SHA-256 calculado sobre el stream descomprimido de cada entrada del ZIP).

---

## Anexo D — Componentes propios vs terceros (ruido a filtrar en t2)

| APK | Componentes **de la app** | Componentes **de terceros** |
|---|---|---|
| A1 OTT 1.7.3.3 | 5 activities (`MainActivity`, `EditProviderActivity`, `PlayerActivity`, `StudioActivity`, `VodPlayActivity`) + 1 receiver (`bootr.BootUtils`) | 57 activities, 11 services, 11 receivers, 6 providers → AppLovin MAX (**19** activities), Huawei Ads/PPS (**30**), GMS Ads/Cast + GoogleApi (**4**), AppCoins (**4**), más WorkManager/Room/datatransport/Play Core en services/receivers/providers |
| A2 OTT 1.6.9.4 | las mismas 5 activities + `utils.BootUtils` | 6 activities, 11 services, 10 receivers, 2 providers → GMS Ads/Cast, Play Core/AssetPacks, WorkManager, Room, billing |
| A3/A4 SFA 1.13.11 | 1 activity (`compose.MainActivity`), 4 services (`bg.VPNService`, `bg.ProxyService`, `bg.RootServer`, `bg.TileService`), 1 receiver (`vendor.InstallResultReceiver`, `bg.BootReceiver`) | Shizuku/Xposed/FileProvider/WorkingDirectory/Initialization, CameraX, WorkManager, Room |
| A5 SFA 1.11.11 | 10 activities, 3 services, 1 receiver, 1 provider | ML Kit, GMS, Play Core, WorkManager, Room, datatransport |
| A6 v2rayNG | 18 activities, 4 services, 3 receivers, 1 provider | CameraX/quickie, WorkManager multiprocess, Room, FileProvider |
| A7 agente | 2 activities, 2 services (incl. WireGuard VPN), 1 receiver, 1 provider | — (solo AndroidX FileProvider) |

`[observado]` (aapt `xmltree` + REA `components.items`). **Regla práctica para t2:** filtrar por
`studio.scillarium.ottnavigator` antes de leer nada; el resto es publicidad/telemetría y no explica el
comportamiento del player.

---

## Anexo E — Glosario mínimo

- **REA**: ingeniería inversa de artefactos; en esta sesión, estática y offline.
- **JADX headless**: motor de decompilación Dalvik→Java usado por REA (`jadx-headless-mcp 0.7.1`).
- **Source Stamp**: sello de Google Play dentro de la firma APK; indica paso por Play.
- **Linaje de rotación (v3)**: prueba criptográfica de cambio legítimo de clave de firma.
- **A1/A2/A3…**: identificadores de artefacto de este documento (no son nombres oficiales).
- **P0–P5**: prioridad de análisis (no confundir con los perfiles P0–P5 del generador M3U8).
- **TPM/DRM**: medidas tecnológicas de protección; su elusión es lo que este documento prohíbe.
