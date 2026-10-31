package com.ape.crystalagent

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * SyncProtocol — contrato `/sync` D3 (v2) en Kotlin PURO (sin Android): canonicalización, HMAC-SHA256,
 * construcción del request y `state.apply` (ack D4). Se compila y se ejecuta también fuera del APK,
 * así el mismo código que firma en el device se puede probar con los vectores publicados.
 *
 * Canonical (idéntico a `ara-x/vps/client/ara_sync_client.js:126-158`):
 *   request  = "ARA-X-SYNC-V1\n" + device_id + "\n" + seq + "\n" + ts + "\n" + nonce + "\n" + sha256hex(rawBody)
 *   response = "ARA-X-SYNC-RESP-V1\n" + device_id + "\n" + reqSeq + "\n" + respTs + "\n" + sha256hex(rawBody)
 *   sig      = hex(hmac_sha256(secret, canonical))
 *
 * Honestidad: aquí NO hay secretos. El secret entra por parámetro (Config lo lee de
 * SharedPreferences/archivo provisionado). `state.apply` sólo se rellena con lo que de verdad se aplicó.
 */
object SyncProtocol {

    const val VERSION = 2
    const val REQ_PREFIX = "ARA-X-SYNC-V1"
    const val RESP_PREFIX = "ARA-X-SYNC-RESP-V1"
    const val APP = "ape-crystal-agent"
    const val UNMAPPED_SOC = "unknown"

    /** Centinela declarado por el catálogo D3 (`sync_features.json → artifact.unknown_sha256`). */
    const val UNKNOWN_SHA256 = "0000000000000000000000000000000000000000000000000000000000000000"

    /** SoC canónicos del gate (D4 §3 / sync_features.socs.canonical). */
    val CANON_SOCS = listOf("mt8696", "amlogic", "s905x4", "s905x3")

    /** Alias aceptados (idénticos al catálogo): cubre guion, underscore y nombres de familia. */
    val SOC_ALIASES: Map<String, String> = mapOf(
        "amlogic_s905x4" to "s905x4", "amlogic-s905x4" to "s905x4", "s905x4" to "s905x4",
        "amlogic_s905x3" to "s905x3", "amlogic-s905x3" to "s905x3", "s905x3" to "s905x3",
        "mt8696" to "mt8696", "mediatek_mt8696" to "mt8696", "mediatek-mt8696" to "mt8696",
        "firetv_mt8696" to "mt8696", "amlogic" to "amlogic"
    )

    /** Los 13 levers VPP de la allowlist existente (`actuator_allowlist.json → vpp_levers`). */
    val VPP_LEVERS: Set<String> = setOf(
        "pq_ai_sr_enable", "ai_sr_level", "ai_pq_mode", "aipq_enable",
        "pq_sharpness_enable", "pq_ai_dnr_enable", "pq_dnr_enable", "pq_nr_enable",
        "pq_ai_fbc_enable", "pq_hdr_enable", "pq_hdr_mode",
        "match_content_frame_rate", "minimal_post_processing_allowed"
    )

    /** Profundidad máxima del vector de features (catálogo: limits.max_features). */
    const val MAX_FEATURES = 40
    const val MAX_EVENTS = 8
    const val MAX_AGE_MS = 300_000L

    // ── SoC ──────────────────────────────────────────────────────────────────
    /** Devuelve el token canónico o null. Acepta mayúsculas, guion y underscore. */
    fun canonicalSoc(raw: String?): String? {
        val t = raw?.trim()?.lowercase() ?: return null
        if (t.isEmpty()) return null
        SOC_ALIASES[t]?.let { return it }
        val d = t.filter { it in 'a'..'z' || it in '0'..'9' }
        for ((alias, canon) in SOC_ALIASES) {
            if (alias.filter { it in 'a'..'z' || it in '0'..'9' } == d) return canon
        }
        return null
    }

    // ── Cripto ───────────────────────────────────────────────────────────────
    fun sha256Hex(s: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return hex(md.digest(s.toByteArray(Charsets.UTF_8)))
    }

