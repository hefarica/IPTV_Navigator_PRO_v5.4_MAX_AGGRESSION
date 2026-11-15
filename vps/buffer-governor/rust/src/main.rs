//! APE Buffer Governor v2.0 — entry point (`main.rs`)
//!
//! Regla madre: BUFFER BAJO NO SE RESUELVE REPITIENDO VIDEO VIEJO.
//! Jerarquía: continuidad > segmento fresco > buffer>50% > calidad > procesamiento pesado.
//!
//! Responsabilidad de este archivo:
//!   1. Construir `Arc<AppState>` con TODOS los managers (Governor, ThroughputModel,
//!      PrefetchQueue, SegmentFetcher, LiveEdgeProbe, NoRepeatLedger, QoeIngest,
//!      SidecarBudget, CacheIndex, Metrics).
//!   2. Inicializar `tracing_subscriber`.
//!   3. Montar el router HTTP de control y hacer bind en `127.0.0.1:8090`
//!      (NUNCA :8084 — ese puerto es el motor vivo `ape-crystal-rust`).
//!   4. `axum::serve(...)`.
//!
//! ── Nota de arquitectura (coordinación lib.rs ⇄ main.rs) ─────────────────────
//! `lib.rs` (crate `ape_buffer_governor`) define el CONTRATO de tipos compartidos
//! (BufferState, Action, Trend, BufferReport, BufferDecision, PrefetchTask,
//! LedgerKey, LedgerEntry, CacheStatus, BlockReason, FetchResult, ErrorClass,
//! LiveEdgeResult, now_ms) pero NO declara `AppState`. Por contrato, `AppState`
//! se define AQUÍ (binario) con un `Arc` de cada manager. Como los módulos
//! hermanos (`api`, `buffer_governor`, …) viven en el lib-crate y NO pueden ver
//! un struct del bin-crate, el router de control se construye en este archivo
//! (`build_router`), espejando la firma prevista `api::router(state)`. Esto deja
//! `main.rs` compilable de forma AISLADA mientras consume verbatim los tipos del
//! contrato de `lib.rs`.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::Serialize;
use serde_json::{json, Value};
use tracing::{info, warn};

// ── Contrato de tipos compartidos (NO redefinir; importados verbatim de lib.rs) ──
use ape_buffer_governor::{
    now_ms, Action, BlockReason, BufferDecision, BufferReport, BufferState, CacheStatus,
    ErrorClass, FetchResult, LedgerEntry, LedgerKey, LiveEdgeResult, PrefetchTask, Trend,
};

// ════════════════════════════════════════════════════════════════════════════
//  MANAGERS — definidos aquí de forma autónoma y compilable; consumen los tipos
//  del contrato. Cuando los módulos hermanos del lib-crate existan, estos pueden
//  reemplazarse por `use ape_buffer_governor::buffer_governor::Governor;` etc.
//  sin cambiar la forma de `AppState`.
// ════════════════════════════════════════════════════════════════════════════

/// Governor — clasifica el estado del buffer y decide la acción bajo la jerarquía
/// continuidad > fresco > buffer50 > calidad > procesamiento.
#[derive(Default)]
pub struct Governor {
    decisions: AtomicU64,
}

