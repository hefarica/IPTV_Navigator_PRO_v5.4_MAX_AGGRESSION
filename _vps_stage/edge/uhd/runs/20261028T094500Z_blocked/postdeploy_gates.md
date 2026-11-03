# POST-DEPLOY GATES · t31 — **BLOCKED** (no ejecutada)

**Estado:** BLOCKED — el deploy de Fase 0 está **EN CURSO** (CI run `40665691310`, commit `2f8861c`).
**Causa:** el capitán ordenó no medir hasta que el pipeline termine con success. Medir ahora mide el estado VIEJO y produce un FAIL falso.
**Host:** `ubuntu-2gb-ash-1` (178.156.147.234 · eth0). **Ventana de esta nota:** 2026-10-28T09:45Z. **Autor:** `s9-player-compat` (no-autor del código; recusación aplicada).
**Escrituras en el VPS:** **0** (solo lecturas: `hostname`/`uname`/`ip`/`sha256sum`/`ls`/`nginx -T | grep`/`curl GET` loopback). **Gates ejecutados: 0.**

## Tabla de gates — ninguna fila ejecutada

| Gate | Comando previsto | Resultado | Veredicto |
|---|---|---|---|
| G3 Guard | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | NO EJECUTADO | **BLOCKED** (deploy en curso) |
| G4 Selftest | `… --selftest` | NO EJECUTADO | **BLOCKED** |
| G5 luatest | `curl 127.0.0.1:8088/_ape/luatest` | NO EJECUTADO | **BLOCKED** |
| G6 Captura post | `capture_uhd.mjs --label post` | NO EJECUTADO | **BLOCKED** |
| G7 /cdn/ | manifest 200 / .ts 404 | NO EJECUTADO | **BLOCKED** |
| G8 Listas | sha256/size/mtime vs baseline t30 | NO EJECUTADO | **BLOCKED** |
| G9 health | `/_ape/health` + objeto `uhd` | NO EJECUTADO | **BLOCKED** |
| `/_ape/uhd` (nuevo) | 200 loopback + 404/403 en 443 | NO EJECUTADO | **BLOCKED** |
| G10 TTFB | p50 pre/post | NO EJECUTADO | **BLOCKED** |
| G11 Red | bbr+fq, fastopen, slow_start_after_idle, rto_min | NO EJECUTADO | **BLOCKED** |
| Paridad deploy | sha256 desplegado == repo; 10/10; `nginx -t`; reload sin restart | NO EJECUTADO | **BLOCKED** |
| Rollback | backup del stamp | NO EJECUTADO | **BLOCKED** |

## Premisa medida ANTES de la orden de parada (no es resultado de gate)

Se tomaron estas lecturas **antes** de recibir la orden del capitán; se conservan solo como prueba de que el estado desplegado era el **viejo** (y por eso no se midió ningún gate):

- `sha256sum` desplegado: `ape_uhd.lua=f1f5eb67…` · `ape_gateway.lua=1b71d90e…` · `ape_obs.lua=f477741b…` · `ape_luatest.lua=98a29c44…` · `50-ape-meta-plane.conf=3e29b928…`
- Esperado post-deploy (capitán): `b02fbe28…` · `360e4097…` · `afa003ad…` · `7f5be265…` · `6b3c71e7…`
- `curl 127.0.0.1:8088/_ape/uhd` → **404** (endpoint nuevo aún no desplegado)
- `nginx -T | grep -c '_ape/uhd'` → **0**
- `/_ape/health` → **200** con `ok:true`, `shared_dicts:true`, `upstreams_down:0` (estado viejo, sin objeto `uhd`)
- `ls /etc/nginx/lua/`: `ape_uhd.lua` 5.320 B (viejo, 2026-10-24)
- Backups presentes: `/var/backups/ape-deploy/20261027T122216Z` · `/root/backups/edge-e1-20261028T093309Z` (t30)

**Conclusión:** el deploy de B-01+B-02 **no estaba aplicado** cuando se hizo la comprobación; el pipeline está en curso. **No se recomienda rollback** (no hubo deploy nuevo que revertir). Se re-ejecuta esta puerta cuando el capitán confirme success del run `40665691310`.