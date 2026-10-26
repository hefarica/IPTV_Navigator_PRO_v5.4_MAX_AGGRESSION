# CHANNELS_MAP_DIFF — Comparativa de las copias de `channels_map.json`

**Tarea:** t5 / T4 · **Auditor:** `json-ssot` · **Método:** streaming por chunks de 8 MB (nunca se cargaron 73 MB
en memoria; nunca se imprimió un canal completo).

**Copias auditadas (hash + mtime medidos):**

| Alias | Ruta | Bytes | mtime (Bogotá) | SHA-256 |
|---|---|---:|---|---|
| **C1** | `IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json` | 75.107.356 | 2026-06-09T01:00:49-05:00 | `AFA3BB513FC46EA836355EB5C8F8E10C21B5C6C9E96972994B2A7A75CC7698DD` |
| **C2** | `IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json` | 29.351.317 | 2026-04-02T19:13:56-05:00 | `96B38F96AB79B716CB50C6D238BF126BD2AD344F4D3E931C98645147D969F7F6` |
| **C3** | `IPTV_v5.4_MAX_AGGRESSION/frontend/data/channels_map.json` | 28.410.531 | 2026-03-16T21:48:13-05:00 | `9D1920920217ED9CD4B34E53C414DBF31E0273D6619243F9F89B6B72ACB2A1E9` |
| **C2b** | `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/backend/channels_map.json` | 29.351.317 | 2026-04-02T19:13:56-05:00 | `96B38F96…F7F6` (**duplicado exacto de C2**) |

---

## 1. Conteos y forma del contenedor

| Métrica | C1 | C2 | C3 |
|---|---:|---:|---:|
| Registros (claves top-level) | **9.293** | **8.366** | **8.366** |
| Claves duplicadas dentro del archivo | **0** | **0** | **0** |
| Tipo del nodo raíz | `object` | `object` | `object` |
| Profundidad máxima | 5 | 4 | 4 |
| Campos por registro (unión) | **170** | **105** | **104** |
| Tamaño de registro mín/máx | 7.856 / 33.510 B | 3.452 / 16.146 B | 3.341 / 16.034 B |
| Tamaño medio de registro | 8.043 B | 3.491 B | 3.380 B |
| Objetos anidados por registro (6 en C1 / 5 en C2-C3) | `codec_priority, degradation_chain, abr_ladder, math_telemetry, fusion_directives, interdependency` | `math_telemetry, fusion_directives, codec_priority, abr_ladder, degradation_chain` | = C2 |

**Namespace de claves — los tres archivos NO comparten identificadores:**

| Namespace | C1 | C2 | C3 |
|---|---:|---:|---:|
| Claves puramente numéricas | 0 | **5.973** | **5.973** |
| Claves con `_` (formato `slug_streamid`) | **9.293** | 0 | 0 |
| Claves con puntos (formato `Nombre.país`, p.ej. `01TV.fr`) | 0 | **2.393** | **2.393** |
| Longitud de clave mín/máx | 12 / 48 | — | — |
| Prefijo de país más frecuente en C1 | `us` 939 · `fr` 750 · `de` 701 · `uk` 571 · `ar` 526 · `it` 450 · `nl` 418 · `es` 309 · `tr` 227 · `be` 212 · `ro` 205 · `gr` 183 | — | — |

---

## 2. Huérfanos y correlación de identidades

Identidad declarada: C1 expone `stream_id` + `tvg_id` + `slug`; C2/C3 **no tienen `stream_id`** (sólo 1 registro
en C2 lo tiene: clave `392200`) y **no tienen `tvg_id`**; su identidad es **la clave**.

