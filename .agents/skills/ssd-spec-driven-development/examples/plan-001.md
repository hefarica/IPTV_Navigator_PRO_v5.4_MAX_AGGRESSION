# Plan 001 — Evidencia de fuente y upscale honesto

## Módulos

- `tools/quality/`: medición de segmentos y metadatos.
- `docs/`: política de evidencia y definiciones.
- `frontend/tests/`: pruebas del contrato de etiquetas.
- `vps/`: no se toca en esta iteración; el VPS no procesa píxeles.

## Modelo de datos

```text
source = {codec, width, height, pix_fmt, fps, sha256}
output = {engine, mode, width, height, codec, executed, artifact_sha256}
presentation = {device, mode, evidence, verified}
```

## Decisiones

- **Medir con `ffprobe` y no con el nombre del canal.** Alternativa descartada: confiar en
  “FHD/4K/6K” del nombre, que no es una medición.
- **Separar `SIMULATED` de fuente nativa.** Alternativa descartada: reutilizar `RESOLUTION`
  para anunciar 4K cuando el origen es 1080p.
- **No tocar el VPS en esta fase.** Alternativa descartada: transcodificar en el VPS, que no
  tiene GPU y violaría metadata-only.
- **Evidencia por etapas.** Alternativa descartada: un único tag `EXECUTED=1` sin artefacto.

## Estrategia de tests

- `ssd_check.py` valida el bundle.
- `ffprobe` mide el segmento de origen.
- `ffprobe` mide la salida del piloto y se compara con `source`.
- Un test de contrato comprueba que una etiqueta `SIMULATED` no lleva `RESOLUTION` de fuente.

## Mapa RF

| RF | Módulo | Test |
|---|---|---|
| RF-1 | `tools/quality` | `ffprobe` sobre segmento |
| RF-2 | `docs` + emisor | test de etiqueta `MODE=SIMULATED` |
| RF-3 | `tools/quality` | salida `EXECUTED=0` sin artefacto |
| RF-4 | proyección | comparación de SHA-256 del original |

## Riesgos y rollback

- Riesgo: confundir el modo del televisor con la resolución generada.
- Rollback: retirar el piloto; el original no se toca.
