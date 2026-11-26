package com.ape.crystalagent

/**
 * QoeContractPlan — NÚCLEO PURO de la aplicación del contrato QoE (`#EXT-X-APE-QOE-CONTRACT`)
 * en la APK. Sin Android, sin I/O, sin estado: recibe los knobs ya parseados por el shim
 * ([dev.venice.ottshim.QoeContractTap]) y devuelve QUÉ se puede escribir, QUÉ no y POR QUÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRUTH-GUARDS (los tres que deciden si esto sirve o es teatro)
 *
 * 1. **Sólo dos knobs tienen clave Android**, y son las que YA están en la allowlist medida
 *    de [SettingsApplier] (42 claves, `SettingsApplier.kt:320-379`):
 *      `ott.mcr` → `match_content_frame_rate`        0..2  (`:322`, regex `^[012]$`)
 *      `ott.mmp` → `minimal_post_processing_allowed` 0..1  (`:323`, regex `^[01]$`)
 *    No se añade NI UNA clave. `ott.hw`/`ott.hc` no son settings de Android: quedan como
 *    preferencias del player y se declaran DECLARED, nunca EXECUTED.
 *
 * 2. **`EXECUTED` exige recibo real**: la fila tiene que aparecer en el `applied` del
 *    [SettingsApplier] **y** la relectura del setting tiene que devolver el mismo valor
 *    ([receipt] recibe `readback`). Un `put` que devuelve true no basta.
 *
 * 3. **Escalera neutra de buffer**: `pb` (2..6) NO se convierte a ms — el contrato no
 *    documenta su unidad ni trae duración de segmento, así que inventar la conversión sería
 *    fabricar. El único lever real es `ott.buf` en **MiB** (misma unidad que `cache_mib`,
 *    `PlaybackPolicy.kt:41/58`), y [bufferDecision] NUNCA baja el valor actual: encender el
 *    bucle no puede reducir continuidad.
 *
 * Lo que este objeto NO hace: no escribe, no lee, no conoce el device. Ejecutar es de
 * [QoeContractApply] (Android), que además relee para el recibo.
 */
object QoeContractPlan {

    /** Un knob del contrato que SÍ tiene clave Android, con su dominio real. */
    data class KeyMap(val knob: String, val key: String, val min: Int, val max: Int)

    /**
     * La ÚNICA tabla knob→clave. Dos entradas, ambas ya allowlisted: no se amplía nada.
     * `hdr_conversion_mode` (0..3) no aparece porque el tag QoE no la emite; llega por
     * `#EXTSHIMOTT` y la aplica [ExtShimOttBridge] por su propio camino.
     */
    val KEYS: List<KeyMap> = listOf(
        KeyMap("ott.mcr", "match_content_frame_rate", 0, 2),
        KeyMap("ott.mmp", "minimal_post_processing_allowed", 0, 1)
    )

    /** Knobs que viajan en el tag pero NO son settings de Android (prefs del player). */
    val NO_KEY_KNOBS: List<String> = listOf("ott.hw", "ott.hc")

    /** `lock` es la clave donde el ns real varía por SoC: [SettingsApplier.putSetting] decide. */
    val NS_HINT: Map<String, String> = mapOf(
        "match_content_frame_rate" to "secure",
        "minimal_post_processing_allowed" to "secure"
    )

    /** Una fila `<ns> <key> <val>` propuesta, con el knob que la originó (trazabilidad). */
    data class Row(val ns: String, val key: String, val value: String, val knob: String) {
        fun wire(): String = "$ns $key $value"
    }

    /** Lo que hay que hacer con un contrato. `skipped` = motivo por knob, sin silencios. */
    data class Plan(
        val ch: String?,
        val rows: List<Row>,
        val prefs: Map<String, String>,
        val lines: List<Line>
    )

    enum class Status {
        /** Escrito y RELEÍDO con el mismo valor. */
        EXECUTED,
        /** Entendido pero no aplicable aquí (no es setting de Android / sin unidad convertible). */
        DECLARED,
        /** Sin consumidor: el valor se descarta con motivo. */
        UNMAPPED,
        /** Rechazado antes de escribir (fuera de dominio, allowlist o relectura distinta). */
        REJECTED
    }

    data class Line(
        val knob: String,
        val requested: String,
        val status: Status,
        val applied: Int,
        val value: String,
        val reason: String
    )

    // ───────────────────────────── plan ─────────────────────────────

