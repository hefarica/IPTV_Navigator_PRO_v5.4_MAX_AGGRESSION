package com.ape.crystalagent

import android.content.Context

/**
 * Configuración persistente (SharedPreferences). Se provisiona por intent extras:
 *   adb shell am startservice -n com.ape.crystalagent/.AgentService \
 *     --es token <TOKEN> --es vps https://iptv-ape.duckdns.org --es dev firestick-cali
 * El token NUNCA viaja en la URL (S10): va en el header Authorization: Bearer.
 */
class Config(ctx: Context) {
    private val sp = ctx.getSharedPreferences("ape", Context.MODE_PRIVATE)

    val vpsBase: String get() = sp.getString("vps", DEFAULT_VPS)!!.trimEnd('/')
    val token: String get() = sp.getString("token", "")!!
    val deviceId: String get() = sp.getString("dev", "firestick-cali")!!

    fun provision(vps: String?, token: String?, dev: String?) {
        sp.edit().apply {
            vps?.takeIf { it.isNotBlank() }?.let { putString("vps", it) }
            token?.takeIf { it.isNotBlank() }?.let { putString("token", it) }
            dev?.takeIf { it.isNotBlank() }?.let { putString("dev", it) }
        }.apply()
    }
    fun hasToken() = token.isNotEmpty()

    companion object { const val DEFAULT_VPS = "https://iptv-ape.duckdns.org" }
}