    fun hmacHex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return hex(mac.doFinal(message.toByteArray(Charsets.UTF_8)))
    }

    private fun hex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            sb.append(HEX[v ushr 4]).append(HEX[v and 0x0F])
        }
        return sb.toString()
    }

    private val HEX = "0123456789abcdef".toCharArray()

    fun canonicalRequest(deviceId: String, seq: Long, ts: Long, nonce: String, bodyHash: String): String =
        listOf(REQ_PREFIX, deviceId, seq.toString(), ts.toString(), nonce, bodyHash).joinToString("\n")

    fun canonicalResponse(deviceId: String, reqSeq: Long, respTs: Long, bodyHash: String): String =
        listOf(RESP_PREFIX, deviceId, reqSeq.toString(), respTs.toString(), bodyHash).joinToString("\n")

    /** Comparación en tiempo constante (evita filtrar prefijos por timing). */
    fun constantTimeEquals(a: String?, b: String?): Boolean {
        if (a == null || b == null) return false
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }

    fun isNonce(s: String?): Boolean =
        s != null && s.length in 16..64 && s.all { it in '0'..'9' || it in 'a'..'f' }

    fun newNonce(): String {
        val raw = ByteArray(16)
        SecureRandom().nextBytes(raw)
        return hex(raw)
    }

    /** Sanea un token al charset del contrato `[A-Za-z0-9._-]` (device_id, soc_raw, list_version). */
    fun sanitizeToken(raw: String?, maxLen: Int, fallback: String): String {
        val t = (raw ?: "").trim()
        val clean = t.filter { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '.' || it == '_' || it == '-' }
        val cut = if (clean.length > maxLen) clean.substring(0, maxLen) else clean
        return if (cut.isEmpty()) fallback else cut
    }

    // ── Modelo de request ────────────────────────────────────────────────────
    data class FeatureSample(val value: Any?, val prov: String, val ageMs: Long?, val conf: Double?)

    data class SourceSample(
        val resolution: String, val codec: String, val fps: Double,
        val hdr: String, val prov: String, val ageMs: Long?
    )

    data class EventSample(val type: String, val code: String?, val prov: String, val ageMs: Long?)

    data class SyncRequestInput(
        val deviceId: String,
        val seq: Long,
        val ts: Long,
        val nonce: String,
        val appVersion: String,
        val androidSdk: Int,
        val player: String,
        val socRaw: String?,
        val refSha256: String,
        val refGenerationId: String,
        val refListVersion: String,
        val windowS: Int,
        val conf: Double?,
        val features: Map<String, FeatureSample>,
        val source: SourceSample,
        val activeProfile: String,
        val profileBlend: Map<String, Double>,
        val policyEtag: String?,
        val stateApply: Map<String, Any?>?,
        val events: List<EventSample>
    )

    /**
     * Construye el JSON del request (claves ordenadas, ASCII). Devuelve el cuerpo CRUDO: el llamador
     * lo firma tal cual (D3 firma el hash del body crudo, no re-serializa).
     */
    fun buildRequestJson(input: SyncRequestInput): String {
        val soc = canonicalSoc(input.socRaw)
        val socRawClean = sanitizeToken(input.socRaw, 64, "")
        val client = linkedMapOf<String, Any?>(
            "app" to APP,
            "version" to sanitizeToken(input.appVersion, 32, "unknown"),
            "soc" to (soc ?: UNMAPPED_SOC),
            "android" to input.androidSdk,
            "player" to input.player
        )
        if (soc == null || socRawClean != soc) {
            // D4-F10: un SoC no identificado viaja como unknown + soc_raw (nunca 400 silencioso).
            client["soc_raw"] = if (socRawClean.isEmpty()) "unknown" else socRawClean
        }

        val features = linkedMapOf<String, Any?>()
        for ((k, f) in input.features.toSortedMap()) {
            features[k] = linkedMapOf<String, Any?>(
                "value" to f.value,
                "prov" to f.prov,
                "age_ms" to f.ageMs,
                "conf" to f.conf
            )
        }

        val metrics = linkedMapOf<String, Any?>(
            "window_s" to input.windowS.coerceIn(10, 60),
            "conf" to input.conf,
            "features" to features,
            "source" to linkedMapOf<String, Any?>(
                "resolution" to input.source.resolution,
                "codec" to input.source.codec,
                "fps" to input.source.fps,
                "hdr" to input.source.hdr,
                "prov" to input.source.prov,
                "age_ms" to input.source.ageMs
            )
        )

        val state = linkedMapOf<String, Any?>(
            "active_profile" to input.activeProfile,
            "profile_blend" to input.profileBlend
        )
        if (input.policyEtag != null && input.policyEtag.startsWith("sha256:")) state["policy_etag"] = input.policyEtag
        if (input.stateApply != null) state["apply"] = input.stateApply

        val body = linkedMapOf<String, Any?>(
            "v" to VERSION,
            "type" to "ara_x_sync",
            "device_id" to sanitizeToken(input.deviceId, 128, "unknown"),
            "seq" to input.seq,
            "ts" to input.ts,
            "nonce" to input.nonce,
            "client" to client,
            "ref" to linkedMapOf<String, Any?>(
                "artifact_sha256" to if (input.refSha256.matches(Regex("^[a-f0-9]{64}$"))) input.refSha256 else UNKNOWN_SHA256,
                "generation_id" to sanitizeToken(input.refGenerationId, 64, "unknown"),
                "list_version" to sanitizeToken(input.refListVersion, 64, "unknown")
            ),
            "metrics" to metrics
        )
        if (input.events.isNotEmpty()) {
            body["events"] = input.events.take(MAX_EVENTS).map { ev ->
                linkedMapOf<String, Any?>(
                    "type" to ev.type,
                    "code" to ev.code,
                    "prov" to ev.prov,
                    "age_ms" to ev.ageMs
                ).filterValues { it != null }
            }
        }
        body["state"] = state
        return render(body)
    }

    /** `state.apply` (ack D4): sólo lo que de verdad se aplicó, con razón tipada. */
    fun buildStateApply(
        state: String,
        reason: String?,
        policyEtag: String?,
        socMeasured: String?,
        socCanonical: String?,
        socSource: String,
        socGate: String,
        thermalProv: String,
        thermalStatus: Int?,
        thermalSteps: Int,
        tier: String,
        cadence: Int?,
        appliedRows: List<String>,
        unchanged: Int,
        skipped: List<Pair<String, String>>,
        deferred: List<Pair<String, String>>
    ): Map<String, Any?> {
        val out = linkedMapOf<String, Any?>()
        out["st"] = state
        if (reason != null) out["rs"] = reason
        if (policyEtag != null) out["etag"] = policyEtag
        // El wire exige `soc.m` y `soc.c` CANÓNICOS (validateApply → ack_soc_m). El valor crudo no
        // cabe en el ack: su sitio es `client.soc_raw` del request (D4-F10).
        val canon = socCanonical ?: canonicalSoc(socMeasured) ?: UNMAPPED_SOC
        val src = if (socSource in setOf("Build.SOC_MODEL", "Build.HARDWARE")) socSource else "unknown"
        out["soc"] = linkedMapOf<String, Any?>(
            "m" to canon,
            "src" to src,
            "c" to canon,
            "g" to if (socGate == "allowlisted") "allowlisted" else "not_allowlisted"
        )
        out["th"] = linkedMapOf<String, Any?>(
            "prov" to thermalProv,
            "st" to thermalStatus,
            "steps" to thermalSteps.coerceIn(0, 6),
            "tier" to tier
        )
        if (cadence != null) out["cad"] = cadence
        out["ap"] = appliedRows.take(16)
        out["un"] = unchanged.coerceAtLeast(0)
        if (skipped.isNotEmpty()) out["sk"] = skipped.take(16).map { (k, r) -> linkedMapOf<String, Any?>("k" to k, "r" to r) }
        if (deferred.isNotEmpty()) out["df"] = deferred.take(16).map { (k, r) -> linkedMapOf<String, Any?>("k" to k, "r" to r) }
        return out
    }

    // ── JSON mínimo (sin org.json: este fichero se ejecuta también fuera de Android) ──
    private fun render(v: Any?): String = when (v) {
        null -> "null"
        is String -> quote(v)
        is Boolean -> if (v) "true" else "false"
        is Int -> v.toString()
        is Long -> v.toString()
        is Double -> if (v.isFinite()) (if (v == Math.rint(v)) v.toLong().toString() else v.toString()) else "null"
        is Map<*, *> -> v.entries
            .sortedBy { it.key.toString() }
            .joinToString(",", "{", "}") { quote(it.key.toString()) + ":" + render(it.value) }
        is Iterable<*> -> v.joinToString(",", "[", "]") { render(it) }
        else -> quote(v.toString())
    }

    private fun quote(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('"')
        for (ch in s) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch.code < 0x20) sb.append(String.format("\\u%04x", ch.code)) else sb.append(ch)
            }
        }
        sb.append('"')
        return sb.toString()
    }

    /**
     * Auto-check con los TRES vectores publicados en `ara-x/tests/sync_contract.test.js:160-187`.
     * Se llama al arrancar el servicio y el resultado se publica en `AraStatus.syncSelfCheck`.
     * "PASS" = este dispositivo firma exactamente como el contrato cuando el contrato es correcto.
     */
    fun selfCheck(): String {
        val secret = "ara-x-test-secret"
        val body = "{\"hello\":\"ara-x\"}"
        val bodyHash = sha256Hex(body)
        if (bodyHash != "b6779f1db95a683d9319f6729e4ca4032dbb55b229999b55e09d9c00245a4ea3") return "FAIL:sha256"
        val reqSig = hmacHex(secret, canonicalRequest("onn4k-001", 7L, 1700000000L, "abc123def4567890", bodyHash))
        if (reqSig != "0e5851ac8086b730f3cbd22d138ececaaebc140b8b4c6582c590c0b078ad68be") return "FAIL:req_sig"
        val respBodyHash = sha256Hex("{\"ok\":true}")
        val respSig = hmacHex(secret, canonicalResponse("onn4k-001", 7L, 1700000000L, respBodyHash))
        if (respSig != "2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17") return "FAIL:resp_sig"
        if (!constantTimeEquals(respSig, "2f00f129bb601a8a913db5bfae0d3e32fd2343141a7208b31500cf0e9b9ecf17")) return "FAIL:ct_equal"
        if (constantTimeEquals(respSig, respSig + "0")) return "FAIL:ct_length"
        if (constantTimeEquals(respSig, respSig.dropLast(1) + "0")) return "FAIL:ct_diff"
        if (canonicalSoc("amlogic-s905x4") != "s905x4") return "FAIL:soc_alias"
        if (canonicalSoc("rk3588") != null) return "FAIL:soc_unknown"
        val json = buildRequestJson(
            SyncRequestInput(
                deviceId = "onn4k-001", seq = 7L, ts = 1700000000L, nonce = "abc123def4567890",
                appVersion = "3.2.0-sync", androidSdk = 30, player = "exoplayer",
                socRaw = "amlogic_s905x4", refSha256 = UNKNOWN_SHA256,
                refGenerationId = "unknown", refListVersion = "unknown",
                windowS = 30, conf = 0.4,
                features = mapOf("pm_thermal_status" to FeatureSample(1, "measured_device", 0L, 0.9)),
                source = SourceSample("1920x1080", "hvc1.1.6.L120.B0", 25.0, "SDR", "measured_device", 0L),
                activeProfile = "P2", profileBlend = mapOf("P2" to 1.0),
                policyEtag = null, stateApply = null, events = emptyList()
            )
        )
        if (!json.contains("\"soc\":\"s905x4\"")) return "FAIL:request_soc"
        if (!json.contains("\"soc_raw\":\"amlogic_s905x4\"")) return "FAIL:request_soc_raw"
        if (json.contains("null,\"age_ms\":null")) return "FAIL:render_nulls"
        return "PASS"
    }
}
