package com.ape.crystalagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import kotlin.math.abs

/**
 * Captura de display con consentimiento (MediaProjection). Mide el frame compuesto,
 * no el buffer privado de ExoPlayer de otra app. No usa root, DRM ni hooks.
 */
class ScreenCaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    @Volatile private var lastLuma = 0.0
    @Volatile private var frames = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (projection != null) return START_STICKY
        startForeground(NOTIF_ID, notification())
        val code = intent?.getIntExtra("resultCode", 0) ?: 0
        val data = intent?.getParcelableExtra<Intent>("data")
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val mp = if (code == 0 || data == null) null else mpm.getMediaProjection(code, data)
        if (mp == null) {
            Log.w(TAG, "MediaProjection no autorizado")
            stopSelf()
            return START_NOT_STICKY
        }
        projection = mp
        AraCommandBridge.start(this)
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { stopSelf() }
        }, Handler(mainLooper))

        val dm = resources.displayMetrics
        val w = dm.widthPixels.coerceAtLeast(2)
        val h = dm.heightPixels.coerceAtLeast(2)
        val t = HandlerThread("ARA-SCREEN").also { it.start() }
        thread = t
        handler = Handler(t.looper)
        val ir = ImageReader.newInstance((w / 2).coerceAtLeast(2), (h / 2).coerceAtLeast(2),
            PixelFormat.RGBA_8888, 2)
        reader = ir
        ir.setOnImageAvailableListener({ r ->
            runCatching {
                val img = r.acquireLatestImage() ?: return@setOnImageAvailableListener
                try { measure(img) } finally { img.close() }
            }.onFailure { Log.w(TAG, "frame: ${it.message}") }
        }, handler)
        // API 34 de este build no expone MediaProjectionConfig.createVirtualDisplay;
        // la captura de una sola app es API 35. Se captura el display completo.
        virtualDisplay = mp.createVirtualDisplay(
            "ARA-CAPTURE", ir.width, ir.height, dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, ir.surface, null, handler
        )
        Log.i(TAG, "captura iniciada ${ir.width}x${ir.height} sdk=${Build.VERSION.SDK_INT}")
        return START_STICKY
    }

    private fun measure(img: Image) {
        val plane = img.planes[0]
        val buf = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        val w = img.width
        val h = img.height
        if (w < 8 || h < 8 || rowStride <= 0) return
        var sum = 0.0
        var lap = 0.0
        var n = 0
        val stride = 4
        var y = 1
        while (y < h - 1) {
            var x = 1
            while (x < w - 1) {
                val off = y * rowStride + x * pixelStride
                if (off + 2 < buf.limit()) {
                    val l = (buf.get(off).toInt() and 0xff) * 0.299 +
                        (buf.get(off + 1).toInt() and 0xff) * 0.587 +
                        (buf.get(off + 2).toInt() and 0xff) * 0.114
                    val lx = (buf.get(off + pixelStride).toInt() and 0xff) * 0.299 +
                        (buf.get(off + pixelStride + 1).toInt() and 0xff) * 0.587 +
                        (buf.get(off + pixelStride + 2).toInt() and 0xff) * 0.114
                    sum += l
                    lap += abs(l - lx)
                    n++
                }
                x += stride
            }
            y += stride
        }
        if (n == 0) return
        val avg = sum / n
        val lapVar = lap / n
        val motion = abs(avg - lastLuma)
        lastLuma = avg
        frames++
        val kind = when {
            frames > 30 && lapVar < 1.0 && motion < 0.8 -> "SLATE"
            lapVar > 8.0 -> "DETAIL"
            motion > 4.0 -> "MOTION"
            else -> "FLAT"
        }
        AraStatus.captureFrames = frames
        AraStatus.captureLuma = avg
        AraStatus.captureLap = lapVar
        AraStatus.captureMotion = motion
        AraStatus.captureKind = kind
        if (frames % 15L == 0L) Log.i(TAG, "kind=$kind luma=${"%.1f".format(avg)} lap=${"%.2f".format(lapVar)} motion=${"%.2f".format(motion)} frames=$frames")
        if (frames % 30L == 0L) StatePublisher.publish(this, kind, avg, lapVar, motion, frames)
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHAN, "ARA Capture", NotificationManager.IMPORTANCE_LOW))
        }
        val b = if (Build.VERSION.SDK_INT >= 26)
            Notification.Builder(this, CHAN)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setContentTitle("ARA captura activa")
            .setContentText("MediaProjection con consentimiento")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
    }

    override fun onDestroy() {
        AraCommandBridge.stop()
        runCatching { virtualDisplay?.release() }
        runCatching { reader?.close() }
        runCatching { projection?.stop() }
        virtualDisplay = null; reader = null; projection = null
        thread?.quitSafely(); thread = null; handler = null
        super.onDestroy()
    }

    companion object {
        const val TAG = "ARA_LIVE"
        private const val CHAN = "ara_capture"
        private const val NOTIF_ID = 7701
    }
}
