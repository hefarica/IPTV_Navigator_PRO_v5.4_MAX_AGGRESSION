package dev.venice.ottshim

import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/**
 * ShimOttTap — el shim LEE el tag `#EXTSHIMOTT` del texto de la playlist, lo expone al
 * llamador (la APK, que es quien lo parsea con el parser del contrato) y DECIDE el
 * routing por `tgt`.
 *
 * QUÉ HACE Y QUÉ NO
 *  · LEE el texto y nada más: la playlist que recibe el player sale **intacta**. El tag es
 *    aditivo y, por RFC 8216 §4.1/§6.3.1, los players genéricos deben ignorar los tags
 *    desconocidos: quitarlo o dejarlo no cambia lo que decodifican.
 *  · NO interpreta `dev.*` ni `ott.*`: no conoce settings de Android, no escribe ninguno y
 *    no sabe qué es un SoC. La única semántica que ejerce es la del **contrato de routing**:
 *    `tgt` dice qué lectores consumen el objeto.
 *  · NO toca la lógica de streaming: [LoopbackProxy] solo le pasa el texto cuando YA lo
 *    tiene materializado. Ni el camino de segmentos, ni el `streamThrough` del catálogo
 *    grande, ni la fijación de variante cambian una línea.
 *
 * ROUTING (regla del contrato `ape.extshimott.v1` + encargo del operador)
 *   `ott` → aplicar `dev.*` y `ott.*` (es el único target que ajusta el dispositivo).
 *   `vlc` → preparar la cadena `flt` para un futuro player, SOLO si `vlc.f=1` y hay `flt`.
 *   `kod` → preparar el estado de Kodi (`kod.isa`). El contrato dice que **Kodi no consume
 *           `flt`**; aquí no se le pasa la cadena, se registra que Kodi la leería si el
 *           contrato cambiara (discrepancia declarada, no silenciada).
 *   sin `tgt` / `tgt` inválido → NO se aplica nada.
 *
 * FAIL-HONEST
 *  · Tag inválido, sink ausente, parser que rechaza o excepción del llamador → se cuenta,
 *    se registra y se sigue. Nada de esto puede cortar un segmento ni tumbar el proxy.
 *  · Una playlist con MÁS de un `#EXTSHIMOTT` (catálogo multi-canal) NO aplica nada: los
 *    ajustes son del DISPOSITIVO y aplicar el último canal de la lista escribiría los
 *    ajustes de otro canal. Se marca `multi_channel` y se sigue. No se adivina.
 *
 * Lo que este objeto NO puede ver (y no finge ver): un catálogo servido en streaming
 * (`LoopbackProxy.streamThrough`, tamaño desconocido o > 2 MB) nunca pasa por aquí.
 */
object ShimOttTap {

    /** Nombre del tag, sin los dos puntos (para la detección, tolerante a mayúsculas como el parser). */
    const val TAG_NAME = "#EXTSHIMOTT"

    /** Prefijo exacto del contrato: la forma es `#EXTSHIMOTT:{json}` en UNA línea. */
    const val PREFIX = "#EXTSHIMOTT:"

    /** Techo duro de la línea COMPLETA (prefijo incluido), del contrato. */
    const val MAX_LINE_CHARS = 4096

    /** Cortafuegos de memoria: una lista no puede traer tags sin fin. */
    const val MAX_TAGS_PER_PLAYLIST = 4096

    /** Tope de filtros pendientes que se recuerdan para un futuro player. */
    const val MAX_PENDING = 256

    private val TVG_ID = Regex("tvg-id=\"([^\"]+)\"")

    /** Una ocurrencia del tag, tal cual está en la lista. El payload NO se interpreta aquí. */
    data class TagLine(
        val payload: String,
        /** `tvg-id` del `#EXTINF` que abrió el bloque, si lo traía. */
        val channelId: String?,
        /** `true` si apareció dentro de un bloque `#EXTINF … URI`. */
        val inChannelBlock: Boolean,
        /** Línea 1-based, para que el log del shim señale el mismo sitio que el validador. */
        val line: Int
    )

    /** Resultado del escaneo: tags con forma válida + líneas con forma inválida (contadas). */
    data class Extraction(val tags: List<TagLine>, val malformed: Int)

