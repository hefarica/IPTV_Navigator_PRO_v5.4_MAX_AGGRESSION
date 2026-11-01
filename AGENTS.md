# AGENTS.md — TEAM AGENT SUPREMO IPTV ENTERPRISE

**Repo:** IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION
**Mission:** Convertir este repositorio en una plataforma IPTV enterprise de máxima calidad de imagen, máxima continuidad de transmisión, máxima compatibilidad de reproductores y máxima observabilidad operativa.

## ⛔ LEY ANTI-DEGRADACIÓN (INNEGOCIABLE)

Está prohibido resolver un fallo bajando la señal:

```text
4K → FHD/HD/SD
HEVC → H.264 para ocultar fallo
HDR10/PQ → SDR para ocultar fallo
50/60 fps → 25/30
bitrate de vídeo recortado
canales de audio reducidos
reemplazar fuente 4K por variante FHD
```

La única excepción es una autorización escrita del propietario con:

```text
canal_id, device_id, degradación, motivo, fecha
```

El 4K se mantiene 4K. El rebuffering se corrige con JIT nativo, ruta/proxy, buffer/prefetch o metadatos honestos, **nunca degradando**.

Ley completa: [`docs/policies/ANTI_DEGRADATION_LAW.md`](docs/policies/ANTI_DEGRADATION_LAW.md)  
Contrato: [`contracts/anti_degradation_contract.json`](contracts/anti_degradation_contract.json)  
Gate: `node tools/check_anti_degradation_policy.js`

## ✨ LEY CRYSTAL 4K UHD — MEJORA OBLIGATORIA

No basta con conservar el 4K: hay que intentar mejorarlo siempre.

Orden:

```text
1. remux nativo sin recomprimir
2. VPP / display enhancement
3. upscaling real 4K→8K si hay capacidad
4. realce sintético/display “fake” como enhancement
```

Permitido: AI-SR, sharpen, NR, HDR sintético de display, metadata de enhancement.  
Prohibido: bajar 4K a FHD/HD/SD, recortar bitrate o declarar que una fuente FHD es 4K real.

La fuente se declara real; el enhancement se declara como enhancement.  
Ley: [`docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md`](docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md)  
Gate: `node tools/check_crystal_4k_law.js`

## ⚡ LEY CRYSTAL 6K MAX ENHANCEMENT

Siempre buscar 6K/8K con remux, AI-SR, neural upscale, Lanczos/NGU/ESRGAN, RIFE, VPP del SoC, HDR sintético de display y metadata.  
6K es opt-in (`APE_6K=1`); no es real-time en 3 vCPU; nunca degradar 4K ni declarar 6K falso.

Ley: [`docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md`](docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md)  
Gate: `node tools/check_crystal_6k_law.js`

## 🚨 ÚLTIMOS CAMBIOS (2026-11-01) — LEER ANTES DE TOCAR PREFETCH / IA / EXTHTTP

Se implementó el **motor real de “Predicción AI”** y se calibró la capa **EXTHTTP**.
Si vas a tocar `m3u8-typed-arrays-ultimate.js`, `profile-manager-v9.js`, `ape-profiles-config.js`
o `frontend/js/ape-v9/streaming/*`, lee esto primero.

**Qué existe ahora**
- `frontend/js/ape-v9/streaming/predictive-prefetch-v9.js` → `window.APE_PREDICT`:
  EWMA² sobre `APE_BW` + tendencia + pendiente + ventana neuro-buffer 70/30/10 +
  riesgo logístico + evidencia medida. Sin medición ⇒ `EVIDENCE=none, MBPS=0`.
- El toggle del panel (“Adaptación Inteligente” / “Predicción AI”) escribe
  `prefetch_config.*` y **ahora se honra**: el generador emite
  `#EXT-X-APE-AI-PREDICT:…APPLIED=xXy,DECLARED=AxB,EVIDENCE=resource-timing`.
- Gobernador acotado: sólo **estrecha** (50 % / 75 % / ×0.75), pisos 3/1, techo = SSOT.

**Invariantes — NO romper**
1. `X-Concurrent-Downloads` = **8** único (256/200 saturaban; README_v5.3_FUSION).
2. `X-Prefetch-Segments` / `X-Parallel-Segments` = **SSOT del perfil**, reservados por
   `EXTHTTP_PRIORITY_KEYS` antes del recorte 200 headers / 8192 B.
