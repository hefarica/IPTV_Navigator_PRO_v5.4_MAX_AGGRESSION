package com.ape.crystalagent

import android.app.Activity
import android.util.Log
import android.view.View
import com.ape.fluid.FluidStore

object PlayerHub {
    private const val TAG = "ApeImageEnhancer"
    var activity: Activity? = null
    var videoView: View? = null
    var player: ApePlayer? = null

    fun attach(a: Activity, v: View, p: ApePlayer) {
        activity = a
        videoView = v
        player = p
    }

    fun detach() {
        activity = null
        videoView = null
        player = null
    }

    /** Off real: parámetros 0, no "base" (que aún construía CrystalGlEffect). */
    fun neutral() {
        val c = activity ?: return
        FluidStore.prefs(c).edit()
            .putInt("sharpen_percent", 0)
            .putInt("denoise_percent", 0)
            .putInt("vibrance_percent", 0)
            .putInt("microcontrast_percent", 0)
            .apply()
        player?.refreshEffects()
        Log.i(TAG, "shader applied sharp=0 dnr=0 vib=0 contrast=0 (neutral)")
    }

    /** On medido: mismos techos que ImageEnhancer. */
    fun profile() {
        val c = activity ?: return
        FluidStore.prefs(c).edit()
            .putInt("sharpen_percent", 40)
            .putInt("denoise_percent", 16)
            .putInt("vibrance_percent", 7)
            .putInt("microcontrast_percent", 8)
            .apply()
        player?.refreshEffects()
        Log.i(TAG, "shader applied sharp=40 dnr=16 vib=7 contrast=8 (profile)")
    }

    fun pause() { player?.pause() }
    fun resume() { player?.play() }
    fun seekTo(ms: Long) { player?.seekTo(ms) }
}