| Correlación | Resultado medido |
|---|---|
| `C1.stream_id` distintos | 9.293 |
| `C2` claves numéricas | 5.973 |
| **C1.stream_id ∩ C2 top-level keys** | **5.973** (100 % de las numéricas de C2 están en C1) |
| **C1.stream_id huérfanos** (no existen en C2) | **3.320** (35,7 % del mapa nuevo) |
| **C2 claves sin `stream_id` en C1** | **2.393** (todas las claves con puntos; no son huérfanas: son otro namespace) |
| Sufijo `_<id>` de la clave de C1 ∩ C2 keys | 5.973 (coincide exactamente con `stream_id`) |
| `C2 top-level keys` ∩ `C3 top-level keys` | **8.366 / 8.366 = 100 % idénticas** |
| `C2` claves ausentes en C3 | **0** |
| `C3` claves ausentes en C2 | **0** |

**Lectura:** C1 (2026-06-09) es un **superconjunto** de C2/C3 en el espacio de `stream_id` (5.973 compartidos +
3.320 nuevos). No hay pérdida de canales entre C2 y C1; hay **3.320 altas**. Las 2.393 claves con puntos son un
catálogo paralelo por nombre de canal que C1 ya no usa (migró a `slug_streamid`).

---

## 3. Duplicados y colisiones

| Chequeo | C1 | C2 | C3 |
|---|---:|---:|---:|
| Claves repetidas literales | 0 | 0 | 0 |
| **Colisiones case-insensitive** (misma identidad con distinta caja) | **0 grupos** | **503 grupos** | **503 grupos** |
| Registros "extra" por colisión | 0 | **503** | **503** |

Ejemplos de colisión en C2/C3 (pares exactos):

```
"12Keshet.il" / "12keshet.il"      "13Reshet.il" / "13reshet.il"
"13thStreet.de" / "13thstreet.de"  "192TV.nl" / "192tv.nl"
"24Kitchen.nl" / "24kitchen.nl"    "24Kitchen.pt" / "24kitchen.pt"
"24Kitchen.rs" / "24kitchen.rs"    "24Kitchen.tr" / "24kitchen.tr"
"4Seven.uk" / "4seven.uk"          "AB1.fr" / "ab1.fr"
```

**C1 resolvió el problema** (0 colisiones). C2 y C3 lo arrastran (doble emisión potencial / EPG partido).

---

## 4. Campos faltantes entre copias

**67 campos existen en C1 y NO en C2** (lista completa):

`slug, tvg_id, tvg_logo, server, username, password, url_m3u8, url_ts, quality_level, resolution, res_w, res_h,
bandwidth, avg_bandwidth, codec_rfc6381, degradation_levels, current_level, catchup_enabled, catchup_days,
catchup_source, guardian_enabled, guardian_state, guardian_consecutive_fails, guardian_last_check,
guardian_fallback_level, qos_dscp_class, qos_priority, qos_target_bitrate_kbps, qos_min_bitrate_kbps,
qos_max_bitrate_kbps, qos_abr_enabled, qos_parallel_segments, qoe_score, qoe_label, qoe_mos_target,
qoe_rebuffer_tolerance_secs, buffer_target_secs, buffer_min_secs, buffer_max_secs, prebuffer_secs,
circuit_breaker_state, circuit_breaker_failures, circuit_breaker_threshold, circuit_breaker_timeout_secs,
memory_last_position_secs, memory_last_played_at, memory_total_watch_secs, memory_sessions, memory_avg_qoe,
net_avg_latency_ms, net_avg_jitter_ms, net_avg_packet_loss_pct, net_avg_bandwidth_kbps, net_last_measured,
resilience_strategy, resilience_max_retries, resilience_retry_backoff, resilience_silent_reconnect,
resilience_health_probe_interval_secs, resilience_uptime_pct, resilience_total_failures,
resilience_total_successes, sync_version, sync_timestamp, sync_source, interdependency`

**1 campo existe en C2 y NO en C1**: `ext_x_map_uri`.
**1 campo existe en C2 y NO en C3**: `stream_id` (presente en 1 solo registro de C2: clave `392200`).

