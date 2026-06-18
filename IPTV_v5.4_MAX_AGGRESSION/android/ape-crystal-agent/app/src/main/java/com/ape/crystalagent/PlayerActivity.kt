package com.ape.crystalagent

import android.app.Activity
import android.os.Bundle
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * Player MVP (F3) con HEVC-first. Reproduce la URL del intent (la verbatim del proveedor — SHIELDED Law 5,
 * no se reescribe). Sobre el WG full-tunnel todo su tráfico sale por el VPS; sin túnel, va directo (igual
 * que cualquier player). El log de track elegido es la verdad de tierra (codec/res que realmente seleccionó).
 *
 * Test:  adb shell am start -n com.ape.crystalagent/.PlayerActivity --es url "http://.../31211.m3u8"
 */
@UnstableApi
class PlayerActivity : Activity() {
    private var ape: ApePlayer? = null
    private var player: ExoPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val view = PlayerView(this).apply { useController = false }
        setContentView(view)

        val url = intent.getStringExtra("url")
        if (url.isNullOrEmpty()) { finish(); return }
        val ua = intent.getStringExtra("ua")

        val a = ApePlayer(this); ape = a
        val p = a.build(); player = p
        view.player = p
        p.addListener(object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) { a.logSelected(tracks) }
        })
        if (ua != null) a.playChannel(p, url, ua) else a.playChannel(p, url)
    }

    override fun onDestroy() { ape?.release(); player = null; super.onDestroy() }
}
