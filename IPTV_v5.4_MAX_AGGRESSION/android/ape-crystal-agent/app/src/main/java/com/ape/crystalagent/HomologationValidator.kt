package com.ape.crystalagent

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Validador de solo lectura del JSON homologado APE Crystal Pulse.
 *
 * Reglas que impone:
 *  - No ejecuta cadenas, rutas, URLs ni directivas: todo se compara como texto/dato.
 *  - No escribe preferencias, estado, filtros ni sesión de reproducción.
 *  - JSON estricto: UTF-8, sin claves duplicadas, profundidad y tamaño acotados.
 *  - SHA-256 canónico exacto: _meta.integrity.self_sha256 se sustituye por "" y el
 *    documento se serializa con claves ordenadas, separadores compactos y UTF-8,
 *    replicando json.dumps(sort_keys=True, separators=(',',':'), ensure_ascii=False).
 *  - Estructura (12 perfiles heredados, 5 perfiles de filtros, 60 planes), referencias
 *    y coherencia de planes 4K/6K 4:3, bwdif, pad y CAS classic/strong.
 *
 * El hash interno NO autentica el origen del archivo.
 */
object HomologationValidator {

    const val MAX_BYTES: Int = 8 * 1024 * 1024
    private const val MAX_DEPTH = 64

    data class Section(val ok: Boolean, val detail: String)

    data class Result(
        val structure: Section,
        val integrity: Section,
        val plans: Section,
        val profiles: Int,
        val filterProfiles: Int,
        val plansCount: Int,
        val sha256: String?,
    ) {
        val valid: Boolean get() = structure.ok && integrity.ok && plans.ok
    }

    fun validate(bytes: ByteArray): Result {
        if (bytes.size > MAX_BYTES) {
            return rejected("El archivo supera ${MAX_BYTES / 1024 / 1024} MiB")
        }
        val text = try {
            val decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
            decoder.decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: Exception) {
            return rejected("El archivo no es UTF-8 válido")
        }
        val root = try {
            StrictParser(text).parse()
        } catch (e: ParseException) {
            return rejected("JSON inválido: ${e.message}")
        }

        val rootObject = root as? Json.Obj
        val meta = asObject(member(rootObject, "_meta"))
        val homolog = asObject(member(meta, "crystal_pulse_homologation"))
        val profilesObject = asObject(member(rootObject, "profiles"))
        val filterObject = asObject(member(homolog, "filter_profiles"))
        val profileKeys = profilesObject?.entries?.map { it.first }?.toSet() ?: emptySet()
        val filterKeys = filterObject?.entries?.map { it.first }?.toSet() ?: emptySet()
        val plansCount = countPlans(filterObject)

        val structureMessage = validateStructure(rootObject, meta, homolog, profilesObject, filterObject, profileKeys, filterKeys, plansCount)
        val integrity = validateIntegrity(rootObject, meta)
        val plans = if (structureMessage == null) {
            validatePlans(filterObject, filterKeys)
        } else {
            Section(false, "No evaluados: primero debe pasar la estructura")
        }

        return Result(
            structure = Section(structureMessage == null, structureMessage ?: "12 perfiles · 5 filtros · 60 planes · referencias OK"),
            integrity = integrity,
            plans = plans,
            profiles = profileKeys.size,
            filterProfiles = filterKeys.size,
            plansCount = plansCount,
            sha256 = integrityHash(meta),
        )
    }

    private fun rejected(reason: String): Result = Result(
        structure = Section(false, reason),
        integrity = Section(false, "Integridad no comprobada"),
        plans = Section(false, "No evaluados"),
        profiles = 0,
        filterProfiles = 0,
        plansCount = 0,
        sha256 = null,
    )

