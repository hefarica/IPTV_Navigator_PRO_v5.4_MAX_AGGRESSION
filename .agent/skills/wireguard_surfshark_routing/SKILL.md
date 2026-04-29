---
name: "wireguard-surfshark-routing-immutable"
description: "Skill inmutable que documenta la arquitectura completa de WireGuard policy routing del VPS IPTV. Miami (wg-surfshark) es PRIMARIO. Brasil (wg-surfshark-br) es FALLBACK. El failover es AUTOMÁTICO via health monitor. PROHIBIDO cambiar la topología sin seguir este skill."
---

# WireGuard SurfShark Routing — Immutable Skill

## Cuándo se activa

Esta skill se activa **OBLIGATORIAMENTE** cuando:

1. Se menciona "WireGuard", "SurfShark", "VPN", "túnel", "routing", "failover"
2. Se pide cambiar endpoints de SurfShark (Miami, Brasil, otro país)
3. Se diagnostican problemas de conectividad del proveedor IPTV
4. Se modifica cualquier archivo en `/opt/netshield/scripts/`
5. Se tocan reglas de `iptables`, `ip route`, `ip rule`, o `fwmark`
6. Se reinicia cualquier interfaz WireGuard
7. Se menciona "latencia", "ruta", "table 100", "policy routing", o "MASQUERADE"
8. Se modifica la configuración de WireGuard del VPS o del player

## Arquitectura Completa

```
Player (Fire Stick / OTT Navigator)
    │ WireGuard wg0 (10.200.0.3 → 10.200.0.1)
    │ Endpoint: 178.156.147.234:51820
    ▼
VPS Hetzner (178.156.147.234)
    │
    ├─ wg0 (Player tunnel)
    │   IP: 10.200.0.1/24
    │   Puerto: 51820
    │
    ├─ NGINX (NET SHIELD AUTOPISTA)
    │   proxy_pass a upstreams de proveedores IPTV
    │   Tráfico sale por interfaz del sistema operativo
    │
    ├─ iptables SURFSHARK_MARK chain
    │   Marca tráfico a IPs de proveedores con fwmark 0x100
    │   → ip rule: fwmark 0x100 → lookup table 100
    │
    ├─ Table 100 (Policy Routing para tráfico IPTV)
    │   default dev wg-surfshark  ← MIAMI (PRIMARIO)
    │   10.200.0.0/24 dev wg0     ← Players
    │   (failover: default dev wg-surfshark-br ← BRASIL)
    │
    ├─ wg-surfshark (SurfShark Miami 🇺🇸)
    │   Endpoint: us-mia.prod.surfshark.com:51820
    │   IP interna: 10.14.0.2/16
    │   Latencia: ~28ms
    │   NAT: MASQUERADE en POSTROUTING
    │
    └─ wg-surfshark-br (SurfShark São Paulo 🇧🇷)
        Endpoint: br-sao.prod.surfshark.com:51820
        IP interna: 10.14.0.2/16
        Latencia: ~121ms
        NAT: MASQUERADE en POSTROUTING
```

## Flujo del Tráfico IPTV

```
1. Player pide http://proveedor/live/user/pass/123.m3u8
2. WireGuard wg0 lleva el request al VPS (10.200.0.1)
3. DNS hijack (Unbound) resuelve proveedor → 127.0.0.1
4. NGINX recibe el request, proxy_pass al upstream real
5. NGINX conecta a IP real del proveedor (ej: 154.6.41.6)
6. iptables SURFSHARK_MARK marca el paquete con fwmark 0x100
7. ip rule: fwmark 0x100 → table 100
8. table 100: default dev wg-surfshark → sale por Miami
9. MASQUERADE: source IP → 10.14.0.2 (IP de SurfShark)
10. SurfShark Miami → Internet → Proveedor IPTV
11. Respuesta vuelve por el mismo camino inverso
```

## Archivos Críticos en el VPS

| Archivo | Propósito |
|---|---|
| `/etc/wireguard/wg-surfshark.conf` | Config SurfShark Miami (primario) |
| `/etc/wireguard/wg-surfshark-br.conf` | Config SurfShark Brasil (fallback) |
| `/etc/wireguard/wg0.conf` | Config túnel Player → VPS |
| `/opt/netshield/scripts/surfshark-routing.sh` | Policy routing setup + failover |
| `/opt/netshield/scripts/wg-health-monitor.sh` | Health monitor v2.0 con failover automático |
| `/opt/netshield/state/active_vpn` | "miami" o "brazil" — VPN activa actual |
| `/opt/netshield/state/wg_health_state.json` | Estado de salud de todas las interfaces |
| `/opt/netshield/state/surfshark_routing_state.json` | Estado del routing activo |
| `/etc/systemd/system/surfshark-routing.service` | Servicio systemd para rutas al boot |

## Invariantes NO NEGOCIABLES

### R1: Policy Routing

```
R1.1: ip rule fwmark 0x100 → lookup table 100 SIEMPRE debe existir
R1.2: table 100 SIEMPRE debe tener: default dev wg-surfshark O wg-surfshark-br
R1.3: table 100 SIEMPRE debe tener: 10.200.0.0/24 dev wg0
R1.4: NUNCA borrar table 100 ni la ip rule
R1.5: NUNCA poner default via eth0 en table 100 (expone IP real al proveedor)
```

