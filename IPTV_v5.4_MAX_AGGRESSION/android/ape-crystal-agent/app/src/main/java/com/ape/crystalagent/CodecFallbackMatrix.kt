package com.ape.crystalagent

/**
 * CodecFallbackMatrix — same SSOT as frontend ape-hevc-cascade.js and VPS
 * ape_fallback_matrix.*.
 *
 * Policy: BEST_4K_THEN_NATIVE.
 *  · If a real 4K exists: 4K@120 -> 4K@60 -> 4K@30.
 *  · If none of those play: best NATIVE resolution of the channel.
 *  · A <4K channel never declares 4K.
 *
 * This class only decides the order. It does not change the source URL and does
 * not claim a codec/resolution that the provider does not serve.
 */
data class CodecFallback(
    val id: String,
    val codec: String,
    val hev1: String,
    val width: Int,
    val height: Int,
    val fps: Double,
    val resolution: String,
    val native: String
)

object CodecFallbackMatrix {
    val rows: List<CodecFallback> = listOf(
        CodecFallback("8k120", "hvc1.2.4.L186.B0", "hev1.2.4.L186.B0", 8192, 4320, 120.0, "8192x4320", "8K"),
        CodecFallback("8k60", "hvc1.2.4.L183.B0", "hev1.2.4.L183.B0", 8192, 4320, 60.0, "8192x4320", "8K"),
        CodecFallback("8k30", "hvc1.2.4.L180.B0", "hev1.2.4.L180.B0", 8192, 4320, 30.0, "8192x4320", "8K"),
        CodecFallback("4k120", "hvc1.2.4.L156.B0", "hev1.2.4.L156.B0", 4096, 2160, 120.0, "4096x2160", "4K"),
        CodecFallback("4k60", "hvc1.2.4.L153.B0", "hev1.2.4.L153.B0", 4096, 2160, 60.0, "4096x2160", "4K"),
        CodecFallback("4k30", "hvc1.2.4.L150.B0", "hev1.2.4.L150.B0", 4096, 2160, 30.0, "4096x2160", "4K"),
        CodecFallback("dci60", "hvc1.2.4.L123.B0", "hev1.2.4.L123.B0", 2048, 1080, 60.0, "2048x1080", "2K"),
        CodecFallback("hd50", "hvc1.2.4.L123.B0", "hev1.2.4.L123.B0", 1920, 1080, 50.0, "1920x1080", "FHD"),
        CodecFallback("2k30", "hvc1.2.4.L120.B0", "hev1.2.4.L120.B0", 2048, 1080, 30.0, "2048x1080", "2K"),
        CodecFallback("720p60", "hvc1.2.4.L93.B0", "hev1.2.4.L93.B0", 1280, 720, 60.0, "1280x720", "HD"),
        CodecFallback("720p33", "hvc1.2.4.L93.B0", "hev1.2.4.L93.B0", 1280, 720, 33.7, "1280x720", "HD"),
        CodecFallback("480p16", "hvc1.2.4.L90.B0", "hev1.2.4.L90.B0", 854, 480, 30.0, "854x480", "SD"),
        CodecFallback("480p43", "hvc1.2.4.L90.B0", "hev1.2.4.L90.B0", 720, 480, 30.0, "720x480", "SD")
    )

    private val byId = rows.associateBy { it.id }

    private val chains: Map<String, List<String>> = mapOf(
        "8k120" to listOf("4k120", "4k60", "4k30", "8k60", "8k30"),
        "8k60" to listOf("4k120", "4k60", "4k30", "8k30"),
        "8k30" to listOf("4k120", "4k60", "4k30"),
        "4k120" to listOf("4k60", "4k30", "dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"),
        "4k60" to listOf("4k30", "dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"),
        "4k30" to listOf("dci60", "hd50", "2k30", "720p60", "720p33", "480p16", "480p43"),
        "dci60" to listOf("hd50", "2k30", "720p60", "720p33", "480p16", "480p43"),
        "hd50" to listOf("2k30", "720p60", "720p33", "480p16", "480p43"),
        "2k30" to listOf("720p60", "720p33", "480p16", "480p43"),
        "720p60" to listOf("720p33", "480p16", "480p43"),
        "720p33" to listOf("480p16", "480p43"),
        "480p16" to listOf("480p43"),
        "480p43" to emptyList()
    )

    fun chainFor(codec: String?, resolution: String?, fps: Double): List<CodecFallback> {
        val wanted = (codec ?: "").lowercase()
        val res = normalizeResolution(resolution)
        var primary: CodecFallback? = null
        if (wanted.isNotEmpty()) {
            primary = rows.firstOrNull { it.codec.lowercase() == wanted && (res.isEmpty() || it.resolution == res) }
                ?: rows.firstOrNull { it.codec.lowercase() == wanted }
        }
        if (primary == null && res.isNotEmpty()) {
            primary = rows.firstOrNull { it.resolution == res }
        }
        val id = primary?.id ?: return emptyList()
        return (chains[id] ?: emptyList()).mapNotNull { byId[it] }
    }

    fun policy(): String = "BEST_4K_THEN_NATIVE"

    private fun normalizeResolution(value: String?): String {
        val m = Regex("(\\d{3,5})\\s*[xX]\\s*(\\d{3,5})").find(value ?: "") ?: return ""
        return "${m.groupValues[1].toInt()}x${m.groupValues[2].toInt()}"
    }
}
