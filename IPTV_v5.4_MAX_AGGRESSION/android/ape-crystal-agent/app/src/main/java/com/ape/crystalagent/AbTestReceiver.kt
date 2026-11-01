package com.ape.crystalagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

class AbTestReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        val p = ctx.getSharedPreferences("ab", 0)
        when (i.getStringExtra("cmd")) {
            "off" -> {
                p.edit().putBoolean("on", false).apply()
                PlayerHub.neutral()
            }
            "on" -> {
                p.edit().putBoolean("on", true).apply()
                PlayerHub.profile()
            }
            "freeze" -> PlayerHub.pause()
            "resume" -> PlayerHub.resume()
            "seek" -> PlayerHub.seekTo(i.getLongExtra("ms", 60_000L))
            "shot" -> {
                val tag = i.getStringExtra("tag") ?: "x"
                val act = PlayerHub.activity
                val v = PlayerHub.videoView
                if (act == null || v == null) {
                    ctx.sendBroadcast(Intent(ACTION_DONE).putExtra("tag", tag).putExtra("ok", false))
                    return
                }
                AbCapture.grab(act, v, File(ctx.getExternalFilesDir(null), "ab_$tag.png")) { ok ->
                    ctx.sendBroadcast(Intent(ACTION_DONE).putExtra("tag", tag).putExtra("ok", ok))
                }
            }
        }
    }

    companion object { const val ACTION_DONE = "com.ape.crystalagent.AB_DONE" }
}
