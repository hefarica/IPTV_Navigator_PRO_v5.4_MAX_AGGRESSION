# El plano HDR: un dato honesto, un número imposible y una transferencia SDR sobre PQ

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Método:** cruce por canal de siete tags HDR/DV, `10.573` bloques.

## 1 · Lo que declara cada canal, cruzado

| Canales | MAXCLL | MAXFALL | `HDR-METADATA` | VERIFIED | TRANSFER | `HDR-DV` |
|---:|---:|---:|---|---|---|---|
| **7.437** | 100 | 25 | `PEAK=100,AVG=1000` | **false** | BT1886 | `MODE=SDR,NITS=100` |
| **2.307** | 400 | 100 | `PEAK=400,AVG=1000` | **false** | BT1886 | `MODE=SDR,NITS=400` |
| **808** | 1500 | 375 | `PEAK=1500,AVG=1000` | **false** | BT1886 | `MODE=PQ,NITS=1500` |
| **20** | 100 | 25 | `PEAK=100,AVG=1000` | **false** | BT1886 | `MODE=SDR,NITS=100` |
| **1** | 400 | 100 | `PEAK=400,AVG=1000` | **false** | BT1886 | `MODE=SDR,NITS=400` |

Las 21 filas sueltas son las que llevan además `#EXT-X-APE-HDR-PREFERRED:HDR10`, igual que los 808:
**829 canales en total con HDR10 preferido = los 808 de 4K real + 21 sueltos.**

---

## 2 · F-09 · El único dato honesto del plano

```
#EXT-X-APE-HDR-VERIFIED:false     × 10.573   (100 %)
```

**Esto está BIEN y hay que decirlo primero.** La lista declara 20+ propiedades HDR por canal y luego
estampa en todas `VERIFIED:false`. Es la etiqueta correcta: nada de esto está verificado contra el
flujo de origen.

Es exactamente lo que pide la doctrina del repo: *«SIEMPRE marcar preferred vs verified»*,
`codecVerified=true → CODEC-REAL`, `codecVerified=false → CODEC-PREFERRED`.

**El problema no es este tag. Es que los otros veinte no lo respetan.**

---

## 3 · F-10 · Un número físicamente imposible: `AVG=1000` con `PEAK=100`

```
HDR-MAXCLL:   100          (máximo de píxel del contenido)
HDR-MAXFALL:   25          (máximo del promedio de frame)
HDR-METADATA: PEAK=100,AVG=1000     ← AVG = 1.000 con PEAK = 100
```

**Severidad: ALTA** · Capa: metadatos HDR estáticos (SMPTE ST 2086 / CTA-861.3)
**Por qué es imposible, no discutible:** `MaxFALL` es el máximo, sobre todos los frames, del
**promedio** de luminancia de cada frame. `MaxCLL` es el máximo, sobre todo el contenido, de la
luminancia de **cualquier píxel**. El promedio de un frame nunca supera a su píxel más brillante,
luego **MaxFALL ≤ MaxCLL siempre**, para cualquier contenido.

Aquí `AVG > PEAK` en **9.765 canales** — todos los que tienen `cll < 1000`:

```
7.437  (cll=100)   ┐
2.307  (cll=400)   ├─ 9.765 = la población SDR completa
   20  (cll=100)   │
    1  (cll=400)   ┘
```

Solo los **808** con `cll=1500` son coherentes (`1000 < 1500`). `9.765 + 808 = 10.573`. ✓

> **Corrección de mi propio borrador:** la primera versión de este informe decía 7.458, contando sólo el
> grupo de 720p. Los 2.307 canales con `cll=400` también tienen `AVG=1000 > PEAK=400`. El número correcto
> es **9.765**, y coincide exactamente con la población SDR.

**Y la misma cantidad aparece dos veces con valores distintos:**

| Tag | Valor | Canales |
|---|---|---|
| `HDR-MAXFALL` | **25** | 7.437 |
| `HDR-METADATA … AVG=` | **1000** | 7.437 |

**El mismo canal declara MaxFALL=25 y MaxFALL=1000. Un factor de 40.**

**Impacto:** un tone-mapper que lea `AVG=1000` sobre un contenido de `PEAK=100` va a mapear mal por
construcción: le está diciendo que el contenido tiene un promedio 10 veces más brillante que su propio
pico. Cualquier consumidor que valide coherencia rechaza el bloque.

---

## 4 · F-11 · `HDR-TRANSFER: BT1886` en el 100 %, incluidos los canales PQ

