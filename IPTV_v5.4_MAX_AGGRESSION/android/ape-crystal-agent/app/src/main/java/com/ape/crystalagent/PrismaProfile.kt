package com.ape.crystalagent

import android.content.Context
import android.util.Log

/**
 * PRISMA — lector y aplicador del plan de mejora por perfil.
 *
 * HUECO QUE ESTE ARCHIVO CIERRA
 * -----------------------------
 * `LabMetadataStore` ya aplanaba la metadata LAB (`fields.<seccion>.<clave>` ->
 * "seccion.clave") y exponia `get()`, pero NINGUN modulo la leia: la auditoria
 * lo registra como "METADATA_LAB_SIN_LECTORES". Emitir PRISMA en la lista no
 * cambiaba nada porque nadie preguntaba por esos valores.
 *
 * El unico canal que el APK lee de la lista es `#EXT-X-APE-LAB-METADATA`
 * (ListLoader.kt:59-81) y el perfil por canal viaja en `ape-profile` del
 * `#EXTINF` (ListLoader.kt:90). Este objeto toma esos valores y produce los
 * ajustes concretos que `UltraEnhancePipeline` sabe aplicar.
 *
 * DOCTRINA
 * --------
 * - Un carril solo se enciende si el valor es "1" Y el motor existe de verdad.
 *   `cmaf`, `hdr10plus` y `quantum_pixel` no tienen motor en el APK: se leen
 *   para poder reportarlos, pero nunca se aplican.
 * - Los `.tflite` son baseline de pesos fijos (no CNNs entrenadas). Se aplican
 *   con la mejora modesta que dan, nunca se anuncian como mas.
 * - Autopista: cada lectura va en runCatching; si algo falla, passthrough.
 */
object PrismaProfile {

    const val TAG = "ApePrisma"

    /** Carriles que el APK SI puede ejecutar. El resto se lee pero no se aplica. */
    val LANES_CON_MOTOR = listOf("lcevc", "ai_sr", "fake_4k_upscaler", "car_denoise", "glsl")

    /** Carriles que existen en el contrato pero no tienen motor en el APK. */
    val LANES_SIN_MOTOR = listOf("cmaf", "hdr10plus", "quantum_pixel")

    data class Plan(
        val profile: String = "",
        val decodePx: Long = 0,
        val sourceFps: Int = 0,
        val on: Set<String> = emptySet(),
        val gl: Map<String, Float> = emptyMap(),
        val lcevcStrength: Float = 0.6f,
        val aiSrLevel: Int = 2,
        val fake4kMode: String = "30_60",
        val present: Boolean = false
    ) {
        fun isOn(lane: String) = on.contains(lane)
        override fun toString(): String =
            "Prisma(profile=$profile decode=$decodePx fps=$sourceFps on=$on gl=$gl)"
    }

    /**
     * Lee el plan del perfil vigente desde la metadata LAB ya aplanada.
     * Si no hay metadata (o el equipo nunca recibio una lista con PRISMA), el
     * plan queda `present=false` y no se enciende NADA: passthrough puro.
     */
    /** Clave segura del perfil, igual que la emite el motor: P0.5 -> P0_5 */
    private fun safeKey(profile: String) = profile.replace(Regex("[^A-Za-z0-9]"), "_")

