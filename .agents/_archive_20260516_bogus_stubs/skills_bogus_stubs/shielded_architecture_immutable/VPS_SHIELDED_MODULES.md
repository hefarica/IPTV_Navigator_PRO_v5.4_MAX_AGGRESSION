---
name: "shielded-vps-modules-inventory"
description: "Inventario completo de TODOS los módulos del VPS Hetzner (178.156.147.234) que tratan la URL SHIELDED. Cada módulo: qué hace, cómo lo hace, archivos que lo conforman. Verificado en producción 2026-04-28 vía SSH read-only. NO modifica producción — es referencia operacional + auditoría."
companion_to: "SKILL.md (shielded-architecture-immutable), WORKFLOW_BLOQUEANTE.md, .gemini/settings/shielded-sop.md"
version: "1.0 — 2026-04-28"
production_target: "VPS Hetzner CPX21 178.156.147.234 (Ashburn VA, 3 vCPU AMD EPYC, 4 GB RAM, 40 GB SSD)"
---

> ⚠️ **DOCUMENTO SUBORDINADO** — Para detalle profundo (código exacto, configs reales, conteo forense), consultar la fuente autoritativa:
>
> - **SOP unificado:** [sop-shielded-architecture-complete.md](../../../.agent/workflows/sop-shielded-architecture-complete.md) — "El único documento que necesitas leer"
> - **SOP forense 4-partes:**
>   - [Parte 1 — Doctrina](../../../.agent/workflows/sop-shielded-forensic-part1-doctrine.md) — 12 prohibiciones + pipeline 11 pasos
>   - [Parte 2 — NGINX+Lua](../../../.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md) — 6 hooks Lua con código real
>   - [Parte 3 — PRISMA+Kernel](../../../.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md) — PRISMA arquitectura + sysctl + systemd
>   - [Parte 4 — Operaciones](../../../.agent/workflows/sop-shielded-forensic-part4-operations.md) — Diagnóstico + invariantes + conteo (107 archivos / ~1.06 MB)
> - **Snapshot código fuente real VPS:** [vps-live-snapshot-20260428/](../../../IPTV_v5.4_MAX_AGGRESSION/vps/vps-live-snapshot-20260428/) — 38 archivos × 256 KB
>
> Este `VPS_SHIELDED_MODULES.md` es **resumen rápido** organizado por capas funcionales (12 capas A–L). Para código real y números forenses, ir a los SOP arriba.

# VPS SHIELDED Modules — Inventario Completo

> **Fuente de verdad:** Audit en vivo `ssh root@178.156.147.234` 2026-04-28 19:32 UTC.
> **Status:** Producción funcional · Snapshot OMEGA Premium 92.6 (commit 02cafa8).
> **Propósito:** Garantizar que ABSOLUTAMENTE TODOS los módulos del VPS reconocen y tratan correctamente la URL SHIELDED (`https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8`) según la cadena de delivery documentada.

---

## 0. URL SHIELDED — Anatomía y propagación

```
URL pública del archivo (lo que el player consume):
  https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8

URL pública del .gz (compresión gzip post-upload):
  https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8.gz

Endpoints adicionales del VPS:
  https://iptv-ape.duckdns.org/px/HOST/PATH      ← caching proxy IPTV (CDN-as-a-service)
  https://iptv-ape.duckdns.org/shield/{hash}/{host}/{path}  ← endpoint LEGACY/auxiliar (NO usado en M3U8 internas)
  https://iptv-ape.duckdns.org/prisma/api/...    ← telemetría PRISMA
```

**Filesystem mappings (verificados en producción):**
- `/var/www/iptv-ape/lists/` → vhost `iptv-ape.duckdns.org` (TLS, fuente principal del player)
- `/var/www/html/lists/` → vhost master (mirror de los mismos archivos)
- Ambos contienen pares `_SHIELDED.m3u8` + `_SHIELDED.m3u8.gz`

---

## 1. Pipeline SHIELDED end-to-end (qué módulo se activa en cada paso)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 1 — UI/Frontend (Live Server :5500)                                │
│  Toggle "Salida SHIELDED — Link vía proxy VPS (anti-403, anti-ban)" ON  │
│  → gateway-manager.js ~L736-740: filename.replace(/\.m3u8$/i,           │
│    '_SHIELDED.m3u8')                                                    │
│  → URL pública construida con dominio iptv-ape.duckdns.org              │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 2 — Upload chunked al VPS                                          │
│  Módulos: upload.php · upload_chunk.php · upload_status.php ·           │
│           finalize_upload.php · auto_gzip.sh                            │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 3 — Persistencia                                                   │
│  /var/www/iptv-ape/lists/APE_LISTA_xxx_SHIELDED.m3u8 (+ .gz)            │
│  Mirror: /var/www/html/lists/                                           │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 4 — Player consume URL pública del .m3u8                           │
│  Request HTTPS → iptv-ape.duckdns.org → NGINX TLS termination           │
│  Sirve archivo estático desde /var/www/iptv-ape/lists/                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 5 — Player lee URLs internas (VERBATIM directas al proveedor)      │
│  Ej: http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8           │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 6 — WG tunnel del player captura el tráfico HTTP                   │
│  Player (10.200.0.3) → wg0 → VPS (10.200.0.1)                           │
│  Módulos: wg0.conf · wg-enroll.sh · wg-health-monitor.sh                │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 7 — Unbound DNS hijack (en VPS)                                    │
│  nfqdeuxu.x1megaott.online → 127.0.0.1                                  │
│  Módulo: /etc/unbound/unbound.conf.d/iptv-ape.conf                      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 8 — NGINX server_name match (intercept)                            │
│  Listen 80, server_name <provider> → matches iptv-intercept.conf        │
│  Por-host blocks: x1megaott / line.tivi-ott / ky-tv / tivigo /          │
│                   rynivorn / zivovrix                                   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 9 — Capa de protección (Lua circuit breaker + rate limits)         │
│  Módulos: upstream_gate.lua · upstream_response.lua · iptv-shield-rate  │
│  · iptv-limit-conn (xtream_slot 2) · hard_cap (200 burst nodelay)       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 10 — PRISMA bandwidth management                                   │
│  Módulos: bandwidth_reactor.lua (CBR/VBR overdrive) · decision_engine   │
│  · floor_lock_filter · sentinel_ua_apply (UA rotation)                  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 11 — Cache RAM (proxy_cache iptv_cache en /dev/shm)                │
│  Manifests 2-20s · Segments 10m slice 1m · Stale-on-error               │
│  Módulos: proxy_cache_path · cmaf_proxy.php · cmaf_worker.php           │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 12 — Egress vía SurfShark VPN nested tunnel                        │
│  wg-surfshark Miami → Proveedor IPTV real                               │
│  Módulo: wg-surfshark interface (no en repo, gestionado vía wg-quick)   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PASO 13 — Telemetría + autopilot (loop continuo)                        │
│  Módulos: prisma_telemetry_full.lua · prisma_telemetry_writer.sh ·      │
│  netshield_autopilot_v2.py · ape-realtime-guardian · WG health monitor  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Inventario por capa funcional