    /** Lo que devuelve el parser del llamador. El shim NO añade semántica: solo transporta. */
    data class Parsed(
        val id: String,
        val targets: Set<String>,
        val filter: String?,
        val vlcAppliesFilter: Boolean,
        val summary: String
    )

    /** Decisión DEL SHIM sobre `tgt`. */
    data class Route(
        val apply: Boolean,
        val pendingFilter: String?,
        val pendingKodi: Boolean,
        val reason: String
    )

    /** Recibo de la aplicación: lo que el llamador dice que aplicó, sin inventar. */
    data class Receipt(val applied: Int, val rejected: Int, val playerPrefs: Int, val detail: String)

    /**
     * El llamador (la APK) implementa esto. [parseTag] usa el parser real del contrato y
     * [applyTag] escribe (o no) con su allowlist. Puede ser costoso: se invoca SIEMPRE
     * fuera del hilo del proxy.
     */
    interface Sink {
        /** `null` = el parser rechazó el payload (ya quedó registrado por el llamador). */
        fun parseTag(payload: String, channelId: String?): Parsed?
        fun applyTag(parsed: Parsed, route: Route): Receipt
    }

    /** Última foto para diagnóstico. [applied] = tags ENTREGADOS a `applyTag`; el recibo dice cuántas filas se escribieron. */
    data class Snapshot(
        val source: String,
        val tags: Int,
        val applied: Int,
        val skipped: Int,
        val rejected: Int,
        val lastId: String,
        val route: String,
        val receipt: String,
        val reason: String,
        val at: Long
    )

    @Volatile var sink: Sink? = null
        private set

    /** Instala (o quita, con `null`) el consumidor. Idempotente. */
    fun install(s: Sink?) {
        sink = s
        Log.d("extshimott: sink ${if (s == null) "RETIRADO" else "instalado"}")
    }

    private val totalTags = AtomicLong()
    private val totalApplied = AtomicLong()
    private val totalSkipped = AtomicLong()
    private val totalRejected = AtomicLong()

    /** `id -> flt` pendiente de un futuro player (VLC). Acotado; nunca crece sin límite. */
    private val pendingFilters = ConcurrentHashMap<String, String>()

    @Volatile private var lastSnapshot = Snapshot("", 0, 0, 0, 0, "", "", "", "sin ejecución", 0L)

    @Volatile private var executor: ExecutorService? = null

    private fun executor(): ExecutorService = executor ?: synchronized(this) {
        executor ?: Executors.newSingleThreadExecutor { r ->
            Thread(r, "ottshim-extshimott").apply { isDaemon = true }
        }.also { executor = it }
    }

    fun snapshot(): Snapshot = lastSnapshot

    fun totals(): String = "tags=${totalTags.get()} aplicados=${totalApplied.get()} " +
        "omitidos=${totalSkipped.get()} rechazados=${totalRejected.get()} pendientes=${pendingFilters.size}"

    /** Cadena `flt` preparada para un futuro player de ese canal, si el routing la dejó lista. */
    fun pendingFilter(channelId: String): String? = pendingFilters[channelId]

    /**
     * Extrae los tags de un texto de playlist. Puro y sin efecto: no dispara el sink.
     * La forma se valida con las MISMAS reglas que [com.ape.crystalagent.ExtShimOttParser]
     * aplica a la forma de la línea (columna 1, prefijo exacto, techo de 4096), para que el
     * shim y el parser no discrepen sobre qué es un tag.
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
                !raw.startsWith(PREFIX) -> malformed++        // `#EXTSHIMOTT` sin `:`
                raw.length > MAX_LINE_CHARS -> malformed++    // techo duro
                else -> {
                    val payload = raw.substring(PREFIX.length).trimEnd()
                    if (payload.isEmpty()) malformed++ else tags.add(TagLine(payload, channelId, pendingChannel, index))
                }
            }
        }
        return Extraction(tags, malformed)
    }

    /** Solo los tags válidos (comodidad para tests y para el llamador). */
    fun extract(text: String): List<TagLine> = scan(text).tags

