package com.ape.crystalagent

import android.app.Activity
import android.graphics.PixelFormat
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import java.io.File

/** Test-only activity: reads sse_token from /sdcard/ape, starts SSE, shows red overlay. */
class SseTestActivity : Activity() {
    private var receiver: MetaReceiver? = null
    private var overlay: PrivacyOverlayView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = runCatching {
            val private = File(getExternalFilesDir(null), "sse_token")
            val internal = File(filesDir, "sse_token")
            when {
                private.isFile -> private.readText()
                internal.isFile -> internal.readText()
                else -> ""
            }.trim()
        }.getOrDefault("")
        val mapper = MetaMapper(this)
        receiver = MetaReceiver(
            tokenProvider = { token },
            onEvent = { json ->
                Log.i("ARA-SSE", "event: $json")
                mapper.apply(json)
            }
        ).also { it.connect(deviceId = AraDeviceId.get(this)) }
        // Real overlay window: ViewRootImpl belongs to the overlay, not the Activity.
        val wm = getSystemService(WindowManager::class.java)
        val pv = PrivacyOverlayView(this)
        overlay = pv
        val host = FrameLayout(this).apply {
            setBackgroundColor(0xFFFF0000.toInt())
            addView(pv, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT))
        }
        val lp = WindowManager.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }
        runCatching { wm.addView(host, lp) }
            .onFailure { Log.e("ARA-Overlay", "addView failed: ${it.message}") }
        Log.i("ARA-SSE", "test started token=${token.isNotEmpty()} privacy=${PrivacyOverlayView.privacyAvailable}")
    }

    override fun onDestroy() {
        receiver?.disconnect()
        overlay?.releasePrivacy()
        super.onDestroy()
    }
}
