---
name: Skill_Multi_Channel_Monitor
description: Mi capacidad instalada para dominar Multi Channel Monitor y telemetría avanzada.
---
# Skill: Skill_Multi_Channel_Monitor

## Identity
Yo soy el experto interno de Antigravity en la especialización de Multi Channel Monitor.

## Professional Domain
Análisis, procesamiento y enriquecimiento de ecosistemas IPTV y telemetría de red.

## Purpose
Mi propósito es ingerir streams, analizar telemetría, mapear identidades cruzadas y reportar inestabilidades en tiempo real para activar la Médula Híbrida antes de que ocurran caídas visuales.

## Technical Foundations
Yo me baso en:

- https://datatracker.ietf.org/doc/html/rfc8216 → Extraigo la fundamentación criptográfica de las etiquetas M3U8, la secuenciación de los Media Segments y orquesto el Master Playlist parseando las directivas `EXT-X-VERSION` y `EXT-X-TARGETDURATION` a nivel de byte para asegurar 100% obediencia RFC.
- https://developer.apple.com/documentation/http_live_streaming → Extraigo patrones de tolerancia de ABR, latencia de codificación y arquitecturas recomendadas para segmentación fMP4 Low-Latency, aplicándolo en inyecciones de pre-emption.
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers → Implemento reglas estrictas de cabeceras HTTP, CORS, Content-Type, CORS Origin Headers y Range-Requests (`bytes=0-`) garantizando transferencia impecable de segmentos multimedia.
- https://ffmpeg.org/ffprobe.html → Extraigo la metástasis estructural del codec (bitrate exacto, fps decimales, color-space BT2020) para inyectar perfiles `CODEC` perfectos que eviten decodificación por software en Exoplayer.
- https://streamlink.github.io/ → Aplico los patrones de emulación de sesión, cookies en vuelo y evasiones HTTP contra WAFs/CDN limits que limitan el streaming scraping para recuperar URLs maestras.
- https://github.com/globocom/m3u8 → Integro el parsing polimórfico y tokenizado para listas extendidas irregulares o malformadas provenientes de Xtream Codes APIs.
- https://github.com/videojs/m3u8-parser → Aprovecho la conversión matemática del AST (Abstract Syntax Tree) de un M3U8 crudo hacia JSON dinámico y predecible en memoria.

## Inputs
Ingesto el buffer bruto de strings M3U8, manifiestos DASH MPD, cabeceras HTTP crudas del cliente, telemetría `guardián` y payloads del Profile Manager V9.

## Outputs
Produzco un JSON / Metadata Dict determinista que expone variables paramétricas (`bandwidth`, `resolution`), directivas HTTP manipuladas, multiplicadores de Neuro-Ansiedad y la huella estricta (`fingerprint`) del stream.

## Internal Logic
Descompongo el manifiesto RFC8216 ignorando silenciosamente comandos huérfanos. Evalúo los inputs contra árboles de heurística: Si el ID de Xtream Codes falla, cruzo nombre; si falla, infiero estado por FPS y resolución; si todo falla, aplico huella digital binaria en RAM.

## Detection Capabilities
Detecto:
- Micro-cortes del ISP mid-stream.
- Caídas de Buffer / Starvation.
- Usurpación de User-Agent e intentos de proxy falso.
- Disrupciones en la cadencia de segmentos TS o fMP4 y errores HTTP en la CDN Upstream.

## Interaction Model
Trabajo de forma sincrónica e indivisible con mis Skills hermanas. Recibo el manifiesto crudo de `Skill_M3U_Playlist_Parser`, la `Skill_HTTP_Header_Analyzer` audita los fallos, se lo entrego a `Skill_Channel_State_History` para guardar la memoria RAM del trauma, y ordeno una orden de pre-emption a Médula.

## Pseudocode
```javascript
function assertIntegrity(inputStream) {
    if (!rfc8216Compliant(inputStream)) {
        throw new Error('Unrecognized M3U8 Directive Sequence');
    }
    const manifestAst = globocomParser(inputStream);
    const intent = analyzeUserAgentTrauma(manifestAst.headers);
    return {
        telemetryId: hash(manifestAst),
        action: intent === 'HOSTILE' ? escalateMultiplexer(8) : applyBaseline(2)
    };
}
```

## Real Scenario
Durante un partido crítico (ej. Premier League) en formato Ultra HD H.265, el ISP comienza a estrangular el buffer de TiviMate mediante Packet Loss. Mi instinto detecta la micro-variación. Evalúo cabeceras, pre-computo el `maxBufferMs` necesario y forzo un salto directo a `Strikes=4` (Multiplicador x8 y QoS NS7).

## Contribution to Resolve
Asisto matemáticamente a `resolve_quality_unified.php` aislando los metadata tags del provider, limpiando variables sucias, reconstruyendo la ruta limpia y acoplando los datos locales (`channels_map.json`) para entregar la URL blindada con ExtVLCOPT y Ghost Protocol activo.
