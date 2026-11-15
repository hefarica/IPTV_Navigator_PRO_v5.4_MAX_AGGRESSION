package com.ape.crystalagent.llm

/**
 * LlmOperatorApplier — LADO APK del operario LLM (t83).
 *
 * QUÉ HACE: recibe deltas del operario y los valida contra el catálogo de t81
 * antes de que nadie escriba un parámetro de imagen del dispositivo. Aplica
 * INMEDIATO (settings), no espera recarga de manifest.
 *
 * QUÉ NO PUEDE HACER, POR CONSTRUCCIÓN:
 *   - no escribe ficheros (no hay java.io.File ni FileOutputStream en este fichero);
 *   - no compila ni ejecuta nada (no hay Runtime ni ProcessBuilder);
 *   - no toca el APK instalado (no hay PackageManager ni instalador);
 *   - no crea claves: solo cambia el VALOR de una clave que ya existe.
 * Lo comprueba tools/quality/test_llm_operator_boundary.js leyendo este fichero.
 *
 * Los códigos son los mismos que el lado VPS para que un rechazo se pueda
 * diagnosticar igual en los dos lados.
 */
object LlmOperatorApplier {

    const val E_SCHEMA = "E_SCHEMA"
    const val E_SIDE_MISMATCH = "E_SIDE_MISMATCH"
    const val E_NOT_A_KNOB = "E_NOT_A_KNOB"
    const val E_INVARIANT_TOUCHED = "E_INVARIANT_TOUCHED"
    const val E_STRUCTURE_TOUCHED = "E_STRUCTURE_TOUCHED"
    const val E_APK_CODE_TOUCHED = "E_APK_CODE_TOUCHED"
    const val E_TYPE = "E_TYPE"
    const val E_RANGE = "E_RANGE"
    const val E_NO_RECEIPT = "E_NO_RECEIPT"

    /** Marcadores que NUNCA pueden aparecer en un nombre de perilla. */
    private val STRUCTURE = listOf(
        "#EXTINF", "#EXT-X-STREAM-INF", "#EXTSHIMOTT", "#EXT-X-APE-PROFILE-TEMPLATE",
        "#EXT-X-APE-LAB-METADATA", "#EXTM3U", "://", "../", "\\", "/", "$(", ";"
    )
    private val CODE_FILE = listOf(".kt", ".java", ".gradle", ".kts", ".apk", ".dex", ".so")

    data class Knob(val name: String, val side: String, val type: String,
                    val min: Double?, val max: Double?, val fraction: Double)

    data class Delta(val knob: String, val to: String)

    /** F2 (t87) · enum CERRADO de rutinas. Fuera de aqui: E_ROUTINE_UNKNOWN. */
    val ROUTINES = listOf("PROBE_CHANNEL", "REFRESH_TABLE", "FLUSH_TELEMETRY", "REREAD_LEVERS", "RETUNE_CHANNEL")

    /** F3 (t87) · enum CERRADO de procesos despertables. */
    val PROCESSES = listOf("PROBE_WORKER", "FLUSHER", "TABLE_REFRESHER")

    /** Plataforma: NO son procesos del operario (systemd, nginx, php-fpm, server.js). */
    private val FORBIDDEN_PROCESS = listOf(
        "systemd", "systemctl", "nginx", "php-fpm", "phpfpm", "server.js", "ape-jit", "node", "sshd", "cron"
    )

    data class Verdict(val ok: Boolean, val code: String?, val reason: String)

    /** F1 (t87) · identidad COMPARTIDA: mismo id que el lado VPS, derivado del
     *  sha256 del catalogo de t81. Los dos lados calculan lo mismo sin hablarse. */
    fun operatorId(catalogSha256: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val h = md.digest(("ape.llm.operator/1|" + catalogSha256).toByteArray(Charsets.UTF_8))
        val hex = h.joinToString("") { String.format("%02x", it) }
        return "op-" + hex.take(24)
    }

