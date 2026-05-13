---
name: "shielded-architecture-immutable"
description: "Skill inmutable que documenta la arquitectura SHIELDED del ecosistema IPTV. SHIELDED = sufijo de nombre de archivo (_SHIELDED.m3u8), NUNCA transformación de URLs internas. El WireGuard tunnel + DNS hijack hace el trabajo real. PROHIBIDO modificar URLs de canales en el generador JS."
---

# SHIELDED Architecture — Immutable Skill

## Cuándo se activa

Esta skill se activa **OBLIGATORIAMENTE** cuando:

1. Se menciona "shielded", "shield", "URL shielded", "salida shielded"
2. Se pide modificar URLs de canales en el generador M3U8
3. Se discute por qué las URLs internas son directas (no tienen `/shield/`)
4. Se diagnostican freezes y alguien sugiere "envolver URLs con /shield/"
5. Se menciona `gateway-manager.js`, `shieldedMode`, o el toggle de salida shielded
6. Se modifica cualquier archivo JS que genera o emite URLs de canales

## Invariante ABSOLUTO

```
LAS URLs INTERNAS DE CANALES EN UN M3U8 SON DIRECTAS AL PROVEEDOR.
NUNCA SE TRANSFORMAN. NUNCA SE ENVUELVEN CON /shield/.
EL SHIELDING LO HACE EL WIREGUARD TUNNEL, NO LA URL.
```

## Anatomía del sistema

### Capa 1: Nombre de archivo (Gateway Manager)
```javascript
// gateway-manager.js, línea ~736-740
const shieldedEnabled = !!document.getElementById('shieldedMode')?.checked;
if (shieldedEnabled) {
    finalFilename = finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8');
}
```
**Esto es TODO** lo que hace el "shielded" a nivel de código JS.

### Capa 2: WireGuard Tunnel (Red)
```
Player → WireGuard VPN (10.200.0.3 → 10.200.0.1) → VPS
```
El player tiene WireGuard como VPN. Todo su tráfico HTTP pasa por el VPS.

### Capa 3: DNS Hijack (Unbound)
```
nfqdeuxu.x1megaott.online → 127.0.0.1
tivigo.cc → 127.0.0.1 (vía 302 → zivovrix.cc/rynivorn.cc)
line.tivi-ott.net → 127.0.0.1
```
Cuando el player pide `http://proveedor.com/live/...`, el DNS del VPS resuelve a localhost.

### Capa 4: NGINX Intercept
```
NGINX recibe el request en 127.0.0.1 → proxy_pass al upstream real vía SurfShark
```
Aplica: BBR, cache stale, UA rotation, DSCP QoS, failover automático.

### Resultado
```
URL en el M3U8:  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
                 ↓
Player pide:     http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
                 ↓ (WireGuard tunnel)
VPS DNS:         nfqdeuxu.x1megaott.online → 127.0.0.1
                 ↓
NGINX:           proxy_pass → upstream real (154.6.41.6, etc.)
                 ↓ (SurfShark VPN)
Proveedor:       Responde al VPS, VPS reenvía al player via WireGuard
```

## Prohibiciones

| # | Prohibición | Razón |
|---|---|---|
| P1 | NUNCA agregar `/shield/{hash}/` a URLs internas | El tunnel ya captura el tráfico |
| P2 | NUNCA modificar `generateChannelEntry()` para shielding | Las URLs deben ser directas |
| P3 | NUNCA modificar `buildChannelUrl()` para shielding | Causa double-routing |
| P4 | NUNCA modificar `buildUniversalUrl()` para shielding | Rompe la resolución DNS |
| P5 | NUNCA crear "shield URL wrapper" en el generador | El gateway solo renombra el archivo |

## Archivos protegidos (NO TOCAR para shielding)

```
frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js         → PROHIBIDO
frontend/js/ape-v9/m3u8-typed-arrays-ultimate.pre-admission.js → PROHIBIDO
```

