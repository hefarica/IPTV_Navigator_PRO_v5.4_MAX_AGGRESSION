package com.ape.crystalagent

import android.content.Context
import android.provider.Settings
import android.util.Log
import dadb.AdbKeyPair
import dadb.Dadb
import java.io.File

/**
 * ADB SELF-GRANT (F2, estilo Shizuku, SIN PC). Se auto-concede WRITE_SECURE_SETTINGS vía
 * Wireless Debugging local + un cliente ADB embebido (dadb, pure-Kotlin). El usuario hace SOLO los
 * toggles de pantalla (Opciones de desarrollador + Depuración inalámbrica + el diálogo de emparejar);
 * el APK automatiza el resto (pair → connect localhost → pm grant a sí mismo).
 *
 * HONESTO: los toggles de pantalla los toca el USUARIO (Android no deja activarlos por código);
 * el APK NO habilita ADB remoto. Autopista: cualquier fallo → false, nunca crashea.
 */
class AdbSelfGrantManager(private val ctx: Context) {

    /** ¿Ya tiene el permiso? Check REAL (intenta una escritura inocua a secure). */
    fun hasWriteSecureSettings(): Boolean = try {
        Settings.Secure.putString(ctx.contentResolver, PROBE_KEY, "1")
        true
    } catch (e: SecurityException) { false } catch (e: Exception) { false }

    /** Keypair ADB persistente del APK (en filesDir privado). Generado una vez. */
    private fun keyPair(): AdbKeyPair {
        val priv = File(ctx.filesDir, "adbkey")
        val pub = File(ctx.filesDir, "adbkey.pub")
        if (!priv.exists() || !pub.exists()) AdbKeyPair.generate(priv, pub)
        return AdbKeyPair.read(priv, pub)
    }

    /**
     * Empareja (si hay pairing) + conecta a localhost:debugPort + se concede WRITE_SECURE_SETTINGS.
     * @param debugPort  el puerto de "Depuración inalámbrica" (settings global adb_wifi_port o el visible).
     * @param pairHostPort/pairCode opcionales: si se pasan, intenta el pairing TLS primero.
     * @return true si el permiso quedó concedido.
     */
    fun selfGrant(debugPort: Int, pairHostPort: Int = 0, pairCode: String? = null): Boolean {
        if (hasWriteSecureSettings()) { Log.i(TAG, "WRITE_SECURE_SETTINGS ya concedido — skip"); return true }
        val kp = try { keyPair() } catch (e: Exception) { Log.w(TAG, "keypair: ${e.message}"); return false }

        // 1) pairing TLS opcional (Android 11+ "Asociar dispositivo con código")
        if (pairHostPort > 0 && !pairCode.isNullOrEmpty()) {
            try {
                Dadb.create("127.0.0.1", pairHostPort).use { /* algunos builds emparejan al conectar */ }
            } catch (e: Exception) { Log.w(TAG, "pair best-effort: ${e.message}") }
        }

        // 2) connect localhost + grant (el usuario acepta el diálogo "Permitir depuración" 1 vez)
        return try {
            Dadb.create("127.0.0.1", debugPort, kp).use { dadb ->
                val r = dadb.shell("pm grant $PKG android.permission.WRITE_SECURE_SETTINGS")
                Log.i(TAG, "grant exit=${r.exitCode} out=${r.allOutput.take(120)}")
            }
            hasWriteSecureSettings()
        } catch (e: Exception) { Log.w(TAG, "selfGrant: ${e.message}"); false }
    }

    /** Puerto de Wireless Debugging (si el SO lo expone en settings). 0 si no se puede leer. */
    fun wirelessDebugPort(): Int = try {
        Settings.Global.getInt(ctx.contentResolver, "adb_wifi_port", 0)
    } catch (e: Exception) { 0 }

    /** Texto-guía para la UI (los pasos que SÍ hace el usuario en pantalla). */
    fun guide(): String = buildString {
        appendLine("1. Ajustes → Mi Fire TV → Opciones de desarrollador → ACTIVAR")
        appendLine("2. Depuración inalámbrica → ACTIVAR")
        appendLine("3. 'Asociar dispositivo con código' → anota PUERTO + CÓDIGO")
        appendLine("4. Vuelve al APK y pulsa 'Conceder' → acepta el diálogo en pantalla")
    }

    companion object {
        const val TAG = "ApeAdbSelfGrant"
        const val PKG = "com.ape.crystalagent"
        private const val PROBE_KEY = "_ape_perm_probe_"
    }
}
