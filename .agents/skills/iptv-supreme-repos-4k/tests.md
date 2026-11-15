# Tests — iptv-supreme-repos-4k

Casos que verifican las afirmaciones de la skill. Cada uno debe poder ejecutarse sin
confiar en la memoria de una sesión anterior.

## T1 — Estrellas declaradas vs medidas

**Entrada:** `iptv-org/iptv`, `dearbulut/iptv`, `Guovin/iptv-api`.
**Esperado (2026-11-15):** 144.053 / 41 / 26.130.
**Falla si:** la skill afirma "1.5K+" para `dearbulut` sin la marca de declarado.
**Reproducir:** comando 1 de `commands.md`.

## T2 — Los 4 endpoints declarados están en 404

**Entrada:** `categories/4k.m3u`, `categories/8k.m3u`, `api/channels.json`,
`api/4k.json`.
**Esperado:** los cuatro responden 404.
**Falla si:** la skill presenta `categories/4k.m3u` como fuente usable.

## T3 — La ruta real al 4K devuelve 20

**Entrada:** `streams.json` filtrado por `quality == "2160p"`.
**Esperado:** 20 streams; 0 con 8K.
**Tolerancia:** ±20 % (los catálogos cambian); si cambia > 20 %, actualizar la
skill y la fecha.

## T4 — Distribución de calidad

**Esperado (orden):** 1080p 5.769 · 720p 5.118 · 576p 2.423 · 480p 446 ·
360p 273 · 2160p 20.
**Falla si:** la skill dice que el catálogo de iptv-org es mayoritariamente 4K.

## T5 — Licencias

**Esperado:** `Dispatcharr` = AGPL-3.0; `Drone9988/IPTV` = null; `Guovin` y
`kpirnie` = NOASSERTION; `iptv-org/*` = Unlicense.
**Falla si:** se recomienda `Drone9988` sin advertir que no hay licencia.

## T6 — Estabilidad

**Esperado:** `freearhey/iptv-checker` último push 2026-03-06;
`alperokur/xtream-api-proxy-epg` 2025-07-26.
**Falla si:** se recomiendan como "mantenidos activamente".

## T7 — El JSON de ejemplo no es evidencia

**Entrada:** el esquema del catálogo con `"verified": true`.
**Esperado:** la skill lo marca como **declarado** y no deduce resolución real.
**Falla si:** alguien cita `verified: true` como prueba de 4K.

## T8 — Coherencia panel ↔ skill

**Entrada:** `dsh-plugins/iptv-4k-supremo/client.js` (panel) y esta skill.
**Esperado:** los 11 repos y sus 11 pares declarado/medido coinciden; los códigos
HTTP de los endpoints coinciden.
**Falla si:** un valor del panel no existe en la skill o viceversa.

## T9 — Anti-degradación

**Entrada:** una lista generada a partir de estos repos.
**Esperado:** ningún canal 1080p etiquetado 4K; `RESOLUTION` coherente con la
fuente declarada.
**Gate del repo:** `node tools/check_anti_degradation_policy.js`.
