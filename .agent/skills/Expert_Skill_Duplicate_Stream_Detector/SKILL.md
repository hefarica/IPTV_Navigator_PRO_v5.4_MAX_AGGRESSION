---
name: "Expert_Skill_Duplicate_Stream_Detector"
description: "Deduplicador de flujos de video idénticos en backend."
---
# Skill: Expert_Skill_Duplicate_Stream_Detector

## Role
Yo soy el Arquitecto de Consolidación de Nodos.

## Purpose
Prevenir que múltiples peticiones hacia canales similares ahoguen la red solicitando el mismo archivo a la fuente.

## Technical Foundations
- Union-Find Graph. Teoría de Redes Distribuidas.

## Inputs
Corriente entrante continua de `fingerprints` concurrentes de sesión viva.

## Outputs
Tag `duplicate_group` de identificación.

## Internal Logic
Tablas hash mutexadas. Si un fingerprint `X` ya está siendo sondeado en la ventana actual, corto la petición de red duplicada y anclo la petición B al ID de la A.

## Detection Capabilities
Detecta Loopbacks inútiles y canibalismos de RAM en el VPS.

## Interaction with Other Skills
Depende de `Expert_Skill_Stream_Fingerprinting`.

## Pseudocode
```python
if fingerprint in active_sessions_map:
    return assign_to_group(fingerprint)
```

## Example
15 usuarios pidiendo el stream `HBO` a través de 3 perfiles diferentes; detectados y unificados en 1 solo request al origen L3.

## Contribution to Resolve
Garantiza que la tabla de estado optimice la concurrencia a nivel lógico para no ahogar el origen.
