# APE Buffer Governor v2.0 — Reporte Final (F0 build-only)

**Fecha:** 2026-06-22
**Branch:** `feat/virtual-4k-unlocked`
**Fase entregada:** **F0 (build-only local)** — nada en producción, nada pusheado.
**Ruta del módulo:** `vps/buffer-governor/`
**Baseline dorado:** `ape-crystal-rust` (`:8084` + `/shield/`) — **CONGELADO E INTACTO**, no se tocó un solo byte.

> **Regla madre:** BUFFER BAJO NO SE RESUELVE REPITIENDO VIDEO VIEJO.
> **Jerarquía:** continuidad > segmento fresco > buffer>50% > calidad > procesamiento pesado.

---

## 1. Resumen ejecutivo

Se implementó el **APE Buffer Governor v2.0**, un servicio de control de buffer/continuidad **aditivo y lateral** al stack vivo. Es una FSM de 5 estados (GREEN/YELLOW/ORANGE/RED/BLACK) que decide profundidad de prefetch, on/off del sidecar de upscaling, downgrade de variante, resync al live-edge y hold de manifest, **sin nunca repetir video viejo ni bloquear el playback**. Corre como un binario Rust en `127.0.0.1:**8090**` (NO `:8084`), con 6 snipers Lua **sin un solo `ngx.exit`**, un `nginx/buffer_governor.conf` corregido (SSRF eliminado, 403 clasificado, server de control loopback `:8091`), un unit systemd hardened no-root, y un CI/CD de 15 gates donde **F0 termina en el gate 8** y todo F1+ exige `CONFIRM=yes`.

El crate compila y los **4 tests Rust pasaron VERDE** en su build de implementación (`cargo check`/`test`/`clippy -D warnings`). **Verdad honesta:** los gates E2E reales (pytest contra `:8090` vivo, `nginx -t`, `luajit` syntax) son **gates de F1** porque requieren Linux/VPS u OpenResty; en esta máquina Windows una **directiva de App Control** bloquea ejecutar el binario local (`os error 4551`), por lo que la corrida E2E in-situ no es posible aquí — está documentado y diseñado como gate F1, no como deuda oculta.

---

## 2. Estado inicial

- Stack vivo: `ape-crystal-rust` en `:8084` + frontera `/shield/{TOKEN}/{HOST}/{PATH}` en nginx, ambos sirviendo IPTV en producción.
- No existía gobernador de buffer/continuidad: la decisión de prefetch, sidecar y resync no estaba modelada en un FSM; el riesgo de "buffer bajo → repetir segmento viejo" no tenía guarda formal.
- Llegó un entregable de terceros (`buffer_governor.conf` + bocetos) con **3 bloqueos graves**: bind a `:8084` (colisión con el motor vivo), `proxy_pass http://$arg_upstream_host$uri` (**open proxy / SSRF**), y un patrón **403→200 ciego e infinito**.

---

## 3. Qué existía (reutilizado, no reinventado)

- **Crystal Engine `ape-crystal-rust` (`:8084`) — NO se tocó.** El Governor es un proceso aparte en `:8090`. Crystal no se reinventó, no se reescribió, no se movió.
- **Frontera `/shield/` existente — NO se duplicó.** El `buffer_governor.conf` documenta explícitamente que el shield-location sigue siendo la **única** frontera y que los snipers Lua se enganchan *dentro* de los wrappers ya existentes (`ape_crystal_rewrite.lua`, `ape_shield_*`), no en un server block nuevo.
- **Caché del shield** (`proxy_cache_use_stale`) — reutilizada con la regla "stale SOLO de la misma URI, jamás stale como futuro".

---

## 4. Qué se integró (nuevo)