## Archivo correcto para shielding

```
frontend/js/gateway-manager.js  → SOLO renombra filename a _SHIELDED.m3u8
```

## Diagnóstico de freezes

Si hay freezes con una lista SHIELDED:
1. ❌ NO es porque las URLs internas "no pasan por shield"
2. ✅ Verificar que WireGuard está activo: `wg show`
3. ✅ Verificar DNS hijack: `dig @127.0.0.1 nfqdeuxu.x1megaott.online`
4. ✅ Verificar NGINX logs: `tail /var/log/nginx/shield_access.log`
5. ✅ Verificar buffer del player (telemetría PRISMA)
6. ✅ Verificar que SurfShark tunnel está UP

## Evidencia empírica (2026-04-28)

Lista `APE_LISTA_1777243113563_SHIELDED.m3u8`:
- 15,444 URLs internas → TODAS directas
- 0 URLs con `/shield/`
- 3 hosts: x1megaott (5,781), tivigo (4,951), tivi-ott (4,712)
- **Funciona correctamente** via WireGuard tunnel

## Aclaración crítica — el sufijo NO es cosmético

El sufijo `_SHIELDED.m3u8` dispara **3 efectos funcionales** en el pipeline (no es decorativo):

1. **Renombra el filename** del archivo generado por el toggle (`gateway-manager.js` ~L738).
2. **Determina la URL pública** que el player consume (construcción específica VPS, distinta de listas no-shielded).
3. **Mete al archivo entero por el VPS desde el primer byte** — el player descarga el `.m3u8` desde el VPS, no del proveedor directo.

Las URLs **internas de canales** son VERBATIM directas al proveedor — esa parte es la que NUNCA se transforma. Confundir las dos capas (sufijo funcional vs URLs internas VERBATIM) lleva a violaciones de doctrina.

## Documentos hermanos (triangulación cross-agent)

**4 documentos doctrinales (skills + memoria):**
- `SKILL.md` (este archivo) → doctrina + invariantes (qué y por qué). Audiencia: Claude Code skill.
- [`WORKFLOW_BLOQUEANTE.md`](./WORKFLOW_BLOQUEANTE.md) → gate operacional ejecutable con verificaciones bash. Audiencia: cross-agent.
- [`VPS_SHIELDED_MODULES.md`](./VPS_SHIELDED_MODULES.md) → inventario completo de TODOS los módulos VPS que tratan la URL SHIELDED (qué hace cada uno, cómo, archivos que lo conforman). Verificado producción 2026-04-28.
- `../../.gemini/settings/shielded-sop.md` → SOP cardinal. Audiencia: Gemini CLI.

**5 documentos forenses (autoritativos para profundidad):**
- [sop-shielded-architecture-complete.md](../../../.agent/workflows/sop-shielded-architecture-complete.md) — SOP unificado ("el único documento que necesitas leer")
- [sop-shielded-forensic-part1-doctrine.md](../../../.agent/workflows/sop-shielded-forensic-part1-doctrine.md) — 12 prohibiciones + pipeline 11 pasos
- [sop-shielded-forensic-part2-nginx-lua.md](../../../.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md) — NGINX + 6 hooks Lua con código
- [sop-shielded-forensic-part3-prisma-kernel.md](../../../.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md) — PRISMA + PHP + Kernel sysctl + Systemd
- [sop-shielded-forensic-part4-operations.md](../../../.agent/workflows/sop-shielded-forensic-part4-operations.md) — Diagnóstico + invariantes + conteo

**1 snapshot código real:**
- [vps-live-snapshot-20260428/](../../../IPTV_v5.4_MAX_AGGRESSION/vps/vps-live-snapshot-20260428/) — 38 archivos × 256 KB

Los 10 documentos son **sincrónicos**. Si uno se modifica, los otros DEBEN actualizarse en el mismo commit. Drift entre ellos → riesgo de violación de la doctrina por agentes desincronizados.
