# §11 medido: lo declarado contra lo medido, canal por canal · 2026-11-12

**Qué se hizo:** sobre `APE_PRUEBA_PERFILES` (lista de pruebas, 164.062 B, 3 canales), se extrajo el perfil declarado por canal, se pidió el manifiesto real a `/pulse/` y se sondeó el primer segmento con `ffprobe`. Comparación directa entre lo que el sistema **declara** y lo que el proveedor **sirve**.

## El resultado

| Canal | Declarado | **Medido** | ¿Coherente? |
|---|---|---|---|
| `|AL| KLAN MACEDONIA 4K` | **`ape-profile="P1"`** (4K/UHD) | **1920x1080** · h264 Main L4.0 · **25 fps** · **11,46 Mbps** | **NO** |
| `|AL| TOP CHANNEL FHD` | `ape-profile="P3"` (FHD) | 1920x1080 · h264 High L4.0 · 50 fps · 6,65 Mbps | **SÍ** |
| `|AL| TOP CHANNEL HD` | `ape-profile="P4"` (HD) | **1920x1080** · h264 High L4.0 · 25 fps · 5,23 Mbps | **NO** |

## Los dos desajustes, y no son del mismo tipo

**1 · El canal «4K» no es 4K.** Se llama `KLAN MACEDONIA 4K`, declara **P1** — que en la escalera documentada es el perfil 4K/UHD — y entrega **1920x1080**.

§11 lo dice con esas palabras: *«No conviertas la etiqueta comercial 6K/8K en una declaración falsa de salida efectiva.»* Esto es exactamente eso. El canal tiene el nombre comercial de 4K, el perfil de 4K y los píxeles de FHD.

**2 · El canal «HD» tampoco es HD, pero al revés.** Declara **P4** (720p) y entrega **1080p**. El sistema **subestima**: pide un perfil menor del que la fuente sostiene. No es degradación — es un perfil P4 con parámetros de 720p aplicados a un flujo 1080p. Descoordina igual, en la dirección segura.

## El detalle que casi reporto mal

El primer sondeo dio **`r_frame_rate=125/1`** en el canal P1. **125 fps con Level 4.0 es imposible** (L4.0 tope ~1080p@30), así que antes de escribirlo lo comprobé: sondeé **tres segmentos** y leí `avg_frame_rate`.

```
r_frame_rate=125/1   avg_frame_rate=25/1   level=40   h=1080     (×3 segmentos)
```

**`r_frame_rate` es un artefacto** de cómo ffprobe interpreta los timestamps de un segmento MPEG-TS aislado. La cadencia real es **25 fps**, y L4.0 a 1080p@25 es legal.

**No se reporta 125 fps como dato del canal.** El chequeo evitó un hallazgo falso — y es la segunda vez en la sesión que verificar antes de escribir salva una afirmación.

## Lo que esto prueba y lo que no

**Prueba:** que el mecanismo de declaración **puede** desajustarse del bitstream, y que se detecta midiendo. La comparación es reproducible: manifiesto → segmento → `ffprobe` → contraste con `ape-profile`.

**No prueba** que la lista viva (1,3 GB) tenga estos desajustes. Estos tres canales son de `APE_PRUEBA_PERFILES`, una lista de **prueba**. Para saberlo en producción hay que recorrer el catálogo real canal por canal — caro (un `ffprobe` por canal) pero es lo mismo que se acaba de hacer con tres.

## Detalle adicional: la mejora vive en VLC, no en el flujo

Cada bloque de canal trae ~133 `#EXTVLCOPT`, entre ellos:

```
#EXTVLCOPT:video-filter=nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:deint=0,gradfun=...,unsharp=lum...
#EXTVLCOPT:video-width=3840
#EXTVLCOPT:video-height=2160
#EXTVLCOPT:video-fps=60
#EXT-X-APE-4KFALSE-MODE:ACTIVE
#EXT-X-APE-4KFALSE-TARGET-RES:3840x2160
#EXT-X-APE-4KFALSE-ENGINE:LAB-CALIBRATED-DNR+MEMC-120
```

La cadena de mejora de imagen está expresada como **filtros de VLC** (`nlmeans`, `bwdif`, `gradfun`, `unsharp`) y como `#EXTVLCOPT`. Esos filtros **los aplica VLC/libVLC**, no el flujo ni el servidor.

Y `#EXT-X-APE-4KFALSE-MODE:ACTIVE` con `TARGET-RES:3840x2160` es una etiqueta que **declara explícitamente** que el 4K es sintético. Es honesta como etiqueta — pero conviene no confundirla con una salida 4K real.

**Consecuencia medida en el aparato:** OTT Navigator reproduce **AVC 1080p del proveedor**, sin filtros. Los `#EXTVLCOPT` no le llegan. Si OTT Navigator los honra o los ignora **sigue sin medirse** — y para este reproductor, con esta cadena, la mejora declarada en la lista no está en el camino.