impl Governor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decide a partir de un `BufferReport` consumido vía el contrato.
    /// `trend` viene del `ThroughputModel` (continuidad/fresco antes que calidad).
    pub fn decide(&self, report: &BufferReport, trend: Trend) -> BufferDecision {
        let buffer_percent = report.buffer_percent();
        let state = BufferState::classify(buffer_percent, report.upstream_alive());

        // headroom = throughput_real / bitrate_variante. <1.0 → la variante no cabe.
        let headroom = if report.variant_bps > 0 {
            report.throughput_bps as f64 / report.variant_bps as f64
        } else {
            0.0
        };

        // Jerarquía de acciones (regla madre primero):
        //   continuidad (BLACK/colapso) > frescura (resync live-edge) >
        //   buffer>50% (prefetch) > calidad (downgrade) > procesamiento (sidecar off).
        let action = match state {
            BufferState::Black => Action::BlackBackoff,
            _ if matches!(trend, Trend::Collapsing) => Action::LiveEdgeResync,
            BufferState::Red => Action::DowngradeVariant,
            BufferState::Orange if headroom < 1.0 => Action::DowngradeVariant,
            BufferState::Orange => Action::DisableSidecar,
            BufferState::Yellow if matches!(trend, Trend::Degrading) => Action::PrefetchMore,
            BufferState::Yellow => Action::HoldManifest,
            BufferState::Green if headroom < 1.2 => Action::PrefetchMore,
            BufferState::Green => Action::KeepQuality,
        };

        self.decisions.fetch_add(1, Ordering::Relaxed);

        BufferDecision {
            channel_id: report.channel_id.clone(),
            state,
            action,
            sidecar_enabled: state.sidecar_enabled(),
            prefetch_depth: state.prefetch_depth(),
            upstream_throughput_bps: report.throughput_bps,
            headroom,
            trend,
            buffer_percent,
            decided_at_ms: now_ms(),
        }
    }

    pub fn count(&self) -> u64 {
        self.decisions.load(Ordering::Relaxed)
    }
}

/// ThroughputModel — EWMA del throughput por canal → `Trend`.
pub struct ThroughputModel {
    ewma_bps: DashMap<String, f64>,
}

impl ThroughputModel {
    pub fn new() -> Self {
        Self {
            ewma_bps: DashMap::new(),
        }
    }

    /// Actualiza la media móvil exponencial y deriva la tendencia.
    pub fn observe(&self, channel_id: &str, throughput_bps: u64, variant_bps: u64) -> Trend {
        const ALPHA: f64 = 0.3;
        let sample = throughput_bps as f64;
        let prev = self.ewma_bps.get(channel_id).map(|v| *v).unwrap_or(sample);
        let next = ALPHA * sample + (1.0 - ALPHA) * prev;
        self.ewma_bps.insert(channel_id.to_string(), next);

        let target = variant_bps.max(1) as f64;
        let ratio_now = sample / target;
        let delta = next - prev;
        let rel_delta = if prev > 0.0 { delta / prev } else { 0.0 };

        if ratio_now < 0.5 && rel_delta < -0.25 {
            Trend::Collapsing
        } else if rel_delta < -0.08 {
            Trend::Degrading
        } else if rel_delta > 0.08 {
            Trend::Improving
        } else {
            Trend::Stable
        }
    }
}

impl Default for ThroughputModel {
    fn default() -> Self {
        Self::new()
    }
}

/// PrefetchQueue — cola de `PrefetchTask` ordenada por prioridad (menor = antes).
/// El prefetch SIEMPRE busca segmentos FRESCOS hacia el live-edge, nunca repite.
#[derive(Default)]
pub struct PrefetchQueue {
    tasks: RwLock<Vec<PrefetchTask>>,
    enqueued: AtomicU64,
}

impl PrefetchQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn enqueue(&self, task: PrefetchTask) {
        let mut g = self.tasks.write();
        g.push(task);
        g.sort_by_key(|t| t.priority);
        self.enqueued.fetch_add(1, Ordering::Relaxed);
    }

    /// Planifica hasta `depth` tareas FRESCAS (las saca de la cola).
    pub fn plan(&self, depth: u32) -> Vec<PrefetchTask> {
        let mut g = self.tasks.write();
        let take = (depth as usize).min(g.len());
        g.drain(0..take).collect()
    }

    pub fn depth(&self) -> usize {
        self.tasks.read().len()
    }

    pub fn total_enqueued(&self) -> u64 {
        self.enqueued.load(Ordering::Relaxed)
    }
}

/// SegmentFetcher — descarga segmentos y CLASIFICA el 403 (no lo oculta infinito).
pub struct SegmentFetcher {
    client: reqwest::Client,
    fetches: AtomicU64,
}

