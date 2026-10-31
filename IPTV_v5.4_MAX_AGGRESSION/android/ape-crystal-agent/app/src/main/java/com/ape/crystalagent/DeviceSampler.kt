package com.ape.crystalagent

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * DeviceSampler — mide lo que el APK PUEDE medir y declara `unavailable` lo que no.
 *
 * Regla del contrato (D3/R4): `value = null` ⟺ `prov = "unavailable"`; los features `adb_only`
 * (temp/GPU) NUNCA se rellenan desde aquí. Nada de números inventados: si no hay dato, `null`.
 */
class DeviceSampler(private val ctx: Context) {

    /** SoC crudo medido (Build.SOC_MODEL en API≥31 si no está vacío; si no Build.HARDWARE). */
    fun socRaw(): String {
        return try {
            if (Build.VERSION.SDK_INT >= 31 && Build.SOC_MODEL.isNotBlank()) Build.SOC_MODEL.trim()
            else Build.HARDWARE.trim()
        } catch (e: Exception) { "" }
    }

    fun canonicalSoc(): String? = SyncProtocol.canonicalSoc(socRaw())

    /** De dónde salió el SoC (el contrato sólo admite estos dos tokens + "unknown"). */
    fun socSource(): String =
        if (Build.VERSION.SDK_INT >= 31 && Build.SOC_MODEL.isNotBlank()) "Build.SOC_MODEL" else "Build.HARDWARE"

    fun androidSdk(): Int = Build.VERSION.SDK_INT

    /** Enum de PowerManager (API 29+). 0..6; null si el build no lo expone. */
    fun thermalStatus(): Int? {
        if (Build.VERSION.SDK_INT < 29) return null
        return try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return null
            @Suppress("DEPRECATION")
            pm.currentThermalStatus.takeIf { it >= 0 }
        } catch (e: Exception) { null }
    }

    fun ramAvailablePct(): Double? {
        return try {
            val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return null
            val mi = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mi)
            if (mi.totalMem <= 0L) null else (mi.availMem.toDouble() * 100.0 / mi.totalMem.toDouble()).coerceIn(0.0, 100.0)
        } catch (e: Exception) { null }
    }

    /**
     * Vector de features. Sólo lo medible; el resto `null` + `unavailable`.
     * `pm_thermal_status` es el único termómetro portable sin ADB (R5 §14.2).
     */
    fun features(nowMs: Long = System.currentTimeMillis()): Map<String, SyncProtocol.FeatureSample> {
        val out = LinkedHashMap<String, SyncProtocol.FeatureSample>()

        val status = thermalStatus()
        out["pm_thermal_status"] = if (status != null) {
            SyncProtocol.FeatureSample(status, "measured_device", 0L, 0.9)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        val ram = ramAvailablePct()
        out["ram_available_pct"] = if (ram != null) {
            SyncProtocol.FeatureSample(ram, "measured_device", 0L, 0.8)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        // buffer del PLAYER (ExoPlayer), nunca el modelo de red del daemon (R4-F05)
        val buf = AraStatus.playerBufferMs
        val bufAge = nowMs - AraStatus.playerBufferAt
        out["buffer_ms"] = if (buf != null && AraStatus.playerBufferAt > 0L && bufAge in 0..10_000L) {
            SyncProtocol.FeatureSample(buf.toInt().coerceIn(0, 600_000), "measured_device", bufAge, 0.7)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        val trackAge = nowMs - AraStatus.trackAt
        val trackFresh = AraStatus.trackAt > 0L && trackAge in 0..30_000L

        val fps = AraStatus.trackFps
        out["fps_declared"] = if (trackFresh && fps > 0f) {
            SyncProtocol.FeatureSample(fps.toDouble().coerceIn(1.0, 240.0), "measured_device", trackAge, 0.8)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        out["frame_drop_count"] = if (trackFresh && AraStatus.trackDroppedValid) {
            SyncProtocol.FeatureSample(AraStatus.trackDropped.coerceIn(0L, 1_000_000L).toInt(), "measured_device", trackAge, 0.6)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        out["bitrate_bps"] = if (trackFresh && AraStatus.trackBitrate > 0) {
            SyncProtocol.FeatureSample(AraStatus.trackBitrate.coerceIn(0, 200_000_000), "measured_device", trackAge, 0.7)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        // ADB-only: el APK no puede medirlas. Se declaran ausentes (NUNCA un 0 falso).
        out["cpu_temp_c"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)
        out["gpu_load_pct"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)
        out["vpu_load_pct"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)
        return out
    }

    /**
     * `metrics.source`. Si hay track medido se declara `measured_device` con los valores REALES
     * (incluido HDR desde `ColorInfo`); si no, `unavailable` con placeholders válidos para el schema.
     */
    fun source(nowMs: Long = System.currentTimeMillis()): SyncProtocol.SourceSample {
        val age = nowMs - AraStatus.trackAt
        val fresh = AraStatus.trackAt > 0L && age in 0..30_000L && AraStatus.trackW > 0 && AraStatus.trackH > 0
        if (!fresh) {
            return SyncProtocol.SourceSample("000x000", "unknown", 1.0, "SDR", "unavailable", null)
        }
        val codecRaw = AraStatus.trackCodec
        val codec = if (codecRaw.matches(Regex("^[A-Za-z0-9._-]{3,128}$"))) codecRaw else "unknown"
        val fps = if (AraStatus.trackFps > 0f) AraStatus.trackFps.toDouble().coerceIn(1.0, 240.0) else 1.0
        val hdr = when (AraStatus.trackHdr) {
            "PQ", "HLG" -> AraStatus.trackHdr
            else -> "SDR"
        }
        return SyncProtocol.SourceSample(
            "${AraStatus.trackW}x${AraStatus.trackH}",
            codec,
            fps,
            hdr,
            "measured_device",
            age
        )
    }

    /** Pasos térmicos APLICADOS por el device: 0 (el tier lo decide el VPS; el APK no re-clampa). */
    fun thermalStepsApplied(): Int = 0

    fun thermalProv(): String = if (thermalStatus() != null) "measured" else "unavailable"

    /** Confianza agregada de la muestra: baja si faltan sensores. */
    fun conf(): Double {
        var c = 0.4
        if (thermalStatus() != null) c += 0.2
        if (ramAvailablePct() != null) c += 0.1
        if (AraStatus.playerBufferMs != null) c += 0.15
        if (AraStatus.trackAt > 0L) c += 0.15
        return c.coerceIn(0.0, 1.0)
    }

    fun logOnce() {
        Log.i(TAG, "soc=${socRaw()} canon=${canonicalSoc()} sdk=${androidSdk()} thermal=${thermalStatus()} ram=${ramAvailablePct()}")
    }

    companion object { const val TAG = "ApeDeviceSampler" }
}
