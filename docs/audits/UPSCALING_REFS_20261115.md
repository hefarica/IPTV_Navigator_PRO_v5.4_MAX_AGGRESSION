# UPSCALING NEURONAL — REAL-Video-Enhancer / video2x / Anime4K / WebSR
## Viabilidad real en el ONN 4K (AMLS905Y4) y licencias

**Tarea:** t70 · **Autor:** http-prober · **Fecha:** 2026-11-15 (UTC) · **Kind:** work
**Encargo del operador (textual):**
```
git clone https://github.com/TNTwise/REAL-Video-Enhancer.git
video2x -i source.mp4 -s 4 -e realesrgan -m RealESRGAN_x4plus_anime_6B
mpv upscaled_4k.mp4 --glsl-shaders="Anime4K_Upscale_CNN_L_x2.glsl"
```

---

## 0. VEREDICTO EN 5 LÍNEAS

1. **Ninguna de las tres técnicas puede correr EN EL DEVICE durante la reproducción en vivo.** No es
   opinión: el modelo cuesta ≈**13 TFLOPs por fotograma** y el SoC entrega ≈**13–22 GFLOPS** reales →
   ≈**660 s por fotograma** frente a un presupuesto de **20 ms**. Sobra un factor **~33.000×**.
2. **Las dos aplicaciones que nombró el operador son AGPL-3.0** (REAL-Video-Enhancer y video2x). Eso es
   un **bloqueo de licencia** para un producto cerrado, independiente de que además no quepan.
3. **Anime4K y WebSR sí son permisivos** (MIT), y Real-ESRGAN es BSD-3. El problema de Anime4K no es la
   licencia: es que **necesita mpv**, y OTT Navigator no es mpv. El de WebSR es que necesita **WebGPU en
   un navegador** y OTT no ejecuta JavaScript.
4. **`websr.attachToVideo(player, {quality:'6k'})` no existe.** WebSR es real (npm `@websr/websr`, MIT)
   pero su API es `new WebSR({canvas, gpu, network_name, weights})` + `render(source)`. El snippet del
   encargo no corresponde a ninguna API publicada.
5. **Única ruta viable: (a) OFFLINE sobre ficheros VOD, y sólo con GPU alquilada** — en el VPS actual
   (3 vCPU, **sin GPU**) tardaría ≈**13 días por cada 24 s de vídeo**. Y **no sirve para el directo**, que
   es justo lo que el operador quería mejorar. Para el directo, la mejora real es el **VPP por hardware
   del SoC** (t56/t57), no el upscaling neuronal.

---

## 1. QUÉ ES CADA PIEZA, LEÍDA DEL CÓDIGO (no del README)

### 1.1 REAL-Video-Enhancer — `TNTwise/REAL-Video-Enhancer`

| Dato | Valor medido |
|---|---|
| SHA fijado | **`8541c46ca14e6f84fc86c5b9d3b75373e25732e5`** (2026-09-01) |
| Ficheros / bytes | 678 ficheros / 5.203.327 B |
| **Licencia** | **AGPL-3.0** (`LICENSE` 35.186 B, cabecera *"GNU AFFERO GENERAL PUBLIC LICENSE Version 3"*) |
| Backends reales | **TensorRT** (NVIDIA RTX 20+), **PyTorch** (CUDA 12.6 / ROCm 6.2), **NCNN** (Vulkan 1.3) |
| Cómo ejecuta | App **Python de escritorio** empaquetada con PyInstaller. En el código: `import onnxruntime as ort`, `from rife_ncnn_vulkan_python import wrapped`, `import torch.nn` |
| Requisitos declarados (README L65-73) | CPU **x64** Dual/Quad · GPU **Vulkan 1.3** o **NVIDIA RTX 20+** · **VRAM 4 GB** (NCNN) / 8 GB (TensorRT) · Disco 1–16 GB · **Windows 10/11 x64, macOS 14+, Linux Ubuntu 22.04+** |
| SO soportados | **Ninguno Android.** No hay build arm/Android en el repo. |

**Dato que corta el encargo por la mitad:** la tabla de modelos de su README (L83-91) **no contiene
`RealESRGAN_x4plus_anime_6B`**. Ese nombre es del catálogo de **video2x**, no de RVE. El encargo mezcla
dos proyectos distintos.

