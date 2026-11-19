package com.ape.crystalagent

/**
 * CapabilityMatrix — MATRIZ HOMOLOGADA de capacidades por familia de dispositivo + escalera
 * por capacidad + plan de gating del VPP. **NÚCLEO PURO**: sin Android, sin I/O, sin estado.
 *
 * REQUISITO DEL OPERADOR (literal): "Independiente del dispositivo, el APK tiene que tener
 * implementada absolutamente todas las versiones para diferentes dispositivos y configuraciones
 * homologadas para sacar el maximo provecho a todos los dispositivos y sus maximas capacidades".
 *
 * CÓMO SE CUMPLE SIN MENTIR (las tres reglas que ordenan este fichero)
 *
 * 1. **Se decide por CAPACIDAD MEDIDA, nunca por marca.** [Family] se usa sólo para (a) saber qué
 *    vocabulario de claves VPP tiene sentido sondear y (b) etiquetar la fila de la matriz. Ninguna
 *    decisión de codec, nivel, resolución o filtro se toma por el nombre del modelo: todas se toman
 *    con [Caps], que viene del probe Android ([DeviceCapabilities]) — MediaCodecList, Display,
 *    Build y presencia real de claves.
 *
 * 2. **La ley anti-degradación manda sobre la escalera.** `declaredTarget` NUNCA baja de 4K
 *    (3840x2160): si el decoder no alcanza el nivel que ese target exige, se declara
 *    `hardwareLimited=true` con su motivo y **la señal se queda en 4K**; lo que se limita es lo que
 *    el hardware puede decodificar, no lo que se declara. Bajar el target seria degradar la señal.
 *
 * 3. **Un solo paso abajo, y declarado.** Si el nivel máximo del decoder no llega al requerido,
 *    [ladder] propone UN paso menos de resolución de *decodificación* (`decodeStep`) y lo marca;
 *    nunca dos, nunca silencioso.
 *
 * Lo que este fichero NO hace: no escribe settings, no abre codecs, no llama a Android. Aplicar es
 * de [SettingsApplier] (con su allowlist y su get-antes-de-put) y [DeviceCapabilities] (probe).
 */
object CapabilityMatrix {

    /** Familia de SoC. SÓLO etiqueta y vocabulario de claves: no decide codec ni nivel. */
    enum class Family(val wire: String) {
        AMLOGIC("amlogic"),
        MT8696_FIRETV("mt8696_firetv"),
        QUALCOMM("qualcomm"),
        GENERIC("generico"),
        UNKNOWN("desconocido");

        companion object {
            fun fromWire(w: String?): Family = values().firstOrNull { it.wire == w } ?: UNKNOWN
        }
    }

    /** Estado de cada celda de la matriz: medida en esta sesión, de repo, o no computada. */
    enum class Cell { MEASURED, REPO_EVIDENCE, NO_COMPUTADO, DERIVED }

    /**
     * Celda de la matriz con su evidencia. `evidence` es el comando/fichero que la sostiene, o el
     * motivo exacto del NO COMPUTADO. Nunca se deja vacía: una celda sin evidencia es NO_COMPUTADO.
     */
    data class MatrixCell(val value: String, val state: Cell, val evidence: String)

    /** Fila homologada por familia. */
    data class FamilyRow(
        val family: Family,
        val codecMax: MatrixCell,
        val levelMax: MatrixCell,
        val hdr: MatrixCell,
        val targetResolution: MatrixCell,
        val vppFilters: MatrixCell,
        val limits: MatrixCell
    )

