# SECURITY_REMEDIATION — Plan de remediación de la fuga de credenciales

**Task:** t16 · **Owner del plan:** `json-ssot` · **Fecha:** 2026-10-25 (America/Bogota)
**Naturaleza:** **PLAN — nada ejecutado**. Cero rewrite de historial, cero push, cero borrado/modificación de
`channels_map.json`, cero `git filter-branch`. Los valores de credenciales **no se transcriben**: se enmascaran
a 3 caracteres (`abc***`).

**Repo objetivo (público):** `https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION.git`
· HEAD auditado `d322eb2` · rama de trabajo `feat/adb-generic-visual-enhancement-installer` · `origin/HEAD → origin/master`

---

## 0. Resumen ejecutivo (lo que hay que decidir y en qué orden)

| # | Hecho medido | Implicación |
|---|---|---|
| 1 | El repo es **público** y las credenciales de canal están en él **desde el commit inicial (2026-03-17)** → **222 días** de exposición | **Rotar primero, purgar después.** La purga no "des-expone" lo que ya fue clonado/indexado |
| 2 | `channels_map.json` contiene **9.293 pares usuario/contraseña** pero sólo **3 pares DISTINTOS** (9.293 canales sobre 3 proveedores) | La rotación es **barata**: 3 credenciales, no 9.293 |
| 3 | Hay **8 rutas trackeadas con credenciales REALES del SSOT** (no sólo `channels_map.json`), incluidas **2 rutas `.wrangler` con 3.455 URLs cada una** y un `config_retry.json` con 2 pares | La purga debe cubrir **todas**, no sólo el archivo señalado |
| 4 | `OMEGA_UPDATE/fallback_proxy_production.php` tiene **5.973 URLs** con un par **sintético/placeholder** (host `use***`) | Prioridad baja: no son credenciales del proveedor actual; aun así, purgar |
| 5 | `git filter-repo` **no está instalado** (sí Python 3.12 y pip) | El plan incluye el paso de instalación |
| 6 | El `.git` pesa **602,6 MB** (pack 565,09 MiB) y los blobs con credenciales aportan **≈130 MB** | La purga además alivia el repo |

**Orden recomendado (no negociable):** **§5 Rotación → §3 Purga → §4 Variante redactada → re-publicación.**

---

## 1. Alcance exacto (medido, sin valores)

**Método:** enumeración de archivos **trackeados** con `git ls-files` (11.994), filtro por extensión de
código/texto (8.027 candidatos), lectura acotada (7.512 leídos; 1 omitido por >40 MB = el propio
`channels_map.json`, medido aparte por streaming) y 5 patrones: URL Xtream con `user/pass` en el path,
`"username"`, `"password"`, `userinfo` en URL (`scheme://<user>:<pass>@`), y tokens (`ghp_`, `AKIA…`, `BEGIN … PRIVATE KEY`,
`Bearer`) — **estos últimos: 0 hallazgos**.
Clasificación: se compara cada par `(user,pass)` hallado contra el conjunto de pares del SSOT
(`channels_map.json`, construido en memoria) → `SSOT_CREDENTIALS` = coincide; `NON_SSOT` = no coincide.
Evidencia: `tools/credential_scope.json`, `tools/credential_addendum.json`, `tools/xtream_field_map.mjs`.

### 1.1 Credenciales REALES del SSOT (8 rutas trackeadas)

| # | Ruta trackeada | Bytes | Pares | URLs con `user/pass` | Coinciden con SSOT | Añadido | ¿En `origin/master`? |
|---|---|---:|---:|---:|---:|---|---|
| 1 | `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` | 75.107.356 (worktree) / **72.839.863** (blob HEAD) | **9.293** | **27.879** (`url_m3u8` 9.293 · `url_ts` 9.293 · `degradation_chain` 9.293) | sí (3 pares distintos, 3 hosts) | **2026-03-17** | **sí** |
| 2 | `IPTV_v5.4_MAX_AGGRESSION/frontend/.wrangler/state/v3/r2/apelistv2/blobs/614147…b588f62…bf7` | 17.754.555 | 1 | 3.455 | **100 %** | **2026-03-17** | **sí** |
| 3 | `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/.wrangler/…/614147…bf7` | (mismo blob `f451dd59…` → **objeto único**, 2 rutas) | 1 | 3.455 | **100 %** | 2026-03-17 | sí |
| 4 | `IPTV_v5.4_MAX_AGGRESSION/backend/health/config_retry.json` | 1.179 | **2** (`3JH***/U56***` len 6 · `sjU***/Knd***` len 10) | — | **sí (prefijos = SSOT)** | **2026-05-12** | **sí** |
| 5 | `.claude/settings.json` | 4.706 | 2 | 17 | 7 URLs | 2026-05-12 | sí |
| 6 | `docs/CDN_REWRAP_WIRING.md` | — | 2 (1 real, 1 placeholder) | 2 | 1 | **2026-10-24** | no (sólo HEAD) |
| 7 | `stream_health_monitor.sh` | — | 1 | 1 | 1 | 2026-03-28 | sí |
| 8 | `IPTV_v5.4_MAX_AGGRESSION/backend/generate_test_m3u8.js` | — | 1 | 1 | 1 | 2026-05-12 | sí |

