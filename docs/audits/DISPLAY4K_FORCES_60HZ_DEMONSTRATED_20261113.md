# `Display4K` fuerza 60 Hz y deshace la selección del sistema — demostrado en vivo · 2026-11-13

**Este es el hallazgo con la demostración más limpia de la sesión.** No es lectura de código: es un A/B de tres pasos, repetible, medido en el aparato mientras el operador lo tenía delante.

## El experimento

| Paso | Acción | `mActiveModeId` | `renderFrameRate` |
|---|---|---|---|
| 1 | **Ajustes del televisor → Resolución → `4k (50 Hz)`** | **125** | **50.0** |
| 2 | **Se abre `com.ape.crystalagent/.PlayerActivity`** | **124** | **60.000004** |
| 3 | **`am force-stop com.ape.crystalagent`** | **125** | **50.0** |

**La APK, al abrir su reproductor, devuelve el panel a 60 Hz. Al cerrarla, vuelve a 50.**

## El mecanismo, en una línea

`Display4K.kt`:

```kotlin
L19: val best = modes
L20:     .filter { it.physicalWidth >= 3840 && it.physicalHeight >= 2160 }
L21:     .maxByOrNull { it.refreshRate }        // ← el mayor refresco, siempre
L27: val lp = activity.window.attributes
L28: lp.preferredDisplayModeId = best.modeId    // ← se impone en la ventana
L29: activity.window.attributes = lp
```

**`maxByOrNull { it.refreshRate }`** elige 60.000004 Hz por ser el máximo de la tabla, sin mirar la cadencia del contenido. Y se aplica en **cada** `onCreate` de `MainActivity` (L48) y `PlayerActivity` (L25).

## Por qué esto es más grave de lo que parecía

Antes de este experimento, `Display4K` era «un criterio mejorable». Ahora es **un componente que revierte activamente una configuración del sistema**.

Un operador que ponga 50 Hz en los Ajustes del televisor —la única vía que funciona en este aparato, porque `cmd display` lanza `SecurityException`— **perderá esa configuración en cuanto abra la APK**. Y no tendrá forma de saber por qué.

Es exactamente la degradación silenciosa que la ley prohíbe: no la produce un fallo, la produce una decisión de código que ignora el contexto.

## Lo que debería hacer

Elegir el modo cuyo refresco sea **múltiplo entero exacto** de la cadencia del contenido, y entre los que empatan, la mayor resolución:

```kotlin
val exactos = modes.filter { m ->
    m.physicalWidth >= 1920 &&
    abs((m.refreshRate / contentFps) - Math.round(m.refreshRate / contentFps)) < 0.001
}
val best = exactos.maxByOrNull { it.physicalWidth * it.physicalHeight }
           ?: modes.filter { it.physicalWidth >= 3840 }.maxByOrNull { it.refreshRate }  // fallback
```

Con la cadencia del contenido leída del manifiesto o del decoder (`framerate-content`), que el sistema ya publica.

**Alternativa más conservadora y suficiente:** si el usuario ha fijado un modo, **no tocarlo**. `Display4K` no debería imponer nada cuando ya hay una preferencia explícita.

## Lo que NO se ha hecho

- **No se ha modificado `Display4K.kt`.** Ni compilado ni desplegado. La APK instalada sigue con el comportamiento descrito.
- **No se ha medido todavía el `judder-rate` a 50 Hz** con contenido en reproducción: hace falta un canal puesto. El panel está ahora en 125 (50 Hz), listo para esa medición.

## La medición que falta, y su criterio

- **Línea base (60 Hz, contenido 50 fps):** `judder-rate = 0,9948`, `framerate-actual=59.9988`, `frames-dropped=3/4626`.
- **Objetivo (50 Hz, mismo contenido):** `judder-rate < 0,05` y `framerate-actual ≈ 50`.
- **Falsación:** si a 50 Hz el `judder-rate` **no** baja de 0,1, entonces la métrica no mide lo que creo y la hipótesis de la cadencia es falsa.

## Estado del aparato al cerrar esta ronda

```
panel:   mActiveModeId=125 · renderFrameRate 50.0     (4K @ 50 Hz)
clave:   user_preferred_refresh_rate = 50.0
en pantalla: studio.scillarium.ottnavigator/.MainActivity
```

**El panel está a 50 Hz y OTT Navigator está listo** — en cuanto el operador elija un canal, se puede medir el `judder-rate` y cerrar o refutar el hallazgo.