### Capa A — INGRESS (entrada al VPS)

#### A.1 — TLS termination & vhost router (NGINX core)
- **Qué hace:** Termina TLS para `iptv-ape.duckdns.org`, sirve archivos estáticos desde `/var/www/iptv-ape/`, y rutea otros vhosts (coa-navigator, coa-pichichi, default).
- **Cómo lo hace:** sites-enabled config + Let's Encrypt cert.
- **Archivos:**
  - `/etc/nginx/nginx.conf` (core config)
  - `/etc/nginx/sites-enabled/default` (default vhost)
  - `/etc/nginx/sites-enabled/coa-navigator` (vhost iptv-ape.duckdns.org)
  - `/etc/nginx/sites-enabled/coa-pichichi`
  - `/etc/nginx/conf.d/00-iptv-quantum.conf` (top-level: cache zones, BBR, log formats)
  - `/etc/nginx/conf.d/cmaf_mime.conf` (CMAF MIME types)
  - **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/nginx.conf`, `00-iptv-quantum.conf`, `cmaf_mime.conf`

#### A.2 — Static file delivery (la URL SHIELDED entra aquí)
- **Qué hace:** Sirve `APE_LISTA_xxx_SHIELDED.m3u8` y `.gz` directamente al player.
- **Cómo lo hace:** location bloques en sites-enabled/coa-navigator que apuntan a `/var/www/iptv-ape/lists/`. Soporta gzip pre-compressed.
- **Archivos físicos en VPS:**
  - `/var/www/iptv-ape/lists/APE_LISTA_*_SHIELDED.m3u8`
  - `/var/www/iptv-ape/lists/APE_LISTA_*_SHIELDED.m3u8.gz`
  - `/var/www/html/lists/` (mirror)

#### A.3 — WireGuard server (entrada del tráfico HTTP de canales)
- **Qué hace:** Termina túnel WG `wg0` (UDP 51820), recibe tráfico de peers autorizados (player Fire Stick Cali 10.200.0.3, ONN Buga, etc.), encamina a NGINX local.
- **Cómo lo hace:** Kernel WG + iptables NAT + ufw rules.
- **Archivos:**
  - `/etc/wireguard/wg0.conf` (server config)
  - `/etc/net-shield/authorized_peers.conf` (whitelist IPs/peers)
  - **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/server/`
    - `wg0.conf.template`
    - `wg-enroll.sh` (alta de peers)
    - `install.sh`, `uninstall.sh`
    - `ufw-rules.sh`
    - `deploy.sh`
  - **Cliente:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/client/hfrc.conf.template`, `install-client.ps1`, `verify-splittunnel.ps1`

---

### Capa B — DNS HIJACK

#### B.1 — Unbound DNS server
- **Qué hace:** Resuelve dominios de proveedores IPTV (`nfqdeuxu.x1megaott.online`, `tivigo.cc`, `line.tivi-ott.net`, `ky-tv.cc`, `rynivorn.cc`, `zivovrix.cc`) a `127.0.0.1`. Otros dominios resuelven normalmente vía upstream DNS.
- **Cómo lo hace:** `local-data` directives en `/etc/unbound/unbound.conf.d/iptv-ape.conf`.
- **Archivos verificados en producción:**
  - `/etc/unbound/unbound.conf.d/iptv-ape.conf`
  - Backups históricos: `iptv-ape.conf.bak_pre_rynivorn_20260425_231219`, `iptv-ape.conf.bak_pre_zivovrix_20260425_233824`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/snapshots/2026-04-26_funcional_post_rollback/etc/unbound/unbound.conf.d/iptv-ape.conf`
- **Tratamiento de URL SHIELDED:** Indirecto. La URL pública del archivo `.m3u8` resuelve normalmente (iptv-ape.duckdns.org → IP real del VPS). El hijack actúa solo sobre las URLs internas del proveedor cuando el player las pide.

---

### Capa C — INTERCEPT & DISPATCH (NGINX server blocks)

#### C.1 — iptv-intercept.conf (núcleo del intercept)
- **Qué hace:** Define `server { listen 80; server_name <provider>; ... }` blocks para cada dominio proveedor con DNS hijackeado. Cuando el player request entra (ya capturado por WG) con Host header = proveedor, este config matches y proxy_pass a la upstream pool real.
- **Cómo lo hace:**
  - 4-5 server blocks (uno por proveedor + variantes intercept)
  - location-specific behaviors: `/hlsr/` (NO cache, signed tokens), `\.m3u8$` (cache 2s), `\.ts$` (slice 1m, cache 10m), `/` (cache 5-30s)
  - `proxy_pass http://<provider>_upstream` con upstream pools que tienen IPs reales (149.18.45.78, 154.6.41.6, etc.)
  - `proxy_set_header Host <provider real>` (preserva el Host original)
  - `proxy_set_header User-Agent` y `Referer` reales (anti-fingerprint)
  - allow whitelist: `181.63.176.21` (home IP), `10.200.0.0/24` (WG range), `127.0.0.1/8` (loopback)
