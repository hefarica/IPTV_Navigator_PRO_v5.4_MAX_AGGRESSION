package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle

/**
 * Disparador MANUAL del badge de upscaling — solo diagnostico.
 *
 * ESTA ACTIVITY YA NO MONTA EL OVERLAY. Desde el fix t68 (2026-11-14) todo el montaje vive
 * en [BadgeOverlay], que se cuelga del WindowManager sin Activity. Aqui solo se traducen los
 * extras de un intent de ADB a llamadas de [BadgeOverlay], y se cierra SIEMPRE con finish().
 *
 * POR QUE SIGUE EXISTIENDO
 *   Permite comprobar el badge desde el PC sin tocar la UI del televisor:
 *
 *     adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity
 *     adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es input "1920x1080"
 *     adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es input "3840x2160"
 *     adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --ez hide true
 *
 *   Opcional: --es channel "TF1 UHD" para ver el nombre del canal en su propia linea.
 *
 * POR QUE NO ES EL CAMINO DE PRODUCCION (defecto medido que origino t68)
 *   AgentService lanzaba esta Activity con startActivity desde su ticker cuando detectaba
 *   reproduccion. MEDIDO con `dumpsys activity activities`: el foco acababa en
 *   `com.ape.crystalagent/.MainActivity` — la raiz de la tarea del ARA — y OTT se pausaba
 *   ("Buffering: 0%"). El operador lo describio como "me salta y me lleva al menu del ARA".
 *   El `finish()` en finally evitaba que la Activity quedara abierta, pero no que naciera en
 *   primer plano arrastrando su tarea.
 *
 *   Si alguien vuelve a llamar a esta Activity desde el camino de la reproduccion, el salto
 *   VUELVE. El camino de produccion es [BadgeOverlay.show] desde el Service. Esta Activity
 *   es solo un disparador manual y su uso en produccion esta prohibido.
 *
 * PERMISO: SYSTEM_ALERT_WINDOW + appop (ver BadgeOverlay). Sin permiso, fail-honest: log y
 * finish(); no se rompe nada.
 */
class UpscaleBadgeActivity : Activity() {

    companion object {
        private const val TAG = "ARA-UpscaleBadge"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            // Retirada manual: no monta nada, solo delega el desmontaje.
            if (intent?.getBooleanExtra("hide", false) == true) {
                BadgeOverlay.hide(this)
                return
            }
            val input = intent?.getStringExtra("input")?.trim()
            val canal = intent?.getStringExtra("channel")?.trim()
            BadgeOverlay.show(this, input, canal)
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "badge fallo: ${t.message}")
        } finally {
            // Se cierra SIEMPRE: el overlay se cuelga del WindowManager y sobrevive al
            // finish(); lo que no debe sobrevivir es esta Activity robando el foco.
            finish()
        }
    }
}
