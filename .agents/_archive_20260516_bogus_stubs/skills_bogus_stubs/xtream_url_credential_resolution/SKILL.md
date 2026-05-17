---
description: Xtream Codes URL Construction & Multi-Layer Credential Resolution for M3U8 Generation
---

# Skill: Xtream URL Construction & Credential Resolution

## Objetivo
Construir URLs Xtream Codes válidas (`http://host:port/live/user/pass/stream_id.m3u8`) para TODOS los canales durante la generación M3U8, resolviendo credenciales desde múltiples fuentes independientes.

## Arquitectura de Datos

### Servidor (`window.app.state.activeServers[n]`)
```javascript
{
    id: "srv_1234567890",
    name: "TIVISION",
    baseUrl: "http://line.tivi-ott.net:8080/player_api.php", // ⚠️ CON /player_api.php
    username: "user123",
    password: "pass456"
}
```
> **CRÍTICO**: `baseUrl` incluye `/player_api.php`. SIEMPRE limpiar con `.replace(/\/player_api\.php.*$/, '')` antes de construir URL de streaming.

### Canal (`window.app.state.channelsMaster[n]`)
Estructura de 4 capas creada por `normalizeChannel()` en `app.js:6512`:
```javascript
{
    serverId: "srv_1234567890",      // L6543 — SIEMPRE presente
    stream_id: 12,                    // L6546 — del Xtream API (PUEDE SER 0 → falsy!)
    id: "12",                         // L6545 — get("id") || raw.stream_id || String(index)
    name: "|AL| KLAN K FHD",
    url: "",                          // L6587 — get("url") → VACÍO para Xtream (no hay URL directa)
    base: { raw: { ...rawXtreamData } },
    raw: { ...rawXtreamData,          // L6613-6618 — spread completo del JSON Xtream
        server_url: "line.tivi-ott.net",  // L5061 — serverInfo.url (solo hostname sin http://)
        server_port: "8080"               // L5062 — serverInfo.port
    }
}
```

### URL Objetivo
```
http://{server_url}:{port}/live/{username}/{password}/{stream_id}.m3u8
```
Ejemplo: `http://line.tivi-ott.net:8080/live/user123/pass456/12.m3u8`

## Pipeline de Resolución (5 Capas)

### Capa 1: `buildCredentialsMap(options)` — Pre-built Map
Archivo: `m3u8-typed-arrays-ultimate.js` función `buildCredentialsMap`

Lee de 4 fuentes en cascada:
1. `options._activeServers` (inyectado por caller)
2. `window.app.state.activeServers` (estado global)
3. `localStorage` keys: `iptv_server_library`, `iptv_connected_servers`, `iptv_active_servers`, `ape_saved_servers`
4. **Nuclear scan**: ALL localStorage keys buscando objetos con `username`+`password`

Índices del mapa: `map[serverId]`, `map["host:hostname"]`, `map["name:servername"]`, `map["__current__"]`

### Capa 2: Direct Lookup en `buildChannelUrl`
Si `credentialsMap` está vacío:
```javascript
window.app.state.activeServers.find(s => s.id === channel.serverId)
```
Fallback por hostname match, luego `servers[0]`.

### Capa 3: Channel Raw Data
Reconstruir desde `channel.raw.server_url` + `channel.raw.server_port` + credenciales de cualquier servidor disponible.

### Capa 4: LAST RESORT en `generateChannelEntry`
Segundo intento directo con `window.app.state.activeServers` + `currentServer`.

### Capa 5: Emergency Fallback
Si TODO falla: `http://{server_url}:{port}/live/CRED_MISSING/CRED_MISSING/{stream_id}.m3u8` — para diagnóstico visual.

## Trampas Conocidas (Gotchas)

### 1. `stream_id = 0` es Falsy
```javascript
// ❌ MAL: 0 || '' evalúa a ''
const sid = channel.stream_id || '';

// ✅ BIEN: 0 != null evalúa a true
let sid = channel.stream_id;
if (sid == null) sid = channel.raw?.stream_id;
```

### 2. `channel.url` está VACÍO para canales Xtream
El Xtream API `get_live_streams` NO devuelve URL directa. `normalizeChannel` L6587: `url: get("url") || ""` → vacío. La URL debe ser CONSTRUIDA.

### 3. `server.baseUrl` incluye `/player_api.php`
`app.js:4774`: `baseUrl: endpoint` donde `endpoint = baseHost + "/player_api.php"`. SIEMPRE limpiar antes de construir URL de streaming.

### 4. `raw.server_url` es solo hostname
`app.js:5061`: `server_url: serverInfo.url || ''` → `"line.tivi-ott.net"` (sin `http://`, sin puerto). Reconstruir: `http://${server_url}:${server_port}`.

### 5. `buildCredentialsMap` puede fallar silenciosamente
Si `window.app.state.activeServers` está vacío o inaccesible desde el IIFE del generador, las 4 fuentes del mapa devuelven vacío. Por eso se necesitan las capas 2-5 de resolución directa.

## Flujo de Generación M3U8

```
app.generateM3U8_TypedArrays()
  └─ M3U8TypedArraysGenerator.generateAndDownload(channels, options)
       └─ generateM3U8Stream(channels, options)
            ├─ credentialsMap = buildCredentialsMap(options)  ← CAPA 1
            └─ for each channel:
                 └─ generateChannelEntry(channel, index, profile, credentialsMap)
                      ├─ buildChannelUrl(channel, ..., credentialsMap)
                      │    ├─ Check channel.url for existing /live/ URL  ← SHORT CIRCUIT
                      │    ├─ CAPA 1: credentialsMap lookup by serverId/host
                      │    ├─ CAPA 2: Direct window.app.state.activeServers
                      │    └─ CAPA 3: channel.raw.server_url + port
                      └─ If still empty:
                           ├─ CAPA 4: LAST RESORT direct lookup
                           └─ CAPA 5: EMERGENCY CRED_MISSING fallback
```

## Archivos Clave

| Archivo | Función | Responsabilidad |
|---------|---------|----------------|
| `app.js:4740` | `connectToXtream` | Crea servidor con `baseUrl`, `username`, `password` |
| `app.js:4951` | `connectXuiApi` | Fetch Xtream API `get_live_streams`, retorna raw channels |
| `app.js:5055` | `channelsWithFormats` | Spread `...ch` + `server_url`, `server_port` |
| `app.js:6512` | `normalizeChannel` | 4-layer normalization, preserva `stream_id` (L6546) |
| `m3u8-typed-arrays-ultimate.js` | `buildCredentialsMap` | Mapa de credenciales multi-fuente |
| `m3u8-typed-arrays-ultimate.js` | `buildChannelUrl` | Construcción de URL con 3 capas de resolución |
| `m3u8-typed-arrays-ultimate.js` | `generateChannelEntry` | Genera bloque M3U8 per-channel con 2 capas adicionales |

## Diagnóstico

Buscar en consola del navegador durante generación:
- `🔑 [buildCredentialsMap v10.3]` — fuentes encontradas
- `🔬 FIRST SERVER KEYS:` — estructura real del servidor
- `🔑 [DIRECT-RESOLVE]` — Capa 2 activada
- `🔑 [CHANNEL-DATA]` — Capa 3 activada
- `🔴🔴🔴 [DIAGNOSTIC]` — Dump completo de canal + estado cuando TODO falla
- `⚠️ [LAST-RESORT]` — Capa 4 activada
- `🟡 [EMERGENCY]` — Capa 5 con `CRED_MISSING`
