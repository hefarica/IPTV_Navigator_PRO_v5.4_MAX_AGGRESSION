# `_vps_stage/edge/E10_window/` — paquete de ventana E10 (estado `preparado`)

Paquete **compuesto** para aplicar en una ventana §4 **solo con confirmación explícita del
propietario**. Hoy **NO está aplicado**: estado `preparado`.

- **Plan completo, diffs, comandos y rollback:** [`PLAN.md`](PLAN.md)
- **Ficheros staged + hashes:** `staged/`, `build.json`, `diffs/`
- **Scripts:** `scripts/apply_E10.sh` (`--check` / `--backup-only` / `--apply`), `scripts/rollback_E10.sh`
- **Evidencia:** `runs/20261026T220744Z/`

Regla dura: `--apply` exige `OWNER_CONFIRMED=1`; sin esa variable aborta. El paquete se compone
de E7 (observabilidad), retirada del bypass SSRF, fix `Accept-Ranges` y guard UHD E5; no toca
`/var/www/lists`, `/lists/`, `gzip_static/gunzip`, la regla `.ts→404`, `resolve.php`, `ngx.exit(503)`
ni ningún circuit breaker.