**Consecuencia dura:** C2/C3 **no pueden resolver una URL**. No tienen `server`, `username`, `password`,
`url_m3u8` ni `url_ts`. Cualquier componente backend que dependa de C2 para construir la URL
(`{server_url}/live/{user}/{pass}/{stream_id}.m3u8`, plantilla declarada en
`lab_master…nivel3_per_layer.URL[0].value`) **no tiene los datos**: sólo tiene el id. C1 sí los tiene.

---

## 5. Perfiles por copia (crosstab perfil × resolución × códec × HDR)

### C1 — `frontend/channels_map.json` (9.293 canales)

| `profile` | `quality_level` | `resolution` | `codec_rfc6381` | `hdr_profile` | Canales |
|---|---|---|---|---|---:|
| `P0` | `8K` | `8K` | `hvc1.2.4.L183.B0` | `hdr10_plus` | **381** |
| `P1` | `4K` | `4K` | `hvc1.2.4.L150.B0` | `hdr10` | **3.287** |
| `P1` | `4K` | `4K` | `hvc1.2.4.L150.B0` | `hdr10_plus` | **471** |
| `P2` | `FHD` | `1080p` | `avc1.640028` | `sdr` | **4.703** |
| `P2` | `FHD` | `1080p` | `avc1.640028` | `hdr10` | **451** |

Otros agregados de C1 (9.293 cada uno): `cmaf_delivery_mode` = `inline` 100 % · `lcevc_state`
`SIGNAL_ONLY` 4.139 / `OFF` 5.154 · `lcevc_base_codec` `hevc` 4.139 / `h264` 5.154 · `cmaf_profile` `live` 4.139 /
`vod` 5.154 · `color_primaries` `bt2020` 4.590 / `bt709` 4.703 · `transfer_characteristics` `smpte2084` 4.590 /
`bt709` 4.703 · `dolby_vision_profile` `"0"` 8.822 / `"8"` 471.

**Perfiles ausentes en C1: P3, P4, P5** → `UNKNOWN` por ausencia.

### C2 — `backend/channels_map.json` (8.366 canales)

| `profile` | `hdr_profile` | Canales |
|---|---|---:|
| `P0` | `dolby_vision` | **7** |
| `P0` | `sdr` | **1** |
| `P1` | `sdr` | **295** |
| `P2` | `sdr` | **3.435** |
| `P2` | `dolby_vision` | **2** |
| `P3` | `sdr` | **4.600** |
| `P3` | `dolby_vision` | **9** |
| `P4` | `sdr` | **17** |

C2 **no tiene** `resolution`, `quality_level`, `codec`, `codec_rfc6381`, `res_w/res_h`, `bandwidth` →
en este archivo no hay ninguna declaración de códec ni de resolución que auditar (todo `UNKNOWN` desde C2).
Otros agregados: `cmaf_delivery_mode` `inline` 100 % · `cmaf_profile` `live` 100 % · `lcevc_state` `OFF` 100 % ·
`lcevc_base_codec` `h264` 100 % · `color_primaries` `bt709` 100 % · `transfer_characteristics` `bt709` 100 % ·
`dolby_vision_profile` = `""` (cadena vacía) en **8.366/8.366** → **DV declarado sin perfil**.

**Perfiles ausentes en C2: P5** → `UNKNOWN` por ausencia.

### C3 — `frontend/data/channels_map.json` (8.366 canales) — drift de contenido contra C2

| Perfil | C2 | C3 | Δ |
|---|---:|---:|---:|
| P0 | 8 | 8 | 0 |
| **P1** | **295** | **294** | **−1** |
| **P2** | **3.437** | **3.438** | **+1** |
| P3 | 4.609 | 4.609 | 0 |
| P4 | 17 | 17 | 0 |

Es decir: **un canal migró de P1 a P2 entre C3 (2026-03-16) y C2 (2026-04-02)** con los mismos 8.366 ids.
No es ruido: es drift de calibración de perfil por canal.

---

## 6. Alineación códec mapa ↔ SSOT LAB (ley `L9`)

