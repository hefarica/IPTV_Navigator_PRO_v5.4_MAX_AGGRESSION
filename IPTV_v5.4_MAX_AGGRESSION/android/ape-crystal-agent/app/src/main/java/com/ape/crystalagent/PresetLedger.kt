package com.ape.crystalagent

import java.util.concurrent.ConcurrentHashMap

enum class PresetTruth { APPLIED, STORED, DECLARED }

/** Verdad explícita por preset: APPLIED sólo si un sink real consumió el valor. */
object PresetLedger {
    private val state = ConcurrentHashMap<String, PresetTruth>()

    fun mark(tag: String, truth: PresetTruth) {
        state[normalize(tag)] = truth
    }

    fun counts(): Triple<Int, Int, Int> = synchronized(state) {
        var a = 0; var s = 0; var d = 0
        for (v in state.values) when (v) {
            PresetTruth.APPLIED -> a++
            PresetTruth.STORED -> s++
            PresetTruth.DECLARED -> d++
        }
        Triple(a, s, d)
    }

    fun total(): Int = state.size
    fun snapshot(): Map<String, PresetTruth> = state.toMap()

    fun normalize(tag: String): String {
        if (tag.startsWith("#EXTVLCOPT:", true)) return "EXTVLCOPT_" + tag.substringAfter(':').trim().uppercase()
        if (tag.startsWith("#KODIPROP:", true)) return "KODIPROP_" + tag.substringAfter(':').trim().uppercase()
        return tag.removePrefix("#EXT-X-APE-").removePrefix("#EXT-X-ARA-").removePrefix("#EXT-X-")
            .substringBefore(':').trim().uppercase()
    }
}
