# PROCEDIMIENTO DE ROTACION DE `ape.enroll.secret`

**Estado del documento: PROCEDIMIENTO ESCRITO, NO EJECUTADO.**
**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t21 · **Fecha:** 2026-11-11

> **Este documento no rota nada.** No se ha cambiado el secreto, ni `local.properties`, ni el VPS, ni se ha desplegado. Es la receta para que la ejecute el operador, con cada paso marcado como **VERIFICADO** (sostenido por una ruta del repo que he leido) o **NO_COMPUTADO** (no lo puedo determinar desde aqui, y digo por que).

**Contexto que motiva la rotacion:** el valor **actual** del secreto esta en claro en **29 de los 36 APK del workspace**, incluidos 4 de `deliverables/` y 2 de `artifacts/`, y no se ha rotado en al menos 12 dias (2026-10-30 → 2026-11-11). Detalle medido: [`docs/audits/APK_SECRET_SCAN_20261111.md`](../audits/APK_SECRET_SCAN_20261111.md).

---

## 0. LA IDEA QUE ORDENA TODO EL PROCEDIMIENTO

> **La rotacion del servidor es lo que cierra la exposicion. La reconstruccion del APK es solo continuidad, no seguridad.**

En cuanto el servidor deja de aceptar el valor viejo, los 29 binarios filtrados **dejan de servir para enrolar**. Reconstruir el APK no aporta nada a la seguridad de lo ya filtrado: solo hace que las instalaciones nuevas sigan funcionando. Si solo se puede hacer una cosa, **se hace la del servidor**.

---

## 1. CONSUMIDORES DEL SECRETO (quien lo usa, trazado a linea)

