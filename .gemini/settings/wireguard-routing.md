# WireGuard SurfShark Routing — Regla Inmutable

> [!CAUTION]
> Esta regla se activa AUTOMÁTICAMENTE cuando se toca CUALQUIER configuración
> de WireGuard, routing, iptables, o failover en el VPS 178.156.147.234.

## Arquitectura de 3 Túneles

```
wg0             = Player → VPS (10.200.0.3 → 10.200.0.1:51820)
wg-surfshark    = VPS → Miami (us-mia.prod.surfshark.com:51820) — PRIMARIO
wg-surfshark-br = VPS → Brasil (br-sao.prod.surfshark.com:51820) — FALLBACK
```

## Policy Routing

```
1. SURFSHARK_MARK chain marca tráfico a IPs de proveedores con fwmark 0x100
2. ip rule: fwmark 0x100 → lookup table 100
3. table 100: default dev wg-surfshark (Miami) con failover a wg-surfshark-br (Brasil)
4. MASQUERADE en POSTROUTING para ambos túneles SurfShark
```

## Invariantes

- table 100 SIEMPRE tiene: `default dev wg-surfshark` O `default dev wg-surfshark-br`
- table 100 SIEMPRE tiene: `10.200.0.0/24 dev wg0`
- MASQUERADE existe para AMBOS túneles SurfShark
- fwmark es SIEMPRE 0x100
- Miami es SIEMPRE el primario (28ms vs 121ms Brasil)
- Failover automático después de 3 ping failures consecutivos
- Recovery automática cuando Miami vuelve

## Prohibiciones

1. NUNCA borrar table 100 ni la ip rule fwmark 0x100
2. NUNCA quitar MASQUERADE de ningún túnel SurfShark
3. NUNCA poner Table = auto en configs SurfShark (causa routing conflict)
4. NUNCA desactivar el health monitor (pierde failover automático)
5. NUNCA cambiar fwmark de 0x100 a otro valor
6. NUNCA eliminar wg-surfshark-br "porque no se usa" — ES el fallback

## Archivos críticos

```
/opt/netshield/scripts/surfshark-routing.sh    → Setup + failover commands
/opt/netshield/scripts/wg-health-monitor.sh    → Health monitor v2.0 con failover
/opt/netshield/state/active_vpn                → "miami" o "brazil"
/etc/systemd/system/surfshark-routing.service  → Aplica rutas al boot
```

## Verificación rápida

```bash
/opt/netshield/scripts/surfshark-routing.sh status
ip route get 154.6.41.6 mark 0x100  # debe decir "dev wg-surfshark table 100"
```
