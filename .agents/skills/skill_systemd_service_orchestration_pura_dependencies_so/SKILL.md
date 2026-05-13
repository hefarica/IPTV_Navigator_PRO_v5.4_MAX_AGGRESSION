---
description: Administración de servidores Linux - Systemd Service Orchestration Pura (Dependencies & Sockets L7 L5)
---
# Systemd Service Orchestration Pura (Dependencies & Sockets L7 L5)

## 1. Definición Operativa
Crear dependencias simbióticas lógicas (Requiere Network L2 / Depende de DbCore L5), programar restarts heurísticos (RestartSec y Watchdog L4) y activar micro-servicios crudos por Socket-Activation L3 L5 L7.

## 2. Capacidades Específicas
- Programación Watchdog Timeout Notifications lógicas L5
- Crear Network-Namespace Bound Services L7
- Aislar Security Capabilities L6 (`NoNewPrivileges=yes`)

## 3. Herramientas y Tecnologías
**systemd, systemctl, systemd-socket-activate**

## 4. Métrica de Dominio
**Métrica Clave:** Supervivencia eterna. Si el software maestro PHP FPM o GoBin muere L5, reencarna orgánicamente L4 sin dropear el socket en espera L3.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El `guardian.php` es disparado por un timer de systemd crudo interno cada 1s garantizando CPU Prioritaria y cero bloqueos cronológicos.
