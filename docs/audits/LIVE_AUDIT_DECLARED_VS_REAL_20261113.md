# Auditoría declarado-vs-real sobre la LISTA VIVA · 2026-11-13

**Qué se ejecutó:** `tools/quality/audit_declared_vs_real.ps1` contra la lista de producción `APE_LISTA_1794100720046.m3u8`, leyendo **solo los primeros 30 MB** de los ~1,3 GB (HTTP **Range → 206** confirmado). Recibo: `docs/audits/DECLARED_VS_REAL_20261113T032803Z.json`.

## El hallazgo

```
#   perfil  medido  resolucion  fps   veredicto    canal
3   P3      MEDIDO  1280x720    25    NO CUMPLE    AR| BEIN SPORTS NBA FHD [EVEST]
    -> declara 1080p y sirve 720p
```

**Un canal con «FHD» en el nombre, declarado `ape-profile="P3"` (1080p), sirvió 1280x720.**

§11: *«No conviertas la etiqueta comercial 6K/8K en una declaración falsa de salida efectiva.»* Aquí la etiqueta es FHD y la salida es HD. Es el mismo defecto que apareció en la lista de pruebas, ahora **en producción y en un canal deportivo premium**.

## La muestra completa

| # | Veredicto | Canal |
|---|---|---|
| 1 | **NO COMPUTADO** — manifiesto vacío | `✦●✦\| FHD - BEIN SPORTS FHD \|✦●✦` |
| 2 | CUMPLE — 1920x1080 | `AR\| BEIN SPORTS NEWS FHD` |
| **3** | **NO CUMPLE — 1280x720** | **`AR\| BEIN SPORTS NBA FHD`** |
| 4 | CUMPLE — 1920x1080 @60 | `AR\| BEIN SPORTS 03 FHD` |
| 5 | CUMPLE | `AR\| BEIN SPORTS 04 FHD` |
| 6 | **NO COMPUTADO** — manifiesto vacío | `AR\| BEIN SPORTS 05 FHD` |
| 7-10 | CUMPLE — 1920x1080 | `BEIN SPORTS 06 · 07 · 08 · 09` |

**8 medidos · 1 no cumple · 2 no computados.**

Los dos «manifiesto vacío» no son un fallo de la herramienta: el servidor del proveedor devolvió una respuesta vacía en ese instante. Se reporta como **no computado con motivo**, no como cero ni como aprobado.

## El alcance, sin inflarlo

- **485 canales** en los primeros 30 MB de la lista; se auditaron **10**.
- Son **los 10 primeros**, todos de la familia BEIN SPORTS. **No es una muestra aleatoria del catálogo** y no se extrapola a los ~1,3 GB.
- **1 de 8 medidos** no cumple. Con n=8 eso no establece una tasa: establece que **el defecto existe en producción** y que la herramienta lo encuentra.

## Por qué esto no es "un test verde"

No dice «el sistema está bien». Dice lo contrario: **al menos un canal de la lista viva declara una resolución que no sirve**. Y no lo dice un documento: lo dice un `ffprobe` sobre el segmento que el propio sistema está entregando.

## Dos bugs míos corregidos en el camino

1. **`[Encoding]::UTF8.GetString($null)` lanzaba** cuando el manifiesto venía vacío: el canal quedaba `NO_COMPUTADO` con un mensaje de excepción en vez del motivo. Ahora se comprueba nulo/vacío y se dice «el manifiesto del canal vino vacío». Pasó con **2 de 10** canales.
2. **La tabla no imprimía el nombre del canal** — solo el índice. Un hallazgo sin nombre («el canal 3 falla») no es accionable. Ahora sale el nombre y el motivo en la línea siguiente.

## Lo que falta para tener el censo

Correr la herramienta sobre la lista **entera** (1,3 GB) y sobre las otras cuatro listas vivas. Es un `ffprobe` por canal: con ~20.000 canales serían horas. Se puede paralelizar, cachear el veredicto por `tvg-id` y priorizar por perfil declarado (empezar por los P0/P1, que son los que prometen 4K/8K).

Eso convertiría «un canal no cumple» en «N canales no cumplen, y estos son».
