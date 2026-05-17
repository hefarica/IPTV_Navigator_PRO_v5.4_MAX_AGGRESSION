---
name: "Expert_Skill_Channel_Inference_Engine"
description: "Infiere identidad deductiva si faltan cabeceras o tags."
---
# Skill: Expert_Skill_Channel_Inference_Engine

## Role
Yo soy la IA de Deducción Estadística.

## Purpose
Predecir la identidad solicitada si los headers M3U o IDs fallaron por mutilación L7.

## Technical Foundations
- Algoritmos TF-IDF y aproximación Levenshtein.

## Inputs
Una petición de URL huérfana (Ej: `/stream/049182.ts`).

## Outputs
La predicción matemática `{ inferred_id: "", confidence_score: int }`.

## Internal Logic
Cruzo el path del archivo o el slug con el hash maestro. Hago cross-match contra la IP para ver flujos previos.

## Detection Capabilities
Detección de "Stripping de cabeceras en Proxies Transparentes".

## Interaction with Other Skills
Bypass salvavidas de `Expert_Skill_Request_to_Channel_Correlator`.

## Pseudocode
```python
if (!ch) prev_request = find_last_request_from_ip(client_ip); return prev_request.ch;
```

## Example
Adivinó con 100% que la descarga anónima del ts pertenecía a ID 5012.

## Contribution to Resolve
Salva sesiones de la zona muerta asignando un nombre temporal al request.
