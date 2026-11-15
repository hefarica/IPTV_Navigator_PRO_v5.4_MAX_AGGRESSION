# Prueba del slot único: matriz de propietarios y huecos reales — 2026-11-14

**Autor:** provider-arbiter (t54, attempt 2)
**Alcance:** sólo lectura en el VPS y simulación. **Cero escrituras.** No se reprodujo ningún canal real (consumiría el slot).
**Entregable único:** este documento.

---

## 0. Lo primero: qué hay ahora en el VPS (paso 1 del encargo)

| artefacto | desplegado | commiteado | |
|---|---|---|---|
| `/opt/ape-pulse/lib/provider-gate.sh` | `81360dcd9100c94b2db87d9866668c42bef5b5e59cd81ddbbaae9d233d472819` | `81360dcd…` | **COINCIDE** (458 L) |
| `/opt/ape-pulse/ape-pulse-canary-worker.sh` | `a13dd676b028a7b28c5e7b8c25f154bf9c74ed9a534122b199c6df6ebe70ecde` | `0dd13279…` | **NO COINCIDE** |

El worker en producción sigue con **`exec 9>"$LOCK"`** (línea 73), es decir **lock sobre un FICHERO**. El fix sobre el inodo de `/run` está commiteado (`cd5eddd0`) y **no se ha desplegado**.

Consecuencia directa, y es la primera de este informe: **la única exclusión que hoy se aplica de verdad en producción descansa sobre un fichero desligable.** Referencia medida:

```
/run/ape-canary.lock   inode=20859581  size=0  mtime=2026-11-14 03:21:54Z
```

Guardo ese inodo como línea base: si algún día cambia, alguien recreó el fichero y durante ese hueco dos workers pudieron bloquear inodos distintos. Ese es el fallo que el fix commiteado cierra.

---

## 1. El hallazgo que cambia el marco: **el gate es un oráculo, no un mutex**

El encargo asume que el gate excluye. **No lo hace.** Medido: 8 procesos concurrentes llamando a `provider_gate_decide canary` con la entrada en reposo (player idle simulado, sistema real) dan **8 ALLOW y 0 DENY**.

No es un bug sobrevenido: es lo que quedó tras t45. Allí descubrí que el worker llama `DECISION="$(provider_gate_decide canary)"`, la *command substitution* crea un subshell, y el `flock` tomado dentro se liberaba al instante. Quitar un mutex inútil era lo correcto, pero deja esto: **en la librería desplegada `pg_mutex_acquire` sólo aparece en un comentario (L110) y en su propia definición (L118). Nadie la llama.**

```
$ grep -n "pg_mutex_acquire\|mutex_held" /opt/ape-pulse/lib/provider-gate.sh
110:#     pg_mutex_acquire   # 0 = tomado por mi
118:pg_mutex_acquire() {
```

Así que la propiedad de "un solo propietario" **no la impone el gate: la impone el que llama, si quiere.** Y de los cinco propietarios posibles, sólo uno llama. Los demás ni preguntan.

---

## 2. Matriz de propietarios del slot

Quién puede tener la conexión al proveedor, y por dónde.

| # | propietario | cómo llega al proveedor | ¿pasa por el gate? | evidencia |
|---|---|---|---|---|
| P1 | **player directo** (redirect / cartridge / provider-direct) | el DEVICE abre la conexión al proveedor | **NO** — el gate sólo lo *observa* (zap `z=1` + latido `conviva-event.php` cada ~30,5 s) | §11 de `PROVIDER_MUTEX_GATE_20261114.md`; §3.1 |
| P2 | **`pulse.php` en modo proxy** | el VPS hace `curl` al upstream: `ape_pulse_fetch()` | **NO** — no consulta el gate en ninguna línea | `pulse.php` L400-420 |
| P3 | **canary** (worker) | `ffmpeg` en el VPS | **SÍ** — decide + `flock` | gate L190; worker L73 |
| P4 | **JIT** (`/jit/go`, `/jit/live`) | `ffmpeg` en el VPS con `cwd=/dev/shm/ape-jit/<id>` | **NO** — el gate lo *ve* después (`pg_jit_pids`), pero el JIT nunca pregunta | `server.js` L18, L4823, L4874 |
| P5 | **shim** (`ProxyService` en el device) | conexión del propio proxy en el device | **NO** — fuera del VPS | t47: medido **muerto** (0 bytes) |
| P6 | **`curl` manual de cualquiera** | directo | **NO** — invisible al gate | por definición |