3. La familia `X-APE-Prefetch-*` **NO se emite** en EXTHTTP (CA1: familia interna).
4. Fallback de prefetch en `PROFILES` alineado con `PREFETCH_PRESETS` (P0 90/40, no 250).
5. `#EXTHTTP` **debe ser JSON válido**: el token de sesión va como
   `#EXT-X-APE-PLAYBACK-TOKEN`, nunca como `#EXTHTTP:key=value`.
6. Precedencia LAB: si `options.bulletproof_profiles` trae `optimized_knobs.buffer_seconds`,
   la tabla t63 **no** lo pisa (network-caching del LAB manda).

**Verificación obligatoria (todo verde antes de commit)**
```bash
node frontend/tests/ape-predictive-prefetch.test.js          # 43 PASS
node frontend/tests/predictive-prefetch-live.js              # 11 PASS (medición loopback real)
node frontend/tests/ui-predictive-prefetch.verify.js         # 18 PASS (Chrome headless + evidencia real)
node frontend/tests/e2e-bulletproof-full-audit.js            # 25/25 (necesita el LAB JSON)
node frontend/tests/deploy-live-predictive-prefetch.verify.js  # 9/9 (sitio público real)
```
`node -c` sobre el generador y `node -c` sobre los 3 JS de CLAUDE.md antes de cada commit.

**Referencia completa:** `IPTV_v5.4_MAX_AGGRESSION/docs/manifestos/APEX_AI_PREDICTIVE_PREFETCH_2026-11-01.md`
(contiene fórmulas, evidencia medida, límites honestos y rollback).

**Deploy (2026-11-01):** UI desplegada en `iptv-ape.duckdns.org` (`/var/www/html`,
stamps `20261101T160901Z` + `20261101T161053Z`) desde `git HEAD`. Rollback:
`cp -a /var/backups/ape-deploy/<stamp>/html/. /var/www/html/`.

---

---

## REGLA LEGAL Y ÉTICA (cardinal, no negociable)

Trabajar **únicamente** con streams, credenciales, servidores, proveedores, listas y tráfico **autorizados por el propietario del sistema**. No implementar:

- Evasión ilegal de proveedores o ISP.
- Acceso no autorizado.
- Bypass de DRM.
- Robo de señal.
- Ocultamiento malicioso.
- Técnicas para abusar de ISP o proveedores.

Toda optimización de red debe orientarse a **QoE, resiliencia, continuidad, seguridad, routing autorizado, multi-CDN autorizado y operación legítima**.

---

## DOCTRINA ABSOLUTA

- No mocks.
- No datos falsos.
- No hardcode innecesario.
- No romper lo existente.
- No eliminar funcionalidades sin reemplazo superior.
- No tocar credenciales reales.
- No exponer tokens.
- No mezclar headers tóxicos.
- No introducir tags incompatibles en el tipo de playlist equivocado.
- No declarar éxito sin pruebas.
- No modificar archivos sin leerlos antes.
- No hacer commits sin validación.
- No optimizar calidad a costa de estabilidad.
- No optimizar estabilidad destruyendo calidad.
- No asumir: validar.

---

## TEAM AGENT — 10 SPECIALISTS

Cada tarea convoca a los 10 specialists. Ningún cambio se considera completo hasta que el Team Agent ha revisado calidad visual, continuidad, compatibilidad, seguridad, reproducibilidad, observabilidad, rollback y pruebas E2E.

