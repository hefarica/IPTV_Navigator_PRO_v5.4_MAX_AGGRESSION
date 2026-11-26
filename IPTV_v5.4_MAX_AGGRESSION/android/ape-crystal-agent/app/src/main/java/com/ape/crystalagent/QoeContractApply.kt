package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore
import dev.venice.ottshim.QoeContractTap

/**
 * QoeContractApply — APLICACIÓN del contrato QoE (`#EXT-X-APE-QOE-CONTRACT`) en la APK.
 *
 * QUÉ HACE, EN DOS MOMENTOS QUE NO SE PUEDEN CONFUNDIR
 *
 *  A) **Settings allowlisted** (late, idempotente): [applyPending] lee la decisión vigente del
 *     shim ([QoeContractTap.decision]) y escribe `match_content_frame_rate` /
 *     `minimal_post_processing_allowed` por el ÚNICO camino de escritura que existe
 *     ([SettingsApplier.applyDetailed] → allowlist + regex + get-antes-de-put + KeyGuard).
 *     Lo llama [AgentService] periódicamente. No toca la reproducción: sólo settings.
 *
 *  B) **Buffer / LoadControl** (temprano, UNA vez por apertura): [applyBufferBeforeBuild]
 *     tiene que correr ANTES de `ApePlayer.build()` (`PlayerActivity.kt:50-51`). El
 *     LoadControl es INMUTABLE una vez construido (`FluidBridge.java:99-110`), así que
 *     cambiar ms después de `build()` o reconstruir el player a mitad de sesión es INVÁLIDO:
 *     no se intenta aquí y se declara.
 *
 * TRUTH-GUARDS
 *  · `EXECUTED` sólo con recibo real: fila en el `applied` del applier **y** relectura igual
 *    ([SettingsApplier.isSetTo]). El cálculo vive en el núcleo puro [QoeContractPlan.receipt].
 *  · `ott.hw`/`ott.hc` no son settings de Android → preferencias del player, DECLARED.
 *  · `ott.buf` describe el buffer de **OTT Navigator**, que el APK NO puede escribir: para OTT
 *    Navigator es DECLARED. Lo que sí se aplica es la caché del **player propio** (`cache_mib`),
 *    y sólo si SUBE (escalera neutra) — ver [QoeContractPlan.bufferDecision].
 *  · Nunca se aplica un contrato caducado ([MAX_AGE_MS]) ni uno de un canal que ya no es el
 *    servido: si el shim sirvió un cuerpo SIN tag, su decisión se limpia y aquí no hay nada.
 *
 * APAGADO LÓGICO (rollback sin reinstalar): pref `qoe_apply=0` en `ape_shimott`.
 * Con `0` no se escribe ni settings ni buffer; la app se comporta como antes de esta clase.
 */
object QoeContractApply {

    private const val TAG = "ApeQoeContract"
    private const val PREFS = "ape_shimott"
    private const val PREF_ON = "qoe_apply"
    private const val PREF_BUFFER_MB = "ott_buffer_mb"

    /** Un contrato más viejo que esto no se aplica: describe otro momento del canal. */
    const val MAX_AGE_MS = 120_000L

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Kill switch. Default 1 (encendido); `0` = apagado lógico sin reinstalar. */
    fun enabled(ctx: Context): Boolean = runCatching { prefs(ctx).getInt(PREF_ON, 1) == 1 }.getOrDefault(true)

    // ─────────────────────── A) settings allowlisted ───────────────────────

