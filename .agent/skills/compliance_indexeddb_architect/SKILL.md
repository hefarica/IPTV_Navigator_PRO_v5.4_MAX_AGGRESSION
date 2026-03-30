---
name: Compliance IndexedDB Enterprise Architect
description: Reglas estrictas de persistencia de estado para IndexedDB, commit atómico, y renderizado seguro para evitar estado fantasma en APE ULTIMATE.
---

# 🛑 Compliance IndexedDB Enterprise Architect (v1.0)

## 🎯 OBJETIVO Y FILOSOFÍA

IndexedDB es la **ÚNICA FUENTE DE VERDAD** del ecosistema frontend de IPTV Navigator PRO V4. Está terminantemente prohibido confiar en `localStorage` para datos críticos (canales, servidores, configuraciones pesadas) o dejar el estado flotando en RAM volátil (this.state) esperando a que "mágicamente" no se pierda en un F5.

## 🧱 PRINCIPIOS DE COMPLIANCE (OBLIGATORIOS)

1. **Cada cambio de estado debe pasar por `commitStateChange()`**: Queda prohibido el uso de `saveActiveServers()` o `saveChannelsList()` directamente.
2. **Cada persistencia debe ser `async` y `await`**: Cualquier operación `.then()` para persistencia asíncrona debe ser evitada en favor de `async/await` estructurado de forma legible y bloqueante.
3. **Renderizado Seguro**: El renderizado (`renderServerList()`, `renderTable()`) **sólo** puede ocurrir DESPUÉS de haber esperado formalmente (`await`) el guardado en IndexedDB. Renderizar RAM que no ha sido consolidada en disco es un fallo SRE gravísimo.
4. **Almacenamiento Débil**: El uso de `localStorage` está puramente limitado a preferencias visuales de la UI o flags menores.
5. **Trazabilidad Obligatoria (`reason`)**: Cada `commitStateChange` debe incluir un parámetro `reason: "Explicación del cambio"` explícito que habilita la auditabilidad del evento vía `this._logAuditEventAsync()`.
6. **Integridad Atómica**: No se permite escritura parcial. La capa de IndexedDB debe mantener perfecta simetría con `this.state` al término de cada modificación. Todo o nada.

## ❌ PATRONES PROHIBIDOS (AUTO-RECHAZADOS)

Cualquier bloque de código generado o sugerido será declarado INMADURO e INVALIDO si presenta este comportamiento:

```javascript
// ❌ ERROR: Modificar el estado local y renderizar inmediatamente. ¡PERDERÁ LOS DATOS EN UN F5!
this.state.activeServers = this.state.activeServers.filter(s => s.id !== id);
this.renderServerList(); 
this.saveActiveServers(); // Demasiado tarde y además prohibido el método directo.
```

## ✅ FLUJO DE ORO (COMPLIANCE OK)

Este es el patrón estricto a implementar siempre:

```javascript
// ✅ ÉXITO: RAM es inyectada, luego Disco es aguardado y trazado, para finalmente Renderizar.
async removeActiveServer(id) {
    this.state.activeServers = this.state.activeServers.filter(s => s.id !== id);

    await this.commitStateChange({
        servers: true,
        channels: true, // Se limpia la basura dependiente si el servidor ya no existe
        reason: `Eliminar servidor ${id} manualmente`
    });
    // El renderizado está implícito como seguro dentro de commitStateChange por defecto.
}
```

## 🔐 EXIGENCIAS DE HARDENING DEL ENTORNO

* Proteger la UI contra múltiples pulsaciones si `this.state._isCommitting === true` está activo. Nunca interrumpas una IO en curso.
* Al recuperar canales, utilizar siempre funciones de normalización y cascada (`processChannels`, `cascadeManager`) antes del `commitStateChange` con deduplicación rigurosa.
