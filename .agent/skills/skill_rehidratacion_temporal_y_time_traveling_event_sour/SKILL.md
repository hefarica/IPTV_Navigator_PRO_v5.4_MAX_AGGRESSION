---
description: Sistemas event-driven (Kafka, NATS) - Rehidratación Temporal y Time-Traveling (Event Sourcing)
---
# Rehidratación Temporal y Time-Traveling (Event Sourcing)

## 1. Definición Operativa
Borrar por error o bugs la base de datos completa de MongoDB y reconstruir toda la línea de tiempo corporativa replayeando el Topic Inmutable.

## 2. Capacidades Específicas
- Inyección matemática de snapshots para eficientar el Replay
- Ajuste agresivo de Retention Policies & Log Compaction
- Reinicio controlado de Offsets en cascada

## 3. Herramientas y Tecnologías
**Kafka Log Compaction, Event Store DB**

## 4. Métrica de Dominio
**Métrica Clave:** Recuperar la realidad o forjar una nueva versión del base de datos en 30 minutos iterando millones de estados pasados inmutables.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El backend IPTV fue hackeado y reventaron el modelo relacional Postgres, se rehidrata corriendo las conexiones del proxy Kafka y el state re-emerge íntegro a ayer.
