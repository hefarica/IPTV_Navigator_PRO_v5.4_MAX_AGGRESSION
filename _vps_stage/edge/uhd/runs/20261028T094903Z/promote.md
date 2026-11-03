# t37 · Promoción de la captura POST a `latest.json` (cierre G3/G4)

**Tarea:** `t37` · **attempt:** `cea707b4-00be-41e6-871a-f21f835edd6f` · **Autor:** `s6-nginx-lua` (S6)
**Fecha:** 2026-10-28 · **HEAD:** `2f8861c` · **VPS:** `ubuntu-2gb-ash-1` · **Solo lectura en producción: no se escribió ni un byte.**

## 1 · Qué se promovió y con qué

| Fichero | Antes (sha256 12) | Después (sha256 12) | Bytes |
|---|---|---|---|
| `cases/latest.json` | `b86a4bce7de9` *(pre-fix)* | **`00bb5e23cb57`** *(post-fix)* | 16 260 → **17 214** |
| `cases/predeploy_20261026T204116Z.json` | — | **`b86a4bce7de9`** *(copia explícita del pre-fix)* | 16 260 |

`latest.json` promovido es **byte-idéntico** a `cases/20261028T094903Z.json` (`00bb5e23cb57…`) — la captura POST que verificó t35.

**Comando usado** (copia byte-exacta = exactamente lo que hace la rama `--promote` del arnés):

```powershell
# 1) copia explícita del pre-fix, para que el rollback tenga UNA fuente
Copy-Item _vps_stage\edge\uhd\cases\20261026T204116Z.json `
          _vps_stage\edge\uhd\cases\predeploy_20261026T204116Z.json -Force
# 2) promover la captura POST existente (NO se lanzó una captura nueva)
Copy-Item _vps_stage\edge\uhd\cases\20261028T094903Z.json `
          _vps_stage\edge\uhd\cases\latest.json -Force
```

**Nota honesta sobre `--promote`:** la bandera que añadí en t35 vive dentro de `capture_uhd.mjs`, así que sólo se dispara **al ejecutar una captura**; no puede promover un fichero ya existente. Como esta tarea prohíbe lanzar una captura nueva, repliqué su efecto exacto (copia byte a byte) en lugar de re-medir. **Hueco del arnés que conviene cerrar:** un `--promote-from <ruta.json>` (promover sin capturar) eliminaría esta ambigüedad. Queda declarado, no implementado (fuera del alcance de t37).

## 2 · Gates (exits reales, DESPUÉS de promover)

| # | Comando | Exit | Salida |
|---|---|---|---|
| G-A | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` **sin `--cases`** | **0** | `VEREDICTO: PASS_WITH_DECLARED_RISK   blocker=0 high=3 info=1` |
| G-B | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest` | **0** | `SELFTEST: PASS (8/8)` · `S7_8k_con_L153 → esperado UHD-09 -> 1 variante(s) declaran 8K con nivel insuficiente: #1 7680x4320@hvc1.2.4.L153.B0` |

**Antes** de promover, el mismo G-A daba **exit 1** (`VEREDICTO: FAIL blocker=1 high=2 info=1`). El cambio de veredicto se debe **solo** al cambio de insumo (baseline), no a código.

**Valor del selftest con `latest.json` = post:** es la prueba de que el arreglo de t35 es real. S7 usa `base4k` = par `master_4k_hevc` de `latest.json`; ahora esa base **ya no declara 8K** y, aun así, S7 muerde porque fuerza `RESOLUTION=7680x4320`. Con el S7 viejo (no-op) este mismo escenario daba **7/8**. No se tocó el guard en esta tarea.

## 3 · Módulos desplegados (verificación de que el código vivo es el certificado)

| Módulo | sha256 (12) en la captura post (medido en el VPS 2026-10-28T09:49Z) | Verificación en vivo (2026-10-28T09:5xZ) |
|---|---|---|
| `ape_uhd.lua` | **`b02fbe28ad2b`** · 9 894 B | `sha256sum /etc/nginx/lua/ape_uhd.lua` → **`b02fbe28ad2b`** · `stat` → 9 894 B ✔ |
| `ape_gateway.lua` | `360e4097bb21` · 21 672 B | (captura) ✔ coincide con el t32 del repo |
| `ape_obs.lua` | `afa003ad6e92` · 5 038 B | (captura) ✔ coincide con el t29 del repo |
| `ape_rebase_lib.lua` | `f813b1cc9a7d` · 8 674 B | ajeno a mis cambios |

`ape_uhd.lua` desplegado = **`b02fbe28ad2b…`**, exactamente el que entregué en t29. **Nada cambió en el VPS con t37.**

## 4 · Confirmación de solo-lectura en producción

```
nginx -T | sha256sum | cut -c1-16   → 255425a97a6fcdbe   (idéntico al de la captura post: sin cambios de config)
systemctl show nginx -p MainPID      → 3801145             (el mismo proceso)
systemctl show nginx -p NRestarts    → 0                   (cero recargas en toda la sesión)
sha256sum /etc/nginx/lua/ape_uhd.lua → b02fbe28ad2b        (módulo intacto)
```

Comandos ejecutados contra el VPS en t37: **sólo** `sha256sum`, `stat`, `systemctl show`, `nginx -T`. Cero `cp`/`tee`/`sed`/`reload`/`restart`.

## 5 · Rollback (una línea)

```powershell
Copy-Item _vps_stage\edge\uhd\cases\predeploy_20261026T204116Z.json `
          _vps_stage\edge\uhd\cases\latest.json -Force    # vuelve a b86a4bce7de9 (guard default = exit 1)
```

Equivalente sin la copia nueva: `Copy-Item _vps_stage\edge\uhd\cases\20261026T204116Z.json _vps_stage\edge\uhd\cases\latest.json -Force` (mismo hash `b86a4bce7de9`).
**No hay nada que revertir en producción**: t37 no toca el VPS.

## 6 · Estado de los gates y deuda declarada

| Gate | Estado tras t37 |
|---|---|
| **G3/G4** (UHD-09 sobre cuerpos servidos) | **VERDE** — `blocker=0` con el insumo por defecto |
| **G2** (`guard` por defecto) | **VERDE** — exit 0 |
| **Selftest del guard** | **VERDE** — 8/8 |
| `high=3` en el veredicto | **Siguen abiertos** (declarados, no blockers): `UHD-04` «marca sin cambio» en `master_4k_hevc`; `UHD-10/11` latentes porque la matriz llama `declare(8K)` fuera del gateway (t32 cerró la rama, no la función) |
| `M5_ascendente` con 4K ×2 | **E5-F7 sigue abierto** (no es un check del guard; se ve en `lua_matrix`) |

**Higiene del repo:** `cases/` y `runs/` de `_vps_stage/edge/uhd/` siguen **sin trackear** (`??`); `staged = []`; `HEAD = 2f8861c` sin commits de mi parte; `docs/` con **cero modificaciones**.