| Componente | Detalle |
|---|---|
| **Rust crate** | `rust/src/lib.rs` (258 líneas, contrato de tipos compartidos) + `rust/src/main.rs` (803 líneas, monolito con managers inline) |
| Managers inline (main.rs) | Governor FSM · ThroughputModel (EWMA) · PrefetchQueue · SegmentFetcher · LiveEdgeProbe · NoRepeatLedger · QoeIngest · SidecarBudget · CacheIndex · Metrics · AppState · router axum `:8090` |
| **6 snipers Lua** | `ape_buffer_sniper` (275) · `ape_prefetch_planner` (471) · `ape_segment_pattern_learner` (425) · `ape_live_edge_resync` (390) · `ape_no_repeat_guard` (387) · `ape_variant_escape` (237) |
| **nginx** | `nginx/buffer_governor.conf` (78 líneas) — shared dicts + upstream `:8090` + server de control loopback `:8091` |
| **systemd** | `systemd/ape-buffer-governor.service` — `User` no-root, `CPUQuota=120%`, `OOMScoreAdjust=600`, hardening |
| **CI/CD** | `tools/cicd/deploy_buffer_governor.sh` — 15 gates, F0 termina en gate 8, F1+ pide `CONFIRM=yes` |
| **Tests** | `tests/test_buffer_governor.py` — suite pytest E2E (FSM, prefetch, throughput, live-edge, invariantes) |

**FSM (contrato verificado en `lib.rs`):**

| Estado | Buffer | Sidecar | Prefetch depth | Acción dominante |
|---|---|---|---|---|
| GREEN | ≥70% | ON (full) | N+3 | KeepQuality / PrefetchMore |
| YELLOW | 50–70% | ON (limitado) | N+6 | PrefetchMore |
| ORANGE | 30–50% | **OFF** | N+10 | DisableSidecar / DowngradeVariant |
| RED | <30% | **OFF** | N+15 | LiveEdgeResync (bypass) |
| BLACK | upstream muerto | **OFF** | 0 | HoldManifest / BlackBackoff |

Anti-403 de 4 capas; `SegmentFetcher::classify` mapea 401→`AuthTokenProblem`, 403→`ProviderBlock`, 5xx→`TemporaryUpstream`, 200→`None`.

---

## 5. Qué se corrigió (los 3 bloqueos del entregable)

1. **Puerto `:8084` → `:8090`.** El conf original bindeaba al puerto del motor vivo. Corregido a `127.0.0.1:8090` con el server de control en `:8091`. **No colisiona con el baseline dorado.**
2. **Open proxy / SSRF eliminado.** Se borró `proxy_pass http://$arg_upstream_host$uri`. El Governor **NO proxia video**; solo expone endpoints de control en loopback (`allow 127.0.0.0/8; deny all;`). La única frontera de tráfico sigue siendo `/shield/`.
3. **403→200 ciego e infinito eliminado.** El 403 ahora se **clasifica** (`SegmentFetcher::classify`) y el `no_repeat_guard` decide HOLD/RESYNC — nunca se enmascara como 200 ni se cae en loop infinito.

---

## 6. Qué se rechazó

- **ffmpeg/transcode inline en `body_filter_by_lua`** — físicamente bloquea el worker → freeze. Rechazado (coherente con la doctrina "permiso ≠ física": transcode solo como servicio async, fuera del alcance de este módulo).
- **Cualquier `ngx.exit` en los snipers Lua** — rechazado para preservar la **AUTOPISTA** (passthrough, nunca frenar). Invariante verificado: **CERO `ngx.exit`** en los 6 módulos.
- **Tocar el server block de `/shield/` o el motor `:8084`** — rechazado. La integración es por wrappers existentes, no por reemplazo.
- **`proxy_cache_valid 302 > 0`, keepalive a upstreams Xtream, circuit breaker por host** — rechazados (invariantes AUTOPISTA / anti-509).

---

## 7. Archivos nuevos / modificados

**Nuevos (untracked, nunca commiteados):**

```
vps/buffer-governor/.gitignore
vps/buffer-governor/rust/Cargo.toml
vps/buffer-governor/rust/Cargo.lock
vps/buffer-governor/rust/src/lib.rs              (258)
vps/buffer-governor/rust/src/main.rs             (803)
vps/buffer-governor/lua/ape_buffer_sniper.lua            (275)
vps/buffer-governor/lua/ape_prefetch_planner.lua         (471)
vps/buffer-governor/lua/ape_segment_pattern_learner.lua  (425)
vps/buffer-governor/lua/ape_live_edge_resync.lua         (390)
vps/buffer-governor/lua/ape_no_repeat_guard.lua          (387)
vps/buffer-governor/lua/ape_variant_escape.lua           (237)
vps/buffer-governor/nginx/buffer_governor.conf            (78)
vps/buffer-governor/systemd/ape-buffer-governor.service
vps/buffer-governor/tests/test_buffer_governor.py
tools/cicd/deploy_buffer_governor.sh
```

