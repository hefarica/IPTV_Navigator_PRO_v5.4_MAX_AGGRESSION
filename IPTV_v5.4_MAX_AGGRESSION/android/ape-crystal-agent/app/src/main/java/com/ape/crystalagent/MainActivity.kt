package com.ape.crystalagent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.ape.fluid.FluidStore

/**
 * Panel ARA: estado activo, métricas UHD/HDR/VPP, VPS/SSE y controles.
 * Luz clara, tipografía grande, tarjetas y refresco cada segundo. Sin player nuevo.
 */
class MainActivity : Activity() {
    private var flow: OnboardingFlow? = null
    private val refresh = Handler(Looper.getMainLooper())
    private lateinit var general: TextView
    private lateinit var uhd: TextView
    private lateinit var vps: TextView
    private lateinit var playback: TextView
    private var ticker: Runnable? = null

    private val bg = Color.rgb(245, 247, 250)
    private val card = Color.WHITE
    private val ink = Color.rgb(24, 33, 44)
    private val muted = Color.rgb(90, 104, 120)
    private val accent = Color.rgb(15, 118, 110)
    private val good = Color.rgb(22, 128, 80)
    private val bad = Color.rgb(176, 48, 48)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Display4K.apply(this)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        // [crashfix v4] El constructor de ADB/onboarding no debe tumbar la UI.
        flow = runCatching { OnboardingFlow(this) }.getOrNull()
        val cfg = Config(this)

