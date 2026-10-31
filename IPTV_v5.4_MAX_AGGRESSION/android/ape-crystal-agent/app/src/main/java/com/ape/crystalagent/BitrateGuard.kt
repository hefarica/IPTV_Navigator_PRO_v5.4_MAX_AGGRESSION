package com.ape.crystalagent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.ape.fluid.FluidStore

/**
 * Regla del piso/techo:
 *  - medido < piso  → lock al máximo disponible (aunque sea menor al piso), alerta tras 8 s.
 *  - piso..techo    → lock a la mayor variante dentro de banda (persecución ascendente).
 *  - medido > techo → lock a la mayor <= techo (no sobre-pide).
 * No inventa bitrate: si el origen solo tiene 8, se sostiene 8 con ALERT.
 */
class BitrateGuard(
    private val ctx: Context,
    private val meter: BitrateMeter,
    private val player: ExoPlayer,
    private val selector: DefaultTrackSelector
) {
    @Volatile private var belowSince = 0L
    @Volatile private var state = "SETTLED"
    @Volatile private var lastLocked = -1
    @Volatile private var lastLoggedState = ""
    @Volatile private var lastLoggedLock = -1
    @Volatile private var calls = 0
    private val handler = Handler(Looper.getMainLooper())
    private val promoteAlert = Runnable {
        if (belowSince > 0L) {
            state = "ALERT"
            AraStatus.bitrateState = state
            Log.i(TAG, "bitrate state=ALERT timer=8s belowSince=$belowSince")
        }
    }

    fun evaluate(tracks: Tracks) {
        val variants = ArrayList<Format>()
        for (g in tracks.groups) {
            if (g.type != C.TRACK_TYPE_VIDEO) continue
            for (i in 0 until g.length) {
                val f = g.getTrackFormat(i)
                if (f.width > 0 && f.height > 0 && f.bitrate > 0) variants.add(f)
            }
        }
        if (variants.isEmpty()) return

        // BG1-FIX: sólo se puede fijar un bitrate que EXISTA dentro de la ventana de resolución
        // que `lockHighest` ya fijó. Si no, pinchar size(4K) + bitrate(1080p) deja el grupo sin
        // variante seleccionable ⇒ pantalla negra. Se filtran los candidatos por el size actual.
        val p = selector.parameters
        val inWindow = variants.filter { f ->
            (p.minVideoWidth <= 0 || f.width >= p.minVideoWidth) &&
                (p.minVideoHeight <= 0 || f.height >= p.minVideoHeight) &&
                (p.maxVideoWidth == Int.MAX_VALUE || f.width <= p.maxVideoWidth) &&
                (p.maxVideoHeight == Int.MAX_VALUE || f.height <= p.maxVideoHeight)
        }
        val candidates = if (inWindow.isNotEmpty()) inWindow else variants

        val maxAvail = candidates.maxByOrNull { it.bitrate } ?: return
        val policy = PlaybackPolicy.fromSync(ctx)
        val band = BitrateConfig.band(ctx, maxAvail.height, policy.targetHeight)
        val networkKbps = meter.kbps()
        val maxKbps = maxAvail.bitrate / 1000
        // BG1-FIX2: las ráfagas de prefetch/cache pueden superar el bitrate del segmento.
        // Para decidir se capa el medido al máximo REAL de la variante; el raw queda en el panel.
        val measured = if (maxKbps > 0 && networkKbps > maxKbps) maxKbps else networkKbps
        val maxBelowFloor = maxKbps < band.floorKbps
        val now = SystemClock.elapsedRealtime()
        val maxMs = (policy.bufferMaxS * 1000L).coerceAtLeast(1L)
        val bufPct = ((player.totalBufferedDuration.coerceAtLeast(0L) * 100L) / maxMs).toInt().coerceIn(0, 100)

        if (measured in 1 until band.floorKbps || maxBelowFloor) {
            if (belowSince == 0L) {
                belowSince = now
                handler.removeCallbacks(promoteAlert)
                handler.postDelayed(promoteAlert, 8_000L)
            }
            state = if (now - belowSince >= 8_000L) "ALERT" else "FLOOR_BREAK"
            lockTo(maxAvail)
            FillController.sustain(ctx, aggressive = true)
        } else {
            if (belowSince != 0L) handler.removeCallbacks(promoteAlert)
            belowSince = 0L
            val inBand = candidates.filter { it.bitrate / 1000 in band.floorKbps..band.ceilKbps }.maxByOrNull { it.bitrate }
            val underCeil = candidates.filter { it.bitrate / 1000 <= band.ceilKbps }.maxByOrNull { it.bitrate }
            val target = inBand ?: underCeil ?: maxAvail
            lockTo(target)
            state = when {
                measured >= ((band.ceilKbps * 0.95).toInt()) -> "CEILING"
                measured < ((band.floorKbps * 1.15).toInt()) -> "FLOOR_BREAK"
                else -> "IN_BAND"
            }
            FillController.sustain(ctx, aggressive = measured < (band.floorKbps * 1.15).toInt())
        }

        AraStatus.bitrateKbps = measured
        AraStatus.bitrateNetworkKbps = networkKbps
        AraStatus.bitrateMaxVariantKbps = maxKbps
        AraStatus.bitrateFloorKbps = band.floorKbps
        AraStatus.bitrateCeilKbps = band.ceilKbps
        AraStatus.bitrateSourceBand = BitrateConfig.sourceBand(maxAvail.height)
        AraStatus.bitrateOutBand = BitrateConfig.outBand(policy.targetHeight)
        AraStatus.bitrateState = state
        AraStatus.bufferPct = bufPct
        AraStatus.bitrateAt = System.currentTimeMillis()
        calls++
        // Anti-spam: se loguea al cambiar de estado/lock y, si no cambia, 1 de cada 4 (≈8 s a 2 s).
        if (state != lastLoggedState || lastLocked != lastLoggedLock || calls % 4 == 0) {
            lastLoggedState = state
            lastLoggedLock = lastLocked
            Log.i(TAG, "bitrate=${measured}kbps floor=${band.floorKbps} ceil=${band.ceilKbps} " +
                "max=${maxAvail.bitrate / 1000} state=$state buf=$bufPct% lock=${lastLocked / 1000} " +
                "cand=${candidates.size}/${variants.size} win=${p.minVideoWidth}x${p.minVideoHeight}-${p.maxVideoWidth}x${p.maxVideoHeight}")
        }
    }

    private fun lockTo(f: Format) {
        if (f.bitrate <= 0 || f.bitrate == lastLocked) return
        runCatching {
            selector.parameters = selector.buildUponParameters()
                .setMinVideoBitrate(f.bitrate)
                .setMaxVideoBitrate(f.bitrate)
                .build()
            lastLocked = f.bitrate
        }.onFailure { Log.w(TAG, "lockTo: ${it.message}") }
    }

    companion object { const val TAG = "ApeBitrateGuard" }
}

/** Relleno: el 60% no apaga; reduce conexiones 6→4 y mantiene prefetch 5. */
object FillController {
    @Volatile private var lastAgg: Boolean? = null

    fun sustain(ctx: Context, aggressive: Boolean) {
        AraStatus.fillAggressive = aggressive
        AraStatus.neverStopFilling = true
        // BG1-FIX: `evaluate` corre cada 2 s; no se reescribe el prefs si no cambió nada
        // (evita churn de disco en un device que reproduce 24/7).
        if (lastAgg == aggressive) return
        lastAgg = aggressive
        runCatching {
            FluidStore.prefs(ctx).edit()
                .putString("buffer_profile", "max")
                .putInt("prefetch_segments", 5)
                .putInt("buffer_connections", if (aggressive) 6 else 4)
                .putBoolean("never_stop_filling", true)
                .apply()
            Log.i(TAG_FILL, "fill aggressive=$aggressive conn=${if (aggressive) 6 else 4} prefetch=5 never_stop=true")
        }.onFailure { Log.w(TAG_FILL, "fill: ${it.message}") }
    }

    private const val TAG_FILL = "ApeBitrateGuard"
}