### 1.2 Credenciales REALES pero **NO** del SSOT (revisión del owner, purgar igual)

| Ruta | Bytes | Hallazgo | Añadido | En master |
|---|---:|---|---|---|
| `OMEGA_UPDATE/fallback_proxy_production.php` | 647.923 | **5.973 URLs**, 1 par, host `use***` (100 % placeholders/sintético) | 2026-04-02 | sí |
| `_vps_stage/media/ape-ingest.sh` | 125.321 | 4 URLs Xtream + **7 `userinfo`** (`http://mfu***:SUP***@`) | **2026-10-25** | **no (sólo HEAD)** |
| `_vps_stage/tests/fanout_concurrency.sh` | 99.666 | 2 `userinfo` | 2026-10-25 | no (sólo HEAD) |
| `_vps_stage/lua/ape_caps.lua` | 128.983 | 1 `userinfo` | 2026-10-25 | no (sólo HEAD) |
| `_vps_stage/scripts/smoke.sh` | 8.810 | 4 URLs (placeholder `use***`) | 2026-10-25 | no (sólo HEAD) |
| `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/fixture_mini.json` | 22.547 | 2 URLs (host no-SSOT) | 2026-04-26 | sí |
| `IPTV_v5.4_MAX_AGGRESSION/backend/omega_ecosystem_v5.1/fallback_proxy.php` · `…/v5.2/fallback_proxy.php` (+2 copias en `backup_master_v5.4_phantom_engine/`) | — | 2 URLs cada uno | 2026-04 | sí |
| `.gemini/settings/shielded-architecture.md` · `.agent/skills/credenciales_ssot_end_to_end_port_binding/SKILL.md` · `…/shielded_architecture_immutable/*` · `.agents/rules/shielded*.md` (y copias en `.agents/_archive_20260516_bogus_stubs/`) | — | 2–4 URLs de ejemplo cada uno | 2026-03/05 | sí |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/parsers/fixtures/*.m3u` · `…/frontend/tests/e2e-bulletproof.spec.js` · `frontend/js/ape-v9/test_generator.js` · `backend/atomic_probe.php` · `backend/inject_fallbacks.js` · `generate_credential_flow.py` · `e2e_multi_server_fire_test.js` · `ape-cdn-rewrap.js` · `ape-anle/anle-tests.js` · `lab-vba/extension/build_fixture.ps1` | — | 1–3 URLs de ejemplo | 2026-03…06 | sí |
| `IPTV_v5.4_MAX_AGGRESSION/backups/prisma_v1.0_20260427_195945/vps/prisma/prisma_processor.php` · `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/prisma_processor.php` | — | 1 URL cada uno | 2026-04 | sí |

### 1.3 Falsos positivos verificados (NO requieren acción)

| Ruta | Por qué |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/backend/health/config.example.json` | `username`/`password` = `REE***` (15 chars) → **placeholder** |
| `docs/RECOVERY_CONFIG_PERSISTENCIA.md` | `username`/`password` = 3 chars (`***`) → placeholder |
| `docs/manifestos/*`, skills narrativas con `{user}`/`{pass}` | plantillas |
| Tokens de plataforma (`ghp_`, `AKIA…`, `BEGIN … PRIVATE KEY`, `Bearer`) | **0 archivos** en todo el árbol trackeado |

### 1.4 Directorios nombrados en la tarea

| Directorio | Archivos trackeados | Hallazgo |
|---|---:|---|
| `_vps_stage/` | **44** | 4 archivos con datos sensibles (§1.2), **añadidos hoy 2026-10-25**, **no están en `origin/master`** → corregibles sin purga de historial remoto |
| `vps_configs/` | **7** | **0 credenciales** en el escaneo |
| `backend/` | (subárbol) | `health/config_retry.json` (2 pares reales), `omega_ecosystem_v5.1|v5.2/fallback_proxy.php` (2 cada uno), `generate_test_m3u8.js` (1 real), `atomic_probe.php` (ejemplo) |

**Nada de esto está cubierto por `.gitignore`** (comprobado con `git check-ignore`: `channels_map.json`,
`.wrangler/`, `OMEGA_UPDATE/`, `.claude/settings.json`, `_vps_stage/` → **NOT IGNORED**). El único ignorado hoy
es `lab_master_22.6.0.json` (`.gitignore:149`).

---

## 2. Ventana de exposición (fechada)

| Dato | Valor medido | Comando |
|---|---|---|
| Commit que **añade** `channels_map.json` | `e425b3cd7fca004651a81aa7737fcf287d066408` · **2026-03-17T06:54:52-05:00** · "v5.4 MAX AGGRESSION - Initial commit" | `git log --follow --diff-filter=A --format='%H|%ad|%s' --date=iso-strict -- <ruta>` |
| Último commit que lo toca | `0b9c11145ebedda01bb9af2a3242c04dfa8ee529` · **2026-06-15T19:20:26-05:00** | `git log -1 --format='%H|%ad' --date=iso-strict -- <ruta>` |
| Commits que lo tocan | **3** (`e425b3c`, `a10edeb`, `0b9c111`) | `git log --all --oneline -- <ruta>` |
| Revisiones (blobs) | **57.385.603 B** (inicial) → **72.839.863 B** (`a10edeb` y `0b9c111` comparten blob `f3fbe950…`) | `git log --all --format=%H -- <ruta>` + `git cat-file -s` |
| Rama por defecto del remoto | `origin/master` → **contiene el archivo** | `git symbolic-ref refs/remotes/origin/HEAD` · `git cat-file -e origin/master:<ruta>` |
| Tags que contienen el commit inicial | `audit-92-omega-premium-2026-04-26`, `v22.3-OMEGA-FUSION-FINAL`, `v22.3.1-OMEGA-FUSION-HOTFIX` | `git tag --contains e425b3c` |
| **Exposición acumulada** | **222 días** (2026-03-17 → 2026-10-25) en **repo público** | cálculo sobre las fechas anteriores |
| Otros focos | `.wrangler` blob: 2026-03-17 (**222 d**) · `stream_health_monitor.sh`: 2026-03-28 (211 d) · `.claude/settings.json` y `config_retry.json` y `generate_test_m3u8.js`: 2026-05-12 (166 d) · `OMEGA_UPDATE/…`: 2026-04-02 (206 d) · `docs/CDN_REWRAP_WIRING.md` y `_vps_stage/*`: **2026-10-24/25 (≤1 d, aún no en master)** | idem por ruta |
| Tamaño del repo | `.git` **602,6 MB** · pack **565,09 MiB** · 392 commits | `git count-objects -vH` · tamaño de `.git` |

**Lectura de riesgo:** 222 días en un repo público con 3 credenciales válidas de proveedor ⇒ **asumir
compromiso**. Rotar no es opcional; purgar historial es higiene, no contención.

---

## 3. Plan de purga de historial (NO ejecutado — comandos literales)

> **Herramienta elegida:** `git filter-repo` (mantenida, determinista, procesa todo el historial).
> **No se usa `git filter-branch`** (deprecado, lento, propenso a dejar refs colgando).
> `git filter-repo` **no está instalado** en esta máquina (verificado); sí Python 3.12 + pip.

### 3.0 Precondiciones (bloqueantes — no seguir si alguna falla)

```bash
# P1. Congelar escrituras: avisar en el tablero y confirmar que ninguna sesión hará commit/push durante la ventana.
#     (hoy hay otras 3-4 sesiones activas sobre este working tree)
git status --porcelain            # debe revisarse y commitearse/stashearse lo ajeno ANTES (no lo decide este plan)

# P2. Backups. TRES copias independientes, verificadas:
git clone --mirror "C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION" "D:/backups/IPTV_mirror_20261025.git"
git -C "D:/backups/IPTV_mirror_20261025.git" fsck --full
git bundle create "D:/backups/IPTV_all_refs_20261025.bundle" --all
git bundle verify "D:/backups/IPTV_all_refs_20261025.bundle"

# P3. Inventario de refs ANTES (para comparar después):
git for-each-ref --format='%(refname) %(objectname)' > "D:/backups/refs_before.txt"

# P4. Herramienta:
python -m pip install --user git-filter-repo
git filter-repo --version          # debe imprimir versión

# P5. Aviso a terceros: la purga invalida TODOS los clones y forks (ver §3.5)
```

### 3.1 Copia de trabajo para el rewrite

```bash
git clone --no-local "D:/backups/IPTV_mirror_20261025.git" "D:/work/IPTV_purge_20261025"
cd "D:/work/IPTV_purge_20261025"
```

`--no-local` garantiza que se trabaja sobre una copia real (no hardlinks al mirror).

### 3.2 Purga de rutas (blobs con credenciales)

```bash
git filter-repo --force \
  --invert-paths \
  --path "IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json" \
  --path "IPTV_v5.4_MAX_AGGRESSION/frontend/.wrangler/state/v3/r2/apelistv2/blobs/614147d52282ffb553e0dea375ca9c4279295d05811fc14e27b46db20b588f620000019ba90bdfb7" \
  --path "IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/.wrangler/state/v3/r2/apelistv2/blobs/614147d52282ffb553e0dea375ca9c4279295d05811fc14e27b46db20b588f620000019ba90bdfb7" \
  --path "OMEGA_UPDATE/fallback_proxy_production.php" \
  --path "IPTV_v5.4_MAX_AGGRESSION/backend/health/config_retry.json" \
  --path ".claude/settings.json" \
  --path "docs/CDN_REWRAP_WIRING.md" \
  --path "stream_health_monitor.sh" \
  --path "IPTV_v5.4_MAX_AGGRESSION/backend/generate_test_m3u8.js" \
  --path "_vps_stage/media/ape-ingest.sh" \
  --path "_vps_stage/tests/fanout_concurrency.sh" \
  --path "_vps_stage/lua/ape_caps.lua" \
  --path "_vps_stage/scripts/smoke.sh"
```

**Nota importante:** `--invert-paths` **borra** esos archivos de **todo** el historial. Los que siguen siendo
necesarios en el árbol (`config_retry.json`, `.claude/settings.json`, `stream_health_monitor.sh`,
`generate_test_m3u8.js`) **se vuelven a añadir ya saneados** en un commit nuevo (§4). Si el owner prefiere
conservar el historial de esos 4 archivos, ejecutar dos pasadas: primero la purga de los 9 blobs "sólo datos"
(`channels_map.json`, 2 `.wrangler`, `OMEGA_UPDATE/…`, `docs/CDN_REWRAP_WIRING.md`, `_vps_stage/*`) y luego
`--replace-text` para los otros (ver §3.3).

### 3.3 Variante "sanear sin borrar" (para los 4 archivos que deben seguir existiendo)

```bash
# expressions.txt — un reemplazo por línea; NUNCA commitear este archivo
cat > "D:/work/expressions.txt" <<'EOF'
regex:(https?://[^/\s"']+/live/)[^/\s"']+/[^/\s"']+/(\d+\.m3u8)  ==>  \1__USER__/__PASS__/\2
regex:("(?:username|password)"\s*:\s*")[^"]+(")                     ==>  \1__REDACTED__\2
EOF
git filter-repo --force --replace-text "D:/work/expressions.txt"
```

> El patrón de reemplazo **preserva la estructura** (los `\1`, `\2`) y sustituye el secreto por un marcador.
> Tras la purga, **borrar** `expressions.txt` (`Remove-Item`) y no dejarlo en el repo.

### 3.4 Post-condiciones de verificación (todas deben pasar)

```bash
# V1. Ninguna referencia al archivo en NINGÚN commit de NINGUNA ref:
git log --all --oneline -- "IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json"   # → vacío
git log --all --oneline -- "*channels_map.json"                                    # → vacío
git log --all --oneline -- "*fallback_proxy_production.php"                        # → vacío

# V2. El árbol actual no lo contiene:
git ls-files | grep -c "channels_map.json"                                         # → 0
git ls-files | grep -c "\.wrangler/state/v3/r2/apelistv2/blobs"                    # → 0

# V3. El/los blobs con credenciales ya no existen:
git cat-file -e f3fbe95057aecf34f8eb22a9a6c4375ca06e4630 2>/dev/null || echo "blob purgado OK"
git cat-file -e f451dd59dfd3dec8f0d10bb0f331d722aabfa459 2>/dev/null || echo "blob wrangler purgado OK"

# V4. Ningún objeto del grafo menciona la ruta:
git rev-list --objects --all | grep -c "channels_map.json"                          # → 0

# V5. Recolección y tamaño:
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git count-objects -vH            # comparar contra el "size-pack 565.09 MiB" de referencia
git fsck --full --no-progress    # sin "dangling"/"missing" inesperados
```

### 3.5 Publicación (force-push) y efectos colaterales

```bash
# El rewrite cambia TODOS los SHA. Forzar todas las ramas y tags:
git remote add origin "https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION.git"
git push --force --all origin
git push --force --tags origin
```

- **Invalida todos los clones y forks.** Avisar antes (P5) y publicar la nueva instrucción: `git fetch --all
  && git reset --hard origin/master` o re-clonar.
- GitHub **retiene objetos inalcanzables** tras un force-push hasta que su GC corre. Abrir ticket a **GitHub
  Support** pidiendo "purge cached views and unreachable objects" para el repo, citando que contiene
  credenciales de proveedor (no hace falta reproducir el secreto en el ticket: basta ruta + commit).
- Revisar forks con `gh api repos/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/forks --jq '.[].full_name'`
  y pedir borrado o re-clonado; los forks **conservan** el historial.
- Verificar tras el push: `git ls-remote origin | head` y volver a clonar en un directorio temporal para
  correr **V1–V4** sobre el clon fresco.

### 3.6 Rollback (si algo sale mal)

```bash
# El mirror del paso P2 es la fuente de verdad. Restauración total:
cd "D:/work/IPTV_purge_20261025"
git remote set-url origin "D:/backups/IPTV_mirror_20261025.git"
git fetch --all
git push --force --all origin          # devuelve el estado previo al mirror
# y en el remoto real: re-publicar desde el mirror
git -C "D:/backups/IPTV_mirror_20261025.git" push --force --all \
  "https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION.git"
```

**Punto de no retorno:** el `git push --force` (§3.5). Antes de ese paso, el rollback es trivial
(descartar `D:/work/IPTV_purge_20261025`). Después, el rollback exige re-force-push desde el mirror.

---

## 4. Variante redactada de `channels_map.json`

### 4.1 Qué consume realmente la APP (medido, no asumido)

| Consumidor | ¿Lee `frontend/channels_map.json`? | Evidencia |
|---|---|---|
| Generador M3U8 (`frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`) | **NO**. Sólo emite un tag literal: `#EXT-X-APE-DNA-MAP-SOURCE:channels_map_v5.4_MAX_AGGRESSION` | `m3u8-typed-arrays-ultimate.js:6172` (y comentario en `:11536`) |
| `ape-profiles-config.js` / emisores | **NO** — su SSOT es `lab_master_22.6.0.json` | `APP_SSOT_BINDINGS.md` (t6): única ingestión `importFromLABData()` `ape-profiles-config.js:4639` |
| `frontend/js/ape-v9/generate_doc.js` | **NO** — lo menciona en texto de un DOCX | `generate_doc.js:74,128,185` |
| `backend/rq_dynamic_channel_map.php` | **NO** — construye el mapa **desde la API Xtream** con `$user`/`$pass` recibidos por parámetro, y cachea el resultado | `rq_dynamic_channel_map.php:74-75` (`@param $user/$pass`), `:414-415` (`player_api.php?username=…&password=…`), `:253-256` (lee su **propio** cache, no este JSON) |
| Motores CMAF (`cmaf_orchestrator.php`, `lista_guardian_engine.php`, `resilience_engine.php`) | **NO** leen el JSON: leen `$channelDna['url_ts'] / ['url_hls'] / ['url']` de un array en runtime | `cmaf_orchestrator.php:422-423` · `lista_guardian_engine.php:224` · `resilience_engine.php:234` |
| Cualquier `file_get_contents`/`fetch`/`readFileSync` sobre ese path | **NO existe** | `git grep` combinado loader+`channels_map` → **0 coincidencias** |

**Conclusión dura:** `frontend/channels_map.json` **es un artefacto de datos, no una dependencia de ejecución**.
Ningún código trackeado lo abre. Por tanto, quitar de él `username`, `password`, `url_m3u8`, `url_ts` y las URLs
de `degradation_chain` **no rompe el generador**.

### 4.2 Campos a eliminar / sustituir

**ELIMINAR (contienen secreto o URL con secreto) — 5 campos por registro:**

| Campo | Contenido | Acción |
|---|---|---|
| `username` | usuario Xtream | **ELIMINAR** |
| `password` | contraseña Xtream | **ELIMINAR** |
| `url_m3u8` | `{server}/live/{user}/{pass}/{id}.m3u8` | **ELIMINAR** (o dejar `url_m3u8_template` con placeholders) |
| `url_ts` | idem `.ts` | **ELIMINAR** |
| `degradation_chain` | array/objeto con URLs que incluyen `user/pass` | **SANEAR**: sustituir cada URL por su plantilla (`…/live/__USER__/__PASS__/{id}.m3u8`) o eliminar el campo si no se consume |

**SUSTITUIR (no es secreto, pero identifica al proveedor):**

| Campo | Hoy | Propuesta |
|---|---|---|
| `server` | `http://host:port` del proveedor | `server_id` (`"srv_1"`, `"srv_2"`, `"srv_3"`) + tabla externa `server_ref` **fuera del repo** |
| `origin` / `referer` | host del proveedor (no secreto) | mantener (ya verificado: `origin` apunta al proveedor, no al VPS) |
| `tvg_logo` | URLs con host del proveedor | mantener (público) |

**MANTENER sin cambios (169 − 5 = 164 campos):** `slug`, `label`, `tvg_id`, `tvg_logo`, `group`, `stream_id`,
`profile`, `quality_level`, `resolution`, `res_w`, `res_h`, `bandwidth`, `avg_bandwidth`, `codec_priority`,
`codec_rfc6381`, `hdr_*`, `dolby_vision_*`, `hlg_enabled`, `color_primaries`, `transfer_characteristics`,
`lcevc_*`, `ai_sr_*`, `bwdif_enabled`, `nnedi3_enabled`, `temporal_sr_enabled`, `vqs_*`, `quality_profile`,
`telchemy_*`, `tvqm_*`, `tr101290_*`, `cmaf_*`, `segment_*`, `playlist_type`, `target_duration`, `ext_x_*`,
`degradation_levels`, `current_level`, `player_profile`, `stream_inf_enabled`, `exthttp_enabled`,
`extvlcopt_enabled`, `kodiprop_enabled`, `cdn_primary/backup/backup2` (si son hosts, no URLs con credenciales
— **verificar antes**), `cdn_routing_mode`, `circuit_breaker_*`, `health_probe_interval`, `failover_threshold`,
`hydra_stealth_enabled`, `dpi_evasion_enabled`, `stealth_ua`, `abr_*`, `quantum_pixel_overdrive`,
`content_aware_hevc`, `motor_dinamico_mpd`, `antigravity_mode`, `god_mode_zero_drop`, `ape_*`, `drm_*`,
`token_auth_enabled`, `geo_restriction`, `x_forwarded_for`, `custom_header_*`, `probe_timeout`, `buffer_size`,
`reconnect_*`, `low_latency_mode`, `live_edge_segments`, `max_buffer_duration`, `network_*`, `latency_estimate`,
`jitter_estimate`, `packet_loss_rate`, `connection_type`, `catchup_*`, `math_telemetry`, `fusion_directives`,
`cod`/`guardian_*`, `qos_*`, `qoe_*`, `buffer_*`, `prebuffer_secs`, `memory_*`, `net_avg_*`, `resilience_*`,
`sync_*`, `interdependency`.

### 4.3 Forma propuesta de un registro (sin secretos)

```json
{
  "al__rtk_3_4k_30": {
    "slug": "al__rtk_3_4k_30",
    "label": "RTK 3 4K",
    "tvg_id": "…",
    "group": "…",
    "stream_id": "30",
    "server_id": "srv_2",
    "url_ref": "/rq/dynamic_channel_map?channel=al__rtk_3_4k_30&format=m3u8",
    "profile": "P2",
    "quality_level": "4K",
    "resolution": "4K",
    "res_w": 3840, "res_h": 2160,
    "bandwidth": 60000000,
    "codec_rfc6381": "hvc1.2.4.L150.B0",
    "hdr_profile": "sdr",
    "…": "resto de campos técnicos sin credenciales"
  }
}
```

- `url_ref` apunta a un **resolvedor server-side** (ya existe la pieza:
  `backend/rq_dynamic_channel_map.php` construye la URL desde la API Xtream con las credenciales guardadas
  **fuera del repo** y cachea el resultado).
- Las credenciales viven en `vps/prisma/config/*.json` / `.env` **del servidor** (fuera del árbol de git) o en
  el gestor de secretos del owner.

### 4.4 Qué requiere cambio de código (= OTRA tarea, no esta)

| Componente | Cambio necesario |
|---|---|
| `cmaf_orchestrator.php:422` · `lista_guardian_engine.php:224` · `resilience_engine.php:234` (+ copias en `backup_master_v5.4_phantom_engine/` y `frontend/vps/`) | sustituir la lectura de `$channelDna['url_ts']` por una llamada al resolvedor (`rq_dynamic_channel_map.php`) o inyección desde config server-side |
| `backend/generate_test_m3u8.js`, `stream_health_monitor.sh`, `.claude/settings.json`, `docs/CDN_REWRAP_WIRING.md` | sustituir la credencial embebida por variable de entorno / placeholder |
| `.wrangler/state/…` (blobs) | **no son código**: son caché de build → borrar del árbol y añadir `.wrangler/` a `.gitignore` |
| `.gitignore` | añadir: `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json`, `**/.wrangler/`, `OMEGA_UPDATE/fallback_proxy_production.php`, `_vps_stage/media/ape-ingest.sh` |

### 4.5 Generador de la variante redactada (especificación, no ejecutado)

Script `sanitize_channels_map.mjs` (a escribir en la tarea de remediación, **no aquí**):

1. Leer `channels_map.json` por streaming (chunks 8 MB, como en t5).
2. Por registro: `delete rec.username; delete rec.password; delete rec.url_m3u8; delete rec.url_ts;`
   `rec.server_id = mapServerToId(rec.server); delete rec.server;`
   `if (rec.degradation_chain) rec.degradation_chain = rec.degradation_chain.map(stripUrlCredentials);`
   `rec.url_ref = '/rq/dynamic_channel_map?channel=' + rec.slug + '&format=m3u8';`
3. Escribir `channels_map.redacted.json` (mismo order de claves, sin secretos).
4. **Verificación obligatoria** antes de commitear:
   `node -e "…"` que cuente `/"password"\s*:/g`, `/"username"\s*:/g` y el patrón Xtream en el archivo de salida
   → **los tres deben dar 0**.
5. Solo entonces: `git rm --cached channels_map.json` + mover el original fuera del repo (nunca commitearlo).

---

## 5. Checklist de rotación (única acción que requiere al owner)

> **Prerrequisito:** hacer esto **antes** de la purga. Rotar no rompe nada si el proveedor permite dos
> credenciales activas a la vez (lo normal en paneles Xtream).

### 5.1 Qué rotar (3 pares — el resto son derivados)

| # | Alcance | Dónde se cambia | Dónde está hoy en el repo (referencia, sin valores) |
|---|---|---|---|
| R1 | Credencial del proveedor **1** (host `3jh***`) | panel del proveedor (reseller/panel Xtream) | `channels_map.json` (9.293 registros), `.wrangler` blob, `config_retry.json`, `.claude/settings.json`, `docs/CDN_REWRAP_WIRING.md`, `stream_health_monitor.sh`, `generate_test_m3u8.js` |
| R2 | Credencial del proveedor **2** (host `sju***`) | panel del proveedor | `channels_map.json`, `config_retry.json`, `.claude/settings.json` |
| R3 | Credencial del proveedor **3** | panel del proveedor | `channels_map.json` |
| R4 | `userinfo` de `_vps_stage/media/ape-ingest.sh` (`mfu***:SUP***`) | donde viva ese servicio (proxy/ingest) | `_vps_stage/media/ape-ingest.sh` |
| R5 | Tokens de Cloudflare/Wrangler si `.wrangler/state` contenía sesión de R2 | dashboard Cloudflare (API token) | blob `f451dd59…` |

### 5.2 Cómo (orden exacto)

1. **Crear** la credencial nueva en el panel del proveedor **sin revocar la vieja** (ventana de convivencia).
2. **Propagar** en el VPS/config server-side (fuera del repo): `vps/prisma/config/`, `.env`, cron/daemons.
3. **Verificar** que la nueva credencial sirve, sin imprimir el secreto:
   ```bash
   read -r -s NEWPASS                      # el owner teclea; no queda en el historial
   curl -s -o /dev/null -w '%{http_code}\n' \
     "http://<host>/player_api.php?username=<newuser>&password=${NEWPASS}"   # esperado: 200
   unset NEWPASS
   ```
4. **Verificar reproducción real** (1 canal por proveedor, no 9.293):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "http://<host>/live/<newuser>/<newpass>/<stream_id>.m3u8"  # 200
   curl -s -o /dev/null -w '%{http_code}\n' "http://<host>/live/<newuser>/<newpass>/<stream_id>.ts"    # 200/302
   ```