| Perfil | `channels_map.codec_rfc6381` (C1) | `lab_master.profiles_calibrated.Pn.settings.codec_full` | Veredicto |
|---|---|---|---|
| P0 | `hvc1.2.4.L183.B0` | `dvh1.08.06` | **FAIL** (HEVC L5.3 vs DV 8.1) |
| P1 | `hvc1.2.4.L150.B0` | `hvc1.2.4.L153.B0` | **FAIL** (L5.0 vs L5.1) |
| P2 | `avc1.640028` | `hvc1.2.4.L150.B0` | **FAIL** (AVC vs HEVC Main10 L5.0) |
| P3/P4/P5 | — (ausentes) | ver matriz | **UNKNOWN** |

También: el mapa declara `P0 = 8K` con `hvc1.2.4.L183.B0` (L5.3 = 8K@60 en la tabla del repo) pero el perfil
P0 del LAB es Dolby Vision; y declara `hdr10_plus` donde el LAB dice `DOLBY_VISION_P8`
(`profiles_calibrated.P0.settings.hdrMode`). El mapa es, en la práctica, **una tercera calibración**.

---

## 7. Cobertura y UNKNOWN declarados

**Cobertura real (medida):**

- **100 %** de los registros de las 3 copias fueron **enumerados** (9.293 + 8.366 + 8.366) y su **nombre de
  campo** extraído registro a registro (170 / 105 / 104 campos).
- **100 %** de los 14 campos de baja cardinalidad por copia fueron **agregados** (tablas §5).
- **1,7 s** de CPU para recorrer los 75 MB de C1 en chunks de 8 MB (memoria estable, sin carga completa).

**UNKNOWN declarado (no promediado):**

| UNKNOWN | Motivo |
|---|---|
| Contenido interno de `codec_priority`, `abr_ladder`, `degradation_chain`, `math_telemetry`, `fusion_directives`, `interdependency` | se verificó presencia al 100 % y tipo `object`/`array`; no se recorrió su interior |
| `fps` por canal | el campo no existe en ningún esquema de las 3 copias → la Ley Cardinal 1 a nivel canal sólo puede evaluarse por nivel-de-códec vs `res_w/res_h` |
| Valores de `qoe_*`, `memory_*`, `net_*`, `resilience_*`, `circuit_breaker_*` en C1 | son telemetría por canal (36 campos); sólo se verificó presencia al 100 %, no sus valores |
| Diff de contenido C2 ↔ C3 campo a campo | se compararon conjuntos de claves (idénticos) y agregados por perfil (Δ 1 canal); no se hizo diff de 8.366 registros × 105 campos |
| Canales individuales | prohibido imprimirlos; no se citan nombres ni URLs en este informe |

---

## 8. Hallazgos accionables (para el lane APP/VPS y para remediación SSOT)

1. **C2/C3 no sirven para resolver URL** (sin `server/user/pass/url_*`). Si el backend resuelve por C2, está
   usando otro path o C1. Verificar en el lane VPS (fuera de alcance aquí).
2. **C1 no tiene P3/P4/P5**: el mapa sólo cubre 3 de los 6 perfiles del LAB → 55,2 % de los canales (5.154/9.293)
   está en P2 con AVC, no con el códec Main10 del perfil P2 del LAB.
3. **503 colisiones case-insensitive** en C2/C3 (riesgo de doble emisión y de EPG partido) — C1 las eliminó.
4. **3.320 altas** de canal entre C2 (04-02) y C1 (06-09) no reflejadas en backend → el backend está 68 días
   atrás en cobertura.
5. **`dolby_vision_profile = ""` en 8.366/8.366 de C2** con `hdr_profile = "dolby_vision"` en 18 canales →
   declara DV sin perfil (mentira al player, riesgo FZ por decoder).
6. **C2b es una copia exacta** de C2: no aporta versión, sólo peso (29,4 MB duplicados en el árbol).
