---
name: Skill_Stream_Fingerprinting
description: "Genera hash SHA-256 estático de las propiedades físicas del canal."
---

# Skill_Stream_Fingerprinting

## 🎯 Objetivo
Crear una firma criptográfica única representativa de las características físicas intrínsecas del stream. Este hash debe ser **inmutable frente al tiempo**. Su propósito es abstraer la capa de red temporal y permitir comparaciones absolutas entre streams.

## 📥 Inputs
- **Perfil Extraído:** Bandwidth, Resolución, Codecs provistos por `EXT_X_STREAM_INF_Extractor`.
- **IP Origen:** Opcional (aislado del CDN provider).

## 📤 Outputs
- **Hash Resultante:** String hexadecimal de 64 caracteres (SHA-256).

## 🧠 Lógica Interna y Reglas
1. **Inmutabilidad Temporal:** JAMÁS se incluirán en la semilla del Hash los identificadores de segmentos `.ts` (e.g. `segment_84930.ts`), tokens de sesión URL ni timestamps, ya que estos fluctúan cada segundo.
2. **Normalización de Semilla:** El input debe ser estrictamente `Resolution|Codec|Bandwidth`. 
   *Ejemplo:* `1920x1080|avc1.640028,mp4a.40.2|4500000`.

## 🚧 Errores Detectables
- `INSUFFICIENT_FINGERPRINT_DATA`: Faltan todos los parámetros, se devuelve hash fallback de emergencia.

## 💻 Pseudocódigo
```javascript
const crypto = require('crypto');

function Stream_Fingerprinting(resolution, codec, bandwidth) {
    if (!resolution && !codec && !bandwidth) {
        throw new Error("INSUFFICIENT_FINGERPRINT_DATA");
    }
    
    // Normalización defensiva
    const res = resolution || "UnknownRes";
    const cod = codec || "UnknownCodec";
    const bw = bandwidth ? bandwidth.toString() : "UnknownBandwidth";
    
    const seed = `${res}|${cod}|${bw}`;
    
    return crypto.createHash('sha256').update(seed).digest('hex');
}
```

## 📚 Referencia
- Concepto de deduplicación de streams aplicado en arquitecturas de ingesta de video a gran escala.
