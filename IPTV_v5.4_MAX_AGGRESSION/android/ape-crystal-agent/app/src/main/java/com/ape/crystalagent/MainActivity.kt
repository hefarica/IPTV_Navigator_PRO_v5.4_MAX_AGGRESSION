package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** UI mínima (Leanback) — arranca el servicio y muestra el estado/instrucciones. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AgentService.start(this)
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
                appendLine("  pm grant ${BuildId.PKG} android.permission.READ_LOGS")
                appendLine("  pm grant ${BuildId.PKG} android.permission.WRITE_SECURE_SETTINGS")
                appendLine("  am startservice -n ${BuildId.PKG}/.AgentService --es token <T> --es vps <URL>")
            }
        }
        setContentView(ScrollView(this).apply { addView(tv) })
    }
}
