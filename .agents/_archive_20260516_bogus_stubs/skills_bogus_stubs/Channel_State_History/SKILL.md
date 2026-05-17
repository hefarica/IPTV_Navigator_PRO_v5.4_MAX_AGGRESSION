---
name: Skill_Channel_State_History
description: "Conserva la ventana deslizante (sliding window) de latencia y status local."
---

# Skill_Channel_State_History

## 🎯 Objetivo
Rechazar el concepto de que un canal "está bien" tan solo por una medición puntual exitosa de 200 OK. Mantiene el vector temporal (sliding window) de los últimos `N` HTTP polls del parser para establecer tendencias y posibilitar la predicción técnica.

## 📥 Inputs
- **Event Node:** Objeto JSON con {`status_code`, `latency_ms`}.
- **History Map:** Instanciamiento global inyectado por el Orchestrator.

## 📤 Outputs
- **Time Series Array:** Los últimos `N` eventos del canal.

## 🧠 Lógica Interna y Reglas
1. **Queue FIFO:** Funciona bajo `First in, First out`. Retiene solo los últimos 10 probes.
2. **Contexto de Operación:** Esto permite la magia del `Skill_Degradation_Detector`. Si borramos la memoria, no hay forma de calcular el Delta de latencia.

## 💻 Pseudocódigo
```javascript
class Channel_State_History {
    constructor(maxSize = 10) {
        this.historyQueue = [];
        this.MAX_SIZE = maxSize;
    }

    pushEvent(latency_ms, statusCode) {
        this.historyQueue.push({ latency_ms, statusCode, time: Date.now() });
        if (this.historyQueue.length > this.MAX_SIZE) {
            this.historyQueue.shift(); // Expulsar el probe más antiguo
        }
        return this.historyQueue;
    }
}
```
