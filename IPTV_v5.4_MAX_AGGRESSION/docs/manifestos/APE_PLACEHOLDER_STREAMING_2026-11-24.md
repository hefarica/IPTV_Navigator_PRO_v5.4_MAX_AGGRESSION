# APE PLACEHOLDER STREAMING — subida de `.m3u8.gz` y publicación rápida

**Fecha:** 2026-11-24 · **VPS:** Hetzner 178.156.147.234 (`iptv-ape.duckdns.org`)  
**Origen:** `C:\Users\HFRC\Downloads\APE_LISTA_1795544073200_CDN.m3u8.gz`  
**Destino:** `https://iptv-ape.duckdns.org/lists/APE_LISTA_1795544073200_CDN.m3u8`

---

## 1. Síntoma reportado

La UI servida en `127.0.0.1:5500` rechazaba el archivo con:

> ⚠️ Por favor selecciona un archivo .m3u8 o .m3u

El archivo real es una lista **ya comprimida** (`.m3u8.gz`, 494.761.954 B). El selector sólo
admitía `.m3u8`/`.m3u`, así que el operador no podía ni seleccionarla.

---

## 2. Activo medido (sin suposiciones)

| Dato | Valor medido |
|---|---|
| Fichero | `APE_LISTA_1795544073200_CDN.m3u8.gz` |
| Bytes comprimidos | **494.761.954** |
| Bytes descomprimidos | **1.848.814.697** |
| SHA-256 | **`706fde1394e6e95cb2bfbd06bc52564ca17ba718d3d8c92bcdebfda5dbf22d7c`** |
| `gzip -t` | **OK** (completo, 11,4 s en local) |
| `#EXT-X-APE-CHANNELS` declarados | **28.655** |
| `#EXTINF:` reales | **28.655** (coinciden) |
| Cabecera | `#EXTM3U x-tvg-url=… refresh="1800"`, `#EXT-X-VERSION:9`, 18 bloques `#EXT-X-APE-LAB-METADATA` |

---

## 3. Causas raíz (medidas, no inferidas)

| ID | Archivo / sistema | Causa | Evidencia |
|---|---|---|---|
| C1 | `frontend/js/gateway-manager.js` → `_handleManualFileSelect` | allowlist `['.m3u8','.m3u']`; cualquier `.gz` cae en el `alert` | captura del operador; línea antigua 532-538 |
| C2 | `frontend/js/resumable-uploader-v2.js` + `gateway-manager.js` | el botón enviaba a `/api/upload/init` (Rust). En producción **`/api/upload/*` = 404**; los endpoints vivos son PHP | `curl https://iptv-ape.duckdns.org/api/upload/init` → **404**; `/upload_chunk.php` → **405** (existe), `/finalize_upload.php` → **400** (existe) |
| C3 | `/etc/nginx/snippets/url2-cartridge.conf` (handler real de `/lists/`) | `gzip_static on; gunzip off;`. Con un `.m3u8` placeholder, un cliente **sin** `Accept-Encoding: gzip` recibía **8 B** | self-test antes: `Content-Length: 8` sin AE; después: `264 B` chunked con el payload completo |
| C4 | `vps/_deployed_mirror/finalize_upload.php` (live) | si el nombre es `.m3u8.gz`, el regex `\.(m3u8|m3u)$` **añade** `.m3u8` y luego `gzip -1` recomprime el gz → `…gz.m3u8` + gzip-de-gzip | líneas 45-47 y 120-138 del fichero live |
| C5 | `frontend/js/gateway-turbo-upload.js` → `autoFreeSpace` | borraba automáticamente listas antiguas del operador si faltaba disco | líneas 156-211; viola no-delete |
| C6 | `/opt/ape-pulse/ape-pulse-sync.sh` | un `.m3u8` de **≤32 B** con `.gz` se considera placeholder y se envuelve en `pulse/<base>.m3u8` (~1,85 GB). Esa envuelta gana en `try_files` y sirve 1,85 GB **también a clientes gzip** | código live: `if [ "$size" -le 32 ] …`; `APE_LISTA_1795386953484_DIRECTA.m3u8` medido: `Content-Length: 1462141581` con y sin gzip |

**Conclusión:** el fallo no era uno. Eran cinco capas: selector, transporte muerto, edge sin fallback
legacy, finalize que recomprime un gz, y un sincronizador que materializa placeholders de 8 B.

