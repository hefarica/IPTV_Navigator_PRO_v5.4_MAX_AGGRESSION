package com.ape.crystalagent

import org.json.JSONObject

/**
 * Estado compartido para el panel del ARA. Solo memoria del proceso; no es telemetría inventada.
 * Lo llenan AgentService/FeedForwardClient, QoEReporter, SettingsApplier y ApePlayer.
 */
object AraStatus {
    @Volatile var serviceRunning: Boolean = false
    @Volatile var lastHeartbeatAt: Long = 0L
    @Volatile var lastSseAt: Long = 0L
    @Volatile var lastSettings: List<String> = emptyList()
    @Volatile var lastDirective: JSONObject? = null
    @Volatile var vppAllowed: Boolean? = null
    @Volatile var vppReason: String = ""
    @Volatile var lastApplied: Int = 0
    @Volatile var lastRejected: Int = 0
    @Volatile var lastTrack: String = ""
    @Volatile var playerActive: Boolean = false

    // ── /sync (D3) ────────────────────────────────────────────────────────────
    /** idle | disabled | no_key | applied | partial | denied | not_modified | endpoint_absent | unauthorized | rate_limited | protocol | replay | offline | server_error | error */
    @Volatile var syncState: String = "idle"
    @Volatile var syncReason: String = ""
    @Volatile var syncLastAt: Long = 0L
    @Volatile var syncNextAt: Long = 0L
    @Volatile var syncHttp: Int = 0
    @Volatile var syncSeq: Long = 0L
    @Volatile var syncEtag: String = ""
    @Volatile var syncProfile: String = ""
    @Volatile var syncApplied: Int = 0
    @Volatile var syncRejected: Int = 0
    @Volatile var syncFailures: Int = 0
    @Volatile var syncSelfCheck: String = ""

    // ── Track del player (lo llena ApePlayer; lo usa el sampler de /sync) ─────
    @Volatile var trackCodec: String = ""
    @Volatile var trackW: Int = 0
    @Volatile var trackH: Int = 0
    @Volatile var trackFps: Float = 0f
    @Volatile var trackBitrate: Int = 0
    @Volatile var trackHdr: String = "SDR"
    @Volatile var trackDropped: Long = 0L
    @Volatile var trackRendered: Long = 0L
    /** true sólo si el contador viene de un `AnalyticsListener` real (si no, el feature es `unavailable`). */
    @Volatile var trackDroppedValid: Boolean = false
    @Volatile var trackAt: Long = 0L
    @Volatile var playerBufferMs: Long? = null
    @Volatile var playerBufferAt: Long = 0L

    // ── Salida 4K / presentación ─────────────────────────────────────────────
    @Volatile var display4k: Boolean? = null
    @Volatile var displayMode: String = ""

    // ── Homologación de presets de lista ─────────────────────────────────────
    @Volatile var lastPresetCount: Int = 0
    @Volatile var lastPresetLocal: Int = 0
    @Volatile var lastPresetUnknown: Int = 0
    @Volatile var lastPresetAndroid: Int = 0
    @Volatile var lastPresetApplyMs: Long = -1
    @Volatile var lastPresetP50: Long = -1
    @Volatile var lastPresetP95: Long = -1
    @Volatile var lastPresetP99: Long = -1
    @Volatile var lastPresetMax: Long = -1

    fun ageMs(ts: Long, now: Long = System.currentTimeMillis()): Long =
        if (ts <= 0L) Long.MAX_VALUE else (now - ts).coerceAtLeast(0L)

    fun ageLabel(ts: Long): String {
        val a = ageMs(ts)
        if (a == Long.MAX_VALUE) return "sin datos"
        val s = a / 1000
        return when {
            s < 60 -> "hace ${s}s"
            s < 3600 -> "hace ${s / 60}m"
            else -> "hace ${s / 3600}h"
        }
    }
}
