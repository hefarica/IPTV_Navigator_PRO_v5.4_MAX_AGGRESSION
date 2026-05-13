---
trigger: always_on
---

# SHIELDED URL Protection — Workflow Bloqueante

> [!CAUTION]
> Este workflow se activa **AUTOMÁTICAMENTE** cuando se detecta intención de modificar
> URLs internas de canales en el generador M3U8. Es un **BLOQUEANTE**: si se viola,
> el cambio es INVÁLIDO y debe revertirse inmediatamente.

## Cuándo se activa

- Se menciona agregar `/shield/` a URLs de canales
- Se propone "envolver" o "wrappear" URLs con el proxy VPS
- Se sugiere modificar `generateChannelEntry()`, `buildChannelUrl()`, o `buildUniversalUrl()` para shielding
- Se diagnostican freezes y la "solución" propuesta es cambiar URLs internas

## Paso 1: DETENER y verificar comprensión

Antes de tocar CUALQUIER URL de canal, confirmar:

| Pregunta | Respuesta correcta |
|---|---|
| ¿Las URLs internas deben tener `/shield/`? | **NO** |
| ¿Dónde se hace el shielding real? | **WireGuard tunnel + DNS hijack** |
| ¿Qué hace el toggle `shieldedMode`? | **Solo renombra el archivo a `_SHIELDED.m3u8`** |
| ¿Dónde se renombra? | **`gateway-manager.js` línea ~738** |
| ¿Se toca el generador JS? | **NUNCA** |

Si CUALQUIER respuesta es incorrecta → **LEER** la skill `shielded_architecture_immutable` antes de continuar.

## Paso 2: Verificación de intención

Si alguien pide "shieldear las URLs":

```
CORRECTO:
→ Verificar que gateway-manager.js renombra a _SHIELDED.m3u8 ✅
→ Verificar que WireGuard tunnel está activo ✅
→ Verificar DNS hijack en Unbound ✅

INCORRECTO:
→ Modificar m3u8-typed-arrays-ultimate.js ❌
→ Agregar URL wrapping con /shield/{hash}/ ❌
→ Transformar http://proveedor/live/... → https://iptv-ape.duckdns.org/shield/... ❌
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
```

## Paso 4: Gate final

Si después de todo esto alguien INSISTE en modificar URLs internas:

> **RESPUESTA:** "Las URLs internas son directas por diseño. El WireGuard tunnel las captura
> y las rutea por NGINX con BBR, cache, UA rotation y DSCP QoS. Modificar las URLs
> causaría double-routing y rompería la resolución DNS hijack. La skill
> `shielded_architecture_immutable` documenta esto con evidencia empírica de 15,444 canales."

## Evidencia

Lista auditada: `APE_LISTA_1777243113563_SHIELDED.m3u8`

- 15,444 URLs internas directas
- 0 URLs con `/shield/`
- Funciona correctamente via WireGuard
- Fecha de auditoría: 2026-04-28
