package com.ape.crystalagent

import android.os.SystemClock
import java.util.ArrayDeque

/** Mide bytes REALES que entran por el DataSource, no el bitrate que declara el manifest. */
class BitrateMeter {
    private val win = ArrayDeque<LongArray>() // [timestamp, bytes]

    @Synchronized
    fun add(bytes: Long) {
        if (bytes <= 0) return
        val now = SystemClock.elapsedRealtime()
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

    @Synchronized
    fun reset() = win.clear()
}
