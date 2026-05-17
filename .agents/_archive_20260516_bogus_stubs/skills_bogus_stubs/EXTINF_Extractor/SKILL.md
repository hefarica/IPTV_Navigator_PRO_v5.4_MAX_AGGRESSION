---
name: Skill_EXTINF_Extractor
description: "Aísla la identidad nominal del canal desde el tag originario."
---

# Skill_EXTINF_Extractor

## 🎯 Objetivo
Especializado en el Regex exacto del tag `#EXTINF`. Extrae los atributos (generalmente TVG / EPG metadata) y primordialmente aísla la firma humana o descriptiva (channel name) que reside tras la coma delimitadora.

## 📥 Inputs
- **Array de Líneas M3U8** u Objeto HLS proveído por `M3U8_Manifest_Parser`.

## 📤 Outputs
- **Objeto Metadata Canal:**
  - `channel_name`: string
  - `tvg_id`: string
  - `group_title`: string
  - `logo_url`: string

## 🧠 Lógica Interna y Reglas
1. **Ignorar Comentarios:** Solo rastrear la primera línea que inicie obligatoriamente con `#EXTINF:`.
2. **Prioridad Nominal:** La definición estándar marca que el nombre del canal es todo texto inmediatamente posterior a la primera aparición de la coma de la directiva `#EXTINF`.
3. **Regex Tvg-id:** Extraer el ID exacto que EPG requiere para mapear usando `/tvg-id="([^"]+)"/`.

## 🚧 Errores Detectables
- `EXTINF_NOT_FOUND`: Stream huérfano (No name metadata).

## 💻 Pseudocódigo
```javascript
function EXTINF_Extractor(hlsLines) {
    let meta = { channel_name: "UNKNOWN", tvg_id: "", group_title: "", logo_url: "" };
    
    const extinfLine = hlsLines.find(l => l.startsWith('#EXTINF:'));
    if (!extinfLine) return meta; // Falla pasiva, retorna defecto

    const tvgIdRegex = /tvg-id="([^"]*)"/;
    const groupRegex = /group-title="([^"]*)"/;
    const logoRegex = /tvg-logo="([^"]*)"/;
    
    // Spliteamos por la primera coma para hallar el nombre del stream
    const firstCommaIndex = extinfLine.indexOf(',');
    if (firstCommaIndex > -1) {
        meta.channel_name = extinfLine.substring(firstCommaIndex + 1).trim();
    }

    if (tvgIdRegex.test(extinfLine)) meta.tvg_id = extinfLine.match(tvgIdRegex)[1];
    if (groupRegex.test(extinfLine)) meta.group_title = extinfLine.match(groupRegex)[1];
    if (logoRegex.test(extinfLine)) meta.logo_url = extinfLine.match(logoRegex)[1];

    return meta;
}
```

## 📚 Referencia
- Parsing basado en estructuras populares derivadas de Xtream Codes e IPTV standards no-oficiales del tag base `#EXTINF`.
