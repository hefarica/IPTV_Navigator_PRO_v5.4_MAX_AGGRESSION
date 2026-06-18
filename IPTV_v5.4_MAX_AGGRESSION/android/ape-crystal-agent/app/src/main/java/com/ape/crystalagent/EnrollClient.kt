package com.ape.crystalagent

import android.content.Context
import android.os.Build
import android.util.Log
import com.wireguard.crypto.KeyPair
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Auto-enrolamiento WireGuard (F1).
 * Genera el keypair (privada en Secure/keystore), POST /ara/enroll con el secreto baked + pubkey,
 * y guarda el config WG devuelto por el VPS (IP 10.200.0.x, server pubkey, endpoint, dns, allowed-ips).
 * Idempotente: si ya hay enrolamiento en cache, lo devuelve sin re-enrolar.
 */
class EnrollClient(ctx: Context, private val cfg: Config) {

    private val sec = Secure(ctx)
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()
    private val jsonMt = "application/json; charset=utf-8".toMediaType()

    data class WgConfig(
        val assignedIp: String,
        val serverPubKey: String,
        val endpoint: String,
        val dns: String,
        val allowedIps: String,
        val privateKey: String
    )

    /** Devuelve el WgConfig (cache si ya enrolado, o enrolando contra el VPS). null si falla. */
    fun ensureEnrolled(): WgConfig? {
        cachedConfig()?.let { return it }

        val kp = KeyPair()
        val priv = kp.privateKey.toBase64()
        val pub = kp.publicKey.toBase64()
        val payload = JSONObject()
            .put("secret", BuildConfig.ENROLL_SECRET)
            .put("device_pubkey", pub)
            .put("device_id", cfg.deviceId)
            .put("model", Build.MODEL ?: "")

        return try {
            val req = Request.Builder()
                .url("${cfg.vpsBase}/ara/enroll")
                .post(payload.toString().toRequestBody(jsonMt))
                .build()
            client.newCall(req).execute().use { r ->
                if (!r.isSuccessful) { Log.w(TAG, "enroll http=${r.code}"); return null }
                val o = JSONObject(r.body?.string() ?: return null)
                if (!o.optBoolean("ok", false)) { Log.w(TAG, "enroll !ok: ${o.optString("error")}"); return null }
                val wc = WgConfig(
                    assignedIp = o.getString("assigned_ip"),
                    serverPubKey = o.getString("server_pubkey"),
                    endpoint = o.getString("endpoint"),
                    dns = o.optString("dns", "10.200.0.1"),
                    allowedIps = o.optString("allowed_ips", "0.0.0.0/0"),
                    privateKey = priv
                )
                sec.put("wg_private", priv)
                sec.put("wg_assigned_ip", wc.assignedIp)
                sec.put("wg_server_pub", wc.serverPubKey)
                sec.put("wg_endpoint", wc.endpoint)
                sec.put("wg_dns", wc.dns)
                sec.put("wg_allowed", wc.allowedIps)
                Log.i(TAG, "enrolado ip=${wc.assignedIp} endpoint=${wc.endpoint}")
                wc
            }
        } catch (e: Exception) { Log.w(TAG, "enroll err: ${e.message}"); null }
    }

    fun isEnrolled(): Boolean = sec.has("wg_assigned_ip") && sec.has("wg_private")

    private fun cachedConfig(): WgConfig? {
        val ip = sec.get("wg_assigned_ip") ?: return null
        val priv = sec.get("wg_private") ?: return null
        return WgConfig(
            ip,
            sec.get("wg_server_pub") ?: return null,
            sec.get("wg_endpoint") ?: return null,
            sec.get("wg_dns") ?: "10.200.0.1",
            sec.get("wg_allowed") ?: "0.0.0.0/0",
            priv
        )
    }

    companion object {
        const val TAG = "ApeEnroll"
        // Secreto de enrolamiento BAKED (decisión del propietario), inyectado en BUILD-TIME vía
        // BuildConfig.ENROLL_SECRET (app/build.gradle.kts ← local.properties `ape.enroll.secret` / env
        // APE_ENROLL_SECRET). DEBE coincidir con env[APE_ENROLL_SECRET] del pool php-fpm del VPS; si no →
        // /ara/enroll devuelve 401 BAD_SECRET. Rotable en el VPS (revoca enrols nuevos). El repo NUNCA
        // contiene el valor (S10 — anti-leak en git history).
    }
}
