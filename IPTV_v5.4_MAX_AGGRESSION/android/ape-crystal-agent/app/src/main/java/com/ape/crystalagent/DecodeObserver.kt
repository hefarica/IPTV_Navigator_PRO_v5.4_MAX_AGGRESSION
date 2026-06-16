package com.ape.crystalagent

import android.util.Log
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Captura la REALIDAD del canal leyendo logcat en STREAMING, restringido a tags de DECODER ACTIVO.
 *
 * RESUELVE EL BUG S12 del shell daemon: NO leer CodecQuerier/MediaCodecList (capacidad del device,
 * que en el Firestick anuncia "HEVC 4K HDR10" aunque la fuente sea AVC 1080p). Solo cuentan las
 * líneas de cambio de formato de salida del decoder en curso (updateFormatChanged / output format).
 *
 * Requiere READ_LOGS — grantable a una app sideloaded:  adb shell pm grant <pkg> android.permission.READ_LOGS
 * Cada cambio de formato distinto = un ZAP → emite RealDecode.
 */
class DecodeObserver(private val onZap: (RealDecode) -> Unit) {
    private var job: Job? = null
    @Volatile private var last: RealDecode? = null

    fun start(scope: CoroutineScope) {
        job = scope.launch(Dispatchers.IO) {
            val cmd = arrayOf(
                "logcat", "-v", "brief",
                "-s",
                "MediaCodecVideoRenderer:D", "ExoPlayerImpl:D", "ExoPlayerImpl:V",
                "CCodec:D", "CCodecBuffers:D", "OMXCodec:V", "VideoRenderQualityTracker:D"
            )
            while (isActive) {
                try {
                    val p = ProcessBuilder(*cmd).redirectErrorStream(true).start()
                    BufferedReader(InputStreamReader(p.inputStream)).use { br ->
                        var line: String?
                        while (isActive && br.readLine().also { line = it } != null) {
                            parseActiveDecode(line ?: continue)?.let { rd ->
                                if (rd != last && rd.hasMin()) {
                                    last = rd
                                    Log.i(TAG, "ZAP real → $rd")
                                    onZap(rd)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "logcat stream err: ${e.message}")
                    delay(2000)
                }
            }
        }
    }

    fun stop() { job?.cancel() }

    /** Devuelve RealDecode SOLO si la línea es un evento de decoder activo (cambio de formato). */
    private fun parseActiveDecode(raw: String): RealDecode? {
        val l = raw.lowercase()
        val isActive = l.contains("updateformatchanged") ||
                l.contains("onoutputformatchanged") ||
                l.contains("output format changed") ||
                (l.contains("width=") && l.contains("height="))
        if (!isActive) return null

        val codec = when {
            Regex("video/hevc|sampmimetype=video/hevc|hvc1\\.|hev1\\.").containsMatchIn(l) -> "hevc"
            Regex("video/av01|av01\\.").containsMatchIn(l) -> "av1"
            Regex("video/dolby|dvhe\\.|dvh1\\.").containsMatchIn(l) -> "dvhe"
            else -> ""   // avc/h264 u otro → vacío; ape-match decide tier seguro sin mentir
        }
        val w = Regex("width=(\\d+)").find(l)?.groupValues?.getOrNull(1)?.toIntOrNull()
        val h = Regex("height=(\\d+)").find(l)?.groupValues?.getOrNull(1)?.toIntOrNull()
        val res = if (w != null && h != null && w > 0 && h > 0) "${w}x${h}"
        else Regex("(\\d{3,4})x(\\d{3,4})").find(l)?.value ?: ""

        val fps = Regex("framerate=([0-9.]+)").find(l)?.groupValues?.getOrNull(1)?.toFloatOrNull()

        val hdr = when {
            Regex("colortransfer=6|st2084|smpte2084|hdr10").containsMatchIn(l) -> "PQ"
            Regex("colortransfer=7|arib-b67|\\bhlg\\b").containsMatchIn(l) -> "HLG"
            else -> ""   // SDR — NUNCA inventar HDR
        }
        return RealDecode(codec, res, fps, hdr)
    }

    companion object { const val TAG = "ApeDecodeObserver" }
}