### R2: MASQUERADE

```
R2.1: MASQUERADE para wg-surfshark SIEMPRE debe existir
R2.2: MASQUERADE para wg-surfshark-br SIEMPRE debe existir
R2.3: NUNCA borrar las reglas MASQUERADE de ninguno de los dos túneles
R2.4: El MASQUERADE de eth0 para 10.200.0.0/24 NUNCA debe manejar tráfico IPTV
```

### R3: SURFSHARK_MARK Chain

```
R3.1: TODAS las IPs de proveedores IPTV deben estar en la chain
R3.2: El mark DEBE ser 0x100
R3.3: NUNCA cambiar el mark value — rompe la ip rule
R3.4: Si se agrega un nuevo proveedor, agregar su IP/rango a la chain
```

### R4: Failover

```
R4.1: Miami es SIEMPRE el primario — menor latencia (28ms vs 121ms)
R4.2: Brasil es SIEMPRE el fallback — solo se activa si Miami falla
R4.3: El failover se activa después de 3 ping failures consecutivos
R4.4: La recovery a Miami es AUTOMÁTICA cuando Miami vuelve a funcionar
R4.5: NUNCA hacer failover manual sin verificar primero ambos túneles
```

### R5: Configuración WireGuard

```
R5.1: Ambos túneles SurfShark tienen Table = off (NO routing automático)
R5.2: MTU = 1280 en ambos túneles SurfShark
R5.3: wg0 (player) MTU = 1380
R5.4: NUNCA cambiar las keys de WireGuard sin re-exportar desde SurfShark
R5.5: NUNCA poner Table = auto en los túneles SurfShark (causa routing conflict)
```

## Prohibiciones Absolutas

| # | Prohibición | Consecuencia si se viola |
|---|---|---|
| P1 | NUNCA borrar table 100 | Tráfico IPTV sale por eth0, IP real expuesta, provider bloquea |
| P2 | NUNCA quitar MASQUERADE de wg-surfshark | Source IP incorrecta, paquetes dropeados |
| P3 | NUNCA poner ambos túneles con Table = auto | Routing conflict, interfaces compiten por default route |
| P4 | NUNCA cambiar fwmark de 0x100 a otro valor | ip rule no matchea, tráfico va por eth0 |
| P5 | NUNCA desactivar el health monitor | Sin failover automático, caída prolongada |
| P6 | NUNCA cambiar el endpoint de Miami sin verificar latencia | Puede empeorar rendimiento |
| P7 | NUNCA borrar wg-surfshark-br "porque no se usa" | ES el fallback activo para emergencias |

## Comandos de Verificación

```bash
# Estado del routing
/opt/netshield/scripts/surfshark-routing.sh status

# Qué VPN está activa
cat /opt/netshield/state/active_vpn

# Verificar table 100
ip route show table 100
# Esperado: default dev wg-surfshark + 10.200.0.0/24 dev wg0

# Verificar que tráfico IPTV sale por SurfShark
ip route get 154.6.41.6 mark 0x100
# Esperado: dev wg-surfshark table 100

# Verificar NAT
iptables -t nat -L POSTROUTING -n -v | grep wg-surfshark

# Test de latencia ambos túneles
ping -c3 -I wg-surfshark 1.1.1.1
ping -c3 -I wg-surfshark-br 1.1.1.1

# Health state completo
cat /opt/netshield/state/wg_health_state.json

# Failover manual (SOLO en emergencia)
/opt/netshield/scripts/surfshark-routing.sh failover-brazil
/opt/netshield/scripts/surfshark-routing.sh failover-miami
```

## Diagnóstico de Problemas

### Si el player no reproduce

1. ✅ Verificar `wg show wg0` — ¿handshake reciente?
2. ✅ Verificar `ip route show table 100` — ¿tiene default dev?
3. ✅ Verificar `cat /opt/netshield/state/active_vpn` — ¿miami o brazil?
4. ✅ Verificar `ping -I wg-surfshark 1.1.1.1` — ¿conectividad?
5. ✅ Verificar `iptables -t nat -L POSTROUTING -n | grep wg-surfshark` — ¿MASQUERADE?

### Si la latencia es alta

1. ✅ Verificar `cat /opt/netshield/state/active_vpn` — si dice "brazil", hay failover activo
2. ✅ Verificar logs: `grep FAILOVER /var/log/netshield-wg-health.log | tail -5`
3. ✅ Si Miami está sano, forzar recovery: `surfshark-routing.sh failover-miami`

### Si hay "connection reset" o "timeout" del proveedor

1. ❌ NO es problema de routing si `ip route get <ip> mark 0x100` muestra wg-surfshark
2. ✅ Verificar SurfShark — puede ser throttling de la VPN
3. ✅ Verificar provider — puede estar caído
4. ✅ Probar via Brasil: `surfshark-routing.sh failover-brazil` y re-test

## Evidencia Empírica (2026-04-28)

| Métrica | Miami | Brasil |
|---|---|---|
| Latencia a 1.1.1.1 | 28ms | 121ms |
| Packet loss | 0% | 0% |
| Endpoint | us-mia.prod.surfshark.com:51820 | br-sao.prod.surfshark.com:51820 |
| IP resuelta | 212.102.61.148 | 149.102.251.168 |
| Tráfico total player | 223 GiB enviados | Standby |
