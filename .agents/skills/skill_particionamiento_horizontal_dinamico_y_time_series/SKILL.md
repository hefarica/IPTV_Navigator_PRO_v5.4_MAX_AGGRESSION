---
description: Ingeniería de bases de datos SQL - Particionamiento Horizontal Dinámico y Time-Series SQL
---
# Particionamiento Horizontal Dinámico y Time-Series SQL

## 1. Definición Operativa
La capacidad de romper tablas gigastrónomas en pedazos imperceptibles geográficamente o temporalmente que se leen y destruccionan fácil (Retention).

## 2. Capacidades Específicas
- Diseño brutal y crudo de Table Partitioning Declarativo
- HyperTables e inyección masiva en modo Chunking L5
- Eliminación de millones de filas puramente borrando una Partición O(1)

## 3. Herramientas y Tecnologías
**TimescaleDB, Postgres Partitioning, MySQL Range**

## 4. Métrica de Dominio
**Métrica Clave:** Ingestar 5TB de logs transaccionales a velocidad constante (O(1) Inserts) y limpiar históricas pasadas al milisegundo mediante DROP TABLE.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Ingestión del ping incesante de salud (/health.php) de todo el tráfico de la CDN Proxy IPTV para graficar VMAF e I/O bloqueados.
