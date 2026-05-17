---
name: Skill_HLS_FMP4_Encryption_CBCS
description: Aplicación Estricta de Cifrado Sample-AES-CTR (cbcs) para cumplimiento FairPlay/Apple e IP Premium.
category: Muxer / Network
---
# 1. Teoría de Compresión y Anomalía
El cifrado estándar M3U8 (AES-128 con bloques IV) protege al archivo, pero fractura el pipeline de decodificación por hardware de Apple TV, ExoPlayer y Widevine, que esperan fMP4. Múltiples fallos visuales de "Pantalla Verde" y pixeles basura suceden cuando un demuxer intenta reproducir cuadros entrelazados de fragmentos AES con bloques sin desencriptar a tiempo en el hardware L3.

# 2. Directiva de Ejecución (Código / Inyección)
Se transfiere la responsabilidad arquitectónica a Common Encryption (CENC) utilizando the pattern `Sample-AES-CTR` con la variación `cbcs` que cifra un porcentaje del NAL unit (Subsample encryption).

```bash
# Comando de Integración fMP4 CENC CBCS (Shaka / FFmpeg):
-hls_enc 1 -hls_enc_key [A-Z0-9 Hex] -hls_enc_iv [Hex IV] -hls_fmp4_init_filename init.mp4
# El #EXT-X-KEY M3U8 DEBE quedar así:
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.php",KEYFORMATVERSIONS="1",IV=0x...
```

# 3. Flanco de Orquestación
La **Doctrina del Cristal Roto** dicta que, ante todo, el cliente debe decodificar eficientemente la DRM usando TEE (Trusted Execution Environment). Al forzar CENC `cbcs`, los píxeles negros que rompen la cristalidad en los primeros 2 segundos (causados por la rotación del IV en AES-128 puro) son eliminados para siempre.
