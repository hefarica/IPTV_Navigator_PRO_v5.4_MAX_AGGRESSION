# APE Buffer Governor v2.0 — Las 25 Métricas

> **Estado de build:** F0 build-only local. El binario Rust compila y pasa `cargo
> check / test / clippy` (4/4 tests VERDE). El servicio hace bind en
> `127.0.0.1:8090` (NO `:8084` — ese puerto es el baseline dorado `ape-crystal-rust`
> vivo y CONGELADO).
>
> **Verdad honesta sobre `/metrics` hoy:** el handler `metrics_handler` de
> `rust/src/main.rs` emite **JSON**, no formato Prometheus, y hoy expone **9 campos
> agregados** (proceso/managers). Las 25 métricas de este documento son la
> **superficie de telemetría completa del sistema** (FSM + EWMA + prefetch +
> anti-403 + no-repeat + QoE + sidecar). Cada fila marca su **Fuente**:
> - **LIVE-9** = ya sale hoy en `GET /metrics` (F0).
> - **DECISION** = está en el `BufferDecision` que devuelve `POST /buffer/report`
>   (observable por respuesta, aún no agregada en `/metrics`).
> - **REPORT** = campo de entrada del `BufferReport` (lo manda el player/ARA/nginx;
>   se observa en ingest, aún no agregado).
> - **LUA-SHM** = contador en `ngx.shared` de la capa Lua (observable vía el server
>   de control loopback, aún no exportado a `/metrics`).
> - **DERIVED-F1** = derivable pero su **agregación a `/metrics` es trabajo de F1**
>   (requiere el pytest E2E + `nginx -t` reales, que sólo corren en Linux/VPS;
>   Windows App Control bloquea ejecutar el binario local).
>
> Nada de esto va a producción sin OK explícito. El E2E que valida los números
> reales es un **gate F1**, no F0.

---

## 0. Cómo leer `/metrics` hoy (F0)

```bash
# Directo al servicio (loopback). El puerto es 8090, NUNCA 8084.
curl -s http://127.0.0.1:8090/metrics | jq .

# A través de nginx (mismo upstream ape_buffer_governor, access_log off):
curl -s http://127.0.0.1:8091/metrics | jq .
```

Respuesta actual (los **9 campos LIVE-9**):

```json
{
  "requests":                 1234,
  "uptime_ms":                86400000,
  "decisions":                9821,
  "prefetch_queue_depth":     0,
  "prefetch_enqueued_total":  4410,
  "ledger_blocks":            3,
  "qoe_events":               57,
  "sidecar_in_flight":        2,
  "cache_index_len":          1180
}
```

`GET /health` complementa con `service / version / port / uptime_ms`.

> **Roadmap F1:** envolver el JSON en un `TextEncoder` Prometheus (`# HELP` / `# TYPE`)
> y agregar las métricas DECISION/REPORT/LUA-SHM por estado y por `error_class`. Las
> filas DERIVED-F1 abajo definen el contrato de esos nombres por adelantado.

---

## 1. Tabla completa — 25 métricas

Unidades: `count` = contador monotónico; `gauge` = valor instantáneo;
`ms`/`s`/`bps` = milisegundos/segundos/bits-por-segundo; `%` = porcentaje;
`ratio` = adimensional; `enum` = etiqueta categórica.

