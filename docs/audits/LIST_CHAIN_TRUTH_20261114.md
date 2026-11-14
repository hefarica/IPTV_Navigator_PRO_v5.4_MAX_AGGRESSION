# LIST CHAIN TRUTH — lista del operador → wrapper → allowlist del JIT

**Fecha:** 2026-11-14T01:4xZ · **Host medido:** `ubuntu-2gb-ash-1` (178.156.147.234, vía `ssh hetzner-iptv`, **solo lectura**)
**Tarea:** t41 · **Autor:** jit-auditor
**Objeto:** demostrar por bytes y por contenido que los tres eslabones apuntan al MISMO fichero.
**URL del operador:** `https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8`

> **Reglas respetadas:** no se ha escrito ni borrado nada en el VPS, no se ha tocado la lista, el JIT,
> `wg0` ni `eth0`. Todo son lecturas: `sha256sum`, `stat`, `grep`, `wc`, `ls`, `HEAD`/`Range` con
> `curl --resolve`, `cat`, `journalctl -n`. **No** se ha pedido ninguna URL `/pulse/<id>` (habría
> generado tráfico real al proveedor desde el VPS).

---

## 0. VEREDICTO

**Los tres eslabones coinciden HOY, medido, con el mismo conjunto de 21.224 canales.** Pero con dos
matices que van primero porque son el riesgo real:

1. **La trampa está materialmente presente y se disparó 30 minutos antes de medir.** Hay **dos**
   `.m3u8` de **10.573 canales** en `pulse/` con **mtime 14 h MÁS NUEVO** que la lista viva
   (§3). La cadena aguanta **solo** porque `pickList()` prefiere el `l=` que sirve el wrapper; el
   **fallback por mtime sigue armado** en el código desplegado.
2. **El arreglo vive SOLO en el VPS.** El espejo del repo `vps/ape-jit/reconcile.js` (11.132 B,
   `sha256 2b506fb6…`) **no tiene** `listaServidaPorWrapper`. Un `scp` del espejo al VPS, como
   documenta su propio README, **revierte el fix**. Divergencia medida en §7.

---

## 1. TABLA DE LA CADENA

| # | Eslabón | Valor medido | Coincide |
|---:|---|---|:--:|
| 1 | URL del operador (HTTP) | `200` · `content-length: 1311467322` · `last-modified: Fri, 13 Nov 2026 11:06:57 GMT` · `etag: "6af6ef51-4e2b673a"` | — |
| 2 | Fichero en disco `…/pulse/APE_LISTA_1794100720046.m3u8` | `1311467322` B · mtime `2026-11-13 11:06:57.222298491` · inode `389937` | **SÍ** (§2) |
| 3 | Canales en la lista | `#EXTINF` = **21.224** · 22.360.136 líneas | — |
| 4 | `meta.json` del JIT | `source=/var/www/lists/pulse/APE_LISTA_1794100720046.m3u8` · `size=1311467322` · `mtimeMs=1794568017222.2986` · `channels=21224` | **SÍ** (§5) |
| 5 | `l=` servido por el wrapper (últimas 20.000 líneas del log) | **467** peticiones · **1** id distinto · `l=APE_LISTA_1794100720046` | **SÍ** (§4) |
| 6 | `channels.json` | **21.224** claves · id mín `1` · id máx `2196455` | **SÍ** (§5) |
| 7 | Allowlist `APE_JIT_LIST.m3u8` | 42.449 líneas · **21.224** `#EXTINF` · set de `tvg-id` con `sha256 8bf83667…` | **SÍ** (§6) |
| 8 | Set de `tvg-id` de la LISTA | **mismo** `sha256 8bf83667e8e9331c68ede171821b865a55b0cf18a9b256c75a842444ff34e979` · 21.224 | **IDÉNTICO** (§6) |
| 9 | Reconcile en vivo (journal 01:41 y 01:46) | `LIST …/APE_LISTA_1794100720046.m3u8 1251 MB (servida por wrapper)` → `SKIP … canales=21224` | **SÍ** (§7) |