    private fun validateStructure(
        root: Json.Obj?,
        meta: Json.Obj?,
        homolog: Json.Obj?,
        profiles: Json.Obj?,
        filters: Json.Obj?,
        profileKeys: Set<String>,
        filterKeys: Set<String>,
        plansCount: Int,
    ): String? {
        if (root == null) return "_meta: falta el objeto raíz"
        if (meta == null) return "_meta: falta _meta"
        if (asString(member(meta, "type")) != "all_profiles") return "_meta.type debe ser all_profiles"
        if (homolog == null) return "_meta.crystal_pulse_homologation: falta el bloque"
        if (asString(member(homolog, "schema")) != "ape.crystal.pulse.homologation/1") {
            return "_meta.crystal_pulse_homologation.schema no es ape.crystal.pulse.homologation/1"
        }
        if (asNumber(member(homolog, "revision"))?.toInt() != 1) {
            return "_meta.crystal_pulse_homologation.revision debe ser 1"
        }
        if (profiles == null) return "profiles: falta el objeto"
        if (profileKeys != EXPECTED_PROFILES) return "profiles: se esperan exactamente 12 perfiles heredados"
        if (filters == null) return "filter_profiles: falta el objeto"
        if (filterKeys != EXPECTED_FILTERS) return "filter_profiles: se esperan exactamente micro-sd, sd, hd, fhd, uhd"
        if (plansCount != 60) return "plans: se esperan 60 planes y hay $plansCount"

        val references = asObject(member(homolog, "profile_reference_map"))
            ?: return "profile_reference_map: falta el mapa"
        val referenceKeys = references.entries.map { it.first }.toSet()
        if (referenceKeys != EXPECTED_PROFILES) return "profile_reference_map: las claves no coinciden con profiles"
        for ((_, refValue) in references.entries) {
            val ref = asObject(refValue) ?: return "profile_reference_map: referencia no es objeto"
            val filter = asString(member(ref, "reference_filter_profile"))
            if (filter == null || filter !in EXPECTED_FILTERS) return "profile_reference_map: reference_filter_profile inválido"
            if (asString(member(ref, "reference_target")) !in setOf("4k", "6k")) return "profile_reference_map: reference_target inválido"
            if (asString(member(ref, "filter_profile_ref"))?.contains(filter) != true) return "profile_reference_map: filter_profile_ref no resuelve"
        }
        if (plansCount != 60) return "plans: conteo inconsistente"

        val instructions = asObject(member(homolog, "apk_import_instructions"))
            ?: return "apk_import_instructions: falta el bloque"
        if (asString(member(instructions, "schema")) != "ape.crystal.pulse.apk_import_instructions/1") {
            return "apk_import_instructions.schema inválido"
        }
        if (asString(member(instructions, "mode")) != "MANUAL_VALIDATE_ONLY") {
            return "apk_import_instructions.mode debe ser MANUAL_VALIDATE_ONLY"
        }
        for (flag in listOf("automatic_load", "activate_on_success", "persist_configuration", "execute_filters", "network_required")) {
            if (asBoolean(member(instructions, flag)) != false) return "apk_import_instructions.$flag debe ser false"
        }
        val steps = member(instructions, "instructions") as? Json.Arr
        if (steps == null || steps.items.size != 6) return "apk_import_instructions.instructions deben ser 6 pasos"
        return null
    }

    private fun countPlans(filters: Json.Obj?): Int {
        if (filters == null) return 0
        var count = 0
        for ((_, filterValue) in filters.entries) {
            val plans = asObject(member(asObject(filterValue), "plans")) ?: continue
            for (variant in VARIANTS) {
                val variantObject = asObject(member(plans, variant)) ?: continue
                for (target in TARGETS) {
                    val targetObject = asObject(member(variantObject, target)) ?: continue
                    for (quality in QUALITIES) {
                        if (asObject(member(targetObject, quality)) != null) count++
                    }
                }
            }
        }
        return count
    }

    private fun validateIntegrity(root: Json.Obj?, meta: Json.Obj?): Section {
        val integrity = asObject(member(meta, "integrity"))
            ?: return Section(false, "Integridad no comprobada: falta _meta.integrity")
        if (asString(member(integrity, "algorithm")) != "sha256") {
            return Section(false, "Integridad no comprobada: algorithm no es sha256")
        }
        val expected = asString(member(integrity, "self_sha256"))
        if (expected == null || !expected.matches(Regex("^[0-9a-fA-F]{64}$"))) {
            return Section(false, "Integridad no comprobada: self_sha256 no es un SHA-256")
        }
        val scope = asString(member(integrity, "self_sha256_scope")) ?: ""
        if (!scope.contains("json.dumps(sort_keys=True, separators=(',',':'), ensure_ascii=False)")) {
            return Section(false, "Integridad no comprobada: self_sha256_scope no es el algoritmo esperado")
        }
        val actual = try {
            val full = StringBuilder()
            canonical(root, full, "")
            sha256(full.toString())
        } catch (_: Exception) {
            return Section(false, "Integridad no comprobada: el serializador canónico falló")
        }
        return if (actual.equals(expected, ignoreCase = true)) {
            Section(true, "SHA-256 canónico verificado · ${actual.take(16)}…")
        } else {
            Section(false, "SHA-256 no coincide (calculado ${actual.take(16)}…)")
        }
    }

