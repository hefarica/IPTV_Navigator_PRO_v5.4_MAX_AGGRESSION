# SOP FORENSE SHIELDED — PARTE 1: DOCTRINA Y ARQUITECTURA

> **Versión:** 2.0 FORENSE — 2026-04-28
> **VPS:** 178.156.147.234 (Hetzner CPX21, 3 vCPU AMD, 4GB RAM, 40GB NVMe)
> **Snapshot local:** `vps/vps-live-snapshot-20260428/` (38 archivos, 256KB código fuente real)
> **Partes:** [1/4] Doctrina — [2/4] NGINX+Lua — [3/4] PRISMA+Kernel — [4/4] Operaciones

---

## 1. QUÉ ES SHIELDED (Definición Absoluta)

SHIELDED tiene **DOS capas** que NUNCA deben confundirse:

| Capa | Qué es | Dónde opera | Código exacto |
|---|---|---|---|
| **Capa 1: Sufijo de archivo** | Renombrar `.m3u8` → `_SHIELDED.m3u8` | Frontend JS | `gateway-manager.js` L738 |
| **Capa 2: Shielding de red** | Player→WireGuard→DNS Hijack→NGINX→SurfShark→Proveedor | VPS (infraestructura) | 38 archivos en 11 módulos |

### 1.1 Código exacto de Capa 1 (el ÚNICO punto JS)

```javascript
// gateway-manager.js, línea ~736-740
const shieldedEnabled = !!document.getElementById('shieldedMode')?.checked;
if (shieldedEnabled) {
    finalFilename = finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8');
}
```

**Esto es TODO** lo que hace el código JS. NO toca URLs internas.

### 1.2 Evidencia empírica (2026-04-28)

```
Lista: APE_LISTA_1777243113563_SHIELDED.m3u8
├── 15,444 URLs internas → TODAS directas (http://proveedor/live/...)
├── 0 URLs con /shield/
├── Hosts: x1megaott (5,781), tivigo (4,951), tivi-ott (4,712)
└── Estado: FUNCIONA PERFECTAMENTE via WireGuard tunnel
```

---

## 2. PIPELINE END-TO-END (11 Pasos con código)

```
[1] Toggle "Salida SHIELDED" ON
    │  JS: document.getElementById('shieldedMode').checked = true
    ▼
[2] gateway-manager.js renombra → _SHIELDED.m3u8
    │  finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')
    ▼
[3] Upload chunked (10MB + SHA256 + gzip)
    │  gateway-turbo-upload.js → upload_chunk.php → finalize_upload.php
    ▼
[4] VPS sirve: https://iptv-ape.duckdns.org/lists/APE_xxx_SHIELDED.m3u8
    │  nginx: gzip_static on → sirve .m3u8.gz transparente
    ▼
[5] Player descarga M3U8
    ▼
[6] Player lee URL interna VERBATIM:
    │  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
    ▼
[7] WireGuard captura (10.200.0.3 → 10.200.0.1, MTU 1380)
    │  wg0.conf: Address=10.200.0.1/24, ListenPort=51820
    │  DSCP EF marcado en mangle PREROUTING+POSTROUTING
    │  tc qdisc: fq pacing en wg0
    ▼
[8] Unbound DNS hijack:
    │  local-data: "nfqdeuxu.x1megaott.online. 60 IN A 178.156.147.234"
    │  (6 dominios hijackeados, ver §3.2)
    ▼
[9] NGINX intercepta en shield-location.conf:
    │  location ~ ^/shield/([a-f0-9]+)/([^/]+)/(.*)$
    │  ├─ auth_request /_shield_auth (PHP token validation)
    │  ├─ rewrite_by_lua: decision_engine.lua (TELESCOPE predictive)
    │  ├─ access_by_lua: upstream_gate.lua (PASSTHROUGH telemetry)
    │  ├─ header_filter: upstream_response.lua (PASSTHROUGH telemetry)
    │  ├─ header_filter: sentinel_auth_guard.lua (UA rotation)
    │  ├─ body_filter: floor_lock_filter.lua (PRISMA variant filter)
    │  ├─ log_by_lua: bandwidth_reactor.lua (EWMA + TELESCOPE L1)
    │  └─ proxy_pass http://$shield_upstream$shield_path$is_args$args
    ▼
[10] SurfShark VPN egress → Proveedor real
    │  wg-surfshark.conf (IP rotation anti-ban)
    │  DSCP 0x2e (Expedited Forwarding)
    ▼
[11] Proveedor → SurfShark → NGINX (BBR + cache stale) → WireGuard → Player
```

---

## 3. MÓDULO POR MÓDULO — INVENTARIO FORENSE

### 3.1 WireGuard (4 configs)

**Archivo principal: `/etc/wireguard/wg0.conf`** (snapshot: `wireguard/wg0.conf.sanitized`, 4.9KB)

