# Audit — integración de SSD

**Fecha:** 2026-11-25  
**Skill:** `ssd-spec-driven-development`  
**Fuente:** `mouredev/hello-sdd`, commit `358dfe85a818bccdd839f78e804668b3ebaa10b5`, Apache-2.0.

## Qué se hizo

- Se ingirió el repositorio upstream y se leyeron `README.md`, `samples/spec.md`,
  `samples/prompts.md`, `habits-cli/docs/constitution.md` y `LICENSE`.
- Se creó una skill original que resume el flujo SSD y lo adapta a las verdades del repo:
  fuente medida, upscaling etiquetado, VPS metadata-only, REA solo en su player y no borrado.
- Se añadió un validador sin dependencias y fixtures válidos/inválidos.
- Se copió la skill al catálogo global `C:\Users\HFRC\.agents\skills\ssd-spec-driven-development`.

## Qué NO se hizo

- No se copiaron las plantillas del upstream.
- No se modificó producción, VPS, listas ni APK.
- No se declaró 4K/6K nativo.
- No se instaló nada desde el upstream.

## Límites

- El validador comprueba forma, no verdad semántica. Un RF puede ser formalmente válido y
  aun así ambiguo; la revisión humana sigue siendo obligatoria.
- La skill no sustituye las pruebas del dispositivo ni la medición de píxeles.
- Hello SDD es un curso; esta es una adaptación operativa, no una certificación.

## Verificación

```bash
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid
```

Resultado esperado: PASS.