**Ningún eslabón discrepa en contenido.** La discrepancia está en el **proceso** (eslabón 10, §3/§7),
no en lo servido.

---

## 2. ESQUELÓN 1-2 · URL vs DISCO

```
HTTP/2 200
content-type: application/vnd.apple.mpegurl
content-length: 1311467322
last-modified: Fri, 13 Nov 2026 11:06:57 GMT
etag: "6af6ef51-4e2b673a"
cache-control: no-store
accept-ranges: bytes
x-ape-list-source: pulse-wrapped-if-present
```

- `content-length 1311467322` **==** tamaño en disco `1311467322`. **Coincide al byte.**
- `last-modified 11:06:57` **==** mtime `2026-11-13 11:06:57.222298491 +0000`. **Coincide al segundo.**
- El `etag` de nginx es `"<mtime hex>-<size hex>"`: `0x6af6ef51` = 1794568017 s = `2026-11-13T11:06:57Z`
  y `0x4e2b673a` = **1311467322**. Los tres números cuentan la misma historia.
- **La Placeholder Trick NO está activa en esta lista.** Con `Accept-Encoding: gzip` la respuesta es
  idéntica (`content-length` igual, sin `content-encoding` ni `vary`): no hay `.m3u8.gz` hermano que
  `gzip_static` pueda servir. Y los primeros 64 bytes del cuerpo son el playlist real
  (`#EXTM3U x-tvg-url="" x-tvg-url-epg=""…`), no `#EXTM3U\n`.
- **Dónde SÍ está activa:** en el directorio de **subida** `/var/www/lists/`, donde los tres
  `APE_LISTA_*.m3u8` pesan **8 bytes** y el contenido vive en su `.gz` (§3). Son dos directorios con
  la misma nomenclatura y contenido distinto: `/var/www/lists/` (8 B + `.gz`) y
  `/var/www/lists/pulse/` (contenido real). Esa diferencia es la que alimenta la trampa del §3.
- `x-ape-list-source: pulse-wrapped-if-present` es una **cabecera estática** de nginx
  (`/etc/nginx/snippets/url2-cartridge.conf:56`, `add_header … always`): declara una intención, **no**
  prueba que en esta respuesta se haya envuelto nada. No se usa como evidencia.

**sha256 del fichero en disco:**

```
a727532096782f97ad4e76a0f8dcc65a0a78122572a873335c4c3ca8dbba381b  /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8
```

---

## 3. HALLAZGO PRINCIPAL · LA TRAMPA DEL mtime ESTÁ VIVA (y se disparó hoy)

`ls` del directorio servido, ordenado por mtime:

| fichero | bytes | mtime | `#EXTINF` |
|---|---:|---|---:|
| `APE_LISTA_1793926685925.m3u8` | 624.735.959 | **2026-11-14 01:15:07** | **10.573** |
| `APE_LISTA_1793787155230.m3u8` | 626.066.815 | **2026-11-14 01:14:48** | **10.573** |
| `APE_LISTA_1794100720046.m3u8` **(la del operador)** | 1.311.467.322 | 2026-11-13 11:06:57 | **21.224** |

**Los dos valores enfrentados, literalmente:**

```
lista viva (operador):   21224 canales · 2026-11-13 11:06:57
lista "más nueva":       10573 canales · 2026-11-14 01:15:07     ← +14 h de mtime, −10.651 canales
```

Un consumidor que ordene por mtime elige la de **10.573**, no la de **21.224**. Y no es teórico: las
dos aparecieron **hoy a las 01:14:48 y 01:15:07**, media hora antes de esta medición.

### 3.1 Quién las crea, con su línea

`/opt/ape-pulse/ape-pulse-sync.sh`:

