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

## 4 · Prerrequisito que hay que verificar antes de aplicar

`gunzip off` exige que **exista el archivo plano**. Si en disco solo está el `.gz`,
`try_files $uri =404` devolverá **404** y se rompe la lista.

Verificación pendiente (read-only):

```bash
ls -l /var/www/html/lists/APE_LISTA_1793589060441.m3u8 \
      /var/www/html/lists/APE_LISTA_1793589060441.m3u8.gz
```

- Si el plano existe → aplicar el parche tal cual.
- Si **no** existe → hay que descomprimirlo primero (`gunzip -k`), y eso **sí es una escritura**
  que requiere autorización explícita del operador.

## 5 · Rollback

```bash
cp -a /etc/nginx/sites-enabled/default /root/backup-default-20261102.conf   # antes
# revertir: cp -a /root/backup-default-20261102.conf /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Si `nginx -t` falla, **no recargar**: restaurar el backup y volver.

## 6 · Lo que este parche NO arregla

- **No toca el audio**: el throughpass es asunto de la lista, no de nginx.
- **No mejora píxeles**: eso es VPP/ARA.
- **No cambia el contenido servido**: mismos bytes, solo cambia el framing del transporte.

## 7 · Artefactos

| Archivo | Qué es |
|---|---|
| `sites-enabled-default.conf` | archivo vivo **byte-exacto**, 8.071 B, sha256 `6c8e507f4bf555089b581ddf5a261bfbb1c27dacb84c676d60ccc227dcd7764f` |
| `sites-enabled-default.PATCHED.conf` | parcheado, 8.067 B, sha256 `7c86a04475be846430588ddf224ea74f5b149e12706ba54edeb0cf5cd920d74d` |

**Límite honesto:** el byte-count coincide exacto con el del VPS (8.071), pero **el hash no está
verificado contra el remoto**, porque la sonda no hasheó `sites-enabled/default` (hasheó
`sites-available/default`). Antes de aplicar hay que confirmar ese sha256 en el VPS.

## 8 · Lo que falta para desplegar

1. Confirmar el sha256 de `/etc/nginx/sites-enabled/default` en el VPS.
2. Confirmar que existe el `.m3u8` plano.
3. Añadir el target al `vps_deploy_map.json` (hoy **ningún** target mapea a este archivo).
4. Desplegar por GitHub Actions con backup + `nginx -t` + rollback.
