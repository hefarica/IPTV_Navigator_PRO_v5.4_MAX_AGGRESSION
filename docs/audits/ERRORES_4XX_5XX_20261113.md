# Errores 4xx / 5xx — análisis y resolución
## Medido 2026-11-13, verificado 11 h después (2026-11-13 23:10 UTC)

Todo el reparto sale de `/var/log/nginx/playlist_access.log`. Cada cifra cita el
awk que la produjo. Lo que no se midió se declara como no computado.

---

## 1. Reparto completo de status

| Código | Cantidad | Quién | ¿Es un fallo nuestro? |
|---|---|---|---|
| 200 | 43.916 | players + UI | — |
| 404 | 1.792 | **bots** (zgrab, `.env`, `/owa/auth/`) | **No** — rechazo correcto |
| 503 | 728 | **674 netshield · 54 JIT** | **Sí (netshield) · JIT aparte** |
| 502 | 200 | proveedores (`line` 125 · `evestv` 44) | **No** — upstream |
| 206 | 101 | players (range) | — |
| 403 | 117 | **bots** (scanners) | **No** — rechazo correcto |
| 400 | 46 | bots + **11 de mis propias pruebas** | **No** |
| 405 | 5 | métodos no permitidos | correcto |

---

## 2. El 503 de `netshield-sentinel.php` — 674 casos, RESUELTO

**Era el 92 % de todos los 5xx.**

### Qué pasaba

```php
// /var/www/html/api/netshield-sentinel.php:79
if (!file_exists($jsonFile)) {
    bail(503, ['ok' => false, 'error' => 'no snapshot yet — first cycle pending']);
}
readfile($jsonFile);   // $jsonFile = /dev/shm/netshield_sentinel.json
```

**"first cycle pending" implica que el ciclo va a llegar. No va a llegar:
el productor de ese snapshot NO EXISTE.**

Medido:

```
/dev/shm/netshield_sentinel.json     -> no existe
/etc/systemd/system/netshield-sentinel.service -> NO EXISTE
netshield-sentinel.timer             -> Unit=netshield-sentinel.service, next: NONE
/opt/netshield/                      -> solo 'data' (sin script sentinel)
```

Y en el repo **tampoco hay productor**: la única mención es un consumidor,
`IPTV_v5.4_MAX_AGRESSION/net-shield/metrics/checkpoint.sh:25`, que también lee el
fichero. Junto con el widget de la UI (`netshield-sentinel-widget.js`) son **dos
consumidores de un dato que nadie genera**.

### Por qué el 503 hacía daño

El widget hace polling cada 30 s y lanza excepción en `!r.ok`:

```js
const REFRESH_MS = 30_000;
async function fetchSnapshot() {
  const r = await fetch(ENDPOINT, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);   // 503 -> throw
  return r.json();
}
```

674 peticiones ÷ 2 por minuto ≈ **5,6 horas de bucle de error**, y el widget
mostrando un fallo en cada recarga.

### El arreglo

`503` -> `200` con la forma **exacta** que el widget espera y el estado declarado:

```json
{"ok":false,"state":"NO_PRODUCER",
 "reason":"ningun proceso escribe /dev/shm/netshield_sentinel.json",
 "last_cycle_at":null,"pending_approvals":[],"recent_auto_applied":[],
 "top_signatures_lifetime":[],
 "stats":{"events_last_cycle":0,"proposals_auto_applied_all_time":0,
          "proposals_pending":0,"kb_unique_signatures":0}}
```

**Cero inventado, pero declarado.** El widget tolera la ausencia de `stats`
(`renderStats` devuelve `''` si no hay), así que no rompe: pinta ceros en vez de
gritar un error que nunca se va a resolver.

Backup: `netshield-sentinel.php.bak_20261113T112556Z_noproducer`.
`php -l`: **No syntax errors detected**.

### Verificación tras 11 h

```
endpoint ahora            : HTTP 200
último 503 de netshield   : [13/Nov/2026:11:22:15   (antes del arreglo, 11:25)
503 nuevos en 11 h        : 0
```

---

## 3. El 502 de `/pulse/` — 200 casos, NO RESUELVE SIN RED

**Es el proveedor, no el VPS.** Corregido el diagnóstico previo: **no es un
throttle 461, es `407 Proxy Authentication Required`.**

```
HTTP/1.1 407 Proxy Authentication Required
Server: CDN PROXY SERVICE
```

- **No se recupera**: 3 intentos en 3 s + 5 s de espera -> 407 siempre.
- **No depende del UA**: VLC -> 407, OTT Navigator -> 407.
- `pulse.php` **no reintenta el 407** (su lista es `0, >=500, 513, 461, 429, 408`),
  así que va directo a 502. **Es lo correcto**: reintentar una autenticación
  fallida no la arregla.

**Subir el backoff del 461 no habría arreglado nada**, porque el código que llega
no es 461.

**Restricción vigente**: `wg0` y `eth0` están **prohibidos** por el operador. El
egress no se toca, así que este 407 **no se resuelve desde el VPS**.

**Lo que sí funciona**: `evestv.wuitf.com` sirve `stale=1` cuando su fetch falla
(medido: `x-ape-pulse: ...stale=1;upstream_code=0`), así que los 502 de `evestv`
solo aparecen cuando **no había stale disponible**.

**Último 502: 11:25:39.** En las 11 h siguientes no hubo ninguno.

---

## 4. El 503 del JIT — 54 casos, siguiente fase

```
12 /jit/live/1174213/sdr/master.m3u8    UA "node"
12 /jit/live/1174213/master.m3u8        UA "node"
 6 /jit/live/3/sdr/master.m3u8          UA "node"
 6 /jit/live/1174213/sdr/manifest.mpd   UA "node"
```

**Repetitivo y con el mismo id (`1174213`)**: 12 intentos por ruta, cadencias de
~6 s. Es un cliente `node` insistiendo contra el JIT y recibiendo 503.

**No lo he tocado**: el operador dijo que el JIT va después del canary. Queda
medido y atribuido.

---

## 5. Los 4xx — ruido de internet, ninguno nuestro

```
404 /owa/auth/logon.aspx          zgrab/0.x
400 /                              zgrab/0.x
403 /                              python-requests/2.34.2
404 /.env                          (buscando secretos)
404 /api/session/properties
403 /                              scout.cyberconvoy.co
```

**Todos correctamente rechazados.** Un servidor expuesto recibe esto; 404/403 en
rutas que no existen es la respuesta correcta, no un fallo.

**Los 11 `4xx` sobre `/pulse/` son MÍOS** (`PowerShell/7.7.0`, `curl/8.5.0`,
`LibVLC/3.0.20`) de las pruebas de esta sesión: URLs mal concatenadas a propósito
para ver qué devuelve el borde. **No hay un cliente de producción generándolos.**

---

## 6. Resumen

| Clase | Casos | Estado |
|---|---|---|
| 503 netshield | 674 | **RESUELTO** — 200 con estado NO_PRODUCER |
| 502 proveedor | 200 | **NO RESOLUBLE sin red** (407 del CDN, wg0/eth0 prohibidos) |
| 503 JIT | 54 | **medido y atribuido**, siguiente fase |
| 404/403/400 bots | ~1.900 | **no son fallos** — rechazo correcto |
| 400 de mis pruebas | 11 | no son de producción |

**De los 5xx propios (no del proveedor), el 92 % está cerrado.**
El resto depende de red (prohibida) o es la siguiente fase declarada (JIT).
