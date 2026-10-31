package com.ape.crystalagent

/**
 * I15 — contract buffer policy: floor 60%, no ceiling.
 * This is a policy/observability boundary; ExoPlayer's own buffer_max_s stays intact.
 */
object BufferPolicy {
    const val FLOOR_PCT: Int = 60
    val CEILING_PCT: Int? = null

    fun belowFloor(pct: Int): Boolean = pct in 0 until FLOOR_PCT

    fun state(pct: Int): String = when {
        belowFloor(pct) -> "BELOW_FLOOR"
        else -> "OK"
    }
}