    private fun integrityHash(meta: Json.Obj?): String? {
        val integrity = asObject(member(meta, "integrity")) ?: return null
        return asString(member(integrity, "self_sha256"))
    }

    private fun validatePlans(filters: Json.Obj?, filterKeys: Set<String>): Section {
        if (filters == null) return Section(false, "filter_profiles ausente")
        var count = 0
        for (profile in filterKeys) {
            val filter = asObject(member(filters, profile)) ?: return Section(false, "$profile: falta")
            val plans = asObject(member(filter, "plans")) ?: return Section(false, "$profile.plans: falta")
            val fixture = asObject(member(filter, "fixture"))
            if (asString(member(fixture, "display_aspect_ratio")) != "4:3") {
                return Section(false, "$profile.fixture: se espera 4:3")
            }
            for (variant in VARIANTS) {
                val variantObject = asObject(member(plans, variant)) ?: return Section(false, "$profile.plans.$variant: falta")
                for (target in TARGETS) {
                    val targetObject = asObject(member(variantObject, target)) ?: return Section(false, "$profile.plans.$variant.$target: falta")
                    val expectedActive = if (target == "4k") listOf(2880, 2160) else listOf(4320, 3240)
                    val expectedCanvas = if (target == "4k") listOf(3840, 2160) else listOf(5760, 3240)
                    for (quality in QUALITIES) {
                        val plan = asObject(member(targetObject, quality)) ?: return Section(false, "$profile/$variant/$target/$quality: falta")
                        val active = ints(member(plan, "active_px"))
                        val output = ints(member(plan, "output_px"))
                        if (active != expectedActive) return Section(false, "$profile/$variant/$target/$quality.active_px")
                        if (output != expectedCanvas) return Section(false, "$profile/$variant/$target/$quality.output_px")
                        val filtersValue = stringList(member(plan, "filters"))
                            ?: return Section(false, "$profile/$variant/$target/$quality.filters")
                        val bwdif = filtersValue.firstOrNull()?.startsWith("bwdif=") == true
                        if (variant == "interlaced" && !bwdif) return Section(false, "$profile/$variant/$target/$quality: bwdif debe ser primero")
                        if (variant == "progressive" && filtersValue.any { it.startsWith("bwdif=") }) {
                            return Section(false, "$profile/$variant/$target/$quality: bwdif solo en entrelazado")
                        }
                        val pad = filtersValue.firstOrNull { it.startsWith("pad=") }
                        val expectedPad = "pad=${expectedCanvas[0]}:${expectedCanvas[1]}:trunc((ow-iw)/4)*2:trunc((oh-ih)/4)*2"
                        if (pad != expectedPad) return Section(false, "$profile/$variant/$target/$quality.pad")
                        count++
                    }

                    val classic = asObject(member(targetObject, "max_classic"))
                        ?: return Section(false, "$profile/$variant/$target/max_classic: falta")
                    val strong = asObject(member(targetObject, "max_strong"))
                        ?: return Section(false, "$profile/$variant/$target/max_strong: falta")
                    val classicFilters = stringList(member(classic, "filters"))
                        ?: return Section(false, "$profile/$variant/$target/max_classic.filters")
                    val strongFilters = stringList(member(strong, "filters"))
                        ?: return Section(false, "$profile/$variant/$target/max_strong.filters")
                    val classicCas = asNumber(member(classic, "cas_strength"))
                    val strongCas = asNumber(member(strong, "cas_strength"))
                    if (profile == "micro-sd" || profile == "sd") {
                        val expectedStrong = if (profile == "micro-sd") 0.34 else 0.30
                        val expectedClassic = if (profile == "micro-sd") 0.19 else 0.17
                        if (classicCas == null || Math.abs(classicCas - expectedClassic) > 1e-9) {
                            return Section(false, "$profile/$variant/$target/max_classic.cas_strength")
                        }
                        if (strongCas == null || Math.abs(strongCas - expectedStrong) > 1e-9) {
                            return Section(false, "$profile/$variant/$target/max_strong.cas_strength")
                        }
                        if (classicFilters.size != strongFilters.size) {
                            return Section(false, "$profile/$variant/$target: strong no debe cambiar el número de filtros")
                        }
                        val diffs = classicFilters.indices.filter { classicFilters[it] != strongFilters[it] }
                        if (diffs.size != 1 || !strongFilters[diffs[0]].startsWith("cas=")) {
                            return Section(false, "$profile/$variant/$target: strong solo puede cambiar CAS")
                        }
                    } else {
                        if (classicFilters != strongFilters || classicCas != strongCas) {
                            return Section(false, "$profile/$variant/$target: strong no debe cambiar nada")
                        }
                    }
                }
            }
        }
        return if (count == 60) Section(true, "60 planes coherentes · 4:3 · bwdif · pad · CAS") else Section(false, "planes: $count/60")
    }

