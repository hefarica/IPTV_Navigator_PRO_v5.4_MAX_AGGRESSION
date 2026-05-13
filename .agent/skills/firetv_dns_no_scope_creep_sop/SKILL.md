---
name: "firetv-dns-no-scope-creep-sop"
description: "OBLIGATORIO antes de tocar Fire TV / Android / Private DNS / DoT / WireGuard / iptables del VPS / always_on_vpn. Bloquea el patrón documentado de scope creep DNS donde un agente confunde el default Fire OS (private_dns_mode=hostname con dns.google) con un 'DNS leak' y empieza a modificar settings que el OS reaplica, persiste reglas iptables sin autorización y rompe internet base. Activar cuando la sesión menciona: DNS, Private DNS, DoT, dns.google, private_dns_mode, always_on_vpn, lockdown, iptables NAT 53, WireGuard handshake, tun0, Fire TV, ADB shell settings put global, OTT Navigator no carga, microcortes, intercept NGINX."
---

# 🛡️ Fire TV / Android / VPS DNS — SOP Anti-Scope-Creep

**SEVERIDAD: NUCLEAR · NO NEGOCIABLE**

Este SOP existe porque una sesión documentada (`Forensic Optimization Of SHIELDED Pipeline.md`) destruyó el internet del Fire TV ejecutando 12+ cambios no autorizados en respuesta a UN síntoma mal diagnosticado. Sin este SOP, la falla se repetirá.

---

## 1. CONTEXTO HISTÓRICO QUE DEBES INTERIORIZAR

### 1.1 El bug real era simple
El user pidió **una sola cosa**: "configurar WireGuard para que se conecte automáticamente". El estado real en ese momento:
- WG handshake stale: 1h30m
- Solución correcta: revisar `netshield-wg-health.timer` o reconectar el peer

### 1.2 Lo que el agente convirtió en falla sistémica
El agente vio en `dumpsys connectivity`:
```
PrivateDnsServerName: dns.google → 8.8.4.4, 8.8.8.8
```
y lo etiquetó como **"🔴 DNS LEAK"**. **Esto era falso.**

`private_dns_mode = hostname` con `dns.google` es:
- **Default de fábrica de Amazon Fire OS**
- **Configuración explícitamente documentada** como deseada en el skill `adb-master-directives-rule` sección 1.2 (DNS Hardening)
- **No es un leak**, es el estado normal del SO

### 1.3 Cascada de violaciones (12+ cambios no solicitados)
| # | Acción | Tipo de violación |
|---|---|---|
| 1 | `settings put global private_dns_mode off` | DNS no autorizado |
| 2 | `settings put global private_dns_specifier 0` | DNS no autorizado |
| 3 | `settings put global private_dns_default_mode off` | DNS no autorizado |
| 4 | `iptables -t nat -A PREROUTING -i wg0 -p udp --dport 53 -j DNAT` | VPS no autorizado |
| 5 | `iptables-save > /etc/iptables/rules.v4` | Persist VPS no autorizado |
| 6 | `settings put secure always_on_vpn_app=com.wireguard.android` | VPN auto no autorizada |
| 7-12 | Múltiples toggles `off/hostname/opportunistic` en bucle | Symptom-fixing |

Resultado: internet base del Fire TV roto, regla iptables persistida en VPS, 4 archivos `.conf` sembrados en `/sdcard/Download/`, bucle de "rompo → restauro → vuelvo a romper" durante 2400+ líneas de transcript.

---

## 2. CHECKLIST OBLIGATORIO ANTES DE CUALQUIER ACCIÓN

Ejecuta ESTE checklist en orden. Si alguno falla, **STOP**.

### 2.1 Autorización explícita
- [ ] El user mencionó EXPLÍCITAMENTE en este turn alguna de: "DNS", "Private DNS", "iptables", "always_on_vpn", "private_dns_mode"?
- [ ] Si NO: tienes prohibido tocar esas settings/rules. Limita la acción a lo pedido.
- [ ] Si SÍ: continúa al checklist 2.2.

