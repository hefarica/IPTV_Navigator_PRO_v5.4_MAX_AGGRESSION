package com.ape.crystalagent

import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings

/**
 * Catálogo derivado del dump real del ONN (settings list global/system/secure).
 * Nada se escribe si no está aquí o no existe en runtime.
 */
object SettingsCatalog {
    val known: Map<String, Set<String>> = mapOf(
        "global" to setOf(
            "hdr_conversion_mode",
            "hdr_force_conversion_type",
            "user_preferred_resolution_width",
            "user_preferred_resolution_height",
            "user_preferred_refresh_rate",
            "are_user_disabled_hdr_formats_allowed",
            "user_disabled_hdr_formats",
            "display_size_forced",
            "db_id_audio_drc_mode",
            "db_id_droidlogic_audio_digital_mode"
        ),
        "secure" to setOf(
            "match_content_frame_rate",
            "minimal_post_processing_allowed",
            "display_density_forced"
        ),
        "system" to emptySet()
    )

    fun isKnown(ns: String, key: String): Boolean = known[ns]?.contains(key) == true
}

object KeyGuard {
    fun hasSecure(ctx: Context): Boolean = try {
        ctx.packageManager.checkPermission(
            "android.permission.WRITE_SECURE_SETTINGS", ctx.packageName
        ) == PackageManager.PERMISSION_GRANTED
    } catch (_: Exception) { false }

    fun writable(ctx: Context, ns: String): Boolean = when (ns) {
        "system" -> Settings.System.canWrite(ctx)
        "global" -> Settings.System.canWrite(ctx) || hasSecure(ctx)
        "secure" -> hasSecure(ctx)
        else -> false
    }
}
