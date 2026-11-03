# DELTA `e38a89b` → `d81ddb3` (Ciclo 2 · medición 2026-10-27)

**Generado:** 2026-10-27T00:18:26.6238779-05:00 · **Método:** salidas literales de `git` volcadas por script (sin transcripción manual).
**Snapshot anterior (ciclo 1):** `e38a89b` · 2026-10-26 03:08:19 -0500
**Snapshot vigente (ciclo 2):** `d81ddb3` · 2026-10-26 23:43:35 -0500 — `d81ddb3aa4badab054db3344b2b201d0663c4566`
**Regla aplicada:** `--refrescar` (`.claude/commands/equipo-10-adn.md:36`): al cambiar HEAD, lo aprendido sobre `e38a89b` deja de ser citable como vigente hasta re-medir.

## 1. Resumen del rango

| Métrica | Valor |
|---|---|
| Commits en el rango | **19** |
| Archivos tocados | **69** |
| Shortstat | ` 69 files changed, 38065 insertions(+), 93 deletions(-)` |
| Generador (numstat) | `552	8	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` |
| Líneas del generador | **11144 → 11688** (+ 544) |

## 2. `git diff --stat e38a89b..d81ddb3` (completo)

```
 .github/workflows/README.md                        |  110 +
 .github/workflows/deploy-vps.yml                   |  373 ++
 COORDENADAS_SESIONES.md                            |  584 +++
 .../backend/resolve_quality_unified.php            |  365 +-
 IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html    |   28 +-
 .../frontend/js/ape-v9/ape-quality-prober.js       |  119 +
 .../frontend/js/ape-v9/generation-controller.js    |   65 +
 .../js/ape-v9/m3u8-api-wrapper-integrated.js       |   32 +-
 .../js/ape-v9/m3u8-typed-arrays-ultimate.js        |  560 +-
 _vps_stage/deploy/README.md                        |   50 +
 _vps_stage/deploy/deploy.sh                        |   70 +
 _vps_stage/deploy/dry-run.sh                       |   41 +
 _vps_stage/deploy/inventory.sh                     |  102 +
 _vps_stage/deploy/lib.sh                           |   47 +
 _vps_stage/deploy/manifest.tsv                     |   16 +
 _vps_stage/deploy/preflight.sh                     |   43 +
 _vps_stage/deploy/rollback.sh                      |   56 +
 _vps_stage/deploy/sha256.js                        |   19 +
 .../dryrun_remote_hashes_20261026T181213Z.txt      |    9 +
 .../dryrun_remote_hashes_20261026T181245Z.txt      |    9 +
 .../dryrun_remote_hashes_20261026T181307Z.txt      |    9 +
 .../dryrun_remote_hashes_20261026T181333Z.txt      |    9 +
 .../dryrun_remote_hashes_20261026T181416Z.txt      |    9 +
 .../deploy/snapshots/inventory_20261026T130832.txt | 4706 +++++++++++++++++
 _vps_stage/deploy/validate.sh                      |   33 +
 _vps_stage/deploy/verify.sh                        |   78 +
 _vps_stage/lua/ape_edge_health.lua                 |   60 +
 _vps_stage/lua/ape_gateway.lua                     |  287 +-
 _vps_stage/lua/ape_header.lua                      |  130 +-
 _vps_stage/lua/ape_prefetch_next.lua               |  143 +
 _vps_stage/lua/ape_rebase_lib.lua                  |   27 +-
 _vps_stage/lua/ape_uri_rebase.lua                  |   80 +-
 _vps_stage/nginx/ape-meta-staging.conf             |   28 +
 _vps_stage/tests/T46_cache_first_measurement.md    |  225 +
 _vps_stage/tests/adn_pin_assert.js                 |  310 ++
 _vps_stage/tests/ape_ai_headers_assert.js          |  259 +
 _vps_stage/tests/audio_codec_assert.js             |  117 +
 _vps_stage/tests/cache_first_bench.sh              |  643 +++
 _vps_stage/tests/cartridge_assert.js               |  137 +
 _vps_stage/tests/channel_alive_assert.js           |  171 +
 _vps_stage/tests/direct_mode_assert.js             |  450 ++
 _vps_stage/tests/edge_doctrine_assert.js           |  133 +
 _vps_stage/tests/emitter_level_assert.js           |  349 ++
 _vps_stage/tests/exthttp_payload_assert.js         |  178 +
 _vps_stage/tests/fake_ai_headers_assert.js         |  303 ++
 _vps_stage/tests/fake_uhd_assert.js                |  304 ++
 _vps_stage/tests/fanout_concurrency.sh             |   23 +
 _vps_stage/tests/fuse_edge_assert.js               |  841 +++
 _vps_stage/tests/fuse_resolver_assert.js           |  308 ++
 _vps_stage/tests/quality_denomination_assert.js    |  209 +
 _vps_stage/tests/ratio_assert.js                   |  201 +
 .../regen_headless/_t70/mixed_hevc_avc_6_4K.m3u8   |   77 +
 .../_t70/regen_multilist_report.json               |  112 +
 .../regen_headless/_t84/mixed_hevc_avc_6_4K.m3u8   | 5441 +++++++++++++++++++
 .../_t84/regen_multilist_report.json               |  116 +
 .../regen_headless/_t86/mixed_hevc_avc_6_4K.m3u8   | 5453 +++++++++++++++++++
 .../_t86/regen_multilist_report.json               |  116 +
 .../tests/regen_headless/fixtures/mini_15.m3u8     |   31 +
 .../regen_headless/fixtures/mini_inherit_6.m3u8    |   37 +
 .../regen_headless/fixtures/mini_inherit_6_4K.m3u8 | 5459 ++++++++++++++++++++
 .../regen_headless/fixtures/mini_inherit_6_8K.m3u8 | 5447 +++++++++++++++++++
 .../regen_headless/fixtures/mixed_hevc_avc_6.m3u8  |   26 +
 _vps_stage/tests/regen_headless/regen_headless.js  |  819 +++
 _vps_stage/tests/resolver_blockers_assert.js       |  231 +
 _vps_stage/tests/secret_scan_assert.js             |  478 ++
 _vps_stage/tests/single_variant_assert.js          |  165 +
 _vps_stage/tests/wrapper_url_assert.js             |  214 +
 docs/edge/EDGE_EGRESS_RESOLVER.md                  |  312 ++
 tools/session-guard.js                             |  166 +
 69 files changed, 38065 insertions(+), 93 deletions(-)
```

