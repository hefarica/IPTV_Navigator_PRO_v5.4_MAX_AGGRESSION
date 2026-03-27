---
name: auditoria_forense_pipeline_m3u8
description: "Auditoría forense completa del pipeline M3U8. Documenta TODOS los bugs encontrados y corregidos, la anatomía del pipeline, los puntos de fallo conocidos, y los procedimientos de diagnóstico. Referencia obligatoria antes de modificar cualquier archivo del pipeline de generación."
---

# 🔬 SKILL: Auditoría Forense del Pipeline M3U8

> **AUTORIDAD**: Este documento es el registro histórico y la guía de diagnóstico para el pipeline de generación M3U8.
> Antes de modificar cualquier archivo del pipeline, LEER ESTA SKILL completa.

---

## 1. Anatomía del Pipeline

```text
app.js: getFilteredChannels()
    ↓ 75,951 → 6,802 canales (filtros avanzados)
ape-module-manager.js: generateAndDownload()
    ↓ Inyecta _activeServers, _currentServer en options
generation-controller.js: executePipeline()
    ↓ Stamping: construye URLs Xtream en main thread (pre-worker)
    ↓ credMap por serverId → hostname → __current__ (sin sid)
m3u8-typed-arrays-ultimate.js: generateM3U8()
    ↓ Schema Gate: generation-validator-v9.js validateAndTranslate()
    ↓   → validateBatch() → sanitización, NO deduplicación
    ↓   → SchemaTranslator.translate() → normaliza + PRESERVA serverId/raw/stream_id
    ↓ generateM3U8Stream() → streaming generator
    ↓   → buildChannelUrl() v10.4 → credencial por serverId ESTRICTO
    ↓   → generateChannelEntry() → EXTINF + headers + VLC + KODI + APE + URL
    ↓ Blob → Download
```

---

## 2. Bugs Históricos Corregidos

### Bug #1: Schema Gate Deduplicación Masiva (Mar 25)
- **Síntoma**: 6799 de 6802 canales eliminados
- **Causa**: `validateBatch()` deduplicaba por `ch.id` (tvg-id como "ESPN.us") que colisiona entre servidores
- **Fix**: Eliminada deduplicación del Schema Gate. La app ya deduplica en save/load con key `serverId:stream_id`
- **Archivo**: `generation-validator-v9.js`
- **Contrato**: #5 (Schema Gate NO deduplica)

### Bug #2: URLs Placeholder (Mar 25)
- **Síntoma**: 100% URLs eran `http://placeholder.stream/N.m3u8`
- **Causa**: `buildChannelUrl()` no encontraba credenciales — `state.activeServers` tenía servidores pero sin `username`/`password` accesibles desde IIFE
- **Fix**: buildCredentialsMap v10.3 — resolución multi-fuente (injected, window.app.state, localStorage)
- **Archivo**: `m3u8-typed-arrays-ultimate.js`

### Bug #3: Single-Server Fallback (Mar 26)
- **Síntoma**: 100% URLs iban a `line.tivi-ott.net` (TIVISION) aunque hay 3 servidores
- **Causa Triple**:
  1. `SchemaTranslator.translate()` creaba objetos NUEVOS que **eliminaban** `serverId`, `raw`, `stream_id`, `server_url` → credential matching imposible
  2. `buildChannelUrl()` L3873-3875 tenía fallback `__current__` → `firstKey` → `servers[0]` que asignaba TODO al primer servidor
  3. `generation-controller.js` L340-343 tenía los mismos lazy fallbacks
- **Fix**:
  1. SchemaTranslator ahora preserva: `serverId`, `raw`, `stream_id`, `server_url`, `server_port`, `_source`, `id`, `direct_source`
  2. buildChannelUrl v10.4: matching estricto por serverId → hostname, `__current__` solo si canal no tiene serverId
  3. generation-controller: misma lógica estricta
- **Archivos**: `generation-validator-v9.js`, `m3u8-typed-arrays-ultimate.js`, `generation-controller.js`
- **Contrato**: #2 (Credential Isolation)

### Bug #4: WAF Blocking (Mar 23)
- **Síntoma**: Xtream Codes Nginx devolvía 400 Bad Request
- **Causa**: URLs contenían `?evasion_4xx=rotate_xff_ua_tunnel` y `cmaf>ts` (XSS pattern)
- **Fix**: Eliminados parámetros WAF-trigger de URLs directas. Cambiado `cmaf>ts` a `cmaf-to-ts`
- **Archivo**: `m3u8-typed-arrays-ultimate.js`

