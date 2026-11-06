package dev.venice.ottshim

import okhttp3.HttpUrl

class Rewriter(private val policy: AbrPolicy, private val map: (String) -> String) {
    private val uriAttr = Regex("(?i)(URI=\")([^\"]+)(\")")
    private val bwAttr = Regex("(?i)(BANDWIDTH=)(\\d+)")
    private val avgAttr = Regex("(?i)(AVERAGE-BANDWIDTH=)(\\d+)")

    private data class Variant(val inf: String, val url: String, val bw: Long)

    fun rewrite(raw: String, base: HttpUrl): String {
        if (!raw.contains("#EXT-X-STREAM-INF")) return rewriteMedia(raw, base)

        val lines = raw.lineSequence().toList()
        val header = StringBuilder()
        val variants = ArrayList<Variant>()
        var i = 0
        var sawVariant = false
        while (i < lines.size) {
            val line = lines[i]
            if (line.startsWith("#EXT-X-STREAM-INF")) {
                sawVariant = true
                val inf = line
                val bw = bwAttr.find(line)?.groupValues?.get(2)?.toLongOrNull() ?: 0L
                var j = i + 1
                while (j < lines.size && (lines[j].isBlank() || lines[j].startsWith("#"))) j++
                if (j < lines.size) {
                    val absolute = base.resolve(lines[j].trim())
                    if (absolute != null) variants.add(Variant(inf, absolute.toString(), bw))
                }
                i = j + 1
                continue
            }
            if (!sawVariant) header.append(rewriteTags(line, base)).append('\n')
            i++
        }

        if (variants.isEmpty()) return rewriteMedia(raw, base)
        if (policy.pinMode == 0) return filterByCeiling(header.toString(), variants)

        val byBw = variants.sortedBy { it.bw }
        val best = byBw.last()
        val floor = byBw.first()
        val emergency = System.currentTimeMillis() < policy.emergencyUntil
        policy.currentVariantBps = (if (emergency) floor else best).bw
        val selected = if (emergency) listOf(floor) else listOf(best, floor).distinctBy { it.url }

        val out = StringBuilder(raw.length + 256)
        out.append(if (header.isEmpty()) "#EXTM3U\n" else header)
        selected.forEach { v ->
            out.append(inflateBandwidth(v.inf)).append('\n')
            out.append("/media.m3u8?id=").append(map(v.url)).append('\n')
        }
        return out.toString()
    }

    private fun filterByCeiling(header: String, variants: List<Variant>): String {
        val admitted = variants.filter { policy.admits(it.bw) }
        val chosen = admitted.ifEmpty { listOf(variants.minByOrNull { it.bw }!!) }
        val out = StringBuilder(header)
        chosen.forEach { v ->
            out.append(inflateBandwidth(v.inf)).append('\n')
            out.append("/media.m3u8?id=").append(map(v.url)).append('\n')
        }
        return out.toString()
    }

    /** Declared peak margin; never claim this is measured CBR. */
    private fun inflateBandwidth(line: String): String {
        val inflated = bwAttr.replace(line) { m ->
            val value = m.groupValues[2].toLongOrNull() ?: return@replace m.value
            "${m.groupValues[1]}${(value * 1.35).toLong()}"
        }
        return avgAttr.replace(inflated) { m ->
            val value = m.groupValues[2].toLongOrNull() ?: return@replace m.value
            "${m.groupValues[1]}${(value * 1.35).toLong()}"
        }
    }

    private fun rewriteMedia(raw: String, base: HttpUrl): String {
        val out = StringBuilder(raw.length + 256)
        raw.lineSequence().forEach { line ->
            when {
                line.isBlank() -> out.append('\n')
                line.startsWith("#") -> out.append(rewriteTags(line, base)).append('\n')
                else -> {
                    val absolute = base.resolve(line) ?: return@forEach
                    out.append("/seg?id=").append(map(absolute.toString())).append('\n')
                }
            }
        }
        return out.toString()
    }

    private fun rewriteTags(line: String, base: HttpUrl): String {
        if (!uriAttr.containsMatchIn(line)) return line
        val kind = when {
            line.startsWith("#EXT-X-KEY") -> "key"
            line.startsWith("#EXT-X-MAP") -> "init"
            else -> "media"
        }
        return uriAttr.replace(line) { match ->
            val absolute = base.resolve(match.groupValues[2])
            if (absolute == null) match.value
            else "${match.groupValues[1]}/$kind?id=${map(absolute.toString())}${match.groupValues[3]}"
        }
    }
}
