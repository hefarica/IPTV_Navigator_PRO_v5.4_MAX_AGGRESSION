---
name: "CMAF Worker FFmpeg Pipeline — MPEG-TS a DASH/fMP4 en Tiempo Real"
description: "Arquitectura completa del pipeline cmaf_worker.php: ingesta MPEG-TS via cURL pipe:0, conversión FFmpeg a DASH/CMAF con segmentos fMP4 en RAM-disk, y servicio via cmaf_proxy.php"
---

# CMAF Worker — FFmpeg Pipeline Architecture

## Flujo Completo de la Cadena
```
OTT Navigator → resolve_quality.php?ch=1198&format=cmaf
                    ↓ (lanza cmaf_worker.php en background)
                    ↓ HTTP 302
              cmaf_proxy.php?sid=1198&seg=manifest.mpd
                    ↓ (espera hasta 1.5s por el archivo)
              /dev/shm/ape_cmaf_cache/1198/manifest.mpd ← FFmpeg escribe aquí
              /dev/shm/ape_cmaf_cache/1198/init-stream0.m4s
              /dev/shm/ape_cmaf_cache/1198/chunk-stream0-00001.m4s
              ...
```

## Responsabilidades por Archivo

| Archivo | Función |
|---|---|
| `resolve_quality.php` | Lanza `cmaf_worker.php` en background via `exec()` y redirige al proxy |
| `cmaf_worker.php` | Descarga el stream MPEG-TS via cURL → pipe:0 → FFmpeg → DASH/fMP4 |
| `cmaf_proxy.php` | Servidor de archivos ultrarrápido: lee del RAM-disk y sirve con headers correctos |
| `ape_hls_generators.php` | Funciones `serve_hls_ignition()`, `serve_god_tier_dash()`, `serve_hls_fmp4_ignition()`, `serve_cmaf_m3u8_fallback()` |

## Comando FFmpeg v18.6 FINAL (Annex-B → AVCC Bridge)
```php
$cmd = "ffmpeg -hide_banner -loglevel warning " .
    "-analyzeduration 10000000 -probesize 10000000 " .  // 10s + 10MB fijo
    "-fflags +genpts+discardcorrupt " .                 // Regenerar PTS, descartar corruptos
    "-err_detect ignore_err " .                         // Ignorar errores parciales H264
    "-f mpegts -i pipe:0 " .                           // Input: MPEG-TS desde cURL via pipe
    "-c:v copy -c:a copy " .                           // Copy codec (sin transcodificación)
    "-bsf:v h264_mp4toannexb " .                       // Bitstream filter: Annex B → AVC1
    "-bsf:a aac_adtstoasc " .                          // Audio: ADTS → ASC para MP4
    "-tag:v avc1 " .                                   // Forzar tag AVC1 para compatibilidad
    "-b:v {$targetKbps}k " .                           // Bitrate dinámico desde DNA
    "-movflags +faststart " .                          // Header al inicio del segmento
    "-max_muxing_queue_size 1024 " .                   // Eliminar 'dimensions not set'
    "-f dash " .                                        // Output: DASH manifest
    "-seg_duration 2 -use_timeline 1 -use_template 1 " .
    "-window_size 5 -extra_window_size 10 " .
    "-master_pl_name master.m3u8 " .                   // HLS master playlist
    "-hls_playlist 1 " .                               // Generar también .m3u8
    "-hls_segment_type fmp4 " .                        // Segmentos CMAF (no MP4)
    escapeshellarg($manifestPath);
```

## Evolución de Errores y Parches (v18.3 → v18.6)

| Versión | Error | Causa | Parche |
|---|---|---|---|
| v18.3 | `Cannot redeclare serve_hls_ignition()` | Funciones duplicadas entre archivos | Eliminar duplicados de `resolve_quality.php` |
| v18.4 | `Invalid data found when processing input` | HTML/403/301 del proveedor inyectado al pipe | HTTP Guard (`CURLOPT_HEADERFUNCTION`) |
| v18.5 | `non-existing SPS/PPS` + `dimensions not set` | `probesize` dinámico demasiado pequeño (384KB) | Probesize fijo 10MB + `+genpts+discardcorrupt` |
| v18.6 | `Tag [27] incompatible with avc1` + `No bit rate` | Annex B vs AVC1 + faltan BSF | `-bsf:v h264_mp4toannexb -tag:v avc1 -b:v Xk -bsf:a aac_adtstoasc` |

## Resultado Exitoso — manifest.mpd Generado
```xml
<MPD type="dynamic" profiles="urn:mpeg:dash:profile:isoff-live:2011">
  <Period id="0" start="PT0.0S">
    <AdaptationSet contentType="video" maxWidth="1920" maxHeight="1080">
      <Representation codecs="avc1.64002a" bandwidth="8000000"
                      width="1920" height="1080" />
    </AdaptationSet>
    <AdaptationSet contentType="audio">
      <Representation codecs="mp4a.40.2" bandwidth="129316"
                      audioSamplingRate="48000" />
    </AdaptationSet>
  </Period>
</MPD>
```

## Archivos del RAM-Disk
```
/dev/shm/ape_cmaf_cache/{channel_id}/
├── manifest.mpd           # DASH manifest dinámico
├── master.m3u8            # HLS master playlist
├── media_1.m3u8           # HLS media playlist
├── init-stream0.m4s       # fMP4 init segment (moov atom)
├── init-stream1.m4s       # Audio init segment
├── chunk-stream0-XXXXX.m4s # Video chunks (2s cada uno)
├── chunk-stream1-XXXXX.m4s # Audio chunks
├── ffmpeg.pid             # PID del worker para suicide switch
└── ffmpeg.log             # Errores de FFmpeg
```

## Suicide Switch (Watchdog de 45 segundos)
Si nadie lee el `manifest.mpd` por 45 segundos (via `touch` en `cmaf_proxy.php`), el worker se auto-destruye para liberar recursos.
