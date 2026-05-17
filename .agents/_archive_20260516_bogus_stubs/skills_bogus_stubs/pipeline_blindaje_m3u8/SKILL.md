---
name: Pipeline Blindaje M3U8 — Contratos No Negociables
description: Reglas absolutas de integridad para la generación M3U8. Cualquier modificación a generadores, validators, o post-processors DEBE respetar estos contratos o el cambio se considera REGRESIÓN.
---

# 🛡️ SKILL: Pipeline Blindaje M3U8 — Contratos No Negociables v9.2

> **AUTORIDAD**: Este documento tiene autoridad absoluta sobre cualquier generador M3U8.
> Cualquier implementación futura que viole estos contratos ES UN BUG, sin excepción.

> [!CAUTION]
> **Última actualización: 2026-03-25** — Se corrigieron bugs críticos de deduplicación y validación
> de URLs que eliminaban 6799 de 6802 canales. Los contratos 5, 8 y 9 son NUEVOS.

---

## 1. CONTRATO: Canal Source (getFilteredChannels)

### Regla Absoluta

**TODO generador DEBE obtener canales EXCLUSIVAMENTE de `getFilteredChannels()`**.

```javascript
// ✅ CORRECTO — único patrón aceptable
const channels = this.getFilteredChannels();
// o desde módulos externos:
const channels = window.app.getFilteredChannels();

// ❌ PROHIBIDO — NUNCA usar estos
const channels = this.state.channels;           // BUG: ignora filtros
const channels = this.state.channelsMaster;     // BUG: ignora filtros
const channels = this.state.filteredChannels;   // BUG: puede estar stale
```

### Generadores Protegidos

| Generador | Archivo | Función |
| --- | --- | --- |
| PRO Basic | `app.js` | `generateM3U8()` |
| PRO Advanced | `app.js` | `generateM3U8Pro()` |
| ULTIMATE | `app.js` | `generateM3U8Ultimate()` |
| ELITE | `m3u8-generator-v16-elite.js` | `generateAndDownload()` |
| Typed Arrays | `m3u8-typed-arrays-ultimate.js` | `integrateWithApp()` |

---

## 2. CONTRATO: Credential Isolation (Per-Channel ServerId)

### Regla Absoluta

**CADA canal DEBE resolver su servidor/credenciales via `serverId` lookup**.

```javascript
// ✅ PATRÓN CANÓNICO (de Typed Arrays buildChannelUrl L3737)
const channelServerId = ch._source || ch.serverId || ch.server_id;
let server = null;

// 1. Buscar por serverId del canal
if (channelServerId && state.activeServers) {
    server = state.activeServers.find(s => s.id === channelServerId);
}
// 2. Fallback: currentServer
if (!server && state.currentServer) server = state.currentServer;
// 3. Último recurso: primer servidor activo
if (!server && state.activeServers?.length > 0) server = state.activeServers[0];

// ❌ PROHIBIDO
const { username, password } = this.state.currentServer; // BUG: un solo servidor
const user = options.user; // BUG: credencial global
```

### ¿Por qué?

Con múltiples servidores conectados, `channelsMaster` contiene canales de TODOS los servidores. Si usas un único `currentServer` para todos, los canales del Servidor A recibirán credenciales del Servidor B → URLs rotas.

---

## 3. CONTRATO: Tag Order (EXTINF → EXTHTTP → EXTVLCOPT → KODIPROP → URL)

### Regla Absoluta

**El orden de las directivas M3U8 por canal DEBE ser:**

```text
#EXTINF:-1 tvg-id="..." ...,ChannelName    ← 1. SIEMPRE PRIMERO
#EXTHTTP:{"User-Agent":"..."}               ← 2. Headers JSON (opcional)
#EXTVLCOPT:http-user-agent=...              ← 3. VLC options
#EXTVLCOPT:http-reconnect=true              ← 3. (continúa)
#KODIPROP:inputstream.adaptive...           ← 4. Kodi properties
#EXT-X-APE-*                                ← 5. APE custom tags
http://server/live/user/pass/123.ts         ← 6. URL SIEMPRE AL FINAL
```

### ¿Por qué?

Los parsers de OTT Navigator y TiviMate asocian `#EXTVLCOPT` y `#EXTHTTP` al `#EXTINF` que los PRECEDE. Si las directivas aparecen antes del `#EXTINF`, se asocian al canal anterior.

---

## 4. CONTRATO: VLC Deduplication (1 Key = 1 Value)

### Regla Absoluta

**NUNCA emitir más de 1 `#EXTVLCOPT` con la misma clave por canal.**

```text
// ❌ PROHIBIDO — 9× user-agent
#EXTVLCOPT:http-user-agent=OTT Navigator/1.6.9.4
#EXTVLCOPT:http-user-agent=Mozilla/5.0 ...

// ✅ CORRECTO — 1 único
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
```

### Reglas KEEP del Rules Engine

- `http-user-agent` → **KEEP_FIRST** (la primera gana)
- `network-caching` → **KEEP_HIGHEST** (el valor más alto gana)
- `http-reconnect` → **KEEP_FIRST** (booleano, el primero gana)

---

## 5. CONTRATO: Schema Gate — SOLO Validación, CERO Deduplicación

### Regla Absoluta

**El Schema Gate (`generation-validator-v9.js` → `validateBatch()`) NUNCA debe deduplicar canales.**

```javascript
// ❌ PROHIBIDO en Schema Gate — causa pérdida masiva de canales
const seenUrls = new Set();
if (seenUrls.has(dedupeKey)) { continue; } // MATA 99.9% de canales

// ✅ CORRECTO — la deduplicación la hace app.js en save/load
// app.js L1335: _deduplicateChannels() usa key serverId:stream_id
// El Schema Gate SOLO valida estructura y sanitiza texto
```

