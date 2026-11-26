# Tareas 001 — Evidencia de fuente y upscale honesto

- [ ] T1 — Medir el segmento de origen (RF-1)
  - Escribir el comando `ffprobe` y guardar la salida.
  - Hecho cuando: existe un JSON con códec, resolución y fps, y el comando se ejecutó.

- [ ] T2 — Contrato de etiquetas de evidencia (RF-2, RF-3)
  - Añadir un test que rechace `RESOLUTION` de fuente si `MODE=SIMULATED`.
  - Añadir un test que exija `EXECUTED=0` si no hay artefacto.
  - Hecho cuando: los dos tests fallan antes y pasan después.

- [ ] T3 — Preservación del original (RF-4)
  - Calcular SHA-256 del original antes y después de la proyección.
  - Hecho cuando: los hashes coinciden y el sidecar existe.

- [ ] T4 — Validación final (RF-1..RF-4)
  - Ejecutar `ssd_check.py` y la suite; pegar salida.
  - Hecho cuando: todos los RF tienen evidencia y el veredicto es PASS o NO VERIFICADO explícito.