| # | Métrica | Significado | Unidad | Valores sanos | Cómo leerla en `/metrics` | Qué alertar | Fuente |
|---|---------|-------------|--------|---------------|---------------------------|-------------|--------|
| 1 | `requests` | Peticiones HTTP totales atendidas por el router de control (`inc_request` en cada handler). | count | Crece monotónico; tasa ≈ tráfico de reportes/zaps. | Campo `requests`. Derivar rate: `Δrequests / Δt`. | **Estancado** (rate=0) con tráfico esperado → servicio colgado/no recibe. | LIVE-9 |
| 2 | `uptime_ms` | Tiempo vivo del proceso desde `Metrics::new()`. | ms | Sube linealmente. | Campo `uptime_ms`. | **Reset a ~0** inesperado → crash/restart (cruzar con `OOMScoreAdjust 600`). | LIVE-9 |
| 3 | `decisions` | Decisiones FSM emitidas por el Governor (`POST /buffer/report` → `decide`). | count | Crece con cada reporte de buffer. | Campo `decisions`. | `decisions` plano mientras `requests` sube → reportes mal formados / no llegan al Governor. | LIVE-9 |
| 4 | `prefetch_queue_depth` | Tareas frescas pendientes en `PrefetchQueue` (`tasks.len()`). | gauge | **0–15**. Vacía rápido (el planner drena). | Campo `prefetch_queue_depth`. | **Sostenido >15** → el planner no drena (worker saturado / fetch lento). | LIVE-9 |
| 5 | `prefetch_enqueued_total` | Tareas de prefetch encoladas acumuladas. | count | Crece; ≈ `decisions` × profundidad media. | Campo `prefetch_enqueued_total`. | Crece sin que baje `queue_depth` → fugas de cola. | LIVE-9 |
| 6 | `ledger_blocks` | Veces que el NoRepeatLedger **rechazó** un segmento que repetiría/regresaría. | count | **Bajo y esporádico.** Subidas = protección actuando. | Campo `ledger_blocks`. Cruzar con `block_reason` (#19). | **Spike** → upstream re-sirviendo viejo, o pattern-learner mal calibrado. NUNCA debe ser 0 si hay regresiones reales (=guard apagado). | LIVE-9 |
| 7 | `qoe_events` | Eventos QoE ingeridos (rebuffer/VST/frames vía `qoe.ingest`). | count | Crece despacio; ideal cerca de plano (poco rebuffer). | Campo `qoe_events`. | **Pendiente empinada** → rebuffering masivo en la flota. | LIVE-9 |
| 8 | `sidecar_in_flight` | Slots de upscaling pesado (sidecar) ocupados ahora mismo. | gauge | **0 ≤ x ≤ 8** (`max_concurrent=8`). YELLOW ≤ 4. | Campo `sidecar_in_flight`. | **Pegado en 8** mucho tiempo → presupuesto agotado, releases perdidos. Debe ir a 0 al caer a ORANGE/RED. | LIVE-9 |
| 9 | `cache_index_len` | Entradas en el CacheIndex (URIs con estado fresh/stale/enhanced/original). | gauge | Acotado (rotación). Crece y se estabiliza. | Campo `cache_index_len`. | **Crecimiento ilimitado** → no hay evicción (riesgo memoria, cruzar OOM). | LIVE-9 |
| 10 | `buffer_state` | Estado FSM del canal: `GREEN`/`YELLOW`/`ORANGE`/`RED`/`BLACK`. | enum | Mayoría **GREEN/YELLOW**. | `BufferDecision.state`. F1: serie por etiqueta de estado. | **% en RED/BLACK alto o sostenido** → degradación de flota. BLACK = upstream muerto. | DECISION |
| 11 | `buffer_percent` | `buffer_s / capacity_s × 100`, recortado 0–100. | % | **≥70 GREEN**; 50–70 YELLOW; 30–50 ORANGE; <30 RED. | `BufferDecision.buffer_percent`. | **<30%** por canal sostenido = RED. Mediana de flota cayendo. | DECISION |
| 12 | `headroom` | `throughput_real / variant_bps`. <1.0 = la variante NO cabe en el ancho de banda. | ratio | **≥1.2 cómodo**; 1.0–1.2 ajustado; **<1.0 = downgrade**. | `BufferDecision.headroom`. | **<1.0 persistente** → variante demasiado pesada (dispara DowngradeVariant). | DECISION |
| 13 | `trend` | Tendencia EWMA (α=0.3): `improving`/`stable`/`degrading`/`collapsing`. | enum | **stable/improving** dominante. | `BufferDecision.trend`. | **`collapsing`** (ratio<0.5 y caída >25%) → resync live-edge inminente. Cluster de `degrading`. | DECISION |
| 14 | `action` | Acción decidida: `keep_quality`/`prefetch_more`/`disable_sidecar`/`downgrade_variant`/`live_edge_resync`/`hold_manifest`/`black_backoff`. | enum | `keep_quality`/`prefetch_more` mayoría. | `BufferDecision.action`. F1: contador por acción. | **Tasa alta de `live_edge_resync`/`black_backoff`** → inestabilidad upstream. | DECISION |
| 15 | `prefetch_depth` | N+ objetivo por estado: GREEN=3, YELLOW=6, ORANGE=10, RED=15, BLACK=0. | gauge | Coherente con el estado (invariante FSM). | `BufferDecision.prefetch_depth`. | **No coincide con el estado** → bug FSM (invariante roto). | DECISION |
| 16 | `sidecar_enabled` | Si el sidecar está permitido en el estado actual (sólo GREEN/YELLOW). | gauge (0/1) | 1 en GREEN/YELLOW; **0 en ORANGE/RED/BLACK**. | `BufferDecision.sidecar_enabled`. | **=1 mientras estado es ORANGE/RED** → invariante "no upscaling con buffer bajo" roto. | DECISION |
| 17 | `upstream_throughput_bps` | Throughput de upstream observado para el canal (entrada del reporte). | bps | ≥ `variant_bps` (headroom≥1). | `BufferDecision.upstream_throughput_bps`. | **Caída a ~0** = upstream muerto → BLACK. | DECISION |
| 18 | `throughput_ewma_bps` | Media móvil exponencial del throughput por canal (estado interno del ThroughputModel). | bps | Suave; sigue al real sin picos. | F1: exportar `ewma_bps` por canal. Hoy: inferible de `trend`. | **Divergencia EWMA vs real** sostenida → red inestable. | DERIVED-F1 |
| 19 | `block_reason` | Desglose de `ledger_blocks` por causa: `media_sequence_regression`/`uri_already_served`/`hash_already_served`/`program_date_time_regression`/`stale_replacing_future`. | enum/count | Mayoría 0; picos puntuales. | Hoy: `BlockReason` en logs del guard. F1: contador por etiqueta. | **`media_sequence_regression` o `program_date_time_regression` recurrente** → upstream sirviendo pasado (riesgo de freeze por repetición). | DERIVED-F1 |
| 20 | `error_class` | Clasificación del fallo de fetch: `auth_token_problem` (401), `provider_block` (403/429), `temporary_upstream` (5xx/timeout). | enum/count | Cerca de 0. | `FetchResult.error_class` (logs hoy). F1: contador por clase. | **`provider_block` en ráfaga** = anti-sharing → cooldown (anti-403 capa 2). **`auth_token_problem`** = token caducado. NUNCA convertir 403→200 ciego (invariante). | DERIVED-F1 |
| 21 | `fetches_total` | Segmentos pedidos por el SegmentFetcher (`fetches` atómico). | count | Crece con prefetch + on-demand. | F1: exportar `SegmentFetcher.fetches`. | **Ratio fallos/total alto** (cruzar #20) → upstream degradado. | DERIVED-F1 |
| 22 | `live_edge_gap_detected` | Veces que LiveEdgeProbe detectó un salto > 3 secuencias respecto a lo último visto. | count | Bajo. Subidas → resync legítimo. | `LiveEdgeResult.gap_detected` (logs). F1: contador. | **Frecuente por canal** → manifest con huecos / pérdida de continuidad. Dispara `live_edge_resync`. | DERIVED-F1 |
| 23 | `rebuffer_count` | Rebuffers reportados por el player en el `BufferReport` (entrada). | count | **0** ideal. | `BufferReport.rebuffer_count` (alimenta #7). | **>0 recurrente** por canal → mala QoE; cruzar con `buffer_state`. | REPORT |
| 24 | `live_edge_delta_ms` | Distancia del player al borde vivo (entrada del reporte). | ms | **Pequeño y estable** (cerca del live edge). | `BufferReport.live_edge_delta_ms`. | **Crecimiento monótono** → el player se queda atrás (drift), candidato a resync. | REPORT |
| 25 | `prefetch_inflight` | Concurrencia de prefetch activa en la capa Lua (cooldown/slot por canal en `ape_prefetch_ctrl`). | gauge | Acotado por el slot (incr/decr atómico). | LUA-SHM: `ape_prefetch_ctrl[CTRL_KEY]` vía server de control. | **No vuelve a 0** tras la ventana → slot no liberado / cooldown atascado. | LUA-SHM |

---

## 2. Lectura por subsistema

**FSM del Governor (10–17):** la salud se resume en la **distribución de
`buffer_state`** y la **tasa de `action`**. Flota sana = mayoría `GREEN/YELLOW` +
`keep_quality/prefetch_more`. Los invariantes #15 (`prefetch_depth` coherente con
estado) y #16 (`sidecar_enabled=0` bajo buffer bajo) son **alarmas de bug**, no de
operación: si saltan, el FSM está roto, no el upstream.

**EWMA throughput (12, 13, 17, 18):** `headroom<1.0` + `trend=collapsing` es el
disparador canónico de `downgrade_variant` / `live_edge_resync`. Vigilar el
**cluster** (muchos canales a la vez = problema de red/VPS; uno solo = canal/CDN).

**No-repeat ledger (6, 19):** la regla madre — *buffer bajo NO se resuelve repitiendo
video viejo*. `ledger_blocks` debe **moverse** cuando el upstream intenta regresar;
`block_reason` dice por qué. Un `0` permanente con regresiones reales = guard apagado.

**Anti-403 4 capas (20, 21, 22):** `error_class` separa **auth** (401),
**provider_block** (403/429 anti-sharing → cooldown) y **temporary_upstream** (5xx
→ BLACK/backoff). El invariante: el 403 se **clasifica**, jamás se enmascara como
200 infinito.

**Prefetch (4, 5, 15, 25):** cola (`queue_depth`) + acumulado (`enqueued_total`) +
objetivo por estado (`prefetch_depth`) + concurrencia Lua (`prefetch_inflight`). Si
`queue_depth` no drena o `prefetch_inflight` no vuelve a 0 → worker saturado.

**QoE / sidecar (7, 8, 16, 23, 24):** `qoe_events`/`rebuffer_count` = experiencia
real; `sidecar_in_flight` (≤8, ≤4 en YELLOW) = coste de procesamiento, **lo último
en la jerarquía** — debe ceder primero ante cualquier presión de buffer.

---

## 3. Umbrales de alerta (resumen accionable)

| Severidad | Condición | Acción operativa |
|---|---|---|
| **CRÍTICO** | `buffer_state=BLACK` sostenido en ≥N canales · `error_class=temporary_upstream` en ráfaga | Upstream/CDN muerto. Verificar proveedor; el governor ya hace hold+backoff (no toca playback). |
| **CRÍTICO** | `sidecar_enabled=1` con estado ORANGE/RED · `prefetch_depth` ≠ tabla FSM | **Invariante roto** → revertir build, NO desplegar. |
| **ALTO** | `provider_block` (403/429) en ráfaga por canal | Anti-sharing del proveedor → confirmar cooldown (anti-403 capa 2); rotar sólo hosts propios autorizados. |
| **ALTO** | `media_sequence_regression`/`program_date_time_regression` recurrente | Upstream sirviendo pasado → riesgo de repetición; el ledger ya bloquea, investigar fuente. |
| **ALTO** | `prefetch_queue_depth` > 15 sostenido · `prefetch_inflight` no baja a 0 | Worker saturado / fetch lento → revisar CPUQuota y latencia upstream. |
| **MEDIO** | `headroom<1.0` + `trend=degrading/collapsing` por canal | Variante demasiado pesada → downgrade esperado; vigilar si es flota completa. |
| **MEDIO** | `qoe_events`/`rebuffer_count` con pendiente empinada | QoE cayendo; correlacionar con `buffer_state`. |
| **BAJO** | `live_edge_delta_ms` creciente · `live_edge_gap_detected` frecuente | Drift del player → resync legítimo; alarmar sólo si es persistente. |

---

## 4. Verdad honesta (gate F0 vs F1)

- **F0 (hoy, local):** sólo **LIVE-9** salen por `GET /metrics` (JSON). El build es
  verde (`cargo check/test/clippy`, 4/4), 6 Lua sin un solo `ngx.exit` (invariante
  autopista respetado), `buffer_governor.conf` corregido (`:8090`, SSRF eliminado,
  403 clasificado), systemd `ape-buffer-governor.service` (User no-root, CPUQuota
  120%, OOMScoreAdjust 600). El binario **no se ejecuta en Windows** (App Control).
- **F1 (VPS/Linux, requiere CONFIRM=yes):** las filas **DECISION / REPORT / LUA-SHM
  / DERIVED-F1** se agregan a `/metrics` y se validan con **pytest E2E real** +
  **`nginx -t` real**. Esos son los gates que prueban los números de verdad — y
  **sólo corren en Linux/VPS**, no en este build local.
- **Baseline dorado:** `ape-crystal-rust` en `:8084` (`/shield/`) queda
  **CONGELADO E INTACTO**. El Buffer Governor vive en `:8090`. Nada a producción sin
  OK explícito.
