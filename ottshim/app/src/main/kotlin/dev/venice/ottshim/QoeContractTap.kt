package dev.venice.ottshim

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/**
 * QoeContractTap — LECTOR del tag `#EXT-X-APE-QOE-CONTRACT:{json}` dentro del shim.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE TAG Y NO UNA EXTENSIÓN DE `#EXTSHIMOTT` (medido, no opinion)
 *
 *  · Los dos emisores REALES de este árbol ya emiten ESTE tag, y su cabecera dice
 *    explícitamente por qué NO va dentro de `#EXTSHIMOTT`:
 *      - `tools/ape_qoe_contract_inject.js:4-6`  → "el contrato de QoE vive en un tag
 *        propio, NO en un #EXTSHIMOTT nuevo (ese ya tiene esquema ape.extshimott.v1)".
 *      - `frontend/js/ape-v9/rea-export-finalizer.js:396-399` → "mezclar otro payload
 *        lo rompe".
 *    La medición confirma esa tesis: `ExtShimOttParser` rechaza el payload ENTERO por
 *    `additionalProperties=false` (ROOT_KEYS en ExtShimOtt.kt:316, OTT_KEYS en :322) si
 *    se le inyectan `net`/`depth`/`pb`/`par`/`rt`/`gate`/`truth`/`ott.hc`.
 *  · Consecuencia: extender `#EXTSHIMOTT` exigiría subir el esquema a `ver:2`, tocar
 *    parser + validador Node + fixtures. Este lector consigue lo mismo con CERO cambios
 *    de esquema y CERO cambios en `ShimOttTap`/`ExtShimOttParser`: el parseo actual de
 *    `#EXTSHIMOTT` queda byte-idéntico (verificado en [selfCheck], que corre los dos
 *    lectores sobre el MISMO texto).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ HACE
 *  1. Escanea el texto de la playlist y extrae las líneas del tag (forma exacta:
 *     columna 1, prefijo `#EXT-X-APE-QOE-CONTRACT:`, techo 4096 chars).
 *  2. Parsea el payload con un escáner ESTRICTO propio (comillas dobles, sin comas
 *     finales, sin comentarios, sin caracteres de control, profundidad acotada). Se
 *     implementa aquí porque el shim NO puede depender del módulo `:app` (la dirección
 *     de dependencia es `app → :shim`, `app/build.gradle.kts:111-113`): duplicar ~50
 *     líneas de estrictez es preferible a invertir la dependencia o a aceptar en
 *     silencio lo que `org.json` tolera.
 *  3. Traduce cada knob a su consumidor REAL en el shim, o declara por qué NO lo hay.
 *  4. Publica un recibo por knob con estado, valor aplicado y motivo. **Nunca inventa
 *     `applied`**: un knob sin consumidor sale con `applied=0` y su razón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TABLA DE HONESTIDAD (el corazón de la clase)
 *
 *  knob        consumidor real en el shim                      estado
 *  ----------  ----------------------------------------------  ---------------------
 *  net.depth   `LoopbackProxy.afterSegment` → prefetch de las   EXECUTED_INFERRED
 *              N siguientes (hoy fijo en 1, `:414`)            (unidad = segmentos;
 *                                                               ver nota de unidad)
 *  net.pb      `LoopbackProxy.recordPlaylist` → prefetch de    EXECUTED_INFERRED
 *              los N primeros segmentos al cargar              (idem)
 *  net.fm      ninguno                                          UNMAPPED
 *  net.probe   ninguno (la sonda del shim es medición real)     UNMAPPED
 *  net.par     paralelismo estructural 1 (un solo hilo fetch)   UNMAPPED
 *  net.rt      OkHttp es inmutable tras el constructor          DECLARED
 *  net.gate    el shim sólo tiene techo, no suelo de bitrate    UNMAPPED
 *  ott.hw/hc/  no son settings del shim: los escribe la APK     DECLARED
 *  mcr/mmp
 *  cad.m/v     el shim no controla la cadencia del player       DECLARED
 *
 *  NOTA DE UNIDAD (truth-guard): los emisores NO documentan la unidad de `depth`/`pb`.
 *  El inyector polimórfico sólo da leyenda para `par`/`rt` (`t=descargas paralelas
 *  utiles`) y para `fmax`/`min_bw` (`tools/ape_qoe_inject_polymorphic.js:30-32`), y
 *  ni siquiera coincide el nombre (`fm` vs `fmax`, `gate` vs `min_bw`). Por eso
 *  `depth`/`pb` se aplican como CONTEO DE SEGMENTOS **declarándolo como inferencia**
 *  (`Confidence.INFERIDO`) y no como hecho. Si el emisor cambia la unidad, esta tabla
 *  es el único sitio que hay que corregir.
 *
 *  DIRECCIÓN SEGURA: subir el prefetch sólo puede añadir buffer por delante (mejora de
 *  continuidad). Bajar por debajo de 1 no existe, y `pb=0` reproduce el comportamiento
 *  de hoy. Ningún knob de este tag puede degradar la señal (Ley Anti-Degradación: no se
 *  toca resolución, códec, fps ni bitrate — sólo cuánto se precarga).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FAIL-HONEST / NO BLOQUEANTE
 *  · Regla multi-canal: un cuerpo con MÁS de un tag (catálogo) NO aplica nada — el
 *    presupuesto de precarga es del canal que se está sirviendo, y aplicar el último
 *    sería aplicar los knobs de otro canal. Se cuenta y se sigue.
 *  · Payload inválido, `v` distinto de 1, o `ch` ausente → se cuenta como rechazado y
 *    no se toca ningún knob.
 *  · Nada de esto puede cortar un segmento: no hay I/O, no hay hilo nuevo, y el único
 *    efecto es asignar dos `@Volatile Int` de [AbrPolicy].
 *
 * LÍMITE HONESTO: el camino de streaming (`LoopbackProxy.streamThrough`, catálogo >2 MB
 * o tamaño desconocido) NO materializa el texto, así que este lector no ve esos cuerpos
 * y no finge haberlos leído.
 */
