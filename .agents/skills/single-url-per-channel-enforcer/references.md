# References — single-url-per-channel-enforcer

## Fuentes canónicas estudiadas (ningún código copiado; patrones adaptados)

### HLS/M3U8 domain
- RFC 8216 (HLS): https://datatracker.ietf.org/doc/html/rfc8216
- Apple HLS Authoring: https://developer.apple.com/documentation/http_live_streaming
- DASH-IF guidelines: https://dashif.org/guidelines/
- ISO/IEC 23000-19 (CMAF): https://www.iso.org/standard/79106.html
- RFC 6381 (Codec parameter): https://datatracker.ietf.org/doc/html/rfc6381
- SMPTE ST 2084 (PQ), ST 2086 (mastering metadata), ST 2094-40 (HDR10+)
- BT.2100 (HDR), BT.2020 (color gamut), BT.709 (SDR)

### Repos consultados (NUNCA copiados — solo patrones)
- video-dev/hls.js (MIT) — player reference impl
- videojs/http-streaming (Apache-2) — VHS plugin
- Dash-Industry-Forum/dash.js (BSD-3) — DASH reference
- shaka-project/shaka-player (Apache-2) — Google player
- FFmpeg/FFmpeg (LGPL/GPL) — transcoding reference
- nginx/nginx (BSD-2) — web server
- openresty/openresty (BSD-2) — Lua nginx
- openresty/lua-nginx-module (BSD-2) — Lua HTTP module
- prometheus/prometheus (Apache-2) — monitoring
- grafana/grafana (AGPL-3) — dashboard

### Validadores / Herramientas
- ffprobe (parte de FFmpeg) — codec/profile/level detection
- Bento4 (mp4info, mp4dump) — MP4/CMAF inspection
- mediainfo — container/codec metadata
- shaka-packager — CMAF segmenter
- VMAF (Netflix) — perceptual quality metric
- jq — JSON validator
- yamllint — YAML validator
- shellcheck — Bash linter
- gitleaks / trufflehog / detect-secrets — secret scanners
- trivy / osv-scanner / syft — supply-chain scanners

## Regla de aprendizaje continuo
Cuando se encuentre un patrón útil en un repo externo:
1. **NO copiar código**.
2. Resumir el patrón en una nota local.
3. Evaluar si aplica al contexto de este repo.
4. Re-implementar adaptado a la arquitectura propia.
5. Agregar prueba.
6. Agregar rollback.
7. Registrar origen en este `references.md`.
8. Agregar entrada en `audit-report.md`.

## Repos clonados localmente
Ninguno en este momento. Si en el futuro se clona un repo de referencia, va a:
`.agents/research/repos/<repo-name>/` con commit SHA fijo + nota de propósito.
