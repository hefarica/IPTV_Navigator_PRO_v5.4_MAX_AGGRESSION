package com.ape.crystalagent

import android.app.Activity
import android.os.Build
import android.util.Log

/**
 * Asegura que la ventana use 3840x2160 si el TV/HDMI lo soporta — SIN pisar la cadencia.
 *
 * HISTORIA (importante, no revertir sin leer):
 *   La versión anterior hacía `.maxByOrNull { it.refreshRate }` y fijaba SIEMPRE el modo de
 *   mayor refresco (60 Hz). Efecto medido en el ONN 4K el 2026-11-13: el operador ponía 4k@50Hz
 *   en los Ajustes del televisor (mActiveModeId=125, renderFrameRate 50.0), abría esta APK y el
 *   panel volvía a 60 Hz (mActiveModeId=124); al cerrar la APK volvía a 50. Tres pasos, repetible.
 *   Con contenido de 25/50 fps eso reintroducía 98 % de judder en cada apertura.
 *
 * REGLA ACTUAL:
 *   - Si el panel YA está en 4K (cualquier refresco), NO se toca nada. La cadencia la manda el
 *     usuario o el sistema, que es quien sabe qué contenido va a reproducir.
 *   - Solo si el panel NO está en 4K se elige un modo 4K, y se prefiere el que permite cadencia
 *     exacta con contenido de 50 o 60 fps (múltiplo entero), no el máximo a ciegas.
 *   - Si no hay 4K, se declara la limitación: no se inventa.
 */
object Display4K {
    private const val TAG = "ApeDisplay4K"

    /** Cadencias de contenido típicas: se busca un modo que sea múltiplo entero de alguna. */
    private val CONTENT_RATES = doubleArrayOf(25.0, 50.0, 30.0, 60.0, 24.0, 23.976)

    private fun esMultiploExacto(displayFps: Double, contentFps: Double): Boolean {
        if (contentFps <= 0.0) return false
        val ratio = displayFps / contentFps
        val rounded = Math.round(ratio).toDouble()
        if (rounded < 1.0) return false
        // Tolerancia 1e-4 (0,01 %), verificada: separa el múltiplo REAL (50/25 = 2,000000)
        // del casi-múltiplo (59,94/60 = 0,999001 y 24/23,976 = 1,001001). Con 2e-3 los daba
        // por buenos y eso son 0,1 % de déficit: ~3,6 s de deriva por hora. Es judder lento,
        // no cadencia exacta.
        return Math.abs(ratio - rounded) < 1e-4
    }

    fun apply(activity: Activity) {
        if (Build.VERSION.SDK_INT < 23) return
        try {
            val display = activity.windowManager.defaultDisplay
            val current = display.mode
            val yaEn4K = current != null &&
                current.physicalWidth >= 3840 && current.physicalHeight >= 2160

            if (yaEn4K) {
                // NO se toca: se respeta la cadencia elegida. Este es el arreglo.
                AraStatus.display4k = true
                AraStatus.displayMode =
                    "${current.physicalWidth}x${current.physicalHeight}@${"%.0f".format(current.refreshRate)}"
                Log.i(TAG, "display ya en 4K: no se modifica (se respeta la cadencia) mode=${AraStatus.displayMode}")
                return
            }

            val modes = display.supportedModes ?: return
            val candidatos = modes.filter { it.physicalWidth >= 3840 && it.physicalHeight >= 2160 }
            if (candidatos.isEmpty()) {
                Log.w(TAG, "display_no_4k: el TV/HDMI no expone 3840x2160")
                AraStatus.display4k = false
                return
            }

            // Preferir un modo 4K que case con alguna cadencia de contenido (múltiplo exacto).
            // Entre los que casan, el mayor refresco; si ninguno casa, el mayor refresco (como antes).
            val conCadenciaExacta = candidatos.filter { m ->
                CONTENT_RATES.any { c -> esMultiploExacto(m.refreshRate, c) }
            }
            val best = (if (conCadenciaExacta.isNotEmpty()) conCadenciaExacta else candidatos)
                .maxByOrNull { it.refreshRate }

            if (best == null) {
                AraStatus.display4k = false
                return
            }

            val lp = activity.window.attributes
            lp.preferredDisplayModeId = best.modeId
            activity.window.attributes = lp
            AraStatus.display4k = true
            AraStatus.displayMode =
                "${best.physicalWidth}x${best.physicalHeight}@${"%.0f".format(best.refreshRate)}"
            Log.i(TAG, "display 4K forzado (panel no estaba en 4K) mode=${AraStatus.displayMode}")
        } catch (e: Exception) {
            Log.w(TAG, "display mode: ${e.message}")
            AraStatus.display4k = false
        }
    }
}

