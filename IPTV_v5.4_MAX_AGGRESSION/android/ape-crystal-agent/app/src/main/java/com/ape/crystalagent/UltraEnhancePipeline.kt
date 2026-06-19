package com.ape.crystalagent

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import org.json.JSONObject

/**
 * UltraEnhance Engine (F6) — orquestador de motores de mejora de imagen on-device.
 *
 * ARQUITECTURA HONESTA (correcciones de ingeniería sobre el doc 2.0):
 *  - Procesar frames requiere que NUESTRO APK reproduzca el video (F3 ExoPlayer): Android NO permite
 *    capturar el MediaCodec de un player de terceros. El feed real de frames se conecta en F3 vía
 *    `androidx.media3:media3-effect` (GlShaderProgram, GPU-directo). `processFramePair(Bitmap)` es la
 *    API CONCEPTUAL/test (round-trip Bitmap) — NO es el camino de tiempo real (sería demasiado lento).
 *  - Los modelos .tflite (car_denoise/sr_unsharp/rife_blend) son BASELINE de pesos fijos = operaciones
 *    reales (gaussiana low-pass, unsharp, blend lineal), NO redes entrenadas (honesto: mejora modesta,
 *    nunca basura; swap por entrenados sin tocar firmas). Si faltan en assets/ → motor OFF (autopista).
 *  - Media Enhancement API se detecta por reflexión (sin dep fantasma). LCEVC = residual sintético propio.
 *
 * Doctrina: autopista (runCatching por motor → passthrough), aditivo, A/B vía Config.enhanceEnabled.
 */
class UltraEnhancePipeline(private val ctx: Context, private val cfg: Config) {

    data class EnhanceLevelSet(
        val artifactRemoval: Boolean = false,
        val superResolution: SrMode = SrMode.NONE,
        val frameInterp: FiMode = FiMode.NONE,
        val glslShaders: Boolean = false,
        val mediaEnhanceApi: Boolean = false
    )
    enum class SrMode { NONE, LCEVC_SYNTHETIC, ESRGAN_LITE }
    enum class FiMode { NONE, RIFE_LITE_30_60, RIFE_LITE_60_120, ANVIL_NATIVE }

    @Volatile var levels = EnhanceLevelSet(); private set

    private var carModel: TfliteInferenceEngine? = null
    private var esrganModel: TfliteInferenceEngine? = null
    private var rifeModel: TfliteInferenceEngine? = null
    private var lcevc: LcevcSyntheticPipeline? = null
    private var mediaEnhance: MediaEnhanceApiPipeline? = null
    private var glsl: GlslEnhancePipeline? = null

    // Hints del VPS (URL-2 IDA SSE)
    @Volatile private var contentType = "general"
    @Volatile private var codecHint = "hvc1"
    @Volatile private var fpsSource = 30
    @Volatile private var targetFps = 60
    @Volatile private var lcevcPresent = false

    /** FASE 0 — negocia qué motores soporta el SoC. Idempotente, todo guardado. */
    fun negotiate(): EnhanceLevelSet {
        if (!cfg.enhanceEnabled) { Log.i(TAG, "UltraEnhance DESACTIVADO (Config.enhanceEnabled=false)"); return EnhanceLevelSet() }
        Log.i(TAG, "Negociando capacidades UltraEnhance...")

        // Motor 5: Media Enhancement API (si está → reemplaza 1-4)
        runCatching {
            mediaEnhance = MediaEnhanceApiPipeline(ctx)
            if (mediaEnhance!!.isSupported()) {
                levels = EnhanceLevelSet(mediaEnhanceApi = true, glslShaders = true)
                Log.i(TAG, "Motor 5 ACTIVO: Media Enhancement API")
                return levels
            }
        }.onFailure { Log.w(TAG, "Motor 5 n/a: ${it.message}") }

        // Motor 1: CAR / denoise (baseline gaussiano de pesos fijos)
        val car = runCatching {
            carModel = TfliteInferenceEngine(ctx, "car_denoise_f32.tflite")
            carModel!!.load()
        }.getOrDefault(false)

        // Motor 2: LCEVC sintético (preferido) o ESRGAN-Lite
        val sr = runCatching {
            lcevc = LcevcSyntheticPipeline()
            if (lcevc!!.load()) SrMode.LCEVC_SYNTHETIC else null
        }.getOrNull() ?: runCatching {
            esrganModel = TfliteInferenceEngine(ctx, "sr_unsharp_f32.tflite")
            if (esrganModel!!.load()) SrMode.ESRGAN_LITE else SrMode.NONE
        }.getOrDefault(SrMode.NONE)

        // Motor 3: RIFE (frame interpolation) — modo por benchmark real, no hardcode por SoC
        val fi = runCatching {
            rifeModel = TfliteInferenceEngine(ctx, "rife_blend_f32.tflite")
            if (rifeModel!!.load()) {
                val ms = benchmarkRife()
                when {
                    ms <= 20 -> FiMode.RIFE_LITE_60_120
                    ms <= 50 -> FiMode.RIFE_LITE_30_60
                    else -> FiMode.NONE
                }.also { Log.i(TAG, "Motor 3 RIFE modo=$it (bench=${ms}ms)") }
            } else FiMode.NONE
        }.getOrDefault(FiMode.NONE)

        // Motor 4: GLSL (siempre, si hay GL ES 2.0+)
        runCatching { glsl = GlslEnhancePipeline(ctx) }
            .onFailure { Log.w(TAG, "GLSL init: ${it.message}") }

        levels = EnhanceLevelSet(
            artifactRemoval = car,
            superResolution = sr,
            frameInterp = fi,
            glslShaders = glsl != null,
            mediaEnhanceApi = false
        )
        Log.i(TAG, "UltraEnhance negociado: $levels")
        return levels
    }