| # | Consumidor | Que hace | Fuente | Estado |
|---|---|---|---|---|
| 1 | **Cliente APK** (`com.ape.crystalagent`) | Envia el secreto en el cuerpo del POST de enrolamiento | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\src\main\java\com\ape\crystalagent\EnrollClient.kt:46` `.put("secret", BuildConfig.ENROLL_SECRET)` · `:53` `.url("${cfg.vpsBase}/ara/enroll")` | **VERIFICADO** |
| 2 | **Inyeccion en build** | Mete el valor en `BuildConfig` al compilar | `app\build.gradle.kts:12-19` (orden: `local.properties` → env `APE_ENROLL_SECRET` → placeholder) y `:31` `buildConfigField("String","ENROLL_SECRET", …)` | **VERIFICADO** |
| 3 | **Validador servidor** | Compara con `hash_equals` (tiempo constante) | `IPTV_v5.4_MAX_AGGRESSION\vps\prisma\api\ara-enroll.php:29` `getenv('APE_ENROLL_SECRET')` · `:30` si falta o `strlen<16` → **503 `ENROLL_DISABLED`** · `:38` `if (!hash_equals($secret, $given)) ee_fail(401, 'BAD_SECRET')` | **VERIFICADO** |
| 4 | **Origen del valor en el servidor** | El secreto vive en el **env del pool php-fpm**, no en nginx ni en el repo | `vps\nginx\snippets\prisma-ara-enroll.conf:7-8`: *"El secreto NO esta aqui: lo valida ara-enroll.php contra env APE_ENROLL_SECRET del pool php-fpm"* + receta `echo 'env[APE_ENROLL_SECRET] = <secreto-largo-random>' >> /etc/php/8.3/fpm/pool.d/www.conf && systemctl reload php8.3-fpm` | **VERIFICADO (documentado en el repo)** |
| 5 | **Ruta nginx** | Publica `POST /ara/enroll` → `ara-enroll.php` | `vps\nginx\snippets\prisma-ara-enroll.conf:12-26` (`limit_except POST OPTIONS { deny all; }` en `:13`; `SCRIPT_FILENAME /var/www/html/prisma/api/ara-enroll.php` en `:23`) | **VERIFICADO** |
| 6 | **Worker root** | Hace el `wg set` + persistencia. **NO valida el secreto** | `vps\enroll\ape-enroll-worker.py:7` *"solicitud ya autenticada por el endpoint"*; `:11` solo re-valida la pubkey | **VERIFICADO** |
| 7 | **Copia del validador en el repo == desplegado** | `ara-enroll.php` local: 3.746 B, sha256 `adf07d6fb5846172a4a7f309684e00ba08171fc5c1309ae6c67c6b7dfe168d3c` | Coincide **exactamente** con el tamano y sha registrados en `ara-x\reports\R3_vps_sync_reality.md:207` | **VERIFICADO (cruce documental)** |

**Cadena completa:** `local.properties` → `buildConfigField` → `BuildConfig.ENROLL_SECRET` → POST `/ara/enroll` → `hash_equals(getenv('APE_ENROLL_SECRET'))` → cola `/dev/shm/ape_enroll/` → worker root → `wg set wg0 peer`.

**Ningun otro consumidor:** `git grep -ln "ENROLL_SECRET"` devuelve 18 ficheros rastreados, y de ellos solo **4** son codigo vivo (`build.gradle.kts`, `EnrollClient.kt`, `ara-enroll.php`, `prisma-ara-enroll.conf`); el resto son informes, documentacion, un script de CI y `scan_secrets.js`. **VERIFICADO**.

---

## 2. QUE SE ROMPE SI SE ROTA MAL

| Escenario | Consecuencia | Base |
|---|---|---|
| Se rota el servidor y **no** se reconstruye el APK | Todo APK ya emitido (los 29) envia el secreto viejo → **401 `BAD_SECRET`**. Los dispositivos **ya enrolados conservan su config WireGuard** (el enrol es bootstrap, no continuo), pero **ningun dispositivo nuevo puede enrolarse** con un APK antiguo. | `ara-enroll.php:38` + `EnrollClient.kt:46` — **VERIFICADO** |
| Se reconstruye el APK con el valor nuevo y **no** se toca el servidor | El APK nuevo da **401 `BAD_SECRET`** hasta que el servidor acepte el valor nuevo. | idem — **VERIFICADO** |
| Se deja `env[APE_ENROLL_SECRET]` **vacio** en el pool | **Fail-closed correcto**: `:30` devuelve **503 `ENROLL_DISABLED`**. No acepta nada por accidente. *(Propiedad de seguridad a favor: un error de configuracion deshabilita, no abre.)* | `ara-enroll.php:30` — **VERIFICADO** |
| Se rota con `local.properties` ausente y sin env | El build inyecta el **placeholder** `CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS` (`build.gradle.kts:18`) → ese APK **nunca** podra enrolar (401). | `build.gradle.kts:16-18` — **VERIFICADO** |
| Se rota **solo** el APK y se dejan circulando los 29 binarios | **La exposicion sigue abierta**: cualquiera con un binario antiguo y el secreto viejo sigue enrolando mientras el servidor acepte ese valor. | §0 — **VERIFICADO por logica del validador** |

### 2.1 No hay ventana de gracia (esto es lo que hay que decidir)

El validador compara contra **un unico valor**: `hash_equals($secret, $given)` (`ara-enroll.php:38`). **No existe aceptacion de dos secretos simultaneos.** Por tanto la rotacion es un **corte seco**: hay un instante en que el valor viejo deja de valer.

- Si el operador acepta un corte de minutos (no hay enrolamientos en curso): **Plan A** (§3).
- Si necesita cero corte: hace falta **modificar el validador** para aceptar una lista `viejo,nuevo` durante la transicion → **Plan B** (§3.2). Es un cambio de codigo servidor; **NO EJECUTADO ni autorizado aqui**.

---

## 3. ORDEN CORRECTO

### 3.1 Plan A — corte seco (recomendado si no hay enrolamientos en vuelo)

| Paso | Accion | Estado |
|---|---|---|
| **A1** | **Generar el valor nuevo** con CSPRNG, longitud ≥ 32 (el actual mide 48). Ej.: `openssl rand -hex 24` → 48 chars. **No reutilizar** el placeholder ni un valor de ejemplo. | **NO EJECUTADO** (el operador) |
| **A2** | **Registrar la huella del valor nuevo** (`sha256` del valor + longitud) en el parte de cambio. **Nunca** el valor. | Receta: `sha256sum` sobre el valor sin guardarlo en historial de shell (`history -d`) — **NO EJECUTADO** |
| **A3** | **Aplicar el valor nuevo en el servidor**: fijar `env[APE_ENROLL_SECRET] = <nuevo>` en `/etc/php/8.3/fpm/pool.d/www.conf` (**sustituyendo** la linea vieja, no anadiendo otra) y `systemctl reload php8.3-fpm`. | Receta **documentada en el repo**: `vps\nginx\snippets\prisma-ara-enroll.conf:8` — **VERIFICADO como receta**; la ejecucion es **NO EJECUTADA** y el estado real del pool es **NO_COMPUTADO** (requiere el VPS) |
| **A4** | **Verificar en el servidor que el valor viejo ya NO vale**: un POST con el secreto viejo debe devolver **401 `BAD_SECRET`**, y un POST con el nuevo debe devolver 200 con config WG. | **NO COMPUTADO desde aqui**: exige contactar `https://<vps>/ara/enroll`, prohibido en esta tarea. Plantilla en §5.1 |
| **A5** | **Reconstruir el APK** con el valor nuevo (build normal; el valor entra por `local.properties` **o** por env `APE_ENROLL_SECRET`, `build.gradle.kts:14-17`). | Receta de build: `docs/audits/APK_FEASIBILITY_20261111.md` §7 — **VERIFICADO** (la compilacion se reprodujo 3 veces, 2 offline) |
| **A6** | **Verificar que el APK nuevo funciona contra el servidor** (un dispositivo de prueba enrola). | **NO COMPUTADO** (requiere dispositivo + VPS) |
| **A7** | **Retirar/destruir los 29 binarios** con el secreto viejo, empezando por `deliverables/` (4) y `artifacts/` (2). Borrar tambien `app\build\`, `scratch\` y `_incoming\` locales. | Inventario completo en `docs/audits/APK_SECRET_SCAN_20261111.md` §2-3 — **VERIFICADO (lista medida)** |
| **A8** | **Verificar que el valor viejo ya no esta en claro** en lo que quede, y que el nuevo tampoco. | Receta en §5.2 — **VERIFICADO (el metodo esta probado en 36 APK)** |

> **El paso que cierra la exposicion es A3.** A4 lo demuestra. A5-A8 son continuidad e higiene.

### 3.2 Plan B — cero corte (requiere cambio de codigo servidor)

1. Modificar `ara-enroll.php:38` para aceptar una lista separada por comas (`APE_ENROLL_SECRET=viejo,nuevo`) y comparar con `hash_equals` contra cada elemento. **NO EJECUTADO** — es un cambio de codigo de servidor y esta fuera del alcance de esta tarea (no autorizado).
2. Desplegar ese cambio **antes** de rotar; luego A1→A8; luego retirar el valor viejo de la lista y volver a desplegar.
3. Riesgo declarado: durante la ventana **ambos** secretos valen, incluido el filtrado en 29 binarios → **la exposicion no se cierra hasta el ultimo paso**. Por eso el Plan A es preferible si el corte es tolerable.

---

## 4. EMITIR UN APK SIN EL SECRETO EMBEBIDO

### 4.1 Lo que se puede hacer HOY, con el codigo actual (sin tocar codigo)

| Opcion | Receta | Resultado | Estado |
|---|---|---|---|
| **Placeholder inerte** | Compilar **sin** `ape.enroll.secret` en `local.properties` **y sin** `APE_ENROLL_SECRET` en el entorno → `build.gradle.kts:16-18` cae al placeholder `CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS` | El APK **no lleva el secreto real**, pero **tampoco enrola**: dara **401 `BAD_SECRET`**. Es *fail-closed*, util solo si el enrolamiento no se usa en ese build. | **VERIFICADO** por lectura de `build.gradle.kts:12-19` |
| **Solo variable de entorno** | Compilar con `APE_ENROLL_SECRET` en el entorno del build y **sin** `local.properties` | Sigue **embebiendo** el valor real. **No reduce la exposicion.** | **VERIFICADO** (`:17`) |

**Conclusion honesta:** con el codigo actual **no existe** una forma de emitir un APK que enrolе y que ademas no lleve el secreto. Cualquier valor que llegue al build acaba en `BuildConfig` y por tanto en el `.dex`.

### 4.2 Lo que haria falta de verdad (propuesta, NO EJECUTADA)

**Quitar el secreto del build.** Cambios necesarios, ninguno aplicado:

1. Eliminar `buildConfigField("String","ENROLL_SECRET", …)` de `app\build.gradle.kts:31` (y el bloque de lectura `:12-19`).
2. En `EnrollClient.kt`, leer el secreto **en runtime** desde almacenamiento cifrado (`EncryptedSharedPreferences` ya es dependencia: `build.gradle.kts:92`) y provisionarlo por entrada manual o QR en el primer arranque.
3. **Rotar** y **revocar** el valor actual en el servidor (Plan A) — el codigo nuevo ya no depende del valor viejo.

**Estado: PROPUESTA. No implementada, no probada, no autorizada en esta tarea.**

### 4.3 Advertencia que el propio repo ya trae

`IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build.gradle.kts:35-37` (cita literal):

```
// Key de /sync cifrada AES-256-GCM dentro del APK (decisión del propietario:
// instalación autocontenida; un secreto en APK es ofuscación, no seguridad fuerte).
buildConfigField("String", "SYNC_KEY_ENC", …)
```

> **Un secreto en un APK es ofuscación, no seguridad fuerte.** Aplicado al enrolamiento: no es que este build tenga un fallo; es que **el patron "secreto baked" no puede ser seguro**, y por eso la rotacion + el paso a provision en runtime son la unica salida duradera.

Y una regla operativa que se desprende de la evidencia: **el APK `debug` no se distribuye.** El que compilamos aqui es `application-debuggable` (§`docs/audits/APK_FEASIBILITY_20261111.md` §8.1) y ademas lleva el secreto. Con 29 binarios filtrandolo, la regla "no distribuir el debug" **no habria bastado** — hace falta rotar igualmente.

---

## 5. COMO VERIFICAR

### 5.1 Que el enrolamiento sigue vivo (y que el valor viejo ya no vale)

> **Esto lo ejecuta el operador contra el VPS. NO se ejecuto aqui** (contactar el VPS esta prohibido en esta tarea).

```bash
# 1) El valor NUEVO debe enrolar -> 200 con config WireGuard
curl -sS -X POST https://<vps>/ara/enroll \
  -H 'Content-Type: application/json' \
  -d '{"secret":"<NUEVO>","device_pubkey":"<43 chars base64>=","device_id":"rot-check","model":"rotcheck"}' \
  -w '\nHTTP %{http_code}\n'