### 1.2 video2x — `k4yt3x/video2x` (el que sí tiene el `-m RealESRGAN_x4plus_anime_6B`)

| Dato | Valor medido |
|---|---|
| SHA fijado | **`7db9c18d6278bbad9c3eda0e4e4ae210f9a688eb`** |
| **Licencia** | **AGPL-3.0** (`LICENSE` 35.184 B + `NOTICE` 1.041 B) |
| Motor | *"Real-ESRGAN, Real-CUGAN y RIFE (todos los modelos) vía **ncnn y Vulkan**"* (README L33) |
| Requisito duro | **GPU con soporte Vulkan**: NVIDIA Kepler (GTX 600, 2012)+ / AMD GCN 1.0+ (README L47-51) |
| Distribución | Instalador **Windows amd64**; alternativas Linux x64 / Colab |
| Terceros | `nihui/realcugan-ncnn-vulkan`, `nihui/rife-ncnn-vulkan` → **MIT** (tabla del README L141-142) |

### 1.3 Anime4K — `bloc97/Anime4K`

| Dato | Valor medido |
|---|---|
| **Licencia** | **MIT** (1.063 B, *"Copyright (c) 2019 bloc97"*) |
| Qué es | Conjunto de **shaders GLSL para mpv**, se cargan con `--glsl-shaders` |
| Requisito | **mpv** (o mpv-android) con un contexto GL/GLES; no es una librería enlazable |

### 1.4 WebSR — `sb2702/websr` (el `websr.attachToVideo(...)` del encargo)

| Dato | Valor medido |
|---|---|
| **Licencia** | **MIT** (1.074 B, *"Copyright (c) 2023 Sam Bhattacharyya"*) |
| Qué es | *"Javascript library / SDK para AI Upscaling en tiempo real **en el navegador**"*, sobre **WebGPU** (o WebGL2 con `@websr/webgl`) |
| API real | `WebSR.initWebGPU()` · `new WebSR({canvas, gpu, network_name, weights, …})` · `render(source)` · `switchNetwork()` · `setOutputResolution()` · `calibrate()` · `destroy()` |
| Entrada de `render()` | `HTMLVideoElement`, `VideoFrame`, `HTMLImageElement` o `ImageBitmap` |
| **`attachToVideo(player, {quality:'6k'})`** | **NO EXISTE** en el README ni en la tabla de métodos. El encargo cita una API inventada |
| Aviso del propio repo | *"This project is very new… shouldn't be used (yet) in production"* |
| Modelos | `websr/cnn-*` 2×, `websr/gan-*` 2×, `realesrgan/x4v3` 4× (puerto de Real-ESRGAN x4v3), `anime4k/cnn-2x-*` |

---

## 2. LICENCIAS — LA PARTE BLOQUEANTE

| Pieza | Licencia | ¿Bloquea el producto cerrado? |
|---|---|---|
| **REAL-Video-Enhancer** | **AGPL-3.0** | **SÍ.** Copyleft fuerte con cláusula de red: si el producto incorpora o interactúa por red con la obra, hay que liberar el código de la obra derivada. Incompatible con un APK/backend cerrado |
| **video2x** | **AGPL-3.0** | **SÍ**, por lo mismo |
| nihui/realcugan-ncnn-vulkan · rife-ncnn-vulkan | MIT | No |
| **Anime4K** | **MIT** | No |
| **Real-ESRGAN** (código) | **BSD-3-Clause** | No (exige mantener el aviso de copyright) |
| **WebSR** | **MIT** | No |
| **Pesos `RealESRGAN_x4plus_anime_6B`** | **NO COMPUTADO** | No descargué el `.pth` ni su fichero de términos. El *código* del repo es BSD-3; los pesos se distribuyen aparte y **hay que leer su licencia antes de usarlos**. Ver §7 |
| Pesos de los modelos de RVE (Nomos8k, AnimeJaNai, AniSD, 4x-SPANkendata…) | **NO COMPUTADO** | El README **no declara licencia de los pesos**; vienen de openmodeldb, donde **abundan las CC-BY-NC (no comercial)**. Riesgo real: sin auditar uno por uno, no se pueden usar |

