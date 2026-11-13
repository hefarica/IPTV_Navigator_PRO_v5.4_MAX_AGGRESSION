# APK §15 — VIABILIDAD DE COMPILACION: PROBE EMPIRICO (2026-11-11)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t17
**Alcance:** compilacion local en `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`.
**NO se hizo:** `adb install`, firma con clave real, push, deploy, ni contacto con el VPS (178.156.147.234).
**Red:** **CERO descargas.** Las dos compilaciones que produjeron el APK se ejecutaron con `--offline`, y ninguna fallo por artefacto ausente.

---

## 0. VEREDICTO

> **LA APK SE COMPILA EN ESTE ENTORNO. Reproducido 3 veces, las 2 ultimas con `--offline`.**
> APK resultante: **28.011.018 B · sha256 `0787d5d105a98fae7777561e5628915b8954e0ca3b1b3ffe0eb942456142fbda`**
> `versionCode 657` · `versionName 3.9.9-host-plus-rea-657` · `applicationId com.ape.crystalagent` — **coincide con lo declarado.**

**Lo que esto NO significa (limites, sin adornos):**

- Es un **APK debug (`application-debuggable`)**. No es la APK final.
- **No hubo prueba de dispositivo**: cero `adb install`, cero arranque, cero reproduccion de video, cero captura de logcat, cero ejercicio de la politica Canary.
- **La variante `release` NO se reconstruyo** a proposito (ver §8.2): el `app-release.apk` que hay en disco es **v51 / 3.9.4** y es **obsoleto** frente a lo declarado.
- "Compila" **no** es "funciona". Este informe acredita **compilabilidad**, nada mas.

---

## 1. TABLA DE CHECKS

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| 1 | Proyecto Gradle presente | **SI** | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\` con `gradlew.bat`, `settings.gradle.kts`, `build.gradle.kts`, `app\build.gradle.kts`, `shim\build.gradle.kts`, `gradle\wrapper\` |
| 2 | Version del wrapper | **Gradle 8.5** (`gradle-8.5-bin`) | `gradle\wrapper\gradle-wrapper.properties` |
| 3 | Distribucion del wrapper en cache (sin red) | **SI** | `~\.gradle\wrapper\dists\gradle-8.5-bin\5t9huq95ubn472n8rpzujfbqh\gradle-8.5\` con `bin\gradle.bat` y `lib\gradle-launcher-8.5.jar` + marcador `.ok` |
| 4 | SDK de Android | **SI** | `local.properties: sdk.dir=C:/Users/HFRC/AppData/Local/Android/Sdk`; `ANDROID_HOME` y `ANDROID_SDK_ROOT` apuntan a la misma ruta |
| 5 | `platforms` / `build-tools` | **android-34 / 34.0.0** | `Sdk\platforms\android-34`, `Sdk\build-tools\34.0.0` (`aapt.exe`, `aapt2.exe`, `apksigner.bat`, `zipalign.exe`) |
| 6 | NDK | **AUSENTE** — y **no se necesita** | `Sdk\ndk` no existe; el proyecto no declara `externalNativeBuild` ni `ndkVersion` |
| 7 | JDK | **SI, 17.0.10 (Microsoft)** | `JAVA_HOME=C:\Users\HFRC\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot` |
| 8 | `gradle` en PATH | **NO** (irrelevante: se usa el wrapper) | `Get-Command gradle` -> no encontrado |
| 9 | Dependencias Maven en cache | **SI** | `~\.gradle\caches\modules-2\files-2.1` con `androidx.media3`, `org.tensorflow`, `com.wireguard.android`, `com.squareup.okhttp3`, `org.jetbrains.kotlinx` |
| 10 | Keystore versionado en el repo | **NO** | ver §5 |
| 11 | Compilacion offline | **BUILD SUCCESSFUL** | §7 |
| 12 | APK generada y verificada | **SI** | §8 |

---

## 2. WRAPPER (literal)

`IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\gradle\wrapper\gradle-wrapper.properties`

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

**Version: Gradle 8.5** · URL: `https://services.gradle.org/distributions/gradle-8.5-bin.zip`.
**La distribucion YA esta en cache local**, asi que la URL **no se toco**:

