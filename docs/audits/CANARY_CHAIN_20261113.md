# Cadena del canary — medida 2026-11-13

**Estado global: la cadena existe de punta a punta en el código, y está rota en TRES
puntos medidos. El canary no recibe trabajo, así que no vigila nada.**

Todo lo que sigue está medido en esta sesión con el comando o el fichero citado. Lo que
no se midió se declara como no computado, no se supone.

---

## 1. La cadena, eslabón por eslabón

```
[1] ottshim · SessionTap.kt
      NotificationListenerService escucha la MediaSession de OTT Navigator
      poll cada 200 ms
      detecta reset (position +1.5 s < lastPosition) o rebufferStart (PLAYING->BUFFERING)
      throttle: 1 por 3 s (lastZapAt)
      -> sendBroadcast(Intent("com.ape.crystalagent.ZAP").setPackage("com.ape.crystalagent"))
      Evidencia: ottshim/app/src/main/kotlin/dev/venice/ottshim/SessionTap.kt:63-75

[2] ape-crystal-agent · ZapReceiver.kt
      recibe com.ape.crystalagent.ZAP
      AraStatus.currentChannelId = "zap-$now"
      AraStatus.lastZapAt = now
      AgentService.start(context) · CaptureWatchdogService.start(context)
      Evidencia: android/ape-crystal-agent/.../ZapReceiver.kt:9-19
      Manifest: AndroidManifest.xml:133,136

[3] AgentService.kt
      SyncLoop.start(scope)        -> POST /sync cada 30 s
      SelfUpdateManager.start(scope) -> /ara/version + /ara/agent.apk cada 1 h
      Evidencia: android/ape-crystal-agent/.../AgentService.kt:116-117

[4] /sync  ·  ara-sync.php  (54.906 B, 12 nov 2026)
      GET  -> 405
      POST -> 400 {"ok":false,"error":"invalid_payload","detail":"unknown_field"}
      MEDIDO: curl -X POST https://iptv-ape.duckdns.org/sync -d '{"probe":1}'  (2026-11-13)
      *** ESTE ESLABON NO ESCRIBE EN LA COLA DEL CANARY ***
      grep -c 'canary' ara-sync.php -> 0
      grep -c 'queue'  ara-sync.php -> 0

[5] /var/lib/ara/canary/queue/   (drwxr-xr-x www-data:www-data)
      Solo pulse.php escribe aqui. Estado medido: VACIA.

[6] pulse.php  (28.420 B, 13 nov 10:51)
      $zap = (isset($_GET['z']) && (string)$_GET['z'] === '1');        [linea 84]
      if ($zap && is_file(PULSE_CANARY_FLAG)) {                        [linea 179]
          ticket = {id, url, seconds:6, ts}
          file_put_contents(queueDir."/$canaryId.json", ...)           [linea 184-187]
      }
      PULSE_CANARY_FLAG = '/etc/ara/pulse/canary.enabled'              [linea 39]
      PULSE_CANARY_DIR  = '/var/lib/ara/canary'                        [linea 40]
      PULSE_CANARY_LOCK_TTL = 300                                      [linea 41]

[7] ape-pulse-canary.timer  (OnBootSec=90s · OnUnitActiveSec=20s · AccuracySec=5s)
      -> ape-pulse-canary.service (Type=oneshot, TimeoutStartSec=340)

[8] ape-pulse-canary-worker.sh  (4.043 B)
      QUEUE=/var/lib/ara/canary/queue
      ALLOW=/etc/ara/canary/allowed_hosts.txt   (fail-closed si falta)
      CTL=/usr/local/bin/ape-canaryctl
      LOG=/var/log/ara/canary.log
      guarda JIT: skip si hay ffmpeg con cwd en /dev/shm/ape-jit
      -> ape-canaryctl -> systemd ape-canary@<id>.service -> ffmpeg (canary visual 6 s)
```

---

## 2. Los tres puntos rotos

### ROTO 1 — El ZAP no llega a la cola del canary

`ara-sync.php` no menciona `canary` ni `queue` (0 ocurrencias). El `/sync` del APK
**existe y valida**, pero no encola nada.

**Consecuencia**: `AraStatus.lastZapAt` se actualiza en el device y muere ahí.
El VPS nunca se entera de que hubo un zapeo.

### ROTO 2 — Las URLs del reproductor no llevan `z=1`

```
$zap = ($_GET['z'] === '1')

pulsos con z=1 : 0
pulsos sin z=1 : 3.602
```

**Cero de 3.602.** Sin `z=1`, `$zap` es siempre `false` y el ticket nunca se crea.

**¿Quién construye la URL?** `/opt/ape-pulse/ape-pulse-wrap.js` (no el generador del
navegador: `m3u8-typed-arrays-ultimate.js` tiene **0 ocurrencias** de `pulse`).
El wrapper tiene **0 ocurrencias** de `z`.

### ROTO 3 — Faltaba el flag maestro

`/etc/ara/pulse/canary.enabled` **no existía**. `/etc/ara/pulse/` estaba vacío.

**Creado en esta sesión** (`touch`, `chmod 644`, 13 nov 10:57). Ese es el interruptor
maestro que autoriza encolar.

---

## 3. Lo que SÍ quedó arreglado y verificado