**Conclusión de licencias:** las *libertades* están en los modelos (MIT/BSD-3); el **bloqueo está en las
dos aplicaciones** que el operador nombró. Si algún día se quiere esta capacidad, el camino limpio es
**llamar a ncnn/onnxruntime directamente** (MIT/Apache-2.0) con **pesos auditados**, no empaquetar RVE ni
video2x.

---

## 3. EL PRESUPUESTO DE 20 ms — LA ARITMÉTICA, NO ADJETIVOS

### 3.1 Lo que cuesta el modelo

`RealESRGAN_x4plus` (familia a la que pertenece el `anime_6B`) es una RRDBNet con **64 canales** y
**23 bloques RRDB × 3 sub-bloques × 5 convoluciones = 345 convoluciones 3×3 de 64→64 canales**.

Coste de **una** convolución 3×3 64→64 a resolución H×W:

```
FLOPs = 2 · C_in · C_out · 9 · H · W = 2 · 64 · 64 · 9 · H·W = 73.728 · H·W
```

Para una entrada **960×540** (0,518 Mpx) que se quiere llevar a 4K:

```
una conv   = 73.728 · 518.400            ≈ 3,82·10^10 FLOPs = 38,2 GFLOPs
345 convs  = 345 · 3,82·10^10            ≈ 1,32·10^13 FLOPs = 13,2 TFLOPs   <-- por fotograma
```

### 3.2 Lo que el SoC puede dar

Medido en el device: **4 núcleos Cortex-A35** (`CPU part 0xd04`) a **2.004 GHz**
(`cpuinfo_max_freq=2004000`).

```
Pico teórico FP32  = (4 lanes FP32 × 2 FLOP/FMA) FLOP/ciclo/núcleo = 8 FLOP/ciclo/núcleo
                   = 8 · 2,004 GHz = 16 GFLOPS por núcleo
                   = 16 · 4 núcleos ≈ 64 GFLOPS
Eficiencia realista de conv NEON en A35 (20-35 %)                ≈ 13-22 GFLOPS
```

### 3.3 El cociente

```
t = 1,32·10^13 FLOPs / 2,0·10^10 FLOPs/s ≈ 660 s POR FOTOGRAMA  (11 minutos)

Banda verificada (aritmética recomprobada con node, §8):
  a 13 GFLOPS (20 % de eficiencia) -> 1.015 s/fotograma -> 50.750× el presupuesto
  a 22 GFLOPS (35 %)               ->   600 s/fotograma -> 30.000× el presupuesto
  a 64 GFLOPS (pico teórico)       ->   206 s/fotograma -> 10.300× el presupuesto

Presupuesto del directo a 50 fps: 20 ms = 0,020 s   ->  sobran entre 10.300× y 50.750×
```

**Un solo dato más, para que no parezca un problema de "todo el modelo":** una **única** convolución de
las 345 cuesta `3,82·10^10 / 2,0·10^10 ≈ 1,9 s`. Es decir, **una sola capa ya consume 95 veces el
presupuesto completo de un fotograma**.

### 3.4 El otro muro: memoria

```
Tráfico por capa  = (64 canales · 0,518 Mpx · 4 B) leído + escrito ≈ 265 MB
Tráfico por frame = 345 · 265 MB ≈ 91 GB
A 50 fps          = 4.570 GB/s
LPDDR4 del S905Y4 ≈ 10-13 GB/s          ->  ~380× por encima del hardware
```

Y en RAM: pesos fp32 ≈ 16,7 M params · 4 B ≈ **67 MB**; cada buffer de activación de 64 canales a
0,518 Mpx ≈ **132 MB**, y hacen falta varios simultáneos. En el device hay **396–405 MB disponibles**
(`MemAvailable` medido, con `MemTotal=1.97 GB` y 981 MB de swap):
**no cabe sin trocear en tiles**, y trocear multiplica los accesos a memoria, ya 380× fuera de rango.

### 3.5 Estado medido del device (para que el informe se sostenga solo)

