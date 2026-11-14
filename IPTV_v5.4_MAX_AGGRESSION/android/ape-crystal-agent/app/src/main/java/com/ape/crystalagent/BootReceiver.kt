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
                // [FIX 2026-11-14] SOLO el servicio. NADA de startActivity.
                //
                // Aqui habia ademas:
                //     context.startActivity(ScreenCaptureActivity + NEW_TASK)
                // y eso abria una pantalla del ARA nada mas encender el televisor,
                // antes de que el operador tocara nada. Es el mismo sintoma que
                // CaptureWatchdogService (ya corregido): el sistema debe ARRANCAR en
                // segundo plano, no presentarse encima de lo que el operador este
                // viendo. El pedido textual fue:
                //   "el proceso se automatice para activar el sistema cuando ingreso a
                //    OTT NAVIGATOR"  ... no "que ARA se abra solo".
                //
                // El consentimiento de captura se pide por notificacion cuando haga
                // falta (CaptureWatchdogService.notifyAction). Al arrancar el equipo no
                // hay nada que capturar, asi que pedirlo es ruido.
                AgentService.start(context)
            } catch (t: Throwable) {
                android.util.Log.e("ApeBoot", "start tras boot falló", t)
            }
        }
    }
}
