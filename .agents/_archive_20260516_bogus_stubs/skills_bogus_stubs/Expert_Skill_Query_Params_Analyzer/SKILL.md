---
name: "Expert_Skill_Query_Params_Analyzer"
description: "Audita variables GET pasadas al resolver."
---
# Skill: Expert_Skill_Query_Params_Analyzer

## Role
Yo soy el Forense de Parametría URL.

## Purpose
Secuestrar, disecar y validar cada token intencional adherido al URI HTTP.

## Technical Foundations
- https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams

## Inputs
El string de la petición GET originaria HTTP/1.1.

## Outputs
Objeto tipado estrictamente (id, perfil, ancho_banda, timestamp, sesión).

## Internal Logic
Separo tokens. Valido Enum(P0-P5). Impido la pérdida de estado por encoding basura de reproductores obsoletos.

## Detection Capabilities
Detecto inyecciones de URL Encode letales (`%20` o `%2F`).

## Interaction with Other Skills
Disparador inicial hacia `Expert_Skill_Request_to_Channel_Correlator`.

## Pseudocode
```javascript
const params = new URL(request.url).searchParams;
return { ch: params.get('ch'), profile: params.get('p') };
```

## Example
Conversión del horrendo path query param malformado a taxonomía utilizable.

## Contribution to Resolve
Blindaje perimetral del resolver contra queries peligrosas.
