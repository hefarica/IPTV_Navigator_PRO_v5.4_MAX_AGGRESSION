# Spec 001 — Evidencia de fuente y upscale honesto

## Contexto y objetivo

El catálogo declara 4K/6K, pero el segmento real puede ser 1080p. Necesitamos que cualquier
mejora de imagen declare por separado fuente, salida y presentación, para no confundir
upscaling con fuente nativa.

## Usuarios / actores

- Operador del VPS que sirve la lista.
- Televisor/player que reproduce la variante.
- Revisor que audita la evidencia.

## Historias de usuario

- H1: Como operador quiero conocer la resolución real de la fuente para no publicar una
  promesa 4K/6K que no existe.
- H2: Como revisor quiero distinguir los píxeles generados por un filtro de los que solo
  aparecen en un tag.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: CUANDO el operador introduce un segmento, EL SISTEMA debe registrar códec, resolución,
  fps y espacio de color medidos con `ffprobe`.
- RF-2: SI la fuente medida es menor que el objetivo declarado, ENTONCES EL SISTEMA debe
  etiquetar la salida como `MODE=SIMULATED` y no como fuente nativa.
- RF-3: MIENTRAS un motor no haya producido un artefacto de salida, EL SISTEMA debe reportar
  `EXECUTED=0`.
- RF-4: EL SISTEMA debe conservar el SHA-256 y los bytes del original cuando genere una
  proyección o una variante.

## Requisitos no funcionales

- Medición reproducible con un comando documentado.
- Sin dependencias externas obligatorias para el validador.
- La salida de video no puede bajar fps ni audio para “que funcione”.

## Casos límite

- Segmento vacío o truncado.
- Fuente con relación de aspecto no 16:9.
- Fuente HDR/Dolby Vision.
- Player que no soporta el códec de salida.
- Fichero original que ya cambió de SHA-256.

## Fuera de alcance

- Transcodificar 28.655 canales en tiempo real en el VPS.
- Afirmar 6K nativo sin fuente 6K.
- Instalar un player o codec en el televisor.

## Criterios de finalización

- Todos los RF tienen test o comando asociado.
- El bundle SSD pasa `ssd_check.py`.
- La evidencia separa fuente, salida y presentación.

## Dudas abiertas

- [NECESITA ACLARACIÓN] ¿El segmento de referencia se conserva para repetir el `ffprobe`?
