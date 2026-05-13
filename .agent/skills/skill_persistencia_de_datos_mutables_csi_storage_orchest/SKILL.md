---
description: Ingeniería de Kubernetes - Persistencia de Datos Mutables (CSI Storage Orchestration)
---
# Persistencia de Datos Mutables (CSI Storage Orchestration)

## 1. Definición Operativa
Gobernanza perfecta atando bases de datos críticas a contenedores de vida transitoria, garantizando su atadura instantánea L2 sin corrupciones de iNodes o Locks lógicos.

## 2. Capacidades Específicas
- Aprovisionamiento dinámico Block Storage IOPS altos L1
- Asegurar ReadWriteMany vs ReadWriteOnce L4
- Despliegue de StatefulSets consistentes con ordinalidad estricta

## 3. Herramientas y Tecnologías
**Rook, Ceph, AWS EBS CSI, OpenEBS**

## 4. Métrica de Dominio
**Métrica Clave:** Recuperación, recableo y montura de Bases RDBMS y NoSQL (5TB PVC) en otro host físico L5 caído en < 5 segundos continuos.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El Nodo 1 muere quemado, el contenedor MySQL de OMEGA aterriza en Nodo 2 montando su Storage SSD distribuido aliviando al resto de conexiones.