5. **Regenerar** el `channels_map.json` (fuera del repo), regenerar las listas `.m3u8` y **probar 3 canales**
   en el player real (TiviMate/VLC).
6. **Revocar** la credencial vieja en el panel.
7. **Confirmar** que el proveedor no corta: monitorizar 24 h `stream_health_monitor.sh` / logs del VPS;
   si aparecen 401/403 masivos → reactivar temporalmente la vieja (aún no borrada en el panel) y revisar.
8. **Registrar** la rotación en `docs/ops/` (fecha, proveedor, responsable) — **sin el valor**.

### 5.3 Criterio de éxito de la rotación

- `player_api.php` responde **200** con la credencial nueva y **401/403** con la vieja (revocada).
- 0 canales caídos en la lista regenerada (comparar `channelsRemoved === 0` del audit del generador).
- Las 3 credenciales viejas ya **no** autentican.

---

## 6. Anexos

### 6.1 Evidencia reproducible (sólo lectura, ya ejecutada)

| Artefacto | Qué contiene |
|---|---|
| `tools/credential_scope.mjs` → `tools/credential_scope.json` | barrido de 7.512 archivos trackeados, 70 con hits, clasificación SSOT / no-SSOT por comparación de pares en memoria |
| `tools/credential_addendum.mjs` → `tools/credential_addendum.json` | los 2 blobs `.wrangler` (no tienen extensión, el barrido principal los excluye) + heurística de placeholders, todo enmascarado a 3 caracteres |
| `tools/xtream_field_map.mjs` | demuestra que los campos con URL+credencial son **exactamente** `url_m3u8`, `url_ts` y `degradation_chain` (9.293 cada uno ⇒ 27.879) |
| `tools/userinfo_sample.mjs` | muestras `scheme://abc***:***@` de `_vps_stage/*` |
| `tools/masked_keys.mjs` | clasifica `config.example.json` (placeholder) vs `config_retry.json` (real) |

