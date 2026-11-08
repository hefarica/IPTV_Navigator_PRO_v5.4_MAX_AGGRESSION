package com.ape.crystalagent

import android.content.Context
import android.os.Handler
import android.os.SystemClock
import android.os.Looper
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.ape.fluid.FluidBridge
import com.ape.fluid.FluidStore

/**
 * Player propio con TRACK-SELECTION HEVC-first (F3). Si el master del proveedor ofrece HEVC + AVC,
 * fuerza HEVC — lo que OTT Navigator NO hizo (su ABR cayó a AVC). El VpnService (WG full-tunnel)
 * intercepta TODO el tráfico del proceso, así que no hace falta OkHttpDataSource.
 *
 * HONESTO (truth-guard): NO transcodifica; solo ELIGE la mejor variante REAL que el proveedor sirva.
 * Si el proveedor solo ofrece AVC esa sesión, reproduce AVC (no inventa HEVC). UltraEnhance (F6) y el
 * AI-PQ del SoC realzan el frame aparte.
 */
@UnstableApi
class ApePlayer(private val ctx: Context) {

    private var exo: ExoPlayer? = null
    private lateinit var selector: DefaultTrackSelector
    private val meter = BitrateMeter()
    private var bitrateGuard: BitrateGuard? = null
    /** Último `Tracks` observado: permite reevaluar la banda cada 2 s (ALERT tras 8 s real). */
    @Volatile private var lastTracks: Tracks? = null

    // Fallback de decoder: no cambia URL; reintenta la MISMA URL con una capacidad menor.
    private var currentUrl: String = ""
    private var currentUa: String = DEFAULT_UA
    private var currentHeaders: Map<String, String> = emptyMap()
    private var fallbackChain: List<CodecFallback> = emptyList()
    private var fallbackAttempt: Int = 0
    private var fallbackMax: Pair<Int, Int>? = null

