package com.ape.crystalagent

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*

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
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var cfg: Config
    private lateinit var ff: FeedForwardClient
    private lateinit var applier: SettingsApplier

    override fun onCreate() {
        super.onCreate()
        cfg = Config(this)
        applier = SettingsApplier(this)
        ff = FeedForwardClient(cfg)
        startForeground(NID, buildNotif())
        ff.start(scope) { ds, _ -> applier.apply(ds) }
        Log.i(TAG, "START dev=${cfg.deviceId} vps=${cfg.vpsBase} token=${if (cfg.hasToken()) "set" else "MISSING"}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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

    override fun onDestroy() { ff.stop(); scope.cancel(); super.onDestroy() }
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
        fun start(ctx: Context) {
            val i = Intent(ctx, AgentService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) { Log.w(TAG, "start err: ${e.message}") }
        }
    }
}
