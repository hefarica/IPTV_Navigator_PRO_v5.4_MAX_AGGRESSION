---
name: Matemáticas, Control y Modelos Adaptativos (PhD Level)
description: Heurísticos evolutivos, predicción analítica de bandas, teoría de control aplicada a streaming.
---

# Dinámica de Sistemas y Control Algorítmico ABR

## 1. Modelado Estadístico Predictivo
- Extracción probabilística de fallos upstream: Construcción de una ventana deslizante de varianza temporal (TTFB, gap latency en los m3u8 chunks) para pronosticar una ruptura inminente de la cadena de suministro, milisegundos antes del Freeze. 

## 2. Control Adaptativo Basado en Multi-Ecuación
- Abandono de umbrales duros. Uso de Ecuaciones de Diferencia y PID Controllers (Proporcionales, Integrales, Derivativos) para pre-calcular `X-ABR-Multiplier` y su efecto sobre el reproductor final.
- Bandit Algorithms: Exploración vs Explotación constante del ancho de banda (hasta donde aguanta el ISP antes del Throttling/Micro-Stalls).

## 3. Mutadores Heurísticos
- Optimización evolutiva de configuraciones (ej: Reducción de frames perdidos = f(Buffer Size, Concurrent TCP Streams, ISP Grade) sujeto a Latencia E2E < 15 seg). Adaptar el JSON Profile Matrix en tiempo real usando combinaciones precalculadas.
