package com.ape.crystalagent

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * SyncStore — persistencia del estado `/sync` (offline-first).
 *
 * Guarda el **last-known-good** (política aplicada + filas aplicadas) y el contador de `seq`.
 * La app arranca con lo último bueno vigente y, si expiró o no hay nada, aplica los **safe defaults**
 * (las 3 filas base de D4). Nunca inventa una política agresiva: si no hay LKG fresco, el device
 * se queda como está (autopista).
 */
class SyncStore(ctx: Context) {

    private val sp = ctx.getSharedPreferences("ape_sync", Context.MODE_PRIVATE)

    /** Incrementa y persiste `seq` (monótono por device; el servidor lo exige). */
    @Synchronized
    fun nextSeq(): Long {
        val s = sp.getLong("seq", 0L) + 1L
        sp.edit().putLong("seq", s).apply()
        return s
    }

    fun lastSeq(): Long = sp.getLong("seq", 0L)

    /** Última `seq` de POLÍTICA aceptada (protección contra replay/rollback de política). */
    fun lastPolicySeq(): Long = sp.getLong("lkg_seq", 0L)

    /** Sólo se llama si el servidor detecta replay (409): se resetea UNA vez. */
    fun resetSeq() { sp.edit().putLong("seq", 0L).apply() }

    fun savePolicy(
        body: String,
        etag: String,
        seq: Long,
        ts: Long,
        validUntil: Long,
        profile: String,
        blend: JSONObject,
        rows: List<String>
    ) {
        sp.edit()
            .putString("lkg_body", body)
            .putString("lkg_etag", etag)
            .putLong("lkg_seq", seq)
            .putLong("lkg_ts", ts)
            .putLong("lkg_valid_until", validUntil)
            .putString("lkg_profile", profile)
            .putString("lkg_blend", blend.toString())
            .putString("lkg_rows", JSONArray(rows).toString())
            .apply()
        Log.i(TAG, "LKG guardado etag=${etag.take(15)}… seq=$seq rows=${rows.size}")
    }

    /** Renovación local tras un 204 (protocolo §8: renovar `valid_until` sin política nueva). */
    fun renew(nowS: Long, graceS: Long = 60L) {
        sp.edit().putLong("lkg_valid_until", nowS + graceS).apply()
    }

    fun saveApply(ack: JSONObject) { sp.edit().putString("lkg_apply", ack.toString()).apply() }

    fun lastAppliedRows(): List<String> {
        val raw = sp.getString("lkg_rows", null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) { emptyList() }
    }

    fun lastApply(): JSONObject? {
        val raw = sp.getString("lkg_apply", null) ?: return null
        return try { JSONObject(raw) } catch (e: Exception) { null }
    }

    fun etag(): String = sp.getString("lkg_etag", "") ?: ""

    fun profile(): String = sp.getString("lkg_profile", SAFE_PROFILE) ?: SAFE_PROFILE

    fun blend(): JSONObject {
        val raw = sp.getString("lkg_blend", null) ?: return JSONObject().put(SAFE_PROFILE, 1.0)
        return try { JSONObject(raw) } catch (e: Exception) { JSONObject().put(SAFE_PROFILE, 1.0) }
    }

    fun validUntil(): Long = sp.getLong("lkg_valid_until", 0L)

    fun hasFresh(nowS: Long): Boolean = nowS < validUntil()

    fun clear() { sp.edit().clear().apply() }

    companion object {
        const val TAG = "ApeSyncStore"
        const val SAFE_PROFILE = "P2"

        /**
         * Safe defaults = filas base de D4 (§7): exactamente el comportamiento actual del plano.
         * No son "mejor imagen": son "no romper".
         */
        val SAFE_ROWS: List<String> = listOf(
            // [homologación] 6 keys que SÍ existen en el ONN Android 14/S905X4.
            "secure match_content_frame_rate 2",
            "global hdr_conversion_mode 1",
            "secure minimal_post_processing_allowed 0",
            "global hdr_force_conversion_type -1",
            "global user_preferred_resolution_width 3840",
            "global user_preferred_resolution_height 2160",
            "global display_size_forced 3840x2160",
            "global user_preferred_refresh_rate 60.000004",
            "global are_user_disabled_hdr_formats_allowed 1",
            "global db_id_audio_drc_mode 2",
            "global db_id_droidlogic_audio_digital_mode 1"
        )
    }
}
