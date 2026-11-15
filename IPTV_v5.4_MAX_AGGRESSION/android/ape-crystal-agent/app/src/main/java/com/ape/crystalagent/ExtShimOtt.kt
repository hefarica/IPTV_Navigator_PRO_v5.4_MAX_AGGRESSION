package com.ape.crystalagent

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale

/**
 * ExtShimOtt — parser del tag HLS propietario `#EXTSHIMOTT:{json}` (contrato `ape.extshimott.v1`).
 *
 * QUÉ ES Y QUÉ NO ES (truth-guards):
 *  · Por RFC 8216 §4.1 y §6.3.1 un cliente HLS **DEBE ignorar** los tags desconocidos: este tag
 *    no rompe VLC/Kodi/ExoPlayer/hls.js porque ninguno lo interpreta. Lo lee el shim de la APK.
 *  · El tag es **ADITIVO**. Este parser NO toca el `#EXTINF`, el `#EXTHTTP` (199), las directivas
 *    `#EXT-X-APE-*` (109), los `#EXTVLCOPT` (21) ni los `#KODIPROP` (6) del canal: solo lee su
 *    propia línea y devuelve un mapa `id -> objeto tipado`.
 *  · **Esta clase no aplica nada.** No escribe settings, no arranca el shim, no habla por red.
 *    La aplicación de `dev.*` / `ott.*` por canal es de la tarea `shim`.
 *  · `flt` (cadena ffmpeg) es SOLO de VPS/VLC. Si `ott` está en `tgt`, OTT **no debe** tocarla
 *    (ver [ExtShimOtt.ottIgnoresFilter]). El contrato lo dice y el parser lo deja verificable.
 *
 * FAIL-HONEST: un tag malformado **se registra y se ignora**. Nunca se inventa un valor, nunca se
 * rellena un campo ausente con un centinela (el contrato no define centinelas: si no se conoce, se
 * omite) y **nunca se propaga una excepción** hacia fuera: [ExtShimOttParser.parse] no lanza.
 *
 * Un payload que produce al menos un ERROR de contrato se **rechaza entero** (no entra en el mapa)
 * porque el contrato es de rechazo, no de tolerancia: `additionalProperties=false` y sin centinelas.
 * Los WARNING y NOTEs se registran sin bloquear (paridad con `tools/quality/validate_extshimott.js`).
 *
 * FUERA DE ALCANCE (lo valida el validador Node, no este parser):
 *  · La **posición** del tag (última línea de tag, inmediatamente antes de la URI) y su unicidad por
 *    canal (`E_TAG_NOT_LAST`, `E_TAG_DUP`, `E_TAG_OUTSIDE`): aquí el tag se parsea donde aparezca.
 *  · `W_ID_TVGID`: exige el `tvg-id` del `#EXTINF`, que este parser no lee (no es su entrada).
 *  · `W_NOT_CANONICAL`: es una propiedad de la forma emitida, no del contenido consumido.
 *
 * LÍMITE HONESTO: el JSON se parsea con `org.json`, cuya implementación de Android es **tolerante**
 * (acepta comas finales, comillas simples y comentarios, que el JSON estricto prohíbe). Por eso el
 * payload pasa ANTES por [ExtShimOttParser.scanStrict], que es lo que convierte "malformado" en
 * rechazo determinista en vez de aceptación silenciosa. Lo que ese escáner NO valida (formato de
 * números, `\u` mal formados) lo resuelve `org.json` o lo caza el validador Node.
 *
 * VERIFICABLE SIN INFRA DE TEST: el proyecto `:app` **no tiene** `src/test` ni dependencias de test
 * (ver `app/build.gradle.kts`: no hay `testImplementation`), así que no hay `gradlew test`. En su
 * lugar este archivo expone [ExtShimOttParser.selfCheck], una función **pura** (sin Android, sin
 * I/O, sin red) que corre casos reales del contrato y devuelve un informe PASS/FAIL ejecutable en
 * cualquier JVM con `org.json` (solo depende de `org.json`, por eso el parser es ejecutable fuera
 * de Android). El único punto de contacto con el mundo es `org.json` + Kotlin stdlib.
 */
data class ExtShimOtt(
    /** Clave única del canal (la misma que `ape_lists.db`). No se garantiza que case con el `tvg-id`. */
    val id: String,
    /** Versión del contrato: siempre 1 (un `ver` distinto se rechaza). */
    val version: Int,
    /** Línea 1-based del M3U8 donde apareció el tag (trazabilidad del rechazo y del origen). */
    val line: Int,
    /** Lectores que consumen este objeto. Sin duplicados. */
    val targets: Set<ExtShimOttTarget>,
    /**
     * `true` si el tag apareció dentro de un bloque de canal (`#EXTINF:` … URI).
     * `false` = tag huérfano (fuera de bloque): el parser lo acepta igual —la POSICIÓN la valida
     * `tools/quality/validate_extshimott.js`, no este parser— pero el consumidor recibe la señal
     * para poder fallar cerrado en vez de aplicar settings de un tag que ningún canal introduce.
     */
    val inChannelBlock: Boolean = true,
    /** Video de la **fuente real servida** (no la deseada). `null` = no declarado. */
    val video: ExtShimOttVideo? = null,
    /** Audio de la fuente. `null` = no declarado. */
    val audio: ExtShimOttAudio? = null,
    /** Cabeceras que el shim inyecta. DECLARATIVO y ADITIVO: no sustituye el `#EXTHTTP`. */
    val headers: ExtShimOttHeaders? = null,
    /** Cadena ffmpeg compacta. Solo VPS y VLC (`vlc.f=1`). OTT nunca la toca. */
    val filter: String? = null,
    /** Cadencia objetivo del canal. */
    val cadence: ExtShimOttCadence? = null,
    /** Ajustes de dispositivo por canal (los mismos que hoy van por ADB/settings). */
    val device: ExtShimOttDevice? = null,
    /** Ajustes de OTT Navigator. Solo los consume el target `ott`. */
    val ott: ExtShimOttOtt? = null,
    /** Ajustes de VLC. Solo los consume el target `vlc`. */
    val vlc: ExtShimOttVlc? = null,
    /** Ajustes de Kodi. Solo los consume el target `kod`. */
    val kodi: ExtShimOttKodi? = null
) {
    /** ¿Este objeto lo lee [target]? */
    fun reads(target: ExtShimOttTarget): Boolean = target in targets

    /**
     * VLC aplica `filter` como argumentos SOLO si `vlc` está en `tgt`, `vlc.f=1` y hay cadena.
     * Regla del contrato: declarar la intención sin la cadena no aplica nada (allí es `E_VLC_FLT_MISSING`).
     */
    fun vlcAppliesFilter(): Boolean =
        reads(ExtShimOttTarget.VLC) && vlc?.applyFilter == 1 && !filter.isNullOrEmpty()

    /** Contrato: OTT **nunca** toca `filter`, aunque venga en el payload. */
    fun ottIgnoresFilter(): Boolean = reads(ExtShimOttTarget.OTT) && filter != null

    /** Resumen de una línea para logs. No inventa: si falta, lo dice. */
    fun summary(): String = buildString {
        append("id=").append(id).append(" ver=").append(version)
        append(" tgt=").append(targets.joinToString("|") { it.wire })
        video?.let {
            append(" v=").append(it.codec ?: "?")
            if (it.width != null && it.height != null) append(' ').append(it.width).append('x').append(it.height)
        }
        device?.let { append(" dev=").append('{').append(it.describe()).append('}') }
    }
}