    /**
     * Lee el plan del perfil del canal.
     *
     * El emisor escribe los 12 planes en bloques por perfil (prisma.P0.*,
     * prisma.P0_5.*). Se busca el del canal primero y, si no esta, se cae al
     * bloque plano (prisma.*) que es el plan global de la lista.
     */
    fun read(ctx: Context, channelProfile: String? = null): Plan {
        return runCatching {
            val base = { k: String -> LabMetadataStore.get(ctx, k) }
            val pre = if (!channelProfile.isNullOrBlank()) "prisma." + safeKey(channelProfile) + "." else null
            val preGl = if (!channelProfile.isNullOrBlank()) "gl." + safeKey(channelProfile) + "." else null
            // por perfil primero; si no hay, el plano
            val get = { k: String ->
                (if (pre != null) base(pre + k) else null) ?: base("prisma." + k)
            }

            // senal de presencia: el emisor escribe decode
            val decode = get("decode")
            if (decode == null) {
                Log.i(TAG, "sin metadata PRISMA para '$channelProfile': passthrough")
                return@runCatching Plan(present = false)
            }

            val on = LANES_CON_MOTOR.filter { get(it) == "1" }.toSet()

            // carriles sin motor: se registran para el reporte, nunca se aplican
            val sinMotor = LANES_SIN_MOTOR.filter { get(it) == "1" }
            if (sinMotor.isNotEmpty()) {
                Log.w(TAG, "carriles pedidos SIN motor en el APK (no se aplican): $sinMotor")
            }

            val gl = LinkedHashMap<String, Float>()
            for (k in listOf("acerado", "dnr", "vibrancia", "microcontraste")) {
                val v = (if (preGl != null) base(preGl + k) else null) ?: base("gl." + k)
                v?.toFloatOrNull()?.let { gl[k] = it.coerceIn(0f, 1f) }
            }

            val plan = Plan(
                profile = channelProfile ?: (base("prisma.profile") ?: ""),
                decodePx = decode.toLongOrNull() ?: 0L,
                sourceFps = (get("fps") ?: "0").toIntOrNull() ?: 0,
                on = on,
                gl = gl,
                lcevcStrength = (get("lcevc_strength") ?: "0.6").toFloatOrNull()
                    ?.coerceIn(0f, 1f) ?: 0.6f,
                aiSrLevel = (get("ai_sr_level") ?: "2").toIntOrNull()?.coerceIn(0, 3) ?: 2,
                fake4kMode = get("fake_4k_mode") ?: "30_60",
                present = true
            )
            Log.i(TAG, plan.toString())
            // publicar tambien en las prefs que consume FluidBridge (efecto REAL)
            runCatching { publishGlToPrefs(ctx, plan) }
            plan
        }.getOrElse {
            Log.w(TAG, "lectura PRISMA fallo: ${it.message} (passthrough)")
            Plan(present = false)
        }
    }

    /**
     * Aplica el plan sobre los niveles negociados por el SoC.
     *
     * Regla: PRISMA MANDA. Si el perfil no pide un motor, no se enciende aunque
     * el SoC lo soporte; y si pide uno que el SoC nego, no se enciende porque no
     * hay quien lo ejecute. La interseccion es lo unico honesto.
     */
    fun applyTo(
        plan: Plan,
        levels: UltraEnhancePipeline.EnhanceLevelSet
    ): UltraEnhancePipeline.EnhanceLevelSet {
        if (!plan.present) return levels   // passthrough

        // Motor 5 (Media Enhancement API) sustituye a 1-4: si esta, se respeta.
        if (levels.mediaEnhanceApi) {
            Log.i(TAG, "Motor 5 presente: sustituye a los motores 1-4, PRISMA no altera")
            return levels
        }

        // Motor 1: CAR denoise
        val artifact = plan.isOn("car_denoise") && levels.artifactRemoval

        // Motor 2: superresolucion. LCEVC sintetico tiene prioridad sobre ESRGAN-Lite
        // solo si el perfil lo pide explicitamente.
        val sr = when {
            plan.isOn("lcevc") && levels.superResolution == UltraEnhancePipeline.SrMode.LCEVC_SYNTHETIC ->
                UltraEnhancePipeline.SrMode.LCEVC_SYNTHETIC
            plan.isOn("ai_sr") && levels.superResolution == UltraEnhancePipeline.SrMode.ESRGAN_LITE ->
                UltraEnhancePipeline.SrMode.ESRGAN_LITE
            else -> UltraEnhancePipeline.SrMode.NONE
        }

        // Motor 3: interpolacion. El modo lo limita lo que el SoC negocio.
        val fi = when {
            !plan.isOn("fake_4k_upscaler") -> UltraEnhancePipeline.FiMode.NONE
            plan.fake4kMode == "60_120" &&
                levels.frameInterp == UltraEnhancePipeline.FiMode.RIFE_LITE_60_120 ->
                UltraEnhancePipeline.FiMode.RIFE_LITE_60_120
            plan.fake4kMode == "off" -> UltraEnhancePipeline.FiMode.NONE
            levels.frameInterp == UltraEnhancePipeline.FiMode.RIFE_LITE_30_60 ||
                levels.frameInterp == UltraEnhancePipeline.FiMode.RIFE_LITE_60_120 ->
                UltraEnhancePipeline.FiMode.RIFE_LITE_30_60
            else -> UltraEnhancePipeline.FiMode.NONE
        }

        // Motor 4: GLSL
        val glsl = plan.isOn("glsl") && levels.glslShaders

        val out = UltraEnhancePipeline.EnhanceLevelSet(
            artifactRemoval = artifact,
            superResolution = sr,
            frameInterp = fi,
            glslShaders = glsl,
            mediaEnhanceApi = false
        )
        // Se deja constancia de lo pedido que no se pudo encender.
        val pedidoSinMotor = plan.on.intersect(LANES_SIN_MOTOR.toSet())
        if (pedidoSinMotor.isNotEmpty()) Log.w(TAG, "pedido sin motor: $pedidoSinMotor")
        Log.i(TAG, "PRISMA aplicado -> $out")
        return out
    }

