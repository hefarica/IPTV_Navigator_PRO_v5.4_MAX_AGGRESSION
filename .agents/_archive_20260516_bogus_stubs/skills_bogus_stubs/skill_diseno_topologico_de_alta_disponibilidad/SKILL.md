---
description: Arquitectura de software distribuido - Diseño Topológico de Alta Disponibilidad
---
# Diseño Topológico de Alta Disponibilidad

## 1. Definición Operativa
Capacidad de orquestar múltiples regiones geográficas y sistemas de conmutación por error (failover) con estado parcial o completo, eliminando Puntos Únicos de Fallo (SPOF).

## 2. Capacidades Específicas
- Trazar rutas de enrutamiento activo-activo
- Establecer estrategias de particionamiento de bases de datos globales (Sharding)
- Diseñar motores de resolución de conflictos tipo CRDT para redes distribuidas

## 3. Herramientas y Tecnologías
**Consul, etcd, AWS Route53, Spanner, CockroachDB**

## 4. Métrica de Dominio
**Métrica Clave:** Sostenibilidad de SLA 99.999% (5 nueves) frente a caídas masivas de centros de datos completos.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Netflix Chaos Engineering: Sobrevivir a la caída de una zona AWS completa sin interrumpir el streaming activo de millones de usuarios.
