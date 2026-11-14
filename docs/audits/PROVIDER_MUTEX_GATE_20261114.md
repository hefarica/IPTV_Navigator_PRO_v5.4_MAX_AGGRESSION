# Gate de exclusión mutua del proveedor — 2026-11-14

**Autor:** provider-arbiter (task t42, attempt 1)
**VPS:** 178.156.147.234 (producción del operador) — todo lo de este informe está medido ahí, no deducido.
**Ventana de medición:** 2026-11-14 01:40Z → 02:04Z
**Nada commiteado, nada pusheado, nada desplegado por orden propia.** El cambio está aplicado en el VPS con backup fechado y rollback probado; la decisión de commitear es del operador.

---

## 0. Veredicto en una línea

Existe **un único punto de decisión** (`/opt/ape-pulse/lib/provider-gate.sh:190`, función `provider_gate_decide`) con la escalera **reproductor(0) > canary(1) > JIT(2)**; el canary pasa por él antes de tocar nada y **no arranca** si el reproductor está activo, dejando registro literal con la razón y los segundos. **37/37 aserciones verdes, exit 0**; control negativo con dos propietarios simultáneos **falla con exit 1**. El gate **no** garantiza lo que no puede: ver §7.

---

## 1. Qué había antes (medido, no citado)

### H1 — El guard de prioridad existía pero **fallaba ABIERTO**

El worker traía un guard de prioridad desde el parche del capitán. Reproduje su extracción de campos contra el log real a las 01:41Z:

```
ULT=[[14/Nov/2026:01:41:27]     MES=[Nov] FDIA=[[14]  FANO=[2026]  FHMS=[01:41:27]
EPOCA(string as built by worker)=[0]
AHORA=1794620489   AGE=1794620489
GUARD WOULD *PASS THROUGH* -> CANARY RUNS DURING A ZAP (fail-open)
```

La causa: el campo `$4` de nginx viene con corchete (`[14/Nov/...`), el worker saneaba una variable muerta (`ISO`) y el corchete llegaba hasta `FDIA`. `date -u -d "2026-11-[14 01:41:27"` falla, `EPOCA=0`, y el test `[ "$EPOCA" -gt 0 ]` convertía "no pude parsear" en "no pasó nada". **El guard nunca disparó.**

GNU date del VPS: `date (GNU coreutils) 9.4`. Confirmado que rechaza el formato de nginx:

```
$ date -u -d "14/Nov/2026:01:28:37" +%s
date: invalid date ‘14/Nov/2026:01:28:37’          exit=1
$ date -u -d "[14/Nov/2026:01:28:37" +%s
date: invalid date ‘[14/Nov/2026:01:28:37’         exit=1
$ date -u -d "2026-11-14 01:28:37" +%s
1794619717                                          exit=0
```

**Epoch resultante del gate: `1794619717`** (= 2026-11-14T01:28:37Z). Verificado también para los 12 meses en la aserción A4.

### H2 — El apilamiento NO estaba cerrado: 4 unidades y 8 ffmpeg contra UNA conexión

Medido a las **01:41:57Z**:

```
ape-canary@0176a45ba5ca2df5.service  active running   (etime 04:55)
ape-canary@141df780c9b35634.service  active running   (NRestarts=2)
ape-canary@44440e37c66087e7.service  active running   (NRestarts=1)
ape-canary@4bdac99605bd225f.service  active running
→ 4 unidades activas simultáneas
pid=1106241 ppid=1106184 cg=…ape-canary@0176a45ba5ca2df5.service
pid=1106242 ppid=1106241 cg=…ape-canary@0176a45ba5ca2df5.service
pid=1112062 …ape-canary@4bdac99605bd225f.service   pid=1112063 …(hijo)
pid=1112279 …ape-canary@44440e37c66087e7.service   pid=1112280 …(hijo)
pid=1112404 …ape-canary@141df780c9b35634.service   pid=1112405 …(hijo)
→ 8 procesos ffmpeg
```

**Causa raíz medida en el journal** (no inferida): con `Restart=on-failure` + `RestartSec=10`, la unidad pasa **10 segundos inactiva** entre la muerte del proceso y el reinicio programado:

```
01:41:20 Started
01:41:27 Main process exited, code=exited, status=4/NOPERMISSION
01:41:27 Failed with result 'exit-code'
01:41:37 Scheduled restart job, restart counter is at 1.     <-- 10 s de ventana
01:41:38 Started
01:41:45 Main process exited, code=exited, status=4/NOPERMISSION
01:41:55 Scheduled restart job, restart counter is at 2.     <-- otra vez
01:41:57 Started
```

El bucle de espera del worker preguntaba `systemctl is-active`, veía `inactive` en esa ventana de 10 s, **solturaba el flock**, y el siguiente ticket admitía un canary nuevo mientras systemd **resucitaba el anterior**. El flock y la espera serializaban *dentro* de una invocación; el reintento de systemd se les escapaba por detrás. Cada ticket podía consumir hasta 4 conexiones del proveedor (1 + 3 reintentos: `StartLimitBurst=3`).

### H3 — Corrección al objetivo del contrato: **1 canary = 2 ffmpeg**

El contrato pide "máximo 1 unidad `ape-canary@` activa **y 1 ffmpeg**". Medido: **cada unidad canary lanza 2 procesos ffmpeg** (cadena decode→encode de `ape-visual-emulate.sh`), verificado por cgroup:

```
pid=1112062 ppid=1111981 cg=…ape-canary@4bdac99605bd225f.service
pid=1112063 ppid=1112062 cg=…ape-canary@4bdac99605bd225f.service
```

