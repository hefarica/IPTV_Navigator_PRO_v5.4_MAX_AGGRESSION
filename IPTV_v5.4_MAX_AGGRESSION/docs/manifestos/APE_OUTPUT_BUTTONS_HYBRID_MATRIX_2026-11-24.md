# ¿Qué botón usar? Matriz de salidas HLS con híbrido APE Crystal v9.4

**Fecha:** 2026-11-24 · **Estado:** verificado con el arnés de despacho y el test del panel.

## Respuesta corta

| Botón | ¿Genera lista? | ¿Lleva híbrido? | Resultado |
|---|---|---|---|
| **VPS · Lista CDN** | Sí; un archivo `_CDN.m3u8` | **Sí: `p=P1` + tag `ROUTE=max` por canal** | Lista CDN completa con metadata LAB. **La más directa para VPS + metadata.** |
| **DIRECTO · Lista limpia** | Sí; un archivo | **Sí: `p=P1` + tag por canal** | Un solo archivo, sin segunda pasada CDN; JIT desactivado en híbrido; canales sin id numérico quedan directos. |
| **AMBAS · dos listas** | Sí; `_DIRECTA` + `_CDN` | **Sí en ambas** | **La más completa:** dos listas con los mismos canales, ambas híbridas. |
| **LIGHT · proyección por perfil** | Sí; base CDN + publicación/proyección en VPS | **Parcial:** conserva `p=P1` de la URL, pero la proyección **descarta el tag híbrido por canal** | Proyección compacta de 9 plantillas + índice; no es la lista completa con metadata/tag. Solo HLS. |

**Recomendación:**

- Si quieres **una sola lista canónica** con todo el híbrido y la metadata: **VPS**.
- Si quieres **el resultado más completo** (CDN + directa, ambas híbridas): **AMBAS**.
- **DIRECTO** también implementa el híbrido, pero entrega una sola lista y no la CDN.
- **LIGHT** es para tamaño/velocidad de publicación, no para “todo lo dialogado”: hereda el `p=P1` de la URL, pero su proyección elimina la familia `#EXT-X-APE-*` salvo el LAB (por diseño de `ape-list-project.sh`).

## Evidencia

1. **VPS, DIRECTO y AMBAS** pasan por `prepublishAndGenerateDual()` / `prepublishAndGenerateDirect()` y el generador principal. El test `rea-generation-dispatch.test.js` (39 PASS) comprueba, para las 12 combinaciones de `direct/cdn/both`, picker y gzip:
   - `p=P1` en cada URL `/pulse/`;
   - un `#EXT-X-APE-HYBRID-PULSE:ROUTE=max;` por canal;
   - `CARTRIDGE=P1.5`, `MODE=SIMULATED`, `EXECUTED=0`.
2. **LIGHT** genera primero la base CDN por el mismo pipeline (por tanto la base sí lleva `p=P1` y tag). Después llama a `list-publish.php`:
   - `ape-list-project.sh` conserva `#EXTINF`, `#EXTHTTP`, `#EXTSHIMOTT`, la URL **verbatim** y `#EXT-X-APE-LAB-METADATA`; **descarta el resto de `#EXT-X-APE-*`**, incluido el tag híbrido por canal.
   - `ape-profile-project.js` usa la URL de la propia lista y guarda su posición; no reescribe el `p`.
   - Resultado: **el `p=P1` sobrevive; el tag híbrido por canal no**.
3. El test del panel (`gen-output-panel-format.test.js`, 36 PASS) verifica que la tarjeta DIRECTO declara el cableado como *solicitado*, el alcance de los canales sin id y que el JIT está desactivado en híbrido (no va por `/pulse/`).

## Qué NO promete

- No convierte el bitstream en 4K: el `p=P1` selecciona P1.5 y el display ejecuta los video filters (`MODE=SIMULATED`, `EXECUTED=0`).
- LIGHT no replica el tag híbrido por canal; si lo necesitas literal en la lista servida, usa VPS/AMBAS.
- LIGHT exige que la base esté publicada en el VPS y solo aplica a HLS; DASH no aplica.
- 8K se conserva en P0; no hay lienzo superior en el contrato.

## Rollback / variantes

- `window.APE_HYBRID_CRYSTAL = false`: la app deja de añadir `p`/tag.
- `APE_HYBRID_PULSE=0`: el envoltorio de servidor no añade `p`/tag.
- `APE_HYBRID_UPSCALE_ALL=0`: vuelve al contrato `balanced`/`native` sin el override de todas las resoluciones.
