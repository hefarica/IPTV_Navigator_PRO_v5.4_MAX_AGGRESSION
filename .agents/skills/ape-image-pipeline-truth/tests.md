# tests.md — casos de prueba y verificación

Cada caso tiene comando, resultado esperado y el artefacto que lo prueba.

## T1 · La cadena de la lista NO parsea (fallo universal)

```powershell
echo 'unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3:chroma_msize_x=0:chroma_msize_y=0:chroma_amount=0.0' > c.txt
ffmpeg -v error -i fuente.mp4 -filter_script:v c.txt -frames:v 1 -f null -
```
Esperado: `chroma_msize_x out of range [3 - 23]` → **FAIL**.
Corregido `chroma_msize_x=3` → **PASS**.

## T2 · `me` existe, `scd=5` no

| cadena | esperado |
|---|---|
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=umh:mb_size=8` | PASS |
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=tss:mb_size=8` | PASS |
| `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=5` | **FAIL** |

## T3 · `pp` no existe en ffmpeg 8

```powershell
ffmpeg -h filter=pp
```
Esperado: `No such filter: 'pp'`.

## T4 · `gradfun` strength mínimo

| valor | esperado |
|---|---|
| `gradfun=radius=8:strength=0.4` | **FAIL** (mínimo 0.51) |
| `gradfun=radius=8:strength=1.5` | PASS |

## T5 · `zscale` — valores rechazados

| cadena | esperado |
|---|---|
| `zscale=w=320:h=240:dither=blue-noise` | **FAIL** |
| `zscale=w=320:h=240:dither=error_diffusion` | PASS |
| `zscale=w=320:h=240:filter=lanczos` | PASS |
| `zscale=w=320:h=240:filter=lanczos+accurate_rnd+full_chroma_int` | **FAIL** |
| `zscale=transfer=bt1886` | **FAIL** (no existe en zimg) |

## T6 · VLC rechaza la sintaxis de la lista

```powershell
& $vlc -I dummy --vout=dummy --aout=dummy --play-and-exit --file-logging --logfile=$log `
       "--video-filter=nlmeans=s=2.5:p=5:r=11" fuente.mp4
```
Esperado en el log: `no video filter modules matched` + `Failed to create video filter`.
El archivo **sigue reproduciendo** → filtro inerte.

## T7 · VLC acepta módulos reales

| cadena | esperado |
|---|---|
| `gradfun{strength=1.5,radius=8}` | `using video filter module "gradfun"` |
| `deinterlace{mode=yadif2x}` | `using video filter module "deinterlace"` |
| `sharpen{sigma=0.5}` | `using video filter module "sharpen"` |
| `deinterlace{deinterlace-mode=yadif2x}` | `option deinterlace-mode is unknown` |

## T8 · Opciones `#EXTVLCOPT` — 80 ausentes

```powershell
node tools/ape-image-recipes/audit_vlcopt.js vlcopt_names.txt --root "C:\Program Files\VideoLAN\VLC"
```
Esperado: 138 total · 58 presentes · **80 ausentes**, incluyendo `video-hdr`,
`adaptive-reload-use-quic`, `hls-caching`, `network-timeout`.

Corroboración conductual: opción presente → `exit=0`; opción ausente → VLC cuelga (diálogo modal).

## T9 · Layout del bloque: el URI no es la última línea

```powershell
rg --no-line-number -A 4 -m 1 "^http://[^ ]+\.m3u8\s*$" $lista
```
Esperado: tras el URI, `#EXTVLCOPT:clock-jitter=0`, `#EXT-X-APE-CRYSTAL-UHD:…` y una línea vacía.

## T10 · LAB decodificable

```powershell
node tools/ape-image-recipes/decode_lab_metadata.js $lista --out $dir --max-lines 400
```
Esperado: 20 chunks · 51.890 B · `schema=ape-lab-metadata-v1` · `quality_levels` con L1–L7.

## T11 · Compilador: fallo cerrado

Inyectar en `recipes.json` una etapa `vlc` con `zscale` → `compile.js` debe **abortar** con
`proyeccion vlc contiene token no resoluble por VLC`. Igual con `gradfun strength=0.4` en ffmpeg.

## T12 · Las 6 proyecciones ffmpeg

```powershell
foreach ($p in "P5","P4","P3","P2","P1","P0") {
  $c = node tools/ape-image-recipes/compile.js --profile $p --emit ffmpeg
  Set-Content c.txt $c -NoNewline -Encoding ASCII
  ffmpeg -v error -i fuente.mp4 -filter_script:v c.txt -frames:v 1 -f null -
  "$p => $LASTEXITCODE"
}
```
Esperado: `0` en los 6.

## T13 · Sin credenciales

```powershell
rg -i "(password|pass=|/live/[^/]+/[^/]+/)" tools/ape-image-recipes docs/cartography
```
Esperado: 0 coincidencias reales (los ejemplos deben ir con `USER`/`PASS` literales como marcador).

## Límites de esta batería

- Fuentes sintéticas, no TS HLS real.
- Los fps son de este host sin GPU.
- La aplicación **conjunta** de varios módulos VLC no está verificada: el arnés headless aborta
  con `Too high level of recursion` tras el primer módulo. Requiere vout real en device.
- ExoPlayer/OTT/TiviMate/Kodi: veredicto normativo (RFC 8216 §6.3.1), no empírico.
