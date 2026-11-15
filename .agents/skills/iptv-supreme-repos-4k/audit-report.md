# Audit report — iptv-supreme-repos-4k

## 2026-11-15 · creación y primera medición

**Motivo:** el owner entregó un catálogo de 11 repos IPTV 4K con estrellas, URLs de
playlist y un pipeline de 4 pasos, y pidió skills + plugin "con el 100 % de la
información". Antes de convertirlo en doctrina se midió.

**Qué se midió**

- 11 repos vía GitHub REST: estrellas, forks, lenguaje, licencia SPDX, `pushed_at`,
  `archived` (ninguno archivado).
- 9 endpoints vía GET (los 5 de iptv-org, 4 de dearbulut) + los 4 declarados.
- Distribución de `quality` en `streams.json` (18.689 objetos).

**Hallazgos que cambiaron la skill**

| # | Hallazgo | Efecto |
|---|---|---|
| 1 | Las 4 URLs declaradas dan 404 | la skill no las presenta como fuentes; da la ruta medida |
| 2 | `categories/4k.m3u` no existe; el 4K real son 20 streams | se sustituye la premisa "30.000 canales 4K" |
| 3 | 4 repos con estrellas insostenibles (41/0/2/0) | se marcan como no sostenidos |
| 4 | `Guovin` infravalorado ×7,5 | se corrige el orden del stack |
| 5 | `Dispatcharr` es AGPL-3.0 | se añade aviso de copyleft |
| 6 | `Drone9988` sin licencia (`null`) | se añade aviso de redistribución |
| 7 | API real de `dearbulut` en `/api/v1/` | se corrige la ruta |

**Drift a vigilar**

- Estrellas y `pushed_at` caducan rápido. Re-medir antes del **2026-12-15**.
- Si `iptv-org` publica una categoría 4K real, la receta de filtrado queda
  obsoleta: comprobar `api/categories.json` (30 categorías el 2026-11-15).
- Si `dearbulut` restaura `/api/channels.json`, hay que quitar el 404 de la tabla.

**Uso posterior**

- Panel `dsh-plugins/iptv-4k-supremo` (barra lateral izquierda, orden 26) muestra
  esta misma medición. Panel y skill deben coincidir (test T8).