```
MemTotal: 1971588 kB (1,88 GiB)   MemAvailable: 396-405 MB   SwapTotal: 981692 kB
nproc: 4   cpuinfo_max_freq: 2004000 kHz   CPU part: 0xd04 (Cortex-A35)
ABI: armeabi-v7a  (abilist = armeabi-v7a,armeabi)   <-- 32 BIT, sin arm64-v8a
GLES: ARM Mali-G31, OpenGL ES 3.2   ro.hardware.vulkan=amlogic   egl: mali
Android 14 (ro.build.reference.fingerprint = Amlogic/oppen_wv4:14/...)
```

**El ABI de 32 bits es un clavo más en el ataúd**: los binarios Android de ncnn-vulkan y de
onnxruntime-qnn/GPU se publican **arm64-v8a**; en `armeabi-v7a` no hay builds utilizables.

---

## 4. LAS TRES TÉCNICAS CONTRA EL DEVICE

### 4.1 `video2x … -m RealESRGAN_x4plus_anime_6B`

| Necesita | El ONN 4K tiene |
|---|---|
| GPU **Vulkan** de escritorio (Kepler/GCN+) + binario **x64** | Mali-G31 (GLES 3.2), **armeabi-v7a 32-bit** |
| ~13 TFLOPs/fotograma | ~13–22 GFLOPS efectivos |
| VRAM 4 GB | 396 MB de RAM disponible |

**Veredicto: IMPOSIBLE en el device.** No por "lento": por arquitectura (x64 vs ARM 32-bit) y por
órdenes de magnitud (33.000×). **No hay nada que optimizar aquí.**

### 4.2 `mpv … --glsl-shaders="Anime4K_Upscale_CNN_L_x2.glsl"`

- Anime4K es **MIT** → licencia OK.
- Requiere **mpv**: OTT Navigator usa **ExoPlayer/MediaCodec**; no es mpv y **no acepta shaders GLSL**.
- El ARA (APK) **no puede inyectarse en el contexto GL de OTT**: Android no permite capturar el output de
  un MediaCodec de otra app sin root (hallazgo ya medido en t49).
- El hardware sí tiene GLES 3.2 (Mali-G31), así que la *capacidad gráfica* existe; **falta el anfitrión**.
  Un `mpv-android` propio reproduciría **su** stream, no el de OTT: eso sería **cambiar el reproductor del
  operador**, no mejorar el que usa.

**Veredicto: IMPOSIBLE de aplicar sobre OTT.** Viable sólo como reproductor alternativo (decisión de
producto distinta, y con un Mali-G31 que tampoco mueve CNN a 4K/50 fps).

### 4.3 `websr.attachToVideo(player, {quality:'6k'})`

- **La API no existe** (§1.4). Lo real es `render(source)` sobre un `<canvas>` con **WebGPU**.
- Requiere un **navegador** con WebGPU y un `HTMLVideoElement`. **OTT Navigator es una app nativa: no hay
  DOM, no hay JS, no hay `<video>`.** No existe el objeto `player` al que "attachear" nada.
- Además, `quality:'6k'` no es un parámetro de WebSR (sus opciones son `network_name`, `weights`,
  `resolution`, `outputResolution`, `inputScale`, `tier`, `precision`).

**Veredicto: NO APLICA.** Es una técnica de navegador; el reproductor del operador no es un navegador.

---

## 5. LA ÚNICA RUTA VIABLE, Y SU GATE

### 5.1 (a) OFFLINE sobre ficheros VOD — la única que existe hoy

**Requisito absoluto: GPU.** Medido en el VPS (sólo lectura, `ssh` desde este host):

```
nproc = 3   ·  AMD EPYC-Rome @ 2.0 GHz  ·  3.819 MB RAM (3.078 disponibles)
disco / : 38G, 30G usados, 6,2G libres (83 %)
nvidia-smi: AUSENTE -> NO HAY GPU
```

Coste en el VPS **sin GPU** (3 núcleos × ~16 GFLOPS × 30 % ≈ 14 GFLOPS):

```
1,32·10^13 / 1,4·10^10 ≈ 940 s por fotograma
24 s de vídeo a 50 fps = 1.200 fotogramas -> 1.128.000 s ≈ 13 DÍAS
```

Y el disco: 6,2 GB libres frente a un 4K de 24 s sin comprimir (≈ 1.200 × 33 MB ≈ **40 GB** en RGBA, o
varios GB comprimido). **El VPS no puede ni con el espacio.**