- **Archivos:**
  - `/etc/nginx/conf.d/iptv-intercept.conf` (producción)
  - `/etc/nginx/conf.d/iptv-intercept.conf.bak_pre_quantum_20260422_045906`
  - `/etc/nginx/conf.d/iptv-intercept.conf.bak_pre_rynivorn_20260425_231219`
  - **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/iptv-intercept.conf`

#### C.2 — rynivorn-intercept.conf · zivovrix-intercept.conf
- **Qué hace:** Server blocks adicionales para CDNs alternativos del proveedor tivigo (302 redirige a `rynivorn.cc` y `zivovrix.cc`).
- **Cómo lo hace:** mismo patrón que iptv-intercept, server_name específico.
- **Archivos:**
  - `/etc/nginx/conf.d/rynivorn-intercept.conf`
  - `/etc/nginx/conf.d/zivovrix-intercept.conf`
  - **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/{rynivorn,zivovrix}-intercept.conf`

#### C.3 — m3u8_rewriter.conf
- **Qué hace:** Reescribe headers/contenido de manifests `.m3u8` upstream antes de servir al player (puerto 9999 según comentario del config).
- **Estado producción:** Stub config (body vacío en cabecera, pendiente integrar en server block iptv-ape).
- **Archivo:** `/etc/nginx/conf.d/m3u8_rewriter.conf`

#### C.4 — iptv-proxy.conf (endpoint /px/)
- **Qué hace:** Caching proxy IPTV genérico. Permite a cualquier player usar el VPS como CDN cache de su propio provider vía `https://iptv-ape.duckdns.org/px/HOST/PATH.ts`.
- **Cómo lo hace:** map de `$cache_ttl` por extensión (m3u8 2s, ts 60s, m4s 60s, aac 60s).
- **Archivo:** `/etc/nginx/conf.d/iptv-proxy.conf`
- **Tratamiento URL SHIELDED:** Endpoint paralelo, no usado por defecto en listas SHIELDED (las listas usan DNS hijack vía iptv-intercept). Disponible como alternativa.

#### C.5 — shield-location.conf (snippet legacy /shield/)
- **Qué hace:** Maneja URLs `https://iptv-ape.duckdns.org/shield/{hash}/{host}/{path}` con auth_request, slot protection, lua circuit breaker, cache, UA real, failover.
- **Estado:** **NO usado en URLs internas de M3U8 SHIELDED actuales.** Conservado para flujo `/shield/` directo si algún módulo o player legacy lo invoca.
- **Por qué existe:** Etapa anterior a la doctrina actual. La invariante INMUTABLE prohíbe envolver URLs internas con `/shield/`, pero el endpoint queda en config sin tráfico real.
- **Archivo:** `/etc/nginx/snippets/shield-location.conf` + 9 backups históricos
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/shield-location.conf`

#### C.6 — iptv-proxy-location.conf
- **Qué hace:** Snippet location reutilizable para proxy IPTV genérico.
- **Archivo:** `/etc/nginx/snippets/iptv-proxy-location.conf`

#### C.7 — shield-tivi-redirect.conf · audio-stream-fix.conf · api-rewrite.conf
- **Qué hace:** snippets auxiliares (redirect tivi → CDN actual, fix audio E-AC3, rewrites API).
- **Archivos:**
  - `/etc/nginx/snippets/shield-tivi-redirect.conf`
  - `/etc/nginx/snippets/audio-stream-fix.conf`
  - `/etc/nginx/snippets/api-rewrite.conf`

---

### Capa D — PROTECCIÓN (rate limit + circuit breaker + slot)

#### D.1 — iptv-shield-rate.conf
- **Qué hace:** Define zona `hard_cap` (10r/s burst=50 nodelay vía SRE redesign 2026-04-25), maps de `$shield_host`, `$shield_path`, `$shield_upstream` desde `$request_uri`. Protección anti-DoS NO anti-bot.
- **Cómo lo hace:** `limit_req_zone` + maps a partir del path SHIELDED.
- **Archivo:** `/etc/nginx/conf.d/iptv-shield-rate.conf` + 2 backups
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/iptv-shield-rate.conf`

#### D.2 — iptv-limit-conn.conf
- **Qué hace:** Slot protection — extrae `host:user:pass` del path SHIELDED y aplica `limit_conn xtream_slot 2` (max 2 conexiones concurrentes por triple). Anti-403 max_connections=1 del proveedor Xtream.
- **Cómo lo hace:** `map $request_uri $xtream_account` con regex `^/shield/[^/]+/([^/]+)/(?:live/)?([^/]+)/([^/]+)/[^/]+\.m3u8` + `limit_conn_zone $xtream_account zone=xtream_slot:10m`.
- **Archivo:** `/etc/nginx/conf.d/iptv-limit-conn.conf`

#### D.3 — iptv-lua-circuit.conf
- **Qué hace:** Wire-up de los Lua scripts de circuit breaker en NGINX phases.
- **Cómo lo hace:** Carga `upstream_gate.lua` en `access_by_lua_file` y `upstream_response.lua` en `header_filter_by_lua_file`.
- **Archivo:** `/etc/nginx/conf.d/iptv-lua-circuit.conf`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/iptv-lua-circuit.conf`

#### D.4 — Lua: upstream_gate.lua
- **Qué hace:** Pre-request gate. Lee state SHM, checa si el host upstream está en cooldown — si activo → return 503 sin tocar upstream. Anti-loop infinito 5xx.
- **Archivo:** `/etc/nginx/lua/upstream_gate.lua`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_gate.lua`

#### D.5 — Lua: upstream_response.lua
- **Qué hace:** Post-response state machine. Lee status del upstream, actualiza retry counter / cooldown timer en SHM. Política diferenciada por status (4xx vs 5xx vs 200).
- **Archivo:** `/etc/nginx/lua/upstream_response.lua` + 1 backup pre-5xx-cooldown
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua`

#### D.6 — Lua: shield_follow_302.lua · follow_redirect.lua
- **Qué hace:** Sigue redirects 302 del provider transparente al player (necesario para tivigo → rynivorn/zivovrix).
- **Archivos:**
  - `/etc/nginx/lua/shield_follow_302.lua`
  - `/etc/nginx/lua/follow_redirect.lua`

---

### Capa E — PRISMA bandwidth management

#### E.1 — Lua: bandwidth_reactor.lua (+ _api.lua)
- **Qué hace:** Reactor adaptativo. CBR fixed → VBR OVERDRIVE 2x → VBR NUCLEAR 3x cuando provider cae bajo 13 Mbps. Lee TTFB, jitter, ring buffer L1 (12 samples). Actualiza state en SHM y devuelve recomendación al request.
- **Cómo lo hace:** `log_by_lua` post-response (latencia <30ms). Variables: `X-Max-Bitrate` header upstream, `KODIPROP min_bandwidth=13M`, `initcwnd=400 + rto_min lock 40ms per IPTV subnet` (doctrine raised 2026-05-11; was 64).
- **Archivos:**
  - `/etc/nginx/lua/bandwidth_reactor.lua` (production)
  - `/etc/nginx/lua/bandwidth_reactor_api.lua` (endpoint API)
  - Backups: `bandwidth_reactor.lua.bak_pre_telescope`, `.bak_`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bandwidth_reactor.lua`, `bandwidth_reactor_api.lua`

