package com.ape.crystalagent

import android.app.Activity
import android.os.Build
import android.util.Log

/**
 * Intenta fijar la ventana en 3840x2160@<=60 si el TV/HDMI lo soporta.
 * Si no hay modo 4K, NO se inventa: el panel lo reporta como limitación real.
 */
object Display4K {
    private const val TAG = "ApeDisplay4K"

    fun apply(activity: Activity) {
        if (Build.VERSION.SDK_INT < 23) return
        try {
            val display = activity.windowManager.defaultDisplay
            val modes = display.supportedModes ?: return
            val best = modes
                .filter { it.physicalWidth >= 3840 && it.physicalHeight >= 2160 }
                .maxByOrNull { it.refreshRate }
            if (best == null) {
                Log.w(TAG, "display_no_4k: el TV/HDMI no expone 3840x2160")
                AraStatus.display4k = false
                return
            }
            val lp = activity.window.attributes
            lp.preferredDisplayModeId = best.modeId
            activity.window.attributes = lp
            AraStatus.display4k = true
            AraStatus.displayMode = "${best.physicalWidth}x${best.physicalHeight}@${"%.0f".format(best.refreshRate)}"
            Log.i(TAG, "display 4K mode=${AraStatus.displayMode}")
        } catch (e: Exception) {
            Log.w(TAG, "display mode: ${e.message}")
            AraStatus.display4k = false
        }
    }
}
