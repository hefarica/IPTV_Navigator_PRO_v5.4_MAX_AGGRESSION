package com.ape.crystalagent

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Fallback foreground sensor for the capture watchdog. Accessibility gives
 * the package of the focused window even when UsageStats is unavailable.
 * It only observes TYPE_WINDOW_STATE_CHANGED and launches the existing
 * MediaProjection consent Activity; it never reads window content.
 */
class AraAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString().orEmpty()
        if (pkg.isEmpty()) return
        Log.i(TAG, "window pkg=$pkg")
        CaptureWatchdogService.onForeground(this, pkg)
    }

    override fun onInterrupt() = Unit

    companion object {
        private const val TAG = "ARA_ACCESS"
    }
}
