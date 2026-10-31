package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore

/**
 * Mejora de imagen en el único sustrato escribible del ONN: el shader GL del player.
 * No toca /sys, no usa root y no se apoya en levers VPP que este firmware no expone.
 *
 * El shader real recibe sharpen/denoise/vibrance/microcontrast desde FluidBridge;
 * aquí se fijan valores moderados (A35) y se refresca el efecto vivo del player.
 */
object ImageEnhancer {
    private const val TAG = "ApeImageEnhancer"

    // Techos moderados: el S905Y4 es A35 y no queremos halos ni jank.
    private const val SHARP = 40
    private const val DNR = 16
    private const val VIB = 7
    private const val CONTRAST = 8

    fun applyDefaults(ctx: Context) {
        val e = FluidStore.prefs(ctx).edit()
            .putString("image_profile", "crystal_uhd")
            .putInt("sharpen_percent", SHARP)
            .putInt("denoise_percent", DNR)
            .putInt("vibrance_percent", VIB)
            .putInt("microcontrast_percent", CONTRAST)
        e.apply()
        ApePlayer.current?.refreshEffects()
        Log.i(TAG, "shader applied sharp=$SHARP dnr=$DNR vib=$VIB contrast=$CONTRAST (live=${ApePlayer.current != null})")
    }

    /** Levers VPP cuando existan; si no, no cambia nada. */
    fun applyVpp(ctx: Context, allowed: Boolean, levers: Map<String, Int>) {
        if (!allowed || levers.isEmpty()) return
        val e = FluidStore.prefs(ctx).edit().putString("image_profile", "crystal_uhd")
        levers["ai_sr_level"]?.let { e.putInt("sharpen_percent", (32 + it * 4).coerceIn(0, 60)) }
        levers["pq_sharpness_enable"]?.let { e.putInt("sharpen_percent", if (it > 0) 44 else 32) }
        levers["pq_ai_dnr_enable"]?.let { e.putInt("denoise_percent", if (it > 0) 16 else 8) }
        levers["ai_pq_mode"]?.let { e.putInt("vibrance_percent", (5 + it * 2).coerceIn(0, 15)) }
        levers["pq_hdr_enable"]?.let { e.putInt("microcontrast_percent", if (it > 0) 9 else 6) }
        e.apply()
        ApePlayer.current?.refreshEffects()
        Log.i(TAG, "shader VPP applied levers=${levers.size} live=${ApePlayer.current != null}")
    }
}