object QoeContractTap {

    /** Nombre del tag, sin los dos puntos (detección tolerante a mayúsculas). */
    const val TAG_NAME = "#EXT-X-APE-QOE-CONTRACT"

    /** Prefijo exacto: `#EXT-X-APE-QOE-CONTRACT:{json}` en UNA línea. */
    const val PREFIX = "#EXT-X-APE-QOE-CONTRACT:"

    /** Techo duro de la línea COMPLETA (el mismo que el resto de tags APE por canal). */
    const val MAX_LINE_CHARS = 4096

    /** Cortafuegos: una lista no puede traer tags sin fin. */
    const val MAX_TAGS_PER_PLAYLIST = 4096

    /** Profundidad de anidamiento aceptada por el escáner estricto. */
    private const val MAX_JSON_DEPTH = 16

    /** Versión del payload que este lector entiende (`v`). */
    const val CONTRACT_VERSION = 1

    /** Rango propio de `net.depth` (segmentos a precargar por delante). */
    const val PREFETCH_MIN = 1
    const val PREFETCH_MAX = 8

    /** Rango propio de `net.pb` (segmentos a precargar al cargar la lista). `0` = hoy. */
    const val PREBUFFER_MIN = 0
    const val PREBUFFER_MAX = 8

    private val TVG_ID = Regex("tvg-id=\"([^\"]+)\"")

    /** Estados posibles de un knob. Sólo `EXECUTED*` significa que se escribió algo. */
    enum class Status {
        /** Se escribió y se releyó el valor, con semántica MEDIDA. */
        EXECUTED,
        /** Se escribió y se releyó, pero la semántica del knob es INFERIDA (unidad no documentada). */
        EXECUTED_INFERRED,
        /** El shim lo entiende pero NO lo aplica aquí: lo aplica otra capa (la APK). */
        DECLARED,
        /** No hay consumidor y no se inventa uno: el valor se descarta con motivo. */
        UNMAPPED,
        /** El payload no se aceptó: no se tocó nada. */
        REJECTED
    }

    /** Procedencia del mapeo, declarada siempre (no se asciende una inferencia a hecho). */
    enum class Confidence { MEDIDO, INFERIDO, DESCONOCIDO }

    /** Un knob con su recibo. `applied` es 0/1 y JAMÁS se pone a 1 sin escritura+relectura. */
    data class Knob(
        val name: String,
        val requested: String,
        val status: Status,
        val applied: Int,
        val appliedValue: String,
        val confidence: Confidence,
        val reason: String
    )

    /** Decisión tomada sobre un payload aceptado. */
    data class Decision(
        val ch: String?,
        val version: Int,
        val profile: String?,
        val truth: String?,
        val line: Int,
        val inChannelBlock: Boolean,
        val knobs: List<Knob>,
        val notes: List<String>
    ) {
        val executed: Int get() = knobs.count { it.applied == 1 }
        val declared: Int get() = knobs.count { it.status == Status.DECLARED }
        val unmapped: Int get() = knobs.count { it.status == Status.UNMAPPED }

        /** Recibo de una línea para logcat y para `/health`. */
        fun receipt(): String = buildString {
            append("ch=").append(ch ?: "?")
            profile?.let { append(" p=").append(it) }
            append(" ejecutados=").append(executed)
            append(" declarados=").append(declared)
            append(" sinMapeo=").append(unmapped)
            for (k in knobs) {
                append(" · ").append(k.name).append('=').append(k.requested)
                append(':').append(k.status.name)
                if (k.applied == 1) append("→").append(k.appliedValue)
            }
            if (truth == null) append(" · truth=ausente")
            else append(" · truth=").append(truth)
        }
    }

    /** Una ocurrencia del tag en el texto. El payload NO se interpreta aquí. */
    data class TagLine(
        val payload: String,
        val channelId: String?,
        val inChannelBlock: Boolean,
        val line: Int
    )

    /** Resultado del escaneo. */
    data class Extraction(val tags: List<TagLine>, val malformed: Int)

