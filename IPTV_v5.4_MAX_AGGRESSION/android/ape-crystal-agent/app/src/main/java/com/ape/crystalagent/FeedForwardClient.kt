package com.ape.crystalagent

import android.util.Log
import kotlinx.coroutines.*
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Consumidor del bus URL-2 en STREAMING (ape-feedforward-stream.php, SSE) — DEVICE-KEYED.
 *
 * El daemon NO observa nada: se suscribe SOLO por device-id. El VPS —que ya proxea el tráfico
 * del device por el DNS-hijack— sabe qué canal/decode real está jugando y le manda los
 * device_settings ya computados. Aplicador puro: por cada 'event: presets' invoca onDeviceSettings().
 *
 * Robustez (audit): cancela el Call de OkHttp en stop() (readUtf8Line con readTimeout=0 no se
 * desbloquea solo); reconexión con backoff exponencial; si el VPS falla, no afecta la reproducción.
 * Seguridad: token en Authorization: Bearer; en la URL solo va el device-id.
 */
class FeedForwardClient(private val cfg: Config) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)      // stream infinito; el server lo acota (dur)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile private var job: Job? = null
    @Volatile private var activeCall: Call? = null

    fun start(scope: CoroutineScope, onDeviceSettings: (List<String>, JSONObject) -> Unit) {
        job?.cancel()
        job = scope.launch(Dispatchers.IO) {
            var backoff = 1500L
            while (isActive) {
                try { runStream(onDeviceSettings); backoff = 1500L }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { Log.w(TAG, "SSE err: ${e.message}"); backoff = (backoff * 2).coerceAtMost(30_000L) }
                if (!isActive) break
                delay(backoff)
            }
        }
    }

    fun stop() { activeCall?.cancel(); job?.cancel(); job = null }

    private fun runStream(onDeviceSettings: (List<String>, JSONObject) -> Unit) {
        if (!cfg.hasToken()) { Log.w(TAG, "sin token — no provisionado"); Thread.sleep(5000); return }
        val url = "${cfg.vpsBase}/prisma/api/ape-feedforward-stream.php?device=${enc(cfg.deviceId)}&iv=3&dur=110"
        val req = Request.Builder().url(url)
            .addHeader("Authorization", "Bearer ${cfg.token}")
            .addHeader("Accept", "text/event-stream")
            .build()
        val call = client.newCall(req); activeCall = call
        call.execute().use { r ->
            if (!r.isSuccessful) { Log.w(TAG, "SSE http=${r.code}"); Thread.sleep(2000); return }
            val src = r.body?.source() ?: return
            var event = ""
            val data = StringBuilder()
            while (job?.isActive == true && !call.isCanceled()) {
                val line = src.readUtf8Line() ?: break          // EOF (server cerró por dur) → reconecta
                when {
                    line.startsWith("event:") -> event = line.substring(6).trim()
                    line.startsWith("data:")  -> data.append(line.substring(5).trim())
                    line.isEmpty() -> {                          // línea en blanco = fin de evento SSE
                        if (event == "presets" && data.isNotEmpty()) {
                            try {
                                val obj = JSONObject(data.toString())
                                val arr: JSONArray? = obj.optJSONArray("device_settings")
                                val list = ArrayList<String>(arr?.length() ?: 0)
                                if (arr != null) for (i in 0 until arr.length()) list.add(arr.getString(i))
                                onDeviceSettings(list, obj)
                            } catch (e: Exception) { Log.w(TAG, "parse: ${e.message}") }
                        }
                        event = ""; data.setLength(0)
                    }
                }
            }
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    companion object { const val TAG = "ApeFeedForward" }
}