    /**
     * Capacidades MEDIDAS que alimentan la matriz y la escalera. Todo lo que no se pudo medir llega
     * como `null`/vacío y se propaga como NO COMPUTADO: nunca un valor por defecto disfrazado.
     */
    data class Caps(
        val socRaw: String,
        val socCanonical: String?,
        val family: Family,
        val abis: List<String>,
        /** Perfiles HEVC que el device declara poder decodificar: "main", "main10", "main12". */
        val hevcProfiles: Set<String>,
        /** Nivel HEVC máximo declarado, ya normalizado ("L120", "L153", "L183", "L186"...). */
        val hevcMaxLevel: String?,
        /** Tipos HDR declarados por el display: "PQ", "HLG", "DV", "HDR10+". */
        val hdrTypes: Set<String>,
        val displayMaxWidth: Int,
        val displayMaxHeight: Int,
        val displayMaxFps: Double,
        val ramTotalMb: Int,
        /** Claves VPP presentes en el device (`true` = existe y se puede leer). */
        val vppPresent: Map<String, Boolean>,
        val writeSecure: Boolean
    ) {
        val abi64: Boolean get() = abis.any { it.contains("arm64") || it == "x86_64" }
        val hevcMain10: Boolean get() = "main10" in hevcProfiles || "main12" in hevcProfiles
        val anyHdr: Boolean get() = hdrTypes.isNotEmpty()
        val vppKeysPresent: List<String> get() = vppPresent.filterValues { it }.keys.sorted()
    }

    // ─────────────────────────── escalera por capacidad ───────────────────────────

    /** El suelo legal: la señal nunca baja de 4K simulado. */
    const val FLOOR_HEIGHT = 2160

    /**
     * Nivel HEVC que exige una altura objetivo, por la Ley Cardinal 1 (nivel ↔ resolución).
     * Valores del repo: 1080p→L120/L123, 1440p→L150, 2160p→L153, 3240p (6K)→L183, 4320p→L186.
     */
    fun requiredLevel(height: Int, fps: Double = 30.0): String = when {
        height <= 1080 && fps <= 30.0 -> "L120"
        height <= 1080 -> "L123"
        height <= 1600 -> "L150"
        height <= 2160 -> "L153"
        height <= 3240 -> "L183"
        else -> "L186"
    }

    /** Orden numérico del nivel ("L153" → 153) para comparar. `null` si no es reconocible. */
    fun levelOrdinal(level: String?): Int? {
        if (level == null) return null
        val digits = level.trim().removePrefix("L").removePrefix("l").takeWhile { it.isDigit() }
        return digits.toIntOrNull()
    }

    /**
     * Resultado de la escalera. `declaredTarget` es lo que se DECLARA (nunca < 4K);
     * `decodeStep` es el único paso abajo que se permite cuando el decoder no llega.
     */
    data class Ladder(
        val requestedHeight: Int,
        val declaredTarget: Int,
        val decodeStep: Int,
        val requiredLevel: String,
        val deviceLevel: String?,
        val fits: Boolean,
        val hardwareLimited: Boolean,
        val declared: Boolean,
        val reason: String
    )

    /**
     * Escalera por capacidad. `requestedHeight` = altura que pide la política/canal.
     * Reglas: (1) el nivel que se compara sale del device medido; (2) si no llega, UN paso abajo;
     * (3) el target declarado nunca baja de [FLOOR_HEIGHT]; (4) sin nivel medido → no se afirma que
     * quepa (fits=false, hardwareLimited=false, reason NO COMPUTADO).
     */
    fun ladder(requestedHeight: Int, fps: Double, caps: Caps): Ladder {
        val target = maxOf(requestedHeight, FLOOR_HEIGHT)
        val required = requiredLevel(target, fps)
        val reqOrd = levelOrdinal(required) ?: 0
        val devOrd = levelOrdinal(caps.hevcMaxLevel)
        if (devOrd == null) {
            return Ladder(
                requestedHeight = requestedHeight,
                declaredTarget = target,
                decodeStep = target,
                requiredLevel = required,
                deviceLevel = null,
                fits = false,
                hardwareLimited = false,
                declared = true,
                reason = "NO COMPUTADO: el device no declaro nivel HEVC (MediaCodecList sin profileLevels " +
                    "legibles); no se afirma que quepa ni que no"
            )
        }
        if (devOrd >= reqOrd) {
            return Ladder(
                requestedHeight = requestedHeight,
                declaredTarget = target,
                decodeStep = target,
                requiredLevel = required,
                deviceLevel = caps.hevcMaxLevel,
                fits = true,
                hardwareLimited = false,
                declared = true,
                reason = "cabe: nivel del device ${caps.hevcMaxLevel} >= requerido $required para ${target}p"
            )
        }
        // Un solo paso abajo de DECODIFICACION (no del target declarado).
        val step = when {
            target > 3240 -> 3240
            target > 2160 -> FLOOR_HEIGHT
            target > 1080 -> 1080
            else -> 720
        }
        val belowFloor = step < FLOOR_HEIGHT
        return Ladder(
            requestedHeight = requestedHeight,
            declaredTarget = target,
            decodeStep = maxOf(step, FLOOR_HEIGHT),
            requiredLevel = required,
            deviceLevel = caps.hevcMaxLevel,
            fits = false,
            hardwareLimited = true,
            declared = true,
            reason = if (belowFloor) {
                "HARDWARE LIMITADO: nivel del device ${caps.hevcMaxLevel} no llega a $required; " +
                    "un paso abajo daria ${step}p (< 4K). La SEÑAL se queda en ${target}p (ley anti-degradacion); " +
                    "lo limitado es el decode del hardware, declarado"
            } else {
                "HARDWARE LIMITADO: nivel ${caps.hevcMaxLevel} < $required; decode un paso abajo a ${maxOf(step, FLOOR_HEIGHT)}p, declarado"
            }
        )
    }

