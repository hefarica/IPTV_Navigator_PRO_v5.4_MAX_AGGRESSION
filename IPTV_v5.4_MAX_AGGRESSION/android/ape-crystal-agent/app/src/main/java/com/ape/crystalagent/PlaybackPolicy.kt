package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore

/**
 * PlaybackPolicy — política 4K-first / no-downscale del player (release v17).
 *
 * Defaults canónicos: target/max **3840x2160**, `neverDownscale = true`, buffer **30/120 s**,
 * caché **256 MiB**, timeouts **15/30 s**. El bloque `display.min_resolution` y
 * `player.buffer_s` del `/sync` la ajustan cuando están presentes (los persiste SyncLoop al
 * aplicar una política; ver [persist]).
 *
 * HONESTO (truth-guards):
 *  · `min_resolution` es un **piso de política**, no un recorte de catálogo: si la fuente sólo
 *    sirve 1080p se reproduce 1080p (no se pierde el canal) y se marca `4k_upscaled`.
 *  · 8K: sólo **presentación**; el decode se queda capado a 4K (`8k_presentation`).
 *  · No transcodifica ni inventa variantes: el player elige la mejor REAL que el proveedor sirva.
 */
data class PlaybackPolicy(
    val targetWidth: Int = 3840,
    val targetHeight: Int = 2160,
    val maxWidth: Int = 3840,
    val maxHeight: Int = 2160,
    val minWidth: Int = 1920,
    val minHeight: Int = 1080,
    val neverDownscale: Boolean = true,
    val bufferMinS: Int = 30,
    val bufferMaxS: Int = 120,
    val cacheMiB: Int = 256,
    val connectTimeoutMs: Int = 15_000,
    val readTimeoutMs: Int = 30_000,
    val eightKPresentation: Boolean = true
) {
    companion object {
        const val TAG = "ApePlaybackPolicy"
        private const val PREF_MIN_RES = "min_resolution"
        private const val PREF_BUF_MIN = "buffer_min_s"
        private const val PREF_BUF_MAX = "buffer_max_s"
        private const val PREF_CACHE = "cache_mib"

        fun default(): PlaybackPolicy = PlaybackPolicy()

        /** Política efectiva: defaults + overrides aplicados desde `/sync`. Nunca lanza. */
        fun fromSync(ctx: Context): PlaybackPolicy {
            val d = PlaybackPolicy()
            return try {
                val sp = FluidStore.prefs(ctx)
                val min = parseResolution(sp.getString(PREF_MIN_RES, ""))
                val bMin = sp.getInt(PREF_BUF_MIN, 0).takeIf { it in 5..300 } ?: d.bufferMinS
                val bMax = sp.getInt(PREF_BUF_MAX, 0).takeIf { it in 5..300 } ?: d.bufferMaxS
                d.copy(
                    minWidth = (min?.first ?: d.minWidth).coerceIn(320, d.maxWidth),
                    minHeight = (min?.second ?: d.minHeight).coerceIn(180, d.maxHeight),
                    bufferMinS = bMin,
                    bufferMaxS = maxOf(bMin, bMax),
                    cacheMiB = sp.getInt(PREF_CACHE, d.cacheMiB).coerceIn(16, 256)
                )
            } catch (e: Exception) {
                Log.w(TAG, "policy: ${e.message}")
                d
            }
        }

        /** Persiste lo que afecta al player de una política `/sync` aplicada. Nunca lanza. */
        fun persist(ctx: Context, minResolution: String?, bufferS: Int?, cacheMiB: Int = 256) {
            try {
                val sp = FluidStore.prefs(ctx).edit()
                if (!minResolution.isNullOrBlank()) sp.putString(PREF_MIN_RES, minResolution)
                if (bufferS != null && bufferS in 5..300) {
                    sp.putInt(PREF_BUF_MIN, bufferS)
                    sp.putInt(PREF_BUF_MAX, (bufferS * 4).coerceIn(bufferS, 300))
                }
                sp.putInt(PREF_CACHE, cacheMiB.coerceIn(16, 256))
                sp.apply()
            } catch (e: Exception) {
                Log.w(TAG, "persist: ${e.message}")
            }
        }

        fun parseResolution(value: String?): Pair<Int, Int>? {
            if (value.isNullOrBlank()) return null
            val m = Regex("(\\d{3,4})\\s*[xX]\\s*(\\d{3,4})").find(value) ?: return null
            return m.groupValues[1].toInt() to m.groupValues[2].toInt()
        }
    }
}
