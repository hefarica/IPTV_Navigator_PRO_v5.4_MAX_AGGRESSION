# ARTIFACT — CADENA DE MANIFESTACIÓN (11 ESLABONES · ADN embebido end-to-end)

**Generated:** 2026-05-17
**Source:** User directive 2026-05-17 — PROMPT MAESTRO INGENIERO IPTV SUPREMO
**Authority:** All 13 specialists (S1-S13)
**Mission:** Garantizar que cada bit de calidad codificado en el toolkit se materialice 1:1 en cualquier TV del mundo

---

## 1. Principio cardinal

> Cada bondad técnica codificada en el código fuente DEBE atravesar sin pérdida los 11 eslabones de la cadena de reproducción y **MANIFESTARSE FÍSICAMENTE** como calidad observable en pantalla.
>
> Si UN solo eslabón degrada metadata, el toolkit FALLA.

---

## 2. Los 11 eslabones (mapa de archivos del repo + responsabilidad)

| # | Eslabón | Archivo(s) | Especialista responsable | Riesgo de degradación |
|---|---|---|---|---|
| 1 | **CORE GENERATOR** | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (9982L) | S1 IPTV/HLS Architect | Strip de codec strings, falso HDR, fake-4K |
| 2 | **API SERVER** | `IPTV_v5.4_MAX_AGGRESSION/frontend/backend_v15/ape_server_v15_ultimate.py` (Python FastAPI) | S6 Nginx Engineer + S13 Repo Surgeon | Reescritura destructiva de metadata |
| 3 | **VPS NGINX** | `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/nginx.conf` | S6 + S7 | Touch a EXT-X-* o codec strings |
| 4 | **LUA BODY FILTER** | `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua` | S6 + S7 | Lua reescribe pierde COLOR-PRIMARIES/VIDEO-RANGE |
| 5 | **CMAF PROXY** | `IPTV_v5.4_MAX_AGGRESSION/backend/cmaf_engine/` PHP modules | S2 LL-HLS/CMAF Engineer | fMP4 boxes `colr`/`mdcv`/`clli` stripped |
| 6 | **DNS RESOLUTION** | VPS `/etc/unbound/unbound.conf` (per `reference_vps_unbound_dns_recipe`) | S7 + S8 | Resolución > 5ms o desviación a CDN inferior |
| 7 | **TUNNEL WIREGUARD** | `/etc/wireguard/wg0.conf`, `wg-surfshark.conf` | S7 + S8 | Throttling ISP, BBR no activo |
| 8 | **CDN EDGE / KEEP-ALIVE** | `nginx.conf` upstream + `proxy_http_version 1.1` | S6 + S8 | HTTP/2 no negociado, TLS 1.3 no 0-RTT |
| 9 | **CLIENT PLAYER** | hls.js / ExoPlayer / AVPlayer / VLC (configs en `frontend/`) | S9 Player Engineer | `canPlayType()` falla → fallback tier inferior |
| 10 | **HARDWARE DECODER** | SoC del cliente (Fire TV 4K Max Amlogic, Onn 4K Mediatek, etc.) | S9 + S3 | Software fallback en lugar de HW path |
| 11 | **DISPLAY PIPELINE** | Panel TV/monitor del usuario | S4 Color Scientist HDR | HDR10 metadata no reconocida → tone-mapping |

---

## 3. Matriz de propagación (qué se transmite, qué se preserva, dónde se rompe)

| Bondad → Eslabón | 1 Gen | 2 API | 3 Nginx | 4 Lua | 5 CMAF | 6 DNS | 7 WG | 8 CDN | 9 Player | 10 HW | 11 Display |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Codec string (hvc1.2.4.L153.B0) | EMIT | passthrough | passthrough | passthrough | n/a | n/a | n/a | passthrough | parse `canPlayType` | decode native | render |
| VIDEO-RANGE=PQ | EMIT | passthrough | passthrough | **preserve** | passthrough | n/a | n/a | passthrough | parse HDR meta | HDR-aware | activate HDR mode |
| COLOR-PRIMARIES=9 | EMIT | passthrough | passthrough | **preserve** | n/a | n/a | n/a | passthrough | parse | decode w/ BT.2020 | BT.2020 panel |
| TRANSFER-CHAR=16 (PQ) | EMIT | passthrough | passthrough | **preserve** | n/a | n/a | n/a | passthrough | parse | decode PQ | PQ panel mode |
| MATRIX-COEFF=9 (BT.2020 NC) | EMIT | passthrough | passthrough | **preserve** | n/a | n/a | n/a | passthrough | parse | decode | render correct |
| `mdcv`/`clli` boxes (fMP4) | n/a (string) | n/a | n/a | n/a | **preserve** | n/a | n/a | passthrough | parse fmp4 | HDR metadata | mastering luminance |
| Audio CODECS="ec-3" | EMIT | passthrough | passthrough | passthrough | passthrough | n/a | n/a | passthrough | parse | passthrough or decode | Atmos/DD+ |
| LL-HLS PART | EMIT (media pl) | passthrough | **chunked transfer** | **preserve** | passthrough | n/a | n/a | HTTP/2 | parse blocking reload | n/a | low-latency |
| KEEPALIVE | n/a | upstream cfg | `keepalive 1` | n/a | n/a | n/a | n/a | persistent | persistent fetch | n/a | n/a |
| Single URL (Anti-509) | **EMIT** (1 URL/ch) | passthrough | passthrough | passthrough | n/a | n/a | n/a | n/a | request 1 URL | n/a | n/a |