    /** Rutina del enum o rechazo literal. No ejecuta nada: solo valida el nombre. */
    fun validateRoutine(name: String): Verdict =
        if (ROUTINES.contains(name)) Verdict(true, null, "rutina conocida: $name")
        else Verdict(false, "E_ROUTINE_UNKNOWN", "rutina fuera del enum cerrado $ROUTINES: $name")

    /** Proceso del enum o rechazo literal (plataforma prohibida primero). */
    fun validateProcess(name: String): Verdict {
        val low = name.lowercase()
        for (f in FORBIDDEN_PROCESS) {
            if (low == f || low.contains(f)) return Verdict(false, "E_PROCESS_FORBIDDEN", "proceso de PLATAFORMA prohibido ($f): $name")
        }
        if (Regex("(\\.service|\\.socket|\\.timer|\\.target)$", RegexOption.IGNORE_CASE).containsMatchIn(name))
            return Verdict(false, "E_PROCESS_FORBIDDEN", "unidad systemd prohibida: $name")
        return if (PROCESSES.contains(name)) Verdict(true, null, "proceso conocido: $name")
        else Verdict(false, "E_PROCESS_UNKNOWN", "proceso fuera del enum cerrado $PROCESSES: $name")
    }

    private fun hasAny(s: String, needles: List<String>): String? =
        needles.firstOrNull { s.contains(it, ignoreCase = true) }

    /** Valida Y aplica sobre un mapa de parámetros ya existente. Atómico. */
    fun apply(side: String, deltas: List<Delta>, catalog: Map<String, Knob>,
              current: Map<String, String>): Pair<Verdict, Map<String, String>> {
        if (deltas.isEmpty()) return Verdict(false, E_SCHEMA, "sin deltas") to current
        if (deltas.size > 5) return Verdict(false, E_SCHEMA, "max 5 perillas por iteracion") to current

        val next = LinkedHashMap(current)
        for (d in deltas) {
            val sh = hasAny(d.knob, STRUCTURE) ?: hasAny(d.to, STRUCTURE)
            if (sh != null) return Verdict(false, E_STRUCTURE_TOUCHED, "toca estructura ($sh): ${d.knob}") to current
            val cf = hasAny(d.knob, CODE_FILE) ?: hasAny(d.to, CODE_FILE)
            if (cf != null) return Verdict(false, E_APK_CODE_TOUCHED, "nombra codigo ($cf): ${d.knob}") to current

            val k = catalog[d.knob] ?: return Verdict(false, E_NOT_A_KNOB, "perilla fuera del catalogo: ${d.knob}") to current
            if (k.side != side) return Verdict(false, E_SIDE_MISMATCH, "${k.name} es de ${k.side}, la vuelta es $side") to current

            if (!next.containsKey(k.name)) return Verdict(false, E_NO_RECEIPT, "la clave no existe (no se crean claves): ${k.name}") to current

            val num = d.to.toDoubleOrNull()
            if (k.type == "int" || k.type == "number") {
                if (num == null) return Verdict(false, E_TYPE, "${k.name} exige numero; llego ${d.to}") to current
                if ((k.min != null && num < k.min) || (k.max != null && num > k.max))
                    return Verdict(false, E_RANGE, "${k.name} fuera de rango: $num") to current
                val prev = next[k.name]?.toDoubleOrNull()
                if (prev != null) {
                    val up = prev + Math.abs(prev) * k.fraction
                    val down = prev - Math.abs(prev) * k.fraction
                    val v = when {
                        num > up -> up
                        num < down -> down
                        else -> num
                    }
                    next[k.name] = if (k.type == "int") Math.round(v).toString() else v.toString()
                } else {
                    next[k.name] = d.to
                }
            } else {
                next[k.name] = d.to
            }
        }
        return Verdict(true, null, "aplicado") to next
    }
}
