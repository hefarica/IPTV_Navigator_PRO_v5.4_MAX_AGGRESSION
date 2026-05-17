---
name: "firetv-wireguard-dns-immutable"
description: "Skill inmutable que PROHÍBE tocar DNS, WiFi, Always-On VPN y la arquitectura de red del Fire TV. El único fix válido para WireGuard desconectado es reconectar WireGuard. NADA MÁS."
---

# Fire TV WireGuard/DNS — Immutable Protection Skill

## Cuándo se activa

Esta skill se activa **OBLIGATORIAMENTE** cuando:

1. Se menciona "Fire TV", "Fire Stick", "Firestick", "AFTKA", "tun0"
2. Se menciona "private_dns", "dns.google", "DNS leak", "Private DNS broken"
3. Se propone tocar `settings put global private_dns_mode`
4. Se propone tocar `svc wifi`, `iptables` en el VPS para DNS, `always_on_vpn`
5. Se diagnostican problemas de conectividad del Fire TV
6. Se menciona "microcortes", "freeze", "sin internet" del Fire TV
7. Se propone cambiar la arquitectura SHIELDED (Fire TV → VPS → SurfShark)

---

## HECHOS INMUTABLES

### Hecho 1: `private_dns_mode=hostname` con `dns.google` es el DEFAULT de Fire OS
- NO es un "DNS leak"
- NO es un bug
- NO se debe cambiar
- Es el comportamiento de fábrica de Amazon Fire OS
- Fire OS lo RESTAURA automáticamente después de cualquier `settings put`

### Hecho 2: La arquitectura SHIELDED funciona ASÍ
```
Fire TV → WireGuard (10.200.0.3) → VPS (10.200.0.1) → NGINX → SurfShark Miami → Proveedor
```
- El WG config tiene `DNS = 10.200.0.1` (Unbound del VPS)
- Unbound hace DNS hijack de dominios IPTV → 178.156.147.234
- NGINX intercepta el tráfico HTTP en esos dominios
- SurfShark Miami es el upstream para ocultar la IP del VPS

### Hecho 3: Cuando WireGuard se desconecta
- La ÚNICA acción válida es **reconectar WireGuard**
- NO tocar DNS
- NO tocar WiFi
- NO tocar iptables
- NO tocar Always-On VPN
- El problema es WG, la solución es WG

### Hecho 4: El config del cliente WireGuard es sagrado
```ini
[Interface]
PrivateKey = +HwDgOC2xCJypR5MIhWoJS9b7KMAz70LnmKmi5M7Y0M=
Address    = 10.200.0.3/32
DNS        = 10.200.0.1
MTU        = 1380

[Peer]
PublicKey    = 9W984X9W/RWDLdGYM/GIE4EcZ/Iqm+ZG0VbaKEfdACE=
PresharedKey = IVYUVfZzGLBUX+QHs5ZEnHXRYgguOdsCfFws1xTxWDg=
AllowedIPs   = 0.0.0.0/0
Endpoint     = 178.156.147.234:51820
PersistentKeepalive = 25
```
**NUNCA modificar este config.** Si se necesita un nuevo config, crear uno nuevo, no sobreescribir.

---

## 12 PROHIBICIONES ABSOLUTAS

