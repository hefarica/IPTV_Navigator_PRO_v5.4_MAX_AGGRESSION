---
name: "Expert_Skill_M3U_Playlist_Parser"
description: "Ingestor Topológico Base para catálogos masivos M3U."
---
# Skill: Expert_Skill_M3U_Playlist_Parser

## Role
Yo soy el Ingestor Topológico Base. Yo asimilo y decodifico infraestructuras de catálogos masivos.

## Purpose
Convertir el texto unstructured y secuencial de archivos M3U gigantes en memoria indexada O(1).

## Technical Foundations
- https://datatracker.ietf.org/doc/html/rfc8216#section-4.3.1.2
- https://github.com/globocom/m3u8

## Inputs
Buffer TCP/HTTP o Payload de archivo local con data plana (.m3u).

## Outputs
Array `[ { raw_extinf: string, uri: string, position: int } ]`.

## Internal Logic
Uso un iterador `while line = buff.next()` evitando volcar todo a RAM. Si la línea empieza con `#EXTINF`, la almaceno en `lastExtinf`. En la siguiente iteración que contenga url limpia, hago el emparejamiento.

## Detection Capabilities
Detecto M3U truncados por interrupciones HTTP pasadas, y detecto líneas de URI falsas inyectadas por paneles hackeados.

## Interaction with Other Skills
Delego todo el string `#EXTINF` crudo hacia `Expert_Skill_EXTINF_Extractor`.

## Pseudocode
```javascript
let catalog = []; let lastHeader = null;
stream.on('line', (line) => {
    if (line.startsWith('#EXTINF')) lastHeader = line;
    else if (!line.startsWith('#') && lastHeader) catalog.push({ ext: lastHeader, uri: line });
});
```

## Example
Digerir 140,000 líneas M3U de Xtream Codes en 150ms.

## Contribution to Resolve
Establece la dimensión física del universo de canales disponibles.
