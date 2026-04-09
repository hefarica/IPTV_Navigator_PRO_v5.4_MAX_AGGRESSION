---
name: Anti-403 Parameter Pollution (URL Hardening)
description: Regla ABSOLUTA de hardening arquitectónico. Impide el Error 403 Forbidden detonado por la inyección duplicada de tokens (ape_sid, ape_nonce) en URLs polimórficas.
---

# Anti-403 Parameter Pollution (URL Hardening & Evasión Xtream)

## El Problema: Error 403 Forbidden en Fusión V21
Cuando se generan listas M3U8 y el reproductor arroja **HTTP 403 Forbidden**, la causa subyacente en el ecosistema APE (especialmente tras la implementación de *Fusión V21 / Adaptive Streams*) suele ser la polución de parámetros en las variables de la URL (Parameter Pollution).

Los NGINX y Gateways de proveedores Xtream Codes interpretan parámetros duplicados en el Query String como un ataque o una petición malformada, procediendo al bloqueo inmediato (Drop L7).

### ❌ CÓDIGO INCORRECTO (Detona el Error 403)
```javascript
// El primaryUrl YA TIENE ape_sid=... y ape_nonce=... previamente inyectados!
// ¡Agregarlos de nuevo es LETAL!
lines.push(`${primaryUrl}&profile=P5&ape_sid=${_sid796}&ape_nonce=${_nonce796}`);
```
**Resultado en la lista generada:**
`http://.../live/user/pass/ID.m3u8?ape_sid=TOKEN&ape_nonce=TOKEN&profile=P5&ape_sid=TOKEN&ape_nonce=TOKEN`

Esta URL está corrupta por definición y activa los sistemas WAF/Anti-DDoS del proveedor de manera instantánea.

### ✅ CÓDIGO CORRECTO (Hardening Aprobado)
```javascript
// primaryUrl asume la responsabilidad única de la inyección base.
// El stream adaptativo (P1/P5) simplemente anexa su identificador final &profile.
lines.push(`${primaryUrl}&profile=P5`);
```
**Resultado en la lista generada:**
`http://.../live/user/pass/ID.m3u8?ape_sid=TOKEN&ape_nonce=TOKEN&profile=P5`

## Doctrina Arquitectónica de Hardening
1. **Delegación Única:** En el pipeline de M3U8 Generator, parámetros como `ape_sid`, `ape_nonce`, o llaves criptográficas *sólo deben inyectarse 1 VEZ* por cada endpoint.
2. **Prevención Polimórfica:** Al generar escaleras dinámicas (Adaptive Bitrate Streams para P3/P5, etc.), el código debe limitarse a anexar **únicamente** la firma de la resolución (`&profile=XX`), omitiendo volver a enviar el token.
3. **Auditoría Estricta:** Antes de cada Build o Update Maestro, el desarrollador (o el Sistema Lógico IA) DEBE leer la línea de inyección final revisando si ocurre concatenación múltiple o redundante.
