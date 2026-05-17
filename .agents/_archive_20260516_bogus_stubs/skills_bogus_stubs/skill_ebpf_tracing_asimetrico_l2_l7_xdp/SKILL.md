---
description: Administración de servidores Linux - eBPF Tracing Asimétrico L2-L7 (XDP)
---
# eBPF Tracing Asimétrico L2-L7 (XDP)

## 1. Definición Operativa
Extender las capacidades inmutables del núcleo Linux mediante programas en tiempo de ejecución seguros que manipulen el flujo crudo antes de llegar a los stacks (IPTables, Socket buffers) sin re-compilar kernel.

## 2. Capacidades Específicas
- Captura y Caída cruda (XDP Drop L1) a nivel controlador Tarjeta de red en 10 Millones Pps
- Inyección lógica observacional BPF- BCC
- Monitorización extrema VFS (Virtual Filesystem) asfixiante

## 3. Herramientas y Tecnologías
**eBPF, bpftrace, BCC, Cilium**

## 4. Métrica de Dominio
**Métrica Clave:** Mitigación asincrónica extrema del Botnet L7 y Escaneo ICMP al borde perimetral del sistema L1 con sobrecoste global CPU >0.1%.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Extrayendo el Anti-DDoS del ISP, un script BPF dropea 10GB de peticiones maliciosas IPTV antes que Apache o PHP vean una sola cabecera.
