package dev.venice.ottshim

import okhttp3.HttpUrl
import org.json.JSONObject
import java.io.InputStream

/** Transport-only canary. No filter commands, device settings or provider credentials. */
internal object CanaryWire {
    private val identity = Regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}")
    private val tvgId = Regex("(?:^|\\s)tvg-id=\"([^\"]+)\"")
    private val flatInf = Regex("#EXTINF:(?:-1|0)(?:\\s|,).*")
    // Acepta el token firmado v2 y el token v1 que /pulse usa sin single-slot.
    private val resourcePath = Regex("/seg/(?:v2\\.[A-Za-z0-9_-]+\\.[a-f0-9]{64}|[A-Za-z0-9_-]{16,})")
    private val pulse = Regex("/pulse/[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\\.m3u8")
    private val uriAttribute = Regex("(?:[:,])URI=\"([^\"]+)\"")
    private val resourceTags = setOf("#EXT-X-KEY", "#EXT-X-MAP")
    private val unsupported = setOf("#EXT-X-STREAM-INF", "#EXT-X-MEDIA", "#EXT-X-I-FRAME-STREAM-INF",
        "#EXT-X-SESSION-KEY", "#EXT-X-DEFINE", "#EXT-X-PART", "#EXT-X-PRELOAD-HINT", "#EXT-X-RENDITION-REPORT")

    fun readSmall(input: InputStream, limit: Int = 512 * 1024): String {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8192)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            require(out.size() + n <= limit)
            out.write(buf, 0, n)
        }
        return Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(out.toByteArray())).toString()
    }

    private fun sameVps(base: HttpUrl, value: String): HttpUrl {
        val u = requireNotNull(base.resolve(value))
        require(base.isHttps && u.isHttps && u.host == base.host && u.port == base.port &&
            u.username.isEmpty() && u.password.isEmpty() && u.fragment == null)
        return u
    }

    fun catalog(raw: String, base: HttpUrl, channel: (String, HttpUrl) -> String): String {
        val lines = raw.removePrefix("\uFEFF").lineSequence().toList()
        require(lines.firstOrNull()?.substringBefore(' ') == "#EXTM3U")
        val out = StringBuilder("#EXTM3U max-conn=\"1\"\n")
        var inf: String? = null
        var tag: String? = null
        val ids = mutableSetOf<String>()
        for (line in lines.drop(1)) {
            when {
                line.isBlank() -> Unit
                flatInf.matches(line) -> {
                    require(inf == null)
                    inf = line
                }
                line.startsWith("#EXTSHIMOTT:") -> {
                    require(inf != null && tag == null && line.toByteArray().size <= 4096)
                    tag = line.substringAfter(':')
                }
                line.startsWith("#EXT-X-") && !line.startsWith("#EXT-X-APE-") -> error("catalogo mixto")
                line.startsWith('#') -> Unit
                else -> {
                    val channelLine = requireNotNull(inf)
                    val json = JSONObject(requireNotNull(tag))
                    val id = json.getString("id")
                    var quoted = false
                    val sep = channelLine.indexOfFirst { ch ->
                        if (ch == '"') quoted = !quoted
                        ch == ',' && !quoted
                    }
                    require(sep >= 0)
                    require(json.get("ver") == 1 && identity.matches(id) &&
                        id == tvgId.find(channelLine.substring(0, sep))?.groupValues?.get(1) &&
                        "ott" in json.getString("tgt").split('|') && ids.add(id))
                    require(line.startsWith("https://") && '|' !in line)
                    val u = sameVps(base, line)
                    require(pulse.matches(u.encodedPath) && u.queryParameterValues("m") == listOf("proxy"))
                    // Canonical output: no catchup, external player, nested playlists or origin headers.
                    val name = channelLine.substring(sep + 1).trim().ifEmpty { id }
                    out.append("#EXTINF:-1 tvg-id=\"").append(id).append("\",").append(name).append('\n')
                    out.append(channel(id, u)).append('\n')
                    inf = null
                    tag = null
                }
            }
        }
        require(inf == null && ids.size == 3)
        return out.toString()
    }

    fun media(raw: String, base: HttpUrl, resource: (HttpUrl) -> String): String {
        val lines = raw.lineSequence().toList()
        require(lines.firstOrNull() == "#EXTM3U" && lines.any { it.startsWith("#EXT-X-TARGETDURATION:") } &&
            lines.any { it.startsWith("#EXTINF:") } && lines.any { it.isNotBlank() && !it.startsWith('#') })
        return lines.joinToString("\n") { line ->
            val tag = line.substringBefore(':')
            require(tag !in unsupported)
            when {
                line.isBlank() -> ""
                !line.startsWith('#') -> resource(proxyResource(base, line))
                tag in resourceTags -> {
                    if (tag == "#EXT-X-KEY" && line == "#EXT-X-KEY:METHOD=NONE") line
                    else {
                        if (tag == "#EXT-X-KEY") require(line.startsWith("#EXT-X-KEY:METHOD=AES-128,") &&
                            (!line.contains("KEYFORMAT=") || line.contains("KEYFORMAT=\"identity\"")))
                        val uri = uriAttribute.findAll(line).toList().single().groups[1]!!
                        line.replaceRange(uri.range, resource(proxyResource(base, uri.value)))
                    }
                }
                line.startsWith("#EXT-X-APE-") -> ""
                else -> { require(!line.contains("URI=", ignoreCase = true)); line }
            }
        }
    }

    private fun proxyResource(base: HttpUrl, value: String): HttpUrl = sameVps(base, value).also {
        require(resourcePath.matches(it.encodedPath) && it.query == null)
    }
}