    // ───────────────────────────── gating del VPP ─────────────────────────────

    enum class Action { APPLY, IGNORE }

    /** Qué se hace con una clave VPP y por qué. */
    data class Knob(val key: String, val action: Action, val reason: String)

    /**
     * Plan de gating: se aplica SÓLO si la clave EXISTE en el device (get antes de put) y hay
     * permiso de escritura. Lo ausente se IGNORA sin error y se declara. Nunca se escribe una clave
     * que el SoC no soporta.
     */
    fun vppPlan(caps: Caps, keys: List<String>): List<Knob> = keys.sorted().map { k ->
        val present = caps.vppPresent[k] == true
        when {
            !present -> Knob(k, Action.IGNORE, "la clave NO existe en este device: se ignora (no se escribe una clave que el SoC no soporta)")
            !caps.writeSecure -> Knob(k, Action.IGNORE, "la clave existe pero falta WRITE_SECURE_SETTINGS: se ignora y se declara")
            else -> Knob(k, Action.APPLY, "clave presente y escribible: se aplica por la allowlist de SettingsApplier")
        }
    }

    /** Vocabulario VPP por familia (sólo qué merece la pena SONDEAR: la decisión sigue siendo por presencia). */
    fun vppVocabulary(family: Family): List<String> = when (family) {
        Family.MT8696_FIRETV -> VPP_MTK + VPP_AMAZON
        Family.AMLOGIC -> VPP_MTK            // Amlogic expone el vocabulario MediaTek/droidlogic medido en el repo
        Family.QUALCOMM -> VPP_QUALCOMM
        else -> VPP_MTK
    }

    val VPP_MTK: List<String> = listOf(
        "pq_ai_sr_enable", "ai_sr_level", "ai_pq_mode", "aipq_enable",
        "pq_sharpness_enable", "pq_ai_dnr_enable", "pq_dnr_enable", "pq_nr_enable",
        "pq_ai_fbc_enable", "pq_hdr_enable", "pq_hdr_mode",
        "match_content_frame_rate", "minimal_post_processing_allowed"
    )
    val VPP_AMAZON: List<String> = listOf(
        "com.amazon.tv.motion_smoothness", "com.amazon.tv.picture_sharpness",
        "com.amazon.tv.dynamic_contrast", "com.amazon.tv.picture_mode",
        "com.amazon.tv.noise_reduction", "com.amazon.tv.color_temperature"
    )
    val VPP_QUALCOMM: List<String> = listOf(
        "match_content_frame_rate", "minimal_post_processing_allowed",
        "hdr_conversion_mode", "user_preferred_resolution_width", "user_preferred_resolution_height"
    )

    // ─────────────────────── matriz homologada por familia ───────────────────────