- `:70` y `:100` — `if [ "$size" -le 32 ] && [ -f "$src.gz" ]; then real="$src.gz"` — el handshake
  del Placeholder Trick: si el `.m3u8` de subida pesa ≤32 B, el contenido real es el `.gz`.
- `:114` — `rmtime=$(stat -c%Y "$real")` — toma el mtime **del `.gz` de origen** para el registro.
- El `.m3u8` que escribe en `pulse/` recibe el **mtime actual**, no el del origen. Ese es el
  mecanismo exacto: **una lista vieja re-escrita hoy parece más nueva que la viva**.

Prueba en el fichero de estado del propio sync, `.state/APE_LISTA_1793926685925.json`:

```json
{"base": "APE_LISTA_1793926685925",
 "src": "/var/www/lists/APE_LISTA_1793926685925.m3u8.gz", "src_size": 184295343,
 "src_mtime": 1793927211,          // 2026-11-06: el ORIGEN es viejo
 "channels": 10573,
 "out_bytes": 624735959,           // == el fichero decoy del §3
 "synced_at": "2026-11-14T01:15:07.504Z"}   // == su mtime actual
```

Origen del **6 de noviembre**, re-escrito el **14 de noviembre**. Confirmado.

### 3.2 Por qué la cadena no se rompió

Dos barreras, ninguna de ellas el orden de ficheros:

1. **`pickList()` prefiere el `l=` del wrapper** (§7). Es la que decide hoy.
2. **El guard fail-closed `MIN_RATIO 0.95`**: `ceil(21224 × 0.95) = 20.163`. Si el reconcile hubiera
   elegido una lista de 10.573 habría **abortado** (`10.573 < 20.163`) y **no habría publicado**.
   *Derivado del código y de los números medidos; no ejecutado.* El modo de fallo histórico no es
   "publica 10.573" sino **"nunca converge"** — que es lo que el propio helper documenta:
   *"El guard fail-closed aborta correctamente, pero nunca converge."*

El release `20261107051919-da1w` **sí** publicó 10.573 (source `APE_LISTA_1793926685925.m3u8`): es la
huella histórica del bug, cuando el mapa anterior aún era pequeño y el guard no lo frenó.

---

## 4. ESLABÓN 3 · el `l=` que el wrapper sirve DE VERDAD

```
tail -20000 /var/log/nginx/playlist_access.log | grep -o "l=APE_LISTA_[0-9]*" | sort | uniq -c
    467 l=APE_LISTA_1794100720046
```

- **467 peticiones, 1 solo id distinto.** Cero peticiones con otro `l=`. **Coincide con la URL del
  operador.**
- Forma real de la petición (credenciales del proveedor **enmascaradas** en este informe):

```
"GET /pulse/<canal>.m3u8?u=http%3A%2F%2F<proveedor>%2Flive%2F<user>%2F<pass>%2F<canal>.m3u8
     &d=<perfil>&p=P3&n=<nombre>&id=<canal>&s=<firma>&v=9.3.0&logo=<picon>&…&l=APE_LISTA_1794100720046"
```

El `l=` viaja en **cada URL de zap** que el wrapper emite; no es un registro aparte. `pulse.php:80`
lo documenta: *"[LISTA] Nombre de la lista que el player cargó (el envoltorio la manda en `l=`)"*.

---

## 5. ESLABÓN 4-5 · estado del JIT

`/opt/ape-jit/current` → `releases/20261113110710-hiox` (publicado 2026-11-13 11:07:10, **1 minuto
después** de la lista de 11:06:57).

```json
{"version":"20261113110710-hiox",
 "source":"/var/www/lists/pulse/APE_LISTA_1794100720046.m3u8",   ← el fichero del operador
 "size":1311467322,                    ← == tamaño en disco
 "mtimeMs":1794568017222.2986,         ← == mtime 11:06:57.222
 "channels":21224}                     ← == #EXTINF medidos
```

