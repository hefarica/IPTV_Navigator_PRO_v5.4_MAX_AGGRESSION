package com.ape.crystalagent

import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Round-trip iData (Motor 3 — ape-match.php).
 * VUELTA: {esperado (de la lista), real (del decoder)} → VPS.
 * IDA: carga {codec, tier, adb_settings} → se aplican vía onAdbSettings (SettingsApplier).
 * Se invoca cuando el player embebido (F3) reporta el codec/resolución real del MediaCodec.
 */
class IDataClient(private val cfg: Config) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()
    private val jsonMt = "application/json; charset=utf-8".toMediaType()

    suspend fun matchAndApply(
        expectedCodec: String,
        realCodec: String,
        resolution: String,
        onAdbSettings: (List<String>) -> Unit
    ) = withContext(Dispatchers.IO) {
        if (!cfg.hasToken()) return@withContext
        val payload = JSONObject()
            .put("device_id", cfg.deviceId)
            .put("expected", JSONObject().put("codec", expectedCodec))
            .put("real", JSONObject().put("codec", realCodec).put("resolution", resolution))
        try {
            val req = Request.Builder()
                .url("${cfg.vpsBase}/prisma/api/ape-match")
                .addHeader("Authorization", "Bearer ${cfg.token}")
                .post(payload.toString().toRequestBody(jsonMt))
                .build()
            client.newCall(req).execute().use { r ->
                if (!r.isSuccessful) { Log.w(TAG, "match http=${r.code}"); return@withContext }
                val body = r.body?.string() ?: return@withContext
                val obj = JSONObject(body)
                val arr = obj.optJSONArray("adb_settings") ?: return@withContext
                val list = ArrayList<String>(arr.length())
                for (i in 0 until arr.length()) list.add(arr.getString(i))
                onAdbSettings(list)
            }
        } catch (e: Exception) { Log.w(TAG, "match err: ${e.message}") }
    }

    companion object { const val TAG = "ApeIDataClient" }
}
