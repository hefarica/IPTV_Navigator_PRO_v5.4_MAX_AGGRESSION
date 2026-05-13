---
description: Sistemas event-driven (Kafka, NATS) - Topología Pub/Sub de Latencia Nuclear L2 (Drones/IoT)
---
# Topología Pub/Sub de Latencia Nuclear L2 (Drones/IoT)

## 1. Definición Operativa
Uso de Brokers ultraligeros de alto rendimiento para propagar un 'Fire-And-Forget' o estados instantáneos que demandan nanosegundos.

## 2. Capacidades Específicas
- Optimización de NATS Core Subjects y Wildcards masivos
- Despliegue del patrón NATS JetStream para persistencia ultraligera
- Leaf nodes en el borde (Edge Computing IoT)

## 3. Herramientas y Tecnologías
**NATS, MQTT Brokers, eBPF**

## 4. Métrica de Dominio
**Métrica Clave:** Ruteo cruzado N a N de 2 Millones de mensajes diminutos (128bytes) en una red LAN y VPN en sub-2ms reales.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Transmitir la geoubocación en tiempo real (Tick 3 segundos) de ingenios agrícolas al mapa logístico del UI usando latencia indetectable.