    /** Payload aceptado (con su JSON crudo) o el motivo exacto del rechazo. */
    data class ParsedTag(val payload: JSONObject?, val error: String?)

    /** Foto para diagnóstico y para `/health`. */
    data class Snapshot(
        val source: String,
        val tags: Int,
        val malformed: Int,
        val accepted: Int,
        val executed: Int,
        val declared: Int,
        val unmapped: Int,
        val ch: String,
        val receipt: String,
        val reason: String,
        val knobs: List<Knob>,
        val at: Long
    )

    private val totalTags = AtomicLong()
    private val totalAccepted = AtomicLong()
    private val totalRejected = AtomicLong()

    @Volatile private var lastSnapshot = Snapshot("", 0, 0, 0, 0, 0, 0, "", "", "sin ejecución", emptyList(), 0L)

    /** Última decisión aceptada (la APK la usa en la tarea de aplicación de settings). */
    @Volatile private var lastDecision: Decision? = null

    fun snapshot(): Snapshot = lastSnapshot

    fun decision(): Decision? = lastDecision

    fun totals(): String = "tags=${totalTags.get()} aceptados=${totalAccepted.get()} " +
        "rechazados=${totalRejected.get()} knobs_ejecutados=${lastSnapshot.executed}"

    /**
     * Extrae las líneas del tag de un texto. Puro y sin efecto: no aplica nada.
     * La forma se valida con las mismas reglas que el resto de tags APE por canal
     * (columna 1, prefijo exacto, techo de 4096).
     */
    fun scan(text: String): Extraction {
        val tags = ArrayList<TagLine>()
        var malformed = 0
        var pendingChannel = false
        var channelId: String? = null
        var index = 0
        for (raw in text.lineSequence()) {
            index++
            val trimmed = raw.trimStart()
            if (trimmed.isEmpty()) continue
            if (trimmed.startsWith("#EXTINF:")) {
                pendingChannel = true
                channelId = TVG_ID.find(raw)?.groupValues?.get(1)
                continue
            }
            if (!trimmed.startsWith("#")) {
                pendingChannel = false                       // URI: el bloque queda cerrado
                continue
            }
            if (!trimmed.uppercase(Locale.ROOT).startsWith(TAG_NAME)) continue
            if (tags.size >= MAX_TAGS_PER_PLAYLIST) break
            when {
                trimmed.length != raw.length -> malformed++   // espacios iniciales: forma inválida
                !raw.startsWith(PREFIX) -> malformed++        // sin `:`
                raw.length > MAX_LINE_CHARS -> malformed++    // techo duro
                else -> {
                    val payload = raw.substring(PREFIX.length).trimEnd()
                    if (payload.isEmpty()) malformed++ else tags.add(TagLine(payload, channelId, pendingChannel, index))
                }
            }
        }
        return Extraction(tags, malformed)
    }

    // ─────────────────────────── escáner estricto ───────────────────────────

