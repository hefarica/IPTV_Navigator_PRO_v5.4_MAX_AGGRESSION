# Validación del Capitán — capítulo S9 y decisiones de gobernanza

**Rol:** capitán del team `equipo-enterprise-10-adn`. No soy autor de ninguno de los 8 informes del Council.
**Fecha:** 2026-10-26. **Snapshot:** blob HEAD `c1277bdfdc46debfc762eb86e22f77b85b66e250` (707.323 B / 11.144 líneas).
**Motivo:** recusación simétrica por autoría — `s5-qoe-qos` es autor de S5 (no lo autovalida) y `s9-player-compat` es autor de S9 (no lo autovalida). `t12` (s9) audita el capítulo **S5**, del que no es autor. El capítulo **S9** lo valida el capitán aquí.

## Método

Re-medición independiente sobre el árbol y sobre el blob congelado, sin tocar el VPS (`iptv-vps-touch-nothing`), sin ejecutar el generador y sin dispositivo de reproducción. Cada control abajo se resolvió con `git show HEAD:<path>` / lectura de archivo / conteo de regex, no con la narración del informe.

## Controles sobre el capítulo S9

| # | Afirmación de S9 | Medición del capitán | Veredicto |
|---|---|---|---|
| C1 | `emitTivimateSafe` = `emitStandardHls` + etiqueta, **sin** reducción a single-value | `parsers/ape-player-profile-emitter.js:60-64`: `const out = emitStandardHls(canonical); out.profile = 'TIVIMATE_SAFE'; return out;` | **CONFIRMADO** |
| C2 | 0 `split(',')` sobre valores de header en el emisor de perfiles | `ape-profiles-config.js` (1.682 líneas): **0** ocurrencias de `.split(',')` | **CONFIRMADO** |
| C3 | 4-layer cableado en los 6 perfiles (`headerOverrides`) | `ape-profiles-config.js`: **11** ocurrencias, 6 bloques de perfil en L335/397/459/521/582/641 + L1227-1243 | **CONFIRMADO** |
| C4 | `#EXT-X-SESSION-DATA` (master-only) en la cabecera del catálogo, citado `:2646` | El tag **sí** se emite en la cabecera: `coreHeader.push('#EXT-X-SESSION-DATA:...')` en **HEAD:2458** (y usos en 2458/2650/2696, 20 ocurrencias en total). La línea 2646 es un *matcher* de `#EXT-X-DEFINE`, no la emisión | **CONFIRMADO con corrección de cita** (2458, no 2646) |
| C5 | `audit_bulletproof_output.m3u8` es artefacto VIEJO, no evidencia contra HEAD | Marcadores `X-Codec-Audio` y `X-Codec-Primary` presentes en **10/10** bloques `#EXTHTTP` ⇒ anterior al retiro de esas claves | **CONFIRMADO** |
| C6 | Ese artefacto trae tóxicos: `TE`/`Range`/`Priority` 10/10, `Upgrade-Insecure-Requests` **4/10** | Como claves JSON: `TE` 10/10, `Range` 10/10, `Priority` 10/10, `Upgrade-Insecure-Requests` **5/10** | **CONFIRMADO con corrección de conteo** (5/10) |
| C7 | Reproducción real en dispositivo | No hay dispositivo disponible | **NOT_RUN** (no se promueve) |
| C8 | Capa VPS desplegada | VPS medido = rebase-only (`VPS_REALITY_MEASURED_2026-10-25.md`); PHP del repo no desplegado | **BLOCKED** (coincide) |

**Veredicto del capitán sobre S9:** **FAIL** — coincide con el veredicto del autor, con **2 correcciones de cita/conteo** (C4: línea de emisión 2458; C6: 5/10 en vez de 4/10) que no cambian el sentido del hallazgo. El resto de los controles es reproducible.

## Decisiones de gobernanza pendientes (ratificadas)

1. **Capítulo S5:** lo valida `t12` (s9, no autor). El capitán no lo firma para no duplicar la figura de revisor. Hasta entonces, S5 queda `PENDIENTE_VALIDACION` en `SCORECARD.json` — estado correcto, no un defecto.
2. **S7 sin counts binarios:** se **acepta** `counts: null`. El autor no publicó tabla de veredicto y el consolidador se negó a inventarla: esa negativa es la conducta correcta. S7 queda con veredicto textual (WARN repo / BLOCKED operación 365 d) y fuera del total de 138 ítems, que se declara explícitamente.
3. **13 tareas propuestas (CONSOLIDADO §7):** quedan registradas como **backlog con dueño propuesto, ninguna ejecutada**. No se declaran como trabajo hecho ni como PASS.

