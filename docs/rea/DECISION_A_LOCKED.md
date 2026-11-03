# Decisión del propietario — Opción A LOCKED (B anulada)

**Fecha/hora:** 2026-10-28 04:15 (America/Bogota) · **Owner:** propietario del sistema · **Team:** `equipo-enterprise-10-adn`
**Documento de gobierno.** No es una propuesta: es la decisión que cierra la disputa doctrinal `AU-01`.

## Texto de la decisión

> **«Anular la opción B, pues cambia mi doctrina; no la aplica esa B. APLICAR LA A que es la resolución como capitán (A, la que conserva mi decisión).»**

## Qué significa, sin interpretación

1. **A es la regla vigente.** `declare_auto` **NO se quita**: sigue siendo la ruta viva por defecto (`uhd_auto=1`) y sigue reescribiendo `RESOLUTION` a 4K/8K.
2. **B queda anulada** y **no se implementará ni se volverá a proponer** como cambio: exigir fuente ≥7680 para declarar 8K alteraría la decisión de producto LOCKED.
3. **Cómo se evita la mentira** (el motivo del HIGH `AU-01`): no con menos 8K, sino con **trazabilidad**:
   - `can_declare_8k = (uhd8k=1) AND (nivel HEVC ≥ L183 en todas las variantes top)`.
   - Fuente **≥3840 se conserva** como **excepción de producto** declarada.
   - Toda variante que declare 8K sobre fuente <7680 **debe** llevar `#EXT-X-APE-UPSCALE:…;src=<real>;declared=7680;can8k=1`.
   - Esa variante **nunca** se etiqueta `-REAL`.
   - `CODECS=` intocable (GOLDEN RULE); 8K con nivel <L183 sigue siendo blocker de doctrina.
4. **Matriz de casos:** `ERRATA_AU.md §1b` (6 filas), incluido «4K L183 → 8K producto MARCADO».

## Efectos

- **`PLAN_REA.md` v3 (`9936c937…`) queda vigente tal cual**: F0-2 y V-3 ya reflejan A.
- Cualquier revisión futura que proponga B (o un umbral ≥7680 como condición general) **se rechaza por decisión del propietario**, citando este documento; no se reabre el debate.
- **Alcance:** esto fija doctrina. **No autoriza** por sí mismo el despliegue de Fase 0, la tarea puente (fila E5 §4.8 + guard) ni B-11 (nodo GPU, €423). Cada una sigue requiriendo su autorización expresa.

## Referencias

`PLAN_REA.md` v3 · `02_EDGE_DECLARE_AUTO_API.md` v3 · `ERRATA_AU.md` v2 §1b · `CERTIFICACION_CAPITAN.md` · auditorías `AUDITORIA_PLAN_REA*`.