## 3. `git log --oneline e38a89b..d81ddb3` (19 commits)

```
d81ddb3 ci(staging): mode=staging levanta el 8089 con no-cambio de produccion y rollback (t105)
0369f04 feat(edge): egress retry on 407 + staging vhost 8089 + AUTO-AJUSTAR button (t104)
7587783 feat(resolver): decision por R medido (t103)
5ee97cd feat(qoe): métrica R (duración/descarga) con 6 bandas, predicción y bitrate objetivo + gate (t102)
d97c258 docs(edge): 407 puede ser canal muerto + 200 del resolver no prueba canal vivo (t101)
0900b13 docs(edge): egress/resolver decision + mandatory alert headers + doctrine guard (t100)
851b960 chore(frontend): bump ?v= del emisor a 20261026-audio-truth (carga el fix de audio por evidencia)
30c5144 fix(audio): CODECS from probe evidence only, no audio when unknown (t97)
30c9430 docs(coordinacion): regla irrevocable de despliegue por GitHub Actions (commit->push->deploy con aprobacion)
33a6825 fix(edge): reparar la linea JSON rota del parche SSRF t95 (luac5.1 -p pasa en el VPS)
0b3f687 fix(ci): verify only measured endpoints, exit 0/2/3 (t92)
35ec04e fix(ci): dry-run checks /lists/ dir, not a fixed list name (t92)
590cfb1 fix(ci): unify SSH target and harden exit codes in dry-run (t92)
7f1c939 feat(deploy): pipeline CI/CD del VPS (_vps_stage/deploy, 11 ficheros) que el workflow necesita
ac794b5 fix(ci): 5 correcciones del workflow (sin listas, VPS_USER, stamp entre jobs, verify en dry-run) y README con el naming real
ea06e68 feat(ci): workflow de despliegue VPS (solo codigo/Lua, sin listas) con aprobacion y rollback
7a22933 feat(resolver): cartucho por perfil con fusible activo (fuse_bps <= design_bps)
931d27e feat(ui): interruptor de Modo DIRECTO + los dos metodos cableados
e1c749e feat(generator): 4K fake-UHD por defecto, denominaciones deterministas y toxicos 6/6
```

## 4. `git diff --name-status e38a89b..d81ddb3` (69 archivos)

