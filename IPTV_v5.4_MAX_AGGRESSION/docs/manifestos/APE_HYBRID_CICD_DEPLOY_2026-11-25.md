# Despliegue CI/CD del híbrido APE Crystal v9.4 — 2026-11-25

**Estado:** desplegado y verificado en producción.  
**Run de GitHub Actions:** [45521510318](https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/45521510318) · **success**.

## Identidad de la entrega

| Dato | Valor |
|---|---|
| `source_sha` (código desplegado, rama `feat/local-build-integrated-20261124`) | `998848825ab8bbf474bdbf4354d3a4b3f8af82f4` |
| `workflow_sha` (workflow en `master`) | `bdb0e652a6c37944317eb91da4480cb1f01b66af` |
| `ref` | `feat/local-build-integrated-20261124` |
| `stamp` | `20261125T005326Z` |
| Backup/recibo remoto | `/var/backups/ape-hybrid/20261125T005326Z/receipt.txt` |

## Workflow

`.github/workflows/ape-deploy-hybrid.yml` (en `master`), disparo manual con:

```text
ref     = feat/local-build-integrated-20261124
mode    = apply
confirm = DESPLIEGO HÍBRIDO AL VPS
```

Secuencia: **validate** (sintaxis + tests) → **preflight** (SSH, dirs, node, estado) → **backup** → **staging/verificación de hash** → **install** → **gates remotos** (node --check, JSON, owner, builder) → **nginx -t + reload** → **HTTP real** → **recibo**. Cualquier fallo dispara **rollback automático**.

## Archivos desplegados y hashes (VPS = repo)

### Frontend `/var/www/html`

| Archivo | SHA-256 |
|---|---|
| `index-v4.html` | `d9b37491cad423ffc7c26b0096abe9f6c51c55ee709f18bc860774ac9f75982c` |
| `app.js` | `1e01b3a05217e3dca2bf9511c6b912524b33acd06186b552946c6e6fead8631e` |
| `js/ape-v9/m3u8-typed-arrays-ultimate.js` | `d4eca5ccf27e3dd6a351c8deead368988cc20848a79ca46ce89ea004e172056d` |
| `js/ape-v9/generation-output-panel.js` | `a6f8474efa1398c8c130bd16bafa466052174e66a79f44c8a983231825c322a5` |
| `js/ape-v9/ape-crystal-hybrid.js` | `10553546e8a0b0712ba16e0d419415af5256b1934bcc8ffd33d526b407cfe287` |
| `js/ape-v9/ape-lab-12p-reconcile.js` | `3dae71639910669fae2df25a39c1638fd4ab36dfe8940ea8f131d8fac9e07d38` |
| `js/ape-v9/profile-manager-v9.js` | `e5416014445d2797d17e679d509c2a25aeae0eb4061079a2467a16dce24ab8eb` |

### Runtime `/opt/ape-pulse`

| Archivo | SHA-256 |
|---|---|
| `ape-pulse-wrap.js` | `e79140510132b16083860f531798b896f62e2227cf4daaea5f91cd0303921cd1` |
| `ape-url-builder.js` | `674e018dbeb674f3abae776cf8f9b87b3471f7a534f745f0147a138252e57585` |
| `ape-crystal-hybrid.cjs` | `ed759f319c270b19cbc4287400445c2e61651a3ad338403120a62a7007fb1a1b` |
| `ape-crystal-hybrid-owner.cjs` | `1e75684f5d95efc0a3842d1092d85758909f89edc9d9d2302c1393e174b690fb` |
| `APE_FUSION_HIBRIDO_OPTIMO_12P.json` | `439e28447371cff6c849eef08989a5eed5403dd6ad001488527e9db3ada58c49` |

## Verificación

- **Tests del workflow (job validate):** 39 dispatch + 36 panel + 46 r17 + 44 pulse + 25 builder + 4 owner; **todos en verde**.
- **Remoto:** `node --check` del envoltorio/builder/CJS/owner; JSON con `ape.crystal.hybrid/1`; `owner OK max P1 max8k P0`; `builder omitProfile OK`.
- **nginx:** `nginx -t` OK y `nginx -s reload` (sin restart).
- **HTTP real:** `index-v4.html` 200 con `ape-crystal-hybrid.js` y `v=9.4-owner`; módulo 200 con `seleccionarHibridoOwner`; generador 200 con `seleccionarHibridoOwner` y `HYBRID-PULSE`; panel 200 con `HÍBRIDO P1.5/p=P1`; puente LAB 200 con la referencia v9.4.
- **Prueba del envoltorio de producción** (fixture temporal en `/tmp`, borrado después): 4 canales → `p=P1`, `P1`, `P0`, `P1`; tags `ROUTE=max/max/max8k/max`, `CARTRIDGE=P1.5/P0`, `MODE=SIMULATED/NATIVE`, `EXECUTED=0`.

## Rollback

El workflow ya demostró el rollback en dos corridas fallidas:

- `45520180706`: fallo de staging local (antes de tocar `/opt/ape-pulse`); el frontend quedó instalado y se completó en la corrida siguiente.
- `45520764305`: fallo del gate del builder; **rollback completo** de frontend y `/opt/ape-pulse` a los bytes previos, con backup conservado.

Rollback manual del estado actual:

```bash
STAMP=20261125T005326Z
sudo cp -a /var/backups/ape-hybrid/$STAMP/frontend/. /var/www/html/
sudo cp -a /var/backups/ape-hybrid/$STAMP/tools/. /opt/ape-pulse/
sudo nginx -t && sudo nginx -s reload
```

Los archivos nuevos que no existían antes se borran con `rm -f` (el manifiesto del backup lo indica).

## Alcance / honestidad

- Solo se tocaron **archivos estáticos y el runtime `/opt/ape-pulse`**; no se tocaron listas, DB, PHP, configuración de nginx ni JIT.
- `p=P1` no convierte el bitstream en 4K: es salida simulada por video filters (`MODE=SIMULATED`, `EXECUTED=0`); 8K se conserva en P0.
- El **hook local pre-push** (`tools/ape-deploy-qoe.ps1`) desplegó 3 archivos de panel/QoE en el push inicial, fuera de CI. Se ha **desactivado** (copia en `.git/hooks/pre-push.disabled_20261125`) para que el próximo deploy sea solo GitHub Actions.
- `https://iptv-ape.duckdns.org/` devuelve 403 (listado de directorio); la App se sirve en `/index-v4.html` (200). No se modificó esa política.
