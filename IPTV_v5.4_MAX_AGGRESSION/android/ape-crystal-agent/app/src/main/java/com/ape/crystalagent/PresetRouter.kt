package com.ape.crystalagent

import android.content.Context
import android.util.Log
import com.ape.fluid.FluidStore

/**
 * Router real de los 41 tags. Sólo marca APPLIED cuando un consumidor existe:
 * - BUFFER-* / QUALITY-LOCK / NEVER-DROP / FPS-FALLBACK → prefs Fluid (sink de política)
 * - LCEVC-MODE / LCEVC-TARGET → prefs CrystalGlEffect + refresh en caliente (shader sintético)
 * - PRESENTATION / MIN-RES → PlaybackPolicy/display size (sink de política)
 * - EXTVLCOPT* / LCEVC-VERSION → DECLARED (ExoPlayer no los consume)
 * - resto → STORED (contrato, sin sink)
 */
object PresetRouter {
    private const val TAG = "ApePresetRouter"

    fun route(ctx: Context, tags: List<String>) {
        val prefs = FluidStore.prefs(ctx)
        val e = prefs.edit()
        for (raw in tags) {
            val name = PresetLedger.normalize(raw)
            if (name.isBlank()) continue
            when {
                name.startsWith("BUFFER") -> {
                    e.putString("buffer_profile", "max")
                    e.putInt("cache_mib", 256)
                    PresetLedger.mark(name, PresetTruth.APPLIED)
                }
                name.startsWith("LCEVC-MODE") || name.startsWith("LCEVC-TARGET") -> {
                    // CrystalGlEffect lee sharpen/denoise de estas prefs al construirse.
                    e.putString("image_profile", "crystal_uhd")
                    e.putInt("sharpen_percent", if (name.contains("MAX")) 55 else 45)
                    e.putInt("denoise_percent", 20)
                    val live = ApePlayer.current?.let {
                        runCatching { it.refreshEffects(); true }.getOrDefault(false)
                    } == true
                    PresetLedger.mark(name, if (live) PresetTruth.APPLIED else PresetTruth.STORED)
                }
                name.startsWith("PRESENTATION") || name.startsWith("MIN-RES") -> {
                    // La resolución real la aplica SettingsApplier; esto sólo es política.
                    e.putString("preset_presentation", raw.substringAfter(':', "4k_upscaled"))
                    PresetLedger.mark(name, PresetTruth.STORED)
                }
                name.startsWith("QUALITY-LOCK") || name.startsWith("NEVER-DROP") ||
                    name.startsWith("FPS-FALLBACK") -> {
                    e.putString("preset_" + name.lowercase(), raw.substringAfter(':', "true"))
                    PresetLedger.mark(name, PresetTruth.STORED) // no hay sink inmediato distinto del lock del player
                }
                name.startsWith("EXTVLCOPT") || name.startsWith("LCEVC-VERSION") -> {
                    PresetLedger.mark(name, PresetTruth.DECLARED)
                }
                else -> PresetLedger.mark(name, PresetTruth.STORED)
            }
        }
        e.apply()
        // El shader se refresca sólo si hay un player vivo; si no, se aplicará al crear el próximo.
        runCatching { ApePlayer.current?.refreshEffects() }
            .onFailure { Log.w(TAG, "refreshEffects: ${it.message}") }

        val (a, s, d) = PresetLedger.counts()
        Log.i(TAG, "ledger APPLIED=$a STORED=$s DECLARED=$d total=${PresetLedger.total()}")
        AraStatus.presetApplied = a
        AraStatus.presetStored = s
        AraStatus.presetDeclared = d
    }
}
