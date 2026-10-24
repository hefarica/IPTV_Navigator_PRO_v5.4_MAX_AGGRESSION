# Recuperación y persistencia de configuración (servidores · config · filtros)

> Estado: **2026-10-24**. Origen: `http://127.0.0.1:5500`. Navegador: Edge (perfil `Default`).
> Este documento no contiene credenciales. Los artefactos con credenciales están locales y en `.gitignore`.

## 1. Dónde vive la configuración

La app `IPTV Navigator PRO v5.4` persiste en **dos almacenes del navegador** para el origen
`http://127.0.0.1:5500` (mismo puerto y host que Live Server a propósito, para conservar los datos).

### 1.1 `localStorage` (claves que usa la app)

| Clave | Contenido |
|---|---|
| `iptv_server_library` | **Biblioteca de servidores** (fuente de verdad de la UI) |
| `ape_servers` | Espejo `{url,username,password}` que consume el generador (`js/ape-v9/generation-controller.js`) |
| `iptv_connected_servers` · `iptv_active_servers` · `ape_saved_servers` | Claves alternas que el generador también escanea |
| `APE_CODEC_CASCADE_OVERRIDE` | Overrides de cascada de codec |
| `iptv_headers_active_v41` / `iptv_headers_mode_v41` | Cabeceras activas |
| `ape_device_id`, `APE`, `APE_JWT_EXPIRATION_HOURS`, `anle.seed.lastSync`, `shieldedMode` | Estado auxiliar |
| `ape_config_guard.lastRun` | Marca verificable del guard (ver §4) |

### 1.2 IndexedDB `IPTVNavigatorDB` (v1) — creada por `frontend/core/db-manager.js`

| Store | keyPath | Rol |
|---|---|---|
| `app_state` | `key` | **Estado real de la app** (ver claves abajo) |
| `channels` | `id` | Caché de canales enriquecidos |
| `servers` | `url` | Store de servidores (la app actual usa `app_state`) |

Claves de `app_state` que escribe `frontend/app.js`:

```
serverConfig · activeServers · serverLibrary · filterState · filtersConfig
advancedFilters · analysisConfig · headersConfig · rankingConfig
channelsCache · gatewayConfig · enrichmentSources · generatorState
generatorSnapshot · auditLog · ape_lab_* · ape_recovered_filters
```

### 1.3 Formas exactas (no improvisar)

`iptv_server_library[]` (ver `frontend/server-library-multi-save.js`):

```json
{ "id":"srv_<hash>", "name":"host", "baseUrl":"http://host:port", "username":"...",
  "password":"...", "apiType":"auto", "totalChannels":3795, "totalGroups":68,
  "quality8K":205, "quality4K":2544, "qualityFHD":1046, "qualityHD":0, "qualitySD":0,
  "expDate":"N/A", "savedAt":"ISO-8601" }
```

`app_state.activeServers` → `{ activeServers:[...], currentServer:{...}, timestamp }`
`app_state.serverConfig` → `{ baseUrl, username, password, apiType, serverName }`
`app_state.filterState` → `{ activeFilter:{mode:"STANDARD",groups:[]}, searchQuery:"",
filterTier:"ALL", filterCodec:"ALL", filterLanguage:"ALL", timestamp }`

## 2. Qué se encontró (2026-10-24)
El navegador conservaba **solo 3 claves** de `app_state` (`enrichmentSources`, `gatewayConfig`,
`serverConfig`) y **ninguna** `iptv_server_library`: la biblioteca multi-servidor se había perdido en
localStorage **y** en IndexedDB. El `serverConfig` superviviente tenía usuario/password pero
`baseUrl` **vacío** → la app no podía reconectar.

La biblioteca se reconstruyó desde el artefacto que sí sobrevivió:
`IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` (71.6 MB, 9 293 canales), que guarda por canal
`server`, `username` y `password`. Agregando por `(server, username, password)` aparecieron
**3 servidores**:

| Servidor | Canales | Grupos | 8K | 4K | FHD |
|---|---:|---:|---:|---:|---:|
| `line.dndnscloud.ru` | 3 795 | 68 | 205 | 2 544 | 1 046 |
| `line.tivi-ott.net` | 2 970 | 66 | 116 | 821 | 2 033 |
| `126958958431.4k-26com.com:80` | 2 528 | 61 | 68 | 393 | 2 067 |

`line.tivi-ott.net` coincide con las credenciales que sobrevivían en `serverConfig`, lo que confirma
que la reconstrucción corresponde al estado real que el usuario había configurado.

## 3. Estado restaurado

- `localStorage.iptv_server_library` → 3 servidores (verificado)
- `app_state.serverLibrary` → 3 servidores (verificado)
- `app_state.activeServers` → activos + `currentServer.baseUrl` completado
- `app_state.serverConfig.baseUrl` → completado (antes vacío)
- `app_state.filterState` → sembrado con los **75 grupos** reales (solo si no existía)
- `app_state.ape_recovered_filters` → inventario de grupos recuperado (clave nueva, no invasiva)
- `localStorage.ape_servers` → espejo para el generador

