package com.ape.crystalagent

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Aplicador dinámico de la biblioteca LAB del ARA.
 *
 * No conoce nombres de headers ni valores: recorre TODAS las secciones del JSON
 * (`fields`) y aplana cada clave en `lab_meta_flat` como `seccion.clave`.
 * Cualquier módulo (player, UI, SSE, diagnóstico) puede consultar el valor con
 * [get] sin hardcodear campos.
 */
object LabMetadataStore {
    private const val TAG = "ApeLabMetadata"
    private const val PREFS = "ape"
    private const val KEY_FLAT = "lab_meta_flat"
    private const val KEY_COUNT = "lab_meta_field_count"

    @Volatile
    var fieldCount: Int = 0
        private set

    fun apply(ctx: Context, root: JSONObject): Int {
        val fields = root.optJSONObject("fields") ?: JSONObject()
        val flat = JSONObject()
        var count = 0
        val sections = fields.keys()
        while (sections.hasNext()) {
            val section = sections.next()
            when (val value = fields.opt(section)) {
                is JSONObject -> {
                    val keys = value.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        flat.put("$section.$key", value.opt(key))
                        count++
                    }
                }
                is JSONArray -> {
                    flat.put(section, value)
                    count += value.length()
                }
                else -> {
                    flat.put(section, value)
                    count++
                }
            }
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_FLAT, flat.toString())
            .putInt(KEY_COUNT, count)
            .apply()
        fieldCount = count
        AraStatus.labMetadataFieldCount = count
        Log.i(TAG, "metadata aplicada: $count campos en $PREFS.$KEY_FLAT")
        return count
    }

    fun get(ctx: Context, key: String): String? {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_FLAT, "") ?: return null
        return runCatching { JSONObject(raw).optString(key, "") }.getOrNull()?.ifEmpty { null }
    }

    fun all(ctx: Context): JSONObject? {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_FLAT, "") ?: return null
        return runCatching { JSONObject(raw) }.getOrNull()
    }
}
