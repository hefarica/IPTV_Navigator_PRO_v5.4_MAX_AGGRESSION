# tools/ara — Plano de control de dispositivos y coherencia de distribución

## Qué hay aquí

| Fichero | Rol |
|---|---|
| `check_ara_dist_coherence.js` | Gate: verifica que `version.json` describe **realmente** al APK servido (sha256, tamaño, versionCode/Name, ZIP válido y ABIs). |
| `repair_apk_manifest.py` | Repara el `AndroidManifest.xml` **binario** de un APK compilado (sin Gradle), realinea y re-firma. |

## Reparar un APK que Android rechaza

**Síntoma:** el instalador del TV dice *"No se instaló la app porque parece que el paquete no es válido"* (`INSTALL_FAILED_INVALID_APK`).

**Causa medida el 2026-11-07:** el manifest declaraba

```xml
android:icon="@android:drawable/ic_media_play"
android:banner="@android:drawable/ic_media_play"
```

`@android:drawable/*` es un recurso del **framework**. El id `0x01080024` no resuelve en el framework del dispositivo y PackageManager rechaza el paquete entero. Afectaba a **los 19 APK** de `ara-x/app-dist` (`aapt` → `rc=1`, `ERROR getting 'android:icon' attribute`).

```bash
python tools/ara/repair_apk_manifest.py \
  --in agent.apk --out agent_fixed.apk \
  --version-code 600 \
  --zipalign  "$ANDROID_HOME/build-tools/34.0.0/zipalign.exe" \
  --apksigner "$ANDROID_HOME/build-tools/34.0.0/apksigner.bat" \
  --keystore ~/.android/debug.keystore --ks-pass android --ks-key-alias androiddebugkey
```

El script **elimina** los atributos (neutralizarlos a `TYPE_NULL` no basta: aapt sigue intentando resolverlos), corrige los tamaños del chunk, realinea y firma v1+v2+v3.

**Verificación obligatoria del resultado:**

```bash
aapt dump badging agent_fixed.apk -I "$ANDROID_HOME/platforms/android-34/android.jar"
# debe salir rc=0, sin errores, con 'application:' y 'launchable-activity:'
```

La fuente también quedó corregida (`android/ape-crystal-agent/app/src/main/AndroidManifest.xml`): si algún día se quiere icono propio, usar `@mipmap/ic_launcher`, **nunca** `@android:drawable/*`.

## Instalación universal (idempotente)

El worker no pregunta marca ni modelo. Cascada en `smart_install()`:

| Estado previo | Acción |
|---|---|
| no instalado | `install -d` |
| misma versión | **no-op** (idempotente) |
| versión anterior | `install -r -d` |
| versión posterior | `install -r -d` (downgrade permitido) |
| firma distinta / estado corrupto | `uninstall` + `install` |
| acción **Reparar** | `uninstall` + `install` aunque la versión coincida |

El éxito **no** se cree al `adb`: se comprueba el `versionCode` realmente instalado con `dumpsys package`.


## El gate de coherencia

```bash
# contra el manifiesto y el APK del repo
node tools/ara/check_ara_dist_coherence.js

# rutas explícitas (el APK publicado normalmente NO vive en el repo)
node tools/ara/check_ara_dist_coherence.js \
  --manifest IPTV_v5.4_MAX_AGGRESSION/vps/ara/version.json \
  --apk      /var/www/html/ara/agent.apk

# salida máquina
node tools/ara/check_ara_dist_coherence.js --json
```

**Exit codes:** `0` coherente · `1` drift o estructura inválida · `2` no se pudo leer una entrada (sin APK **no** se puede afirmar coherencia — el gate no la inventa).

### Por qué existe

Defecto medido el **2026-11-07**: la copia del repo en `vps/ara/version.json` declaraba

```
versionCode 1 · 2.0.0 · sha256 91cde550… · size 34192621
```

mientras el APK realmente desplegado en `/var/www/html/ara/agent.apk` era

