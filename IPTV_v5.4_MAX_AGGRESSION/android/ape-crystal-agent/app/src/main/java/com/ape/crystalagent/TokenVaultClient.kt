package com.ape.crystalagent

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * VPS-backed encrypted token vault.
 *
 * Auth is ALWAYS the event Bearer (never the state token). The server stores
 * AES-256-GCM ciphertext and returns only over TLS. This is a recovery copy,
 * not a replacement for the private local files.
 */
object TokenVaultClient {
    private const val TAG = "ARA-Vault"
    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()

    private fun url(cfg: Config): String {
        val device = URLEncoder.encode(cfg.deviceId, "UTF-8")
        return cfg.vpsBase + Config.PATH_VAULT + "?device_id=" + device
    }

    /** Upload both scoped tokens; no-op if either is absent. */
    fun backup(cfg: Config) {
        val event = cfg.eventToken.trim()
        val state = cfg.stateToken.trim()
        if (event.isBlank() || state.isBlank()) return
        runCatching {
            val body = JSONObject()
                .put("event_token", event)
                .put("state_token", state)
                .toString()
            val req = Request.Builder()
                .url(url(cfg))
                .header("Authorization", "Bearer $event")
                .post(body.toRequestBody(json))
                .build()
            client.newCall(req).execute().use { r ->
                if (r.isSuccessful) Log.i(TAG, "backup ok")
                else Log.w(TAG, "backup http=${r.code}")
            }
        }.onFailure { Log.w(TAG, "backup transport=${it.javaClass.simpleName}") }
    }

    /** Restore only the missing state token; never overwrites a local credential. */
    fun restoreIfMissing(cfg: Config) {
        if (cfg.stateToken.isNotBlank()) return
        val event = cfg.eventToken.trim()
        if (event.isBlank()) return
        runCatching {
            val req = Request.Builder()
                .url(url(cfg))
                .header("Authorization", "Bearer $event")
                .get()
                .build()
            client.newCall(req).execute().use { r ->
                if (!r.isSuccessful) {
                    Log.w(TAG, "restore http=${r.code}")
                    return
                }
                val body = r.body?.string() ?: return
                val obj = JSONObject(body)
                val state = obj.optString("state_token", "").trim()
                if (state.isNotBlank() && state != cfg.eventToken) {
                    cfg.setStateToken(state)
                    Log.i(TAG, "restore state ok")
                }
            }
        }.onFailure { Log.w(TAG, "restore transport=${it.javaClass.simpleName}") }
    }
}
