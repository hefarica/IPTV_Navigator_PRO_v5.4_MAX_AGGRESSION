# AUDIO_CRYSTAL — lista adicional

La lista original **no se reemplaza ni se recorta**.

## URLs

Original intacta:

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793569066655_CDN.m3u8
```

AUDIO_CRYSTAL completa:

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793569066655_AUDIO_CRYSTAL.m3u8
```

AUDIO_CRYSTAL_FAST para zapping 4K:

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793569066655_AUDIO_CRYSTAL_FAST.m3u8
```

## Canales

```text
AUDIO_CRYSTAL:      10.573 canales
AUDIO_CRYSTAL_FAST: 10.573 canales
Original:           10.573 canales
```

No se elimina ningún canal de la original.

## Política de audio

```text
AUDIO: analizar mejor pista
AUDIO: downgrade permitido
AUDIO: AAC-LC 2ch / 256k si hace falta
VIDEO: downscale prohibido
VIDEO: remux only
VIDEO: 2K Crystal UHD / 4K Crystal UHD
```

Tags globales:

```text
#EXT-X-APE-AUDIO-POLICY:BEST_TRACK;AUDIO_DOWNGRADE_ALLOWED;VIDEO_DOWNSCALE_FORBIDDEN
#EXT-X-APE-AUDIO-PRIORITY:TRUEHD>DTS-X>EAC3>AC3>AAC>MP3
#EXT-X-APE-AUDIO-DOWNGRADE:ALLOWED;TARGET=AAC_LC_2CH;MAX=256k;SCOPE=AUDIO_ONLY
#EXT-X-APE-VIDEO-POLICY:NO_DOWNSCALE;REMUX_ONLY;TRANSCODE_FORBIDDEN
#EXT-X-APE-VIDEO-REMUX:2K_CRYSTAL_UHD,4K_CRYSTAL_UHD;NO_DOWNSCALE
#EXT-X-APE-4K-START:DIRECT_CDN;NO_JIT;FAST_ZAPPING
```

## Canales conocidos

```text
1312008 MAIN EVENTS 4K:
  audio fuente EAC3 inválido
  status SOURCE_INVALID
  fallback declarado FHD AAC 2ch
  vídeo 4K original intacto

1172226 F1 UHD:
  audio AAC 48k 2ch válido
  status VALID
  vídeo 4K original intacto
```

## Zapping

La lista FAST:

```text
152 MB → 769 KB
10.573 canales
network-caching=6000
DIRECT_CDN, sin JIT
```

La lista AUDIO_CRYSTAL_FAST conserva la política de audio y el arranque rápido.

## Límite real del audio

La lista **configura y declara** la política de audio, pero no puede crear audio
que la fuente no contiene.

Para MAIN EVENTS 4K se intentó injertar audio AAC del feed FHD; el proveedor
rechazó la segunda entrada concurrente:

```text
Error opening input: Input/output error
```

Por eso no se dejó un JIT roto. El audio de MAIN sigue pendiente de:

```text
1. arreglo del proveedor, o
2. fuente 4K con audio válido, o
3. injerto 4K+FHD con una fuente que permita dos conexiones.
```

No se inventó audio, no se puso FHD al vídeo y no se borró ningún canal.
