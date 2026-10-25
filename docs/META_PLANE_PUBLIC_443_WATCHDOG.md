# Exposición del plano en 443 + watchdog 24/7

> Ejecutado y verificado **2026-10-24 16:29 UTC**.
> Backup del vhost: `/root/ape-443-backup-20261024T162907Z/`.
> Rollback: `bash /root/ape-meta-plane-20261024/scripts/unexpose-443.sh`.

## 1. Qué se hizo

| # | Cambio | Ruta |
|---|---|---|
| 1 | Snippet con las locations públicas | `/etc/nginx/snippets/ape-meta-public.conf` |
| 2 | Allowlist anti-SSRF | `/etc/nginx/ape-hosts-allow.txt` |
| 3 | **Una** línea `include` dentro del `server 443` existente | `/etc/nginx/sites-enabled/default` |
| 4 | Watchdog 24/7 (script + service + timer) | `/usr/local/bin/ape-meta-watchdog.sh`, `/etc/systemd/system/ape-meta-watchdog.{service,timer}` |

**Por qué un `include` y no un server block nuevo:** nginx **no fusiona** locations de dos `server`
con el mismo `server_name`; gana el primero y el segundo se ignora en silencio. Incluir dentro del
bloque existente es la única forma limpia de añadir rutas conservando el TLS de Let's Encrypt.

## 2. Verificación real desde internet (no desde el VPS)

| Ruta pública | HTTP | Lectura |
|---|---|---|
| `/ape/health` | **200** | `{"ok":true,"ts":1792859361,"upstreams_down":2,"plane":"meta/v3"}` |
| `/cdn/evil.example.com/x.m3u8` | **403** | allowlist anti-SSRF funciona |
| `/cdn/line.tivi-ott.net/__noexiste.m3u8` | **404** | host permitido → fetch real intentado (404 del proveedor) |
| `/x.ts` | **404** | candado de video |
| `/prisma/api/channel-hdcp-bulk.php` | **200** | regresión PHP intacta |
| `/health` (legacy) | **200** | vhost original intacto |

Nota: desde el propio VPS el cliente es `127.0.0.1` y la allowlist lo permite siempre (por eso los
tests internos no dan 403). La prueba válida es desde fuera, que es la que aparece arriba.

## 3. Watchdog 24/7

```
systemctl is-active ape-meta-watchdog.timer  -> active
list-timers                                   -> NEXT en 43s, LAST hace 16s
ejecución manual                              -> exit=0, contador de fallos = 0
```

Lógica (`ape-meta-watchdog.sh`, cada 60 s):

1. `GET http://127.0.0.1:8088/_ape/health` con timeout 5 s.
2. Si responde: contador = 0 (silencioso, no ensucia el journal).
3. Si falla: contador++. Al llegar a **3**:
   - `nginx -t` → si pasa, `systemctl reload nginx`
   - si no pasa, `systemctl restart nginx`
   - deja rastro en `journalctl -t ape-meta-watchdog`
4. Siempre sale 0 (un timer que falla genera ruido sin valor).

## 4. Seguridad del plano público

`/cdn/` **no** es un proxy abierto. El gateway valida cada host contra
`/etc/nginx/ape-hosts-allow.txt`. Sin la allowlist, un `/cdn/<host>/...` público sería un SSRF
(proxy hacia cualquier destino, incluida la red interna del VPS).

Para añadir un proveedor:

```bash
echo "line.dndnscloud.ru" >> /etc/nginx/ape-hosts-allow.txt
# se relee en ≤60 s (cache en ape_hosts) o al recargar nginx
```

## 5. Regresión y rollback

- 443: `channel-hdcp-bulk.php` 200 · `channel-pq-bulk.php` 200 · `netshield-sentinel.php` 503 (idéntico).
- El vhost original conserva su `/health`, sus PHP de upload y su `root /var/www/html`.
- Rollback completo (quita include, snippet y watchdog; valida y recarga):
  `bash /root/ape-meta-plane-20261024/scripts/unexpose-443.sh`

## 6. Pendiente consciente

- `:8088` sigue escuchando en todas las interfaces pero **bloqueado por firewall**; es el puerto de
  pruebas con `/__selftest*` y `/_ape/luatest` (loopback-only). Se puede cerrar del todo con una regla
  de firewall cuando ya no se necesiten los fixtures.
- El `upstreams_down:2` del health público venía de los hosts de prueba (127.0.0.1:1 y :8089) marcados
  por el smoke; el castigo dura 15 s y se limpia solo.
