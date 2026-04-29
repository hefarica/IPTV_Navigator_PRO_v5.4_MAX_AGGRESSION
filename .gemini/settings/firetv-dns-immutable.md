

# REGLA INMUTABLE: Fire TV DNS/WireGuard — NUNCA TOCAR

> **Fecha:** 2026-04-28
> **Causa:** Un agente destruyó la conectividad del Fire TV durante 6+ horas por confundir un default del SO con un bug

## Activación

Esta regla se activa cuando se menciona: Fire TV, Fire Stick, Firestick, tun0, private_dns, dns.google, DNS leak, Private DNS broken, microcortes, WireGuard desconectado, sin internet Fire TV.

## Regla Cardinal

> **`private_dns_mode=hostname` con `dns.google` es el DEFAULT de Fire OS. NO ES UN LEAK. NO SE TOCA.**

## 12 Prohibiciones

1. **NUNCA** `settings put global private_dns_mode` — Fire OS lo revierte, crea ciclo infinito
2. **NUNCA** `svc wifi disable/enable` — corta ADB y WireGuard
3. **NUNCA** `always_on_vpn_lockdown` — bloquea internet si WG falla
4. **NUNCA** Clear Data de WireGuard — borra keys y configs
5. **NUNCA** split tunneling (`IncludedApplications`) — incompatible con DNS hijack
6. **NUNCA** cambiar endpoint WG del Fire TV directo a SurfShark — destruye SHIELDED
7. **NUNCA** iptables NAT 53 sin solicitud — scope creep en producción
8. **NUNCA** iptables REJECT 853 — causa "Private DNS broken"
9. **NUNCA** etiquetar `hostname/dns.google` como "DNS leak"
10. **NUNCA** `am force-stop com.wireguard.android` como "fix"
11. **NUNCA** `adb reboot` como fix para DNS
12. **NUNCA** scope creep: si piden X, hacer SOLO X

## Diagnóstico correcto

```
Sin internet → ¿WG activo? → NO → Encender WG. FIN.
                             → SÍ → ¿Handshake fresh? → NO → Toggle WG. FIN.
                                                        → SÍ → Problema es upstream, no DNS.
```

## Config sagrada del cliente WG (firestick-cali-hfrc.conf)

- Endpoint: `178.156.147.234:51820`
- DNS: `10.200.0.1`
- Address: `10.200.0.3/32`
- MTU: 1380

## Referencia

- Skill: `.agent/skills/firetv_wireguard_dns_immutable/SKILL.md`
- Workflow: `.agent/workflows/firetv-dns-protection.md`
- Forensic: Sesión 2026-04-28, 12+ cambios no autorizados, 6+ horas perdidas

