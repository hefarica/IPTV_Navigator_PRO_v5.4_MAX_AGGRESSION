# El gate medido: 20 celdas, 12 cumplen, 8 no — y dónde está cada una

**Fecha:** 2026-11-02 · **Herramienta:** `node tools/ape-http-conformance/gate_matrix.js` ·
Solo lectura, cero escrituras en el VPS.

## 1 · Qué se midió

El requisito es que **toda** lista, en **todas** sus configuraciones posibles de cliente, entregue
**200**, **206** y **302**. Eso son 5 celdas por lista × 4 listas = **20 celdas**:

| Configuración | Pata que mide |
|---|---|
| GET completo, sin gzip | **200** para cliente sin gzip |
| GET completo, con gzip | **200** para cliente con gzip |
| GET con Range, sin gzip | **206** para cliente sin gzip |
| GET con Range, con gzip | **206** para cliente con gzip |
| HTTP plano | **302** (redirect a https) |

Criterio declarado antes de medir: 200 en el GET completo, 206 en el GET con Range, **302 exacto** en
el HTTP plano.

## 2 · El resultado, celda por celda

| Lista | 200 identity | 200 gzip | 206 identity | 206 gzip | redirect |
|---|---|---|---|---|---|
| `…1793589060441` (604 MB, con `.gz`) | **200** ✅ | **200** ✅ | **200** ❌ | **206** ✅ | **301** ❌ |
| `…1793558303852_CDN` (con `.gz`) | **200** ✅ | **200** ✅ | **200** ❌ | **206** ✅ | **301** ❌ |
| `APE_PRUEBA_ORDER_OK` (163 KB) | **200** ✅ | **200** ✅ | **206** ✅ | **200** ❌ | **301** ❌ |
| `APE_PRUEBA_PERFILES` (163 KB) | **200** ✅ | **200** ✅ | **206** ✅ | **200** ❌ | **301** ❌ |

```
12/20 celdas cumplen
```

## 3 · Por pata, que es como hay que leerlo

| Pata | Cumple | Estado |
|---|---|---|
| **200** | **8 / 8** | ✅ **medido ahora**, no heredado de la telemetría |
| **206** | **4 / 8** | ⚠️ falla siempre en la misma clase |
| **302** | **0 / 4** | ⚠️ las cuatro devuelven 301 |

**Corrección de lo que yo venía reportando:** decía «200 ✅ 4/4» apoyándome en el log de producción
(91 × 200 sobre la lista grande). Eso era telemetría, no una prueba de las dos configuraciones de
cliente. Ahora está medido: las **ocho** celdas de la pata 200 devuelven 200. La pata 200 no tenía
problema; simplemente no la había probado así.

## 4 · Los 8 huecos, nombrados

**Huecos de 206 (4):** siempre el mismo patrón de exclusión mutua.
- `…1793589060441` + identity → 200 chunked
- `…1793558303852_CDN` + identity → 200 chunked
- `APE_PRUEBA_ORDER_OK` + gzip → 200 gzip dinámico
- `APE_PRUEBA_PERFILES` + gzip → 200 gzip dinámico

**Huecos de 302 (4):** las cuatro listas devuelven **301** con `Location` correcto al equivalente https.

## 5 · El camino completo, contado en celdas

| Paso | Celdas | Cambio |
|---|---|---|
| Hoy | **12 / 20** | — |
| Con el parche de 3 líneas (`PATCHED-206-dual.conf`) | **16 / 20** | +4: las cuatro celdas de 206 |
| Con `301`→`302` en la línea 21 | **20 / 20** | +4: las cuatro celdas de 302 |

Los dos cambios son **independientes** y ninguno está autorizado. El primero es de compresión; el
segundo de semántica de caché.

## 6 · Lo que esta matriz NO prueba

- No usa un reproductor real (VLC/OTT/ExoPlayer): las seis configuraciones son peticiones HTTP mías.
  Un player que pide el fichero entero no usa Range, así que el fallo de 206 **no rompe la
  reproducción**; rompe la declaración `Accept-Ranges: bytes` que nginx anuncia igualmente.
- Los GET completos se cortan al primer chunk: el estado y las cabeceras son reales, el cuerpo no se
  descarga entero.
- No mide concurrencia, ni caché intermedia (CDN/proxy), ni el comportamiento bajo carga.
