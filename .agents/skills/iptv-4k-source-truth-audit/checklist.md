# Checklist — iptv-4k-source-truth-audit

## Antes

- [ ] Escribí la lista de repos/URLs que voy a medir (no "los que recuerdo").
- [ ] Sé si tengo token de GitHub; si no, cuento las 60 req/h.
- [ ] Separo lo que el catálogo **declara** de lo que voy a **medir**.
- [ ] Tengo dónde anotar el resultado (fixture JSON con fecha).

## Durante

- [ ] Cada `GET` de repo trae `User-Agent` y captura el código en `catch`.
- [ ] Cada endpoint trae `status`, `bytes` y `#EXTINF` (con el cuerpo decodificado).
- [ ] Cada licencia `NOASSERTION` se contrasta leyendo el `LICENSE` real.
- [ ] Cada JSON grande se cuenta con `@($j).Count`, sin volcarlo.
- [ ] Si un `GET` falla, anoto el código real; no lo convierto en "no existe".
- [ ] Lo que no medí va a `not_measured`, con su razón.

## Después

- [ ] Emití veredicto con la tabla de reglas (INFLADO / SUBCONTADO / NO SOSTENIDO /
      DORMIDO / ABANDONADO / SIN LICENCIA / LICENCIA SIN SPDX / ROTO / 4K NO DISPONIBLE).
- [ ] La fecha y el método están escritos junto a las cifras.
- [ ] Los hallazgos que contradicen a la skill ancla se anotaron en su
      `audit-report.md` y se corrigió la skill.
- [ ] El fixture queda versionado con la fecha en el nombre.

## Rollback

1. Si publiqué una cifra del catálogo como medida → corregirla citando la medición.
2. Si recomendé un repo inflado → retirar la recomendación y explicar el ratio.
3. Si usé una URL 404 en una receta → sustituirla por la ruta medida y marcar la
   anterior como muerta.
4. Si la auditoría dejó archivos temporales → borrarlos; la evidencia es el fixture,
   no la carpeta temporal.
