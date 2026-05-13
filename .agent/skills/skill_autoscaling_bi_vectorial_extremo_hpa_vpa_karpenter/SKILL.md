---
description: Ingeniería de Kubernetes - Autoscaling Bi-vectorial Extremo (HPA + VPA + Karpenter)
---
# Autoscaling Bi-vectorial Extremo (HPA + VPA + Karpenter)

## 1. Definición Operativa
Manipulación elástica y cuántica que no solo añade Pód (Instancias) por carga, sino que dimensiona los límites de CPU y Memoria (VPA) y escupe Nodos físicos en microsegundos (Karpenter).

## 2. Capacidades Específicas
- Configuración Node-less Just-in-time Nodes
- Cálculo en base a Custom Metrics (HPA via Prometheus)
- Definición del Resource Quota agresivo

## 3. Herramientas y Tecnologías
**Karpenter, Kubernetes Horizontal/Vertical Pod Autoscaler, KEDA**

## 4. Métrica de Dominio
**Métrica Clave:** Disparar clústeres desde 1 Nodo físico dormido a 100 Servidores en Amazon en 40 segundos absolutos tras pico orgánico televisivo.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> La Copa Mundial satura IPTV: Karpenter escupe 10 VPS extras que asumen carga antes del inicio del stream del minuto cero.
