# WIP EXCLUIDO DEL COMMIT/PUSH (working tree)

Medición: 2026-10-25 · `git status --porcelain` en
`IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` (rama `feat/adb-generic-visual-enhancement-installer`)

**Total: 3.258 entradas** — `M=17`, `D=3.172`, `??=69`.
Nada de esto se commiteó ni se revirtió. Se deja intacto para su sesión dueña.

## 1. Borrados (3.172) — 100 % artefactos de build

Todos bajo rutas `/target/` (crates Rust: `upload-server/target`, `stream_probe_server/target`,
`backup_master_v5.4_phantom_engine/.../target`). **Cero borrados fuera de `/target/`** (verificado
con filtro). No hay pérdida de fuente; es limpieza de artefactos de compilación.

Recomendación: commit propio y explícito (`chore(build): drop target/ artifacts`) y añadir
`**/target/` a `.gitignore` si aún no está cubierto, para que no vuelva a aparecer como ruido.

## 2. Modificados (17) — WIP de otras sesiones/ramas

```
IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/modules/ai_super_resolution_engine.php
IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php
IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/cmaf_engine/modules/ai_super_resolution_engine.php
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-api-wrapper-integrated.js
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/streaming/profile-solver-v9.js
IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8_ultimate_generator.py
IPTV_v5.4_MAX_AGGRESSION/frontend/js/vps-ops-panel.js
IPTV_v5.4_MAX_AGGRESSION/frontend/vps/resolve.php
IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/ai_super_resolution_engine.php
IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/cmaf_engine/modules/ai_super_resolution_engine.php
IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/cmaf_engine/modules/ai_super_resolution_engine.php
_vps_stage/lua/ape_gateway.lua
_vps_stage/lua/ape_header.lua
_vps_stage/lua/ape_uri_rebase.lua
_vps_stage/tests/fanout_concurrency.sh        <-- colisión con contrato Crystal (ver gate §3)
```

Riesgo: 4 de estos archivos (`ai_super_resolution_engine.php` en 4 copias, `resolve_quality_unified.php`,
`m3u8-typed-arrays-ultimate.js`) son exactamente los que la auditoría de alineación (T3–T5) debe
revisar y comparar. **No se tocan durante la auditoría**; las auditorías son read-only y sus
hallazgos se emitirán como propuesta con `archivo:línea`.

## 3. Sin trackear (69)

- `.agents/reports/deploy_*.json` (marcas de despliegue históricas, ~60 archivos)
- `.agent-teams/` (estado local de equipos; no debe versionarse)
- `_map_lua_modules.py` y utilidades sueltas de sesiones previas
- artefactos de auditoría nuevos (`audit/alignment/2026-10-25/**`) que este equipo irá produciendo

Recomendación: `.agent-teams/`, `audit/` y `.agents/reports/deploy_*.json` a `.gitignore`
(decidir con el usuario), o commit separado de documentación al cerrar la auditoría.