    /**
     * Estrictez léxica mínima sobre el payload. Existe porque `org.json` **acepta** lo
     * que el JSON estricto prohíbe (comas finales, comillas simples, comentarios) y aquí
     * un payload basura no debe convertirse en knobs.
     *
     * Devuelve `null` si el payload es aceptable; si no, el motivo.
     */
    private fun strictIssue(payload: String): String? {
        if (payload.isEmpty()) return "payload vacío"
        val first = payload.firstOrNull { !it.isWhitespace() } ?: return "payload vacío"
        if (first != '{') return "el payload debe ser un objeto JSON {...}"

        val stack = java.util.ArrayDeque<Char>()
        var inString = false
        var escaped = false
        var i = 0
        while (i < payload.length) {
            val c = payload[i]
            if (inString) {
                when {
                    escaped -> escaped = false
                    c == '\\' -> escaped = true
                    c == '"' -> inString = false
                }
                if (c.code < 0x20) return "carácter de control crudo 0x${c.code.toString(16)} dentro de string"
                i++
                continue
            }
            when {
                c.isWhitespace() -> { /* fuera de string, ignorable */ }
                c == '"' -> inString = true
                c == '{' || c == '[' -> {
                    stack.addLast(c)
                    if (stack.size > MAX_JSON_DEPTH) return "anidamiento > $MAX_JSON_DEPTH"
                }
                c == '}' || c == ']' -> {
                    val want = if (c == '}') '{' else '['
                    if (stack.isEmpty() || stack.peekLast() != want) return "cierre '$c' desbalanceado"
                    stack.removeLast()
                }
                c == ',' -> {
                    var j = i + 1
                    while (j < payload.length && payload[j].isWhitespace()) j++
                    if (j < payload.length && (payload[j] == '}' || payload[j] == ']')) {
                        return "coma final antes de '${payload[j]}' (el JSON estricto la rechaza)"
                    }
                }
                c == '\'' -> return "comilla simple fuera de string"
                c == '/' && i + 1 < payload.length && (payload[i + 1] == '/' || payload[i + 1] == '*') ->
                    return "comentario JSON no permitido"
                c.code < 0x20 -> return "carácter de control crudo 0x${c.code.toString(16)}"
            }
            i++
        }
        if (inString) return "string sin cerrar (payload truncado)"
        if (stack.isNotEmpty()) return "payload truncado: falta '${if (stack.last() == '{') "}" else "]"}'"
        return null
    }

    /** Parsea un payload. No lanza: devuelve el objeto o el motivo del rechazo. */
    fun parse(payload: String, line: Int = 0): ParsedTag {
        strictIssue(payload)?.let { return ParsedTag(null, it) }
        val obj = try {
            JSONObject(payload)
        } catch (t: Throwable) {
            return ParsedTag(null, "no es JSON: ${t.message ?: t.javaClass.simpleName}")
        }
        val v = numOrNull(obj, "v")
        if (v == null) return ParsedTag(null, "falta \"v\" (versión del contrato)")
        if (v.toInt() != CONTRACT_VERSION) return ParsedTag(null, "\"v\"=${v.toInt()} no soportada (este lector: $CONTRACT_VERSION)")
        val ch = strOrNull(obj, "ch")
        if (ch.isNullOrBlank()) return ParsedTag(null, "falta \"ch\" (el emisor medido siempre lo emite)")
        return ParsedTag(obj, null)
    }

    // ───────────────────────────── decisión ─────────────────────────────

    /**
     * Traduce el payload aceptado a knobs con su recibo y APLICA los que tienen
     * consumidor real. Puro respecto de la red: sólo asigna campos de [AbrPolicy].
     */
    fun decide(obj: JSONObject, line: Int, inChannelBlock: Boolean, policy: AbrPolicy?): Decision {
        val knobs = ArrayList<Knob>(8)
        val notes = ArrayList<String>(3)
        val net = obj.optJSONObject("net")
        val ott = obj.optJSONObject("ott")
        val cad = obj.optJSONObject("cad")

        // ── net.depth → prefetch por delante ────────────────────────────────
        val depth = numOrNull(net, "depth")
        if (depth != null) {
            knobs.add(
                applyBounded(
                    name = "net.depth",
                    requested = depth,
                    min = PREFETCH_MIN,
                    max = PREFETCH_MAX,
                    write = { c -> if (policy != null) policy.prefetchDepth = c },
                    read = { policy?.prefetchDepth ?: 0 },
                    semantics = "prefetch de las N siguientes a la servida (LoopbackProxy.afterSegment)"
                )
            )
        }

        // ── net.pb → prefetch al cargar la lista ────────────────────────────
        val pb = numOrNull(net, "pb")
        if (pb != null) {
            knobs.add(
                applyBounded(
                    name = "net.pb",
                    requested = pb,
                    min = PREBUFFER_MIN,
                    max = PREBUFFER_MAX,
                    write = { c -> if (policy != null) policy.prebufferSegments = c },
                    read = { policy?.prebufferSegments ?: -1 },
                    semantics = "prefetch de los N primeros al cargar la lista (LoopbackProxy.recordPlaylist)"
                )
            )
        }

        // ── net.fm ──────────────────────────────────────────────────────────
        numOrNull(net, "fm")?.let {
            knobs.add(
                unmapped(
                    "net.fm", it,
                    "sin consumidor: el unico umbral de stutter del shim esta en ms fijos " +
                        "(QoeEngine.STALL_MS, QoeEngine.kt:309) y el emisor no declara unidad de 'fm'; " +
                        "convertir fps->ms seria inventar"
                )
            )
        }

        // ── net.probe ───────────────────────────────────────────────────────
        numOrNull(net, "probe")?.let {
            knobs.add(
                unmapped(
                    "net.probe", it,
                    "sin consumidor: la medida del shim es real (SegmentMeter bytes/tiempo), no una sonda configurable"
                )
            )
        }

        // ── net.par ─────────────────────────────────────────────────────────
        numOrNull(net, "par")?.let {
            knobs.add(
                unmapped(
                    "net.par", it,
                    "paralelismo ESTRUCTURAL 1: un solo hilo de fetch " +
                        "(fetchWorker = Executors.newSingleThreadExecutor, LoopbackProxy.kt:33-35); " +
                        "honrar par>1 exige reescribir el pool, no asignar un entero"
                )
            )
        }

        // ── net.rt ──────────────────────────────────────────────────────────
        numOrNull(net, "rt")?.let {
            knobs.add(
                declared(
                    "net.rt", it,
                    "el OkHttpClient se construye una vez con readTimeout 40 s (LoopbackProxy.kt:79-81) " +
                        "y es inmutable tras el constructor; se declara, no se aplica"
                )
            )
        }

        // ── net.gate ────────────────────────────────────────────────────────
        numOrNull(net, "gate")?.let {
            knobs.add(
                unmapped(
                    "net.gate", it,
                    "sin consumidor: el shim solo tiene TECHO de bitrate (AbrPolicy.ceilingBps/maxBwAdmitted), " +
                        "no un suelo de exigencia; la leyenda del emisor lo llama min_bw"
                )
            )
        }

        // ── ott.* ───────────────────────────────────────────────────────────
        if (ott != null) {
            for (k in listOf("hw", "hc", "mcr", "mmp")) {
                val v = numOrNull(ott, k) ?: continue
                knobs.add(
                    declared(
                        "ott.$k", v,
                        "no es un setting del shim (no tiene Context ni escribe Android Settings): " +
                            "lo aplica la APK (ExtShimOttBridge -> SettingsApplier)"
                    )
                )
            }
        }

        // ── cad.* ───────────────────────────────────────────────────────────
        if (cad != null) {
            for (k in listOf("m", "v")) {
                if (!cad.has(k) || cad.get(k) == JSONObject.NULL) continue
                knobs.add(
                    declared(
                        "cad.$k", cad.get(k),
                        "el shim no controla la cadencia del player: solo decide que variante y que bytes sirve"
                    )
                )
            }
        }

        // ── metadatos del emisor (no son knobs) ─────────────────────────────
        notes.addAll(unknownKeys(obj, ROOT_KEYS, "raiz"))
        notes.addAll(unknownKeys(net, NET_KEYS, "net"))
        notes.addAll(unknownKeys(ott, OTT_KEYS, "ott"))
        notes.addAll(unknownKeys(cad, CAD_KEYS, "cad"))
        if (!inChannelBlock) notes.add("N_TAG_OUTSIDE: el tag no esta dentro de un bloque #EXTINF...URI")

        val truth = strOrNull(obj, "truth")
        if (truth == null) notes.add("N_TRUTH_AUSENTE: el emisor no declara procedencia (DECLARED/MEDIDO)")

        return Decision(
            ch = strOrNull(obj, "ch"),
            version = (numOrNull(obj, "v") ?: 0.0).toInt(),
            profile = strOrNull(obj, "p"),
            truth = truth,
            line = line,
            inChannelBlock = inChannelBlock,
            knobs = knobs,
            notes = notes
        )
    }

    /**
     * Aplica un knob numérico con recorte + RELECTURA. `applied=1` exige que el valor
     * leído del consumidor sea exactamente el escrito; si no, se declara 0 y el motivo.
     */
    private fun applyBounded(
        name: String,
        requested: Double,
        min: Int,
        max: Int,
        write: (Int) -> Unit,
        read: () -> Int,
        semantics: String
    ): Knob {
        val want = requested.toInt()
        val clamped = want.coerceIn(min, max)
        write(clamped)
        val back = read()
        if (back != clamped) {
            return Knob(
                name, want.toString(), Status.REJECTED, 0, "", Confidence.INFERIDO,
                "escrito $clamped pero la relectura dio $back: no se declara aplicado"
            )
        }
        val note = when {
            want != clamped -> "recortado de $want a $clamped (rango propio $min..$max)"
            else -> "sin recorte"
        }
        return Knob(
            name, want.toString(), Status.EXECUTED_INFERRED, 1, clamped.toString(), Confidence.INFERIDO,
            "$semantics; $note; unidad (segmentos) INFERIDA: el emisor no la documenta"
        )
    }

    private fun unmapped(name: String, requested: Number, reason: String) = Knob(
        name, fmtNum(requested), Status.UNMAPPED, 0, "", Confidence.DESCONOCIDO, reason
    )

    private fun declared(name: String, requested: Any, reason: String) = Knob(
        name, if (requested is Number) fmtNum(requested) else requested.toString(),
        Status.DECLARED, 0, "", Confidence.DESCONOCIDO, reason
    )

    /**
     * `2.0` no es lo que el emisor escribió: escribió `2`. El recibo reproduce el número
     * sin añadir precisión que el payload no tenía.
     */
    private fun fmtNum(v: Number): String {
        val d = v.toDouble()
        if (!d.isFinite()) return v.toString()
        return if (d == Math.floor(d) && Math.abs(d) < 1e15) d.toLong().toString() else d.toString()
    }

    // ─────────────────────────── entrada producción ───────────────────────────

    /**
     * Punto de entrada de producción (`LoopbackProxy`), sobre el texto que ese camino
     * YA tiene materializado. No lanza hacia fuera.
     */
    fun ingest(text: String, source: String, policy: AbrPolicy?): Snapshot {
        val safe = ShimOttTap.safeSource(source)
        return try {
            decideAndRecord(text, safe, policy)
        } catch (t: Throwable) {
            // Nada de lo que pase aquí puede cortar una conexión ni tumbar el proxy.
            record(safe, 0, 0, 0, 0, 0, 0, "", "", "excepcion ${t.javaClass.simpleName}: ${t.message}", emptyList())
        }
    }

    private fun decideAndRecord(text: String, safe: String, policy: AbrPolicy?): Snapshot {
        val ex = scan(text)
        val tags = ex.tags.size + ex.malformed
        totalTags.addAndGet(tags.toLong())
        if (tags == 0) {
            // ANTI-CADUCIDAD: `decision()` significa "contrato de la playlist servida AHORA".
            // Si el cuerpo materializado no trae tag, la decisión anterior pertenece a otro
            // momento (posiblemente a otro canal) y NO debe sobrevivir: la APK la aplicaría a
            // ciegas. Se limpia y el consumidor se queda sin nada que escribir.
            lastDecision = null
            return record(safe, tags, 0, 0, 0, 0, 0, "", "", "sin tag", emptyList())
        }
        if (ex.tags.isEmpty()) {
            totalRejected.addAndGet(ex.malformed.toLong())
            return record(safe, tags, ex.malformed, 0, 0, 0, 0, "", "", "tag con forma invalida (${ex.malformed})", emptyList())
        }
        // Regla multi-canal: el presupuesto de precarga es del canal que se sirve.
        if (ex.tags.size > 1) {
            return record(
                safe, tags, 0, 0, 0, 0, 0, "", "",
                "multi_channel: ${ex.tags.size} tags en el cuerpo; no se aplica (no se adivina el canal)", emptyList()
            )
        }
        val tag = ex.tags[0]
        val parsed = parse(tag.payload, tag.line)
        if (parsed.payload == null) {
            totalRejected.incrementAndGet()
            return record(
                safe, tags, ex.malformed, 0, 0, 0, 0, "", "",
                "rechazado linea ${tag.line}: ${parsed.error}", emptyList()
            )
        }
        val d = decide(parsed.payload, tag.line, tag.inChannelBlock, policy)
        totalAccepted.incrementAndGet()
        lastDecision = d
        val receipt = d.receipt()
        Log.d("qoe_contract: $safe $receipt")
        for (k in d.knobs) {
            if (k.applied == 0) Log.d("qoe_contract: ${k.name}=${k.requested} ${k.status.name} — ${k.reason}")
        }
        for (n in d.notes) Log.d("qoe_contract: $n")
        return record(
            safe, tags, ex.malformed, 1, d.executed, d.declared, d.unmapped,
            d.ch ?: "", receipt, if (d.knobs.isEmpty()) "payload sin knobs" else "", d.knobs
        )
    }

    // ───────────────────────────── evidencia ─────────────────────────────

    /** JSON para `/health` (artefacto legible en el device, sin inventar campos). */
    fun statusJson(): JSONObject {
        val s = lastSnapshot
        val o = JSONObject()
            .put("tags", s.tags)
            .put("malformed", s.malformed)
            .put("accepted", s.accepted)
            .put("executed", s.executed)
            .put("declared", s.declared)
            .put("unmapped", s.unmapped)
            .put("ch", s.ch)
            .put("receipt", s.receipt)
            .put("reason", s.reason)
            .put("at", s.at)
            .put("totals", totals())
        val arr = JSONArray()
        for (k in s.knobs.take(24)) {
            arr.put(
                JSONObject()
                    .put("n", k.name)
                    .put("req", k.requested)
                    .put("st", k.status.name)
                    .put("ap", k.applied)
                    .put("val", k.appliedValue)
                    .put("cf", k.confidence.name)
            )
        }
        o.put("knobs", arr)
        return o
    }

    private fun record(
        source: String, tags: Int, malformed: Int, accepted: Int,
        executed: Int, declared: Int, unmapped: Int,
        ch: String, receipt: String, reason: String, knobs: List<Knob>
    ): Snapshot {
        val snap = Snapshot(
            source, tags, malformed, accepted, executed, declared, unmapped,
            ch, receipt, reason, knobs, System.currentTimeMillis()
        )
        lastSnapshot = snap
        if (tags > 0 && reason.isNotEmpty()) Log.d("qoe_contract: source=$source tags=$tags $reason")
        return snap
    }

    // ───────────────────────────── utilidades ─────────────────────────────

    private val ROOT_KEYS = setOf("ch", "v", "p", "net", "cad", "ott", "jit", "truth", "tier")
    private val NET_KEYS = setOf("depth", "pb", "fm", "probe", "par", "rt", "gate")
    private val OTT_KEYS = setOf("hw", "hc", "mcr", "mmp")
    private val CAD_KEYS = setOf("m", "v")

    private fun unknownKeys(o: JSONObject?, allowed: Set<String>, path: String): List<String> {
        if (o == null) return emptyList()
        val out = ArrayList<String>(2)
        val it = o.keys()
        while (it.hasNext()) {
            val k = it.next().toString()
            if (k !in allowed) out.add("N_UNKNOWN_KEY: $path.$k no forma parte de la tabla de knobs (se registra, no se aplica)")
        }
        return out
    }

    /** Número de un objeto JSON. Tolera Integer/Long/Double/BigDecimal (org.json). */
    private fun numOrNull(o: JSONObject?, key: String): Double? {
        if (o == null || !o.has(key)) return null
        val raw = o.get(key)
        if (raw == JSONObject.NULL) return null
        return when (raw) {
            is Int -> raw.toDouble()
            is Long -> raw.toDouble()
            is Short -> raw.toDouble()
            is Byte -> raw.toDouble()
            is Double -> raw
            is Float -> raw.toDouble()
            is Number -> raw.toDouble()
            is String -> raw.trim().toDoubleOrNull()   // el emisor medido emite números, no strings
            else -> null
        }
    }

    private fun strOrNull(o: JSONObject?, key: String): String? {
        if (o == null || !o.has(key)) return null
        val raw = o.get(key)
        if (raw == JSONObject.NULL) return null
        return if (raw is String) raw else null
    }

    // ──────────────────────────── self-check puro ────────────────────────────

    /**
     * Autocomprobación PURA (sin Android, sin I/O, sin red). Verifica:
     *  · los DOS shapes REALES que emiten los inyectores del repo;
     *  · convivencia con `#EXTSHIMOTT` en el MISMO texto (no-interferencia medida);
     *  · regla multi-canal, payload inválido, versión no soportada;
     *  · recorte + relectura de `depth`;
     *  · que ningún knob sin consumidor se declare aplicado.
     */
    fun selfCheck(): String {
        val policy = AbrPolicy()
        val base = policy.prefetchDepth

        // Shape A — tools/ape_qoe_contract_inject.js:26-27 (mínimo)
        val minimal =
            """{"ch":"es_c01","v":1,"net":{"depth":3,"pb":3,"fm":2,"probe":200},""" +
                """"cad":{"m":"fixed","v":"cfr"},"ott":{"hw":1,"hc":1,"mcr":2,"mmp":0},""" +
                """"jit":"/prisma/api/qoe-controller.php","truth":"DECLARED"}"""
        // Shape B — rea-export-finalizer.js:433-437 (con p, par, rt, gate)
        val full =
            """{"ch":"es_c01","v":1,"p":"P1","net":{"depth":3,"pb":3,"fm":2,"probe":150,"par":6,"rt":75000,"gate":2.5},""" +
                """"cad":{"m":"fixed","v":"cfr"},"ott":{"hw":1,"hc":1,"mcr":2,"mmp":0},""" +
                """"jit":"/prisma/api/qoe-controller.php","truth":"DECLARED"}"""

        for ((label, payload) in listOf("minimal" to minimal, "full" to full)) {
            val p = parse(payload)
            if (p.payload == null) return "FAIL:parse_$label: ${p.error}"
            val d = decide(p.payload, 1, true, policy)
            if (d.ch != "es_c01") return "FAIL:ch_$label=${d.ch}"
            if (d.version != 1) return "FAIL:v_$label=${d.version}"
            if (d.truth != "DECLARED") return "FAIL:truth_$label=${d.truth}"
            // depth/pb aplicados con relectura
            val depth = d.knobs.firstOrNull { it.name == "net.depth" } ?: return "FAIL:sin_depth_$label"
            if (depth.applied != 1 || depth.appliedValue != "3") return "FAIL:depth_$label=${depth.appliedValue}"
            if (depth.status != Status.EXECUTED_INFERRED) return "FAIL:depth_status_$label"
            if (depth.confidence != Confidence.INFERIDO) return "FAIL:depth_conf_$label"
            if (policy.prefetchDepth != 3) return "FAIL:policy_depth_$label=${policy.prefetchDepth}"
            val pb = d.knobs.firstOrNull { it.name == "net.pb" } ?: return "FAIL:sin_pb_$label"
            if (pb.applied != 1 || policy.prebufferSegments != 3) return "FAIL:pb_$label"
            // NADA sin consumidor puede salir aplicado
            for (k in d.knobs) {
                if (k.applied == 1 && k.name != "net.depth" && k.name != "net.pb") {
                    return "FAIL:knob_sin_consumidor_aplicado_${label}:${k.name}"
                }
                if (k.name.startsWith("ott.") && k.status != Status.DECLARED) return "FAIL:ott_status_$label"
            }
            // el shape completo declara par/rt/gate/fm/probe sin mapeo
            if (label == "full") {
                for (n in listOf("net.fm", "net.probe", "net.par", "net.rt", "net.gate")) {
                    val k = d.knobs.firstOrNull { it.name == n } ?: return "FAIL:falta_$n"
                    if (k.applied != 0) return "FAIL:$n aplicado sin consumidor"
                }
            }
            if (d.executed != 2) return "FAIL:executed_$label=${d.executed}"
        }

        // recorte: depth=99 -> 8 y el recibo lo dice
        val big = parse("""{"ch":"x","v":1,"net":{"depth":99},"truth":"DECLARED"}""").payload
            ?: return "FAIL:parse_big"
        val dBig = decide(big, 1, true, policy)
        val kBig = dBig.knobs.first { it.name == "net.depth" }
        if (kBig.appliedValue != "8") return "FAIL:clamp=${kBig.appliedValue}"
        if (!kBig.reason.contains("recortado")) return "FAIL:clamp_reason=${kBig.reason}"
        if (policy.prefetchDepth != 8) return "FAIL:policy_clamp"

        // sin política (null): no se puede aplicar -> applied=0 con motivo, no crash
        val dNull = decide(big, 1, true, null)
        val kNull = dNull.knobs.first { it.name == "net.depth" }
        if (kNull.applied != 0) return "FAIL:null_policy_aplico"

        // versión no soportada
        if (parse("""{"ch":"x","v":2,"net":{"depth":3}}""").payload != null) return "FAIL:v2_aceptada"
        // sin ch
        if (parse("""{"v":1,"net":{"depth":3}}""").payload != null) return "FAIL:sin_ch_aceptada"
        // basura / comillas simples / coma final
        if (parse("{ch:1}").payload != null) return "FAIL:clave_sin_comillas"
        if (parse("""{"ch":"x","v":1,}""").payload != null) return "FAIL:coma_final"
        if (parse("""{'ch':'x','v':1}""").payload != null) return "FAIL:comilla_simple"

        // ── convivencia con #EXTSHIMOTT: no-interferencia MEDIDA ─────────────
        val both = buildString {
            appendLine("#EXTM3U")
            appendLine("#EXTINF:-1 tvg-id=\"es_c01\",A")
            appendLine(ShimOttTap.PREFIX + """{"ver":1,"id":"es_c01","tgt":"ott"}""")
            appendLine(PREFIX + minimal)
            appendLine("https://fixture.invalid/a.m3u8")
            appendLine("#EXTINF:-1 tvg-id=\"es_c01\",A2")
            appendLine(PREFIX + full)
            appendLine("https://fixture.invalid/a2.m3u8")
        }
        val shimExt = ShimOttTap.scan(both)
        if (shimExt.tags.size != 1) return "FAIL:shimott_scan=${shimExt.tags.size}"
        if (shimExt.tags[0].payload != """{"ver":1,"id":"es_c01","tgt":"ott"}""") return "FAIL:shimott_payload"
        val own = scan(both)
        if (own.tags.size != 2) return "FAIL:qoe_scan=${own.tags.size}"
        if (own.tags[0].channelId != "es_c01") return "FAIL:qoe_channel"
        if (!own.tags[0].inChannelBlock) return "FAIL:qoe_in_block"

        // multi-canal: no se aplica
        policy.prefetchDepth = base
        val multi = ingest(both, "selfcheck-multi", policy)
        if (multi.executed != 0) return "FAIL:multi_aplico=${multi.executed}"
        if (!multi.reason.contains("multi_channel")) return "FAIL:multi_reason=${multi.reason}"
        if (policy.prefetchDepth != base) return "FAIL:multi_toco_policy"

        // payload inválido: cuenta y sigue
        val bad = "#EXTM3U\n#EXTINF:-1 tvg-id=\"x\",X\n" + PREFIX + "no-es-json\nhttps://fixture.invalid/x.m3u8\n"
        val sBad = ingest(bad, "selfcheck-bad", policy)
        if (sBad.accepted != 0) return "FAIL:bad_aceptado"
        if (!sBad.reason.contains("rechazado")) return "FAIL:bad_reason=${sBad.reason}"

        // un solo tag: aplica de verdad y el snapshot lo refleja
        val single = "#EXTM3U\n#EXTINF:-1 tvg-id=\"es_c01\",A\n" + PREFIX + minimal + "\nhttps://fixture.invalid/a.m3u8\n"
        policy.prefetchDepth = base
        policy.prebufferSegments = 0
        val sOk = ingest(single, "selfcheck-single", policy)
        if (sOk.accepted != 1) return "FAIL:single_accepted=${sOk.accepted}"
        if (sOk.executed != 2) return "FAIL:single_executed=${sOk.executed}"
        if (policy.prefetchDepth != 3 || policy.prebufferSegments != 3) return "FAIL:single_policy"
        if (!sOk.receipt.contains("EXECUTED_INFERRED")) return "FAIL:single_receipt=${sOk.receipt}"
        if (!statusJson().getString("receipt").contains("es_c01")) return "FAIL:status_json"
        if (decision() == null) return "FAIL:decision_no_vigente"

        // ANTI-CADUCIDAD: un cuerpo materializado SIN tag limpia la decisión. Si no, la APK
        // aplicaría a ciegas el contrato de un canal anterior.
        val sinTag = "#EXTM3U\n#EXTINF:-1 tvg-id=\"es_c09\",B\nhttps://fixture.invalid/b.m3u8\n"
        val sNo = ingest(sinTag, "selfcheck-sintag", policy)
        if (sNo.tags != 0) return "FAIL:sintag_tags=${sNo.tags}"
        if (decision() != null) return "FAIL:sintag_decision_no_limpiada"

        // el source no arrastra credenciales al log
        if (ShimOttTap.safeSource("https://user:pass@host.tv:8080/user/pass/1.m3u8") != "host.tv:8080") {
            return "FAIL:safe_source"
        }
        // techo de línea
        val long = "#EXTM3U\n" + PREFIX + "{\"ch\":\"x\",\"v\":1,\"t\":\"" + "a".repeat(MAX_LINE_CHARS) + "\"}\n"
        if (scan(long).malformed != 1) return "FAIL:techo_linea"

        policy.prefetchDepth = base
        policy.prebufferSegments = 0
        return "PASS knobs=2 ejecutados(shapes A/B)=4 declarados_registrados=6 " +
            "shimott_intacto=1 clamp=99→8 multi=skip sinTag_limpia_decision=1"
    }
}
