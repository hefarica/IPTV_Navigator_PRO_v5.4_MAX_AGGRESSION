package com.ape.crystalagent

/**
 * ExtShimOttApply — traducción PURA del objeto `#EXTSHIMOTT` a lo que el [SettingsApplier]
 * ya sabe aplicar. Sin Android, sin I/O, sin `org.json`, sin estado: recibe el modelo
 * tipado que produjo [ExtShimOttParser] y devuelve TEXTO.
 *
 * POR QUÉ ASÍ
 *  · La allowlist NO se duplica aquí. Esta clase solo PROPONE filas `<ns> <key> <val>`;
 *    quien decide si se escriben es [SettingsApplier.allowsRow] (la misma allowlist +
 *    el mismo regex de valor que aplica hoy). Una fila que no pase esa puerta no se
 *    escribe: se cuenta y se registra.
 *  · Las 5 claves de `dev.*` son EXACTAMENTE las que el agente ya aplica hoy
 *    (`SyncStore.SAFE_ROWS` / `PresetHomologator`): `hdr_conversion_mode`,
 *    `match_content_frame_rate`, `minimal_post_processing_allowed`,
 *    `user_preferred_resolution_width`, `user_preferred_resolution_height`.
 *    El tag no introduce ninguna clave nueva.
 *
 * TRUTH-GUARDS (honestidad de los mapeos, que ya declaró el contrato `ape.extshimott.v1`)
 *  · `hdr_c`, `mcr`: claves MEDIDAS en el repo (allowlist de [SettingsApplier]).
 *  · `mmp`: mapeo INFERIDO por el contrato (dominio {0,1} + única clave con ese rol).
 *    Aquí se implementa lo que el contrato fija; no se afirma que esté verificado.
 *  · `di` (desentrelazado / interpolación de display): NO tiene clave Android en la
 *    allowlist. NO se inventa una. Se declara [UNMAPPED_DI] y el valor se descarta.
 *  · `ott.*` (buffer MB / decoder HW / aspecto): son preferencias de OTT Navigator,
 *    no claves de Android Settings. No existe clave allowlisted para ellas, así que
 *    NO se escriben como settings: se guardan como preferencias de la app para el
 *    player ([ottPrefs]) y se contabilizan aparte en el recibo.
 *  · `res_w`/`res_h` son una PREFERENCIA de display, no una degradación (Ley
 *    Anti-Degradación): se escriben tal cual las declara el tag, mismo trato que
 *    `SAFE_ROWS`. Si el tag y la base discrepan, gana quien escriba último en el
 *    ciclo — ese conflicto se documenta, no se oculta.
 *
 * `selfCheck()` es una función PURA (sin Android) que verifica los vectores de los
 * fixtures reales; se ejecuta también fuera del APK.
 */
object ExtShimOttApply {

    /** Una clave de dispositivo que el contrato abrevia y el tag transporta. */
    data class DevRow(val field: String, val ns: String, val key: String)

    /**
     * Tabla ÚNICA `dev.<campo>` → (namespace, clave Android). El namespace es el que la
     * base aplica hoy; [SettingsApplier.putSetting] además prueba los otros dos si la
     * clave no existe allí ("try-both-ns"), así que esto es una pista, no un candado.
     */
    val DEV_ROWS: List<DevRow> = listOf(
        DevRow("hdr_c", "global", "hdr_conversion_mode"),
        DevRow("mcr", "secure", "match_content_frame_rate"),
        DevRow("mmp", "secure", "minimal_post_processing_allowed"),
        DevRow("res_w", "global", "user_preferred_resolution_width"),
        DevRow("res_h", "global", "user_preferred_resolution_height")
    )

    /** `di` no tiene clave Android: se documenta y se descarta (nunca se inventa una). */
    const val UNMAPPED_DI: String =
        "di: sin clave Android en la allowlist de SettingsApplier; valor descartado (no se inventa clave)"

    /** `ott.*` no son settings de Android: son preferencias del player. */
    const val OTT_NOTE: String =
        "ott.*: preferencias de OTT Navigator (no Android Settings); se guardan en prefs de la app"

    /** Claves Android que este tag PUEDE tocar. Sirve de gate estático (subconjunto de la allowlist). */
    fun keys(): Set<String> = DEV_ROWS.map { it.key }.toSet()

    /** Valor del campo, ya como texto de setting. `null` = no declarado por el canal. */
    private fun valueOf(field: String, d: ExtShimOttDevice): String? = when (field) {
        "hdr_c" -> d.hdrConversionMode?.toString()
        "mcr" -> d.matchContentFrameRate?.toString()
        "mmp" -> d.minimalPostProcessing?.toString()
        "res_w" -> d.preferredWidth?.toString()
        "res_h" -> d.preferredHeight?.toString()
        else -> null
    }

