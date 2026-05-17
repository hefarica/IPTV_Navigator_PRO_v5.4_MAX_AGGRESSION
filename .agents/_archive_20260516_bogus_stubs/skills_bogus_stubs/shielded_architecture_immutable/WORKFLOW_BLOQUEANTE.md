---
name: "shielded-url-protection-workflow"
description: "Gate bloqueante operacional. Se activa cuando se detecta intención de modificar URLs internas de canales. Es complemento ejecutable del invariante doctrinal en SKILL.md. Si se viola → cambio INVÁLIDO, revertir."
companion_to: "SKILL.md (shielded-architecture-immutable) y .gemini/settings/shielded-sop.md"
version: "1.0 — 2026-04-28"
---

# SHIELDED URL Protection — Workflow Bloqueante

> [!CAUTION]
> Este workflow se activa **AUTOMÁTICAMENTE** cuando se detecta intención de modificar
> URLs internas de canales en el generador M3U8. Es un **BLOQUEANTE**: si se viola,
> el cambio es INVÁLIDO y debe revertirse inmediatamente.

## Pipeline SHIELDED end-to-end (entender antes de tocar)

```
[1] Usuario marca toggle "Salida SHIELDED" en UI
        │  ON → const shieldedEnabled = true
        ▼
[2] Generador detecta flag → produce archivo con sufijo `_SHIELDED.m3u8`
        │  gateway-manager.js ~L736-740: filename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')
        ▼
[3] Compresión (gzip) del archivo antes de upload
        │
        ▼
[4] Generador de URLs construye la URL PÚBLICA del archivo .m3u8
        │  con construcción específica que enruta vía VPS proxy:
        │  https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8
        │
        ▼
[5] Esa URL es lo que el usuario comparte / pega en el player
        │
        ▼
[6] Player descarga el .m3u8 desde el VPS (NO directo del proveedor)
        │
        ▼
[7] Lee URLs de canales INTERNAS (VERBATIM directas al proveedor)
        │  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
        │
        ▼
[8] WG tunnel del player captura esas requests:
        │  Player (10.200.0.3) → WireGuard → VPS (10.200.0.1)
        │
        ▼
[9] VPS: Unbound DNS hijack resuelve dominios proveedor → 127.0.0.1
        │
        ▼
[10] NGINX intercepta → proxy_pass al upstream real:
        │  ├─ BBR congestion control
        │  ├─ Cache stale (20s manifests)
        │  ├─ UA rotation (Silk browser)
        │  ├─ DSCP 0x2e (EF priority)
        │  └─ Failover automático
        │
        ▼
[11] SurfShark VPN → Proveedor IPTV real
```

**Puntos críticos del pipeline:**

- El sufijo `_SHIELDED.m3u8` no es cosmético — dispara **3 efectos funcionales**:
  1. Renombra el filename del archivo generado.
  2. Determina la URL pública del archivo `.m3u8` con construcción específica VPS.
  3. Esa URL pública mete al archivo entero por el VPS desde el primer byte.
- Las URLs **dentro** del archivo son **VERBATIM directas al proveedor** y se quedan así. El WG tunnel del player captura esas requests automáticamente porque todo su tráfico pasa por el VPS.
- Confundir "el sufijo es funcional" con "hay que envolver las URLs internas" es la trampa que bloquea este workflow.

## Cuándo se activa

- Se menciona agregar `/shield/` a URLs **de canales** (líneas internas del M3U8)
- Se propone "envolver" o "wrappear" URLs de canales con el proxy VPS
- Se sugiere modificar `generateChannelEntry()`, `buildChannelUrl()`, o `buildUniversalUrl()` para shielding
- Se diagnostican freezes y la "solución" propuesta es cambiar URLs internas

## Paso 1: DETENER y verificar comprensión

Antes de tocar CUALQUIER URL de canal, confirmar:

| Pregunta | Respuesta correcta |
|---|---|
| ¿Las URLs internas de canales deben tener `/shield/`? | **NO** |
| ¿Dónde se hace el shielding del delivery? | **WireGuard tunnel + DNS hijack + NGINX** |
| ¿Qué hace el toggle `shieldedMode`? | **Renombra a `_SHIELDED.m3u8` Y dispara construcción de URL pública específica VPS** |
| ¿El sufijo `_SHIELDED` es cosmético? | **NO — es funcional, propaga 3 efectos** |
| ¿Dónde se renombra el filename? | **`gateway-manager.js` línea ~738** |
| ¿Se toca el generador JS para envolver URLs internas? | **NUNCA** |
| ¿Se toca el generador de URL pública del archivo? | **Solo si se cambia la lógica del toggle, no para envolver canales** |

Si CUALQUIER respuesta es incorrecta → **LEER** la skill `shielded_architecture_immutable/SKILL.md` antes de continuar.

## Paso 2: Verificación de intención

Si alguien pide "shieldear las URLs":

