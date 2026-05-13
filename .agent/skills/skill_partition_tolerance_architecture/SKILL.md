---
description: Arquitectura de software distribuido - Partition Tolerance Architecture
---
# Partition Tolerance Architecture

## 1. Definición Operativa
Construcción enfocada en la robustez frente a particiones de partición de red profundas (The P in CAP Theorem).

## 2. Capacidades Específicas
- Elegir AP vs CP dinámicamente según el endpoint
- Prevenir Brain Split en clusters de estado (Quorum)
- Explotar Anti-Entropy Protocols (Gossip)

## 3. Herramientas y Tecnologías
**Zookeeper, DynamoDB, Serf**

## 4. Métrica de Dominio
**Métrica Clave:** Recuperación de quorum y reconciliación de 10GB de estado en <30 segundos tras reconexión.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Sincronización de credenciales maestras entre nodos IPTV si se corta la red oceánica que los une.