```
C:\Users\HFRC\.gradle\wrapper\dists\gradle-8.5-bin\5t9huq95ubn472n8rpzujfbqh\
  gradle-8.5\            (instalacion completa)
  gradle-8.5-bin.zip.lck
  gradle-8.5-bin.zip.ok   <- marcador de descarga completada
gradle.bat presente: True
lib/gradle-launcher-8.5.jar presente: True
```

`gradlew.bat --version` (literal, `scratch\apk_probe_20261111\gradle_version.txt`):

```
Gradle 8.5
Build time:   2023-11-29 14:08:57 UTC
Kotlin:       1.9.20
Groovy:       3.0.17
JVM:          17.0.10 (Microsoft 17.0.10+7-LTS)
OS:           Windows 11 10.0 amd64
```

Toolchain declarado en el build: **AGP 8.3.2** y **Kotlin 1.9.22** (`build.gradle.kts` raiz, `plugins { id("com.android.application") version "8.3.2"; id("org.jetbrains.kotlin.android") version "1.9.22" }`).

---

## 3. SDK DE ANDROID (ruta concreta)

| Item | Valor literal |
|---|---|
| `local.properties` | `sdk.dir=C:/Users/HFRC/AppData/Local/Android/Sdk` |
| `ANDROID_HOME` | `C:\Users\HFRC\AppData\Local\Android\Sdk` |
| `ANDROID_SDK_ROOT` | `C:\Users\HFRC\AppData\Local\Android\Sdk` |
| `platforms` | `android-34` |
| `build-tools` | `34.0.0` |
| `cmdline-tools` | `latest` |
| `platform-tools` | presente (`adb.exe`) |
| `ndk` | **AUSENTE** |

`compileSdk = 34` (declarado en `app/build.gradle.kts:23` y `shim/build.gradle.kts`) esta cubierto por `platforms\android-34`. **No falta SDK: no es la causa raiz de nada.**

---

## 4. FIRMA — configuracion real (y que NO hay)

**No existe ningun bloque `signingConfigs { }` en el proyecto.** La unica linea de firma es:

```
app/build.gradle.kts:58:            signingConfig = signingConfigs.getByName("debug")
```

Es decir: la variante `release` **se firma con la clave debug autogenerada del SDK**, no con una clave de produccion. Contexto declarado por el propio proyecto (`:55-56`): *"Misma clave debug del ARA: actualiza in-place, pero el APK NO es debuggable"*.

| Elemento | Estado medido |
|---|---|
| `signingConfigs` propio | **NO existe** (solo referencia al `debug` implicito) |
| Keystore real referenciado | **NO** |
| Variables de entorno para firma | **NO** (no hay `storeFile`/`storePassword`/`keyAlias` en el proyecto) |
| Firmante efectivo | `~\.android\debug.keystore` — 2.618 B, sha256 `2dfdabae1802799e31dd20c8040a2fc6e2b148cbc24c84a40e4cd17132dd93ac` |
| Certificado del firmante | `CN=Android Debug, O=Android, C=US` · SHA-256 `19:35:B4:40:70:FA:A3:A5:93:86:EB:E3:C8:3A:EE:DF:5B:83:4D:4B:0B:D4:BE:D0:C2:56:43:9A:DC:08:FA:F2` |

### 4.1 ¿Hay un keystore versionado en el repo? — **NO**

Barrido de `*.jks|*.keystore|*.bks|*.p12` en todo el workspace: **un solo fichero**, y **no esta trackeado**:

```
C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\_incoming\APE_Fluid_Crystal_UHD\APE_Fluid_Crystal_UHD\signing\ape-fluid-dev.jks
   bytes=3057   git ls-files --error-unmatch -> NO tracked
   sha256 ffd606cd15511e0f0f20d4339a9802cb358d7500e988283bee7ab43d35e5523c
```