Legenda:
- **EMIT** — el eslabón origina la bondad
- **passthrough** — el eslabón debe transmitir sin tocar
- **preserve** — el eslabón puede transformar pero DEBE conservar el campo
- **parse** — el eslabón interpreta y actúa
- **n/a** — no aplica

---

## 4. Auditoría por eslabón (estado actual del repo)

### Eslabón 1 — CORE GENERATOR
- **Status**: ⚠ Agent F lock + uncommitted (4 archivos modified)
- **Capability**: ✅ Cascada 11-tier mapeada (vía `ARTIFACT_FASE1_GENERATOR_MAP.md`)
- **Capability**: ✅ M1+M2+M5 audit guards L44-L119 enforce JSON valid + cap + order
- **Riesgo verificado**: C8 (2026-05-11) removió `Range: bytes=0-` toxic
- **Acción FASE 1 cuando libere lock**: verificar que CODECS field selecciona del set definitivo 11-tier
- **Acción**: añadir emission de COLOR-PRIMARIES + TRANSFER-CHARACTERISTICS + MATRIX-COEFFICIENTS al STREAM-INF cuando tier es HDR (T1-T6)

### Eslabón 2 — API SERVER
- **Status**: read-only audit en este sprint
- **Capability**: FastAPI Python · maneja uploads + relay
- **Acción**: invocar `S13 Repo Surgeon` para confirmar que NO reescribe `EXT-X-*` ni codec strings al pasar listas

### Eslabón 3 — VPS NGINX
- **Status**: ✅ autopista doctrine respetada per memoria · NO tocar sin checklist
- **Capability**: `proxy_pass_request_headers off`, `proxy_cache_valid 302 0`, BBR active
- **Acción FASE 6**: verificar `proxy_buffering off` + `proxy_request_buffering off` para streaming preserve

### Eslabón 4 — LUA BODY FILTER
- **Status**: PASSTHROUGH/telemetry-only per autopista doctrine
- **Capability**: NO reescritura activa de body — solo logging
- **Riesgo**: si en futuro se añade `body_filter_by_lua` para reescritura, MUST preserve EXT-X-* + codec strings

### Eslabón 5 — CMAF PROXY
- **Status**: read-only audit en este sprint
- **Capability**: PHP modular en `backend/cmaf_engine/`
- **Acción**: verificar que repackager fMP4 NO strippea boxes `colr` (color), `mdcv` (mastering display color volume), `clli` (content light level info)

### Eslabón 6 — DNS RESOLUTION
- **Status**: ✅ Unbound deployado per `reference_vps_unbound_dns_recipe`
- **Capability**: 39× speedup cache hit vs ETB baseline
- **Acción**: monitorizar resolución < 5ms (Prometheus latency metric)

### Eslabón 7 — TUNNEL WIREGUARD
- **Status**: ✅ WG Health Monitor deployado per `reference_wireguard_health_monitor_DEPLOYED`
- **Capability**: failover Miami↔Brasil sub-second per session `20260511_tcp_reactor_failover_deployment`
- **Acción**: BBR ya activo · monitorizar congestion control

### Eslabón 8 — CDN EDGE / KEEP-ALIVE
- **Status**: provider-dependent (Xtream upstream)
- **Capability**: HTTP/2 negociado en Nginx VPS
- **Riesgo**: keepalive con upstream Xtream debe ser `keepalive 1` (no más) per session bleed risk

### Eslabón 9 — CLIENT PLAYER
- **Status**: ✅ matriz documentada en `ARTIFACT_PLAYER_COMPATIBILITY_MATRIX.md` §8
- **Capability**: 11 tiers × 10 players matriz de soporte
- **Acción**: wire Conviva engine al HTML + player event hooks (próxima sesión)

### Eslabón 10 — HARDWARE DECODER
- **Status**: device-dependent
- **Capability**: Fire TV 4K Max + Onn 4K soportan Main 10 HW · Fire TV Stick 1080p NO soporta T1-T3 Main10 4K HW
- **Acción**: Multi-variant Master playlist garantiza que el player elige el tier que el HW soporta

### Eslabón 11 — DISPLAY PIPELINE
- **Status**: end-user TV-dependent
- **Capability**: HDR10 + Dolby Vision si TV lo soporta y EDID negocia
- **Acción**: emitir metadata correcta + STABLE-VARIANT-ID para evitar yoyo durante negotiation

---

## 5. Garantía end-to-end (bit → photon)

Para cada `#EXT-X-STREAM-INF` con `VIDEO-RANGE=PQ`:

