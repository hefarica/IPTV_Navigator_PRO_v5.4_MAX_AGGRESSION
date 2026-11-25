# Comandos

## Validar la skill

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid
```

Salida esperada: `PASS ssd-check: ...` y exit 0.

```bash
# El fixture incompleto debe fallar
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/invalid
```

Salida esperada: `FAIL` y exit 1.

## Crear una feature

```bash
FEATURE=specs/004-nombre-corto
mkdir -p "$FEATURE"
cp .agents/skills/ssd-spec-driven-development/examples/spec-001.md "$FEATURE/spec.md"
cp .agents/skills/ssd-spec-driven-development/examples/plan-001.md "$FEATURE/plan.md"
cp .agents/skills/ssd-spec-driven-development/examples/tasks-001.md "$FEATURE/tasks.md"
```

Sustituye el contenido; no implementes todavía.

## Validar una feature existente

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py --feature "$FEATURE"
```

## Flujo de una tarea

```bash
# 1. Lee spec, plan y tasks.
# 2. Implementa SOLO Tn, tests primero.
# 3. Ejecuta la suite.
# 4. Muestra el resultado y marca Tn.
# 5. PÁRATE.
```

## Verificación del repo (ejemplos; elegir según el cambio)

```bash
node -c frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node frontend/tests/ape-catalog-projection.test.js
php -l vps/prisma/api/pulse.php
node tools/check_anti_degradation_policy.js
node tools/check_crystal_4k_law.js
node tools/check_crystal_6k_law.js
```

## Medir una fuente real

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate \
  -of default=nw=1 <segmento>
```

No sustituyas esta medición por el nombre del canal.