    /**
     * Construye el plan desde los knobs del contrato, en el orden en que llegaron.
     * `knobs` = pares (nombre, valor tal cual lo escribió el emisor).
     */
    fun plan(ch: String?, knobs: List<Pair<String, String>>): Plan {
        val rows = ArrayList<Row>(2)
        val prefs = LinkedHashMap<String, String>(2)
        val lines = ArrayList<Line>(knobs.size)
        for ((name, raw) in knobs) {
            val map = KEYS.firstOrNull { it.knob == name }
            if (map != null) {
                val n = raw.trim().toIntOrNull()
                if (n == null) {
                    lines.add(Line(name, raw, Status.REJECTED, 0, "", "no es un entero: no se propone fila"))
                    continue
                }
                if (n < map.min || n > map.max) {
                    lines.add(
                        Line(
                            name, raw, Status.REJECTED, 0, "",
                            "fuera del dominio ${map.min}..${map.max} de ${map.key} (el contrato se valida otra vez aquí, defensa en profundidad)"
                        )
                    )
                    continue
                }
                val ns = NS_HINT[map.key] ?: "global"
                rows.add(Row(ns, map.key, n.toString(), name))
                // La línea nace DECLARED: [receipt] la asciende a EXECUTED sólo con recibo real.
                lines.add(Line(name, raw, Status.DECLARED, 0, "", "propuesta para ${map.key} (pendiente de escritura y relectura)"))
                continue
            }
            if (name in NO_KEY_KNOBS) {
                prefs["qoe_$name"] = raw
                lines.add(
                    Line(
                        name, raw, Status.DECLARED, 0, "",
                        "sin clave Android: se guarda como preferencia del player, no es un setting del sistema"
                    )
                )
                continue
            }
            lines.add(Line(name, raw, Status.UNMAPPED, 0, "", "knob sin consumidor en la APK: no se inventa mapeo"))
        }
        return Plan(ch, rows, prefs, lines)
    }

    /**
     * Recibo final: sube a `EXECUTED` SOLO la fila que el applier dice haber aplicado **y** cuya
     * relectura coincide. `appliedWire` = filas que [SettingsApplier.ApplyReport] reportó aplicadas.
     */
    fun receipt(plan: Plan, appliedWire: Set<String>, readback: (Row) -> Boolean): List<Line> {
        if (plan.rows.isEmpty()) return plan.lines
        val out = ArrayList<Line>(plan.lines.size)
        for (line in plan.lines) {
            val row = plan.rows.firstOrNull { it.knob == line.knob }
            if (row == null) {
                out.add(line)
                continue
            }
            when {
                row.wire() !in appliedWire -> out.add(
                    line.copy(
                        status = Status.REJECTED,
                        applied = 0,
                        value = "",
                        reason = "el applier NO aplicó ${row.key}=${row.value} (allowlist, SoC sin la clave o sin WRITE_SECURE_SETTINGS)"
                    )
                )
                !readback(row) -> out.add(
                    line.copy(
                        status = Status.REJECTED,
                        applied = 0,
                        value = "",
                        reason = "escrito ${row.key}=${row.value} pero la relectura NO coincide: no se declara aplicado"
                    )
                )
                else -> out.add(
                    line.copy(
                        status = Status.EXECUTED,
                        applied = 1,
                        value = row.value,
                        reason = "escrito y releído igual (${row.key}=${row.value})"
                    )
                )
            }
        }
        return out
    }

    // ────────────────────────── buffer (load control) ──────────────────────────

    enum class Action {
        /** El canal no declaró `ott.buf`: no se toca nada. */
        NO_TAG,
        /** Ya está en el objetivo (o el pedido lo bajaría): no se escribe. */
        UNCHANGED,
        /** Se escribe un valor mayor que el actual. */
        SET
    }

    data class Buffer(
        val action: Action,
        val current: Int,
        val requested: Int?,
        val target: Int,
        val reason: String
    )

    /**
     * Decisión de buffer por canal. Escalera **NEUTRA**: `target` nunca es menor que `current`,
     * así que encender el bucle no puede reducir continuidad. El techo es el mismo que aplica
     * [PlaybackPolicy.fromSync] (`coerceIn(16, 256)`, `PlaybackPolicy.kt:58`).
     */
    fun bufferDecision(requestedMb: Int?, currentMiB: Int, floor: Int = 16, cap: Int = 256): Buffer {
        val current = currentMiB.coerceIn(floor, cap)
        if (requestedMb == null) {
            return Buffer(Action.NO_TAG, current, null, current, "sin ott.buf: se mantiene el buffer actual ($current MiB)")
        }
        val target = requestedMb.coerceIn(floor, cap)
        if (target <= current) {
            return Buffer(
                Action.UNCHANGED, current, requestedMb, current,
                "pedido ${requestedMb}MiB → $target MiB no supera el actual $current MiB; escalera neutra: no se baja continuidad"
            )
        }
        return Buffer(
            Action.SET, current, requestedMb, target,
            "sube $current → $target MiB (pedido $requestedMb, rango $floor..$cap) antes de build(): LoadControl aún es influenciable"
        )
    }

    // ───────────────────────────── utilidades ─────────────────────────────

    /** Recibo de una línea para logcat / diagnóstico. */
    fun describe(lines: List<Line>): String {
        if (lines.isEmpty()) return "contrato sin knobs aplicables"
        val ex = lines.count { it.applied == 1 }
        val dec = lines.count { it.status == Status.DECLARED }
        val un = lines.count { it.status == Status.UNMAPPED }
        val rj = lines.count { it.status == Status.REJECTED }
        return buildString {
            append("ejecutados=").append(ex)
            append(" declarados=").append(dec)
            append(" sinMapeo=").append(un)
            append(" rechazados=").append(rj)
            for (l in lines) {
                append(" · ").append(l.knob).append('=').append(l.requested)
                append(':').append(l.status.name)
                if (l.applied == 1) append("→").append(l.value)
            }
        }
    }