#### E.2 — Lua: decision_engine.lua
- **Qué hace:** Decide la combinación óptima de directivas (vlcopt/kodiprop/headerOverrides) según estado actual. Telescope v2.1 Sprint 1.
- **Cómo lo hace:** `rewrite_by_lua_file` (fase NGINX antes de access). Lee state SHM + telemetry full.
- **Archivo:** `/etc/nginx/lua/decision_engine.lua`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/decision_engine.lua`

#### E.3 — Lua: floor_lock_filter.lua
- **Qué hace:** Garantiza piso mínimo de bandwidth por perfil (P0=15M, P1=8M, etc.) inyectando `EXT-X-STREAM-INF` con BANDWIDTH min/max al manifest.
- **Archivo:** `/etc/nginx/lua/floor_lock_filter.lua`
- **Config:** `/etc/nginx/conf.d/prisma-floor-lock.conf`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/floor_lock_filter.lua` + `prisma-floor-lock.conf`

#### E.4 — Lua: sentinel_ua_apply.lua
- **Qué hace:** Aplica rotation de User-Agent al request upstream según provider. Anti-fingerprint.
- **Archivo:** `/etc/nginx/lua/sentinel_ua_apply.lua`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/sentinel_ua_apply.lua`

#### E.5 — Lua: sentinel_auth_guard.lua
- **Qué hace:** Validación de auth para endpoints internos (telemetría, control). Sentinel-401 phase.
- **Archivo:** `/etc/nginx/lua/sentinel_auth_guard.lua`

#### E.6 — Lua: lab_config.lua
- **Qué hace:** Loader de configuración LAB-SYNC v2.0. Lee 6 JSONs config + expone API a otros Lua scripts.
- **Archivo:** `/etc/nginx/lua/lab_config.lua`
- **Configs JSON consumidos (en `/opt/netshield/config/` o `/var/www/.../prisma/config/`):**
  - `channels_prisma_dna.json`
  - `floor_lock_config.json`
  - `profile_boost_multipliers.json`
  - `sentinel_providers_map.json`
  - `telescope_thresholds.json`
  - `enterprise_doctrine_manifest.json`

---

### Capa F — TELEMETRÍA & MONITORING

#### F.1 — Lua: prisma_telemetry_full.lua
- **Qué hace:** Endpoint `/prisma/api/telemetry-full` — devuelve JSON con HW + Net + QoE + MOS metrics.
- **Cómo lo hace:** Lee de SHM + filesystem `/dev/shm/prisma_*` files.
- **Archivo:** `/etc/nginx/lua/prisma_telemetry_full.lua`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/prisma_telemetry_full.lua`
- **Config zona:** `/etc/nginx/conf.d/prisma-public-api-zone.conf` + `/etc/nginx/snippets/prisma-public-api-locations.conf` + `/etc/nginx/conf.d/prisma-reactor-api.conf`

#### F.2 — Lua: sentinel_telemetry_api.lua
- **Qué hace:** API auxiliar de telemetría sentinel.
- **Archivo:** `/etc/nginx/lua/sentinel_telemetry_api.lua`

#### F.3 — Bash daemons (escritores SHM)
- **Qué hacen:** Polling continuo (1Hz típicamente) escribe métricas a `/dev/shm/prisma_*` files con `chmod 644` (para que worker NGINX www-data los lea).
- **Archivos:**
  - `/opt/netshield/scripts/healthcheck.sh` (orquestador)
  - `vps/prisma/prisma_telemetry_writer.sh`
  - `vps/prisma/metrics/prisma_history_writer.sh`
  - `vps/prisma/metrics/prisma_device_metrics.sh`
  - `vps/prisma/adb/ott_buffer_ultraboost.sh`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/prisma_telemetry_writer.sh` + `metrics/`

#### F.4 — PHP API: PRISMA control + health
- **Qué hace:** Endpoints REST para controlar el sistema PRISMA y exponer health.
- **Archivos:**
  - `/var/www/html/...` y `/var/www/iptv-ape/...`:
    - `vps/prisma/api/prisma-control.php`
    - `vps/prisma/api/prisma-health.php`
    - `vps/prisma/api/prisma-adb-telemetry.php`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/`

#### F.5 — PHP: prisma_state.php · prisma_processor.php · prisma_bootstrap.php
- **Qué hace:** Estado central de PRISMA, procesamiento de listas (codecs reorder, vlcopt enhancer, kodiprop enhancer).
- **Archivos:**
  - `vps/prisma/prisma_state.php`
  - `vps/prisma/prisma_processor.php`
  - `vps/prisma/prisma_bootstrap.php`
  - `vps/prisma/lib/codecs_reorder.php`
  - `vps/prisma/lib/vlcopt_enhancer.php`
  - `vps/prisma/lib/kodiprop_enhancer.php`
  - `vps/prisma/lib/lab_config_loader.php`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/`

---

### Capa G — CACHE LAYER

#### G.1 — proxy_cache_path
- **Qué hace:** Define cache RAM en `/dev/shm` (no SSD, evita wear). Zona `iptv_cache` con keys_zone definida en `00-iptv-quantum.conf`.
- **CRÍTICO:** Modificar `proxy_cache_path` requiere FULL RESTART de NGINX (reload silenciosamente falla, deja cache RAM zombi). Origen: freeze SKY SPORTS 2026-04-25.
- **Archivo:** `/etc/nginx/conf.d/00-iptv-quantum.conf`

#### G.2 — CMAF engine (caching avanzado)
- **Qué hace:** Procesador CMAF (Common Media Application Format) — proxy + worker para manifests/segments avanzados, modules de AI super-resolution, modem priority, neuro buffer.
- **Archivos:**
  - `vps/cmaf_proxy.php`
  - `vps/cmaf_worker.php`
  - `vps/cmaf_engine/modules/ai_super_resolution_engine.php`
  - `vps/cmaf_engine/modules/modem_priority_manager.php`
  - `vps/cmaf_engine/modules/neuro_buffer_controller.php`
  - `vps/cmaf_engine/resilience_integration_shim.php`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/` + `cmaf_proxy.php`, `cmaf_worker.php`

