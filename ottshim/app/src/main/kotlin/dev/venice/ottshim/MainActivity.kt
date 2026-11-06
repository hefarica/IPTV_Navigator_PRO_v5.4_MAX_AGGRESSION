package dev.venice.ottshim

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var logView: TextView
    private lateinit var source: EditText

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        source = EditText(this).apply {
            hint = "URL fuente pública (master.m3u8)"
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        val target = EditText(this).apply {
            hint = "techo kbps (ej. 500)"
            inputType = InputType.TYPE_CLASS_NUMBER
            setText("500")
        }
        val ua = EditText(this).apply { hint = "User-Agent (opcional)" }
        val start = Button(this).apply {
            text = "iniciar"
            setOnClickListener { startProxy(source.text.toString(), target.text.toString(), ua.text.toString()) }
        }
        val stop = Button(this).apply {
            text = "parar"
            setOnClickListener {
                stopService(Intent(this@MainActivity, ProxyService::class.java))
                logView.text = "detenido"
            }
        }
        val sessionAccess = Button(this).apply {
            text = "Acceso a notificaciones (MediaSession)"
            setOnClickListener {
                startActivity(Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }
        logView = TextView(this).apply { textSize = 10f }
        listOf(source, target, ua, start, stop, sessionAccess, logView).forEach(root::addView)
        setContentView(root)

        Log.sink = { message -> runOnUiThread { logView.text = message + "\n" + logView.text.take(4000) } }
        intent?.getIntExtra("targetKbps", 0)?.takeIf { it > 0 }?.let {
            target.setText(it.toString())
        }
        intent?.getStringExtra("src")?.let {
            source.setText(it)
            start.postDelayed({ startProxy(it, target.text.toString(), ua.text.toString()) }, 200)
        }
    }

    private fun startProxy(url: String, kbps: String, ua: String) {
        if (url.isBlank()) {
            logView.text = "falta URL"
            return
        }
        val intent = Intent(this, ProxyService::class.java)
            .putExtra("src", url)
            .putExtra("targetKbps", kbps.toIntOrNull() ?: 0)
            .putExtra("ua", ua)
        // [ARASHIM] minSdk 22: startForegroundService es API 26. En Fire OS 5/6 (22-23)
        // hay que usar startService; si no, el shim no arranca en sticks viejos.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
        logView.postDelayed({
            if (ProxyService.port > 0) {
                val base = "http://127.0.0.1:${ProxyService.port}"
                logView.text = "base=$base\nsource=$base/source.m3u8\nhealth=$base/health"
            }
        }, 500)
    }
}
