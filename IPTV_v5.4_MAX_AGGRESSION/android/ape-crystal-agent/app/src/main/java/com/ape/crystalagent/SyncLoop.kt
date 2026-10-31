package com.ape.crystalagent

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Random

/**
 * SyncLoop — el lazo `/sync` (30 s) que HOY NO EXISTE en el APK.
 *
 * Offline-first por diseño: el device aplica lo último bueno que tenga y, si `/sync` no está
 * (404), no responde (timeout) o rechaza (401/5xx), **sigue funcionando local**: no hay crash,
 * no se toca el playback y el estado se publica en [AraStatus].
 *
 * ── DEPLOY (lo que falta del lado VPS, fuera de este entregable) ─────────────────────────────
 * `POST https://<vps>/sync` **todavía devuelve 404**: el endpoint PHP y su snippet nginx están
 * *staged* en `ara-x/vps/` (D3). Hasta que se despliegue, este cliente sólo puede reportar
 * `endpoint_absent` y el device queda en modo local (que es el comportamiento correcto, no un bug).
 * Para que la adaptación remota sea REAL hacen falta, además (R3):
 *   · tablas `ara_sync_state` (seq/nonce/idempotencia) y `ara_sync_keys` (key_id + secret por device);
 *   · la key provisionada en el device (`/sdcard/ape/sync.key` o data dir) — sin ella el loop NO firma
 *     y se queda en `no_key` (no se inventa un secreto ni se manda una firma vacía);
 *   · `nginx -t` + reload en ventana y el canary `X-ARA-Sync-Mode: shadow` de D3.
 * Requisito de red: el endpoint es **HTTPS** (targetSdk 28 ⇒ cleartext bloqueado por defecto).
 *
 * Nunca lanza: cada ciclo está envuelto y cualquier Throwable se convierte en backoff.
 */
