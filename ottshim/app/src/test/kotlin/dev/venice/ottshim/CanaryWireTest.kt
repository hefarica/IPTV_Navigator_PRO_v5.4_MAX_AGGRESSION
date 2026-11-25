package dev.venice.ottshim

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class CanaryWireTest {
    private val base = "https://canary.invalid/catalog.m3u".toHttpUrl()
    private val resource = "/seg/v2.abcde." + "e".repeat(64)
    private val catalog = "#EXTM3U\n" + listOf("a", "b", "c").joinToString("") { id ->
        "#EXTINF:-1 tvg-id=\"$id\" group-title=\"Pruebas, HLS\",Canal $id, HD\n" +
            "#EXTSHIMOTT:{\"ver\":1,\"id\":\"$id\",\"tgt\":\"ott\"}\n" +
            "https://canary.invalid/pulse/$id.m3u8?m=proxy\n"
    }
    private val media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n$resource\n"

    @Test fun catalogRoutesThreeChannelsWithoutExposingOrigin() {
        val out = CanaryWire.catalog(catalog, base) { id, _ -> "/canary/media.m3u8?id=$id" }
        assertTrue(out.startsWith("#EXTM3U max-conn=\"1\"\n"))
        assertEquals(3, out.lineSequence().count { it.startsWith("/canary/media.m3u8") })
        assertTrue(out.contains("Canal b, HD"))
        assertFalse(out.contains("canary.invalid"))
    }

    @Test fun rejectsBadCatalog() {
        val variants = listOf(catalog.replace("tvg-id=\"b\"", "tvg-id=\"a\""),
            catalog.replace("\"tgt\":\"ott\"", "\"tgt\":\"vlc\""),
            catalog.replace("m=proxy", "m=redirect"), catalog.replace("m=proxy", "m=proxy&m=proxy"),
            catalog.replace("canary.invalid/pulse", "other.invalid/pulse"),
            catalog + "#EXT-X-STREAM-INF:BANDWIDTH=2000\n", catalog.substringBefore("#EXTINF:-1 tvg-id=\"c\""))
        variants.forEach { raw -> assertTrue(runCatching { CanaryWire.catalog(raw, base) { _, _ -> "/" } }.isFailure) }
    }

    @Test fun mediaRewritesOnlySignedSegmentMapAndAesKeyKeepingRanges() {
        val input = media.replace("#EXTINF:", "#EXT-X-MAP:URI=\"$resource\"\n" +
            "#EXT-X-KEY:METHOD=AES-128,URI=\"$resource\"\n#EXT-X-BYTERANGE:100@20\n#EXTINF:")
        val out = CanaryWire.media(input, base) { "/canary/resource?id=opaque" }
        assertEquals(3, Regex("/canary/resource").findAll(out).count())
        assertTrue(out.contains("#EXT-X-BYTERANGE:100@20"))
    }

    @Test fun mediaAcceptsPulseV1SegmentToken() {
        val v1 = "/seg/" + "A".repeat(180) + "_z"
        val input = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n$v1\n"
        val out = CanaryWire.media(input, base) { "/canary/resource?id=opaque" }
        assertTrue(out.contains("/canary/resource?id=opaque"))
    }

    @Test fun rejectsBypassMasterAndNonHls() {
        val variants = listOf(media.replace(resource, "https://other.invalid$resource"),
            media.replace(resource, "/seg/raw123"), media + "#EXT-X-STREAM-INF:BANDWIDTH=42\n",
            media + "#EXT-X-PART:URI=\"$resource\"\n", "{\"ok\":false}")
        variants.forEach { raw -> assertTrue(runCatching { CanaryWire.media(raw, base) { "/" } }.isFailure) }
    }

    @Test fun readsWithinLimitWithoutContentLength() {
        assertEquals("á", CanaryWire.readSmall("á".byteInputStream(), 2))
        assertTrue(runCatching { CanaryWire.readSmall("á".byteInputStream(), 1) }.isFailure)
    }
}
