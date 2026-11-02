# checklist.md — ape-lista-cartographer

## Antes (pre)

- [ ] La lista objetivo es **de lectura** y está autorizada por el propietario del sistema.
- [ ] Sé qué pregunta voy a responder (estructura / filtros / headers / capacidad / deriva).
- [ ] He decidido **censo** o **muestra**, y con qué denominador.
- [ ] `--out` apunta a `.agents/skills/ape-lista-cartographer/reports/` o a un directorio temporal,
      nunca dentro de la lista ni de otro artefacto versionado ajeno.
- [ ] `ffmpeg` está en PATH (si no, los pasos 5–6 quedarán `NO COMPUTADO`, y eso se dirá).
- [ ] No hay ninguna petición de red en el plan.

## Durante (mapper)

- [ ] `node --check` de los dos scripts.
- [ ] `map_list.js` termina con exit 0 (o 2 si es una assertion intencional).
- [ ] `source.bytes` y `source.sha256` presentes y coherentes con `Get-FileHash`/`sha256sum`.
- [ ] `blocks.sum_check_exact === true`; si es `false`, **parar**: la delimitación está mal.
- [ ] Cada división por canal da entero exacto (`líneas_familia / canales`); si no, hay canales
      estructuralmente distintos y hay que reportarlos como tales (no promediarlos).
- [ ] El número de firmas de filtros es `≪` el número de canales (si no, no hay plantilla).
- [ ] `exthttp.invalid === 0` y `exthttp.toxic_hits` vacío; los lookalikes van aparte.
- [ ] `#EXT-X-MAP` contado (0 = no hay CMAF real, con independencia de lo que digan las familias).
- [ ] `not_computed` poblado con razones, no vacío por omisión.

## Durante (cadenas de filtros)

- [ ] Extraídas **todas** las cadenas y agrupadas por firma exacta (no por muestra).
- [ ] Sintaxis validada contra `ffmpeg -h` (nombres + rangos numéricos).
- [ ] Ejecución validada con `validate_filter_chain.js` (y `--per-stage` si falla).
- [ ] El primer defecto se cita **literal** (mensaje del parser), no parafraseado.
- [ ] Los parámetros simbólicos (`zscale transfer=…`) no se dan por buenos con `-h`: se ejecutan.
- [ ] La corrección propuesta se vuelve a correr: PASS medido, no supuesto.

## Después (post)

- [ ] `leak_checks.host_occurrences_in_output === 0` y `credential_occurrences_in_output === 0`.
- [ ] `leak_checks.sha256_preserved === true` (el scrub no borró la identidad).
- [ ] `leak_checks.json_parses === true`.
- [ ] Los fixtures emitidos no contienen host/usuario/contraseña ni tokens (`<REDACTED>`).
- [ ] Cada afirmación del Markdown tiene su fila en el JSON (no hay cifras huérfanas).
- [ ] Los absolutos ("todo", "ninguno", "0") están respaldados por un conteo del propio JSON.
- [ ] La matriz de runtimes tiene fuente y estado de evidencia en **todas** las celdas.
- [ ] Ninguna celda se declara `aplicado` ni `verificado` sin artefacto de ejecución/píxeles.

## Rollback

La skill **no muta** la lista ni el repo. Si se escribió un fixture en una ruta versionada y no debe
quedar: `git checkout -- <ruta>` (fuera del alcance de la skill). Si un informe salió con un dato
mal: se **regenera** con el mismo comando; nunca se edita a mano el JSON.