```
versionCode 6 · 2.3.0-noWG · sha256 e1d47129… · size 27625887
```

Desplegar ese manifiesto habría roto el auto-update del APK: el cliente compara `sha256`/`size` contra lo que descarga. Corregido; el gate ahora lo detecta en CI antes de publicar.

## Matriz genérica de dispositivos

El plano de control es **genérico por diseño**, no un caso especial por marca. Cubre:

- **ONN 4K** — `arm64-v8a`, Android TV
- **Fire TV Stick 4K** — `armeabi-v7a`, Fire OS
- **Cualquier otro** Android / Android TV con depuración habilitada

Dos razones por las que es genérico y no un hardcode:

1. **El APK publicado es universal.** Contiene `lib/arm64-v8a`, `lib/armeabi-v7a`, `lib/x86`, `lib/x86_64`. Un solo paquete instala en los tres casos. (El gate verifica que `arm64-v8a` y `armeabi-v7a` sigan presentes: su ausencia rompería respectivamente ONN 4K y Fire TV.)

2. **La detección usa solo `getprop` estándar**, nunca marca ni SoC fijados en el código:

| Campo | Propiedad leída | Para qué |
|---|---|---|
| modelo | `ro.product.model` | identificación en la UI |
| fabricante | `ro.product.manufacturer` | deriva `fireos` si es Amazon |
| versión Android | `ro.build.version.release` | compatibilidad `min_android` |
| SDK | `ro.build.version.sdk` | nivel de API real |
| ABI | `ro.product.cpu.abi` | confirma que la ABI primaria está en el APK |
| SoC | `ro.board.platform` | diagnóstico visual (AI-PQ depende del SoC) |
| forma | `ro.build.characteristics` | `tv` ⇒ Android TV |

## Resolución de transporte (polimórfica)

El worker no asume una IP. Orden de candidatos:

1. seriales ya listados por `adb devices` (USB o red)
2. peers WireGuard presentes en `wg show` (`allowed ips 10.200.0.0/24`)
3. IPs del registro `ape_devices.db` (vía PHP — el VPS **no** tiene el CLI `sqlite3`)
4. `APE_KNOWN_DEVICES` (override del operador)

Gana el primero que responda `device`. El transporte usado se reporta en la UI.

## Lo que este plano NO hace

- **No activa ADB remotamente.** ADB requiere autorización RSA por host en el dispositivo, de forma presencial. Si no está autorizado, el trabajo falla y lo dice.
- **No instala nada sin verificar el APK.** El worker comprueba `sha256` contra `version.json` antes de tocar el dispositivo; si no cuadra, aborta sin instalar.
- **No declara éxito sin verificar.** El `versionCode` realmente instalado (`dumpsys package`) debe coincidir con el objetivo; si no, el job es `failed`.

## Estado verificado (2026-11-07)

| Hecho | Evidencia |
|---|---|
| Gate verde contra el APK real de producción | `node … --manifest … --apk /var/www/html/ara/agent.apk` → `VEREDICTO: COHERENTE`, `EXIT=0` |
| Gate detecta el drift | mismo comando contra el APK de desarrollo → `VEREDICTO: DRIFT en [size_matches, sha256_matches]`, `EXIT=1` |
| APK universal | 4 ABIs presentes en el ZIP central directory del APK servido |
| Endpoint responde | `?action=version` → `{"ok":true,…,"coherent":true,"drift":[]}` |

**No verificado / limitación honesta:** al cierre de esta sesión ningún dispositivo estaba alcanzable desde el VPS (peer WireGuard `10.200.0.3` sin handshake, `adb devices` vacío). Por tanto el camino **instalar/actualizar/reinstalar** está implementado y probado en sintaxis y en su lógica de fallo, pero **no se ha ejecutado contra un dispositivo real** todavía. La primera ejecución contra un dispositivo encendido y autorizado es la prueba pendiente.
