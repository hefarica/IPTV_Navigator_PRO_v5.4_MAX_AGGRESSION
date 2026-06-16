package com.ape.crystalagent

import android.content.ContentResolver
import android.content.Context
import android.provider.Settings
import android.util.Log

/**
 * APLICADOR PURO. Escribe el subconjunto de Android Settings que el VPS dicta (device_settings).
 * NO observa, NO cambia canales, NO abre apps. Solo aplica lo que llega.
 *
 * SEGURIDAD (audit BLOCK/MAJOR): ALLOWLIST estricta — solo (ns,key) doctrinales + valor validado
 * por regex. Cualquier cosa fuera de la lista se RECHAZA y se loggea, de modo que el VPS NO puede
 * escribir settings arbitrarios pese a tener el device WRITE_SECURE_SETTINGS.
 *
 * HONESTO: hdr_conversion solo llega si el VPS probó HDR real en el canal (truth-guard del lado VPS);
 * aquí no se infiere nada — el VPS decide, el daemon valida contra la allowlist y aplica.
 */
class SettingsApplier(ctx: Context) {
    private val cr: ContentResolver = ctx.contentResolver

    /** device_settings = lista de "<ns> <key> <val>" que el VPS computó para este device/canal. */
    fun apply(deviceSettings: List<String>) {
        var ok = 0; var rejected = 0
        for (s in deviceSettings) {
            val p = s.trim().split(Regex("\\s+"), limit = 3)
            if (p.size != 3) { rejected++; continue }
            val ns = p[0]; val key = p[1]; val value = p[2]
            if (!isAllowed(ns, key, value)) {
                Log.w(TAG, "RECHAZADO (no allowlist o valor inválido): $ns/$key=$value"); rejected++; continue
            }
            if (putSetting(ns, key, value)) ok++ else rejected++
        }
        Log.i(TAG, "device_settings aplicados=$ok rechazados=$rejected")
    }

    private fun isAllowed(ns: String, key: String, value: String): Boolean {
        val rx = ALLOW["$ns/$key"] ?: return false
        return rx.matches(value)
    }

    private fun putSetting(ns: String, k: String, v: String): Boolean {
        return try {
            val r = when (ns) {
                "global" -> Settings.Global.putString(cr, k, v)
                "system" -> Settings.System.putString(cr, k, v)
                "secure" -> Settings.Secure.putString(cr, k, v)
                else -> false
            }
            if (!r) Log.w(TAG, "put $ns/$k=$v devolvió false")
            r
        } catch (e: SecurityException) {
            Log.w(TAG, "SIN PERMISO $ns/$k — adb shell pm grant ${BuildId.PKG} android.permission.WRITE_SECURE_SETTINGS"); false
        } catch (e: Exception) {
            Log.w(TAG, "put $ns/$k err: ${e.message}"); false
        }
    }

    companion object {
        const val TAG = "ApeSettingsApplier"
        // ALLOWLIST doctrinal: "ns/key" -> regex del valor permitido. NADA fuera de aquí se aplica.
        private val ALLOW: Map<String, Regex> = mapOf(
            "global/match_content_frame_rate"        to Regex("^[012]$"),   // 0 off · 1 seamless · 2 always
            "global/hdr_conversion_mode"             to Regex("^[0-3]$"),   // solo si VPS probó HDR real
            "global/minimal_post_processing_allowed" to Regex("^[01]$"),
            "system/display_color_mode"              to Regex("^\\d{1,3}$")
        )
    }
}

/** Identidad de paquete (usada en logs de permiso). */
object BuildId { const val PKG = "com.ape.crystalagent" }
