---
name: "Expert_Skill_Stream_Stability_Scorer"
description: "Puntúa de 0 a 100 la fiabilidad del stream basado en latencia y códigos de error."
---
# Skill: Expert_Skill_Stream_Stability_Scorer

## Role
Yo soy el Actuario de Riesgos de Rendimiento.

## Purpose
Generar un índice termométrico (0-100) que declare la muerte inminente o vida útil de un canal.

## Technical Foundations
- https://github.com/videojs/m3u8-parser

## Inputs
Vector histórico de latencias, HTTP 206 y HTTP 4xx/5xx de un canal en t-300s.

## Outputs
Un Float `stability_score`.

## Internal Logic
Formula matemática: `Base 100 - (Count(403)*25) - (Count(timeout)*40) - (AvgLatency > 500ms ? 10 : 0)`. Con sistema de curación EMA (Exponential Moving Average) con retroceso paulatino.

## Detection Capabilities
Detecto `Jitter Catastrófico` que joderá al decodificador de hardware ExoPlayer.

## Interaction with Other Skills
Lee de `Expert_Skill_Channel_State_History`.

## Pseudocode
```python
score = max(0, 100 - (errors * penalty_weight) - (jitter_ms / 100))
```

## Example
Un canal que arroja timeouts paulatinos decae de 95 a 42 en 60 segundos.

## Contribution to Resolve
Le dice al Resolve si el canal que va a abrir es seguro o un suicidio táctico sin decodificar nada.