    /**
     * Decide el routing de un objeto ya parseado. FUNCIÓN PURA: no aplica, no escribe.
     * Es la regla del contrato, no una heurística.
     */
    fun routeOf(parsed: Parsed): Route {
        val t = parsed.targets
        if (t.isEmpty()) {
            return Route(apply = false, pendingFilter = null, pendingKodi = false, reason = "tgt ausente o inválido")
        }
        val apply = "ott" in t
        val vlc = "vlc" in t
        val kod = "kod" in t
        val filter = if (vlc && parsed.vlcAppliesFilter) parsed.filter else null
        val reason = buildString {
            append(if (apply) "ott→dev+ott" else "sin ott")
            if (vlc) append(" · vlc→").append(if (filter != null) "flt listo" else "flt no aplicable")
            if (kod) append(" · kod→isa")
        }
        return Route(apply, filter, kod, reason)
    }

    /**
     * Punto de entrada de producción (`LoopbackProxy`). LEE y planifica en el hilo del proxy
     * (barato: recorrer texto) y MANDA la aplicación al hilo `ottshim-extshimott`: escribir
     * settings nunca puede añadir latencia a un segmento.
     */
    fun ingest(text: String, source: String): Snapshot = ingest(text, source, async = true)

    /**
     * Igual que [ingest] pero aplicando en el hilo del llamador. Existe para poder verificar
     * el camino completo de forma determinista (self-check y harness) sin dormir a esperar
     * al executor. La producción usa [ingest].
     */
    fun ingestBlocking(text: String, source: String): Snapshot = ingest(text, source, async = false)