    // NF-02 (BG9): NO hay ticker por instancia. Un único Handler (main) y un único latido GLOBAL
    // en el companion, que sobrevive al cambio de instancia del PlayerHub. Antes cada
    // startRuntimeTicker() creaba un Handler nuevo (y removeCallbacks sobre otro Handler no cancela
    // nada) ⇒ varios tickers vivos; y al soltar la instancia el latido moría (silencio de 35–45 s).
    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }

    fun build(): ExoPlayer {
        // 4K-first: buffer/caché máximos y selección de la mejor variante real.
        val policy = PlaybackPolicy.fromSync(ctx)
        FluidStore.prefs(ctx).edit()
            .putString("buffer_profile", "max")
            .putInt("cache_mib", policy.cacheMiB)
            .putInt("max_height", policy.maxHeight)
            .putInt("buffer_min_s", policy.bufferMinS)
            .putInt("buffer_max_s", policy.bufferMaxS)
            .apply()
        Log.i(TAG, "policy target=${policy.targetWidth}x${policy.targetHeight} max=${policy.maxWidth}x${policy.maxHeight} " +
            "neverDownscale=${policy.neverDownscale} buffer=${policy.bufferMinS}/${policy.bufferMaxS}s cache=${policy.cacheMiB}MiB")
        ImageEnhancer.applyDefaults(ctx)
        FluidBridge.warmup(ctx)
        val sel = DefaultTrackSelector(ctx)
        selector = sel
        sel.parameters = sel.buildUponParameters()
            .setPreferredVideoMimeTypes(MimeTypes.VIDEO_H265, MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264)
            .setMaxVideoSize(policy.maxWidth, policy.maxHeight)
            .setMinVideoSize(0, 0)
            .setForceHighestSupportedBitrate(true)            // no ABR que caiga a 720p
            .setAllowVideoMixedMimeTypeAdaptiveness(false)   // no mezclar HEVC+AVC en ABR
            .setAllowVideoNonSeamlessAdaptiveness(false)      // no cambiar de resolución
            .build()
        // MediaCodec puede fallar incluso con format_supported=YES; el fallback
        // de Media3 permite pasar de decoder HW a SW sin cambiar el codec declarado.
        val renderers = DefaultRenderersFactory(ctx).setEnableDecoderFallback(true)
        val builder = ExoPlayer.Builder(ctx, renderers).setTrackSelector(sel)
        // APE Fluid: buffer/caché/decoder-fallback sobre el player existente (sin player nuevo).
        FluidBridge.configureBuilder(ctx, builder)
        return builder.build().also { p ->
            exo = p
            current = this
            bitrateGuard = BitrateGuard(ctx, meter, p, selector)
            installAnalytics(p)
            p.addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    mainHandler.post { attemptDecoderFallback(p, error) }
                }
            })
            if (!suppressVideoEffects) {
                runCatching {
                    @Suppress("UNCHECKED_CAST")
                    p.setVideoEffects(FluidBridge.effects(ctx) as List<Effect>)
                }.onFailure { Log.w(TAG, "Fluid effects: ${it.message}") }
            } else {
                Log.w(TAG, "efectos GL desactivados por diagnóstico")
            }
        }
    }

    fun playChannel(player: ExoPlayer, url: String, ua: String = DEFAULT_UA,
                    headers: Map<String, String> = emptyMap()) {
        currentUrl = url
        currentUa = ua
        currentHeaders = headers
        fallbackChain = emptyList()
        fallbackAttempt = 0
        fallbackMax = null
        openMedia(player, url, ua, headers)
    }

    private fun openMedia(player: ExoPlayer, url: String, ua: String,
                          headers: Map<String, String> = emptyMap()) {
        val policy = PlaybackPolicy.fromSync(ctx)
        // BG1-FIX: la ventana de 4 s no debe mezclar bytes del canal anterior tras un zap.
        // F11 (BG5): además se reinician los temporizadores del guard (belowSince / ALERT / lock).
        meter.reset()
        bitrateGuard?.reset()
        lastTracks = null
        if (url.contains("/sdr/")) {
            // El fallback SDR es siempre 1080p: no arrastrar el lock HDR 4K anterior.
            fallbackMax = 1920 to 1080
            AraStatus.trackCodec = ""
            AraStatus.trackW = 0
            AraStatus.trackH = 0
            AraStatus.trackHdr = "SDR"
            AraStatus.trackAt = 0L
            // El compositor GL puede dejar negro el cambio HDR->SDR; el fallback
            // prioriza continuidad.
            runCatching { player.setVideoEffects(emptyList()) }
                .onFailure { Log.w(TAG, "SDR effects off: ${it.message}") }
        }
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(ua)
            .setDefaultRequestProperties(headers)
            .setConnectTimeoutMs(policy.connectTimeoutMs)
            .setReadTimeoutMs(policy.readTimeoutMs)
            .setAllowCrossProtocolRedirects(true)            // sigue el 302 line→CDN
        // Cache + timeouts del pipeline Fluid; NO un DataSource aislado.
        val base = runCatching {
            FluidBridge.dataSource(ctx, http) as DataSource.Factory
        }.getOrDefault(http)
        // Mide bytes REALES que entran (red o caché), no el bitrate declarado del manifest.
        val ds = StatsDataSource.Factory(base, meter)
        val src = HlsMediaSource.Factory(ds).createMediaSource(MediaItem.fromUri(url))
        player.setMediaSource(src)
        player.prepare()
        player.playWhenReady = true
        AraStatus.playerActive = true
        // NF-01/NF-02: el ticker arranca AQUÍ, no sólo en onTracksChanged. Si el player nunca emite
        // un `Tracks` (o emite vacío), el guard debe seguir latiendo en vez de quedarse mudo.
        startRuntimeTicker()
        FluidBridge.attach(ctx, player, url, ua)
        refreshEffects()
        Log.i(TAG, "playChannel HEVC-first no-downscale ua=$ua url=$url")
    }

    /**
     * Decoder fallback: same URL, next capacity from CodecFallbackMatrix.
     * Max 2 retries; never claims a codec the source does not serve.
     */
    private fun attemptDecoderFallback(player: ExoPlayer, error: PlaybackException) {
        if (currentUrl.isEmpty()) return
        if (fallbackAttempt >= 2) {
            Log.w(TAG, "decoder fallback exhausted after ${fallbackAttempt} attempt(s): ${error.message}")
            return
        }
        // HDR init failure on JIT: switch to the same channel's real SDR/H.264
        // variant. Never declare H.264 over the HDR URL; this is a different
        // server-side rendition selected by path.
        if (currentUrl.contains("/jit/live/") && !currentUrl.contains("/sdr/") && !currentUrl.contains("/sdr720/")) {
            val m = Regex("^(.*/jit/live/[^/]+/)(?!sdr/)(.*)$").find(currentUrl)
            val sdrUrl = m?.let { it.groupValues[1] + "sdr/" + it.groupValues[2] }
            if (sdrUrl != null) {
                fallbackAttempt++
                Log.w(TAG, "HDR decoder init failed -> SDR/H.264 same channel: $sdrUrl")
                openMedia(player, sdrUrl, currentUa, currentHeaders)
                return
            }
        }
        if (currentUrl.contains("/sdr/") && !currentUrl.contains("/sdr720/")) {
            val sdr720Url = currentUrl.replace("/sdr/", "/sdr720/")
            fallbackAttempt++
            Log.w(TAG, "SDR 1080 failed -> SDR720/H.264 same channel: $sdr720Url")
            openMedia(player, sdr720Url, currentUa, currentHeaders)
            return
        }
        // TRUTH-GUARD: si la fuente real es AVC, no se puede "fallback" a HEVC
        // sobre la misma URL. Eso cambiaba el codec declarado y dejaba tracks vacíos.
        val srcCodec = (AraStatus.trackCodec ?: "").lowercase()
        Log.w(TAG, "player error code=${error.errorCodeName} name=${error.errorCode} msg=${error.message}")
        if (srcCodec.startsWith("avc") || srcCodec.startsWith("h264")) {
            // Reintento UNA vez con el MISMO codec/URL; jamás abrir HEVC sameUrl.
            if (fallbackAttempt < 1) {
                fallbackAttempt++
                Log.w(TAG, "reintento AVC sameUrl 1/1 (sin cambiar codec)")
                openMedia(player, currentUrl, currentUa, currentHeaders)
            } else {
                Log.w(TAG, "fallback omitido: fuente AVC real; no se declara HEVC sameUrl")
            }
            return
        }
        if (fallbackChain.isEmpty()) {
            fallbackChain = CodecFallbackMatrix.chainFor(
                AraStatus.trackCodec,
                "${AraStatus.trackW}x${AraStatus.trackH}",
                AraStatus.trackFps.toDouble()
            )
        }
        val next = fallbackChain.getOrNull(fallbackAttempt)
        if (next == null) {
            Log.w(TAG, "decoder fallback: no next capacity for ${AraStatus.trackCodec} ${AraStatus.trackW}x${AraStatus.trackH}")
            return
        }
        fallbackAttempt++
        fallbackMax = next.width to next.height
        Log.w(TAG, "decoder fallback ${fallbackAttempt}/2 -> ${next.codec}@${next.resolution}/${next.fps} sameUrl")
        openMedia(player, currentUrl, currentUa, currentHeaders)
    }

    /**
     * Fija la mejor resolución REAL disponible (cap 4K) después de que ExoPlayer
     * parseó el master. Nunca permite que el ABR elija una variante menor.
     *
     *  · 8K presente en el master ⇒ NUNCA se decodifica: se marca `8k_presentation`
     *    (presentación) y el lock se queda en la mejor ≤ 4K.
     *  · Si la mejor real < target (p. ej. sólo 1080p) ⇒ se reproduce y se marca
     *    `4k_upscaled` (upscale de display; no se declara 4K en el wire).
     */
    fun lockHighest(tracks: Tracks) {
        if (!::selector.isInitialized) return
        val policy = PlaybackPolicy.fromSync(ctx)
        var bestPixels = 0
        var bestW = 0
        var bestH = 0
        var sawAbove4k = false
        for (g in tracks.groups) {
            if (g.type != C.TRACK_TYPE_VIDEO) continue
            for (i in 0 until g.length) {
                val f = g.getTrackFormat(i)
                if (f.width <= 0 || f.height <= 0) continue
                val capW = fallbackMax?.first ?: policy.maxWidth
                val capH = fallbackMax?.second ?: policy.maxHeight
                if (f.width > capW || f.height > capH) { sawAbove4k = true; continue }
                val pixels = f.width * f.height
                if (pixels > bestPixels) {
                    bestPixels = pixels; bestW = f.width; bestH = f.height
                }
            }
        }
        if (sawAbove4k && policy.eightKPresentation) {
            Log.i(TAG, "8k_presentation: master con variante >4K; decode capado a 4K (nunca decode 8K)")
        }
        if (bestPixels == 0) return
        try {
            selector.parameters = selector.buildUponParameters()
                .setMinVideoSize(bestW, bestH)
                .setMaxVideoSize(bestW, bestH)
                .setForceHighestSupportedBitrate(true)
                .setAllowVideoNonSeamlessAdaptiveness(false)
                .build()
            Log.i(TAG, "LOCK resolución ${bestW}x$bestH (neverDownscale=${policy.neverDownscale}, min_resolution=${policy.minWidth}x${policy.minHeight})")
            if (bestH < policy.targetHeight) {
                Log.i(TAG, "4k_upscaled: fuente ${bestW}x$bestH < target ${policy.targetWidth}x${policy.targetHeight} (upscale de display, wire intacto)")
            }
        } catch (e: Exception) {
            Log.w(TAG, "lockHighest falló: ${e.message}")
        }
    }

    /** Loguea qué variante eligió el track selector (codec/res/bitrate) — la verdad de tierra. */
    fun logSelected(tracks: Tracks) {
        for (g in tracks.groups) {
            if (g.type == C.TRACK_TYPE_VIDEO) {
                for (i in 0 until g.length) if (g.isTrackSelected(i)) {
                    val f = g.getTrackFormat(i)
                    val line = "mime=${f.sampleMimeType} codecs=${f.codecs} ${f.width}x${f.height} bps=${f.bitrate}"
                    AraStatus.lastTrack = line
                    Log.i(TAG, "VIDEO elegido: $line")
                    val p = PlaybackPolicy.fromSync(ctx)
                    if (f.height in 1 until p.targetHeight) {
                        Log.i(TAG, "4k_upscaled: seleccionado ${f.width}x${f.height} < ${p.targetWidth}x${p.targetHeight} (display upscale)")
                    }
                    // Snapshot estructurado para el sampler de /sync: MEDIDO del Format real.
                    AraStatus.trackCodec = f.codecs ?: ""
                    AraStatus.trackW = if (f.width > 0) f.width else 0
                    AraStatus.trackH = if (f.height > 0) f.height else 0
                    AraStatus.trackFps = if (f.frameRate > 0f) f.frameRate else 0f
                    AraStatus.trackBitrate = if (f.bitrate > 0) f.bitrate else 0
                    AraStatus.trackHdr = hdrOf(f.colorInfo?.colorTransfer)
                    AraStatus.trackAt = System.currentTimeMillis()
                    val fb = CodecFallbackMatrix.chainFor(
                        f.codecs,
                        "${f.width}x${f.height}",
                        f.frameRate.toDouble()
                    )
                    AraStatus.lastFallbackChain = fb.joinToString(">") { it.codec }
                    if (fb.isNotEmpty()) {
                        Log.i(TAG, "fallback ${CodecFallbackMatrix.policy()}: " +
                            fb.joinToString(" > ") { "${it.codec}@${it.resolution}/${it.fps}" })
                    }
                }
            }
        }
        // NF-01: un `Tracks` vacío (re-selección, fin de VOD, stall) NO debe borrar el último
        // snapshot válido: si no, el guard publicaba NO_TRACKS mientras el vídeo seguía.
        if (hasVideoFormat(tracks)) lastTracks = tracks
        else Log.i(TAG, "tracks sin vídeo (groups=${tracks.groups.size}) — se conserva el último snapshot válido")
        bitrateGuard?.evaluate(lastTracks ?: tracks)
        peekRuntime()
        startRuntimeTicker()
    }

    /** ¿El snapshot tiene al menos una variante de vídeo utilizable? (para no pisar el último bueno) */
    private fun hasVideoFormat(tracks: Tracks?): Boolean {
        if (tracks == null) return false
        for (g in tracks.groups) {
            if (g.type != C.TRACK_TYPE_VIDEO) continue
            for (i in 0 until g.length) {
                val f = g.getTrackFormat(i)
                if (f.width > 0 && f.height > 0 && f.bitrate > 0) return true
            }
        }
        return false
    }

    private fun hdrOf(colorTransfer: Int?): String = when (colorTransfer) {
        C.COLOR_TRANSFER_ST2084 -> "PQ"
        C.COLOR_TRANSFER_HLG -> "HLG"
        else -> "SDR"
    }

    // WATCHDOG de estancamiento: si la posicion no avanza con el player en play y el efecto GL
    // activo, es el pipeline de efectos el que no entrega frames (medido en este device:
    // efectos ON -> negro; OFF -> imagen). Se auto-degrada y SE DECLARA. No finge: lo escribe.
    @Volatile private var wdPos: Long = -1L
    @Volatile private var wdAt: Long = 0L
    @Volatile private var wdReinit: Boolean = false
    fun checkStallWatchdog() {
        val q = exo ?: return
        if (suppressVideoEffects) return
        // OJO: al atascarse el player pasa a STATE_BUFFERING, no se queda en READY.
        // Exigir READY hacia que el watchdog NUNCA disparara (medido: 0 disparos).
        val active = runCatching {
            q.playWhenReady && q.playbackState != Player.STATE_IDLE && q.playbackState != Player.STATE_ENDED
        }.getOrDefault(false)
        if (!active) return
        val pos = runCatching { q.currentPosition }.getOrDefault(-1L)
        val now = SystemClock.elapsedRealtime()
        if (pos != wdPos) { wdPos = pos; wdAt = now; return }
        if (wdAt == 0L) { wdAt = now; return }
        val stuck = now - wdAt
        if (stuck > 3_500L) {
            suppressVideoEffects = true
            AraStatus.bitrateState = "NATIVE_NO_EFFECTS"
            Log.w(TAG, "watchdog: pos=$pos estancada ${stuck}ms con efectos ON -> SE DESACTIVAN " +
                "(enhancement NO aplicado, reproduccion nativa)")
            refreshEffects()
            // Quitar el efecto a mitad NO recupera el surface (medido). El A/B demostro que
            // lo que si funciona es ARRANCAR sin efecto: se re-prepara el mismo canal una vez.
            if (!wdReinit && currentUrl.isNotEmpty()) {
                wdReinit = true
                Log.w(TAG, "watchdog: re-preparando SIN efectos para recuperar imagen")
                runCatching { openMedia(q, currentUrl, currentUa, currentHeaders) }
                    .onFailure { Log.w(TAG, "watchdog reinit fallo: ${it.message}") }
            }
            wdAt = now
        }
    }

    /** Buffer del PLAYER (nunca el `buffer_health_pct` del daemon) + contadores de decoder. */
    private fun peekRuntime() {
        val p = exo ?: return
        try {
            AraStatus.playerBufferMs = p.totalBufferedDuration.coerceAtLeast(0L)
            AraStatus.playerBufferAt = System.currentTimeMillis()
        } catch (e: Exception) { /* autopista: sin dato */ }
    }

    /** Contador REAL de frames descartados vía AnalyticsListener (si el build lo expone). */
    private fun installAnalytics(p: ExoPlayer) {
        try {
            p.addAnalyticsListener(object : AnalyticsListener {
                override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
                    AraStatus.trackDropped = droppedFrames.toLong()
                    AraStatus.trackDroppedValid = true
                }
            })
        } catch (e: Exception) { /* sin contador ⇒ el feature queda unavailable */ }
    }

    /** Garantiza el ÚNICO latido global (idempotente: llamarlo N veces no crea tickers extra). */
    private fun startRuntimeTicker() {
        if (exo == null) return
        ensureBeat()
    }

    /** Reconstruye los efectos GL desde las prefs que acaba de escribir PresetRouter. */
    fun pause() { exo?.pause() }
    fun play() { exo?.play() }
    fun seekTo(ms: Long) { exo?.seekTo(ms.coerceAtLeast(0L)) }

    fun refreshEffects() {
        // NF-01: hay coroutines (PlayerHub/PresetRouter) que llaman aquí desde un worker; tocar el
        // ExoPlayer fuera del hilo main lanzaba "Player is accessed on the wrong thread".
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post { refreshEffects() }
            return
        }
        val p = exo ?: return
        // BUGFIX: refreshEffects no respetaba suppressVideoEffects, asi que -e effects off
        // no desactivaba nada (openMedia llama aqui DESPUES del build). Ahora si.
        if (suppressVideoEffects) {
            runCatching { p.setVideoEffects(emptyList()) }
            Log.i(TAG, "shader effects SUPPRESSED (suppressVideoEffects=true)")
            return
        }
        runCatching {
            val effects = FluidBridge.effects(ctx).map { it as Effect }
            p.setVideoEffects(effects)
            Log.i(TAG, "shader effects applied n=${effects.size}")
        }.onFailure { Log.w(TAG, "shader effects failed: ${it.message}") }
    }

    fun release() {
        if (current === this) {
            current = null
            stopBeat()                       // NF-01: el latido global sólo muere sin player activo
        }
        bitrateGuard?.reset()          // F11: cancela el ALERT pendiente antes de soltar el player
        bitrateGuard = null
        lastTracks = null
        meter.reset()
        exo?.let { FluidBridge.detach(it) }
        exo?.release(); exo = null
        AraStatus.playerActive = false
        AraStatus.playerBufferMs = null
        AraStatus.playerBufferAt = 0L
    }

    companion object {
        // MEDIDO en este device (onn. 4K / Amlogic s4 / media3 1.3.1): con el efecto GL enganchado
    // la pantalla queda NEGRA; sin engancharlo reproduce. Y quitarlo a mitad NO recupera:
    // el pipeline del ExoPlayer ya quedo roto. Por eso el default es NO engancharlo, y se
    // DECLARA que el enhancement no esta aplicado (nunca se finge). Se puede reactivar con
    // -e effects on cuando el pipeline GL este corregido.
    @Volatile var suppressVideoEffects: Boolean = true
        @Volatile var current: ApePlayer? = null
        const val TAG = "ApePlayer"
        /** Periodo del ÚNICO latido global (buffer + guard). */
        const val TICK_MS = 2_000L
        const val DEFAULT_UA = "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager"

        // ── NF-01/NF-02 (BG9): latido GLOBAL único ──────────────────────────────────────
        // Vive en el proceso (no por instancia) para no morir cuando el PlayerHub cambia de
        // reproductor, y re-emite SIEMPRE (heartbeat cada 2 s) aunque no haya Tracks.
        private val beatHandler: Handler by lazy { Handler(Looper.getMainLooper()) }
        @Volatile private var beatRunning = false
        @Volatile private var beatTicks = 0
        private val beat = object : Runnable {
            override fun run() {
                if (!beatRunning) return
                if (!AraStatus.playerActive && current == null) {
                    beatRunning = false
                    Log.i(TAG, "global_beat stop (sin player activo)")
                    return
                }
                beatTicks++
                try {
                    val p = current
                    if (p != null) {
                        p.peekRuntime()
                        runCatching { p.checkStallWatchdog() }
                        val g = p.bitrateGuard
                        val t = p.lastTracks
                        if (g != null) {
                            if (t != null) {
                                runCatching { g.evaluate(t) }
                                    .onFailure { Log.w(TAG, "beat evaluate: ${it.message}") }
                            }
                            g.heartbeat(if (t == null) "no_tracks" else "tick")
                            if (g.isStale()) {
                                Log.w(TAG, "REARM global_beat: guard sin publicar ${g.lastPublishAgeMs()}ms (tick=$beatTicks)")
                                if (t != null) runCatching { g.evaluate(t) }
                                g.heartbeat("rearm")
                            }
                        } else {
                            Log.i(TAG, "global_beat tick=$beatTicks sin guard (player sin build)")
                        }
                    } else {
                        Log.i(TAG, "global_beat tick=$beatTicks sin instancia current (playerActive=${AraStatus.playerActive})")
                    }
                } catch (e: Throwable) {
                    // Un throwable en el latido NUNCA debe matar el lazo (antes: excepción ⇒ silencio).
                    Log.w(TAG, "global_beat: ${e.javaClass.simpleName} ${e.message}")
                }
                if (beatRunning) beatHandler.postDelayed(this, TICK_MS)
            }
        }

        fun ensureBeat() {
            if (beatRunning) return
            beatRunning = true
            beatHandler.removeCallbacks(beat)
            beatHandler.postDelayed(beat, TICK_MS)
            Log.i(TAG, "global_beat start")
        }

        fun stopBeat() {
            beatRunning = false
            try { beatHandler.removeCallbacks(beat) } catch (e: Exception) { }
        }
    }
}
