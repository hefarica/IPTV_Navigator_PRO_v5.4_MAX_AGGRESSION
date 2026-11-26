# Instalador APE CRYSTAL FLOW — Fire TV (doble clic)

Paquete de **un doble clic** en Windows que deja la app APE Crystal Flow **instalada** (Fire TV nuevo)
o **actualizada** (Fire TV que ya la tiene), sin pasos manuales. Objetivo: **Fire TV / Fire OS**; sirve
igual para cualquier Android con `adb`.

- APK publicado: `/ara/agent.apk` · **24.029.140 B** · sha256 `9bded476be0ec7a23eeceee965013d9b19410c84f6b2c37433c65aeabc4d8d6f` · versionCode **675**
- El manifiesto que se lee es `https://iptv-ape.duckdns.org/ara/version.json` (mismo endpoint que usa
  el tool base; se puede apuntar a otro con la variable `APE_DIST_URL`).

---

## Instalar (Fire TV nuevo) — 2 líneas

1. Doble clic en `tools\instalar-ape.bat`, escribe la IP del Fire TV cuando la pida (formato `192.168.1.40`).
2. Espera: instala, verifica el sha256 y termina con `RESULTADO: OK`.

## Actualizar — 2 líneas

1. Doble clic en `tools\instalar-ape.bat` (misma IP o el device ya conectado).
2. Si ya está en la build publicada, imprime **`YA AL DIA … NO se reinstala`** y sale **0**.

También por línea de comandos:

```bat
tools\instalar-ape.bat 192.168.1.40:5555        &rem  conectar por red y seguir
tools\instalar-ape.bat 192.168.1.40             &rem  igual; se anade :5555
tools\instalar-ape.bat --selftest               &rem  prueba el clasificador de errores (sin device)
tools\instalar-ape.bat <ip> --nopause           &rem  sin pausa final (CI)
```

---

## Fire TV: lo que hay que activar ANTES (una vez por device)

1. **Ajustes → Mi Fire TV → Opciones de desarrollador**
   - **Depuración ADB** → ACTIVADA
   - **Apps de orígenes desconocidos** / *Instalar apps desconocidas* → ACTIVADA
   (Si no aparece el menú: Ajustes → Mi Fire TV → *Acerca de* → pulsa 7 veces en el nombre del device.)
2. **Ajustes → Mi Fire TV → Red**: apunta la **IP** del Fire TV; es la que se pasa al instalador.
3. La primera vez, el Fire TV muestra un diálogo **“Permitir depuración”** con la huella del PC:
   acéptalo (marca “recordar siempre”).

Conexión manual equivalente, si algo falla:

```bat
adb connect 192.168.1.40:5555
adb devices                 &rem  debe decir:  192.168.1.40:5555   device
adb -s 192.168.1.40:5555 shell get-state
```

El instalador hace ese `adb connect` y **exige** el estado `device` antes de tocar nada. Un device en
`unauthorized` **no es un device**: se declara y sale **2**.

---

## Qué hace con 0 / 1 / 2+ dispositivos

| Situación | Comportamiento |
|---|---|
| **0 dispositivos y sin IP** | pide la IP por teclado; si la dejas vacía → `NO COMPUTADO` y **sale 2**. Con `--nopause` no pregunta: sale **2** directamente. |
| **0 dispositivos con `unauthorized`/`offline`** | lo dice con la causa (acepta el diálogo / reconecta) y **sale 2**. |
| **1 dispositivo** | sigue; imprime `INSTALAR` (paquete ausente) o `ACTUALIZAR` (`adb install -r`). |
| **2 o más** | **no toca nada**: lista los seriales y **sale 2** (instalar en varios a la vez puede escribir el APK equivocado en uno). |
| **IP por argumento** | conecta por red, confirma `device` y sigue. |

## Errores de Fire OS que el instalador nombra (no “fallo genérico”)

