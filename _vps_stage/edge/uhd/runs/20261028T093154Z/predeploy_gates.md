# Puerta PRE-deploy · Fase 0 REA — gates G1/G2/G3pre/G4/G6pre/G8/manifiesto/G10

**Tarea:** `t30` · **Ventana (UTC):** 2026-10-28T09:31:54Z → 09:33:40Z · **Host objetivo:** `ubuntu-2gb-ash-1` = `178.156.147.234` (producción, 2 GB, sin GPU)
**Autor:** `s7-sre-secops` · **STAMP de la corrida:** `20261028T093154Z`
**Delta funcional aplicado a producción: 0** (1 backup aditivo en `/root/backups`, 0 reload, 0 escritura de `.conf`/`.lua` vivos, 0 `systemctl`).

> Regla: cada fila lleva el **exit code real** del comando ejecutado. `NOT_RUN` cuando no se ejecutó, con causa. No hay PASS sin exit.

## 1. Tabla de gates

| Gate | Comando (literal) | exit | Resultado | Evidencia |
|---|---|---|---|---|
| **G1 Backup** | `ssh root@VPS 'bash -s' < _vps_stage/edge/baseline/phase0_backup.sh` | **0** | **OK** (`RESULT=OK stamp=20261028T093309Z`) | 3 ficheros con `sha256`+`size`+`cmp`+restore-sim OK: `50-ape-meta-plane.conf 3e29b928…c515 10941 B` · `ape-meta-public.conf a39e8de9…ac39 2509 B` · `sites-enabled/default 49c162a8…59d1 7828 B`. `nginx -T` 36 940 B `0c6c0ea0…3d1c`. `nginx -t` OK. `sites-enabled` = solo `coa-navigator`,`default` (sin `.bak_*`). → `G1_backup.log` |
| **G1v Verify** | `ssh 'STAMP=20261028T093309Z bash -s' < phase0_verify.sh` | **0** | **OK** (`RESULT=OK`) | Re-hash fuente vs backup: 3/3 `OK`; `nginx -t` OK; `MainPID=3801145`, **`NRestarts=0`**, `ActiveEnterTimestamp=2026-10-28 06:30:39`; `nginx-T` sha256 idéntico al de G1. → `G1v_verify.log` |
| **G2 Rollback seco** | `ssh 'bash -s' -- 20261028T093309Z < restore_phase0.sh` (sin `--apply`) | **0** | **OK** (`RESULT=OK`) | 3× `DRYRUN … sha OK` + `DRYRUN: nada escrito`. → `G2_restore_dryrun.log` |
| **G3 Guard pre** | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | **1** | **FAIL esperado** (estado PRE-cambio) | `VEREDICTO: FAIL blocker=1 high=2 info=1` · blocker **UHD-09** `master_4k_hevc: 1 variante(s) declaran 8K con nivel insuficiente: #1 7680x4320@hvc1.2.4.L153.B0` · UHD-10/UHD-11 latentes sobre la matriz del `ape_uhd.lua` **desplegado**. → `G3_guard_pre.log` |
| **G4 Selftest** | `node … --selftest` | **0** | **PASS 8/8** | S1..S7 sabotajes detectados + `control_negativo`; `SELFTEST: PASS (8/8)`. → `G4_selftest.log` |
| **G6 Medición pre** | `node _vps_stage/edge/uhd/capture_uhd.mjs --label pre` | **0** | **OK** | `pares=4 · filas_lua=20 · sondas=0`; evidencia `cases/20261028T093327Z.json`; log `runs/20261028T093327Z/capture.log`. Read-only verificado en el propio script (`capture_uhd.mjs:17` «No escribe NADA en el VPS»). |
| **G8 Baseline listas** | `sha256sum`+`stat` de 2 listas por SSH (read-only) | **0** | **OK** | `APE_LISTA_4K.m3u8.gz` `a464a0c3…081b` **140 555 650 B** 644 `root:root` mtime **2026-10-26 19:55:49Z** · `APE_LISTA_1793002539897_CDN.m3u8.gz` `db2d034e…2ab8` **160 845 954 B** 644 `www-data:www-data` mtime **2026-10-26 08:23:18Z**. → `lists_baseline.txt` |
| **Manifiesto** | `Get-Content _vps_stage/deploy/manifest.tsv` + `bash _vps_stage/deploy/validate.sh` | **0** | **OK** | **10 filas de destino** (9 `.lua` + 1 `.conf`; 5 columnas, 4 TAB): líneas 6-15 de `manifest.tsv`. **`ape_uhd.lua` presente en la línea 11** (nota: `[t29 B-02] antes NO estaba`) ⇒ B-02 confirmado. `validate.sh`: `OK=9 FALLOS=0 DIFERIDOS/SKIP=1`, `ESCRITURAS EN EL VPS: 0`. → `G5_validate.log` |
| **G10 TTFB base** | lectura `docs/edge/BASELINE.md:215` | n/a | **Referencia anotada** | «Δ TTFB loopback − `X-APE-Upstream-Ms` ≈ **31–51 ms** por muestra pareada». No se re-midió en esta ventana (no es un gate ejecutable; es la referencia PRE). |