---

## 4. Cambios implementados

### 4.1 Nuevo endpoint `vps/ape_publish.php` (desplegado en `/var/www/html/ape_publish.php`)

Publica un upload troceado (de `upload_chunk.php`) con gates fail-closed:

1. `upload_id` válido + directorio de chunks existente.
2. Chunks **completos y contiguos** (`000000.part … N-1`); rechaza huecos.
3. `expected_size` == bytes ensamblados.
4. `expected_sha256` (opcional) == SHA-256 del ensamblado.
5. `gzip -t` completo (CRC) si el payload es gz.
6. `#EXT-X-APE-CHANNELS` declarado == `#EXTINF:` reales; si no, **no publica**.
7. Guard de disco antes de ensamblar (payload + salida + 128 MiB).
8. `rename()` atómico: nunca existe un `.m3u8` público sin su `.gz` válido.

Dos modos:

- **precompressed**: el `.gz` se publica **byte a byte** (sin recomprimir). `sha256` calculado al ensamblar.
- **raw**: el `.m3u8` plano se comprime **una sola vez** con `gzip -9` en el servidor.

Salida por cada lista:

```
<base>.m3u8      placeholder 33..2048 B con metadata honesta del payload
<base>.m3u8.gz   payload real
```

El placeholder es **348 B** para esta lista (no 8 B) **a propósito**: `ape-pulse-sync.sh` salta
fuentes `<=2048 B`, así no materializa 1,85 GB y no mata la vía rápida. Es metadata verdadera
(bytes, sha256, canales, ruta del payload), no una lista reproducible.

### 4.2 Nuevo `frontend/js/ape-publisher.js`

- Detecta el **contenido real** por magia gzip (`1F 8B`), no por la extensión.
- Sube chunks de 16 MiB con **SHA-256 por chunk** (lo verifica `upload_chunk.php`) y 4 workers.
- Reintentos con backoff (5) + timeout por chunk.
- **Reanudación**: `upload_id` persistido en `localStorage`; consulta `upload_status.php` y salta chunks ya recibidos.
- No comprime en el navegador (evita gzip-de-gzip).
- Si el POST de publish se corta, consulta `list_files.php` antes de declarar fallo.
- `probeGz()` lee sólo el prefijo (≤4 MiB) para mostrar canales declarados sin cargar 1,8 GB.

### 4.3 `frontend/js/gateway-manager.js`

- El selector acepta `.m3u8`, `.m3u`, `.m3u8.gz`, `.m3u.gz`, `.gz`.
- Al elegir un gz: no llama `file.text()` (evita decodificar 472 MB como UTF-8); sonda la cabecera.
- `upload()` usa `APEPublisher` para archivos manuales y para listas generadas.
- Mensaje de éxito muestra URL, payload `.gz`, tamaño, canales declarados/reales, SHA-256 y modo de serving.

### 4.4 `frontend/js/gateway-turbo-upload.js`

- El botón **Subida Turbo** delega en el mismo pipeline (antes recomprimía y finalizaba mal).
- `autoFreeSpace` **ya no borra listas**; sólo purga chunks y falla con mensaje claro si falta disco.

### 4.5 `frontend/index-v4.html`

- Carga `js/ape-publisher.js` antes de `gateway-manager.js`; cache-busting `?v=20261124*`.

### 4.6 Edge nginx (live + copia en repo)

`/etc/nginx/snippets/url2-cartridge.conf` (handler real de `/lists/` y `/pulse-lists/`):

```nginx
gzip_static always;   # antes: on
gzip off;
gunzip on;            # antes: ausente/off
```

`/etc/nginx/sites-enabled/default` (location `~* \.m3u8$`) alineado igual.

Resultado medido con un self-test:

| Cliente | Antes | Después |
|---|---|---|
| `Accept-Encoding: gzip` | `.gz` correcto | `.gz` correcto (`Content-Encoding: gzip`) |
| sin `Accept-Encoding` | **8 B** (placeholder) | **payload completo**, `Transfer-Encoding: chunked` (gunzip streaming) |

---

## 5. Verificación

### 5.1 E2E real (2026-11-24 19:35 UTC, Node 24 → VPS)

