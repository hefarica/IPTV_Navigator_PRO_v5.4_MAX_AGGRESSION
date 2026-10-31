package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore
import org.json.JSONObject

/**
 * Actual actuator for SSE metadata. Only allow-listed image levers are applied.
 * Values are clamped; unknown levers are ignored. No TFLite, no fake confidence.
 */
class MetaMapper(private val ctx: Context) {
    private val clamp = mapOf(
        "sharpen_percent" to 0..60,
        "denoise_percent" to 0..50,
        "vibrance_percent" to 0..15,
        "microcontrast_percent" to 0..20,
    )

    fun apply(json: JSONObject): Int {
        val edit = FluidStore.prefs(ctx).edit()
        var applied = 0
        val levers = json.optJSONObject("levers") ?: JSONObject()
        for (key in levers.keys()) {
            val range = clamp[key] ?: continue
            val v = levers.optInt(key, Int.MIN_VALUE)
            if (v == Int.MIN_VALUE) continue
            edit.putInt(key, v.coerceIn(range.first, range.last))
            applied++
        }
        val presetNames = mutableListOf<String>()
        val presets = json.optJSONArray("presets")
        if (presets != null) {
            for (i in 0 until presets.length()) {
                val p = presets.optString(i, "")
                val values = when (p) {
                    "CRYSTAL-UHD-MAX" -> mapOf(
                        "sharpen_percent" to 60, "denoise_percent" to 50,
                        "vibrance_percent" to 15, "microcontrast_percent" to 20)
                    "CRYSTAL-UHD-MED" -> mapOf(
                        "sharpen_percent" to 40, "denoise_percent" to 25,
                        "vibrance_percent" to 10, "microcontrast_percent" to 12)
                    "CRYSTAL-UHD-MIN" -> mapOf(
                        "sharpen_percent" to 20, "denoise_percent" to 10,
                        "vibrance_percent" to 5, "microcontrast_percent" to 6)
                    else -> null
                }
                if (values == null) continue
                for ((k, v) in values) {
                    val range = clamp[k] ?: continue
                    edit.putInt(k, v.coerceIn(range.first, range.last))
                    applied++
                }
                presetNames.add(p)
            }
        }
        if (applied == 0) return 0
        edit.apply()
        ApePlayer.current?.refreshEffects()
        Log.i(TAG, "applied=$applied levers=${levers.keys().asSequence().toList()} presets=$presetNames live=${ApePlayer.current != null}")
        return applied
    }

    companion object { private const val TAG = "ARA-Meta" }
}
