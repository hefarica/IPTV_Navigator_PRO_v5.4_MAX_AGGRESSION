---
description: Ingeniería de sistemas a gran escala - Mitigación del Problema del 'Thundering Herd'
---
# Mitigación del Problema del 'Thundering Herd'

## 1. Definición Operativa
Protección algorítmica donde millones de sistemas despiertan en el mismo instante e intentan reconstruir o acceder a los mismos recursos.

## 2. Capacidades Específicas
- Inyectar Splay y Jitter matemático aleatorio
- Usar Request Coalescing para agrupar idénticos queries
- Explotar Lock Distribution Management

## 3. Herramientas y Tecnologías
**Nginx proxy_cache_lock, Redis Redlock, Varnish**

## 4. Métrica de Dominio
**Métrica Clave:** Asimilar un ataque coordinado/reinicio masivo limitando las peticiones al origin backend a estrictamente 1 query único.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> 50,000 reproductores de IPTV se desconectan y piden la playlist M3U8 simultáneamente; el resolver atiende al primero y duplica la memoria virtual para los otros 49,999.
