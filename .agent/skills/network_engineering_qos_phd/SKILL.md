---
name: Ingeniería de Redes y QoS (PhD Level)
description: Comportamientos oscilatorios de TCP/UDP, priorización de tráfico y matemática de colas (DSCP, BBR).
---

# Telemetría Perimetral e Ingeniería de Tráfico

## 1. Patrones de Transporte y Congestión
- **Ruptura de la Pila OSI:** Explotación de los límites mecánicos del protocolo TCP frente a ráfagas de video alto bitrate en Vivo (hol-blocking).
- **Algoritmos de Congestión:** Entendimiento de TCP Cubic (asentado en pérdidas) frente a esquemas de congestión basados en retardos como TCP BBR (Bottleneck Bandwidth and Round-trip propagation time) y su superioridad en streaming.

## 2. QoS (Quality of Service) Activa
- **DSCP (Differentiated Services Code Point):** Manipulación forzosa de la cabecera IP para exigir prioridad "Expedited Forwarding (EF)" a enrutadores intermedios del ISP.
- **Fair-Queuing y Traffic Shaping:** Asignación garantizada de anchos de banda para conexiones críticas, evitando el estrangulamiento artificial mediante Múltiples TCP Connections Concurrentes.

## 3. Feedback Neuro-Adaptativo
- Recolección microscópica del `buffer_size` subyacente de red (Rx/Tx buffers).
- Intervención y mutación del ancho de banda (`adaptive-maxbw`) utilizando telemetría indirecta del RTT / Latency TTFB.