Dos propietarios merecen nombre propio porque son los que nadie vigila:

- **P2 no es teórico.** `pulse.php` L400-420 define `ape_pulse_fetch()`: `curl_init($u)` con `CURLOPT_FOLLOWLOCATION`, UA del player y **`CURLOPT_SSL_VERIFYPEER => false`**. En modo proxy, la conexión al proveedor la abre **el VPS**, y el gate no se entera. Es un dueño server-side que nunca pregunta.
- **P4 tampoco.** El JIT no alcanza el proveedor con `fetch()`: los tres `fetch(endpoint,…)` de `server.js` van **al LLM** (`api.deepseek.com`, L1098/L2957/L8275). Al proveedor llega por **`ffmpeg`** (`execFileSync`, `cwd: dir`, L4874) con `dir = path.join(OUT_ROOT, id, …)` y `OUT_ROOT=/dev/shm/ape-jit` (L18, L4823). Mientras eso corre, **el dueño del slot es el JIT**, y `/jit/live/...` sirve después **desde disco local** (`path.join(dir,'media_0.m3u8')`), así que el player ya no toca al proveedor.

---

## 3. Tabla de exclusiones, par a par

Leyenda: **gate** = `provider_gate_decide` decide; **flock** = mutex del worker; **ninguna** = no existe; **accidental** = se evita por horario/casualidad, no por diseño.

| par | ¿exclusión? | mecanismo real | por qué |
|---|---|---|---|
| P3 canary ↔ P3 canary | **SÍ** | **flock** (fichero hoy, inodo tras el deploy) + gate `canary_already_live` | único par con exclusión real y probada |
| P3 canary ↔ P1/P2 player | **SÍ, asimétrica** | **gate** (nivel 0 manda) — pero sólo si el canary es quien llama | el player no pregunta nunca; el canary cede siempre |
| P3 canary ↔ P4 JIT | **SÍ, unidireccional** | **gate** `jit_serving_player_path` | el canary se aparta si ve `ffmpeg` con cwd del JIT; el JIT **no** se aparta si hay canary |
| P4 JIT ↔ P3 canary | **NO** | — | el JIT no consulta el gate: puede arrancar con un canary dentro (el gate sólo lo habría impedido si el JIT preguntara) |
| P4 JIT ↔ P1/P2 player | **NO** | — | nada impide un transcode del JIT mientras el operador ve |
| P2 `pulse.php` ↔ P3 canary | **NO** | — | `pulse.php` no consulta el gate; el canary sí lo vería por el latido, con ~30 s de granularidad |
| P2 `pulse.php` ↔ P4 JIT | **NO** | — | dos fetches server-side al proveedor, sin árbitro |
| P1 player ↔ P1 player | **NO, y está medido** | — | el propio player abre **2 peticiones simultáneas del mismo manifest por recarga** → 509 (documentado en `pulse.php` L422-425) |
| P1/P2 ↔ P6 curl manual | **NO** | — | invisible |
| P5 shim ↔ cualquiera | **irrelevante hoy** | — | t47: `/source.m3u8` devuelve 0 bytes |

**Resumen brutal: de los 10 pares con sentido, sólo 3 tienen exclusión, y 2 de esos 3 son asimétricos** (uno cede y el otro ni pregunta). El resto no existe.

---

## 4. Simulación de las decisiones (paso 3), salida literal

Entrada simulada donde se indica; **código de la escalera y `flock` reales**. Sin escribir nada: `PG_LOG=/dev/null`, `pg_reset_failed` neutralizado, locks sobre inodos ya existentes.

### 4.1 Estado real del gate, sin simular

```
player_last_seen : 1794662284:zap
canary_live      : []
jit_pids         : []
selftest         : ok
decision canary  : exit=1
  PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=7 player_signal=zap … selftest=ok
decision jit     : exit=1
  PROVIDER_GATE decision=DENY claimant=jit level=2 reason=player_active player_age_s=8 player_signal=zap … selftest=ok
```

