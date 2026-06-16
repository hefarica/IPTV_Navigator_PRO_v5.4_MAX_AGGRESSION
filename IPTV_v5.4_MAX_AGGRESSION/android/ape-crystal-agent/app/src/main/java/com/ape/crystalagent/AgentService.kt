package com.ape.crystalagent

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*

/**
 * Servicio FOREGROUND persistente = el "daemon" hecho bien (resuelve S7: el shell daemon no
 * sobrevive en Fire OS). START_STICKY + BootReceiver → revive tras reboot/kill. Orquesta el lazo:
 *   DecodeObserver (logcat decoder-activo) → onZap → MatchClient (iData→VPS→carga) → CargaApplier.
 * El zap NUNCA se bloquea: el MATCH corre en IO con debounce; si el VPS falla, no pasa nada (no freeze).
 */
class AgentService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var cfg: Config
    private lateinit var client: MatchClient
    private lateinit var applier: CargaApplier
    private lateinit var observer: DecodeObserver
    @Volatile private var inFlight = false

    override fun onCreate() {
        super.onCreate()
        cfg = Config(this)
        client = MatchClient(cfg)
        applier = CargaApplier(this)
        startForeground(NID, buildNotif())
        observer = DecodeObserver { rd -> onZap(rd) }
        observer.start(scope)
        Log.i(TAG, "START dev=${cfg.deviceId} vps=${cfg.vpsBase} token=${if (cfg.hasToken()) "set" else "MISSING"}")
    }

    private fun onZap(rd: RealDecode) {
        if (inFlight) return
        inFlight = true
        scope.launch(Dispatchers.IO) {
            try {
                // El decoder reporta el formato real ~tras el primer frame; deja que estabilice.
                delay(800)
                val ch = ChannelIndex.currentChannelId(this@AgentService)
                val esperado = ChannelIndex.esperadoFor(this@AgentService, ch)
                val carga = client.match(rd, esperado, ch)
                if (carga != null) applier.apply(carga)
                else Log.i(TAG, "MATCH sin carga (VPS down o sin token) — wake local ya cubrió")
            } catch (e: Exception) {
                Log.w(TAG, "onZap err: ${e.message}")
            } finally { inFlight = false }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.let {
            if (it.hasExtra("token") || it.hasExtra("vps") || it.hasExtra("dev")) {
                cfg.provision(it.getStringExtra("vps"), it.getStringExtra("token"), it.getStringExtra("dev"))
                Log.i(TAG, "provisionado dev=${cfg.deviceId} vps=${cfg.vpsBase} token=${if (cfg.hasToken()) "set" else "-"}")
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        observer.stop(); scope.cancel(); super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotif(): Notification {
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(CHAN, "APE Agent", NotificationManager.IMPORTANCE_MIN)
            ch.setShowBadge(false)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHAN) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setContentTitle("APE Crystal Agent")
            .setContentText("Enriquecimiento por-zap activo")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val TAG = "ApeAgentService"
        const val NID = 7
        const val CHAN = "ape_agent"
        fun start(ctx: Context) {
            val i = Intent(ctx, AgentService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) { Log.w(TAG, "start err: ${e.message}") }
        }
    }
}
