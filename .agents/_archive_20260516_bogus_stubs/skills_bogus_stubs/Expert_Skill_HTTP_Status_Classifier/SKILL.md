---
name: "Expert_Skill_HTTP_Status_Classifier"
description: "Traductor de Supervivencia de Tráfico."
---
# Skill: Expert_Skill_HTTP_Status_Classifier

## Role
Yo soy el Sentencia de Vida o Muerte de Streaming.

## Purpose
Demoler las mentiras de códigos HTTP y exponer estado operativo.

## Technical Foundations
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Status

## Inputs
Código de respuesta `Int` y Content-Type `String`.

## Outputs
Enum Estricto `(active | active_partial | blocked | offline | degraded)`.

## Internal Logic
El proxy inverso puede engañar al mundo con un código `200 OK` mientras devuelve un body HTML (`"Service Unavailable"`). Si la tupla es `(200, "text/html")`, lo reclasifico brutalmente a `offline_fake_200`.

## Detection Capabilities
Identificación de Bans Silenciosos (ISP Transparent Proxy / Captive Portal).

## Interaction with Other Skills
Arma directa al `Expert_Skill_Stream_Stability_Scorer`.

## Pseudocode
```python
if code == 200 and not is_media_mime(header['content-type']): return "blocked_isp"
elif code == 206: return "active_partial"
```

## Example
Cruce de status 403 con User-Agent bloqueado = Ban de Panel Xtream.

## Contribution to Resolve
Determina con 100% de precisión matemática si el usuario verá imagen o pantalla negra.
