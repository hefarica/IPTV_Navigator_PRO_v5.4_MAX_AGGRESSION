---
description: Diseño de microservicios - Coreografía vs Orquestación
---
# Coreografía vs Orquestación

## 1. Definición Operativa
Despliegue de flujos hiper-complejos (compras, despliegues) resolviendo si un Director Central dirige los servicios, o si los servicios reaccionan autistas a Eventos Pub/Sub.

## 2. Capacidades Específicas
- Escritura de Sagas Orquestadas (AWS Step Functions / Camunda)
- Modelos 100% Coreografiados (Kafka Streams)
- Evitar the Distributed Monolith trap

## 3. Herramientas y Tecnologías
**Cadence, Temporal.io, Apache Kafka, Zeebe**

## 4. Métrica de Dominio
**Métrica Clave:** Cero bloqueos síncronos en workflows de más de 12 pasos de servicios heterogéneos inter-red.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Actualización y subida al VPS HETZNER: UI envía Evento, Microservicio-1 genera Lista, avisa al Microservicio-2 que Empaqueta GZIP, que avisa al Microservicio-3 que SCP y reporta éxito general.
