---
description: Ingeniería de sistemas a gran escala - Throttling Bi-Vectorial y Backpressure
---
# Throttling Bi-Vectorial y Backpressure

## 1. Definición Operativa
Pausar o ralentizar la ingesta de manera agresiva avisando al cliente que desacelere antes de matar los hilos del servidor (Asfixia controlada).

## 2. Capacidades Específicas
- Emitir 429 Retry-After preventivos
- Limitar los TCP Window sizes (L4) y Token Bucket
- Control de concurrencia per-worker

## 3. Herramientas y Tecnologías
**Envoy Ratelimits, Nginx ngx_http_limit_req, TCP BBR**

## 4. Métrica de Dominio
**Métrica Clave:** Prevención total de Crash (0% Error 500) a 200% de la capacidad de red aceptando caídas de request fluidas.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> ExoPlayer recibe Header Backpressure para que desacelere la petición de segmentos CMAF dejando respirar al VPS.