| Comprobación | Medido | Coincide |
|---|---|:--:|
| `source` == fichero del operador | sí, ruta exacta | **SÍ** |
| `size` == tamaño en disco | 1311467322 == 1311467322 | **SÍ** |
| `mtimeMs` == mtime del fichero | 1794568017222.2986 == `11:06:57.222298491` | **SÍ** |
| `channels` == `#EXTINF` de la lista | 21224 == 21224 | **SÍ** |
| `channels.json` claves | 21224 (mín `1`, máx `2196455`) | **SÍ** |

Histórico de releases (los cuatro con `meta.json`):

| release | source | channels | tamaño |
|---|---|---:|---:|
| `20261107051919-da1w` | `APE_LISTA_1793926685925.m3u8` | **10.573** | 624.693.667 |
| `20261108015052-r513` | `APE_LISTA_1794100720046.m3u8` | 21.224 | 1.311.381.927 |
| `20261113084531-qs40` | `APE_LISTA_1794100720046.m3u8` | 21.224 | 1.311.382.426 |
| `20261113110710-hiox` | `APE_LISTA_1794100720046.m3u8` | 21.224 | 1.311.467.322 |

---

## 6. ESLABÓN 6 · la allowlist cubre el MISMO conjunto

| Métrica | Lista del operador | Allowlist del JIT | Coincide |
|---|---:|---:|:--:|
| `#EXTINF` | 21.224 | 21.224 | **SÍ** |
| líneas con `tvg-id=` | 21.224 | 21.224 | **SÍ** |
| `sha256` del set ordenado-único de `tvg-id` | `8bf83667e8e9331c68ede171821b865a55b0cf18a9b256c75a842444ff34e979` | `8bf83667e8e9331c68ede171821b865a55b0cf18a9b256c75a842444ff34e979` | **IDÉNTICO** |

No es "mismo número de canales": es el **mismo conjunto**, con la misma huella. La allowlist
(`42.449` líneas = 21.224 × 2 + `#EXTM3U`) reescribe cada canal a
`https://iptv-ape.duckdns.org/jit/live/<tvg-id>/master.m3u8`, y el `tvg-id` es el id del proveedor
(p.ej. el último canal: `tvg-id="2196455"`), no un índice.

---

## 7. EL FIX: CONFIRMADO EN VIVO, AUSENTE EN EL REPO

### 7.1 Lo desplegado sí lo tiene

`/opt/ape-jit/reconcile.js` — **12.994 B**, `sha256 8591d03f100f2e2ef601861e3f9c8d174431644c5c95d64ff9cc900fbac31f07`,
mtime **2026-11-14T01:21:12**.

```js
function pickList() {
    // Preferencia 1: exactamente la lista que el wrapper esta sirviendo.
    const servida = listaServidaPorWrapper();
    if (servida) { const ruta = path.join(LIST_DIR, servida + '.m3u8');
      if (fs.existsSync(ruta)) { if (statSync(ruta).size > 0) {
          log(`LIST ${ruta} … MB (servida por wrapper)`); return ruta; } } }
    …
  function listaServidaPorWrapper() {           // lee los últimos 4 MB del log
    … matchAll(/[?&]l=(APE_LISTA_[0-9A-Za-z_.-]+)/g) …  return ids[ids.length - 1];
  }
  …
  // fallback: --list, o el .m3u8 de APE_LISTA_* con mtime MÁS NUEVO
  .filter(f => f.endsWith('.m3u8') && !f.endsWith('.gz') && f.startsWith('APE_LISTA_'))
  .sort((a, b) => b.m - a.m);
  return files[0].p;            // ← la trampa, todavía armada aquí
}
```

Backups que fechan la operación: `reconcile.js.bak_20261113T231447Z_picklista` (11.132 B, 2026-11-07)
y `reconcile.js.bak_20261114T012041Z_served` (11.562 B, 2026-11-13 23:14:47).

### 7.2 Prueba en el journal, minutos antes de esta medición