class SyncLoop(
    private val ctx: Context,
    private val cfg: Config,
    private val applier: SettingsApplier,
    private val store: SyncStore
) {
    private val sampler = DeviceSampler(ctx)
    private val client = SyncClient(cfg)
    private val rnd = Random()
    private var job: Job? = null

    @Volatile private var failures: Int = 0

    fun start(scope: CoroutineScope) {
        if (job != null) return
        job = scope.launch(Dispatchers.IO) {
            // [crashfix] selfCheck/sampler también pueden fallar: no deben matar el proceso.
            try {
                AraStatus.syncSelfCheck = SyncProtocol.selfCheck()
                Log.i(TAG, "sync self-check: ${AraStatus.syncSelfCheck} (contrato v${SyncProtocol.VERSION})")
                sampler.logOnce()
            } catch (t: Throwable) {
                Log.w(TAG, "self-check/sampler falló: ${t.javaClass.simpleName} — se continúa local")
                AraStatus.syncState = "error"
                AraStatus.syncReason = t.javaClass.simpleName
            }
            while (currentCoroutineContext().isActive) {
                val waitMs = try {
                    runOnce()
                } catch (t: Throwable) {
                    Log.w(TAG, "ciclo /sync falló (${t.javaClass.simpleName}) — se continúa local")
                    AraStatus.syncState = "error"
                    AraStatus.syncReason = t.javaClass.simpleName
                    backoffMs()
                }
                AraStatus.syncNextAt = System.currentTimeMillis() + waitMs
                delay(waitMs)
            }
        }
    }

    fun stop() { job?.cancel(); job = null }

    /** Un ciclo. Devuelve cuánto esperar antes del siguiente. */
    private fun runOnce(): Long {
        var waitMs: Long

        if (!cfg.syncEnabled) {
            AraStatus.syncState = "disabled"
            AraStatus.syncReason = "sync_enabled=false"
            return 60_000L
        }

        val secret = cfg.syncKeySecret
        if (secret.isEmpty()) {
            // Sin key provisionada no se inventa una firma: se queda local (y se dice).
            AraStatus.syncState = "no_key"
            AraStatus.syncReason = "sin sync.key provisionada"
            return 300_000L
        }

        val nowS = System.currentTimeMillis() / 1000L
        val seq = store.nextSeq()
        AraStatus.syncSeq = seq

        val canned = try { store.lastApply() } catch (e: Exception) { null }
        val input = SyncProtocol.SyncRequestInput(
            deviceId = cfg.deviceId,
            seq = seq,
            ts = nowS,
            nonce = SyncProtocol.newNonce(),
            appVersion = BuildConfig.VERSION_NAME,
            androidSdk = sampler.androidSdk(),
            player = "exoplayer",
            socRaw = sampler.socRaw(),
            refSha256 = SyncProtocol.UNKNOWN_SHA256,
            refGenerationId = "unknown",
            refListVersion = "unknown",
            windowS = 30,
            conf = sampler.conf(),
            features = sampler.features(),
            source = sampler.source(),
            activeProfile = store.profile(),
            profileBlend = blendToMap(store.blend()),
            policyEtag = store.etag().takeIf { it.startsWith("sha256:") },
            stateApply = if (canned != null) jsonToMap(canned) else null,
            events = thermalEvents()
        )

        val res = client.post(input, secret, cfg.syncKeyId, store.lastPolicySeq())
        AraStatus.syncHttp = res.http
        AraStatus.syncLastAt = System.currentTimeMillis()

        when (res.kind) {
            SyncClient.Kind.APPLIED -> {
                val p = res.policy
                if (p == null) {
                    AraStatus.syncState = "protocol"
                    AraStatus.syncReason = "policy_ausente"
                    return 60_000L
                }
                val report = applier.applyDetailed(res.rows)
                AraStatus.syncApplied = report.applied.size
                AraStatus.syncRejected = report.rejected.size
                AraStatus.lastSettings = res.rows
                AraStatus.syncEtag = p.etag
                AraStatus.syncProfile = p.profile
                AraStatus.syncState = if (report.rejected.isEmpty()) "applied" else "partial"
                AraStatus.syncReason = if (report.rejected.isEmpty()) "" else "rejected=${report.rejected.size}"

                store.savePolicy(res.rawBody, p.etag, p.seq, p.ts, p.validUntil, p.profile, p.blend, report.applied)
                // 4K-first: display.min_resolution y player.buffer_s del /sync al player.
                PlaybackPolicy.persist(ctx, p.minResolution, if (p.bufferS > 0) p.bufferS else null)
                val ack = buildAck(p, report, "applied", null)
                store.saveApply(ack)

                failures = 0
                AraStatus.syncFailures = 0
                waitMs = p.nextSyncS * 1000L
            }

            SyncClient.Kind.DENIED -> {
                // allowed=false: se aplican SÓLO las filas base (D4 §7) y se reporta la razón.
                val p = res.policy
                if (p == null) {
                    AraStatus.syncState = "protocol"
                    AraStatus.syncReason = "policy_ausente"
                    return 60_000L
                }
                val report = applier.applyDetailed(SyncStore.SAFE_ROWS)
                AraStatus.syncApplied = report.applied.size
                AraStatus.lastSettings = SyncStore.SAFE_ROWS
                AraStatus.syncState = "denied"
                AraStatus.syncReason = res.reason
                AraStatus.syncEtag = p.etag
                AraStatus.syncProfile = p.profile
                store.savePolicy(res.rawBody, p.etag, p.seq, p.ts, p.validUntil, p.profile, p.blend, report.applied)
                store.saveApply(buildAck(p, report, "denied", res.reason))
                failures = 0
                AraStatus.syncFailures = 0
                waitMs = p.nextSyncS * 1000L
            }

            SyncClient.Kind.NOT_MODIFIED -> {
                store.renew(nowS)
                AraStatus.syncState = "not_modified"
                AraStatus.syncReason = ""
                failures = 0
                AraStatus.syncFailures = 0
                waitMs = 30_000L
            }

            SyncClient.Kind.NOT_FOUND -> {
                // /sync todavía NO está desplegado: el device sigue local. No es un error del device.
                AraStatus.syncState = "endpoint_absent"
                AraStatus.syncReason = "sync 404 (endpoint staged)"
                waitMs = 120_000L
            }

            SyncClient.Kind.UNAUTHORIZED -> {
                AraStatus.syncState = "unauthorized"
                AraStatus.syncReason = "auth rechazada (key/secret)"
                waitMs = 300_000L
            }

            SyncClient.Kind.RATE_LIMITED -> {
                AraStatus.syncState = "rate_limited"
                AraStatus.syncReason = "429"
                waitMs = res.retryAfterMs ?: 60_000L
            }

            SyncClient.Kind.PROTOCOL -> {
                AraStatus.syncState = if (res.reason == "replay") "replay" else "protocol"
                AraStatus.syncReason = res.reason
                if (res.reason == "replay") store.resetSeq()      // una sola vez, como el protocolo
                waitMs = 60_000L
            }

            SyncClient.Kind.SERVER_ERROR, SyncClient.Kind.TRANSPORT, SyncClient.Kind.NO_KEY -> {
                AraStatus.syncState = if (res.kind == SyncClient.Kind.TRANSPORT) "offline" else "server_error"
                AraStatus.syncReason = res.reason
                failures += 1
                AraStatus.syncFailures = failures
                waitMs = res.retryAfterMs ?: backoffMs()
            }
        }
        return waitMs
    }

    /** Backoff exponencial 5 s → ×1.6 → cap 120 s, con jitter ±20 %. */
    private fun backoffMs(): Long {
        val base = minOf(120_000.0, 5_000.0 * Math.pow(1.6, (failures - 1).coerceAtLeast(0).toDouble()))
        val jitter = 0.8 + rnd.nextDouble() * 0.4
        return (base * jitter).toLong().coerceIn(2_000L, 120_000L)
    }

    private fun buildAck(
        p: SyncClient.Policy,
        report: SettingsApplier.ApplyReport,
        state: String,
        reason: String?
    ): JSONObject {
        val canonical = SyncProtocol.canonicalSoc(sampler.socRaw())
        val gate = if (canonical != null) "allowlisted" else "not_allowlisted"
        val cadence = lastFpsTarget()
        val map = SyncProtocol.buildStateApply(
            state = state,
            reason = reason,
            policyEtag = p.etag,
            socMeasured = sampler.socRaw(),
            socCanonical = canonical,
            socSource = sampler.socSource(),
            socGate = gate,
            thermalProv = sampler.thermalProv(),
            thermalStatus = sampler.thermalStatus(),
            thermalSteps = sampler.thermalStepsApplied(),
            tier = p.tier,
            cadence = cadence,
            appliedRows = report.applied,
            unchanged = 0,
            skipped = emptyList(),
            deferred = emptyList()
        )
        return JSONObject(map)
    }

    private fun lastFpsTarget(): Int? = null   // el APK no impone FPS objetivo (D5 lo decide y viaja en la política)

    /** Eventos: sólo cuando hay un disparador MEDIDO (térmico ≥ 3 = SEVERE). */
    private fun thermalEvents(): List<SyncProtocol.EventSample> {
        val st = sampler.thermalStatus() ?: return emptyList()
        if (st < 3) return emptyList()
        return listOf(
            SyncProtocol.EventSample(
                type = "thermal_event",
                code = "unknown",
                prov = "measured_device",
                ageMs = 0L
            )
        )
    }

    private fun blendToMap(blend: JSONObject): Map<String, Double> {
        val out = LinkedHashMap<String, Double>()
        for (k in blend.keys()) out[k] = blend.optDouble(k, 0.0)
        if (out.isEmpty()) out[SyncStore.SAFE_PROFILE] = 1.0
        return out
    }

    private fun jsonToMap(o: JSONObject): Map<String, Any?> = mapOf(
        "st" to o.optString("st", "noop"),
        "rs" to if (o.has("rs") && !o.isNull("rs")) o.optString("rs") else null,
        "etag" to if (o.has("etag")) o.optString("etag") else null,
        "ap" to (0 until (o.optJSONArray("ap")?.length() ?: 0)).map { o.optJSONArray("ap")!!.optString(it) },
        "un" to o.optInt("un", 0)
    )

    companion object { const val TAG = "ApeSyncLoop" }
}