# 2) El valor VIEJO debe ser RECHAZADO -> 401 BAD_SECRET
curl -sS -X POST https://<vps>/ara/enroll \
  -H 'Content-Type: application/json' \
  -d '{"secret":"<VIEJO>","device_pubkey":"<43 chars base64>=","device_id":"rot-check-old","model":"rotcheck"}' \
  -w '\nHTTP %{http_code}\n'
```

Codigos esperados, tomados del codigo (`ara-enroll.php`):

| Respuesta | Significado | Linea |
|---|---|---|
| `200` + JSON con config WG | enrolamiento OK | `:77-79` |
| `401 BAD_SECRET` | el secreto enviado no es el vigente | `:38` |
| `503 ENROLL_DISABLED` | `APE_ENROLL_SECRET` ausente o `len<16` en el pool | `:30` |
| `400 BAD_PUBKEY` | pubkey no cumple `^[A-Za-z0-9+/]{43}=$` | `:42` |
| `405 POST_ONLY` | no es POST | `:26` |
| `504 ENROLL_TIMEOUT` | el worker root no respondio en ~6 s | `:87` |

**Prueba negativa obligatoria:** si el paso (2) devuelve **200**, la rotacion **no se aplico** — el servidor sigue aceptando el valor filtrado. **VERIFICADO como criterio** (deriva de `:38`).

### 5.2 Que el valor no vuelve a quedar en claro en un APK

**Regla de oro, medida en 36/36 APK: hay que descomprimir entrada por entrada. Escanear el `.apk` como bytes devuelve CERO siempre y produce un falso "limpio".**

Receta (Windows, sin dependencias; el script completo esta en `scratch\apk_secret_scan_20261111\scan_apks.ps1`):

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$needle = '<VALOR A BUSCAR>'          # mejor: leerlo de una fuente, no escribirlo en el historial
$zip = [System.IO.Compression.ZipFile]::OpenRead('<APK>')
$total = 0
foreach ($e in $zip.Entries) {
  if ($e.Length -eq 0) { continue }
  $ms = New-Object System.IO.MemoryStream
  $s = $e.Open(); $s.CopyTo($ms); $s.Close()
  $txt = [System.Text.Encoding]::Latin1.GetString($ms.ToArray())
  $i = 0
  while (($i = $txt.IndexOf($needle, $i, [System.StringComparison]::Ordinal)) -ge 0) {
    "HIT entry=$($e.FullName) offset=$i"; $total++; $i++
  }
  $ms.Dispose()
}
$zip.Dispose()
"TOTAL=$total"    # debe ser 0 en un APK limpio
```

