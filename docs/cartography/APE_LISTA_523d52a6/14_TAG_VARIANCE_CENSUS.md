# Censo de varianza: 436 tags APE no distinguen un canal de otro

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` · solo lectura.
**Herramienta:** `node tools/ape-parse-defects/tag_variance.js <lista>` · 11,2 s sobre 604 MB.

Las rondas 29–32 encontraron el mismo patrón tres veces, a mano y de uno en uno. Esto lo mide de una
vez, en toda la lista, sin criterio mío de por medio: **para cada tag, cuántos valores distintos toma
entre los 10.573 canales.**

## 1 · El censo

```
10.573 bloques · 689 tags

CONSTANTE  473     (aparece en ≥90 % de bloques y toma 1 solo valor)
VARIA      208     (aparece en ≥90 % de bloques y toma >1 valor)
PARCIAL      6     (aparece en <90 % de bloques)
RARO         2
```

De la familia `EXT-X-APE-*` (611 tags):

| | Constantes | Varían |
|---|---:|---:|
| `EXT-X-APE-*` | **436** | **175** |

**436 tags que describen propiedades por canal y no distinguen un canal de otro.** Ese es el hallazgo
de las tres rondas anteriores, generalizado.

## 2 · El instrumento se valida contra la auditoría manual

No es un detector que diga lo que yo quiera. Contra los casos que audité a mano:

| Tag | Clase | ¿Coincide con la auditoría manual? |
|---|---|---|
| `RESOLUTION-SUPREMACY` | VARIA (3) | ✅ ronda 31 |
| `FPS-SUPREMACY` | VARIA (2) | ✅ ronda 31 |
| `HDR-MAXCLL` | VARIA (3) | ✅ ronda 32 |
| `HDR-MAXFALL` | VARIA (3) | ✅ ronda 32 |
| `HDR-DV` | VARIA (3) | ✅ ronda 32 |
| `4KFALSE-CONTENT-TYPE` | VARIA (5) | ✅ ronda 31 |
| `HDR-PREFERRED` | PARCIAL, cob **0,0784** | ✅ 829/10.573, ronda 32 |
| `HDR-TRANSFER` | **CONSTANTE** | ✅ ronda 32 |
| `4KFALSE-MODE` | **CONSTANTE** | ✅ ronda 31 |
| `4KFALSE-ENGINE` | **CONSTANTE** | ✅ ronda 31 |
| `DV-PROFILE` / `DV-ENHANCEMENT` | **CONSTANTE** | ✅ ronda 32 |
| `HDR-VERIFIED` | **CONSTANTE** | ✅ ronda 32 |
| `AUDIO-PASSTHROUGH` | **CONSTANTE** | ✅ ronda 29 |

**13 de 13 coinciden.** Y los cuatro que varían son justo los que en las rondas 31–32 señalé como los
que **sí** discriminan.

## 3 · El instrumento corrige una imprecisión mía

`HDR-METADATA` sale **VARIA (3 valores)**, no constante.

En el informe de la ronda 32 escribí que `AVG=1000` «es una constante». **Es impreciso.** Lo que pasa es
que el tag varía **por el campo `PEAK`** (100 / 400 / 1500, correcto) y dentro de ese mismo tag el campo
`AVG` es siempre 1000.

Así que `HDR-METADATA` no es constante: está **medio derivado**. Un campo sigue al canal, el otro es
boilerplate. Eso es más preciso que lo que dije, y lo dice el censo, no yo.

## 4 · Los que no había mirado y salen constantes

| Tag | Valor único | Por qué importa |
|---|---|---|
| `LCEVC-BITRATE-SAVING` | `50%` | La doctrina del repo **eliminó** `SUPPLEMENTAL-CODECS="lcev.1.1.1"` por ser LCEVC inventado. Aquí hay un ahorro LCEVC declarado en el 100 % de los canales, sin LCEVC. |
| `CORTEX-RESOLUTION` | `ENABLED=true,RATE=99%` | Un «rate» que vale exactamente 99 % en los 10.573 canales no es una medición. |
| `DV-COMPATIBILITY` | `SDR,HDR10,HLG` | Un mismo canal no es SDR, HDR10 y HLG a la vez; puede ser compatible con los tres, pero entonces el tag describe al decodificador, no al contenido. |
| `SPOOF-ACCEPT-LANGUAGE` | `es-419,es;q=0.9,en;q=0.8` | Constante y, por el nombre, con intención de suplantación. |
| `LV` `LUMA-PRECISION` / `CHROMA-PRECISION` | `10BIT` / `4:2:0` | Coherente con la doctrina, pero constante: no distingue el canal de 720p del de 4K. |

## 5 · Un tag constante no es automáticamente un defecto

`#EXTM3U`, `#EXT-X-VERSION:6`, `schema: ape-lab-metadata-v1` son constantes **y está bien**: describen la
lista, no el canal.

La pregunta que el censo deja servida es: **de los 436, ¿cuántos describen la lista y cuántos pretenden
describir el canal?** Los 28 de arriba son claramente lo segundo. El censo da la lista completa en
`scratch/tag_var.json` para que el operador decida el resto; el instrumento no juzga.

## 6 · Lo que este censo NO dice

- **No dice que los valores constantes sean falsos.** Dice que no distinguen. `HDR-BITDEPTH:10` puede ser
  correcto en los 10.573 canales y aun así ser constante.
- **No sondeé un solo canal.** Todo es lo que la lista dice de sí misma.
- **No he revisado los 436 uno a uno.** He revisado 28 por familia semántica y los 13 de control.
- No propongo parche: qué tags deben derivarse del canal es decisión del generador.

## 7 · Reproducir

```bash
node tools/ape-parse-defects/tag_variance.js "C:\Users\HFRC\Downloads\APE_LISTA_1793589060441.m3u8" \
  --json scratch/tag_var.json
# exit 0 siempre (salvo error de lectura, exit 5); el censo no emite veredicto
```
