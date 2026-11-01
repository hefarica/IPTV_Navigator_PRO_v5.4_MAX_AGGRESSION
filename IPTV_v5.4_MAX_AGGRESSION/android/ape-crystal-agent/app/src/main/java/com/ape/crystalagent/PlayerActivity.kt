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
        Display4K.apply(this)
        val view = PlayerView(this).apply { useController = false }
        setContentView(view)

        val url = intent.getStringExtra("url")
        if (url.isNullOrEmpty()) { finish(); return }
        val ua = intent.getStringExtra("ua")
        ApePlayer.suppressVideoEffects = intent.getStringExtra("effects") == "off"

        val a = ApePlayer(this); ape = a
        val p = a.build(); player = p
        view.player = p
        PlayerHub.attach(this, view, a)
        p.addListener(object : Player.Listener {
            override fun onTracksChanged(tracks: Tracks) {
                a.lockHighest(tracks)
                a.logSelected(tracks)
            }
        })
        val headersJson = intent.getStringExtra("headers")
        val headers = runCatching {
            val o = org.json.JSONObject(headersJson ?: "{}")
            val out = HashMap<String, String>()
            val it = o.keys()
            while (it.hasNext()) {
                val k = it.next()
                val v = o.optString(k, "")
                if (v.isNotEmpty()) out[k] = v
            }
            out
        }.getOrDefault(emptyMap())
        a.playChannel(p, url, ua ?: ApePlayer.DEFAULT_UA, headers)
    }

    override fun onDestroy() { PlayerHub.detach(); ape?.release(); player = null; super.onDestroy() }
}
