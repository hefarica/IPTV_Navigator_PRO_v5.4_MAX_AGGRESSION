package dev.venice.ottshim

import android.content.ComponentName
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService

/**
 * Observes one OTT MediaController. Six consecutive null states release it.
 * The session is a control/telemetry surface, not a video-processing path.
 */
class SessionTap : NotificationListenerService() {
    private val handler = Handler(Looper.getMainLooper())
    private var controller: MediaController? = null
    private var nullStreak = 0
    private var polling = false
    private var lastPosition = -1L
    private var lastState = -1
    private var lastZapAt = 0L
    private var lastActions: Long? = null
    private var lastCustomCount: Int? = null

    private val tick = Runnable { poll() }

    private var callback: MediaController.Callback? = null

    override fun onListenerConnected() {
        ensurePolling()
    }

    override fun onListenerDisconnected() {
        stopObserving()
    }

    override fun onDestroy() {
        stopObserving()
        super.onDestroy()
    }

    private fun stopObserving() {
        polling = false
        handler.removeCallbacks(tick)
        releaseController()
    }

    private fun releaseController() {
        val previous = controller
        controller = null
        callback?.let { previous?.unregisterCallback(it) }
        callback = null
        nullStreak = 0
        lastPosition = -1L
        lastState = -1
        lastZapAt = 0L
        lastActions = null
        lastCustomCount = null
        if (previous != null) ProxyService.policy.qoe.onSessionLost()
    }

    private fun ensurePolling() {
        if (polling) return
        polling = true
        handler.postDelayed(tick, 200L)
    }

    private fun poll() {
        if (!polling) return
        val current = controller
        if (current == null) {
            bindBest()
        } else {
            val state = current.playbackState
            if (state == null) {
                if (++nullStreak >= 6) {
                    releaseController()
                    android.util.Log.i("ottshim", "session released after 6 nulls")
                }
            } else {
                nullStreak = 0
                if (state.actions != lastActions || state.customActions.size != lastCustomCount) {
                    lastActions = state.actions
                    lastCustomCount = state.customActions.size
                    android.util.Log.i("ottshim", "ott_session actions=0x${state.actions.toString(16)} " +
                        "play=${supports(state, PlaybackState.ACTION_PLAY)} " +
                        "pause=${supports(state, PlaybackState.ACTION_PAUSE)} " +
                        "play_pause=${supports(state, PlaybackState.ACTION_PLAY_PAUSE)} " +
                        "next=${supports(state, PlaybackState.ACTION_SKIP_TO_NEXT)} " +
                        "previous=${supports(state, PlaybackState.ACTION_SKIP_TO_PREVIOUS)} " +
                        "play_from_uri=${supports(state, PlaybackState.ACTION_PLAY_FROM_URI)} " +
                        "custom_count=${state.customActions.size}")
                }
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
                    android.util.Log.i("ottshim", "ott_session transition_hint reset=$reset buffer=$rebufferStart")
                }
                lastPosition = state.position
                lastState = state.state
            }
        }
        if (polling) handler.postDelayed(tick, 200L)
    }

    private fun supports(state: PlaybackState, action: Long): Boolean = (state.actions and action) != 0L

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
        releaseController()
        controller = candidate
        val observer = object : MediaController.Callback() {
            override fun onSessionDestroyed() {
                if (controller === candidate) releaseController()
            }
        }
        callback = observer
        candidate.registerCallback(observer, handler)
        android.util.Log.i("ottshim", "session bind ${candidate.packageName} state=${candidate.playbackState?.state}")
    }

    companion object {
        private const val TARGET = "studio.scillarium.ottnavigator"
    }
}
