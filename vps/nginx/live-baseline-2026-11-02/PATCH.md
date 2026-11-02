# Parche del HTTP 206 sobre `/etc/nginx/sites-enabled/default`

**Fecha:** 2026-11-02 · **Estado:** PREPARADO, **NO desplegado**.
**Método:** todo obtenido por sonda read-only vía GitHub Actions. **Cero escrituras en el VPS.**

---

## 1 · Cadena de evidencia (y dos diagnósticos equivocados míos)

| Intento | Qué leí | Veredicto |
|---|---|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/backend/nginx-production.conf` | ❌ no es la config viva |
| 2 | `/etc/nginx/sites-available/default` (13.916 B) | ❌ **no es** `/etc/nginx/sites-enabled/default` (8.071 B, archivo regular, no symlink) |
| 3 | `nginx -T` mergeado → bloque `location ~* \.m3u8$` | ✅ **esta sí es la que corre** |

El `sites-enabled/default` vivo **no es un symlink** a `sites-available/default`: son dos archivos distintos.
Por eso los dos primeros diagnósticos fueron sobre texto que nunca se ejecutó.

## 2 · Causa raíz confirmada

```nginx
location ~* \.m3u8$ {
    gzip_static always;                     # sirve el .gz aunque no se pida
    gunzip on;                              # descomprime al vuelo → rompe byte-ranges
    gzip_vary on;
    ...
    add_header Accept-Ranges bytes always;  # ← anuncia Range que gunzip no puede cumplir
    add_header Vary "*" always;
    try_files $uri =404;
}
```

`ngx_http_gunzip_filter_module` **no soporta peticiones Range**: al descomprimir en streaming no hay
`Content-Length` ni offsets de bytes, así que nginx responde `200` con el cuerpo completo. La cabecera
`Accept-Ranges: bytes` es una promesa que el módulo no puede sostener.

**Corroboración por cabeceras medidas** (coinciden una a una con este bloque): `Vary: *`,
`Cache-Control: no-cache, no-store, must-revalidate, private, max-age=0`, `Pragma: no-cache`,
`Expires: 0`, `ETag: W/"6ae800ab-adc7e4f"`, y el `Access-Control-Expose-Headers` explícito
(no el `*` del otro sitio).

## 3 · El parche — 2 líneas

```diff
-        gzip_static always;
+        gzip_static on;

-        gunzip on;
+        gunzip off;
```

`add_header Accept-Ranges bytes always;` **se queda**: con `gunzip off` pasa a ser verdad.

### Por qué funciona

- Cliente **sin** `Accept-Encoding: gzip` (VLC, OTT Navigator, la mayoría de players con una playlist):
  nginx sirve `$uri` plano por el módulo estático → `Content-Length` → **Range → 206**.
- Cliente **con** gzip (navegadores): recibe `$uri.gz` comprimido. Sin 206, pero tampoco lo necesita.

## 4 · GATE MEDIDO — el parche de 2 líneas es INCORRECTO y queda retirado

Medición del 2026-11-02 (run 41465926828, read-only):

```
6c8e507f4bf555089b581ddf5a261bfbb1c27dacb84c676d60ccc227dcd7764f  /etc/nginx/sites-enabled/default
```
→ **coincide exactamente** con el archivo reconstruido en este directorio. La recuperación byte-exacta
queda **verificada por hash**, no solo por tamaño.

Pero el resto del gate tumba el parche:

```
-rw-r--r-- 1 www-data www-data          8 Nov  2 03:17 .../APE_LISTA_1793589060441.m3u8
-rw-r--r-- 1 www-data www-data 182222415 Nov 2 03:16 .../APE_LISTA_1793589060441.m3u8.gz
```

**El `.m3u8` plano son 8 BYTES.** Es un stub marcador; la lista real vive **solo** en el `.gz`
de 182.222.415 B. Con `gunzip off`, un cliente que no pida gzip recibiría esos 8 bytes y
**la lista se rompería**. El parche `gunzip off` queda **RETIRADO**.

Y el mismo gate corrige otra creencia mía — **el 206 ya funciona**, pero solo para quien pide gzip:

| Petición | Resultado medido |
|---|---|
| `Range: bytes=0-1023` (como un player) | **200**, cuerpo completo, sin `Content-Range` |
| `Range: bytes=0-1023` + `Accept-Encoding: gzip` | **206**, `Content-Range: bytes 0-1023/182222415`, `Content-Length: 1024` |

O sea: `gzip_static always` sirve el `.gz` y el módulo estático **sí respeta el rango sobre el
comprimido**; `gunzip on` es el que lo rompe cuando el cliente no acepta gzip. El culpable es
`gunzip`, pero la cura no es apagarlo: es que exista contenido plano real.

### Las dos salidas honestas

| Ruta | Qué exige | Coste |
|---|---|---|
| **A · descomprimir a disco** | `gunzip -k` del `.gz` → 604 MB planos; luego `gunzip off` | **escritura de 604 MB en el VPS** → autorización explícita |
| **B · dejar de mentir** | quitar `add_header Accept-Ranges bytes always` o condicionarlo | honesto; **no da 206** a quien no pide gzip, pero deja de prometerlo |
| **C · forzar gzip** | que el cliente mande `Accept-Encoding: gzip` | no está en nuestra mano: lo decide el player |

**Ninguna se aplica sin tu decisión.** A es la única que cumple el requisito 200/206/302 para todos.

## 5 · Prerrequisito que hay que verificar antes de aplicar

`gunzip off` exige que **exista el archivo plano real**. Hoy no existe: son 8 bytes.

Verificación ya hecha (read-only):

```bash
ls -l /var/www/html/lists/APE_LISTA_1793589060441.m3u8      # 8 B  ← stub, NO la lista
ls -l /var/www/html/lists/APE_LISTA_1793589060441.m3u8.gz   # 182.222.415 B ← la lista real
```

- Ruta **A**: `gunzip -k` sobre el `.gz` (escritura) y solo después `gunzip off`.
- Sin ese paso, `gunzip off` **rompe la lista**.

## 6 · Rollback

```bash
cp -a /etc/nginx/sites-enabled/default /root/backup-default-20261102.conf   # antes
# revertir: cp -a /root/backup-default-20261102.conf /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Si `nginx -t` falla, **no recargar**: restaurar el backup y volver.

## 7 · Lo que este parche NO arregla

- **No toca el audio**: el throughpass es asunto de la lista, no de nginx.
- **No mejora píxeles**: eso es VPP/ARA.
- **No cambia el contenido servido** (en la ruta A sí cambia el framing del transporte).

## 8 · Artefactos

| Archivo | Qué es |
|---|---|
| `sites-enabled-default.conf` | archivo vivo **byte-exacto**, 8.071 B, sha256 `6c8e507f…764f` — **verificado contra el VPS** |
| `sites-enabled-default.PATCHED.conf` | parche `gunzip off` — **RETIRADO**, se conserva solo como evidencia del análisis |

## 9 · Lo que falta para desplegar

1. Tu decisión entre la ruta **A** (descomprimir, escritura) o **B** (dejar de anunciar Range).
2. Añadir el target al `vps_deploy_map.json` (hoy **ningún** target mapea a este archivo).
3. Desplegar por GitHub Actions con backup + `nginx -t` + rollback.

