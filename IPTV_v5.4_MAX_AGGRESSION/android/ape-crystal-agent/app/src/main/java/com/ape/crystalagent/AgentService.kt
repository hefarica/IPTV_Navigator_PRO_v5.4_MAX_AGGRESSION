package com.ape.crystalagent

import android.app.*
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.CoroutineExceptionHandler

/**
 * Servicio FOREGROUND persistente = el daemon APLICADOR PURO.
 *
 * NO observa, NO cambia canales, NO abre apps. Se suscribe al bus SSE del VPS (device-keyed,
 * FeedForwardClient) y APLICA los device_settings que llegan (SettingsApplier con allowlist).
 * El "ver" (qué canal/decode juega el device) lo hace el VPS, que ya proxea su tráfico.
 *
 * Persistencia (audit): START_STICKY + BootReceiver + onTaskRemoved → re-arranque. Si el VPS
 * falla, no pasa nada: la reproducción jamás se afecta (autopista).
 */
class AgentService : Service() {
    // [crashfix] Ningún fallo de un módulo (sync/engine/feedforward) debe tumbar el proceso.
    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default +
            CoroutineExceptionHandler { _, t -> Log.e(TAG, "coroutine no capturada", t) }
    )
    private lateinit var cfg: Config
    private lateinit var ff: FeedForwardClient
    private lateinit var applier: SettingsApplier
    private lateinit var qoe: QoEReporter
    private lateinit var idata: IDataClient
    private lateinit var selfUpdate: SelfUpdateManager
    private lateinit var enrollClient: EnrollClient
    private lateinit var wg: WireGuardManager
    private lateinit var ultra: UltraEnhancePipeline
    private lateinit var syncStore: SyncStore
    private lateinit var syncLoop: SyncLoop

    override fun onCreate() {
        super.onCreate()

        // [crashfix] El foreground se declara ANTES de inicializar cualquier módulo.
        // Si Config/Notification falla, el servicio se detiene; nunca deja que el
        // fallo suba como force close de la app.
        try {
            cfg = Config(this)
            AraStatus.serviceRunning = true
            startForeground(NID, buildNotif())
        } catch (t: Throwable) {
            Log.e(TAG, "arranque base/foreground falló; servicio detenido", t)
            AraStatus.serviceRunning = false
            stopSelf()
            return
        }

        // [crashfix] Un fallo de sync, engine, feedforward o self-update se aísla:
        // la app abre y reproduce; el servicio se detiene limpio en vez de crashear.
        try {
            applier = SettingsApplier(this)
            ff = FeedForwardClient(cfg)
            qoe = QoEReporter(this, cfg)
            idata = IDataClient(cfg)
            selfUpdate = SelfUpdateManager(this, cfg)
            enrollClient = EnrollClient(this, cfg)
            wg = WireGuardManager(this)
            ultra = UltraEnhancePipeline(this, cfg)
            // /sync (D3): canal de control. Offline-first: si el endpoint no existe, no pasa nada.
            syncStore = SyncStore(this)
            syncLoop = SyncLoop(this, cfg, applier, syncStore)
            // [sinWG] Decisión del propietario: ARA directo HTTPS/SSE, SIN WireGuard.
            // El túnel WG producía freeze en su device; no se crea ni se intenta.
            if (cfg.useWg) {
                scope.launch(Dispatchers.IO) {
                    try {
                        val wc = enrollClient.ensureEnrolled()
                        if (wc != null) wg.up(wc)
                        else Log.w(TAG, "WG sin config — sin túnel")
                    } catch (t: Throwable) { Log.w(TAG, "WG init falló: ${t.message}") }
                }
            } else {
                Log.i(TAG, "WG DESACTIVADO (modo directo HTTPS/SSE) — sin túnel")
            }
            // F6: negociar motores UltraEnhance (SoC) + reportar capacidades al VPS (no bloquea nada)
            scope.launch(Dispatchers.Default) {
                try {
                    if (cfg.enhanceEnabled) {
                        val lv = ultra.negotiate()
                        qoe.reportCapabilities(lv)
                    }
                } catch (t: Throwable) { Log.w(TAG, "UltraEnhance init falló: ${t.message}") }
            }
            // IDA C2: device_settings del VPS → hardware; reporta quality_change si trae codec/res
            ff.start(scope) { ds, obj ->
                try {
                    AraStatus.lastSseAt = System.currentTimeMillis()
                    AraStatus.lastSettings = ds
                    AraStatus.lastDirective = obj
                    val vpp = obj.optJSONObject("ape_vpp")
                    AraStatus.vppAllowed = if (vpp != null && vpp.has("allowed")) vpp.optBoolean("allowed") else null
                    AraStatus.vppReason = vpp?.optString("reason") ?: ""
                    // [homologación] tags de lista → sólo keys Android reales + prefs del player.
                    val hom = PresetHomologator.apply(this@AgentService, obj)
                    // Una sola pasada: VPS + base dump + homologación, sin pisar contadores.
                    val rows = (ds + SyncStore.SAFE_ROWS + hom.androidSettings).distinct()
                    applier.apply(rows)
                    if (cfg.enhanceEnabled) ultra.applyVpsHints(obj)   // hints content/codec/fps/lcevc → motores
                    val codec = obj.optString("codec_hint", "")
                    val res = obj.optString("resolution_hint", "")
                    if (codec.isNotEmpty() || res.isNotEmpty()) {
                        qoe.reportQualityChange(codec.ifEmpty { "unknown" }, res.ifEmpty { "unknown" })
                    }
                    // [2026-11-14] Puente al badge: la ENTRADA que el VPS declara.
                    //
                    // Hasta hoy esta resolucion se usaba SOLO para QoE y el badge se
                    // dibujaba con BadgeOverlay.show(ctx, null, nombre) -> "entrada: N/D"
                    // para siempre. El operador pidio ver "de que resolucion a cual de
                    // salida va la imagen". Se guarda aqui y el ticker la pasa al badge.
                    //
                    // Fail-honest: si el VPS no manda resolution_hint (vacio), NO se
                    // limpia lo que hubiera de un canal anterior si es reciente; se
                    // guarda solo cuando hay valor.
                    if (res.isNotEmpty()) {
                        AraStatus.sourceResolution = res
                        AraStatus.sourceResolutionAt = System.currentTimeMillis()
                    }
                } catch (t: Throwable) { Log.w(TAG, "callback SSE falló: ${t.message}") }
            }
            qoe.start(scope)          // VUELTA C2: heartbeat/liveness → ara_heartbeats
            selfUpdate.start(scope)   // auto-update desde /ara/version + /ara/agent.apk
            syncLoop.start(scope)     // /sync (D3): 30 s, offline-first, backoff y fail-closed

            // ═══════════════════════════════════════════════════════════════════
            // [2026-11-14] AUTO-ARRANQUE DEL SHIM
            //
            // PEDIDO DEL OPERADOR, textual:
            //   "se logre que el OTTSHIM NUNCA MUERA Y ESTA CONECTADO SIEMPRE E
            //    INMEDIATAMENTE EL ARA ESTE EN FUNCIONAMIENTO"
            //
            // Este es el enganche exacto. `AgentService` ya se auto-arranca por tres
            // vias independientes: START_STICKY (el sistema lo recrea), BootReceiver
            // (tras reboot) y onTaskRemoved (re-arranque al cerrar la tarea). El shim
            // NO tenia ninguna: solo el boton de la UI. Colgandolo de aqui, arranca
            // con ARA, en el boot y tras cada reinicio del agente.
            //
            // LA FUENTE: el CATALOGO DE CALIDAD del VPS (/jit/playlist-calidad.m3u8).
            // Esa ruta daba 404 hasta hoy (proxy al motor 3099 sin catalogos
            // generados); ahora nginx la sirve desde el enlace ape_jit_latest.m3u8,
            // que apunta a la lista cableada con todos los canales por /pulse/.
            //
            // IDEMPOTENTE Y FAIL-OPEN:
            //   - Si el shim ya estaba arrancado, ProxyService solo actualiza la
            //     fuente; no abre un segundo socket.
            //   - Si falla, se loguea y ARA sigue: un fallo del proxy NUNCA debe
            //     tumbar el agente. El boton "PARAR SHIM" de la UI sigue mandando:
            //     el operador puede pararlo y este bloque no lo contradice (solo
            //     actua al arrancar el servicio).
            // ═══════════════════════════════════════════════════════════════════
            try {
                ShimBridge.start(
                    this,
                    "https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8",
                    null,
                    0
                )
                Log.i(TAG, "shim auto-arrancado con el catalogo de calidad del JIT")
            } catch (t: Throwable) {
                Log.w(TAG, "shim auto-arranque fallo (ARA sigue): ${t.message}")
            }
            Log.i(TAG, "FULL SYSTEM START dev=${cfg.deviceId} vps=${cfg.vpsBase} token=${if (cfg.hasToken()) "set" else "MISSING"} syncKey=${if (cfg.hasSyncKey()) "set" else "MISSING"} sync=${if (cfg.syncEnabled) "on" else "off"}")

            // ═══════════════════════════════════════════════════════════════════
            // [2026-11-14] OTT NAVIGATOR ES LA SEÑAL DE ARRANQUE DEL SISTEMA
            //
            // PEDIDO DEL OPERADOR, textual:
            //   "haz que cuando se ingrese al OTT NAVIGATOR todo el sistema arranque
            //    solo con todo activo entregando la maxima calidad de imagen con un
            //    pequeno logo en el overlay de OTT NAVIGATOR que existe"
            //
            // COMO SE DETECTA OTT SIN ROOT NI ACCESIBILIDAD:
            //   SessionTap (dev.venice.ottshim.SessionTap) ya es el
            //   NotificationListenerService de este APK y su TARGET es
            //   studio.scillarium.ottnavigator. Con su ComponentName se puede pedir
            //   MediaSessionManager.getActiveSessions y leer el PlaybackState real del
            //   reproductor. No se adivina por primer plano ni por package: se mira si
            //   OTT esta REPRODUCIENDO (STATE_PLAYING), que es la senal correcta.
            //
            // QUE SE HACE CUANDO OTT REPRODUCE:
            //   1) si el shim no corre, se relanza (esto es el "todo activo");
            //   2) se muestra el badge de upscaling sobre OTT (entrada -> salida);
            //   3) los settings de maxima calidad ya los aplica SettingsApplier desde
            //      el SSE del VPS + la base local; no se reaplican aqui para no pisar
            //      contadores ni provocar rechazos en bucle.
            // Cuando OTT deja de reproducir, el badge se retira.
            //
            // FAIL-OPEN: cualquier fallo (permiso de sesion revocado, badge sin
            // SYSTEM_ALERT_WINDOW, media session vacia) se registra y NO tumba nada.
            // El hilo es IO, con sleep de 5 s: no compite con la reproduccion.
            // ═══════════════════════════════════════════════════════════════════
            scope.launch(Dispatchers.IO) {
                val ottPkg = "studio.scillarium.ottnavigator"
                var badgeShown = false
                // Cuando se re-verifico por ultima vez que OTT sigue reproduciendo.
                // El badge se montaba y ya no se volvia a comprobar nunca: se quedo
                // 16 minutos en pantalla sobre YouTube TV (medido 2026-11-14).
                var lastBadgeReverifyAt = 0L
                // [FIX 2026-11-14] OTT NO PUBLICA MediaSession.
                //
                // Medido en el zapeo real: OTT estaba en PlayerActivity reproduciendo
                // ("Buffering: 0%" -> luego video) y `dumpsys media_session` NO mostraba
                // ninguna sesion suya. Solo aparecia en "Audio playback (lastly played)".
                // Con la deteccion por MediaSession el ticker NUNCA disparaba.
                //
                // La senal que SI existe esta en AudioManager:
                //   AudioPlaybackConfiguration piid:12895 type:AudioTrack
                //     u/pid:10086/11747 state:started usage=USAGE_MEDIA sessionId:12537
                //   -> uid 10086 = studio.scillarium.ottnavigator, audio started.
                //
                // Se usa getActivePlaybackConfigurations() (API 26+) para atribuir el
                // audio a OTT por uid. En API < 29 no hay getClientUid(): se cae a
                // isMusicActive(), que es global (menos preciso pero honesto).
                val ottUid: Int = try {
                    packageManager.getApplicationInfo(ottPkg, 0).uid
                } catch (_: Throwable) {
                    -1
                }
                val am = getSystemService(AudioManager::class.java)
                while (true) {
                    try {
                        Thread.sleep(5_000)
                        // 1) canal que OTT tiene en la MediaMetadata (si la expone)
                        var titulo: String? = null
                        try {
                            val msm = getSystemService(MediaSessionManager::class.java)
                            val comp = ComponentName(
                                this@AgentService,
                                dev.venice.ottshim.SessionTap::class.java
                            )
                            val ses = msm?.getActiveSessions(comp)
                                ?.firstOrNull { it.packageName == ottPkg }
                            titulo = ses?.metadata?.description?.title
                                ?.toString()?.trim()?.takeIf { it.isNotEmpty() }
                        } catch (_: Throwable) {
                            // Sin permiso de sesiones: se sigue con el audio.
                        }

                        // 2) reproduccion REAL por audio
                        //
                        // Se usa AudioManager.isMusicActive(): API 8+, sin permisos y
                        // sin los problemas de resolucion que dio
                        // AudioPlaybackConfiguration en este compileSdk (sus getters
                        // getPlayerState/getClientUid no resuelven al compilar).
                        //
                        // HONESTO sobre el alcance: isMusicActive() es GLOBAL, no por
                        // app. Si el operador estuviera reproduciendo musica en otra
                        // aplicacion, el badge tambien saldria. Para el uso real (la TV
                        // con OTT) eso no ocurre, y es preferible un disparo de mas que
                        // el badge que NUNCA sale, que es lo que pasaba con MediaSession.
                        val playing = am?.isMusicActive == true

                        if (playing) {
                            // [FIX 2026-11-14] REFRESCAR EL ESTADO DEL SHIM ANTES DE MIRARLO.
                            //
                            // `ShimBridge.running` solo se actualizaba dentro de
                            // ShimBridge.refresh(), y refresh() se llamaba UNICAMENTE desde
                            // MainActivity (el panel, al abrirse). En segundo plano -que es
                            // como funciona el sistema el 99% del tiempo- nadie refrescaba,
                            // asi que `running` se quedaba en false PARA SIEMPRE.
                            //
                            // MEDIDO en el device:
                            //   "OTT reproduciendo y shim caido -> relanzo"  x6, cada 5 s
                            //   mientras el shim estaba perfectamente sano:
                            //   {"ok":true,"proxy_up":true,"port":44055,"uptime_ms":832469}
                            // Es decir: el agente relanzaba un proxy que ya estaba corriendo,
                            // en bucle, cada 5 segundos. CPU y bateria gratis, y un
                            // startForegroundService repetido que puede acabar en crash del
                            // servicio (es justo el tipo de caida "inadvertida" que el
                            // operador denuncia).
                            //
                            // refresh() hace un GET a 127.0.0.1 con timeouts de 700/900 ms y
                            // este ticker corre en Dispatchers.IO, asi que no bloquea nada.
                            runCatching { ShimBridge.refresh() }
                            if (!ShimBridge.running) {
                                Log.w(TAG, "OTT reproduciendo y shim realmente caido -> relanzo")
                                ShimBridge.start(
                                    this@AgentService,
                                    "https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8",
                                    null,
                                    0
                                )
                            }
                            // [FIX 2026-11-14] RE-VERIFICAR EL BADGE YA MONTADO.
                            //
                            // El chequeo de age_s solo ocurria dentro de `if (!badgeShown)`:
                            // se comprobaba al MONTAR y nunca mas. Si el badge se monto con
                            // un age_s valido y luego OTT se cerro mientras seguia habiendo
                            // audio (YouTube TV), el overlay se quedaba pegado indefinidamente.
                            //
                            // MEDIDO en el device: Window{7800ed3 u0 UpscaleBadge} con
                            // mSession=...17186 y age_s del endpoint = 999 s (16 min). El badge
                            // llevaba 16 minutos en pantalla sobre YouTube TV sin que OTT
                            // estuviera reproduciendo.
                            //
                            // Se revisa cada 30 s (no en cada tick de 5 s) para no castigar el
                            // endpoint. Si el ultimo /pulse/ externo ya no es reciente, se retira.
                            if (badgeShown) {
                                val ahora2 = System.currentTimeMillis()
                                if (ahora2 - lastBadgeReverifyAt >= 30_000L) {
                                    lastBadgeReverifyAt = ahora2
                                    val edad = try {
                                        val u2 = java.net.URL(
                                            cfg.vpsBase.trimEnd('/') +
                                                "/prisma/api/ape-last-channel.php"
                                        )
                                        org.json.JSONObject(u2.readText(Charsets.UTF_8))
                                            .optInt("age_s", -1)
                                    } catch (_: Throwable) { -1 }
                                    if (edad !in 0..120) {
                                        Log.i(TAG, "badge retirado: OTT ya no reproduce (age_s=$edad)")
                                        runCatching { BadgeOverlay.hide(this@AgentService) }
                                        badgeShown = false
                                    }
                                }
                            }
                            if (!badgeShown) {
                                // [2026-11-14] PRIMERO se pregunta al VPS si OTT sigue ahi.
                                //
                                // `isMusicActive()` es GLOBAL: si el operador pone YouTube TV
                                // con audio, el ticker cree que OTT reproduce. MEDIDO en vivo:
                                //     foco = youtube.tv · audio = 1 · badge = 3
                                //     log  = "canal=|UK| TNT SPORTS ULTIMATE 4K entrada=3840x2160"
                                // Es decir: el badge salia sobre YouTube TV con los datos de un
                                // canal OTT que se habia visto 20 minutos antes.
                                //
                                // El endpoint devuelve age_s = segundos desde el ultimo
                                // GET /pulse/. Si ese manifiesto tiene mas de 120 s, no hay OTT
                                // reproduciendo delante y NO se monta el overlay. Es la unica
                                // senal de "OTT esta aqui" que se puede medir sin root y sin
                                // tocar otras apps (la LEY #1 prohibe abrir nada para averiguarlo).
                                var nombre = titulo
                                var entradaVps: String? = null
                                var ageS = -1
                                try {
                                    val url = java.net.URL(
                                        cfg.vpsBase.trimEnd('/') +
                                            "/prisma/api/ape-last-channel.php"
                                    )
                                    val jo = org.json.JSONObject(url.readText(Charsets.UTF_8))
                                    ageS = jo.optInt("age_s", -1)
                                    jo.optString("resolution", "")
                                        .trim()
                                        .takeIf { it.matches(Regex("^\\d{3,4}x\\d{3,4}$")) }
                                        ?.let { entradaVps = it }
                                    jo.optString("name", "")
                                        .trim()
                                        .takeIf { it.isNotEmpty() }
                                        ?.let { nombre = it }
                                } catch (t: Throwable) {
                                    Log.w(TAG, "consulta canal: ${t.message}")
                                }

                                // ageS < 0 => el VPS no pudo leer el log: no se puede afirmar
                                // que OTT este reproduciendo. Se es conservador y NO se monta
                                // (antes de este cambio salia el badge con datos rancios).
                                val ottReciente = ageS in 0..120
                                if (!ottReciente) {
                                    Log.i(TAG, "audio activo pero OTT no reciente (age_s=$ageS) -> sin badge")
                                } else {
                                badgeShown = true
                                try {
                                    if (entradaVps != null) {
                                        AraStatus.sourceResolution = entradaVps!!
                                        AraStatus.sourceResolutionAt = System.currentTimeMillis()
                                    }
                                    // [FIX 2026-11-14 t68] SIN Activity en el camino de la
                                    // reproduccion.
                                    //
                                    // Antes: startActivity(UpscaleBadgeActivity). MEDIDO en el
                                    // device: tras ese startActivity el foco no se quedaba en el
                                    // badge sino en com.ape.crystalagent/.MainActivity (la raiz
                                    // de la tarea del ARA) y OTT se pausaba en "Buffering: 0%".
                                    // Es exactamente lo que el operador describio: "me salta y
                                    // me lleva al menu del ARA".
                                    //
                                    // Ahora: BadgeOverlay monta el TextView con
                                    // WindowManager.addView(TYPE_APPLICATION_OVERLAY) desde este
                                    // mismo proceso. Sin Activity no hay tarea ni robo de foco.
                                    // Fail-honest: si addView falla (sin SYSTEM_ALERT_WINDOW),
                                    // BadgeOverlay lo registra y el agente sigue.
                                    // [2026-11-14] ENTRADA al badge.
                                    //
                                    // Antes se pasaba `null` y el badge decia SIEMPRE
                                    // "entrada: N/D". La resolucion de entrada la declara el
                                    // VPS (resolution_hint del SSE / source.resolution del
                                    // /sync) y se guarda en AraStatus.sourceResolution.
                                    //
                                    // Se descarta si es vieja (>10 min): un canal zapeado hace
                                    // media hora no describe lo que se ve ahora, y decir una
                                    // entrada caducada seria inventar. En ese caso el badge
                                    // vuelve a "N/D", que es la verdad.
                                    val ahora = System.currentTimeMillis()
                                    val entrada = AraStatus.sourceResolution
                                        .takeIf { it.isNotBlank() && ahora - AraStatus.sourceResolutionAt < 600_000L }
                                    BadgeOverlay.show(this@AgentService, entrada, nombre)
                                    Log.i(TAG, "badge de upscaling sobre OTT canal=${nombre ?: "sin titulo"} entrada=${entrada ?: "N/D"} (overlay sin Activity)")
                                } catch (t: Throwable) {
                                    Log.w(TAG, "badge OTT: ${t.message}")
                                }
                                }   // cierra el else de ottReciente
                            }
                        } else if (badgeShown) {
                            badgeShown = false
                            try {
                                // [FIX 2026-11-14 t68] retirada sin Activity (mismo motivo).
                                BadgeOverlay.hide(this@AgentService)
                                Log.i(TAG, "OTT parado -> badge retirado (overlay sin Activity)")
                            } catch (_: Throwable) {
                            }
                        }
                    } catch (t: Throwable) {
                        Log.w(TAG, "ticker OTT: ${t.message}")
                    }
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "inicialización de módulos falló; app sigue local", t)
            AraStatus.serviceRunning = false
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        runCatching { CaptureWatchdogService.start(this) }
        intent?.let {
            if (it.hasExtra("vps") || it.hasExtra("dev")) {
                cfg.provision(it.getStringExtra("vps"), it.getStringExtra("dev"))
                Log.i(TAG, "provisionado dev=${cfg.deviceId} vps=${cfg.vpsBase}")
            }
        }
        return START_STICKY
    }

    /** Fire OS nos saca de recientes → re-arranca (persistencia, audit). */
    override fun onTaskRemoved(rootIntent: Intent?) {
        start(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        // [crashfix] onDestroy también puede correr con módulos a medio inicializar.
        if (::ff.isInitialized) runCatching { ff.stop() }
        if (::qoe.isInitialized) runCatching { qoe.stop() }
        if (::selfUpdate.isInitialized) runCatching { selfUpdate.stop() }
        if (::ultra.isInitialized) runCatching { ultra.stop() }
        if (::syncLoop.isInitialized) runCatching { syncLoop.stop() }
        if (::cfg.isInitialized && cfg.useWg && ::wg.isInitialized) runCatching { wg.down() }
        AraStatus.serviceRunning = false
        scope.cancel()
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotif(): Notification {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHAN, "APE Agent", NotificationManager.IMPORTANCE_MIN)
            ch.setShowBadge(false)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHAN)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setContentTitle("APE Crystal Agent")
            .setContentText("Aplicador device-settings (feed-forward)")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val TAG = "ApeAgentService"
        const val NID = 7
        const val CHAN = "ape_agent"
        @Volatile private var lastEnsureAt = 0L
        fun start(ctx: Context) {
            val i = Intent(ctx, AgentService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) { Log.w(TAG, "start err: ${e.message}") }
        }

        /**
         * BG19 (t57): arranque IDEMPOTENTE del daemon cuando no está vivo. Lo llaman
         * `MainActivity.onCreate` (al abrir la app) y el `CaptureWatchdogService` (cada ~5 s),
         * que es quien detecta un reinicio de proceso o una muerte del daemon.
         * Con freno de 5 s para no convertir un fallo persistente en un bucle de arranques.
         */
        fun ensureRunning(ctx: Context, reason: String) {
            if (AraStatus.serviceRunning) return
            val now = System.currentTimeMillis()
            if (now - lastEnsureAt < 5_000L) return
            lastEnsureAt = now
            Log.i(TAG, "ensureRunning($reason): daemon caído → arrancando AgentService")
            start(ctx)
        }
    }
}
