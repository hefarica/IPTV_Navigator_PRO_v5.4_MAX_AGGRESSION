# Panel de integración de listas — decisiones y descartes (v1)

**Contrato:** [`contracts/list_cablear_panel_v1.json`](../contracts/list_cablear_panel_v1.json) · `ape.lists.cablear_panel.contract.v1` · version **1.0.0** · `status: SPECIFIED_NOT_IMPLEMENTED`
**Fecha:** 2026-11-14 · **Autor:** `contract-architect` (t59)
**Sin código de producción y sin tocar el VPS:** esto es el contrato; lo implementan el backend PHP y el frontend.

## El hueco que cierra

Medido, no supuesto: `ape-cablear-auto.sh` recorre `/var/www/html/lists/*.m3u8` y cablea **solo la más reciente** por mtime (o `--todas`). No hay forma de decir "cablea ESTA". El panel pide **una lista concreta**, la encola, y devuelve la URL cableada exacta.

## Las ocho decisiones

| # | Punto | Decisión |
|---|---|---|
| 1 | **Entrada** | Nombre de `/lists/` **o** URL `http(s)` externa. La externa sólo si el host está en `/etc/ape/cablear-hosts.allow`, **allowlist vacía por defecto** → externa rechazada con `E_HOST_NO_PERMITIDO` |
| 2 | **Encolado** | `POST /prisma/api/cablear.php` (form-urlencoded): `lista`, `publicar` (0 por defecto), `device`, `forzar`. 14 validaciones en orden, cada una con su código literal. **Idempotente** por clave `sha256(fuente + tamaño + mtime + wiring_version)` |
| 3 | **Estado** | `GET /prisma/api/cablear-estado.php` con `?ticket=`, `?ultimos=N` o `?lista=`. Seis estados: `queued`, `running`, `done`, `failed`, `skipped_disk`, `expired`. Reenganche por `localStorage` + `?ultima` |
| 4 | **Cola** | `/var/lib/ape/cablear/{cola,tomados,hechos,fallidos}`. Un JSON por ticket. Encolado `.tmp`+`rename`; **la toma ES el `rename` a `tomados/`**. Heartbeat 30 s, reaper 600 s, 2 intentos, TTL 7 días |
| 5 | **Ejecutor** | `systemd .path` + worker *oneshot* con `flock`, **y el timer de 15 min se mantiene** como red de seguridad |
| 6 | **Disco** | `libre ≥ 3000 MB` **y** `coste (descomprimido×2) ≤ libre − 3000`. Si no cabe: `skipped_disk`, HTTP 507, **ticket conservado** |
| 7 | **Respuesta** | `https://iptv-ape.duckdns.org/lists/<base>_CABLEADA.m3u8` (+ `.gz`). Nombre **determinista**: recablear reescribe el mismo fichero |
| 8 | **Invariantes** | I1 no degradar · I2 no tocar el original · I3 no publicar sin pedirlo · I4 un trabajo por versión · I5 sin doble-envuelto · I6 sin ficheros a medias · I7 `u=` urlencoded |

## Por qué la URL externa va con allowlist vacía

Un campo libre que acepta una URL y la descarga en el VPS es un **SSRF** contra la propia red del VPS: `127.0.0.1:8084` (el motor), el proveedor, o el metadata service del cloud. La función existe —el operador la abrió en su pedido— pero **cerrada por defecto**: abrirla es un acto deliberado (editar `cablear-hosts.allow`) y queda en el log. Además: sin `userinfo`, sin redirects, sólo `http(s)`, 2 GiB máximo, 120 s.

## Path traversal: cuatro barreras independientes

No es una regex y ya está. Basta que una falle para rechazar:

1. **B1** `^[A-Za-z0-9][A-Za-z0-9._-]{0,123}\.m3u8$` — sin `/`, sin `\`, sin `..`, sin espacios, sin `:` ni NUL.
2. **B2** primer carácter alfanumérico — mata `.` y `-` iniciales (ocultos, `..`).
3. **B3** `realpath(resolve(dir, nombre))` debe colgar de `/var/www/html/lists/` (con barra final) — si un symlink intermedio escapa, no cuela.
4. **B4** `lstat` del destino final: si es symlink → `E_LISTA_ES_SYMLINK` (no se cablea el blanco de un enlace).

El contrato trae **12 vectores comprobables** con su código esperado (`../etc/passwd`, `..%2F..%2F…`, `sub/dir.m3u8`, `.oculta.m3u8`, `A%00B.m3u8`, `169.254.169.254`, `ftp://`, `user:pass@`, …) para que la implementación se pruebe contra ellos, no contra la intuición.

