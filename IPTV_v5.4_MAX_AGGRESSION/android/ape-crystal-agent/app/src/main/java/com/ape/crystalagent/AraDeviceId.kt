package com.ape.crystalagent

import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

/** Stable, non-reversible device id for /ara/sse and /ara/state. */
object AraDeviceId {
    fun get(ctx: Context): String {
        val raw = runCatching {
            Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        }.getOrDefault("")
        if (raw.isBlank()) return "unknown"
        return MessageDigest.getInstance("SHA-256")
            .digest(raw.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
