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

    /**
     * Puerto ADB del device.
     *
     * ORDEN MEDIDO (Fire OS ≠ Android 11 stock):
     *  1) `adb_wifi_port` (Android 11+ "Depuración inalámbrica"). En Fire OS NO existe.
     *  2) `service.adb.tcp.port` (lo fija Fire OS cuando activas "ADB Debugging").
     *  3) **5555** (default de Fire OS / cajas Android TV). Sin esto el botón fallaba
     *     siempre en Fire TV porque el puerto salía 0 y Dadb.create(puerto=0) revienta.
     */
    fun wirelessDebugPort(): Int {
        try {
            val p1 = Settings.Global.getInt(ctx.contentResolver, "adb_wifi_port", 0)
            if (p1 > 0) return p1
        } catch (e: Exception) { /* sigue */ }
        try {
            val c = Class.forName("android.os.SystemProperties")
            val m = c.getMethod("get", String::class.java)
            val v = (m.invoke(null, "service.adb.tcp.port") as? String)?.trim().orEmpty()
            val p2 = v.toIntOrNull() ?: 0
            if (p2 > 0) return p2
        } catch (e: Exception) { /* sigue */ }
        return 5555
    }

    /**
     * Texto-guía para la UI. Fire OS NO tiene "Depuración inalámbrica" (eso es Android 11
     * stock): tiene **"ADB Debugging"**, que abre el puerto 5555 en LAN y en localhost.
     * No hay código de emparejamiento: al conectar aparece un diálogo en pantalla que el
     * usuario acepta UNA vez (el APK guarda su keypair en filesDir/adbkey).
     */
    fun guide(): String = buildString {
        appendLine("1. Ajustes → Mi Fire TV → Información → pulsa el nombre 7 veces (activa Opciones de desarrollador)")
        appendLine("2. Ajustes → Mi Fire TV → Opciones de desarrollador → 'ADB Debugging' → ACTIVAR")
        appendLine("3. Vuelve al APK y pulsa 'Conceder': conecta a 127.0.0.1:5555")
        appendLine("4. Acepta en pantalla el diálogo 'Permitir depuración' (una sola vez)")
        appendLine("Si el diálogo no sale, el puerto está cerrado: vuelve a activar ADB Debugging.")
    }

    companion object {
        const val TAG = "ApeAdbSelfGrant"
        const val PKG = "com.ape.crystalagent"
        private const val PROBE_KEY = "_ape_perm_probe_"
    }
}

