package com.ape.crystalagent

import android.content.Context
import com.ape.fluid.FluidStore
import kotlin.math.roundToInt

/**
 * Banda efectiva = banda de origen × multiplicador de salida.
 * El techo NUNCA se multiplica: si el origen no tiene más, no hay más.
 * El multiplicador vive en prefs por dispositivo (`upscale_demand_<out>`).
 */
data class BitrateBand(val floorKbps: Int, val ceilKbps: Int)

object BitrateConfig {
    private val bySource = mapOf(
        "sd480" to (7_000 to 12_000),
        "sd576" to (7_000 to 12_000),
        "hd720" to (8_000 to 13_000),
        "fhd1080" to (8_000 to 14_000),
        "2k" to (8_000 to 14_000),
        "4k" to (13_000 to 22_000),
        "6k" to (20_000 to 34_000),
        "8k" to (28_000 to 48_000)
    )
    /**
     * F07/F08 (Council t41): la SALIDA está capada a 4K por política (`PlaybackPolicy.maxHeight`),
     * así que pedir banda de 6K/8K en la salida era un claim imposible. Se limita a los niveles
     * alcanzables y, por debajo de 1440p, NO se etiqueta como "4k" (etiqueta honesta).
     */
    private val defaultDemand = mapOf("2k" to 1.00f, "4k" to 1.15f)

    fun sourceBand(height: Int): String = when {
        height >= 4320 -> "8k"
        height >= 3240 -> "6k"
        height >= 2160 -> "4k"
        height >= 1440 -> "2k"
        height >= 1000 -> "fhd1080"
        height >= 720 -> "hd720"
        height >= 576 -> "sd576"
        else -> "sd480"
    }

    /** Banda de SALIDA alcanzable (decode capado a 4K por política). */
    fun outBand(height: Int): String = when {
        height >= 2160 -> "4k"
        height >= 1440 -> "2k"
        height >= 1000 -> "fhd1080"
        else -> "hd720"
    }

    fun band(ctx: Context, srcHeight: Int, outHeight: Int): BitrateBand {
        val src = sourceBand(srcHeight)
        val out = outBand(outHeight)
        val base = bySource[src] ?: bySource.getValue("fhd1080")
        val pref = "upscale_demand_$out"
        val want = runCatching { FluidStore.prefs(ctx).getFloat(pref, defaultDemand[out] ?: 1.15f) }
            .getOrDefault(defaultDemand[out] ?: 1.15f)
        val factor = if (src == out) 1.0f else want.coerceIn(1.0f, 2.0f)
        val floor = (base.first * factor).roundToInt().coerceAtMost(base.second)
        return BitrateBand(floor, base.second)
    }

    fun demandLabel(ctx: Context, outHeight: Int): String {
        val out = outBand(outHeight)
        val want = runCatching { FluidStore.prefs(ctx).getFloat("upscale_demand_$out", defaultDemand[out] ?: 1.15f) }
            .getOrDefault(defaultDemand[out] ?: 1.15f)
        return "x$want"
    }
}
