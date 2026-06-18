package com.ape.crystalagent

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Log

/**
 * Motor 2 (preferido) — LCEVC SINTÉTICO. No es V-Nova LCEVC real (eso requiere el SDK propietario + un
 * enhancement-layer en el stream). Es un realce de residual de alta frecuencia (unsharp 3x3 separable)
 * que recupera detalle perceptual sobre AVC/HEVC SDR sin transcode. Pure-CPU → siempre disponible
 * (load()=true). Para LCEVC real: swap por el SDK V-Nova manteniendo esta firma.
 *
 * Honesto: aproxima "más nitidez/detalle", NO reconstruye información ausente. Autopista: error → null.
 */
class LcevcSyntheticPipeline {

    @Volatile private var strength = 0.6f

    fun load(): Boolean = true
    fun setResidualStrength(s: Float) { strength = s.coerceIn(0f, 1.2f) }

    /** Unsharp mask separable (kernel laplaciano ligero) sobre los píxeles del Bitmap. */
    fun process(src: Bitmap): Bitmap? = runCatching {
        val w = src.width; val h = src.height
        if (w < 3 || h < 3) return src
        val inPx = IntArray(w * h); src.getPixels(inPx, 0, w, 0, 0, w, h)
        val outPx = IntArray(w * h)
        val k = strength
        var y = 0
        while (y < h) {
            var x = 0
            while (x < w) {
                val i = y * w + x
                if (x == 0 || y == 0 || x == w - 1 || y == h - 1) { outPx[i] = inPx[i]; x++; continue }
                val c = inPx[i]
                val up = inPx[i - w]; val dn = inPx[i + w]; val lf = inPx[i - 1]; val rt = inPx[i + 1]
                val r = sharp(Color.red(c), Color.red(up), Color.red(dn), Color.red(lf), Color.red(rt), k)
                val g = sharp(Color.green(c), Color.green(up), Color.green(dn), Color.green(lf), Color.green(rt), k)
                val b = sharp(Color.blue(c), Color.blue(up), Color.blue(dn), Color.blue(lf), Color.blue(rt), k)
                outPx[i] = Color.argb(Color.alpha(c), r, g, b)
                x++
            }
            y++
        }
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { setPixels(outPx, 0, w, 0, 0, w, h) }
    }.getOrElse { Log.w(TAG, "lcevc: ${it.message}"); null }

    private fun sharp(c: Int, up: Int, dn: Int, lf: Int, rt: Int, k: Float): Int {
        val lap = c * 4 - up - dn - lf - rt          // laplaciano (detalle de alta frecuencia)
        return (c + k * lap).toInt().coerceIn(0, 255)
    }

    fun release() {}
    companion object { const val TAG = "ApeLcevcSynthetic" }
}