```
Nov 14 01:41:13  LIST /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8 1251 MB (servida por wrapper)
Nov 14 01:41:13  SKIP la lista no cambió (size+mtime iguales) · canales=21224
Nov 14 01:46:14  LIST /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8 1251 MB (servida por wrapper)
Nov 14 01:46:14  SKIP la lista no cambió (size+mtime iguales) · canales=21224
```

El timer corre **cada 5 minutos** (`ape-jit-reconcile.timer`, último 01:46:14, siguiente 01:51:14;
el service termina `inactive` porque es oneshot). Con las dos decoys de 10.573 en el directorio, el
reconcile sigue eligiendo la del operador **y lo dice en el log**. **El fix es real y está activo.**

**Matiz honesto:** el `1251 MB` del log es el tamaño redondeado (`1311467322/1048576 = 1250,7`), no
una discrepancia.

### 7.3 Lo que el repo tiene (y no es lo mismo)

| Fichero | Repo | VPS desplegado | ¿Igual? |
|---|---|---|---|
| `reconcile.js` | 11.132 B · `sha256 2b506fb67e3a9b9d8739212d6b83d0970006b25c8e0d2c967db5c6d7df825798` | 12.994 B · `sha256 8591d03f…1f07` | **NO** |
| `server.js` | 45.535 B · `sha256 8405f784…1fbae0` | `sha256 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492` | **NO** |

```
grep -n "listaServidaPorWrapper|playlist_access" IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/reconcile.js
→ sin resultados
```

El espejo del repo es la versión **anterior** al fix: pesa **11.132 B**, exactamente el mismo tamaño que el backup `.bak_20261113T231447Z_picklista` (no se ha comparado su sha256, así que la identidad se afirma por tamaño + ausencia del símbolo, no por hash). El
procedimiento de despliegue documentado en `vps/ape-jit/README.md` es `scp server.js reconcile.js
root@vps:/opt/ape-jit/` ⇒ **revertiría el fix y volvería a dejar el mtime como criterio único**.
El fix está versionado *como parche* en `tools/ops/ape-jit-served-list.sh`, no como fichero desplegable.

---

## 8. ESLABÓN 4 · endpoints PHP (código y coherencia)

| Endpoint | Código | Cuerpo (literal) | Coherencia |
|---|---:|---|---|
| `/prisma/api/pulse.php` (GET sin `u`) | **400** | `APE-PULSE: falta u` | **correcta**: falla cerrado con motivo explícito |
| `/api/netshield-sentinel.php` | **200** | `{"ok":false,"state":"NO_PRODUCER","reason":"ningun proceso escribe /dev/shm/netshield_sentinel.json",…,"last_cycle_at":null}` | **correcta y verificada**: `/dev/shm/netshield_sentinel.json` **no existe** (`ls` → No such file or directory). El endpoint no miente: declara que no hay productor. |
| `/prisma/api/channel-hdcp-bulk.php` | **200** | `{"ok":true,"default":"TYPE-1","umbral_vst_hdcp_fail_ms":3000,"channels":{},"count":0,"ts":1794620735}` | **correcta**: tabla vacía ⇒ sin overrides por canal; rige el `TYPE-1` por defecto |

Ninguno de los tres rompe la cadena de la lista. El segundo sí revela un hueco de operación
(**no hay productor del sentinel**), que se reporta como hallazgo aparte, no como incoherencia.

---

## 9. LO QUE NO SE MIDIÓ (y por qué)

