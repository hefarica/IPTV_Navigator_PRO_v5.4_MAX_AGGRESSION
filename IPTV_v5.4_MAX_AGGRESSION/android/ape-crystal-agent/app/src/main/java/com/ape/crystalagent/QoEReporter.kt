package com.ape.crystalagent

import android.content.Context
import android.media.MediaCodecList
import android.provider.Settings
import android.util.Log
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * VUELTA Camino 2 — sube QoE + heartbeats al VPS (conviva-event.php) → ara_heartbeats / conviva_events.
 * Equivalente nativo al logcat_loop + heartbeat del shell agent. NO usa READ_LOGS (no grantable):
 *  - heartbeat periódico (30s) con el estado del agente (liveness).
 *  - quality_change bajo demanda (cuando el applier recibe codec/resolución nueva).
 * Autopista: fire-and-forget; si el VPS cae, no afecta la reproducción.
 */
class QoEReporter(private val ctx: Context, private val cfg: Config) {

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
                    val caps = JSONObject()
                        .put("soc", socName())
                        // [2.3.0] soc_8k ya NO repite la identidad del SoC. S905Y4 es 4K.
                        .put("soc_8k", "")
                        // Fase A: SOLO nombres (sin valores) para que el VPS filtre.
                        .put("names", inventoryNames())
                    postEvent("heartbeat", JSONObject()
                        .put("state", "HEALTHY")
                        .put("ara_version", "apk-kotlin-2.3.0")
                        .put("player", "ExoPlayer")
                        .put("caps", caps))
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
                .put("player", "ExoPlayer"))
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

    private fun socName(): String {
        return try {
            if (android.os.Build.VERSION.SDK_INT >= 31 && android.os.Build.SOC_MODEL.isNotBlank()) {
                android.os.Build.SOC_MODEL.trim()
            } else {
                android.os.Build.HARDWARE.trim()
            }
        } catch (e: Exception) { "" }
    }

    /** Fase A: nombres de settings + getprop, deduplicados y ordenados. NUNCA valores. */
    private fun inventoryNames(): JSONObject {
        val out = JSONObject()
        try { out.put("global", JSONArray(settingsNames(Settings.Global.CONTENT_URI))) } catch (e: Exception) {}
        try { out.put("system", JSONArray(settingsNames(Settings.System.CONTENT_URI))) } catch (e: Exception) {}
        try { out.put("secure", JSONArray(settingsNames(Settings.Secure.CONTENT_URI))) } catch (e: Exception) {}
        try {
            val p = Runtime.getRuntime().exec(arrayOf("getprop"))
            val names = ArrayList<String>()
            BufferedReader(InputStreamReader(p.inputStream)).useLines { lines ->
                lines.forEach { ln ->
                    val m = Regex("^\\[([^]]+)\\]").find(ln)
                    if (m != null) names.add(m.groupValues[1])
                }
            }
            p.waitFor()
            out.put("props", JSONArray(names.distinct().sorted()))
        } catch (e: Exception) { Log.w(TAG, "getprop names: ${e.message}") }
        // [2.3.0] display/HDR modes y códecs: nombres, sin capturar pantalla.
        try {
            val wm = ctx.getSystemService(WindowManager::class.java)
            val d = wm?.defaultDisplay
            val modes = d?.supportedModes?.map {
                "${it.modeId}:${it.physicalWidth}x${it.physicalHeight}@${"%.2f".format(it.refreshRate)}"
            } ?: emptyList()
            out.put("display_modes", JSONArray(modes))
            out.put("hdr_types", JSONArray(d?.hdrCapabilities?.supportedHdrTypes?.toList() ?: emptyList<Int>()))
        } catch (e: Exception) { Log.w(TAG, "display scan: ${e.message}") }
        try {
            val names = ArrayList<String>()
            val types = ArrayList<String>()
            for (ci in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
                if (ci.isEncoder) continue
                val ts = ci.supportedTypes.filter { it.startsWith("video/") }
                if (ts.isEmpty()) continue
                names.add(ci.name)
                types.addAll(ts)
            }
            out.put("codec_names", JSONArray(names.distinct().sorted()))
            out.put("codec_types", JSONArray(types.distinct().sorted()))
        } catch (e: Exception) { Log.w(TAG, "codec scan: ${e.message}") }
        return out
    }

    private fun settingsNames(uri: android.net.Uri): List<String> {
        val out = ArrayList<String>()
        try {
            ctx.contentResolver.query(uri, arrayOf(Settings.NameValueTable.NAME), null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    val n = c.getString(0)
                    if (!n.isNullOrBlank()) out.add(n)
                }
            }
        } catch (e: Exception) { Log.w(TAG, "settings names $uri: ${e.message}") }
        return out.distinct().sorted()
    }

    private fun postEvent(eventType: String, data: JSONObject) {
        if (!cfg.hasToken()) return
        val payload = JSONObject()
            .put("version", "1.0")                       // F3 2026-06-19: server exige "1.0" (era "1.1" -> 400)
            .put("session_id", "apk-${cfg.deviceId}")
            .put("device_id", cfg.deviceId)
            .put("player", "ExoPlayer")                  // F3: en VALID_PLAYERS (el APK usa ExoPlayer/media3); era "crystalagent-kotlin" -> 400
            .put("channel", JSONObject().put("id", "auto").put("name", "auto"))  // F3: server exige channel.name no vacío
            .put("event_type", eventType)
            .put("timestamp_ms", System.currentTimeMillis())
            .put("data", data)
        val req = Request.Builder()
            .url("${cfg.vpsBase}/prisma/api/conviva-event.php")
            .addHeader("Authorization", "Bearer ${cfg.token}")
            .post(payload.toString().toRequestBody(jsonMt))
            .build()
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) {
                Log.w(TAG, "QoE $eventType http=${r.code}")
            } else {
                if (eventType == "heartbeat") {
                    AraStatus.lastHeartbeatAt = System.currentTimeMillis()
                } else {
                    Unit
                }
            }
        }
    }

    companion object { const val TAG = "ApeQoEReporter" }
}
