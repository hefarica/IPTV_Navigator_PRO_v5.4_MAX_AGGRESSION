# D-2 — Autenticar `conviva-event.php` (registro vivo sin validacion)

**ESTADO: NO APLICADO. Parche propuesto, verificado y NO desplegado.**
**Decision:** D-2 · **Fecha:** 2026-11-12 · **Autor:** http-prober (equipo canary-jit-20261111, tarea t34)
**Objetivo:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` (9.962 B, sha256 `9ffe5fb1584392542298ee0c85b24789845f8f4e498e4e9a9299020cf69c6349`, 193 lineas, CRLF)

> **El repo real esta intacto.** El parche vive solo en esta carpeta. `git apply --check` pasa (exit 0); nada se ha aplicado, ni en el repo ni en el VPS.

---

## 1. EL DEFECTO (medido, no inferido)

| Hecho | Evidencia |
|---|---|
| El endpoint **no valida credencial alguna** | Barrido de `HTTP_AUTHORIZATION` / `hash_equals` / `Bearer` **excluyendo comentarios** sobre el fichero: **0 validaciones reales** |
| La unica traza de auth es un comentario de futuro | `conviva-event.php:15` → `Authorization: Basic <prisma_conviva:token>  (Phase 2)` |
| La app **si** manda credencial, y el servidor la ignora | `QoEReporter.kt:161-162` → `.url("${cfg.vpsBase}/prisma/api/conviva-event.php")` + `.addHeader("Authorization", "Bearer ${cfg.token}")` |
| Cabecera del propio fichero | `L6` → *"Conviva QoE Event Endpoint v1.0 — Phase 1 Stub"* |

**Impacto:** cualquiera que alcance la ruta puede **crear o sobrescribir la fila de un `device_id`** en `ara_heartbeats` (`device_id` es PK) y falsificar `state / player / ara_version / caps_json / last_seen` — justo el estado que el VPS usa para el **gate por dispositivo**. No es solo telemetria falsa: es estado de decision.

---

## 2. QUE HACE EL PARCHE

`0002-conviva-auth.patch` — **51 lineas insertadas**, 1 solo fichero, **cero lineas borradas o modificadas**. Inserta el guard despues del method guard (`405`) y **antes** de leer el body.

| # | Requisito | Como |
|---|---|---|
| a | Lee el secreto esperado del **entorno del pool** | `$convivaExpected = getenv('CONVIVA_EVENT_TOKEN');` |
| b | Sin secreto o demasiado corto → **503 fail-closed** | `if (!is_string($convivaExpected) \|\| strlen($convivaExpected) < 16) { http_response_code(503); ... 'conviva_auth_disabled' }` |
| c | Extrae la credencial de `Authorization` y si falta o no coincide → **401** | `stripos($convivaAuthz,'Bearer ')` + `if ($convivaGiven === '' \|\| !hash_equals($convivaExpected, $convivaGiven))` → `401 'unauthorized'` |
| d | Deja pasar **solo** si coincide | `hash_equals` (comparacion en **tiempo constante**) |

**Patron copiado de la contraparte que si funciona:** `ara-enroll.php:30` (`503 ENROLL_DISABLED` si falta o es corto) y `:38` (`hash_equals` → `401 BAD_SECRET`). Mismo estilo de error, mismo `hash_equals`.

**El resto del endpoint queda intacto:** correlacion per-canal por IP, tuning AI-PQ, validacion de esquema, sink de `heartbeat`, `dispatch()`, Phase-G y el `try/catch` final — no se toca ni una linea.

**Decision de nombre:** la variable es `CONVIVA_EVENT_TOKEN`, **no** `CONVIVA_AUTH_TOKEN`. Verificado: `CONVIVA_EVENT_TOKEN` **no existe** en el repo (0 ocurrencias). `CONVIVA_AUTH_TOKEN` si aparece, pero en `.agents/artifacts/ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md:193` como token **Basic** del script de push ADB (`-u "${AUTH_USER}:${CONVIVA_AUTH_TOKEN}"`): es **otra credencial** para otro consumidor. No se reutiliza el nombre para no mezclar dos secretos.

---

## 3. LO QUE SE ROMPE — LEER ANTES DE APLICAR

### 3.1 Los APK ya distribuidos DEJAN DE REPORTAR ⚠️

Los clientes instalados hoy mandan `Bearer` con el token **anterior** (o vacio). Tras aplicar el parche recibiran **401** y su fila en `ara_heartbeats` **dejara de refrescarse**.

- Se pierde: **telemetria QoE** y el **heartbeat** que alimenta el gate por dispositivo.
- **La REPRODUCCION NO SE VE AFECTADA.** El video nunca pasa por este endpoint: solo se pierde la telemetria y el latido. Ningun canal deja de verse.
- Se recupera: cuando los dispositivos se actualicen con un APK que lleve el token nuevo.

### 3.2 Riesgo de segundo orden — `last_seen` congelado  *(NO COMPUTADO)*

Si el gate por dispositivo decide en funcion de `last_seen`, un `last_seen` que deja de refrescarse podria marcar dispositivos como obsoletos. **No he analizado el umbral ni la politica del gate** (`ara_heartbeats` → consumidores) en esta tarea: **NO COMPUTADO**, y hay que mirarlo antes de aplicar. Si el gate degrada por antiguedad, este parche puede tener un efecto visible que no es "solo perder telemetria".

### 3.3 y 3.4

- **Sin la variable de entorno, el endpoint se apaga (503).** Es intencionado (fail-closed), pero conviene saberlo: aplicar el parche sin crear `CONVIVA_EVENT_TOKEN` en el pool deja el endpoint muerto.
- **`ops`/SRE no debe confundir 401 masivo con un ataque**: sera el sintoma normal de una flota sin actualizar.

---

## 4. REQUISITO DE DESPLIEGUE **BLOQUEANTE**: falta pasar la cabecera en nginx

`prisma-conviva-event.conf:46-50` incluye `fastcgi.conf` pero **NO** pasa `HTTP_AUTHORIZATION`:

```nginx
include fastcgi.conf;
fastcgi_pass unix:/run/php/php8.3-fpm.sock;
fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/conviva-event.php;
fastcgi_param SCRIPT_NAME     /prisma/api/conviva-event.php;
fastcgi_param PHP_VALUE       "max_execution_time=10";
```

Con el parche aplicado tal cual, `$_SERVER['HTTP_AUTHORIZATION']` llegaria **vacio** y **todo devolveria 401**, incluso con el token correcto. **Hay que anadir una linea** (companero obligatorio del parche, en otro fichero, fuera de esta carpeta):

```nginx
fastcgi_param HTTP_AUTHORIZATION $http_authorization;   # pasar el header Bearer al PHP-FPM
```

**No es una suposicion: es el patron que ya usan tres snippets hermanos del mismo repo** — `prisma-ara-events.conf:39`, `prisma-ape-match-location.conf:18`, `prisma-ape-pull-location.conf:17`. El de conviva es el unico que no lo tiene.

**Orden obligatorio:** (1) variable en el pool → (2) linea en nginx + `nginx -t` + reload → (3) aplicar el parche → (4) verificar. Si se aplica el parche antes del paso 2, todo da 401 y el sintoma se confunde con "token mal".

---

## 5. VERIFICACION EJECUTADA

| Comprobacion | Resultado |
|---|---|
| `git apply --check 0002-conviva-auth.patch` (repo real) | **exit 0** |
| `git apply --stat` | `1 file changed, 51 insertions(+)` |
| sha256 de `conviva-event.php` antes / despues | `9ffe5fb1…6349` / `9ffe5fb1…6349` → **IDENTICO** |
| `git status -- <fichero>` | vacio (sin cambios) |
| Arnés `test_conviva_auth.js` | **25 comprobaciones, 0 fallos**, 1 limite declarado |

Salida del arnes (`node test_conviva_auth.js`, exit 0):

```
PASS  git apply --check exit 0
PASS  el ORIGINAL no valida credencial (sin hash_equals en codigo)
PASS  el PARCHADO usa hash_equals (tiempo constante)
PASS  lee el secreto de una variable de entorno   [CONVIVA_EVENT_TOKEN]
PASS  exige longitud minima   [min=16]
PASS  503 fail-closed cuando falta el secreto
PASS  401 cuando no coincide
PASS  acepta el esquema Bearer
PASS  orden 405 -> auth -> body   [metodo=46 auth=80 body=108]
PASS  sin cabecera Authorization            -> 401
PASS  cabecera con token incorrecto         -> 401
PASS  cabecera con token correcto           -> pasa
PASS  secreto del servidor no configurado   -> 503
PASS  secreto del servidor demasiado corto  -> 503
PASS  esquema Basic en vez de Bearer        -> 401
PASS  Bearer vacio                          -> 401
PASS  GET no llega a la auth (405 primero)  -> 405
```

### 5.1 LIMITE DECLARADO: no hay PHP en este host

`php` no esta en PATH y no hay Docker. **Los cuatro casos de comportamiento NO se ejecutan sobre PHP**: se ejecutan sobre un **port en JS** que replica el guard linea a linea. Para que el port no derive, sus constantes (`CONVIVA_EVENT_TOKEN`, `min=16`) se **extraen del fichero parcheado**, no se escriben a mano. Lo que si es ejecucion real: `git apply --check` (hecho por git), el replay del parche sobre la copia temporal y todas las comprobaciones estaticas.

**Para cerrar el hueco:** con PHP disponible, `php -l` sobre la copia y arrancar el fichero con un `$_SERVER` simulado en el VPS de staging.

### 5.2 Trampa encontrada al verificar (no repetirla)

```
$ git apply --directory=_proof/repo --verbose 0002-conviva-auth.patch
Skipped patch '_proof/repo/IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php'.
$ echo $?
0
```

**`git apply --directory` imprime "Skipped patch" y devuelve exit 0 SIN aplicar nada.** Un `exit 0` que no se comprueba da por aplicado un parche que no se aplico. Por eso el arnes **no** confia en el codigo de salida: verifica el **contenido** resultante (replay determinista + comparacion con las 51 lineas `+`). Es la misma leccion de `docs/policies/SECRETS_IN_BINARIES.md`: un verde que no se prueba a si mismo no es un verde.

---

## 6. COMO APLICAR (cuando se decida)

```bash
# 0) requisitos previos, en el VPS
#    a) crear la variable en el pool (sustituir <token> por un valor aleatorio >=16 chars)
#       echo 'env[CONVIVA_EVENT_TOKEN] = <token>' >> /etc/php/8.3/fpm/pool.d/www.conf
#       systemctl reload php8.3-fpm
#    b) en /etc/nginx/snippets/prisma-conviva-event.conf, dentro del location, anadir:
#       fastcgi_param HTTP_AUTHORIZATION $http_authorization;
#       nginx -t && systemctl reload nginx

