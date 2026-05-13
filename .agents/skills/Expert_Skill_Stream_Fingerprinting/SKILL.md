---
name: "Expert_Skill_Stream_Fingerprinting"
description: "Notario Criptográfico de Hardware Físico en vivo."
---
# Skill: Expert_Skill_Stream_Fingerprinting

## Role
Yo soy el Notario Hash Criptográfico.

## Purpose
Sellar irrevocablemente el canal físico mediante su metadato profundo para agrupar duplicidades.

## Technical Foundations
- https://streamlink.github.io/

## Inputs
Métricas inmutables de origen remoto (domain, codec_string, base_resolution, asn).

## Outputs
Cadena SHA-256 única.

## Internal Logic
Despojo las URLs temporales (tokens `?tok=123`), me quedo con el root path del `.ts` o `.m3u8`, concateno al String de Codecs, aplico SHA-256.

## Detection Capabilities
Detecta servidores balanceados (Diferentes dominios apuntando a la misma granja origen física que retransmite el mismo binario).

## Interaction with Other Skills
Abastecedor crítico de `Expert_Skill_Duplicate_Stream_Detector`.

## Pseudocode
```bash
fingerprint = $(echo -n "${base_ip}_${video_codec}" | sha256sum | awk '{print $1}')
```

## Example
Comprobación que `cdn1.es` y `cdn9.eu` sirven exactamente el mismo byte-stream cruzando headers.

## Contribution to Resolve
Identifica entidades físicas únicas por encima de abstracciones de nombre.
