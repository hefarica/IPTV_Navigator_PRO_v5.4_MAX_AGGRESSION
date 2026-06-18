package com.ape.crystalagent

import android.content.Context
import android.graphics.Bitmap
import android.util.Log

/**
 * Motor 5 — Media Enhancement API de Google (Pixel/algunos TV). Si está presente, el SoC hace la mejora
 * por hardware/firmware (mejor que nuestros motores 1-4) y la usamos en su lugar.
 *
 * DETECCIÓN POR REFLEXIÓN — NO añadimos la dep `com.google.android.gms:play-services-media-enhancement`
 * (no existe en Maven con esa versión → rompería el build verde). Si Google publica el SDK, se cablea aquí
 * la llamada real vía reflexión o añadiendo la dep cuando exista. Mientras: isSupported()=false → caemos a
 * los motores TFLite/GLSL. Autopista: cualquier fallo → passthrough.
 */
class MediaEnhanceApiPipeline(private val ctx: Context) {

    private var available = false
    private val candidateClasses = listOf(
        "com.google.android.gms.media.enhancement.MediaEnhancementClient",
        "com.google.android.gms.mediaenhancement.MediaEnhancementClient",
        "android.media.MediaEnhancer"
    )

    fun isSupported(): Boolean {
        available = candidateClasses.any { cls ->
            runCatching { Class.forName(cls); true }.getOrDefault(false)
        }
        Log.i(TAG, "Media Enhancement API ${if (available) "PRESENTE" else "ausente (fallback motores 1-4)"}")
        return available
    }

    /** No-op honesto hasta que exista el SDK; cuando exista, aquí va la llamada real por reflexión. */
    fun enhance(frame: Bitmap): Bitmap = frame

    fun release() { available = false }

    companion object { const val TAG = "ApeMediaEnhance" }
}