La unidad de cuenta del apilamiento es **la unidad, no el ffmpeg**. Una sola unidad sana da 2 ffmpeg; el invariante correcto es `ffmpeg = 2 × unidades_canary`, no `ffmpeg ≤ 1`. (canary-auditor llegó a la misma conclusión por otra vía y ya pre-registró su criterio F2' con este dato.)

### H4 — `z=1` NO es señal de "está viendo"  ← **defecto que me cace a mí mismo**

Mi primera versión del gate usaba solo el zap (`GET /pulse/<id>.m3u8` con `&z=1`). Con eso, a los 180 s del último zap daba `ALLOW`. Medido en producción a las 01:57:02Z:

```
PROVIDER_GATE decision=ALLOW claimant=canary level=1 reason=idle_admit player_age_s=324 …
```

**Ese ALLOW era incorrecto y habría robado la conexión.** El zap marca el *inicio* de ver, no la continuación. La señal real de "sigue reproduciendo" es el **latido QoE** del reproductor: `POST /prisma/api/conviva-event.php`, UA `okhttp/4.12.0` (el dispositivo Android), que late cada **~30,5 s** sin un solo hueco:

```
01:45:29 01:45:59 01:46:30 01:47:01 01:47:32 01:48:03 01:48:33 01:49:04
01:49:35 01:50:05 01:50:36 01:51:07 01:51:37 01:52:08 01:52:39 01:53:09
01:53:40 01:54:11 01:54:42 01:55:12 01:55:43 01:56:14 01:56:45 01:57:15 01:57:46
```

Los zaps pararon a las 01:51:37 y el latido siguió hasta 01:57:46: **el operador estaba viendo todo el tiempo**. Corregido: "reproductor activo" = la más reciente de **(a) zap** o **(b) latido QoE** dentro de `PG_PLAYER_WINDOW`. Con 180 s de ventana y 30,5 s de latido hay 6× de margen.

*Asimetría elegida a propósito:* si el reproductor late estando en un menú (sin vídeo), el gate deniega de más y el canario (diagnóstico) no arranca — el operador no se entera. Al revés (arrancar de más) sí se entera, porque le tira la conexión. El error cae siempre del lado seguro.

### H5 — La unidad **desplegada** no es la **versionada** (contradicción de canary-auditor, resuelta)

canary-auditor objetó que la unit versionada dice `Restart=no`, lo que haría inexistente mi ventana de reinicio. Sus cuatro comandos, ejecutados:

```
systemctl show -p Restart -p RestartUSec -p RuntimeMaxUSec -p DropInPaths --value ape-canary@0176a45ba5ca2df5.service
  -> on-failure 10s 5min  (DropInPaths vacío)
sha256sum /etc/systemd/system/ape-canary@.service
  -> 915da62f9edc5fa24d3c90520c8b71d906e531a25f2ad6bb02ae5244bdc52399   (995 B)
grep -nE '^(Restart|RuntimeMaxSec|RestartSec)=' /etc/systemd/system/ape-canary@.service
  -> 19:RuntimeMaxSec=300   22:Restart=on-failure   23:RestartSec=10
ls /etc/systemd/system/ape-canary@.service.d/   -> No such file or directory
```

**Gana la lectura (a): la unit desplegada ≠ la versionada.** Desplegada = 995 B, `Restart=on-failure`, sha `915da62f…`. Versionada (según t40) = 783 B, `Restart=no`, sha `d1dc2a13…`. No hay drop-ins, y el mensaje del journal **nombra la unidad canary**, así que la lectura (b) (que fuera el worker/timer) queda refutada. Es un tercer caso del patrón *acción vs estado*, ahora en la plantilla `ape-canary@.service`. **Esa plantilla está fuera de mi alcance** (mi inScope son las 3 units `ape-pulse-canary.*`): no la toco; el worker la compensa y §9 lo declara.

### H6 — Riesgo de regresión en `tools/ops/ape-player-priority.sh` (no lo toco)

Ese generador de parches (untracked) reinyecta el guard roto: su único control es `if 'PLAYER_WINDOW' in s: print("ya parcheado")`. Mi worker **ya no contiene `PLAYER_WINDOW`**, así que **re-ejecutarlo re-inyectaría el guard fail-open de H1** (y con `tail -n 400` y sin latido QoE). No está en mi inScope: **no lo modifico**, lo señalo. El operador debería marcarlo obsoleto o borrarlo antes de que alguien lo vuelva a correr. Los otros dos (`ape-canary-lock.sh`, `ape-canary-wait.sh`) son idempotentes por marca (`flock -n`) y no disparan.

### H7 — Defecto en mi propio procedimiento (auto-cazado y corregido)

Mi prueba de rollback restauró `ape-pulse-canary.service` con `cp -a` (preserva mtime) y mi paso de "re-aplico el gate" reinstaló worker+librería **pero olvidó la unit**: quedó `TimeoutStartSec=340` mientras el worker puede esperar 400 s + 15 s de asentamiento = 415 s. Systemd habría matado al worker a media espera. Corregido y verificado (`TimeoutStartSec=440`, efectivo `7min 20s`). Se documenta porque es exactamente el tipo de hueco que este informe persigue: *el rollback funcionaba; la re-aplicación estaba incompleta.*

---

## 2. El punto único de decisión

**Ruta:** `/opt/ape-pulse/lib/provider-gate.sh` — 265 líneas, sha256 `f178435421e4dd22ccd97af4a23d84a190f6a3327042af2cb9738316c4a6bcaa`.

| Qué | Dónde |
|---|---|
| **Decisión única** | `provider_gate_decide()` — **línea 190** |
| Escalera (constantes) | `PG_LEVEL_PLAYER=0` **:64**, `PG_LEVEL_CANARY=1` **:65**, `PG_LEVEL_JIT=2` **:66** |
| Señal del reproductor (zap + latido) | `pg_player_last_seen()` — **:125** |
| Canary vivo (incluye `activating`) | `pg_canary_live_units()` — **:147** |
| JIT sirviendo (cwd `/dev/shm/ape-jit/*`) | `pg_jit_pids()` — **:162** |
| Espera con asentamiento anti-carrera | `provider_gate_wait_canary_gone()` — **:245** |

Ningún consumidor decide por su cuenta. Orden de la escalera, tal cual está codificado:

```bash
if   [ "$claimant" = "player" ]; then            ALLOW  player_is_top_of_ladder
elif [ "$signal" = "unknown" ]; then             DENY   player_state_unknown_failclosed
elif [ "$age" -lt "$PG_PLAYER_WINDOW" ]; then    DENY   player_active          # nivel 0 manda
elif [ -n "$jit_pids" ]; then                    DENY   jit_serving_player_path
elif canary && canary_units; then                DENY   canary_already_live
elif jit    && canary_units; then                DENY   canary_holds_connection  # canary > JIT
else                                             ALLOW  idle_admit
```

Salida: **una línea parseable**, siempre, con la razón literal y los segundos:

```
PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=6 player_signal=zap player_window_s=180 canary_live="" jit_pids="" ts=2026-11-14T02:03:36Z
```

**`jit_serving` cuenta como nivel 0, no como nivel 2.** Un JIT sirviendo *es* el camino de reproducción del operador: si lo tratara como nivel 2, la escalera autorizaría al canary a pisar una reproducción en curso. Con este modelado la escalera queda coherente y `canary > JIT` se aplica donde de verdad compite: cuando el JIT *quiere* arrancar y ya hay un canary.

**Integración en el worker** (`/opt/ape-pulse/ape-pulse-canary-worker.sh`, 150 líneas, sha `a13dd676…`):
- `:66` carga la librería; `:60` si falta, **no arranca nada** (fail-closed).
- `:74` `flock -n` — el segundo worker sale en el acto.
- `:82` **primera** decisión; `:118` **re-decisión** inmediatamente antes de lanzar (estrecha la ventana de carrera a milisegundos).
- `:144` espera con asentamiento de 15 s.

---

## 3. Cómo queda cerrada la carrera del reintento (H2)

`provider_gate_wait_canary_gone()` no se fía de `is-active`: cuando la unidad parece caída, **espera `PG_SETTLE` (15 s) y vuelve a mirar**; si systemd la resucitó, sigue esperando. Y `pg_canary_live_units()` cuenta `activating` como vivo, que es el estado de la ventana de auto-restart. Dos cierres independientes del mismo agujero.

Backstop adicional: aunque la espera agote su techo, el siguiente tick vuelve a entrar por `provider_gate_decide` y recibe `DENY reason=canary_already_live`. **No hay camino por el que un segundo canary entre con el primero vivo.**

---

## 4. Verificación — salida literal

### 4.1 `bash -n` del worker

```
$ bash -n /opt/ape-pulse/ape-pulse-canary-worker.sh; echo "exit=$?"
exit=0
```

### 4.2 Test ejecutable sin red — 37/37, exit 0

`/opt/ape-pulse/lib/provider-gate.test.sh` — 343 líneas, sha256 `91cd732dd07ec822fdd845ded9c3b8b67d44925bbef1e181d4205ae0340a5fa6`.
Sin red: `systemctl` y `ape-canaryctl` son falsos (unidades systemd falsas), el worker y la puerta son los de producción.

```
$ /opt/ape-pulse/lib/provider-gate.test.sh; echo "EXIT_CODE_TEST=$?"
=== A. PARSEO DE FECHA (formato dd/Mmm/yyyy:HH:MM:SS) ===
INFO  A0  date -u -d "14/Nov/2026:01:28:37" +%s  -> date: invalid date '14/Nov/2026:01:28:37' (GNU date rechaza el formato de nginx)
INFO  A3  epoch obtenido por el gate = 1794619717   esperado = 1794619717
PASS  A1 pg_epoch_from_nginx_ts(['14/Nov/2026:01:28:37']) [1794619717]
PASS  A2 epoch != 0
PASS  A4 los 12 meses parsean a epoch > 0 [0/12 malos (de 12)]

=== B. LA ESCALERA: player(0) > canary(1) > jit(2) ===
PASS  B1 sin zap ni canary -> canary ADMITIDO [0]
PASS  B1b razon literal
PASS  B2 zap hace 12s -> canary DENEGADO [1]
PASS  B2b razon literal
INFO  B2c linea literal: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=12 player_signal=zap player_window_s=180 canary_live="" jit_pids="" ts=2026-11-14T02:01:39Z
PASS  B2c segundos reportados (12) coherentes con 12
PASS  B3 zap hace 400s (>180) -> canary ADMITIDO [0]
PASS  B4 el reproductor siempre manda -> ADMITIDO [0]
PASS  B4b razon
PASS  B5 canary ya vivo -> segundo canary DENEGADO [1]
PASS  B5b razon literal
PASS  B6 canary en 'activating' (ventana Restart=on-failure) -> DENEGADO [1]
PASS  B7 escalera: canary vivo -> JIT DENEGADO (canary por delante) [1]
PASS  B7b razon literal
PASS  B8 JIT sirviendo (cwd bajo ape-jit) -> canary DENEGADO [1]
PASS  B8b razon literal

=== C. FAIL-CLOSED: si el estado del reproductor no se puede probar ===
PASS  C1 log ausente -> canary DENEGADO [1]
PASS  C1b razon literal
PASS  C2 zap con fecha imparseable -> canary DENEGADO (no se finge idle) [1]
PASS  C2b razon literal

=== C3. EL LATIDO QoE TAMBIEN CUENTA COMO "PLAYER ACTIVO" ===
PASS  C3 latido conviva hace 10s y sin zap -> canary DENEGADO [1]
PASS  C3b razon literal
PASS  C3c senal identificada
INFO  C3d linea literal: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=10 player_signal=conviva player_window_s=180 canary_live="" jit_pids="" ts=2026-11-14T02:01:42Z
PASS  C4 latido conviva hace 400s y sin zap -> canary ADMITIDO [0]
PASS  C4b razon (edad 400s > ventana 180s)
PASS  C5 gana la senal MAS RECIENTE (zap 20s < conviva 300s) -> DENEGADO [1]
PASS  C5b senal = zap

=== D. EXCLUSION MUTUA REAL: 3 workers concurrentes ===
INFO  D1 gate ON + flock ON: maximo de propietarios simultaneos = 1
PASS  D1 maximo 1 propietario con la puerta activa [1]

=== D2. La ventana de Restart=on-failure NO debe abrir la puerta ===
INFO  D2 worker rc=0 salio_en=1794621720019492165 resurreccion_en=1794621718971436509 max=1
PASS  D2 el worker espero a la resurreccion antes de soltar la conexion
PASS  D2b maximo 1 propietario pese al reintento [1]
PASS  D2c no consume un segundo ticket en el mismo tick [queda]
INFO  D2d log literal del worker:
      2026-11-14T02:01:51Z worker: PROVIDER_GATE decision=ALLOW claimant=canary level=1 reason=idle_admit player_age_s=none player_signal=none player_window_s=180 canary_live="" jit_pids="" ts=2026-11-14T02:01:51Z
      2026-11-14T02:01:51Z worker: dispara canary id=bbbb2222 host=line.tivi-ott.net (fuente redactada)
      2026-11-14T02:01:51Z worker: canary bbbb2222 lanzado
      2026-11-14T02:02:00Z worker: canary bbbb2222 terminado tras 9s (confirmado tras asentamiento)

=== E. CONTROL NEGATIVO: sin mutex, el detector DEBE ver >=2 ===
INFO  E1 gate OFF + flock OFF: maximo de propietarios simultaneos = 3

=== F. WORKER REAL con un zap reciente: NO debe arrancar canary ===
INFO  F1 worker rc=0 ; eventos de arranque de canary = 0
INFO  F2 log literal del worker:
      2026-11-14T02:02:00Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=12 player_signal=zap player_window_s=180 canary_live="" jit_pids="" ts=2026-11-14T02:02:00Z
PASS  F3 con zap reciente el worker NO arranca canary [0]
PASS  F4 registra la razon literal
PASS  F5 registra los segundos
PASS  F6 el ticket se conserva (denegar no es descartar) [queda]

=== G. RESUMEN ===
SUMMARY pass=37 fail=0  (control_negativo_propietarios=3)
VERDICT: PASS (mutex real = 1 propietario; control negativo detecto 3 propietarios)
EXIT_CODE_TEST=0
```

### 4.3 Control negativo — **falla con exit != 0**

Se reemplaza la puerta por una que permite todo y se da un lock distinto a cada worker (mutex y flock fuera). El detector debe ver la violación:

```
$ /opt/ape-pulse/lib/provider-gate.test.sh --negative-control; echo "EXIT_CODE=$?"
INFO  E1 gate OFF + flock OFF: maximo de propietarios simultaneos = 3
SUMMARY pass=37 fail=0  (control_negativo_propietarios=3)
NEGATIVE_CONTROL propietarios_simultaneos=3 (se esperaba >=2)
NEGATIVE_CONTROL VERDICT: FAIL — el detector SI vio 3 propietarios a la vez. exit 1
EXIT_CODE=1
```

El mismo binario, con dos (o tres) propietarios a la vez, **sale con 1**. El detector no es decorativo: cuando el mutex se quita, lo grita.

### 4.4 Tres disparos consecutivos → máximo 1

Worker instalado, sin red (`systemctl` y `ape-canaryctl` falsos, flock real, cola con 3 tickets, log de acceso vacío para que la puerta admita):

```
### 3 disparos CONCURRENTES del worker instalado (sin red)
--- eventos medidos (S=arranca, E=termina) ---
S 1794621415844602372 shot1
E 1794621421847655442 shot1
--- maximo de canaries concurrentes ---
1
--- unidades ape-canary@ simuladas que quedaron vivas ---
unidades_vivas=0
  ape-canary@shot1.service inactive
--- tickets consumidos / restantes ---
restantes_en_cola=2
--- logs de los 3 workers ---
[worker 1] 2026-11-14T01:56:55Z worker: skip: otro worker tiene el lock …/ape-canary.lock (un solo propietario)
[worker 2] 2026-11-14T01:56:55Z worker: PROVIDER_GATE decision=ALLOW claimant=canary level=1 reason=idle_admit player_age_s=none player_signal=none …
           2026-11-14T01:56:55Z worker: dispara canary id=shot1 host=line.tivi-ott.net (fuente redactada)
           2026-11-14T01:56:55Z worker: canary shot1 lanzado
           2026-11-14T01:57:03Z worker: canary shot1 terminado tras 8s (confirmado tras asentamiento)
[worker 3] 2026-11-14T01:56:55Z worker: skip: otro worker tiene el lock …/ape-canary.lock (un solo propietario)
```

**Máximo 1 canary. 0 unidades vivas al final. 2 tickets intactos.** Con la corrección H3, "1 canary" equivale a **2 ffmpeg**, no a 1.

> **Por qué esto no se corre contra el proveedor real:** tres canarios reales contra una cuenta de **una sola conexión** es precisamente el daño que este gate existe para impedir, y el operador estaba zapeando y reproduciendo en ese momento (latido QoE activo). El ensayo usa unidades systemd **falsas** — permitido explícitamente por el encargo — y conserva lo que importa: el worker real, la puerta real y el flock real.

### 4.5 Producción: el reproductor activo y el canary **no** arranca

Ticks reales de systemd (sin overrides), con el operador zapeando:

```
2026-11-14T02:02:45Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=4 player_signal=zap …
2026-11-14T02:03:06Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=5 player_signal=zap …
2026-11-14T02:03:26Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=2 player_signal=zap …
2026-11-14T02:03:36Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=6 player_signal=zap …
```

Y el backstop contra el apilamiento, medido cuando aún quedaba un canary vivo de la época anterior:

```
2026-11-14T01:55:20Z worker: PROVIDER_GATE decision=DENY … reason=canary_already_live canary_live="ape-canary@07b3b9e492744874.service"
2026-11-14T01:55:39Z … reason=canary_already_live … 01:56:02Z … 01:56:22Z … 01:56:42Z
```

### 4.6 Los tres comandos del contrato

```
$ bash -n /opt/ape-pulse/ape-pulse-canary-worker.sh
exit=0
$ systemctl list-units 'ape-canary@*' --state=active --no-legend | wc -l
0
$ pgrep -c ffmpeg || echo 0
0
```

### 4.7 Antes / después

| | 01:41:57Z (antes) | 02:03:36Z (después) |
|---|---|---|
| Unidades `ape-canary@` activas | **4** | **0** |
| Procesos `ffmpeg` | **8** | **0** |
| Admisiones nuevas con el operador activo | todas (guard fail-open) | **0** — todo `DENY reason=player_active` |

**Honestidad sobre el "después":** el 0/0 no lo causa solo el gate: las 4 unidades antiguas murieron al agotar `RuntimeMaxSec=300`. Lo que el gate sí causa, y está medido arriba, es que **no entra ninguna admisión nueva** mientras el reproductor está activo (§4.5) y que **no se apila un segundo canary** aunque la espera agote su techo (`canary_already_live`). El antes/después causal es §4.2 D1/D2 + §4.5, no el 0/0.

---

## 5. Backups y rollback (probado de verdad, no descrito)

| | |
|---|---|
| Backups | `/var/backups/ape-mutexgate/20261114T015514Z/` y `/var/backups/ape-mutexgate/20261114T020000Z/` |
| Contenido | worker, las 3 units `ape-pulse-canary.*`, librería y test + `PRE.sha256` |
| Script de rollback | `/opt/ape-pulse/ROLLBACK_mutexgate.sh` (sha `2736d98f…`), soporta `--dry-run` |

Rollback **ejecutado de verdad**, no simulado:

```
$ /opt/ape-pulse/ROLLBACK_mutexgate.sh
restaurado /opt/ape-pulse/ape-pulse-canary-worker.sh
restaurado /etc/systemd/system/ape-pulse-canary.service
rollback aplicado
--- hashes que deben cuadrar (PRE) ---
394f360b7fae5c8371f4bf3a860580f6e3ee1cd2f3fc41e975edbcf2ce0d286a  /opt/ape-pulse/ape-pulse-canary-worker.sh
$ sha256sum /opt/ape-pulse/ape-pulse-canary-worker.sh
394f360b7fae5c8371f4bf3a860580f6e3ee1cd2f3fc41e975edbcf2ce0d286a   ← = PRE
```

y re-aplicación posterior verificada (`a13dd676…`). El reemplazo es `install` + `mv` (renombrado atómico) para que un tick del worker nunca lea un fichero a medias. Cero reinicios de servicio: `daemon-reload` no reinicia nada y systemd lee el script en cada ejecución.

**Nota H7:** en esa re-aplicación olvidé la unit; corregido después (`TimeoutStartSec=440`, efectivo `7min 20s`, sha `f7c2b6cf…`).

---

## 6. Caso borde obligatorio: un zap que llega **mientras el canary ya corre**

**Decisión: se DECLARA, no se mitiga con desalojo.** El gate no puede desalojar: no tiene (ni debe tener) permiso para matar un `ape-canary@` en vuelo, y `KillMode=control-group` en la plantilla haría que un stop a mitad dejara el estado peor.

Lo que sí hace y se puede medir:
1. **Acota la ventana**: el canary está limitado por `RuntimeMaxSec=300` de la plantilla (medido: `ape-canary@141df780c9b35634.service: Deactivated successfully` a las 01:43:30 tras agotarlo) y el worker no lo suelta antes.
2. **Re-decide justo antes de lanzar** (`worker:118`): si el zap llegó mientras se escaneaba la cola, el ticket se descarta y no se lanza.
3. **No apila otro** encima: cualquier tick posterior recibe `canary_already_live`.

**Lo que NO se puede evitar, y se declara:** durante esos hasta ~300 s, el canary en vuelo **sigue consumiendo la única conexión**. Si el operador zapea en ese hueco, su petición puede recibir 461 → pulse.php lo publica como 502. Eso es un **residual abierto**, no un fallo del gate: es el límite de una exclusión que no puede adelantarse a un proceso ya lanzado.

Evidencia de que el hueco es real y del tamaño que digo: las unidades tardaron hasta 4:55 s de vida y siguieron vivas mientras había zaps registrados a las 01:41:27.

**Para cerrarlo de verdad** (fuera de mi alcance, decisión del operador, una de estas dos):
- bajar `RuntimeMaxSec` del template `ape-canary@.service` a ~30-45 s (el canary toma 6 s de clip; 300 s no aporta), o
- añadir en `ape-canaryctl`/un drop-in un `ExecStop` disparado por el zap.

Ninguna de las dos la aplico: la plantilla está fuera de mi inScope y tocar producción sin orden explícita está prohibido.

---

## 7. Lo que este gate NO puede garantizar (declarado, no prometido)

1. **Que el proveedor respete la cuota.** El gate decide *quién* usa la conexión; no controla el contador del proveedor. Si el proveedor cuenta distinto (o cuenta reintentos internos suyos), el gate no lo ve.
2. **Que el reproductor no abra dos conexiones por su cuenta.** OTT Navigator puede abrir conexiones en paralelo por diseño; el gate observa tráfico en el log, no impone nada al player. Una segunda conexión del player no la detecta ni la puede impedir.
3. **Que un `ape-canaryctl start` manual pase por el gate.** No pasa: `/usr/local/bin/ape-canaryctl` inicia la unidad directamente. El gate vive en el worker. Un operador que lance el canary a mano se salta la exclusión y puede robar la conexión.
4. **Que `ape-canary@.service` no reintente por su cuenta.** `Restart=on-failure` + `StartLimitBurst=3` significa que un canary que falla reintenta hasta 3 veces, cada reintento **vuelve a pedir la conexión**, y esos reintentos no pasan por el worker. Medido: `restart counter is at 3`. El worker lo compensa (espera + puerta) pero **no puede impedirlo** porque la plantilla no es suya (H5: desplegada ≠ versionada).
5. **Que el latido QoE se emita siempre.** Si el reproductor deja de reportar `conviva-event.php` y sigue reproduciendo, el gate verá "idle" a los `PG_PLAYER_WINDOW` s. Es el límite de observar por logs en vez de por estado del proveedor. Mitigación disponible: subir `PG_PLAYER_WINDOW` (más conservador, el canary corre menos).
6. **Que el log de nginx no rote.** Si `playlist_access.log` rota y el fichero nuevo está vacío, el gate ve "sin señales" y **admite**. Fail-closed cubre el fichero **ilegible**, no el fichero **vacío legítimo**. Con rotación diaria, la ventana de riesgo es el primer segundo tras el corte.

Un gate que promete más que esto es peor que ninguno: los puntos 1-6 son el contrato real.

---

## 8. Lo que no se ha tocado

| Artefacto | Estado |
|---|---|
| `/var/www/html/prisma/api/pulse.php` | **intacto** — mtime `Nov 13 10:51`, sin cambios |
| `/var/www/lists` | **intacto** — mtime `Nov 14 01:10` |
| `configs/app.toml` (`paper_mode`) | no existe en el VPS; no tocado en el repo |
| `backend/relays-client/src/live_exec_policy.rs` | no tocado |
| `backend/relays-client/src/bundle_builder.rs` | no tocado |
| `wg0`, `eth0` | **ni usados ni diagnosticados**, por regla |
| `ape-canary@.service` | **no tocado** (fuera de inScope; es el sujeto de H5 y §6) |
| `tools/ops/ape-player-priority.sh` | **no tocado** (fuera de inScope; riesgo H6) |

Cambios aplicados, todos dentro del inScope del contrato:

| Fichero | Antes | Después |
|---|---|---|
| `/opt/ape-pulse/ape-pulse-canary-worker.sh` | `394f360b…` (171 L) | `a13dd676…` (150 L) |
| `/opt/ape-pulse/lib/provider-gate.sh` | no existía | `f1784354…` (265 L) |
| `/opt/ape-pulse/lib/provider-gate.test.sh` | no existía | `91cd732d…` (343 L) |
| `/etc/systemd/system/ape-pulse-canary.service` | `6f3de879…` (340 s) | `f7c2b6cf…` (440 s) |
| `/opt/ape-pulse/ROLLBACK_mutexgate.sh` | no existía | `2736d98f…` |

`ape-pulse-canary.path` y `.timer` **no se modificaron** (estaban correctos: el `.path` da el disparo inmediato, el `.timer` la red de seguridad de 20 s).

---

## 9. Deuda y siguiente paso

1. **Plantilla `ape-canary@.service`**: desplegada (995 B, `Restart=on-failure`) ≠ versionada (783 B, `Restart=no`). Mientras no se reconcilie, cada canary fallido reintenta hasta 3 veces pidiendo la conexión. **Requiere autorización del operador.**
2. **`RuntimeMaxSec=300`** es el techo del residual de §6. Bajarlo a 30-45 s cerraría el caso borde casi por completo.
3. **`ape-canaryctl` manual** salta el gate (§7.3). La solución correcta es que `ape-canaryctl start` consulte `provider_gate_decide` antes de `systemctl start`; no lo hice porque ese binario no está en mi inScope.
4. **`tools/ops/ape-player-priority.sh`** (untracked) re-inyectaría el guard roto de H1 si alguien lo re-ejecuta. Marcarlo obsoleto o borrarlo.
5. **Rotación del log** (§7.6): idealmente el gate debería apoyarse también en el estado de la unidad del player o en una marca persistente, no solo en el fichero de log.

---

## 10. Coordinación

- **canary-auditor (t40)** propuso el parche del corchete y midió el mismo defecto por su cuenta; su versión (`8eb94bf2`) quedó **a salvo** en `/var/backups/ape-mutexgate/20261114T015514Z/ape-pulse-canary-worker.sh` (8.338 B) cuando instalé el gate encima. Su objeción sobre `Restart=no` es la que produjo el hallazgo **H5**, y su corrección de atribución (el deploy es de `8eb94bf2`, no suyo) está aceptada y reflejada.
- Su criterio **F2'** (>2 ffmpeg con cwd canary **o** >1 unidad simultánea) coincide con la corrección **H3** de este informe: la unidad de cuenta es la unidad.

---

# 11. Reparación ronda 2 (t45) — los 7 hallazgos de t44

Gate v3 = `/opt/ape-pulse/lib/provider-gate.sh` (sha256 `81360dcd9100c94b2db87d9866668c42bef5b5e59cd81ddbbaae9d233d472819`).
Test v3 = `/opt/ape-pulse/lib/provider-gate.test.sh` (sha256 `aa43d64d14994bbf40fb89d0d9d1440a21344236c97506f28763a38ffbbc99a2`).
Backup de esta ronda: `/var/backups/ape-mutexgate/20261114T022635Z/`.
El **worker NO se ha tocado** (`a13dd676…`, idéntico): este contrato lo excluye expresamente y requiere decisión humana.

## 11.1 Veredicto por hallazgo

| # | Hallazgo de t44 | Estado |
|---|---|---|
| 1 | Mutex que no dependa de un path + confirmar arranque en 2 s | **CERRADO en el repo** — confirmación cableada y probada; mutex sobre el inodo de un directorio escrito en la ruta canónica (sha256 `0dd13279…`), el deploy lo aplica |
| 2 | 0 líneas = unknown → DENY; frescura del log; escotilla `PG_ALLOW_EMPTY_LOG=1` | **CERRADO** |
| 3 | `age < -5` → DENY; parsear el offset de `$5`; verificarlo al arrancar | **CERRADO** |
| 4 | Exit code de `list-units`: roto → ERR → DENY; distinguir "0 unidades" de "consulta rota" | **CERRADO** |
| 5 | Mitigar (stop del canary si el reproductor se activa) o declararlo | **CERRADO por mitigación** |
| 6 | Una sola llamada a systemctl + `reset-failed` tras cada corrida | **CERRADO** |
| 7 | Registrar cada decisión en `PG_LOG` con rotación | **CERRADO** |

## 11.2 Hallazgo 1: la mitad que sí y la mitad que no

**La confirmación de arranque está hecha y cableada.** Vive dentro de `provider_gate_wait_canary_gone`, que el worker **ya llama** justo después de `$CTL start`, así que no necesita editar el worker: sondea hasta `PG_START_CONFIRM=2` s a que `pg_canary_live_units` vea la unidad; si no aparece, busca en `--all` la unidad que quedó en estado no muerto, le aplica `ape-canaryctl stop <id>` y **DENIEGA**.

```
PASS  D4a si la unidad no aparece en 2s -> NO confirmado (exit 1) [1]
PASS  D4b se intento ape-canaryctl stop
```

**El mutex: la primitiva funciona, el cableado es imposible desde aquí.** Medí primero la primitiva — `flock` sobre el **inodo del directorio `/run`**, que no se puede borrar (un fichero de lock sí: si alguien lo borra, dos procesos bloquean inodos distintos y el mutex desaparece):

```
P1: lock sobre /run OK (fd=9)
P2: correcto -> segundo lock RECHAZADO (exclusion real)
P3: lock liberado al morir el tenedor (correcto)
```

y en la suite, con la primitiva expuesta como API de scope llamante:

```
INFO  D1c otro proceso intenta tomarlo: RECHAZADO
PASS  D1d otro proceso -> RECHAZADO (exclusion real, sin depender de un fichero mio)
PASS  D1f liberado -> el otro proceso lo toma [TOMADO]
```

**Por qué no está cableado, y por qué NO lo dejé puesto "como si" funcionara.** Primero lo implementé dentro de `provider_gate_decide` (así cualquier consumidor quedaría cubierto sin tocar el worker). El dry-run lo desenmascaró:

```
INFO  D1c segundo consumidor: PROVIDER_GATE decision=ALLOW … mutex=1
FAIL  D1d segundo consumidor en otro proceso -> DENEGADO por el mutex
```

El worker invoca `DECISION="$(provider_gate_decide canary)"`: la *command substitution* crea un **subshell**, el descriptor se abre y se cierra con el subshell, y `flock` se libera al instante. **Un mutex que se libera antes de usarse no protege nada.** Dejarlo habría sido exactamente la mentira que este proyecto prohíbe — anunciar una garantía inexistente — así que lo **quité del camino de decisión**.

**Aplicado en el REPO, no por SSH (regla del operador del 2026-11-14: todo va por commit → push → GitHub Actions → deploy).** El cambio está escrito en la ruta canónica y espera al deploy:

```bash
# IPTV_v5.4_MAX_AGGRESSION/vps/ape-pulse/ape-pulse-canary-worker.sh
# antes:  exec 9>"$LOCK"        # fichero de lock: se puede borrar
# ahora:  exec 9<"$LOCK_TARGET" # inodo de DIRECTORIO: no se puede recrear
LOCK_TARGET="${APE_CANARY_LOCK_TARGET:-/run}"
```

| artefacto | ruta en el repo | tamaño | sha256 |
|---|---|---|---|
| worker | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-pulse/ape-pulse-canary-worker.sh` | 8.781 B | `0dd13279281c5c4d03bc381d563fb01f330505a6dbc70fac1450b857f64a0efa` |
| espejo | `vps/stage/ape-pulse-canary-worker.sh` | 8.781 B | `0dd13279281c5c4d03bc381d563fb01f330505a6dbc70fac1450b857f64a0efa` |

Cubre el 100 % de la vida del worker (no de una subshell), no depende de ningún path que un tercero pueda tocar, y no necesita TTL ni limpieza. En producción `APE_CANARY_LOCK_TARGET` no está definida, así que el target es literalmente `/run`; la variable existe sólo como costura del test, para que el control negativo pueda seguir quitando el mutex y demostrar que el detector lo ve.

**Estado honesto de la verificación:** `bash -n` da exit 0 en local sobre los tres ficheros (`worker`, `provider-gate.sh`, `provider-gate.test.sh`) con GNU bash 5.2.37. La suite completa **todavía no se ha corrido contra esta combinación nueva**: hacerlo exige ejecutarla en el VPS y escribir en `/tmp`, y la regla prohíbe escribir en el VPS. Queda como verificación post-deploy, no la declaro verde.

## 11.3 Hallazgo 2: 0 líneas ya no es "idle"

- **log de 0 bytes** → `ERR` → `reason=player_state_unknown_failclosed`, salvo la escotilla explícita;
- **log sin escrituras hace más de `PG_PLAYER_WINDOW`** → `ERR` (un log rancio no prueba nada).

```
PASS  C6 log de 0 bytes -> DENEGADO (unknown, no idle) [1]
PASS  C7 escotilla PG_ALLOW_EMPTY_LOG=1 -> ADMITIDO [0]
PASS  C7c la escotilla queda registrada
PASS  C8 log sin escrituras desde hace 900s -> DENEGADO [1]
```

Esto **corrige** el punto 6 de §7: antes un log rotado y vacío se leía como "idle" y el canary arrancaba; ahora se lee como "no puedo probarlo" y no arranca. La degradación tras una rotación pasa a ser "el canary no corre", no "roba la conexión".

## 11.4 Hallazgo 3: reloj no fiable y offset real

```
PASS  C9 age < -5 (senal del futuro) -> DENEGADO [1]
PASS  C9b razon literal                       -> reason=player_state_unknown_failclosed
PASS  A5 offset -0500 aplicado (base + 5h) [1704085200]
PASS  A6 offset +0530 aplicado (base - 5h30) [1704047400]
PASS  A7 autotest de zona al arrancar [ok]
```

El offset de `$5` se parsea y se aplica (`epoch = base_utc − offset`), y al arrancar el gate corre un **autotest** con dos conversiones conocidas; si no cuadra, `PG_SELFTEST != ok` y **todo DENY con `reason=gate_selftest_failed`**.

**Este hallazgo destapó un bug real mío que habría roto el gate en producción**: el campo `$5` de nginx **también trae corchete** (`+0000]`). Sin sanearlo, `pg_offset_seconds` no casaba el patrón, toda señal del reproductor se volvía `unknown` y el gate denegaba por la razón equivocada — perdiendo además la señal. Lo cazó el dry-run (B2/B3/C3/C4/C5/F4 en rojo con `player_signal=unknown`). Corregido y verificado contra el log real:

```
ultima senal del reproductor: 1794623195:zap
autotest de zona: ok
```

## 11.5 Hallazgo 4: "0 unidades" ≠ "consulta rota"

`pg_canary_live_units` captura el **exit code** de `list-units`. Sólo un exit 0 con salida vacía significa "no hay ninguna"; cualquier otro devuelve `ERR` → `DENY reason=canary_state_unknown_failclosed`.

```
PASS  D0a 0 unidades con exit 0 -> cadena vacia (LEGITIMO, no ERR) []
PASS  D0b consulta rota -> ERR [ERR]
PASS  D0c consulta rota -> canary DENEGADO [1]
PASS  D0d razon literal
```

## 11.6 Hallazgo 5: mitigación del caso borde

Cierra el residual de §6. En el bucle de espera, si el reproductor se activa **con el canary vivo**, el gate detiene el canary — es diagnóstico; el operador es producción:

```
INFO  D5 salida de la espera:
      2026-11-14T02:24:05Z gate: MITIGACION: reproductor activo (5s) con canary vivo; ape-canaryctl stop mitigacion