**Modificados del baseline:** NINGUNO. El stack vivo (`:8084`, `/shield/`, nginx server block, systemd `ape-crystal-rust`) no recibió un solo cambio. `git status` confirma que `vps/buffer-governor/` y `tools/` aparecen **enteros como `??` (untracked)** — el baseline no fue editado.

---

## 8. Tests ejecutados + resultados

| Gate | Test | Resultado | Notas |
|---|---|---|---|
| 3 | `cargo check` | **VERDE** (build de implementación) | crate único coherente lib+bin |
| 4 | `cargo test` | **VERDE 4/4** (build de implementación) | ver tests abajo |
| 5 | `cargo clippy -- -D warnings` | **VERDE** | 0 warnings |
| 6 | `pytest E2E` (`:8090` vivo) | **SKIP en F0 — gate de F1** | requiere servidor vivo |
| 7 | `luajit` syntax (6 módulos) | **SKIP en F0 — gate VPS** | requiere OpenResty/luajit |
| 8 | `nginx -t` | **SKIP en F0 — gate VPS** | requiere OpenResty real |

**Los 4 tests Rust (en `main.rs::tests`):**

1. `black_state_yields_backoff_continuity_first` — throughput 0 → BLACK → `BlackBackoff`, sidecar OFF, prefetch_depth 0.
2. `green_with_collapsing_trend_resyncs_to_fresh_not_repeat` — buffer lleno + throughput colapsando → `LiveEdgeResync` (frescura gana, **no repite** video viejo).
3. `ledger_blocks_media_sequence_regression` — admit(100)→OK, admit(101)→OK, admit(99)→`Err(MediaSequenceRegression)`, `blocks()==1`.
4. `fetcher_classifies_403_as_provider_block_not_hidden` — 403→`ProviderBlock`, 401→`AuthTokenProblem`, 503→`TemporaryUpstream`, 200→`None`; `SidecarBudget`: GREEN acquire OK, RED rechazado.

**VERDAD HONESTA (re-verificación in-situ 2026-06-22):** al intentar re-correr `cargo test` en esta máquina Windows, el build aborta con `os error 4551 — "Una directiva de Control de aplicaciones bloqueó este archivo"` (App Control bloquea ejecutar los build-scripts/binarios de las deps). Por eso **la corrida E2E real (pytest + nginx -t + luajit) es un gate de F1 que se ejecuta en Linux/VPS, no aquí**. El VERDE 4/4 corresponde al entorno de implementación; no se reclama una corrida E2E local que la plataforma impide.

---

## 9. Métricas

- **Líneas de código (sin `target/`):** 3324 totales — Rust 1061 (lib 258 + main 803), Lua 2185 (6 módulos), nginx 78.
- **Endpoints de control (`:8091` → `:8090`):** `/buffer/state`, `/buffer/report`, `/prefetch/plan|enqueue|status`, `/segment/fetch|probe`, `/live-edge/probe`, `/qoe/event`, `/metrics`, `/health`.
- **Métricas expuestas en `/metrics`:** `current_buffer_percent`, `avg_buffer_percent`, `upstream_throughput_bps`, `headroom`, contadores de `duplicate_blocks` del ledger.
- **Shared dicts nginx:** `ape_ledger 10m`, `ape_cache_index 50m`, `ape_prefetch_ctrl 5m`, `ape_pattern 5m`.
- **`ngx.exit` en snipers Lua:** **0** (invariante respetado).
- **15 invariantes** codificados (no-repeat media_seq/uri/hash/PDT, no N+1→bytes-N, no blank-TS en normal, no 403-infinito, no upscaling con buffer bajo, no bloquear playback, siempre original fresco si enhanced no listo, continuidad>calidad, fallback HLS válido).

---

## 10. Riesgos

- **Codec/decode:** ninguno — el Governor no toca metadata HLS ni codecs; es plano de control de buffer/continuidad.
- **Colisión de puerto:** mitigada (`:8090`/`:8091` distintos de `:8084`); gate 9 verifica `:8090` libre antes de F1.
- **Sobrecarga del worker Lua:** mitigada (sin `ngx.exit`, reportes log-phase no bloqueantes a `:8090`).
- **Riesgo residual conocido:** los gates E2E (pytest/nginx -t/luajit) **no se han ejecutado en entorno real** todavía — están diseñados como gate F1. No se debe declarar "validado E2E" hasta correr esos gates en el VPS.
- **App Control local:** impide build/run en esta Windows; no afecta producción Linux pero sí impide auto-verificación local.

