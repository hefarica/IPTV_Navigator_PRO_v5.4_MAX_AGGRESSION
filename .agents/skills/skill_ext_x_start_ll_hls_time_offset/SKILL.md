---
name: Skill_EXT_X_START_LL_HLS_Time_Offset
description: Doctrina para el uso de #EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES como controlador de latencia de borde (Edge Latency Controller) para HLS/CMAF en vivo.
---

# Skill_EXT_X_START_LL_HLS_Time_Offset

## 1. Contexto Clínico (El Problema de Latencia L7)
En despliegues de **IPTV Live / Deportes en Vivo**, reproductores como VLC, OTT Navigator y ExoPlayer inherentemente descargan de 3 a 6 segmentos para inicializar el stream playback (Play-out buffer). En HLS, esto induce entre 10 a 30 segundos de retraso cronológico respecto al *verdadero vivo*.
Esto penaliza severamente el puntaje de la `Dimensión D6 - Buffer & Resilience` cuando el usuario exige el gol milisegundos después de que pase en el satélite.

## 2. La Directiva de Borde (#EXT-X-START)
Para someter al hardware a reproducir pegado al Edge Node L7 sin congelarse, implementamos como directiva OBLIGATORIA GLOBAL (Debajo de #EXTM3U):
\`\`\`text
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
\`\`\`

### Desglose de Parámetros:
- **`TIME-OFFSET=-3.0`**: Obliga al playhead (cabezal de reproducción) a situarse en el punto -3.0 segundos desde el final absoluto de la playlist (Live Edge). Ignora de forma segura cualquier segmento más antiguo.
- **`PRECISE=YES`**: Demanda que el salto se calcule al byte (descartando GOPs intencionalmente a nivel demuxer) en lugar de encajar en la barrera (boundary) del segmento más cercano. Es VITAL porque el ecosistema APE utiliza Caché Masiva (\`live-cache=120000\`). Sin el \`PRECISE=YES\`, ExoPlayer choca contra el bloque masivo reservado y retrasa su inicio.

## 3. Compatibilidad CMAF Low-Latency 
Cuando cruzamos esta directiva en la capa global con las cabeceras `X-CMAF-Part-Target: 1.0` y `X-CMAF-Server-Control: CAN-BLOCK-RELOAD=YES`, activamos formalmente el protocolo **LL-HLS (Low Latency HLS)** de Apple. 
Esto otorga:
- Latencia de 3 segmentos CMAF (1 segundo cada uno) -> Total 3 segundos "glass-to-glass".
- Integración perfecta con reproductores God-Tier nativos (OTT Navigator 1.7+, TiviMate 5.x+, ExoPlayer 2.18+).
- En caso de hardware SD / P5, la directriz de borde mantiene impacto neutro pero evita overhead de memoria.

## 4. Regla Estructural
Esta es una **Directiva Global** y se escribe EXACTAMENTE UNA VEZ por archivo generado (.m3u8), directamente en la cabecera, junto con otras directivas APE maestras.

### APE Generator Inject Rule:
Debajo del \`#EXTM3U\` y del \`#X-OMEGA-TIMESTAMP\`, añadir:
\`\`\`javascript
#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES
\`\`\`
*(Nunca repetir esta etiqueta por canal, causaría Fatal Parser Error en ExoPlayer).*
