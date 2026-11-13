# HEVC: qué mejora de verdad, y por qué el detector de bloque no se puede adaptar

**Dos preguntas del operador:** «buscar el HEVC en su mejor formato de máxima calidad vía ffmpeg» y «adapta el detector de bloque para que funcione con streams HEVC de alta resolución».

**Las dos se responden con medición. La segunda con un NO razonado.**

---

## 1 · El detector de bloque NO se puede adaptar a HEVC. Falla MÁS.

Mismo contenido, mismo recorte, mismo experimento en los dos codecs:

| codec | 8000 kbps | 2000 kbps | 500 kbps | `borde8` monotónica creciente |
|---|---|---|---|---|
| H.264 | `HF 1,8228` · `borde8 1,2549` | `HF 1,7147` · `borde8 1,2076` | `HF 1,3382` · `borde8 1,2761` | **NO — 1 inversión** |
| HEVC | `HF 1,7988` · `borde8 1,2612` | `HF 1,7133` · `borde8 1,1213` | `HF 1,5026` · `borde8 1,0985` | **NO — 2 inversiones** |

**La métrica `borde8/resto` falla en los dos, y en HEVC falla más.**

### La causa, y es del códec no del contenido

H.264 y HEVC llevan **deblocking en bucle** dentro del codificador, y **HEVC además lleva SAO** (Sample Adaptive Offset). Los dos filtros están **dentro** del códec y su trabajo es exactamente **borrar los bordes de bloque**.

**Medir energía alineada a la rejilla de 8 para detectar compresión es medir lo que el códec ya eliminó.** Con HEVC, que tiene un filtro más, el resultado es aún más plano.

**Adaptar la métrica no la arregla. Hay que sustituirla.**

## 2 · La métrica que SÍ funciona, y funciona en los dos codecs

```
HF = media de |Y − desenfoque(Y)|
```

**Monotónica decreciente con 0 inversiones en H.264 Y en HEVC** (verificado en el gate `test_hevc_block_detector.js`, 4/4).

- Validada antes contra bitrate en `test_hf_detail_metric.js`: caída del 31,3 %, **0 inversiones**, control negativo **0,04 %** entre dos codificaciones idénticas.
- Es la que hay que usar como detector. Mide **pérdida de detalle**, que es lo que de verdad se pierde al comprimir.

## 3 · Y el dato del HEVC que sí importa: su ventaja está en bitrate BAJO

Comparando HF a igual bitrate:

| bitrate | H.264 HF | HEVC HF | ventaja HEVC |
|---|---|---|---|
| 8000 kbps | 1,8228 | 1,7988 | **−1,3 %** (empate técnico) |
| 2000 kbps | 1,7147 | 1,7133 | **−0,1 %** (empate) |
| **500 kbps** | **1,3382** | **1,5026** | **+12,3 %** |

**A bitrate alto los dos codecs empatan. La ventaja del HEVC aparece cuando el bitrate aprieta.** Y el caso del operador es exactamente ese: canales de 720p y 360p sobrecomprimidos.

**Conclusión práctica:** pedir HEVC al proveedor solo mejora la imagen **si el bitrate es bajo**. A 8 Mbps, HEVC y H.264 dan lo mismo. **El "4K en HEVC" de bajo bitrate no es mejor por ser HEVC: es mejor porque conserva más detalle con pocos bits.**

## 4 · La cadena ffmpeg de máxima calidad HEVC

```bash
ffmpeg -i entrada.mkv \
  -c:v libx265 -preset slower -crf 16 \
  -pix_fmt yuv420p10le -profile:v main10 \
  -x265-params "sao=1:deblock=-1,-1:psy-rd=2.0:aq-mode=3:rdoq-level=2:rd=6:log-level=none" \
  -c:a copy salida.mkv
```

| Ajuste | Por qué |
|---|---|
| `-crf 16` | territorio visualmente sin pérdida |
| `-preset slower` | más esfuerzo de búsqueda = más calidad por bit |
| `-pix_fmt yuv420p10le` + `main10` | **10 bits: el paso de cuantización se reduce 4× → ataca el banding** |
| `sao=1` | Sample Adaptive Offset: filtra zonas planas en el bucle |
| `deblock=-1,-1` | deblocking **más suave**: conserva detalle en vez de borrarlo |
| `psy-rd=2.0` | optimización psico-visual: conserva textura |
| `aq-mode=3` | reparte bits en zonas oscuras/planas, donde aparece el banding |

**Y el techo real, con honestidad:** `HEVC_444_10` (4:4:4 10 bits) existe y es lo máximo, pero **no lo decodifica ningún consumidor**. Es material para la ruta JIT/VPS del Canary, **no para el reproductor**. Para OTT/TiviMate el techo es **Main10 4:2:0**.

## 5 · El criterio para identificar HEVC de calidad real, por ffprobe

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,pix_fmt,color_space,color_transfer,color_range,bit_rate,width,height \
  -of default=noprint_wrappers=1 entrada.mkv
```

| Campo | Máxima calidad | Señal de alarma |
|---|---|---|
| `profile` | `Main 10` | `Main` (8 bits) |
| `pix_fmt` | `yuv420p10le` | `yuv420p` (8 bits) |
| `color_space` + `color_transfer` | `bt2020nc` + `smpte2084` (HDR10) | `bt709` + `smpte170m` (incoherente) |
| `color_range` | `tv` (16-235) | `pc` sobre contenido de estudio |
| `bit_rate` a 2160p | ≥ 25 Mbps | < 8 Mbps con etiqueta 4K = upscale |

**Ese último es el caso del operador**: el canal se anuncia UHD y entrega 1280×720 H.264.

## 6 · Lo que NO está medido

- **No se ha medido sobre un stream HEVC real de proveedor.** Todo sale de codificar la grabación del operador. El mecanismo (deblocking + SAO) es del códec, no del contenido, y por eso el veredicto se sostiene; los números concretos podrían variar.
- **No se reprodujeron los ficheros HEVC en el ONN.** Los 10 bits solo evitan banding si el decodificador y el panel los respetan, y este aparato tiene panel 8 bits y composición capada a 1080p.
- **No se completó la codificación 4:4:4 10 bits**: a preset `medium` tardaba demasiado y se canceló. **No hay medición de esa variante, y no se presenta como si la hubiera.**

## 7 · Artefactos

- `docs/audits/HEVC_BLOCK_DETECTOR_TEST.json` — las dos métricas × dos codecs × tres bitrates
- `docs/audits/BLOCKINESS_TWO_CLASS.json` — la calibración por dos clases con contenido controlado
- `docs/audits/BLOCKINESS_CALIBRATION.json` — la distribución de la métrica por regiones
- `tools/quality/test_hevc_block_detector.js` — el gate que demuestra lo anterior (4/4)
- `tools/quality/test_hf_detail_metric.js` — el gate de la métrica correcta (5/5, control negativo 0,04 %)