---

## 11. Rollback

Definido en el gate 15 del CI/CD:

```
systemctl stop ape-buffer-governor      # mata el proceso :8090
# revertir el include del buffer_governor.conf en nginx
nginx -t && systemctl reload nginx       # vuelve al shield puro
```

Como el módulo es **aditivo y lateral** (proceso aparte + include opt-in), parar el servicio y quitar el include devuelve el sistema al baseline dorado exacto. **El `/shield/` y `:8084` nunca dependieron del Governor**, así que el rollback es instantáneo y sin pérdida de canal.

---

## 12. Estado de deploy

**F0 = build-only local. CERO tráfico, NADA en el VPS.** El CI/CD aborta antes de tocar producción: F0 termina en el gate 8 con el mensaje *"F0 BUILD-ONLY COMPLETO. Crate compila, tests/clippy OK. Baseline intacto. Para F1+ se requiere OK explícito (CONFIRM=yes)."* Los gates 9–15 (que tocan el VPS por SSH) exigen `CONFIRM=yes` y **no se ejecutaron**.

---

## 13. Estado de push

**NO PUSHEADO. NO COMMITEADO.** Evidencia `git status --porcelain`:

```
?? vps/buffer-governor/
?? tools/
```

Todo el módulo aparece como **untracked** — nunca entró al índice, nunca hubo commit, nunca hubo push. Branch `feat/virtual-4k-unlocked` está a la par con `origin` (`...origin/feat/virtual-4k-unlocked`, sin commits ahead que toquen el Governor).

---

## 14. Evidencia — `/shield/` intacto

El `buffer_governor.conf` documenta verbatim que **NO** reemplaza el server block del shield y que los snipers se enganchan dentro de los wrappers existentes:

```nginx
# El shield-location.conf existente sigue siendo la ÚNICA frontera
# (/shield/{TOKEN}/{HOST}/{PATH}). Este conf SOLO expone endpoints de CONTROL
# ... NUNCA reemplaza el server block del shield.
```

No hay reescritura de URLs internas, no hay `/shield/` nuevo, no hay transformación de la frontera. **SHIELDED = filename-only, intacto.**

---

## 15. Evidencia — `:8084` intacto

El conf abre con la corrección explícita *"Puerto :8084 → :8090 (NO colisiona con ape-crystal-rust, el motor vivo)"* y el upstream apunta a `server 127.0.0.1:8090`. El gate 10 del CI/CD verifica que el baseline sigue vivo antes de cualquier acción F1:

```
gate 10  systemctl is-active ape-crystal-rust  || die "baseline :8084 caído — ABORTAR"
```

Ningún archivo del baseline fue modificado (ver §7). **`:8084` congelado.**

---

## 16. Evidencia — no open proxy

El `proxy_pass http://$arg_upstream_host$uri` (SSRF) fue **eliminado**. El server de control es loopback puro:

```nginx
listen 127.0.0.1:8091;
allow 127.0.0.0/8;
deny all;
```

El Governor **no proxia tráfico de video** — solo expone endpoints de control alcanzables únicamente desde 127.0.0.1.

---

## 17. Evidencia — no 403 infinito

El 403 se **clasifica**, no se enmascara. Test `fetcher_classifies_403_as_provider_block_not_hidden`:

```rust
assert_eq!(SegmentFetcher::classify(403), Some(ErrorClass::ProviderBlock));
assert_eq!(SegmentFetcher::classify(401), Some(ErrorClass::AuthTokenProblem));
assert_eq!(SegmentFetcher::classify(503), Some(ErrorClass::TemporaryUpstream));
assert_eq!(SegmentFetcher::classify(200), None);
```

`ErrorClass::AuthTokenProblem` lleva el comentario *"401/403 de auth → NO ocultar infinito"*. El `no_repeat_guard` decide HOLD/RESYNC en lugar de loopear.

---

## 18. Evidencia — no repeat (no_repeat_ledger tests)

Test `ledger_blocks_media_sequence_regression`:

```rust
assert!(ledger.admit(&key, &mk(100)).is_ok());
assert!(ledger.admit(&key, &mk(101)).is_ok());
assert_eq!(ledger.admit(&key, &mk(99)), Err(BlockReason::MediaSequenceRegression));
assert_eq!(ledger.blocks(), 1);
```

