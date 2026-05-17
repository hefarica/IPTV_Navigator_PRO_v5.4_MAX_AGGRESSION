---
description: Sistemas event-driven (Kafka, NATS) - Procesamiento Intermedio en Vuelo (Stream Processing)
---
# Procesamiento Intermedio en Vuelo (Stream Processing)

## 1. Definición Operativa
Habilidad de transformar, enriquecer, hacer cruces de 2 arroyos paralelos y ventana de tiempo sin detener la data a un disco tradicional.

## 2. Capacidades Específicas
- Uso avanzado de Sliding/Hopping Time Windows (Ej 5-seconds window)
- State-store Streams KTables (Join on-the-fly)
- Alerta e interrupción por Eventos Derivados Sintéticos

## 3. Herramientas y Tecnologías
**Kafka Streams, Flink, ksqlDB, Apache Spark Streaming**

## 4. Métrica de Dominio
**Métrica Clave:** Calcular una métrica de QoS global basándose en 50,000 latencias en vivo entregando resultados agregados en T < 100ms a dashboards UI.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Detectar que un canal deportivo m3u8 (FHD) está estrangulado L7 (Buffering) si hay más de 50 requests pausando el chunk, y cambiar inmediatamente la resolución adaptativa para la flota.