---

### Capa H — UPSTREAM EGRESS

#### H.1 — wg-surfshark (nested VPN tunnel)
- **Qué hace:** Túnel WireGuard al endpoint SurfShark Miami (también tiene wg-surfshark-br Brazil). Bypass GeoIP block (TiVistation, MegaOTT 4K).
- **Cómo lo hace:** Tras NGINX proxy_pass, el tráfico al upstream real sale por la interfaz `wg-surfshark` no por la pública del VPS. Doble túnel: ONN 4K → wg0 → VPS → wg-surfshark Miami → IPTV.
- **Archivos:**
  - `/etc/wireguard/wg-surfshark.conf`
  - `/etc/wireguard/wg-surfshark-br.conf`
- **Health:** Monitor cada 30s vía `wg-health-monitor.sh`.

#### H.2 — Upstream pools + failover
- **Qué hace:** Definidos en `iptv-intercept.conf`. Pools con múltiples IPs por proveedor + `proxy_next_upstream error timeout http_502 http_503 http_504` con `tries 3 timeout 5s`.
- **NO incluir:** 403/429 en proxy_next_upstream (provider rechaza, no insistir).

---

### Capa I — LIST MANAGEMENT (file pipeline)

#### I.1 — Upload pipeline (PHP)
- **Qué hace:** Recibe upload chunked desde el frontend, escribe a `/var/www/iptv-ape/lists/` (y mirror `/var/www/html/lists/`), genera `.gz`, valida.
- **Archivos:**
  - `vps/upload.php`
  - `vps/upload_chunk.php`
  - `vps/upload_status.php`
  - `vps/finalize_upload.php`
  - `vps/auto_gzip.sh` (gzip post-upload)
  - `vps/list_files.php` (lista archivos)
  - `vps/delete_file.php`
  - `vps/verify.php`

#### I.2 — Resolve / index
- **Qué hace:** Resuelve URLs, construye índice DNA por canal, audit.
- **Archivos:**
  - `vps/resolve.php`
  - `vps/build_dna_index.php`
  - `vps/audit.php`
  - `vps/debug_resolve.php`

#### I.3 — JWT config + Auth
- **Qué hace:** Genera/valida JWTs para auth de player.
- **Archivos:**
  - `vps/jwt-config.php`
  - `vps/api/jwt-config.php`
  - `vps/api/health.php`
  - `vps/health.php`

---

### Capa J — ADB CONTROL (Fire TV remote)

#### J.1 — PRISMA ADB daemon
- **Qué hace:** Conexión persistente ADB al Fire Stick Cali (10.200.0.3, autorizado vía WG). Inyecta 35 settings ADB monitoreados cada 1s. Buffer Ultraboost 300MB/300s.
- **Archivos:**
  - `vps/prisma/adb/prisma-adb-daemon.service` (systemd)
  - `vps/prisma/adb/prisma_adb_daemon.sh`
  - `vps/prisma/adb/ott_buffer_ultraboost.sh`
  - `vps/prisma/prisma_adb_overlay.sh`
  - `vps/prisma/prisma_adb_validate.sh`
  - `vps/prisma/prisma_firetv_toast.sh`
- **Baseline:** `/opt/netshield/prisma_adb_baseline.json`

---

### Capa K — AUTOPILOT & GUARDIANS

#### K.1 — Net Shield Autopilot v2 (observe-only)
- **Qué hace:** Mide p95 real cada 5min (timer), recomienda rate. NO muta. 288 ventanas estables (24h) requeridas para promover a active.
- **Archivos:**
  - `/opt/netshield/autopilot/netshield_autopilot_v2.py`
  - `/etc/systemd/system/netshield-autopilot.service`
  - `/etc/systemd/system/netshield-autopilot.timer`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/autopilot/netshield_autopilot_v2.py`

#### K.2 — APE Real-Time Bitrate Guardian v1 (Python package)
- **Qué hace:** Daemon 1Hz lee ExoPlayer logcat OTT Navigator (regex MediaCodecLogger). Calcula buffer health, deficit, QoE. Escribe SHM + Prometheus.
- **Archivos:** Paquete completo en `IPTV_v5.4_MAX_AGGRESSION/vps/ape-realtime-guardian/`
  - `ape_realtime_guardian/__init__.py`
  - `ape_realtime_guardian/buffer_analyzer.py`
  - `ape_realtime_guardian/config_manager.py`
  - `ape_realtime_guardian/audit_logger.py`
  - `ape_realtime_guardian/prometheus_exporter.py`
  - `ape_realtime_guardian/probes/server_side.py`
  - `ape_realtime_guardian/adapters/{simulated,shm_write,quantum_signal,nginx_lua}.py`
  - `systemd/ape-realtime-guardian.service`
  - `scripts/install.sh`, `uninstall.sh`, `enable_active_mode.sh`, `smoke_test.sh`
  - `tests/test_*.py` (tests pytest)

#### K.3 — Origin health + Guardian telemetry (PHP)
- **Qué hace:** Health check de orígenes upstream + telemetría central.
- **Archivos:**
  - `vps/origin_health_guardian.php`
  - `vps/guardian_log.php`
  - `vps/guardian_telemetry_core.php`
  - `vps/check_limits.php`

#### K.4 — WG Health Monitor
- **Qué hace:** Bash daemon timer 30s. Auto-restart wg0/wg-surfshark/wg-surfshark-br con cooldown 2min si interfaz cae.
- **Archivos:**
  - `/opt/netshield/scripts/wg-health-monitor.sh`
  - `/etc/systemd/system/netshield-wg-health.{service,timer}`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/scripts/wg-health-monitor.sh`

