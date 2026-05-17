---
name: Skill_M3U_Playlist_Parser
description: "Ingiere listas M3U estándar y extrae topología sin reproducir video."
---

# Skill_M3U_Playlist_Parser

## 🎯 Objetivo
Parsear y validar listas globales M3U (`audio/x-mpegurl`) para extraer su topología base sin realizar peticiones de descarga a los segmentos subyacentes. Su labor es dividir el archivo gigante en sub-componentes lógicos navegables.

## 📥 Inputs
- **M3U String Crudo:** Texto plano del archivo `.m3u` o `.m3u8` descargado de la fuente.

## 📤 Outputs
- **Topología (Array de Objetos):**
  - `raw_metadata`: String del bloque `#EXTINF`.
  - `stream_url`: El URI apuntando a la fuente del stream.

## 🧠 Lógica Interna y Reglas
1. **Validación de Cabecera:** Si la línea 1 no inicia con `#EXTM3U`, abortar con error `INVALID_M3U_SIGNATURE`.
2. **Delimitador de Canal:** El delimitador universal de canal es `#EXTINF:`.
3. **Mapeo:** El parser debe hacer splitting por cada `#EXTINF` iterando hasta encontrar la línea de URI subsiguiente (omitirá comentarios huérfanos).
4. **Restricción Zero-Video:** Esta skill estrictamente solo lee texto. Si el URI termina en `.ts`, NO se envía solicitud HTTP para validarlo.

## 🚧 Errores Detectables
- `INVALID_M3U_SIGNATURE`: Cabecera RFC inválida.
- `EMPTY_PLAYLIST`: Faltan directivas `#EXTINF`.

## 💻 Pseudocódigo
```javascript
function M3U_Playlist_Parser(m3uContent) {
    if (!m3uContent.startsWith("#EXTM3U")) throw new Error("INVALID_M3U_SIGNATURE");
    
    // Split por canales
    const blocks = m3uContent.split('#EXTINF:').slice(1);
    let channels = [];
    
    for (let block of blocks) {
        let lines = block.split('\\n');
        let header = "#EXTINF:" + lines[0]; // Restaura el tag cortado
        let url = lines.find(l => l.trim() && !l.startsWith('#')).trim();
        
        channels.push({ raw_metadata: header, stream_url: url });
    }
    return channels;
}
```

## 📚 Referencia
- Base arquitectural derivada de RFC 8216 y parsers como *globocom/m3u8*.
