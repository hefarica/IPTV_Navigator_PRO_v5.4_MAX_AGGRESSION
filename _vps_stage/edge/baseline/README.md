# `_vps_stage/edge/baseline/` — arnés FIJO de baseline del borde (E1 · FASE 0)

Todo lo de esta carpeta es **read-only sobre el VPS** (GET/HEAD + `nginx -t`) salvo
`phase0_backup.sh`, que **solo crea copias** en `/root/backups/edge-e1-<stamp>/` y
no toca ningún `.conf` vivo. **Nada recarga nginx.**

## Ficheros

| Fichero | Qué es | Escribe en el VPS |
|---|---|---|
| `baseline_edge.mjs` | Arnés de medida v1.0.1 (Node ≥18, sin dependencias) | **NO** |
| `phase0_backup.sh` | Crea los 3 backups con sufijo `.bak_<UTC>` + verifica + `nginx -T` | solo `/root/backups/…` |
| `phase0_verify.sh` | Re-verifica backups y estado de nginx (evidencia cruda) | **NO** |
| `restore_phase0.sh` | Restaura un backup (dry-run por defecto; `--apply` escribe) | solo con `--apply` |
| `live-snapshot/<stamp>/` | Copia byte-exacta de los 3 `.conf` vivos (scp) con sha256 | **NO** |
| `runs/<stamp>/` | Salida de cada ejecución (`baseline.json`, `baseline.log`, headers) | **NO** |

## Cómo se ejecuta (desde la raíz del repo, Windows o Linux)

```bash
# 1 · backups (FASE 0)
ssh -o BatchMode=yes root@178.156.147.234 'bash -s' < _vps_stage/edge/baseline/phase0_backup.sh

# 2 · re-verificación (read-only)
ssh root@178.156.147.234 'STAMP=<stamp> bash -s' < _vps_stage/edge/baseline/phase0_verify.sh

# 3 · baseline
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E1-FASE0-baseline"

# 4 · rollback probado en dry-run (no escribe)
ssh root@178.156.147.234 'bash -s' -- <stamp> < _vps_stage/edge/baseline/restore_phase0.sh
```

`EDGE_SSH` permite cambiar el destino SSH (default `root@178.156.147.234`).

> ⚠️ **El set de backups `edge-e1-20261026T201548Z` es PRE-HOTFIX**: el
> 2026-10-26T20:23:27Z otra sesión añadió `location = /upload.php { return 403; }`
> a `sites-enabled/default`. Restaurar ese set **deshace el hotfix**. Es correcto
> para volver al estado del baseline; para producción actual, re-hashear y decidir.

## Parámetros FIJOS del arnés (no cambiar sin versionar BASELINE.md)

```
HOST        = iptv-ape.duckdns.org
LISTA       = /lists/APE_LISTA_4K.m3u8
CANALES     = ids 3, 5, 6 de /cdn/line.tivi-ott.net/… (descubiertos de la lista viva)
N           = lista 5+5 · /cdn/ cliente 3/canal · /cdn/ loopback 3/canal · doble hop 7
TIMEOUT     = 20 s por petición
```

El cuerpo de la lista **se aborta tras el primer chunk** (no se descargan 140 MB).
Los canales se descubren de la lista viva en el VPS y **las credenciales se
redactan** (`<USER>/<PASS>`) en `baseline.json` y `baseline.log`.

## Runs

| Run | Qué es |
|---|---|
| `runs/20261026T201548Z/` | FASE 0: backups + verificación + dry-run de restore (stamp de backups) |
| `runs/20261026T201814Z/` | Ensayo de calibración del arnés **v1.0.0** — **no canónico** (sin doble hop y con keep-alive no reutilizado); se conserva por trazabilidad |
| `runs/20261026T202041Z/` | **Run canónico del baseline** (arnés v1.0.1) → ver `docs/edge/BASELINE.md` |
| `runs/latest.json` | Copia del último `baseline.json` |
