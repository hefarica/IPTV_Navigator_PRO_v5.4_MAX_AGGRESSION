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
| Con `gunzip off` + `gzip_static on` | 14 / 20 | +2: las listas grandes con identity |
| Con `gzip off` en la location | 16 / 20 | +2: las listas pequeñas con gzip |
| Con `301`→`302` en la línea 21 | **20 / 20** | +4: las cuatro celdas de 302 |

**Corrección:** versiones anteriores de este documento decían «el parche de 3 líneas arregla 4 celdas»
como si fuera **un** cambio. `gate_matrix.js` lo separa en **dos** mecanismos independientes, +2 cada
uno, que suman las mismas 4. Importa porque si se aplica sólo uno, el gate queda en 14/20 y no en 16/20,
y las dos mitades fallan por causas distintas.

Los tres cambios son **independientes** y ninguno está autorizado.

## 6 · Lo que esta matriz NO prueba

- No usa un reproductor real (VLC/OTT/ExoPlayer): las seis configuraciones son peticiones HTTP mías.
  Un player que pide el fichero entero no usa Range, así que el fallo de 206 **no rompe la
  reproducción**; rompe la declaración `Accept-Ranges: bytes` que nginx anuncia igualmente.
- Los GET completos se cortan al primer chunk: el estado y las cabeceras son reales, el cuerpo no se
  descarga entero.
- No mide concurrencia, ni caché intermedia (CDN/proxy), ni el comportamiento bajo carga.

## 7 · Intento de validar el parche sin tocar el VPS — y por qué no salió

Antes de pedir autorización para el parche quise **medir** que funciona, no sólo razonarlo. Plan: levantar
`nginx:1.24.0` en un contenedor con la misma configuración y medir las 4 celdas antes y después.

**No se pudo.** El error, literal:

```
[rootlesskit:parent] error: failed to setup UID/GID map:
  newuidmap 660 [0 1000 1 1 100000 65536] failed:
  newuidmap: write to uid_map failed: Operation not permitted
```

- `nginx` no está instalado en el host (ni `/usr/bin/nginx` ni `/usr/sbin/nginx`).
- El daemon de Docker no corre (`/var/run/docker.sock` no existe).
- Hay `dockerd-rootless.sh` con todos los prerrequisitos (`newuidmap`, `newgidmap`, `/etc/subuid`,
  `/etc/subgid` configurados), pero **el kernel de este WSL no permite escribir `uid_map`**.
- `sudo` pide contraseña interactiva, y esta sesión no puede darla.

**Consecuencia honesta:** el parche está **razonado a partir de las 4 celdas que sí medí**, no validado
empíricamente. La evidencia directa es que los dos modos de fallo existen y son exactamente los
predichos: la lista grande con `identity` devuelve 200 (el `.gz` se sirve descomprimido) y la pequeña con
`gzip` devuelve 200 (compresión dinámica). Que apagar cada una de esas dos compresiones elimine su fallo
correspondiente es la deducción — sólida, pero deducción.

**Quien autorice el parche debería saber esto.** Es un cambio de 3 líneas en un fichero de
configuración, con copia de respaldo, reversible en un comando, y la verificación es `gate_matrix.js`
antes y después.
