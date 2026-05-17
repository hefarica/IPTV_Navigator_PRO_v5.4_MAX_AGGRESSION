---
description: Ingeniería de bases NoSQL - Tuning y Afinación del Storage Engine (LSM-Tree y SSTables)
---
# Tuning y Afinación del Storage Engine (LSM-Tree y SSTables)

## 1. Definición Operativa
Entender la capa física del almacenamiento Log-Structured Merge-Tree y afinar las compactaciones para erradicar Write Amplifications o estrangulamientos de lectura.

## 2. Capacidades Específicas
- Diagnóstico de bloom filters tuning local y global
- Ajuste supremo de Compaction Strategies (Size-tiered vs Leveled)
- Mitigación del Tombstone Overload

## 3. Herramientas y Tecnologías
**Cassandra nodetool, RocksDB, ScyllaDB configs**

## 4. Métrica de Dominio
**Métrica Clave:** Absorber picos de trillones de escrituras (IoT/Logs) anulando el SSD I/O spike y read degradaciones transitorias al 0% observable.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Logging brutal y crudo continuo cada 1 segundo del ancho de banda y uso de la API en `guardian.php` HLS sin agotar I/O IOPs de VPS.
