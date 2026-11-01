# Lista FAST para zapping

## Medición real

```text
Lista original:
  152 MB gzip
  10.315.628 líneas
  10.573 canales
  808 bloques con network-caching=72000 (72 s)

Lista FAST:
  769 KB gzip
  10.573 bloques
  network-caching=6000 (6 s)
```

## URL

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793569066655_CDN_FAST.m3u8
```

Original intacta:

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793569066655_CDN.m3u8
```

## Qué cambia

```text
- elimina metadata inerte por canal
- deja exactamente 1 URL por EXTINF
- conserva #EXTVLCOPT seguros
- conserva #EXT-X-APE-CRYSTAL-UHD de display
- baja network-caching de 72000 a 6000 ms
- mantiene resolución/códec/HDR/bitrate/fuente
```

## Qué NO cambia

```text
- URL del canal
- resolución 4K
- HEVC Main10 / HDR10
- audio
- bitrate de vídeo
- F1: JIT 4K nativo
- MAIN EVENTS: 4K original
```

No hay FHD, no hay transcode y no se recorta bitrate.

## Validación

```text
channels = 10.573
zero_url = 0
multi_url = 0
F1 URL = https://iptv-ape.duckdns.org/jit/live/1172226/master.m3u8
MAIN URL = https://iptv-ape.duckdns.org/cdn/line.tivi-ott.net/live/3JHFTC/U56BDP/1312008.m3u8
public FAST = 200 OK
download time = 0.81 s
```

## Regenerar

```bash
python3 tools/build_fast_zapping_list.py \
  /var/www/lists/APE_LISTA_1793569066655_CDN.m3u8.gz \
  /var/www/lists/APE_LISTA_1793569066655_CDN_FAST.m3u8.gz \
  /var/www/lists/APE_LISTA_1793569066655_CDN_FAST.m3u8
```

## Límite honesto

La lista FAST mejora el arranque, el parseo y la memoria del zapping. No puede
arreglar:

```text
audio EAC3 0 Hz/0 canales de MAIN EVENTS 4K
rebuffering por decoder HDR del device
red del cliente
```

Para MAIN EVENTS no hay audio real en la fuente; no se sustituye por FHD.