    /**
     * Filas de la matriz. La evidencia es del REPO (mediciones previas documentadas en el propio
     * código) o NO_COMPUTADO con su motivo; **ninguna celda se rellenó a ojo**, y las que se
     * midieron en esta sesión se marcan MEASURED desde [DeviceCapabilities].
     */
    fun rows(): List<FamilyRow> = listOf(
        FamilyRow(
            family = Family.MT8696_FIRETV,
            codecMax = MatrixCell(
                "HEVC Main10 (hvc1.2) · decodable por hardware; AV1 no declarado por el SoC",
                Cell.REPO_EVIDENCE,
                "SettingsApplier.kt:363-379 (comentario medido en AFTKRT/ro.board.platform=mt8696) + " +
                    "vocabulario VPP de 6 claves Amazon verificado con valor real puesto"
            ),
            levelMax = MatrixCell(
                "NO COMPUTADO (nivel exacto del decoder no medido en esta sesion)",
                Cell.NO_COMPUTADO,
                "requiere MediaCodecList del Fire TV (adb shell dumpsys media.player / probe): sin device conectado no se mide"
            ),
            hdr = MatrixCell(
                "HDR10/PQ y HLG declarados por el repo; DV no declarado",
                Cell.REPO_EVIDENCE,
                "docs/manifestos/EQUIPO_10_ADN_CONTEXTO_2026-10-26.md (Fire TV 4K Max) y " +
                    "SettingsApplier.kt:333 (hdr_conversion_mode) — NO re-medido en esta sesion"
            ),
            targetResolution = MatrixCell(
                "3840x2160 (4K simulado) con display hasta 2160p; 6K/8K solo presentacion",
                Cell.DERIVED,
                "PlaybackPolicy.kt:21-34 (defaults 3840x2160, eightKPresentation) + ley anti-degradacion"
            ),
            vppFilters = MatrixCell(
                "ai_sr, ai_pq, dnr, sharpness, memc (motion_smoothness), picture_mode, color_temperature, noise_reduction",
                Cell.REPO_EVIDENCE,
                "SettingsApplier.kt:344-378 (11 claves MediaTek + 6 Amazon, con valores medidos en AFTKRT)"
            ),
            limits = MatrixCell(
                "exige 'Apps de origenes desconocidos' para instalar; min_post_processing=0 es la compuerta que abre el VPP",
                Cell.REPO_EVIDENCE,
                "tools/README-INSTALADOR.md (instalador Fire TV) + SettingsApplier.kt:323"
            )
        ),
        FamilyRow(
            family = Family.AMLOGIC,
            codecMax = MatrixCell(
                "HEVC Main10 por hardware; el repo lo fija como techo 4K@60 (L153)",
                Cell.REPO_EVIDENCE,
                "docs/manifestos/ape-vps-hevc-crystal-integrator (Ley Cardinal 1: L153=4K@60) + " +
                    "ApePlayer.kt:525 (onn. 4K / Amlogic s4, media3 1.3.1)"
            ),
            levelMax = MatrixCell(
                "L153 como techo doctrinal; el nivel REAL del decoder no medido en esta sesion",
                Cell.NO_COMPUTADO,
                "L153 es doctrina (no medicion); falta MediaCodecList del ONN 4K -> NO COMPUTADO"
            ),
            hdr = MatrixCell(
                "HDR10/PQ y HLG; DV no declarado para Amlogic",
                Cell.REPO_EVIDENCE,
                "CLAUDE.md (VIDEO-RANGE=PQ incondicional) — no re-medido"
            ),
            targetResolution = MatrixCell(
                "3840x2160 (4K) · 8K solo presentacion (8k_presentation)",
                Cell.REPO_EVIDENCE,
                "PlaybackPolicy.kt:21-34"
            ),
            vppFilters = MatrixCell(
                "AI-SR / AI-PQ del SoC segun firmware; el ONN 4K medido tiene 0 de 11 claves pq_*",
                Cell.REPO_EVIDENCE,
                "DeviceSampler.kt:28-29 ('medido en el ONN 4K: 0 de 11 claves pq_* existen') -> el gating " +
                    "por presencia es obligatorio, no opcional"
            ),
            limits = MatrixCell(
                "VPP no alcanzable en el ONN 4K medido: 0 claves -> ai_sr=false 'no_vendor_keys'",
                Cell.REPO_EVIDENCE,
                "DeviceSampler.kt:50-54 (vppCapability) + KeyGuard (SettingsCatalog.kt:36)"
            )
        ),
        FamilyRow(
            family = Family.QUALCOMM,
            codecMax = MatrixCell(
                "NO COMPUTADO (sin device Qualcomm medido en el repo ni en esta sesion)",
                Cell.NO_COMPUTADO,
                "no hay evidencia de ningun device Qualcomm: no se copia la fila de otra familia"
            ),
            levelMax = MatrixCell("NO COMPUTADO", Cell.NO_COMPUTADO, "idem"),
            hdr = MatrixCell("NO COMPUTADO", Cell.NO_COMPUTADO, "idem"),
            targetResolution = MatrixCell(
                "3840x2160 si el decoder lo declara (se decide por MediaCodecList, no por la marca)",
                Cell.DERIVED,
                "CapabilityMatrix.ladder + PlaybackPolicy: la marca no decide"
            ),
            vppFilters = MatrixCell(
                "solo compuertas Estandar de Android (mcr, mmp, hdr_conversion_mode, resolucion)",
                Cell.DERIVED,
                "no existe vocabulario VPP Qualcomm verificado en el repo: se sondean solo claves estandar"
            ),
            limits = MatrixCell(
                "sin vocabulario VPP propio: no se inventan claves",
                Cell.DERIVED,
                "SettingsApplier ALLOW_KEY no tiene ninguna clave Qualcomm especifica"
            )
        ),
        FamilyRow(
            family = Family.GENERIC,
            codecMax = MatrixCell(
                "lo que declare MediaCodecList (HEVC Main/Main10 si existe; si no, AVC)",
                Cell.DERIVED,
                "la seleccion es por capacidad medida: Dispositivo sin HEVC decodifica AVC y se declara"
            ),
            levelMax = MatrixCell(
                "el declarado por el device (se compara con requiredLevel; si falta -> NO COMPUTADO)",
                Cell.DERIVED,
                "CapabilityMatrix.ladder"
            ),
            hdr = MatrixCell(
                "lo que declare Display.hdrCapabilities (puede ser vacio = SDR-only)",
                Cell.DERIVED,
                "sin HDR el APK sigue: SDR es legitimo (falta de hardware), no degradacion"
            ),
            targetResolution = MatrixCell(
                "3840x2160 declarado; decode segun capacidad, un paso abajo como maximo",
                Cell.DERIVED,
                "ley anti-degradacion + ladder"
            ),
            vppFilters = MatrixCell(
                "ninguno garantizado: se sondea el vocabulario MediaTek y se aplica solo lo PRESENTE",
                Cell.DERIVED,
                "CapabilityMatrix.vppPlan (get antes de put)"
            ),
            limits = MatrixCell(
                "device sin VPP y sin HDR debe seguir funcionando: es el caso por defecto del gating",
                Cell.DERIVED,
                "requisito 5 del encargo"
            )
        )
    )