```ini
[Interface]
Address    = 10.200.0.1/24
ListenPort = 51820
MTU        = 1380

# DSCP EF en ambas direcciones del tunnel
PostUp = iptables -t mangle -A PREROUTING  -i wg0 -j DSCP --set-dscp-class EF
PostUp = iptables -t mangle -A POSTROUTING -o wg0 -j DSCP --set-dscp-class EF
# MSS clamping para evitar fragmentación
PostUp = iptables -t mangle -A FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
# Fair queueing con pacing
PostUp = tc qdisc replace dev wg0 root fq pacing

[Peer] # ONN 4K (HFRC)
AllowedIPs = 10.200.0.2/32

[Peer] # firestick-cali-hfrc
AllowedIPs = 10.200.0.3/32
```

| Archivo | Función |
|---|---|
| `wg0.conf` | Tunnel Player↔VPS + DSCP EF + MSS clamp + fq pacing |
| `wg-surfshark.conf` | Egress VPS→SurfShark (IP rotation) |
| `wg-surfshark-br.conf` | Egress backup Brasil |
| `onn.conf` | Reserva |

**Monitor:** `netshield-wg-health.timer` cada 30s → `wg-health-monitor.sh` (14.5KB script)
- Auto-restart con cooldown 2min
- Verifica 3 interfaces: wg0 + wg-surfshark + wg-surfshark-br
- Estado persistente: `/opt/netshield/state/wg_health_state.json`

---

### 3.2 DNS Hijack — Unbound

**Archivo: `/etc/unbound/unbound.conf.d/iptv-ape.conf`** (snapshot: `unbound/iptv-ape.conf`, 3.3KB)

```yaml
server:
    interface: 178.156.147.234
    interface: 127.0.0.1
    interface: 10.200.0.1
    port: 53
    access-control: 127.0.0.1/32 allow
    access-control: 10.200.0.0/24 allow
    access-control: 181.63.176.21/32 allow
    access-control: 0.0.0.0/0 refuse

    # Tuning
    cache-min-ttl: 60
    cache-max-ttl: 86400
    prefetch: yes
    msg-cache-size: 50m
    rrset-cache-size: 100m
    serve-expired: yes
    serve-expired-ttl: 3600

    # === DNS HIJACK ===
    local-zone: "nfqdeuxu.x1megaott.online." redirect
    local-data: "nfqdeuxu.x1megaott.online. 60 IN A 178.156.147.234"
    local-zone: "line.tivi-ott.net." redirect
    local-data: "line.tivi-ott.net. 60 IN A 178.156.147.234"
    local-zone: "ky-tv.cc." redirect
    local-data: "ky-tv.cc. 60 IN A 178.156.147.234"
    local-zone: "tivigo.cc." redirect
    local-data: "tivigo.cc. 60 IN A 178.156.147.234"
    local-zone: "rynivorn.cc." redirect
    local-data: "rynivorn.cc. 60 IN A 178.156.147.234"
    local-zone: "zivovrix.cc." redirect
    local-data: "zivovrix.cc. 60 IN A 178.156.147.234"

forward-zone:
    name: "."
    forward-addr: 1.1.1.1
    forward-addr: 1.0.0.1
    forward-addr: 8.8.8.8
    forward-addr: 9.9.9.9
```

**Resultado:** Cualquier request del player a `http://nfqdeuxu.x1megaott.online/...` resuelve a 178.156.147.234 (el VPS) en vez del proveedor real.

---

## 4. PROHIBICIONES ABSOLUTAS (12 reglas con razón técnica)

| # | Prohibición | Razón técnica |
|---|---|---|
| P1 | NUNCA `/shield/{hash}/` en URLs internas | Rompe DNS hijack (URL ya no resuelve a VPS) |
| P2 | NUNCA modificar `generateChannelEntry()` | URLs deben ser directas para que WG las capture |
| P3 | NUNCA modificar `buildChannelUrl()` | Causa double-routing (WG→VPS→VPS) |
| P4 | NUNCA modificar `buildUniversalUrl()` | Rompe resolución DNS local |
| P5 | NUNCA "shield URL wrapper" en JS | Gateway solo renombra archivo |
| P6 | NUNCA "shieldear URLs" como fix de freezes | Freezes = red, no URLs |
| P7 | NUNCA `proxy_cache_valid 302 > 0` | 302 lleva tokens dinámicos que expiran en segundos |
| P8 | NUNCA quitar `http_403` de `proxy_cache_use_stale` CDN | CDN tokens expiran → 403 → stale salva al player |
| P9 | NUNCA `limit_conn xtream_slot 1` | Overlap natural de manifest polls causa 429 |
| P10 | NUNCA circuit breaker que bloquee por host | Un 403 en 1 canal mata TODOS los canales del host |
| P11 | NUNCA `proxy_read_timeout < 30s` | Segmentos 4K pueden tardar |
| P12 | NUNCA `keepalive` en upstreams Xtream | RST en conexiones stale |

---

## 5. ARCHIVOS PROTEGIDOS

```
PROHIBIDO TOCAR PARA SHIELDING:
  frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
  frontend/js/ape-v9/m3u8-typed-arrays-ultimate.pre-admission.js

ÚNICO PUNTO AUTORIZADO:
  frontend/js/gateway-manager.js → SOLO renombra filename (~L738)
```

---

## Siguiente: [Parte 2 — NGINX Core + Lua Pipeline](sop-shielded-forensic-part2-nginx-lua.md)
