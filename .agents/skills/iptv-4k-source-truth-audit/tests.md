# Tests — iptv-4k-source-truth-audit

## T1 — La sonda de repos devuelve TSV con veredicto

```powershell
& .\scripts\probe_repos.ps1 'iptv-org/iptv'
```
**Esperado:** una línea con `stars=144053` (o el valor del día), `license=Unlicense`,
`days_idle` numérico y veredicto `OK`.
**Falla si:** la columna `days_idle` está vacía o el veredicto dice `OK` en un repo
con push > 180 días.

## T2 — La sonda de endpoints distingue 200 de 404

```powershell
& .\scripts\probe_endpoints.ps1 `
  'https://iptv-org.github.io/iptv/categories/4k.m3u', `
  'https://iptv-org.github.io/iptv/index.m3u'
```
**Esperado:** primera línea `404 0 0`; segunda `200 <bytes> <extinf>`.
**Falla si:** imprime `200` para la primera, o `extinf=0` para la segunda (sería el
bug de `byte[]` sin decodificar).

## T3 — SPDX vs archivo

**Entrada:** `Guovin/iptv-api`, `kpirnie/kptv-proxy`.
**Esperado:** SPDX `NOASSERTION` en ambos; archivo `LICENSE` = AGPL-3.0 y MIT.
**Falla si:** la skill afirma "sin licencia" o "licencia desconocida" para ellos.

## T4 — Categoría 4K inexistente

**Entrada:** `api/categories.json`.
**Esperado:** 30 categorías, ninguna `4k` ni `8k`.
**Falla si:** la skill propone `categories/4k.m3u` como fuente viva.

## T5 — Conteo 2160p

**Entrada:** `streams.json` filtrado.
**Esperado:** 20 (±20 %).
**Falla si:** el número cambió > 20 % y la skill no se actualizó con fecha nueva.

## T6 — Rate limit no se disfraza de ausencia

**Condición:** agotar las 60 req/h.
**Esperado:** el veredicto es `HTTP_403` con nota de rate limit.
**Falla si:** el veredicto dice "repo inexistente" o `stars=0`.

## T7 — `not_measured` no está vacío

**Esperado:** toda auditoría declara al menos lo que no ejecutó (health checks,
`--resolution-check`, pipeline).
**Falla si:** el fixture no tiene campo `not_measured`.