```
HDR-TRANSFER: BT1886          × 10.573   (100 %)
HDR-COLORSPACE: BT2020        × 10.573
HDR-PRIMARIES: BT2020         × 10.573
HDR-MATRIX: BT2020_NCL        × 10.573
```

**Severidad: ALTA** · Capa: características de transferencia
**Síntoma:** primarias BT.2020 (contenedor amplio, correcto para HDR) con **BT.1886**, que es la
**EOTF de referencia para SDR** (ITU-R BT.1886). HDR exige **PQ (SMPTE ST 2084)** o **HLG (ARIB STD-B67)**.

**La contradicción directa:** en los **808 canales** con `HDR-DV: MODE=PQ,NITS=1500` el mismo bloque
dice `HDR-TRANSFER: BT1886`. **Un canal no puede ser PQ y BT1886 a la vez.**

En los otros 9.765 `MODE=SDR` con BT1886 es coherente — pero entonces sobra todo el aparato BT.2020,
salvo que se trate del enhancement de display que la doctrina del repo sí permite (ver §6).

---

## 5 · F-12 · Capa de enhancement declarada sin capa de enhancement

```
DV-ENHANCEMENT:   ENABLED=true,SCALE=4
DV-METADATA:      RPU=true,EL=false,BL=true
DV-PROFILE:       8          (uniforme en los 10.573)
```

**Severidad: MEDIA**
**Síntoma:** `DV-ENHANCEMENT` dice activado con escala 4, y `DV-METADATA` dice `EL=false`, es decir
**no hay capa de enhancement**. Se declara el efecto y se niega su causa en la línea de al lado.
**Nota:** el Perfil 8 de DV es de una sola capa y es correcto que `EL=false`; lo que no puede es
declarar `DV-ENHANCEMENT: ENABLED`.

---

## 6 · Lo que este informe NO dice

- **No digo que el HDR sea falso.** La lista no aporta evidencia de que sea real (`VERIFIED:false`), y
  eso es distinto de ser falso. No sondeé el upstream: no sé la luminancia real del flujo.
- **No impugno el `VIDEO-RANGE=PQ` incondicional del generador.** Es una decisión LOCKED del propietario
  (2026-06-16) y su justificación documentada es el enhancement de display on-device, no una afirmación
  sobre el bitstream. Eso vive en otra capa (`CLAUDE.md`), no en estos tags `APE-HDR-*`, y no lo toco.
- **No propongo parche.** Corregir `AVG`/`PEAK` y `TRANSFER` es trabajo del generador.
- No medí un solo frame real. Todo esto es lo que la lista dice de sí misma.

## 7 · La corrección mínima, si el operador la quiere

1. **`HDR-METADATA … AVG=`** debe derivarse de `HDR-MAXFALL`, no ser la constante 1000. Hoy la
   constante contradice al tag que dice describir.
2. **`HDR-TRANSFER`** debe seguir a `HDR-DV:MODE`: `BT1886` cuando SDR, `ST2084` cuando PQ, `ARIB-STD-B67`
   cuando HLG. Hoy es una constante.
3. **`DV-ENHANCEMENT: ENABLED`** solo si `DV-METADATA: EL=true`.

Los tres son valores escritos a mano donde debería haber un cálculo. Es el mismo patrón que en
vídeo (`4KFALSE`, `ENGINE`) y en audio (Atmos `true`/`false`): **el bloque por canal no se deriva del
canal**.

> **Corrección (ronda 33, medida con `tag_variance.js`):** la primera versión decía que los tres eran
> «constantes». Preciso: `HDR-TRANSFER` **sí** es constante (1 valor en los 10.573). `HDR-METADATA`
> **no**: toma 3 valores distintos, porque el campo `PEAK` sigue al canal correctamente. Lo que es
> constante es **el campo `AVG` dentro de ese tag** (siempre 1000). Está medio derivado, no es una
> constante entera.

## 8 · El detalle que prueba que el generador SÍ sabe derivar

`HDR-PREFERRED:HDR10` aparece en **829** canales = **los 808 de 4K real + 21**. No es una constante:
discrimina, y discrimina casi exactamente donde debe.

**La maquinaria para derivar existe y funciona.** Simplemente no está conectada a `4KFALSE-MODE`, ni a
`HDR-TRANSFER`, ni a `HDR-METADATA:AVG`. Eso es alentador: no hay que construir el cálculo, hay que
reusar el que ya está.
