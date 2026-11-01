package com.ape.crystalagent

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/** Publishes the real classifier state to /ara/state; never invents confidence. */
object StatePublisher {
    private const val TAG = "ARA-State"
    private val client = OkHttpClient()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    @Volatile private var lastAt = 0L

    fun publish(
        ctx: Context,
        kind: String,
        luma: Double,
        lap: Double,
        motion: Double,
        frames: Long,
        frameGapMs: Long,
        fps: Double,
        freezeMs: Long,
        stalls: Long
    ) {
        val now = System.currentTimeMillis()
        if (now - lastAt < 500L) return
        lastAt = now
        // HARDENING: /ara/state uses its own SSE token; never the Bearer event token.
        val cfg = Config(ctx)
        val token = runCatching { cfg.stateToken }.getOrDefault("")
        if (token.isBlank()) return
        val body = JSONObject()
            .put("device_id", AraDeviceId.get(ctx))
            .put("channel_id", AraStatus.currentChannelId)
            .put("presets", org.json.JSONArray().put("CAPTURE-$kind"))
            .put("levers", JSONObject())
            .put("flags", JSONObject()
                .put("source", "ara_classifier")
                .put("kind", kind)
                .put("luma", luma)
                .put("lap", lap)
                .put("motion", motion)
                .put("frames", frames)
                .put("frame_gap_ms", frameGapMs)
                .put("fps", fps)
                .put("freeze_ms", freezeMs)
                .put("stalls", stalls)
                .put("capture_at", System.currentTimeMillis())
                .put("zap_at", AraStatus.lastZapAt)
                .put("fallback_chain", AraStatus.lastFallbackChain))
            .toString()
        val req = Request.Builder()
            .url(cfg.vpsBase + Config.PATH_STATE)
            .header("Authorization", "Bearer $token")
            .post(body.toRequestBody(jsonType))
            .build()
        client.newCall(req).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                Log.w(TAG, "publish failed: ${e.message}")
            }
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                response.use {
                    if (!it.isSuccessful) Log.w(TAG, "publish http=${it.code}")
                    else Log.i(TAG, "published kind=$kind frames=$frames")
                }
            }
        })
    }
}
