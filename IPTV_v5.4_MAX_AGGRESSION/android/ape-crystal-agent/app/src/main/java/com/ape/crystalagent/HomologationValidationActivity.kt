package com.ape.crystalagent

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.ByteArrayOutputStream
import java.io.IOException

/**
 * Pantalla de diagnóstico para validar un JSON homologado SIN aplicarlo.
 *
 * Flujo:
 *  1. La persona pulsa "Seleccionar JSON para validar".
 *  2. Android abre el selector de documentos. No se explora ninguna carpeta ni se
 *     carga nada al arrancar la Activity.
 *  3. El archivo se lee UNA vez, en memoria, fuera del hilo de UI.
 *  4. HomologationValidator comprueba estructura, SHA-256 canónico y planes.
 *  5. Se muestra "Válido — no aplicado" o el rechazo con el campo/motivo.
 *
 * Garantías deliberadas:
 *  - No se llama takePersistableUriPermission ni se guarda la URI.
 *  - No se escribe SharedPreferences, FluidStore, Config ni ningún estado.
 *  - No se ejecutan filtros, rutas, URLs ni directivas del JSON.
 *  - No se toca la sesión de reproducción ni el servicio ARA.
 *  - Al cancelar o reiniciar la APK no hay lectura automática ni recuperación.
 */
class HomologationValidationActivity : Activity() {

    companion object {
        private const val REQ_OPEN_JSON = 0x4150
        private const val MAX_BYTES = HomologationValidator.MAX_BYTES
        private val BG = Color.rgb(245, 247, 250)
        private val INK = Color.rgb(24, 33, 44)
        private val MUTED = Color.rgb(90, 104, 120)
        private val ACCENT = Color.rgb(15, 118, 110)
        private val GOOD = Color.rgb(22, 128, 80)
        private val BAD = Color.rgb(176, 48, 48)
        private val CARD = Color.WHITE
    }

    private lateinit var status: TextView
    private lateinit var details: TextView
    private lateinit var pick: Button
    private var working = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG
        window.navigationBarColor = BG

        val root = ScrollView(this).apply { setBackgroundColor(BG) }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(36))
        }
        root.addView(content)
        setContentView(root)

        content.addView(label("Validar JSON homologado", 26f, INK, true))
        content.addView(label("Selección manual · solo lectura · no aplica nada", 14f, MUTED))
        content.addView(label(
            "Este diagnóstico no carga el JSON al arrancar, no guarda el permiso, " +
                "no modifica preferencias y no ejecuta filtros ni URLs. " +
                "El SHA-256 interno no autentica el origen del archivo.",
            12f, MUTED,
        ).apply { setPadding(0, dp(10), 0, dp(18)) })

        pick = Button(this).apply {
            text = "Seleccionar JSON para validar"
            setTextColor(Color.WHITE)
            background = round(ACCENT)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = dp(18) }
            setOnClickListener { openPicker() }
        }
        content.addView(pick)

        status = label("Sin archivo seleccionado", 18f, MUTED, true).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, dp(8), 0, dp(10))
        }
        content.addView(status)

        details = label("", 13f, INK).apply {
            setLineSpacing(0f, 1.18f)
            background = round(CARD, Color.rgb(226, 232, 240))
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }
        content.addView(details)
    }

    private fun openPicker() {
        if (working) return
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain"))
        }
        // Sin FLAG_GRANT_PERSISTABLE_URI_PERMISSION y sin takePersistableUriPermission:
        // el acceso se usa una vez y no se conserva.
        runCatching { startActivityForResult(intent, REQ_OPEN_JSON) }
            .onFailure {
                status.text = "No hay selector de documentos disponible"
                status.setTextColor(BAD)
                details.text = "Este dispositivo no expone ACTION_OPEN_DOCUMENT. No se leyó ni se guardó nada."
            }
    }

    @Deprecated("Activity clásica; el APK mantiene minSdk 22 sin AndroidX Activity Result.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_OPEN_JSON) return
        if (resultCode != RESULT_OK || data?.data == null) {
            status.text = "Cancelado — no se leyó ningún archivo"
            status.setTextColor(MUTED)
            details.text = "No se conservó la selección ni se recuperará al reiniciar."
            return
        }
        val uri: Uri = data.data!!
        working = true
        pick.isEnabled = false
        status.text = "Leyendo y validando…"
        status.setTextColor(ACCENT)
        details.text = "El documento se procesa en memoria y se descarta al terminar."

        Thread {
            val outcome = runCatching {
                val bytes = readDocument(uri)
                HomologationValidator.validate(bytes)
            }
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                working = false
                pick.isEnabled = true
                outcome.onSuccess { render(it) }
                    .onFailure { error ->
                        status.text = "Rechazado"
                        status.setTextColor(BAD)
                        details.text = "No se pudo validar: ${error.message ?: "lectura fallida"}"
                    }
            }
        }.start()
    }

    private fun readDocument(uri: Uri): ByteArray {
        val input = contentResolver.openInputStream(uri)
            ?: throw IOException("No se pudo abrir el documento")
        input.use { stream ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            var total = 0
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_BYTES) throw IOException("El archivo supera ${MAX_BYTES / 1024 / 1024} MiB")
                out.write(buffer, 0, read)
            }
            return out.toByteArray()
        }
    }

    private fun render(result: HomologationValidator.Result) {
        if (result.valid) {
            status.text = "Válido — no aplicado"
            status.setTextColor(GOOD)
        } else {
            status.text = "Rechazado"
            status.setTextColor(BAD)
        }
        val structure = if (result.structure.ok) "OK" else "FALLO"
        val integrity = if (result.integrity.ok) "OK" else "FALLO"
        val plans = if (result.plans.ok) "OK" else "FALLO"
        details.text = buildString {
            append("Estructura: ").append(structure).append(" — ").append(result.structure.detail).append('\n')
            append("Integridad: ").append(integrity).append(" — ").append(result.integrity.detail).append('\n')
            append("Planes: ").append(plans).append(" — ").append(result.plans.detail).append('\n')
            append("Perfiles heredados: ").append(result.profiles).append('\n')
            append("Perfiles de filtros: ").append(result.filterProfiles).append('\n')
            append("Planes: ").append(result.plansCount).append('\n')
            if (result.valid) {
                append("\nVálido — no aplicado. No se modificó la configuración ni la reproducción.")
            }
        }
    }

    private fun label(text: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = sp
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun round(color: Int, stroke: Int = color): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(12).toFloat()
        setStroke(dp(1), stroke)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
