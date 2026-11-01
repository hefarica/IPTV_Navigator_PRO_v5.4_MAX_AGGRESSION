package com.ape.crystalagent

import android.content.Context
import android.util.Log

/**
 * I14 — production SSE command bridge.
 * MetaReceiver -> MetaMapper -> FluidStore/ApePlayer; no test activity required.
 */
object AraCommandBridge {
    private const val TAG = "ARA-Bridge"
    private var receiver: MetaReceiver? = null
    @Volatile private var lastWakeAt = 0L

    @Synchronized
    fun start(ctx: Context) {
        if (receiver != null) return
        val cfg = Config(ctx)
        if (cfg.eventToken.isBlank()) {
            Log.w(TAG, "event token ausente; /ara/events no iniciado")
            return
        }
        val mapper = MetaMapper(ctx)
        receiver = MetaReceiver(
            tokenProvider = { Config(ctx).eventToken },
            onEvent = { json ->
                AraStatus.lastSseAt = System.currentTimeMillis()
                AraStatus.lastDirective = json
                val device = json.optString("device_id")
                if (device.isNotEmpty() && device != AraDeviceId.get(ctx)) {
                    return@MetaReceiver
                }
                if (json.optString("delta_type") == "ara.wake") {
                    val wakeAt = json.optLong("wake_at", 0L)
                    val now = System.currentTimeMillis()
                    if (wakeAt <= 0L || now - wakeAt > 300_000L || now - lastWakeAt < 10_000L) {
                        return@MetaReceiver
                    }
                    lastWakeAt = now
                    Log.i(TAG, "wake event: restoring AgentService + watchdog")
                    AgentService.start(ctx)
                    CaptureWatchdogService.start(ctx)
                } else {
                    val applied = mapper.apply(json)
                    AraStatus.lastApplied = applied
                    Log.i(TAG, "event applied=$applied type=${json.optString("delta_type")}")
                }
            },
            onError = { Log.w(TAG, "events $it") }
        ).also { it.connect(baseUrl = cfg.vpsBase, deviceId = AraDeviceId.get(ctx)) }
    }

    @Synchronized
    fun stop() {
        receiver?.disconnect()
        receiver = null
    }
}