| Check | Resultado |
|---|---|
| Chunks | **30 × 16 MiB**, concurrencia 4, 134 s de subida (3,5 MB/s), 169 s total |
| SHA-256 publicado | **`706fde13…22d7c`** == SHA local (byte-idéntico) |
| `size_gz` | **494.761.954** == local |
| `size_bytes` | **1.848.814.697** (`gzip -l`) |
| Canales declarados / reales | **28.655 / 28.655** (`channels_match: true`) |
| `gzip -t` en servidor | **OK** |
| Placeholder | **348 B** (`rich_anti_wrap_33_2048`) |
| Chunks tras publicar | directorio **vacío** |
| Edge con `Accept-Encoding: gzip` | `HTTP/2 200`, `content-encoding: gzip`, `content-length: 494761954` |
| Edge legacy (sin AE) | `HTTP/2 200`, payload completo; primeros bytes `#EXTM3U x-tvg-url=…` |
| Canales contados **a través del edge** (descomprimido) | **28.655** (`grep -c '^#EXTINF:'`) |
| `#EXT-X-APE-LAB-METADATA` en cabecera servida | **presente** |
| `pulse-sync --only` | **skipped=1**, `NO_WRAPPER_OK` (no materializa 1,85 GB) |
| Alias SHIELDED | hardlink (0 B extra), mismo SHA, 357 B de placeholder, edge OK |
| Disco tras publicar | **7,5 GB libres (80 %)** |

Salida resumida del E2E:

```json
{
  "public_url": "https://iptv-ape.duckdns.org/lists/APE_LISTA_1795544073200_CDN.m3u8",
  "gz_url": "https://iptv-ape.duckdns.org/lists/APE_LISTA_1795544073200_CDN.m3u8.gz",
  "placeholder_bytes": 348,
  "size_gz": 494761954,
  "size_bytes": 1848814697,
  "channels_declared": 28655,
  "channels_actual": 28655,
  "channels_match": true,
  "gzip_ok": true,
  "sha256_gz": "706fde1394e6e95cb2bfbd06bc52564ca17ba718d3d8c92bcdebfda5dbf22d7c"
}
```

### 5.2 Tests locales ejecutados

```bash
node -c frontend/js/ape-publisher.js          # OK
node -c frontend/js/gateway-manager.js        # OK
node -c frontend/js/gateway-turbo-upload.js   # OK
node frontend/tests/ape-publisher.unit.test.js  # 4 PASS (nombres, gz, plano, magia)
php -l /var/www/html/ape_publish.php          # No syntax errors
nginx -t                                       # syntax is ok / test is successful
```

---

## 6. Rollback

```bash
B=/root/ape_publish_deploy_20261124T192159Z
cp -a "$B/url2-cartridge.conf.orig" /etc/nginx/snippets/url2-cartridge.conf
cp -a "$B/default.nginx"             /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
rm -f /var/www/html/ape_publish.php
```

Opcional (sólo si se quiere retirar la lista publicada):

```bash
rm -f /var/www/lists/APE_LISTA_1795544073200_CDN.m3u8 \
      /var/www/lists/APE_LISTA_1795544073200_CDN.m3u8.gz
```

Frontend: revertir los cuatro archivos JS/HTML al commit anterior (los cambios están aislados).

---

## 7. Límites honestos

- El payload gzip pesa **472 MB**: un cliente gzip descarga 472 MB; un cliente legacy recibe
  **1,85 GB descomprimidos en streaming**. La “velocidad” es del edge (cero recompresión), no del tamaño.
- Esta lista **no** se envuelve con `/pulse` (por diseño, para conservar la vía rápida y no
  materializar 1,85 GB). Consecuencia: no genera telemetría/zapping beacon por canal. Si se quiere,
  hay que crear la envuelta y su `.gz` (≈1,85 GB + ≈440 MB) o aceptar la ruta lenta.
- El `.m3u8` público es un **placeholder de 348 B**; no es una lista reproducible por sí mismo.
  El edge sirve `.m3u8.gz` (gzip) o su descompresión streaming (legacy).
- `Cache-Control: no-store` en `/lists/`; cada recarga del player descarga de nuevo.
- El VPS estaba al **94 %** de disco al empezar; el timer `pulse-sync` purgó envueltas huérfanas y quedó
  en **≈79 %** (7,6 GB libres) antes de publicar. La publicación añade 472 MB.
- No se tocó ninguna URL de canal: el payload se publica **verbatim** (el SHA lo demuestra).

