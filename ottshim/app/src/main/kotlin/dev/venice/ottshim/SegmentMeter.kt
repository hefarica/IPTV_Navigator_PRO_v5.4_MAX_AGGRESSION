package dev.venice.ottshim

class SegmentStats(
    val url: String,
    val bytes: Int,
    val startUs: Long,
    val firstByteUs: Long,
    val endUs: Long
) {
    /** nanoTime is nanoseconds despite the historical Us suffix. */
    val ms: Long get() = ((endUs - startUs) / 1_000_000L).coerceAtLeast(0L)
    val ttfbMs: Long get() = ((firstByteUs - startUs) / 1_000_000L).coerceAtLeast(0L)
}

class SegmentMeter {
    fun begin(url: String) = Sample(url)

    inner class Sample(private val url: String) {
        private val startUs = System.nanoTime()
        private var firstByteUs = 0L
        private var bytes = 0

        fun firstByteIfNeeded() {
            if (firstByteUs == 0L) firstByteUs = System.nanoTime()
        }

        fun add(count: Int) {
            bytes += count
        }

        fun end() = Unit

        fun stats(): SegmentStats {
            val end = System.nanoTime()
            return SegmentStats(
                url,
                bytes,
                startUs,
                if (firstByteUs == 0L) end else firstByteUs,
                end
            )
        }
    }
}
