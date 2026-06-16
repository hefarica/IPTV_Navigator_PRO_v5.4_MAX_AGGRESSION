package com.ape.crystalagent

import android.util.Log
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * iData → VPS ape-match.php → CARGA.
 *  - POST con body JSON (S10: NO GET → el iData no queda en logs de intermediarios).
 *  - Token en header Authorization: Bearer (nunca en URL).
 *  - OkHttp con ConnectionPool keep-alive (S8): UNA sola conexión TLS reutilizada entre zaps
 *    → no se paga el handshake TLS en cada zap.
 *  - Timeouts cortos (SLO <3s): connect 3s, read 4s.
 */
class MatchClient(private val cfg: Config) {

    private val client = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(4, 5, TimeUnit.MINUTES))
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .writeTimeout(3, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    fun match(real: RealDecode, esperado: JSONObject?, ch: String): Carga? {
        if (!cfg.hasToken()) { Log.w(TAG, "sin token — no provisionado"); return null }
        val body = JSONObject().apply {
            put("ch", ch)
            put("real", real.toJson())
            if (esperado != null) put("esperado", esperado)
        }
        val req = Request.Builder()
            .url("${cfg.vpsBase}/prisma/api/ape-match.php?device=${cfg.deviceId}")
            .addHeader("Authorization", "Bearer ${cfg.token}")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        return try {
            client.newCall(req).execute().use { r ->
                if (!r.isSuccessful) { Log.w(TAG, "MATCH http=${r.code}"); return null }
                Carga.parse(r.body?.string())
            }
        } catch (e: Exception) {
            Log.w(TAG, "MATCH err: ${e.message}"); null
        }
    }

    companion object { const val TAG = "ApeMatchClient" }
}
