---
description: Ingeniería de Kubernetes - Scheduling Táctico (Taints, Tolerations, y Pod Affinity)
---
# Scheduling Táctico (Taints, Tolerations, y Pod Affinity)

## 1. Definición Operativa
Posicionamiento hiperinteligente que asigna la carga de la aplicación al nodo más conveniente, garantizando que servicios pesados no estrangulan servicios ligeros.

## 2. Capacidades Específicas
- Afinar Anti-Affinity extremo para Anti-SPOF multi-zona
- Desplegar Taints críticos atando Bases de Datos a Nodos específicos
- Gestión matemática y desfragmentación de CPU L5

## 3. Herramientas y Tecnologías
**kube-scheduler, K8s descheduler**

## 4. Métrica de Dominio
**Métrica Clave:** Límite del Overcommit con factor multiplicador del nodo 4x y Zero Evictions Out-of-memory crónicos en carga extrema.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Expulsar automáticamente a los contenedores HLS pesados FFmpeg del nodo del Resolver SSOT para garantizar que la API nunca muera de asfixia.
