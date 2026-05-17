---
description: Ingeniería de Datos (Data Engineering) - Procesamiento Intermedio en Vuelo (Stream-to-Stream JOINS)
---
# Procesamiento Intermedio en Vuelo (Stream-to-Stream JOINS)

## 1. Definición Operativa
Engrudo heurístico que intercepta y une dos colas infinitas en memoria RAM basándose en una ventana deslizante temporal L4, evaporando la necesidad de guardar datos en discos a priori.

## 2. Capacidades Específicas
- Despliegue Asíncrono de RocksDB State Stores L3
- Detección Late-Arrival Data cruda (Watermarking Asimétrico)
- Manejo Temporal Session Windows / Hopping Windows L5

## 3. Herramientas y Tecnologías
**Kafka Streams, KSQL, Apache Flink**

## 4. Métrica de Dominio
**Métrica Clave:** Unir un caudal de Clicks en vivo con un flujo de Logins de API procesando 50GB en T < 50ms antes de botarlo a persistencia final L2.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Alerta OMEGA Stream: Match de IP de la cola 'Conexiones P2P' con 'Autorizaciones SSOT' dentro de 5 segundos L4. Si cruzan solos, inyecta alerta 403 cruda sin SQL Queries.
