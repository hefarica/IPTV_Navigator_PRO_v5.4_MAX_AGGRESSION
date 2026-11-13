# NO SE PUEDE DETECTAR "IMAGEN SUCIA" DESDE LOS PÍXELES DECODIFICADOS

**Tres intentos, tres refutaciones. Todas medidas, todas mías. Esta es la conclusión honesta y el camino que sí queda.**

---

## 1 · Las tres refutaciones

### Refutación A — la métrica de bloque `borde8/resto`

Con **contenido controlado** (mismo vídeo, 5 bitrates, la única variable es la compresión):

| contenido | 20 Mbps | 400 kbps | ¿monótona? |
|---|---|---|---|
| real | 1,1185 | 1,1450 | **NO — 2 inversiones** |
| sintético | 2,6507 | 2,8811 | **NO — 2 inversiones** |

**Una reducción de bitrate de 50× no mueve la métrica.** Causa: H.264 y HEVC llevan **deblocking en bucle** (HEVC además SAO) que **borra exactamente los bordes de bloque** que la métrica busca. Se mide lo que el códec ya arregló. En HEVC falla **más** (2 inversiones contra 1).

### Refutación B — detección de artefactos SAO

`SAO=0` vs `SAO=1`, mismo bitrate, misma codificación:

| bitrate | zona plana | zona de detalle |
|---|---|---|
| 4000 kbps | **−2,60 %** | −2,12 % |
| 800 kbps | **+0,30 %** (al revés) | −1,02 % |

- Efecto **pequeño** y **no específico de la zona plana** (2,60 % contra 2,12 %).
- **Desaparece a bitrate bajo.**
- El **bitrate mueve el detalle 3,1× más** que SAO.
- Y sobre todo: **SAO es un filtro en bucle que el decodificador APLICA, no deshace.** Desde los píxeles no se puede atribuir un suavizado a SAO: es **indistinguible** de la cuantización. **Problema de identificabilidad, no de umbrales.**

### Refutación C — mi propio calibrador por línea base

La idea: comparar el detalle de cada momento contra el arranque del propio stream.

**Control negativo ejecutado: dos codificaciones IDÉNTICAS del mismo vídeo.**

```
copia a: base=2,0249  alertas=6  veredicto=DEGRADADO
copia b: base=2,0249  alertas=6  veredicto=DEGRADADO
```

**Las dos dan DEGRADADO.** Y sobre el vídeo real marcó caídas del 22–28 % entre t=3 s y t=7 s — **que es cuando la cámara hace zoom**, no cuando se degrada.

**Las alertas las dispara el cambio de contenido, no la degradación.**

## 2 · La causa de fondo, y no tiene arreglo por umbrales

> **Cualquier métrica de detalle aplicada a un stream vivo SIN REFERENCIA no puede separar «menos detalle porque el codificador lo tiró» de «menos detalle porque la escena lo tiene».**

Para separarlo hace falta **la imagen original**, que un reproductor no tiene. Es el mismo motivo por el que VMAF y PSNR son **métricas con referencia**: comparan contra el original. Sin original, no hay medida de calidad absoluta.

**Por eso los tres intentos fallan por la misma razón, no por mala calibración.**

## 3 · Lo que SÍ es objetivo, y ya está construido

**El estado del pipeline no es una inferencia: son hechos del sistema.** Eso sí se puede leer y sí es fiable.

`tools/probe/pipeline_lint.ps1` — sólo lectura, contra el aparato real:

```
video 640x360 · composicion 1920x1080 · panel 3840x2160

[ALTA] COLOR_SPACE_MISMATCH   BT.2020 con transferencia BT.601
[ALTA] DOBLE_ESCALADO         360p → 1080p (×3) → 2160p (×2)
[ALTA] FUENTE_PEQUENA         640x360: cualquier etiqueta 4K/6K es DECLARACIÓN
[MEDIA] JUDDER                content==actual pero judder 0,133
```

**Ninguna de esas cinco líneas es una opinión sobre la imagen: son datos del sistema.** Y todas predicen la calidad sin necesidad de mirar un píxel.

## 4 · Y lo que sí se midió con valor real

**El HEVC gana donde importa, y sólo donde importa:**

| bitrate | H.264 HF | HEVC HF | ventaja |
|---|---|---|---|
| 8000 kbps | 1,8228 | 1,7988 | −1,3 % (empate) |
| 2000 kbps | 1,7147 | 1,7133 | −0,1 % (empate) |
| **500 kbps** | **1,3382** | **1,5026** | **+12,3 %** |

**La ventaja del HEVC aparece con bitrate bajo.** A 8 Mbps los dos codecs dan lo mismo. Pedir HEVC sólo mejora la imagen si el proveedor aprieta el bitrate — **que es exactamente el caso del operador.**

## 5 · El camino que queda, sin adornos

| Vía | Estado |
|---|---|
| Detectar calidad de imagen en el reproductor | **REFUTADO, tres veces** |
| Medir estado del pipeline (geometría/color/cadencia) | **FUNCIONA** — `pipeline_lint.ps1` |
| Comparar el mismo contenido a distintos bitrates | **FUNCIONA** — así se midió el HEVC y los umbrales |
| Pedir la fuente con más bitrate / variante real | **La única palanca real de imagen** |
| Composición 1:1 (si el contenido lo permite) | **Funciona** — `display_size_forced`, con su coste en la UI |

**El resto es perseguir una medida que no existe sin referencia.**

## 6 · Lo que NO está medido

- **No se probó una métrica con referencia** (VMAF/PSNR contra el original). Sería la única que podría funcionar, y exige tener el original — viable en el **VPS/JIT**, no en el reproductor.
- **Una sola fuente de contenido** en todos los experimentos.
- **Nada se reprodujo en el ONN**: todo es codificación local sobre la grabación del operador.
- **El control negativo del test SAO no terminó** (la segunda codificación idéntica se canceló por tiempo). El suelo de ruido de 0,04 % viene del gate `test_hf_detail_metric.js`.

## 7 · Artefactos

| Fichero | Qué contiene |
|---|---|
| `docs/audits/BLOCKINESS_TWO_CLASS.json` | las 5 codificaciones × 2 contenidos que refutan `borde8` |
| `docs/audits/HEVC_BLOCK_DETECTOR_TEST.json` | `borde8` y HF × 2 codecs × 3 bitrates |
| `docs/audits/SAO_VERDAD_MEDIDA_20261113.md` | el efecto de SAO y su falta de identificabilidad |
| `docs/audits/HEVC_VERDAD_MEDIDA_20261113.md` | la cadena de máxima calidad HEVC y su ventaja a bitrate bajo |
| `tools/quality/hf_session_calibrator.js` | **marcado REFUTADO** en cabecera; se conserva como comparador |
| `tools/probe/pipeline_lint.ps1` | el linter de estado que sí funciona |
