package dev.venice.ottshim

import java.util.concurrent.locks.LockSupport

class TokenBucket(private val burst: Int = 16_384) {
    private var tokens = burst.toDouble()
    private var last = System.nanoTime()

    fun acquire(count: Int, rateBps: Long) {
        if (rateBps <= 0L || count <= 0) return
        val waitNs: Long
        synchronized(this) {
            val now = System.nanoTime()
            tokens = minOf(burst.toDouble(), tokens + (now - last) / 1e9 * rateBps)
            last = now
            if (tokens >= count) {
                tokens -= count
                return
            }
            waitNs = ((count - tokens) / rateBps * 1e9).toLong()
            tokens = 0.0
        }
        LockSupport.parkNanos(waitNs.coerceIn(1_000L, 50_000_000L))
    }
}
