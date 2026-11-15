package com.ape.crystalagent

import android.content.Context
import android.util.Log
import dev.venice.ottshim.ShimOttTap
import java.util.concurrent.ConcurrentHashMap

/**
 * ExtShimOttBridge — el consumidor del tag `#EXTSHIMOTT` dentro de la APK.
 *
 * CADENA COMPLETA (y quién hace qué)
 *   1. El shim LEE el texto de la playlist y extrae cada línea `#EXTSHIMOTT:{json}`
 *      ([dev.venice.ottshim.ShimOttTap]). No interpreta nada.
 *   2. Este objeto PARSEA el payload con el parser del contrato ([ExtShimOttParser]),
 *      el mismo que valida `tools/quality/validate_extshimott.js` desde el lado Node.
 *   3. El shim DECIDE el routing por `tgt` (su [ShimOttTap.routeOf]) y nos dice si hay
 *      que aplicar. Si `tgt` no existe, no se aplica nada.
 *   4. Aquí se traducen `dev.*` a filas `<ns> <key> <val>` ([ExtShimOttApply]) y se
 *      pasan por [SettingsApplier.applyDetailed], que es el ÚNICO que escribe: su
 *      allowlist y su validación de valor siguen mandando. `ott.*` no son claves de
 *      Android Settings y se guardan como preferencias de la app para el player.
 *
 * LEY #1 DEL CONTRATO DE OPERATIVA: este objeto NO abre apps, NO llama `startActivity`,
 * NO cambia de canal y NO toca la reproducción. Solo escribe settings y preferencias.
 * Se ejecuta en el hilo `ottshim-extshimott` del shim (nunca en el hilo del proxy).
 *
 * FAIL-HONEST: tag inválido → se registra y se sigue. Setting fuera de la allowlist o
 * inexistente en el device → el [SettingsApplier] lo rechaza, se cuenta en el recibo y
 * no se reintenta en bucle (su dedupe interno ya lo cubre).
 */
object ExtShimOttBridge : ShimOttTap.Sink {

    private const val TAG = "ApeExtShimOtt"
    private const val PREFS = "ape_shimott"
    private const val MAX_TYPED = 64

    @Volatile private var applier: SettingsApplier? = null
    @Volatile private var appCtx: Context? = null

    /** `id` -> objeto tipado del parser. Acotado: si crece, se vacía (se repuebla en el próximo tag). */
    private val typed = ConcurrentHashMap<String, ExtShimOtt>()

    /**
     * Instala el sink. Lo llama [AgentService] al arrancar, con el MISMO [SettingsApplier]
     * del daemon: no hay una segunda allowlist ni un segundo camino de escritura.
     */
    fun install(ctx: Context, a: SettingsApplier) {
        appCtx = ctx.applicationContext
        applier = a
        ShimOttTap.install(this)
        AraStatus.extShimOtt = "sink instalado"
        Log.i(TAG, "sink instalado: el shim expone #EXTSHIMOTT y este proceso lo parsea/aplica")
    }

    /** Desinstala el sink (diagnóstico/cierre). No borra settings ya aplicados. */
    fun uninstall() {
        ShimOttTap.install(null)
        applier = null
    }

    /** Preferencias del último `ott.*` guardadas para el player (sin inventar). */
    fun playerPrefs(): Map<String, String> {
        val ctx = appCtx ?: return emptyMap()
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val out = LinkedHashMap<String, String>()
        for ((k, v) in sp.all) if (k.startsWith("ott_") && v is String) out[k] = v
        return out
    }