    /**
     * Filas `<ns> <key> <val>` que el tag pide para el DISPOSITIVO, en orden estable.
     * NO filtra por allowlist: eso es de [SettingsApplier.allowsRow]. Una lista vacía
     * significa "el canal no declaró dev.*" (o solo declaró `di`).
     */
    fun rows(entry: ExtShimOtt): List<String> {
        val d = entry.device ?: return emptyList()
        val out = ArrayList<String>(DEV_ROWS.size)
        for (r in DEV_ROWS) {
            val v = valueOf(r.field, d) ?: continue
            out.add("${r.ns} ${r.key} $v")
        }
        return out
    }

    /** `dev.*` declarados que NO se pueden escribir (hoy: `di`). Para el recibo, sin silencios. */
    fun unmapped(entry: ExtShimOtt): List<String> {
        val d = entry.device ?: return emptyList()
        return if (d.deinterlace != null) listOf(UNMAPPED_DI) else emptyList()
    }

    /** Preferencias del player que viaja en `ott.*`. Vacío si el canal no las declara. */
    fun ottPrefs(entry: ExtShimOtt): Map<String, String> {
        val o = entry.ott ?: return emptyMap()
        val out = LinkedHashMap<String, String>(3)
        o.bufferMb?.let { out["ott_buffer_mb"] = trimNum(it) }
        o.hardwareDecoder?.let { out["ott_hw_decoder"] = it.toString() }
        o.aspect?.let { out["ott_aspect"] = it }
        return out
    }

    /** `8.0` → `"8"`; `7.5` → `"7.5"`. No inventa precisión. */
    private fun trimNum(v: Double): String {
        if (!v.isFinite()) return v.toString()
        return if (v == Math.floor(v)) v.toLong().toString() else v.toString()
    }

    /**
     * Vectores de los fixtures REALES del contrato (`tests/fixtures/extshimott_sample.m3u8`):
     * es_c01 completo, es_c02 sin `dev`, es_c03 parcial y un caso solo-`di`.
     * Puro: sin I/O, sin Android. Devuelve "PASS" o "FAIL:<motivo>".
     */
    fun selfCheck(): String {
        // es_c01 — dev completo (hdr_c 1, mcr 2, mmp 0, res_w 3840, res_h 2160, di off)
        val c01 = ExtShimOtt(
            id = "es_c01", version = 1, line = 20, targets = setOf(ExtShimOttTarget.OTT, ExtShimOttTarget.VLC, ExtShimOttTarget.KODI),
            device = ExtShimOttDevice(
                hdrConversionMode = 1, matchContentFrameRate = 2, minimalPostProcessing = 0,
                preferredWidth = 3840, preferredHeight = 2160, deinterlace = "off"
            ),
            ott = ExtShimOttOtt(bufferMb = 8.0, hardwareDecoder = 1, aspect = "fit")
        )
        val expect01 = listOf(
            "global hdr_conversion_mode 1",
            "secure match_content_frame_rate 2",
            "secure minimal_post_processing_allowed 0",
            "global user_preferred_resolution_width 3840",
            "global user_preferred_resolution_height 2160"
        )
        if (rows(c01) != expect01) return "FAIL:c01_rows=${rows(c01)}"
        if (unmapped(c01).size != 1) return "FAIL:c01_di_no_declarado"
        if (keys().size != 5) return "FAIL:keys=${keys()}"
        if (!keys().containsAll(listOf("hdr_conversion_mode", "match_content_frame_rate",
                "minimal_post_processing_allowed", "user_preferred_resolution_width",
                "user_preferred_resolution_height"))) return "FAIL:keys_set"
        // es_c02 — sin dev: no propone ninguna fila
        val c02 = ExtShimOtt(id = "es_c02", version = 1, line = 28, targets = setOf(ExtShimOttTarget.OTT))
        if (rows(c02).isNotEmpty()) return "FAIL:c02_rows_no_vacias"
        if (unmapped(c02).isNotEmpty()) return "FAIL:c02_unmapped_no_vacio"
        if (ottPrefs(c02).isNotEmpty()) return "FAIL:c02_prefs_no_vacias"
        // solo di: cero filas, un no-mapeado
        val diOnly = ExtShimOtt(id = "x", version = 1, line = 1, targets = setOf(ExtShimOttTarget.OTT),
            device = ExtShimOttDevice(deinterlace = "auto"))
        if (rows(diOnly).isNotEmpty()) return "FAIL:di_rows_no_vacias"
        if (unmapped(diOnly) != listOf(UNMAPPED_DI)) return "FAIL:di_unmapped"
        // ott.* exactos del fixture (buf 8 → "8", no "8.0")
        val expectPrefs = mapOf("ott_buffer_mb" to "8", "ott_hw_decoder" to "1", "ott_aspect" to "fit")
        if (ottPrefs(c01) != expectPrefs) return "FAIL:ott_prefs=${ottPrefs(c01)}"
        // ningún valor fuera del dominio del contrato puede colarse: la tabla es fija
        if (DEV_ROWS.any { it.ns != "global" && it.ns != "secure" && it.ns != "system" }) return "FAIL:ns"
        // unicidad de claves: dos campos no pueden escribir la misma clave
        if (DEV_ROWS.map { it.key }.toSet().size != DEV_ROWS.size) return "FAIL:dup_key"
        return "PASS"
    }
}