/** Video de la fuente real servida (`v`). Cualquier subcampo ausente = no conocido. */
data class ExtShimOttVideo(
    /** `hevc` | `av1` | `vvc` | `h264` | `vp9`. */
    val codec: String? = null,
    /** `main` | `main8` | `main10` | `main12` | `high` | `high10` | `professional` (etiqueta declarada). */
    val profile: String? = null,
    /** Rango dinámico REAL: `sdr` | `hdr10` | `hdr10plus` | `dolby_vision`.
     *  OJO: es un String dentro de `v`; el objeto de cabeceras se llama [ExtShimOtt.headers]. */
    val hdr: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    /** FPS efectivo del segmento (no el nominal del contenedor). */
    val fps: Double? = null,
    /** GOP en frames: la duración es `gop/fps` segundos. */
    val gop: Int? = null,
    /** `bt709` | `bt2020` | `smpte428`. */
    val transfer: String? = null
)

/** Audio de la fuente (`a`). */
data class ExtShimOttAudio(
    val codec: String? = null,
    /** 2 = estéreo, 6 = 5.1, 8 = 7.1. */
    val channels: Int? = null,
    /** Idioma BCP-47 en minúsculas (`es`, `en`, `pt-BR`). */
    val language: String? = null
)

/** Cabeceras que el shim inyecta (`hdr`). Declarativo: no sustituye el `#EXTHTTP` del canal. */
data class ExtShimOttHeaders(
    /** User-Agent. El contrato prohíbe `%20` (espacio literal) y CR/LF (inyección). */
    val userAgent: String? = null,
    /** Referer. El contrato prohíbe apuntar al VPS propio (un bloqueo del CDN mataría todos los canales). */
    val referer: String? = null
)

/** Cadencia objetivo (`cad`). */
data class ExtShimOttCadence(
    /** `fixed` | `adaptive`. */
    val mode: String? = null,
    val fps: Double? = null,
    /** Duración de segmento HLS en segundos; debe ser múltiplo entero de `gop/fps`. */
    val segment: Double? = null
)

/**
 * Ajustes de dispositivo (`dev`) — los MISMOS que hoy se aplican por ADB/settings.
 *
 * HONESTO sobre los mapeos (lo dice el contrato, no este parser):
 *  · [hdrConversionMode] y [matchContentFrameRate] están MEDIDOS (`hdr_conversion_mode`,
 *    `match_content_frame_rate`).
 *  · [minimalPostProcessing] y [deinterlace] son MAPEOS **INFERIDOS / NO VERIFICADOS**: el contrato
 *    fija el dominio de valores y deja el significado a la capa de dispositivo.
 *  · [preferredWidth]/[preferredHeight] son una PREFERENCIA de display, **no** una degradación
 *    (Ley Anti-Degradación: no se usan para bajar la fuente).
 */
data class ExtShimOttDevice(
    /** `hdr_conversion_mode`: 0=UNKNOWN, 1=PASSTHROUGH, 2=SYSTEM, 3=FORCE.
     *  NO hace SDR→HDR: 1 deja pasar el HDR real. */
    val hdrConversionMode: Int? = null,
    /** `match_content_frame_rate`: 0 | 1 | 2. */
    val matchContentFrameRate: Int? = null,
    /** `minimal_post_processing_allowed`: 0 | 1 (mapeo inferido, no verificado). */
    val minimalPostProcessing: Int? = null,
    /** `user_preferred_resolution_width`. */
    val preferredWidth: Int? = null,
    /** `user_preferred_resolution_height`. */
    val preferredHeight: Int? = null,
    /** `off` | `on` | `auto` (expansión de `di` no verificada en el repo). */
    val deinterlace: String? = null
) {
    internal fun describe(): String = listOfNotNull(
        hdrConversionMode?.let { "hdr_c=$it" },
        matchContentFrameRate?.let { "mcr=$it" },
        minimalPostProcessing?.let { "mmp=$it" },
        preferredWidth?.let { "res_w=$it" },
        preferredHeight?.let { "res_h=$it" },
        deinterlace?.let { "di=$it" }
    ).joinToString(",")
}

/** Ajustes de OTT Navigator (`ott`). */
data class ExtShimOttOtt(
    /** Buffer en MB. */
    val bufferMb: Double? = null,
    /** 1 = decoder hardware, 0 = no. */
    val hardwareDecoder: Int? = null,
    /** `fit` | `fill` | `center`. */
    val aspect: String? = null
)

/** Ajustes de VLC (`vlc`). */
data class ExtShimOttVlc(
    /** 1 = aplicar `flt` como argumentos de filtro de VLC. */
    val applyFilter: Int? = null
)

/** Ajustes de Kodi (`kod`). */
data class ExtShimOttKodi(
    /** 1 = inputstream.adaptive habilitado para el canal. */
    val inputstreamAdaptive: Int? = null
)

/** Target HLS que lee el objeto (`tgt`). */
enum class ExtShimOttTarget(val wire: String) {
    OTT("ott"),
    VLC("vlc"),
    KODI("kod");

    companion object {
        /** `null` si el token no está en el contrato. */
        fun fromWire(token: String): ExtShimOttTarget? =
            values().firstOrNull { it.wire == token }
    }
}

/** Un hallazgo del parser. [code] usa el MISMO vocabulario que `tools/quality/validate_extshimott.js`. */
data class ExtShimOttIssue(
    val severity: Severity,
    val code: String,
    /** Línea 1-based del M3U8. */
    val line: Int,
    /** Ruta del campo (`v.w`) o detalle humano. */
    val detail: String
) {
    enum class Severity { ERROR, WARNING, NOTE }

    override fun toString(): String {
        val sev = when (severity) {
            Severity.ERROR -> "ERROR  "
            Severity.WARNING -> "WARN   "
            Severity.NOTE -> "NOTE   "
        }
        val where = if (detail.isEmpty()) "" else " · $detail"
        return "$sev$code · linea $line$where"
    }
}

/** Resultado de parsear una lista: el mapa aceptado + la bitácora de lo rechazado. */
data class ExtShimOttResult(
    /** `id -> objeto`. Solo payloads que pasaron el contrato, en orden de aparición. */
    val entries: Map<String, ExtShimOtt>,
    /** Bitácora completa (ERROR rechaza el payload; WARNING/NOTE no). */
    val issues: List<ExtShimOttIssue>,
    /** Ocurrencias del tag encontradas (aceptadas + rechazadas). */
    val tagCount: Int
) {
    operator fun get(id: String): ExtShimOtt? = entries[id]

    val errors: List<ExtShimOttIssue> get() = issues.filter { it.severity == ExtShimOttIssue.Severity.ERROR }
    val warnings: List<ExtShimOttIssue> get() = issues.filter { it.severity == ExtShimOttIssue.Severity.WARNING }

    fun hasErrors(): Boolean = issues.any { it.severity == ExtShimOttIssue.Severity.ERROR }

    /** Rechazados = ocurrencias del tag que no produjeron entrada. */
    val rejectedCount: Int get() = tagCount - entries.size

    /** Informe legible para `logcat`. El llamador decide si lo escribe. */
    fun report(): String = buildString {
        append("EXTSHIMOTT: tags=").append(tagCount)
        append(" aceptados=").append(entries.size)
        append(" rechazados=").append(rejectedCount)
        append(" errores=").append(errors.size)
        append(" warnings=").append(warnings.size)
        for (i in issues) append('\n').append(i)
    }
}

