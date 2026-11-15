# Referencias externas — iptv-supreme-repos-4k

Toda fuente se consultó el **2026-11-15**. Se distingue lo leído de lo ejecutado.

## Fuentes primarias consultadas (medidas)

| Fuente | Uso | Estado |
|---|---|---|
| `GET https://api.github.com/repos/{owner}/{repo}` | estrellas, forks, lenguaje, licencia SPDX, `pushed_at`, `archived` | **medido** (11/11) |
| `GET https://iptv-org.github.io/api/streams.json` | inventario y distribución de `quality` | **medido** (18.689 objetos) |
| `GET https://iptv-org.github.io/api/channels.json` | tamaño del catálogo de canales | **medido** (31.843 objetos) |
| `GET https://iptv-org.github.io/api/categories.json` | lista de categorías (ninguna 4K) | **medido** (30) |
| `GET https://iptv-org.github.io/iptv/index.m3u` | canales servidos | **medido** (11.502 `#EXTINF`) |
| `GET .../countries/us.m3u`, `.../categories/sports.m3u` | patrón por país/categoría | **medido** (1.497 / 525) |
| `GET https://dearbulut.github.io/iptv/` | raíz del sitio y enlace a la API | **medido** (200) |
| `GET .../api/v1/openapi.json` | contrato real de la API | **medido** (OpenAPI 3.1.0) |
| `GET .../api/v1/channels.json` | payload real | **medido** (26,6 MB) |
| `GET .../categories/4k.m3u`, `.../8k.m3u`, `.../api/channels.json`, `.../api/4k.json` | URLs declaradas por el catálogo | **404 medido** (4/4) |

## Fuentes declaradas y NO ejecutadas

| Afirmación | Autor | Estado |
|---|---|---|
| `--resolution-check` y `results.resolution.real` de `iptv-checker` | catálogo del owner | **declarado** |
| 39.000+ canales de `dearbulut` con health checks cada 6 h | descripción del repo | **declarado** |
| DVR+Comskip, catch-up, VOD de `Dispatcharr` | descripción del repo | **declarado** |
| Filtrado/merging/scheduling de `tuliprox` | descripción del repo | **declarado** |
| Pasos 2-4 del pipeline (iptv-checker, jq, generate-m3u.js) | catálogo del owner | **no ejecutado** |

## Normas internas del repo que limitan esta skill

- `docs/policies/ANTI_DEGRADATION_LAW.md` — prohibido bajar 4K a FHD/H.264/SDR o
  declarar 4K sobre una fuente FHD.
- `.agent/skills/Skill_Fake_4K_Detector` — un 4K declarado por nombre no es 4K.
- `.gemini/settings/shielded.md` — SHIELDED es rename de fichero, nunca
  transformación de URLs internas.
- `AGENTS.md` → REGLA LEGAL Y ÉTICA — solo fuentes autorizadas por el propietario.

## Lo que este documento no hace

No copia READMEs ni descripciones de los repos como si fueran medición. Las
descripciones son del autor; el número de estrellas es de la API; el código HTTP es
de la petición. Mezclarlos es cómo nace un catálogo que parece verificable y no lo es.