Coste con GPU alquilada — **NO MEDIDO en este entorno** (no hay GPU aquí): a ~30 TFLOPS efectivos
(RTX 4090, fp16, eficiencia ~20 %) serían ≈0,44 s/fotograma ≈ **9 min por cada 24 s de vídeo (~21×
tiempo real)**. **Es una ESTIMACIÓN, no una medición** — ver §7.

### 5.2 (b) ON-DEVICE via shim/APK — se descarta, con motivos

1. **No hay forma legítima de obtener los fotogramas de OTT** (sin root; MediaCodec ajeno no se puede
   capturar). Sin píxeles no hay red que aplicar.
2. **No hay capacidad de cómputo**: 13–22 GFLOPS y 396 MB frente a 13 TFLOPs y >400 MB de activaciones.
3. **No hay runtime**: ABI **armeabi-v7a 32-bit**; ncnn/onnxruntime Android salen arm64.
4. NNAPI existe (`current_feature_level=7`) pero **no hay acelerador de super-resolución** que ejecute una
   RRDBNet de 345 convoluciones a 50 fps; y NNAPI no aporta el modelo, sólo el ejecutor.

### 5.3 (c) DESCARTADA para el directo — y esto es lo importante

**Para el objetivo declarado del operador (mejorar la reproducción EN VIVO) las tres técnicas están
descartadas.** Decirlo claro: **ni RVE, ni video2x, ni Anime4K, ni WebSR mejoran un directo en este
televisor.** La ruta (a) sólo sirve para **ficheros VOD** y encima exige GPU alquilada.

La mejora real del directo en este hardware es la que ya se midió en t56/t57: **VPP por hardware del SoC**
(AI-SR/AI-PQ del Amlogic, escalado y realce en el pipeline de vídeo, sin tocar el bitstream) y la política
de display correcta. Eso sí corre a 4K/50 fps porque **no es una red neuronal en CPU: es hardware de vídeo**.

### 5.4 Gate de verificación para la ruta (a), si el operador la quiere

| # | Gate | Criterio medible |
|---|---|---|
| G1 | **Licencia** | Sólo con componentes **MIT/BSD/Apache** y **pesos auditados uno por uno**. RVE y video2x quedan **prohibidos** (AGPL-3.0) |
| G2 | **No degradar** | Ley Anti-Degradación intacta: la salida no puede bajar resolución, fps, bitrate ni rango. Ganancia medida con **VMAF/SSIM sobre el mismo clip**, no "se ve mejor" |
| G3 | **Coste** | Presupuesto declarado por hora de VOD (GPU alquilada) y **tiempo real medido**, no estimado |
| G4 | **Alcance** | El pipeline **rechaza** cualquier fuente marcada como `live/` — no se puede colar un directo en un proceso de 21× tiempo real |
| G5 | **Reproducibilidad** | `sha256` de entrada y salida + comando exacto + versión del runtime, en el informe |

---

## 6. LO QUE **NO** JUSTIFICA ESTO

Nada de lo anterior autoriza a bajar 4K a FHD, HEVC a H.264, HDR a SDR ni fps. **La Ley
Anti-Degradación sigue vigente** y este informe no abre ninguna excepción: si el upscaling no cabe, la
respuesta es **no hacerlo**, jamás "bajar la señal para que quepa".

---

## 7. NO COMPUTADO (declaración explícita)

