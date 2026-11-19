package com.ape.crystalagent

import android.app.ActivityManager
import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.WindowManager

/**
 * DeviceCapabilities — PROBE de capacidades MEDIDAS del device. Nada se supone por marca.
 *
 * Cada dato lleva su fuente (`source`) y su estado: si no se pudo medir, queda `null`/vacío y se
 * declara NO COMPUTADO con el motivo. Es el alimentador de [CapabilityMatrix] (que decide) y de
 * [SettingsApplier] (que aplica con get-antes-de-put).
 *
 * DE DÓNDE SALE CADA DATO (para poder repetirlo con adb)
 *   SoC        Build.SOC_MODEL (API≥31) o Build.HARDWARE        -> adb shell getprop ro.soc.model / ro.hardware
 *   Familia    SyncProtocol.canonicalSoc + Build.BOARD/HARDWARE  -> adb shell getprop ro.board.platform
 *   ABI        Build.SUPPORTED_ABIS                              -> adb shell getprop ro.product.cpu.abilist
 *   HEVC nivel MediaCodecList(REGULAR).codecInfos + profileLevels-> adb shell dumpsys media.player | grep -i hevc
 *   HDR        Display.getHdrCapabilities().supportedHdrTypes    -> adb shell dumpsys display | grep -i hdr
 *   Display    Display.mode + supportedModes                     -> adb shell dumpsys display | grep -i mode
 *   RAM        ActivityManager.MemoryInfo.totalMem               -> adb shell cat /proc/meminfo | head -1
 *   VPP        Settings.Global/System/Secure getString por clave -> adb shell settings list global | grep pq_
 *   Permiso    KeyGuard.hasSecure (SettingsCatalog.kt:36)        -> adb shell pm check-permission ... WRITE_SECURE_SETTINGS
 *
 * Esta clase NO escribe nada: sólo lee. Aplicar es de [SettingsApplier].
 */
object DeviceCapabilities {

    private const val TAG = "ApeDeviceCaps"

    /** Dato medido con su origen; `value == null` ⇒ NO COMPUTADO con `reason`. */
    data class Datum<T>(val value: T?, val source: String, val reason: String = "")

    /** Foto completa de la deteccion, con la fuente de cada campo. */
    data class Probe(
        val socRaw: Datum<String>,
        val socCanonical: Datum<String>,
        val family: Datum<CapabilityMatrix.Family>,
        val abis: Datum<List<String>>,
        val hevcProfiles: Datum<Set<String>>,
        val hevcMaxLevel: Datum<String>,
        val hdrTypes: Datum<Set<String>>,
        val displayMaxWidth: Datum<Int>,
        val displayMaxHeight: Datum<Int>,
        val displayMaxFps: Datum<Double>,
        val ramTotalMb: Datum<Int>,
        val vppPresent: Datum<Map<String, Boolean>>,
        val writeSecure: Datum<Boolean>
    ) {
        /** Proyeccion al nucleo puro: lo no medido se propaga como ausente (nunca un valor por defecto). */
        fun toCaps(): CapabilityMatrix.Caps = CapabilityMatrix.Caps(
            socRaw = socRaw.value ?: "",
            socCanonical = socCanonical.value,
            family = family.value ?: CapabilityMatrix.Family.UNKNOWN,
            abis = abis.value ?: emptyList(),
            hevcProfiles = hevcProfiles.value ?: emptySet(),
            hevcMaxLevel = hevcMaxLevel.value,
            hdrTypes = hdrTypes.value ?: emptySet(),
            displayMaxWidth = displayMaxWidth.value ?: 0,
            displayMaxHeight = displayMaxHeight.value ?: 0,
            displayMaxFps = displayMaxFps.value ?: 0.0,
            ramTotalMb = ramTotalMb.value ?: 0,
            vppPresent = vppPresent.value ?: emptyMap(),
            writeSecure = writeSecure.value ?: false
        )
    }

    // ─────────────────────────────── probe ───────────────────────────────

