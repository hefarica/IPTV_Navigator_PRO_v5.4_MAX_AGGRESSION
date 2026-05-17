---
name: Skill_Query_Params_Analyzer
description: "Audita variables GET pasadas al resolver."
---

# Skill_Query_Params_Analyzer

## 🎯 Objetivo
Hurgar en la petición inicial `GET /play?` para mapear el target intentado por el reproductor. Este skill recupera IDs de canal o tokens de seguridad sin analizar los manifiestos subyacentes.

## 📥 Inputs
- **URL Completa:** Cadena URL proveniente de Request (e.g. `http://resolver/play?ch=219889&token=abc`).

## 📤 Outputs
- **Objeto Parámetros:** 
  - `channel_target`: `string`
  - `token_present`: `boolean`
  - `has_signature`: `boolean`

## 🧠 Lógica Interna y Reglas
1. **URLSearchParams Parsing:** Debe aislar de forma segura todo lo que esté después del `?`.
2. **Identidad Deductiva Base:** Si existe un parámetro `ch=`, `id=`, o `stream=`, asume que esa es la llave primaria buscada. Pasa este dato a la skill colaboradora *Request_to_Channel_Correlator*.
3. **Control Anti-M3U8 Dumping:** Detecta si la URL contenía un `token`. Si a pesar del token el sistema devuelve 403, es probable que la sesión del proveedor upstream expiró.

## 💻 Pseudocódigo
```javascript
function Query_Params_Analyzer(requestUrl) {
    let result = { channel_target: null, token_present: false, has_signature: false };
    
    try {
        const urlObj = new URL(requestUrl, 'http://localhost'); // Localhost fake for relative parsing
        const params = urlObj.searchParams;
        
        result.channel_target = params.get('ch') || params.get('id') || params.get('stream');
        result.token_present = params.has('token') || params.has('auth');
        result.has_signature = params.has('sign') || params.has('hash');
        
    } catch(e) { } // Fallback silente
    
    return result;
}
```
