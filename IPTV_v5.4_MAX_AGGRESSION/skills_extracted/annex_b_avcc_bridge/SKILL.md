---
name: "Annex-B → AVCC Bridge — Bitstream Filters para MPEG-TS a DASH/CMAF"
description: "Puente de conversión de formato NAL H264 Annex-B (MPEG-TS) a AVCC (MP4/fMP4/CMAF) usando bitstream filters de FFmpeg, resolviendo el error 'Tag [27] incompatible with avc1'"
---

# Annex-B → AVCC Bridge

## Problema Técnico
Los streams MPEG-TS del proveedor (Xtream Codes) usan el formato NAL **Annex B** (start codes `00 00 01` o `00 00 00 01`). El contenedor fMP4/CMAF requiere formato **AVCC** (4-byte length prefix). FFmpeg con `-c:v copy` NO convierte automáticamente entre formatos NAL al cambiar de contenedor MPEG-TS → MP4/DASH.

### Error Exacto
```
[mp4 @ 0x...] Tag [27][0][0][0] incompatible with output codec id '27' (avc1)
[dash @ 0x...] No bit rate set for stream 0
[out#0/dash @ 0x...] Could not write header (incorrect codec parameters ?): Invalid data found
```

## Los 5 Parámetros del Bridge

### 1. `-bsf:v h264_mp4toannexb`
Bitstream filter de video: convierte las NAL units del formato Annex B al formato compatible con contenedores MP4. A pesar de que el nombre sugiere "mp4 to annex b", en la práctica este BSF normaliza el stream H264 para que sea compatible con el muxer MP4/DASH.

### 2. `-tag:v avc1`
Fuerza el codec tag de salida a `avc1` (formato estándar ISO). Sin esto, FFmpeg intenta usar el tag MPEG-TS `[27]` que es incompatible con el contenedor MP4.

### 3. `-b:v {$targetKbps}k`
El muxer DASH requiere un bitrate declarado para construir el atributo `bandwidth` del `<Representation>` en el MPD. Sin este valor, FFmpeg aborta con `No bit rate set for stream 0`.

```php
// Dinámico desde DNA, fallback robusto
$targetKbps = $dna['target_kbps'] ?? 8000;
// → Se pasa como: -b:v 8000k
```

### 4. `-bsf:a aac_adtstoasc`
Bitstream filter de audio: convierte AAC ADTS (Audio Data Transport Stream, formato MPEG-TS) a ASC (Audio Specific Configuration, formato MP4). Sin esto, el audio AAC del MPEG-TS no se puede encapsular en fMP4.

### 5. `-movflags +faststart`
Mueve el átomo `moov` (metadata container) al inicio del archivo en lugar del final. Esto permite que los reproductores comiencen la reproducción sin necesidad de descargar el archivo completo.

## Comando FFmpeg Completo v18.6
```bash
ffmpeg -hide_banner -loglevel warning \
  -analyzeduration 10000000 -probesize 10000000 \
  -fflags +genpts+discardcorrupt \
  -err_detect ignore_err \
  -f mpegts -i pipe:0 \
  -c:v copy -c:a copy \
  -bsf:v h264_mp4toannexb \
  -bsf:a aac_adtstoasc \
  -tag:v avc1 \
  -b:v 8000k \
  -movflags +faststart \
  -max_muxing_queue_size 1024 \
  -f dash \
  -seg_duration 2 -use_timeline 1 -use_template 1 \
  -window_size 5 -extra_window_size 10 \
  -master_pl_name master.m3u8 \
  -hls_playlist 1 \
  -hls_segment_type fmp4 \
  /dev/shm/ape_cmaf_cache/{channel_id}/manifest.mpd
```

## Tabla de Compatibilidad de Formatos

| Componente | MPEG-TS (entrada) | fMP4/CMAF (salida) | BSF necesario |
|---|---|---|---|
| Video H264 NAL | Annex B (start codes) | AVCC (length prefix) | `h264_mp4toannexb` |
| Video codec tag | `[27]` (MPEG-TS ID) | `avc1` (ISO 14496-15) | `-tag:v avc1` |
| Audio AAC | ADTS frames | AudioSpecificConfig | `aac_adtstoasc` |
| Bitrate | Detectado en runtime | Requerido en manifest | `-b:v Xk` |

## Resultado — MPD Válido
```xml
<Representation codecs="avc1.64002a" bandwidth="8000000"
                width="1920" height="1080" />
<Representation codecs="mp4a.40.2" bandwidth="129316"
                audioSamplingRate="48000" />
```
