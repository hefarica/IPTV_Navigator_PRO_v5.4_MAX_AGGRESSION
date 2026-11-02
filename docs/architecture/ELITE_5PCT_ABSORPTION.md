# Absorción de la arquitectura élite 5%

**Fecha:** 2026-11-01  
**Estado:** implementación parcial verificable, sin falsos positivos.

## Implementado aquí

| Concepto | Repo de referencia | Implementación local | Estado |
|---|---|---|---|
| M3U8 ⟺ JSON sin pérdida | `ipytv`, `m3ujson`, `jc` | `tools/m3u8_json_bridge.py` | **HECHO** |
| Round-trip idempotente | `jc` / `ipytv` | check SHA-256 y bytes idénticos | **HECHO** |
| Política de audio segura | decisión del propietario | `APE_ALL_PROFILES_OPTIMIZED.json` P0–P5 | **HECHO** |
| Passthrough validado | concepto passthrough IPTV | `passthrough_safe`, AAC 2ch fallback | **HECHO** |
| No downscale de vídeo | anti-degradación | leyes y headers | **HECHO** |
| Auth/headers seguros | matriz existente | `headers`/`headerOverrides` | **HECHO** |
| Lista adicional | arquitectura polimórfica | AUDIO_CRYSTAL / FAST | **HECHO** |

## Verificación del puente

```text
source: /lists/..._CDN_FAST.m3u8.gz
sha256: 888b8067eea8eb2d9330c3a6462a045768eb507e417f65a39f9ad1c15b631e1d
lines: 1.448.502
channels: 10.573
roundtrip_identical: true
```

## No implementado todavía

| Repo | Concepto | Motivo |
|---|---|---|
| `mpd-m3u8-to-json` | HLS/DASH ⟺ JSON unificado | requiere mapear MPD, no solo M3U8 |
| `OvenMediaEngine` | WebRTC + LL-HLS/LL-DASH | no hay engine WebRTC en el VPS actual |
| `live-torrent` | P2P WebTorrent | no hay malla P2P |
| `kptv-proxy` | proxy Go deduplicador | no se clonó el repo |
| `iptv-proxy` | tokens/sesiones cifradas | no se clonó el repo |
| `alexa-video` | skill Alexa | no hay runtime Alexa |
| `Kodi-Alexa` | voz → Kodi | no hay runtime Alexa |
| `dearbulut/iptv` | API 39k canales | no se clonó |
| `TMDB-To-VOD-Playlist` | metadatos TMDB | no se clonó |

## Decisión de audio

La política implementada es:

```text
PASSTHROUGH_SAFE:
  EAC3/AC3/AAC/MP3 válidos → passthrough si el player puede
  inválido / 0 canales / 0 Hz → AAC-LC 2ch 256k
  eARC estricto → auto
  prioridad: EAC3 > AC3 > AAC > MP3
  vídeo: nunca downscale
```

Headers añadidos a P0–P5:

```text
X-Audio-Passthrough-Mode
X-Audio-Passthrough
X-Audio-Fallback
X-Audio-Downmix
X-Audio-Codec-Priority
X-Audio-Safe-Formats
X-Audio-Transcode-On-Invalid
X-Audio-Validation
X-Audio-No-Damage
X-Audio-Sample-Rate
X-Audio-Channels
X-Audio-EARC
```

## Límite honesto

El audio de MAIN EVENTS 4K sigue siendo inválido en la fuente:

```text
EAC3, sample_rate=0, channels=0
decoder: coupling not allowed in mono or dual-mono
```

La configuración evita pasarlo como si fuera válido, pero no crea audio. El
injerto 4K + FHD falló porque el proveedor rechazó la segunda conexión.

## Conteo real del LAB

P0 después del parche:

```text
headers: 242
headerOverrides: 230
settings: 18
vlcopt: 27
kodiprop: 6
```

No se declara “639 campos” si el JSON no los contiene. El Gestor muestra los
headers reales; no se inventan 87 campos para cuadrar una cifra.

## REA generado

```text
tools/generate_rea_skills.py
.github/workflows/generate-rea-skills.yml
REA channels: 10.573
idempotency: sha256:dec8238cabb459e4...
```r

El workflow solo transforma; no resuelve URLs ni ejecuta playout.


## MPD <-> JSON

```text
tools/mpd_json_bridge.py
MPD real JIT: 2.410 bytes, 1 Period
sha256: a2d09ba9515e81fc...
roundtrip_identical: true
```

Es un puente lossless; no implementa un motor DASH/WebRTC.


## Pipeline ejecutable

```text
tools/ape_polymorphic_pipeline.py
Entrada M3U8 o JSON
Deduplicación por SHA-256 de URL
Salida HLS + JSON + REA + catálogo
```

Verificado sobre FAST: 10.573 canales, 0 duplicados, mismos hashes en dos ejecuciones. DASH/WebRTC/P2P no se fabrican.


## Índice estructurado

El JSON del puente conserva `lines` y añade `channel_index` con nombre, `tvg-*`, grupo, URL y atributos. La conversión inversa sigue usando las líneas originales; el índice es aditivo.


## Schema canónico

```text
contracts/ape_m3u8_json.schema.json
tools/validate_m3u8_json.py
10.573 canales, 0 errores
```

Valida schema, SHA-256, líneas, índice de canales, URL y atributos antes de REA/pipeline.


## Health metadata

```text
tools/ape_health_enrich.py
```

Adjunta `status/uptime/bitrate/codec/latency` solo desde un health map real; sin datos deja `unknown`. No hace probing ni inventa disponibilidad.


Contrato: `contracts/ape_health.schema.json`. Test: `tools/test_health_enrich.py`.

