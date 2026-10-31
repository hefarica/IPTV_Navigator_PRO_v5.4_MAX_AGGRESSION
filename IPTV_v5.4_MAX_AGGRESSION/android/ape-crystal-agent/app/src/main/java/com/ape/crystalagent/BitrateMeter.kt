package com.ape.crystalagent

import android.os.SystemClock
import java.util.ArrayDeque

/**
 * Mide bytes REALES que entran por el DataSource, no el bitrate que declara el manifest.
 * Ventana deslizante de 4 s. BG5/t42: expone la EDAD de la última muestra para que el guard
 * distinga "medido 0" de "sin dato" (F03).
 */
class BitrateMeter {
    private val win = ArrayDeque<LongArray>() // [timestamp, bytes]
    @Volatile private var lastSampleAt = 0L

    @Synchronized
    fun add(bytes: Long) {
        if (bytes <= 0) return
        val now = SystemClock.elapsedRealtime()
        lastSampleAt = now
        win.addLast(longArrayOf(now, bytes))
        while (win.isNotEmpty() && now - win.first[0] > 4000L) win.removeFirst()
    }

    @Synchronized
    fun kbps(): Int {
        if (win.size < 2) return 0
        val span = (win.last[0] - win.first[0]).coerceAtLeast(1L)
        val bytes = win.sumOf { it[1] }
        return ((bytes * 8L) / span).toInt()
    }

    /** Nº de muestras dentro de la ventana de 4 s (F03: con <2 no hay kbps válido). */
    @Synchronized
    fun samples(): Int = win.size

    /** ms desde la última lectura de bytes; Long.MAX_VALUE si nunca hubo muestra. */
    fun ageMs(now: Long = SystemClock.elapsedRealtime()): Long =
        if (lastSampleAt <= 0L) Long.MAX_VALUE else (now - lastSampleAt).coerceAtLeast(0L)

    /** ¿Hay una muestra lo bastante reciente para decidir? (ventana 4 s ⇒ 6 s de gracia). */
    fun hasFresh(now: Long = SystemClock.elapsedRealtime(), maxAgeMs: Long = FRESH_MS): Boolean =
        ageMs(now) <= maxAgeMs

    @Synchronized
    fun reset() {
        win.clear()
        lastSampleAt = 0L
    }

    companion object { const val FRESH_MS = 6_000L }
}