**Nota de método (defecto propio, corregido):** la primera invocación de G8 devolvió `exit 1` porque escribí el script remoto con **CRLF** y `bash -s` recibió `head -6\r` → `head: invalid trailing option`. Re-escrito con **LF** → `exit 0`. Peligro real para la ventana: cualquier script que se envíe por `ssh 'bash -s'` desde Windows debe ir en LF; los `.sh` del repo ya están en LF y se pipean tal cual.

## 2. Divergencias entre el enunciado del gate y lo que el repo realmente hace

No se corrigió ninguna: se reportan, porque cambian lo que la puerta puede afirmar.

| # | Enunciado decía | Realidad medida | Impacto |
|---|---|---|---|
| D1 | G1 deja «snapshot byte-exacto de los **10 destinos** del manifiesto» | `phase0_backup.sh:34-38` copia **3** ficheros: `50-ape-meta-plane.conf` (sí es destino del manifiesto), `ape-meta-public.conf` y `sites-enabled/default` (**no** están en el manifiesto). Los **9 `.lua` NO se respaldan** en PRE. | **GAP abierto**: el snapshot PRE cubre 1 de 10 destinos. Lo cierra `deploy.sh:55-58` (`cp -a` de cada destino a `/var/backups/ape-deploy/<STAMP>/…`) pero **dentro** del deploy, no antes. |
| D2 | G1 escribe en **`/var/backups`** | `phase0_backup.sh:33` usa **`/root/backups/edge-e1-<STAMP>`**. `/var/backups/ape-deploy` es de `deploy.sh` (`lib.sh:24`). | Dos árboles de backup distintos; el rollback de E1 y el de deploy **no son intercambiables**. |
| D3 | G2 «`restore_phase0.sh` **sin `--yes`** → exit 0» | El flag real es **`--apply`** y el script **exige un STAMP posicional**: `restore_phase0.sh` sin argumentos → **exit 1** (`FATAL: uso: restore_phase0.sh <STAMP> [--apply]`, `restore_phase0.sh:29`). | El comando literal del enunciado **falla**. El exit 0 se obtuvo pasando el STAMP de G1: `restore_phase0.sh 20261028T093309Z`. |
| **D4** | (no estaba en el enunciado) | **`_vps_stage/lua/ape_gateway.lua` derivó DESPUÉS de que `t29` lo firmara.** t29 declaró `sha256 814165c3708a…` (504 L); en la ventana mide **`360e4097bb21…`, 21 672 B, 511 líneas**, `numstat +22/−5` vs HEAD, **mtime 2026-10-28 04:31:34 -05** (≈2 min antes del gate). El diff añade `local uhd_can8k`, la guarda `uhd.can_declare_8k(...)`, `declare_auto{allow_8k=flag("uhd8k")}` y `qset("uhd_mode_last"/"can8k_last")`, con el comentario `-- Override explícito del propietario (t32)`. | **La puerta validó bytes distintos de los que firmó t29** (`luac -p` pasa sobre el fichero actual, pero ese fichero es t29 **+ t32**). Desplegar así mezcla dos cambios en una sola ventana y deja el árbol de los `.lua` sin backup PRE. Lo demás del manifiesto sigue en los hashes de t29 (verificado: `ape_uhd b02fbe28ad2b`, `ape_obs afa003ad6e92`, `ape_luatest 7f5be2657458`, `meta-plane 6b3c71e76ae4`, `manifest e779001e2622`). |

