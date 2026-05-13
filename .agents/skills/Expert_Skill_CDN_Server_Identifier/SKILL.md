---
name: "Expert_Skill_CDN_Server_Identifier"
description: "Clasifica el Vendor Upstream desde las cabeceras HTTP."
---
# Skill: Expert_Skill_CDN_Server_Identifier

## Role
Yo soy el Perfilador BGP y ASN de Orígenes.

## Purpose
Aislar al proveedor real, sin importar cuántos firewalls WAF tenga al frente.

## Technical Foundations
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Cache

## Inputs
Payloads en cabeceras `Response` (Server, X-Cache, X-Kaltura).

## Outputs
Vendor String `server: "XtreamCodes", cdn: "Cloudflare"`.

## Internal Logic
Matriz de variables. `X-Kaltura` -> Kaltura. `CF-Ray` -> Cloudflare. `nginx-media` -> Xtream Vanilla.

## Detection Capabilities
Detecto revendedores (Resellers) ocultando origen.

## Interaction with Other Skills
Complementa a `Expert_Skill_HTTP_Header_Analyzer`.

## Pseudocode
```python
if "CF-Ray" in headers: return "Cloudflare_CDN";
```

## Example
El servidor responde `Apache` pero `X-VOD-Edge` me delata que es Flussonic modificado.

## Contribution to Resolve
Abona parámetros de QoS adaptados al Engine del backend subyacente.