    // ─────────────────────────── self-check puro ───────────────────────────

    /**
     * Autocomprobación PURA (sin Android, sin I/O). Devuelve "PASS ..." o "FAIL:<motivo>".
     * Los vectores son los valores REALES que emiten los inyectores del repo
     * (`ott:{"hw":1,"hc":1,"mcr":2,"mmp":0}`, `tools/ape_qoe_contract_inject.js:27`).
     */
    fun selfCheck(): String {
        // 1) plan con los knobs reales del emisor
        val knobs = listOf(
            "ott.hw" to "1", "ott.hc" to "1", "ott.mcr" to "2", "ott.mmp" to "0"
        )
        val p = plan("es_c01", knobs)
        if (p.rows.size != 2) return "FAIL:rows=${p.rows.size}"
        val mcr = p.rows.firstOrNull { it.knob == "ott.mcr" } ?: return "FAIL:sin_mcr"
        if (mcr.wire() != "secure match_content_frame_rate 2") return "FAIL:mcr_wire=${mcr.wire()}"
        val mmp = p.rows.firstOrNull { it.knob == "ott.mmp" } ?: return "FAIL:sin_mmp"
        if (mmp.wire() != "secure minimal_post_processing_allowed 0") return "FAIL:mmp_wire=${mmp.wire()}"
        if (p.prefs["qoe_ott.hw"] != "1" || p.prefs["qoe_ott.hc"] != "1") return "FAIL:prefs=${p.prefs}"
        // hw/hc NUNCA producen fila de setting
        if (p.rows.any { it.key == "ott.hw" || it.knob == "ott.hw" }) return "FAIL:hw_como_setting"

        // 2) EXECUTED exige recibo real: aplicada + relectura OK
        val ok = receipt(
            p,
            p.rows.map { it.wire() }.toSet(),
            { row -> row.value == "2" || row.value == "0" }
        )
        if (ok.count { it.applied == 1 } != 2) return "FAIL:receipt_ok=${ok.count { it.applied == 1 }}"
        if (ok.first { it.knob == "ott.mcr" }.status != Status.EXECUTED) return "FAIL:mcr_status"

        // 3) aplicada pero relectura DISTINTA -> REJECTED, applied=0
        val badBack = receipt(p, p.rows.map { it.wire() }.toSet(), { false })
        if (badBack.any { it.applied == 1 }) return "FAIL:relectura_mala_declaro_aplicado"
        if (badBack.first { it.knob == "ott.mcr" }.status != Status.REJECTED) return "FAIL:relectura_status"

        // 4) NO aplicada por el applier -> REJECTED
        val notApplied = receipt(p, emptySet(), { true })
        if (notApplied.any { it.applied == 1 }) return "FAIL:no_aplicada_declaro_aplicado"

        // 5) fuera de dominio -> REJECTED, sin fila
        val bad = plan("x", listOf("ott.mcr" to "5", "ott.mmp" to "9"))
        if (bad.rows.isNotEmpty()) return "FAIL:dominio_rows=${bad.rows.size}"
        if (bad.lines.count { it.status == Status.REJECTED } != 2) return "FAIL:dominio_lines"

        // 6) knob desconocido -> UNMAPPED (nunca se inventa mapeo)
        val unk = plan("x", listOf("net.gate" to "2.5", "cad.v" to "cfr"))
        if (unk.rows.isNotEmpty()) return "FAIL:unk_rows"
        if (unk.lines.count { it.status == Status.UNMAPPED } != 2) return "FAIL:unk_lines"

        // 7) escalera neutra de buffer
        val neutral = bufferDecision(8, 256)
        if (neutral.action != Action.UNCHANGED || neutral.target != 256) return "FAIL:buffer_neutral=${neutral.action}/${neutral.target}"
        val clamp = bufferDecision(512, 256)
        if (clamp.action != Action.UNCHANGED || clamp.target != 256) return "FAIL:buffer_clamp=${clamp.action}/${clamp.target}"
        val up = bufferDecision(128, 64)
        if (up.action != Action.SET || up.target != 128) return "FAIL:buffer_up=${up.action}/${up.target}"
        val noTag = bufferDecision(null, 256)
        if (noTag.action != Action.NO_TAG || noTag.target != 256) return "FAIL:buffer_notag"
        val floor = bufferDecision(4, 64)
        if (floor.action != Action.UNCHANGED) return "FAIL:buffer_floor=${floor.action}"

        // 8) describe no miente con lista vacía
        if (!describe(emptyList()).contains("sin knobs")) return "FAIL:describe_vacio"

        return "PASS knobs=4 filas=2 prefs=2 executed_con_recibo=2 " +
            "relectura_mala_no_aplica=2 fuera_dominio=2 sin_mapeo=2 buffer_neutro/up=OK"
    }
}
