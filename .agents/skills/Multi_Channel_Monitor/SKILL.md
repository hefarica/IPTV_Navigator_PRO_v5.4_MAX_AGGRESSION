---
name: Skill_Multi_Channel_Monitor
description: "Trackea concurrentemente listas en tiempo real sin IO blocker."
---

# Skill_Multi_Channel_Monitor

## 🎯 Objetivo
Soportar la concurrencia del engine aislando el estado de N canales y mitigando el *C10K problem*. Este skill actúa como Caché y supervisor en RAM.

## 📥 Inputs
- **Channel Identifiers:** El `channel_name` o `fingerprint`.
- **Payload DTO:** El JSON procesado final con los datos en tiempo real.

## 📤 Outputs
- **Estado de Memoria:** Retorna los valores cacheados a peticiones subsecuentes idénticas.

## 🧠 Lógica Interna y Reglas
1. **Manejo No Bloqueante:** Utiliza mapas indexados (Maps/Dictionaries) O(1) en vez de lectura en disco.
2. **LRU Expiration (Eviction):** Si un stream no recibe peticiones en el último minuto, es expulsado de la memoria activa para ahorrar RAM.

## 💻 Pseudocódigo
```javascript
class Multi_Channel_Monitor {
    constructor() { 
        this.activeChannelsMap = new Map(); 
        this.TIMEOUT_MS = 60000; // 1 min TTL
    }
    
    updateState(channelName, payload) { 
        payload.last_seen = Date.now();
        this.activeChannelsMap.set(channelName, payload); 
    }
    
    getAliveChannels() {
        let alive = [];
        const now = Date.now();
        for (let [name, data] of this.activeChannelsMap.entries()) {
            if (now - data.last_seen < this.TIMEOUT_MS) {
                alive.push(data);
            } else {
                this.activeChannelsMap.delete(name); // Auto-eviction
            }
        }
        return alive;
    }
}
```