    /** Informe legible de la matriz (para logcat/diagnostico). */
    fun report(): String = buildString {
        for (r in rows()) {
            append("[").append(r.family.wire).append("]\n")
            append("  codec  : ").append(r.codecMax.value).append("  <").append(r.codecMax.state).append("> ").append(r.codecMax.evidence).append('\n')
            append("  nivel  : ").append(r.levelMax.value).append("  <").append(r.levelMax.state).append("> ").append(r.levelMax.evidence).append('\n')
            append("  hdr    : ").append(r.hdr.value).append("  <").append(r.hdr.state).append("> ").append(r.hdr.evidence).append('\n')
            append("  target : ").append(r.targetResolution.value).append("  <").append(r.targetResolution.state).append("> ").append(r.targetResolution.evidence).append('\n')
            append("  vpp    : ").append(r.vppFilters.value).append("  <").append(r.vppFilters.state).append("> ").append(r.vppFilters.evidence).append('\n')
            append("  limites: ").append(r.limits.value).append("  <").append(r.limits.state).append("> ").append(r.limits.evidence).append('\n')
        }
    }

    /** Resumen de una línea con las capacidades medidas (no la matriz). */
    fun describe(caps: Caps): String = buildString {
        append("soc=").append(caps.socCanonical ?: caps.socRaw.ifEmpty { "?" })
        append(" familia=").append(caps.family.wire)
        append(" abi=").append(if (caps.abi64) "arm64" else caps.abis.firstOrNull() ?: "?")
        append(" hevc=").append(caps.hevcProfiles.ifEmpty { setOf("NO COMPUTADO") }.joinToString("/"))
        append(" nivel=").append(caps.hevcMaxLevel ?: "NO COMPUTADO")
        append(" hdr=").append(caps.hdrTypes.ifEmpty { setOf("SDR") }.joinToString("/"))
        append(" display=").append(caps.displayMaxWidth).append('x').append(caps.displayMaxHeight)
        append('@').append(trimFps(caps.displayMaxFps))
        append(" ram=").append(caps.ramTotalMb).append("MiB")
        append(" vpp=").append(caps.vppKeysPresent.size).append("/").append(caps.vppPresent.size)
        append(" writeSecure=").append(caps.writeSecure)
    }

