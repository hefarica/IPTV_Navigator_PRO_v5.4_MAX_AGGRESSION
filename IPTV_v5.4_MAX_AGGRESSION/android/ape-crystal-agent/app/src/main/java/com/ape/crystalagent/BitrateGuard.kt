package com.ape.crystalagent

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector

/**
 * BitrateGuard v32 — banda por origen×salida con MEDICIÓN REAL del DataSource.
 *
 * Regla (sin inventar):
 *  · medido < piso  → lock al máximo DISPONIBLE DENTRO DEL WINDOW + ALERT tras 8 s de medición fresca.
 *  · piso..techo    → lock a la mayor variante DENTRO de banda.
 *  · medido > techo → lock a la mayor ≤ techo; nunca una por debajo del piso si alguna lo cumple.
 *  · sin ≥2 muestras frescas (< 6 s) → NO_DATA: no se decide, no se lockea, no se arma ALERT.
 *  · window de resolución vacío → NO_WINDOW: **no se toca el selector** (evita pantalla negra).
 *
 * BG7 (t44) — reparación sobre v31:
 *  · F04: se elimina el fallback `if (inWindow.isNotEmpty()) inWindow else variants`. El objetivo
 *    SALE SIEMPRE del window; si está vacío ⇒ NO_WINDOW y cero mutaciones del selector.
 *    `lockTo` re-verifica pertenencia al window antes de setMin/setMax (defensa en profundidad).
 *  · F03: se exige `samples >= 2` además de edad fresca (una sola muestra da kbps()=0 y antes
 *    podía decidir).
 *  · F10: `reset()` limpia también max/floor/ceil/source/out/at del panel, no sólo el temporizador.
 *
 * BG5 (t42): F01 — el relleno NO se reclama desde aquí: las tres claves de relleno sin lector se
 * eliminaron; lo único real es `buffer_profile`/`buffer_min_s`/`buffer_max_s`, que escribe
 * `ApePlayer.build()` y consume `FluidBridge` al construir el `DefaultLoadControl` (inmutable luego).
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
            Log.i(TAG, "bitrate state=ALERT timer=8s below_floor_ms=${SystemClock.elapsedRealtime() - belowSince}")
        }
    }

    /** F11/F10: se llama en `playChannel` (zap) y en `release()`. Limpia temporizador Y panel. */
    fun reset() {
        handler.removeCallbacks(promoteAlert)
        belowSince = 0L
        lastLocked = -1
        lastLoggedState = ""
        lastLoggedLock = -1
        calls = 0
        state = "SETTLED"
        AraStatus.bitrateState = state
        AraStatus.bitrateKbps = 0
        AraStatus.bitrateNetworkKbps = 0
        AraStatus.bitrateMaxVariantKbps = 0
        AraStatus.bitrateFloorKbps = 0
        AraStatus.bitrateCeilKbps = 0
        AraStatus.bitrateSourceBand = ""
        AraStatus.bitrateOutBand = ""
        AraStatus.bitrateAt = 0L
        AraStatus.bufferPct = 0
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

        val p = selector.parameters
        val wf = variants.map { WindowFormat(it.width, it.height, it.bitrate) }
        val inWindow = BitrateWindow.filter(wf, p.minVideoWidth, p.minVideoHeight, p.maxVideoWidth, p.maxVideoHeight)
        val now = SystemClock.elapsedRealtime()
        val policy = PlaybackPolicy.fromSync(ctx)
        val maxMs = (policy.bufferMaxS * 1000L).coerceAtLeast(1L)
        val bufPct = ((player.totalBufferedDuration.coerceAtLeast(0L) * 100L) / maxMs).toInt().coerceIn(0, 100)
        val networkKbps = meter.kbps()

        // ── F04: window vacío ⇒ NO_WINDOW y CERO mutaciones del selector ────────────────
        if (inWindow.isEmpty()) {
            handler.removeCallbacks(promoteAlert)
            belowSince = 0L
            state = "NO_WINDOW"
            AraStatus.bitrateKbps = 0
            AraStatus.bitrateNetworkKbps = networkKbps
            AraStatus.bitrateMaxVariantKbps = 0
            AraStatus.bitrateFloorKbps = 0
            AraStatus.bitrateCeilKbps = 0
            AraStatus.bitrateSourceBand = ""
            AraStatus.bitrateOutBand = BitrateConfig.outBand(policy.targetHeight)
            AraStatus.bitrateState = state
            AraStatus.bufferPct = bufPct
            AraStatus.bitrateAt = System.currentTimeMillis()
            if (state != lastLoggedState || calls % 4 == 0) {
                lastLoggedState = state
                Log.w(TAG, "NO_WINDOW: 0/${variants.size} variantes dentro de " +
                    "win=${p.minVideoWidth}x${p.minVideoHeight}-${p.maxVideoWidth}x${p.maxVideoHeight} " +
                    "— no se toca el selector (lock preservado=${lastLocked / 1000}kbps)")
            }
            calls++
            return
        }

        val windowFmt = inWindow.maxByOrNull { it.bitrate } ?: return
        val band = BitrateConfig.band(ctx, windowFmt.height, policy.targetHeight)
        val maxKbps = windowFmt.bitrate / 1000
        val measured = if (maxKbps > 0 && networkKbps > maxKbps) maxKbps else networkKbps

        // ── F03: sin ≥2 muestras frescas no hay decisión ni ALERT ───────────────────────
        if (!meter.hasFresh(now) || meter.samples() < 2) {
            handler.removeCallbacks(promoteAlert)
            belowSince = 0L
            state = "NO_DATA"
            publish(band, 0, networkKbps, maxKbps, bufPct, windowFmt.height, policy, inWindow.size, variants.size, p)
            return
        }

        val maxBelowFloor = maxKbps < band.floorKbps
        if (measured in 1 until band.floorKbps || maxBelowFloor) {
            if (belowSince == 0L) {
                belowSince = now
                handler.removeCallbacks(promoteAlert)
                handler.postDelayed(promoteAlert, 8_000L)
            }
            state = if (now - belowSince >= 8_000L) "ALERT" else "FLOOR_BREAK"
            lockTo(windowFmt, "below_floor")
        } else {
            handler.removeCallbacks(promoteAlert)
            belowSince = 0L
            val target = BitrateWindow.pickTarget(inWindow, band.floorKbps, band.ceilKbps)
            if (target == null) {
                state = "NO_WINDOW"
                publish(band, measured, networkKbps, maxKbps, bufPct, windowFmt.height, policy, inWindow.size, variants.size, p)
                return
            }
            lockTo(target, "in_band_or_ceiling")
            state = when {
                BitrateWindow.isBelowFloor(target, band.floorKbps) -> "FLOOR_BREAK"
                measured >= ((band.ceilKbps * 0.95).toInt()) -> "CEILING"
                measured < ((band.floorKbps * 1.15).toInt()) -> "FLOOR_BREAK"
                else -> "IN_BAND"
            }
        }

        publish(band, measured, networkKbps, maxKbps, bufPct, windowFmt.height, policy, inWindow.size, variants.size, p)
    }

    private fun publish(
        band: BitrateBand, measured: Int, networkKbps: Int, maxKbps: Int, bufPct: Int,
        srcHeight: Int, policy: PlaybackPolicy, nCand: Int, nAll: Int, p: TrackSelectionParameters
    ) {
        AraStatus.bitrateKbps = measured
        AraStatus.bitrateNetworkKbps = networkKbps
        AraStatus.bitrateMaxVariantKbps = maxKbps
        AraStatus.bitrateFloorKbps = band.floorKbps
        AraStatus.bitrateCeilKbps = band.ceilKbps
        AraStatus.bitrateSourceBand = BitrateConfig.sourceBand(srcHeight)
        AraStatus.bitrateOutBand = BitrateConfig.outBand(policy.targetHeight)
        AraStatus.bitrateState = state
        AraStatus.bufferPct = bufPct
        AraStatus.bitrateAt = System.currentTimeMillis()
        calls++
        if (state != lastLoggedState || lastLocked != lastLoggedLock || calls % 4 == 0) {
            lastLoggedState = state
            lastLoggedLock = lastLocked
            Log.i(TAG, "bitrate=${measured}kbps net=${networkKbps} maxvar=${maxKbps} " +
                "floor=${band.floorKbps} ceil=${band.ceilKbps} state=$state buf=$bufPct% " +
                "lock=${lastLocked / 1000} cand=$nCand/$nAll " +
                "win=${p.minVideoWidth}x${p.minVideoHeight}-${p.maxVideoWidth}x${p.maxVideoHeight} " +
                "samples=${meter.samples()} sample_age=${meter.ageMs()}ms")
        }
    }

    /** F04 (defensa en profundidad): sólo se fija un bitrate que pertenezca al window ACTUAL. */
    private fun lockTo(w: WindowFormat, reason: String) {
        if (w.bitrate <= 0) return
        if (w.bitrate == lastLocked) return
        val p = selector.parameters
        if (!BitrateWindow.contains(w, p.minVideoWidth, p.minVideoHeight, p.maxVideoWidth, p.maxVideoHeight)) {
            Log.w(TAG, "lockTo REFUSED: ${w.width}x${w.height}@${w.bitrate / 1000}kbps fuera del window " +
                "${p.minVideoWidth}x${p.minVideoHeight}-${p.maxVideoWidth}x${p.maxVideoHeight}")
            return
        }
        runCatching {
            selector.parameters = selector.buildUponParameters()
                .setMinVideoBitrate(w.bitrate)
                .setMaxVideoBitrate(w.bitrate)
                .build()
            lastLocked = w.bitrate
            Log.i(TAG, "LOCK ${w.width}x${w.height}@${w.bitrate / 1000}kbps reason=$reason")
        }.onFailure { Log.w(TAG, "lockTo: ${it.message}") }
    }

    companion object { const val TAG = "ApeBitrateGuard" }
}
