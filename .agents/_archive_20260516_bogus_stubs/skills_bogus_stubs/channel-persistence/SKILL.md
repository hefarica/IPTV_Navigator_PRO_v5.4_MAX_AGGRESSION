---
name: channel-persistence
description: "Channel Persistence — SIEMPRE guardar channelsMaster (TODOS los canales), NUNCA channelsFiltered. Filtrar huérfanos al restaurar."
---

# 📦 Channel Persistence — Reglas de Guardado y Restauración de Canales

## Regla Absoluta

> **"channelsMaster contiene TODOS los canales de TODOS los servidores activos. Es la fuente de verdad. CUALQUIER función que guarde o restaure canales DEBE operar sobre channelsMaster, NUNCA sobre channelsFiltered."**

## Problema Histórico (Bug corregido V4.28)

`analysis-state-manager.js` leía `channelsFiltered` (vista filtrada, ej: 37K) antes que `channelsMaster` (todos, ej: 76K). Esto causaba:

1. **Al guardar:** Solo se guardaba el subconjunto visible con filtros activos (~37K de ~76K)
2. **Al restaurar:** Se sobrescribía `channelsMaster` con el snapshot parcial, perdiendo canales
3. **Huérfanos:** Canales de servidores eliminados se reinyectaban desde snapshots viejos

## Reglas de Guardado

### ✅ CORRECTO — Guardar SIEMPRE desde channelsMaster

```javascript
// V4.28: SIEMPRE guardar channelsMaster (TODOS los canales)
var channels = window.app.state.channelsMaster || [];
```

### ❌ PROHIBIDO — Guardar desde channelsFiltered

```javascript
// ❌ PROHIBIDO: Esto guarda solo la vista filtrada, perdiendo canales
var channels = window.app.state.channelsFiltered || window.app.state.channelsMaster || [];
```

## Reglas de Restauración

### ✅ CORRECTO — Filtrar huérfanos al restaurar

```javascript
function applyRestoredChannels(channels) {
    // Filtrar canales de servidores eliminados
    var activeIds = new Set(app.state.activeServers.map(s => s.id));
    var filtered = channels.filter(ch => {
        var sId = ch.serverId || ch._serverId;
        if (!sId) return true;  // Mantener legacy sin serverId
        return activeIds.has(sId);  // Solo de servidores activos
    });
    
    app.state.channelsMaster = filtered;
    app.state.channelsFiltered = filtered.slice();
}
```

### ❌ PROHIBIDO — Restaurar sin filtrar huérfanos

```javascript
// ❌ PROHIBIDO: Reinyecta canales de servidores eliminados
app.state.channelsMaster = channels;
app.state.channelsFiltered = channels.slice();
```

## Jerarquía de Datos

| Variable | Contenido | Uso |
| -------- | --------- | --- |
| `channelsMaster` | TODOS los canales de servidores activos | Fuente de verdad, guardado, exportación |
| `channelsFiltered` | Subconjunto visible tras filtros | Solo para renderizado de tabla |
| `channels` | Alias de trabajo | Copia temporal para operaciones |

## Puntos de Guardado/Restauración

| Archivo | Función | Regla |
| ------- | ------- | ----- |
| `analysis-state-manager.js` | `getFilteredActiveChannels()` | Leer SOLO de `channelsMaster` |
| `analysis-state-manager.js` | `applyRestoredChannels()` | Filtrar huérfanos antes de asignar |
| `app.js` | `saveChannelsList()` | Guardar `channelsMaster` completo |
| `app.js` | `loadChannelsList()` | V4.27.1 filtra huérfanos al cargar de IndexedDB |
| `app.js` Worker handler L8781 | `this.state.channelsMaster = data.channels` | Asignación directa OK (Worker procesa channelsMaster) |

## Flujo de Carga Correcto (Post V4.28)

```
1. loadChannelsList() → IndexedDB → dedup → filtrar huérfanos → channelsMaster = 76K ✅
2. analysis-state-manager → restaura snapshot → filtra huérfanos → NO sobrescribe si ya hay datos ✅
3. Worker enriquece → devuelve 76K → channelsMaster = 76K ✅
4. runIntegrityTests() → integrity: true ✅
```

## Anti-Patrones (PROHIBIDOS)

```javascript
// ❌ PROHIBIDO: Leer channelsFiltered para guardar
var channels = app.state.channelsFiltered || app.state.channelsMaster;

// ❌ PROHIBIDO: Restaurar sin verificar servidores activos
app.state.channelsMaster = restoredChannels;

// ❌ PROHIBIDO: Asumir que channelsFiltered == channelsMaster
if (app.state.channelsFiltered.length) { /* guardar estos */ }

// ❌ PROHIBIDO: Guardar snapshot sin serverId
channels.map(ch => ({ name: ch.name })); // Falta serverId para validación
```
