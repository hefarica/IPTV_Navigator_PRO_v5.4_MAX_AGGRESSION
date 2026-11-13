# LOS ARTEFACTOS DE LA BANDA INFERIOR — probado, medido, y con el veredicto honesto

**Petición del operador (verbatim):**
> «esos son la mierda que debes corregir con el Ffmpeg desinterlace o con el famoso denoise con lanzocs para que no aparezca nunca»

**Se probó. Se midió. La hipótesis no se sostiene, y se dice con números.**

---

## 1 · Qué son esos artefactos, medidos

Zona: la banda inferior con los rótulos publicitarios. Dos medidas sobre fotogramas consecutivos:

```
diferencia temporal (f1 vs f2), por fila:
  filas  0-40 → 0,78 – 0,96
  filas 48-72 → 1,67 – 2,28        ← 2,3× más cambio

dispersión espacial dentro de la fila:
  filas  0-30 →  7,4 –  9,6
  filas 40-70 → 13,0 – 22,7        ← el doble de detalle
```

**La banda tiene el doble de detalle y el doble de movimiento.** Es donde coinciden texto de alto contraste y movimiento de cámara: **el peor caso posible para un codificador con pocos bits**. Los artefactos están en los **píxeles de origen**.

## 2 · El A/B real, con ffmpeg de verdad

Extraído el fotograma de la banda y aplicadas las cadenas pedidas. Métrica: gradiente medio en columnas múltiplo de 8 dividido por el gradiente en el resto. Si hay artefacto de bloque, el cociente sube.

| Cadena aplicada | borde8 / resto | Veredicto |
|---|---|---|
| **original** | **1,248** | base |
| **`bwdif` (desentrelazar)** | **1,273** | **EMPEORA +2,0 %** |
| `deblock=filter=strong:block=8` | **1,168** | **el ÚNICO que mejora: −6,4 %** |
| `nlmeans+gradfun` | 1,214 | mejora −2,7 % |
| `bwdif+deblock+nlmeans` | 1,206 | −3,4 % |
| **`scale` lanczos ×2** | **1,522** | **EMPEORA +22,0 %** |

Evidencia visual: [`evidencia/AB_FILTROS_BANDA_INFERIOR.png`](evidencia/AB_FILTROS_BANDA_INFERIOR.png) (orden: original, deblock, bwdif, lanczos) · [`evidencia/BANDA_INFERIOR_x2.png`](evidencia/BANDA_INFERIOR_x2.png)

**Las tres conclusiones que se siguen, sin adornos:**

1. **Desentrelazar un stream progresivo AÑADE artefactos.** `bwdif` empeora. No es la causa.
2. **`lanczos` sobre esto es lo peor que se puede hacer**: realza precisamente los bordes de bloque que se quieren quitar.
3. **`deblock` es el único que ayuda, y sólo un 6,4 %.** Ninguna cadena lo elimina: **un filtro redistribuye píxeles, no crea información que el codificador descartó.**

## 3 · Y el punto que decide: NINGUNA de estas cadenas se puede ejecutar aquí

| Capa | Estado | Evidencia |
|---|---|---|
| **VPS** | metadata-only; candado `\.(ts\|m4s\|mp4) → 404`; **no transcodifica** | `01_ARQUITECTURA_Y_HUECOS.md` |
| **OTT Navigator** | **ignora `#EXTVLCOPT`**; sólo lee `USER-AGENT` y `http-referrer` | skill `ape-image-pipeline-truth` §11 |
| **VLC** | **rechaza `video-filter` desde playlist por POLÍTICA**: `unsafe option "video-filter" has been ignored for security reasons` | skill `ape-image-pipeline-truth` §6 |
| **APK** | sus efectos GL dan **pantalla negra** (16.280 B = negro vs 1.694.782 B con vídeo real) | medido en sesión |

**Escribir la cadena en la lista y decir que se aplica sería mentir al parser y al operador.** Es exactamente el anti-patrón que la doctrina del repo prohíbe.

## 4 · Lo que SÍ existe: el desentrelazador de hardware, y por qué no llega

**Hallazgo nuevo de esta ronda.** Este SoC **tiene desentrelazador por hardware**:

```
/sys/class/deinterlace/di0 -> ../../devices/platform/multi-di/deinterlace/di0
/dev/di0             crw------- root  root      u:object_r:di0_device:s0          490,0
/dev/di_process.0    crw-rw---- media graphics  u:object_r:vendor_video_device:s0  302,0
/dev/di_process.1    crw-rw---- media graphics  u:object_r:vendor_video_device:s0  302,1
getenforce → Enforcing
cat /sys/class/di_process/di_proc_enable → Permission denied
```

**El hardware está cargado y vivo, pero los nodos son de `media`/`graphics` con contexto SELinux `vendor_video_device`. Una app normal no los alcanza. Una etiqueta de playlist, mucho menos.**

**Esto cierra la vía Amlogic con honestidad**: no es que no exista — es que **no está autorizada para nosotros**. La usa el pipeline del vendor (`amvdec_ports`, `decoder_common`), no una app de usuario.

## 5 · Segundo hallazgo: la incoherencia de color que explica el verde enfermizo

De la sesión de códec real, con el stream 720p reproduciéndose:

```
android.media.mediacodec.width                = 1280
android.media.mediacodec.height               = 720
android.media.mediacodec.profile              = 2          (H.264 Main)
android.media.mediacodec.config-color-standard= 1          (BT.709)
android.media.mediacodec.config-color-transfer= 3          (SMPTE 170M = BT.601)
android.media.mediacodec.config-color-range   = 2          (full/JPEG)
```

**Un stream 720p debería ser BT.709 en estándar Y en transferencia.** Aquí el estándar dice 709 y la transferencia dice 170M. **Esa mezcla desplaza los colores** — es la firma del verde sobresaturado y el rojo quemado de la imagen.

**Es del stream, no nuestro.** Y no hay ajuste en la APK que lo corrija sin tocar el decodificador.

## 6 · Lo que de verdad mueve la aguja, por orden de impacto medido

| # | Acción | Impacto | En nuestro control |
|---|---|---|---|
| 1 | **Composición 4K** (`ro.surface_flinger.max_graphics_height=1080` capa el compositor a 1080p → doble escalado 720p→1080p→4K, ver `DOBLE_ESCALADO_VIDEO_20261113.md`) | **el mayor**: quita una interpolación entera | **NO — es propiedad de build** |
| 2 | **Buscar una variante real mejor** del canal (el `4K S1` apunta a un `/live/` que da 404) | alto si existe | **SÍ — republicar con la ruta viva** |
| 3 | **Dejar de llamar UHD/4K a un 720p** | no cambia píxeles, cambia expectativas | **SÍ** |
| 4 | `deblock` en la cadena | −6,4 % de artefacto de bloque | **SÍ se escribe, NO se ejecuta** |
| 5 | `bwdif` / `lanczos` | **empeoran** | — |

## 7 · Reproducible

```bash
# el A/B
ffmpeg -ss 8.7 -i "<video>" -frames:v 1 -vf "crop=760:80:250:490,bwdif=mode=send_frame:deint=all" o.png
ffmpeg -ss 8.7 -i "<video>" -frames:v 1 -vf "crop=760:80:250:490,deblock=filter=strong:block=8"    d.png
# el desentrelazador de hardware
adb shell 'ls -lZ /dev/di0 /dev/di_process.*; getenforce'
adb shell 'cat /sys/class/di_process/di_proc_enable'   # Permission denied
# la incoherencia de color
adb shell 'dumpsys media.metrics | grep -o "config-color-[a-z]*=[0-9]*"'
```