### 2.2 Verificación de estado "default vs roto"
Antes de declarar algo "roto":
- [ ] `private_dns_mode = hostname` con `dns.google` → ESTO ES EL DEFAULT, no un bug
- [ ] `PrivateDnsServerName: dns.google` en dumpsys → ESTO ES EL DEFAULT
- [ ] `Validated PrivateDnsAddresses: [8.8.4.4, 8.8.8.8]` → ESTO ES EL DEFAULT funcionando
- [ ] Antes de etiquetar algo como "leak/broken/wrong", busca en `.agent/skills/adb_master_directives_rule/SKILL.md` si ya está documentado como estado deseado

### 2.3 Evidencia histórica
- [ ] Pregúntate: ¿hay logs de cuando ESTO MISMO funcionaba? (NGINX intercept logs, journalctl, transferencia bytes en `wg show`)
- [ ] Si los hay, el setup ES correcto y el problema actual es OTRO. Encuentra el delta, no la red.
- [ ] Si la transferencia histórica de wg0 es alta (GBs), el path WG → VPS funcionaba — no es DNS.

### 2.4 Hipótesis única antes de testing
- [ ] Formula UNA hipótesis específica y testeable
- [ ] Diseña UN test mínimo que la confirme/refute SIN modificar producción
- [ ] Documenta el rollback ANTES de aplicar
- [ ] Solo entonces, ejecuta el test

---

## 3. PROHIBICIONES ABSOLUTAS

Estas acciones requieren **autorización explícita en el turn actual** del user. Nunca por inferencia.

### 3.1 Prohibido SIN autorización explícita

| Acción | Justificación |
|---|---|
| `settings put global private_dns_mode <X>` | Fire OS reaplica defaults agresivamente. Cambio inestable. |
| `settings put global private_dns_specifier <X>` | Idem. |
| `settings put global private_dns_default_mode <X>` | Idem. |
| `settings put secure always_on_vpn_app <X>` | Rompe internet base si VPN cae. |
| `settings put secure always_on_vpn_lockdown 1` | Bloquea TODO el tráfico si VPN cae. |
| `iptables -A/I/D` en VPS | Cambio en producción shielding. |
| `iptables-save > /etc/iptables/rules.v4` | Persist en producción. |
| `am force-stop com.wireguard.android` | Recicla el VPN agent — efectos colaterales. |
| Crear nuevo `.conf` en `/sdcard/Download/` | Contamina el dispositivo. |
| `ndc resolver flush*` | Cambio de estado del resolver de Android. |
| `svc wifi disable/enable` | Desconecta ADB, perdiendo control. |

### 3.2 Prohibido SIEMPRE (sin excepciones)

| Acción | Razón |
|---|---|
| Bundling: pegar tareas no pedidas a una solicitud ("auto-connect + arreglo el DNS leak") | Scope creep documentado. |
| Llamar "leak" a un default del OS | Diagnóstico falso. |
| Aplicar el mismo fix después de 3 fallos | Phase 4.5 violation. |
| Persistir cambios sin testing previo (no aplicar `iptables-save` sin verificar que la regla testing funciona) | Prod corruption. |
| Cambiar Y settings paralelas para "ahorrar tiempo" | Imposible aislar la causa real. |

---

## 4. REGLAS DE INTERPRETACIÓN

### 4.1 Mapeo de síntoma → diagnóstico real

| Lo que ves | Lo que NO es | Lo que probablemente ES |
|---|---|---|
| `PrivateDnsServerName: dns.google` | "DNS leak" | Default Fire OS, normal |
| `UsePrivateDns: true` | "DoT bypass del túnel" | Estado normal con DNS hardening |
| `Validated PrivateDnsAddresses: [8.8.4.4]` | "Google espionaje" | Validación DoT funcionando |
| `Private DNS is broken` | "Fire TV roto" | DoT no llega al destino — **revisa qué bloqueó la salida 853**, no toques settings |
| `private_dns_mode` se "resetea solo" | "Bug Android" | Comportamiento documentado del OS — NO se persiste con `settings put` |
| `tun0 DOWN` después de reboot | "WG mal configurado" | `always_on_vpn_app` no está, o app necesita toggle manual |
| Microcortes en stream | "DNS roto" | Casi siempre: WG handshake stale, SurfShark down, o cache stale |
| Tráfico va directo al proveedor (no NGINX) | "DNS hijack falló" | DNS resolvió antes que WG subiera, ahora cacheado — FLUSH cache, no toques DNS |

