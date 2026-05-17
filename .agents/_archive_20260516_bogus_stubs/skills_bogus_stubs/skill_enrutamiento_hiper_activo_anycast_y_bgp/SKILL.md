---
description: Networking avanzado (TCP/IP, BGP) - Enrutamiento Hiper-Activo Anycast y BGP
---
# Enrutamiento Hiper-Activo Anycast y BGP

## 1. Definición Operativa
Control global del protocolo Border Gateway Protocol (L4 L7 L3 L1) diseminando una misma IP única en múltiples ubicaciones terrestres atrayendo a los clientes al ruteador más veloz L5 local.

## 2. Capacidades Específicas
- Modulación heurística asimétrica BGP AS-PATH Prepending L4
- Negociación Full-Routing Table eBGP con ISP L2 L3
- Protección Activa Blackholing L5 BGP (RTBH)

## 3. Herramientas y Tecnologías
**BIRD, FRRouting, ExaBGP, PeeringDB**

## 4. Métrica de Dominio
**Métrica Clave:** Resolver peticiones O(1) geográficas disminuyendo latencias transatlánticas de 200ms al servidor Anycast adyacente a < 15ms L5.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> La IP principal `178.156.147.x` siendo devuelta a un usuario en Europa mientras BGP tira la Peticion americana a un servidor C-Edge Miami L5 instántaneo L7.
