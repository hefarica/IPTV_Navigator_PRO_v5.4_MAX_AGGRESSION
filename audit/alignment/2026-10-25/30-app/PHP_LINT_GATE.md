# PHP LINT GATE — cerrado por el capitán (D-17)

**Motivo:** `t6` (auditoría APP) dejó la puerta sintáctica de PHP en `UNVERIFIED` porque el host no tenía PHP.
**Decisión:** D-17 — instalar PHP portable local (no se sube nada al VPS) y ejecutar el lint real.

## Entorno

| Dato | Valor |
|---|---|
| PHP | `8.3.36 (cli) (built: Oct 20 2026) (NTS Visual C++ 2019 x64)` |
| Origen | `https://windows.php.net/downloads/releases/php-8.3.36-nts-Win32-vs16-x64.zip` |
| SHA-256 del ZIP | `3c9242622c7402b47c38d2ec2ed779cef3a290fd6f2bde6c35f9c482699e7900` (coincide con `releases.json`) |
| Instalación | `C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe` |
| Comando | `php -l <archivo>` (lint, sin ejecutar) |

## Resultado: 6/6 PASS

| # | Archivo | SHA-256 (bytes linteados) | Exit | Resultado |
|---|---|---|---:|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php` | `20ac4b2631c1e877a3de92b4e479b6c2efa171ad1a317869f9343a99c3c5f2b5` | **0** | No syntax errors detected |
| 2 | `IPTV_v5.4_MAX_AGGRESSION/backend/rq_streaming_health_engine.php` | `e0e405fa18f0157da6ad5cb441c8bf94b2bbb7aa473ba585f1be76caa82c9bbb` | **0** | No syntax errors detected |
| 3 | `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php` | `2ac913221a53ad8b5963a91bfd21d9938c7fcc36451c1b346467bbe16960aa5e` | **0** | No syntax errors detected |
| 4 | `IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/dual_manifest_generator.php` | `0c28484b2f6b88bb7e01172ce4007aa6705a502444ef51c14a3cfe2e55693c79` | **0** | No syntax errors detected |
| 5 | `IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/universal_codec_protocol_engine.php` | `0f3a77c273ae4f6d15cdac8e59b3674530b57bcd5e2586e7dc3bc6f983d35c3c` | **0** | No syntax errors detected |
| 6 | `IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/telchemy_tvqm_engine.php` | `20dfe30a5656e5a042ce8b64ec4a88beca399964f2f0c62ba76ba3eadd6af5a2` | **0** | No syntax errors detected |

Salida cruda (transcrita de la ejecución real, una línea por archivo):
```
FILE=…/backend/resolve_quality_unified.php   EXIT=0  OUT=No syntax errors detected
FILE=…/backend/rq_streaming_health_engine.php EXIT=0  OUT=No syntax errors detected
FILE=…/vps/ape_hls_generators.php            EXIT=0  OUT=No syntax errors detected
FILE=…/backend/cmaf_engine/modules/dual_manifest_generator.php        EXIT=0  OUT=No syntax errors detected
FILE=…/backend/cmaf_engine/modules/universal_codec_protocol_engine.php EXIT=0  OUT=No syntax errors detected
FILE=…/backend/cmaf_engine/telchemy_tvqm_engine.php EXIT=0  OUT=No syntax errors detected
PHP_LINT_SUMMARY fail=0 total=6
```

## Corrección de ruta detectada

La lista de remediación de `t6` (§2.4) apuntaba a `backend/cmaf_engine/dual_manifest_generator.php` y
`backend/cmaf_engine/universal_codec_protocol_engine.php`, que **no existen** en esa ruta. Los archivos reales
están en `backend/cmaf_engine/modules/`. Se lintearon esas rutas (y se comprobó que las copias de
`backup_master_v5.4_phantom_engine/**` también lintan 0). Los dos "MISSING" iniciales fueron un error de ruta,
no de sintaxis.

## Consecuencia

- La única puerta que `t6` dejó abierta queda **cerrada** con evidencia ejecutada.
- `t11` (remediación) usará este PHP como gate obligatorio; el VPS **no** se usa para lint (D-17).
- Un lint verde **no** valida el contrato de emisión: los hallazgos CRITICAL de `t6` (GOLDEN RULE, FRAME-RATE/L153,
  STREAM-INF huérfano) siguen vigentes y se corrigen en `t11`.
