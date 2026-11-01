package com.ape.crystalagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Local, non-invasive zap signal. It never controls playback. */
class ZapReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION) return
        val now = System.currentTimeMillis()
        // A fresh token lets the VPS detector see a channel change even when
        // OTT does not expose a real channel_id in its MediaSession.
        AraStatus.currentChannelId = "zap-$now"
        AraStatus.lastZapAt = now
        AgentService.start(context)
        CaptureWatchdogService.start(context)
        android.util.Log.i("ARA-ZAP", "zap token=$now services requested")
    }

    companion object {
        const val ACTION = "com.ape.crystalagent.ZAP"
    }
}
