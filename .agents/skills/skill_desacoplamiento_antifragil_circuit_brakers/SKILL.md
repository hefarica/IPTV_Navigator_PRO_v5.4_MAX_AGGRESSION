---
description: Arquitectura de software distribuido - Desacoplamiento Antifrágil (Circuit Brakers)
---
# Desacoplamiento Antifrágil (Circuit Brakers)

## 1. Definición Operativa
Mecanismos matemáticos que previenen la falla en cascada, cortando dependencias caídas y devolviendo respuestas degradadas inmediatamente.

## 2. Capacidades Específicas
- Parametrizar umbrales de latencia y tasas de error
- Programar fallbacks semánticos y proxies estáticos
- Manejar reconexión exponencial y Jitter

## 3. Herramientas y Tecnologías
**Istio, Envoy, Resilience4j, Hystrix (Legacy)**

## 4. Métrica de Dominio
**Métrica Clave:** Aislamiento de la falla en origin en menos de 50ms, sirviendo el 100% de requests mediante fallback.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Si la API de Xtream Codes falla, el Resolver devuelve la última M3U8 generada en RAM de forma invisible.