# 1) aplicar el parche (desde la raiz del repo)
git apply docs/canary/fixes/02_conviva_auth/0002-conviva-auth.patch
git diff --stat            # debe mostrar 1 file changed, 51 insertions(+)

# 2) desplegar SOLO ese fichero al VPS y verificar
#    sin cabecera                 -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<vps>/prisma/api/conviva-event \
  -H 'Content-Type: application/json' -d '{"event_type":"heartbeat","device_id":"probe"}'
#    con token correcto           -> 200 {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<vps>/prisma/api/conviva-event \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer <token>' \
  -d '{"event_type":"heartbeat","device_id":"probe"}'
#    GET                          -> 405 (method guard sigue primero)
```

**Nunca** pegar el token en el historial del shell (`history -d`, o leerlo de un fichero con permisos 600).

## 7. COMO REVERTIR

| Estado | Reversion |
|---|---|
| Parche aplicado en el repo, **no** desplegado | `git checkout -- IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/conviva-event.php` |
| Parche aplicado y desplegado | `git apply -R docs/canary/fixes/02_conviva_auth/0002-conviva-auth.patch` → redesplegar el fichero |
| Quieres volver al comportamiento sin auth **sin** tocar codigo | **Quitar `env[CONVIVA_EVENT_TOKEN]`** del pool → el guard responde **503** (endpoint apagado). **No** devuelve el endpoint a "abierto": el fail-closed no se puede desactivar por configuracion, y eso es deliberado |
| Reversion de la linea de nginx | eliminar `fastcgi_param HTTP_AUTHORIZATION $http_authorization;` de `prisma-conviva-event.conf` + `nginx -t` + reload |

**No hay "modo permisivo"** en este parche. Si se necesita volver a aceptar trafico sin credencial, hay que revertir el parche.

---

## 8. LIMITES DECLARADOS (sin rellenar huecos)

| Item | Estado |
|---|---|
| Ejecucion real sobre PHP de los 4 casos | **NO EJECUTADO** — no hay PHP ni Docker en este host. Port en JS + estatico |
| `php -l` sobre el fichero parcheado | **NO EJECUTADO** — requiere PHP |
| Efecto del `last_seen` congelado sobre el gate por dispositivo | **NO COMPUTADO** — no analice los consumidores de `ara_heartbeats` |
| Comportamiento real de nginx/php-fpm del VPS | **NO COMPUTADO** — no se toco el VPS |
| `CONVIVA_EVENT_TOKEN` en el pool | **NO CREADA** — es decision del operador |
| Compatibilidad con la flota actual (que token llevan los APK vivos) | **NO COMPUTADO** — depende de que APK este instalado en cada device |

---

## 9. INVENTARIO DE ESTA CARPETA

| Fichero | Que es | sha256 |
|---|---|---|
| `0002-conviva-auth.patch` | el parche (51 lineas, 1 fichero) | `4fc0c1e8895bb1730214af39b395a66f695a5b742c50b7950a8433afd85f7b20` |
| `make_patch.js` | genera el parche leyendo el original (contexto copiado byte a byte, CRLF) | `71e9f65adc1fe4edfa38b897028d0abe5cd081ee965b75f0168d3cccf27c1974` |
| `test_conviva_auth.js` | arnes: `git apply --check`, replay, estatico, port, 4 casos | `786cadb8d2dfc896ea43a6759e18981cdaec66057d8daba044a2a43fbbd7c5b6` |
| `_proof/conviva-event.patched.php` | copia temporal parcheada (evidencia) | `43a61bd72caca950eec50b7b07bb254c5037888bb686c7274792537cfec18fc0` |
| `_proof/repo/.../conviva-event.php` | copia del original usada para la trampa de `--directory` | `9ffe5fb1584392542298ee0c85b24789845f8f4e498e4e9a9299020cf69c6349` |
| `README.md` | este documento | — |

*Ningun valor de secreto aparece en esta carpeta. Los ejemplos usan `<token>` o un valor ficticio.*

---

**RESUMEN PARA EL OPERADOR:** el parche esta listo y verificado, **NO aplicado**. Antes de aplicarlo hacen falta **dos** cosas: crear `CONVIVA_EVENT_TOKEN` en el pool y **anadir el `fastcgi_param HTTP_AUTHORIZATION` en `prisma-conviva-event.conf`** (sin eso, todo da 401). Y hay que aceptar el coste: **la flota actual deja de reportar QoE hasta actualizarse; la reproduccion no se ve afectada.** Queda por decidir el riesgo del `last_seen` congelado en el gate.
