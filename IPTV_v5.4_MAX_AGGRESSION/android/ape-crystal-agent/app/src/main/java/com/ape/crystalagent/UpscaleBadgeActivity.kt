package com.ape.crystalagent

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView

/**
 * Badge de upscaling DINAMICO en el overlay.
 *
 * PEDIDO DEL OPERADOR (textual):
 *   "Necesito que al reproducir en OTT (siempre tiene que ser por alli), aparezca un
 *    aviso de upscaling de que resolucion a cual de salida esta llevando la imagen,
 *    si real o simulada"
 *
 * QUE MUESTRA
 *   <entrada> → <salida>
 *   REAL (nativa)  |  SIMULADA (upscale ×N)  |  REDUCIDA  |  entrada N/D
 *
 * DE DONDE SALE CADA DATO, Y DE DONDE NO
 *   SALIDA : DisplayManager → el modo ACTIVO del display. Medido, siempre disponible.
 *            En el ONN 4K hoy: id=185 → 3840x2160 @ 59.94.
 *   ENTRADA: la del stream en reproduccion. NO se puede leer desde otra app sin root
 *            (dumpsys media.player da Permission Denial). Se recibe por el extra
 *            `input`, y quien la sepa la pasa: el agente tras sondear el manifest del
 *            canal, o el VPS por SSE.
 *   SI NO SE SABE, SE DICE "N/D" — NUNCA SE INVENTA. Es la misma regla del panel del
 *   agente: no repetir la leyenda cuando no hay medicion. Un badge que dice "SIMULADA"
 *   sin saber la entrada seria exactamente el problema que el operador denuncio.
 *
 * POR QUE SIGUE SIENDO UNA ACTIVITY APARTE
 *   MainActivity es el punto de entrada en produccion; este badge es cosmetico. Si se
 *   borra del manifest, el agente sigue funcionando igual.
 *
 * TRIGGER (desde el PC, sin tocar la UI del televisor)
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es input "1920x1080"
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es input "3840x2160"
 *   adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --ez hide true
 *
 * PERMISO: SYSTEM_ALERT_WINDOW (ya declarado) y el appop concedido:
 *   adb shell appops set com.ape.crystalagent SYSTEM_ALERT_WINDOW allow
 * Si falta, el badge hace fail-honest: no revienta, termina y deja un log.
 */
class UpscaleBadgeActivity : Activity() {

    companion object {
        private const val TAG = "ARA-UpscaleBadge"
        private var badge: TextView? = null
        private var wm: WindowManager? = null
        private var ticker: Runnable? = null

        /**
         * Formatea el texto del badge a partir de la entrada (opcional) y el display.
         * Devuelve tambien el color de acento: verde si es real, ambar si es simulada,
         * gris si no se sabe. El color es informacion, no decoracion.
         */
        @JvmStatic
        fun texto(input: String?, outW: Int, outH: Int): Triple<String, Int, String> {
            val em = Regex("^\\s*(\\d{2,5})\\s*[xX×]\\s*(\\d{2,5})\\s*$")
            val m = input?.let { em.find(it) }
            if (m == null) {
                // Sin entrada no se puede afirmar nada sobre el escalado.
                return Triple(
                    "$outW×$outH · salida nativa\nentrada: N/D",
                    Color.parseColor("#94A3B8"),
                    "N/D"
                )
            }
            val iw = m.groupValues[1].toIntOrNull() ?: 0
            val ih = m.groupValues[2].toIntOrNull() ?: 0
            if (iw <= 0 || ih <= 0) {
                return Triple("$outW×$outH · salida nativa\nentrada: N/D", Color.parseColor("#94A3B8"), "N/D")
            }
            val inTxt = "$iw×$ih"
            val outTxt = "$outW×$outH"
            return when {
                iw == outW && ih == outH -> Triple(
                    "$inTxt → $outTxt\nREAL (nativa)",
                    Color.parseColor("#22C55E"),   // verde
                    "REAL"
                )
                outW > iw || outH > ih -> {
                    val fx = if (iw > 0) outW.toDouble() / iw else 0.0
                    val fy = if (ih > 0) outH.toDouble() / ih else 0.0
                    val f = maxOf(fx, fy)
                    val fTxt = if (f >= 1.05) String.format("×%.2f", f) else ""
                    Triple(
                        "$inTxt → $outTxt\nSIMULADA (upscale $fTxt)".trim(),
                        Color.parseColor("#F59E0B"),  // ambar
                        "SIMULADA"
                    )
                }
                else -> Triple(
                    "$inTxt → $outTxt\nREDUCIDA (downscale)",
                    Color.parseColor("#EF4444"),      // rojo: esto NO se debe hacer
                    "REDUCIDA"
                )
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.getBooleanExtra("hide", false) == true) {
            removeBadge()
            finish()
            return
        }
        val input = intent?.getStringExtra("input")?.trim()
        showBadge(input)
        finish()
    }

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    /** El modo ACTIVO del display: la resolucion de SALIDA real. */
    private fun outSize(): Pair<Int, Int> {
        return try {
            val dm = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val d = dm?.getDisplay(Display.DEFAULT_DISPLAY)
            val m = d?.mode
            if (m != null) Pair(m.physicalWidth, m.physicalHeight) else Pair(0, 0)
        } catch (t: Throwable) {
            Pair(0, 0)
        }
    }

    private fun showBadge(input: String?) {
        try {
            val w = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            )
            w.gravity = Gravity.TOP or Gravity.END
            w.x = dp(28)
            w.y = dp(28)

            val tv = badge ?: TextView(this).apply {
                setTextColor(Color.WHITE)
                setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 13f)
                typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                setPadding(dp(12), dp(8), dp(12), dp(8))
            }

            fun pintar() {
                val (ow, oh) = outSize()
                val (txt, accent, _) = texto(input, ow, oh)
                tv.text = txt
                val bg = GradientDrawable()
                bg.cornerRadius = dp(10).toFloat()
                bg.setColor(Color.parseColor("#CC0B1220"))   // fondo azul muy oscuro, 80%
                bg.setStroke(dp(2), accent)                   // el borde dice el veredicto
                tv.background = bg
            }
            pintar()

            wm?.removeView(tv)
            val wmgr = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            wmgr.addView(tv, w)
            wm = wmgr
            badge = tv

            // El modo del display puede cambiar (zapping, cambio de canal). Se refresca
            // cada 2 s mientras el proceso viva; el coste es leer un campo.
            ticker?.let { t -> android.os.Handler(mainLooper).removeCallbacks(t) }
            val h = android.os.Handler(mainLooper)
            val t = object : Runnable {
                override fun run() {
                    try { pintar() } catch (_: Throwable) { }
                    h.postDelayed(this, 2000L)
                }
            }
            ticker = t
            h.postDelayed(t, 2000L)
        } catch (t: Throwable) {
            // Fail-honest: sin SYSTEM_ALERT_WINDOW no se pinta y no se rompe nada.
            android.util.Log.w(TAG, "badge no mostrado: ${t.message}")
        }
    }

    private fun removeBadge() {
        try {
            ticker?.let { t -> android.os.Handler(mainLooper).removeCallbacks(t) }
            ticker = null
            badge?.let { v -> wm?.removeView(v) }
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "remove: ${t.message}")
        } finally {
            badge = null
            wm = null
        }
    }
}
