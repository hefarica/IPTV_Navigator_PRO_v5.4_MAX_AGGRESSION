package dev.venice.ottshim

import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque

/** Measured QoE samples. No value is invented: every metric comes from bytes,
 *  segment timestamps, HTTP status or MediaSession position.
 *
 *  BG17 (t55) — contrato honesto tras los hallazgos BG12:
 *   · `rebuffer_source` sólo se declara `media_session_position_stall` si el detector de posición
 *     REAL está armado (≥2 muestras de posición). Si no, `unavailable:no_position_samples`.
 *   · `freeze_ms`/`rebuffer_count` los produce SÓLO el detector de posición; un error HTTP ya NO
 *     inventa 800 ms de freeze (era el bug de AbrPolicy.onUnderrun).
 *   · `transport_stall_suspected` sólo se emite como booleano si el proxy sirvió media para la
 *     sesión (`proxy_media_seen`); si el player va por fuera del proxy ⇒ `null` + source
 *     `unavailable:proxy_bypassed`.
 *   · `drain_ratio` ya no viaja como 0 falso: si no hay modelo real de drenaje va `null`
 *     (`unavailable:no_drain_model`); lo medido de verdad se publica como `throughput_utilisation`.
 *   · Cache: `cache_hits/misses/hit_ratio/miss_reason` viajan aquí (antes sólo en /health) y
 *     `miss_reason` separa `absent` (miss limpio) de `upstream_error` (fallo).
 *   · Buffer: `buffer_source`, `buffer_age_ms`, `buffer_stale` y `guard_state=PROXY_ONLY` explícitos;
 *     ninguna acción se dispara desde un buffer stale.
 */
class QoeEngine {
    private val lock = Any()
    private val samples = ArrayDeque<JSONObject>()
    private val bufferHistory = ArrayDeque<Pair<Long, Long>>()
    @Volatile var ewmaBps: Double = 0.0
    @Volatile var lastBps: Long = 0
    @Volatile var lastTtfbMs: Long = 0
    @Volatile var rebufferCount: Int = 0
    @Volatile var freezeMs: Long = 0
    @Volatile var httpErrors: Int = 0
    @Volatile var http4xx: Int = 0
    @Volatile var http5xx: Int = 0
    @Volatile var responses: Int = 0
    @Volatile var lastStatus: Int = 0
    @Volatile var lastError: String = ""
    @Volatile var segments: Int = 0
    @Volatile var lastSegmentAt: Long = 0
    @Volatile var lastStallAt: Long = 0
    @Volatile var sessionPresent: Boolean = false
    @Volatile var playerPackage: String = ""
    @Volatile var playerState: Int = -1
    @Volatile var positionMs: Long = 0
    @Volatile var bufferedPositionMs: Long = 0
    @Volatile var bufferAheadMs: Long = 0
    @Volatile var bufferValid: Boolean = false
    @Volatile var ttaMs: Long = Long.MAX_VALUE
    @Volatile var guardState: String = "PROXY_ONLY"
    @Volatile var guardActions: Long = 0L
    @Volatile var positionAt: Long = 0

    // ── Detector REAL de stall por posición (BG17) ───────────────────────────────
    /** nº de muestras de posición recibidas: <2 ⇒ el detector NO está armado. */
    @Volatile var positionSamples: Int = 0
    private var lastPosMs: Long = -1
    private var lastPosAt: Long = 0
    private var stallFrom: Long = 0
    /** duración del último episodio de stall detectado (ms), 0 si no hubo. */
    @Volatile var lastStallMs: Long = 0

    // ── Utilización medida (lo que antes se llamaba drain_ratio sin serlo) ──────
    @Volatile var throughputUtilisation: Double = -1.0
    @Volatile var utilisationAt: Long = 0

    // ── Cache (alimentado por LoopbackProxy) ────────────────────────────────────
    @Volatile var cacheHits: Long = 0
    @Volatile var cacheMisses: Long = 0
    @Volatile var missAbsent: Long = 0
    @Volatile var missUpstreamError: Long = 0
    @Volatile var mediaServed: Long = 0
    @Volatile var proxyRequests: Long = 0
    @Volatile var proxyLastRequestAt: Long = 0

    fun updateCache(hits: Long, misses: Long, absent: Long, upstreamError: Long, served: Long, requests: Long, lastRequestAt: Long) {
        cacheHits = hits
        cacheMisses = misses
        missAbsent = absent
        missUpstreamError = upstreamError
        mediaServed = served
        proxyRequests = requests
        proxyLastRequestAt = lastRequestAt
    }

