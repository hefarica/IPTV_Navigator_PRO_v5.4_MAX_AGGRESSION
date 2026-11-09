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
    private lateinit var shim: TextView
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
        runCatching { CaptureWatchdogService.start(this) }
        // BG19 (t57): abrir la app garantiza el daemon (antes sólo el botón/onboarding lo arrancaban).
        runCatching { AgentService.ensureRunning(this, "app_open") }
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
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(20) }
            setOnClickListener {
                val t = token.text.toString().trim()
                if (t.length < 16) { toastText("Token demasiado corto"); return@setOnClickListener }
                if (t == cfg.stateToken) { toastText("Bearer y SSE deben ser distintos"); return@setOnClickListener }
                cfg.setToken(t)
                token.setText("")
                Thread { TokenVaultClient.backup(cfg) }.start()
                AgentService.start(this@MainActivity)
                flow?.start { step, ok, detail -> runOnUiThread { toastText("[$step] ${if (ok) "OK" else "…"} $detail") } }
            }
        }
        val stateToken = EditText(this).apply {
            hint = "SSE TOKEN (/ara/state)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
            isFocusableInTouchMode = true
            setTextColor(ink); setHintTextColor(muted)
            setBackgroundColor(Color.rgb(255, 255, 255))
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        val saveState = Button(this).apply {
            text = "Guardar SSE token (solo estado)"
            setTextColor(ink); background = round(Color.rgb(226, 232, 240))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(12); bottomMargin = dp(16) }
            setOnClickListener {
                val t = stateToken.text.toString().trim()
                if (t.length < 16) { toastText("SSE token demasiado corto"); return@setOnClickListener }
                if (t == cfg.eventToken) { toastText("SSE y Bearer deben ser distintos"); return@setOnClickListener }
                cfg.setStateToken(t)
                stateToken.setText("")
                Thread { TokenVaultClient.backup(cfg) }.start()
                toastText("SSE token guardado")
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
        content.addView(text("SSE token separado para /ara/state", 12f, muted))
        content.addView(stateToken)
        content.addView(saveState)
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
        // ── REA · Catalogo JIT ────────────────────────────────────────────────
        // Pantalla interna: muestra las URLs que CONFIRMA el VPS y abre OTT.
        // Vive aqui DENTRO (sin icono propio) porque el operador pidio que todo
        // quede en APE Crystal Agent: un segundo LAUNCHER la haria parecer otra APK.
        val jitLink = Button(this).apply {
            text = "REA · Catalogo JIT"
            textSize = 13f
            isAllCaps = false
            setOnClickListener {
                runCatching { startActivity(android.content.Intent(this@MainActivity, JitLinkActivity::class.java)) }
            }
        }
        content.addView(jitLink)

        val play = Button(this).apply {
            text = "Reproducir en ARA · Crystal UHD"
            setTextColor(Color.WHITE); background = round(accent)
            setOnClickListener {
                val u = url.text.toString().trim()
                if (!u.startsWith("http://") && !u.startsWith("https://")) { toastText("URL inválida"); return@setOnClickListener }
                // La lista puede traer la biblioteca LAB en metadata chunked.
                // Se parsea en segundo plano; el player arranca sin esperar.
                Thread {
                    runCatching { ListLoader(cfg).loadStreaming(u) { } }
                        .onFailure { android.util.Log.w("ApeListLoader", "metadata/list: ${it.message}") }
                }.start()
                startActivity(Intent(this@MainActivity, PlayerActivity::class.java).putExtra("url", u))
            }
        }
        content.addView(url)
        content.addView(play)

        // ── OTTSHIM · motor de empuje (proxy loopback + pin de variante + QoE) ────────
        // Va DENTRO de este APK (módulo :shim): se instala y actualiza con ARA
        // (SelfUpdateManager valida sha256 + pin de firma). Arranque MANUAL a propósito:
        // un update de ARA no debe tocar la reproducción sin que el operador lo pida.
        content.addView(sectionTitle("OTTSHIM · MOTOR DE EMPUJE"))
        shim = body(); content.addView(cardView(shim))
        val shimStart = Button(this).apply {
            text = "Arrancar shim con la URL de arriba"
            setTextColor(ink); background = round(Color.rgb(226, 232, 240))
            setOnClickListener {
                val u = url.text.toString().trim()
                if (!u.startsWith("http://") && !u.startsWith("https://")) {
                    toastText("pon una URL fuente arriba"); return@setOnClickListener
                }
                ShimBridge.start(this@MainActivity, u, null, 0)
                refresh.postDelayed({ toastText(ShimBridge.line()) }, 900)
            }
        }
        val shimStop = Button(this).apply {
            text = "Parar shim"
            setTextColor(ink); background = round(Color.rgb(226, 232, 240))
            setOnClickListener {
                ShimBridge.stop(this@MainActivity)
                toastText("shim parado")
            }
        }
        content.addView(shimStart)
        content.addView(shimStop)
        setContentView(root)

        ticker = object : Runnable {
            override fun run() {
                update(cfg, uhd)
                refresh.postDelayed(this, 1000L)
            }
        }
        refresh.post(ticker!!)
        // Estado del shim: lectura de /health en hilo aparte (no bloquea la UI) cada 2 s.
        val shimTicker = object : Runnable {
            override fun run() {
                Thread {
                    ShimBridge.refresh()
                    val txt = ShimBridge.line()
                    runOnUiThread { if (this@MainActivity::shim.isInitialized) shim.text = txt }
                }.start()
                refresh.postDelayed(this, 2000L)
            }
        }
        refresh.post(shimTicker)
        // Prueba/automatización: cargar metadata de una lista sin pasar por la UI.
        intent?.getStringExtra("list_url")?.trim()?.takeIf { it.startsWith("http") }?.let { lu ->
            Thread {
                runCatching { ListLoader(cfg).loadStreaming(lu) { } }
                    .onFailure { android.util.Log.w("ApeListLoader", "metadata/list: ${it.message}") }
            }.start()
        }
        // [ARASHIM] Hook de arranque del shim por intent (mismo patrón que "list_url").
        // Sirve para diagnóstico/automatización desde adb sin tocar la UI y sin abrir el
        // service: ProxyService sigue sin exportar. La fuente se pasa explícita.
        intent?.getStringExtra("shim_src")?.trim()
            ?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            ?.let { shimSrc ->
                val kbps = intent?.getIntExtra("shim_kbps", 0) ?: 0
                ShimBridge.start(this, shimSrc, null, kbps)
                refresh.postDelayed({ toastText(ShimBridge.line()) }, 900)
            }
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
            append("Bitrate medido (ventana 4 s): ").append(AraStatus.bitrateKbps)
                .append(" kbps · red real(raw, no decide) ").append(AraStatus.bitrateNetworkKbps)
                .append(" · techo de variante ").append(AraStatus.bitrateMaxVariantKbps).append(" · banda objetivo ")
                .append(AraStatus.bitrateFloorKbps).append('–').append(AraStatus.bitrateCeilKbps)
                .append(" (").append(AraStatus.bitrateSourceBand.ifBlank { "—" })
                .append("→").append(AraStatus.bitrateOutBand.ifBlank { "—" })
                .append(") · buf ").append(AraStatus.bufferPct).append("% · ")
                .append(AraStatus.bitrateState).append('\n')
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
            append("Presets homologados: ").append(AraStatus.lastPresetCount)
                .append(" (Android: ").append(AraStatus.lastPresetAndroid)
                .append(", player: ").append(AraStatus.lastPresetLocal)
                .append(") p50/p95/p99/max: ")
                .append(AraStatus.lastPresetP50).append('/').append(AraStatus.lastPresetP95).append('/')
                .append(AraStatus.lastPresetP99).append('/').append(AraStatus.lastPresetMax).append(" ms\n")
            append("Verdad presets: APPLIED ").append(AraStatus.presetApplied)
                .append(" · STORED ").append(AraStatus.presetStored)
                .append(" · DECLARED ").append(AraStatus.presetDeclared).append('\n')
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