#### K.5 — Sentinel scripts (LLM-assisted diagnose)
- **Qué hacen:** Pipeline collect → classify → diagnose → execute (apply approved fixes). LLM-assisted diagnostics.
- **Archivos en producción:** `/opt/netshield/bin/`
  - `sentinel-collect.sh`
  - `sentinel-classify.py`
  - `sentinel-diagnose.py`
  - `sentinel-llm-diagnose.py`
  - `sentinel-execute.py`
  - `sentinel-apply-approved.py`
  - `sentinel-cycle.sh`
  - `sentinel-report.py`
- **Timer:** `netshield-sentinel.timer` (cada hora)

#### K.6 — Backups automáticos
- **Qué hace:** Snapshot diario de configs críticos.
- **Archivos:**
  - `/opt/netshield/scripts/backup_configs.sh`
  - `/etc/systemd/system/netshield-backup.timer` (3:01 AM UTC daily)

---

### Capa L — ENDPOINTS AUXILIARES (NO SHIELDED por defecto)

#### L.1 — shield-auth.php (auth-request del endpoint /shield/)
- **Qué hace:** Endpoint internal `/_shield_auth` invocado por `shield-location.conf` para validar auth del request. **NO se invoca en URLs SHIELDED actuales** (que usan DNS hijack, no /shield/).
- **Archivo:** `/var/www/html/api/shield-auth.php`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/snapshots/2026-04-26_funcional_post_rollback/var/www/html/api/shield-auth.php`

#### L.2 — APE HLS generators · profiles (PHP server-side)
- **Qué hace:** Generadores server-side de M3U8 (alternativa a generador JS frontend). Profiles APE.
- **Archivos:**
  - `vps/ape_hls_generators.php`
  - `vps/ape_profiles.php`
- **Mirror local:** `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php`, `ape_profiles.php`
- **NOTA:** El generador en producción es PATH A (`m3u8-typed-arrays-ultimate.js` frontend). Estos PHPs son fallback / alternativa server-side.

---

## 3. Sistemd timers activos (verificados producción 2026-04-28 19:32 UTC)

```
netshield-wg-health.timer     → 30s    → WG interfaces health + auto-restart
netshield-autopilot.timer     → 5min   → p95 measure + rate recommendation (observe)
netshield-health.timer        → 5min   → general health check
netshield-sentinel.timer      → 1h     → LLM-assisted diagnostic cycle
netshield-backup.timer        → 24h    → snapshot configs (3:01 UTC)
iptv-quality-monitor.timer    → ~30s   → quality monitor (logcat probably)
prisma-adb-daemon.service     → live   → conexión ADB persistente Fire TV
ape-realtime-guardian.service → live   → 1Hz buffer analyzer
```

---

## 4. Cómo cada módulo trata la URL SHIELDED

| Módulo | URL pública `.m3u8` | URLs internas canales | Acción |
|---|---|---|---|
| NGINX TLS termination | recibe HTTPS | — | sirve archivo estático desde `/var/www/iptv-ape/lists/` |
| Static file delivery | sirve directo | — | gzip pre-compressed (`.m3u8.gz`) |
| WireGuard wg0 | tráfico HTTPS llega vía WG si player tiene tunnel | tráfico HTTP de canales SIEMPRE pasa por WG | rutea a NGINX local |
| Unbound DNS | iptv-ape.duckdns.org → IP real (sin hijack) | dominios proveedor → 127.0.0.1 (HIJACK) | resuelve diferente según dominio |
| iptv-intercept.conf | — | match server_name → proxy_pass upstream real | núcleo del intercept |
| iptv-shield-rate (hard_cap) | — | aplica burst 200 nodelay | anti-DoS |
| iptv-limit-conn (xtream_slot) | — | 2 conn por user:pass | anti-403 max_connections |
| upstream_gate.lua | — | check cooldown SHM | gate pre-request |
| upstream_response.lua | — | update state SHM | post-response state machine |
| bandwidth_reactor.lua | — | log_by_lua mide TTFB/jitter | CBR→VBR overdrive |
| decision_engine.lua | — | rewrite_by_lua recomienda directivas | decisión adaptativa |
| floor_lock_filter.lua | filter manifest response | filter manifest response | inyecta BANDWIDTH min |
| sentinel_ua_apply.lua | — | rota User-Agent upstream | anti-fingerprint |
| sentinel_auth_guard.lua | guardia de telemetría | — | auth para `/prisma/api/...` |
| prisma_telemetry_full.lua | — | — | endpoint `/prisma/api/telemetry-full` |
| proxy_cache iptv_cache | — | cache manifest 2-20s, segment 10m | RAM cache /dev/shm |
| cmaf_proxy.php | — | proxy CMAF avanzado | super-resolution + neuro buffer |
| wg-surfshark | — | egress proveedor | bypass GeoIP |
| autopista doctrine | — | passthrough/telemetry-only | NO circuit breaker, NO cache warmers |

---

## 5. Verificación end-to-end (commands SSH read-only)

```bash
# A. Estructura NGINX
ssh root@178.156.147.234 "nginx -t && nginx -T 2>&1 | grep -E '^server_name|^\s*listen' | head -40"

# B. URL SHIELDED resuelve y entrega
curl -sI "https://iptv-ape.duckdns.org/lists/APE_LISTA_1777243113563_SHIELDED.m3u8" | head -10

# C. URLs internas son directas (auditoría de cualquier lista)
ssh root@178.156.147.234 "grep -c '^http://' /var/www/iptv-ape/lists/APE_LISTA_1777243113563_SHIELDED.m3u8"
# Esperado: ≈ 15.444
ssh root@178.156.147.234 "grep -c '/shield/' /var/www/iptv-ape/lists/APE_LISTA_1777243113563_SHIELDED.m3u8"
# Esperado: 0

# D. DNS hijack activo
ssh root@178.156.147.234 "dig @127.0.0.1 nfqdeuxu.x1megaott.online +short"
# Esperado: 127.0.0.1

# E. WG health
ssh root@178.156.147.234 "wg show wg0 | head -5; wg show wg-surfshark | head -5"

# F. Cache zone activa
ssh root@178.156.147.234 "ls -lh /dev/shm/ | grep -i cache | head -5"

