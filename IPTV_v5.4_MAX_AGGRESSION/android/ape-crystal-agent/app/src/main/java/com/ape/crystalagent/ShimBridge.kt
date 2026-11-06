package com.ape.crystalagent

import android.content.Context
import android.content.Intent
import android.os.Build
import dev.venice.ottshim.ProxyService
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * ShimBridge — puente ARA ⇄ :shim (ottshim).
 *
 * POR QUÉ VIVE AQUÍ Y NO EN UN APK APARTE:
 *  · `ottshim` entra como módulo `:shim` del mismo APK, así que "cuando se instale ARA
 *    ya está" sin un segundo install ni un segundo icono en Fire TV.
 *  · La actualización la cubre el SelfUpdateManager existente (/ara/version →
 *    /ara/agent.apk, sha256 + PIN DE FIRMA, fail-closed). Un APK suelto no tendría
 *    esa ruta verificada: en Fire OS una app normal NO puede instalar/actualizar otra
 *    en silencio.
 *  · Arranque MANUAL: un update de ARA no debe tocar la reproducción sin que el
 *    operador lo pida. El proxy queda parado hasta que se pulse el botón.
 *
 * HONESTO: este objeto NO mejora la imagen por sí solo. El shim reescribe el master y
 * fija la variante para que el player no baje de escalón; el realce de píxeles lo sigue
 * haciendo el SoC/daemon. Y si el player no apunta al loopback, el shim no interviene.
 */
object ShimBridge {
    @Volatile var running: Boolean = false
    @Volatile var port: Int = 0
    @Volatile var health: JSONObject? = null
    @Volatile var lastError: String = ""
    @Volatile var lastAt: Long = 0L

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(700, TimeUnit.MILLISECONDS)
        .readTimeout(900, TimeUnit.MILLISECONDS)
        .build()

    /** Arranca el proxy loopback con una fuente y (opcional) un techo declarado en kbps. */
    fun start(ctx: Context, sourceUrl: String, userAgent: String?, targetKbps: Int) {
        if (sourceUrl.isBlank()) { lastError = "fuente vacía"; return }
        val i = Intent(ctx, ProxyService::class.java)
            .putExtra("src", sourceUrl)
            .putExtra("ua", userAgent ?: "")
            .putExtra("targetKbps", targetKbps)
        runCatching {
            // minSdk 22 (Fire OS 5): startForegroundService es API 26.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }.onFailure { lastError = it.message ?: "no arrancó" }
        lastAt = System.currentTimeMillis()
    }

    fun stop(ctx: Context) {
        runCatching { ctx.stopService(Intent(ctx, ProxyService::class.java)) }
            .onFailure { lastError = it.message ?: "no paró" }
        running = false
        port = 0
        health = null
        lastAt = System.currentTimeMillis()
    }

    /**
     * Refresca estado. NUNCA llamar desde el hilo de UI: hace un GET a 127.0.0.1.
     * El puerto es efímero por arranque, así que se lee de ProxyService.port y no se cachea.
     */
    fun refresh() {
        port = ProxyService.port
        running = ProxyService.running && port > 0
        lastAt = System.currentTimeMillis()
        if (!running) { health = null; lastError = ""; return }
        val req = Request.Builder().url("http://127.0.0.1:$port/health").build()
        runCatching {
            http.newCall(req).execute().use { r ->
                val body = r.body?.string().orEmpty()
                health = runCatching { JSONObject(body) }.getOrNull()
                lastError = when {
                    !r.isSuccessful -> "health http ${r.code}"
                    health == null -> "health no es JSON"
                    else -> ""
                }
            }
        }.onFailure { lastError = it.message ?: "health inalcanzable" }
    }

    /** Texto de estado para el panel de ARA. Sin datos => lo dice, no inventa ceros. */
    fun line(): String {
        if (!running) {
            val why = if (lastError.isBlank()) "el proxy no está escuchando" else lastError
            return "shim: PARADO · $why\n" +
                "Se instala y actualiza con ARA (SelfUpdateManager: sha256 + pin de firma)."
        }
        val h = health
        if (h == null) {
            return "shim: ACTIVO en :$port · sin lectura de /health todavía" +
                (if (lastError.isBlank()) "" else " ($lastError)") + "\n" +
                "base=http://127.0.0.1:$port/source.m3u8"
        }
        val hits = h.optInt("cache_hits", -1)
        val misses = h.optInt("cache_misses", -1)
        val ratio = if (h.has("cache_hit_ratio") && !h.isNull("cache_hit_ratio"))
            String.format("%.1f%%", h.optDouble("cache_hit_ratio") * 100.0) else "null"
        val up = h.optLong("uptime_ms", 0L) / 1000L
        return buildString {
            append("shim: ACTIVO · puerto ").append(port).append(" · up ").append(up).append("s\n")
            append("cache ").append(hits).append('/').append(hits + misses)
            append(" (").append(ratio).append(") · segmentos ")
            append(h.optInt("media_segments_served", 0)).append(" · req ")
            append(h.optInt("requests", 0)).append(" · pending ")
            append(h.optInt("pending", 0)).append('\n')
            append("techo ").append(h.optLong("ceilingBps", 0L)).append(" B/s · admitido ")
            append(h.optLong("maxBwAdmitted", 0L)).append(" · ids ")
            append(h.optInt("ids", 0)).append(" · restarts ")
            append(h.optInt("restarts", 0)).append('\n')
            append("base=http://127.0.0.1:").append(port).append("/source.m3u8")
        }
    }
}
