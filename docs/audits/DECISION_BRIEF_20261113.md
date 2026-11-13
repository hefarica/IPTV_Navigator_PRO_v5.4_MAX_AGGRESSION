# Brief de decisiones — 2026-11-13

**Para qué es esto:** la sesión produjo mediciones, no cambios en producción. Todo lo que sigue **necesita tu decisión** o tu autorización. Está ordenado por lo que puede hacer daño si no se toca, no por lo interesante que sea.

---

## D-1 · Rotar la clave ADB privada de la APK — **URGENTE**

**Qué pasa:** `com.ape.crystalagent` está compilada **DEBUGGABLE** y su almacenamiento privado tiene `files/adbkey` (1.703 B, **clave privada de host ADB**), `files/state_token` (44 B) y `files/event_token` (48 B) en **texto plano**.

**Probado:**
- `run-as com.ape.crystalagent id` funciona; el **control** (`ottnavigator`) responde *«package not debuggable»*.
- De **19 apps de terceros** del aparato, **solo esta** es debuggable. Las otras 18 son release.
- Los tokens son texto plano: 44/48 B con primer byte ASCII, **no** ciphertext.
- La app **sabe cifrar** — `ape_secure.xml` solo contiene los keysets de **AndroidX Crypto**. Usa cifrado para preferencias y **no** para los tokens ni para la clave ADB.

**Por qué es lo más urgente:** una clave ADB privada autentica contra los dispositivos que la tengan autorizada. **La exposición no termina en este televisor.**

**Qué haría yo con tu OK:**
1. Nada sobre la clave sin el paso 2 primero — rotar una clave que sigue en un fichero legible no arregla nada.
2. Necesito que **recompiles** con `debuggable false` y sin `adbkey` en `files/` (Keystore o provisión por sesión). Eso es del build, no mío.
3. Después: rotar clave ADB y los dos tokens.

**Riesgo de no hacerlo:** cualquiera con acceso ADB a esa red lee la clave y los tokens. Hoy hay depuración inalámbrica activada en ese aparato.

---

## D-2 · El perfil y la familia de códec se declaran sin medir — **decisión de diseño**

**Qué pasa:** el catálogo declara cosas que el flujo no cumple.

| Declaración | Medido |
|---|---|
| `ape-profile` | **16 de 21** canales que declaran resolución la **sobre-declaran** (uno sirve **576p** diciendo 2160p) |
| `ape-codec-family` | **7 de 7** declaran `hevc` y sirven **h264** |

**La causa está en el código, no en un dato mal cargado:**
- `tools/pulse/ape-pulse-wrap.js:72` → `function profileForChannel(name, group)` — el perfil sale del **nombre**.
- `m3u8-typed-arrays-ultimate.js:8245` → la familia de códec cae al **perfil** y luego a `'HEVC'` por defecto.

**Tres salidas honestas, elige una:**
1. **Medir antes de declarar** (sondear al construir la lista). Es lo más correcto y lo más caro: un `ffprobe` por canal.
2. **Declarar la etiqueta como etiqueta** y la resolución real medida aparte.
3. **Documentar que son preferencias, no hechos** — y que ningún consumidor las trate como verdad.

**Nota:** G-2 no es un bug. El comentario `L8240-8244` dice que se puso HEVC por mandato de **MAX IMAGE FIRST** y que antes declaraba h264 en el 100 %. Es una decisión, pero **choca con §11** y nunca se había medido su efecto.

---

## D-3 · ¿Corro el censo del catálogo completo?

La herramienta `tools/quality/audit_declared_vs_real.ps1` ya audita por muestras. Sobre los **1,3 GB** de la lista viva serían **horas** de `ffprobe`.

Con tu OK puedo: paralelizar, cachear por `tvg-id`, y **priorizar los P0/P1** (los que prometen 4K/8K), que es donde aparecieron todos los incumplimientos.

**Lo que daría:** «N canales de M no sirven lo que declaran, y estos son», en vez de una muestra de 21.

---

## D-4 · TiviMate: no está instalado

No lo he podido probar. §14 lo tiene en `NOT_COMPUTED` y así se queda hasta que se instale. **No hay forma de medirlo sin instalarlo.**

---

## D-5 · Pendientes que ya estaban y siguen abiertos

| | |
|---|---|
| Rotar `ape.enroll.secret` | 29 de 34 binarios, sin rotar desde 2026-10-30 |
| Autenticar `conviva-event.php` | Parche listo; incompleto sin `fastcgi_param HTTP_AUTHORIZATION` |
| Aplicar `0006` (5 lua usadas) | `git apply --check` 0; manifiesto 33 → 38 filas |
| `D-4` entregables fuera del `.gitignore` | 4,23 MiB, 8 ficheros |
| `H-1` bucle Canary en el manifiesto | Parche listo; cuesta CPU (57 s por clip de 6 s) |

---

## Lo que NO necesita decisión porque ya está hecho y verificado

- Motor desplegado y sirviendo (`/jit/health` 200), pipeline verde con 11 comprobaciones.
- Reconciliador con `--audit` fail-closed, `--plan` con riesgos y rollback, `--apply` con `--yes`.
- `/pulse/` medido: sirve el manifiesto del proveedor sin metadata; el vídeo no pasa por el VPS.
- ONN 4K medido: AVC 1080p decodificado, audio AAC en software, **SoC a 63,7 °C con umbral 65,0**.
- Herramientas nuevas: `measure_onn.ps1`, `sample_playback.ps1`, `audit_declared_vs_real.ps1`.

---

## Lo que sigue sin medir, y no depende de mí

**Nadie ha mirado el panel.** Hay resolución, bitrate, códec, temperatura y continuidad medidos. **Cero píxeles vistos por una persona.** Todo lo que dice «se ve» en cualquier informe de esta sesión está sin verificar.

## Anexo medido · estado de sincronización de la APK (2026-11-13)

Leído de `shared_prefs/ape_sync.xml` **solo nombres de clave y timestamps**, sin ningún token:

| Clave | Valor | Lectura |
|---|---|---|
| `lkg_ts` | 1794541480 | epoch = 2026-11-13 |
| `lkg_valid_until` | 1794541510 | ts + **30 s** → ventana corta, coherente con sync vivo |
| `lkg_seq` | 10129 | número de secuencia alto: la app **ha sincronizado muchas veces** |
| `lkg_profile` | **P2** | el servidor le asignó P2 (QHD) |

Y la forma de los tokens, sin contenido: `state_token` 44 B primer byte ASCII `Y`, `event_token` 48 B primer byte `1` → **texto plano**, no ciphertext.

Esto **cierra parcialmente §7**: la app sincroniza y tiene last-known-good con perfil asignado. Lo que **no** prueba: que el registro esté autenticado con credencial por instalación, ni que la política recibida se aplique.