```
✅ CORRECTO (sufijo funcional, ya implementado):
→ Verificar que gateway-manager.js renombra a _SHIELDED.m3u8
→ Verificar que la URL pública del .m3u8 tiene construcción VPS específica
→ Verificar que WireGuard tunnel está activo
→ Verificar DNS hijack en Unbound

❌ INCORRECTO (envolver URLs internas — VIOLACIÓN):
→ Modificar m3u8-typed-arrays-ultimate.js
→ Agregar URL wrapping con /shield/{hash}/ a líneas de canales
→ Transformar http://proveedor/live/... → https://iptv-ape.duckdns.org/shield/...
```

## Paso 3: Si hay freezes en lista SHIELDED

Los freezes **NUNCA** se resuelven cambiando URLs internas. Diagnosticar:

```bash
# 1. ¿WireGuard activo?
ssh root@178.156.147.234 "wg show | head -10"

# 2. ¿DNS hijack funcionando?
ssh root@178.156.147.234 "dig @127.0.0.1 nfqdeuxu.x1megaott.online +short"

# 3. ¿NGINX procesando requests?
ssh root@178.156.147.234 "tail -5 /var/log/nginx/shield_access.log"

# 4. ¿Errores 503 propios?
ssh root@178.156.147.234 "grep ' 503 ' /var/log/nginx/shield_access.log | grep 'ut=-' | tail -5"

# 5. ¿Buffer del player saludable?
# Revisar telemetría PRISMA: buffer_health_pct debe ser >= 60%

# 6. ¿La URL pública del .m3u8 sigue siendo la versión SHIELDED?
curl -sI "https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8" | head -5

# 7. ¿El archivo en VPS sigue intacto post-upload?
ssh root@178.156.147.234 "ls -la /var/www/iptv-ape/lists/ | tail -5"
```

## Paso 4: Gate final

Si después de todo esto alguien INSISTE en modificar URLs internas:

> **RESPUESTA:** "El sufijo `_SHIELDED.m3u8` ya hace su trabajo: dispara la construcción de URL pública específica VPS, mete el archivo entero por el VPS desde el primer byte, y el WireGuard tunnel del player captura automáticamente las requests a las URLs internas (que son VERBATIM directas al proveedor por diseño). Modificar las URLs internas causaría double-routing y rompería la resolución DNS hijack. La skill `shielded_architecture_immutable` documenta esto con evidencia empírica de 15.444 canales."

## Evidencia

Lista auditada: `APE_LISTA_1777243113563_SHIELDED.m3u8`
- 15.444 URLs internas directas
- 0 URLs con `/shield/`
- Funciona correctamente via WireGuard
- Fecha de auditoría: 2026-04-28

Captura UI confirmada: toggle "Salida SHIELDED — Link vía proxy VPS (anti-403, anti-ban)" ON → genera `APE_LISTA_1777397735876_SHIELDED.m3u8`.

## Referencia forense profunda

Para auditoría con código real, configs verificadas en producción, métricas forenses y snapshot VPS:

- [sop-shielded-architecture-complete.md](../../../.agent/workflows/sop-shielded-architecture-complete.md) — SOP unificado
- [sop-shielded-forensic-part1-doctrine.md](../../../.agent/workflows/sop-shielded-forensic-part1-doctrine.md) — 12 prohibiciones + pipeline 11 pasos
- [sop-shielded-forensic-part2-nginx-lua.md](../../../.agent/workflows/sop-shielded-forensic-part2-nginx-lua.md) — NGINX + 6 hooks Lua con código
- [sop-shielded-forensic-part3-prisma-kernel.md](../../../.agent/workflows/sop-shielded-forensic-part3-prisma-kernel.md) — PRISMA + PHP + Kernel sysctl + Systemd
- [sop-shielded-forensic-part4-operations.md](../../../.agent/workflows/sop-shielded-forensic-part4-operations.md) — Diagnóstico + invariantes + conteo
- [vps-live-snapshot-20260428/](../../../IPTV_v5.4_MAX_AGGRESSION/vps/vps-live-snapshot-20260428/) — 38 archivos × 256 KB código fuente real

## Documentos hermanos (triangulación cross-agent)

- [`SKILL.md`](./SKILL.md) — Doctrina + invariantes (qué y por qué). Audiencia: Claude Code skill.
- `WORKFLOW_BLOQUEANTE.md` (este archivo) — Gate operacional ejecutable. Audiencia: cross-agent.
- [`VPS_SHIELDED_MODULES.md`](./VPS_SHIELDED_MODULES.md) — Inventario completo de TODOS los módulos VPS que tratan la URL SHIELDED. Audiencia: cross-agent + auditoría operacional.
- `../../.gemini/settings/shielded-sop.md` — SOP cardinal. Audiencia: Gemini CLI.

Los 10 documentos (4 doctrinales + 5 forenses + 1 snapshot) son **sincrónicos**. Si uno se modifica, los otros DEBEN actualizarse en el mismo commit. Drift entre ellos → riesgo de violación de la doctrina por agentes desincronizados.