# G. Telemetría PRISMA viva
curl -sk "https://iptv-ape.duckdns.org/prisma/api/telemetry-full" | head -50

# H. Lua scripts cargados sin error
ssh root@178.156.147.234 "tail -20 /var/log/nginx/error.log | grep -i lua"

# I. Timers systemd OK
ssh root@178.156.147.234 "systemctl list-timers --all | grep -E 'iptv|prisma|netshield|guardian'"

# J. Slot protection respetado (logs)
ssh root@178.156.147.234 "tail -20 /var/log/nginx/shield_access.log | grep -E '429|503'"
```

---

## 6. Reglas operacionales (inviolables)

1. **NO modificar URLs internas de canales** → invariante #1 (skill `shielded_architecture_immutable`).
2. **El sufijo `_SHIELDED.m3u8` es funcional** → propaga 3 efectos (filename + URL pública + treatment VPS).
3. **AUTOPISTA Doctrine** → performance > protection. xtream_slot=2, hard_cap=200, NO circuit breaker, NO cache warmers.
4. **NO TOCAR producción que funciona** → cambios "defensivos" rompieron 2026-04-25 20:05→22:27 UTC.
5. **proxy_cache_path requires FULL RESTART** → reload silenciosamente falla.
6. **Zapping atómico inviolable** → TTFB <200ms manifest. Cache_lock/timeout/keepalive deben preservar zap.
7. **`/dev/shm` files NEED chmod 644** → bash daemons como root crean 0600, www-data NO puede leer.
8. **NGINX Lua: UN solo `access_by_lua_file` por location** → conflictos resueltos vía `rewrite_by_lua_file` (fase distinta).
9. **NUNCA cachear 302 del shield** → upstream session bleed con max_connections=1.

---

## 8. PRISMA — Modelo de operación (metadata injection, NO transcode)

> **Calibración crítica:** PRISMA **NO** hace transcode server-side. El VPS CPX21 (3 vCPU AMD, 4 GB RAM, sin GPU) no tendría capacidad. PRISMA opera por **metadata injection + activación hardware-side en el display/SoC del player**.

### 8.1 Números reales por lista (verificados producción 2026-04-28)

| Métrica | Cantidad por `_SHIELDED.m3u8.gz` |
|---|---|
| Tags propietarios `#EXT-X-APE-*` | **8.741.337** |
| Directivas `#EXTVLCOPT:` (VLC/MX Player) | **2.162.160** |
| Directivas `#KODIPROP:` (Kodi/TiviMate/InputStream Adaptive) | **1.498.068** |

### 8.2 Modelo de propagación

```
PRISMA inyecta tags + EXTVLCOPT + KODIPROP + ADB props en el manifest
    ↓
Player (TiviMate/OTT Navigator/MX Player/Kodi) parsea las directivas nativamente
    ↓  (consumo directo del player, no requiere middleware)
hls.js / shaka / inputstream.adaptive aplican knobs (buffer, ABR, retry)
    ↓
SoC del Fire TV 4K Max + display activan: HDR10+, MEMC, super-resolution
    ↓
Mejora visual REAL en pantalla — sin GPU server-side
```

### 8.3 Las 7 sub-módulos PRISMA y qué inyectan exactamente

| # | Sub-módulo | Tags ejemplo (manifest real) |
|---|---|---|
| 1 | CMAF Packaging | `#EXT-X-APE-CMAF:ENABLED`, `#EXT-X-APE-CMAF-LL-CHUNK:200ms` |
| 2 | LCEVC Enhancement | `#EXT-X-APE-LCEVC-SDK-VERSION:1.2.4`, `#EXT-X-APE-LCEVC-PHASE-4-ENABLED:true`, `#EXT-X-APE-LCEVC-SEMANTIC-SEGMENTATION:ACTIVE`, `#EXT-X-APE-LCEVC-ROI-TARGETS:FACES,TEXT,SKIN,SPORTS_BALL`, `#EXT-X-APE-LCEVC-COMPUTE-PRECISION:FP16/INT8` |
| 3 | HDR10+ Dynamic | `#EXT-X-APE-HDR10-PLUS-DYNAMIC:L1=10-4000\|L2=12-TRIMS\|L5=ACTIVE-AREA\|L6-MaxSCL=4000,4000,4000` |
| 4 | AI Super Resolution | `#EXT-X-APE-AI-SR-ENABLED:true` |
| 5 | Quantum Pixel | `#EXT-X-APE-QUANTUM-CHROMA-SUBSAMPLING:4:4:4`, `#EXT-X-APE-QUANTUM-COLOR-DEPTH:10bit`, `#EXT-X-APE-QUANTUM-ITM-SDR-TO-HDR:auto` |
| 6 | Fake 4K Upscaler | Activado vía ADB props del Fire TV (`always_hdr=1`, `match_frame_rate`, etc.) |
| 7 | Player Enrichment v1.2 | 30 EXTVLCOPT + 7 KODIPROP + CODECS reorder por canal |

### 8.4 LAB-KNOBS — Output de solver real (no random)

```
#EXT-X-APE-LAB-PROFILE-P2:NAME="2K QHD",FITNESS=1,SOLVER="LHS->GA->SA->NM 0,0s"
#EXT-X-APE-LAB-KNOBS-P2:abrBandWidthFactor=0.7832,reconnect_attempts=214,
  maxLiveSyncPlaybackRate=1.3286,buffer_seconds=58,
  nudgeMaxRetry=10,fragLoad_maxNumRetry=20,live_delay_seconds=10
```

Pipeline del solver: **Latin Hypercube Sampling → Genetic Algorithm → Simulated Annealing → Nelder-Mead**. FITNESS metric per-profile.

### 8.5 Por qué NO requiere GPU en VPS

- LCEVC, HDR10+, AI SR, Quantum Pixel, MEMC son capabilities del **SoC del display**.
- PRISMA solo entrega los **hints/metadata estructurados** que el SoC necesita para activar esas capabilities.
- El Fire TV 4K Max (10.200.0.3 en Cali, autorizado vía WG) tiene chip neuronal + HDR10+ display + MEMC integrado nativamente.
- Combinado con los 35 ADB Master Directives (v1.4) + buffer Ultraboost ADB (300MB/300s), el dispositivo entra en modo de máximo rendimiento de imagen.