### 3.1 El timer estaba muerto

```
ANTES: ActiveState=inactive · NextElapseUSecRealtime=(vacío) · journal: "No entries"
```

**Causa raíz**: `OnUnitActiveSec=20s` calcula desde la **última activación del
servicio**, y el servicio nunca se había activado. Arrancar el timer no basta: hay que
darle una primera activación para crear la referencia.

```
AHORA: ActiveState=active · 17 ejecuciones hoy · Result=success · ExecMainStatus=0
```

### 3.2 El worker escupía ~180 errores/hora al journal

```
ape-pulse-canary-worker.sh: line 50: /proc/<pid>/cmdline: No such file or directory
```

**Causa**: `jit_busy()` itera `/proc/[0-9]*` y los procesos mueren entre el glob y la
lectura. El `2>/dev/null` estaba en `tr`, pero el mensaje lo imprime el **shell** al
abrir el redirect, antes de que `tr` exista.

**Arreglo** (backup `ape-pulse-canary-worker.sh.bak_20261113T105425Z_procs`):

```bash
# antes
cmd="$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)" || continue
# despues
cmd="$( { tr '\0' ' ' < "$p/cmdline"; } 2>/dev/null )" || continue
[ -n "$cmd" ] || continue
```

**Verificado**: 2 ejecuciones en 45 s → **0 errores** de `/proc`.

### 3.3 La telemetría del device se descartaba (bug de nombres)

`pulse.php` leía `$dev['soc']`, `$dev['max_h']`, `$dev['buffer_ms']`, `$dev['player']`.
El player envía `{"t","s","r","w","h","f","hdr","p"}`. **Ninguna clave coincide.**

Medido: `21` pulsos con device poblado de `17.639` (**0,12 %**).

**Arreglo** (backup `pulse.php.bak_20261113T105100Z_devkeys`), verificado con un pulso real:

```json
ANTES: {"soc":"", "max_h":0, "buffer_ms":0, "player":""}
AHORA: {"soc":"unknown","max_w":1920,"max_h":1080,"fps":30,
        "hdr":"sdr","profile":"P3","player":"generic"}
```

---

## 4. Estado del device y de la APK (medido)

```
com.ape.crystalagent     instalado
studio.scillarium.ottnavigator  instalado (el player que se usa)
ps -A | grep crystalagent  -> SIN PROCESO
logcat eventos ARA-ZAP / ottshim zap -> 0
```

**La APK no está corriendo**, así que el eslabón [1] no puede disparar aunque el código
esté correcto.

---

## 5. El diagnóstico de los 502 (corregido)

El informe previo atribuía los 502 a un **throttle 461**. Medido hoy contra
`line.tivi-ott.net`:

```
HTTP/1.1 407 Proxy Authentication Required
Server: CDN PROXY SERVICE
```

- **No es 461: es 407.**
- **No se recupera**: 3 intentos en 3 s + 5 s de espera -> 407 siempre.
- **No depende del UA**: VLC -> 407.
- `pulse.php` **no reintenta el 407** (su lista es `0, >=500, 513, 461, 429, 408`),
  así que va directo a 502.

**Consecuencia práctica**: subir el backoff del 461 **no arregla nada**, porque el
código que llega no es 461. Es una condición de autorización del CDN, no de ritmo.

**Restricción vigente**: `wg0` y `eth0` están **prohibidos**. No se toca el egress, así
que este 407 no se resuelve desde el VPS.

---

## 6. Lo que falta para que el canary sea funcional

En orden de menor a mayor intervención:

| # | Cambio | Dónde | Riesgo |
|---|---|---|---|
| 1 | `/sync` encola un ticket cuando `lastZapAt` es reciente | `ara-sync.php` | bajo, aditivo |
| 2 | El wrapper añade `&z=1` a las URLs de pulse | `ape-pulse-wrap.js` | bajo, aditivo |
| 3 | La APK hace POST a `/sync` con el zap (ya lo hace cada 30 s) | sin cambio | — |
| 4 | Un endpoint dedicado `/ara/canary` que escriba el ticket | `ara-sync.php` o nuevo | bajo |

**El flag maestro ya está creado.** Cualquiera de las rutas 1/2/4 hace fluir los datos.

**Nota del operador**: el endpoint debe venir de la **APK**. Las rutas 2 y 4 son
"adicionales" y aceptables como refuerzo, pero la principal es la 1: que el `/sync` que
la APK ya envía cada 30 s deposite el ticket.

---

## 7. No computado

- **Cuántos ZAP emite ottshim en un zapeo real**: 0 en el buffer de logcat, y la APK no
  estaba corriendo. Requiere la APK activa y un zapeo.
- **Si `ara-sync.php` valida un payload de zap**: solo se probó `{"probe":1}` -> 400
  `unknown_field`. El contrato real no se inspeccionó campo por campo.
- **Tiempo de zapping**: `playlist_access.log` no incluye `$request_time` (23 campos, el
  último es el UA). El `log_format iptv` con `$request_time` existe pero aplica a
  `access.log`, que solo recibió 5 peticiones `/pulse/`.

---

*Medido por el agente REA el 2026-11-13. Cada afirmación cita comando, fichero:línea o
salida. Las tres correcciones de esta sesión tienen backup en el VPS.*