- **No lo usa el build**: `git grep "ape-fluid-dev"` sobre ficheros trackeados -> **vacío**.
- No es utilizable con la contrasena estandar: `keytool -list -keystore … -storepass android` ->
  `error de herramienta de claves: java.io.IOException: Keystore was tampered with, or password was incorrect`.
- **Conclusion: NO hay hallazgo de "keystore commiteado".** Es un artefacto de un paquete de entrada (`_incoming`), fuera de git, no referenciado. Se reporta su existencia y huella para que quede cerrado, **sin exponer ninguna clave** (no se ha intentado crackear ni se ha volcado material privado).

---

## 5. SECRETOS — tres hallazgos, con matices distintos

### 5.1 `local.properties` contiene el secreto de enrolamiento (fichero **NO trackeado**)

```
IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\local.properties
  sdk.dir=C:/Users/HFRC/AppData/Local/Android/Sdk
  ape.enroll.secret=<48 caracteres — valor NO reproducido en este informe>
```

| Comprobacion | Resultado |
|---|---|
| Trackeado por git | **NO** (`git ls-files --error-unmatch` -> *did not match any file(s) known to git*); ademas `.gitignore` incluye `/local.properties` |
| El **valor literal** aparece en algun fichero tracked del repo | **CERO** (escaneo de los 100% de ficheros de `git ls-files` buscando la cadena exacta) |
| Huella del valor (para trazabilidad) | `sha256(secreto) = 3a82184647badd50194cd074a7ef0cc67123bea106a0ac67d65882d5d0341ec1` |

**Veredicto: NO es una fuga al repositorio.** Es un secreto en claro en disco, fuera de git. Riesgo residual: cualquiera con acceso al filesystem de esta maquina lo lee.

### 5.2 **El APK COMPILADO LLEVA EL SECRETO EN CLARO DENTRO DE `classes5.dex`** — hallazgo real

`app/build.gradle.kts:31` inyecta el secreto como constante de build:

```kotlin
buildConfigField("String", "ENROLL_SECRET", "\"$apeEnrollSecret\"")
```

Medido sobre el APK **recien compilado**: la cadena aparece **1 vez en `classes5.dex`** (escaneo byte a byte de los 9 `.dex` del APK). **No** aparece el placeholder `CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS`, lo que confirma que el build **si inyecto el valor real** desde `local.properties`.

**Consecuencia:** **cualquiera que tenga el APK tiene el secreto de enrolamiento** y puede llamar a `/ara/enroll` en el VPS. Un secreto en un artefacto distribuible no es un secreto. (Mitigante de diseño: `:9` documenta *"build-time, NUNCA en el repo"* — cierto, no esta en el repo, pero **si esta en el binario**.)

### 5.3 **`SYNC_KEY_ENC` hardcodeado en un fichero TRACKED** — hallazgo real, con decision del propietario declarada

`app/build.gradle.kts:37` (fichero **trackeado** por git) contiene un blob AES y su id:

```kotlin
buildConfigField("String", "SYNC_KEY_ENC", "\"4cP6DxIb2…\"")   // valor no reproducido aqui
buildConfigField("String", "SYNC_KEY_ID", "\"k1\"")
```

El propio fichero documenta la decision (`:35-36`): *"Key de /sync cifrada AES-256-GCM dentro del APK (decisión del propietario: instalación autocontenida; **un secreto en APK es ofuscación, no seguridad fuerte**)"*. Se reporta como **riesgo aceptado y documentado**, no como descuido: la clave de descifrado debe de estar en el mismo binario, luego el cifrado aporta ofuscacion, no confidencialidad.

---

## 6. VALORES DECLARADOS (fuente) vs VERIFICADOS (APK)

