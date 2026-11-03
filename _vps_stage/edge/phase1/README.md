# `_vps_stage/edge/phase1/` — E2 · FASE 1: HTTP/2 en 443 (nginx 1.24)

**Estado:** **APLICADO y verificado** el `2026-10-26T20:53:22Z` (ventana §4 20:52Z; re-base por hotfix ajeno a las 20:48:45Z). Rollback probado de verdad (OFF→ON). Ver [`docs/edge/PHASE1_HTTP2.md`](../../../docs/edge/PHASE1_HTTP2.md).
**Baseline de referencia:** [`docs/edge/BASELINE.md`](../../../docs/edge/BASELINE.md) (run 20261026T202041Z; HTTP/2 NO negociado). Run post: `_vps_stage/edge/baseline/runs/20261026T205347Z/`.

## Cambio (una línea × 2)

En `/etc/nginx/sites-enabled/default`, server 443:

```diff
-    listen 443 ssl default_server;
-    listen [::]:443 ssl default_server;
+    listen 443 ssl http2 default_server;
+    listen [::]:443 ssl http2 default_server;
```

Nada más. No se toca `gzip_static/gunzip`, ni `/lists/`, ni `/cdn/`, ni `/ape/health`,
ni PHP/Lua, ni timeouts, ni TLS.

## Scripts (todos viven en el repo; se ejecutan por SSH)

| Script | Qué hace | Escribe |
|---|---|---|
| `apply_phase1_http2.sh` | precondiciones (sha == backup) → edición exacta → `nginx -t` → `reload` → ALPN | sí (solo el `default`), con rollback automático si `nginx -t` falla |
| `apply_phase1_http2.sh --check` | **dry-run**: muestra el diff exacto y no escribe | no |
| `verify_phase1_http2.sh` | lista + 3 manifiestos por h2 y h1, ALPN, `nginx -T`, error.log | no |
| `rollback_phase1.sh <STAMP> [--apply]` | restaura el `default` pre-FASE-1 + `nginx -t` + reload | solo con `--apply` |

Backup pre-cambio: `/root/backups/edge-e1-20261026T205255Z/` (base `e2ba4684…`, 7.816 B;
**incluye los bloqueos de seguridad** SSRF/video/`upload.php`). Rollback exacto:

```bash
ssh root@178.156.147.234 'bash -s' -- 20261026T205255Z --apply \
  < _vps_stage/edge/phase1/rollback_phase1.sh
```

> Los backups `20261026T201548Z` y `20261026T203255Z` son **anteriores** a los bloqueos de
> seguridad (20:23Z y 20:48Z). No usarlos para rollback de producción.

## Secuencia de ejecución (en la ventana)

```bash
# 1 · aplicar
ssh root@178.156.147.234 'STAMP=20261026T205255Z bash -s' \
  < _vps_stage/edge/phase1/apply_phase1_http2.sh
# 2 · verificar h2/h1 en el VPS
ssh root@178.156.147.234 'bash -s' \
  < _vps_stage/edge/phase1/verify_phase1_http2.sh
# 3 · re-medir con el arnés FIJO (comparable contra baseline)
node _vps_stage/edge/baseline/baseline_edge.mjs --label "E2-FASE1-http2"
# 4 · rollback si hay regresión
ssh root@178.156.147.234 'bash -s' -- 20261026T205255Z --apply \
  < _vps_stage/edge/phase1/rollback_phase1.sh
```

`runs/20261026T203255Z/` = **intento 1**, abortado por re-base (el guard detectó que el fichero
cambió a las 20:48:45Z). Se conserva como evidencia de que el guard funciona. El run bueno es
`runs/20261026T205255Z/` (apply, verify, smoke, rollback, re-apply, compare).

## Criterio de aceptación

1. `curl --http2` → `2` en la lista y en los 3 manifiestos `/cdn/` (200).
2. `curl --http1.1` sigue devolviendo `1.1`/200 en ambos.
3. ALPN negocia `h2` con `openssl s_client -alpn h2`.
4. `nginx -t` OK; `MainPID` estable; `NRestarts` sin cambios; error.log sin errores h2.
5. Sin regresión en las métricas comparables del arnés (lista h1, `/cdn/`, health).
6. **Smoke de seguridad (capitán):** `/cdn/127.0.0.1:8088/_ape/health` → 403;
   `/cdn/…x.ts` → 404; los bloques APE-SEC siguen **antes** del `include snippets/ape-meta-public.conf`.