Comandos de historia usados (todos de lectura): `git log --follow --diff-filter=A`, `git log -1`,
`git log --all`, `git cat-file -s/-e`, `git rev-list --objects`, `git tag --contains`, `git count-objects -vH`,
`git check-ignore -v`, `git ls-files -v`.

### 6.2 Estado del árbol no modificado por este plan

- `channels_map.json`: **intacto** (75.107.356 B worktree / blob HEAD `f3fbe950…` / 72.839.863 B).
- Ningún `git add`, `git commit`, `git rm`, `git gc`, `git push` ejecutado en esta tarea.
- Única escritura: esta carpeta (`audit/alignment/2026-10-25/80-seguridad/`, 1 documento + 6 scripts/evidencias).

### 6.3 Límites honestos

1. **No** se verificó si GitHub ya indexó/cacheó el contenido (eso requiere el ticket a Support, §3.5).
2. **No** se revisaron **forks** ni la caché de buscadores; el plan incluye el comando para listarlos.
3. **No** se probó ninguna credencial contra ningún proveedor (prohibido en esta tarea).
4. **No** se auditó el historial de los **tags** ni de las ramas remotas `feat/*` más allá de su existencia;
   la purga con `filter-repo` las cubre, pero el `push --force --all` debe incluir todas (§3.5).
5. La clasificación "real vs placeholder" es heurística (coincidencia exacta con el conjunto del SSOT o
   patrones tipo `user/pass`): un par **no** coincidente podría seguir siendo real de otro proveedor → tratado
   como "revisar" en §1.2, nunca como inocuo.
