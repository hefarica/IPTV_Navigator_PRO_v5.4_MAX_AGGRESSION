# WireGuard SurfShark Routing — Workflow de Verificación

> [!CAUTION]
> Este workflow es **OBLIGATORIO** antes y después de CUALQUIER cambio
> que toque WireGuard, iptables, ip route, ip rule, o SurfShark en el VPS.
> El failover automático Miami → Brasil es la línea de vida de la reproducción IPTV.

## Paso 1: Pre-Flight — Estado Actual

```bash
# // turbo
ssh root@178.156.147.234 "echo '=== ACTIVE VPN ===' && cat /opt/netshield/state/active_vpn && echo '=== TABLE 100 ===' && ip route show table 100 && echo '=== WG HEALTH ===' && cat /opt/netshield/state/wg_health_state.json && echo '=== NAT ===' && iptables -t nat -L POSTROUTING -n -v | grep wg-surfshark && echo '=== IP RULE ===' && ip rule show | grep 0x100"
```

**GATE:** Verificar:
- `active_vpn` = `miami` (o `brazil` si hay failover activo)
- `table 100` tiene `default dev wg-surfshark` (o `wg-surfshark-br` si failover)
- `table 100` tiene `10.200.0.0/24 dev wg0`
- NAT tiene MASQUERADE para AMBOS túneles
- ip rule tiene `fwmark 0x100 lookup 100`

Si CUALQUIER invariante falta → **REPARAR antes de hacer cualquier cambio**.

## Paso 2: Backup

```bash
# // turbo
ssh root@178.156.147.234 "tar czf /root/backups/pre_wg_change_$(date +%Y%m%d_%H%M%S).tar.gz /etc/wireguard/ /opt/netshield/ /etc/systemd/system/surfshark-routing.service 2>/dev/null && echo BACKUP_OK"
```

## Paso 3: Verificación de Invariantes (Mental)

Antes de aplicar el cambio, verificar contra esta tabla:

| ID | Invariante | Valor |
|---|---|---|
| R1.1 | ip rule fwmark 0x100 → table 100 | DEBE existir |
| R1.2 | table 100 default dev | wg-surfshark O wg-surfshark-br |
| R1.3 | table 100 10.200.0.0/24 dev | wg0 |
| R2.1 | MASQUERADE wg-surfshark | DEBE existir |
| R2.2 | MASQUERADE wg-surfshark-br | DEBE existir |
| R3.2 | fwmark value | 0x100 exacto |
| R4.1 | Primary tunnel | wg-surfshark (Miami) |
| R5.1 | SurfShark Table setting | off (ambos) |
| R5.2 | SurfShark MTU | 1280 (ambos) |

Si CUALQUIER invariante se viola con el cambio propuesto → **ABORTAR**.

## Paso 4: Aplicar Cambio

Ejecutar el cambio planificado.

## Paso 5: Post-Flight

```bash
# // turbo
ssh root@178.156.147.234 "echo '=== ROUTING ===' && /opt/netshield/scripts/surfshark-routing.sh status && echo '=== TABLE 100 ===' && ip route show table 100 && echo '=== ROUTE TEST ===' && ip route get 154.6.41.6 mark 0x100 && echo '=== PING MIAMI ===' && ping -c2 -W3 -I wg-surfshark 1.1.1.1 2>&1 | tail -2 && echo '=== PING BRASIL ===' && ping -c2 -W3 -I wg-surfshark-br 1.1.1.1 2>&1 | tail -2 && echo '=== NAT ===' && iptables -t nat -L POSTROUTING -n -v | grep wg-surfshark && echo '=== HEALTH ===' && cat /opt/netshield/state/wg_health_state.json"
```

**GATE:** Si algún check falla → **ROLLBACK**:

```bash
ssh root@178.156.147.234 "cd /root/backups && ls -t pre_wg_change_*.tar.gz | head -1 | xargs tar xzf -C / && /opt/netshield/scripts/surfshark-routing.sh setup"
```

## Paso 6: Verificar Player

```bash
# // turbo
ssh root@178.156.147.234 "tail -5 /var/log/nginx/shield_access.log 2>/dev/null && echo --- && tail -5 /var/log/netshield-wg-health.log 2>/dev/null"
```

Si el player estaba reproduciendo y dejó de funcionar después del cambio → ROLLBACK inmediato.

## Comandos Útiles

```bash
# Failover manual a Brasil
ssh root@178.156.147.234 "/opt/netshield/scripts/surfshark-routing.sh failover-brazil"

# Recovery manual a Miami
ssh root@178.156.147.234 "/opt/netshield/scripts/surfshark-routing.sh failover-miami"

# Re-setup completo (aplica Miami primario + todo el routing)
ssh root@178.156.147.234 "/opt/netshield/scripts/surfshark-routing.sh setup"

# Ver logs de failover
ssh root@178.156.147.234 "grep -E 'FAILOVER|RECOVERY|routing' /var/log/netshield-wg-health.log | tail -20"
```
