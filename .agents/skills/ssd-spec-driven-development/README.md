# ssd-spec-driven-development

Skill operativa de **Spec-Driven Development (SDD)** para este repo. Adapta el flujo del
curso [Hello SDD de MoureDev](https://github.com/mouredev/hello-sdd) (Apache-2.0) para que un
agente no implemente desde un prompt ambiguo.

## Qué resuelve

| Pregunta | Artefacto |
|---|---|
| ¿Qué se va a construir y por qué? | `specs/NNN-feature/spec.md` con RF EARS |
| ¿Qué decisiones se tomaron y qué alternativas se descartaron? | `plan.md` |
| ¿Cuál es la siguiente unidad de trabajo? | `tasks.md`, una tarea <30 min |
| ¿Cómo sé que está hecha? | `Hecho cuando:` + test en verde |
| ¿La spec se cumplió? | mapa RF → test → evidencia |
| ¿Cambió un requisito? | primero el diff de la spec |

## Flujo

```text
Constitución → Spec EARS → Clarificación → Plan → Tareas
→ Implementación de UNA tarea (tests primero) → Validación → Cambio
```

## Estructura

```text
SKILL.md          flujo completo + truth-guards IPTV/APE
README.md         este archivo
references.md     upstream, licencia y políticas del repo
commands.md       comandos verificados
checklist.md      pre/durante/post/rollback
tests.md          casos y comandos de la skill
install.lock.json pin de fuente y licencia
audit-report.md   evidencia de integración
examples/         spec/plan/tasks de ejemplo
scripts/          ssd_check.py (validador sin dependencias)
fixtures/         bundles válidos e inválidos para probar
```

## Validación

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid
```

Debe devolver `PASS` con exit 0. El fixture `invalid` debe devolver exit 1.

## Instalación

La skill vive en dos rutas para que el catálogo del repo y el catálogo global la descubran:

```text
<repo>/.agents/skills/ssd-spec-driven-development/
C:/Users/HFRC/.agents/skills/ssd-spec-driven-development/
```

La fuente de verdad es la copia del repo; la copia global es de descubrimiento. No se
duplican secretos ni credenciales: la skill no contiene ninguna.

## Licencia y atribución

Método adaptado de **Hello SDD** de Brais Moure (MoureDev), Apache-2.0, commit
`358dfe85a818bccdd839f78e804668b3ebaa10b5`. Las plantillas del upstream no se copiaron
literalmente; esta skill usa una redacción propia y añade las restricciones del repo APE.