    @Synchronized
    fun onSegment(s: SegmentStats, admittedBps: Long) {
        val bps = if (s.ms > 0) s.bytes * 8_000L / s.ms else 0L
        lastBps = bps
        lastTtfbMs = s.ttfbMs
        ewmaBps = if (ewmaBps == 0.0) bps.toDouble() else ewmaBps * 0.7 + bps * 0.3
        segments++
        lastSegmentAt = System.currentTimeMillis()
        val sample = JSONObject()
            .put("ts", System.currentTimeMillis())
            .put("url", s.url)
            .put("bytes", s.bytes)
            .put("duration_ms", s.ms)
            .put("ttfb_ms", s.ttfbMs)
            .put("bps", bps)
            .put("ewma_bps", ewmaBps.toLong())
            .put("admitted_bps", admittedBps)
            .put("status", "ok")
        synchronized(lock) {
            samples.addLast(sample)
            while (samples.size > 60) samples.removeFirst()
        }
    }

    /** Utilización medida: variante actual / throughput medido. NO es un "drain ratio". */
    fun updateThroughputUtilisation(currentVariantBps: Long, measuredBps: Long) {
        if (measuredBps > 0L && currentVariantBps > 0L) {
            throughputUtilisation = currentVariantBps.toDouble() / measuredBps
            utilisationAt = System.currentTimeMillis()
        } else {
            throughputUtilisation = -1.0
            utilisationAt = 0L
        }
    }

    /**
     * Muestra de posición del player (SessionTap la llama cada 200 ms).
     * Detecta stall REAL: estado PLAYING y posición que no avanza > [STALL_MS].
     */
    fun onSession(pkg: String, state: Int, position: Long, bufferedPosition: Long) {
        val now = System.currentTimeMillis()
        sessionPresent = true
        playerPackage = pkg
        playerState = state
        positionMs = position
        bufferedPositionMs = bufferedPosition
        positionSamples++
        // OTT can publish a stale bufferedPosition below the current position.
        // Do not turn that into a fake zero buffer.
        if (bufferedPosition >= position) {
            bufferAheadMs = bufferedPosition - position
            bufferValid = true
            positionAt = now
            bufferHistory.addLast(now to bufferAheadMs)
            while (bufferHistory.size > 20) bufferHistory.removeFirst()
            val first = bufferHistory.firstOrNull()
            val last = bufferHistory.lastOrNull()
            if (first != null && last != null && last.first > first.first) {
                val slope = (last.second - first.second).toDouble() / (last.first - first.first)
                ttaMs = if (slope < 0.0) (bufferAheadMs / -slope).toLong() else Long.MAX_VALUE
            }
        } else {
            bufferValid = false
            bufferAheadMs = 0
            bufferHistory.clear()
            ttaMs = Long.MAX_VALUE
            guardState = "PROXY_ONLY"
        }

        // ── Stall REAL por posición (sólo con PLAYING=3) ────────────────────────
        if (state == 3) {
            if (lastPosMs >= 0 && position <= lastPosMs) {
                // sin avance
                if (stallFrom == 0L) stallFrom = now
                val dur = now - stallFrom
                if (dur >= STALL_MS) {
                    lastStallAt = now
                    lastStallMs = dur
                }
            } else if (position > lastPosMs) {
                if (stallFrom != 0L) {
                    val dur = now - stallFrom
                    if (dur >= STALL_MS) {
                        // cierra episodio: un rebuffer medido, con su freeze real
                        rebufferCount++
                        freezeMs += dur
                        lastStallMs = dur
                        lastStallAt = now
                        Log.d("stall_closed freeze_ms=$dur count=$rebufferCount")
                        onStallClosed?.invoke(dur)
                    }
                    stallFrom = 0L
                }
            }
            lastPosMs = position
            lastPosAt = now
        } else {
            // pausa/buffer del player: no es un stall nuestro y no acumula freeze
            stallFrom = 0L
            lastPosMs = position
            lastPosAt = now
        }
    }

    /** Callback opcional para que el ABR reaccione a un stall MEDIDO (nunca a un error HTTP). */
    @Volatile var onStallClosed: ((Long) -> Unit)? = null

    fun onSessionLost() {
        sessionPresent = false
        playerPackage = ""
        playerState = -1
        positionMs = 0
        bufferedPositionMs = 0
        bufferAheadMs = 0
        bufferValid = false
        ttaMs = Long.MAX_VALUE
        guardState = "NO_SESSION"
        bufferHistory.clear()
        stallFrom = 0L
        lastPosMs = -1
        positionSamples = 0
    }

    fun onHttpStatus(code: Int) {
        responses++
        lastStatus = code
        if (code in 400..499) http4xx++
        if (code >= 500) http5xx++
    }

    fun onHttpError(code: Int, url: String) {
        httpErrors++
        lastError = "http_$code $url"
        Log.d(lastError)
    }

    /** El detector de posición está armado (≥2 muestras) ⇒ `rebuffer_source` es real. */
    fun positionDetectorArmed(): Boolean = positionSamples >= 2