| Item | Por qué no se computó |
|---|---|
| **GFLOPS efectivos del SoC** | No hay compilador ni binario de benchmark en el device y **no se instala nada** (regla del encargo). El rango 13–22 GFLOPS es aritmética sobre `cpuinfo_max_freq` medido y la arquitectura A35, **no** una medición |
| **Tiempo real por fotograma** | Consecuencia del anterior: 660 s es cálculo, no cronómetro. Para medirlo de verdad hace falta ejecutar el modelo en el device, que es justo lo que se demuestra imposible |
| **GFLOPS/tiempo en GPU** (RTX 4090 u otra) | **No hay GPU en este entorno** (`nvidia-smi` ausente en el VPS; esta máquina es Windows sin GPU declarada). Los ~21× tiempo real son **estimación** |
| **Licencia de los pesos `RealESRGAN_x4plus_anime_6B`** | No se descargó el `.pth` ni su fichero de términos; el *código* es BSD-3, los pesos hay que verificarlos aparte |
| **Licencia de cada peso de RVE** (Nomos8k, AnimeJaNai, AniSD, 4x-SPANkendata, DRUnet…) | El README no la declara; habría que abrir uno por uno en openmodeldb. **Riesgo de CC-BY-NC (no comercial)** sin auditar |
| **WebGPU en el WebView de este Android TV** | No se probó (requeriría abrir un navegador en el device). Es irrelevante para el veredicto: OTT no es un navegador |
| **Calidad visual (VMAF/SSIM) de una salida real** | No se generó ninguna salida: no hay GPU ni se ejecutó el modelo |

---

## 8. EVIDENCIA CRUDA

```
# Clonado y SHA (fuera del árbol rastreado: scratch/t70_upscaling_refs/)
git clone --depth 1 https://github.com/TNTwise/REAL-Video-Enhancer.git rve
  -> 8541c46ca14e6f84fc86c5b9d3b75373e25732e5  (2026-09-01)   678 ficheros / 5.203.327 B
git clone --depth 1 https://github.com/k4yt3x/video2x.git v2x
  -> 7db9c18d6278bbad9c3eda0e4e4ae210f9a688eb

# Licencias (cabeceras leídas)
rve/LICENSE  -> GNU AFFERO GENERAL PUBLIC LICENSE, Version 3
v2x/LICENSE  -> GNU AFFERO GENERAL PUBLIC LICENSE, Version 3
websr  LICENSE -> MIT License, Copyright (c) 2023 Sam Bhattacharyya
Anime4K LICENSE -> MIT License, Copyright (c) 2019 bloc97
Real-ESRGAN LICENSE -> BSD 3-Clause License, Copyright (c) 2021, Xintao Wang

# Device (192.168.1.3:5555)
MemTotal: 1971588 kB · MemAvailable: 396-405 MB · SwapTotal: 981692 kB
nproc 4 · cpuinfo_max_freq 2004000 kHz · CPU part 0xd04 (Cortex-A35)
ABI armeabi-v7a (abilist armeabi-v7a,armeabi) · GLES: ARM Mali-G31 OpenGL ES 3.2
persist.device_config.nnapi_native.current_feature_level = 7

# VPS 178.156.147.234 (sólo lectura)
nproc 3 · AMD EPYC-Rome @ 2.0 GHz · Mem 3819 MB (3078 available)
/dev/sda1 38G, 30G usado, 6,2G libre (83 %) · nvidia-smi: AUSENTE (sin GPU)
```

*Informe de investigación: no se instaló nada en el device, no se ejecutó nada en el VPS de producción,
no se tocó el VPS más allá de lecturas, y no se modificó ni una línea del generador ni del APK.*

---

## 9. RECOMPROBACIÓN INDEPENDIENTE DE LA ARITMÉTICA

Las cuentas de §3 y §5.1 se recalcularon aparte con `node -e` (no a mano, para que no haya arrastre de
error). Salida literal:

```
una conv (960x540)   = 38.2 GFLOPs
345 convs = 1 frame  = 13.19 TFLOPs
pico FP32 por nucleo = 16.0 GFLOPS  x4 = 64 GFLOPS
  eficiencia 20% -> 1028 s/frame = 51405x el presupuesto de 20 ms
  eficiencia 35% ->  587 s/frame = 29375x el presupuesto de 20 ms
  eficiencia 100% -> 206 s/frame = 10281x el presupuesto de 20 ms
trafico/capa read+write = 265 MB ; por frame = 91.6 GB ; a 50fps = 4.58 TB/s
VPS 3 nucleos x16 GFLOPS x30% = 14.4 GFLOPS -> 916 s/frame ; 1200 frames = 12.7 dias
4K RGBA frame = 33.2 MB ; 1200 = 39.8 GB
```

Coincide con lo publicado arriba dentro del redondeo. Los únicos números **estimados** (no medidos) siguen
siendo los marcados en §7: GFLOPS efectivos reales y rendimiento en GPU.

