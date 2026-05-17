---
name: Skill_KODIPROP_InputStream_Adaptive_HLS
description: Directiva de hardware que fuerza el parseo de manifiestos HLS al motor InputStream Adaptive en reproductores basados en ExoPlayer/Kodi, apuñalando el parser genérico de FFmpeg para lograr zapping de <800ms.
---

# Skill_KODIPROP_InputStream_Adaptive_HLS

## 1. El Bloqueo del Demuxer Nativo
Por defecto, reproductores como Kodi y versiones genéricas de OTT Navigator utilizan los bindings subyacentes de \`libavformat\` (FFmpeg) como demuxer (parser) universal para leer flujos de internet. 
El parser FFmpeg genérico asume que está bajando un \`.ts\` monolítico de VOD y **no está diseñado nativamente para interaccionar con directivas complejas de Low-Latency HLS** (como las etiquetas \`SERVER-CONTROL\`, \`PART-TARGET\` o micro-fragmentos CMAF). Como resultado, la pre-computación estalla añadiendo de 3 a 4 segundos de Black Screen durante el Zapping.

## 2. Abriendo el Túnel Directo: InputStream Adaptive
Para forzar a la bestia (el dispositivo Android TV) a leer el XML/M3U8 con su motor C++ dedicado a transmisiones adaptables de grado Netflix, integramos en la cabecera:
\`\`\`text
#KODIPROP:inputstream.adaptive.manifest_type=hls
\`\`\`

### El Efecto Mágico (Hardware Offloading):
1. **Zapping Ultrarrápido (<800ms)**: El InputStream elimina la etapa de recolección de metadatos pesados de contenedor y arranca el playback a nivel RAM con el primer array de bytes que recibe.
2. **Entendimiento LL-HLS Nativo**: El motor Adaptive es el único componente dentro de estos ecosistemas capaz de leer correctamente los sub-segmentos (\`TYPE=PART\`) vinculados al \`EXT-X-PRELOAD-HINT\`, sin caer en la corrupción temporal del demuxer estándar.

## 3. Escalada Selectiva y Overdrive de Resolución
Para gestionar dinámicamente la resolución y el ancho de banda, APE implementa una matriz de selección basada en el Perfil de Operación (P0 - P4), anulando el predeterminado y limitante comportamiento del ExoPlayer.

### Los 4 Valores Reales de Selección (`stream_selection_type`)
*   `adaptive`: Se adapta al ancho de banda en tiempo real. Sube y baja de calidad dinámicamente.
*   `fixed-res`: Elige la calidad que mejor encaje con la resolución pedida y la mantiene fija (Evita saltos).
*   `ask-quality`: Muestra un diálogo antes de iniciar la reproducción para que el usuario elija.
*   `manual-osd`: Permite cambiar la calidad desde el menú OSD durante la reproducción.

### Comportamiento de Fallback en `fixed-res`
Si la calidad pedida (`chooser_resolution_max`) no existe en el manifiesto, el motor **no falla ni lanza error**.
Aplica la siguiente lógica de fallback nativa:
1. Busca la representación cuya resolución sea igual o la más cercana por debajo de la resolución máxima declarada.
2. Si `chooser_resolution_max` está declarado, actúa como techo (nunca elevará por encima de la config global del usuario).
3. Si ninguna resolución encaja, selecciona la más baja disponible como último recurso.

### Matriz Estricta de Asignación por Perfil (APE Ecosystem)
| Perfil APE | Modo Aplicado | Chooser Resolution / BW | Razón |
| :--- | :--- | :--- | :--- |
| **P0 / P1** (8K, 4K Supreme) | `adaptive` | `chooser_bandwidth_max=2147483647` (INT_MAX) / `ignore_screen_resolution=true` | Hardware extremo, siempre intenta forzar la máxima disponible sin límite. |
| **P2 / P3** (4K, FHD) | `fixed-res` | `chooser_resolution_max=4K` o `1080p` | Estabilidad estricta sobre fluidez de cambios. Evita fluctuaciones. |
| **P4** (HD Stable) | `fixed-res` | `chooser_resolution_max=720p` | Conexión media, blindado contra saltos y buffering. |
| **P5** (SD Failsafe) | `fixed-res` | `chooser_resolution_max=480p` | Hardware mínimo, calidad baja pero fija y constante. |

## 4. Regla Estructural
Pese a originarse en el motor multimedia de Kodi (Matrix/Nexus/Omega 21+), la etiqueta `KODIPROP` penetra profundamente en el parsing de la mayoría de forks de ExoPlayer.
Se inyectan dinámicamente en el bloque de atributos de forma procedimental, certificando que la lista entera sea decodificada bajo estas reglas de parseo dinámico, priorizado al vuelo según el Perfil Operativo que reciba el script generador:

```text
#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.ape.net/v1",PATHWAY-ID="PRIMARY"
#KODIPROP:inputstream.adaptive.manifest_type=hls

# BLOQUE DINÁMICO INYECTADO (EJ: P0 / P1)
#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive
#KODIPROP:inputstream.adaptive.chooser_bandwidth_max=2147483647
#KODIPROP:inputstream.adaptive.chooser_resolution_max=4K
#KODIPROP:inputstream.adaptive.ignore_screen_resolution=true
```
