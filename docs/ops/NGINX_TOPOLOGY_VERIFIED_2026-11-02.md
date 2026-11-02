# Topología REAL y verificada de nginx en el VPS — 2026-11-02

**Sustituye** a `docs/ops/NGINX_LISTS_TOPOLOGY_2026-11-02.md` en todo lo que difiera.
**Fuente:** inventario read-only que **por fin llega al VPS** (commit `8c228ff2`), más las sondas
`ssh` explícitas. Host confirmado: `ubuntu-2gb-ash-1`, kernel `6.8.0-124-generic`.

---

## 1 · Por qué las lecturas anteriores estaban mal

`inventory.sh` **no contiene ni un `ssh`**: su helper es `run(){ printf ...; eval "$@"; }`. El workflow
lo lanzaba con `bash "$DEPLOY_DIR/inventory.sh"` **en el runner**. Prueba literal de la propia salida:

```
hostname → runnervmnwato
uname -a → Linux runnervmnwato 7.0.0-1017-azure
ps       → Runner.Worker
```

Todo el job `inventory` describía la máquina de CI, no el servidor. Corregido en `8c228ff2`:
`ssh "$TARGET" 'bash -s' < inventory.sh`.

## 2 · Correcciones que esto obliga

| Afirmé | Realidad medida |
|---|---|
| VPS con nginx **1.28.3** | **1.24.0** (`nginx-1.24.0-2ubuntu7.19`). 1.28.3 era del runner |
| `nginx -t` **falla** | **`test is successful`**, exit 0 |
| `/etc/nginx/conf.d/` **vacío** | **10 archivos** en el VPS |
| El repo tiene la config viva | La tiene **en `sites-available`, sin activar** (ver §4) |

## 3 · El bloque que sirve la lista (verificado por hash)

```
6c8e507f4bf555089b581ddf5a261bfbb1c27dacb84c676d60ccc227dcd7764f  /etc/nginx/sites-enabled/default
```

**Idéntico** al archivo reconstruido en este repo (`vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf`,
8.071 B). La reconstrucción desde `nginx -T` es byte-exacta, ahora **confirmada contra el propio VPS**.

```nginx
location ~* \.m3u8$ {
    default_type application/vnd.apple.mpegurl;
    types { application/vnd.apple.mpegurl m3u8; }
    gzip_static always;                    # sirve el .gz aunque no se pida
    gunzip on;                             # descomprime al vuelo → rompe byte-ranges
    gzip_vary on;
    ...
    add_header Accept-Ranges bytes always; # ← anuncia lo que gunzip no puede cumplir
    add_header Vary "*" always;
    try_files $uri =404;
}
```

`--with-http_gunzip_module` y `--with-http_gzip_static_module` presentes en `nginx -V`: no es una
suposición, están compilados.

## 4 · El hallazgo que ordena todo

```
91c15c5f13b6212f12cbf31d77c2f142a0a397f93c495460a6d5a98f6b9d559e  /etc/nginx/sites-available/iptv-ape.conf
```

Ese hash **es exactamente** `IPTV_v5.4_MAX_AGGRESSION/backend/nginx-production.conf` del repo.

> **El archivo del repo SÍ está desplegado en el VPS — pero dormido en `sites-available/` y NO enlazado
> en `sites-enabled/`.** Por eso llevaba toda la sesión diagnosticando sobre él sin efecto: es un
> candidato desactivado, no la configuración que atiende.

`nginx.conf` incluye `include /etc/nginx/sites-enabled/*;` y solo hay dos sitios activos:
`coa-navigator` (`85dfc864…`) y `default` (`6c8e507f…`).

## 5 · Otros archivos que existen y NO se sirven

En `sites-available/`: `hls-max.conf`, `nginx-hls-max.conf`, `iptv-ape` (sin extensión), `iptv-ape.duckdns.org`,
`iptv-stealth`, `m3u8`, `upload_cors.conf`, y cinco `.bak`/`.disabled`/`.backup`.
**Todos inertes.** Tres hashes distintos de "iptv-ape" conviviendo es deuda de configuración.

## 6 · Estado del HTTP medido contra la URL pública

| Petición | Resultado |
|---|---|
| GET / HEAD | **200** |
| `Range` sin `Accept-Encoding` | 200 chunked, **sin** `Content-Range` |
| `Range` + `Accept-Encoding: gzip` | **206** · `Content-Range: bytes 0-1023/182222415` · `Content-Length: 1024` |
| Redirección del origen | **302** |

Matriz por las 4 listas publicadas: `LIST_HTTP_MATRIX.md`.

## 7 · Camino de arreglo, ya sin incógnitas

| Mitad | Cambio | Coste |
|---|---|---|
| **Gratis** | `gzip off;` dentro de `location ~* \.m3u8$` del archivo **vivo** | 1 línea, **cero bytes de datos** |
| **Costosa** | descomprimir el `.gz` a plano real + `gunzip off` | ~604 MB escritos |

El parche de la mitad gratis está escrito contra el archivo vivo exacto:
`sites-enabled-default.PATCHED-gzipoff.conf` (`04023afd…916d`, 8.197 B).

**Ninguna de las dos se aplica sin autorización explícita del operador.**

## 8 · Cómo se verifica todo esto de nuevo

```bash
gh workflow run deploy-vps.yml --ref feat/adb-generic-visual-enhancement-installer -f mode=dry-run
# job 1 debe imprimir: hostname → ubuntu-2gb-ash-1   (si dice runnervmnwato, el fix se perdió)
```
