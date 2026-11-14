package com.ape.crystalagent

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView

/**
 * Badge de upscaling en el overlay.
 *
 * PEDIDO DEL OPERADOR (textual): "necesito que en el overlay, coloques un logo de
 * upscaling para saber que esta funcionando". Este es ese badge.
 *
 * QUE ES Y QUE NO ES (truth-guard, para no repetir la doctrina de mentir):
 *   - ES una etiqueta que confirma que el APE Crystal Agent esta vivo y aplicando
 *     su pipeline en este dispositivo. Nada mas.
 *   - NO es prueba de que el VPP del SoC este escalando pixeles. Esa prueba es
 *     externa al APK: se mide en el VPS (QoE) y en el display (dataspace,
 *     displayFrame). El badge dice "el agente corre", no "el pixel se movio".
 *   - NO afirma 8K ni 6K ni un motor concreto. Si en el futuro se quiere que
 *     muestre el motor activo (ESRGAN/CAR-CNN/LCEVC), se le pasa por Intent
 *     extra y se pinta; mientras no se sepa, no se inventa.
 *
 * POR QUE UNA ACTIVITY APARTE Y NO UN CAMBIO EN MainActivity:
 *   Aislar el riesgo. MainActivity es el punto de entrada en produccion; este
 *   badge es cosmético. Una Activity nueva se puede borrar del manifest sin
 *   tocar una sola linea del flujo real. El agente sigue funcionando igual si
 *   este fichero desaparece.
 *
 * TRIGGER (desde el PC, sin tocar la UI del televisor):
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es label "AI-SR 4K"
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --ez hide true
 *
 * PERMISO: necesita SYSTEM_ALERT_WINDOW (ya declarado en el manifest) y el appop
 * concedido. Se concede con:
 *   adb shell appops set com.ape.crystalagent SYSTEM_ALERT_WINDOW allow
 * Si el appop no esta, el badge hace fail-honest: NO revienta, termina y deja un
 * log; el agente sigue vivo.
 */
class UpscaleBadgeActivity : Activity() {

    companion object {
        private const val TAG = "ARA-UpscaleBadge"

        /**
         * Referencia estatica: la ventana se cuelga del WindowManager del sistema,
         * no de la Activity, asi que sobrevive al finish() y se puede quitar
         * desde una segunda invocacion. Sin esto habria que reiniciar la app para
         * esconderlo.
         */
        @Volatile
        private var badge: TextView? = null

        @Volatile
        private var wm: WindowManager? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val hide = intent?.getBooleanExtra("hide", false) ?: false
        val label = intent?.getStringExtra("label") ?: "UPSCALING"

        if (hide) {
            remove()
            finish()
            return
        }

        show(label)
        // La Activity no tiene UI propia: el badge vive en una ventana aparte.
        // Se cierra en el acto para no robar el foco al reproductor.
        finish()
    }

    private fun show(text: String) {
        // Idempotente: si ya hay badge, primero se quita para no apilar ventanas.
        remove()

        val context: Context = applicationContext
        val manager = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        if (manager == null) {
            android.util.Log.w(TAG, "sin WindowManager: no se pinta el badge")
            return
        }

        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val tv = TextView(context).apply {
            this.text = text
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            letterSpacing = 0.08f

            // Fondo redondeado semitransparente: legible sobre 4K HDR sin tapar
            // imagen. Azul APE (#00AAFF) al 80 %.
            val bg = GradientDrawable().apply {
                setColor(Color.parseColor("#CC00AAFF"))
                cornerRadius = dp(6).toFloat()
            }
            background = bg
            setPadding(dp(18), dp(8), dp(18), dp(8))

            // Sin tocar: el operador no debe pulsar el badge por accidente.
            isClickable = false
            isFocusable = false
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            // Esquina superior derecha: fuera del centro de la imagen y fuera de
            // la zona donde OTT Navigator pone su barra de informacion.
            gravity = Gravity.TOP or Gravity.END
            x = dp(28)
            y = dp(28)
        }

        // Fail-honest: si el appop no esta concedido, addView lanza y aqui se
        // captura. El badge no aparece, pero el agente NO se cae.
        val added = runCatching { manager.addView(tv, params) }.isSuccess
        if (!added) {
            android.util.Log.w(
                TAG,
                "no se pudo pintar el badge: falta SYSTEM_ALERT_WINDOW " +
                    "(adb shell appops set com.ape.crystalagent SYSTEM_ALERT_WINDOW allow)"
            )
            return
        }

        badge = tv
        wm = manager
        android.util.Log.i(TAG, "badge visible: $text")
    }

    private fun remove() {
        val v = badge ?: return
        val manager = wm
        runCatching { manager?.removeView(v) }
        badge = null
        wm = null
        android.util.Log.i(TAG, "badge retirado")
    }

    // La ventana NO se retira en onDestroy a proposito: el badge debe sobrevivir
    // a la Activity para quedarse mientras el operador ve la tele. Se retira con
    // --ez hide true o al force-stop del paquete.
}
