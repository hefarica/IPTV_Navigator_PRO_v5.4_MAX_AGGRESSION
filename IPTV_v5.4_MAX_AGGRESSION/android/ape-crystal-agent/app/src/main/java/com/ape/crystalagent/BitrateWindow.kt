package com.ape.crystalagent

/**
 * Ventana de resolución PURA (sin Android, sin Media3) para que la lógica crítica del guard
 * —"¿esta variante cae dentro del window?" y "¿qué bitrate puedo fijar sin dejar el grupo vacío?"—
 * se pueda EJECUTAR y probar fuera del APK (ver BG_REPAIR_r2.md §3).
 *
 * BG7/t44 F04: es el único sitio donde se decide pertenencia al window. `BitrateGuard` ya no tiene
 * un fallback a `variants`: si el window está vacío, no hay objetivo y NO se toca el selector.
 */
data class WindowFormat(val width: Int, val height: Int, val bitrate: Int)

object BitrateWindow {

    /** Pertenencia al window actual (0/MAX_VALUE = sin límite, igual que Media3). */
    fun contains(f: WindowFormat, minW: Int, minH: Int, maxW: Int, maxH: Int): Boolean =
        (minW <= 0 || f.width >= minW) &&
            (minH <= 0 || f.height >= minH) &&
            (maxW == Int.MAX_VALUE || f.width <= maxW) &&
            (maxH == Int.MAX_VALUE || f.height <= maxH)

    fun filter(variants: List<WindowFormat>, minW: Int, minH: Int, maxW: Int, maxH: Int): List<WindowFormat> =
        variants.filter { contains(it, minW, minH, maxW, maxH) }

    /**
     * F05: in-band primero; si no hay, la mayor ≤ techo SÓLO si llega al piso; si el origen entero
     * está bajo el piso, el máximo disponible (se marcará FLOOR_BREAK, no se disimula).
     * Devuelve null si el window está vacío ⇒ el llamador debe declarar NO_WINDOW y NO lockear.
     */
    fun pickTarget(inWindow: List<WindowFormat>, floorKbps: Int, ceilKbps: Int): WindowFormat? {
        if (inWindow.isEmpty()) return null
        val inBand = inWindow.filter { it.bitrate / 1000 in floorKbps..ceilKbps }.maxByOrNull { it.bitrate }
        if (inBand != null) return inBand
        val atMostCeil = inWindow.filter { it.bitrate / 1000 <= ceilKbps }.maxByOrNull { it.bitrate }
        if (atMostCeil != null && atMostCeil.bitrate / 1000 >= floorKbps) return atMostCeil
        return inWindow.maxByOrNull { it.bitrate }
    }

    /** El origen no llega al piso: el objetivo elegido queda por debajo de la banda objetivo. */
    fun isBelowFloor(target: WindowFormat?, floorKbps: Int): Boolean =
        target == null || target.bitrate / 1000 < floorKbps
}