| Texto del device | Qué hace el instalador |
|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | **sale 3** y explica que el paquete ya está con **otra firma**; imprime el comando manual. **NO desinstala solo**: esa decisión es del operador (se pierden datos y enrolamiento). |
| `INSTALL_FAILED_USER_RESTRICTED` / `INSTALL_FAILED_VERIFICATION_FAILURE` / `INSTALL_CANCELED_BY_USER` / “unknown sources” | dice que la causa es **orígenes desconocidos** desactivado (o bloqueo del sistema) y dónde activarlo. |
| otro fallo | lo muestra tal cual, comprueba el sha real y **no declara éxito**. |

El clasificador se puede probar **sin device**: `tools\instalar-ape.bat --selftest` (5 casos, sale 0 si
todos pasan).

## Verificación que hace antes de decir OK

1. `node tools\ape-bootstrap-device.js --check <serial>` → estado `MISSING` / `OUTDATED` / `CURRENT` / `AHEAD`
   (JSON del tool, no su código de salida: se midió que puede abortar al salir **después** de imprimir).
2. Si hay que instalar: `--pipeline <serial>` (descarga con sha verificado + `adb install -r`) y **se
   vuelve a preguntar el estado** (post-condición).
3. `adb shell pm path com.ape.crystalagent` → **la ruta real** (en Fire TV puede ser
   `/data/app/~~hash==/.../base.apk`, no se asume), `adb pull` + `certutil -hashfile … SHA256`.
4. Compara ese sha con el publicado. **Sólo si coinciden y el estado es `CURRENT`** imprime `OK` y sale 0.

Códigos de salida: **0** OK · **1** el device no tiene la build publicada (o va por delante) ·
**2** no computado/error · **3** firma incompatible (decisión del operador).

---

## Qué NO hace

- **No toca el VPS**, nginx, ni la configuración del servidor: sólo habla con el device por `adb` y lee
  `version.json`.
- **No cambia la configuración de la app** ni el subsistema QoE: instala el APK y verifica el sha.
- **No reinstala si el sha ya coincide** (idempotente: segunda ejecución = “ya está al día”, sale 0 y no
  descarga ni instala nada).
- **No desinstala nunca solo** (ver `INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
- **No inventa éxito**: si no puede leer el sha del device, si el estado no es `CURRENT` o si falta
  node/adb, sale **2** diciéndolo.
- **No reimplementa el pipeline**: la descarga, la verificación de sha del APK y el `adb install -r`
  están en `tools/ape-bootstrap-device.js`. Este paquete aporta la capa de operador (red, estados,
  clasificación de errores) y la verificación final.

## Rollback

```bat
adb -s <serial> uninstall com.ape.crystalagent
```

Si sólo quieres **apagar** el plano QoE sin desinstalar (rollback lógico, sin reinstalar el APK):

```bat
adb -s <serial> shell am force-stop com.ape.crystalagent
&rem  y en la app: pref qoe_apply=0 (apagado lógico del consumidor del contrato QoE)
```

Volver a la build anterior: reinstalar el APK servido anterior (v651, sha256 `8d3b1458…`) con
`adb install -r`, que es downgrade permitido sólo con `-d` si Fire OS lo exige.

---

## Requisitos del PC

- **Windows** con `cmd` (el `.bat` es ASCII + CRLF a propósito).
- **Node.js 18+** en el `PATH` (el tool usa `fetch`).
- **adb** en el `PATH` o en `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
- PC y Fire TV en la **misma red** (ADB por red, puerto 5555).

## NO COMPUTADO (declarado, no tapado)

- **No hay Fire TV físico en este entorno**: la rama “1 device → instalar → sha OK → salir 0” no se ha
  ejecutado de punta a punta. Se han ejecutado y verificado: 0 devices, 2 devices, `unauthorized`,
  `offline`, IP por argumento + `connect`, ausencia de `adb`, y el clasificador de errores
  (`--selftest`, 5/5). Además, un `adb` simulado **no** puede suplir al real para el tool de node:
  Node 20+ se niega a lanzar `.bat`/`.cmd` sin `shell:true`, así que el tramo que hace node queda
  declarado como no computado en lugar de fingido.
- La ruta del `base.apk` en Fire OS 7/8 (`/data/app/~~hash==/…`) está soportada por diseño (`pm path`),
  pero **no medida** en un Fire TV de este entorno.