### 4.2 Concurrencia

```
########## 1. 8 DECISIONES CONCURRENTES, LOCK COMPARTIDO (un solo inodo) ##########
  L1 8 procesos / 1 inodo (/tmp)                 ALLOW=8  DENY=0  -> propietarios=8

########## 2. LOCK DESLIGADO: 2 inodos distintos ##########
  L2 8 procesos / 2 inodos (/tmp + /var/tmp)     ALLOW=8  DENY=0  -> propietarios=8

########## 3. SYSTEMCTL ROTO ##########
  L3 systemctl roto                              exit=1
     PROVIDER_GATE decision=DENY … reason=canary_state_unknown_failclosed … canary_live="ERR" …

########## 4. CANARY YA VIVO ##########
  L4 segundo canary con uno vivo                 exit=1
     PROVIDER_GATE decision=DENY … reason=canary_already_live … canary_live="ape-canary@otro.service " …

########## 5. PLAYER ACTIVO (log REAL, entrada NO simulada) ##########
  L5 player activo segun el log real             exit=1
     PROVIDER_GATE decision=DENY … reason=player_active player_age_s=2 player_signal=zap …

########## 6. LA ESCALERA, par a par ##########
  jit con canary vivo      -> DENY
  player (nivel 0)         -> ALLOW
  canary con todo idle     -> ALLOW
  jit con canary idle      -> ALLOW
```

**L1 y L2 dan 8 propietarios** porque `decide` no bloquea (§1). No es un fallo de la simulación: es la propiedad real del gate. El fail-closed sí funciona en todo lo demás: systemctl roto, canary vivo y player activo **deniegan** correctamente.

### 4.3 El primitivo de exclusión, aislado (esto sí serializa)

```
=== primitivo flock aislado: 8 procesos, 1 inodo ===
  1 inodo  -> ganadores=1
=== 4 en /tmp + 4 en /var/tmp (2 inodos = fichero recreado) ===
  2 inodos -> ganadores=2
```

**Un inodo serializa; dos inodos no.** Ese es exactamente el fallo del lock desplegado: mientras `/run/ape-canary.lock` conserve el inodo, un propietario; si alguien lo borra o lo recrea, dos. El fix commiteado (`exec 9<"${APE_CANARY_LOCK_TARGET:-/run}"`) lo cierra porque el inodo de `/run` no se puede recrear.

---

## 5. Paso 4: ¿el JIT pide al proveedor? ¿quién sigue el 302?

**El 302 lo sigue el PLAYER, no el JIT.** Medido en `server.js`:

```js
// L6370-6377
const uaGo = String(req.headers['user-agent'] || '');
const goMaster = /(^|\s|\/)(VLC|LibVLC|Kodi|LibreELEC)(\s|\/|$)/i.test(uaGo);
const goPlaylist = goMaster ? '/master.m3u8' : '/media_0.m3u8';
res.writeHead(302, { 'Location': publicBase(req) + '/live/' + id + goPlaylist + qs, … });
return res.end();
```

Redirige al cliente a otro endpoint **del propio JIT**. En ese salto el JIT no toca al proveedor.

**Pero el JIT sí pide al proveedor, y por otro camino.** Cuando sirve `/jit/live/<id>/…` lo hace **desde disco local** (`path.join(dir,'media_0.m3u8')`), y quien llenó ese directorio fue **su `ffmpeg`**, lanzado con `cwd: dir` donde `dir = /dev/shm/ape-jit/<id>[/sdr|/sdr720]`. Ese `ffmpeg` **es la conexión al proveedor**.

Conclusión del paso 4:

- ¿El JIT pide al proveedor? **Sí, vía `ffmpeg`, no vía el 302.**
- ¿Pasa por el gate? **No.** El gate lo detecta *después* (`pg_jit_pids` mira `cwd` bajo `/dev/shm/ape-jit`), lo cual es **observación, no permiso**.
- ¿Es un segundo propietario estructural? **Sí.** Y el riesgo no es que el gate lo ignore: es que el gate **sólo puede reaccionar**, nunca impedir. La ventana entre `ffmpeg` arrancando y el gate viéndolo es la misma clase de TOCTOU que ya documentó t44.
- Buena noticia medida: `pg_jit_pids` **no está ciego** — el `cwd` real del `ffmpeg` cae dentro del patrón que vigila. El sensado funciona; lo que falta es la puerta de entrada.

