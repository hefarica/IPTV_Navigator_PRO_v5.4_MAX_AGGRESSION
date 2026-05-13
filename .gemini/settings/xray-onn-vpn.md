
# SOP: v2rayNG Streaming Supremacy — Configuración Inquebrantable para IPTV

> **REGLA INMUTABLE — 2026-05-13**
> **Aplica a:** ONN 4K Box (Android TV) con v2rayNG como VPN hacia VPS Hetzner

## 1. Arquitectura de Red

```
ONN 4K (Android TV)
    │
    └─→ v2rayNG (VLESS + Reality)
            │
            └─→ VPS Hetzner (178.156.147.234:8443)
                    │  Xray Service (systemd: always, OOM=-900)
                    │
                    ├─→ NGINX NET SHIELD (IPTV proxy)
                    ├─→ SurfShark (wg-surfshark) → Proveedores IPTV
                    └─→ Unbound DNS (hijack CDN)
```

## 2. Protocolo Óptimo

| Protocolo | Robustez | Velocidad | Estado |
|---|---|---|---|
| **VLESS + XTLS-Vision / REALITY** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **✅ ACTIVO — Opción #1** |
| VLESS + TLS + WS (CDN) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Fallback si IP bloqueada |
| Trojan + TLS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Emergencia |

> **NUNCA** usar mKCP o protocolos UDP "ruidosos" — son detectables y bloqueables.

## 3. Configuración Xray Server (VPS)

```json
{
  "inbounds": [{
    "tag": "vless-reality",
    "listen": "0.0.0.0",
    "port": 8443,
    "protocol": "vless",
    "settings": {
      "clients": [{"id": "272dbd24-...", "flow": ""}],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "dest": "www.microsoft.com:443",
        "serverNames": ["www.microsoft.com", "microsoft.com"],
        "shortIds": ["4d8e215548485306"]
      }
    },
    "sniffing": {
      "enabled": true,
      "destOverride": ["http", "tls", "quic"],
      "routeOnly": false
    }
  }],
  "outbounds": [
    {"tag": "direct", "protocol": "freedom", "settings": {"domainStrategy": "UseIP"}},
    {"tag": "block", "protocol": "blackhole"}
  ],
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      {"type": "field", "outboundTag": "block", "protocol": ["bittorrent"]},
      {"type": "field", "outboundTag": "direct", "network": "tcp,udp"}
    ]
  },
  "dns": {
    "servers": [{"address": "127.0.0.1", "port": 53}],
    "queryStrategy": "UseIPv4"
  }
}
```

## 4. Configuración v2rayNG en ONN (Cliente)

### Settings Inmutables

| Setting | Valor | Razón |
|---|---|---|
| Protocolo | VLESS + Reality | Máxima velocidad + indetectable |
| Puerto | 8443 | Parece HTTPS normal |
| SNI | www.microsoft.com | Camuflaje perfecto |
| DNS through proxy | **ON** | Anti-fuga DNS |
| Per-App Proxy | **Bypass mode** | Solo proxy lo necesario (IPTV player) |
| MTU | 1350-1400 | Evita fragmentación TLS |
| Keep-alive | **ON** | Túnel siempre vivo |

### Android System Settings (enforced by Guardian)

| Setting | Valor | Efecto |
|---|---|---|
| `always_on_vpn_app` | `com.v2ray.ang` | Android reinicia v2rayNG si muere |
| `always_on_vpn_lockdown` | `1` | Bloquea TODO tráfico si VPN cae |
| Battery whitelist | `com.v2ray.ang` | Doze no lo mata |
| OOM Score | `-1000` | Kernel no lo mata por RAM |

## 5. Robustez Systemd (VPS)

```ini
# /etc/systemd/system/xray.service.d/99-immortal.conf
[Service]
Restart=always
RestartSec=2s
StartLimitBurst=20
StartLimitAction=none
LimitNOFILE=1048576
LimitNPROC=65535
OOMScoreAdjust=-900
ProtectHome=true
PrivateTmp=true
```

## 6. Diagnóstico Rápido

Si la señal IPTV se cae en el ONN:

```bash
# 1. ¿Xray vivo en VPS?
ssh root@178.156.147.234 "systemctl is-active xray && ss -tlnp | grep 8443"

# 2. Reiniciar Xray si muerto
ssh root@178.156.147.234 "systemctl restart xray"

# 3. ¿v2rayNG corriendo en ONN?
adb -s 192.168.10.28:5555 shell "ps | grep v2ray"

# 4. ¿Always-On activo?
adb -s 192.168.10.28:5555 shell "settings get secure always_on_vpn_app"

# 5. ¿Tráfico llegando al VPS?
ssh root@178.156.147.234 "tail -5 /var/log/xray/access.log"
```

## 7. Prohibiciones

1. **NUNCA** diagnosticar caída de señal ONN como "WireGuard" — es v2rayNG/Xray
2. **NUNCA** buscar `wg0` en el ONN — no existe
3. **NUNCA** usar mKCP o UDP para el tunnel
4. **NUNCA** desactivar `always_on_vpn_lockdown`
5. **NUNCA** quitar v2rayNG del battery whitelist
6. **NUNCA** reducir OOM Score de v2rayNG

## 8. Plan de Contingencia

| Prioridad | Nodo | Uso |
|---|---|---|
| **#1** | VLESS + Reality (8443) | Principal — siempre |
| **#2** | VLESS + WS + TLS + CDN | Si ISP bloquea IP del VPS |
| **#3** | Trojan + TLS | Emergencia máxima |

Mantener **mínimo 3 nodos** de diferentes backends/regiones.

