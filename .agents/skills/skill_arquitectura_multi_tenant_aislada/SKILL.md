---
description: Ingeniería de sistemas a gran escala - Arquitectura Multi-Tenant Aislada
---
# Arquitectura Multi-Tenant Aislada

## 1. Definición Operativa
Desacople estricto de tráfico e información de clientes distintos sobre la misma base de binarios minimizando ruidos de vecinos (Noisy Neighbors).

## 2. Capacidades Específicas
- Enrutar tenants pesados a nodos aislados dinámicamente
- Separar namespaces lógicos en base de datos
- Asignación dinámica de prioridades (QoS L7) por Tenant

## 3. Herramientas y Tecnologías
**Cilium, PostgreSQL Row-Level Security, Kubernetes Namespaces**

## 4. Métrica de Dominio
**Métrica Clave:** Ataque o abuso de recursos de 1 cliente aislado en <5ms afectando al origin un 0%.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Separación de recursos lógicos IPTV entre clientes que ven FHD y los que sobrecargan el pipe de 4K, protegiendo al resto.
