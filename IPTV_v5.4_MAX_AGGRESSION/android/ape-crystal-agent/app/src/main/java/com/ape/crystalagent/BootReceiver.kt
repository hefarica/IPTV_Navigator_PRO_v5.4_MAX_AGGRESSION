package com.ape.crystalagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Revive el agente tras reboot del Firestick (persistencia real — resuelve S7-F1). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED -> AgentService.start(context)
        }
    }
}
