---
description: Arquitectura de software distribuido - Diseño Topológico de Alta Disponibilidad
---
# Diseño Topológico de Alta Disponibilidad (High Availability)

## 1. Definición Operativa
Capacidad de orquestar múltiples regiones geográficas y sistemas de conmutación por error (failover) con estado parcial o completo, eliminando Puntos Únicos de Fallo (SPOF). Implica diseñar la red, la replicación de datos y el enrutamiento para que la plataforma sobreviva a la destrucción física de datacenters completos sin intervención humana ni degradación perceptible.

## 2. Capacidades Específicas
- **Enrutamiento Activo-Activo Geográfico**: Trazar rutas de enrutamiento Anycast o DNS asíncrono para abstraer fallos de red oceánica.
- **Micro-Particionamiento de Bases de Datos Globales (Sharding)**: Segmentar cargas masivas de datos para que una zona caída solo degrade lectura eventual, no transaccional.
- **Resolución Topológica de Conflictos (CRDTs)**: Diseñar motores matemáticos para resolver colisiones de datos divergentes sin utilizar `Locks` destructivos.
- **Detección de Caídas Heurística (Health-Checks L7)**: Parametrización de heartbeats agresivos que detectan el colapso del Origin server antes de que el Load Balancer intente enviar peticiones muertas.

## 3. Herramientas y Tecnologías
**Consul, etcd, AWS Route53, Spanner, CockroachDB, Cloudflare Global Load Balancing, BGP.**

## 4. Métrica de Dominio
**Sostenibilidad de SLA 99.999% (5 nueves)** frente a caídas masivas de centros de datos. La persona es experta sí, al desenchufar bruscamente la zona de disponibilidad primaria, el tráfico redirige y estabiliza latencias en `< 200 milisegundos` (Recovery Time Objective - RTO), logrando una pérdida de transacciones del 0% (Recovery Point Objective - RPO).

## 5. Ejemplo Real Aplicado
**Netflix Chaos Engineering**: Sobrevivir a la caída de una zona de AWS completa (ej. US-East-1) sin interrumpir el streaming activo de millones de usuarios, reconectando sus decodificadores a los cachés secundarios de US-West-2 automáticamente en milisegundos, o en nuestro caso: **Reconfiguración del IPTV Resolver SSOT para redirigir tráfico VPS caído a un Nodo Secundario HETZNER oculto en tiempo real**.