    private fun ingest(text: String, source: String, async: Boolean): Snapshot {
        // El `source` es la URL upstream y puede llevar credenciales (Xtream: /usuario/clave/id).
        // A log y snapshot va SOLO el host: un secreto no entra en un log.
        val safe = safeSource(source)
        var tags = 0
        var applied = 0
        var skipped = 0
        var rejected = 0
        var lastId = ""
        var routeText = ""
        var receiptText = ""
        var reason = ""
        try {
            val ex = scan(text)
            tags = ex.tags.size + ex.malformed
            totalTags.addAndGet(tags.toLong())
            if (ex.tags.isEmpty()) {
                reason = if (ex.malformed > 0) "tag con forma inválida (${ex.malformed})" else "sin tag"
                if (ex.malformed > 0) totalRejected.addAndGet(ex.malformed.toLong())
                return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            // Un catálogo multi-canal trae un tag por canal, pero los ajustes son del
            // DISPOSITIVO: aplicar el último canal de la lista escribiría los ajustes de otro
            // canal. No se adivina. Además se evita parsear N tags en el hilo del proxy.
            if (ex.tags.size > 1) {
                skipped = ex.tags.size
                totalSkipped.addAndGet(skipped.toLong())
                reason = "multi_channel: ${ex.tags.size} tags en la lista; no se aplica (no se adivina el canal)"
                Log.d("extshimott: $safe — $reason")
                return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            val s = sink
            if (s == null) {
                skipped = 1
                totalSkipped.addAndGet(skipped.toLong())
                reason = "sink ausente (sin APK que lo consuma): el tag se ignora"
                Log.d("extshimott: ${ex.tags.size} tag(s) en $safe — $reason")
                return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            val tag = ex.tags[0]
            val parsed = try {
                s.parseTag(tag.payload, tag.channelId)
            } catch (t: Throwable) {
                Log.d("extshimott: parseTag lanzó ${t.javaClass.simpleName}: ${t.message}")
                null
            }
            if (parsed == null) {
                rejected = 1
                totalRejected.incrementAndGet()
                reason = "payload rechazado por el contrato (linea ${tag.line})"
                return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            lastId = parsed.id
            val route = routeOf(parsed)
            routeText = route.reason
            // El filtro pendiente se recuerda ANTES de aplicar: es lo único que un futuro player
            // VLC necesita del tag, y no depende de que el device acepte un setting.
            if (route.pendingFilter != null) {
                if (pendingFilters.size >= MAX_PENDING) pendingFilters.clear()
                pendingFilters[parsed.id] = route.pendingFilter
            }
            if (!route.apply && route.pendingFilter == null && !route.pendingKodi) {
                skipped = 1
                totalSkipped.incrementAndGet()
                reason = "routing: ${route.reason}"
                return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            val run = {
                val rc = try {
                    s.applyTag(parsed, route)
                } catch (t: Throwable) {
                    Log.d("extshimott: applyTag lanzó ${t.javaClass.simpleName}: ${t.message}")
                    Receipt(0, 0, 0, "applyTag lanzó ${t.javaClass.simpleName}")
                }
                applied = 1
                receiptText = "aplicadas=${rc.applied} rechazadas=${rc.rejected} prefs=${rc.playerPrefs} · ${rc.detail}"
                if (rc.applied > 0) totalApplied.incrementAndGet()
                record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
            }
            if (async) executor().execute { runCatching { run() } } else run()
        } catch (t: Throwable) {
            // Nada de lo que pase aquí puede cortar una conexión ni tumbar el proxy.
            reason = "excepción ${t.javaClass.simpleName}: ${t.message}"
            Log.d("extshimott: $reason")
        }
        return record(safe, tags, applied, skipped, rejected, lastId, routeText, receiptText, reason)
    }

    /**
     * El `source` de [ingest] es la URL upstream y puede llevar credenciales en el path
     * (Xtream: `.../usuario/clave/id`). Al log y al snapshot va SOLO `host:puerto`, sin
     * userinfo y sin path: los secretos no entran en un log.
     */
    internal fun safeSource(url: String): String {
        val s = url.trim()
        val schemeAt = s.indexOf("://")
        if (schemeAt < 0) return "upstream"
        val rest = s.substring(schemeAt + 3)
        val authority = rest.substringBefore('/')
        val hostPort = authority.substringAfter('@')          // quita user:pass@
        return if (hostPort.isBlank()) "upstream" else hostPort
    }

    private fun record(
        source: String, tags: Int, applied: Int, skipped: Int, rejected: Int,
        lastId: String, route: String, receipt: String, reason: String
    ): Snapshot {
        val snap = Snapshot(source, tags, applied, skipped, rejected, lastId, route, receipt, reason, System.currentTimeMillis())
        lastSnapshot = snap
        if (tags > 0) Log.d("extshimott: source=$source tags=$tags aplicados=$applied omitidos=$skipped id=$lastId ${receipt.ifEmpty { reason }}")
        return snap
    }

    /**
     * Self-check PURO del shim: escaneo + routing + regla multi-canal + fail-open sin sink.
     * Sin I/O, sin Android. Devuelve "PASS ..." o "FAIL:<motivo>".
     */
    fun selfCheck(): String {
        val savedSink = sink
        try {
            val ottTag = """{"ver":1,"id":"es_c01","v":{"c":"hevc"},"flt":"unsharp=5:5:0.8","vlc":{"f":1},"kod":{"isa":1},"tgt":"ott|vlc|kod"}"""
            val vlcTag = """{"ver":1,"id":"es_c02","flt":"hqdn3d=1.5","vlc":{"f":1},"tgt":"vlc"}"""
            val noTgt = """{"ver":1,"id":"es_c03","v":{"c":"hevc"}}"""
            val list = buildString {
                appendLine("#EXTM3U")
                appendLine("#EXTINF:-1 tvg-id=\"es_c01\",A")
                appendLine(PREFIX + ottTag)
                appendLine("https://fixture.invalid/a.m3u8")
                appendLine("#EXTINF:-1 tvg-id=\"es_c02\",B")
                appendLine(PREFIX + vlcTag)
                appendLine("https://fixture.invalid/b.m3u8")
                appendLine("#EXTINF:-1 tvg-id=\"es_c03\",C")
                appendLine(" " + PREFIX + noTgt)                  // forma inválida (espacio inicial)
                appendLine("https://fixture.invalid/c.m3u8")
                appendLine(PREFIX + "no-es-json")                  // el parser lo rechazará
                appendLine("https://fixture.invalid/d.m3u8")
            }
            // el source nunca arrastra credenciales al log
            if (safeSource("https://user:pass@host.tv:8080/user/pass/123.m3u8") != "host.tv:8080") return "FAIL:safe_source"
            if (safeSource("https://iptv.example/jit/list.m3u8") != "iptv.example") return "FAIL:safe_source2"
            if (safeSource("sin-esquema") != "upstream") return "FAIL:safe_source3"
            val ex = scan(list)
            if (ex.tags.size != 3) return "FAIL:scan_tags=${ex.tags.size}"
            if (ex.malformed != 1) return "FAIL:scan_malformed=${ex.malformed}"
            if (ex.tags[0].channelId != "es_c01" || !ex.tags[0].inChannelBlock) return "FAIL:scan_channel"
            if (ex.tags[1].channelId != "es_c02") return "FAIL:scan_channel2"

            // routing puro
            val rAll = routeOf(Parsed("es_c01", setOf("ott", "vlc", "kod"), "unsharp=5:5:0.8", true, ""))
            if (!rAll.apply) return "FAIL:route_ott_apply"
            if (rAll.pendingFilter != "unsharp=5:5:0.8") return "FAIL:route_vlc_filter"
            if (!rAll.pendingKodi) return "FAIL:route_kod"
            val rVlc = routeOf(Parsed("es_c02", setOf("vlc"), "hqdn3d=1.5", true, ""))
            if (rVlc.apply) return "FAIL:route_vlc_no_aplica_dispositivo"
            if (rVlc.pendingFilter != "hqdn3d=1.5") return "FAIL:route_vlc_filter2"
            if (rVlc.pendingKodi) return "FAIL:route_vlc_kod"
            // vlc en tgt pero f=0: no hay filtro que preparar
            if (routeOf(Parsed("x", setOf("vlc"), "flt", false, "")).pendingFilter != null) return "FAIL:route_vlc_f0"
            // sin tgt: no se aplica nada
            val rNone = routeOf(Parsed("es_c03", emptySet(), null, false, ""))
            if (rNone.apply || rNone.pendingFilter != null || rNone.pendingKodi) return "FAIL:route_sin_tgt"
            if (!rNone.reason.contains("tgt")) return "FAIL:route_sin_tgt_reason"

            // camino completo con un sink de prueba (una sola vez)
            var applied = 0
            install(object : Sink {
                override fun parseTag(payload: String, channelId: String?): Parsed? {
                    if (!payload.startsWith("{")) return null
                    val id = Regex("\"id\":\"([^\"]+)\"").find(payload)?.groupValues?.get(1) ?: return null
                    val tgt = Regex("\"tgt\":\"([^\"]+)\"").find(payload)?.groupValues?.get(1)?.split("|")?.toSet() ?: emptySet()
                    val flt = Regex("\"flt\":\"([^\"]+)\"").find(payload)?.groupValues?.get(1)
                    val vf = payload.contains("\"vlc\":{\"f\":1}")
                    return Parsed(id, tgt, flt, vf, "selfcheck")
                }

                override fun applyTag(parsed: Parsed, route: Route): Receipt {
                    applied++
                    return Receipt(1, 0, 0, "selfcheck")
                }
            })
            val single = list.substringBefore("#EXTINF:-1 tvg-id=\"es_c02\"")   // solo el canal 1
            val s1 = ingestBlocking(single, "selfcheck-single")
            if (s1.applied != 1) return "FAIL:ingest_single=${s1.applied}"
            if (applied != 1) return "FAIL:ingest_sink=${applied}"
            val s2 = ingestBlocking(list, "selfcheck-multi")
            if (s2.skipped < 1) return "FAIL:ingest_multi_no_omitio"
            if (s2.reason.isEmpty()) return "FAIL:ingest_multi_sin_razon"
            // payload inválido: cuenta y sigue
            val bad = "#EXTM3U\n#EXTINF:-1 tvg-id=\"x\",X\n" + PREFIX + "no-es-json\nhttps://fixture.invalid/x.m3u8\n"
            val s3 = ingestBlocking(bad, "selfcheck-bad")
            if (s3.rejected != 1) return "FAIL:ingest_bad=${s3.rejected}"
            // sin sink: fail-open
            install(null)
            val s4 = ingestBlocking(single, "selfcheck-nosink")
            if (s4.skipped != 1) return "FAIL:ingest_nosink=${s4.skipped}"
            if (!s4.reason.contains("sink")) return "FAIL:ingest_nosink_reason"
            if (pendingFilters["es_c01"] != "unsharp=5:5:0.8") return "FAIL:pending_filter"
            return "PASS tags=${ex.tags.size} malformed=${ex.malformed} applied=${s1.applied} pending=${pendingFilters.size}"
        } catch (t: Throwable) {
            return "FAIL:excepcion ${t.javaClass.simpleName}: ${t.message}"
        } finally {
            sink = savedSink
        }
    }
}
