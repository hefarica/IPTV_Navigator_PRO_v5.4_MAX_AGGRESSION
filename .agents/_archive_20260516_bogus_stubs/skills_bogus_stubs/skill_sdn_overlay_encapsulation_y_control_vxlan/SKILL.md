---
description: Networking avanzado (TCP/IP, BGP) - SDN/Overlay Encapsulation y Control VXLAN
---
# SDN/Overlay Encapsulation y Control VXLAN

## 1. Definición Operativa
Estiramiento de capas 2 Ethernet por sobre Internet cruda mediante encapsulado UDP matemático crudo para enlazar Nodos esparcidos como si habitaran bajo el mismo rack.

## 2. Capacidades Específicas
- Enrutamiento asimétrico super-puesto VXLAN / GENEVE L2
- Modulación cruda asíncrona WireGuard Cryptographic overlays L3
- Distribución Lógica MP-BGP EVPN control plane

## 3. Herramientas y Tecnologías
**WireGuard, Open vSwitch L3, Cilium L5, VxLAN L2 L4**

## 4. Métrica de Dominio
**Métrica Clave:** Transmisión Segura mTLS a Line-Rate Crudo Hardware limitando el overhead de TCP y MTU L4 del Overlay a Sub 2ms.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Conectar Servidor Alemán HETZNER y VPS Oculto L5 Offshore creando una VPN cifrada y red local L2 en donde el Stream TS cruza libre sin encriptar pesadamente L7 L4.
