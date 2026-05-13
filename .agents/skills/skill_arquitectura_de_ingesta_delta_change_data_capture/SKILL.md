---
description: Ingeniería de Datos (Data Engineering) - Arquitectura de Ingesta Delta (Change Data Capture)
---
# Arquitectura de Ingesta Delta (Change Data Capture)

## 1. Definición Operativa
La capacidad de absorber latidos de bases relacionales usando lectura de logs binarios asincrónicos, inyectando los cambios a un Data Lake en <1 segundo sin afectar los IOPS del servidor principal.

## 2. Capacidades Específicas
- Manipulación binaria de WAL/Binlogs
- Despliegue Debezium-to-Kafka L4
- Reagrupación asincrónica Exactly-Once

## 3. Herramientas y Tecnologías
**Debezium, Kafka Connect, PostgreSQL Logical Decoding**

## 4. Métrica de Dominio
**Métrica Clave:** Absorción de 100,000 UPDATEs transaccionales/seg hacia S3 asegurando el impacto L3 en el motor de base de datos origen es < 1%.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El motor logístico de frentes agrícolas refleja la llegada de un camión en el ERP; CDC lo transporta instantáneamente en microsegundos al cluster de KPIs OMEGA para actualizar semáforos.
