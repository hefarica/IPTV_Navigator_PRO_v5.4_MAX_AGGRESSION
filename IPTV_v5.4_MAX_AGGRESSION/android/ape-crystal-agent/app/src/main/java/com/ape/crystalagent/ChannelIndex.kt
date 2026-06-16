package com.ape.crystalagent

import android.content.Context
import android.media.session.MediaSessionManager
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * "lo ESPERADO" = la config del canal en la LISTA (lo que el generador asignó). Sin esto, el MATCH
 * corre degradado (S1-H3). Fuente v1: /sdcard/ape/channels_index.json  (mapa ch_id → {res,fps,p})
 * que el generador produce y se empuja por adb:
 *   adb push channels_index.json /sdcard/ape/channels_index.json
 *
 * currentChannelId: v1 intenta MediaSessionManager (si el APK es notification-listener habilitado);
 * si no, devuelve "live" (el VPS cacheará por device). v2 integrará el id de canal real del player.
 */
object ChannelIndex {
    private const val IDX = "/sdcard/ape/channels_index.json"

    fun currentChannelId(ctx: Context): String {
        return try {
            val msm = ctx.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager ?: return "live"
            // getActiveSessions requiere un NotificationListener habilitado; si no, lanza SecurityException.
            val sessions = msm.getActiveSessions(null)
            val md = sessions.firstOrNull()?.metadata
            val title = md?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE)
            (title ?: "live").replace(Regex("[^A-Za-z0-9_.-]"), "").take(40).ifEmpty { "live" }
        } catch (e: Exception) {
            "live"
        }
    }

    fun esperadoFor(ctx: Context, ch: String): JSONObject? {
        return try {
            val f = File(IDX)
            if (!f.exists()) return null
            JSONObject(f.readText()).optJSONObject(ch)
        } catch (e: Exception) {
            Log.w("ApeChannelIndex", "idx err: ${e.message}"); null
        }
    }
}
