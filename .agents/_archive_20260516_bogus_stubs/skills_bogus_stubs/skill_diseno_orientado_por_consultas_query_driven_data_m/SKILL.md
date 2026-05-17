---
description: Ingeniería de bases NoSQL - Diseño Orientado por Consultas (Query-Driven Data Modeling)
---
# Diseño Orientado por Consultas (Query-Driven Data Modeling)

## 1. Definición Operativa
A diferencia de SQL, aquí se modela primero la pregunta específica qué el Frontend L7 va a hacer, y luego se diseñan llaves complejas que arrojen el objeto atómico pre-calculado.

## 2. Capacidades Específicas
- Inyección táctica del Patrón Single-Table Design profundo
- Creación matemática de Composite Keys en Base 64/Hashing
- Resolución instantánea Local Secondary Indexes (LSI) y GSI

## 3. Herramientas y Tecnologías
**DynamoDB, Cassandra, NoSQL Workbench**

## 4. Métrica de Dominio
**Métrica Clave:** Resolución pre-agregada multi-entidad con coste unitario físico O(1) Fetch en tiempo < 5 milisegundos latencia media sin JOINs.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Cuando el UI solicita 'Grupo Deportivo Y Proveedor TIVI-OTT', Cassandra responde devolviendo todos los objetos JSON M3U8 listos en 1 milisegundo.
