---
name: Resolver Architecture — List is Authority
description: MANDATORY rule — resolve_quality.php and resolve.php are ONLY credential resolvers. All static quality directives live in the M3U8 list.
---

# 📜 SOP: Resolver Architecture — List is Authority

**Versión:** 7.1 (Atomic Credential Resolver)
**Principio:** La Lista M3U8 es la autoridad estática. El Resolver es el puente dinámico.

## 1. La Regla de Oro

**PROHIBIDO:** Usar redirecciones HTTP (301/302) en resolve_quality.php o resolve.php.
**PROHIBIDO:** Inyectar directivas estáticas (codec, filters, sharpen, HDR, KODIPROP) en los resolvers.
**PROHIBIDO:** Usar proxy/fetch del manifiesto upstream.
**OBLIGATORIO:** Devolver HTTP 200 con el fragmento M3U mínimo.

## 2. Separación de Responsabilidades

| Componente | Responsabilidad | Contenido |
|:---|:---|:---|
| **Lista M3U8** (frontend JS) | Autoridad Estática | `avcodec-hw`, `sharpen-sigma`, `tone-mapping`, `KODIPROP`, HDR, deband, dither |
| **Resolver PHP** (backend) | Puente Dinámico | Credenciales (srv token), `network-caching` (BW-based), `User-Agent`, AI metrics |
| **AI Engine** (backend module) | Señales de Escalación | Bandwidth demands, NUCLEAR mode, buffer escalation signals |

## 3. Lo que el Resolver SÍ hace

1. Decodifica `&srv=base64(host|user|pass)` → credenciales
2. Construye URL final: `http://host/live/user/pass/streamId.m3u8`
3. Calcula `network-caching` dinámico basado en `&bw_kbps`
4. Inyecta `User-Agent` basado en dispositivo detectado
5. Llama AI Engine para señales de escalación de bandwidth
6. Devuelve HTTP 200 con fragmento mínimo

## 4. Lo que el Resolver NUNCA hace

- ❌ Inyectar `sharpen-sigma`, `contrast`, `saturation`, `gamma`
- ❌ Inyectar `avcodec-hw`, `avcodec-threads`, codec settings
- ❌ Inyectar `tone-mapping`, `hdr-output-mode`, color space
- ❌ Inyectar `KODIPROP` lines
- ❌ Inyectar `preferred-resolution`, `adaptive-maxwidth`
- ❌ Redirect (301/302) a otra URL
- ❌ Proxy/fetch del manifiesto del proveedor

## 5. Archivos Afectados (Triple File Sync)

| Archivo | Rol |
|:---|:---|
| `resolve_quality.php` | Resolver Atómico v7.1 (credenciales + dinámico) |
| `resolve.php` | Resolver Legacy (mismo principio) |
| `ai_super_resolution_engine.php` | Motor AI (solo señales de escalación via resolver) |
