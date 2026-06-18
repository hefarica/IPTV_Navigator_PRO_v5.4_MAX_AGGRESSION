package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** UI mínima (Leanback) — arranca el servicio y muestra el estado/instrucciones. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // F1: consent VPN (1 vez) antes de arrancar el servicio que sube el túnel WireGuard full-tunnel
        val prep = android.net.VpnService.prepare(this)
        if (prep != null) startActivityForResult(prep, REQ_VPN) else AgentService.start(this)
        val cfg = Config(this)
        val tv = TextView(this).apply {
            setPadding(48, 48, 48, 48)
            textSize = 16f
            text = buildString {
                appendLine("APE Crystal Agent — servicio iniciado.")
                appendLine()
                appendLine("dev   = ${cfg.deviceId}")
                appendLine("vps   = ${cfg.vpsBase}")
                appendLine("token = ${if (cfg.hasToken()) "provisionado" else "FALTA (provisiona por adb)"}")
                appendLine()
                appendLine("Provisión / permisos (una vez, por adb):")
                appendLine("  pm grant ${BuildId.PKG} android.permission.WRITE_SECURE_SETTINGS")
                appendLine("  # token por archivo (no command-line):")
                appendLine("  push token → /sdcard/ape/token  (o run-as filesDir)")
                appendLine("  am startservice -n ${BuildId.PKG}/.AgentService --es vps <URL> --es dev <DEV>")
            }
        }
        setContentView(ScrollView(this).apply { addView(tv) })
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VPN && resultCode == RESULT_OK) AgentService.start(this)
    }

    companion object { const val REQ_VPN = 9901 }
}
