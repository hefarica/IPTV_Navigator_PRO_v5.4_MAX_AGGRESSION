package com.ape.crystalagent

import android.content.Context
import android.provider.Settings
import android.util.Log
import java.io.File
import java.security.MessageDigest
import java.nio.charset.StandardCharsets

/**
 * Config persistente (SharedPreferences).
 *
 * SEGURIDAD (audit S10): el TOKEN se provisiona por ARCHIVO (data dir privado 0600, o /sdcard/ape/token),
 * NUNCA por command-line `am ... --es token` (se filtra por argv / dumpsys / logs). Se ingiere una vez
 * a SharedPreferences y el archivo puede borrarse después.
 */
class Config(ctx: Context) {
    private val appCtx = ctx.applicationContext
    private val sp = ctx.getSharedPreferences("ape", Context.MODE_PRIVATE)
    private val tokenFilePriv = File(ctx.filesDir, "token")
    private val tokenFileSd = File("/sdcard/ape/token")
    private val eventTokenPriv = File(ctx.filesDir, "event_token")
    private val stateTokenPriv = File(ctx.filesDir, "state_token")

    /*
     * HARDENING: dos credenciales con scopes distintos.
     * - Event token (Bearer): solo /ara/events.
     * - State token (SSE): solo /ara/state.
     * Nunca se hace fallback de una a la otra, ni se registran sus valores.
     */
    private val syncKeyFilePriv = File(ctx.filesDir, "sync.key")
    // Release/sideload no puede leer /sdcard/ape si el dueño es media_rw; esta ruta
    // app-specific sí es legible por la app sin permisos de almacenamiento.
    private val syncKeyFileExt = File(ctx.getExternalFilesDir(null) ?: ctx.filesDir, "sync.key")
    private val syncKeyFileSd = File("/sdcard/ape/sync.key")