    override fun parseTag(payload: String, channelId: String?): ShimOttTap.Parsed? {
        // El parser recibe la línea COMPLETA: así aplica las mismas reglas de forma
        // (prefijo, longitud, escáner estricto) que sobre una lista real.
        val line = if (payload.startsWith(ShimOttTap.PREFIX)) payload else ShimOttTap.PREFIX + payload
        val res = try {
            ExtShimOttParser.parse(listOf(line))
        } catch (t: Throwable) {
            Log.w(TAG, "parser lanzó ${t.javaClass.simpleName} (canal=${channelId ?: "?"})")
            return null
        }
        val entry = res.entries.values.firstOrNull()
        if (entry == null) {
            val codes = res.issues.joinToString(",") { it.code }.take(160)
            Log.w(TAG, "tag RECHAZADO por el contrato (canal=${channelId ?: "?"}): $codes")
            AraStatus.extShimOtt = "rechazado canal=${channelId ?: "?"} $codes"
            return null
        }
        for (i in res.issues) Log.i(TAG, i.toString())
        if (typed.size > MAX_TYPED) typed.clear()
        typed[entry.id] = entry
        Log.i(TAG, "tag OK · ${entry.summary()} · canal=${channelId ?: "?"}")
        return ShimOttTap.Parsed(
            id = entry.id,
            targets = entry.targets.map { it.wire }.toSet(),
            filter = entry.filter,
            vlcAppliesFilter = entry.vlcAppliesFilter(),
            summary = entry.summary()
        )
    }

    override fun applyTag(parsed: ShimOttTap.Parsed, route: ShimOttTap.Route): ShimOttTap.Receipt {
        if (!route.apply) {
            // `tgt` sin `ott` (o ausente): NO se escribe nada en el dispositivo.
            Log.i(TAG, "no se aplica al dispositivo (${parsed.id}): ${route.reason}")
            return ShimOttTap.Receipt(0, 0, 0, "no aplicado: ${route.reason}")
        }
        val a = applier ?: return ShimOttTap.Receipt(0, 0, 0, "applier no instalado")
        val entry = typed[parsed.id] ?: return ShimOttTap.Receipt(0, 0, 0, "objeto ${parsed.id} no disponible")

        // 1) dev.* → filas que el SettingsApplier ya sabe aplicar.
        val declared = ExtShimOttApply.rows(entry)
        val allowed = ArrayList<String>(declared.size)
        var outOfAllowlist = 0
        for (row in declared) {
            if (SettingsApplier.allowsRow(row)) allowed.add(row) else {
                outOfAllowlist++
                Log.w(TAG, "RECHAZADO por allowlist (${parsed.id}): $row")
            }
        }
        val report = if (allowed.isEmpty()) SettingsApplier.ApplyReport(emptyList(), emptyList())
        else a.applyDetailed(allowed)

        // 2) ott.* → preferencias del player. No hay clave Android allowlisted para ellas:
        //    se guardan y se cuentan, sin fingir que son settings del sistema.
        val prefs = ExtShimOttApply.ottPrefs(entry)
        val stored = storePrefs(parsed.id, prefs)

        // 3) Recibo honesto: lo aplicado, lo rechazado y lo que no tiene clave.
        val unmapped = ExtShimOttApply.unmapped(entry)
        if (unmapped.isNotEmpty()) Log.i(TAG, "sin mapeo (${parsed.id}): ${unmapped.joinToString(" | ")}")
        val rejected = report.rejected.size + outOfAllowlist
        val detail = buildString {
            append("dev aplicadas=").append(report.applied.size)
            append(" rechazadas=").append(rejected)
            append(" ott.enPreferencias=").append(stored)
            if (stored > 0) append(" (sin clave Android allowlisted)")
            if (unmapped.isNotEmpty()) append(" sinMapeo=").append(unmapped.size)
            if (route.pendingFilter != null) append(" flt.pendiente=si")
        }
        Log.i(TAG, "APLICADO ${parsed.id} tgt=${parsed.targets.joinToString("|")} · $detail")
        AraStatus.extShimOtt = "id=${parsed.id} · $detail"
        AraStatus.extShimOttAt = System.currentTimeMillis()
        return ShimOttTap.Receipt(report.applied.size, rejected, stored, detail)
    }

    private fun storePrefs(id: String, prefs: Map<String, String>): Int {
        if (prefs.isEmpty()) return 0
        val ctx = appCtx ?: return 0
        return try {
            val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val ed = sp.edit()
            ed.putString("channel", id)
            for ((k, v) in prefs) ed.putString(k, v)
            ed.putLong("at", System.currentTimeMillis())
            ed.apply()
            prefs.size
        } catch (t: Throwable) {
            Log.w(TAG, "prefs no escritas: ${t.message}")
            0
        }
    }
}
