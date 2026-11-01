package com.ape.crystalagent

import android.app.Activity
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import java.io.File
import java.io.FileOutputStream

object AbCapture {
    fun grab(act: Activity, v: View, out: File, cb: (Boolean) -> Unit) {
        val h = Handler(Looper.getMainLooper())
        val w = v.width
        val hh = v.height
        if (w <= 0 || hh <= 0) { cb(false); return }
        val surface = findSurface(v)
        when {
            surface != null -> {
                val bmp = Bitmap.createBitmap(w, hh, Bitmap.Config.ARGB_8888)
                PixelCopy.request(surface, bmp, { r ->
                    cb(r == PixelCopy.SUCCESS && save(bmp, out))
                }, h)
            }
            v is TextureView -> cb(v.bitmap?.let { save(it, out) } ?: false)
            else -> cb(false)
        }
    }

    private fun findSurface(v: View): SurfaceView? {
        if (v is SurfaceView) return v
        if (v is ViewGroup) {
            for (i in 0 until v.childCount) {
                findSurface(v.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun save(b: Bitmap, f: File): Boolean = runCatching {
        f.parentFile?.mkdirs()
        FileOutputStream(f).use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
        true
    }.getOrDefault(false)
}
