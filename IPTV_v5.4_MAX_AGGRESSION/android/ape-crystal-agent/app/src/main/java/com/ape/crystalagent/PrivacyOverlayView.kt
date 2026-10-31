package com.ape.crystalagent

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.AttributeSet
import android.util.Log
import android.view.TextureView
import android.view.View

/**
 * TextureView whose surface is marked setSkipScreenshot when the hidden API
 * exists. Fail-closed: if any step fails, privacyAvailable=false and callers
 * must not present a filtered full-screen overlay.
 */
class PrivacyOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : TextureView(context, attrs) {
    companion object {
        private const val TAG = "ARA-Overlay"
        @Volatile var privacyAvailable: Boolean = true
    }

    private var surfaceControl: Any? = null
    private var skipScreenshot: java.lang.reflect.Method? = null
    private var applied = false
    private var attempts = 0

    init {
        isOpaque = false
        surfaceTextureListener = object : SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(s: SurfaceTexture, w: Int, h: Int) {
                setup()
            }
            override fun onSurfaceTextureSizeChanged(s: SurfaceTexture, w: Int, h: Int) {}
            override fun onSurfaceTextureDestroyed(s: SurfaceTexture): Boolean {
                releasePrivacy()
                return true
            }
            override fun onSurfaceTextureUpdated(s: SurfaceTexture) {}
        }
    }

    private fun setup() {
        if (!privacyAvailable) return
        try {
            val scClass = Class.forName("android.view.SurfaceControl")
            val txClass = Class.forName("android.view.SurfaceControl\$Transaction")
            // The repo's working path: overlay root ViewRootImpl -> window SurfaceControl.
            // TextureView.getSurfaceControl does not exist on Android 14.
            val viewRootImpl = View::class.java.getDeclaredMethod("getViewRootImpl")
                .apply { isAccessible = true }.invoke(this)
                ?: throw IllegalStateException("no ViewRootImpl")
            var sc: Any? = runCatching {
                viewRootImpl.javaClass.getMethod("getSurfaceControl").invoke(viewRootImpl)
            }.getOrNull()
            if (sc == null) {
                var cls: Class<*>? = viewRootImpl.javaClass
                while (cls != null && sc == null) {
                    sc = runCatching {
                        cls!!.getDeclaredField("mSurfaceControl").apply { isAccessible = true }
                            .get(viewRootImpl)
                    }.getOrNull()
                    cls = cls.superclass
                }
            }
            if (sc == null) {
                // SurfaceControl may not exist until relayoutWindow()/first frame.
                attempts++
                if (attempts < 20) {
                    Log.d(TAG, "SurfaceControl todavía null; retry $attempts")
                    postDelayed({ setup() }, 250L)
                    return
                }
                throw IllegalStateException("SurfaceControl null after $attempts")
            }
            surfaceControl = sc
            skipScreenshot = txClass.getMethod("setSkipScreenshot", scClass, Boolean::class.javaPrimitiveType)
            applyPrivacy(true)
            Log.i(TAG, "skipScreenshot applied root=${viewRootImpl.javaClass.simpleName}")
        } catch (e: Throwable) {
            privacyAvailable = false
            Log.e(TAG, "privacy unavailable: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun applyPrivacy(exclude: Boolean) {
        if (!privacyAvailable || surfaceControl == null) return
        try {
            val txClass = Class.forName("android.view.SurfaceControl\$Transaction")
            val tx = txClass.getConstructor().newInstance()
            skipScreenshot?.invoke(tx, surfaceControl, exclude)
            txClass.getMethod("apply").invoke(tx)
            applied = exclude
        } catch (e: Throwable) {
            privacyAvailable = false
            Log.e(TAG, "applyPrivacy failed: ${e.message}")
        }
    }

    fun releasePrivacy() {
        if (applied) applyPrivacy(false)
        applied = false
    }

    fun isPrivacyWorking(): Boolean = applied
}