    /**
     * Aplica el contrato vigente del shim. Idempotente: [SettingsApplier] deduplica por valor
     * ya escrito, así que llamarlo cada 10 s no reescribe nada.
     *
     * Devuelve el recibo (una línea) para logcat y diagnóstico. Nunca lanza.
     */
    fun applyPending(ctx: Context, applier: SettingsApplier): String {
        return try {
            if (!enabled(ctx)) return "qoe_apply=0 (apagado logico: no se escribe nada)"
            val d = QoeContractTap.decision()
                ?: return "sin contrato vigente (el shim no ha leido tag en el canal servido)"
            val snap = QoeContractTap.snapshot()
            val age = System.currentTimeMillis() - snap.at
            if (age > MAX_AGE_MS) {
                return "contrato caducado (${age}ms > ${MAX_AGE_MS}ms): no se aplica"
            }

            val plan = QoeContractPlan.plan(d.ch, d.knobs.map { it.name to it.requested })
            // Puerta 1 (declarativa): la allowlist decide ANTES de escribir. Puerta 2: applyDetailed.
            val allowed = plan.rows.filter { SettingsApplier.allowsRow(it.wire()) }
            val outOfAllowlist = plan.rows.size - allowed.size
            val report = if (allowed.isEmpty()) SettingsApplier.ApplyReport(emptyList(), emptyList())
            else applier.applyDetailed(allowed.map { it.wire() })

            // El recibo se calcula con el resultado REAL + relectura del setting.
            val lines = QoeContractPlan.receipt(
                plan,
                report.applied.toSet(),
                { row -> applier.isSetTo(row.key, row.value) }
            )
            // `ott.hw`/`ott.hc`: no son settings; se guardan como preferencias del player.
            val storedPrefs = storePrefs(ctx, plan.prefs)

            val detail = buildString {
                append("ch=").append(d.ch ?: "?")
                append(' ').append(QoeContractPlan.describe(lines))
                if (outOfAllowlist > 0) append(" fueraAllowlist=").append(outOfAllowlist)
                if (storedPrefs > 0) append(" prefs=").append(storedPrefs).append("(sin clave Android)")
                append(" truth=").append(d.truth ?: "ausente")
            }
            AraStatus.qoeContract = detail
            AraStatus.qoeContractAt = System.currentTimeMillis()
            Log.i(TAG, "QOE_CONTRACT $detail")
            detail
        } catch (t: Throwable) {
            val msg = "excepcion ${t.javaClass.simpleName}: ${t.message}"
            Log.w(TAG, msg)
            AraStatus.qoeContract = msg
            msg
        }
    }

    private fun storePrefs(ctx: Context, prefs: Map<String, String>): Int {
        if (prefs.isEmpty()) return 0
        return try {
            val ed = prefs(ctx).edit()
            for ((k, v) in prefs) ed.putString(k, v)
            ed.putLong("qoe_at", System.currentTimeMillis())
            ed.apply()
            prefs.size
        } catch (t: Throwable) {
            Log.w(TAG, "prefs no escritas: ${t.message}")
            0
        }
    }

    // ───────────────────── B) buffer antes de build() ─────────────────────

    /**
     * Presupuesto de buffer del canal, decidido ANTES de `ApePlayer.build()`.
     *
     * Se llama desde `PlayerActivity` justo antes de construir el player: es el ÚNICO punto en
     * el que el valor aún llega al LoadControl (`PlaybackPolicy.fromSync` → `FluidBridge`).
     * Escalera NEUTRA: sólo sube; nunca baja continuidad.
     *
     * Devuelve el recibo. Nunca lanza.
     */
    fun applyBufferBeforeBuild(ctx: Context): String {
        return try {
            if (!enabled(ctx)) return "buffer: qoe_apply=0 (apagado logico)"
            val requested = prefs(ctx).getString(PREF_BUFFER_MB, null)
                ?.trim()?.toDoubleOrNull()?.let { Math.round(it).toInt() }
            val current = PlaybackPolicy.fromSync(ctx).cacheMiB
            val b = QoeContractPlan.bufferDecision(requested, current)
            if (b.action != QoeContractPlan.Action.SET) {
                val msg = "buffer: ${b.action.name} actual=${b.current}MiB pedido=${requested ?: "—"} — ${b.reason}"
                Log.i(TAG, msg)
                return msg
            }
            val sp = FluidStore.prefs(ctx)
            sp.edit().putInt(PlaybackPolicy.PREF_CACHE, b.target).apply()
            val back = sp.getInt(PlaybackPolicy.PREF_CACHE, -1)
            val msg = if (back == b.target) {
                AraStatus.qoeContract = "buffer EXECUTED→${b.target}MiB (OTT Navigator: DECLARED, no escribible por el APK)"
                AraStatus.qoeContractAt = System.currentTimeMillis()
                "buffer: EXECUTED ${b.current}→$back MiB (releido) · OTT Navigator DECLARED — ${b.reason}"
            } else {
                "buffer: REJECTED relectura=$back != ${b.target} (no se declara aplicado)"
            }
            Log.i(TAG, "QOE_BUFFER $msg")
            msg
        } catch (t: Throwable) {
            val msg = "buffer: excepcion ${t.javaClass.simpleName}: ${t.message}"
            Log.w(TAG, msg)
            msg
        }
    }
}
