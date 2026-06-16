package com.ape.crystalagent

import android.content.ContentResolver
import android.content.Context
import android.provider.Settings
import android.util.Log

/**
 * Aplica la CARGA en el device usando las APIs que Fire OS SÍ permite con WRITE_SECURE_SETTINGS
 * (grantable por adb a una app sideloaded). HONESTO por diseño:
 *   - NUNCA fuerza HDR si la fuente es SDR (carga.videoRange == "").
 *   - Solo aplica Settings (global/secure/system); lo vendor-privado (persist.*) que Fire OS bloquea
 *     se OMITE — no se finge ni se rompe (la mejora de codec real viaja en la LISTA, no aquí).
 *   - match_content_frame_rate SÍ funciona en Fire OS (elimina judder por pulldown) → siempre.
 */
class CargaApplier(ctx: Context) {
    private val cr: ContentResolver = ctx.contentResolver

    fun apply(carga: Carga) {
        // 1) Frame-rate matching (Fire OS lo permite, gran impacto real en IPTV)
        putGlobal("match_content_frame_rate", "1")

        // 2) HDR display SOLO si la carga trae video_range PROBADO (truth-guard, no fake)
        when (carga.videoRange) {
            "PQ", "HLG" -> putGlobal("hdr_conversion_mode", "1")  // passthrough; el panel decide
            else -> { /* SDR → no tocar HDR */ }
        }

        // 3) adb_settings de la carga ("<ns> <key> <val>") — el VPS los envía a la medida del tier
        for (s in carga.adbSettings) {
            val p = s.trim().split(Regex("\\s+"))
            if (p.size == 3) putSetting(p[0], p[1], p[2])
        }

        Log.i(TAG, "CARGA aplicada: codec=${carga.codec} hev1=${carga.codecHev1} " +
                "res=${carga.resolution} vr='${carga.videoRange}' " +
                "chinaBox=${carga.chinaBox?.optString("profile") ?: "-"} " +
                "intensity=${carga.chinaBox?.optDouble("intensity") ?: "-"}")
        // Nota: KODIPROP/EXTVLCOPT son list-level → no se inyectan a un player en curso.
        // Llegan al player vía la LISTA (generador). El APK puede, en v2, servir una lista local
        // enriquecida (NanoHTTPD) a la que OTT apunte, para que esos hints siempre estén presentes.
    }

    private fun putGlobal(k: String, v: String) = putSetting("global", k, v)

    private fun putSetting(ns: String, k: String, v: String) {
        try {
            val ok = when (ns) {
                "global" -> Settings.Global.putString(cr, k, v)
                "secure" -> Settings.Secure.putString(cr, k, v)
                "system" -> Settings.System.putString(cr, k, v)
                else -> false
            }
            if (!ok) Log.w(TAG, "put $ns/$k devolvió false")
        } catch (e: SecurityException) {
            Log.w(TAG, "SIN PERMISO $ns/$k — falta: adb shell pm grant ${BuildId.PKG} android.permission.WRITE_SECURE_SETTINGS")
        } catch (e: Exception) {
            Log.w(TAG, "put $ns/$k err: ${e.message}")
        }
    }

    companion object { const val TAG = "ApeCargaApplier" }
}

object BuildId { const val PKG = "com.ape.crystalagent" }
