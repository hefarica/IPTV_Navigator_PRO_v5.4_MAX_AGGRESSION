package com.ape.crystalagent

import java.util.concurrent.ConcurrentHashMap

/**
 * Bus caliente de presets homologados (sólo memoria, sin I/O ni Settings).
 * Mide p50/p95/p99/max; si p99 > 30 ms se coalesce al siguiente frame.
 */
object PresetBus {
    private val values = ConcurrentHashMap<String, String>()
    private val lat = LongArray(256)
    private var idx = 0
    private var samples = 0

    @Volatile var lastApplyMs: Long = -1
    @Volatile var lastCount: Int = 0
    @Volatile var p50: Long = -1
    @Volatile var p95: Long = -1
    @Volatile var p99: Long = -1
    @Volatile var max: Long = -1
    @Volatile var coalesced: Boolean = false

    fun put(name: String, value: String) {
        if (name.isNotBlank()) values[name] = value
    }

    fun get(name: String): String? = values[name]
    fun size(): Int = values.size

    fun recordElapsed(startNs: Long, count: Int) {
        val dt = (System.nanoTime() - startNs) / 1_000_000L
        lastApplyMs = dt
        lastCount = count
        lat[idx and 255] = dt
        idx++
        samples++
        p50 = percentile(0.50)
        p95 = percentile(0.95)
        p99 = percentile(0.99)
        max = percentile(1.0)
        coalesced = p99 > 30L
        AraStatus.lastPresetApplyMs = dt
        AraStatus.lastPresetCount = count
        AraStatus.lastPresetP50 = p50
        AraStatus.lastPresetP95 = p95
        AraStatus.lastPresetP99 = p99
        AraStatus.lastPresetMax = max
    }

    private fun percentile(q: Double): Long {
        val n = samples.coerceAtMost(256)
        if (n <= 0) return 0
        val copy = LongArray(n)
        for (i in 0 until n) copy[i] = lat[i]
        copy.sort()
        return copy[((n - 1) * q).toInt()]
    }
}
