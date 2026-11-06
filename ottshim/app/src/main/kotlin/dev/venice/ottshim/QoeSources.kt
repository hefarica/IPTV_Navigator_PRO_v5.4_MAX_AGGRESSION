package dev.venice.ottshim

/**
 * BG22 (t60) — mapeos PUROS (sin Android/org.json) de la nulabilidad y del origen del
 * diagnóstico de transporte. Vivir aparte permite EJECUTARLOS en JVM y probar los tres
 * estados, incluido `proxy_bypassed` (que en el device no siempre se puede provocar).
 */
object QoeSources {

    /** Origen honesto de `transport_stall_suspected`. */
    fun transportStallSource(sessionPresent: Boolean, proxyMediaSeen: Boolean): String = when {
        !sessionPresent -> "unavailable:no_session"
        !proxyMediaSeen -> "unavailable:proxy_bypassed"
        else -> "measured:proxy_segment_gap"
    }

    /** `buffer_stale`: null cuando no hay sesión/edad (desconocido), booleano cuando se puede medir. */
    fun bufferStale(sessionPresent: Boolean, bufferAgeMs: Long, thresholdMs: Long = 2_000L): Boolean? =
        if (!sessionPresent || bufferAgeMs < 0L) null else bufferAgeMs > thresholdMs

    /** `tta_ms`: null si no hay muestra válida (nunca Long.MAX_VALUE en el JSON). */
    fun ttaMs(bufferValid: Boolean, ttaMs: Long): Long? =
        if (bufferValid && ttaMs != Long.MAX_VALUE && ttaMs >= 0L) ttaMs else null
}
