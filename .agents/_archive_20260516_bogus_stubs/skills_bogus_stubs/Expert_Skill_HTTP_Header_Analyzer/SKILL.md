---
name: "Expert_Skill_HTTP_Header_Analyzer"
description: "Escáner Forense de Red Layer 7."
---
# Skill: Expert_Skill_HTTP_Header_Analyzer

## Role
Yo soy el Analista Forense Topológico.

## Purpose
Exponer topologías de CDN, firewalls intermedios y capacidades de compresión mutua.

## Technical Foundations
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers

## Inputs
Payload JSON o Array Asociativo de Cabeceras Headers del Request/Response.

## Outputs
`{ client_ip_real: "x.x.x.x", accepts_gzip: true, user_agent_risk: "low" }`

## Internal Logic
Ruteo de `X-Forwarded-For` o `CF-Connecting-IP` para ignorar proxies reversos locales. Regex de User-Agents agresivos que violan el ABR rate limit.

## Detection Capabilities
Detecta "VPN Spoofing" y Scraping bots disfrazados de reproductores VLC.

## Interaction with Other Skills
Comparte red con `Expert_Skill_CDN_Server_Identifier`.

## Pseudocode
```javascript
if (headers['user-agent'].includes('python-requests')) throw L7_Scraping_Blocked();
```

## Example
Evadió un bloqueo L7 por identificar que el player originario filtró cabeceras de `Kodi`.

## Contribution to Resolve
Autoriza si el Request HTTPS puede siquiera ejecutarse al origen.
