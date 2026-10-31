package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
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
        receiver = MetaReceiver(tokenProvider = { token }).also { it.connect() }
        overlay = PrivacyOverlayView(this)
        addContentView(overlay, ViewGroup.LayoutParams(200, 200))
        Log.i("ARA-SSE", "test started token=${token.isNotEmpty()} privacy=${PrivacyOverlayView.privacyAvailable}")
    }

    override fun onDestroy() {
        receiver?.disconnect()
        overlay?.releasePrivacy()
        super.onDestroy()
    }
}
