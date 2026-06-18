package com.ape.crystalagent

import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * VUELTA Camino 2 — sube QoE + heartbeats al VPS (conviva-event.php) → ara_heartbeats / conviva_events.
 * Equivalente nativo al logcat_loop + heartbeat del shell agent. NO usa READ_LOGS (no grantable):
 *  - heartbeat periódico (30s) con el estado del agente (liveness).
 *  - quality_change bajo demanda (cuando el applier recibe codec/resolución nueva).
 * Autopista: fire-and-forget; si el VPS cae, no afecta la reproducción.
 */
class QoEReporter(private val cfg: Config) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val jsonMt = "application/json; charset=utf-8".toMediaType()
    @Volatile private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job?.cancel()
        job = scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    postEvent("heartbeat", JSONObject().put("state", "HEALTHY").put("ara_version", "apk-kotlin-2.0"))
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { Log.w(TAG, "heartbeat err: ${e.message}") }
                delay(30_000L)
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    /** Reporta cambio de calidad (codec/resolución) — fire-and-forget. */
    fun reportQualityChange(codec: String, resolution: String, bitrateKbps: Int = 0) {
        try {
            postEvent("quality_change", JSONObject()
                .put("codec", codec)
                .put("resolution", resolution)
                .put("bitrate_kbps", bitrateKbps)
                .put("player", "crystalagent-kotlin"))
        } catch (e: Exception) { Log.w(TAG, "quality_change err: ${e.message}") }
    }

    /** Reporta al VPS qué motores UltraEnhance negoció este device (telemetría de capacidades). */
    fun reportCapabilities(levels: UltraEnhancePipeline.EnhanceLevelSet) {
        try {
            postEvent("device_capabilities", JSONObject()
                .put("artifact_removal", levels.artifactRemoval)
                .put("super_resolution", levels.superResolution.name)
                .put("frame_interp", levels.frameInterp.name)
                .put("glsl", levels.glslShaders)
                .put("media_enhance_api", levels.mediaEnhanceApi))
        } catch (e: Exception) { Log.w(TAG, "capabilities err: ${e.message}") }
    }

    private fun postEvent(eventType: String, data: JSONObject) {
        if (!cfg.hasToken()) return
        val payload = JSONObject()
            .put("version", "1.1")
            .put("session_id", "apk-${cfg.deviceId}")
            .put("device_id", cfg.deviceId)
            .put("player", "crystalagent-kotlin")
            .put("channel", JSONObject().put("id", "auto"))
            .put("event_type", eventType)
            .put("timestamp_ms", System.currentTimeMillis())
            .put("data", data)
        val req = Request.Builder()
            .url("${cfg.vpsBase}/prisma/api/conviva-event")
            .addHeader("Authorization", "Bearer ${cfg.token}")
            .post(payload.toString().toRequestBody(jsonMt))
            .build()
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) Log.w(TAG, "QoE $eventType http=${r.code}")
        }
    }

    companion object { const val TAG = "ApeQoEReporter" }
}
