package com.ape.crystalagent

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * SSE receiver against the real /ara/sse endpoint.
 * Auth token is supplied by a provider; it is never logged or hardcoded.
 */
class MetaReceiver(
    private val tokenProvider: () -> String?,
    private val onEvent: (JSONObject) -> Unit = { Log.d(TAG, "event: $it") },
    private val onError: (String) -> Unit = { Log.e(TAG, it) }
) {
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private var activeCall: Call? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var reconnectDelay = 1000L
    @Volatile private var stopped = false

    fun connect(baseUrl: String = "https://iptv-ape.duckdns.org") {
        val token = tokenProvider()
        if (token.isNullOrBlank()) {
            onError("token_no_disponible")
            return
        }
        val request = Request.Builder()
            .url("$baseUrl/ara/sse")
            .header("Authorization", "Bearer $token")
            .header("Accept", "text/event-stream")
            .build()
        activeCall = client.newCall(request)
        scope.launch {
            try {
                activeCall?.execute()?.use { response ->
                    if (!response.isSuccessful) {
                        onError("http_${response.code}")
                        return@use
                    }
                    reconnectDelay = 1000L
                    response.body?.source()?.use { source ->
                        var eventId: String? = null
                        val data = StringBuilder()
                        while (!stopped && isActive && !source.exhausted()) {
                            val line = source.readUtf8Line() ?: break
                            when {
                                line.startsWith("id:") -> eventId = line.substring(3).trim()
                                line.startsWith("data:") -> {
                                    if (data.isNotEmpty()) data.append('\n')
                                    data.append(line.substring(5).trim())
                                }
                                line.isEmpty() && data.isNotEmpty() -> {
                                    try {
                                        val json = JSONObject(data.toString())
                                        eventId?.let { json.put("_sse_id", it) }
                                        withContext(Dispatchers.Main) { onEvent(json) }
                                    } catch (e: JSONException) {
                                        onError("json_${e.message}")
                                    }
                                    data.clear()
                                    eventId = null
                                }
                            }
                        }
                    }
                }
            } catch (e: IOException) {
                if (e.message?.contains("Canceled") != true) onError("io_${e.message}")
            } finally {
                if (!stopped) {
                    delay(reconnectDelay.coerceAtMost(30_000L))
                    reconnectDelay = (reconnectDelay * 2).coerceAtMost(30_000L)
                    connect(baseUrl)
                }
            }
        }
    }

    fun disconnect() {
        stopped = true
        activeCall?.cancel()
        scope.cancel()
    }

    companion object { private const val TAG = "ARA-SSE" }
}