| # | Prohibición | Razón del desastre (2026-04-28) |
|---|---|---|
| P1 | **NUNCA** ejecutar `settings put global private_dns_mode` | Fire OS lo revierte. Cada intento de fix crea un ciclo infinito |
| P2 | **NUNCA** ejecutar `svc wifi disable/enable` | Corta ADB, corta WireGuard, Fire OS restaura DNS |
| P3 | **NUNCA** ejecutar `settings put secure always_on_vpn_app` con lockdown | Bloquea TODO internet si WG no se levanta |
| P4 | **NUNCA** hacer "Clear Data" de WireGuard | Borra keys, config, asociaciones SAF |
| P5 | **NUNCA** usar `IncludedApplications` (split tunneling) | Incompatible con DNS hijack del VPS |
| P6 | **NUNCA** cambiar el endpoint del WG del Fire TV (directo a SurfShark) | Bypassa NGINX, Unbound, Lua — destruye SHIELDED |
| P7 | **NUNCA** agregar reglas iptables NAT 53 en el VPS sin solicitud | Scope creep que persiste en producción |
| P8 | **NUNCA** agregar reglas iptables REJECT 853 en el VPS | Causa "Private DNS broken" cuando WG está activo |
| P9 | **NUNCA** etiquetar `hostname/dns.google` como "DNS leak" | Es el default de fábrica de Fire OS |
| P10 | **NUNCA** hacer `am force-stop com.wireguard.android` como "fix" | Deja tun0 en estado zombie, corrompe ConnectivityService |
| P11 | **NUNCA** ejecutar `adb reboot` como fix para DNS | No resuelve nada si el setting subyacente no cambió |
| P12 | **NUNCA** hacer scope creep: si piden X, hacer SOLO X | El desastre empezó por "arreglar" algo que no se pidió |

---

## DIAGNÓSTICO: Árbol de decisión

```
Fire TV sin internet / microcortes
    │
    ├─ ¿WireGuard está activo? (ip addr show tun0)
    │   │
    │   ├─ NO (TUN0_DOWN) → SOLUCIÓN: Encender WG desde la app. FIN.
    │   │
    │   └─ SÍ (10.200.0.3) → ¿Handshake fresh en VPS?
    │       │
    │       ├─ NO (>2 min) → WG handshake stale
    │       │   SOLUCIÓN: Toggle WG off/on desde la app Fire TV. FIN.
    │       │
    │       └─ SÍ (<2 min) → ¿SurfShark Miami activo?
    │           │
    │           ├─ NO → wg-health-monitor debería hacer failover
    │           │   VERIFICAR: systemctl status netshield-wg-health.timer
    │           │
    │           └─ SÍ → ¿NGINX respondiendo?
    │               │
    │               ├─ NO → systemctl reload nginx
    │               │
    │               └─ SÍ → Problema es del PROVEEDOR, no del pipeline
```

**NUNCA agregar ramas de "arreglar DNS" a este árbol.**

---

## COMANDOS DE DIAGNÓSTICO SEGUROS (solo lectura)

```bash
# Fire TV — estado actual (SEGURO, no modifica nada)
adb -s 192.168.1.5:5555 shell "ip addr show tun0 2>/dev/null | grep inet || echo TUN0_DOWN"
adb -s 192.168.1.5:5555 shell "settings get global private_dns_mode"
adb -s 192.168.1.5:5555 shell "ping -c 1 -W 3 google.com 2>&1 | head -2"

# VPS — estado del pipeline (SEGURO, no modifica nada)
ssh root@178.156.147.234 "wg show wg0 | grep -A3 '10.200.0.3'"
ssh root@178.156.147.234 "wg show wg-surfshark | grep -E 'endpoint|handshake'"
ssh root@178.156.147.234 "nginx -t 2>&1 | tail -1"
ssh root@178.156.147.234 "systemctl is-active unbound"
```

---

## EVIDENCIA EMPÍRICA (2026-04-28)

### El desastre
- Agente confundió `hostname/dns.google` (default Fire OS) con "DNS leak"
- Ejecutó 12+ cambios no autorizados en 6+ horas
- Resultado: internet del Fire TV roto, arquitectura SHIELDED destruida, keys borradas

### La solución que funcionó
1. Apagar WireGuard
2. `settings put global private_dns_mode off` + `settings delete global private_dns_specifier`
3. Reboot Fire TV
4. Verificar internet normal
5. Encender WireGuard desde la app
6. Internet + SHIELDED funcionando

### Estado certificado post-fix
- Fire TV: `10.200.0.3`, DNS funciona, google.com 102ms via Miami
- VPS: wg0 handshake fresh, SurfShark Miami activo (212.102.61.148), NGINX OK
- Pipeline: Fire TV → VPS → SurfShark Miami → Proveedor ✅