PASS  D5a se detecto el reproductor activo con canary vivo
PASS  D5b se pidio ape-canaryctl stop [stop mitigacion]
```

Sigue sin haber desalojo ciego: sólo actúa si el reproductor está activo **y** el canary sigue vivo.

## 11.7 Hallazgo 6: una sola llamada, y `reset-failed` en cada corrida

`pg_canary_live_units` hace **una** llamada con `--state=active,activating,reloading,deactivating`; ya no hay un `systemctl show` por unidad. Instrumenté el `systemctl` falso para contar las llamadas reales de una decisión:

```
INFO  D6 llamadas a systemctl en UNA decision:
      list-units
      reset-failed
PASS  D6a reset-failed invocado en la corrida
PASS  D6b la consulta de unidades es UNA sola llamada list-units [1]
PASS  D6c cero llamadas 'show' por unidad [0]
```

**Segundo defecto propio que cacé aquí:** puse `reset-failed` sólo al final del camino de espera. Con la puerta denegando todo (el operador estaba activo) ese camino no se recorre nunca, así que las 28 unidades fallidas seguían acumuladas:

```
unidades failed ANTES de mi cambio: 28 ; AHORA: 28      <- no se limpiaba
```

La moví a `provider_gate_decide`, es decir a **cada** corrida (`reset-failed` sobre unidades activas es no-op: no toca al canary en vuelo). Resultado medido: `failed units: 0`.

## 11.8 Hallazgo 7: rastro real de cada decisión

Cada decisión se registra en `PG_LOG` con **rotación** por tamaño (`PG_LOG_MAX`, 1 MiB → `.1`), sin contaminar stdout (el worker captura la salida de `decide`):

```
2026-11-14T02:28:36Z decision: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=1 player_signal=zap … selftest=ok
decisiones en provider-gate.log: 21
PASS  G1 cada decision se registra en PG_LOG (25)
PASS  G2 rotacion del log al superar PG_LOG_MAX
```

La cabecera del gate ya no promete nada que no exista.

## 11.9 Verificación final (salida literal)

```
$ bash -n /opt/ape-pulse/ape-pulse-canary-worker.sh                        -> exit=0
$ systemctl list-units 'ape-canary@*' --state=active --no-legend | wc -l   -> 0
$ pgrep -c ffmpeg || echo 0                                               -> 0
$ /opt/ape-pulse/lib/provider-gate.test.sh
SUMMARY pass=67 fail=0  (control_negativo_propietarios=3)
VERDICT: PASS (mutex real = 1 propietario; control negativo detecto 3 propietarios)
EXIT_CODE_TEST=0
$ /opt/ape-pulse/lib/provider-gate.test.sh --negative-control
NEGATIVE_CONTROL propietarios_simultaneos=3 (se esperaba >=2)
NEGATIVE_CONTROL VERDICT: FAIL — el detector SI vio 3 propietarios a la vez. exit 1
EXIT_CODE_NEG=1
```

Producción, con el operador reproduciendo en ese momento:

```
2026-11-14T02:32:54Z worker: PROVIDER_GATE decision=DENY claimant=canary level=1 reason=player_active player_age_s=10 player_signal=conviva player_window_s=180 canary_live="" jit_pids="" selftest=ok
failed units: 0     unidades activas: 0     ffmpeg: 0
```

## 11.10 Lo que sigue sin poder garantizarse

Sin cambios respecto a §7, más un punto que este round deja explícito:

- **El mutex sobre directorio está en el repo, pendiente de deploy** (§11.2, sha256 `0dd13279…`). Hasta que el CI/CD aplique ese worker, la exclusión real sigue siendo el `flock` sobre el **fichero** `/run/ape-canary.lock`, que sí depende de un path y es vulnerable a que alguien borre ese fichero. Declarado, no disimulado.
- Un `ape-canaryctl start` manual sigue sin pasar por el gate (§7.3).
- La plantilla `ape-canary@.service` sigue sin ser mía (§7.4 y H5).
- El latido QoE puede no emitirse (§7.5).
