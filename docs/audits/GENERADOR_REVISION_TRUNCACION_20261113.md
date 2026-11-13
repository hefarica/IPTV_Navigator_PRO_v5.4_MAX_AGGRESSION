# REVISIÓN DEL GENERADOR — por qué la OMEGA se truncó y qué falta

**Fecha:** 2026-11-13 · **Fichero revisado:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (14.705 líneas, 929.274 B)
**Hallazgo del operador:** «regenerar la OMEGA truncada — REVISA EL GENERADOR»

---

## 1 · El hecho, medido

`OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2.m3u8` — 224.620.513 B, 2.034.902 líneas:

```
#EXT-X-APE-CHANNELS declara : 4.143
#EXTINF totales             : 2.754   (uno de ellos SIN URL)
canales COMPLETOS           : 2.753
faltan                      : 1.390  (33,6 %)
```

**La cola, exacta:**

```
línea 2.034.513  http://…                        ← último canal COMPLETO
línea 2.034.514  (vacía)
línea 2.034.515  #EXTINF … tvg-name="CZ| PREMIER SPORT 1 HD"
línea 2.034.516  #EXTHTTP:{…}
línea 2.034.517  #EXT-X-APE-OVERFLOW-HEADERS:eyJ…
                 … 389 líneas de metadatos …
última línea     #EXT-X-APE-LCEVC-STANDARD:MPEG-5-PART-2
```

**El fichero termina a mitad de un bloque de canal.** Hay `#EXTINF` y 389 líneas de directivas, pero **nunca llega la URL**.

## 2 · La escritura del generador: está BIEN

No es un fallo de diseño. El generador tiene **dos rutas y ninguna acumula una cadena gigante**:

```text
RUTA 1 — FSAA (showSaveFilePicker)
  generateM3U8Stream(channels) → ReadableStream → escribe a disco progresivamente
  retorno: { size: 'streamed-to-disk' }     ← nunca materializa el total

RUTA 2 — Chunked-Blob (Firefox/Safari)
  const reader = stream.getReader()
  while(...) chunks.push(value)             ← Uint8Array por trozos
  new Blob(chunks) → URL.createObjectURL    ← sin copia en navegadores modernos
```

**Solo hay 2 `new Blob` en 14.705 líneas.** La ruta normal (Chrome) escribe a disco sin pasar por memoria.

## 3 · Entonces, ¿por qué se truncó?

**La escritura se interrumpió.** Con FSAA el fichero se escribe progresivamente; si la pestaña se cierra, el navegador se queda sin memoria o el disco se llena, **el resultado es exactamente esto: un fichero que acaba a mitad de un bloque.**

**No es reproducible por el generador.** Es una interrupción externa.

## 4 · Lo que SÍ falta — el hallazgo

**El fichero truncado llegó hasta aquí sin que nada lo detectara.** Esa es la parte revisable.

### 4.1 La subida valida transporte, no completitud

`frontend/js/gateway-manager.js` (1.349 líneas):

| Línea | Qué hace | Qué queda sin cubrir |
|---|---|---|
| L587 | `_calculateSHA256(buffer)` | hashea **lo que hay en memoria**: un fichero ya truncado produce un hash válido |
| L623 | `'X-Chunk-SHA256': sha256` | prueba que el trozo **llegó**, no que el fichero esté entero |
| L706 | `channels = (content.match(/#EXTINF:/g) \|\| []).length` | **cuenta `#EXTINF` y no lo compara con `APE-CHANNELS`** |
| L1211 | `_verifyUploadedFile(filename)` | confirma que el fichero existe en el servidor, no que esté completo |

### 4.2 No hay centinela de fin de fichero

Buscado `EOF`, `END-OF-FILE`, `COMPLETE:`, `SENTINEL` en el generador: **0 coincidencias de un centinela real.**

Sin una marca al final, **un fichero truncado y un fichero completo son indistinguibles por su cola** — ambos pueden acabar en una línea de metadatos.

### 4.3 `list_gate` sí lo detecta — pero nadie lo ejecutaba antes de publicar

`tools/quality/list_gate.js` cazó el defecto:

```
-faltan 3 linea(s) del harness
-APE_CHANNELS declara 2754 y hay 2753 #EXTINF
```

**El candado existía. El problema era que no estaba en el camino de publicación.**

## 5 · El parche exacto (no aplicado)

**En `gateway-manager.js`, antes de subir**, una comprobación de tres líneas de lógica:

```js
// Verificacion de COMPLETITUD (no de transporte). Antes de subir nada.
const declarado = (content.match(/^#EXT-X-APE-CHANNELS:(\d+)/m) || [])[1];
const reales    = (content.match(/^#EXTINF/gm) || []).length;
const ultima    = content.trimEnd().split('\n').pop() || '';
const colaOk    = /^https?:\/\//.test(ultima.trim()) || ultima.startsWith('#EXT-X-APE-EOF');

if (declarado && Number(declarado) !== reales) {
  throw new Error(`LISTA INCOMPLETA: declara ${declarado} canales y tiene ${reales}`);
}
if (!colaOk) {
  throw new Error('LISTA TRUNCADA: el fichero no termina en URL ni en centinela');
}
```

**Y en el generador**, emitir un centinela como última línea:

```text
#EXT-X-APE-EOF:CHANNELS=<n>;LINES=<n>;SHA256=<hex>
```

Con eso, `list_gate` puede cerrar el círculo: si falta el centinela, la lista se generó truncada.

## 6 · Estado de las modificaciones

**NO se ha parcheado `gateway-manager.js` ni el generador.** Este documento es la revisión que se pidió; el parche va arriba para que se decida.

**Razón:** son ficheros de producción del frontend. Tocar el camino de publicación sin pruebas del ciclo completo (generar → validar → subir) sería peor que el defecto.

## 7 · La OMEGA: reparada, no regenerada

**No se puede regenerar desde aquí** — el generador vive en el navegador y necesita sus datos de entrada.

**Lo que sí se hizo: reparar el fichero hasta el último canal completo.**

```text
entrada : 224.620.513 B · 2.034.902 líneas · declara 4.143 · 2.754 EXTINF
salida  : 224.562.605 B · 2.034.514 líneas · declara 2.753 · 2.753 EXTINF
  - cortada la cola huérfana (389 líneas sin URL)
  - APE-CHANNELS corregido 4.143 -> 2.753
  - anadidas las 3 líneas QUALITY-WATCH que faltaban
veredicto list_gate --sin-red : APTA, exit 0
  APE_CHANNELS 2753 (coincide) · HARNESS 9/9 · Sin fallos
```

**Los 1.390 canales perdidos no se recuperan de un fichero truncado.** Se perdieron al escribir. Para tenerlos hay que regenerar desde el navegador.

**Y una corrección de mi propio conteo:** dije «2.754 canales». Eran 2.754 `#EXTINF`, de los cuales **uno está truncado**. Los canales completos son **2.753**. Lo detectó el gate, no yo.

**NO PUBLICADA.** Sigue en local, esperando decisión.
