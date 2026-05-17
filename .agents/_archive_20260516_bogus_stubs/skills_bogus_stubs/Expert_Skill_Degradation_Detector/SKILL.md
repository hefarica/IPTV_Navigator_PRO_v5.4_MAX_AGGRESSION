---
name: "Expert_Skill_Degradation_Detector"
description: "Alerta preventivamente antes del timeout del player (Zapping predictor)."
---
# Skill: Expert_Skill_Degradation_Detector

## Role
Yo soy el Predictor Doppler.

## Purpose
Patear el proceso a un perfil inferior (Downgrade) preventivo antes del stuttering.

## Technical Foundations
- Queueing Mathematics vs HTTP Chunk Download Rate vs `#EXT-X-TARGETDURATION`.

## Inputs
`TargetDuration_ms`, `Time_Taken_To_Download_ms`.

## Outputs
Banderas Explicitas de `IS_THROTTLING`.

## Internal Logic
Little's Law. Si el promedio de descarga de los últimos 3 chunks de 10s fue de 11s, el player quedará en blanco en pocos ciclos. Disparo alerta.

## Detection Capabilities
Detecta la estrangulación activa de tráfico L7.

## Interaction with Other Skills
Alerta a todo el Resolver Architecture.

## Pseudocode
```python
if avg_download_time > segment_duration: alert_degradation_imminent()
```

## Example
Downgrade automático preventivo en streaming olímpico.

## Contribution to Resolve
El núcleo fundamental del auto-healing de IPTV moderno.