    private fun benchmarkRife(): Long {
        val a = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
        val b = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
        val t0 = System.nanoTime()
        repeat(5) { runCatching { rifeModel?.infer(a, b) } }
        val ms = (System.nanoTime() - t0) / 1_000_000 / 5
        a.recycle(); b.recycle()
        return ms
    }

    /** FASE 1 — hints del VPS (content_type/codec/fps/lcevc) ajustan los motores por canal. */
    fun applyVpsHints(obj: JSONObject) {
        contentType = obj.optString("content_type", contentType)
        codecHint = obj.optString("codec_hint", codecHint)
        fpsSource = obj.optInt("fps_source", fpsSource)
        lcevcPresent = obj.optBoolean("lcevc_present", lcevcPresent)
        val isSport = contentType == "sport_live"
        glsl?.configure(sharpness = if (isSport) 0.8f else 0.4f, denoise = if (isSport) 0.15f else 0.5f)
        lcevc?.setResidualStrength(if (isSport) 0.8f else 0.6f)
        targetFps = if (fpsSource >= 50) 100 else 60
        Log.d(TAG, "VPS hints content=$contentType codec=$codecHint fps=$fpsSource->$targetFps lcevc=$lcevcPresent")
    }

    /** FASE 2 — cadena por par de frames (API CONCEPTUAL; el feed real es media3-effect en F3). */
    fun processFramePair(f0: Bitmap, f1: Bitmap): List<Bitmap> {
        if (!cfg.enhanceEnabled) return listOf(f0, f1)
        if (levels.mediaEnhanceApi) {
            return runCatching { listOf(mediaEnhance!!.enhance(f0), mediaEnhance!!.enhance(f1)) }
                .getOrDefault(listOf(f0, f1))
        }
        val c0 = artifactRemoval(f0); val c1 = artifactRemoval(f1)
        val s0 = superRes(c0); val s1 = superRes(c1)
        return frameInterp(s0, s1).map { glslPass(it) }
    }

    private fun artifactRemoval(f: Bitmap): Bitmap =
        if (!levels.artifactRemoval) f else runCatching { carModel!!.infer(f) ?: f }.getOrDefault(f)

    private fun superRes(f: Bitmap): Bitmap = when (levels.superResolution) {
        SrMode.LCEVC_SYNTHETIC -> runCatching { lcevc!!.process(f) ?: f }.getOrDefault(f)
        SrMode.ESRGAN_LITE -> runCatching { esrganModel!!.infer(f) ?: f }.getOrDefault(f)
        SrMode.NONE -> f
    }

    private fun frameInterp(f0: Bitmap, f1: Bitmap): List<Bitmap> {
        if (levels.frameInterp == FiMode.NONE) return listOf(f0, f1)
        return runCatching {
            val mid = rifeModel!!.infer(f0, f1) ?: return@runCatching listOf(f0, f1)
            when (levels.frameInterp) {
                FiMode.RIFE_LITE_30_60, FiMode.ANVIL_NATIVE -> listOf(f0, mid, f1)
                FiMode.RIFE_LITE_60_120 -> {
                    val m0 = rifeModel!!.infer(f0, mid) ?: mid
                    val m1 = rifeModel!!.infer(mid, f1) ?: mid
                    listOf(f0, m0, mid, m1, f1)
                }
                FiMode.NONE -> listOf(f0, f1)
            }
        }.getOrDefault(listOf(f0, f1))
    }

    private fun glslPass(f: Bitmap): Bitmap =
        if (!levels.glslShaders) f else runCatching { glsl!!.process(f) ?: f }.getOrDefault(f)

    fun stop() {
        runCatching { carModel?.close() }; runCatching { esrganModel?.close() }; runCatching { rifeModel?.close() }
        runCatching { lcevc?.release() }; runCatching { mediaEnhance?.release() }; runCatching { glsl?.release() }
    }

    companion object { const val TAG = "ApeUltraEnhance" }
}
