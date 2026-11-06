package dev.venice.ottshim

import okhttp3.ConnectionPool
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.PriorityBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.random.Random

class LoopbackProxy(private val policy: AbrPolicy) {
    private val ids = object : LinkedHashMap<String, String>(2048, 0.75f, true) {
        override fun removeEldestEntry(entry: MutableMap.MutableEntry<String, String>?): Boolean = size > 2048
    }
    private val urlToId = HashMap<String, String>()
    private val cookies = HashMap<String, String>()
    private data class Cached(val bytes: ByteArray, val type: String)
    private data class FetchJob(val url: String, val priority: Int, val result: CompletableFuture<Cached>?)
    private val prefetchCache = ConcurrentHashMap<String, Cached>()
    private val queued = ConcurrentHashMap.newKeySet<String>()
    private val pending = ConcurrentHashMap<String, CompletableFuture<Cached>>()
    private val fetchQueue = PriorityBlockingQueue<FetchJob>(32, compareBy { it.priority })
    private val fetchWorker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "ottshim-fetch").apply { isDaemon = true }
    }
    @Volatile var cacheHits = 0L
    @Volatile var cacheMisses = 0L
    // BG17: un miss LIMPIO (no estaba en caché) no es lo mismo que un miss por FALLO del upstream.
    @Volatile var missAbsent = 0L
    @Volatile var missUpstreamError = 0L
    @Volatile var mediaServed = 0L
    @Volatile var requests = 0L
    @Volatile var lastRequestAt = 0L
    @Volatile var lastCacheServeMs = 0L
    /** BG20: executor DEDICADO (1 hilo) para /health y /metrics. */
    @Volatile private var controlPool: java.util.concurrent.ExecutorService? = null
    /** BG22: pool de STREAMING (6 hilos), separado del hilo de control. */
    @Volatile private var streamPool: java.util.concurrent.ExecutorService? = null
    @Volatile private var playlistSegments: List<String> = emptyList()
    private val uriAttr = Regex("(?i)(URI=\")([^\"]+)(\")")

    init {
        fetchWorker.execute {
            while (true) {
                val job = fetchQueue.take()
                queued.remove(job.url)
                val fetched = runCatching { fetchCached(job.url) }.getOrNull()
                if (fetched != null) {
                    prefetchCache[job.url] = fetched
                    job.result?.complete(fetched)
                } else {
                    job.result?.completeExceptionally(IllegalStateException("fetch failed"))
                }
                pending.remove(job.url)
            }
        }
    }
    private val client = OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .connectionPool(ConnectionPool(8, 30, TimeUnit.SECONDS))
        .build()

    @Volatile private var server: ServerSocket? = null

    private fun map(url: String): String = synchronized(ids) {
        urlToId[url]?.takeIf { ids.containsKey(it) }?.let { return it }
        val id = UUID.randomUUID().toString().replace("-", "")
        ids[id] = url
        urlToId[url] = id
        id
    }

    private fun unmap(id: String): String? = synchronized(ids) { ids[id] }

    fun start(): Int {
        val socket = ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))
        // BG20 (t58) — CAUSA RAÍZ del proxy "mudo": con soTimeout=30 s, `accept()` lanzaba
        // SocketTimeoutException a los 30 s sin tráfico, el `catch (IOException) { break }` mataba
        // el lazo y el puerto quedaba abierto pero SIN nadie aceptando (/health colgado para
        // siempre). Ahora: sin timeout en el socket de escucha y, si el lazo sale de verdad, se
        // cierra el socket y se marca running=false para que el watchdog rearme.
        socket.soTimeout = 0
        server = socket
        streamPool = Executors.newFixedThreadPool(6)
        // BG24 (t62): el ingress ya NO es un solo hilo. Con 1 hilo y timeout 1,5 s, 6 conexiones
        // MUDAS retenían el gate ~9 s (BG23-01). Ahora: pool de ADMISIÓN de 3 hilos + lectura de
        // 300 ms ⇒ 6 mudas se absorben en ~600 ms y /health responde por debajo de 1 s.
        controlPool = Executors.newFixedThreadPool(ADMIT_THREADS) { r ->
            Thread(r, "ottshim-admit").apply { isDaemon = true }
        }
        Thread({
            try {
                while (!socket.isClosed) {
                    val accepted = try {
                        socket.accept()
                    } catch (e: java.net.SocketTimeoutException) {
                        continue                     // jamás debe matar el lazo
                    } catch (e: IOException) {
                        break
                    }
                    // BG22 (t60): el socket va PRIMERO al hilo de control. Ese hilo lee la petición
                    // con timeout corto, responde /health y /metrics él mismo y sólo reenvía al pool
                    // de streaming lo que NO es control. Así un pool saturado no tumba el gate.
                    val cp = controlPool
                    if (cp != null && !cp.isShutdown) {
                        cp.execute { ingress(accepted) }
                    } else {
                        ingestFallback(accepted)
                    }
                }
            } finally {
                // BG20: salida real del lazo ⇒ cerrar socket + declarar caído (watchdog rearma).
                runCatching { if (!socket.isClosed) socket.close() }
                if (server === socket) server = null
                runCatching { controlPool?.shutdownNow() }
                runCatching { streamPool?.shutdownNow() }
                ProxyService.running = false
                ProxyService.port = 0
                android.util.Log.w("ottshim", "accept loop ended → socket cerrado, running=false (watchdog rearmará)")
            }
        }, "ottshim-accept").apply { isDaemon = true }.start()
        Log.d("proxy on 127.0.0.1:${socket.localPort}")
        return socket.localPort
    }

    fun stop() {
        runCatching { controlPool?.shutdownNow() }
        controlPool = null
        runCatching { streamPool?.shutdownNow() }
        streamPool = null
        runCatching { server?.close() }
        server = null
    }

    private data class Req(
        val path: String,
        val id: String?,
        val range: String?,
        val ua: String?,
        val head: Boolean
    )

    /**
     * BG22 (t60) — INGRESS en el hilo de control:
     *  1) lee la petición con timeout CORTO (no bloquea el gate),
     *  2) si es /health o /metrics, responde AQUÍ MISMO (hilo dedicado, socket suyo),
     *  3) si no, entrega el socket (ya parseado) al pool de streaming y NO lo cierra.
     * Elimina el `fut.get(5 s)` que provocaba Broken pipe al cerrarse el socket en el `use`.
     */
    private fun ingress(s: Socket) {
        var handoff = false
        try {
            // BG24: 300 ms — una conexión MUDA no puede retener el gate.
            s.soTimeout = INGRESS_READ_TIMEOUT_MS.toInt()
            val req = parse(s) ?: return
            requests++
            lastRequestAt = System.currentTimeMillis()
            when {
                req.path == "/health" -> text(s, health())
                req.path == "/metrics" -> { syncCache(); text(s, policy.qoe.snapshot(), "application/json") }
                else -> {
                    val sp = streamPool
                    if (sp != null && !sp.isShutdown) {
                        handoff = true
                        sp.execute {
                            try {
                                handleParsed(s, req)
                            } catch (e: IOException) {
                                Log.d("conn closed: ${e.javaClass.simpleName} ${e.message}")
                            } catch (e: Throwable) {
                                android.util.Log.w("ottshim", "stream: ${e.javaClass.simpleName} ${e.message}")
                            } finally {
                                runCatching { s.close() }
                            }
                        }
                    } else {
                        handleParsed(s, req)
                    }
                }
            }
        } catch (e: IOException) {
            Log.d("ingress closed: ${e.javaClass.simpleName} ${e.message}")
        } catch (e: Throwable) {
            android.util.Log.w("ottshim", "ingress: ${e.javaClass.simpleName} ${e.message}")
        } finally {
            // Sólo cerramos aquí si NO se entregó al pool de streaming (control/fallo/timeout).
            if (!handoff) runCatching { s.close() }
        }
    }

    /** Sin hilo de control disponible (arranque/cierre): misma lógica en línea. */
    private fun ingestFallback(s: Socket) {
        try {
            s.soTimeout = INGRESS_READ_TIMEOUT_MS.toInt()
            val req = parse(s) ?: return
            requests++
            lastRequestAt = System.currentTimeMillis()
            if (req.path == "/health") text(s, health())
            else if (req.path == "/metrics") { syncCache(); text(s, policy.qoe.snapshot(), "application/json") }
            else handleParsed(s, req)
        } catch (e: Throwable) {
            Log.d("ingest fallback: ${e.javaClass.simpleName} ${e.message}")
        } finally {
            runCatching { s.close() }
        }
    }

    private fun handleParsed(clientSocket: Socket, req: Req) {
        clientSocket.soTimeout = 15_000
        // BG19: cualquier IOException de ESTA conexión (cliente que corta) se traga aquí;
        // el proceso y el resto de conexiones siguen.
        try {
            when {
                req.path == "/source.m3u8" -> playlist(clientSocket, req, policy.sourceUrl)
                req.id != null && (req.path == "/master.m3u8" || req.path == "/media.m3u8") ->
                    playlist(clientSocket, req, unmap(req.id))
                req.id != null -> segment(clientSocket, req, unmap(req.id))
                else -> text(clientSocket, "bad request", "text/plain", 400)
            }
        } catch (e: IOException) {
            Log.d("conn closed: ${e.javaClass.simpleName} ${e.message}")
        }
    }

    private fun playlist(c: Socket, req: Req, target: String?) {
        if (target.isNullOrBlank()) return text(c, "no source", "text/plain", 404)
        val resp = fetch(target, req) ?: run {
            policy.onHttpError(502, target)
            return text(c, "upstream", "text/plain", 502)
        }
        resp.use {
            policy.qoe.onHttpStatus(it.code)
            if (it.code >= 400) policy.qoe.onHttpError(it.code, target)
            val body = it.body?.string() ?: return text(c, "empty", "text/plain", 502)
            val base = it.request.url
            val out = Rewriter(policy, ::map).rewrite(body, base)
            val type = it.header("Content-Type") ?: "application/vnd.apple.mpegurl"
            recordPlaylist(body, base)
            text(c, out, type)
        }
    }

    private fun segment(c: Socket, req: Req, target: String?) {
        if (target.isNullOrBlank()) return text(c, "unknown id", "text/plain", 404)

        // Player path always has priority; range requests stay on the streaming path.
        if (req.range == null) {
            val cached = prefetchCache[target]
            if (cached != null) {
                cacheHits++
                mediaServed++
                serveCached(c, req, cached)
                afterSegment(target)
                return
            }
            val fetched = playerFetch(target)
            if (fetched == null) {
                cacheMisses++
                missUpstreamError++
                policy.onHttpError(502, target)
                return text(c, "upstream", "text/plain", 502)
            }
            cacheMisses++
            missAbsent++
            mediaServed++
            serveCached(c, req, fetched)
            afterSegment(target)
            return
        }

        val resp = fetch(target, req) ?: run {
            policy.onHttpError(502, target)
            return text(c, "upstream", "text/plain", 502)
        }
        resp.use {
            policy.qoe.onHttpStatus(it.code)
            if (it.code >= 400) policy.qoe.onHttpError(it.code, target)
            val body = it.body ?: return text(c, "empty", "text/plain", 502)
            val partial = req.range != null && it.code == 206
            val out = c.getOutputStream()
            val len = body.contentLength()
            val head = buildString {
                append(if (partial) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
                append("Content-Type: ").append(it.header("Content-Type") ?: "application/octet-stream").append("\r\n")
                if (partial) it.header("Content-Range")?.let { value ->
                    append("Content-Range: ").append(value).append("\r\n")
                }
                if (len >= 0) append("Content-Length: ").append(len).append("\r\n")
                append("Connection: close\r\n\r\n")
            }
            out.write(head.toByteArray())
            out.flush()
            if (req.head) return

            val meter = policy.meter.begin(target)
            val bucket = TokenBucket()
            val throttle = req.path == "/seg"
            val burstBytes = if (throttle && len > 0) {
                minOf((len * 0.2).toInt(), 64 * 1024)
            } else 0
            var written = 0
            val buf = ByteArray(2048)
            body.byteStream().use { input ->
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    meter.firstByteIfNeeded()
                    if (throttle && written >= burstBytes) bucket.acquire(n, policy.ceilingBps)
                    out.write(buf, 0, n)
                    out.flush()
                    meter.add(n)
                    written += n
                }
            }
            meter.end()
            if (throttle) policy.onSegment(meter.stats())
        }
    }

    private fun afterSegment(target: String) {
        val list = playlistSegments
        val index = list.indexOf(target)
        if (index >= 0 && index + 1 < list.size) prefetch(list[index + 1])
        val total = cacheHits + cacheMisses
        val ratio = if (total > 0) cacheHits * 100 / total else 0
        Log.d("cache hit=$cacheHits miss=$cacheMisses ratio=$ratio%")
    }

    private fun serveCached(c: Socket, req: Req, cached: Cached) {
        val started = System.nanoTime()
        val out = c.getOutputStream()
        val head = buildString {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: ").append(cached.type).append("\r\n")
            append("Content-Length: ").append(cached.bytes.size).append("\r\n")
            append("Connection: close\r\n\r\n")
        }
        out.write(head.toByteArray())
        if (!req.head) out.write(cached.bytes)
        out.flush()
        lastCacheServeMs = (System.nanoTime() - started) / 1_000_000L
        Log.d("cache serve ${cached.bytes.size}B in ${lastCacheServeMs}ms")
    }

    private fun recordPlaylist(raw: String, base: HttpUrl) {
        if (raw.contains("#EXT-X-STREAM-INF")) return
        val segments = ArrayList<String>()
        raw.lineSequence().forEach { line ->
            when {
                line.startsWith("#EXT-X-MAP:") -> {
                    uriAttr.find(line)?.groupValues?.get(2)?.let { rel ->
                        base.resolve(rel)?.toString()?.let { prefetch(it) }
                    }
                }
                line.startsWith("#EXT-X-KEY:") -> {
                    uriAttr.find(line)?.groupValues?.get(2)?.let { rel ->
                        base.resolve(rel)?.toString()?.let { prefetch(it) }
                    }
                }
                !line.startsWith("#") && line.isNotBlank() -> {
                    base.resolve(line.trim())?.toString()?.let { segments.add(it) }
                }
            }
        }
        playlistSegments = segments
    }

    private fun prefetch(url: String) {
        if (prefetchCache.containsKey(url) || !queued.add(url)) return
        val future = CompletableFuture<Cached>()
        pending[url] = future
        fetchQueue.put(FetchJob(url, 10, future))
    }

    private fun playerFetch(url: String): Cached? {
        prefetchCache[url]?.let { return it }
        pending[url]?.let { future ->
            return runCatching { future.get(15, TimeUnit.SECONDS) }.getOrNull()
        }
        val future = CompletableFuture<Cached>()
        pending[url] = future
        queued.add(url)
        fetchQueue.put(FetchJob(url, 0, future))
        return runCatching { future.get(15, TimeUnit.SECONDS) }.getOrNull()
    }

    private fun fetchCached(url: String): Cached? {
        val resp = fetch(url, Req("/", null, null, null, false)) ?: return null
        resp.use {
            policy.qoe.onHttpStatus(it.code)
            if (it.code != 200) {
                policy.qoe.onHttpError(it.code, url)
                return null
            }
            val body = it.body?.bytes() ?: return null
            if (body.size > 8_000_000) return null
            return Cached(body, it.header("Content-Type") ?: "application/octet-stream")
        }
    }

    private fun fetch(url: String, req: Req): Response? {
        val parsed = url.toHttpUrlOrNull() ?: return null
        val builder = Request.Builder().url(parsed)
        req.range?.let { builder.header("Range", it) }
        (req.ua ?: policy.userAgent)?.let { builder.header("User-Agent", it) }
        synchronized(cookies) { cookies[parsed.host]?.let { builder.header("Cookie", it) } }
        repeat(3) { attempt ->
            try {
                val response = client.newCall(builder.build()).execute()
                response.header("Set-Cookie")?.let { cookie ->
                    synchronized(cookies) { cookies[parsed.host] = cookie.substringBefore(';') }
                }
                val retryable = response.code == 429 || response.code in 500..599
                if (retryable && attempt < 2) {
                    val retryAfter = response.header("Retry-After")
                        ?.toLongOrNull()
                        ?.times(1_000L)
                        ?.coerceIn(0L, 5_000L)
                    val delay = retryAfter ?: ((200L shl attempt) + Random.nextLong(0L, 120L))
                    response.close()
                    Thread.sleep(delay)
                    return@repeat
                }
                return response
            } catch (e: IOException) {
                Log.d("io ${e.message}")
                if (attempt < 2) Thread.sleep((200L shl attempt) + Random.nextLong(0L, 120L))
            }
        }
        return null
    }

    private fun parse(c: Socket): Req? {
        val input = c.getInputStream().bufferedReader()
        val first = input.readLine() ?: return null
        val parts = first.split(' ')
        if (parts.size < 2) return null
        val head = parts[0] == "HEAD"
        if (!head && parts[0] != "GET") return null
        var range: String? = null
        var ua: String? = null
        while (true) {
            val header = input.readLine() ?: break
            if (header.isEmpty()) break
            when {
                header.startsWith("Range:", true) -> range = header.substringAfter(':').trim()
                header.startsWith("User-Agent:", true) -> ua = header.substringAfter(':').trim()
            }
        }
        val url = ("http://127.0.0.1" + parts[1]).toHttpUrlOrNull() ?: return null
        return Req(url.encodedPath, url.queryParameter("id"), range, ua, head)
    }

    private fun text(c: Socket, body: String, type: String = "text/plain", code: Int = 200) {
        val bytes = body.toByteArray()
        c.getOutputStream().apply {
            write("HTTP/1.1 $code X\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
            write(bytes)
            flush()
        }
    }

    /** BG17: /metrics y /health leen los MISMOS contadores (antes el ratio sólo estaba en /health). */
    private fun syncCache() {
        policy.qoe.updateCache(cacheHits, cacheMisses, missAbsent, missUpstreamError, mediaServed, requests, lastRequestAt)
    }

    /**
     * /health — gate de salud del proxy. `proxy_up=false` ⇒ el consumidor NO debe interpretar
     * /metrics como medición viva (BG12-01: antes el servicio podía estar muerto y nadie lo veía).
     */
    private fun health(): String {
        syncCache()
        val up = ProxyService.running && ProxyService.port > 0
        val uptime = if (ProxyService.startedAt > 0L) System.currentTimeMillis() - ProxyService.startedAt else -1L
        val total = cacheHits + cacheMisses
        val ratio: Any = if (total > 0) (cacheHits.toDouble() / total) else org.json.JSONObject.NULL
        return org.json.JSONObject()
            .put("ok", up)
            .put("proxy_up", up)
            .put("port", ProxyService.port)
            .put("restarts", ProxyService.restarts)
            .put("uptime_ms", uptime)
            .put("last_watchdog_at", ProxyService.lastWatchdogAt)
            .put("qoe_ready", policy.qoe.segments > 0)
            .put("rebuffer_detector_armed", policy.qoe.positionDetectorArmed())
            .put("proxy_media_seen", policy.qoe.proxyMediaSeen())
            .put("ceilingBps", policy.ceilingBps)
            .put("maxBwAdmitted", policy.maxBwAdmitted)
            .put("ids", synchronized(ids) { ids.size })
            .put("cache_hits", cacheHits)
            .put("cache_misses", cacheMisses)
            .put("cache_hit_ratio", ratio)
            .put("miss_reason", org.json.JSONObject().put("absent", missAbsent).put("upstream_error", missUpstreamError))
            .put("media_segments_served", mediaServed)
            .put("requests", requests)
            .put("last_request_at", lastRequestAt)
            .put("lastCacheServeMs", lastCacheServeMs)
            .put("queued", queued.size)
            .put("pending", pending.size)
            // BG24 (t62): parámetros del gate visibles para diagnosticar retenciones.
            .put("ingress_timeout_ms", INGRESS_READ_TIMEOUT_MS)
            .put("admit_threads", ADMIT_THREADS)
            .toString()
    }

    companion object {
        /** BG24: lectura de la petición de admisión. 300 ms ⇒ una conexión muda no retiene el gate. */
        const val INGRESS_READ_TIMEOUT_MS = 300L
        /** BG24: hilos de admisión (2-4 según contrato). 3 absorbe 6 mudas en ~600 ms. */
        const val ADMIT_THREADS = 3
    }
}