impl SegmentFetcher {
    pub fn new() -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self {
            client,
            fetches: AtomicU64::new(0),
        })
    }

    /// Clasifica un status HTTP de upstream según el contrato `ErrorClass`.
    /// INVARIANTE: el 403 nunca se convierte en 200 ciego e infinito.
    pub fn classify(status: u16) -> Option<ErrorClass> {
        match status {
            401 => Some(ErrorClass::AuthTokenProblem),
            403 | 429 => Some(ErrorClass::ProviderBlock),
            500..=599 => Some(ErrorClass::TemporaryUpstream),
            _ => None,
        }
    }

    pub async fn fetch(&self, uri: &str) -> FetchResult {
        self.fetches.fetch_add(1, Ordering::Relaxed);
        match self.client.get(uri).send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let bytes_len = resp.bytes().await.map(|b| b.len()).unwrap_or(0);
                FetchResult {
                    segment_uri: uri.to_string(),
                    status,
                    bytes_len,
                    fresh: (200..300).contains(&status),
                    error_class: Self::classify(status),
                    fetched_at_ms: now_ms(),
                }
            }
            Err(e) => {
                warn!(uri, error = %e, "segment fetch failed (temporary upstream)");
                FetchResult {
                    segment_uri: uri.to_string(),
                    status: 0,
                    bytes_len: 0,
                    fresh: false,
                    error_class: Some(ErrorClass::TemporaryUpstream),
                    fetched_at_ms: now_ms(),
                }
            }
        }
    }
}

/// LiveEdgeProbe — detecta gaps y calcula el resync hacia el borde vivo (frescura).
#[derive(Default)]
pub struct LiveEdgeProbe {
    last_seen: DashMap<String, u64>,
}

impl LiveEdgeProbe {
    pub fn new() -> Self {
        Self::default()
    }

    /// Evalúa la secuencia más alta observada para un manifest y decide resync.
    pub fn evaluate(&self, manifest_uri: &str, highest_media_sequence: Option<u64>) -> LiveEdgeResult {
        let prev = self.last_seen.get(manifest_uri).map(|v| *v);
        let gap_detected = match (prev, highest_media_sequence) {
            // gap = saltó más de 3 segmentos respecto a lo último visto.
            (Some(p), Some(h)) => h > p.saturating_add(3),
            _ => false,
        };
        if let Some(h) = highest_media_sequence {
            self.last_seen.insert(manifest_uri.to_string(), h);
        }
        let resync_to = if gap_detected { highest_media_sequence } else { None };
        LiveEdgeResult {
            manifest_uri: manifest_uri.to_string(),
            highest_media_sequence,
            gap_detected,
            resync_to,
            probed_at_ms: now_ms(),
        }
    }
}

/// NoRepeatLedger — INVARIANTE CRÍTICO: nunca repetir media_sequence/uri/hash/PDT en LIVE.
/// Buffer bajo NO se resuelve repitiendo video viejo.
#[derive(Default)]
pub struct NoRepeatLedger {
    // key-de-sesión → última entrada servida (resumen mínimo para el guard).
    served: DashMap<String, LedgerEntry>,
    blocks: AtomicU64,
}