> [!CAUTION]
> **BUG HISTÓRICO (2026-03-25):** El Schema Gate deduplicaba usando `ch.id` (tvg-id como "ESPN.us") que se repite
> entre 3 servidores. Con 11,104 canales sin `serverId` válido, el `serverKey` era `'default'` para todos,
> causando que `default_ESPN.us` colisionara across servers → **6799 de 6802 canales eliminados**.

### Qué DEBE hacer el Schema Gate

1. ✅ Validar estructura de objetos (`typeof ch === 'object'`)
2. ✅ Aceptar canales con `stream_id` aunque no tengan URL pre-construida
3. ✅ Sanitizar texto (Unicode peligroso: `┃│║` → `|`)
4. ✅ Normalizar perfiles P0-P5
5. ❌ **NUNCA** deduplicar (la app ya lo hace con key `serverId:stream_id`)

### Qué hace el Schema Gate (v9.2 actual)

1. **Object Validation**: Descarta `null`, `undefined`, no-objetos
2. **URL Validation**: Si tiene URL, la valida. Si falla pero tiene `stream_id` → acepta
3. **Stream ID Acceptance**: Canales sin URL pero con `stream_id` → aceptados (URL se construye dinámicamente)
4. **Text Sanitization**: `_sanitizeChannel()` limpia caracteres peligrosos
5. **Profile Inference**: Infiere P0-P5 por bitrate/resolution

---

## 6. CONTRATO: Post-Processor Intercept

### Regla Absoluta

**Todo contenido M3U8 almacenado en `app.state.generatedM3U8` DEBE ser interceptado por el Post-Processor.**

### Funciones del Post-Processor

1. Deduplica EXTVLCOPT duplicados (Rules Engine)
2. Reordena layers (EXTINF → EXTHTTP → VLC → KODI → APE → URL)
3. Sanitiza Unicode residual
4. Valida estructura final

---

## 7. CONTRATO: URL Validation Gate (buildChannelUrl)

### Regla Absoluta

**`buildChannelUrl()` DEBE rechazar URLs que son solo hostnames del servidor.**

```javascript
// ✅ CORRECTO — rechazar URLs incompletas
const isValidStreamUrl = baseUrl && (
    baseUrl.includes('/live/') ||
    /\.(ts|m3u8|mpd|mp4|mkv|flv)$/i.test(baseUrl) ||
    baseUrl.includes('/play/') ||
    baseUrl.includes('/streaming/') ||
    baseUrl.includes('/get.php')
);

// Si es solo hostname (ej: "http://line.tivi-ott.net"), DESCARTAR
if (baseUrl && !isValidStreamUrl) { baseUrl = ''; }

// Luego construir desde credenciales del servidor
baseUrl = `${serverBase}/live/${user}/${pass}/${streamId}.m3u8`;
```

> [!CAUTION]
> **BUG HISTÓRICO (2026-03-25):** `channel.url` a veces contenía solo el hostname del servidor
> (ej: `http://line.tivi-ott.net`) sin la ruta `/live/user/pass/id.ts`. Esto generaba URLs truncadas
> que VLC rechazaba instantáneamente (403/empty reply).

---

## 8. CONTRATO: Channel Count Preservation

### Regla Absoluta

**El número de canales que ENTRA al pipeline DEBE ser IGUAL al que SALE.**

```text
getFilteredChannels() → 6802
Schema Gate           → 6802 (deduped: 0)
generateM3U8Stream()  → 6802 entries
Download .m3u8        → 6802 #EXTINF lines
```

### Verificación Post-Generación

```javascript
// En consola del browser, buscar:
🛡️ [SCHEMA GATE] 6802 → 6802 channels (deduped: 0)
🌊 [STREAM] Generando M3U8 ULTIMATE para 6802 canales...
```

Si `SCHEMA GATE` muestra `→ N` donde N < input → **HAY UN BUG**.

---

## 9. ARCHIVOS PROTEGIDOS (No Modificar Sin Verificar Contratos)

| Archivo | Rol | Contratos Aplicables |
| --- | --- | --- |
| `app.js` | PRO/ULTIMATE generators | 1, 2, 3 |
| `m3u8-typed-arrays-ultimate.js` | Typed Arrays generator | 1, 2, 5, 7, 8 |
| `m3u8-world-class-generator.js` | WorldClass generator | 2, 3, 4 |
| `m3u8-generator-v16-elite.js` | Elite generator | 1, 2, 3 |
| `generation-validator-v9.js` | Schema Gate (validación ONLY) | 4, 5, 8 |
| `m3u8-post-processor.js` | Inline Rules Engine | 4, 6 |

---

## 10. PROTOCOLO DE MODIFICACIÓN

Antes de modificar CUALQUIER archivo de la tabla anterior:

1. **Leer este Skill completo**
2. **Verificar que NO se viole ningún contrato** (especialmente 5, 7, 8)
3. **Después de modificar, correr**: `node -c <archivo>` para syntax check
4. **Verificar en consola**: buscar logs `[SCHEMA GATE]` y conteo de canales
5. **NUNCA** agregar deduplicación al Schema Gate
6. **NUNCA** eliminar o comentar llamadas a `getFilteredChannels()`, `validateAndTranslate()`, o el post-processor hook
7. **Correr workflow**: `/pre-generation-checklist` antes de generar
8. **Correr workflow**: `/regression-guard-m3u8` después de modificar
