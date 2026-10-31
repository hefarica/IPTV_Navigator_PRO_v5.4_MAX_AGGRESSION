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
