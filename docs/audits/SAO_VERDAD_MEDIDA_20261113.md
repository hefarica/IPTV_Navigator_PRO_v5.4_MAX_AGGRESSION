# SAO NO SE PUEDE DETECTAR DESDE LOS PÍXELES — y su efecto medido es 3× menor que el del bitrate

**Petición:** añadir detección de artefactos SAO al detector HEVC e integrarlo con el calibrador automático.

**Se midió el efecto de SAO. Se midió cuánto pesa frente al bitrate. Y hay un problema de identificabilidad que hace inviable el detector tal como se plantea.**

---

## 1 · Lo que se midió

Mismo contenido, mismo bitrate, misma codificación: **la única variable es `sao=0` vs `sao=1`**. HF = `media de |Y − desenfoque(Y)|`.

| bitrate | zona | `sao=0` | `sao=1` | efecto de SAO |
|---|---|---|---|---|
| 4000 kbps | **PLANA** (césped, σ=28,5) | 1,5570 | 1,5165 | **−2,60 %** |
| 4000 kbps | **DETALLE** (rótulos, σ=36,1) | 1,8275 | 1,7888 | **−2,12 %** |
| 800 kbps | PLANA | 1,4318 | 1,4361 | **+0,30 %** (al revés) |
| 800 kbps | DETALLE | 1,7245 | 1,7069 | −1,02 % |

**Tres hechos que se siguen:**

1. **El efecto es pequeño: 2,6 % en el mejor caso, y desaparece a bitrate bajo** (a 800 kbps SAO incluso *añade* 0,30 % de HF).
2. **NO es específico de la zona plana**: 2,60 % plano contra 2,12 % detalle. Si SAO sobre-suavizara las bajas frecuencias como se afirma, la diferencia entre regiones debería ser grande. **No lo es.**
3. **El bitrate mueve el detalle 3,1× más que SAO**: de 4 Mbps a 800 kbps el HF del césped cae **−8,0 %**, mientras SAO aporta **−2,6 %**.

## 2 · El problema que hace inviable el detector, y no es de umbrales

**SAO es un filtro EN BUCLE del codificador. El decodificador lo APLICA, no lo deshace.** Los parámetros de SAO viajan en el bitstream y el resultado queda **horneado en el fotograma decodificado**.

**Consecuencia:** desde los píxeles decodificados **no se puede atribuir** un suavizado a SAO. Es **indistinguible** de:

- la cuantización (el efecto dominante, 3× mayor),
- el filtro de deblocking, que también está en el bucle,
- el contenido original.

**Sólo se puede aislar SAO comparando la MISMA codificación con y sin él — y eso exige el ENCODER, no el reproductor.** Que es exactamente lo que hice arriba para medirlo, y exactamente lo que la APK **no puede hacer** sobre el stream de un proveedor.

**Por eso el detector propuesto no mediría "artefacto SAO": mediría cuantización y la llamaría SAO.** Es un problema de identificabilidad, no de calibración. **Ningún umbral lo arregla.**

## 3 · Lo que el código propuesto tiene además, y no compilaría

| Elemento | Problema |
|---|---|
| `ImageReader(YUV_420_888)` como salida de `MediaCodec` | **El mismo bloqueante de siempre**: `configure()` exige surface de render; los decoders de hardware no entregan YUV legible por CPU. Falla antes de analizar. |
| `P010 = 0x7F000789, 35` | `0x7F000789` es `COLOR_FormatYUV420Flexible`, **no P010**. Y `35` no es un `ImageFormat` de Android. |
| "SAO divide 0–1023 en 32 bandas de 32 niveles" | **La descripción es incorrecta**: el *band offset* de SAO usa **32 bandas**, pero la elección de banda y el offset son **por bloque y por componente**, señalizados en el bitstream. **No son visibles en la imagen.** |
| `calculateHighFreqEnergyP010` / `LowFreqEnergy` | Las dos miden varianza del mismo bloque. Su cociente no separa HF de LF: **no es un cociente espectral**. |
| `DISABLE_SAO` como acción | **No existe API** para que un reproductor desactive SAO del decodificador: se aplica en el códec, no es un ajuste. |
| Umbrales `0.15 / 0.3 / 0.05` | Sin medición. Este documento los sustituye por los números de arriba. |

## 4 · Lo que SÍ se puede construir, y es lo que se implementó

**La métrica correcta es HF, y es relativa al contenido.** Un umbral absoluto no sirve: el HF de un césped y el de unos rótulos son distintos. Pero **la caída de HF respecto al propio arranque del stream sí es medible y sí indica degradación**.

**El suelo de ruido está medido**: dos codificaciones idénticas dan **0,04 %** de diferencia. Eso fija el umbral con datos, no a ojo:

```
diferencia < 1 %   -> ruido de medida, ignorar
diferencia >= 2 %  -> cambio real (50x el suelo de ruido)
diferencia >= 8 %  -> degradación severa (lo que hace bajar el bitrate a la mitad)
```

**Y sobre eso se construye el calibrador automático**: línea base por sesión de las primeras N muestras, y alerta por caída relativa. Ver `tools/quality/hf_session_calibrator.js`.

## 5 · Lo que NO está medido

- **No se leyó el bitstream**: no se distingue *band offset* de *edge offset*, ni su intensidad por bloque. El efecto medido es el resultado en la imagen, no el parámetro.
- **Una sola fuente de contenido.** Otra escena podría dar otro porcentaje — aunque el hecho de que el efecto no sea específico de la región plana no depende de la escena.
- **El control negativo del test SAO no terminó**: la segunda codificación HEVC idéntica se canceló por tiempo. El suelo de ruido de 0,04 % viene del gate `test_hf_detail_metric.js`, que sí lo midió sobre el mismo tipo de codificación.
- **No se reprodujo nada en el ONN**: todo es codificación local sobre la grabación del operador.

## 6 · Veredicto

**No se añade detección de artefactos SAO**: el efecto es 3× menor que el del bitrate, no es específico de la región donde se afirma que actúa, desaparece a bitrate bajo, y **no es identificable desde los píxeles decodificados**.

**Se usa la métrica HF con umbral relativo al propio stream**, calibrada con el suelo de ruido medido. Es más débil que lo que se pedía, pero **mide algo real** en vez de atribuir a SAO lo que hace la cuantización.

**Y el "suavizado plástico" que el operador describe sí existe y sí se detecta — con HF, no con un detector de SAO.** La caída de HF *es* la pérdida de textura fina.