Nota: `activeServers` es un subconjunto **de sesión** que la app revalida al conectar; la
persistencia fuerte es `serverLibrary` / `iptv_server_library`.

## 4. Guard de persistencia

`frontend/js/ape-config-persistence-guard.js` (cargado en `index-v4.html` tras `app.js`).

- Sincroniza **por unión** `localStorage.iptv_server_library` ↔ `IndexedDB.app_state.serverLibrary`.
  Nunca borra; en conflicto gana la entrada más completa. Corrige el caso real observado: un lado
  quedó con 2 servidores y el otro con 3.
- Arranque (espera `window.app.db`), intervalo de 60 s, `visibilitychange` y `beforeunload`.
- Deja marca verificable en `localStorage['ape_config_guard.lastRun']`.
- API de respaldo manual en consola:

```js
await apeConfigExport()        // descarga APE_CONFIG_BACKUP_<fecha>.json
await apeConfigImport()        // selector de archivo → restaura app_state + biblioteca
await apeConfigGuard.syncNow() // sincronización forzada
```

## 5. Cómo re-aplicar si se limpian los datos del navegador

1. Servir la raíz del workspace en `127.0.0.1:5500` (el launcher
   `IPTV_v5.4_MAX_AGGRESSION/frontend/start_iptv_navigator.bat` ya lo hace desde la raíz correcta).
2. Snapshot recuperado (local, **gitignored**): `_storage_dump/recovered_config.json`.
3. Abrir `/_ape_restore_config.html` → inyecta biblioteca + `app_state` sin borrar lo existente.
4. Recargar la app.

## 6. Verificación reproducible (sin DevTools)

Página `/_ape_storage_dump.html` + servidor `_storage_dump_server.py` vuelcan `localStorage` +
`sessionStorage` + `IndexedDB` a `_storage_dump/dump_<fecha>.json`. Con eso se contrasta
`serverLibrary` vs `iptv_server_library` vs `ape_config_guard.lastRun`.

## 7. Artefactos locales (gitignored — contienen credenciales reales)

```
_storage_dump/recovered_config.json    snapshot recuperado (3 servidores + filtros)
_storage_dump/dump_*.json               volcados del navegador
_storage_dump/applied_*.json            reportes de restauración
_ape_restore_config.html                página de re-aplicación
_ape_storage_dump.html                  página de volcado
_storage_dump_server.py                 servidor loopback (GET estático + POST /__dump, /__applied)
_recover_config.py                      extractor desde channels_map.json
```

## 8. Corrección 2026-10-24 09:20 — filtros sembrados con forma inválida (bug propio)

**Qué pasó.** En la primera restauración se sembró `app_state.filterState` con
`activeFilter.groups = ["nombreGrupo", …]` (75 strings tomados del inventario de `channels_map.json`).
La app espera `groups = [{ logic, rules[] }, …]` (`app.js:8341` → `renderFilterGroup` → `group.rules.forEach`).

**Síntomas observados en consola:**

```
Uncaught TypeError: Cannot read properties of undefined (reading 'forEach')
    at IPTVNavigatorPro.renderFilterGroup (app.js:8407)
[FilterPipeline] Executing advanced filters on 23833 channels.
[FilterPipeline] Result after filters: 0
```

**Corrección aplicada:**

1. `app_state.filterState` **eliminado** (`_ape_fix_filter.html`). Sin ese estado la app arranca con su
   default y muestra el catálogo completo. Verificado: `filterStateRemoved=true`,
   `channelsCache.totalCount=23833`.
2. `_ape_restore_config.html` ya **no siembra** `filterState`; si lo encuentra con forma inválida, lo
   elimina. El inventario de grupos se guarda aparte en `ape_recovered_filters`.
3. `currentServer` / `serverConfig` reapuntados al servidor que **autentica de verdad** mediante
   `_ape_pick_server.html?pick=<baseUrl>`.

## 9. Estado real de las credenciales (probado con `player_api.php`, 2026-10-24)

| Servidor | DNS | API | Veredicto |
|---|---|---|---|
| `line.tivi-ott.net` | 89.37.116.214 ✅ | **HTTP 200 · `auth=1` · status Active · exp `18 nov 2026` · 0/1 conexiones** | **OPERATIVO** — descargó 712 categorías y 23 833 canales |
| `line.dndnscloud.ru` | 185.243.7.174 ✅ | **HTTP 513** | Host vivo pero la API rechaza; no validable |
| `126958958431.4k-26com.com` | ❌ no resuelve | — | Servidor muerto (DNS inexistente) |

Consecuencia operativa: de los 3 servidores reconstruidos **solo `line.tivi-ott.net` sirve catálogo**.
Se mantiene como `currentServer`. Los otros dos quedan en la biblioteca sin borrar (decisión del
propietario); conviene limpiarlos o marcarlos como caídos.

Nota adicional: el store `channels` llegó a **47 358 registros** para 23 833 canales (dos esquemas de
`id`: `tvg:` y `hash:` en conectores distintos). No afecta la conexión; la app expone
`app.deepCleanOrphanedChannels()` para consolidar.

