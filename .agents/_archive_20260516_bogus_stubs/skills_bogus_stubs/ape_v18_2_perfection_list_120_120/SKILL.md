---
name: "APE v18.2 Perfection List 120/120 (Invariants & Architecture)"
description: "Directrices arquitectónicas estrictas y fixes críticos de serialización para garantizar la puntuación 120/120 del generador M3U8."
version: "1.0"
---

# APE v18.2 Perfection List 120/120 — Arquitectura Invariante

Esta Skill documenta la estructura sagrada e inmutable del generador `m3u8-typed-arrays-ultimate.js`, asegurando que no existan regresiones en futuras versiones. Cualquier modificación al generador DEBE respetar estos pilares.

## 1. Arquitectura de Bloque por Canal (INVARIANTE)
1. **Primer Tag:** `#EXTINF:-1 ...`
2. **Segundo Tag:** `#EXT-X-STREAM-INF:...`
3. **Tercera Línea:** La `URL` del Stream (Siempre a **exactamente 2 líneas** del EXTINF).
4. **Cuarta Línea:** `#EXTHTTP:{...200 campos JSON...}`
5. **Quinta Línea:** `#EXT-X-APE-OVERFLOW-HEADERS:[BASE64_CORRECTO]`
6. **Sexta Línea en adelante:** `#EXTVLCOPT` y el resto de los ~480 tags APE.

## 2. Purity Rules: Serialización Base64 del Overflow (INVARIANTE)
El límite de Nginx impone que EXTHTTP no exceda ~10KB (200 headers). El resto (las variables de ISP, Fusión Fantasma, LCEVC) van en `#EXT-X-APE-OVERFLOW-HEADERS` codificadas en Base64.
- **PROHIBIDO:** Usar `btoa(JSON.stringify(...))` o `btoa(unescape(encodeURIComponent(...)))`. Estas funciones corrompen el JSON cuando existen caracteres multi-byte UTF-8, provocando la pérdida o el truncamiento del payload de Fusión Fantasma a mitad de cadena.
- **CORRECTO:** Se DEBE usar exclusivamente soporte Buffers explícito:
```javascript
const overflowB64 = Buffer.from(JSON.stringify(overflowHeaders), 'utf8').toString('base64');
```

## 3. Jerarquía y Tags Dinámicos (INVARIANTE)
- **LCEVC Base Codec:** El tag `#EXT-X-APE-LCEVC-BASE-CODEC` **NO debe estar hardcodeado** (ej. a "AV1"). Debe derivarse dinámicamente usando la función `getLcevBaseCodec(channelCodecString)` evaluando si la pista primaria es `av01`, `hev1` o `avc1`.
- **Cortex Omega:** Debe estar embebido en el loop de `generateChannelEntry`, interceptando el config y activando `OVERWRITE NUCLEAR` por cada canal evaluado en tiempo real.
- **IP / UA Rotation:** Las funciones `getRandomIp()` y `getRotatedUserAgent('random')` deben tirar los dados matemáticos por cada iteración del bucle, garantizando que el canal 1 tenga genoma distinto al canal 2.

## 4. Estructura Exacta del Overflow JSON (60 Campos)
El Base64 `#EXT-X-APE-OVERFLOW-HEADERS` DEBE contener un mínimo de estos 60 campos vitales en cada iteración del Payload:
- 1 campo Hydra Stealth.
- 16 campos LCEVC Core (Ej: `X-LCEVC-HW-Accel`, `X-LCEVC-Phase4-Mode`).
- 21 campos ISP Throttle Bypass (Ej: `X-ISP-Segment-Pipeline`, `X-ISP-Burst-Mode`, `X-ISP-TCP-Window`).
- 15 campos Cortex Omega (Ej: `X-Cortex-AV1-Deblocking`, `X-Cortex-Fallback-Chain`, `X-Cortex-VQS-Score`).

## 5. Módulos Adicionales Requeridos en Todos los Canales (Nuevos en Lista 6)
- **Cadena de Fallback AV1:** Exclusivo para canales P0 (107 canales).
- **Módulo de Audio Expandido:** Inyección de métricas precisas (Atmos, TrueHD, Bed/Objects, LUFS).
- **Módulo AI Temporal SR:** Habilitación de Super Resolución Temporal por Inteligencia Artificial.

## 6. Validación Intra-Generación (Safety Net)
El frontend JS debe ejecutar sistemáticamente la función `validateGeneratedList(channels)` antes de armar el Blob descargable, verificando:
- Total de canales = 6,910.
- Distribución de Codecs = 107 AV1 nativos, 6,803 HEVC nativos.
- Comprobación bidireccional de `getLcevBaseCodec()` iterada sobre la matriz real.
- `validateBase64Payload(b64, 60)` ejecutada en tiempo real atrapando la corrupción UTF-8 y abortando si falla.

Cualquier futura reescritura de código que rompa esta Santísima Trinidad (Orden URLs, B64 UTF-8 seguro, Tags Dinámicos) será considerada una regresión catastrófica y abortada inmediatamente.