    // ── JSON estricto ───────────────────────────────────────────────────────

    private sealed class Json {
        data class Obj(val entries: List<Pair<String, Json>>) : Json()
        data class Arr(val items: List<Json>) : Json()
        data class Str(val value: String) : Json()
        data class Num(val raw: String) : Json()
        data class Bool(val value: Boolean) : Json()
        object Null : Json()
    }

    private class ParseException(message: String) : Exception(message)

    private class StrictParser(private val text: String) {
        private var pos = 0

        fun parse(): Json {
            skip()
            val value = value(0)
            skip()
            if (pos != text.length) throw ParseException("contenido extra al final")
            return value
        }

        private fun value(depth: Int): Json {
            if (depth > MAX_DEPTH) throw ParseException("profundidad máxima")
            if (pos >= text.length) throw ParseException("fin inesperado")
            return when (val c = text[pos]) {
                '{' -> obj(depth + 1)
                '[' -> array(depth + 1)
                '"' -> Json.Str(string())
                't' -> { literal("true"); Json.Bool(true) }
                'f' -> { literal("false"); Json.Bool(false) }
                'n' -> { literal("null"); Json.Null }
                '-', in '0'..'9' -> number()
                else -> throw ParseException("carácter inesperado '${if (c.code < 32) "\\\\u%04x".format(c.code) else c}'")
            }
        }

        private fun obj(depth: Int): Json.Obj {
            expect('{'); skip()
            if (consume('}')) return Json.Obj(emptyList())
            val entries = ArrayList<Pair<String, Json>>()
            val keys = HashSet<String>()
            while (true) {
                skip()
                if (pos >= text.length || text[pos] != '"') throw ParseException("clave no es string")
                val key = string()
                if (!keys.add(key)) throw ParseException("clave duplicada: $key")
                skip(); expect(':'); skip()
                entries.add(key to value(depth + 1))
                skip()
                when {
                    consume('}') -> break
                    consume(',') -> continue
                    else -> throw ParseException("falta ',' o '}'")
                }
            }
            return Json.Obj(entries)
        }

        private fun array(depth: Int): Json.Arr {
            expect('['); skip()
            if (consume(']')) return Json.Arr(emptyList())
            val items = ArrayList<Json>()
            while (true) {
                skip()
                items.add(value(depth + 1))
                skip()
                when {
                    consume(']') -> break
                    consume(',') -> continue
                    else -> throw ParseException("falta ',' o ']'")
                }
            }
            return Json.Arr(items)
        }

        private fun string(): String {
            expect('"')
            val out = StringBuilder()
            while (pos < text.length) {
                val c = text[pos++]
                when {
                    c == '"' -> return out.toString()
                    c == '\\' -> {
                        if (pos >= text.length) throw ParseException("escape incompleto")
                        when (text[pos++]) {
                            '"' -> out.append('"')
                            '\\' -> out.append('\\')
                            '/' -> out.append('/')
                            'b' -> out.append('\b')
                            'f' -> out.append('\u000C')
                            'n' -> out.append('\n')
                            'r' -> out.append('\r')
                            't' -> out.append('\t')
                            'u' -> {
                                if (pos + 4 > text.length) throw ParseException("unicode incompleto")
                                val hex = text.substring(pos, pos + 4)
                                val code = hex.toIntOrNull(16) ?: throw ParseException("unicode inválido")
                                out.append(code.toChar())
                                pos += 4
                            }
                            else -> throw ParseException("escape inválido")
                        }
                    }
                    c.code < 0x20 -> throw ParseException("control sin escapar en string")
                    else -> out.append(c)
                }
            }
            throw ParseException("string sin cerrar")
        }

