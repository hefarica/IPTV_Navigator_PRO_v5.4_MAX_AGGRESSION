---
description: Ingeniería de bases de datos SQL - Optimización Index-Only O(1) y Partial B-Trees
---
# Optimización Index-Only O(1) y Partial B-Trees

## 1. Definición Operativa
Crear índices tácticos quirúrgicos donde el motor SQl no necesita tocar el disco físico, recuperando los datos del índice mismo en RAM.

## 2. Capacidades Específicas
- Inyección brutal de Partial Indexes (`WHERE is_active = true`)
- Covering Indexes (`INCLUDE (column)`)
- Análisis avanzado `EXPLAIN ANALYZE` eliminando Seq Scans

## 3. Herramientas y Tecnologías
**PostgreSQL EXPLAIN ANALYZE, MySQL Optimizer Trace**

## 4. Métrica de Dominio
**Métrica Clave:** Acelerar un SELECT denso de 2,000ms de latencia a < 5ms resolviendo un millón de filas directamente de la caché del índice B-Tree.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Búsqueda instantánea PWA en el IPTV Navigator con el Query Search Channel escaneando 50,000 filas en tiempo real en cada tecleo usando índices lógicos.