**Criterio de aceptacion de un APK nuevo:**

| Comprobacion | Valor exigido | Como |
|---|---|---|
| Valor **viejo** (el filtrado) | **0 ocurrencias** | receta de arriba con el valor viejo |
| Valor **nuevo** | **0 ocurrencias** si se adopto §4.2 (runtime); **1** si se sigue horneando | idem con el valor nuevo |
| Placeholder `CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS` | **0** si se hornea un valor real; **1** si es un build inerte | idem |
| Contenedor crudo | **siempre 0 — no es prueba de nada** | `Select-String` sobre el `.apk` → ignorar su resultado |

**VERIFICADO:** este criterio y la advertencia del contenedor salen de la medicion sobre los 36 APK (29 con hallazgo descomprimiendo, 0 detectando en crudo).

### 5.3 Que no queda el secreto en el arbol de trabajo

```bash
# tras rotar: el valor VIEJO no debe estar en ningun fichero rastreado ni en local.properties
git grep -lF "<VIEJO>" ; echo "exit=$? (1 = no encontrado, correcto)"
grep -c 'ape.enroll.secret' IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/local.properties
```

`local.properties` esta en `.gitignore` del proyecto APK (`/local.properties`) → **VERIFICADO**; y `scratch/` esta ignorado en `.gitignore:162` → **VERIFICADO**. Pero **ignorado no es borrado**: siguen en disco y contienen el secreto; hay que **destruirlos** (A7).

