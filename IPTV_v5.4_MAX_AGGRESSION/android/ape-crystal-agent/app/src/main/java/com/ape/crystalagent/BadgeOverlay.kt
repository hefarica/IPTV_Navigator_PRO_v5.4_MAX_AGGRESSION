package com.ape.crystalagent

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView

/**
 * Badge de upscaling DINAMICO en el overlay — montado SIN Activity.
 *
 * POR QUE EXISTE ESTE OBJETO (defecto medido 2026-11-14, fix t68)
 *   AgentService lanzaba `startActivity(UpscaleBadgeActivity)` desde su ticker cada vez
 *   que detectaba reproduccion. `startActivity` desde un Service TRAE una Activity al
 *   primer plano aunque lleve FLAG_ACTIVITY_NEW_TASK: una Activity en primer plano pausa
 *   al player de detras (OTT se quedaba en "Buffering: 0%").
 *
 *   MEDIDO en el device con `dumpsys activity activities`: tras lanzar la Activity del
 *   badge, el foco NO se quedaba en el badge sino en
 *   `com.ape.crystalagent/.MainActivity` — la raiz de la tarea del ARA. Eso es
 *   exactamente lo que el operador describio: "me salta y me lleva al menu del ARA".
 *   El `finish()` en finally (commit 15b64da5) evitaba que la Activity quedara abierta,
 *   pero no evitaba que naciera en primer plano y arrastrara su tarea.
 *
 *   Este objeto monta el MISMO TextView con WindowManager.addView(TYPE_APPLICATION_OVERLAY)
 *   desde el proceso del Service. Sin Activity no hay tarea, no hay robo de foco y OTT
 *   sigue reproduciendo. El overlay se cuelga del WindowManager y sobrevive a todo.
 *
 * QUE MUESTRA
 *   <entrada> → <salida>  ·  REAL (nativa) | SIMULADA (upscale ×N) | REDUCIDA | entrada N/D
 *
 * DE DONDE SALE CADA DATO, Y DE DONDE NO
 *   SALIDA : DisplayManager -> el modo ACTIVO del display. Medido, siempre disponible.
 *   ENTRADA: la del stream en reproduccion. NO se puede leer desde otra app sin root
 *            (dumpsys media.player da Permission Denial). Se recibe por parametro, y
 *            quien la sepa la pasa (el agente tras sondear el manifest, o el VPS por SSE).
 *   SI NO SE SABE, SE DICE "N/D" — NUNCA SE INVENTA. Un badge que dijera "SIMULADA" sin
 *   saber la entrada seria justo la leyenda que el operador denuncio.
 *
 * PERMISO: SYSTEM_ALERT_WINDOW (declarado) + appop concedido:
 *   adb shell appops set com.ape.crystalagent SYSTEM_ALERT_WINDOW allow
 * Si falta, fail-honest: se registra y no se rompe nada; el agente sigue vivo.
 *
 * HILOS: se puede llamar desde cualquier hilo (el ticker del Service corre en uno de
 * fondo). Todo el trabajo de WindowManager se postea al hilo principal.
 */
object BadgeOverlay {

    private const val TAG = "ARA-BadgeOverlay"

    /** Cada cuanto se refresca el modo del display mientras el badge esta montado. */
    private const val REFRESCO_MS = 2_000L

    private var badge: TextView? = null
    private var wm: WindowManager? = null
    private var ticker: Runnable? = null
    private var lastInput: String? = null
    private var lastCanal: String? = null

    private val main: Handler by lazy { Handler(Looper.getMainLooper()) }

    /** true si hay una ventana de overlay montada ahora mismo. */
    @Volatile
    @JvmStatic
    var mounted: Boolean = false
        private set

    // ── API publica ────────────────────────────────────────────────────────────

    /**
     * Monta (o actualiza) el badge sobre lo que se este viendo.
     *
     * @param input resolucion de ENTRADA conocida ("1920x1080"); null si no se sabe.
     * @param canal nombre del canal en reproduccion, si se conoce.
     */
    @JvmStatic
    fun show(ctx: Context, input: String? = null, canal: String? = null) {
        val app = ctx.applicationContext
        lastInput = input?.trim()
        lastCanal = canal?.trim()
        main.post { montar(app) }
    }

