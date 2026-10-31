package com.ape.crystalagent

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * SyncClient — transporte y validación del canal de control `/sync` (D3 v2, staged en el VPS).
 *
 * Hace SOLO dos cosas: firmar/enviar el request y validar la respuesta. **No aplica** nada: eso lo
 * decide [SyncLoop]. Cualquier fallo se devuelve como [Result] tipado; nunca lanza al llamador.
 *
 * Seguridad: el `secret` llega por parámetro (nunca se loguea). La respuesta se verifica con
 * `ARA-X-SYNC-RESP-V1` antes de mirarla. Sin firma válida ⇒ `PROTOCOL` y no se aplica nada.
 */
class SyncClient(private val cfg: Config) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)     // el backoff lo gobierna SyncLoop
        .build()

    enum class Kind { APPLIED, DENIED, NOT_MODIFIED, UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, SERVER_ERROR, TRANSPORT, PROTOCOL, NO_KEY }

    /** Política ya validada (fail-closed: si algo no cuadra, no hay Policy). */
    data class Policy(
        val deviceId: String,
        val seq: Long,
        val ts: Long,
        val validUntil: Long,
        val etag: String,
        val profile: String,
        val blend: JSONObject,
        val allowed: Boolean,
        val soc: String,
        val levers: Map<String, Int>,
        val tier: String,
        val nextSyncS: Int,
        val minResolution: String = "",
        val bufferS: Int = 0
    )

    data class Result(
        val kind: Kind,
        val http: Int = 0,
        val reason: String = "",
        val retryAfterMs: Long? = null,
        val policy: Policy? = null,
        val rows: List<String> = emptyList(),
        val rawBody: String = "",
        val reqSeq: Long = 0L
    )

    /**
     * POST /sync firmado.
     * @param secret HMAC secret del device (Config). Si vacío ⇒ NO_KEY (no se envía nada).
     */
    fun post(input: SyncProtocol.SyncRequestInput, secret: String, keyId: String, lastPolicySeq: Long = 0L): Result {
        if (secret.isEmpty()) return Result(Kind.NO_KEY, reason = "sin_secret")
        if (input.deviceId.isBlank()) return Result(Kind.PROTOCOL, reason = "sin_device_id")

        val rawBody = SyncProtocol.buildRequestJson(input)
        val bodyHash = SyncProtocol.sha256Hex(rawBody)
        val canonical = SyncProtocol.canonicalRequest(input.deviceId, input.seq, input.ts, input.nonce, bodyHash)
        val sig = SyncProtocol.hmacHex(secret, canonical)

        val url = cfg.vpsBase + "/sync"
        val req = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-ARA-Sync-Version", SyncProtocol.VERSION.toString())
            .addHeader("X-ARA-Key-Id", keyId.ifBlank { "k1" })
            .addHeader("X-ARA-Sig", sig)
            .post(rawBody.toRequestBody(JSON_MEDIA))
            .build()

        val resp: Response = try {
            http.newCall(req).execute()
        } catch (e: Exception) {
            Log.w(TAG, "POST /sync fallo de transporte: ${e.javaClass.simpleName}")
            return Result(Kind.TRANSPORT, reason = e.javaClass.simpleName, reqSeq = input.seq)
        }

        try {
            val code = resp.code
            val retryAfter = parseRetryAfter(resp.header("Retry-After"))
            when {
                code == 204 -> return Result(Kind.NOT_MODIFIED, http = code, reason = "not_modified", reqSeq = input.seq)
                code == 401 || code == 403 -> return Result(Kind.UNAUTHORIZED, http = code, reason = "auth_$code", reqSeq = input.seq)
                code == 404 -> return Result(Kind.NOT_FOUND, http = code, reason = "endpoint_absent", reqSeq = input.seq)
                code == 409 -> return Result(Kind.PROTOCOL, http = code, reason = "replay", reqSeq = input.seq)
                code == 429 -> return Result(Kind.RATE_LIMITED, http = code, reason = "rate_limited", retryAfterMs = retryAfter, reqSeq = input.seq)
                code == 413 -> return Result(Kind.PROTOCOL, http = code, reason = "body_too_large", reqSeq = input.seq)
                code >= 500 -> return Result(Kind.SERVER_ERROR, http = code, reason = "server_$code", retryAfterMs = retryAfter, reqSeq = input.seq)
                code !in 200..299 -> return Result(Kind.PROTOCOL, http = code, reason = "http_$code", reqSeq = input.seq)
            }

            val body = resp.body?.string() ?: ""
            if (body.isEmpty()) return Result(Kind.PROTOCOL, http = code, reason = "empty_body", reqSeq = input.seq)

            val sigHeader = resp.header("X-ARA-Sig") ?: ""
            val parsed = try { JSONObject(body) } catch (e: Exception) {
                return Result(Kind.PROTOCOL, http = code, reason = "json_invalid", reqSeq = input.seq)
            }
            val respTs = parsed.optLong("ts", 0L)
            val expected = SyncProtocol.hmacHex(
                secret,
                SyncProtocol.canonicalResponse(input.deviceId, input.seq, respTs, SyncProtocol.sha256Hex(body))
            )
            if (!SyncProtocol.constantTimeEquals(sigHeader.lowercase(), expected)) {
                Log.w(TAG, "respuesta /sync SIN firma válida (no se aplica)")
                return Result(Kind.PROTOCOL, http = code, reason = "bad_signature", reqSeq = input.seq)
            }

            val checked = validatePolicy(parsed, cfg.deviceId, input.seq, nowS(), socCanonical = input.socRaw, lastPolicySeq = lastPolicySeq)
            val pol = checked.first
            if (pol == null) {
                return Result(Kind.PROTOCOL, http = code, reason = checked.third ?: "policy_invalid", rawBody = body, reqSeq = input.seq)
            }
            return Result(
                kind = if (pol.allowed) Kind.APPLIED else Kind.DENIED,
                http = code,
                reason = if (pol.allowed) "" else "device_not_allowed",
                policy = pol,
                rows = checked.second,
                rawBody = body,
                reqSeq = input.seq
            )
        } catch (e: Exception) {
            Log.w(TAG, "error procesando respuesta /sync: ${e.javaClass.simpleName}")
            return Result(Kind.PROTOCOL, reason = "parse_" + e.javaClass.simpleName, reqSeq = input.seq)
        } finally {
            try { resp.close() } catch (e: Exception) { /* no-op */ }
        }
    }

    /**
     * Valida la política recibida (fail-closed) y compone las filas `device_settings`.
     * @return Triple(policy, rows, errorReason): si policy==null, errorReason dice por qué.
     */
    private fun validatePolicy(
        p: JSONObject,
        deviceId: String,
        reqSeq: Long,
        nowS: Long,
        socCanonical: String?,
        lastPolicySeq: Long
    ): Triple<Policy?, List<String>, String?> {
        if (p.optInt("v", -1) != SyncProtocol.VERSION) return Triple(null, emptyList(), "policy_version")
        if (p.optString("type") != "ara_x_policy") return Triple(null, emptyList(), "policy_type")
        if (p.optString("device_id") != deviceId) return Triple(null, emptyList(), "policy_device")

        // Fail-closed de identidad: sin SoC canónico medido no se aplica NADA (D4 §3).
        if (socCanonical == null) return Triple(null, emptyList(), "soc_unmapped")

        val seq = p.optLong("seq", -1L)
        if (seq < 1L) return Triple(null, emptyList(), "policy_seq")
        if (lastPolicySeq > 0L && seq <= lastPolicySeq) return Triple(null, emptyList(), "policy_replay")
        val ts = p.optLong("ts", 0L)
        if (ts < 1L || Math.abs(nowS - ts) > TS_SKEW_S) return Triple(null, emptyList(), "policy_ts")
        val validUntil = p.optLong("valid_until", 0L)
        if (validUntil <= ts || validUntil - ts > MAX_TTL_S) return Triple(null, emptyList(), "policy_ttl")
        if (nowS >= validUntil) return Triple(null, emptyList(), "policy_expired")

        val etag = p.optString("policy_etag", "")
        if (!etag.matches(Regex("^sha256:[a-f0-9]{64}$"))) return Triple(null, emptyList(), "policy_etag")

        val profileObj = p.optJSONObject("profile") ?: return Triple(null, emptyList(), "profile_missing")
        val active = profileObj.optString("active", "")
        if (active !in PROFILE_KEYS) return Triple(null, emptyList(), "profile_active")
        val blend = profileObj.optJSONObject("blend") ?: return Triple(null, emptyList(), "profile_blend")
        var sum = 0.0
        for (k in blend.keys()) {
            if (k !in PROFILE_KEYS) return Triple(null, emptyList(), "profile_blend_key")
            sum += blend.optDouble(k, 0.0)
        }
        if (Math.abs(sum - 1.0) > 1e-6) return Triple(null, emptyList(), "profile_blend_sum")

        val device = p.optJSONObject("device") ?: return Triple(null, emptyList(), "device_missing")
        val allowed = device.optBoolean("allowed", false)
        val policySoc = SyncProtocol.canonicalSoc(device.optString("soc", "")) ?: return Triple(null, emptyList(), "device_soc")
        if (socCanonical != null && policySoc != socCanonical) return Triple(null, emptyList(), "soc_mismatch")

        val thermalTarget = device.optDouble("thermal_target_c", -1.0)
        if (thermalTarget < 55.0 || thermalTarget > 85.0) return Triple(null, emptyList(), "thermal_target")

        val display = p.optJSONObject("display") ?: return Triple(null, emptyList(), "display_missing")
        if (display.optBoolean("never_downscale", false) != true) return Triple(null, emptyList(), "never_downscale")
        if (display.optString("wire_resolution", "") == "7680x4320") return Triple(null, emptyList(), "wire_8k")
        if (display.optString("eight_k", "") == "native") return Triple(null, emptyList(), "eight_k_native")
        // Player 4K-first: min_resolution y buffer_s se aplican al player (PlaybackPolicy).
        val minResolution = display.optString("min_resolution", "")
        if (minResolution.isNotBlank() && PlaybackPolicy.parseResolution(minResolution) == null)
            return Triple(null, emptyList(), "display_min_resolution")
        val bufferS = p.optJSONObject("player")?.optInt("buffer_s", 0) ?: 0
        if (bufferS != 0 && (bufferS < 5 || bufferS > 300)) return Triple(null, emptyList(), "player_buffer_s")

        val tier = p.optJSONObject("processing")?.optString("tier", "") ?: return Triple(null, emptyList(), "processing_missing")
        if (tier !in TIERS) return Triple(null, emptyList(), "processing_tier")

        val nextS = p.optJSONObject("controls")?.optInt("sync_next_s", 30) ?: 30
        val nextSyncS = nextS.coerceIn(10, 120)

        val leversObj = device.optJSONObject("levers") ?: JSONObject()
        val levers = LinkedHashMap<String, Int>()
        for (key in leversObj.keys()) {
            // Fail-closed D4: UNA clave fuera de la allowlist invalida la política entera.
            if (key !in SyncProtocol.VPP_LEVERS) return Triple(null, emptyList(), "lever_not_allowlisted")
            val v = leversObj.optInt(key, Int.MIN_VALUE)
            if (v == Int.MIN_VALUE) return Triple(null, emptyList(), "lever_not_int")
            levers[key] = v.coerceIn(-1000, 1000)
        }

        val rows = buildRows(levers)
        val policy = Policy(
            deviceId = deviceId, seq = seq, ts = ts, validUntil = validUntil, etag = etag,
            profile = active, blend = blend, allowed = allowed, soc = policySoc,
            levers = levers, tier = tier, nextSyncS = nextSyncS,
            minResolution = minResolution, bufferS = bufferS
        )
        return Triple(policy, rows, null)
    }

    /** Filas `device_settings`: 3 base (D4) + levers, SIN duplicar claves y sólo con levers allowlisted. */
    private fun buildRows(levers: Map<String, Int>): List<String> {
        val out = LinkedHashMap<String, String>()
        for (base in SyncStore.SAFE_ROWS) {
            val parts = base.split(" ")
            if (parts.size == 3) out[parts[1]] = base
        }
        for ((k, v) in levers) {
            if (k !in SyncProtocol.VPP_LEVERS) continue
            out[k] = "global $k $v"
        }
        return out.values.toList()
    }

    private fun parseRetryAfter(h: String?): Long? {
        if (h.isNullOrBlank()) return null
        val secs = h.trim().toLongOrNull() ?: return null
        return (secs * 1000L).coerceIn(0L, 600_000L)
    }

    private fun nowS(): Long = System.currentTimeMillis() / 1000L

    companion object {
        const val TAG = "ApeSyncClient"
        const val TS_SKEW_S = 300L
        const val MAX_TTL_S = 120L
        val PROFILE_KEYS = listOf("P0", "P1", "P2", "P3", "P4", "P5")
        val TIERS = listOf("minimal", "balanced", "quality", "max_image")
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
