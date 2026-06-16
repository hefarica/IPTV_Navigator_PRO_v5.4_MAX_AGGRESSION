package com.ape.crystalagent

import org.json.JSONArray
import org.json.JSONObject

/**
 * REALIDAD del canal capturada del decoder ACTIVO (no capacidad) — resuelve el bug S12.
 * Campos vacíos = no observado todavía (el VPS cae al "esperado" o a tier seguro).
 */
data class RealDecode(
    val codec: String,   // "hevc" | "av1" | "dvhe" | "" (avc/desconocido)
    val res: String,     // "1920x1080" | ""
    val fps: Float?,     // 29.97 | null
    val hdr: String      // "PQ" | "HLG" | "" (SDR)
) {
    fun hasMin() = res.isNotEmpty() || codec.isNotEmpty()
    fun toJson(): JSONObject = JSONObject().apply {
        if (codec.isNotEmpty()) put("codec", codec)
        if (res.isNotEmpty()) put("res", res)
        if (fps != null) put("fps", fps)
        if (hdr.isNotEmpty()) put("hdr", hdr)
    }
}

/**
 * CARGA (superpaquete) que devuelve ape-match.php. Públicos HONESTOS + China Box en processing.
 */
data class Carga(
    val ok: Boolean,
    val codec: String,        // hvc1.* (GOLDEN RULE: manifest/STREAM-INF)
    val codecHev1: String,    // hev1.* (KODIPROP/EXTVLCOPT runtime)
    val resolution: String,
    val fps: Float?,
    val videoRange: String,   // "" = SDR (no fake HDR) | "PQ" | "HLG" (solo si real lo probó)
    val adbSettings: List<String>,
    val kodiprop: List<String>,
    val extvlcopt: List<String>,
    val chinaBox: JSONObject?,
    val raw: String
) {
    companion object {
        private fun arr(j: JSONObject, k: String): List<String> {
            val a: JSONArray = j.optJSONArray(k) ?: return emptyList()
            return (0 until a.length()).map { a.getString(it) }
        }
        fun parse(s: String?): Carga? {
            if (s.isNullOrBlank()) return null
            return try {
                val j = JSONObject(s)
                if (!j.optBoolean("ok", false)) return null
                Carga(
                    ok = true,
                    codec = j.optString("codec"),
                    codecHev1 = j.optString("codec_hev1"),
                    resolution = j.optString("resolution"),
                    fps = j.optDouble("fps", 0.0).toFloat().takeIf { it > 0f },
                    videoRange = j.optString("video_range"),
                    adbSettings = arr(j, "adb_settings"),
                    kodiprop = arr(j, "kodiprop"),
                    extvlcopt = arr(j, "extvlcopt"),
                    chinaBox = j.optJSONObject("china_box"),
                    raw = s
                )
            } catch (e: Exception) { null }
        }
    }
}
