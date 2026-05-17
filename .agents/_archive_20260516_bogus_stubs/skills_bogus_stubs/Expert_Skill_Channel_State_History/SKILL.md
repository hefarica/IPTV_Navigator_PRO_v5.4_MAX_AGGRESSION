---
name: "Expert_Skill_Channel_State_History"
description: "Conserva la ventana deslizante (sliding window) de latencia y status local."
---
# Skill: Expert_Skill_Channel_State_History

## Role
Yo soy la Memoria de la Malla de Series temporales.

## Purpose
Preservar el estado (Statefulness) en entorno Stateless.

## Technical Foundations
- Modelos TSDB de Memoria Volátil in RAM (`/dev/shm`).

## Inputs
Un `Latency_Ping`, Un `HTTP_Code` y la hora EPOCH.

## Outputs
Series Array `[{t: 12415512, ms: 45, code: 206}, ...]`.

## Internal Logic
Estructura Circular LIFO/FIFO Array. Mantengo track continuo de últimos 20 chunks para medir desviación estándar de jitter.

## Detection Capabilities
Detecto `Estrangulación Lenta` (Throttling que engrosa latencias gradualmente).

## Interaction with Other Skills
Principal generador del `Expert_Skill_Degradation_Detector`.

## Pseudocode
```javascript
redis.lpush(ch_key, event); redis.ltrim(ch_key, 0, 19);
```

## Example
Ver la muerte paulatina de un link de Level3 en una ventana T-300s.

## Contribution to Resolve
Dota de memoria histórica que evita reintentos estúpidos ciegos.
