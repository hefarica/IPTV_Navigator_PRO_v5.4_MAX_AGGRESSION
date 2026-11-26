# Referencias

## Fuente principal

- **Hello SDD** — Brais Moure (MoureDev): https://github.com/mouredev/hello-sdd
  - Commit revisado: `358dfe85a818bccdd839f78e804668b3ebaa10b5`
  - Licencia: Apache-2.0 (`LICENSE` del upstream)
  - Curso: https://youtube.com/live/5HaOxAAA5qI
  - Qué se tomó: el flujo constitución → spec → clarificación → plan → tareas →
    implementación test-first → validación → cambio.
  - Qué NO se copió: las plantillas `samples/spec.md`, `samples/prompts.md`, el proyecto
    `habits-cli` ni la skill `spec-generator` del upstream. La redacción de esta skill es
    propia y adaptada.

## EARS

- Notación **EARS** (Easy Approach to Requirements Syntax) de Alistair Mavin et al.
  Patrones usados: ubicuo, evento (`CUANDO`), estado (`MIENTRAS`), no deseado
  (`SI ... ENTONCES`) y opcional (`DONDE`).
- No se afirma que EARS sea la única notación válida; se usa porque obliga a escribir
  requisitos observables y testeables.

## Políticas internas del repo

- `AGENTS.md` — doctrina, ley anti-degradación y estructura de skills.
- `CLAUDE.md` — MAX IMAGE FIRST, truth-guards, VPS real.
- `docs/policies/ANTI_DEGRADATION_LAW.md` — no degradar resolución/códec/HDR/fps/bitrate.
- `docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md` — mejora obligatoria dentro de la verdad.
- `docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md` — 6K opt-in y no en tiempo real en 3 vCPU.
- `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` — VPS metadata-only, sin píxeles.
- `.agents/skills/ape-image-pipeline-truth/SKILL.md` — declarado vs observado vs aplicado.
- `.agents/skills/ape-crystal-ultraenhance-apk/SKILL.md` — REA/APK solo su propio player.

## Evidencia de la integración

- `repo_ingest` de `https://github.com/mouredev/hello-sdd`:
  - commit `358dfe85a818bccdd839f78e804668b3ebaa10b5`;
  - 24 archivos, 14 Markdown, 8 Python;
  - sin truncamiento.
- `web_fetch` del README, `samples/spec.md`, `samples/prompts.md`,
  `habits-cli/docs/constitution.md` y `LICENSE` (HTTP 200).
- El enlace de Genspark que originó la confusión SSD devolvía 403 directo; se abrió con
  Chrome headless (contenido de un plan, no una implementación). No se usa como fuente de
  esta skill.