/**
 * Parser puro del tag `#EXTSHIMOTT` — contrato `ape.extshimott.v1`.
 *
 * Entrada: el texto de la lista (o sus líneas). Salida: [ExtShimOttResult].
 * Sin Android, sin I/O, sin red, sin estado: la misma entrada da la misma salida.
 */
object ExtShimOttParser {

    /** Nombre del tag (sin `:`), para logs y detección tolerante a mayúsculas. */
    const val TAG_NAME: String = "#EXTSHIMOTT"

    /** Prefijo exacto: el contrato exige la forma `#EXTSHIMOTT:{json}` en UNA línea. */
    const val PREFIX: String = "#EXTSHIMOTT:"

    /** Techo DURO de la línea completa (prefijo incluido), del contrato. */
    const val MAX_LINE_CHARS: Int = 4096

    /** Presupuesto operativo: por encima avisa pero no rechaza. */
    const val WARN_LINE_CHARS: Int = 3840

    /** Tolerancia del contrato para la coherencia `cad.seg` ⇔ `v.g/v.f` (segundos). */
    const val GOP_TOLERANCE_S: Double = 1e-3

    /**
     * Tope de anidamiento aceptado. El contrato usa como máximo 3 niveles y `JSONObject` es
     * recursivo: el tope corta por construcción un payload que reventaría la pila. Un
     * anidamiento mayor se trata como malformado (se registra y se ignora).
     */
    const val MAX_DEPTH: Int = 32

    private val ID_PATTERN = Regex("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}\$")
    private val TGT_PATTERN = Regex("^(ott|vlc|kod)(\\|(ott|vlc|kod))*\$")
    private val LANG_PATTERN = Regex("^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*\$")
    private val UA_PATTERN = Regex("^[^\\r\\n]+\$")
    private val REFERER_PATTERN = Regex("^https?://[^\\s]+\$")
    private val FILTER_PATTERN = Regex("^[A-Za-z0-9_.,:=+*/\\[\\] -]{1,1024}\$")
    private val ENGINE_FP = Regex("OMEGA|CRYSTAL|APE_", RegexOption.IGNORE_CASE)
    private val OWN_VPS = Regex("iptv-ape|duckdns|178\\.156|hetzner", RegexOption.IGNORE_CASE)

    private val ROOT_KEYS = setOf("ver", "id", "tgt", "v", "a", "hdr", "flt", "cad", "dev", "ott", "vlc", "kod")
    private val VIDEO_KEYS = setOf("c", "p", "hdr", "w", "h", "f", "g", "tf")
    private val AUDIO_KEYS = setOf("c", "ch", "l")
    private val HEADER_KEYS = setOf("ua", "rf")
    private val CADENCE_KEYS = setOf("mode", "fps", "seg")
    private val DEVICE_KEYS = setOf("hdr_c", "mcr", "mmp", "res_w", "res_h", "di")
    private val OTT_KEYS = setOf("buf", "hw", "asp")
    private val VLC_KEYS = setOf("f")
    private val KODI_KEYS = setOf("isa")

    private val V_CODECS = setOf("hevc", "av1", "vvc", "h264", "vp9")
    private val V_PROFILES = setOf("main", "main8", "main10", "main12", "high", "high10", "professional")
    private val V_HDR = setOf("sdr", "hdr10", "hdr10plus", "dolby_vision")
    private val V_TRANSFER = setOf("bt709", "bt2020", "smpte428")
    private val A_CODECS = setOf("aac", "aac-lc", "he-aac", "ec-3", "ac-3", "opus", "mp3", "flac", "truehd", "dts")
    private val CAD_MODES = setOf("fixed", "adaptive")
    private val DI_VALUES = setOf("off", "on", "auto")
    private val ASPECTS = setOf("fit", "fill", "center")

    private val ABSENT = Any()

    // ─────────────────────────────── entrada ───────────────────────────────

    /** Parsea el texto completo de una lista. No lanza: lo que no cuadra se registra y se ignora. */
    fun parse(text: String): ExtShimOttResult = parse(splitLines(text))

    /** Parsea las líneas de una lista (sin terminadores). No lanza. */
    fun parse(lines: List<String>): ExtShimOttResult {
        val issues = ArrayList<ExtShimOttIssue>()
        val entries = LinkedHashMap<String, ExtShimOtt>()
        val seenAt = HashMap<String, Int>()
        var tagCount = 0
        // Bloque de canal: se abre en #EXTINF: y se cierra con la URI (primera linea no comentario).
        var pendingChannel = false

        for (index in lines.indices) {
            val lineNo = index + 1
            val rawLine = lines[index]
            val trimmedStart = rawLine.trimStart()

            if (trimmedStart.isEmpty()) continue          // una linea vacia no cierra el bloque
            if (trimmedStart.startsWith("#EXTINF:")) {
                pendingChannel = true
                continue
            }
            if (!trimmedStart.startsWith("#")) {
                pendingChannel = false                    // URI: el bloque queda cerrado
                continue
            }
            if (!trimmedStart.uppercase(Locale.ROOT).startsWith(TAG_NAME)) continue

            tagCount++

            // Forma de la línea (paridad con el validador Node).
            if (trimmedStart.length != rawLine.length) {
                issues += err("E_TAG_MALFORMED", lineNo, "el tag tiene espacios iniciales; debe empezar en la columna 1")
                continue
            }
            if (!rawLine.startsWith(PREFIX)) {
                issues += err("E_TAG_MALFORMED", lineNo, "forma esperada \"$PREFIX{...}\" en una sola linea")
                continue
            }
            if (rawLine != rawLine.trimEnd()) {
                issues += warning("W_TAG_TRAILING_WS", lineNo, "espacios al final de la linea")
            }

            // Longitud (el contrato cuenta la línea COMPLETA, prefijo incluido).
            if (rawLine.length > MAX_LINE_CHARS) {
                issues += err("E_LINE_TOO_LONG", lineNo, "${rawLine.length} chars > techo duro $MAX_LINE_CHARS")
                continue
            }
            if (rawLine.length > WARN_LINE_CHARS) {
                issues += warning("W_LINE_NEAR_LIMIT", lineNo, "${rawLine.length} chars > presupuesto $WARN_LINE_CHARS (techo $MAX_LINE_CHARS)")
            }

            val payload = rawLine.substring(PREFIX.length).trimEnd()
            val entry = parsePayload(payload, lineNo, pendingChannel, issues) ?: continue

            val previous = seenAt[entry.id]
            if (previous != null) {
                // Contrato/encargo: id repetido -> se queda el PRIMERO y se registra el descarte.
                issues += warning("W_ID_DUP", lineNo, "id=\"${entry.id}\" ya definido en la linea $previous: se conserva el primero y se ignora este")
                continue
            }
            seenAt[entry.id] = lineNo
            entries[entry.id] = entry
        }

        return ExtShimOttResult(entries = entries, issues = issues, tagCount = tagCount)
    }

    // ─────────────────────────── escáner estricto ───────────────────────────

