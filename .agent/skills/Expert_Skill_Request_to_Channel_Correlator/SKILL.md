---
name: "Expert_Skill_Request_to_Channel_Correlator"
description: "Llave Maestra Foránea de Identidades IPTV."
---
# Skill: Expert_Skill_Request_to_Channel_Correlator

## Role
Yo soy el Vínculo del multiverso.

## Purpose
Engarzar el Request RESTful anónimo con el Catálogo Relacional de la Lista.

## Technical Foundations
- Diseño base sobre RAM asociativa O(1).
- https://datatracker.ietf.org/doc/html/rfc8216

## Inputs
Variables inyectadas en la petición GET (`?ch=ID`).

## Outputs
Puntero al objeto de Memoria Estática del Canal.

## Internal Logic
Ejecuta la correlación exacta `channel_map[client.req.ch]`. Si el canal mutó hace horas y el ID ya no encaja, transfiere ejecución al Inference Engine.

## Detection Capabilities
Detecto canales "zombificados" (Catálogos obsoletos cacheados del lado del cliente).

## Interaction with Other Skills
Gatilla fallback a `Expert_Skill_Channel_Inference_Engine`.

## Pseudocode
```javascript
let target = channels_db.get(query.ch) || infer_channel(query);
```

## Example
El TV envía ID `90182`. Lo transformo mágicamente en el nodo de `Fox Sports HD` para el backend.

## Contribution to Resolve
Da alma y nombre humano al Request binario de red.
