# Referencias — iptv-4k-pipeline-automation

## Fuentes de datos (medidas 2026-11-15)

| Fuente | Uso | Estado |
|---|---|---|
| `https://iptv-org.github.io/api/streams.json` | inventario real: 18.689 streams, 14.712 con `quality`, 20 con `2160p` | medido |
| `https://iptv-org.github.io/api/categories.json` | 30 categorías, ninguna 4K | medido |
| `https://iptv-org.github.io/iptv/index.m3u` | 11.502 canales, cabecera `#EXTM3U` | medido |
| `https://iptv-org.github.io/iptv/categories/4k.m3u` | el pipeline original lo usaba | **404** |
| `https://dearbulut.github.io/iptv/api/v1/channels.json` | alternativa con metadatos, 26,6 MB | medido (200) |

## Estándares y formatos

- **M3U Plus**: `#EXTM3U` + `#EXTINF:-1 tvg-id tvg-name tvg-logo group-title,Nombre`.
- **HLS / RFC 8216** — `#EXT-X-STREAM-INF` pertenece a un *master playlist* con
  variantes reales; no a una lista de canales.
- **Anti-509**: una URL por bloque `#EXTINF` (doctrina del repo; upstreams con
  `max_connections=1` devuelven 509 con múltiples URLs por canal).
- **SHIELDED**: el shielding es rename de fichero (`_SHIELDED.m3u8`), **nunca**
  transformación de las URLs internas (`.gemini/settings/shielded.md`).

## Normas internas

- `docs/policies/ANTI_DEGRADATION_LAW.md` — gate:
  `node tools/check_anti_degradation_policy.js`.
- `docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md` — el enhancement se declara como
  enhancement; la fuente se declara como fuente.
- `docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md` — 6K es opt-in y no puede
  degradar 4K ni declararse falso.
- `.agent/skills/Skill_Fake_4K_Detector` — upscale declarado como 4K.
- `AGENTS.md` → REGLA LEGAL Y ÉTICA — solo fuentes autorizadas.

## Lo que no se usa como fuente

- `gender`-style listas de foros sin dueño identificable.
- Listas con credenciales de terceros.
- Cualquier endpoint que exija saltarse un `401/403/DRM`.

## Referencias cruzadas

`iptv-supreme-repos-4k` · `iptv-4k-source-truth-audit` ·
`single-url-per-channel-enforcer` · `extinf-line-formatter` ·
`extm3u-header-emitter` · `iptv-real-resolution-verifier` ·
`iptv-hls-validator` · `shielded-suffix-renamer`.