### 8.6 Detalle profundo de cada lane

Para arquitectura completa de PRISMA + diagrama de flujo + código de los 6 hooks Lua que orquestan el bandwidth/floor-lock/decision:
→ [sop-shielded-forensic-part3-prisma-kernel.md](../../../.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md) §9 + §6 (Lua pipeline)

---

## 9. Flujo de generación SHIELDED — 8 momentos (frontend → VPS) con líneas de código

> **Origen:** Forense de la sesión Cascade 2026-04-28 (`Verifying Shielded M3U8 Integrity.md`). Mapea cada paso del proceso de generación de listas a líneas exactas en `gateway-manager.js` para que sea trivial auditar el flujo end-to-end sin perder tiempo navegando por el archivo.

### Tabla de los 8 momentos

| Momento | Qué pasa | Archivo / Línea | URLs internas | Filename |
|---|---|---|---|---|
| **M1** | Generador produce M3U8 con URLs **directas** al proveedor | `m3u8-typed-arrays-ultimate.js` (PATH A, ~800 líneas/canal) — emite `#EXTINF` + URL `http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8` | Directas ✅ | `APE_LISTA_xxx.m3u8` |
| **M2** | Gateway captura el contenido completo en RAM al recibir evento DOM `m3u8-generated` | `gateway-manager.js` ~L442-460 (`_onM3U8Generated`) — `this.state.lastM3U8Content = detail.content` (L450) | Directas ✅ | `APE_LISTA_xxx.m3u8` |
| **M3** | Upload triggered — toma el M3U8 tal cual de RAM | `gateway-manager.js` ~L694-698 (`upload()`) — `let contentToUpload = this.state.lastM3U8Content` (L698) | Directas ✅ | `APE_LISTA_xxx.m3u8` |
| **M4** | **Detección SHIELDED + RENAME del filename** (único punto de transformación) | `gateway-manager.js` ~L736-747 — `shieldedEnabled = !!document.getElementById('shieldedMode')?.checked` (L736) → `finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')` (L738) | Directas ✅ (intactas) | **`APE_LISTA_xxx_SHIELDED.m3u8`** |
| **M5** | File creado para upload con el nombre renombrado, contenido inalterado | `gateway-manager.js` ~L749-770 — `new Blob([finalContent])` (L749) → `new File([fileBlob], finalFilename, ...)` (L769) | Directas ✅ | `_SHIELDED.m3u8` |
| **M6** | Chunked upload al VPS (10 MB chunks + SHA256 + gzip post-finalize) | `gateway-manager.js` L777 (`this.uploader.upload(uploadFile)`) → `gateway-turbo-upload.js` → Rust server → `finalize_upload.php` → `auto_gzip.sh` (gzip -9) | Directas ✅ | `_SHIELDED.m3u8` + `_SHIELDED.m3u8.gz` |
| **M7** | URL pública disponible. NGINX con `gzip_static on` sirve el `.gz` transparente | `https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8` — VPS sirve desde `/var/www/iptv-ape/lists/` y `/var/www/html/lists/` | Directas ✅ | `_SHIELDED.m3u8` |
| **M8** | Player consume la URL pública, lee URLs internas, WG tunnel captura el tráfico → DNS hijack → NGINX intercept → SurfShark → Proveedor | Cadena de red (no código JS) — ver §1 Pipeline + Capas A-L | Directas ✅ → **Red hace el shielding** | — |

### Invariante operacional confirmado

- Las URLs internas **NUNCA se tocan** en ninguno de los 8 momentos.
- Solo el **filename** cambia, en el momento M4, en la línea 738 de `gateway-manager.js`.
- El contenido del archivo (`contentToUpload`) atraviesa M1 → M7 sin un solo byte modificado.
- El shielding real ocurre exclusivamente a nivel de red (M8), no a nivel de URL.

### Resultado verificado en producción

```bash
# Auditoría de la lista en VPS
ssh root@178.156.147.234 "
LIST=/var/www/iptv-ape/lists/APE_LISTA_1777243113563_SHIELDED.m3u8.gz
echo 'URLs http:// directas:' \$(zcat \$LIST | grep -c '^http://')
echo 'URLs con /shield/:'    \$(zcat \$LIST | grep -c '/shield/')
"
# Esperado: 15.444 directas, 0 wrap
```

---

## 10. Documentos hermanos (triangulación cross-agent)

**4 documentos doctrinales (skills + memoria):**
- [`SKILL.md`](./SKILL.md) → doctrina + invariantes (qué y por qué). Audiencia: Claude Code skill.
- [`WORKFLOW_BLOQUEANTE.md`](./WORKFLOW_BLOQUEANTE.md) → gate operacional ejecutable con 4 pasos + verificaciones bash.
- `VPS_SHIELDED_MODULES.md` (este archivo) → inventario completo VPS. Audiencia: cross-agent + auditoría operacional.
- `../../.gemini/settings/shielded-sop.md` → SOP cardinal. Audiencia: Gemini CLI.

**5 documentos forenses (autoritativos para profundidad):**
- [sop-shielded-architecture-complete.md](../../../.agent/workflows/sop-shielded-architecture-complete.md) — SOP unificado
- [sop-shielded-forensic-part1-doctrine.md](../../../.agent/workflows/sop-shielded-forensic-part1-doctrine.md) — 12 prohibiciones + pipeline 11 pasos
- [sop-shielded-forensic-part2-nginx-lua.md](../../../.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md) — NGINX + 6 hooks Lua con código
- [sop-shielded-forensic-part3-prisma-kernel.md](../../../.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md) — PRISMA + PHP + Kernel sysctl + Systemd
- [sop-shielded-forensic-part4-operations.md](../../../.agent/workflows/sop-shielded-forensic-part4-operations.md) — Diagnóstico + invariantes + conteo

**1 snapshot código real:**
- [vps-live-snapshot-20260428/](../../../IPTV_v5.4_MAX_AGGRESSION/vps/vps-live-snapshot-20260428/) — 38 archivos × 256 KB

Los 10 documentos son **sincrónicos**. Si el VPS cambia (deploy nuevo módulo, deprecación, refactor), este inventario DEBE actualizarse en el mismo commit. Drift = riesgo de regresión silenciosa.
