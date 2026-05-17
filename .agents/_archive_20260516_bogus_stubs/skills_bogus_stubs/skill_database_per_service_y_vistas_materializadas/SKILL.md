---
description: Diseño de microservicios - Database per Service y Vistas Materializadas
---
# Database per Service y Vistas Materializadas

## 1. Definición Operativa
Resuelve la imposibilidad de hacer un JOIN SQL gigante en base de datos al forzar la replicación y condensación asíncrona de datos foráneos.

## 2. Capacidades Específicas
- Change Data Capture (CDC)
- Creación de Proyecciones CQRS
- Sincronía Eventual Agresiva Multi-Master

## 3. Herramientas y Tecnologías
**Debezium, Kafka Connect, Materialize DB**

## 4. Métrica de Dominio
**Métrica Clave:** Permitir queries complejos estilo Join relacional entre 4 Microservicios que arrojan resultados instantáneos (<5ms) pre-calculados.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> La tabla dashboard de usuarios IPTv cruza Logins SSOT, Resoluciones y Facturación en microsegundos porque una vista CDC se mantuvo preconstruyendo.
