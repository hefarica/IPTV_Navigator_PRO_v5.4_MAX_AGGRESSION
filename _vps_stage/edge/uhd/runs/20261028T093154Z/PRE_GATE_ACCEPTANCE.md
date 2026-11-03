# Aceptación de la puerta PRE-deploy (capitán) — Fase 0 REA

**Puerta:** `t30` · STAMP `20261028T093154Z` · ventana 09:31:54Z→09:33:40Z · host `ubuntu-2gb-ash-1`
**Veredicto recibido:** GO CONDICIONADO (3 divergencias + 1 hallazgo). **Resolución del capitán: GO**, con las condiciones de abajo registradas.

## Resoluciones

| ID | Hallazgo de t30 | Resolución |
|---|---|---|
| **D1** | `phase0_backup.sh:34-38` respalda 3 ficheros, no los 10; los 9 `.lua` no tienen snapshot PRE **fuera** del deploy | **ACEPTADO, no bloqueante.** El backup de los 10 destinos lo hace `deploy.sh:55-58` (`cp -a` a `/var/backups/ape-deploy/<STAMP>`) **antes** de instalar, y `rollback.sh` apunta a ahí. `phase0_backup` es complementario (3 configs). Follow-up post-Fase-0: extenderlo a los 10. |
| **D2** | Backup en `/root/backups/edge-e1-<STAMP>`, no en `/var/backups`; árboles no intercambiables | **ACEPTADO.** El rollback operativo es `rollback.sh <stamp>` sobre `/var/backups/ape-deploy`; el árbol de `phase0` es evidencia del baseline. No se mezclan. |
| **D3** | `restore_phase0.sh` exige STAMP; el flag es `--apply`, no `--yes` | **ACEPTADO.** Se ejecutó con STAMP y dio `exit 0` (dry-run, «nada escrito»). Se corrige la guía, no el script. |
| **D4** | `ape_gateway.lua` derivó tras la firma de t29: `814165c3` (504 L) → **`360e4097` (511 L)** con el fix de **t32** | **ACEPTADO Y RE-FIRMADO.** El cambio es la orden del capitán en `t32` (aplicar `can_declare_8k` en la rama `uhd8k=1`), verificado por el capitán: `TARGET_8K` y `uhd_mode="8k"` aparecen **una sola vez**, dentro de `if ok8`; selftest 8/8. La puerta validó **el artefacto final correcto**, no una mezcla accidental. **Hash firmado para el deploy: `360e4097bb21…`.** |
| **G3=1** | Guard pre-deploy en rojo (UHD-09) | **ESPERADO, no bloqueante.** El guard evalúa `cases/latest.json` (captura 2026-10-26) y `lua_matrix` del módulo **desplegado**; no lee el repo. Su verde es criterio de **t31** (post-deploy con captura nueva). |
| **Método** | Scripts por `ssh 'bash -s'` deben viajar en **LF** (defecto propio corregido) | **REGISTRADO** para t31. |

## Estado vivo en el momento del GO (verificado)

`nginx -t` OK · MainPID 3801145 · NRestarts=0 · listas intactas (`a464a0c3…`, `db2d034e…`) · destinos actuales: gateway `1b71d90e`, uhd `f1f5eb67`, obs `f477741b`, luatest `98a29c44`, meta-plane `3e29b928`.

## Decisión

**GO para commit por pathspec + push + workflow `mode=deploy`** (los 6 achivos), con aprobación del Environment y rollback disponible al STAMP del deploy. Si `t31` falla → rollback inmediato, sin «ajustar» umbrales.

**Firmado:** capitán del team `equipo-enterprise-10-adn` · 2026-10-28.