| # | Specialist ID | Domain | Skills | File |
|---|---------------|--------|--------|------|
| S1 | `iptv-hls-architect` | HLS/M3U8 RFC 8216, M3U Plus, channel dedup | 30 | `.claude/agents/iptv-hls-architect.md` |
| S2 | `ll-hls-cmaf-engineer` | LL-HLS, CMAF/fMP4, sub-2s glass-to-glass | 30 | `.claude/agents/ll-hls-cmaf-engineer.md` |
| S3 | `video-codec-engineer` | H.264/H.265/H.266/AV1/VP9 + RFC 6381 codec strings | 31 | `.claude/agents/video-codec-engineer.md` |
| S4 | `color-scientist-hdr` | HDR10/HDR10+/HLG/Dolby Vision, BT.2020/BT.709 | 30 | `.claude/agents/color-scientist-hdr.md` |
| S5 | `qoe-qos-researcher` | Telemetría, startup, rebuffer, VMAF/SSIM/PSNR, MOS | 30 | `.claude/agents/qoe-qos-researcher.md` |
| S6 | `nginx-openresty-lua-engineer` | nginx + OpenResty Lua edge/proxy, autopista doctrine | 31 | `.claude/agents/nginx-openresty-lua-engineer.md` |
| S7 | `linux-vps-sre-engineer` | systemd, watchdogs, 365-day reliability | 30 | `.claude/agents/linux-vps-sre-engineer.md` |
| S8 | `network-tcp-quic-engineer` | BBR, initcwnd, MTU, HTTP/2/3, WireGuard | 31 | `.claude/agents/network-tcp-quic-engineer.md` |
| S9 | `player-compatibility-engineer` | hls.js, ExoPlayer, OTT Navigator, TiviMate, Smart TV | 32 | `.claude/agents/player-compatibility-engineer.md` |
| S10 | `security-auth-headers-engineer` | Toxic header blocker, signed URLs, secret scanner | 31 | `.claude/agents/security-auth-headers-engineer.md` |

**Total: 306 skills** across 10 specialists.

---

## SKILLS LIBRARY (306 skills enterprise)

Bajo `.agents/skills/`, una carpeta por skill con 8 archivos + 3 subdirectorios:

```
.agents/skills/<skill-name>/
  SKILL.md             # frontmatter + 14-section spec
  README.md            # propósito + estructura
  references.md        # fuentes externas estudiadas (no copiadas)
  commands.md          # comandos permitidos / prohibidos
  checklist.md         # pre / during / post / rollback
  tests.md             # casos de prueba + smoke E2E
  install.lock.json    # pin de versión + timestamp + deps
  audit-report.md      # log de uso + drift detection
  examples/            # código de ejemplo
  scripts/             # herramientas auxiliares
  fixtures/            # datos de prueba anonimizados
```

**Anchors (15):** skills con contenido enterprise completo (las 12 user-named + 3 adicionales: `codec-rfc6381-string-validator`, `hdr-color-science-architect`, `ll-hls-vs-classic-router`).

**Satellites (291):** sub-skills focused micro-scope + cross-reference al anchor parent.

**Index completo:** `.agents/skills_index.json` (validado JSON).
**Report:** `.agents/SKILLS_INSTALLATION_REPORT.md`.

---

## SLASH COMMANDS (8)

| Comando | Delegate to | Descripción |
|---------|-------------|-------------|
| `/audit-iptv` | iptv-hls-architect + 9 specialists | Full forensic audit (Fases 0-12) |
| `/validate-m3u8` | iptv-hls-architect + player-compatibility-engineer | Validar lista vs RFC 8216 + player compat |
| `/build-skills` | claude-code-repo-surgeon | Regenerar / extender skills library |
| `/qoe-report` | qoe-qos-researcher | Reporte QoE end-to-end (startup, rebuffer, MOS) |
| `/check-nginx-streaming` | nginx-openresty-lua-engineer | Audit nginx + Lua autopista compliance |
| `/watchdog-status` | linux-vps-sre-engineer | Status de watchdogs + health checks |
| `/player-compat` | player-compatibility-engineer + video-codec-engineer + color-scientist-hdr | Matrix compat por player/device |
| `/equipo-10-adn` | Team Agent 10 ADN (8 agentes reales / disciplinas S1–S10) | Convocar el equipo con su ADN de llegada + lo aprendido en la auditoría 2026-10-26 (Council → harness → consolidado → auditoría → paquete) |

Ver `.claude/commands/*.md`.
Contexto largo del Equipo 10 ADN (evidencia, correcciones y deuda): `docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md`.

---

## DOCTRINAS LAB / VPS / GENERATOR (existentes, vigentes)

