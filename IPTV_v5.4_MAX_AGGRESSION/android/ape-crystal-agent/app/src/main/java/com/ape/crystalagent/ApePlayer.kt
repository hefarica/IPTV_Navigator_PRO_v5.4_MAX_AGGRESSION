package com.ape.crystalagent

import android.content.Context
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.ape.fluid.FluidBridge

/**
 * Player propio con TRACK-SELECTION HEVC-first (F3). Si el master del proveedor ofrece HEVC + AVC,
 * fuerza HEVC — lo que OTT Navigator NO hizo (su ABR cayó a AVC). El VpnService (WG full-tunnel)
 * intercepta TODO el tráfico del proceso, así que no hace falta OkHttpDataSource.
 *
 * HONESTO (truth-guard): NO transcodifica; solo ELIGE la mejor variante REAL que el proveedor sirva.
 * Si el proveedor solo ofrece AVC esa sesión, reproduce AVC (no inventa HEVC). UltraEnhance (F6) y el
 * AI-PQ del SoC realzan el frame aparte.
 */
@UnstableApi
class ApePlayer(private val ctx: Context) {

    private var exo: ExoPlayer? = null

    fun build(): ExoPlayer {
        FluidBridge.warmup(ctx)
        val sel = DefaultTrackSelector(ctx)
        sel.parameters = sel.buildUponParameters()
            .setPreferredVideoMimeTypes(MimeTypes.VIDEO_H265, MimeTypes.VIDEO_AV1, MimeTypes.VIDEO_H264)
            .clearVideoSizeConstraints()
            .setForceHighestSupportedBitrate(false)          // el VPS controla el floor
            .setAllowVideoMixedMimeTypeAdaptiveness(false)   // no mezclar HEVC+AVC en ABR
            .build()
        val builder = ExoPlayer.Builder(ctx).setTrackSelector(sel)
        // APE Fluid: buffer/caché/decoder-fallback sobre el player existente (sin player nuevo).
        FluidBridge.configureBuilder(ctx, builder)
        return builder.build().also { p ->
            exo = p
            runCatching {
                @Suppress("UNCHECKED_CAST")
                p.setVideoEffects(FluidBridge.effects(ctx) as List<Effect>)
            }.onFailure { Log.w(TAG, "Fluid effects: ${it.message}") }
        }
    }

    fun playChannel(player: ExoPlayer, url: String, ua: String = DEFAULT_UA) {
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(ua)
            .setAllowCrossProtocolRedirects(true)            // sigue el 302 line→CDN
        val src = HlsMediaSource.Factory(http).createMediaSource(MediaItem.fromUri(url))
        player.setMediaSource(src)
        player.prepare()
        player.playWhenReady = true
        AraStatus.playerActive = true
        FluidBridge.attach(ctx, player, url, ua)
        Log.i(TAG, "playChannel HEVC-first ua=$ua url=$url")
    }

    /** Loguea qué variante eligió el track selector (codec/res/bitrate) — la verdad de tierra. */
    fun logSelected(tracks: Tracks) {
        for (g in tracks.groups) {
            if (g.type == C.TRACK_TYPE_VIDEO) {
                for (i in 0 until g.length) if (g.isTrackSelected(i)) {
                    val f = g.getTrackFormat(i)
                    val line = "mime=${f.sampleMimeType} codecs=${f.codecs} ${f.width}x${f.height} bps=${f.bitrate}"
                    AraStatus.lastTrack = line
                    Log.i(TAG, "VIDEO elegido: $line")
                }
            }
        }
    }

    fun release() {
        exo?.let { FluidBridge.detach(it) }
        exo?.release(); exo = null
        AraStatus.playerActive = false
    }

    companion object {
        const val TAG = "ApePlayer"
        const val DEFAULT_UA = "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager"
    }
}