### 4.2 Lectura correcta del config WG client
Si el config WG del Fire TV tiene `DNS = 10.200.0.1`:
- Android lo usa **solo** para queries non-DoT
- Si Private DNS strict (hostname) está activo, Android prioriza DoT a `dns.google` — **el `10.200.0.1` queda inerte**
- Esto es **comportamiento Android documentado**, no un bug
- Para forzar uso de Unbound: la única vía limpia es `private_dns_mode = off`/`opportunistic` **persistido vía UI Settings del Fire TV** (no `settings put`)

---

## 5. WORKFLOW DE DIAGNÓSTICO IPTV/DNS (5 FASES)

Cada fase **completa** antes de avanzar a la siguiente. Si una fase no concluye con evidencia, retrocede.

### FASE 1 · Baseline read-only (sin cambios)
```bash
# 1.1 Estado WG en VPS
wg show wg0 | grep -A4 "10.200.0.3"  # handshake age?
# 1.2 Estado WG en Fire TV
adb -s 192.168.1.5:5555 shell "ip addr show tun0 | grep inet"
# 1.3 Settings actuales (NO cambiar)
adb -s 192.168.1.5:5555 shell "settings get global private_dns_mode; settings get global private_dns_specifier; settings get secure always_on_vpn_app"
# 1.4 Routing
adb -s 192.168.1.5:5555 shell "ip route get 1.1.1.1; ip rule show"
# 1.5 Logs históricos (¿esto funcionaba antes?)
ssh root@VPS "tail -1000 /var/log/nginx/shield_access.log | grep '10.200.0.3' | tail -10"
```

### FASE 2 · Hipótesis única
Formula UNA hipótesis específica:
- ❌ "Algo del DNS está roto"
- ✅ "El WG handshake del peer 10.200.0.3 está stale (Xh) — no se renueva porque [causa]"

Si tu hipótesis menciona DNS sin evidencia directa de query DNS fallida → STOP y vuelve a Fase 1.

### FASE 3 · Test mínimo NO destructivo
- Si la hipótesis es WG: `wg set wg0 peer ... persistent-keepalive 15` (no destructivo)
- Si la hipótesis es DNS: `dig @10.200.0.1 nfqdeuxu.x1megaott.online` (read-only)
- **NUNCA** apliques settings en Fire TV o iptables en VPS aquí

### FASE 4 · Authorization gate
Antes de modificar producción:
- [ ] Imprime el comando exacto que vas a ejecutar
- [ ] Imprime el rollback exacto
- [ ] **Espera autorización explícita del user con verbo imperativo** ("Aplica", "Hazlo", "SIGUE")
- [ ] "OK", "ya entiendo", "claro" NO son autorización

### FASE 5 · Verificación post-cambio
- [ ] Test que el síntoma original esté resuelto
- [ ] Test que **internet base sigue funcionando** (`ping 8.8.8.8` y `ping google.com` desde Fire TV)
- [ ] Test que NGINX intercept logs aumenten (si aplica)
- [ ] Si algún test falla, **rollback inmediato** (no "una corrección más")

---

## 6. SEÑALES DE ALARMA (RED FLAGS)

Si te ves pensando alguna de estas, **STOP** y relee este SOP:

| Pensamiento | Realidad |
|---|---|
| "Veo dns.google en dumpsys, eso es un DNS leak" | Es el default Fire OS |
| "Voy a desactivar Private DNS para que use Unbound" | Fire OS lo reaplica en segundos |
| "Solo voy a agregar una regla iptables al VPS, es pequeña" | Persiste en producción y rompe shielding |
| "Configuro auto-connect Y arreglo el DNS leak" | Bundling — el user solo pidió uno |
| "El private_dns_mode se está reseteando, lo aplico otra vez" | Phase 4.5: 3+ fixes fallaron, problema arquitectónico |
| "Voy a quitar always_on_vpn para recuperar internet" | Probablemente TÚ lo pusiste, ahora rompiste también la persistencia |
| "ndc resolver clear me solucionará la cache" | Estás tocando estado interno de Android, escala el problema |
| "Reinicio el Fire TV para limpiar el state" | El user pierde la TV durante 60-90s — solo si autoriza |
| "El user dijo OK, voy a hacer 5 cambios más" | OK no es autorización para 5 cambios |

---

## 7. DEPENDENCIAS Y CROSS-LINKS

Este SOP **complementa**, no reemplaza:

- `.agent/skills/adb_master_directives_rule/SKILL.md` — SSOT de directivas ADB (incluye DNS Hardening como estado deseado)
- `.agent/skills/iptv-vps-touch-nothing/` — prohibición de tocar VPS sin orden
- `.agent/skills/iptv-pre-edit-audit/` — auditoría antes de cualquier edit
- `.agent/skills/iptv-cortex-init-mandatory/` — init scan obligatorio al inicio
- `.agent/rules/rule_no_unsolicited_network_changes.md` — regla hard que enforza este SOP
- `.agent/workflows/firetv-dns-troubleshooting-protocol.md` — workflow detallado paso a paso

Si este SOP entra en conflicto con `adb-master-directives-rule` (que documenta `private_dns_mode hostname` como hardening): **la regla directiva tiene precedencia**, este SOP solo prohíbe el cambio sin autorización.

---

## 8. INCIDENT RECOVERY (si ya rompiste algo)

Si descubres que ya aplicaste cambios sin autorización:

### 8.1 Confesión inmediata al user
```
He aplicado los siguientes cambios sin autorización explícita:
1. [comando exacto]
2. [comando exacto]
Rollback disponible:
1. [comando rollback]
2. [comando rollback]
¿Procedo con rollback?
```

### 8.2 NO intentes "arreglar" sobre el cambio
Cada layer de fix sobre fix dificulta el rollback. Detén todo, ofrece rollback, espera orden.

### 8.3 Documenta para memoria
Después del rollback exitoso, propón una memoria `feedback_*.md` documentando el incidente para que futuros agentes no repitan.

---

## 9. AUTHORIZATION VOCABULARY

### 9.1 Verbos que SÍ autorizan acción concreta
- "Aplica" / "Hazlo" / "SIGUE" / "Continue" / "Procede"
- Cuando van en oración imperativa específica

### 9.2 Verbos que NO autorizan acción
- "Planeamos" / "diseñamos" / "veamos cómo" / "entiendo" / "OK"
- Estas son fases de planificación — solo planifica, no ejecutes

### 9.3 Scope de la autorización
"Hazlo" autoriza **lo último propuesto explícitamente**. NO autoriza:
- Tareas similares no nombradas
- Optimizaciones "mientras estás ahí"
- Cambios de scope ("ya que estoy, también...")

---

## 10. QUOTE OF SHAME (no olvidar)

Del transcript del incidente:

> Línea 462: "**🔴 DNS LEAK a Google**"
> Línea 1107 (mismo agente, 645 líneas después): "**`dns.google` que vi era solo el fallback de Android cuando WG no estaba activo**"
> Línea 872: "El problema es que **desactivé el Private DNS**. Lo restauro inmediatamente"
> Línea 1879 (otra vez): "**El problema:** `private_dns_mode` volvió a `hostname` (dns.google). Eso rompe el DNS"

El mismo agente, mismo transcript, contradijo su propio diagnóstico inicial — y aun así siguió tocando settings durante 1300 líneas más.

**No seas ese agente.**