    fun probe(ctx: Context): Probe {
        val ds = DeviceSampler(ctx)
        val socRaw = Datum(
            ds.socRaw().ifBlank { null },
            ds.socSource(),
            if (ds.socRaw().isBlank()) "Build.SOC_MODEL y Build.HARDWARE vacios" else ""
        )
        val canon = runCatching { SyncProtocol.canonicalSoc(socRaw.value) }.getOrNull()
        val family = familyOf(socRaw.value, canon)

        val abis = runCatching { Build.SUPPORTED_ABIS?.toList() ?: emptyList() }.getOrDefault(emptyList())
        val hevc = hevcDecoder()
        val hdr = hdrTypes(ctx)
        val display = displayMax(ctx)
        val ram = ramTotalMb(ctx)
        val vpp = vppPresence(ctx)
        val secure = runCatching { KeyGuard.hasSecure(ctx) }.getOrNull()

        return Probe(
            socRaw = socRaw,
            socCanonical = Datum(canon, "SyncProtocol.canonicalSoc(socRaw)", if (canon == null) "SoC fuera del vocabulario canonico" else ""),
            family = family,
            abis = Datum(if (abis.isEmpty()) null else abis, "Build.SUPPORTED_ABIS", if (abis.isEmpty()) "sin ABIs declaradas" else ""),
            hevcProfiles = Datum(hevc?.first?.let { if (it.isEmpty()) null else it }, "MediaCodecList(REGULAR_CODECS).codecInfos[].profileLevels",
                if (hevc == null) "ningun decoder HEVC declarado en MediaCodecList" else ""),
            hevcMaxLevel = Datum(hevc?.second, "MediaCodecList profileLevels -> nivel maximo HEVC",
                if (hevc?.second == null) "sin nivel HEVC reconocible (o no hay decoder HEVC)" else ""),
            hdrTypes = Datum(if (hdr.isEmpty()) null else hdr, "Display.hdrCapabilities.supportedHdrTypes",
                if (hdr.isEmpty()) "el display no declara tipos HDR (SDR-only)" else ""),
            displayMaxWidth = Datum(display?.first, "Display.mode / supportedModes", if (display == null) "Display no expone mode/supportedModes" else ""),
            displayMaxHeight = Datum(display?.second, "Display.mode / supportedModes", if (display == null) "Display no expone mode/supportedModes" else ""),
            displayMaxFps = Datum(display?.third, "Display.supportedModes[].refreshRate", if (display == null) "Display no expone refreshRate" else ""),
            ramTotalMb = Datum(ram, "ActivityManager.MemoryInfo.totalMem", if (ram == null) "MemoryInfo no disponible" else ""),
            vppPresent = Datum(vpp, "Settings.Global/System/Secure getString por clave VPP", ""),
            writeSecure = Datum(secure, "KeyGuard.hasSecure (SettingsCatalog.kt:36)", if (secure == false) "sin WRITE_SECURE_SETTINGS: las claves VPP se ignoran" else "")
        )
    }

    /**
     * Familia por SoC. Usa el vocabulario canonico del repo + `ro.board.platform`/`Build.HARDWARE`
     * SOLO para etiquetar y elegir que claves sondear. Nunca para decidir codec ni nivel.
     */
    fun familyOf(socRaw: String?, canonical: String?): Datum<CapabilityMatrix.Family> {
        val raw = (socRaw ?: "").lowercase()
        val plat = runCatching { "${Build.BOARD} ${Build.HARDWARE} ${Build.DEVICE}" }
            .getOrDefault("").lowercase()
        val all = "$raw $plat"
        val src = "SyncProtocol.canonicalSoc + Build.BOARD/HARDWARE/DEVICE"
        return when {
            canonical == "mt8696" || all.contains("mt8696") || all.contains("mediatek") || all.contains("mt8") ->
                Datum(CapabilityMatrix.Family.MT8696_FIRETV, src)
            canonical == "amlogic" || canonical == "s905x4" || canonical == "s905x3" ||
                all.contains("amlogic") || all.contains("s905") || all.contains("amlogic") ->
                Datum(CapabilityMatrix.Family.AMLOGIC, src)
            all.contains("qcom") || all.contains("qualcomm") || all.contains("sm8") || all.contains("msm") ->
                Datum(CapabilityMatrix.Family.QUALCOMM, src)
            else -> Datum(
                CapabilityMatrix.Family.GENERIC, src,
                "SoC no identificado como familia conocida: se aplica la fila generica (capacidad medida, no marca)"
            )
        }
    }

