package com.ape.crystalagent

import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.*

/**
 * OnboardingFlow (F1+F2+F3 wiring) — máquina de estados idempotente de primer arranque.
 *
 * NO reimplementa nada: CABLEA lo que ya existe pero estaba suelto (gap real del assessment w09095st6):
 *   F1 — AgentService.start() (enroll + WireGuard full-tunnel; ya orquestado en AgentService.onCreate).
 *   F2 — AdbSelfGrantManager.selfGrant() (HOY SIN CALLER) → sin WRITE_SECURE_SETTINGS el SettingsApplier
 *        no puede escribir los levers VPP, así que el feed-forward del VPS no se materializa en el device.
 *   F3 — PlayerActivity (MVP, 1 URL verbatim SHIELDED). La grilla/zap completa es trabajo posterior.
 *
 * AUTOPISTA: best-effort, nunca crashea; si un paso falla, los demás siguen (la reproducción jamás se afecta).
 * HONESTO: los toggles de "Depuración inalámbrica" los hace el USUARIO (Android no deja por código); el APK
 * automatiza el resto (leer adb_wifi_port → selfGrant → pm grant a sí mismo, estilo Shizuku, sin PC).
 */
class OnboardingFlow(private val ctx: Context) {

    enum class Step { ENROLL_WG, ADB_GRANT, READY }

    private val adb = AdbSelfGrantManager(ctx)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Arranca el flujo idempotente. Llamar tras el consent VPN (RESULT_OK) desde MainActivity.
     * @param onState callback de progreso (Step, ok, detail) — puede llegar en hilo de fondo; la UI debe
     *                marshalar a su hilo (runOnUiThread).
     */
    fun start(onState: (Step, Boolean, String) -> Unit = { _, _, _ -> }) {
        // F1 — AgentService sube enroll + WG full-tunnel (idempotente; START_STICKY). No bloquea.
        AgentService.start(ctx)
        onState(Step.ENROLL_WG, true, "servicio iniciado (enroll + WireGuard full-tunnel)")

        // F2 — ADB self-grant (el wire que faltaba).
        scope.launch(Dispatchers.IO) {
            val ok = ensureWriteSecureSettings(onState)
            onState(Step.READY, ok, if (ok) "onboarding completo — levers VPP aplicables" else "onboarding parcial — falta WRITE_SECURE_SETTINGS")
        }
    }

    /** Reintento manual desde un botón 'Conceder' (tras que el usuario activó el toggle de pantalla). */
    fun retryGrant(onResult: (Boolean, String) -> Unit) {
        scope.launch(Dispatchers.IO) {
            val ok = ensureWriteSecureSettings { _, _, _ -> }
            onResult(ok, if (ok) "permiso concedido" else "aún falta. ${adb.guide()}")
        }
    }

    /** Lanza el player MVP (F3) con una URL verbatim (SHIELDED Law 5; no se reescribe). */
    fun playChannel(url: String, ua: String? = null) {
        try {
            val i = Intent(ctx, PlayerActivity::class.java)
                .putExtra("url", url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (ua != null) i.putExtra("ua", ua)
            ctx.startActivity(i)
        } catch (e: Exception) { Log.w(TAG, "playChannel: ${e.message}") }
    }

    fun stop() { scope.cancel() }

    /** Idempotente: si ya tiene el permiso → true; si no, intenta self-grant por el puerto wireless-debug. */
    private fun ensureWriteSecureSettings(onState: (Step, Boolean, String) -> Unit): Boolean {
        if (adb.hasWriteSecureSettings()) {
            onState(Step.ADB_GRANT, true, "WRITE_SECURE_SETTINGS ya concedido")
            return true
        }
        val port = adb.wirelessDebugPort()
        if (port <= 0) {
            onState(Step.ADB_GRANT, false,
                "Activa 'Depuración inalámbrica' (el APK no puede por código) y pulsa Conceder:\n${adb.guide()}")
            return false
        }
        val granted = try { adb.selfGrant(port) } catch (e: Exception) { Log.w(TAG, "selfGrant: ${e.message}"); false }
        onState(Step.ADB_GRANT, granted,
            if (granted) "self-grant OK (puerto $port)"
            else "self-grant falló — acepta el diálogo 'Permitir depuración' y reintenta:\n${adb.guide()}")
        return granted
    }

    companion object { const val TAG = "ApeOnboarding" }
}
