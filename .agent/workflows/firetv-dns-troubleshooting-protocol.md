---
description: Protocolo paso a paso para diagnosticar problemas en la cadena Fire TV → WireGuard → VPS NGINX → SurfShark → Provider sin caer en scope creep DNS. Incluye diagnostic ladder, mapeo síntoma→hipótesis→test, comandos exactos por fase, rollback ready-to-paste, y lectura correcta de dumpsys connectivity. Aplicar cuando se reporta freeze, microcortes, "no carga", DNS roto, "Private DNS broken", o cualquier issue de conectividad del Fire TV.
---

# 🔧 Workflow — Fire TV / VPS / SurfShark Troubleshooting

**SEVERIDAD: ALTA · APLICAR EN ORDEN ESTRICTO**

Cross-references obligatorios antes de empezar:
- `.agent/skills/firetv_dns_no_scope_creep_sop/SKILL.md` — SOP completo
- `.agent/rules/rule_no_unsolicited_network_changes.md` — prohibiciones
- `.agent/skills/adb_master_directives_rule/SKILL.md` — DNS Hardening como estado deseado

## ARQUITECTURA SSOT (no asumir otra)

```
Fire TV (10.200.0.3)
    ↓ WireGuard tun0
wg0 ↔ VPS Hetzner (10.200.0.1, public 178.156.147.234)
    ↓ NGINX (proxy_pass al upstream del provider)
    ↓ upstream connection desde VPS — marcada por SURFSHARK_MARK chain (fwmark 0x100)
    ↓ policy routing → table 100
wg-surfshark Miami (10.14.0.2 → 212.102.61.148)  [primary]
wg-surfshark Brasil (10.14.0.2 → 149.102.251.168) [standby]
    ↓
Proveedor IPTV (149.18.45.x, 91.208.115.x, 154.6.41.x, 43.250.127.x, etc.)
```

**Implicación crítica:** un mismo paquete del Fire TV es:
1. Recibido en `wg0` por NGINX
2. NGINX hace `proxy_pass` al hostname del provider
3. La conexión OUT del VPS (loopback `127.0.0.1` aparece como cliente en logs) toca SURFSHARK_MARK chain
4. Sale por wg-surfshark Miami
5. Llega al provider

Si cualquier capa falla, el Fire TV ve freeze. **NO siempre es DNS.**

---

## DIAGNOSTIC LADDER (5 FASES)

### FASE 1 · BASELINE READ-ONLY (sin modificar nada)

Ejecutar SIEMPRE como primer paso. Cualquier diagnóstico que salte directo a fix sin pasar por aquí está mal.

```bash
# 1.1 — VPS WG state
ssh root@178.156.147.234 "wg show wg0 | grep -A4 '10.200.0.3'; echo ---; wg show wg-surfshark | head -10; echo ---; wg show wg-surfshark-br | head -10"

# 1.2 — Fire TV WG state (sólo si tunnel UP)
adb -s 192.168.1.5:5555 shell "ip addr show tun0 2>/dev/null | grep inet || echo TUN0_DOWN"
adb -s 192.168.1.5:5555 shell "ip route get 1.1.1.1 | head -2"

# 1.3 — Fire TV settings (NO modificar)
adb -s 192.168.1.5:5555 shell "settings get global private_dns_mode; settings get global private_dns_specifier; settings get secure always_on_vpn_app"

# 1.4 — VPS routing
ssh root@178.156.147.234 "ip rule show; echo ---; ip route show table 100"

# 1.5 — NGINX errors recientes
ssh root@178.156.147.234 "tail -30 /var/log/nginx/error.log; echo ---; tail -30 /var/log/nginx/shield_error.log 2>/dev/null"

# 1.6 — Playlist log (¿descargó la lista bien?)
ssh root@178.156.147.234 "tail -10 /var/log/nginx/playlist_access.log | grep '10.200.0.3'"

# 1.7 — VPS resources
ssh root@178.156.147.234 "uptime; free -h | head -3; df -h /dev/shm"

# 1.8 — Provider reachability (los 4 más usados)
ssh root@178.156.147.234 "for ip in 149.18.45.119 91.208.115.23 154.6.41.66 43.250.127.182; do printf 'PROVIDER %s: ' \$ip; timeout 2 ping -c 1 -W 1 \$ip 2>&1 | grep -E 'time=|100%' | head -1; done"
```

### FASE 2 · MAPEO SÍNTOMA → HIPÓTESIS

Sólo formula UNA hipótesis basada en evidencia de Fase 1. Tabla de decisión:

| Síntoma del user | Evidencia clave | Hipótesis | NO toques |
|---|---|---|---|
| "Freeze en stream" | `upstream prematurely closed` en error.log | Provider rate-limit/down | DNS, iptables, settings |
| "Microcortes" | WG handshake >5min stale | WG keepalive falló | DNS, iptables |
| "No carga ningún canal" | playlist_access.log sin 10.200.0.3 reciente | Tunnel desconectado o DNS hijack roto | iptables, settings (verificar primero) |
| "Private DNS is broken" en dumpsys | dnsfailedresolutionofdns.google | DoT no llega al destino | settings (NO ES bug, es síntoma) |
| "No carga UN canal específico" | provider IP en error.log con prematurely closed | Ese provider está caído | nada, cambiar canal |
| "Stream lento, buffering" | Lua bandwidth_reactor logs muestra throttle | Provider entrega bitrate bajo | nada (es lo que hay) |
| "No internet en Fire TV" | tun0 UP + DNS muerto | Probablemente always_on_vpn lockdown | quitar always_on_vpn |
| "WireGuard no auto-arranca" | always_on_vpn_app empty | Diseño actual (manual toggle) | nada (no auto-config sin orden) |

**REGLA DE ORO:** si tu hipótesis menciona "DNS leak" / "private_dns_mode" / "iptables hijack" SIN evidencia directa de query DNS fallida en logs → STOP, vuelve a Fase 1, revisa logs del provider.

### FASE 3 · TEST MÍNIMO NO DESTRUCTIVO

Antes de modificar nada, prueba la hipótesis con un test READ-ONLY:

```bash
# Test DNS hijack (si la hipótesis es DNS)
ssh root@178.156.147.234 "dig @127.0.0.1 nfqdeuxu.x1megaott.online +short"
# Expected: 178.156.147.234 si Unbound hijack está activo

# Test provider directly (si hipótesis es provider)
ssh root@178.156.147.234 "timeout 5 curl -sI -o /dev/null -w '%{http_code}\n' http://nfqdeuxu.x1megaott.online/"
# Expected: 200/302 si provider OK, timeout/000 si caído

# Test SurfShark egress (si hipótesis es Miami down)
ssh root@178.156.147.234 "timeout 5 curl --interface wg-surfshark -s https://api.ipify.org"
# Expected: una IP de Miami (212.102.x.x range), no Hetzner

# Test fwmark routing (si hipótesis es policy routing)
ssh root@178.156.147.234 "iptables -t mangle -L SURFSHARK_MARK -v -n | head -5"
# Mira pkt counters incrementando en rangos del provider afectado
```

### FASE 4 · AUTHORIZATION GATE

Si Fase 3 confirma la hipótesis y la fix requiere modificar algo, **NO PROCEDAS**. Reporta al user en este formato exacto:

```
HIPÓTESIS CONFIRMADA: [hipótesis]
EVIDENCIA: [output del test de Fase 3]

ACCIÓN PROPUESTA (1 sola, mínima):
  Comando: [comando exacto]
  Efecto: [qué hace]
  Riesgo: [BAJO/MEDIO/ALTO]
  Rollback: [comando rollback exacto]

¿Autorizas? (responde "Aplica" / "Hazlo" / "SIGUE")
```

NO ejecutes hasta recibir verbo imperativo. "OK", "claro", "entiendo" NO autorizan.

### FASE 5 · VERIFICACIÓN POST-CAMBIO

Después de aplicar la acción autorizada:

```bash
# 5.1 — Síntoma original resuelto?
[test específico del síntoma]

# 5.2 — Internet base sigue OK?
adb -s 192.168.1.5:5555 shell "ping -c 2 -W 3 google.com"
adb -s 192.168.1.5:5555 shell "ping -c 2 -W 3 8.8.8.8"

# 5.3 — Cadena WG intacta?
ssh root@178.156.147.234 "wg show wg0 | grep -A2 '10.200.0.3'"

# 5.4 — NGINX no acumula nuevos errores?
ssh root@178.156.147.234 "tail -f /var/log/nginx/error.log &"  # 30 segundos
```

Si CUALQUIER test falla → **ROLLBACK INMEDIATO** (no "una corrección más").

---

## ROLLBACK READY-TO-PASTE

### Rollback iptables REJECT 853 (común — no aplicar nunca, pero por si acaso)
```bash
ssh root@178.156.147.234 "iptables -D FORWARD -i wg0 -p tcp --dport 853 -j REJECT --reject-with tcp-reset; iptables -D FORWARD -i wg0 -p udp --dport 853 -j REJECT --reject-with icmp-port-unreachable; iptables-save > /etc/iptables/rules.v4"
```

### Rollback iptables NAT 53 wg0→Unbound
```bash
ssh root@178.156.147.234 "iptables -t nat -D PREROUTING -i wg0 -p udp --dport 53 -j DNAT --to-destination 127.0.0.1:53; iptables -t nat -D PREROUTING -i wg0 -p tcp --dport 53 -j DNAT --to-destination 127.0.0.1:53; iptables-save > /etc/iptables/rules.v4"
```

