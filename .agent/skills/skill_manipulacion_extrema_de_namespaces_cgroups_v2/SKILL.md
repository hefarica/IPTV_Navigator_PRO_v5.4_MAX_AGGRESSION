---
description: Administración de servidores Linux - Manipulación Extrema de Namespaces & Cgroups v2
---
# Manipulación Extrema de Namespaces & Cgroups v2

## 1. Definición Operativa
Crear jaulas férreas microscópicas inalienables controlando tajantemente recursos L4 L5 aislando PID, Mounts, Nets a servicios no confiables sin usar Docker (Bare-Metal).

## 2. Capacidades Específicas
- Asignación CPU limit/sets hardcoded para aislar ruidosos (Noisy neighbor)
- Invocación Chroot / Unshare Módulos seguros
- Dominio del Unified Hierarchy de cgroups V2 Crudo L3

## 3. Herramientas y Tecnologías
**cgroups-v2, unshare, systemd-run, nsenter**

## 4. Métrica de Dominio
**Métrica Clave:** Restringiendo procesos ffmpeg L5 a que jamás pisen un misero milisegundo de las CPUs designadas al Database Resolver Core L7.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> El `resolve_quality.php` ejecuta un script externo alocado. Cgroup V2 le impone 200MB máximo RAM dictatorial antes de matarlo vía OOM local evitando el crasheo.
