# Tests de la skill SSD

## Caso 1 — Bundle válido

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid
```

Esperado: exit 0, `PASS ssd-check`, `rf=4`, `tareas=4`.

## Caso 2 — Bundle inválido

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/invalid
```

Esperado: exit 1, `FAIL ssd-check`.

## Caso 3 — Sin `plan.md`

Copiar el fixture válido, borrar `plan.md`, ejecutar. Esperado: error `falta plan.md`.

## Caso 4 — RF sin EARS

Editar una spec de prueba con un RF sin `CUANDO/SI/MIENTRAS/DONDE/EL SISTEMA`.
Esperado: error de patrón EARS.

## Caso 5 — Tarea sin `Hecho cuando`

Editar una tarea y quitar `Hecho cuando:`.
Esperado: error de tarea.

## Caso 6 — Plan sin cobertura RF

Quitar `RF-4` del plan.
Esperado: error `plan.md no referencia: RF-4`.

## Caso 7 — JSON

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid --json
```

Esperado: JSON parseable y `"ok": true`.

## Regla

Un fallo de la skill no se arregla relajando el validador: se corrige el bundle SSD.
