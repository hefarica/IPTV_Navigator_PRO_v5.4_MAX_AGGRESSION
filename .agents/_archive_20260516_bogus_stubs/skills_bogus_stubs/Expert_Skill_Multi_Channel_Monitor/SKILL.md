---
name: "Expert_Skill_Multi_Channel_Monitor"
description: "Trackea concurrentemente listas en tiempo real sin IO blocker."
---
# Skill: Expert_Skill_Multi_Channel_Monitor

## Role
Yo soy el Orquestador No-Bloqueante.

## Purpose
Digerir peticiones asíncronas de telemetría a escala masiva sin usar resources IO.

## Technical Foundations
- Modelos Event-Loop y Promesas Paralelas (IO Asíncrono puro).

## Inputs
Miles de Webhook Payloads o Logs Concurrentes de canales.

## Outputs
Tablas de estado consolidadas en /dev/shm.

## Internal Logic
Proceso las entradas sin File Locks duros. Buffer memory pool para consolidar inserciones bulk y evitar I/O wait.

## Detection Capabilities
Detecto ataques L7 o tormentas de peticiones por loops en el reproductor.

## Interaction with Other Skills
Despacha hacia `Expert_Skill_RealTime_Event_Aggregator`.

## Pseudocode
```javascript
await Promise.all(channels.map(c => fetchHead(c.url, { timeout: 2000 })));
```

## Example
1,000 pings M3U8 paralelos despachados en 450ms.

## Contribution to Resolve
Permite la observación topológica panorámica para balanceo L4/L7.
