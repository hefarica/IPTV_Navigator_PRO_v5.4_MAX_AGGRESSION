# APE Crystal upscale 4K/6K — despliegue de producción 2026-11-25

**Estado:** wrapper 1.8.0 + contrato `ape.crystal.upscale/1` desplegados y verificados en producción.  
**Run CI/CD:** [45544078890](https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/45544078890) · **success**.

## Identidad de la entrega

| Dato | Valor |
|---|---|
| `source_sha` | `77d70b38cccc69f5025b7b5342473f3a90c0f9f9` |
| `workflow_sha` | `550d8850f1597761d3bb28e73d1725e0816ffc3f` |
| `ref` | `feat/local-build-integrated-20261124` |
| `stamp` | `20261125T040326Z` |
| Backup/recibo | `/var/backups/ape-hybrid/20261125T040326Z/receipt.txt` |

## Runtime desplegado en `/opt/ape-pulse`

| Archivo | SHA-256 |
|---|---|
| `ape-pulse-wrap.js` | `2f7911c5b29f79f698c6098dbad3f6611ac51eeb9261388e9eede9d70a2aec34` |
| `ape-pulse-list.cjs` | `1053fe5c5c8a34589060f47305516160cb93a94d3d4348454153c874af0dfc25` |
| `ape-pulse-master.cjs` | `4b5490c25d298197b9d8053140a91a53bb8188a75c33487118804f0240f4cd3f` |
| `crystal-upscale.cjs` | `4459d2f1d1a467b2a722ce1d746fd87701c73c280897ed9f2e5a9a87543c2c69` |
| `crystal_upscale_profiles.json` | `1b6f37503bb021781fce0c6467d83bef26dbd1383170747cdd9dbfce0135f561` |
| `ape-crystal-hybrid.cjs` | `ed759f319c270b19cbc4287400445c2e61651a3ad338403120a62a7007fb1a1b` |
| `ape-crystal-hybrid-owner.cjs` | `1e75684f5d95efc0a3842d1092d85758909f89edc9d9d2302c1393e174b690fb` |
| `APE_FUSION_HIBRIDO_OPTIMO_12P.json` | `439e28447371cff6c849eef08989a5eed5403dd6ad001488527e9db3ada58c49` |
| `ape-url-builder.js` | `674e018dbeb674f3abae776cf8f9b87b3471f7a534f745f0147a138252e57585` |

Todos los hashes remotos coinciden con el repo local.

## Verificación del CI

- `frontend OK` para los 7 archivos de la App.
- `tool OK` para los 9 archivos de `/opt/ape-pulse`.
- `contracts OK` (híbrido + upscale).
- `upscale plan OK 4320x3240 5760x3240`.
- `owner OK max P1 max8k P0`.
- `builder omitProfile OK`.
- `nginx -t` OK + `nginx -s reload` (sin restart).
- HTTP de `index-v4.html`, módulo híbrido, generador, panel y puente LAB: 200 y contenido esperado.
- `DEPLOY HÍBRIDO OK stamp=20261125T040326Z`.

## Prueba independiente de producción

En el VPS, con `/opt/ape-pulse/ape-pulse-wrap.js`:

- Lista temporal de 4 canales: `p=P1`, `P1`, `P0`, `P1`; 4 tags `HYBRID-PULSE`; `ROUTE=max/max/max8k/max`; wrapper **1.8.0**.
- Clip sintético 320×240 entrelazado 4:3, `--format upscale --target 6k --quality max --sharpness strong --plan`:
  - `input_sar=1:1`, `sar_assumed=false`, `display_aspect_ratio=4:3`;
  - `active_px=[4320,3240]`, `output_px=[5760,3240]`, `cas_strength=0.34`;
  - cadenas exactas del enlace;
  - no creó directorio (`PLAN_NO_OUTPUT_OK`).
- Temporales borrados.

## App local

Live Server :5500:

- `index-v4.html` HTTP 200, contiene `ape-crystal-hybrid.js` y `APE_HYBRID`.
- `ape-crystal-hybrid.js` HTTP 200, contiene `seleccionarHibridoOwner`.
- Tests locales `test-crystal-plan.cjs`: OK.
- **Ctrl+F5** para cargar la versión actual.

## Fuera de este despliegue

- `ape-pulse-sync.sh` de producción sigue en **1.5.0** y no se ha tocado: su timer corre cada 5 min y en el log actual **omite las listas >700 MB** (`processed=0`, `skipped=5-7`). Actualizarlo forzaría un rewrap; el wrapper 1.8.0 es backward-compatible con su uso por defecto. Si se quiere alinear, debe hacerse con canario y ventana.
- No se ha desplegado la APK (4K local), el nodo GPU compatible, el 6K de dispositivo ni el LLM asesor; son las fases P3/P5-P7 del plan.
- No se han tocado listas, DB, PHP, configuración de nginx ni JIT.

## Rollback

```bash
STAMP=20261125T040326Z
sudo cp -a /var/backups/ape-hybrid/$STAMP/frontend/. /var/www/html/
sudo cp -a /var/backups/ape-hybrid/$STAMP/tools/. /opt/ape-pulse/
sudo nginx -t && sudo nginx -s reload
```

El recibo remoto registra `source_sha`, `workflow_sha`, `stamp` y modo `apply`.
