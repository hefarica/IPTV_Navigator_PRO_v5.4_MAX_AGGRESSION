package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * UI mínima (Leanback). Consent VPN → OnboardingFlow (enroll + WireGuard full-tunnel + ADB self-grant) →
 * estado/guía en pantalla. OnboardingFlow CABLEA AgentService (F1) + AdbSelfGrantManager.selfGrant (F2,
 * antes sin caller). Antes esta Activity solo mostraba texto y pedía hacer `pm grant` por adb a mano.
 */
class MainActivity : Activity() {
    private var flow: OnboardingFlow? = null
    private var tv: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        flow = OnboardingFlow(this)
        val cfg = Config(this)
        tv = TextView(this).apply {
            setPadding(48, 48, 48, 48); textSize = 16f; text = baseInfo(cfg)
        }
        val grant = Button(this).apply {
            text = "Conceder permiso (tras activar Depuración inalámbrica)"
            setOnClickListener {
                flow?.retryGrant { ok, detail -> runOnUiThread { append(if (ok) "✓ $detail" else "… $detail") } }
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(grant)
            addView(ScrollView(this@MainActivity).apply { addView(tv) })
        })

        // F1: consent VPN (1 vez) antes de subir el túnel WireGuard full-tunnel.
        val prep = android.net.VpnService.prepare(this)
        if (prep != null) startActivityForResult(prep, REQ_VPN) else beginOnboarding()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VPN) {
            if (resultCode == RESULT_OK) beginOnboarding()
            else append("VPN consent rechazado — sin túnel (la reproducción sigue directa).")
        }
    }

    private fun beginOnboarding() {
        flow?.start { step, ok, detail -> runOnUiThread { append("[$step] ${if (ok) "OK" else "…"} $detail") } }
    }

    private fun append(line: String) { tv?.let { it.text = "${it.text}\n$line" } }

    private fun baseInfo(cfg: Config): String = buildString {
        appendLine("APE Crystal Agent — onboarding")
        appendLine("dev   = ${cfg.deviceId}")
        appendLine("vps   = ${cfg.vpsBase}")
        appendLine("token = ${if (cfg.hasToken()) "provisionado" else "FALTA"}")
        appendLine()
        appendLine("Pasos (1 vez):")
        appendLine("  Ajustes -> Opciones de desarrollador -> Depuracion inalambrica -> ON")
        appendLine("  Luego pulsa 'Conceder' (el APK se auto-concede WRITE_SECURE_SETTINGS, sin PC).")
    }

    companion object { const val REQ_VPN = 9901 }
}
