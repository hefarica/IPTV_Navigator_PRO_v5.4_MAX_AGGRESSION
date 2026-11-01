package com.ape.crystalagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.media.AudioManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Keeps MediaProjection available whenever an IPTV player is foreground.
 * It cannot silently recreate the consent token; it launches the consent
 * Activity (or an actionable notification when Android blocks background
 * activity starts). Usage Access is required for foreground detection.
 */
class CaptureWatchdogService : Service() {
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var lastPackage = ""
    /** BG19: contador de polls para vigilar el daemon cada ~5 s sin spamear. */
    private var tick = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "watchdog start")
        startForeground(NID, notification())
        if (handler != null) return START_STICKY
        handler = Handler(android.os.Looper.getMainLooper())
        handler?.post(poll)
        return START_STICKY
    }

    private val poll = object : Runnable {
        override fun run() {
            runCatching {
                // BG19 (t57): watchdog del DAEMON. Si el proceso se reinició o AgentService murió,
                // este servicio (que sigue vivo con la captura) lo vuelve a levantar. Cada ~5 s.
                if (tick++ % 5 == 0) {
                    AgentService.ensureRunning(this@CaptureWatchdogService, "watchdog")
                }
                val pkg = foregroundPackage()
                Log.i(TAG, "poll pkg='$pkg'")
                if (pkg != lastPackage) {
                    lastPackage = pkg
                    Log.i(TAG, "foreground='$pkg'")
                }
                val audio = audioPackage()
                if (pkg in PLAYER_PACKAGES) {
                    onForeground(this@CaptureWatchdogService, pkg)
                } else if (audio in PLAYER_PACKAGES) {
                    onForeground(this@CaptureWatchdogService, audio)
                } else if (audio == AUDIO_ACTIVE && pkg.isEmpty()) {
                    // No package visibility, but a player is audibly active.
                    onForeground(this@CaptureWatchdogService, AUDIO_ACTIVE)
                }
            }.onFailure { Log.w(TAG, "poll: ${it.message}") }
            handler?.postDelayed(this, 1_000L)
        }
    }

    private fun foregroundPackage(): String {
        runCatching {
            val task = getSystemService(android.app.ActivityManager::class.java)
                .getRunningTasks(1).firstOrNull()
            val pkg = task?.topActivity?.packageName
            if (!pkg.isNullOrEmpty()) return pkg
        }
        val usm = getSystemService(UsageStatsManager::class.java) ?: return ""
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(now - 10_000L, now) ?: return ""
        val event = UsageEvents.Event()
        var pkg = ""
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                (Build.VERSION.SDK_INT >= 29 && event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)
            ) {
                if (event.packageName != null) pkg = event.packageName
            }
        }
        if (pkg.isNotEmpty()) return pkg
        return usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 60_000L, now)
            ?.maxByOrNull { it.lastTimeUsed }
            ?.packageName
            .orEmpty()
    }

    private fun audioPackage(): String {
        runCatching {
            if (getSystemService(AudioManager::class.java).isMusicActive) return AUDIO_ACTIVE
        }
        return ""
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHAN, "ARA watchdog", NotificationManager.IMPORTANCE_LOW))
        return Notification.Builder(this, CHAN)
            .setContentTitle("ARA watchdog")
            .setContentText("Vigilando players IPTV")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        handler?.removeCallbacksAndMessages(null)
        thread?.quitSafely()
        handler = null
        thread = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "ARA_WATCHDOG"
        private const val CHAN = "ara_watchdog"
        private const val NID = 7711
        private const val AUDIO_ACTIVE = "__audio_active__"
        private val PLAYER_PACKAGES = setOf(
            "studio.scillarium.ottnavigator",
            "ar.tvplayer.tv",
            "org.videolan.vlc",
            "org.xbmc.kodi",
            "com.teamsmart.videomanager.tv"
        )

        private var lastPromptAt = 0L

        fun onForeground(ctx: Context, pkg: String) {
            if ((pkg !in PLAYER_PACKAGES && pkg != AUDIO_ACTIVE) || ScreenCaptureService.running) return
            val now = System.currentTimeMillis()
            if (now - lastPromptAt < 30_000L) return
            lastPromptAt = now
            Log.i(TAG, "player=$pkg capture_off; requesting consent")
            try {
                ctx.startActivity(
                    Intent(ctx, ScreenCaptureActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (t: Throwable) {
                Log.w(TAG, "background launch blocked: ${t.javaClass.simpleName}")
                notifyAction(ctx)
            }
        }

        private fun notifyAction(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHAN, "ARA watchdog", NotificationManager.IMPORTANCE_LOW))
            val pi = PendingIntent.getActivity(
                ctx, 1,
                Intent(ctx, ScreenCaptureActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val n = Notification.Builder(ctx, CHAN)
                .setContentTitle("ARA: captura de pantalla")
                .setContentText("Toca para autorizar MediaProjection")
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build()
            nm.notify(NID + 1, n)
        }

        fun start(ctx: Context) {
            try {
                ContextCompat.startForegroundService(ctx, Intent(ctx, CaptureWatchdogService::class.java))
            } catch (t: Throwable) {
                Log.w(TAG, "start err: ${t.message}")
            }
        }
    }
}
