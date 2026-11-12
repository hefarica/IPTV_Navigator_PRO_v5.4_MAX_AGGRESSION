# BUILD_RECEIPT — APK ape-crystal-agent · 2026-11-12

**Origen:** compilada en CI (GitHub Actions), no en local. Workflow `android-build.yml`, corrida **`43172012701`**, job `build` = **success**.
**Comando:** `gradle :app:assembleDebug --no-daemon --stacktrace` (JDK 17 temurin, Gradle 8.5, Android SDK 34).

## Los nueve campos que exige §15

| Campo | Valor | Cómo se obtuvo |
|---|---|---|
| **APK** | `app-debug.apk` · 28.010.884 B | artefacto `ape-crystal-agent-debug-apk` descargado de la corrida |
| **SHA256** | `9872483a494c483aa9a2173ede70bd00005c8555d0dcf792448fdf0655a8d230` | `sha256` sobre el fichero descargado |
| **APPLICATION_ID** | `com.ape.crystalagent` | `aapt2 dump badging` |
| **VERSION_CODE** | `657` | `aapt2 dump badging` |
| **VERSION_NAME** | `3.9.9-host-plus-rea-657` | `aapt2 dump badging` |
| **SIGNING_CERT_SHA256** | `9e32dc4db163858a3432b58ec5990926e9893068f73cee591a37a12efe054935` | `apksigner verify --print-certs` |
| **COMMIT_SHA** | `00aa8332` | `headSha` de la corrida |
| **BUILD_RECEIPT** | este documento | — |
| **DEVICE_TEST_RECEIPT** | **NO OBTENIDO** | `adb devices` devuelve lista vacía |

**DN del certificado:** `C=US, O=Android, CN=Android Debug` → **firmada con la clave de depuración**. No es publicable.

**SDK:** `minSdkVersion=22` · `targetSdkVersion=28` · `compileSdkVersion=34` · `platformBuildVersion=14`.

## Advertencia que el recibo tiene que llevar: NO es byte-reproducible

| Build | Bytes | sha256 |
|---|---|---|
| Local (esta sesión, antes) | 28.011.018 | `0787d5d1…` |
| **CI (este recibo)** | **28.010.884** | **`9872483a…`** |

Mismo `versionCode` 657, mismo commit de origen, **bytes distintos**. Un APK de Gradle sin `--deterministic` y sin lockfile de dependencias no es reproducible byte a byte.

**Consecuencia práctica:** este APK **no se identifica por su hash** como si fuera un binario reproducible. Se identifica por la terna **commit + comando + sha del artefacto de esta corrida**. Citar `9872483a…` como «la APK» y esperar a que otra compilación dé lo mismo sería falso.

## Lo que este recibo NO acredita

- **Que arranque.** No se instaló en ningún dispositivo: cero pruebas de arranque.
- **Que reproduzca.** No hay prueba de reproducción ni con OTT, ni con TiviMate, ni con ExoPlayer.
- **Que se registre con el VPS.** No hay registro efectivo ni recepción de política Canary.
- **Que adapte GPU/CPU/térmica.** Sin dispositivo no hay snapshot de capacidades.
- **Que sea instalable en el dispositivo del operador.** `minSdkVersion=22` incluye Android 5.1, donde `Secure.kt` degrada a preferencias **planas** (ver `docs/audits/APK_SECRET_SCAN_20261111.md`): el secreto quedaría en claro también en runtime.

## Lo que sí acredita

Que el código del commit `00aa8332` **compila** con el toolchain declarado y produce un APK firmado, con `applicationId`, `versionCode` y `versionName` verificados por las herramientas oficiales — no por lectura de un `build.gradle.kts`.

Eso es lo que §15 pide antes de generar una APK instalable. **Falta la mitad que exige un dispositivo.**

## Etiqueta exigida por §15

> Si la integración del dispositivo o la firma no puede realizarse, entrega el candidato claramente etiquetado, sin presentarlo como APK final probado.

**CANDIDATO — NO ES UNA APK FINAL PROBADA.** Compila y está firmada con clave de depuración; no ha tocado un televisor.
