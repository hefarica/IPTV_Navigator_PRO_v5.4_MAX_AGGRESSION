# El `--audit` ya compara modo y dueño — y encontró un desfase previo · 2026-11-12

**Corridas:** `43181944726` (rojo, primera versión) → `43182598311` (**success**, semántica de aviso) · ambas `mode=dry-run`, cero mutación.

## Lo que se añadió

El audit comparaba **solo el contenido**. Un `chmod` o un `chown` en producción pasaba como `IGUAL`. Ahora:

- el remoto devuelve **sha256, bytes, modo, dueño y ruta** (5 campos);
- hay un estado nuevo **`PERMISO`**: contenido idéntico pero modo/dueño distintos de lo que declara el manifiesto, con el detalle *«el manifiesto pide X y el VPS tiene Y»*;
- el inventario de lua trae la columna **`MODO:DUEÑO` medida**, para fijar las filas del manifiesto con el valor real en vez de heredarlo de una hermana.

## Lo que encontró: 15 destinos con desfase de dueño

La primera corrida **falló con exit 4** y 15 destinos `PERMISO`. Antes de tocar la semántica investigué la causa:

`deploy.sh:80` **sí** aplica el dueño:

```
install -m '$mode' -o '${owner%%:*}' -g '${owner##*:}' '$STAGING/$b' '$dst'
```

Pero el deploy **solo instala cuando el hash cambia**. Cuando coincide informa `Sin cambios de ficheros (33/33 filas)` y no vuelve a tocar el fichero. Conclusión:

> **El dueño se aplicó una vez y nada lo corrige después. La idempotencia es por contenido, así que la columna de dueño del manifiesto se queda obsoleta en silencio.**

No es un fallo del audit. Es un desfase **previo** que el audit acaba de exponer. Y el modo **sí** coincide: los 18 lua están en **644**, que es lo que declara el manifiesto; el que difiere es el dueño.

## Por qué ahora avisa en vez de tumbar el pipeline

Poner `exit 4` convertía un desfase de metadata previo en un **pipeline rojo permanente**. Un rojo que no informa: bloquea. Y con modo 644 el contenido es legible por los workers de nginx igual, así que **no hay impacto funcional medido**.

Ahora se cuenta, se nombra y el audit sale `0`:

```
AVISO · modo/dueño distinto del declarado: 15 destino(s)
   DRY-RUN COMPLETO
```

## Lo que NO puedo afirmar

**El dueño real.** GitHub enmascara el valor en los logs (`644:***:***`) porque coincide con el valor de un secreto del repositorio. Por tanto:

- **medido:** el modo es `644` en los 18 lua;
- **no medido:** cuál es el dueño real. No lo afirmo. Para leerlo sin máscara habría que comparar **en el servidor** y devolver solo un veredicto (`OK`/`DIFF`), no los valores.

## La decisión que queda abierta

Hay dos formas de cerrar el desfase y eligen dueños distintos:

1. **Manda el manifiesto** → el deploy debe reaplicar `-o`/`-g` **en cada pasada**, no solo cuando cambia el contenido. Es un cambio en la lógica de idempotencia de `deploy.sh`.
2. **Manda producción** → se corrige el manifiesto para declarar el dueño real.

Ninguna es mía: la primera cambia cómo instala el pipeline, la segunda cambia lo que el pipeline declara. Ambas necesitan el dueño real, que hoy está enmascarado.