    /**
     * Perfiles y nivel HEVC MAXIMOS que el device declara poder DECODIFICAR.
     * Devuelve `null` si no hay decoder HEVC o si no expone profileLevels (NO COMPUTADO).
     */
    fun hevcDecoder(): Pair<Set<String>, String?>? {
        return try {
            val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos ?: return null
            val profiles = LinkedHashSet<String>()
            var maxLevel = -1
            var found = false
            for (ci in codecs) {
                if (ci == null || ci.isEncoder) continue
                val types = ci.supportedTypes ?: continue
                if (types.none { it != null && it.equals(MediaFormat.MIMETYPE_VIDEO_HEVC, true) }) continue
                found = true
                val caps = try { ci.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_HEVC) } catch (e: Exception) { null } ?: continue
                for (pl in caps.profileLevels ?: continue) {
                    profileName(pl.profile)?.let { profiles.add(it) }
                    val ord = levelOrdinal(pl.level)
                    if (ord != null && ord > maxLevel) maxLevel = ord
                }
            }
            if (!found) null else profiles to (if (maxLevel > 0) "L$maxLevel" else null)
        } catch (e: Throwable) {
            Log.w(TAG, "hevc probe: ${e.message}")
            null
        }
    }

    /** Mapa de constantes HEVC de Android (media3/MediaCodecInfo) a nombres del repo. */
    fun profileName(profile: Int): String? = when (profile) {
        MediaCodecInfo.CodecProfileLevel.HEVCProfileMain -> "main"
        MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10 -> "main10"
        MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10 -> "main10"
        MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus -> "main10"
        4 -> "main12"   // HEVCProfileMain12 (no siempre expuesto por el SDK publico)
        else -> null
    }

    /**
     * Nivel HEVC (constantes HEVCMainTierLevel* de Android) a ordinal del repo ("153" para 5.1).
     * Sin coincidencia -> `null` (NO COMPUTADO), nunca un valor inventado.
     */
    fun levelOrdinal(level: Int): Int? = when (level) {
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel1 -> 30      // 1   -> L30
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel2 -> 60      // 2   -> L60
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel21 -> 63     // 2.1 -> L63
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel3 -> 90      // 3   -> L90
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel31 -> 93     // 3.1 -> L93
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel4 -> 120     // 4   -> L120
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel41 -> 123    // 4.1 -> L123
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel5 -> 150     // 5   -> L150
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel51 -> 153    // 5.1 -> L153
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel52 -> 156    // 5.2 -> L156
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel6 -> 180     // 6   -> L180
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel61 -> 183    // 6.1 -> L183
        MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel62 -> 186    // 6.2 -> L186
        else -> null
    }

    /** Tipos HDR que el DISPLAY declara. Vacío = SDR-only (legítimo, no es degradación). */
    fun hdrTypes(ctx: Context): Set<String> {
        return try {
            if (Build.VERSION.SDK_INT < 24) return emptySet()
            val d = display(ctx) ?: return emptySet()
            val types = d.hdrCapabilities?.supportedHdrTypes ?: return emptySet()
            val out = LinkedHashSet<String>()
            for (t in types) when (t) {
                Display.HdrCapabilities.HDR_TYPE_HDR10 -> out.add("PQ")
                Display.HdrCapabilities.HDR_TYPE_HLG -> out.add("HLG")
                Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> out.add("DV")
                6 -> out.add("HDR10+")   // HDR_TYPE_HDR10_PLUS (API 29+)
            }
            out
        } catch (e: Throwable) {
            Log.w(TAG, "hdr probe: ${e.message}")
            emptySet()
        }
    }

    /** Resolución y refresco MÁXIMOS del display (por supportedModes si existe). */
    fun displayMax(ctx: Context): Triple<Int, Int, Double>? {
        return try {
            val d = display(ctx) ?: return null
            var w = 0
            var h = 0
            var fps = 0.0
            if (Build.VERSION.SDK_INT >= 23) {
                @Suppress("DEPRECATION")
                val modes = d.supportedModes
                if (modes != null) {
                    for (m in modes) {
                        if (m == null) continue
                        if (m.physicalWidth * m.physicalHeight > w * h) {
                            w = m.physicalWidth
                            h = m.physicalHeight
                        }
                        if (m.refreshRate.toDouble() > fps) fps = m.refreshRate.toDouble()
                    }
                }
                val cur = d.mode
                if (cur != null && cur.physicalWidth * cur.physicalHeight > w * h) {
                    w = cur.physicalWidth
                    h = cur.physicalHeight
                }
                if (cur != null && cur.refreshRate.toDouble() > fps) fps = cur.refreshRate.toDouble()
            } else {
                val dm = DisplayMetrics()
                @Suppress("DEPRECATION")
                d.getRealMetrics(dm)
                w = dm.widthPixels
                h = dm.heightPixels
                fps = d.refreshRate.toDouble()
            }
            if (w <= 0 || h <= 0) null else Triple(w, h, fps)
        } catch (e: Throwable) {
            Log.w(TAG, "display probe: ${e.message}")
            null
        }
    }

    private fun display(ctx: Context): Display? {
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return null
        @Suppress("DEPRECATION")
        return wm.defaultDisplay
    }

    fun ramTotalMb(ctx: Context): Int? {
        return try {
            val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return null
            val mi = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mi)
            if (mi.totalMem <= 0L) null else (mi.totalMem / (1024L * 1024L)).toInt()
        } catch (e: Throwable) {
            null
        }
    }

    /**
     * Presencia REAL de cada clave de VPP (get antes de put). Se sondean las tres familias de
     * vocabulario porque el ns y el nombre varían por SoC: lo que no exista se ignora luego.
     */
    fun vppPresence(ctx: Context): Map<String, Boolean> {
        val keys = LinkedHashSet<String>()
        keys.addAll(CapabilityMatrix.VPP_MTK)
        keys.addAll(CapabilityMatrix.VPP_AMAZON)
        keys.addAll(CapabilityMatrix.VPP_QUALCOMM)
        val out = LinkedHashMap<String, Boolean>()
        for (k in keys) {
            out[k] = readSetting(ctx, k) != null
        }
        return out
    }

    private fun readSetting(ctx: Context, key: String): String? {
        val cr = ctx.contentResolver
        return try { Settings.Global.getString(cr, key) } catch (e: Exception) { null }
            ?: try { Settings.System.getString(cr, key) } catch (e: Exception) { null }
            ?: try { Settings.Secure.getString(cr, key) } catch (e: Exception) { null }
    }

    // ─────────────────────────── informes ───────────────────────────

    /** Línea única con lo medido (para logcat y diagnóstico). */
    fun describe(ctx: Context): String = CapabilityMatrix.describe(probe(ctx).toCaps())

    /**
     * Informe completo: detección medida + escalera para `targetHeight` + plan de gating + matriz.
     * Es lo que se pega como evidencia; lo no medido aparece como NO COMPUTADO con su motivo.
     */
    fun matrixReport(ctx: Context, targetHeight: Int = CapabilityMatrix.FLOOR_HEIGHT, fps: Double = 60.0): String {
        val p = probe(ctx)
        val caps = p.toCaps()
        val lad = CapabilityMatrix.ladder(targetHeight, fps, caps)
        val plan = CapabilityMatrix.vppPlan(caps, CapabilityMatrix.vppVocabulary(caps.family) + CapabilityMatrix.VPP_AMAZON.toList())
        val sb = StringBuilder()
        sb.append("== DETECCION MEDIDA ==").append('\n')
        sb.append(CapabilityMatrix.describe(caps)).append('\n')
        sb.append("  soc      : ").append(p.socRaw.value ?: "NO COMPUTADO").append("  <- ").append(p.socRaw.source)
        if (p.socRaw.reason.isNotEmpty()) sb.append("  [").append(p.socRaw.reason).append(']')
        sb.append('\n')
        sb.append("  hevc     : ").append(caps.hevcProfiles.ifEmpty { setOf("NO COMPUTADO") }.joinToString("/"))
        sb.append(" nivel ").append(caps.hevcMaxLevel ?: "NO COMPUTADO")
        if (p.hevcMaxLevel.reason.isNotEmpty()) sb.append("  [").append(p.hevcMaxLevel.reason).append(']')
        sb.append('\n')
        sb.append("  hdr      : ").append(caps.hdrTypes.ifEmpty { setOf("SDR-only") }.joinToString("/"))
        if (p.hdrTypes.reason.isNotEmpty()) sb.append("  [").append(p.hdrTypes.reason).append(']')
        sb.append('\n')
        sb.append("  display  : ").append(caps.displayMaxWidth).append('x').append(caps.displayMaxHeight)
        sb.append(" @ ").append(caps.displayMaxFps).append(" Hz").append('\n')
        sb.append("  ram      : ").append(caps.ramTotalMb).append(" MiB").append('\n')
        sb.append('\n').append("== ESCALERA (Ley Cardinal 1) ==").append('\n')
        sb.append("  target declarado: ").append(lad.declaredTarget).append("p")
        sb.append(" · requerido ").append(lad.requiredLevel)
        sb.append(" · device ").append(lad.deviceLevel ?: "NO COMPUTADO")
        sb.append(" · fits=").append(lad.fits).append(" hardwareLimited=").append(lad.hardwareLimited).append('\n')
        sb.append("  ").append(lad.reason).append('\n')
        sb.append('\n').append("== GATING VPP (get antes de put) ==").append('\n')
        var apply = 0
        for (k in plan) {
            if (k.action == CapabilityMatrix.Action.APPLY) apply++
            sb.append("  ").append(if (k.action == CapabilityMatrix.Action.APPLY) "[APLICA] " else "[IGNORA] ")
            sb.append(k.key).append(" - ").append(k.reason).append('\n')
        }
        sb.append("  resumen: ").append(apply).append(" de ").append(plan.size).append(" claves aplicables").append('\n')
        sb.append('\n').append("== MATRIZ HOMOLOGADA ==").append('\n')
        sb.append(CapabilityMatrix.report())
        return sb.toString()
    }
}
