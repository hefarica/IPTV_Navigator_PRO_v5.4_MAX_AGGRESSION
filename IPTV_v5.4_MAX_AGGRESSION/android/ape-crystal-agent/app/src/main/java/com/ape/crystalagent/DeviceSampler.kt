package com.ape.crystalagent

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * DeviceSampler — mide lo que el APK PUEDE medir y declara `unavailable` lo que no.
 *
 * Regla del contrato (D3/R4): `value = null` ⟺ `prov = "unavailable"`; los features `adb_only`
 * (temp/GPU) NUNCA se rellenan desde aquí. Nada de números inventados: si no hay dato, `null`.
 */
class DeviceSampler(private val ctx: Context) {

    /**
     * Resultado de sondear el VPP del SoC. Se COMPRUEBA, no se asume.
     *
     * Por que existe: el `soc_gate` del VPS lee `caps.ai_sr` (ver
     * ara-x/spec/actuator_allowlist.json -> soc_gate.caps_keys_read_by_vps: soc, soc_8k, ai_sr,
     * "features[] contiene 'ai_sr'"). Antes del 2026-11-13 el heartbeat NO mandaba `ai_sr`, asi
     * que el gate no tenia nada que leer y la politica VPP nunca podia activarse — ni en el
     * device que SI puede, ni en el que no. Esto cierra ese hueco sin inventar nada:
     *
     *   - keysFound == 0            -> ai_sr=false, "no_vendor_keys"
     *                                  (medido en el ONN 4K: 0 de 11 claves pq_* existen)
     *   - keysFound > 0 sin permiso -> ai_sr=false, "no_write_secure_settings"
     *                                  (las claves existen pero no se podrian aplicar)
     *   - keysFound > 0 y permiso   -> ai_sr=true,  "vpp_reachable"
     *
     * No se declara `true` por familia de SoC ni por nombre de chip: solo por evidencia
     * de que las claves estan en el sistema Y de que se puede escribir en ellas.
     */
    data class VppCapability(
        val aiSr: Boolean,
        val keysFound: Int,
        val keysProbed: Int,
        val reason: String
    )

    fun vppCapability(): VppCapability {
        var found = 0
        for (k in VPP_KEYS) {
            val v = try { Settings.Global.getString(ctx.contentResolver, k) } catch (e: Exception) { null }
            if (v != null) found++
        }
        val puedeEscribir = KeyGuard.hasSecure(ctx)
        return when {
            found == 0 -> VppCapability(false, 0, VPP_KEYS.size, "no_vendor_keys")
            !puedeEscribir -> VppCapability(false, found, VPP_KEYS.size, "no_write_secure_settings")
            else -> VppCapability(true, found, VPP_KEYS.size, "vpp_reachable")
        }
    }

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

        // F02 (Council t41): `bitrate_bps` viaja con el valor MEDIDO por el guard (bytes reales del
        // DataSource), nunca con `Format.bitrate` del manifest. Si no hay medición fresca ⇒ null.
        val guardAge = nowMs - AraStatus.bitrateAt
        out["bitrate_bps"] = if (AraStatus.bitrateAt > 0L && guardAge in 0..15_000L && AraStatus.bitrateKbps > 0) {
            SyncProtocol.FeatureSample((AraStatus.bitrateKbps.toLong() * 1000L).coerceIn(0L, 200_000_000L).toInt(),
                "measured_device", guardAge, 0.6)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }

        // ADB-only: el APK no puede medirlas. Se declaran ausentes (NUNCA un 0 falso).
        out["cpu_temp_c"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)
        out["gpu_load_pct"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)
        out["vpu_load_pct"] = SyncProtocol.FeatureSample(null, "unavailable", null, null)

        // VPP del SoC: se SONDEA (no se asume). El soc_gate del VPS exige
        // "features[] contiene 'ai_sr'". 1 = alcanzable, 0 = no, null = no medido.
        val vpp = vppCapability()
        out["ai_sr"] = if (vpp.keysProbed > 0) {
            SyncProtocol.FeatureSample(if (vpp.aiSr) 1 else 0, "measured_device", 0L, 0.9)
        } else {
            SyncProtocol.FeatureSample(null, "unavailable", null, null)
        }
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

    companion object {
        const val TAG = "ApeDeviceSampler"

        /**
         * Vocabulario VPP que se sondea. Debe ser EXACTAMENTE el de
         * `settings_allowlist.vpp_levers.keys` de ara-x/spec/actuator_allowlist.json
         * y de ara_sync_levers() en el VPS (ara-x/vps/php/ara-sync.php).
         * Si alli se anade una clave, aqui tambien: si no, el sondeo miente por omision.
         * Lo vigila tools/quality/test_caps_contract.js.
         *
         * Las dos ultimas no son PQ del vendedor sino compuertas estandar de Android, pero
         * cuentan igual: `minimal_post_processing_allowed=0` es literalmente la compuerta
         * que permite el VPP completo, y `match_content_frame_rate` decide la cadencia.
         */
        val VPP_KEYS = arrayOf(
            "pq_ai_sr_enable", "ai_sr_level", "ai_pq_mode", "aipq_enable",
            "pq_sharpness_enable", "pq_ai_dnr_enable", "pq_dnr_enable", "pq_nr_enable",
            "pq_ai_fbc_enable", "pq_hdr_enable", "pq_hdr_mode",
            "match_content_frame_rate", "minimal_post_processing_allowed"
        )
    }
}
