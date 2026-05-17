---
description: Ingeniería de Kubernetes - Defensa Activa Kube-Native L4 (Network Policies)
---
# Defensa Activa Kube-Native L4 (Network Policies)

## 1. Definición Operativa
Aislamiento microscópico donde ningún POD, por defecto, puede hacer Ping al de al lado a menos que se defina la ley suprema IP L3 y Namespace L7 autorizándolo.

## 2. Capacidades Específicas
- Configuración atómica con Cilium eBPF Security
- Aplicación de Deny-all Ingress/Egress en CNI
- Micro-firewalling inter-servicio en L7 de eBPF

## 3. Herramientas y Tecnologías
**Cilium, Calico, kube-router**

## 4. Métrica de Dominio
**Métrica Clave:** Si un pod es asimilado por RCE remoto (Explotado L7), el Hacker tiene 0 visibilidad L1/L4/L7 externa, limitando la explosión 100%.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Pod Generator M3U8 es hackeado; el intruso L7 no puede usar curl porque el Egress CNI calico L5 bloquea cualquier salida distinta a puerto 80 del usuario.