impl NoRepeatLedger {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decide si una nueva entrada es válida o por qué se bloquea.
    /// `Ok(())` = servir; `Err(BlockReason)` = el segmento repetiría/regresaría.
    pub fn admit(&self, key: &LedgerKey, entry: &LedgerEntry) -> Result<(), BlockReason> {
        let k = key.as_string();
        if let Some(prev) = self.served.get(&k) {
            // Regresión de media_sequence (ir hacia atrás en vivo = repetir).
            if entry.media_sequence < prev.media_sequence {
                self.blocks.fetch_add(1, Ordering::Relaxed);
                return Err(BlockReason::MediaSequenceRegression);
            }
            // Mismo URI ya servido.
            if entry.segment_uri == prev.segment_uri
                && entry.media_sequence == prev.media_sequence
            {
                self.blocks.fetch_add(1, Ordering::Relaxed);
                return Err(BlockReason::UriAlreadyServed);
            }
            // Mismo hash de contenido ya servido.
            if let (Some(h_new), Some(h_old)) = (&entry.segment_hash, &prev.segment_hash) {
                if h_new == h_old {
                    self.blocks.fetch_add(1, Ordering::Relaxed);
                    return Err(BlockReason::HashAlreadyServed);
                }
            }
            // PDT que retrocede.
            if let (Some(pdt_new), Some(pdt_old)) =
                (&entry.program_date_time, &prev.program_date_time)
            {
                if pdt_new < pdt_old {
                    self.blocks.fetch_add(1, Ordering::Relaxed);
                    return Err(BlockReason::ProgramDateTimeRegression);
                }
            }
            // Un stale no puede sustituir a un segmento futuro ya servido.
            if matches!(entry.cache_status, CacheStatus::Stale)
                && entry.media_sequence <= prev.media_sequence
            {
                self.blocks.fetch_add(1, Ordering::Relaxed);
                return Err(BlockReason::StaleReplacingFuture);
            }
        }
        self.served.insert(k, entry.clone());
        Ok(())
    }

    pub fn blocks(&self) -> u64 {
        self.blocks.load(Ordering::Relaxed)
    }
}

/// QoeIngest — ingesta de eventos QoE (rebuffer/VST/frames) por canal.
#[derive(Default)]
pub struct QoeIngest {
    events: AtomicU64,
    rebuffers: DashMap<String, u64>,
}

impl QoeIngest {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ingest(&self, channel_id: &str, rebuffer_count: u64) {
        self.events.fetch_add(1, Ordering::Relaxed);
        self.rebuffers
            .entry(channel_id.to_string())
            .and_modify(|c| *c = (*c).max(rebuffer_count))
            .or_insert(rebuffer_count);
    }

    pub fn total_events(&self) -> u64 {
        self.events.load(Ordering::Relaxed)
    }
}

/// SidecarBudget — presupuesto global de upscaling pesado (sidecar). Solo se gasta
/// cuando el estado lo permite (GREEN full, YELLOW limitado). Procesamiento es lo
/// ÚLTIMO en la jerarquía: jamás compromete continuidad/frescura/buffer.
pub struct SidecarBudget {
    max_concurrent: u32,
    in_flight: AtomicU64,
}

impl SidecarBudget {
    pub fn new(max_concurrent: u32) -> Self {
        Self {
            max_concurrent,
            in_flight: AtomicU64::new(0),
        }
    }

    /// Intenta reservar un slot de sidecar para un estado dado.
    /// Devuelve `false` si el estado no permite sidecar o no hay presupuesto.
    pub fn try_acquire(&self, state: BufferState) -> bool {
        if !state.sidecar_enabled() {
            return false;
        }
        // YELLOW sólo puede usar la mitad del presupuesto (filtros ligeros).
        let cap = if state.sidecar_full() {
            self.max_concurrent as u64
        } else {
            (self.max_concurrent as u64).div_ceil(2)
        };
        let cur = self.in_flight.load(Ordering::Relaxed);
        if cur >= cap {
            return false;
        }
        self.in_flight.fetch_add(1, Ordering::Relaxed);
        true
    }

    pub fn release(&self) {
        let prev = self.in_flight.load(Ordering::Relaxed);
        if prev > 0 {
            self.in_flight.fetch_sub(1, Ordering::Relaxed);
        }
    }

    pub fn in_flight(&self) -> u64 {
        self.in_flight.load(Ordering::Relaxed)
    }
}

/// CacheIndex — índice de frescura de segmentos en caché (fresh/stale/enhanced/original).
#[derive(Default)]
pub struct CacheIndex {
    index: DashMap<String, CacheStatus>,
}