```
A	.github/workflows/README.md
A	.github/workflows/deploy-vps.yml
A	COORDENADAS_SESIONES.md
M	IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
M	IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html
M	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-quality-prober.js
M	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-controller.js
M	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js
M	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
A	_vps_stage/deploy/README.md
A	_vps_stage/deploy/deploy.sh
A	_vps_stage/deploy/dry-run.sh
A	_vps_stage/deploy/inventory.sh
A	_vps_stage/deploy/lib.sh
A	_vps_stage/deploy/manifest.tsv
A	_vps_stage/deploy/preflight.sh
A	_vps_stage/deploy/rollback.sh
A	_vps_stage/deploy/sha256.js
A	_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261026T181213Z.txt
A	_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261026T181245Z.txt
A	_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261026T181307Z.txt
A	_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261026T181333Z.txt
A	_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261026T181416Z.txt
A	_vps_stage/deploy/snapshots/inventory_20261026T130832.txt
A	_vps_stage/deploy/validate.sh
A	_vps_stage/deploy/verify.sh
A	_vps_stage/lua/ape_edge_health.lua
M	_vps_stage/lua/ape_gateway.lua
M	_vps_stage/lua/ape_header.lua
A	_vps_stage/lua/ape_prefetch_next.lua
M	_vps_stage/lua/ape_rebase_lib.lua
M	_vps_stage/lua/ape_uri_rebase.lua
A	_vps_stage/nginx/ape-meta-staging.conf
A	_vps_stage/tests/T46_cache_first_measurement.md
A	_vps_stage/tests/adn_pin_assert.js
A	_vps_stage/tests/ape_ai_headers_assert.js
A	_vps_stage/tests/audio_codec_assert.js
A	_vps_stage/tests/cache_first_bench.sh
A	_vps_stage/tests/cartridge_assert.js
A	_vps_stage/tests/channel_alive_assert.js
A	_vps_stage/tests/direct_mode_assert.js
A	_vps_stage/tests/edge_doctrine_assert.js
A	_vps_stage/tests/emitter_level_assert.js
A	_vps_stage/tests/exthttp_payload_assert.js
A	_vps_stage/tests/fake_ai_headers_assert.js
A	_vps_stage/tests/fake_uhd_assert.js
M	_vps_stage/tests/fanout_concurrency.sh
A	_vps_stage/tests/fuse_edge_assert.js
A	_vps_stage/tests/fuse_resolver_assert.js
A	_vps_stage/tests/quality_denomination_assert.js
A	_vps_stage/tests/ratio_assert.js
A	_vps_stage/tests/regen_headless/_t70/mixed_hevc_avc_6_4K.m3u8
A	_vps_stage/tests/regen_headless/_t70/regen_multilist_report.json
A	_vps_stage/tests/regen_headless/_t84/mixed_hevc_avc_6_4K.m3u8
A	_vps_stage/tests/regen_headless/_t84/regen_multilist_report.json
A	_vps_stage/tests/regen_headless/_t86/mixed_hevc_avc_6_4K.m3u8
A	_vps_stage/tests/regen_headless/_t86/regen_multilist_report.json
A	_vps_stage/tests/regen_headless/fixtures/mini_15.m3u8
A	_vps_stage/tests/regen_headless/fixtures/mini_inherit_6.m3u8
A	_vps_stage/tests/regen_headless/fixtures/mini_inherit_6_4K.m3u8
A	_vps_stage/tests/regen_headless/fixtures/mini_inherit_6_8K.m3u8
A	_vps_stage/tests/regen_headless/fixtures/mixed_hevc_avc_6.m3u8
A	_vps_stage/tests/regen_headless/regen_headless.js
A	_vps_stage/tests/resolver_blockers_assert.js
A	_vps_stage/tests/secret_scan_assert.js
A	_vps_stage/tests/single_variant_assert.js
A	_vps_stage/tests/wrapper_url_assert.js
A	docs/edge/EDGE_EGRESS_RESOLVER.md
A	tools/session-guard.js
```

## 5. Generador: --numstat y líneas antes/después

```
552	8	IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

| Coordenada | Valor |
|---|---|
| `e38a89b` blob | `c1277bdfdc46debfc762eb86e22f77b85b66e250` · 707.323 B · **11144 líneas** |
| `d81ddb3` blob | `b7b594467c6ebc2df61b01515bbc288b3a0ee570` · 741.881 B · **11688 líneas** |
| Δ líneas | **+544** (numstat declarado: +552 / −8) |

**Nota de EOL (medida):** el blob de HEAD usa **LF**; el archivo del worktree usa **CRLF**. El `sha256` del archivo del WT (`844f654b…`) **no** es comparable con el del blob (`594b3848…`); al normalizar el WT a LF el hash coincide exactamente con el blob ⇒ **el generador del WT es idéntico a HEAD** (no hay cambio sin commitear). Quien compare `wt_sha256` contra el hash del blob sin normalizar reportará una divergencia falsa.

## 6. ¿Qué archivos auditados cambiaron?

| Archivo auditado | ¿Cambió en el rango? | numstat |
|---|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | **SÍ** | `+552 / −8` |
| `frontend/index-v4.html` | **SÍ** | `+20 / −8` |
| `frontend/js/ape-v9/ape-quality-prober.js` | **SÍ** | `+119 / −0` |
| `backend/resolve_quality_unified.php` | **SÍ** | `+327 / −38` |
| `_vps_stage/lua/ape_header.lua` | **SÍ** | `+128 / −2` |
| `_vps_stage/lua/ape_uri_rebase.lua` | **SÍ** | `+78 / −2` |
| `frontend/js/ape-v9/ape-fallback-resolver.js` | no | `0 / 0` (blob `228b8693` idéntico) |
| `frontend/vps/resolve.php` | no en el rango | `0 / 0` — **pero está `M` en el worktree** (cambio sin commitear) |
| `vps/nginx/lua/combined_body_filter.lua` | no | `0 / 0` |
| `vps/nginx/lua/ape_wake_on_manifest.lua` | no | `0 / 0` |
| `_vps_stage/lua/ape_wake_on_manifest.lua` | no | `0 / 0` (las 2 copias son idénticas: blob `6274fa82`) |

**Lectura:** de los 11 archivos auditados, **6 cambiaron**; los 5 restantes son byte-idénticos, de modo que los hallazgos anclados en ellos siguen siendo válidos sin re-anclar (salvo `resolve.php`, que tiene WIP sin commitear).
