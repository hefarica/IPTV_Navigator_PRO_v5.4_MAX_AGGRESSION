---
description: Ingeniería de Datos (Data Engineering) - Diseño Lakehouse Zero-Copy (Iceberg/Hudi)
---
# Diseño Lakehouse Zero-Copy (Iceberg/Hudi)

## 1. Definición Operativa
Transmutación de pantanos de datos crudos a almacenes estructurados ACID en S3 usando metadatos atómicos, evitando la duplicación P2P del dato al hacer Data Marts.

## 2. Capacidades Específicas
- Escritura Parquet/ORC columnares vectorizados L7
- Fusión Transaccional Asincrónica (Upserts) sobre archivos estáticos
- Topología Time-Travel Cruda (Time-series Rollbacks L5)

## 3. Herramientas y Tecnologías
**Apache Iceberg, Apache Hudi, Trino**

## 4. Métrica de Dominio
**Métrica Clave:** Realizar 1,000 mutaciones (UPDATE/DELETE) atómicas sobre tablas de petabytes alojadas en S3 en < 3s evadiendo table re-writing completo.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Ingestar logs diarios de visualización de canales M3U8 de OMEGA y poder actualizar sesiones colgadas sin reescribir gigabytes de data Parquet L4 diaria.