impl CacheIndex {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, uri: &str, status: CacheStatus) {
        self.index.insert(uri.to_string(), status);
    }

    pub fn status_of(&self, uri: &str) -> Option<CacheStatus> {
        self.index.get(uri).map(|v| *v)
    }

    pub fn len(&self) -> usize {
        self.index.len()
    }

    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }
}

/// Metrics — contadores agregados expuestos en `/metrics`.
#[derive(Default)]
pub struct Metrics {
    requests: AtomicU64,
    started_at_ms: AtomicU64,
}

impl Metrics {
    pub fn new() -> Self {
        let m = Self::default();
        m.started_at_ms.store(now_ms() as u64, Ordering::Relaxed);
        m
    }

    pub fn inc_request(&self) {
        self.requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn requests(&self) -> u64 {
        self.requests.load(Ordering::Relaxed)
    }

    pub fn uptime_ms(&self) -> i64 {
        now_ms() - self.started_at_ms.load(Ordering::Relaxed) as i64
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  AppState — Arc de cada manager. Definido en el binario por contrato.
// ════════════════════════════════════════════════════════════════════════════

pub struct AppState {
    pub governor: Arc<Governor>,
    pub throughput: Arc<ThroughputModel>,
    pub prefetch: Arc<PrefetchQueue>,
    pub fetcher: Arc<SegmentFetcher>,
    pub live_edge: Arc<LiveEdgeProbe>,
    pub ledger: Arc<NoRepeatLedger>,
    pub qoe: Arc<QoeIngest>,
    pub sidecar: Arc<SidecarBudget>,
    pub cache: Arc<CacheIndex>,
    pub metrics: Arc<Metrics>,
}

impl AppState {
    pub fn new() -> anyhow::Result<Arc<Self>> {
        Ok(Arc::new(Self {
            governor: Arc::new(Governor::new()),
            throughput: Arc::new(ThroughputModel::new()),
            prefetch: Arc::new(PrefetchQueue::new()),
            fetcher: Arc::new(SegmentFetcher::new()?),
            live_edge: Arc::new(LiveEdgeProbe::new()),
            ledger: Arc::new(NoRepeatLedger::new()),
            qoe: Arc::new(QoeIngest::new()),
            sidecar: Arc::new(SidecarBudget::new(8)),
            cache: Arc::new(CacheIndex::new()),
            metrics: Arc::new(Metrics::new()),
        }))
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  Router de control (espejo de `api::router`). Endpoints loopback en :8090,
//  alineados con vps/buffer-governor/nginx/buffer_governor.conf.
// ════════════════════════════════════════════════════════════════════════════

fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_handler))
        .route("/buffer/report", post(buffer_report))
        .route("/buffer/state", post(buffer_report))
        .route("/prefetch/enqueue", post(prefetch_enqueue))
        .route("/prefetch/plan", post(prefetch_plan))
        .route("/prefetch/status", get(prefetch_status))
        .route("/segment/fetch", post(segment_fetch))
        .route("/segment/probe", post(segment_fetch))
        .route("/live-edge/probe", post(live_edge_probe))
        .route("/qoe/event", post(qoe_event))
        .with_state(state)
}

#[derive(Serialize)]
struct Health {
    service: &'static str,
    version: &'static str,
    port: u16,
    uptime_ms: i64,
}

async fn health(State(st): State<Arc<AppState>>) -> impl IntoResponse {
    st.metrics.inc_request();
    Json(Health {
        service: "ape-buffer-governor",
        version: "2.0.0",
        port: 8090,
        uptime_ms: st.metrics.uptime_ms(),
    })
}

async fn metrics_handler(State(st): State<Arc<AppState>>) -> impl IntoResponse {
    st.metrics.inc_request();
    Json(json!({
        "requests": st.metrics.requests(),
        "uptime_ms": st.metrics.uptime_ms(),
        "decisions": st.governor.count(),
        "prefetch_queue_depth": st.prefetch.depth(),
        "prefetch_enqueued_total": st.prefetch.total_enqueued(),
        "ledger_blocks": st.ledger.blocks(),
        "qoe_events": st.qoe.total_events(),
        "sidecar_in_flight": st.sidecar.in_flight(),
        "cache_index_len": st.cache.len(),
    }))
}

/// POST /buffer/report y /buffer/state — recibe `BufferReport`, devuelve `BufferDecision`.
async fn buffer_report(
    State(st): State<Arc<AppState>>,
    Json(report): Json<BufferReport>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    let trend = st
        .throughput
        .observe(&report.channel_id, report.throughput_bps, report.variant_bps);
    let decision = st.governor.decide(&report, trend);
    // QoE side-channel: registra rebuffers observados en el reporte.
    if report.rebuffer_count > 0 {
        st.qoe.ingest(&report.channel_id, report.rebuffer_count);
    }
    (StatusCode::OK, Json(decision))
}

/// POST /prefetch/enqueue — encola una `PrefetchTask` fresca.
async fn prefetch_enqueue(
    State(st): State<Arc<AppState>>,
    Json(task): Json<PrefetchTask>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    st.prefetch.enqueue(task);
    (StatusCode::ACCEPTED, Json(json!({ "queued": st.prefetch.depth() })))
}

/// POST /prefetch/plan — devuelve hasta `depth` tareas frescas (default por estado RED=15).
async fn prefetch_plan(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    let depth = body
        .get("depth")
        .and_then(|d| d.as_u64())
        .map(|d| d as u32)
        .unwrap_or_else(|| BufferState::Red.prefetch_depth());
    let plan = st.prefetch.plan(depth);
    Json(plan)
}

async fn prefetch_status(State(st): State<Arc<AppState>>) -> impl IntoResponse {
    st.metrics.inc_request();
    Json(json!({
        "queue_depth": st.prefetch.depth(),
        "enqueued_total": st.prefetch.total_enqueued(),
    }))
}

/// POST /segment/fetch y /segment/probe — descarga un segmento, clasifica el 403.
async fn segment_fetch(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    let uri = match body.get("segment_uri").and_then(|u| u.as_str()) {
        Some(u) => u.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "missing segment_uri" })),
            )
                .into_response();
        }
    };
    let result = st.fetcher.fetch(&uri).await;
    // Indexa frescura en el cache index.
    st.cache.record(
        &uri,
        if result.fresh {
            CacheStatus::Fresh
        } else {
            CacheStatus::Stale
        },
    );
    (StatusCode::OK, Json(result)).into_response()
}

