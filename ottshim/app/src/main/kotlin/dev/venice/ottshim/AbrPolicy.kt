package dev.venice.ottshim

class AbrPolicy {
    @Volatile var ceilingBps: Long = 6_000_000
    @Volatile var maxBwAdmitted: Long = Long.MAX_VALUE
    @Volatile var userAgent: String? = null
    @Volatile var sourceUrl: String? = null
    @Volatile var pinMode: Int = 1
    @Volatile var emergencyUntil: Long = 0L
    @Volatile var currentVariantBps: Long = 0L

    val meter = SegmentMeter()
    val qoe = QoeEngine()

    fun admits(bw: Long): Boolean = bw <= 0L || bw <= maxBwAdmitted

    @Synchronized
    fun onSegment(s: SegmentStats) {
        val bps = s.bytes * 8_000L / maxOf(s.ms, 1L)
        val targetBps = (bps * 0.82).toLong()
        ceilingBps = targetBps / 8L
        maxBwAdmitted = targetBps
        // BG17: lo que antes se publicaba como "drain_ratio" es utilización medida
        // (variante actual / throughput real). El drain ratio real no existe ⇒ null en /metrics.
        qoe.updateThroughputUtilisation(currentVariantBps, bps)
        qoe.onSegment(s, maxBwAdmitted)
        Log.d("policy bps=$bps ceiling=$ceilingBps maxbw=$maxBwAdmitted t1=${s.firstByteUs}ns t2=${s.endUs}ns")
    }

    /**
     * Error HTTP ⇒ backoff de ABR (comportamiento de producto) y contador http_*.
     * BG17: YA NO inventa `freeze_ms`/`rebuffer_count` — eso sólo lo produce el detector real
     * de posición (QoeEngine.onSession). Antes se sumaban 800 ms ficticios por cada 4xx/5xx.
     */
    fun onHttpError(code: Int, url: String) {
        qoe.onHttpError(code, url)
        onUnderrun()
    }

    /** Backoff de emergencia del techo admitido (no toca métricas de QoE de rebuffer/freeze). */
    fun onUnderrun() {
        emergencyUntil = System.currentTimeMillis() + 30_000L
        val current = maxBwAdmitted
        maxBwAdmitted = if (current == Long.MAX_VALUE) 1_500_000L
        else (current * 7L / 10L).coerceAtLeast(300_000L)
        ceilingBps = maxBwAdmitted / 8L
        // BG20 (t58): `guard_actions` cuenta ACCIONES REALES del guard (backoff del techo en el
        // proxy). Antes era un contador muerto a 0 junto a guard_state=PROXY_ONLY.
        qoe.guardActions++
        Log.d("underrun -> maxbw=$maxBwAdmitted guard_actions=${qoe.guardActions}")
    }

    fun forceCeiling(kbps: Long) {
        ceilingBps = kbps * 1_000L / 8L
        maxBwAdmitted = kbps * 1_000L
    }
}
