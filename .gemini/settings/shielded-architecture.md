# REGLA ABSOLUTA: Arquitectura SHIELDED — NUNCA Tocar URLs Internas

> **Versión:** 1.0 — 2026-04-28
> **Estado:** INMUTABLE — PROHIBIDO VIOLAR

## Qué es SHIELDED

SHIELDED es un **sufijo de nombre de archivo** (`_SHIELDED.m3u8`), NO una transformación de URLs internas.

## Cómo funciona

```
Player (OTT Navigator / Fire TV / Shield TV)
  │
  └─ WireGuard VPN (10.200.0.3 → 10.200.0.1)
       │
       │  El player pide: http://proveedor.com/live/user/pass/123.m3u8
       │  Pero TODO su tráfico va por el tunnel WireGuard
       │
       └─ VPS (178.156.147.234)
            │
            ├─ Unbound DNS hijack: proveedor.com → 127.0.0.1
            ├─ NGINX intercepta → proxy_pass al upstream real
            │     ├─ BBR congestion control
            │     ├─ Cache stale (20s manifests)
            │     ├─ UA rotation (Silk browser)
            │     ├─ DSCP 0x2e (EF priority)
            │     └─ Failover automático
            └─ SurfShark VPN → Proveedor IPTV real
```

## Reglas NO NEGOCIABLES

### 1. NUNCA modificar URLs internas de canales

Las URLs dentro del M3U8 son y DEBEN SER directas al proveedor:
```
http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
http://tivigo.cc/live/USER/PASS/456.m3u8
http://line.tivi-ott.net/live/USER/PASS/789.m3u8
```

**PROHIBIDO** transformarlas a:
```
❌ https://iptv-ape.duckdns.org/shield/{hash}/nfqdeuxu.x1megaott.online/live/...
```

### 2. NUNCA tocar el generador JS para "shieldear" URLs

El archivo `m3u8-typed-arrays-ultimate.js` genera URLs directas al proveedor.
**PROHIBIDO** agregar lógica de wrapping `/shield/` en:
- `generateChannelEntry()`
- `buildChannelUrl()`
- `buildUniversalUrl()`
- Cualquier función que emita URLs de canales

### 3. El shielding se hace SOLO por nombre de archivo

El **ÚNICO** lugar donde se aplica el concepto "SHIELDED" es en `gateway-manager.js`:
- Línea ~736: lee `document.getElementById('shieldedMode')?.checked`
- Línea ~738: renombra `.m3u8` → `_SHIELDED.m3u8`
- El archivo se sube al VPS con ese nombre
- El VPS sirve desde: `https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8`

### 4. El WireGuard tunnel hace el trabajo real

El player tiene WireGuard configurado como VPN. Todo su tráfico HTTP pasa por el VPS.
El VPS tiene DNS hijack (Unbound) que intercepta los dominios de proveedores.
NGINX procesa los requests con BBR, cache, UA rotation, DSCP QoS.
**Las URLs directas funcionan PORQUE el tunnel las captura.**

## Archivos que NO se tocan para shielding

| Archivo | Qué hace | ¿Tocar para shield? |
|---|---|---|
| `m3u8-typed-arrays-ultimate.js` | Genera URLs directas al proveedor | ❌ NUNCA |
| `m3u8-typed-arrays-ultimate.pre-admission.js` | Versión pre-release del generador | ❌ NUNCA |
| `buildChannelUrl()` | Construye URL Xtream Codes | ❌ NUNCA |
| `buildUniversalUrl()` | Constructor USA universal | ❌ NUNCA |
| `generateChannelEntry()` | Emite líneas M3U8 por canal | ❌ NUNCA |

## Archivo que SÍ maneja shielding

| Archivo | Qué hace | ¿Tocar para shield? |
|---|---|---|
| `gateway-manager.js` | Renombra archivo a `_SHIELDED.m3u8` pre-upload | ✅ SÍ (solo nombre) |

## Evidencia empírica

La lista `APE_LISTA_1777243113563_SHIELDED.m3u8`:
- **15,444 URLs internas** → TODAS directas (`http://proveedor/live/...`)
- **0 URLs con `/shield/`**
- **Funciona perfectamente** porque el WireGuard tunnel intercepta todo

## Qué hacer si alguien pide "shieldear las URLs"

1. **NO** modificar el generador JS
2. **NO** agregar wrapping `/shield/{hash}/` a las URLs
3. **EXPLICAR** que el shielding lo hace el tunnel WireGuard, no la URL
4. **VERIFICAR** que `gateway-manager.js` renombra correctamente a `_SHIELDED.m3u8`
5. **VERIFICAR** que el WireGuard tunnel está activo y saludable