| Campo | Declarado (`app/build.gradle.kts`) | Verificado en el APK (`aapt2 dump badging`) | Match |
|---|---|---|---|
| `applicationId` | `com.ape.crystalagent` (`:26`) | `name='com.ape.crystalagent'` | **SI** |
| `versionCode` | `657` (`:29`) | `versionCode='657'` | **SI** |
| `versionName` | `3.9.9-host-plus-rea-657` (`:30`) | `versionName='3.9.9-host-plus-rea-657'` | **SI** |
| `minSdk` | `22` (`:27`) | `sdkVersion:'22'` | **SI** |
| `targetSdk` | `28` (`:28`) | `targetSdkVersion:'28'` | **SI** |
| `compileSdk` | `34` (`:23`) | `compileSdkVersion='34'` | **SI** |
| `namespace` app | `com.ape.crystalagent` (`:22`) | — (namespace no viaja al APK) | n/a |
| `namespace` shim | `dev.venice.ottshim` (`shim:22`) | empaquetado via `implementation(project(":shim"))` (`:113`) | **SI** (compila) |
| `debuggable` | debug implicito | `application-debuggable` **presente** | **SI** (es la variante debug) |
| Activity de lanzamiento | — | `com.ape.crystalagent.MainActivity` + `leanback-launchable-activity` | presente |

---

## 7. COMPILACION — las tres corridas, con salida literal

Todo desde `CWD = …\android\ape-crystal-agent` (Gradle exige que el *build root* sea el CWD; ver §9.1).

### 7.1 `:app:assembleDebug --offline --no-daemon` (estado incremental)

```
> Task :app:packageDebug UP-TO-DATE
> Task :app:createDebugApkListingFileRedirect UP-TO-DATE
> Task :app:assembleDebug UP-TO-DATE

BUILD SUCCESSFUL in 2m 37s
57 actionable tasks: 2 executed, 55 up-to-date
```

Log: `scratch\apk_probe_20261111\build_offline.out.log` · err: `build_offline.err.log` (**0 B, sin errores**).
**Lectura honesta:** `UP-TO-DATE` demuestra coherencia de cache, **no** que las fuentes compilen. Por eso se forzo §7.2.

### 7.2 `:app:compileDebugKotlin --rerun-tasks --offline --no-daemon` (recompilacion REAL de Kotlin)

```
> Task :shim:compileDebugKotlin
> Task :app:compileDebugKotlin
...
BUILD SUCCESSFUL in 4m 46s
29 actionable tasks: 29 executed
EXITCODE=0
```

Log: `scratch\apk_probe_20261111\compile_rerun.log`. **29/29 tareas ejecutadas de verdad.** Solo *warnings* (`never used`, `deprecated`, `Name shadowed`, y el aviso de namespace duplicado de `org.tensorflow.lite`), ninguno es error.

### 7.3 `:app:assembleDebug --rerun-tasks --offline --no-daemon` (reconstruccion COMPLETA del APK)

```
> Task :app:dexBuilderDebug
> Task :app:mergeProjectDexDebug
> Task :app:packageDebug
> Task :app:createDebugApkListingFileRedirect
> Task :app:assembleDebug

BUILD SUCCESSFUL in 6m 37s
57 actionable tasks: 57 executed
EXITCODE=0
```

Log: `scratch\apk_probe_20261111\assemble_rerun.log`. **57/57 tareas ejecutadas**, cero errores.

**Sin red en ninguna de las tres**: `--offline` y ninguna fallo por artefacto no resuelto.

---

## 8. APK RESULTANTE

### 8.1 Artefacto verificado