## 3. ¿Se puede desplegar? — **GO CONDICIONADO**, no GO

- **Verde (exit 0):** G1, G1v, G2, G4, G6, G8, manifiesto/validate. La infraestructura de la ventana está lista y el rollback en seco es byte-exacto.
- **Rojo por diseño:** **G3 = exit 1** con blocker **UHD-09**. Es el estado **PRE-cambio** (el `ape_uhd.lua` desplegado aún declara 8K con `hvc1.2.4.L153.B0`). Por la regla del enunciado («si un gate falla, PARÁ y reportá») esta puerta **no habilita el deploy por sí sola**: G3 debe pasar a verde **después** de aplicar B-01/B-02, y esa verificación es de la puerta POST (`t31`).
- **GAP que el capitán debe aceptar o cerrar:** los 9 `.lua` no tienen snapshot PRE (D1). La ventana puede seguir porque `deploy.sh` respalda antes de instalar y `rollback.sh <stamp> --yes` restaura ese árbol; pero si el deploy falla **antes** del stage 2 no hay nada que restaurar (tampoco hay nada instalado), y si el operador espera un rollback E1 de los `.lua` **no existe**.
- **Prerrequisito nuevo (D4):** antes de desplegar hay que **decidir sobre `ape_gateway.lua`** — o se acepta el cambio de `t32` como parte de esta ventana (y se re-firma el hash `360e4097bb21…` + se repite `luac -p` sobre él, ya hecho aquí), o se revierte a `814165c3708a…`. Desplegar sin decidirlo publica una mezcla t29+t32 que ningún contrato firmó. **Esta puerta no elige: reporta.**

## 4. Estado medido del VPS en la ventana (sin cambios)

- `nginx 1.24.0 (Ubuntu)` · `MainPID=3801145` · **`NRestarts=0`** · `ActiveEnterTimestamp=2026-10-28 06:30:39Z`.
- `nginx -T` sha256 `0c6c0ea0090e7dd7defb0845763e4eb050ed21dfc70953e987cfd9d9b3813d1c` (36 940 B) — misma huella en G1 y G1v.
- Ficheros vivos intactos: `50-ape-meta-plane.conf` 10 941 B mtime **2026-10-27 12:18:49Z**; `ape-meta-public.conf` 2 509 B mtime **2026-10-26 04:37:14Z**; `sites-enabled/default` 7 828 B mtime **2026-10-26 20:55:48Z**.
- **Drift comprobado (no asumido):** el `sha256` del `50-ape-meta-plane.conf` vivo (`3e29b928…c515`) es **idéntico** al del snapshot del 26-oct (`_vps_stage/edge/baseline/live-snapshot/20261026T201548Z/…`) ⇒ el mtime del 27-oct es una reinstalación del **mismo contenido**, no una deriva de bytes.

## 5. Artefactos de esta corrida (`_vps_stage/edge/uhd/runs/20261028T093154Z/`)

`G1_backup.log` · `G1v_verify.log` · `G2_restore_dryrun.log` · `G3_guard_pre.log` · `G4_selftest.log` · `G6_capture_pre.log` · `G5_validate.log` · `g8_remote.sh` · `lists_baseline.txt` · `stamp.txt` · `predeploy_gates.json` · este informe.
Captura G6: `_vps_stage/edge/uhd/cases/20261028T093327Z.json` + `_vps_stage/edge/uhd/runs/20261028T093327Z/capture.log`.

## 6. Lo que esta puerta NO autoriza

Deploy · reload · `systemctl` · edición de código/docs · commit · `--apply` del restore · cualquier cambio de flags UHD (`uhd8k`, `uhd_auto`). El veredicto POST (G3–G11 + `/_ape/uhd` + paridad 10/10) es de `t31`.
