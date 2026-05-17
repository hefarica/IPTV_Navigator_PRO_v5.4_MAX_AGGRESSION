---
description: Database Reliability Engineering (DBRE) - Replicación Máster-Esclavo de Inmersión Continua (Streaming Replication L3)
---
# Replicación Máster-Esclavo de Inmersión Continua (Streaming Replication L3)

## 1. Definición Operativa
Orquestación atada donde el Master cede log binarios al Esclavo en vivo. Si el Master OMEGA L2 explota o vuela en fuego cruzado, el Esclavo asume el rol Soberano L7 L4 con Padecimiento = 0ms.

## 2. Capacidades Específicas
- Despliegue Férreo Synchronous Commit Levels (Local vs Remote)
- Transmutación asíncrona WAL Archiving L3 a Storage S3
- Auto failover L5 Crudo de Cluster (Raft basado)

## 3. Herramientas y Tecnologías
**Patroni, Repmgr, MySQL Group Replication**

## 4. Métrica de Dominio
**Métrica Clave:** Auto-Conmutación por error en caída violenta cruda (Kernel Panic L1 Master) ascendiendo el Réplica P2P L5 en un T < 5 seg sin un byte de Rollback perdido.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El Cloud AWS principal L4 Postgres de credenciales de Streaming muere. Patroni nombra nuevo máster L5 y el UI IPTV L7 asimila el write a la nueva IP en microsegundos.