| Campo | Valor |
|---|---|
| **Ruta** | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\debug\app-debug.apk` |
| **bytes** | **28.011.018** |
| **sha256** | **`0787d5d105a98fae7777561e5628915b8954e0ca3b1b3ffe0eb942456142fbda`** |
| mtime | 2026-11-11T02:58:09 |
| Entradas en el ZIP | 422 (9 ficheros `classes*.dex`; el mayor `classes9.dex` 9.417.316 B) |

**Verificacion de firma** (`apksigner.bat verify --print-certs --verbose`, crudo en `scratch\apk_probe_20261111\new_apk_apksigner.txt`):

```
Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Number of signers: 1
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: 1935b44070faa3a59386ebe3c83aeedf5b834d4b0bd4bed0c256439adc08faf2
Signer #1 public key SHA-256 digest: b4548be208b2814e9b571a8f14ba6caa6178682369b895c83c6234d522c41567
```

**Firmado con la clave DEBUG** (esquema v2, sin v3) — coherente con §4. **No es una firma de produccion.**

### 8.2 Sobre el APK que ya existia, y por que el `release` NO se toco

Antes de compilar habia dos artefactos previos (`scratch\apk_probe_20261111\apk_baseline_before_build.txt`):

| Artefacto previo | bytes | mtime | sha256 | versionCode real (aapt2) | Estado |
|---|---|---|---|---|---|
| `app-debug.apk` | 28.205.810 | 2026-11-09T02:44:53 | `3f3382b291c82f055b49668daa679d46433dd092a520ea55507adde5bfe8ec6d` | **657** / `3.9.9-host-plus-rea-657` | alineado con lo declarado |
| `app-release.apk` | 23.812.204 | 2026-11-05T04:20:23 | `d2b1571a729854f171d21eba9f3e74d436a34b3e473e41f4ecb87f61cf28ca0a` | **51** / `3.9.4-adb-firetv` | **OBSOLETO** (46 versiones por detras) |

- **El `app-debug.apk` previo quedo SOBRESCRITO** por la reconstruccion de §7.3. Su identidad exacta (bytes, mtime, sha256) esta preservada en `apk_baseline_before_build.txt`. No se pierde informacion: las fuentes estan limpias y en `HEAD` (§9.2), asi que era reproducible — de hecho se reprodujo, con sha256 distinto (`0787d5d1…` vs `3f3382b2…`), lo que indica que **el APK no es determinista byte a byte** (timestamps dentro del ZIP). Cualquier contrato que fije "el APK" por sha256 debe fijar **el sha del commit y el comando**, no solo el sha del binario.
- **El `app-release.apk` NO se reconstruyo a proposito**: reconstruirlo lo habria sobrescrito y habria destruido la evidencia del desfase v51 vs 657. Queda declarado como **release obsoleto** y **no verificado en su variante actual**.
- El `app-release.apk` v51 **no** es debuggable (sin `application-debuggable`), coherente con la intencion `isDebuggable = false` (`:57`); y tambien esta firmado con la clave debug (`CN=Android Debug`), coherente con `:58`.

---

## 9. CAUSA RAIZ: no hay bloqueo — pero si dos trampas que casi lo falsean

**No hay causa raiz de bloqueo: la compilacion no esta bloqueada.** Se documentan las dos trampas que produjeron falsos negativos durante el probe, para que no se repitan:

### 9.1 Trampa 1 — `gradlew.bat` invocado con el CWD equivocado (fallo mio, no del proyecto)

Primer intento de recompilacion ejecutado desde la raiz del repo:

```
FAILURE: Build failed with an exception.
* What went wrong:
Directory 'C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION' does not contain a Gradle build.
A Gradle build should contain a 'settings.gradle' or 'settings.gradle.kts' file in its root directory.
BUILD FAILED in 2s
```

**No es un defecto del proyecto.** `gradlew.bat` resuelve el wrapper por `%~dp0`, pero **el build root lo toma del CWD**. Repetido con `CWD = …\android\ape-crystal-agent` -> **BUILD SUCCESSFUL**. Regla operativa: **ejecutar el wrapper desde el directorio del proyecto**, no desde la raiz del workspace.

### 9.2 Trampa 2 — `--offline` puede devolver "exito" sin compilar

La primera corrida dio `BUILD SUCCESSFUL` con **55 de 57 tareas `UP-TO-DATE`**: no recompilo nada. Un informe que se detuviera ahi diria "compila" sin haber compilado. Solo `--rerun-tasks` (§7.2 y §7.3) convierte eso en prueba real.

### 9.3 Estado del arbol en el momento de la prueba

```
git status --porcelain -- IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent   ->  (vacio)
HEAD = 472f7cc330e52dc2f7e3d16f6a451fd0b461949e  2026-11-09 23:56:04 -0500
        docs(inventario): comprobacion de regresion — nada se perdio en la pestaña