---

## 6. El hueco exacto que queda

Por orden de gravedad, y sin adornos:

1. **No hay punto de enforcement único.** El gate decide; sólo el worker obedece. P1, P2, P4 y P6 pueden tomar el slot sin consultar a nadie. Mientras eso siga así, "un solo propietario" es una convención del canary, no una ley del sistema.
2. **`pulse.php` en modo proxy es un dueño server-side sin árbitro** (`ape_pulse_fetch`, `SSL_VERIFYPEER=false`). Es el mismo fichero que ya rompió producción una vez; no lo toco, lo señalo.
3. **El JIT es un dueño server-side sin árbitro.** `ffmpeg` con `cwd` bajo `/dev/shm/ape-jit` es exactamente lo que el gate usa como "player activo" — o sea que el gate trata al JIT como si fuera el operador, lo cual es conservador y correcto para el canary, pero no impide que el JIT arranque encima de todo lo demás.
4. **El lock desplegado es desligable.** Medido: un inodo = 1 propietario, dos inodos = 2. El fix está commiteado y sin desplegar.
5. **El player abre dos conexiones simultáneas por recarga** (medido 2026-11-05, documentado en `pulse.php` L422-425). Es un segundo propietario *dentro del propio player*: ningún gate del VPS puede impedirlo.
6. **La ventana TOCTOU de 558-632 ms** (t44) sigue abierta para cualquier caller que no tome el flock: entre "arranco" y "soy visible" el gate ve el slot libre.

---

## 7. Qué falta para que la exclusión sea DEMOSTRABLE y no razonada

1. **Un solo punto de entrada, con estado, no una función pura.** Hoy `provider_gate_decide` informa; hace falta que **admita**: que entregue un *lease* con dueño y caducidad, y que quien no lo tenga no pueda hablar con el proveedor. Mientras el "estado" sea un log de nginx y `/proc`, se está mirando el retrovisor.
2. **Que P2 y P4 llamen antes de conectar.** `pulse.php` antes de `ape_pulse_fetch`; el JIT antes de lanzar `ffmpeg`. Son dos líneas cada uno, pero son los dos que hoy pueden duplicar el slot a espaldas del gate.
3. **El worker desplegado con el lock sobre `/run`** (`0dd13279…`), para que el inodo no se pueda recrear.
4. **Decidir la doctrina de transporte.** `transports: ['vps-list','provider-direct']` (L6144) son dos arquitecturas con **dueños distintos**: en `provider-direct` el slot lo tiene el device; en `vps-list` lo tiene el VPS. Mezclarlas en la misma lista es cómo aparecen dos propietarios sin que nadie haga nada malo.
5. **Un test que falle cuando aparece un segundo propietario** — y hoy sólo existe para el camino del canary. Hace falta el equivalente para `pulse.php` proxy y para el arranque del JIT.
6. **Un contador del proveedor como juez final.** Todo esto son inferencias desde dentro; la única prueba de que hay un dueño es que el proveedor no devuelva 509/461. Eso exige medir 509 contra el número de propietarios declarados, y hoy ese dato no está medido.

---

## 8. Lo que este documento NO afirma

- **NO_COMPUTADO:** no se ha medido cuántas conexiones abre `pulse.php` por petición en modo proxy, ni cuántas abre el JIT por sesión. Se ha leído el código; no se ha contado el cable.
- **NO_COMPUTADO:** no se ha medido el TOCTOU actual (558-632 ms es de t44, no re-medido aquí, y re-medirlo exige arrancar un canary real = consumir el slot).
- **NO_COMPUTADO:** el inodo del lock es una foto de ahora (`20859581`); no hay histórico, así que **no se puede afirmar que se haya recreado alguna vez**. Se guarda como línea base.
- El estado del VPS se ha leído, nunca escrito. Las simulaciones usan `PG_LOG=/dev/null`, `pg_reset_failed` neutralizado y locks sobre inodos preexistentes (`/tmp`, `/var/tmp`): no se ha creado ni modificado ningún fichero.