        val root = ScrollView(this).apply { setBackgroundColor(bg) }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(36))
        }
        root.addView(content)

        content.addView(text("APE · ARA", 30f, ink, true))
        content.addView(text("Panel de estado, UHD y VPS en vivo", 15f, muted))

        val token = EditText(this).apply {
            hint = "TOKEN Bearer"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
            setTextColor(ink); setHintTextColor(muted)
            setBackgroundColor(Color.rgb(255, 255, 255))
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        val save = Button(this).apply {
            text = "Guardar token y arrancar ARA (sin WG)"
            setTextColor(Color.WHITE); background = round(accent)
            setOnClickListener {
                val t = token.text.toString().trim()
                if (t.length < 16) { toastText("Token demasiado corto"); return@setOnClickListener }
                cfg.setToken(t)
                token.setText("")
                AgentService.start(this@MainActivity)
                flow?.start { step, ok, detail -> runOnUiThread { toastText("[$step] ${if (ok) "OK" else "…"} $detail") } }
            }
        }
        val grant = Button(this).apply {
            text = "Conceder permiso (Depuración inalámbrica ON)"
            setTextColor(ink); background = round(Color.rgb(226, 232, 240))
            setOnClickListener {
                flow?.retryGrant { ok, detail -> runOnUiThread { toastText(if (ok) "✓ $detail" else "… $detail") } }
            }
        }

        content.addView(sectionTitle("CONEXIÓN Y PERMISO"))
        content.addView(token)
        content.addView(save)
        content.addView(grant)

        content.addView(sectionTitle("ESTADO GENERAL"))
        general = body(); content.addView(cardView(general))

        content.addView(sectionTitle("UHD / HDR / CRYSTAL"))
        uhd = body(); content.addView(cardView(uhd))

        content.addView(sectionTitle("VPS / ARA FEEDBACK"))
        vps = body(); content.addView(cardView(vps))

        content.addView(sectionTitle("REPRODUCCIÓN"))
        playback = body(); content.addView(cardView(playback))

        val diag = Button(this).apply {
            text = "Diagnóstico de settings del TV"
            setTextColor(ink); background = round(Color.rgb(226, 232, 240))
            setOnClickListener { toastText(SettingsApplier(this@MainActivity).diagnosticReport().takeLast(1800)) }
        }
        content.addView(diag)

        content.addView(sectionTitle("PROBAR URL EN ARA"))
        val url = EditText(this).apply {
            hint = "https://…/canal.m3u8"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true); setTextColor(ink); setHintTextColor(muted)
            setBackgroundColor(Color.WHITE); setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        val play = Button(this).apply {
            text = "Reproducir en ARA · Crystal UHD"
            setTextColor(Color.WHITE); background = round(accent)
            setOnClickListener {
                val u = url.text.toString().trim()
                if (!u.startsWith("http://") && !u.startsWith("https://")) { toastText("URL inválida"); return@setOnClickListener }
                startActivity(Intent(this@MainActivity, PlayerActivity::class.java).putExtra("url", u))
            }
        }
        content.addView(url)
        content.addView(play)
        setContentView(root)

        ticker = object : Runnable {
            override fun run() {
                update(cfg, uhd)
                refresh.postDelayed(this, 1000L)
            }
        }
        refresh.post(ticker!!)
        beginOnboarding()
    }

    private fun update(cfg: Config, uhdView: TextView) {
        val now = System.currentTimeMillis()
        val sseAge = AraStatus.ageMs(AraStatus.lastSseAt, now)
        val hbAge = AraStatus.ageMs(AraStatus.lastHeartbeatAt, now)
        val display = runCatching {
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val d = wm.defaultDisplay
            val m = android.util.DisplayMetrics()
            @Suppress("DEPRECATION") d.getRealMetrics(m)
            val hdr = if (Build.VERSION.SDK_INT >= 24)
                d.hdrCapabilities?.supportedHdrTypes?.toList() ?: emptyList()
            else emptyList()
            Triple(m.widthPixels, m.heightPixels, hdr)
        }.getOrNull()
        val dw = display?.first ?: 0
        val dh = display?.second ?: 0
        val hdrTypes = display?.third ?: emptyList()
        val hdrNames = hdrTypes.joinToString(", ") {
            when (it) { 1 -> "Dolby Vision"; 2 -> "HDR10"; 3 -> "HLG"; 4 -> "HDR10+"; else -> "tipo $it" }
        }.ifBlank { "sin datos" }
        // [crashfix v4] FluidStore puede no estar disponible en un update/device raro.
        val prefs = runCatching { FluidStore.prefs(this) }.getOrNull()
        val image = runCatching { prefs?.getString("image_profile", "crystal_uhd") }.getOrNull() ?: "crystal_uhd"
        val buffer = runCatching { prefs?.getString("buffer_profile", "balanced") }.getOrNull() ?: "balanced"
        val enhance = runCatching { prefs?.getBoolean("enhance_enabled", true) }.getOrNull() ?: true
        val hdrConv = runCatching { Settings.Global.getString(contentResolver, "hdr_conversion_mode") }.getOrNull()
        val prefW = runCatching { Settings.Global.getString(contentResolver, "user_preferred_resolution_width") }.getOrNull()
        val prefH = runCatching { Settings.Global.getString(contentResolver, "user_preferred_resolution_height") }.getOrNull()

        general.text = buildString {
            append("Servicio ARA: ").append(if (AraStatus.serviceRunning) "ACTIVO" else "DETENIDO").append('\n')
            append("Token: ").append(if (cfg.hasToken()) "provisionado" else "FALTA").append('\n')
            append("WireGuard: OFF (directo HTTPS/SSE)\n")
            append("Heartbeat: ").append(AraStatus.ageLabel(AraStatus.lastHeartbeatAt))
                .append(if (hbAge < 60_000) "  ·  OK" else "  ·  sin latido reciente").append('\n')
            append("SSE/feedforward: ").append(AraStatus.ageLabel(AraStatus.lastSseAt))
                .append(if (sseAge < 60_000) "  ·  CONECTADO" else "  ·  esperando").append('\n')
            append("device_id: ").append(cfg.deviceId)
        }

        fun onOff(v: Boolean, what: String) = "$what: ${if (v) "ON" else "OFF"}\n"
        uhdView.text = buildString {
            append("Pantalla: ${dw}x${dh}  ").append(if (dw >= 3840 && dh >= 2160) "→ 4K ON" else "→ <4K").append('\n')
            append("Preferido TV: ").append(prefW ?: "—").append("x").append(prefH ?: "—").append('\n')
            append(onOff(dw >= 3840 && dh >= 2160, "4K UHD"))
            append(onOff(image == "crystal_uhd" && enhance, "Crystal UHD shader"))
            append("Perfil de imagen: ").append(image).append("  ·  Buffer: ").append(buffer).append('\n')
            append("HDR soportados: ").append(hdrNames).append('\n')
            append("hdr_conversion_mode: ").append(hdrConv ?: "—").append('\n')
            append("Último track: ").append(AraStatus.lastTrack.ifBlank { "sin reproducción" }).append('\n')
            append("Player: ").append(if (AraStatus.playerActive) "ACTIVO" else "inactivo")
        }

        val vpp = when (AraStatus.vppAllowed) {
            true -> "ON  (${AraStatus.vppReason.ifBlank { "soc_allowlisted" }})"
            false -> "OFF (${AraStatus.vppReason.ifBlank { "no_caps/soc" }})"
            null -> "sin dato"
        }
        vps.text = buildString {
            append("VPP: ").append(vpp).append('\n')
            append("Settings recibidos: ").append(AraStatus.lastSettings.size).append('\n')
            append("Aplicados/rechazados: ").append(AraStatus.lastApplied).append(" / ").append(AraStatus.lastRejected).append('\n')
            append("Último SSE: ").append(AraStatus.ageLabel(AraStatus.lastSseAt)).append('\n')
            append("Directiva: ").append(AraStatus.lastDirective?.toString()?.take(900) ?: "sin directiva")
        }
        playback.text = buildString {
            append("Estado: ").append(if (AraStatus.playerActive) "REPRODUCIENDO" else "detenido").append('\n')
            append("Track: ").append(AraStatus.lastTrack.ifBlank { "—" }).append('\n')
            append("Perfil: ").append(image).append("  ·  Buffer: ").append(buffer).append('\n')
            append("HDR: ").append(if (hdrTypes.isNotEmpty()) hdrNames else "sin datos").append('\n')
            append("Nota: los valores son del device/servicio; no se inventan píxeles.")
        }
    }

    private fun text(s: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = sp; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun sectionTitle(s: String) = text(s, 13f, accent, true).apply {
        setPadding(0, dp(22), 0, dp(8))
    }

    private fun body() = TextView(this).apply {
        textSize = 14f; setTextColor(ink); setLineSpacing(0f, 1.15f)
        setPadding(dp(16), dp(14), dp(16), dp(14))
    }

    private fun cardView(v: TextView) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = round(card, stroke = Color.rgb(226, 232, 240))
        addView(v)
    }

    private fun round(color: Int, stroke: Int = color): GradientDrawable = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(12).toFloat()
        setStroke(dp(1), stroke)
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun toastText(s: String) {
        if (s.isBlank()) return
        android.widget.Toast.makeText(this, s.take(220), android.widget.Toast.LENGTH_SHORT).show()
    }

    private fun beginOnboarding() {
        // [crashfix] el arranque del servicio/ADB es best-effort; nunca debe mostrar force close.
        runCatching {
            flow?.start { step, ok, detail -> runOnUiThread { toastText("[$step] ${if (ok) "OK" else "…"} $detail") } }
        }.onFailure { toastText("Onboarding no disponible; panel local activo") }
    }

    override fun onDestroy() {
        ticker?.let { refresh.removeCallbacks(it) }
        super.onDestroy()
    }
}
