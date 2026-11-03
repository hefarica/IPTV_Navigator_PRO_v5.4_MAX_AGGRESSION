# `_vps_stage/edge/uhd` — E5 · doctrina UHD (guard de verdad, sin tocar CODECS)

Artefactos de la fase 4 del equipo `edge-fluidez`. **Cero despliegues**: todo lo de aquí es
read-only respecto al VPS y vive fuera de las rutas con lock (`_vps_stage/nginx/**`,
`_vps_stage/lua/**`, `frontend/js/**`, `tools/crystal-upscale/**`).

Doctrina completa: [`docs/edge/E5_UHD_DOCTRINE.md`](../../../docs/edge/E5_UHD_DOCTRINE.md).

| Fichero | Qué es | Escribe en el VPS |
|---|---|---|
| `capture_uhd.mjs` | arnés de captura (SSH, sólo lectura): hashes, flags, 4 parejas **fuente → servido**, matriz del módulo con `lua5.1`, sondas públicas opcionales | **no** |
| `uhd_doctrine_guard.mjs` | gate de 12 checks (CODECS inmutable, GOLDEN RULE, 8K⇐4K, 8K⇐L183, PQ, no-repack, texto) + `--selftest` con 7 sabotajes | **no** (no toca el VPS) |
| `cases/*.json` | evidencia estructurada de una captura (la que consume el guard; `latest.json` = última) | — |
| `runs/<STAMP>/` | logs crudos: `capture.log`, `lua_matrix.txt`, `guard*.log`, `patch_sim.log`, `t40_fake_ai_headers.log` | — |
| `live/*.live` | copia byte-exacta de los módulos vivos del VPS (para leer y hashear; **no desplegar desde aquí**) | — |
| `proposed/E5-uhd-techo4k.patch.md` | parche propuesto (**NO aplicado**) que cierra E5-F4/E5-F5 | — (es doc) |
| `proposed/patch_sim.lua` | simulación del parche cargando el módulo **vivo** con `lua5.1` | **no** |

## Uso

```bash
# captura (read-only) — 4 parejas + matriz + sondas públicas
node _vps_stage/edge/uhd/capture_uhd.mjs --label "E5-UHD" --public-probes

# gate (exit 1 si hay blocker) y selftest de sabotajes
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --strict --json

# simulación del parche sobre el módulo desplegado (sin subir ficheros)
$lua = Get-Content _vps_stage/edge/uhd/proposed/patch_sim.lua -Raw ; $lua | ssh hetzner-iptv 'lua5.1 -'
```

## Estado (2026-10-26 20:41 UTC, `nginx -T ddf6a267…`)

* Guard **FAIL** — 1 blocker: `UHD-09` (`RESOLUTION=7680x4320` con `CODECS="hvc1.2.4.L153.B0"`).
  Es el hallazgo que E5 documenta y deja listo para cerrar, no un fallo del guard.
* Selftest **PASS 8/8**.
* 4/4 parejas con `CODECS` idéntico, 0 `hev1` en `STREAM-INF`, 0 reempaquetado, PQ sin duplicar.

> Tras cualquier cambio de config (p. ej. la ventana http2 de t2) **re-ejecutar la captura**:
> la evidencia está pinneada al `nginx -T` de arriba.