### Rollback always_on_vpn (Fire TV)
```bash
adb -s 192.168.1.5:5555 shell "settings delete secure always_on_vpn_app; settings put secure always_on_vpn_lockdown 0"
```

### Rollback private_dns_mode al default Fire OS
```bash
adb -s 192.168.1.5:5555 shell "settings put global private_dns_mode hostname; settings put global private_dns_specifier dns.google"
adb -s 192.168.1.5:5555 reboot
```

### Si rompes internet y necesitas recovery via UI Fire TV remota
1. Settings → Red → Configuración avanzada → DNS privado → "Desactivado"
2. Settings → Red → VPN → Always-On → desactivar
3. Reiniciar Fire TV

---

## ANEXO 1 — Lectura correcta de `dumpsys connectivity`

Cuando ves esto:

```
NetworkAgentInfo{ ni{[type: VPN[], state: CONNECTED]} network{100} 
  lp{{InterfaceName: tun0 ... UsePrivateDns: true PrivateDnsServerName: dns.google ...}}
  nc{... Private DNS is broken ...}
```

Interpretación correcta campo por campo:

| Campo | Significado | NO es |
|---|---|---|
| `type: VPN` | El agent es de tipo VPN (WG) | Indicador de problema |
| `network{100}` | netId de la red (cambia cada reconexión) | Bug |
| `InterfaceName: tun0` | Nombre del kernel device | Algo a cambiar |
| `UsePrivateDns: true` | Setting global `private_dns_mode = hostname` aplica | "DNS leak" |
| `PrivateDnsServerName: dns.google` | El hostname configurado para DoT | "DNS de Google espionando" |
| `ValidatedPrivateDnsAddresses: [8.8.4.4, 8.8.8.8]` | Resoluciones cacheadas — **DoT funcionó** | "DNS leak validado" |
| `Private DNS is broken` | Validación DoT falló — **causa: bloqueo en path 853** | "Fire TV roto" |
| `lastValidated: false` | La última validación falló | Algo en la red |

`Private DNS is broken` específicamente significa: Android intentó conectar TCP/853 (DoT) al hostname configurado y no pudo. Causas reales:
1. Bloqueo en VPS (REJECT 853, DROP 853 en iptables)
2. Bloqueo upstream (SurfShark route no permite 853)
3. Provider DoT con cert no válido

**NUNCA es:** problema del setting `private_dns_mode` per se. ESE es el estado deseado.

---

## ANEXO 2 — Quick reference de logs por capa

| Síntoma | Log a revisar primero |
|---|---|
| Manifest M3U8 no carga | `/var/log/nginx/playlist_access.log` |
| Stream freeze | `/var/log/nginx/error.log` (buscar `upstream prematurely`) |
| WG no se conecta | `dmesg \| grep wg` y `wg show wg0` |
| Provider no responde | ping desde VPS a IP del provider |
| Lua reactor confuso | `/var/log/nginx/error.log` filtro `[lua]` |
| PRISMA telemetry | `/dev/shm/prisma_*.json` (memoria `reference_ape_prisma_v14_adb_35_directives.md`) |
| Always-on VPN | `dumpsys connectivity \| grep VPN` |

---

## ANEXO 3 — Common provider IPs (memoria 2026-04-29)

| Provider | Hostname | IPs conocidas | Estado típico |
|---|---|---|---|
| x1megaott | nfqdeuxu.x1megaott.online | 149.18.45.78/119/189 | Inestable, cierra connections |
| tivigo | tivigo.cc | 154.6.41.66 | Caído frecuente |
| line.tivi | line.tivi-ott.net | 43.250.127.182, 43.250.127.193 | OK con session affinity bug |
| terovixa | terovixa.cc | 43.250.127.x | Memoria `reference_terovixa_cdn_session_affinity.md` |
| paixif | neo.paixif.com | 149.18.45.119 | Mismo CDN que x1megaott |
| zivovrix | zivovrix.cc | 6840785 | Memoria menciona placeholder bug |

Todos están en SURFSHARK_MARK chain → salen por wg-surfshark Miami.

---

## QUOTE DEL FORENSIC (para nunca repetir)

> Línea 1107: "**`dns.google` que vi era solo el fallback de Android cuando WG no estaba activo**"

El propio agente, 645 líneas DESPUÉS de etiquetar `dns.google` como "DNS LEAK", reconoció que era un default normal. Pero ya había aplicado 6 cambios en el VPS y el Fire TV. **Ese es el patrón a evitar — diagnóstico falso → cascada de fixes → confesión tardía.**

**Antes de etiquetar algo como "broken" o "leak", busca en `.agent/skills/adb_master_directives_rule/` si ya está documentado como estado deseado.**
