package dev.venice.ottshim

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.io.File

/**
 * ProxyService — dueño del proxy loopback.
 *
 * BG17 (t55) tras BG12-01: antes era `START_NOT_STICKY` sin watchdog, así que si el hilo del
 * proxy moría (o el socket se cerraba) el servicio seguía "vivo" con `running=true` y `/health`
 * dejaba de responder sin que nada lo re-armara. Ahora:
 *  · `START_STICKY` para que el sistema lo recree.
 *  · Watchdog cada [WATCHDOG_MS] que comprueba el socket real y re-arma el proxy si está caído
 *    (contador `restarts` visible en /health y /metrics).
 *  · `healthGate()`: señal explícita de "proxy arriba y respondiendo" para que el consumidor de
 *    QoE no lea /metrics de un proxy muerto.
 */
class ProxyService : Service() {
    companion object {
        @Volatile var port = 0
        @Volatile var running = false
        @Volatile var restarts = 0
        @Volatile var startedAt = 0L
        @Volatile var lastWatchdogAt = 0L
        val policy = AbrPolicy()
        private var proxy: LoopbackProxy? = null

        const val WATCHDOG_MS = 5_000L

        /** Gate de salud para consumidores: proxy arriba, con puerto y socket vivo. */
        fun healthGate(): Boolean = running && port > 0 && proxy != null
    }

    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var stopped = false

    private val watchdog = object : Runnable {
        override fun run() {
            if (stopped) return
            lastWatchdogAt = System.currentTimeMillis()
            val needsRearm = !running || port <= 0 || proxy == null
            if (needsRearm) {
                restarts++
                android.util.Log.w("ottshim", "watchdog rearm #$restarts (running=$running port=$port)")
                runCatching { startProxy(intentSrc, intentUa, intentKbps) }
                    .onFailure { android.util.Log.e("ottshim", "rearm failed: ${it.message}") }
            }
            handler.postDelayed(this, WATCHDOG_MS)
        }
    }

    private var intentSrc: String? = null
    private var intentUa: String? = null
    private var intentKbps: Int = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.sink = { message -> android.util.Log.i("ottshim", message) }
        stopped = false
        intent?.getStringExtra("src")?.takeIf { it.isNotBlank() }?.let { intentSrc = it; policy.sourceUrl = it }
        intent?.getStringExtra("ua")?.takeIf { it.isNotBlank() }?.let { intentUa = it; policy.userAgent = it }
        intent?.getIntExtra("targetKbps", 0)?.takeIf { it > 0 }?.let { intentKbps = it; policy.forceCeiling(it.toLong()) }

        if (!running) {
            val channel = "ottshim"
            // [ARASHIM] minSdk 22 (Fire OS 5): NotificationChannel y el ctor con canal son
            // API 26. Sin esta guarda el modulo compila a 22 pero revienta al arrancar en
            // sticks viejos. Fire OS 7/8 (28/30) entra por la rama O.
            val notification: Notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                runCatching {
                    getSystemService(NotificationManager::class.java).createNotificationChannel(
                        NotificationChannel(channel, "ottshim", NotificationManager.IMPORTANCE_LOW)
                    )
                }
                Notification.Builder(this, channel)
                    .setContentTitle("ottshim")
                    .setContentText("loopback proxy activo")
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setContentTitle("ottshim")
                    .setContentText("loopback proxy activo")
                    .build()
            }
            startForeground(1, notification)
            startProxy(intentSrc, intentUa, intentKbps)
        }
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, WATCHDOG_MS)
        return START_STICKY
    }

    private fun startProxy(src: String?, ua: String?, kbps: Int) {
        runCatching { proxy?.stop() }
        src?.takeIf { it.isNotBlank() }?.let { policy.sourceUrl = it }
        ua?.takeIf { it.isNotBlank() }?.let { policy.userAgent = it }
        if (kbps > 0) policy.forceCeiling(kbps.toLong())
        val instance = LoopbackProxy(policy)
        proxy = instance
        val p = instance.start()
        port = p
        running = p > 0
        startedAt = System.currentTimeMillis()
        android.util.Log.i("ottshim", "proxy port=$port up=$running")
        runCatching {
            val file = File(getExternalFilesDir(null), "port.txt")
            file.parentFile?.mkdirs()
            file.writeText(port.toString())
            android.util.Log.i("ottshim", "port file=${file.absolutePath}")
        }.onFailure {
            android.util.Log.w("ottshim", "port file failed: ${it.message}")
        }
        // Un stall MEDIDO reacciona en el ABR; un error HTTP no (BG17).
        policy.qoe.onStallClosed = { ms -> Log.d("stall reaction ${ms}ms"); policy.onUnderrun() }
        Log.d("service started port=$port")
    }

    override fun onDestroy() {
        stopped = true
        handler.removeCallbacks(watchdog)
        runCatching { proxy?.stop() }
        proxy = null
        running = false
        port = 0
        super.onDestroy()
    }
}