El ledger bloquea regresión de `media_sequence` (= repetir). `BlockReason` cubre además `UriAlreadyServed`, `HashAlreadyServed`, `ProgramDateTimeRegression`, `StaleReplacingFuture`. Test E2E pareja: `test_no_repeat_invariant` (pytest) reenvía el mismo segmento y verifica detección.

---

## 19. Evidencia — sidecar-off con buffer bajo

`lib.rs` codifica el contrato: `sidecar_enabled()` = `Green | Yellow`; OFF en ORANGE/RED/BLACK. Test `fetcher_classifies_403…`:

```rust
let budget = SidecarBudget::new(8);
assert!(budget.try_acquire(BufferState::Green));   // GREEN: upscaling permitido
assert!(!budget.try_acquire(BufferState::Red));    // RED: upscaling RECHAZADO
```

pytest confirma a nivel HTTP: `test_buffer_state_orange/red/black` → `sidecar_enabled == False`; `test_continuity_over_quality` (buffer 2.0s) asserta `sidecar_enabled == False`. **No upscaling con buffer bajo.**

---

## 20. Evidencia — hold/resync sin fresco

Test `green_with_collapsing_trend_resyncs_to_fresh_not_repeat`: buffer lleno (28/30s) + throughput colapsando → acción `LiveEdgeResync` (salta al borde fresco) en lugar de servir cómodo lo viejo. En BLACK, `black_state_yields_backoff_continuity_first` → `BlackBackoff` + `HoldManifest` (mantiene manifest, **no repite**, backoff). pytest `test_continuity_over_quality` asserta que la acción contiene `resync` o `hold`. **Frescura/continuidad gana; nunca se rellena con video viejo.**

---

## 21. Verdad honesta sobre E2E (gate F1)

- `cargo check` / `cargo test` (4/4) / `cargo clippy -D warnings` → **VERDE** en el build de implementación. Verificación local re-intentada hoy: **bloqueada por App Control de Windows** (`os error 4551`), no por un fallo del código.
- `pytest test_buffer_governor.py` (FSM/prefetch/throughput/live-edge/invariantes) → **gate F1**: necesita el servidor `:8090` vivo (Linux/VPS).
- `nginx -t` del conf → **gate F1**: necesita OpenResty real en el VPS.
- `luajit -bl` de los 6 módulos → **gate F1**: necesita luajit/OpenResty.

No se declara "E2E validado" en F0. La validación E2E real ocurre en F1 sobre el VPS, gated por `CONFIRM=yes`.

---

## 22. Confirmaciones (checklist del propietario)

- [x] **No se reinventó Crystal** — `ape-crystal-rust` (`:8084`) intacto, proceso aparte.
- [x] **No se rompió `/shield/`** — única frontera preservada, sin transformar URLs.
- [x] **No se rompió nginx** — conf nuevo es include opt-in; server block del shield no tocado.
- [x] **No se rompió `:8084`** — gate 10 lo protege; ningún archivo del baseline modificado.
- [x] **No open proxy** — `proxy_pass $arg_upstream_host` eliminado; control loopback-only.
- [x] **No 403 infinito** — 403 clasificado (`ProviderBlock`), HOLD/RESYNC en vez de loop.
- [x] **No repeat** — ledger bloquea regresión media_seq/uri/hash/PDT (test verde).
- [x] **No N+1→bytes-N** — invariante codificado (segmento pedido = segmento servido).
- [x] **No bloqueo por upscaling** — sidecar OFF en ORANGE/RED/BLACK; continuidad > procesamiento.
- [x] **No deploy sin OK** — F0 termina en gate 8; F1+ exige `CONFIRM=yes`.
- [x] **No push sin OK** — módulo entero untracked, 0 commits, 0 push.

---

## 23. Estado final

**F0 build-only ENTREGADO.** Crate Rust + 6 Lua + nginx conf corregido + systemd + CI/CD de 15 gates, todo bajo `vps/buffer-governor/` y `tools/cicd/`. Baseline dorado (`:8084` / `/shield/`) **congelado e intacto**. 4 tests Rust verdes en implementación; E2E (pytest/nginx -t/luajit) reservado honestamente como **gate F1** sobre VPS. **Nada en producción, nada pusheado, esperando OK explícito del propietario para F1.**

---

*Archivo:* `docs/reports/buffer-governor-final-report.md`