## El disco, con la aritmética de hoy

No se inventa una regla: **se eleva a contrato la que ya aplica** `ape-cablear-auto.sh` (`MIN_FREE_MB=3000`, coste = descomprimido × 2).

```
libre 5734 MB · mínimo 3000 MB · coste(1,3 GB) 2597 MB
2597 ≤ (5734 − 3000) = 2734   ->  cabe, con 137 MB de margen
segunda lista del mismo tamaño -> 2597 > (2801 − 3000) < 0  ->  skipped_disk
```

Es decir: **hoy cabe una más, no dos**. Eso es el 85 % medido, dicho con números en vez de con un adjetivo. Además el worker **recalcula el disco al ejecutar**, porque entre encolar y ejecutar pueden pasar minutos.

## Alternativas de ejecución, con su coste (y por qué se descartan)

| Opción | Latencia | Coste | Veredicto |
|---|---|---|---|
| **Timer 15 min** (lo que hay) | hasta **900 s** | **0 unidades nuevas** | **Descartada como única**: 15 min de spinner no es un panel, es una sala de espera |
| **`.path` + oneshot** | **< 1 s** (inotify) | 1 unidad `.path` + 1 `.service`; **sin proceso residente** | **ELEGIDA** |
| **Worker residente** | < 1 s | 1 proceso permanente: log, restart, fuga de memoria y superficie de fallo propios | **Descartada**: el trabajo dura 24 s y ocurre cuando el operador pulsa un botón; no justifica un demonio |

**El riesgo del `.path`** (leer un fichero a medio escribir) se cierra en el **encolado**, no en el worker: se escribe `cola/.tmp-<ticket>.json` y se hace `rename()`. `inotify` ve nacer el fichero ya completo. El worker, por si acaso, valida el JSON y si falla deja el ticket y registra `E_TICKET_ILEGIBLE`: no lo borra.

Y **el timer se queda**: si un evento se pierde (reinicio, inotify desbordado), el tick de 15 min recoge lo que quedó. El worker es idempotente, así que la red de seguridad no cuesta trabajo duplicado.

## Idempotencia: por qué la clave lleva `mtime` y `wiring_version`

- **`mtime`**: el generador reescribe el mismo nombre de fichero con contenido nuevo. Sin `mtime`, un reintento tras regenerar devolvería el ticket viejo y el operador creería que cableó la versión nueva. Con `mtime`, es una lista nueva y se cablea.
- **`wiring_version`**: si cambia el cableador (formato de `u=`, device), la misma lista **debe** poder re-cablearse.

Dos `POST` idénticos → **el mismo ticket** con estado `duplicado` (HTTP 200), no un segundo trabajo.

## Lo que este contrato NO decide

- **Auth**: se hereda de `/prisma/api`. Sin sesión válida → 401 `E_NO_AUTORIZADO`, pero el mecanismo no se define aquí.
- **nginx** y `gzip_static`: fuera de alcance.
- **NO_COMPUTADO**: concurrencia real del panel (se asume 1 operador y se serializa con `flock`), tiempo exacto del worker con gzip sobre 1,3 GB (los 24 s son del PHP sin gzip), y si nginx sirve `.gz` (el `auto.sh` asume que sí; no se re-verifica aquí).

## Reproducir la comprobación del contrato

```bash
node -e "const c=require('./contracts/list_cablear_panel_v1.json'); \
  console.log(c.schema, c.version, Object.keys(c.decision_summary).length+'/8 puntos', \
  Object.keys(c.status_endpoint.states).length+' estados', \
  c.input.path_traversal_rule.checkable_vectors.length+' vectores', \
  c.disk_guard.min_free_mb+' MB de reserva')"
```