| Item | Estado | Razón |
|---|---|---|
| Que el wrapper emita `l=` en *esta* respuesta concreta | **NO_COMPUTADO** | Se midió el `l=` en el **log** (467/467), no la emisión. Pedir una URL `/pulse/<id>` habría generado tráfico real al proveedor desde el VPS; queda fuera de "solo lectura". |
| Igualdad byte a byte de las URLs de la allowlist vs la lista | **NO_COMPUTADO** | Se comparó el **conjunto de `tvg-id`** (huella idéntica) y los recuentos; la allowlist reescribe las URLs por diseño, así que el texto no puede ser igual. |
| Qué decidió el sync a las 01:14:48/01:15:07 | **PARCIAL** | El `.state` del propio sync lo fecha (`synced_at 01:15:07.504Z`, `channels 10573`, `out_bytes 624735959`). No se capturó su stdout/journal. |
| Si el reconcile publicaría 10.573 con el fallback mtime | **DERIVADO, no ejecutado** | `ceil(21224×0.95)=20.163 > 10.573` ⇒ abortaría por `MIN_RATIO`. No se forzó la condición. |
| Contenido exacto de la lista en el momento de la medición vs el `sha256` de `meta.json` | **NO_COMPUTADO** | `meta.json` **no guarda** sha256 de la lista (solo size+mtime). El sha256 medido (`a7275320…381b`) no tiene contraparte en el JIT. |
| Estado de `wg0`/`eth0` | **NO MEDIDO** | Fuera de alcance por regla explícita. |

---

## 10. REPRODUCCIÓN (comandos ejecutados, todos de lectura)

```bash
ssh hetzner-iptv 'ls -la --time-style=+%Y-%m-%dT%H:%M:%S /var/www/lists/pulse/'
ssh hetzner-iptv 'sha256sum /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8'
ssh hetzner-iptv 'wc -l …; grep -c "^#EXTINF" …; stat -c "%s %y %i" …'
ssh hetzner-iptv 'curl -sS -I --resolve iptv-ape.duckdns.org:443:127.0.0.1 https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8'
ssh hetzner-iptv 'curl -sS --range 0-63 --resolve … | od -c'
ssh hetzner-iptv 'tail -20000 /var/log/nginx/playlist_access.log | grep -o "l=APE_LISTA_[0-9]*" | sort | uniq -c'
ssh hetzner-iptv 'cat /opt/ape-jit/current/meta.json; python3 -c "…channels.json…"'
ssh hetzner-iptv 'grep -o "tvg-id=\"[^\"]*\"" LISTA | LC_ALL=C sort -u | sha256sum'      # 8bf83667…
ssh hetzner-iptv 'grep -o "tvg-id=\"[^\"]*\"" ALLOWLIST | LC_ALL=C sort -u | sha256sum'  # 8bf83667… (idéntico)
ssh hetzner-iptv 'journalctl -u ape-jit-reconcile.service -n 12 --no-pager'
ssh hetzner-iptv 'sed -n "50,110p" /opt/ape-jit/reconcile.js'
```

---

## 11. RESUMEN PARA EL CAPITÁN

- **La cadena está coherente**: URL = disco = `meta.json` = `channels.json` = allowlist, con el
  **mismo set de 21.224 canales** (huella `8bf83667…` en ambos extremos).
- **Tu hallazgo se CONFIRMA**: el sync re-estampa listas viejas con mtime nuevo y hay dos decoys de
  **10.573** canales con mtime **14 h más nuevo** que la viva. Se disparó **hoy a las 01:14:48 y
  01:15:07**.
- **Tu arreglo también se CONFIRMA y está vivo**: el reconcile de 01:41 y 01:46 elige la lista del
  operador por el `l=` del wrapper (`(servida por wrapper)`) y cuenta 21.224.
- **Dos cosas que hay que cerrar antes de dar esto por terminado:**
  1. **El repo no tiene el fix.** `vps/ape-jit/reconcile.js` es la versión anterior; un redeploy desde
     el espejo revierte el arreglo. Hay que llevar el `reconcile.js` de 12.994 B al repo con su
     sha256.
  2. **El fallback por mtime sigue armado** y las dos decoys siguen en `pulse/`. Mientras existan,
     cualquier consumidor que no sea este `pickList` (o una versión futura, o un humano) ve una lista
     de 10.573 como "la más nueva".