        private fun number(): Json.Num {
            val start = pos
            if (peek() == '-') pos++
            if (pos >= text.length) throw ParseException("número incompleto")
            if (text[pos] == '0') {
                pos++
            } else if (text[pos] in '1'..'9') {
                while (pos < text.length && text[pos].isDigit()) pos++
            } else {
                throw ParseException("número inválido")
            }
            if (pos < text.length && text[pos] == '.') {
                pos++
                if (pos >= text.length || !text[pos].isDigit()) throw ParseException("decimal inválido")
                while (pos < text.length && text[pos].isDigit()) pos++
            }
            if (pos < text.length && (text[pos] == 'e' || text[pos] == 'E')) {
                pos++
                if (pos < text.length && (text[pos] == '+' || text[pos] == '-')) pos++
                if (pos >= text.length || !text[pos].isDigit()) throw ParseException("exponente inválido")
                while (pos < text.length && text[pos].isDigit()) pos++
            }
            return Json.Num(text.substring(start, pos))
        }

        private fun literal(lit: String) {
            if (!text.startsWith(lit, pos)) throw ParseException("literal inválido")
            pos += lit.length
        }

        private fun expect(c: Char) {
            if (pos >= text.length || text[pos] != c) throw ParseException("se esperaba '$c'")
            pos++
        }

        private fun consume(c: Char): Boolean {
            if (pos < text.length && text[pos] == c) { pos++; return true }
            return false
        }

        private fun peek(): Char = if (pos < text.length) text[pos] else '\u0000'

        private fun skip() {
            while (pos < text.length && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r')) pos++
        }
    }

    // ── Canónico y utilidades ──────────────────────────────────────────────

    private fun canonical(value: Json?, out: StringBuilder, path: String) {
        when (value) {
            is Json.Obj -> {
                out.append('{')
                val sorted = value.entries.sortedWith { a, b -> compareCodePoints(a.first, b.first) }
                sorted.forEachIndexed { index, (key, child) ->
                    if (index > 0) out.append(',')
                    encodeString(key, out)
                    out.append(':')
                    val childPath = if (path.isEmpty()) key else "$path.$key"
                    if (path == "_meta.integrity" && key == "self_sha256") out.append("\"\"")
                    else canonical(child, out, childPath)
                }
                out.append('}')
            }
            is Json.Arr -> {
                out.append('[')
                value.items.forEachIndexed { index, child ->
                    if (index > 0) out.append(',')
                    canonical(child, out, path)
                }
                out.append(']')
            }
            is Json.Str -> encodeString(value.value, out)
            is Json.Num -> out.append(value.raw)
            is Json.Bool -> out.append(if (value.value) "true" else "false")
            Json.Null -> out.append("null")
            null -> out.append("null")
        }
    }

    private fun compareCodePoints(a: String, b: String): Int {
        var ia = 0
        var ib = 0
        while (ia < a.length && ib < b.length) {
            val ca = a.codePointAt(ia)
            val cb = b.codePointAt(ib)
            if (ca != cb) return ca.compareTo(cb)
            ia += Character.charCount(ca)
            ib += Character.charCount(cb)
        }
        return (a.length - ia).compareTo(b.length - ib)
    }

    private fun encodeString(value: String, out: StringBuilder) {
        out.append('"')
        for (c in value) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\b' -> out.append("\\b")
                '\u000C' -> out.append("\\f")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (c.code < 0x20) out.append("\\u%04x".format(c.code)) else out.append(c)
            }
        }
        out.append('"')
    }

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun asObject(value: Json?): Json.Obj? = value as? Json.Obj
    private fun member(obj: Json.Obj?, key: String): Json? = obj?.entries?.firstOrNull { it.first == key }?.second
    private fun asString(value: Json?): String? = (value as? Json.Str)?.value
    private fun asNumber(value: Json?): Double? = (value as? Json.Num)?.raw?.toDoubleOrNull()
    private fun asBoolean(value: Json?): Boolean? = (value as? Json.Bool)?.value

    private fun ints(value: Json?): List<Int>? {
        val array = value as? Json.Arr ?: return null
        return array.items.map { (it as? Json.Num)?.raw?.toIntOrNull() ?: return null }
    }

    private fun stringList(value: Json?): List<String>? {
        val array = value as? Json.Arr ?: return null
        return array.items.map { (it as? Json.Str)?.value ?: return null }
    }

    private val EXPECTED_PROFILES = setOf("P0", "P1", "P2", "P3", "P4", "P5", "P0.5", "P1.5", "P2.5", "P3.5", "P4.5", "P5.5")
    private val EXPECTED_FILTERS = setOf("micro-sd", "sd", "hd", "fhd", "uhd")
    private val VARIANTS = listOf("progressive", "interlaced")
    private val TARGETS = listOf("4k", "6k")
    private val QUALITIES = listOf("balanced", "max_classic", "max_strong")
}
