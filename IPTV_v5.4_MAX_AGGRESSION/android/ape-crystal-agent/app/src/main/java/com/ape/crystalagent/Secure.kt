package com.ape.crystalagent

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Almacén seguro para secretos del device (clave privada WireGuard, IP asignada, etc.).
 * API ≥23 → EncryptedSharedPreferences (AndroidKeyStore AES-GCM). API 22 (Fire OS 5) → fallback
 * a SharedPreferences privado (EncryptedSharedPreferences requiere API 23). No crashea en ningún device.
 */
class Secure(ctx: Context) {
    private val prefs: SharedPreferences = try {
        if (Build.VERSION.SDK_INT >= 23) {
            val mk = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(
                ctx, "ape_secure", mk,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } else {
            ctx.getSharedPreferences("ape_secure_plain", Context.MODE_PRIVATE)
        }
    } catch (e: Exception) {
        ctx.getSharedPreferences("ape_secure_plain", Context.MODE_PRIVATE)
    }

    fun get(k: String): String? = prefs.getString(k, null)
    fun put(k: String, v: String) { prefs.edit().putString(k, v).apply() }
    fun has(k: String): Boolean = prefs.contains(k)
}
