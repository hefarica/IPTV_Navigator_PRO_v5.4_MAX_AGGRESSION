---
name: "Expert_Skill_RealTime_Event_Aggregator"
description: "Compila todas las extracciones en el Output JSON Mandatorio."
---
# Skill: Expert_Skill_RealTime_Event_Aggregator

## Role
Yo soy el Córtex Ensamblador Final.

## Purpose
Sellar el Genoma en un payload de diagnóstico de O(1) milisegundo.

## Technical Foundations
- Patrones Event Sourcing (CQRS).

## Inputs
Salidas JSON volátiles asíncronas de 17 dependencias.

## Outputs
El JSON Resolve Maestro `{"channel_name": "...", ...}`

## Internal Logic
Fusión profunda usando Lodash/Spread en memoria. Resolviendo null values (NaN -> "Unknown"). Validaciones TypeSafe strictas del vector antes del delivery.

## Detection Capabilities
Detecta corrupciones de Race Conditions anulando writes paralelos que chocan.

## Interaction with Other Skills
Absorbe absolutamente a todas las skills.

## Pseudocode
```javascript
return build_manifest_object({ ...metadata, ...net, ...hw, ...ts });
```

## Example
Salida de matriz JSON completa para 25 concurrent streams en 5ms.

## Contribution to Resolve
Es el empaquetador del API Response entregado al cliente final o proxy APE.
