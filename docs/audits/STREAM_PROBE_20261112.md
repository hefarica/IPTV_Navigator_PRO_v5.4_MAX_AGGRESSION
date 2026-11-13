# Qué es el flujo, medido sin el reproductor · 2026-11-12

**Por qué importa:** hasta ahora todo lo del vídeo venía del propio aparato (`mediametrics`). Esto es una medición **independiente**: se extrae el segmento real del manifiesto que sirve el sistema y se sondea con `ffprobe`. Si los dos métodos coinciden, la medición es sólida. Si no, el desacuerdo es el hallazgo.

## El segmento, sacado del propio `/pulse/`

```
GET /pulse/548062.m3u8?u=<proveedor>  →  primer segmento:
http://192.142.27.62:80/hls/47718936dc28e9df12134d16d35e8aaa/548062_733.ts
```

## `ffprobe` del segmento

| Campo | Valor medido |
|---|---|
| Contenedor | **mpegts** |
| Duración del segmento | **6,159 s** |
| Tamaño | **4.542.644 B** |
| **Bitrate** | **5.900.112 bps ≈ 5,90 Mbps** |
| Vídeo | **h264 (AVC) High, level 40 (L4.0)** |
| Resolución | **1920x1080** · yuv420p |
| Cadencia | **25/1 fps** |
| Audio | **aac LC, 44.100 Hz, 2 canales, 138 kbps** |
| Pista extra | **`dvb_teletext` 492x250** |

## Los dos métodos, cara a cara

| Dato | Aparato (mediametrics) | Bitstream (ffprobe) | ¿Coinciden? |
|---|---|---|---|
| Familia de códec | `video/avc` | `h264` | **SÍ** |
| Resolución | `1920x1080` | `1920x1080` | **SÍ** |
| Perfil | `profile:2` (AVC **Main**) | **High** | **NO** |
| Nivel | `level:32768` (AVC **L5.1**) | **L4.0** (`level_idc=40`) | **NO** |
| Audio | AAC, 44.100 Hz, 2 ch | aac LC, 44.100 Hz, 2 ch | **SÍ** |

**Resolución, familia de códec y audio coinciden por dos vías independientes.** Eso es una medición sólida.

**Perfil y nivel no coinciden, y no lo resuelvo.** Las explicaciones posibles:

- `profile:2` y `level:32768` son **enums de Android** (`AVCProfileMain=0x2`, `AVCLevel5_1=0x8000`), no los valores del bitstream (`profile_idc=100` para High, `level_idc=40` para L4.0). Es decir: el aparato podría estar informando **lo que el reproductor pidió configurar**, no lo que el SPS declara.
- O el reproductor está pidiendo una variante distinta de la que yo bajé. El manifiesto cambia de host CDN entre peticiones (`192.142.25.8` antes, `192.142.27.62` ahora) y el número de segmento avanza (708 → 733).

**No elijo la explicación.** Lo que sí queda claro: **un recibo de mediametrics no es prueba del perfil del bitstream.** Para eso hace falta sondear el segmento, como se hizo aquí.

## Dos cosas nuevas que el aparato nunca dijo

1. **Hay una pista `dvb_teletext`** (subtítulos/teletexto de 492x250). El catálogo promete subtítulos; el flujo los trae. **Si el reproductor los muestra y si se conservan, sin medir.**
2. **5,90 Mbps para 1080p.** Es un bitrate modesto para esa resolución — coherente con un flujo de proveedor, no con un máster. No lo califico de bueno ni de malo: es el dato.

## Lo que NO pude cerrar, y por qué

Intenté localizar el canal `548062` en el catálogo para comparar **lo declarado** (`ape-profile`) con **lo medido** (1080p). **No apareció en los primeros 90 MB de dos listas.** La lista viva pasa de **1 GB** y una búsqueda parcial no es una ausencia: **no concluyo nada**.

Esa comparación —declarado contra medido, canal por canal— es exactamente lo que §11 exige («no conviertas la etiqueta comercial 6K/8K en una declaración falsa»), y sería el siguiente trabajo de verdad: recorrer el catálogo entero extrayendo `ape-profile` y contrastarlo con el segmento real de cada canal. Es caro (un `ffprobe` por canal) pero es medible.

## Lo que este documento NO dice

- **No dice que la imagen se vea bien.** Sigue sin haber ojos en el panel ni captura fiable del plano de vídeo.
- **No dice que el canal sea 4K ni que no lo sea.** Dice que el flujo medido es 1080p y que no encontré su fila en el catálogo para saber qué declara.
- **No dice nada de frames perdidos**: el segmento es un fichero, no una reproducción.