```

**Las fuentes compiladas son exactamente las de `HEAD`** (arbol limpio en ese subarbol), y **ninguna fuente es mas nueva que el APK previo** (mtime APK previo 2026-11-09T02:44:53). El APK `657` corresponde por tanto al codigo de `HEAD`, no a un estado intermedio.

---

## 10. QUE HARIA FALTA PARA UNA "APK FINAL" (nada de esto se hizo)

| # | Requisito | Estado |
|---|---|---|
| 1 | Variante `release` reconstruida y verificada (hoy la de disco es v51) | **PENDIENTE** |
| 2 | Firma con clave **propia** (no `CN=Android Debug`), esquema v2+v3 | **PENDIENTE** — hoy release firma con la debug por diseño (`:58`) |
| 3 | `adb install` en dispositivo autorizado | **NO EJECUTADO** (prohibido por encargo) |
| 4 | Prueba de **arranque** (MainActivity, `leanback-launchable-activity`) | **NO EJECUTADA** |
| 5 | Prueba de **reproduccion** (HLS/DASH via media3 1.3.1) | **NO EJECUTADA** |
| 6 | Captura de **logcat** y verificacion de servicios (`CaptureWatchdogService`, `ScreenCaptureService`) | **NO EJECUTADA** |
| 7 | Ejercicio de la **politica Canary** | **NO EJECUTADO** |
| 8 | Rotar `ape.enroll.secret` (esta en claro dentro del APK, §5.2) | **RECOMENDADO antes de distribuir** |
| 9 | Decidir sobre `SYNC_KEY_ENC` en repo tracked (§5.3) | **RIESGO ACEPTADO declarado — confirmar o revertir** |
| 10 | Reconciliar `app-release.apk` v51 con `versionCode 657` | **PENDIENTE** (no se toco) |

---

## 11. EVIDENCIA EN `scratch\apk_probe_20261111\`

| Fichero | Contenido |
|---|---|
| `apk_baseline_before_build.txt` | identidad de los dos APK **antes** de compilar (bytes, mtime, sha256) |
| `build_offline.out.log` / `.err.log` | corrida incremental (`BUILD SUCCESSFUL in 2m 37s`; err **0 B**) |
| `compile_rerun.log` | **recompilacion Kotlin real** `29/29 executed`, `BUILD SUCCESSFUL in 4m 46s` |
| `compile_rerun.exitcode.txt` | `0` |
| `assemble_rerun.log` | **reconstruccion completa del APK** `57/57 executed`, `BUILD SUCCESSFUL in 6m 37s` |
| `gradle_version.txt` | `gradle --version` literal (Gradle 8.5, JVM 17.0.10) |
| `new_apk_badging.txt` | `aapt2 dump badging` del APK nuevo (657 / 3.9.9-host-plus-rea-657 / debuggable) |
| `new_apk_apksigner.txt` | `apksigner verify --print-certs --verbose` (v2 true, CN=Android Debug) |
| `build.pid` | pid del wrapper de la primera corrida |

**Privacidad:** en ningun log de `scratch\apk_probe_20261111\` se ha escrito el valor de `ape.enroll.secret`; los escaneos de §5.1/§5.2 reportan **conteos y huellas**, nunca el literal.

---

*Probe ejecutado el 2026-11-11 entre 02:42 y 03:00 (America/Bogota). Cero red: las dos compilaciones que produjeron APK usaron `--offline`. Ningun `adb install`, ninguna firma con clave real, ningun push, ningun contacto con el VPS. Unicos ficheros escritos: este informe y `scratch\apk_probe_20261111\` (mas el APK reconstruido en `app\build\`, que es salida de build gitignorada y consecuencia directa del encargo).*
