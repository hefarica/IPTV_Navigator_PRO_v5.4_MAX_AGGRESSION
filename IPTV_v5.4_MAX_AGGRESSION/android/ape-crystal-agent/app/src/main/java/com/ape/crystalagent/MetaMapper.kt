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
        val levers = json.optJSONObject("levers") ?: return 0
        val edit = FluidStore.prefs(ctx).edit()
        var applied = 0
        for (key in levers.keys()) {
            val range = clamp[key] ?: continue
            val v = levers.optInt(key, Int.MIN_VALUE)
            if (v == Int.MIN_VALUE) continue
            edit.putInt(key, v.coerceIn(range.first, range.last))
            applied++
        }
        if (applied == 0) return 0
        edit.apply()
        ApePlayer.current?.refreshEffects()
        Log.i(TAG, "applied=$applied levers=${levers.keys().asSequence().toList()} live=${ApePlayer.current != null}")
        return applied
    }

    companion object { private const val TAG = "ARA-Meta" }
}