    /**
     * Device ID estable y único por instalación/ONN. Antes era "firestick-cali" para todos,
     * lo que colisionaba seq/nonce entre equipos. El VPS acepta esta key para cualquier ID.
     */
    private val defaultDeviceId: String = run {
        val raw = (Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "") +
            "|" + android.os.Build.FINGERPRINT
        val h = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(StandardCharsets.UTF_8))
        "onn4k-" + h.joinToString("") { "%02x".format(it) }.take(12)
    }

    val vpsBase: String get() = sp.getString("vps", DEFAULT_VPS)!!.trimEnd('/')
    // Backward compatible con el ONN actual: su /sync key k1 está bound a firestick-cali.
    // El device-id único autogenerado queda para una migración explícita, no para romper sync.
    val deviceId: String get() = sp.getString("dev", "firestick-cali")!!

    /**
     * [sinWG] Modo directo HTTPS/SSE. FALSE por defecto: el ARA NO crea túnel WireGuard.
     * Se deja el flag por si el propietario quiere volver a WG en el futuro; hoy la decisión
     * es NO WG (el túnel producía freeze en su device).
     */
    val useWg: Boolean get() = sp.getBoolean("use_wg", false)

    /** JSON completo de metadata de la lista (biblioteca dinámica del ARA). */
    fun saveLabMetadata(rawJson: String, sha256: String) {
        sp.edit()
            .putString("lab_metadata_json", rawJson)
            .putString("lab_metadata_sha256", sha256)
            .putLong("lab_metadata_at", System.currentTimeMillis())
            .apply()
    }

    fun appContext(): Context = appCtx

    fun labMetadataJson(): String = sp.getString("lab_metadata_json", "") ?: ""
    fun labMetadataSha256(): String = sp.getString("lab_metadata_sha256", "") ?: ""

    fun setToken(t: String) {
        val v = t.trim()
        if (!validToken(v) || v == stateToken) return
        sp.edit().putString(KEY_EVENT_TOKEN, v).commit()
        writePrivate(eventTokenPriv, v)
    }

    /** Bearer scoped to /ara/events. */
    val eventToken: String get() = token

    /** SSE token scoped to /ara/state; separate storage and no Bearer fallback. */
    val stateToken: String get() {
        sp.getString(KEY_STATE_TOKEN, "")!!.trim().let { stored ->
            if (validToken(stored)) {
                persistIfNeeded(stateTokenPriv, stored)
                return stored
            }
        }
        // Provisión one-time desde archivo privado; nunca desde el Bearer ni storage externo.
        return runCatching {
            if (!stateTokenPriv.isFile) return ""
            val v = stateTokenPriv.readText().trim()
            if (!validToken(v)) return ""
            sp.edit().putString(KEY_STATE_TOKEN, v).commit()
            v
        }.getOrDefault("")
    }

    fun setStateToken(t: String) {
        val v = t.trim()
        if (!validToken(v) || v == token) return
        sp.edit().putString(KEY_STATE_TOKEN, v).commit()
        writePrivate(stateTokenPriv, v)
    }

    fun hasStateToken(): Boolean = validToken(stateToken)

    private fun validToken(v: String): Boolean =
        v.length in 16..512 && v.none { it.isWhitespace() }
    fun setDeviceId(d: String) { sp.edit().putString("dev", d.trim()).apply() }
    fun setUseWg(v: Boolean) { sp.edit().putBoolean("use_wg", v).apply() }

    val token: String
        get() {
            sp.getString(KEY_EVENT_TOKEN, "")!!.let {
                if (validToken(it)) {
                    persistIfNeeded(eventTokenPriv, it)
                    return it
                }
            }
            // fallback: leer del archivo privado/legacy e ingerirlo una vez
            for (f in listOf(eventTokenPriv, tokenFilePriv, tokenFileSd)) {
                try {
                    if (f.exists()) {
                        val t = f.readText().trim()
                        if (validToken(t)) {
                            sp.edit().putString(KEY_EVENT_TOKEN, t).commit()
                            persistIfNeeded(eventTokenPriv, t)
                            return t
                        }
                    }
                } catch (e: Exception) { Log.w(TAG, "token file err: ${e.message}") }
            }
            return ""
        }

    /** Atomic private 0600 backup; survives app updates, never external storage. */
    private fun writePrivate(file: File, value: String) {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(value)
            tmp.setReadable(true, true)
            tmp.setWritable(true, true)
            tmp.setExecutable(false, false)
            if (!tmp.renameTo(file)) {
                file.writeText(value)
                file.setReadable(true, true)
                file.setWritable(true, true)
                tmp.delete()
            }
        }
    }

    private fun persistIfNeeded(file: File, value: String) {
        runCatching {
            if (!file.isFile || file.readText().trim() != value) writePrivate(file, value)
        }
    }

    fun provision(vps: String?, dev: String?) {
        sp.edit().apply {
            vps?.takeIf { it.isNotBlank() }?.let { putString("vps", it) }
            dev?.takeIf { it.isNotBlank() }?.let { putString("dev", it) }
        }.apply()
    }

    fun hasToken() = token.isNotEmpty()

    // ── /sync (D3) ────────────────────────────────────────────────────────────
    /**
     * Loop `/sync` on/off. Default ON: es offline-first (si el endpoint no está, no pasa nada).
     * Apagable por adb/URL-2 sin reinstalar.
     */
    val syncEnabled: Boolean get() = sp.getBoolean("sync_enabled", true)
    fun setSyncEnabled(b: Boolean) { sp.edit().putBoolean("sync_enabled", b).apply() }

    /** key_id del contrato; por defecto "k1". No es un secreto. */
    val syncKeyId: String get() = sp.getString("sync_key_id", EmbeddedKey.keyId())!!.trim()
        .ifEmpty { EmbeddedKey.keyId() }
    fun setSyncKeyId(id: String) { sp.edit().putString("sync_key_id", id.trim()).apply() }

    /**
     * Secreto HMAC del device. Prioridad: SharedPreferences → archivo → key cifrada
     * AES-256-GCM embebida en el APK (decisión del propietario para instalación
     * autocontenida). La key embebida es ofuscación, no seguridad fuerte.
     */
    val syncKeySecret: String
        get() {
            sp.getString("sync_key_secret", "")!!.let { if (it.isNotEmpty()) return it }
            for (f in listOf(syncKeyFilePriv, syncKeyFileExt, syncKeyFileSd)) {
                try {
                    if (f.exists()) {
                        val t = f.readText().trim()
                        if (t.isNotEmpty()) { sp.edit().putString("sync_key_secret", t).apply(); return t }
                    }
                } catch (e: Exception) { Log.w(TAG, "sync.key err: ${e.message}") }
            }
            return EmbeddedKey.secret()
        }

    fun setSyncKeySecret(secret: String) { sp.edit().putString("sync_key_secret", secret.trim()).apply() }

    fun hasSyncKey(): Boolean = syncKeySecret.isNotEmpty()

    /** Endpoint de control (staged en el VPS: hoy devuelve 404 y el loop sigue local). */
    val syncEndpoint: String get() = vpsBase + "/sync"

    /** A/B del UltraEnhance Engine (F6). Default ON; apagable por adb/URL-2 sin reinstalar. */
    val enhanceEnabled: Boolean get() = sp.getBoolean("enhance_enabled", true)
    fun setEnhance(b: Boolean) { sp.edit().putBoolean("enhance_enabled", b).apply() }

    companion object {
        const val TAG = "ApeConfig"
        const val DEFAULT_VPS = "https://iptv-ape.duckdns.org"
        const val KEY_EVENT_TOKEN = "token"
        const val KEY_STATE_TOKEN = "state_token"
        const val PATH_EVENTS = "/ara/events"
        const val PATH_STATE = "/ara/state"
        const val PATH_VAULT = "/prisma/api/token-vault.php"
    }
}
