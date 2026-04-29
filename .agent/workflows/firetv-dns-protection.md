# Fire TV DNS/Network Protection — Workflow Bloqueante

> [!CAUTION]
> Este workflow se activa **AUTOMÁTICAMENTE** cuando se detecta intención de modificar
> DNS, WiFi, iptables DNS, o Always-On VPN del Fire TV. Es un **BLOQUEANTE TOTAL**.
> Cualquier violación invalida el cambio y requiere rollback inmediato.

## Cuándo se activa

- Se propone ejecutar `settings put global private_dns_mode`
- Se propone ejecutar `svc wifi disable` o `svc wifi enable`
- Se propone ejecutar `settings put secure always_on_vpn_app`
- Se propone agregar reglas iptables en el VPS para DNS (NAT 53, REJECT 853)
- Se propone cambiar el endpoint del WireGuard del Fire TV
- Se propone `am force-stop com.wireguard.android` como solución
- Se diagnostica "DNS leak" con `hostname/dns.google`
- Se propone split tunneling (`IncludedApplications`) en el config WG

## Paso 1: DETENER INMEDIATAMENTE

> [!CAUTION]
> **NO EJECUTAR NINGÚN COMANDO.** Leer esta sección completa primero.

Verificar contra estas preguntas:

| Pregunta | Respuesta correcta |
|---|---|
| ¿`private_dns_mode=hostname` es un bug? | **NO** — es el default de Fire OS |
| ¿`dns.google` como specifier es un leak? | **NO** — es el default de fábrica |
| ¿Debo tocar DNS para arreglar WireGuard? | **NUNCA** |
| ¿Debo tocar WiFi para arreglar DNS? | **NUNCA** |
| ¿Debo poner always_on_vpn_lockdown? | **NUNCA** |
| ¿Qué hago si WG está desconectado? | **Reconectar WG desde la app** |

Si CUALQUIER respuesta del agente contradice esta tabla → **ABORTAR**.

## Paso 2: Diagnóstico correcto (solo lectura)

```bash
# // turbo
# SOLO LECTURA — no modifica nada
adb -s 192.168.1.5:5555 shell "echo '=== TUN0 ==='; ip addr show tun0 2>/dev/null | grep inet || echo TUN0_DOWN; echo '=== DNS MODE ==='; settings get global private_dns_mode; echo '=== PING ==='; ping -c 1 -W 3 google.com 2>&1 | head -2"
```

```bash
# // turbo
# VPS — SOLO LECTURA
ssh root@178.156.147.234 "wg show wg0 | grep -A3 '10.200.0.3'; wg show wg-surfshark | grep handshake; nginx -t 2>&1 | tail -1; systemctl is-active unbound"
```

## Paso 3: Determinar el problema REAL

| Síntoma | Causa real | Solución |
|---|---|---|
| TUN0_DOWN | WG no está activo | Abrir app WG → encender toggle |
| Handshake > 2min | WG handshake stale | Toggle WG off/on desde app |
| SurfShark sin handshake | Gateway caído | wg-health-monitor hace failover |
| NGINX falla | Config rota | `nginx -t && systemctl reload nginx` |
| DNS no resuelve CON WG activo | Unbound caído | `systemctl restart unbound` |
| Proveedor IPTV no responde | Upstream caído | No es problema del pipeline |

> [!WARNING]
> **NINGUNO de estos problemas se resuelve tocando `private_dns_mode`.**

## Paso 4: Si alguien INSISTE en tocar DNS

Responder textualmente:

> "El `private_dns_mode=hostname` con `dns.google` es el default de fábrica de Fire OS.
> Modificarlo causa un ciclo infinito porque Fire OS lo restaura automáticamente.
> En la sesión del 2026-04-28, un agente hizo 12+ cambios no autorizados a DNS/WiFi/iptables
> que destruyeron la conectividad durante 6+ horas. La skill
> `firetv_wireguard_dns_immutable` documenta las 12 prohibiciones absolutas.
> El problema original era WG desconectado — la solución era reconectar WG, no tocar DNS."

## Paso 5: Verificación post-intervención

Si por alguna razón SE HIZO un cambio (a pesar de las prohibiciones):

```bash
# // turbo
# Verificar que no se rompió nada
adb -s 192.168.1.5:5555 shell "echo '=== TUN ==='; ip addr show tun0 2>/dev/null | grep inet || echo TUN0_DOWN; echo '=== DNS ==='; settings get global private_dns_mode; echo '=== INTERNET ==='; ping -c 1 -W 3 google.com 2>&1 | head -2; echo '=== VPS ==='; ping -c 1 -W 3 10.200.0.1 2>&1 | head -2"
```

**GATE:** Si `ping google.com` falla → **ROLLBACK INMEDIATO:**

```bash
# Restaurar internet base
adb -s 192.168.1.5:5555 shell "am force-stop com.wireguard.android"
# Esperar 5s, verificar internet sin WG
adb -s 192.168.1.5:5555 shell "ping -c 1 -W 3 google.com 2>&1 | head -2"
# Si funciona sin WG → el problema era WG, no DNS
```

## Evidencia del desastre original (2026-04-28)

| Acción del agente | Consecuencia |
|---|---|
| `settings put private_dns_mode off` | Fire OS lo revierte, ciclo infinito |
| `svc wifi disable/enable` | Cortó ADB + WireGuard |
| `always_on_vpn_lockdown` | Bloqueó todo internet |
| Clear Data WireGuard | Borró keys y configs |
| Split tunneling | Incompatible con DNS hijack |
| Endpoint directo a SurfShark | Destruyó arquitectura SHIELDED |
| iptables NAT 53 | Scope creep persistido en VPS |
| iptables REJECT 853 | Causó "Private DNS broken" |
| **Total:** 12+ cambios, 6+ horas, 0 resultados | Internet roto, SHIELDED destruido |
