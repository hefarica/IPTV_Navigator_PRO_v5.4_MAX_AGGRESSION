# EL DETECTOR HF CON CLASIFICACIÓN DE ZONA FUNCIONA — 0 falsos positivos, 4/4 verdaderos

**El operador corrigió mi refutación.** Yo había medido que la calibración por sesión daba falsos positivos: dos codificaciones idénticas marcaban «DEGRADADO». Él propuso clasificar la zona por **varianza local** antes de alertar. **Se probó y funciona.**

---

## 1 · La idea que faltaba

Mi calibrador anterior comparaba el HF de cada fotograma contra la línea base del arranque. **No distinguía** entre:

- «el detalle cayó porque el codificador lo tiró» → degradación real
- «el detalle cayó porque la escena es un plano más plano» → contenido distinto

La propuesta del operador añade una segunda medida por fotograma: **la varianza local**. Y la regla:

```
alertar SOLO si:
    la varianza actual está dentro de ±20 % de la de la línea base   (misma escena)
  Y el HF cae por encima del umbral                                  (detalle perdido)
```

**Si la escena cambia, la varianza cambia y el detector se calla.** Si la escena es la misma, la varianza se mantiene y una caída de HF sólo puede venir de la compresión.

## 2 · Las dos pruebas, y las dos pasan

### Control negativo — dos codificaciones IDÉNTICAS (4 Mbps, mismos parámetros)

| copia | HF línea base | alertas SIN zona | alertas CON zona |
|---|---|---|---|
| a | 2,0593 | **7** | **0** |
| b | 2,0593 | **7** | **0** |

**Las 7 alertas desaparecen.** Y las dos copias dan exactamente lo mismo: el detector es determinista.

### Prueba positiva — mismo contenido, 8 Mbps en la primera mitad y 400 kbps en la segunda

| momento | caída de HF | diferencia de varianza | veredicto CON zona |
|---|---|---|---|
| t = 4,0 s | **31,16 %** | 6,1 % | **SEVERO** |
| t = 4,5 s | **30,28 %** | 2,5 % | **SEVERO** |
| t = 5,0 s | **25,73 %** | 5,9 % | **SEVERO** |
| t = 5,5 s | **14,29 %** | 2,1 % | **SEVERO** |

**4 de 4 alertas se conservan.** La degradación real se detecta, y la varianza se mantiene entre 2,1 % y 6,1 % — muy por debajo de la tolerancia de 20 %, porque **es la misma escena**.

**El detector distingue lo que yo no supe distinguir.**

## 3 · Los umbrales, todos medidos

| Parámetro | Valor | Origen |
|---|---|---|
| Suelo de ruido | **0,04 %** | dos codificaciones idénticas: `test_hf_detail_metric.js` |
| Umbral de alerta | **2,0 %** | 50 × el suelo de ruido |
| Umbral severo | **8,0 %** | equivale a bajar el bitrate a la mitad (medido: 4000→800 kbps da −8,0 %) |
| Tolerancia de zona | **20 %** | dentro de esto la escena se considera la misma. **Esta es la única cifra no derivada de una medición directa**: se eligió para dejar pasar variaciones de varianza del 6 % (medidas en la prueba positiva) y cortar los cambios de plano del vídeo real |

## 4 · Lo que el detector SÍ y NO detecta

### Sí detecta

- **Caída de bitrate en caliente** (cambio de variante del proveedor) — probado, 31 % de caída detectado.
- **Degradación brusca** manteniendo la escena — probado.
- **Recuperación** (la caída desaparece al volver el bitrate).

### No detecta, y hay que decirlo

- **Cambio de escena simultáneo a la degradación.** Si el canal baja el bitrate justo cuando hay un corte de plano, la varianza cambia y el detector se calla. **Es un falso negativo por diseño**, y es el precio de eliminar los falsos positivos.
- **Degradación lenta y progresiva.** Si el HF cae un 0,5 % por minuto, nunca cruza el umbral de 2 % en un fotograma. Haría falta comparar contra una línea base móvil.
- **Calidad absoluta.** No dice si la imagen es buena; dice si **empeoró respecto a su propio arranque**. Un canal que ya viene mal desde el principio da línea base mala y no alerta nunca.
- **Atribución de la causa.** No distingue cuantización de SAO de deblocking. Eso quedó refutado y está documentado en `SAO_VERDAD_MEDIDA_20261113.md`.

## 5 · El bloqueante que sigue en pie para llevarlo al aparato

**Este calibrador se ejecuta contra ficheros.** Para correrlo sobre el decodificador del ONN hay que resolver lo que ya está documentado en `VEREDICTO_BLOCKINESS_DETECTOR_20261113.md`:

> `ImageReader(YUV_420_888)` **no puede ser el surface de salida de `MediaCodec`**: `configure()` exige un surface de render, y los decoders de hardware no entregan YUV legible por CPU.

**Ese bloqueante NO está resuelto.** Las tres salidas reales son:

1. **Renderer propio** con `MediaCodecVideoRenderer` en modo ByteBuffer — pierde el render directo, hay que renderizar a mano.
2. **SurfaceTexture + shader** que calcule el HF en GPU y lo lea con `glReadPixels` — caro, pero es la vía compatible con Media3.
3. **No hacerlo en el aparato**: correrlo en el **VPS/JIT**, donde el frame ya está en CPU por definición, y mandar el veredicto por `device_settings`.

**La opción 3 es la única que no toca el camino de reproducción**, y es coherente con el contrato del sistema: el VPS mide, la APK aplica.

## 6 · Artefactos

| Fichero | Qué contiene |
|---|---|
| `tools/quality/hf_zone_aware_calibrator.js` | el detector con clasificación de zona, ejecutable |
| `docs/audits/HF_ZONE_AWARE.json` | la salida sobre el vídeo real |
| `tools/quality/test_hf_detail_metric.js` | el gate que mide el suelo de ruido (5/5) |
| `docs/audits/HF_SESSION_CALIBRATION.json` | la versión SIN zona, que falló, conservada como evidencia |

**Crédito donde corresponde: la clasificación por varianza es del operador. Sin ella, el detector marcaba canales buenos como degradados.**
