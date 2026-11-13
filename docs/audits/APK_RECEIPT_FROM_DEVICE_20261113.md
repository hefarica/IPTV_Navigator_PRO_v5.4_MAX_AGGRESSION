# Recibo de la APK instalada, extraído del dispositivo · 2026-11-13

**Qué es:** §15 exige un recibo con `APK / SHA256 / APPLICATION_ID / VERSION_CODE / VERSION_NAME / SIGNING_CERT_SHA256 / COMMIT_SHA / BUILD_RECEIPT / DEVICE_TEST_RECEIPT`. Esto lo obtiene **del aparato real**, no de un artefacto del repo: se extrae la APK instalada, se hashea y se lee su certificado.

## Los campos que sí se obtuvieron

| Campo | Valor | Cómo se obtuvo |
|---|---|---|
| **APPLICATION_ID** | **`com.ape.crystalagent`** | `dumpsys package` |
| **VERSION_CODE** | **657** | `dumpsys package` |
| **VERSION_NAME** | **`3.9.9-host-plus-rea-657`** | `dumpsys package` |
| **APK** | `base.apk` extraída por `adb pull` | 28.205.810 B (**26,9 MiB**) |
| **SHA256 de la APK** | **`3f3382b291c82f055b49668daa679d46433dd092a520ea55507adde5bfe8ec6d`** | `Get-FileHash` sobre los bytes extraídos |
| **SIGNING_CERT_SHA256** | **`19:35:B4:40:70:FA:A3:A5:93:86:EB:E3:C8:3A:EE:DF:5B:83:4D:4B:0B:D4:BE:D0:C2:56:43:9A:DC:08:FA:F2`** | `keytool -printcert -jarfile` (firma **v1** presente: `CERT.RSA` 1.167 B) |
| Certificado SHA1 | `2E:17:E9:AC:9A:34:BD:73:8D:A9:D5:D1:0A:78:85:43:D1:03:CB:07` | idem |
| Instalada | **2026-11-07 12:26:55** | `dumpsys package` |
| Actualizada | **2026-11-09 02:45:17** | `dumpsys package` |
| Dispositivo | **ONN 4K · Amlogic s4 · Android 14 (SDK 34)** | medido |

**Esquema de firma:** `PackageSignatures{version:2, signatures:[9aa9eb0d]}` + entradas v1 (`CERT.SF`, `CERT.RSA`, `MANIFEST.MF`). El digest `9aa9eb0d` que muestra `dumpsys` **no es** el SHA-256 del certificado del `keytool`: son dos hashes distintos de cosas distintas y no se mezclan aquí.

## Los campos que NO se obtuvieron, y por qué

| Campo | Estado | Razón |
|---|---|---|
| **COMMIT_SHA** | **NO DISPONIBLE** | No está empaquetado en el APK. No lo invento |
| **BUILD_RECEIPT** | **NO DISPONIBLE** | Hay que generarlo en el build; no se lee del aparato |
| **DEVICE_TEST_RECEIPT** | **PARCIAL** | Existe la medición del dispositivo (`PLAYBACK_ONN4K_OTT_20261112.md`), pero no es un recibo de instalación→registro→política→reproducción completo |

## El hallazgo de esta ronda: la APK es DEBUGGABLE

`dumpsys package` declara `pkgFlags=[ DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA ]`.

**Verificado con prueba directa y con control:**

```
run-as com.ape.crystalagent id
  -> uid=10124(u0_a124) ... context=u:r:runas_app:s0:c124,c256,c512,c768

run-as com.ape.crystalagent ls -la /data/data/com.ape.crystalagent
  -> cache/  code_cache/  databases/  files/  lib -> ...

CONTROL · run-as studio.scillarium.ottnavigator id
  -> run-as: package not debuggable: studio.scillarium.ottnavigator
```

**Cualquier persona con acceso ADB a esta caja puede leer los datos privados de la APK**: `databases/` y `files/`. Si ahí hay tokens de registro —y §6/§7 los contemplan— quedan expuestos a cualquiera que pueda conectar por ADB.

El control prueba que no es una limitación del aparato: otra app del mismo aparato **sí** rechaza `run-as`. Es una propiedad de esta APK.

**No se ha tocado nada.** Convertirla en no-debuggable es un cambio de build (`android:debuggable="false"` / build type release), y puede romper flujos de desarrollo que hoy dependen de ella. Es decisión del operador.

## Un falso positivo que descarté antes de escribirlo

`dumpsys` dice `primaryCpuAbi=armeabi-v7a` sobre un SoC arm64, y estuve a punto de reportarlo como defecto de la APK. La comprobación:

```
ro.product.cpu.abilist       = armeabi-v7a,armeabi
ro.product.cpu.abilist64     = (vacio)          <- el APARATO no tiene userspace 64-bit
```

Y la APK trae **las cuatro ABIs**: `lib/arm64-v8a`, `lib/armeabi-v7a`, `lib/x86`, `lib/x86_64` (20 librerías nativas).

**El 32 bits lo impone el dispositivo, no la APK.** La APK es universal y correría 64 bits en otra caja. Es el cuarto falso positivo que la verificación previa detiene en esta sesión.

*Nota derivada:* al ser universal pesa 26,9 MiB; un APK dividido por ABI sería sensiblemente menor. Es una observación de tamaño, no un defecto.