    /** ¿El proxy sirvió media? Si no, cualquier diagnóstico de transporte es un no-medido. */
    fun proxyMediaSeen(): Boolean = mediaServed > 0

    fun snapshot(): String {
        val now = System.currentTimeMillis()
        val gap = if (lastSegmentAt > 0L) (now - lastSegmentAt).coerceAtLeast(0L) else 0L
        val armed = positionDetectorArmed()
        val stallMeasured = proxyMediaSeen() && sessionPresent
        // PlaybackState.STATE_PLAYING == 3; 2 is PAUSED, not playing.
        val transportStall: Any = if (stallMeasured) (playerState == 3 && gap > 5_000L) else JSONObject.NULL
        val cacheTotal = cacheHits + cacheMisses
        val hitRatio: Any = if (cacheTotal > 0) (cacheHits.toDouble() / cacheTotal) else JSONObject.NULL
        val bufferAge = if (positionAt > 0L) (now - positionAt).coerceAtLeast(0L) else -1L
        // BG22 (t60): mapeos PUROS extraídos a QoeSources y probados en JVM (incluye proxy_bypassed).
        val bufferStale: Any = QoeSources.bufferStale(sessionPresent, bufferAge) ?: JSONObject.NULL
        val tta: Any = QoeSources.ttaMs(bufferValid, ttaMs) ?: JSONObject.NULL
        val stallSource = QoeSources.transportStallSource(sessionPresent, proxyMediaSeen())
        return JSONObject()
        .put("segments", segments)
        .put("segment_gap_ms", gap)
        .put("transport_stall_suspected", transportStall)
        .put("transport_stall_source", stallSource)
        .put("proxy_media_seen", proxyMediaSeen())
        .put("last_bps", lastBps)
        .put("ewma_bps", ewmaBps.toLong())
        .put("last_ttfb_ms", lastTtfbMs)
        .put("rebuffer_count", rebufferCount)
        .put("freeze_ms", freezeMs)
        .put("freeze_source", if (armed) "measured:media_session_position_stall" else "unavailable:no_position_samples")
        .put("last_stall_ms", lastStallMs)
        .put("position_samples", positionSamples)
        .put("http_errors", httpErrors)
        .put("http_4xx", http4xx)
        .put("http_5xx", http5xx)
        .put("responses", responses)
        .put("last_status", lastStatus)
        .put("last_error", lastError)
        .put("last_stall_at", lastStallAt)
        .put("session_present", sessionPresent)
        .put("player_package", playerPackage)
        .put("player_state", playerState)
        .put("position_ms", positionMs)
        .put("buffered_position_ms", bufferedPositionMs)
        .put("buffer_ahead_ms", bufferAheadMs)
        .put("buffer_valid", bufferValid)
        .put("buffer_age_ms", bufferAge)
        .put("buffer_stale", bufferStale)
        .put("tta_ms", tta)
        .put("drain_ratio", JSONObject.NULL)
        .put("drain_ratio_source", "unavailable:no_drain_model")
        .put("throughput_utilisation", if (throughputUtilisation >= 0.0) throughputUtilisation else JSONObject.NULL)
        .put("throughput_utilisation_at", utilisationAt)
        .put("guard_state", guardState)
        .put("guard_note", "PROXY_ONLY: sin acción sobre el player; sólo se observa/limita el proxy")
        .put("guard_actions", guardActions)
        .put("guard_actions_source", "proxy_backoff: reducciones REALES del techo admitido (nunca acciones sobre el player)")
        .put("position_at", positionAt)
        .put("cache_hits", cacheHits)
        .put("cache_misses", cacheMisses)
        .put("cache_hit_ratio", hitRatio)
        .put("miss_reason", JSONObject()
            .put("absent", missAbsent)
            .put("upstream_error", missUpstreamError))
        .put("media_segments_served", mediaServed)
        .put("proxy_requests", proxyRequests)
        .put("proxy_last_request_at", proxyLastRequestAt)
        .put("proxy_up", ProxyService.running)
        .put("proxy_port", ProxyService.port)
        .put("proxy_restarts", ProxyService.restarts)
        .put("buffer_source", when {
            !sessionPresent -> "unavailable:no_media_session"
            bufferValid -> "media_session_buffered_position"
            else -> "stale:ott_buffered_position_below_position"
        })
        .put("rebuffer_source", if (armed) "measured:media_session_position_stall" else "unavailable:no_position_samples")
        .put("samples", JSONArray().also { arr ->
            synchronized(lock) { samples.forEach { arr.put(it) } }
        })
        .toString()
    }

    companion object {
        /** Un "no avance" de posición ≥ esto cuenta como episodio de stall medible. */
        const val STALL_MS = 1_500L
    }
}