```
[1] Gen emits: STREAM-INF CODECS="hvc1.2.4.L153.B0" VIDEO-RANGE=PQ
   ↓
[2] API server: passthrough sin tocar
   ↓
[3] Nginx: passthrough (proxy_buffering off, no rewrite)
   ↓
[4] Lua: log-only, no body filter activo
   ↓
[5] CMAF: si fMP4, init.mp4 contiene 'colr' box con nclx (BT.2020/PQ/Matrix=9)
   ↓
[6] DNS: resolve < 5ms (cache hit)
   ↓
[7] WG: tunnel sin throttling, BBR
   ↓
[8] CDN: HTTP/2 multiplex, persistent connection
   ↓
[9] Player (ExoPlayer): canPlayType("video/mp4;codecs=hvc1.2.4.L153.B0") = "probably"
   ↓ MediaCodec.createDecoderByType("video/hevc", profile=Main10, level=5.1)
[10] HW decoder: native 10-bit decode (no SW fallback)
   ↓
[11] Display: EDID negocia HDR10, panel mode BT.2020 PQ activo
   ↓
[RESULT] Photon emerges with full 10-bit HDR fidelity from panel
```

Si CUALQUIER paso de [1→11] introduce strip/rewrite/fallback, la fidelidad cae a fallback inferior.

---

## 6. Monitoring (Prometheus metrics per-eslabón)

| Eslabón | KPI Prometheus | Threshold |
|---|---|---|
| 1 Gen | `iptv_generator_tier_emit_total{tier="T1..T11"}` | distribución observable |
| 2 API | `iptv_api_metadata_drift_total` | == 0 |
| 3 Nginx | `iptv_nginx_proxy_buffering_active` | == 0 (off) |
| 4 Lua | `iptv_lua_body_filter_active` | == 0 (passthrough) |
| 5 CMAF | `iptv_cmaf_color_box_present_ratio` | >= 0.99 |
| 6 DNS | `iptv_dns_resolve_seconds` | p95 < 0.005 |
| 7 WG | `iptv_wireguard_throughput_mbps` | matches link speed |
| 8 CDN | `iptv_cdn_http2_negotiated_ratio` | >= 0.99 |
| 9 Player | `iptv_player_canplaytype_probably_ratio{tier}` | per-tier device cap |
| 10 HW | `iptv_hw_decoder_path_used_ratio{tier}` | >= 0.95 si tier HW-capable |
| 11 Display | `iptv_display_hdr_active_ratio{channel}` | >= 0.99 cuando emitido HDR |

---

## 7. Failure modes & remediation

| Síntoma observado | Eslabón culpable más probable | Validación | Fix |
|---|---|---|---|
| Player muestra SDR aunque emitido HDR | 4 Lua o 5 CMAF strip de color metadata | `tcpdump` del segment, ffprobe sobre el bytes recibido | refactor body_filter; verificar `colr` box en CMAF init |
| Player selecciona tier inferior al disponible | 9 Player canPlayType + 10 HW limit | console.log `canPlayType` por tier | añadir variant para HW disponible |
| Codec string strip → universal fallback T11 | 3 Nginx rewrite | curl manifest desde el VPS | verificar `proxy_buffering off` y NO sub_filter en location |
| LL-HLS no funciona | 3 Nginx no soporta blocking reload | `nginx -V` para http2_module | actualizar Nginx o desactivar LL-HLS para ese stream |
| HDR aparece tone-mapped | 11 Display EDID negotiation | usar HDFury / EDID test | verificar HDMI 2.0a+ cable + display HDR capable |

---

## 8. Acciones inmediatas

| Acción | Owner | Status | Trigger para liberar |
|---|---|---|---|
| Audit lua `upstream_response.lua` para preservation de EXT-X-* | S6 | HOLD | `audita VPS` + iptv-vps-touch-nothing |
| Audit `cmaf_engine/` para fMP4 box preservation | S2 | HOLD | next session focus |
| Audit `ape_server_v15_ultimate.py` para metadata passthrough | S6 | HOLD | next session focus |
| Wire Conviva al HTML player events | S9 | HOLD | quality-manifest uncommitted commit |
| Generator emit COLOR-PRIMARIES + TRANSFER-CHARACTERISTICS + MATRIX-COEFFICIENTS en STREAM-INF (tier HDR) | S1 + S4 | HOLD | Agent F handoff |

---

## 9. Cross-references

- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — codec strings que viajan por los 11 eslabones
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` — color metadata trifecta detallada
- `ARTIFACT_8_EMBEDDED_BONDADES.md` — qué bondades viajan por la cadena
- `ARTIFACT_MATERIAL_VALIDATION_TESTS.md` — tests A-F end-to-end
- `ARTIFACT_TAG_PARSING_GUARANTEE.md` — garantía RFC §6.3.1 por player
- `ARTIFACT_NGINX_STREAMING_RUNBOOK.md` — eslabones 3-4-8 operativa

---

**Fin Cadena de Manifestación · 11 eslabones · ADN embebido end-to-end.**
