package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.wireguard.android.backend.Backend
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.InetEndpoint
import com.wireguard.config.InetNetwork
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import java.net.InetAddress

/**
 * WireGuard embebido (F1) — el APK ES la VPN (GoBackend sobre android.net.VpnService).
 * Full-tunnel: AllowedIPs=0.0.0.0/0, DNS=10.200.0.1 → TODO el tráfico + DNS del device sale por el VPS shield
 * (unbound redirige los dominios del proveedor). Requiere consent VPN de Android (1 vez, vía VpnConsentActivity).
 */
class WireGuardManager(private val ctx: Context) {

    private val backend: Backend by lazy { GoBackend(ctx) }
    private val tunnel = object : Tunnel {
        override fun getName(): String = "ape"
        override fun onStateChange(newState: Tunnel.State) { Log.i(TAG, "tunnel state=$newState") }
    }

    fun buildConfig(wc: EnrollClient.WgConfig): Config {
        val iface = Interface.Builder()
            .parsePrivateKey(wc.privateKey)
            .addAddress(InetNetwork.parse(wc.assignedIp + "/32"))
            .addDnsServer(InetAddress.getByName(wc.dns))
            .build()
        val peer = Peer.Builder()
            .parsePublicKey(wc.serverPubKey)
            .setEndpoint(InetEndpoint.parse(wc.endpoint))
            .addAllowedIp(InetNetwork.parse(wc.allowedIps))   // 0.0.0.0/0 = full-tunnel
            .setPersistentKeepalive(25)
            .build()
        return Config.Builder().setInterface(iface).addPeer(peer).build()
    }

    /** Sube el túnel. Requiere consent VPN ya concedido (si no, BackendException). true si quedó UP. */
    fun up(wc: EnrollClient.WgConfig): Boolean = try {
        backend.setState(tunnel, Tunnel.State.UP, buildConfig(wc))
        Log.i(TAG, "tunnel UP ip=${wc.assignedIp}")
        true
    } catch (e: Exception) { Log.w(TAG, "tunnel up err: ${e.message}"); false }

    fun down() {
        try { backend.setState(tunnel, Tunnel.State.DOWN, null) }
        catch (e: Exception) { Log.w(TAG, "tunnel down err: ${e.message}") }
    }

    fun isUp(): Boolean = try { backend.runningTunnelNames.contains("ape") } catch (e: Exception) { false }

    companion object { const val TAG = "ApeWireGuard" }
}