/// POST /live-edge/probe — evalúa gap y resync hacia el borde vivo.
async fn live_edge_probe(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    let manifest_uri = body
        .get("manifest_uri")
        .and_then(|u| u.as_str())
        .unwrap_or("")
        .to_string();
    let highest = body.get("highest_media_sequence").and_then(|h| h.as_u64());
    let res = st.live_edge.evaluate(&manifest_uri, highest);
    Json(res)
}

/// POST /qoe/event — ingesta de evento QoE.
async fn qoe_event(
    State(st): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    st.metrics.inc_request();
    let channel_id = body
        .get("channel_id")
        .and_then(|c| c.as_str())
        .unwrap_or("unknown");
    let rebuffer = body
        .get("rebuffer_count")
        .and_then(|r| r.as_u64())
        .unwrap_or(0);
    st.qoe.ingest(channel_id, rebuffer);
    (StatusCode::ACCEPTED, Json(json!({ "ingested": true })))
}

// ════════════════════════════════════════════════════════════════════════════
//  Entry point
// ════════════════════════════════════════════════════════════════════════════

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // `tracing-subscriber` se usa sin la feature `env-filter` (no garantizada por
    // Cargo.toml): nivel por defecto INFO vía el builder `fmt()` estándar.
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let state = AppState::new()?;
    let app = build_router(state);

    // :8090 — NUNCA :8084 (ese es ape-crystal-rust, el motor vivo). Loopback only.
    let addr = SocketAddr::from(([127, 0, 0, 1], 8090));
    info!("APE Buffer Governor v2.0 on :8090");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
