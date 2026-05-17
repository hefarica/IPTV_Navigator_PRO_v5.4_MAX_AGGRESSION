---
name: Skill_M3U8_Manifest_Parser
description: "Descompone HLS Playlists (RFC 8216) separando tags y segmentos."
---

# Skill_M3U8_Manifest_Parser

## 🎯 Objetivo
Descomponer meticulosamente un HLS Playlist (M3U8) en el marco estricto del standard Apple HLS DRAFTS/RFC 8216. Debe discernir entre un *Master Playlist* y un *Media Playlist*.

## 📥 Inputs
- **Manifest M3U8 Crudo:** Output descargado por el resolver (Texto).
- **Origin URL:** URL base desde donde fue traído el manifest, crítico para resolución recursiva.

## 📤 Outputs
- **Objeto Parseado HLS:**
  - `isMaster`: Booleano (true si contiene `#EXT-X-STREAM-INF`).
  - `isMedia`: Booleano (true si contiene `#EXT-X-TARGETDURATION`).
  - `lines`: Array indexado por cada directiva HLS.

## 🧠 Lógica Interna y Reglas
1. **Detección Master vs Media:** Si detecta `#EXT-X-TARGETDURATION` o `#EXT-X-MEDIA-SEQUENCE` asume que es Media Playlist (contiene trozos de video `.ts`).
2. **Transformación Relativa:** HLS permite URLs relativas en el manifest (ej. `/channelX/1080p.m3u8`). La skill reestructura esto a URL absoluta concatenando el `Origin URL`.
3. **Zero-Playback Constraint:** Durante la evaluación de un *Media* playlist, ignorará la carga real de los archivos de transporte MPEG-TS.

## 🚧 Errores Detectables
- `MALFORMED_PLAYLIST`: Falta `#EXTM3U` obligatorio RFC 8216.
- `NO_SEGMENTS_OR_VARIANTS`: Playlist vacío (Común en baneos de IPTV).

## 💻 Pseudocódigo
```javascript
function M3U8_Manifest_Parser(manifestString, originUrl) {
    if(!manifestString.includes('#EXTM3U')) throw new Error("MALFORMED_PLAYLIST");
    
    let isMaster = manifestString.includes('#EXT-X-STREAM-INF');
    let isMedia = manifestString.includes('#EXT-X-TARGETDURATION');
    let lines = manifestString.split('\\n');
    let basePath = originUrl.substring(0, originUrl.lastIndexOf('/') + 1);

    // Reescritura a rutas absolutas
    let parsedLines = lines.map(line => {
        if(line && !line.startsWith('#') && !line.startsWith('http')) {
            return line.startsWith('/') ? new URL(line, originUrl).href : basePath + line;
        }
        return line;
    });

    return { isMaster, isMedia, lines: parsedLines, raw: manifestString };
}
```

## 📚 Referencia
- Cumplimiento de especificación Apple HTTP Live Streaming y *videojs/m3u8-parser*.