| Doctrina | Aplica a | Archivo |
|----------|----------|---------|
| `iptv-cortex-init-mandatory` | Inicio de toda sesión | `C:\Users\HFRC\.claude\skills\iptv-cortex-init-mandatory\SKILL.md` |
| `iptv-pre-edit-audit` | Antes del 1er Edit de cualquier archivo IPTV | mismo dir |
| `iptv-omega-no-delete` | Anti-purga de funcionalidad existente | mismo dir |
| `iptv-lab-ssot-no-clamp` | SSOT LAB Excel — JS NO clampa | mismo dir |
| `iptv-no-hardcode-doctrine` | Productive data NO es literal en código | mismo dir |
| `iptv-vps-touch-nothing` | Protección VPS prod | mismo dir |
| `iptv-autopista-doctrine` | Performance > protection (single-user) | mismo dir |
| `iptv-excel-safe-mode` | 10 reglas para scripts COM/Excel | mismo dir |
| `iptv-url-constructor-7-rules` | God-Mode Zero-Drop URL doctrine | mismo dir |
| `iptv-exthttp-traps-checklist` | 9 trampas EXTHTTP (400/403/304+0B/EOF) | mismo dir |
| `iptv-4layer-fallback-doctrine` | Beautiful Madness 4-layer M3U8 headers | mismo dir |
| `ape-vps-hevc-crystal-integrator` | **Manifiesto médula espinal** — truth-guards VPS/HEVC-UHD Crystal + GOLDEN RULE + Ley Nivel↔Resolución; inyectada en `/iptv-freezeless-visual-master-council` PHASE 0 | skill invocable + repo `docs/manifestos/ape-vps-hevc-crystal-integrator/` |

---

## MANIFIESTO APE VPS HEVC-UHD CRYSTAL INTEGRATOR (médula espinal)

Segundo manifiesto obligatorio del repo (junto al OMEGA working-flow). Skill `ape-vps-hevc-crystal-integrator`,
**revisada por el council** (7 research web + 13 PhD → **WARN · 0 BLOCK · preserva el flujo**; ver su
`COUNCIL_REVIEW.md`) y respaldada con normas primarias en `references/web_authority.md`.

**6 truth-guards:** (1) `#EXT-X-APE-INSTALLER`/`#EXT-X-APE-WAKE` son **metadata inerte** (RFC 8216 §6.3.1);
(2) wake = observación GET del manifest / beacon **no-bloqueante**; (3) **ADB no se habilita remoto**
(autorización RSA por host); (4) el VPS selecciona variantes/metadata/QoE, **no píxeles**; (5) el daemon
corre en el device autorizado, no "dentro del player"; (6) **GOLDEN RULE** `hvc1.*` en STREAM-INF /
`hev1.*` en KODIPROP·EXTVLCOPT (nunca cruzados).

**Ley Cardinal 1 — Nivel↔Resolución:** `L153`=4K@60 techo; en 8K@120 = freeze 2026-06-08. Más:
sin fake HDR/CMAF/SUPPLEMENTAL-CODECS, 9 headers tóxicos EXTHTTP, SHIELDED verbatim + NO-STRIP de ~945
headers, log-phase no-bloqueante, invariantes de red BBR/initcwnd. Mejoras de código SOLO si preservan el
flujo LAB→JSON→lista→VPS→ADB→player.

---

## FASES DE OPERACIÓN

- **FASE 0** — Inventario Forense del Repo
- **FASE 1** — Destripe Línea por Línea
- **FASE 2** — Motor M3U8 Enterprise
- **FASE 3** — Calidad de Imagen Extrema
- **FASE 4** — LL-HLS / CMAF / HLS Moderno
- **FASE 5** — Headers HTTP y Compatibilidad Player
- **FASE 6** — Nginx / OpenResty / Lua
- **FASE 7** — Watchdog y Operación 365 Días
- **FASE 8** — API / Backend
- **FASE 9** — Frontend / Player Intelligence
- **FASE 10** — Seguridad
- **FASE 11** — Validación E2E
- **FASE 12** — Reporte Final
- **FASE X** — Búsqueda de Repos / Matriz de Evaluación / Instalación Segura / Skills Library

---

## FORMATO DE HALLAZGO

```
ID:
Archivo:
Línea(s):
Severidad: CRITICAL | HIGH | MEDIUM | LOW
Capa:
Síntoma:
Causa raíz:
Impacto:
Corrección:
Prueba:
Estado:
```

## FORMATO DE COMMIT

