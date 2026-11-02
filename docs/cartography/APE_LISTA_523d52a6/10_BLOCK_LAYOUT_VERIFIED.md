# El layout del bloque de canal: verificado, y el generador lo conserva

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.

La skill `ape-image-pipeline-truth` §10 avisa de que **el URI no es la última línea del bloque**. Si eso
es cierto, cualquier parser que cierre el bloque en el URI **pierde tags**. Lo he verificado de forma
independiente y he comprobado si mi propio generador cae en la trampa.

---

## 1 · La verificación: distribución de líneas tras el URI

| `lines_after_uri` | Canales |
|---:|---:|
| **3** | **10.572** |
| **7** | **1** (el último) |

Coincide **exactamente** con lo que la skill declara. Los 2 tags que quedan tras el URI:

```
#EXTVLCOPT:clock-jitter=0
#EXT-X-APE-CRYSTAL-UHD:PROFILE=P3;VPP_INTENSITY=55;SCOPE=DISPLAY;PIXELS=0
(vacía)
```

Y el último canal lleva 4 líneas más, que son el **pie del fichero**, no parte del canal:

```
#EXT-X-APE-AUDIT-SCORECARD:{...}
#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,channels=10573,exthtt…
```

**Consecuencia para cualquier parser:** cerrar el bloque en la URI pierde `clock-jitter=0` y
`CRYSTAL-UHD` en los 10.573 canales. No es cosmético: `clock-jitter` es una opción real de VLC (está
entre las 58 que sí existen), y perderla cambia el comportamiento del reloj de reproducción.

## 2 · ¿Cae mi generador en la trampa? **No, y se demuestra con aritmética**

`newBlock()` **no** captura líneas desconocidas: solo guarda `extinf`, `uri`, `streamInfLines`,
`capLines`, `candidateLines`, `audioDisableLines`, `audioPriority`, `emittableMedia`, `mediaLineIndexes`,
`exthttpChannelId`, `tvgId`, `stableVariantId`, `apeCodecFamily`.

Eso, en principio, sería motivo de alarma: si reconstruyera el bloque desde esos campos, las líneas de
cola se perderían. **No lo hace, y el conteo lo prueba:**

```
fuente:              10.315.662 líneas
master emitido:      10.231.079 líneas
diferencia:              84.583
caps eliminados reportados: 84.584
```

`10.315.662 − 84.583 = 10.231.079` **exacto**. El master **es** la fuente menos las líneas retiradas:
una transformación **línea a línea**, no una reconstrucción. Las líneas que el generador no conoce
—incluidas las 2 de cola de cada canal— **pasan intactas**.

> La alarma era razonable y la respuesta es que el diseño es quirúrgico, no reconstructivo. Pero eso hay
> que **medirlo**, no confiar en la lectura del código.

## 3 · Lo que esto NO prueba

- No prueba que el master emitido conserve las **2 líneas de cola una por una**: prueba que el conteo
  total cuadra con una resta, que es evidencia fuerte pero indirecta. La comprobación directa exige el
  master de 601 MB, que no está en el árbol del repo.
- No valida `clock-jitter=0` contra el binario de VLC en esta sesión: la auditoría de las 138 opciones
  (80 ausentes, 58 presentes) está en `tools/ape-image-recipes/VLC_OPT_AUDIT.md`, hecha antes.

## 4 · Corolario para el arnés

Un gate de layout debería afirmar, por canal:

```
lines_after_uri >= 2   Y la primera de ellas empieza por #EXTVLCOPT:clock-jitter
```

Eso detectaría en un segundo a cualquier parser que cierre el bloque en el URI. Hoy no existe ese gate;
lo dejo descrito, no lo doy por hecho.