---

## 6. CHECKLIST DE EJECUCION (para el operador)

- [ ] **A1** Generar valor nuevo (CSPRNG, ≥32 chars) — **NO EJECUTADO**
- [ ] **A2** Registrar sha256+longitud del valor nuevo (nunca el valor) — **NO EJECUTADO**
- [ ] **A3** Fijar `env[APE_ENROLL_SECRET]` en el pool php-fpm (**sustituir**, no duplicar) + `systemctl reload php8.3-fpm` — receta en `prisma-ara-enroll.conf:8`
- [ ] **A4** POST con valor viejo → **401 BAD_SECRET**; POST con nuevo → **200** — **NO COMPUTADO** (requiere VPS)
- [ ] **A5** Reconstruir APK con el valor nuevo — build verificado en `APK_FEASIBILITY_20261111.md` §7
- [ ] **A6** Enrolar un dispositivo de prueba con el APK nuevo — **NO COMPUTADO** (requiere dispositivo)
- [ ] **A7** Destruir los 29 binarios con el valor viejo (prioridad `deliverables/` y `artifacts/`) + `app\build\`, `scratch\`, `_incoming\`
- [ ] **A8** Re-escanear lo que quede con §5.2: **0 ocurrencias** del valor viejo
- [ ] **A9** Decidir sobre §4.2 (quitar el secreto del build) y sobre la clave AES de `EmbeddedKey.kt:21` (fichero rastreado, ver `APK_SECRET_SCAN_20261111.md` §4.1)

---

## 7. LO NO COMPUTADO (sin rellenar el hueco)

| Item | Razon |
|---|---|
| Valor **actual** del secreto en el servidor | Requiere leer `env[APE_ENROLL_SECRET]` en el VPS. Prohibido en esta tarea. Evidencia **documental** (`ara-x\reports\R6_security.md:58`: "longitud 48") coincide con los 48 chars medidos en `local.properties`, pero es un reporte, no una medida en vivo. |
| Si el snippet `prisma-ara-enroll.conf` esta **incluido** en el server-block vivo | No hay acceso al nginx del VPS. **NO_COMPUTADO**. |
| Si el servicio `ape-enroll-worker` esta **activo** | Igual. **NO_COMPUTADO**. |
| Si el pool php-fpm tiene hoy `env[APE_ENROLL_SECRET]` seteado | Igual. **NO_COMPUTADO**. |
| Si existen APK fuera de este workspace con el secreto | Solo se midio este workspace. **El recuento 29 es un minimo.** |
| Si hay secretos **historicos** distintos del actual en APK viejos | No se pueden buscar sin conocer sus valores. **NO_COMPUTADO**; 29 es minimo. |

---

*Procedimiento escrito el 2026-11-11. Ninguna rotacion ejecutada. Ninguna edicion de `local.properties`. Cero contacto con el VPS. Cero push. Ningun valor de secreto aparece en este documento: solo rutas, lineas y huellas.*