//  Tests
// ════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn report(buffer_s: f64, capacity_s: f64, thr: u64, var: u64) -> BufferReport {
        BufferReport {
            channel_id: "ch_test".to_string(),
            buffer_s,
            capacity_s,
            throughput_bps: thr,
            variant_bps: var,
            current_variant: None,
            rebuffer_count: 0,
            dropped_frames: 0,
            live_edge_delta_ms: 0,
            playback_state: None,
        }
    }

    #[test]
    fn black_state_yields_backoff_continuity_first() {
        // Upstream muerto (throughput 0) → BLACK → BlackBackoff (continuidad primero).
        let gov = Governor::new();
        let r = report(20.0, 30.0, 0, 8_000_000);
        let d = gov.decide(&r, Trend::Stable);
        assert_eq!(d.state, BufferState::Black);
        assert_eq!(d.action, Action::BlackBackoff);
        assert!(!d.sidecar_enabled, "sidecar OFF en BLACK");
        assert_eq!(d.prefetch_depth, 0);
    }

    #[test]
    fn green_with_collapsing_trend_resyncs_to_fresh_not_repeat() {
        // Buffer lleno pero throughput colapsando → resync al live-edge (frescura),
        // NUNCA repetir video viejo. Frescura gana sobre "buffer cómodo".
        let gov = Governor::new();
        let r = report(28.0, 30.0, 1_000_000, 8_000_000);
        let d = gov.decide(&r, Trend::Collapsing);
        assert_eq!(d.state, BufferState::Green);
        assert_eq!(d.action, Action::LiveEdgeResync);
    }

    #[test]
    fn ledger_blocks_media_sequence_regression() {
        // INVARIANTE: nunca retroceder media_sequence en vivo (= repetir).
        let ledger = NoRepeatLedger::new();
        let key = LedgerKey {
            session_id: "s1".into(),
            channel_id: "c1".into(),
            stream_id: "st1".into(),
            variant_id: "v1".into(),
            device_id: "d1".into(),
        };
        let mk = |seq: u64| LedgerEntry {
            media_sequence: seq,
            discontinuity_sequence: 0,
            program_date_time: None,
            segment_uri: format!("seg{seq}.ts"),
            segment_hash: None,
            duration: 6.0,
            variant_id: "v1".into(),
            served_at_ms: now_ms(),
            upstream_status: 200,
            cache_status: CacheStatus::Fresh,
        };
        assert!(ledger.admit(&key, &mk(100)).is_ok());
        assert!(ledger.admit(&key, &mk(101)).is_ok());
        // Retroceder a 99 = regresión → bloqueado.
        assert_eq!(
            ledger.admit(&key, &mk(99)),
            Err(BlockReason::MediaSequenceRegression)
        );
        assert_eq!(ledger.blocks(), 1);
    }

    #[test]
    fn fetcher_classifies_403_as_provider_block_not_hidden() {
        // El 403 se clasifica (provider-block), no se oculta como 200 ciego.
        assert_eq!(
            SegmentFetcher::classify(403),
            Some(ErrorClass::ProviderBlock)
        );
        assert_eq!(SegmentFetcher::classify(401), Some(ErrorClass::AuthTokenProblem));
        assert_eq!(SegmentFetcher::classify(503), Some(ErrorClass::TemporaryUpstream));
        assert_eq!(SegmentFetcher::classify(200), None);

        // Sidecar (procesamiento) es lo último: OFF salvo GREEN/YELLOW.
        let budget = SidecarBudget::new(8);
        assert!(budget.try_acquire(BufferState::Green));
        assert!(!budget.try_acquire(BufferState::Red));
    }
}