    /** Retira el badge. Idempotente: si no habia nada montado, no hace nada. */
    @Suppress("UNUSED_PARAMETER")
    @JvmStatic
    fun hide(ctx: Context) {
        main.post { desmontar() }
    }

    // ── Montaje real (hilo principal) ──────────────────────────────────────────

    private fun montar(ctx: Context) {
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
            w.x = dp(ctx, 28)
            w.y = dp(ctx, 28)
            // Nombre de la ventana: sin Activity, el WindowManager no le pondria ninguno y
            // el overlay seria invisible en `dumpsys window windows`. Con titulo se puede
            // verificar que esta montado:
            //   adb shell dumpsys window windows | grep -c UpscaleBadge   -> > 0
            w.setTitle("UpscaleBadge")

            val tv = badge ?: TextView(ctx).apply {
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                setPadding(dp(ctx, 12), dp(ctx, 8), dp(ctx, 12), dp(ctx, 8))
            }

            pintar(ctx, tv)

            // Re-montaje seguro: se quita la vista anterior del WindowManager (si seguia
            // enganchada) antes de volver a anadirla, para no acumular ventanas.
            val wmgr = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            try { wm?.removeView(tv) } catch (_: Throwable) { }
            wmgr.addView(tv, w)

            wm = wmgr
            badge = tv
            mounted = true

            // El modo del display cambia al zapear. Se refresca cada 2 s mientras viva.
            ticker?.let { t -> main.removeCallbacks(t) }
            val t = object : Runnable {
                override fun run() {
                    try { pintar(ctx, tv) } catch (_: Throwable) { }
                    main.postDelayed(this, REFRESCO_MS)
                }
            }
            ticker = t
            main.postDelayed(t, REFRESCO_MS)
        } catch (t: Throwable) {
            // Fail-honest: sin SYSTEM_ALERT_WINDOW no se pinta y NO se rompe nada.
            mounted = false
            android.util.Log.w(TAG, "badge no mostrado: ${t.message}")
        }
    }

    private fun desmontar() {
        try {
            ticker?.let { t -> main.removeCallbacks(t) }
            ticker = null
            badge?.let { v -> wm?.removeView(v) }
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "remove: ${t.message}")
        } finally {
            badge = null
            wm = null
            mounted = false
        }
    }

    private fun pintar(ctx: Context, tv: TextView) {
        val (ow, oh) = outSize(ctx)
        val (txt, accent, _) = texto(lastInput, ow, oh, lastCanal)
        tv.text = txt
        val bg = GradientDrawable()
        bg.cornerRadius = dp(ctx, 10).toFloat()
        bg.setColor(Color.parseColor("#CC0B1220"))   // fondo azul muy oscuro, 80%
        bg.setStroke(dp(ctx, 2), accent)             // el borde dice el veredicto
        tv.background = bg
    }

    private fun dp(ctx: Context, v: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics
        ).toInt()

    /** El modo ACTIVO del display: la resolucion de SALIDA real. */
    private fun outSize(ctx: Context): Pair<Int, Int> {
        return try {
            val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
            val d = dm?.getDisplay(Display.DEFAULT_DISPLAY)
            val m = d?.mode
            if (m != null) Pair(m.physicalWidth, m.physicalHeight) else Pair(0, 0)
        } catch (t: Throwable) {
            Pair(0, 0)
        }
    }

    // ── Formato del texto (puro: sin contexto, sin ventanas) ───────────────────

    /**
     * Formatea el texto del badge y devuelve (texto, color de acento, veredicto).
     * Verde si es real, ambar si es simulada, gris si no se sabe, rojo si reduce.
     * El color es informacion, no decoracion.
     */
    @JvmStatic
    fun texto(input: String?, outW: Int, outH: Int): Triple<String, Int, String> =
        texto(input, outW, outH, null)

    /** Igual que [texto] anteponiendo el nombre del canal en su propia linea. */
    @JvmStatic
    fun texto(input: String?, outW: Int, outH: Int, canal: String?): Triple<String, Int, String> {
        val base = textoMedido(input, outW, outH)
        val c = canal?.trim().orEmpty()
        if (c.isEmpty()) return base
        val corto = if (c.length > 34) c.substring(0, 34) + "…" else c
        return Triple("$corto\n${base.first}", base.second, base.third)
    }

    private fun textoMedido(input: String?, outW: Int, outH: Int): Triple<String, Int, String> {
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
