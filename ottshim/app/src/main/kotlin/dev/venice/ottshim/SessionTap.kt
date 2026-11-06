package dev.venice.ottshim

import android.content.ComponentName
import android.content.Intent
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService

/**
 * Owns one OTT MediaController. A transient null playbackState is tolerated
 * for 6 consecutive polls (1.2 s); only then is the session released.
 * There is exactly one polling loop; callbacks never start a second one.
 */
class SessionTap : NotificationListenerService() {
    private val handler = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private var nullStreak = 0
    private var polling = false
    private var lastPosition = -1L
    private var lastState = -1
    private var lastZapAt = 0L

    private val callback = object : MediaController.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackState?) {
            if (state?.state == PlaybackState.STATE_PLAYING) ensurePolling()
        }
    }

    override fun onListenerConnected() {
        ensurePolling()
    }

    private fun ensurePolling() {
        if (polling) return
        polling = true
        handler.postDelayed(::poll, 200L)
    }

    private fun poll() {
        val current = controller
        if (current == null) {
            bindBest()
        } else {
            val state = current.playbackState
            if (state == null) {
                if (++nullStreak > 6) {
                    current.unregisterCallback(callback)
                    controller = null
                    nullStreak = 0
                    ProxyService.policy.qoe.onSessionLost()
                    android.util.Log.i("ottshim", "session released after 6 nulls")
                }
            } else {
                nullStreak = 0
                ProxyService.policy.qoe.onSession(
                    current.packageName,
                    state.state,
                    state.position,
                    state.bufferedPosition
                )
                val reset = lastPosition >= 0L && state.position + 1_500L < lastPosition
                val rebufferStart = lastState == PlaybackState.STATE_PLAYING &&
                    state.state == PlaybackState.STATE_BUFFERING
                val now = System.currentTimeMillis()
                if ((reset || rebufferStart) && now - lastZapAt > 3_000L) {
                    lastZapAt = now
                    sendBroadcast(
                        Intent("com.ape.crystalagent.ZAP")
                            .setPackage("com.ape.crystalagent")
                    )
                    android.util.Log.i("ottshim", "zap signal reset=$reset buffer=$rebufferStart")
                }
                lastPosition = state.position
                lastState = state.state
            }
        }
        handler.postDelayed(::poll, 200L)
    }

    private fun bindBest() {
        runCatching {
            val msm = getSystemService(MediaSessionManager::class.java) ?: return
            val component = ComponentName(this, SessionTap::class.java)
            val all = msm.getActiveSessions(component).filter { it.packageName == TARGET }
            all.forEach {
                val st = it.playbackState
                android.util.Log.i(
                    "ottshim",
                    "candidate state=${st?.state} pos=${st?.position} buf=${st?.bufferedPosition} updated=${st?.lastPositionUpdateTime}"
                )
            }
            val candidate = all.filter { it.playbackState != null }
                .maxByOrNull { it.playbackState?.lastPositionUpdateTime ?: 0L }
                ?: all.firstOrNull()
            candidate?.let(::bind)
        }
    }

    private fun bind(candidate: MediaController) {
        if (candidate.packageName != TARGET) return
        if (controller?.sessionToken == candidate.sessionToken) return
        controller?.unregisterCallback(callback)
        controller = candidate
        nullStreak = 0
        candidate.registerCallback(callback)
        android.util.Log.i("ottshim", "session bind ${candidate.packageName} state=${candidate.playbackState?.state}")
    }

    companion object {
        private const val TARGET = "studio.scillarium.ottnavigator"
    }
}
