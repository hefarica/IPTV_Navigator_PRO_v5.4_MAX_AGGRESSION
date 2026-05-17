---
name: sincronizador_hibrido_supremo
description: Arquitectura de "Premio Nobel" que fusiona Latencia Rayo (<500ms) con Headroom Inmenso (>=300%) mediante la técnica asimétrica Double-Ended Buffer (Buffer Dual), logrando lo mejor de ambos mundos: encendido instantáneo y 0 cortes anuales.
---

# Sincronizador Híbrido Supremo (Double-Ended Buffer / "Premio Nobel")

## Objetivo

Lograr el Santo Grial del IPTV: **reproducción instantánea en menos de 500 milisegundos (Latencia Rayo)** coexistiendo con **un colchón de seguridad masivo superior a los 300 segundos de video (Headroom >= 300%)**, asegurando un streaming con 0 cortes a lo largo del año.
Esta habilidad reconcilia lo que físicamente era una contradicción técnica.

## Filosofía: El Buffer Asimétrico ("Double-Ended Buffer")

Para evadir la contradicción física (buffer pequeño=inicio rápido pero riesgo alto vs. buffer enorme=inicio lento pero riesgo cero), utilizaremos un modelo dividido en el reproductor:

1. **Punta Inicial (Micro-Target):** Instruye al reproductor que solo necesita almacenar 0.5s a 1s de video (`X-Min-Buffer-Time`, `X-Buffer-Min`) para renderizar el primer fotograma.
2. **Cola de Crecimiento Asintótico (Massive Max):** Instruye al reproductor que su "techo" o tolerancia de crecimiento es brutalmente amplia (`X-Buffer-Max`, `X-Max-Buffer-Time`).
3. **Descarga en las Sombras:** Utilizamos descargas asíncronas paralelas (Prefetch paralelo) activas mediante `LatencyRayo` y `Sincronizador Netflix` simultáneamente. El video inicia en 0.5s pero el CPU descarga "en la sombra" los próximos 300 segundos sin bloquear la UI.

## Procedimiento de Implementación (Resolver PHP VPS)

Cada vez que se active esta habilidad o se revisen los módulos del backend, asegúrate de aplicar estas reglas a `resolve.php`:

1. **Soberanía y Recalibración Profunda (Deep Recalibration):**
   - El backend VPS no solo solicita alta calidad, sino que utiliza una **Sonda de Inteligencia** proactiva (`probeOriginResolution`) para detectar variantes 4K/8K en el origen.
   - Al detectar una resolución superior, el sistema realiza una **Escalación de Perfil Completa** (ej: P3 → P2), garantizando que el stream herede no solo la resolución, sino los 120+ headers de color BT.2020, prioridad ultra-high y buffers industriales de la gama premium.

2. **Ajuste Asimétrico Extremista de Headers:**
   - `X-Buffer-Min`: Ajustar a un valor diminuto, por ejemplo `500` (ms).
   - `X-Min-Buffer-Time`: Igual a `0.5` o `1` (segundo).
   - `X-Buffer-Target`: Continuar en el valor alto, ej: `buffer_ms`.
   - `X-Buffer-Max`: El techo máximo de headroom, ej: `buffer_ms * 4`.

3. **Inyección Front-End:**
   - Habilitar, **simultáneamente y sin conflicto**, la `Latencia Rayo` y los 15 módulos del `sincronizador_netflix_max` desde el `generation-controller.js`.

## Regla de Oro

- **NUNCA** asumas que la latencia ultrabaja requiere recortar el "buffer total". Siempre recorta *solo* el "buffer inicial/mínimo" (`X-Min-Buffer-Time`), permitiendo que el sistema de prefetch asíncrono infle silenciosamente el colchón (`X-Max-Buffer-Time`) durante los primeros segundos del stream.
- Esta habilidad marca el hito donde los buffers dejan de ser fijos y se convierten en tensores elásticos.
