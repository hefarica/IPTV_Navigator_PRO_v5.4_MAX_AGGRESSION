# Deploy plan — ARA continuidad (post I17)

**Estado:** `APLICA_PENDING`. **No se ha desplegado nada.** Este plan se ejecuta solo tras la respuesta literal `APLICA`.

## 0. Rutas resueltas (read-only, 2026-10-31)

| Repo | Destino real | Hash vivo | Acción |
|---|---|---|---|
| `vps/prisma/api/events-sse.php` | `/var/www/html/prisma/api/events-sse.php` | `1edacfdb...` | reemplazar |
| `ara-x/vps/crystal/state.php` | `/var/www/ara/state.php` | `55190a3d...` | reemplazar |
| `ara-x/vps/crystal/state_bridge.php` | `/var/www/ara/state_bridge.php` | ausente | crear |
| `vps/ape_hls_generators.php` | `/var/www/html/ape_hls_generators.php` | `2ac91322...` | reemplazar |
| `vps/cmaf_worker.php` | `/var/www/html/cmaf_worker.php` | `842ef139...` | reemplazar |
| `vps/nginx/lua/lab_config.lua` | no existe en `/etc/nginx` | — | **no desplegar** |
| `vps_configs/autopista-trap.conf` | no es config activa | — | **no desplegar** |
| `backend/resolve_quality_unified.php` | no está en ruta del proxy | — | **no desplegar sin mapeo** |

`/ara/state` usa `fastcgi_param SCRIPT_FILENAME /var/www/ara/state.php;` en
`/etc/nginx/snippets/ara-state.conf`. `/ara/sse` y `/ara/events` usan PHP 8.3.
`conviva.db` existe en `/opt/netshield/data/conviva.db` con dueño `www-data`.

## 1. Preflight obligatorio (read-only)

```bash
# en VPS
nginx -t
php -v
php -m | grep -E 'pdo_sqlite|sqlite3|json'
ls -l /var/www/html/ /opt/netshield/data/ 2>/dev/null
```

Si una ruta no coincide, se detiene el deploy y se reporta; no se adivina.

## 2. Backup

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/ara_backup_$STAMP
# copiar cada archivo destino existente a /root/ara_backup_$STAMP/
# copiar nginx -T > /root/ara_backup_$STAMP/nginx-T.conf
```

Rollback = restaurar desde `/root/ara_backup_$STAMP/` y `nginx -t && nginx -s reload`.

## 3. Orden de aplicación

### Grupo A — PHP (sin nginx)

1. `ape_cursor.php`, `ape_window.php`, `ape_resume.php`, `ape_cmaf_bootstrap.php`, `ape_hls_state.php`, `ape_hls_timing.php`, `ape_ara_state.php`, `ape_sse_commands.php`
2. `events-sse.php`
3. `state_bridge.php`, `state.php`

Validación por archivo: `php -l`. Luego:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ara/events
# esperado 401 sin token
```

### Grupo B — generador / worker / Lua

1. `vps/ape_hls_generators.php`
2. `vps/cmaf_worker.php`
3. `vps/nginx/lua/lab_config.lua`

Validación: `php -l`, `luac -p`.

### Grupo C — nginx

Solo si el archivo destino es la config activa:

```bash
nginx -t
# si falla: restaurar backup y NO reload
nginx -s reload
curl -s -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ara/sse
# esperado 401 sin token
```

`vps_configs/autopista-trap.conf` **no es** la config viva (A14/I10); no se instala a ciegas.

### Grupo D — frontend

`headers-contract.js`, `headers-matrix-v9.js`, `index-v4.html`: publicar solo en el docroot real; no toca data-plane.

### Grupo E — Android

El APK se compila e instala en el ONN por ADB autorizado; no se sube al VPS. Requiere consentimiento de MediaProjection.

## 4. Verificación de continuidad

```bash
# dos clientes, mismo canal, corte forzado
# 1) cliente A consume hasta seq N
# 2) borrar/reiniciar worker
# 3) cliente B debe recibir seq N+1, no N
```

Evidencia mínima: manifiesto con `#EXT-X-MEDIA-SEQUENCE`, `#EXT-X-DISCONTINUITY`, `#EXT-X-PROGRAM-DATE-TIME`; cursor `last_delivered=N`; primer segmento `N+1`.

## 5. Rollback

```bash
cp -a /root/ara_backup_$STAMP/* <destinos>
nginx -t && nginx -s reload
```

## 6. Bloqueos conocidos

- **A05:** latencia real no medida; no se declara cerrada.
- **G16:** 4 rendiciones reales requieren 3 encodes; no se midió CPU/throughput.
- **state.php:** el bridge escribe en `CONVIVA_DB_PATH` o `/opt/netshield/data/conviva.db`; verificar permisos de `www-data`.
- **`backend/resolve_quality_unified.php`:** no está en la ruta del proxy (A07); no se despliega sin mapear su ruta real.

## 7. Criterio de aborto

Se aborta y rollback si:

- `nginx -t` falla;
- `/ara/sse` o `/ara/events` no devuelven 401 sin token;
- el manifiesto no emite `MEDIA-SEQUENCE`;
- el segundo cliente recibe seq ≤ N;
- php-fpm/log muestra error 500 sostenido.
