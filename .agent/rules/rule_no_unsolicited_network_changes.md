---
name: "Regla Absoluta — No Cambios Network Sin Autorización"
description: "Ley arquitectónica que prohíbe modificaciones no solicitadas a settings DNS del Fire TV/Android, iptables del VPS, always_on_vpn y reglas WireGuard. Refuerza el SOP firetv-dns-no-scope-creep-sop. Aplica cada vez que se considere tocar Private DNS, DoT, dns.google, private_dns_mode, iptables NAT 53, always_on_vpn_app, lockdown VPN o config WG."
---

# LEY: NO TOCAR NETWORK SIN AUTORIZACIÓN EXPLÍCITA

**SEVERIDAD: NUCLEAR · NO NEGOCIABLE**

Esta regla existe porque una sesión documentada (`Forensic Optimization Of SHIELDED Pipeline.md`, ~2400 líneas) destruyó el internet del Fire TV con 12+ cambios no solicitados. Sin esta regla, la falla se repetirá.

## MANDATO 1 — Settings DNS del cliente
**Prohibido sin autorización imperativa explícita ("Aplica", "Hazlo", "SIGUE") en el turn actual:**
- `settings put global private_dns_mode <X>`
- `settings put global private_dns_specifier <X>`
- `settings put global private_dns_default_mode <X>`

**Razón:** El default de Amazon Fire OS (`hostname/dns.google`) es **estado deseado documentado** en el skill `adb-master-directives-rule` sección 1.2. NO ES UN BUG. Llamarlo "DNS leak" es diagnóstico falso. Los cambios via `settings put` son volátiles — el OS los reaplica en segundos. La única persistencia real es vía UI Settings del Fire TV.

## MANDATO 2 — iptables del VPS
**Prohibido sin autorización imperativa explícita:**
- `iptables -A` / `-I` / `-D` en chains FORWARD, INPUT, OUTPUT, PREROUTING, POSTROUTING
- `iptables-save > /etc/iptables/rules.v4` (persistir)
- Modificar `/etc/iptables/rules.v4` directamente
- Crear/modificar chains custom (excepto `SURFSHARK_MARK` que es producción intacta)

**Razón:** El VPS es producción del SHIELDED. Reglas persistidas sobreviven reboot y afectan a todos los peers WG presentes y futuros. Una sola regla mal puesta puede:
- Romper el shielding (REJECT 853 → "Private DNS is broken" → DNS muerto)
- Romper internet base (DNAT mal scoped)
- Saturar el log con UFW BLOCKs

## MANDATO 3 — VPN auto-start del Fire TV
**Prohibido sin autorización imperativa explícita:**
- `settings put secure always_on_vpn_app <X>`
- `settings put secure always_on_vpn_lockdown <X>`
- `settings put secure always_on_vpn_lockdown_whitelist <X>`

**Razón:**
- `always_on_vpn_app` con WG sin tunnel válido en boot → bloquea internet base
- `always_on_vpn_lockdown=1` → bloquea TODO si VPN cae
- Cuando el agente lo pone, luego tiene que quitarlo, y el ciclo destruye la persistencia diseñada

## MANDATO 4 — Bundling prohibido
**Pegar tareas no solicitadas a una solicitud del user es violación inmediata.**

Ejemplo violatorio (línea 492 del forensic):
> User: "puedes por ADB configurarlo para que se conecte automaticamente?"
> Agente: "Primero verifico que ya está conectado, luego configuro auto-connect **+ arreglo el DNS leak**"

El user pidió UNA cosa. El agente añadió UNA SEGUNDA NO SOLICITADA. Violación.

**Regla:** Ejecuta SOLO lo pedido. Si detectas algo más que parece un problema, **propónlo separadamente y espera autorización explícita** antes de actuar.

## MANDATO 5 — Phase 4.5 stop after 3 fails
Si tu cambio falló 3 veces y el síntoma persiste:
- **STOP**
- NO intentes el cuarto cambio
- Reporta al user: "He intentado X 3 veces sin éxito. Esto es señal de problema arquitectónico. Recomiendo replantear desde cero."
- Espera orden

El forensic muestra el agente intentó `private_dns_mode off → hostname → opportunistic → off → opportunistic → off → ...` 5+ veces sin parar. **Esto es lo opuesto a este mandato.**

## MANDATO 6 — Authorization vocabulary

### Verbos que SÍ autorizan acción concreta:
- "Aplica" / "Hazlo" / "SIGUE" / "Continue" / "Procede"
- En oración imperativa específica

### Verbos que NO autorizan acción:
- "Planeamos" / "diseñamos" / "veamos cómo" / "entiendo" / "OK" / "claro"
- "Si funciona, hazlo" (condicional, no imperativo)

### Scope de la autorización:
"Hazlo" autoriza **únicamente lo último propuesto explícitamente**. NO autoriza:
- Tareas similares no nombradas
- "Optimizaciones mientras estoy ahí"
- Cambios de scope ("ya que estoy, también...")

## PENALIZACIÓN POR VIOLACIÓN

Si descubres que has violado esta regla:

1. **Detén toda otra acción inmediatamente**
2. **Confiesa al user**:
   ```
   He aplicado los siguientes cambios sin autorización:
   1. [comando exacto]
   2. [comando exacto]
   Rollback disponible:
   1. [comando rollback]
   2. [comando rollback]
   ¿Procedo con rollback?
   ```
3. **Espera autorización** para rollback
4. **Crea memory entry** `feedback_*.md` documentando el incidente
5. **NO intentes "arreglar" sobre el cambio violatorio** — cada layer de fix dificulta el rollback

## CROSS-REFERENCES

- `.agent/skills/firetv_dns_no_scope_creep_sop/SKILL.md` — SOP completo con checklist + workflow
- `.agent/skills/adb_master_directives_rule/SKILL.md` — SSOT de directivas ADB (incluye DNS Hardening como estado deseado)
- `.agent/skills/iptv-vps-touch-nothing/` — regla paralela del VPS
- `.agent/workflows/firetv-dns-troubleshooting-protocol.md` — workflow paso a paso
- Memory `feedback_dns_scope_creep_incident.md` — incidente histórico

## QUOTE OF SHAME (no olvidar)

> "El problema es que **desactivé el Private DNS**. Lo restauro inmediatamente a como estaba" — agente confesando, línea 872 del forensic, después de haber roto internet del Fire TV.

> "**¡ENCONTRADO!** `private_dns_mode = hostname` con `dns.google`" — el mismo agente, línea 1817, "redescubriendo" el supuesto problema 945 líneas después de haber confesado que NO era un problema.

**No seas ese agente.**
