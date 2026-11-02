# Cómo lo hace el 5%: el problema 206 y la compresión, corroborado por upstream

**Fecha:** 2026-11-02 · **Qué es:** la parte del encargo que faltaba — *«las mejores maneras del 5% de la
competencia, busca en repositorios de más estrellas, en foros especializados»*.
**Método:** leer la fuente primaria (lista de correo de desarrollo de nginx), no blogs.

## 0 · El hallazgo, en una línea

**Nginx no puede servir `206 Partial Content` mientras comprime en vuelo.** No es un bug de mi parche ni
una rareza de este VPS: es una limitación conocida de la arquitectura de filtros de nginx, documentada en
su propia lista de desarrollo con un parche propuesto que **desactiva gzip cuando hay `Range`**.

## 1 · La fuente primaria

`[PATCH] slice and gzip problem` — Sangdeuk Kwon, nginx-devel, 4 de agosto de 2020.
<http://mailman.nginx.org/pipermail/nginx-devel/2020-August/013396.html>

Cito literal (traducido, el original está en el enlace):

> «Cuando `slice` está habilitado, el cliente pide con `Accept-Encoding: gzip` y `Range: bytes=2048-3071`,
> nginx sirve **sólo el contenido gzip parcial con "200 OK" en vez de "206 Partial Content"**. Esta
> respuesta es incorrecta porque nginx responde "200 OK" incluso sirviendo contenido parcial. El cliente
> cree que recibe el contenido entero por el "200 OK".»
>
> «`ngx_http_gzip_filter_module` tiene **mayor prioridad** que `ngx_http_slice_filter_module`.
> gzip_filter_module **borra la información de slice_filter_module** cuando se invoca gzip. Así, nginx
> responde "200 OK" con el contenido gzip completo.»
>
> «Si la petición del usuario tiene cabecera `Range`, **gzip_filter debería desactivarse** en vez de
> slice_filter.»

## 2 · Por qué esto importa para lo que medí

Mi diagnóstico medido fue: **compresión en vuelo → `Transfer-Encoding: chunked` → no hay
`Content-Range` → el servidor responde 200 al cliente que pidió un rango.**

El parche de upstream describe **el mismo mecanismo desde dentro**, con nombres de módulo:

| Mi medición (externa, HTTP) | Upstream (interna, código) |
|---|---|
| gzip en vuelo → chunked → sin `Content-Range` | `gzip_filter_module` borra el estado de `slice_filter_module` |
| el cliente que pide `Range` recibe 200 | «nginx responde 200 OK con el contenido gzip completo» |
| conclusión: no comprimir el recurso con rangos | «gzip_filter debería desactivarse si hay `Range`» |

**Dos caminos independientes, la misma conclusión.** Eso es lo que convierte mi parche de «medido en mi
banco» en «alineado con lo que el propio nginx considera correcto».

## 3 · Las dos soluciones del 5%, y cómo se relacionan

### Lado servidor — desactivar la compresión dinámica del recurso con rangos

Es exactamente lo que hace mi parche dual, y por dos vías que se refuerzan:

| Directiva | Qué consigue |
|---|---|
| `gunzip off;` | nginx deja de descomprimir en vuelo: el cuerpo no pasa por el filtro que rompe el rango |
| `gzip_static on;` | sirve el `.gz` precompreso **sólo** si el cliente lo acepta, sin reescribir la respuesta en caliente |

El parche propuesto por upstream hace lo mismo por otra puerta: `gzip_filter` se auto-desactiva cuando ve
`Range`. **Mi parche llega al mismo sitio sin tocar el binario de nginx** — que es la única opción viable
en un VPS que no se recompila.

### Lado cliente — `Accept-Encoding: identity`

**Y esto ya estaba en la doctrina de este repo.** `CLAUDE.md` lista, entre las cabeceras seguras que se
mantienen siempre:

```
Accept-Encoding: identity, ...
```

No es casualidad: pedir `identity` **evita entrar en el camino que rompe el rango**. El repo ya tenía la
mitad de la respuesta escrita en su propia lista de cabeceras, sin que nadie la hubiera conectado con el
206.

**Las dos mitades juntas son el 5%:** el servidor no comprime el recurso con rangos, y el cliente no pide
gzip para el mismo recurso. Cualquiera de las dos sola arregla el caso; las dos juntas lo hacen robusto.

## 4 · Lo que esto NO dice

- **No dice que mi parche produzca 206 en producción.** Eso sigue sin medirse en el host; está medido en
  el nginx del runner de CI. La distinción importa y la mantengo.
- **El parche de nginx-devel es de 2020 y no está en 1.24.0.** Es una propuesta en la lista de desarrollo;
  no he verificado que se haya fusionado. Por eso mi solución no depende de él.
- **No he encontrado un repositorio de muchas estrellas que documente esto mejor que la lista de
  desarrollo.** Cuando la respuesta está en la fuente primaria, citar blogs de terceros sería peor, no
  mejor.
- **No he medido el coste de CPU** de `gunzip off` frente a `gzip off`. La diferencia entre ambos parches
  sigue siendo una predicción, no una medición.

## 5 · La otra mitad del encargo: el lado del vídeo

El encargo pedía lo mismo para los filtros de vídeo. La respuesta está en el módulo que VLC usa para
escalar, leído del binario:

| Dato | Valor |
|---|---|
| Fichero | `libscale_plugin.dll` |
| Tamaño | 42.944 bytes |
| Versión | `vlc_entry__3_0_0f` → VLC 3.0.0 |
| Cadenas de la descripción | `scale`, `Video scaling filter`, `video converter`, `OpenFilter` |
| **Parámetros de calidad** | **ninguno** — no aparece `lanczos`, ni `bicubic`, ni `sws-*`, ni `scaler` |

**El único módulo de escalado de VLC no permite elegir algoritmo.** Escala con lo que tenga por defecto y
no expone el parámetro. Así que ni siquiera la ruta que sí existe —`scale`— sirve para lo que la cadena
pretendía, que era subir resolución con Lanczos.

Y en el módulo `postproc` sí aparecen las banderas que la cadena del operador usa: `pp`, `ac`, `dr`, `ci`,
`al`, `autoq`, `quality`. **`pp=ac/dr/ci` es VLC válido** — es el único tramo de la cadena que apunta al
motor correcto. El problema es que está mezclado con módulos de ffmpeg que VLC no tiene.

### La conclusión que cierra las dos mitades

Las dos preguntas —el 206 y los filtros de vídeo— tienen la **misma respuesta de fondo**:

> **No se arregla en la lista. Se arregla en la capa que de verdad ejecuta.**

- El 206 se arregla en el `location` de nginx, no en el `.m3u8`.
- La imagen se mejora en el **módulo de salida de vídeo del reproductor** o en el **VPP del SoC**, no en
  un `#EXTVLCOPT` que nombra filtros que el motor no tiene.

Eso es exactamente lo que el operador ya había concluido sobre el VPP. Este trabajo no lo confirma —no lo
ha medido— pero **cierra las otras dos puertas**, que eran las que faltaban por cerrar.

## 6 · Consecuencia operativa

Si alguien revisa esto en el futuro y se pregunta por qué el `location` de `.m3u8` no comprime en vuelo,
la respuesta ya no es «porque lo medimos una vez»: es **porque nginx no puede servir rangos mientras
comprime, y eso lo dice su propia lista de desarrollo**.

Eso es exactamente lo que separa una configuración del 5% de una del 95%: no la receta, sino **saber por
qué la receta es la que es**.