    /**
     * Publica los parametros de GL efectivos en las prefs que lee FluidBridge.
     *
     * POR QUE ESTO EXISTE: `FluidBridge.effectsFor()` construye el efecto REAL
     * de imagen (`CrystalGlEffect`, con vibranza, microcontraste y tamano de
     * salida para el upscale) leyendo prefs FIJOS:
     *     sharpen_percent 35 · denoise_percent 20 · vibrance_percent 5 · microcontrast_percent 6
     * Nadie los ajustaba por perfil. Aqui el plan PRISMA deja sus valores en
     * prefs y FluidBridge los usa si estan presentes.
     *
     * Si el plan no trae valor, no se escribe nada y FluidBridge sigue con sus
     * defaults: passthrough, sin sorpresas.
     */
    fun publishGlToPrefs(ctx: Context, plan: Plan) {
        if (!plan.present) return
        runCatching {
            val ed = ctx.getSharedPreferences("ape", Context.MODE_PRIVATE).edit()
            plan.gl["sharpen"]?.let { ed.putInt("prisma_gl_sharpen_pct", Math.round(it * 100f)) }
            plan.gl["denoise"]?.let { ed.putInt("prisma_gl_denoise_pct", Math.round(it * 100f)) }
            plan.gl["microcontrast"]?.let { ed.putInt("prisma_gl_microcontrast_pct", Math.round(it * 100f)) }
            plan.gl["vibrancia"]?.let { ed.putInt("prisma_gl_vibrance_pct", Math.round(it * 100f)) }
            ed.putInt("prisma_gl_active", 1)
            ed.apply()
            Log.i(TAG, "GL publicado en prefs: sharpen=${plan.gl["sharpen"]} denoise=${plan.gl["denoise"]} micro=${plan.gl["microcontrast"]}")
        }.onFailure { Log.w(TAG, "publishGl fallo: ${it.message}") }
    }

    /** Hay un plan PRISMA activo publicado en prefs? (lo usa PlayerActivity) */
    fun hasActivePlan(ctx: Context): Boolean = runCatching {
        ctx.getSharedPreferences("ape", Context.MODE_PRIVATE)
            .getInt("prisma_gl_active", 0) == 1
    }.getOrDefault(false)

    /** Ajustes de GL concretos del perfil (los que usa GlslEnhancePipeline). */
    fun glSharpness(plan: Plan): Float = plan.gl["acerado"] ?: 0.4f
    fun glDenoise(plan: Plan): Float = plan.gl["dnr"] ?: 0.16f
    fun glVibrancy(plan: Plan): Float = plan.gl["vibrancia"] ?: 0.07f
    fun glMicroContrast(plan: Plan): Float = plan.gl["microcontraste"] ?: 0.08f
}
