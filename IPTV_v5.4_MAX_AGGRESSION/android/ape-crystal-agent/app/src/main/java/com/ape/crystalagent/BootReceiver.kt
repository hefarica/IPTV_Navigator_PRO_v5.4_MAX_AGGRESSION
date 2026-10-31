package com.ape.crystalagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Revive el agente tras reboot del Firestick (persistencia real — resuelve S7-F1). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        // [crashfix] NO arrancar en MY_PACKAGE_REPLACED: tras instalar/actualizar el
        // servicio se lanzaba antes de que el usuario abriera la app y un fallo de
        // inicialización mostraba "se detuvo" sin contexto. El arranque por BOOT y
        // el botón de la app siguen funcionando.
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON" -> try {
                AgentService.start(context)
            } catch (t: Throwable) {
                android.util.Log.e("ApeBoot", "start tras boot falló", t)
            }
        }
    }
}