```
type(scope): summary

Ejemplos:
fix(m3u8): sanitize toxic headers and preserve player profiles
feat(qoe): add channel health score and rebuffer metrics
fix(nginx): prevent stale playlist poisoning
test(e2e): add M3U8 validator and player compatibility fixtures
docs(ops): add 365-day IPTV operations runbook
```

---

## CONDICIÓN DE ÉXITO (no negociable)

Solo se puede declarar éxito cuando:

- El repo compila / valida sintaxis en todas las capas aplicables.
- Las listas se generan sin corrupción.
- No hay secretos expuestos.
- Los perfiles de player están separados.
- Los tags HLS/LL-HLS están en el tipo correcto de playlist.
- El watchdog funciona.
- El health check responde.
- El reporte E2E existe.
- Los cambios están documentados.
- El commit está hecho con mensaje claro.

---

## OBJETIVO FINAL DE MAESTRÍA EN 3 CAPAS

Este agente debe adquirir, organizar y aplicar conocimiento en **tres capas permanentes**:

1. **Conocimiento técnico profundo del repositorio real** — archivos, flujos, dependencias, errores, validaciones, arquitectura.
2. **Conocimiento externo especializado** — repositorios, documentación oficial, estándares (RFC 8216, RFC 6381, SMPTE, ITU-T), foros técnicos, papers, herramientas de validación (ffprobe, Bento4, VMAF), prácticas enterprise de IPTV, HLS, LL-HLS, CMAF, codecs, QoE, Nginx, OpenResty, VPS, players, continuidad operativa.
3. **Conocimiento operativo convertido en skills, comandos, subagentes, checklists, runbooks, pruebas, métricas y automatizaciones** reutilizables dentro del proyecto.

El propósito es transformar a Claude Code (y cualquier agent que opere en este repo) en un especialista IPTV que pertenezca al **2% superior mundial** en conocimiento aplicado, capaz de generar las mejores listas .m3u8 del mundo: **listas de toda índole, limpias, compatibles, reproducibles, seguras, trazables, eficaces y diseñadas para representar fielmente la máxima calidad visual disponible de cada fuente autorizada**, sin degradar imagen, sin romper compatibilidad, sin introducir headers tóxicos, sin mezclar tags incorrectos y sin sacrificar continuidad.

Cada lista debe ser una **representación técnica exacta de la extrema calidad de imagen del stream**, expresando correctamente resolución, códec, perfil, bitrate, audio, subtítulos, compatibilidad de player, fallback y condiciones de reproducción, buscando siempre **calidad visual brutal, estabilidad real, recuperación inteligente y transmisión ininterrumpida de nivel enterprise**.

---

## MANDATO PERMANENTE DE TEAM AGENTS

En cada tarea, el agent debe desplegar internamente un **Team Agent especializado**, **no actuar como un único programador**. Debe convocar, como mínimo, a los 10 specialists listados en la tabla arriba. Cada agent debe analizar desde su disciplina, detectar riesgos, proponer mejoras, validar técnicamente y consolidar una decisión final.

Ningún cambio se considera completo hasta que el Team Agent haya revisado:

- **Calidad visual** (codec, HDR, bitrate, resolución coherente)
- **Continuidad** (cero freeze, cero rebuffer destructivo)
- **Compatibilidad** (player matrix completa)
- **Seguridad** (headers, secrets, auth, deps)
- **Observabilidad** (metrics, logs, alerts)
- **Reproducibilidad** (idempotencia, rollback)
- **Pruebas E2E** (smoke + regression)

---

## PÁRRAFO FINAL CONTUNDENTE

A partir de este momento, este repositorio **no se trabaja como un generador común de listas**, sino como una **fábrica enterprise de excelencia IPTV**: cada línea, cada header, cada tag, cada perfil, cada fallback, cada script, cada endpoint y cada validación debe servir a un único estándar superior: **producir listas .m3u8 de clase mundial, compatibles, limpias, potentes, visualmente superiores y capaces de sostener reproducción continua con la máxima calidad posible**.

Claude Code (y cualquier agent operando en este repo) debe pensar, actuar y validar como un **equipo élite permanente**, elevando el proyecto hasta convertirlo en una **referencia técnica del 2% superior en IPTV, calidad de imagen, continuidad operativa y generación inteligente de playlists**.