    private fun trimFps(v: Double): String {
        if (!v.isFinite() || v <= 0.0) return "?"
        return if (v == Math.floor(v)) v.toLong().toString() else v.toString()
    }

    // ──────────────────────────── self-check puro ────────────────────────────

    /** Autocomprobación PURA (sin Android, sin I/O). "PASS ..." o "FAIL:<motivo>". */
    fun selfCheck(): String {
        // 1) nivel requerido por altura (Ley Cardinal 1)
        if (requiredLevel(1080, 30.0) != "L120") return "FAIL:lvl_1080_30"
        if (requiredLevel(1080, 60.0) != "L123") return "FAIL:lvl_1080_60"
        if (requiredLevel(2160, 60.0) != "L153") return "FAIL:lvl_2160"
        if (requiredLevel(3240, 30.0) != "L183") return "FAIL:lvl_3240"
        if (requiredLevel(4320, 60.0) != "L186") return "FAIL:lvl_4320"
        if (levelOrdinal("L153") != 153) return "FAIL:ordinal"
        if (levelOrdinal("l183") != 183) return "FAIL:ordinal_lower"
        if (levelOrdinal("basura") != null) return "FAIL:ordinal_basura"

        val base = Caps(
            socRaw = "amlogic", socCanonical = "s905x4", family = Family.AMLOGIC,
            abis = listOf("arm64-v8a"), hevcProfiles = setOf("main10"), hevcMaxLevel = "L153",
            hdrTypes = setOf("PQ"), displayMaxWidth = 3840, displayMaxHeight = 2160, displayMaxFps = 60.0,
            ramTotalMb = 2048, vppPresent = mapOf("pq_ai_sr_enable" to true, "ai_sr_level" to false),
            writeSecure = true
        )

        // 2) cabe: nivel del device >= requerido
        val ok = ladder(2160, 60.0, base)
        if (!ok.fits || ok.hardwareLimited) return "FAIL:ladder_ok"
        if (ok.declaredTarget != 2160) return "FAIL:ladder_ok_target"
        if (ok.decodeStep != 2160) return "FAIL:ladder_ok_step"

        // 3) NO cabe: un paso abajo, declarado, target NUNCA < 4K
        val weak = base.copy(hevcMaxLevel = "L120")
        val bad = ladder(2160, 60.0, weak)
        if (bad.fits) return "FAIL:ladder_weak_fits"
        if (!bad.hardwareLimited) return "FAIL:ladder_weak_flag"
        if (bad.declaredTarget < FLOOR_HEIGHT) return "FAIL:ladder_degrado_senal=${bad.declaredTarget}"
        if (bad.decodeStep < FLOOR_HEIGHT) return "FAIL:ladder_step_bajo_suelo=${bad.decodeStep}"
        if (!bad.declared) return "FAIL:ladder_no_declarado"

        // 4) 6K declarado con decoder L153 -> un paso a 2160, declarado, señal 3240
        val six = ladder(3240, 30.0, weak.copy(hevcMaxLevel = "L153"))
        if (six.fits) return "FAIL:ladder_6k_fits"
        if (six.declaredTarget != 3240) return "FAIL:ladder_6k_target=${six.declaredTarget}"
        if (six.decodeStep != FLOOR_HEIGHT) return "FAIL:ladder_6k_step=${six.decodeStep}"

        // 5) sin nivel medido -> NO COMPUTADO, nunca "cabe"
        val unknown = ladder(2160, 60.0, base.copy(hevcMaxLevel = null))
        if (unknown.fits) return "FAIL:sin_nivel_afirma_cabe"
        if (unknown.hardwareLimited) return "FAIL:sin_nivel_afirma_limitado"
        if (!unknown.reason.contains("NO COMPUTADO")) return "FAIL:sin_nivel_reason"

        // 6) gating: ausente -> IGNORE con motivo; presente+permiso -> APPLY; presente sin permiso -> IGNORE
        val plan = vppPlan(base, listOf("pq_ai_sr_enable", "ai_sr_level", "no_existe"))
        val byKey = plan.associateBy { it.key }
        if (byKey["pq_ai_sr_enable"]?.action != Action.APPLY) return "FAIL:gate_presente"
        if (byKey["ai_sr_level"]?.action != Action.IGNORE) return "FAIL:gate_ausente"
        if (byKey["no_existe"]?.action != Action.IGNORE) return "FAIL:gate_desconocida"
        val sinPermiso = vppPlan(base.copy(writeSecure = false), listOf("pq_ai_sr_enable"))
        if (sinPermiso.first().action != Action.IGNORE) return "FAIL:gate_sin_permiso"
        if (!sinPermiso.first().reason.contains("WRITE_SECURE")) return "FAIL:gate_sin_permiso_reason"

        // 7) la matriz: 4 familias, ninguna celda vacia, y lo no medido se declara NO_COMPUTADO
        val rows = rows()
        if (rows.size != 4) return "FAIL:filas=${rows.size}"
        for (r in rows) {
            val cells = listOf(r.codecMax, r.levelMax, r.hdr, r.targetResolution, r.vppFilters, r.limits)
            if (cells.any { it.value.isBlank() || it.evidence.isBlank() }) return "FAIL:celda_vacia_${r.family.wire}"
            if (cells.none { it.state == Cell.NO_COMPUTADO || it.state == Cell.REPO_EVIDENCE || it.state == Cell.DERIVED }) {
                return "FAIL:sin_estado_${r.family.wire}"
            }
        }
        if (rows.none { it.family == Family.QUALCOMM && it.codecMax.state == Cell.NO_COMPUTADO }) {
            return "FAIL:qualcomm_no_declarado_no_computado"
        }
        // la marca NO decide: dos Caps distintos de la MISMA familia dan escaleras distintas
        val mtk = base.copy(family = Family.MT8696_FIRETV, hevcMaxLevel = "L120")
        if (ladder(2160, 60.0, mtk).fits) return "FAIL:marca_decidio"

        // 8) describe no inventa: sin datos dice NO COMPUTADO
        val vacio = Caps("", null, Family.UNKNOWN, emptyList(), emptySet(), null, emptySet(), 0, 0, 0.0, 0,
            emptyMap(), false)
        if (!describe(vacio).contains("NO COMPUTADO")) return "FAIL:describe_vacio"
        if (!describe(vacio).contains("SDR")) return "FAIL:describe_sdr"

        return "PASS escalera=nivel↔resolucion(5 casos) paso_abajo=1 target>=4K=si " +
            "sin_nivel=NO_COMPUTADO gating=presente/ausente/sin_permiso matriz=4familias " +
            "qualcomm_no_computado=si marca_no_decide=si"
    }
}
