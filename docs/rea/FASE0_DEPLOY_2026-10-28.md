# Fase 0 — despliegue y cierre de puertas (2026-10-28)

**Estado: APLICADA, VERIFICADA y CERRADA (2026-10-28).** No se revirtió. Continuación de `CERTIFICACION_CAPITAN.md` (plan v3).

## Despliegue

| Dato | Valor |
|---|---|
| Commit | `2f8861c` (6 ficheros, +230/−31) |
| Workflow | `deploy-vps.yml` mode=deploy · run **40665691310** → `success` |
| Instalados | **5/5** (gateway, uhd, obs, luatest, meta-plane.conf) |
| Paridad | **10/10** repo == remoto |
| Smoke | OK · `nginx -t` OK · **MainPID 3801145 sin restart** (reload) |
| Backup / rollback | `/var/backups/ape-deploy/20261028T093843Z` (10 ficheros) |

Hashtags vivos: `ape_gateway 360e4097…` · `ape_uhd b02fbe28…` · `ape_obs afa003ad…` · `ape_luatest 7f5be265…` · `50-ape-meta-plane 6b3c71e7…`.

## Qué quedó en producción

- `declare_auto` **vivo**: 8K solo con `uhd8k=1` **y** nivel HEVC ≥L183 en todas las variantes top; si no, **4K honesto**; marcador `#EXT-X-APE-UPSCALE:…;src=…;can8k=…`; **nunca `-REAL`**; `CODECS` intocable.
- Bypass de la rama `uhd8k=1` **cerrado** (`ok8` obligatorio; `TARGET_8K` y `uhd_mode="8k"` aparecen una sola vez).
- `/_ape/uhd` (loopback) con contadores reales; `/_ape/health` con objeto `uhd`; `/_ape/luatest` **88/88**; `ape_uhd.lua` por fin en el manifiesto (antes nunca se desplegaba).

## Puertas

| Gate | Resultado | Lectura |
|---|---|---|
| G5 luatest | **88/88** | PASS |
| G6 (módulo desplegado, lua5.1) | **5/5** | 4K L183+allow_8k→8K marcado; 4K L153→4K; 8K L153→4K; 1080 AVC→4K; flag off→4K; camino 4K byte-idéntico |
| G7 /cdn/ | 200 manifest · 404 ts/m4s/mp4 | PASS |
| G8 listas | `a464a0c3…` / `db2d034e…` intactas | PASS |
| G9 health | ok/shared_dicts/upstreams_down=0 + `uhd` | PASS |
| `/_ape/uhd` | 200 loopback · **404 en 443** | PASS |
| G10 TTFB | Δ 0,6–1,9 ms | PASS |
| G11 red | bbr/fq/fastopen/slow_start/initcwnd OK; **`rto_min` 0 rutas** | **INFO** — pre-existente (`t36`): `iptv-tcp-autosync` no-op + `ape-net-tuning` replace sin `rto_min`; **no restaurar 40 ms** (RTT 87–122 ms). Requiere ventana propia. |
| G3/G4 guard | **PASS (t35+t37)**: el arnés pide `/cdn/<IP-pública>:8088` en hairpin (SSRF intacto, público 403); 4 pares con cuerpos **servidos reales**; `guard --cases` **exit 0** (`blocker=0`); baseline promovida a `latest.json` **`00bb5e23…`** (pre-fix preservado: `predeploy_20261026T204116Z.json` `b86a4bce…`); `--selftest` **8/8** · guard default **exit 0** | **PASS** |

## Decisión

**No rollback.** Los FAIL no se corrigen revirtiendo nginx y revertir desharía el fix de UHD-09. Registrado como evidencia en `t31` (ver `_vps_stage/edge/uhd/runs/20261028T093843Z/postdeploy_gates.md`).

## Pendiente (no bloquea el cierre)

1. ~~`t35` harness de fixtures~~ **CERRADO**: vía hairpin solo-arnés (cero cambios en nginx/gateway/allowlist), guard `exit 0` con captura post; baseline promovida en `t37` (`latest.json` `00bb5e23…`, pre-fix `b86a4bce…`).
2. Ventana de red (futura, opcional): reparar/retirar los dos mecanismos competidores y dejar una sola fuente de verdad; jamás `rto_min 40 ms` a ciegas.
3. `E10_window/scripts/build_staged.mjs` (parche literal del `declare_auto` viejo): sin impacto runtime; backlog.

## Deuda declarada que el verde NO cubre (B-02 ronda 2)

| Ítem | Qué es | Propuesta |
|---|---|---|
| **UHD-04** | En `master_4k_hevc` se emite marcador `declared=3840x2160` aunque la fuente ya era 4K (marca sin upscale) | Emitir `#EXT-X-APE-UPSCALE` solo si hay upscale real o `can8k=1` |
| **UHD-10/11** | `declare()` no tiene guarda propia; la matriz llama `declare(8K)` por fuera del gateway (t32 cerró la rama, no la función) | Guarda interna en `declare()` (defensa en profundidad) |
| **E5-F7** | Master ascendente (720p→4K): `declare` reescribe la **primera** variante y quedan **dos** 4K declaradas | Seleccionar la(s) variante(s) de `max_resolution`, no la primera |
| **Arnés** | `--promote` solo dispara al capturar; no puede promover un `cases/*.json` existente | Añadir `--promote-from <ruta.json>` |

Los cuatro son **coste €0** y exigen ventana + deploy (los tres de código) o solo arnés (el cuarto).

**Coste de Fase 0: €0.** B-11 (nodo GPU, €423) sigue NO autorizado.
