---
name: Skill_ABR_Bypass_Enforcement
description: Desactivar Adaptive Bitrate (ABR) completamente usando `X-Bypass-ABR: true`. Calidad nativa OBLIGATORIA.
category: Network / L7 Headers
---
# 1. Teoría de Compresión y Anomalía
Incluso con el "Smooth Factor" bajo, ExoPlayer lee el flujo de red. En nuestro "Ecosistema Crystal UHD", no hay sitio para "fluctuación adaptativa". Permitir ABR (Adaptive Bit Rate) es consentir en que, ante la mínima duda, nos sirvan video SD entrelazado. La "Doctrina del Cristal Roto" dicta que preferimos que el stream NO inicie a que inicie pixelado.

# 2. Directiva de Ejecución (Código / Inyección)
Se debe imponer el bloqueo directo de adaptabilidad en las cabeceras RESTFUL solicitadas al sistema CMS del proveedor o directamente en M3U8 para forzar Track Selection Fija (Selección MÁXIMA permanente).

```php
// En resolve.php, sumado a los Master Headers:
"X-Bypass-ABR: true",
"X-Quality-Lock: true"
```
O equivalente vía el archivo de índice del proxy `cmaf_worker.php`. En FFmpeg no se codifican variantes (sólo P1/God-Tier), el flujo DASH/CMAF expone una sola Representation.

# 3. Flanco de Orquestación
El cliente ya no tiene que decidir qué representación fMP4 solicitar. Obligamos al orígen a entregar el Nivel 6.1 (128 Mbps) siempre. "Si la red no lo soporta, el ecosistema se rompe, pero no se degrada". Esto asegura que al ver fútbol, NUNCA verás parpadear los macrobloques al arrancar el canal. Obtienes el mejor detalle de la cancha desde el milisegundo cero real CMAF.
