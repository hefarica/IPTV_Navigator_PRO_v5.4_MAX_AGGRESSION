# Deploy aplicado — 2026-10-31T16:20Z

**APLICA recibido.** Backup: `/root/ara_backup_20261031T162028Z`.

## Archivos instalados

| Archivo destino | SHA-256 |
|---|---|
| `/var/www/html/prisma/lib/ape_cursor.php` | local manifest |
| `/var/www/html/prisma/lib/ape_window.php` | local manifest |
| `/var/www/html/prisma/lib/ape_resume.php` | local manifest |
| `/var/www/html/prisma/lib/ape_cmaf_bootstrap.php` | local manifest |
| `/var/www/html/prisma/lib/ape_hls_state.php` | local manifest |
| `/var/www/html/prisma/lib/ape_hls_timing.php` | local manifest |
| `/var/www/html/prisma/lib/ape_ara_state.php` | local manifest |
| `/var/www/html/prisma/lib/ape_sse_commands.php` | local manifest |
| `/var/www/html/prisma/api/events-sse.php` | `e4b7f7c2...` |
| `/var/www/html/ape_hls_generators.php` | `58294832...` (fallback RFC + base URL) |
| `/var/www/html/cmaf_worker.php` | `1a2af51a...` |
| `/var/www/ara/state.php` | `f15e128a...` |
| `/var/www/ara/state_bridge.php` | `e5011c13...` |

## Verificación ejecutada

```text
HTTP events=401 sse=401 state=401
nginx -t: syntax ok / test successful
systemctl is-active nginx php8.3-fpm: active / active
```

E2E con tokens separados (no impresos):

```text
POST /ara/state  -> {"ok":true,"seq":10,"sse_seq":3}
GET  /ara/events -> classifier.state=1
data: {"class":"SLATE",...,"delta_type":"classifier.state","source":"ara_classifier"}
GET  /ara/sse    -> payload de estado crudo
```

## Rollback

```bash
cp -a /root/ara_backup_20261031T162028Z/* <destinos>
systemctl reload php8.3-fpm
nginx -t && nginx -s reload
```

## Pendiente de verificar

- Manifiesto `/shield/` real con `MEDIA-SEQUENCE`/`DISCONTINUITY`/`PROGRAM-DATE-TIME`.
- Worker CMAF con 4 rendiciones en una petición real; no se midió CPU/throughput.
- APK Android no instalado en el ONN.
- A05 latencia sigue sin instrumentar.
