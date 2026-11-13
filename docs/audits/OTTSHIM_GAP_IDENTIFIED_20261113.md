# El hueco exacto: la APK captura la pantalla de OTT, mide, y descarta el fotograma · 2026-11-13

**Corrección del modelo, aceptada:** la APK no es un reproductor. Es el agente que debe mejorar la imagen de fondo sobre OTT Navigator / TiviMate.

**Y esto es lo que falta para que eso sea cierto.**

## Lo que existe

`ScreenCaptureService.kt` captura la pantalla completa con `MediaProjection` — **incluido lo que otra app está mostrando**:

```kotlin
L70: val ir = ImageReader.newInstance((w / 2).coerceAtLeast(2), (h / 2).coerceAtLeast(2), ...)
L73: ir.setOnImageAvailableListener({ r ->
L75:     val img = r.acquireLatestImage() ?: return@setOnImageAvailableListener
L76:     try { measure(img) } finally { img.close() }      // ← MIDE y DESCARTA
L103:    val plane = img.planes[0]
L104:    val buf = plane.buffer
```

Y su propia cabecera lo declara:

```kotlin
/**
 * Captura de display con consentimiento (MediaProjection). MIDE el frame compuesto,
 * no el buffer privado de ExoPlayer de otra app. No usa root, DRM ni hooks.
 */
```

## Lo que falta

| Pieza | Estado |
|---|---|
| Captura de la pantalla compuesta (incluye OTT) | **existe** — `ScreenCaptureService`, a **media resolución** |
| Procesado del fotograma capturado | **NO existe** — `measure()` y `close()`: el frame se destruye |
| Ventana de overlay para mostrar el resultado | **NO existe** — ninguna `TYPE_APPLICATION_OVERLAY` en el camino de captura |
| **`OTTShim`** | **NO existe en el repo**, aunque el mandato lo nombra como trabajo disponible |

`PlayerHub` confirma el alcance actual: ata los efectos a **la vista de la propia APK**:

```kotlin
fun attach(a: Activity, v: View, p: ApePlayer) { videoView = v; player = p }
fun neutral() { ... player?.refreshEffects() }
```

No tiene ninguna referencia a la vista de otra aplicación, y Android no permite obtenerla.

## Por qué esto importa, y qué costaría cerrarlo

El modelo del operador **es correcto como diseño y es técnicamente posible**: capturar la pantalla, procesarla y mostrarla encima. Es la arquitectura de cualquier "mejorador de pantalla".

Pero tiene tres condiciones duras que la implementación actual no cumple:

1. **La captura es a media resolución** (`w/2`, `h/2`). Mostrar eso sería **reducir** la resolución: la ley anti-degradación lo prohíbe. Habría que capturar a 4K completo.
2. **`glReadPixels` mata el 4K@25fps** en este SoC (skill `ape-crystal-ultraenhance-apk`). La vía tiene que ser **textura GPU** (`SurfaceTexture`/`EGLImage` → GL → `SurfaceView`), no lectura a CPU.
3. **Latencia.** Capturar, procesar y pintar añade fotogramas de retraso entre lo que OTT decodifica y lo que se ve. En directo eso es aceptable para película, malo para deporte.

## El trabajo, nombrado

**`OTTShim`** sería exactamente:

```
MediaProjection (4K completo)
  -> SurfaceTexture (textura GPU, sin glReadPixels)
  -> cadena GL de mejora (la misma receta Canary, en shader)
  -> SurfaceView en ventana TYPE_APPLICATION_OVERLAY a pantalla completa
  -> con presupuesto temporal: si el frame no llega a tiempo, se descarta la mejora
     y se deja pasar el original (la reproducción nunca se rompe)
```

Es un componente nuevo, no un parche. Y es el único camino que mejora la imagen de **otra** aplicación — porque Android prohíbe tocar su buffer.

## Lo que NO es

- No es una configuración que falte activar.
- No es un bug de `SettingsCatalog`.
- No es algo que se resuelva desde el VPS: la Capa 2 manipula texto de manifiesto, no píxeles.

**Es software que no está escrito.** El mandato lo daba por existente; el repositorio dice que no.

## Estado de las tres capas, tras medirlas

| Capa | Qué hace | Estado real |
|---|---|---|
| **1 · Generador** | listas con metadata inerte | funciona (y sobre-declara: 16/21 perfiles, 7/7 códecs) |
| **2 · VPS** | muta el manifiesto, nunca píxeles | funciona y **es lo que OTT consume hoy** |
| **3 · APK** | debería ejecutar los píxeles | **captura y descarta**; efectos GL rotos medidos; `OTTShim` ausente |

**La mejora de imagen sobre OTT Navigator no existe hoy en ninguna capa.** Ni el VPS puede (prohibido por diseño) ni la APK lo tiene (sin implementar).