    /**
     * Guard de estrictez léxica sobre el payload. Existe porque `org.json` de Android **acepta**
     * cosas que el JSON estricto prohíbe (comas finales, comillas simples, comentarios), y el
     * contrato declara esas formas ERROR. Sin este paso, un tag malformado se aceptaría en silencio.
     *
     * Devuelve `null` si el payload es estrictamente aceptable; si no, `(code, detalle)`.
     */
    private fun scanStrict(payload: String): Pair<String, String>? {
        if (payload.isEmpty()) return "E_JSON_PARSE" to "payload vacío"
        val first = payload.firstOrNull { !it.isWhitespace() } ?: return "E_JSON_PARSE" to "payload vacío"
        if (first != '{') return "E_PAYLOAD_NOT_OBJECT" to "el payload debe ser un objeto JSON {...}"

        val stack = ArrayDeque<Char>()
        var inString = false
        var escaped = false
        var expectKey = false
        var i = 0
        while (i < payload.length) {
            val c = payload[i]
            if (inString) {
                when {
                    escaped -> escaped = false
                    c == '\\' -> escaped = true
                    c == '"' -> {
                        inString = false
                        if (stack.isNotEmpty() && stack.last() == '{' && expectKey) expectKey = false
                    }
                }
                if (c.code < 0x20) return "E_JSON_PARSE" to "caracter de control crudo 0x${c.code.toString(16)} dentro de string"
                i++
                continue
            }
            when {
                c.isWhitespace() -> { /* fuera de string, ignorable */ }
                c == '"' -> inString = true
                c == '{' -> {
                    if (expectKey) return "E_JSON_PARSE" to "objeto como clave: el JSON no lo permite"
                    stack.addLast(c)
                    if (stack.size > MAX_DEPTH) return "E_JSON_PARSE" to "anidamiento > $MAX_DEPTH (tope del parser)"
                    expectKey = true
                }
                c == '[' -> {
                    if (expectKey) return "E_JSON_PARSE" to "clave no entrecomillada"
                    stack.addLast(c)
                    if (stack.size > MAX_DEPTH) return "E_JSON_PARSE" to "anidamiento > $MAX_DEPTH (tope del parser)"
                    expectKey = false
                }
                c == '}' || c == ']' -> {
                    val want = if (c == '}') '{' else '['
                    if (stack.isEmpty() || stack.last() != want) return "E_JSON_PARSE" to "cierre '$c' desbalanceado"
                    stack.removeLast()
                    expectKey = false
                }
                c == ':' -> expectKey = false
                c == ',' -> {
                    if (stack.isNotEmpty() && stack.last() == '{') expectKey = true
                    var j = i + 1
                    while (j < payload.length && payload[j].isWhitespace()) j++
                    if (j < payload.length && (payload[j] == '}' || payload[j] == ']')) {
                        return "E_TRAILING_COMMA" to "coma final antes de '${payload[j]}' (el JSON estricto la rechaza)"
                    }
                }
                c == '\'' -> return "E_JSON_PARSE" to "comilla simple fuera de string (el JSON estricto exige comillas dobles)"
                c == '/' && i + 1 < payload.length && (payload[i + 1] == '/' || payload[i + 1] == '*') ->
                    return "E_JSON_PARSE" to "comentario JSON no permitido"
                c.code < 0x20 -> return "E_JSON_PARSE" to "caracter de control crudo 0x${c.code.toString(16)}"
                expectKey -> return "E_JSON_PARSE" to "clave no entrecomillada (carácter '$c')"
            }
            i++
        }
        if (inString) return "E_JSON_PARSE" to "string sin cerrar (payload truncado)"
        if (stack.isNotEmpty()) return "E_JSON_PARSE" to "payload truncado: falta '${if (stack.last() == '{') "}" else "]"}'"
        return null
    }

    // ──────────────────────── validación + extracción ────────────────────────

    private class Ctx(val issues: MutableList<ExtShimOttIssue>, val line: Int) {
        var fatal: Boolean = false
            private set

        fun err(code: String, detail: String) {
            fatal = true
            issues += ExtShimOttIssue(ExtShimOttIssue.Severity.ERROR, code, line, detail)
        }

        fun warn(code: String, detail: String) {
            issues += ExtShimOttIssue(ExtShimOttIssue.Severity.WARNING, code, line, detail)
        }

        fun note(code: String, detail: String) {
            issues += ExtShimOttIssue(ExtShimOttIssue.Severity.NOTE, code, line, detail)
        }
    }

    /** Devuelve el objeto tipado si el payload cumple el contrato; `null` si se rechaza. */
    private fun parsePayload(
        payload: String,
        line: Int,
        inChannelBlock: Boolean,
        issues: MutableList<ExtShimOttIssue>
    ): ExtShimOtt? {
        scanStrict(payload)?.let { (code, detail) ->
            issues += err(code, line, detail)
            return null
        }

        val obj = try {
            JSONObject(payload)
        } catch (e: JSONException) {
            issues += err("E_JSON_PARSE", line, "payload no es JSON: " + (e.message ?: "sin detalle"))
            return null
        }

        val c = Ctx(issues, line)
        if (!inChannelBlock) {
            c.note(
                "N_TAG_OUTSIDE",
                "el tag no esta dentro de un bloque #EXTINF...URI: el parser lo acepta, la POSICION la valida el validador Node"
            )
        }
        rejectUnknown(obj, ROOT_KEYS, "", c)

        // ── raíz ────────────────────────────────────────────────────────────
        val ver = constInt(obj, "ver", "ver", c, 1, required = true)
        val id = strField(obj, "id", "id", c, required = true, minLen = 1, maxLen = 64, pattern = ID_PATTERN)
        val tgt = strField(obj, "tgt", "tgt", c, required = true, minLen = 3, maxLen = 14, pattern = TGT_PATTERN)
        if (obj.length() < 3) {
            c.err("E_SCHEMA_MINPROPS", "(raiz): objeto con ${obj.length()} propiedades, el contrato exige 3 (ver, id, tgt)")
        }

        // ── v ───────────────────────────────────────────────────────────────
        val vObj = objField(obj, "v", "v", c, VIDEO_KEYS)
        val video = vObj?.let {
            ExtShimOttVideo(
                codec = strField(it, "c", "v.c", c, allowed = V_CODECS),
                profile = strField(it, "p", "v.p", c, allowed = V_PROFILES),
                hdr = strField(it, "hdr", "v.hdr", c, allowed = V_HDR),
                width = intField(it, "w", "v.w", c, min = 2, max = 7680),
                height = intField(it, "h", "v.h", c, min = 2, max = 4320),
                fps = numField(it, "f", "v.f", c, gt = 0.0, max = 240.0),
                gop = intField(it, "g", "v.g", c, min = 1, max = 2000),
                transfer = strField(it, "tf", "v.tf", c, allowed = V_TRANSFER)
            )
        }

        // ── a ───────────────────────────────────────────────────────────────
        val aObj = objField(obj, "a", "a", c, AUDIO_KEYS)
        val audio = aObj?.let {
            ExtShimOttAudio(
                codec = strField(it, "c", "a.c", c, allowed = A_CODECS),
                channels = intField(it, "ch", "a.ch", c, min = 1, max = 16),
                language = strField(it, "l", "a.l", c, pattern = LANG_PATTERN)
            )
        }

        // ── hdr (cabeceras) ─────────────────────────────────────────────────
        val hObj = objField(obj, "hdr", "hdr", c, HEADER_KEYS)
        val headers = hObj?.let {
            ExtShimOttHeaders(
                userAgent = strField(it, "ua", "hdr.ua", c, minLen = 1, maxLen = 512, pattern = UA_PATTERN),
                referer = strField(it, "rf", "hdr.rf", c, minLen = 8, maxLen = 512, pattern = REFERER_PATTERN)
            )
        }

        // ── flt ─────────────────────────────────────────────────────────────
        val filter = strField(obj, "flt", "flt", c, minLen = 1, maxLen = 1024, pattern = FILTER_PATTERN)

        // ── cad ─────────────────────────────────────────────────────────────
        val cadObj = objField(obj, "cad", "cad", c, CADENCE_KEYS)
        val cadence = cadObj?.let {
            ExtShimOttCadence(
                mode = strField(it, "mode", "cad.mode", c, allowed = CAD_MODES),
                fps = numField(it, "fps", "cad.fps", c, gt = 0.0, max = 240.0),
                segment = numField(it, "seg", "cad.seg", c, gt = 0.0, max = 30.0)
            )
        }

        // ── dev ─────────────────────────────────────────────────────────────
        val devObj = objField(obj, "dev", "dev", c, DEVICE_KEYS)
        val device = devObj?.let {
            ExtShimOttDevice(
                hdrConversionMode = intField(it, "hdr_c", "dev.hdr_c", c, allowed = setOf(0, 1, 2, 3)),
                matchContentFrameRate = intField(it, "mcr", "dev.mcr", c, allowed = setOf(0, 1, 2)),
                minimalPostProcessing = intField(it, "mmp", "dev.mmp", c, allowed = setOf(0, 1)),
                preferredWidth = intField(it, "res_w", "dev.res_w", c, min = 1, max = 7680),
                preferredHeight = intField(it, "res_h", "dev.res_h", c, min = 1, max = 4320),
                deinterlace = strField(it, "di", "dev.di", c, allowed = DI_VALUES)
            )
        }

        // ── ott / vlc / kod ─────────────────────────────────────────────────
        val ottObj = objField(obj, "ott", "ott", c, OTT_KEYS)
        val ott = ottObj?.let {
            ExtShimOttOtt(
                bufferMb = numField(it, "buf", "ott.buf", c, gt = 0.0, max = 512.0),
                hardwareDecoder = intField(it, "hw", "ott.hw", c, allowed = setOf(0, 1)),
                aspect = strField(it, "asp", "ott.asp", c, allowed = ASPECTS)
            )
        }
        val vlcObj = objField(obj, "vlc", "vlc", c, VLC_KEYS)
        val vlc = vlcObj?.let { ExtShimOttVlc(applyFilter = intField(it, "f", "vlc.f", c, allowed = setOf(0, 1))) }
        val kodObj = objField(obj, "kod", "kod", c, KODI_KEYS)
        val kod = kodObj?.let { ExtShimOttKodi(inputstreamAdaptive = intField(it, "isa", "kod.isa", c, allowed = setOf(0, 1))) }

        // `tgt` es obligatorio: sin él no hay lista de lectores y no se puede validar nada más.
        if (tgt == null || id == null || ver == null) return null
        if (c.fatal) return null

        val targets = LinkedHashSet<ExtShimOttTarget>()
        for (token in tgt.split('|')) {
            val t = ExtShimOttTarget.fromWire(token)
            if (t == null) {
                c.err("E_SCHEMA_ENUM", "tgt: \"$token\" fuera de ott|vlc|kod")
            } else if (!targets.add(t)) {
                c.err("E_TGT_DUP", "tgt repite targets: \"$tgt\"")
            }
        }
        if (c.fatal) return null

        val entry = ExtShimOtt(
            id = id, version = ver, line = line, inChannelBlock = inChannelBlock, targets = targets,
            video = video, audio = audio, headers = headers, filter = filter,
            cadence = cadence, device = device, ott = ott, vlc = vlc, kodi = kod
        )

        checkSemantics(entry, ottObj != null, vlcObj != null, kodObj != null, c)
        return if (c.fatal) null else entry
    }

    /**
     * Reglas semánticas del contrato (las mismas del validador Node). `ERROR` rechaza el payload;
     * `WARNING`/`NOTE` solo se registran.
     */
    private fun checkSemantics(
        e: ExtShimOtt,
        declaresOtt: Boolean,
        declaresVlc: Boolean,
        declaresKod: Boolean,
        c: Ctx
    ) {
        // ── coherencia cad.seg ⇔ v.g/v.f ────────────────────────────────────
        val gop = e.video?.gop?.toDouble()
        val fps = e.video?.fps?.takeIf { it > 0.0 }
        val seg = e.cadence?.segment?.takeIf { it > 0.0 }
        if (gop != null && gop > 0.0 && fps != null && seg != null) {
            val gopSeconds = gop / fps
            val k = seg / gopSeconds
            val kr = Math.round(k).toDouble()
            if (kr < 1.0) {
                c.err("E_GOP_COHERENCE", "cad.seg=${fmt(seg)}s es menor que un GOP (${fmt(gopSeconds)}s): el segmento partiria GOPs")
            } else if (Math.abs(k - kr) * gopSeconds > GOP_TOLERANCE_S) {
                c.err(
                    "E_GOP_COHERENCE",
                    "cad.seg=${fmt(seg)}s no es multiplo entero de GOP ${fmt(gopSeconds)}s " +
                        "(v.g=${gop.toLong()}, v.f=${fmt(fps)}); k=${fmt(k)}"
                )
            } else {
                c.note("N_GOP_OK", "cad.seg=${fmt(seg)}s = ${kr.toLong()} x GOP(${fmt(gopSeconds)}s)")
            }
        } else {
            val missing = ArrayList<String>(3)
            if (gop == null || gop <= 0.0) missing += "v.g"
            if (fps == null) missing += "v.f"
            if (seg == null) missing += "cad.seg"
            c.note("N_GOP_NOT_COMPUTED", "coherencia cad.seg<=>v.g/v.f NO COMPUTADA: falta ${missing.joinToString(", ")}")
        }

        // ── cadencia fija distinta del fps real ─────────────────────────────
        val cadFps = e.cadence?.fps
        if (e.cadence?.mode == "fixed" && cadFps != null && cadFps > 0.0 && fps != null &&
            Math.abs(cadFps - fps) > 1e-6
        ) {
            c.warn("W_CAD_FPS_MISMATCH", "cad.mode=fixed con cad.fps=${fmt(cadFps)} pero v.f=${fmt(fps)}: conversion de cadencia declarada")
        }

        // ── flt / vlc / ott ─────────────────────────────────────────────────
        val vlcOn = e.vlc?.applyFilter == 1
        if (e.reads(ExtShimOttTarget.VLC) && vlcOn && e.filter == null) {
            c.err("E_VLC_FLT_MISSING", "tgt incluye vlc y vlc.f=1 pero falta \"flt\": no hay cadena que aplicar")
        }
        if (e.filter != null && !(e.reads(ExtShimOttTarget.VLC) && vlcOn)) {
            c.warn("W_FLT_UNUSED", "hay \"flt\" pero ningun consumidor lo aplica (falta vlc.f=1 o \"vlc\" en tgt): cadena inerte")
        }
        if (e.ottIgnoresFilter()) {
            c.note("N_OTT_IGNORES_FLT", "tgt incluye ott y hay \"flt\": OTT NO debe tocar la cadena (flt es VPS/VLC)")
        }
        if (declaresOtt && !e.reads(ExtShimOttTarget.OTT)) c.warn("W_OBJ_NOT_TARGETED", "objeto \"ott\" declarado pero \"ott\" no esta en tgt: el shim no lo aplicara")
        if (declaresVlc && !e.reads(ExtShimOttTarget.VLC)) c.warn("W_OBJ_NOT_TARGETED", "objeto \"vlc\" declarado pero \"vlc\" no esta en tgt: el shim no lo aplicara")
        if (declaresKod && !e.reads(ExtShimOttTarget.KODI)) c.warn("W_OBJ_NOT_TARGETED", "objeto \"kod\" declarado pero \"kod\" no esta en tgt: el shim no lo aplicara")

        // ── trampas de cabecera (checklist EXTHTTP del repo) ────────────────
        // Nota honesta: el patron de `hdr.ua` ya prohibe CR/LF, asi que E_UA_CRLF es defensa en
        // profundidad (avisa si algun dia se relaja el patron); en la practica el rechazo lo produce
        // E_SCHEMA_PATTERN. %20 NO lo cubre el patron: lo caza esta comprobacion.
        val ua = e.headers?.userAgent
        if (ua != null) {
            if (ua.contains("%20")) c.err("E_UA_PCT20", "trampa 2: %20 en User-Agent (debe ir espacio literal)")
            if (ua.contains('\r') || ua.contains('\n')) c.err("E_UA_CRLF", "trampa 3: CR/LF en User-Agent (inyeccion de cabeceras)")
            if (ENGINE_FP.containsMatchIn(ua)) c.warn("W_UA_ENGINE_FP", "trampa 11: huella de motor en el User-Agent")
        }
        val rf = e.headers?.referer
        if (rf != null && OWN_VPS.containsMatchIn(rf)) {
            c.err("E_RF_VPS", "trampa 14: Referer apunta al VPS propio (un bloqueo del CDN mataria todos los canales)")
        }
    }

    // ─────────────────────────── helpers de campo ───────────────────────────

    private fun rawOf(o: JSONObject, key: String): Any? = if (o.has(key)) o.get(key) else ABSENT

    private fun typeName(v: Any?): String = when (v) {
        is String -> "string"
        is Boolean -> "boolean"
        is Int, is Long, is Short, is Byte -> "integer"
        is Double, is Float -> "number"
        is JSONObject -> "object"
        is JSONArray -> "array"
        else -> "desconocido"
    }

    private fun rejectUnknown(o: JSONObject, allowed: Set<String>, path: String, c: Ctx) {
        val it = o.keys()
        while (it.hasNext()) {
            val key = it.next().toString()
            if (key !in allowed) {
                c.err("E_SCHEMA_ADDITIONAL", (if (path.isEmpty()) "" else "$path.") + key + ": campo NO declarado en el contrato ver:1 (para extender se sube ver)")
            }
        }
    }

    private fun strField(
        o: JSONObject,
        key: String,
        path: String,
        c: Ctx,
        required: Boolean = false,
        minLen: Int? = null,
        maxLen: Int? = null,
        allowed: Set<String>? = null,
        pattern: Regex? = null
    ): String? {
        val raw = rawOf(o, key)
        if (raw === ABSENT) {
            if (required) c.err("E_SCHEMA_REQUIRED", "$path: campo obligatorio ausente")
            return null
        }
        if (raw == null || raw === JSONObject.NULL) {
            c.err("E_SCHEMA_TYPE", "$path: null no permitido (si el valor no se conoce, se OMITE el campo)")
            return null
        }
        if (raw !is String) {
            c.err("E_SCHEMA_TYPE", "$path: tipo esperado string, recibido ${typeName(raw)}")
            return null
        }
        if (minLen != null && raw.length < minLen) c.err("E_SCHEMA_LEN", "$path: longitud ${raw.length} < minLength $minLen")
        if (maxLen != null && raw.length > maxLen) c.err("E_SCHEMA_LEN", "$path: longitud ${raw.length} > maxLength $maxLen")
        if (allowed != null && raw !in allowed) c.err("E_SCHEMA_ENUM", "$path: \"$raw\" fuera de enum ${allowed.joinToString("|")}")
        if (pattern != null && !pattern.matches(raw)) c.err("E_SCHEMA_PATTERN", "$path: no casa con ${pattern.pattern}")
        return raw
    }

    private fun intField(
        o: JSONObject,
        key: String,
        path: String,
        c: Ctx,
        required: Boolean = false,
        min: Int? = null,
        max: Int? = null,
        allowed: Set<Int>? = null
    ): Int? {
        val n = numberOrNull(o, key, path, c, required, expected = "integer") ?: return null
        if (Math.rint(n) != n) {
            c.err("E_SCHEMA_TYPE", "$path: tipo esperado integer, recibido number (${fmt(n)})")
            return null
        }
        if (n < Int.MIN_VALUE.toDouble() || n > Int.MAX_VALUE.toDouble()) {
            c.err("E_SCHEMA_RANGE", "$path: ${fmt(n)} fuera del rango entero representable")
            return null
        }
        val v = n.toInt()
        if (min != null && v < min) c.err("E_SCHEMA_RANGE", "$path: $v < minimum $min")
        if (max != null && v > max) c.err("E_SCHEMA_RANGE", "$path: $v > maximum $max")
        if (allowed != null && v !in allowed) c.err("E_SCHEMA_ENUM", "$path: $v fuera de enum ${allowed.joinToString("|")}")
        return v
    }

    private fun numField(
        o: JSONObject,
        key: String,
        path: String,
        c: Ctx,
        required: Boolean = false,
        gt: Double? = null,
        max: Double? = null
    ): Double? {
        val n = numberOrNull(o, key, path, c, required) ?: return null
        if (gt != null && !(n > gt)) c.err("E_SCHEMA_RANGE", "$path: ${fmt(n)} no > exclusiveMinimum ${fmt(gt)}")
        if (max != null && n > max) c.err("E_SCHEMA_RANGE", "$path: ${fmt(n)} > maximum ${fmt(max)}")
        return n
    }

    /** Constante entera (`ver` = 1). Ausencia obligatoria = error; valor distinto = error de contrato. */
    private fun constInt(o: JSONObject, key: String, path: String, c: Ctx, expected: Int, required: Boolean): Int? {
        val v = intField(o, key, path, c, required = required) ?: return null
        if (v != expected) c.err("E_SCHEMA_CONST", "$path: esperado const $expected, recibido $v")
        return v
    }

    private fun numberOrNull(
        o: JSONObject,
        key: String,
        path: String,
        c: Ctx,
        required: Boolean,
        expected: String = "number"
    ): Double? {
        val raw = rawOf(o, key)
        if (raw === ABSENT) {
            if (required) c.err("E_SCHEMA_REQUIRED", "$path: campo obligatorio ausente")
            return null
        }
        if (raw == null || raw === JSONObject.NULL) {
            c.err("E_SCHEMA_TYPE", "$path: null no permitido (si el valor no se conoce, se OMITE el campo)")
            return null
        }
        return when (raw) {
            is Int -> raw.toDouble()
            is Long -> raw.toDouble()
            is Short -> raw.toDouble()
            is Byte -> raw.toDouble()
            is Double -> raw
            is Float -> raw.toDouble()
            // [FIX 2026-11-14 · medido] org.json —el de Android y el 20240303— parsea TODO
            // decimal con fraccion a java.math.BigDecimal (JSONObject.stringToValue:
            // "if (string contains '.' or 'e') return new BigDecimal(val)").
            // Sin esta rama, `"seg":4.5` o `"fps":59.94` —LEGALES: el contrato los declara
            // `type: number`, y 29.97/59.94 son cadencias reales de broadcast— entraban por
            // `else` como "recibido desconocido" y, por la politica de rechazo del contrato
            // (additionalProperties=false, payload entero fuera), el canal se quedaba SIN
            // ajustes. Lo cazo el selfCheck del propio parser: caso "GOP incoherente
            // (bad fixture c03)" daba 24/25 con `E_SCHEMA_TYPE · cad.seg` en vez de los
            // codigos semanticos esperados. `is Number` cubre BigDecimal, BigInteger y
            // cualquier futura representacion numerica del parser JSON.
            is Number -> raw.toDouble()
            else -> {
                c.err("E_SCHEMA_TYPE", "$path: tipo esperado $expected, recibido ${typeName(raw)}")
                null
            }
        }
    }

    /** Objeto y, si existe, `additionalProperties=false` + `minProperties:1`. */
    private fun objField(o: JSONObject, key: String, path: String, c: Ctx, keys: Set<String>): JSONObject? {
        val raw = rawOf(o, key)
        if (raw === ABSENT) return null
        if (raw == null || raw === JSONObject.NULL) {
            c.err("E_SCHEMA_TYPE", "$path: null no permitido (si el valor no se conoce, se OMITE el objeto)")
            return null
        }
        if (raw !is JSONObject) {
            c.err("E_SCHEMA_TYPE", "$path: tipo esperado object, recibido ${typeName(raw)}")
            return null
        }
        rejectUnknown(raw, keys, path, c)
        if (raw.length() == 0) c.err("E_SCHEMA_MINPROPS", "$path: objeto vacio: minProperties 1 (si no se conoce nada, se OMITE el objeto)")
        return raw
    }

    // ─────────────────────────────── utilidades ───────────────────────────────

    private fun splitLines(text: String): List<String> {
        val body = if (text.startsWith("\uFEFF")) text.substring(1) else text
        val out = ArrayList<String>(64)
        var start = 0
        var i = 0
        while (i < body.length) {
            val ch = body[i]
            if (ch == '\n' || ch == '\r') {
                out.add(body.substring(start, i))
                if (ch == '\r' && i + 1 < body.length && body[i + 1] == '\n') i++
                start = i + 1
            }
            i++
        }
        if (start < body.length) out.add(body.substring(start))
        return out
    }

    private fun err(code: String, line: Int, detail: String) =
        ExtShimOttIssue(ExtShimOttIssue.Severity.ERROR, code, line, detail)

    private fun warning(code: String, line: Int, detail: String) =
        ExtShimOttIssue(ExtShimOttIssue.Severity.WARNING, code, line, detail)

    private fun fmt(v: Double): String = String.format(Locale.US, "%.4f", v).trimEnd('0').trimEnd('.')

    // ──────────────────────────── self-check puro ────────────────────────────

    private class Case(
        val name: String,
        val list: String,
        val wantEntries: Int,
        val wantCodes: List<String> = emptyList(),
        val minErrors: Int = 0,
        val verify: ((ExtShimOttResult) -> String?)? = null
    )

    private val FIXTURE_OK: String = """
        #EXTM3U
        #EXTINF:-1 tvg-id="es_c01" tvg-name="OK 4K HDR10+" group-title="FIXTURE",OK 4K HDR10+
        #EXTVLCOPT:network-caching=4000
        #EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,ec-3"
        #EXTSHIMOTT:{"ver":1,"id":"es_c01","v":{"c":"hevc","p":"main10","hdr":"hdr10plus","w":3840,"h":2160,"f":50,"g":50,"tf":"bt2020"},"a":{"c":"ec-3","ch":6,"l":"es"},"hdr":{"ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)","rf":"https://www.google.com/"},"flt":"nlmeans=s=1.0:p=7:r=15,unsharp=5:5:0.8","cad":{"mode":"fixed","fps":50,"seg":4},"dev":{"hdr_c":1,"mcr":2,"mmp":0,"res_w":3840,"res_h":2160,"di":"off"},"ott":{"buf":8,"hw":1,"asp":"fit"},"vlc":{"f":1},"kod":{"isa":1},"tgt":"ott|vlc|kod"}
        https://fixture.invalid/provider/es_c01/master.m3u8
        #EXTINF:-1 tvg-id="es_c02" tvg-name="OK AV1 SDR" group-title="FIXTURE",OK AV1 SDR
        #EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="av01.0.08M.08"
        #EXTSHIMOTT:{"ver":1,"id":"es_c02","v":{"c":"av1","p":"main8","hdr":"sdr","w":1920,"h":1080,"f":25,"g":50,"tf":"bt709"},"a":{"c":"aac-lc","ch":2,"l":"es"},"cad":{"mode":"adaptive","fps":25,"seg":6},"tgt":"ott"}
        https://fixture.invalid/provider/es_c02/master.m3u8
        #EXTINF:-1 tvg-id="es_c03" tvg-name="OK HEVC 60" group-title="FIXTURE",OK HEVC 60
        #EXT-X-STREAM-INF:BANDWIDTH=24000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,ac-3"
        #EXTSHIMOTT:{"ver":1,"id":"es_c03","v":{"c":"hevc","p":"main10","hdr":"hdr10","w":3840,"h":2160,"f":60,"g":120,"tf":"bt709"},"a":{"c":"ac-3","ch":6,"l":"es"},"hdr":{"ua":"VLC/3.0.20 LibVLC/3.0.20","rf":"https://www.bing.com/"},"flt":"hqdn3d=1.5:1.5:6:6,zscale=t=709:m=709:r=limited","cad":{"mode":"fixed","fps":60,"seg":6},"ott":{"buf":12,"hw":0},"vlc":{"f":1},"tgt":"vlc|kod"}
        https://fixture.invalid/provider/es_c03/master.m3u8
    """.trimIndent() + "\n"

    /**
     * Autocomprobación PURA (sin Android, sin I/O): 3 canales canónicos y los casos de fallo del
     * contrato. Devuelve un informe PASS/FAIL. Es la alternativa verificable a `gradlew test`
     * (el módulo `:app` no tiene `src/test` ni dependencias de test).
     */
    fun selfCheck(): String {
        val out = StringBuilder("EXTSHIMOTT selfcheck · contrato ape.extshimott.v1\n")
        var pass = 0
        var fail = 0

        for (case in cases()) {
            val result = try {
                parse(case.list)
            } catch (t: Throwable) {
                // El parser no debe lanzar NUNCA; si esto ocurre es un fallo del parser.
                out.append("[FAIL] ").append(case.name).append(": lanzo ").append(t.javaClass.simpleName)
                    .append(": ").append(t.message).append('\n')
                fail++
                continue
            }

            val problems = ArrayList<String>(3)
            if (result.entries.size != case.wantEntries) {
                problems += "entries=${result.entries.size} (esperado ${case.wantEntries})"
            }
            val codes = result.issues.map { it.code }.toSet()
            val missing = case.wantCodes.filterNot { it in codes }
            if (missing.isNotEmpty()) problems += "faltan codigos $missing (vistos ${codes.sorted()})"
            if (result.errors.size < case.minErrors) {
                problems += "errors=${result.errors.size} (esperado >= ${case.minErrors})"
            }
            case.verify?.invoke(result)?.let { problems += it }

            if (problems.isEmpty()) {
                pass++
                out.append("[PASS] ").append(case.name)
                    .append(" · entries=").append(result.entries.size)
                    .append(" errors=").append(result.errors.size)
                    .append(" warnings=").append(result.warnings.size).append('\n')
            } else {
                fail++
                out.append("[FAIL] ").append(case.name).append(": ").append(problems.joinToString("; ")).append('\n')
            }
        }

        out.append("RESULT: PASS ").append(pass).append(" / FAIL ").append(fail).append('\n')
        return out.toString()
    }

    private fun cases(): List<Case> = listOf(
        Case("fixture 3 canales -> 3 entradas", FIXTURE_OK, 3, verify = { r ->
            if (!r.entries.containsKey("es_c01") || !r.entries.containsKey("es_c02") || !r.entries.containsKey("es_c03")) {
                "faltan ids esperados (vistos ${r.entries.keys})"
            } else if (r.entries["es_c01"]?.device?.hdrConversionMode != 1) {
                "es_c01.dev.hdr_c != 1"
            } else if (r.entries["es_c01"]?.video?.codec != "hevc") {
                "es_c01.v.c != hevc"
            } else if (r.entries["es_c01"]?.reads(ExtShimOttTarget.OTT) != true) {
                "es_c01 no declara target ott"
            } else if (r.entries["es_c01"]?.inChannelBlock != true) {
                "es_c01 deberia estar dentro de un bloque de canal"
            } else if (!r.entries["es_c03"]!!.vlcAppliesFilter()) {
                "es_c03 deberia aplicar flt en VLC"
            } else {
                null
            }
        }),
        Case("comillas escapadas se preservan", oneChannel(
            """{"ver":1,"id":"q","hdr":{"ua":"Mozilla/5.0 \"X11; Linux x86_64\" Build/1.0"},"tgt":"ott"}"""
        ), 1, verify = { r ->
            val ua = r.entries["q"]?.headers?.userAgent
            if (ua == "Mozilla/5.0 \"X11; Linux x86_64\" Build/1.0") null else "ua mal decodificado: $ua"
        }),
        Case("vacio / sin payload", "#EXTM3U\n#EXTSHIMOTT:\n", 0, listOf("E_JSON_PARSE"), 1),
        Case("payload no es objeto", "#EXTM3U\n#EXTSHIMOTT:[1,2]\n", 0, listOf("E_PAYLOAD_NOT_OBJECT"), 1),
        Case("coma final (org.json la aceptaria)", oneChannel(
            """{"ver":1,"id":"c","tgt":"ott",}"""
        ), 0, listOf("E_TRAILING_COMMA"), 1),
        Case("comilla simple (org.json la aceptaria)", oneChannel(
            """{'ver':1,'id':'c','tgt':'ott'}"""
        ), 0, listOf("E_JSON_PARSE"), 1),
        Case("ver ausente", oneChannel("""{"id":"c","tgt":"ott"}"""), 0, listOf("E_SCHEMA_REQUIRED"), 1),
        Case("ver distinto de 1", oneChannel("""{"ver":2,"id":"c","tgt":"ott"}"""), 0, listOf("E_SCHEMA_CONST"), 1),
        Case("campo desconocido", oneChannel("""{"ver":1,"id":"c","tgt":"ott","extra":1}"""), 0, listOf("E_SCHEMA_ADDITIONAL"), 1),
        Case("tgt con valor desconocido", oneChannel("""{"ver":1,"id":"c","tgt":"ott|web"}"""), 0, listOf("E_SCHEMA_PATTERN"), 1),
        Case("tgt duplicado", oneChannel("""{"ver":1,"id":"c","tgt":"ott|ott"}"""), 0, listOf("E_TGT_DUP"), 1),
        Case("tipo incorrecto v.w string", oneChannel(
            """{"ver":1,"id":"c","v":{"w":"3840"},"tgt":"ott"}"""
        ), 0, listOf("E_SCHEMA_TYPE"), 1),
        Case("rango fuera v.w", oneChannel("""{"ver":1,"id":"c","v":{"w":9999},"tgt":"ott"}"""), 0, listOf("E_SCHEMA_RANGE"), 1),
        Case("id invalido", oneChannel("""{"ver":1,"id":"-bad","tgt":"ott"}"""), 0, listOf("E_SCHEMA_PATTERN"), 1),
        Case("espacios iniciales", " #EXTSHIMOTT:{\"ver\":1,\"id\":\"c\",\"tgt\":\"ott\"}\n", 0, listOf("E_TAG_MALFORMED"), 1),
        Case("linea > 4096", "#EXTM3U\n#EXTSHIMOTT:{\"ver\":1,\"id\":\"c\",\"tgt\":\"ott\",\"flt\":\"" +
            "a".repeat(4200) + "\"}\n", 0, listOf("E_LINE_TOO_LONG"), 1),
        Case("anidamiento > tope", "#EXTM3U\n#EXTSHIMOTT:{\"ver\":1,\"id\":\"c\",\"tgt\":\"ott\",\"flt\":" +
            "[".repeat(40) + "]".repeat(40) + "}\n", 0, listOf("E_JSON_PARSE"), 1),
        Case("GOP incoherente (bad fixture c03)", oneChannel(
            """{"ver":1,"id":"c","v":{"c":"hevc","p":"main10","hdr":"hdr10","w":3840,"h":2160,"f":50,"g":50,"tf":"bt2020"},"cad":{"mode":"fixed","fps":60,"seg":2.5},"vlc":{"f":1},"tgt":"vlc"}"""
        ), 0, listOf("E_GOP_COHERENCE", "W_CAD_FPS_MISMATCH", "E_VLC_FLT_MISSING"), 1),
        Case("UA con %20", oneChannel(
            """{"ver":1,"id":"c","hdr":{"ua":"Mozilla/5.0%20(X11)"},"tgt":"ott"}"""
        ), 0, listOf("E_UA_PCT20"), 1),
        Case("UA con CRLF (lo corta el patron del contrato)",
            "#EXTM3U\n#EXTSHIMOTT:{\"ver\":1,\"id\":\"c\",\"hdr\":{\"ua\":\"A\\r\\nB\"},\"tgt\":\"ott\"}\n",
            0, listOf("E_SCHEMA_PATTERN"), 1),
        Case("Referer al VPS propio", oneChannel(
            """{"ver":1,"id":"c","hdr":{"rf":"https://iptv-ape.duckdns.org/"},"tgt":"ott"}"""
        ), 0, listOf("E_RF_VPS"), 1),
        Case("vlc.f=1 sin flt", oneChannel("""{"ver":1,"id":"c","vlc":{"f":1},"tgt":"vlc"}"""),
            0, listOf("E_VLC_FLT_MISSING"), 1),
        Case("objeto vacio", oneChannel("""{"ver":1,"id":"c","v":{},"tgt":"ott"}"""), 0, listOf("E_SCHEMA_MINPROPS"), 1),
        Case("id repetido conserva el primero", """
            #EXTM3U
            #EXTINF:-1 tvg-id="a",A
            #EXTSHIMOTT:{"ver":1,"id":"dup","tgt":"ott"}
            https://fixture.invalid/a.m3u8
            #EXTINF:-1 tvg-id="b",B
            #EXTSHIMOTT:{"ver":1,"id":"dup","tgt":"ott"}
            https://fixture.invalid/b.m3u8
        """.trimIndent() + "\n", 1, listOf("W_ID_DUP"), verify = { r ->
            val first = r.entries["dup"]
            if (first == null) "no se conservo ninguna entrada" else if (first.line != 3) "se conservo la linea ${first.line}, esperaba la 3" else null
        }),
        Case("tag fuera de canal se parsea igual", """
            #EXTM3U
            #EXTSHIMOTT:{"ver":1,"id":"suelto","tgt":"ott"}
        """.trimIndent() + "\n", 1, listOf("N_TAG_OUTSIDE"), verify = { r ->
            val e = r.entries["suelto"]
            when {
                e == null -> "no se acepto el tag huerfano"
                e.line != 2 -> "linea incorrecta: ${e.line}"
                e.inChannelBlock -> "inChannelBlock deberia ser false"
                else -> null
            }
        })
    )

    private fun oneChannel(payload: String): String =
        "#EXTM3U\n#EXTINF:-1 tvg-id=\"c\",C\n#EXTSHIMOTT:" + payload + "\nhttps://fixture.invalid/c.m3u8\n"
}
