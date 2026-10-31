package com.ape.crystalagent

import android.content.Context
import android.util.Log
import java.io.File

/**
 * I14 — production SSE command bridge.
 * MetaReceiver -> MetaMapper -> FluidStore/ApePlayer; no test activity required.
 */
object AraCommandBridge {
    private const val TAG = "ARA-Bridge"
    private var receiver: MetaReceiver? = null

    @Synchronized
    fun start(ctx: Context) {
        if (receiver != null) return
        val token = readToken(ctx)
        if (token.isBlank()) {
            Log.w(TAG, "sse_token ausente; SSE no iniciado")
            return
        }
        val mapper = MetaMapper(ctx)
        receiver = MetaReceiver(
            tokenProvider = { readToken(ctx) },
            onEvent = { json ->
                AraStatus.lastSseAt = System.currentTimeMillis()
                AraStatus.lastDirective = json
                val applied = mapper.apply(json)
                AraStatus.lastApplied = applied
                Log.i(TAG, "sse event applied=$applied type=${json.optString("delta_type")}")
            },
            onError = { Log.w(TAG, "sse $it") }
        ).also { it.connect(deviceId = AraDeviceId.get(ctx)) }
    }

    @Synchronized
    fun stop() {
        receiver?.disconnect()
        receiver = null
    }

    private fun readToken(ctx: Context): String = runCatching {
        val private = File(ctx.getExternalFilesDir(null), "sse_token")
        val internal = File(ctx.filesDir, "sse_token")
        when {
            private.isFile -> private.readText()
            internal.isFile -> internal.readText()
            else -> ""
        }.trim()
    }.getOrDefault("")
}
