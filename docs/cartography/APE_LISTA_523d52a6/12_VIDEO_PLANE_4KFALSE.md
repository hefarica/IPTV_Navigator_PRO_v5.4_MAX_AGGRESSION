# El plano de vídeo: el flag `4KFALSE` no distingue 4K real de falso 4K

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Método:** cruce por canal de cuatro tags, `10.573` bloques.

## 1 · Lo que declara cada canal, cruzado

Solo hay **tres combinaciones** en toda la lista:

| Canales | `RESOLUTION-SUPREMACY` | `FPS-SUPREMACY` | `4KFALSE-MODE` | `4KFALSE-ENGINE` |
|---:|---|---|---|---|
| **7.457** | 1280×720 | 30 | **ACTIVE** | LAB-CALIBRATED-DNR+MEMC-120 |
| **2.308** | 1920×1080 | 60 | **ACTIVE** | LAB-CALIBRATED-DNR+MEMC-120 |
| **808** | **3840×2160** | 60 | **ACTIVE** | LAB-CALIBRATED-DNR+MEMC-120 |

**Validación cruzada:** 7.457 / 2.308 / 808 coincide **exactamente** con los perfiles que la
cartografía midió por otra vía (P4=7.457 · P3=2.308 · P1=808). Dos mediciones independientes, mismo
reparto.

## 2 · Lo que está BIEN, y no lo voy a llamar defecto

**`4KFALSE-TARGET-RES: 3840x2160` sobre una fuente de 720p es una declaración de upscale.** La doctrina
de este repo lo exige, no lo prohíbe: «CRYSTAL 4K UHD — MEJORA OBLIGATORIA», y el principio del operador
es *«VIDEO: NUNCA downscale. Solo upscale o passthrough»*.

Las 9.765 fuentes menores de 4K declarando destino 4K es **correcto según la doctrina**. Ninguna variante
declara una resolución menor que la fuente. Aquí no hay violación.

## 3 · Los tres defectos reales

### F-06 · El flag `4KFALSE` marca como falso 4K a los 808 canales que sí son 4K

```
RESOLUTION-SUPREMACY: 3840x2160   →  808 canales
4KFALSE-MODE:         ACTIVE     →  10.573 canales   ← incluye a los 808
```

**Severidad: ALTA** · Capa: clasificación de calidad por canal
**Síntoma:** un canal cuya fuente **es** 3840×2160 lleva `4KFALSE-MODE: ACTIVE` igual que uno de 720p.
**Impacto concreto:** cualquier herramienta que filtre por `4KFALSE-MODE: ACTIVE` para separar 4K real de
falso 4K **excluiría también los 808 canales genuinos**. El flag no tiene poder discriminante.
**La disyuntiva, que no puedo resolver sin el generador:** o el tag significa «modo de mejora activo»
—y entonces el nombre `4KFALSE` es engañoso— o significa «este canal es 4K falso» —y entonces es falso
en 808 canales. **En cualquiera de las dos lecturas, el nombre está mal para una de las dos poblaciones.**

### F-07 · La afirmación del motor es una constante, no un cálculo

`LAB-CALIBRATED-DNR+MEMC-120` aparece **idéntico** en las tres poblaciones: 720p@30, 1080p@60 y
2160p@60.

**Severidad: MEDIA**
**Síntoma:** un tag que describe una capacidad del motor dice lo mismo para una fuente de 30 fps que para
una de 60 fps, y para 720p que para 4K. **No discrimina.**
**Impacto:** un consumidor no puede usar `4KFALSE-ENGINE` para inferir nada sobre el canal; es
boilerplate. Si el generador calcula algo, el resultado no llega al manifiesto.

### F-08 · `MEMC-120` declarado sobre fuentes de 30 fps, sin evidencia

En **7.457 canales** el motor declara `MEMC-120` mientras `FPS-SUPREMACY` dice **30**. Eso es una
interpolación de **4×** (30→120). En los otros 3.116 es 2× (60→120).

**Severidad: MEDIA**
**Síntoma:** el mismo valor de destino (120) para dos factores de interpolación distintos, sin que el
manifiesto declare el factor ni la fuente.
**Impacto:** `MEMC-120` no distingue entre interpolar 4× y 2×, que son costes y riesgos de artefacto muy
distintos. Y no hay ninguna evidencia en el manifiesto de que el motor exista o corra; es una etiqueta.

## 4 · El patrón que comparten audio y vídeo

Es el mismo que en el plano de audio (informe `11_AUDIO_PLANE_CONTRADICTIONS.md`, 74.011 casos): **el
manifiesto declara propiedades que no se derivan del canal concreto**. La capa `APE-*` escribe el mismo
bloque para todos y luego el reparto real (resolución, fps, códecs) vive en otro sitio del mismo bloque.

En audio eran valores **opuestos**. En vídeo son valores **idénticos donde deberían diferir**. La causa es
la misma: dos fuentes de verdad que no se hablan.

## 5 · Lo que este informe NO dice

- **No dice que el upscale sea falso.** El upscale es doctrina y está declarado como tal en `TARGET-RES`.
- **No dice que el motor no exista.** Dice que el manifiesto no aporta evidencia, y que su declaración no
  varía con la fuente.
- **No he sondeado el upstream**: no sé la resolución real del flujo de origen. `RESOLUTION-SUPREMACY` es
  lo que la lista dice de sí misma, no lo que he medido en el proveedor.
- No propongo parche: renombrar `4KFALSE` o hacerlo calculado es una decisión del generador.

## 6 · La corrección mínima, si el operador la quiere

1. Que `4KFALSE-MODE` sea **calculado**: `ACTIVE` solo si `RESOLUTION-SUPREMACY < TARGET-RES`. Serían
   9.765 ACTIVE y 808 no-ACTIVE. Hoy son 10.573 y 0.
2. Que el tag se llame por lo que hace. Si es modo de mejora, `ENHANCEMENT-MODE`, no `4KFALSE`.
3. Que `4KFALSE-ENGINE` declare el **factor** de interpolación (`MEMC-4X` / `MEMC-2X`) y la fuente.

Nada de eso está aplicado, y nada de eso toca el VPS.
