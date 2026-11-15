# Checklist — iptv-supreme-repos-4k

## Antes de recomendar cualquier repo

- [ ] Leí la fila del repo en la tabla maestra, no solo su descripción.
- [ ] Sé si la cifra que voy a citar es **declarada** o **medida**, y lo digo.
- [ ] Verifiqué la **licencia SPDX**: MIT/Unlicense (permisivo), AGPL-3.0
      (copyleft de red), NOASSERTION (leer el archivo), null (sin permiso).
- [ ] Miré el **último push**: si es > 6 meses, lo digo antes de recomendarlo.
- [ ] Si el repo tiene **0 estrellas y declaración de cientos**, lo marco como no
      sostenido; no lo presento como "el mejor".
- [ ] No cité una URL de endpoint sin haberla sondeado o sin marcarla como declarada.

## Antes de usar una URL de playlist

- [ ] La URL devuelve 200 (no 404) y su cuerpo empieza por `#EXTM3U`.
- [ ] Conté `#EXTINF` para saber cuántos canales trae de verdad.
- [ ] Si la voy a llamar "4K", la fuente **declara** 2160p/4K o lo medí con probe.
- [ ] No estoy renombrando 1080p como 4K (ley ANTI_DEGRADATION).

## Durante

- [ ] Cada endpoint nuevo que se sume se sondea con status + tamaño + conteo.
- [ ] Cada cifra nueva lleva fecha y fuente en la misma línea.
- [ ] Los "no medido" quedan escritos como "no medido", nunca como 0 ni como OK.

## Después

- [ ] La tabla maestra y `fixtures/measured_2026-11-15.json` no se contradicen.
- [ ] Agregué al `audit-report.md` qué usé y para qué.
- [ ] Si re-medí, actualicé fecha, valores y `install.lock.json`.

## Rollback

Esta skill no escribe estado. El rollback aplicable es de **decisión**:

1. Si recomendé un repo por su cifra declarada y resultó inflado → corregir la
   recomendación en la respuesta, citando la medición.
2. Si propuse una URL que da 404 → sustituirla por la ruta medida (p. ej.
   `api/streams.json` filtrado) y decir que la anterior estaba muerta.
3. Si generé una lista con etiquetas 4K sobre fuentes 1080p → **destruir la lista**
   y regenerar desde `quality`; no "arreglar" la etiqueta.