### Bug #5: VLC Tags Duplicados (Mar 22)
- **Síntoma**: 14 `#EXTVLCOPT` duplicados por canal (ej: 9× user-agent)
- **Causa**: Múltiples módulos inyectaban sin Rules Engine
- **Fix**: VLC_RULES deduplication (KEEP_HIGHEST, KEEP_LOWEST, KEEP_FIRST)
- **Archivo**: `generation-validator-v9.js`
- **Contrato**: #4

### Bug #6: cfg is not defined (Mar 23)
- **Síntoma**: IIFE crash silencioso, generador no cargaba
- **Causa**: `attrArr` block estaba fuera de `generateChannelEntry()` scope
- **Fix**: Movido dentro de la función
- **Archivo**: `m3u8-typed-arrays-ultimate.js`

### Bug #7: Audio Channel Misroute (Mar 22)
- **Síntoma**: Canales de audio con codec/bitrate incorrecto
- **Causa**: Profile inference no distinguía audio
- **Fix**: Detection heurística mejorada en `_inferProfile()`

---

## 3. Campos Críticos que NUNCA Deben Perderse

Estos campos DEBEN sobrevivir TODO el pipeline (normalizeChannel → Schema Gate → generateChannelEntry → URL):

| Campo | Fuente | Usado por | SI SE PIERDE |
| --- | --- | --- | --- |
| `serverId` | `normalizeChannel()` | `buildChannelUrl()` credential lookup | Todas las URLs van al primer servidor |
| `stream_id` | Xtream API response | `buildChannelUrl()` URL construction | URL sin stream_id → inválida |
| `raw` | Channel raw data | Hostname/port extraction for credential fallback | Credential fallback by hostname fails |
| `server_url` | Xtream API response | LAYER 4 hostname matching | Can't match channel to server |
| `server_port` | Xtream API response | Base URL construction | Wrong port in URL |
| `_source` | Various | Alternative serverId | Backup server identification |

> [!CAUTION]
> **SchemaTranslator.translate()** crea objetos NUEVOS. Si agregas un campo al channel en normalizeChannel(),
> DEBES también agregarlo al return del translate() en `generation-validator-v9.js` L137+.

---

## 4. Procedimiento de Diagnóstico

### Si URLs son bare hostname o placeholder:
1. Verificar consola: `buildCredentialsMap v10.x` — ¿cuántas credenciales encontró?
2. Si 0 credenciales → problema en inyección (ape-module-manager L717-724)
3. Si >0 pero URLs malas → credential lookup falla → verificar que `serverId` del canal matchea keys del map

### Si todas las URLs van a un solo servidor:
1. Verificar consola: `[SCHEMA GATE]` — ¿repaired count alto?
2. Si sí → SchemaTranslator puede estar eliminando `serverId`
3. Verificar `generation-validator-v9.js` L137+ que `serverId` esté en el return
4. Verificar `buildChannelUrl()` que NO tenga fallback `servers[0]` sin condición

### Si Schema Gate elimina canales:
1. Verificar conteo: input → output del Schema Gate log
2. Si output < input → verificar `validateBatch()` — ¿hay deduplicación?
3. Contrato #5: Schema Gate NUNCA deduplica

### Si lines/canal cambian drásticamente:
1. Verificar que todos los módulos (45+) estén cargados en index-v4.html
2. Verificar que no hay `<script>` faltantes o reordenados
3. Cada módulo aporta sus directivas — menos módulos = menos líneas

---

## 5. Archivos Protegidos

| Archivo | Rol | Última Fix | Contrato |
| --- | --- | --- | --- |
| `m3u8-typed-arrays-ultimate.js` | Motor principal | v10.4 strict matching | #2, #5, #7, #8 |
| `generation-validator-v9.js` | Schema Gate | v9.2 + translate passthrough | #4, #5, #8 |
| `generation-controller.js` | Orchestrator | strict credential stamping | #2 |
| `ape-module-manager.js` | Bridge frontend→generator | 3-server injection | #1, #2 |
| `app.js` | State management | normalizeChannel serverId | #1, #2 |

---

## 6. Resultado Actual (Post-Fix)

```
File (7) — 2026-03-26 01:20 COT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTINF: 6,802 | URLs: 6,802 | 1:1 ✅
/live/: 6,802 (100%) | Bare: 0 | CRED_MISSING: 0

SERVERS:
  TIVISION  (line.tivi-ott.net): 3,232 (47.5%)
  Dream4K   (nov202gg.xyz):      2,574 (37.8%)
  KEMOTV    (ky-tv.cc):            996 (14.6%)

Lines/ch: 683 | Headers/ch: 611
Score: 97.4/100 🏆
```
