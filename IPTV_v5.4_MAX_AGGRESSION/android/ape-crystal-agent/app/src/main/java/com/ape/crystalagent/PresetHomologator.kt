package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore
import org.json.JSONObject

/**
 * Homologación total de los presets de la directiva ARA.
 *
 * Cada una de las 41 etiquetas se guarda como setting de la app (SharedPreferences),
 * sin inventar keys en Settings.Global/Secure. Las etiquetas que sí tienen una key
 * Android real se emiten además como filas device_settings allowlisted.
 *
 * Resultado: 41/41 aceptados; N se aplican al sistema Android y el resto al player.
 */
object PresetHomologator {
    private const val TAG = "ApePresetHomologator"

    data class Result(
        val androidSettings: List<String>,
        val appSettings: Int,
        val androidMapped: Int,
        val unknown: Int
    )

    fun apply(ctx: Context, directive: JSONObject?): Result {
        val arr = directive?.optJSONArray("presets") ?: return Result(emptyList(), 0, 0, 0)
        val rows = LinkedHashSet<String>()
        val prefs = ctx.getSharedPreferences("ape_preset_settings", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        var accepted = 0
        var unknown = 0

        for (i in 0 until arr.length()) {
            val raw = arr.optString(i, "").trim()
            if (raw.isEmpty()) { unknown++; continue }
            val (name, value) = parse(raw)
            if (name.isBlank()) { unknown++; continue }
            // setting de app: TODAS las etiquetas, sin excepción.
            editor.putString("preset_" + sanitize(name), value)
            accepted++

            // Sólo las que tienen una key Android REAL se aplican además al sistema.
            if (value.contains("3840x2160") || name.contains("TARGET") ||
                name.contains("RESOLUTION") || name.contains("LCEVC-TARGET")) {
                rows.add("global user_preferred_resolution_width 3840")
                rows.add("global user_preferred_resolution_height 2160")
            }
            if (name.contains("HDR", true)) {
                rows.add("global hdr_conversion_mode 1")
            }
            if (name.contains("QUALITY-LOCK", true) || name.contains("FRAME-RATE", true)) {
                rows.add("secure match_content_frame_rate 2")
            }
            if (name.contains("POST-PROCESS", true) || name.contains("QUALITY-LOCK", true)) {
                rows.add("secure minimal_post_processing_allowed 0")
            }
        }
        editor.putInt("preset_count", accepted)
        editor.putInt("preset_android_rows", rows.size)
        editor.apply()

        if (accepted > 0) {
            FluidStore.prefs(ctx).edit()
                .putString("buffer_profile", "max")
                .putInt("cache_mib", 256)
                .putInt("max_height", 2160)
                .putString("image_profile", "crystal_uhd")
                .apply()
        }

        AraStatus.lastPresetCount = accepted
        AraStatus.lastPresetLocal = accepted
        AraStatus.lastPresetUnknown = unknown
        AraStatus.lastPresetAndroid = rows.size
        Log.i(TAG, "presets homologados=$accepted androidRows=${rows.size} unknown=$unknown")
        return Result(rows.toList(), accepted, rows.size, unknown)
    }

    /** "#EXT-X-APE-BUFFER-LEVEL:ESCALATING" → name/value; tolera EXTVLCOPT/KODIPROP. */
    private fun parse(raw: String): Pair<String, String> {
        var s = raw
        for (p in listOf("#EXT-X-APE-", "#EXTVLCOPT:", "#KODIPROP:", "#EXT-X-")) {
            if (s.startsWith(p, true)) { s = s.substring(p.length); break }
        }
        val idx = s.indexOf(':')
        return if (idx > 0) s.substring(0, idx).trim() to s.substring(idx + 1).trim()
        else s.trim() to "1"
    }

    private fun sanitize(s: String): String =
        s.replace(Regex("[^A-Za-z0-9_.-]"), "_").take(96)
}