## Límites de esta validación

- No se abrió el VPS, no se ejecutó el generador, no se reprodujo vídeo en dispositivo.
- No se valida aquí el contenido de los capítulos S1–S8 ni S10: eso corresponde a `t12`/consolidación.
- El WT del generador sigue mutando (última observación: 11.594 líneas / `c1301f1f` / 748.145 B); ninguna medición de este documento usa el WT.
- Esta validación no convierte a S9 en PASS: el capítulo conserva su `FAIL` de autor con las correcciones indicadas.

---

## Apéndice (2026-10-27) — Ratificación del conteo final: **49 PASS**

El consolidador del Ciclo 2 (`t16`) pidió ratificación entre **49** (regla uniforme) y **51** (excepción documentada). El capitán ratifica **49**.

**Prueba de que no hay doble resta.** El v1 sumaba 53 = S1 8 + S2 4 + S3 15 + S4 8 + S5 0 + S6 8 + S8 6 + S9 2 + S10 2. **S7 tiene `counts: null` y aporta 0 a ese total.**

| Paso | PASS | Fila que lo causa | ¿Legítimo? |
|---|---|---|---|
| 0 | 53 | `consolidado/SCORECARD.json` v1 (inmutable) | — |
| 1 | 51 | `S8_red_tcp_quic.md:31` "PASS con drift" + `:35` "PASS parcial" (AUD-03) | **Sí** |
| 2 | 50 | `S9_player_compat.md:96` C1 "PASS (con reserva)" | **Sí** |
| 3 | **49** | `S7_S10_sre_seguridad.md:151` "PASS condicionado" (`qoe-flush.php`) | **Sí** |

La fila `:151` **no es de S7**: cae dentro de la sección `## 7. S10 · Superficie de auth de endpoints` (L145-L159), por lo que estaba contada en el PASS de **S10** (2 → 1). No se resta dos veces nada: S7 nunca aportó al total.

**Resultado ratificado: 49 PASS · 68 FAIL · 2 BLOCKED · 15 NOT_RUN = 134 ítems con veredicto**, con S7 `null` fuera del conteo. Denominadores históricos que no deben confundirse: 138 (suma cruda v1), 136 (base 51), **134 (ratificado)**.

**Regla ratificada para todo el equipo:** un PASS calificado —con reserva, condicionado o con drift— **no suma como PASS**, en cualquier dimensión. `ciclo2/correcciones/SCORECARD_v2.json` queda **ratificado sin cambios** (no se emite v3). El auditor de cierre (`t17`) debe verificar contra 49 y contra la sección 7 del informe S7+S10.

---

## Apéndice 2 (2026-10-27) — Corrección de verificación: el artefacto del 26-oct **NO** desapareció

`t14` declaró cerrado `VERSION:9` «por desaparición del artefacto». **Verificación del capitán (re-ejecutada):** `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` **existe** — 459.587 B, mtime 2026-05-11, **untracked** — y contiene `#EXT-X-VERSION:9` ×1, `SUPPLEMENTAL-CODECS` ×10, `lcev.1.1.1` ×10, `EXT-X-I-FRAME-STREAM-INF` ×10, `#EXTINF` ×10.

Consecuencias que `t17` debe registrar en `CIERRE.json`:
1. **`VERSION:9` en el artefacto sigue ABIERTO** (`ABIERTO_ARTEFACTO_NO_VERSIONADO`); lo cerrado es `SUPPLEMENTAL-CODECS/lcev` **en el emisor** (0 ocurrencias en `b7b59446`).
2. El artefacto **no es evidencia de commit** (untracked en `e38a89b` y `d81ddb3`), pero **sí de disco**: lo citado por el Council se puede re-medir mientras el archivo exista.
3. El reporte de `t14` («2 CERRADOS») queda **corregido a 1 CERRADO + 1 ABIERTO (artefacto)**. No se edita el informe terminal; la corrección vive aquí y en la auditoría de cierre.
