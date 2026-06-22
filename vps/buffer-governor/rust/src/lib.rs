//! APE Buffer Governor v2.0 — contrato de tipos compartidos (lib.rs)
//!
//! Regla madre: BUFFER BAJO NO SE RESUELVE REPITIENDO VIDEO VIEJO.
//! Jerarquía: continuidad > segmento fresco > buffer>50% > calidad > procesamiento pesado.
//!
//! Todos los módulos (buffer_governor, throughput_model, prefetch_queue, segment_fetcher,
//! live_edge_probe, no_repeat_ledger, qoe_ingest, sidecar_budget, cache_index, metrics, api)
//! comparten ESTOS tipos. No redefinir; importar desde `crate::`.

use serde::{Deserialize, Serialize};

// NOTA F0.6 (integración): los managers (Governor, ThroughputModel, PrefetchQueue,
// SegmentFetcher, LiveEdgeProbe, NoRepeatLedger, QoeIngest, SidecarBudget, CacheIndex,
// Metrics) + AppState + el router de control viven en `main.rs` (bin-crate). `lib.rs`
// expone SOLO el contrato de tipos compartidos que main.rs importa via
// `use ape_buffer_governor::{...}`. Esto compila como un crate único y coherente.

// ───────────────────────── Estados del buffer (FSM) ─────────────────────────
// GREEN >=70% · YELLOW 50-70% · ORANGE 30-50% · RED <30% · BLACK upstream muerto.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BufferState {
    Green,
    Yellow,
    Orange,
    Red,
    Black,
}

impl BufferState {
    /// Clasifica el estado a partir del % de buffer y si el upstream está vivo.
    /// BLACK gana si no hay upstream/throughput aunque el % sea engañoso.
    pub fn classify(buffer_percent: f64, upstream_alive: bool) -> Self {
        if !upstream_alive {
            return BufferState::Black;
        }
        if buffer_percent >= 70.0 {
            BufferState::Green
        } else if buffer_percent >= 50.0 {
            BufferState::Yellow
        } else if buffer_percent >= 30.0 {
            BufferState::Orange
        } else {
            BufferState::Red
        }
    }

    /// prefetch_depth por estado (INVARIANTE: cambia por estado). GREEN 3 · YELLOW 6 · ORANGE 10 · RED 15 · BLACK 0.
    pub fn prefetch_depth(&self) -> u32 {
        match self {
            BufferState::Green => 3,
            BufferState::Yellow => 6,
            BufferState::Orange => 10,
            BufferState::Red => 15,
            BufferState::Black => 0,
        }
    }

    /// sidecar (upscaling pesado) permitido SOLO en GREEN; limitado en YELLOW; OFF en ORANGE/RED/BLACK.
    pub fn sidecar_enabled(&self) -> bool {
        matches!(self, BufferState::Green | BufferState::Yellow)
    }

    /// sidecar_full = upscaling completo. Solo GREEN. YELLOW es limitado (filtros ligeros).
    pub fn sidecar_full(&self) -> bool {
        matches!(self, BufferState::Green)
    }
}

// ───────────────────────── Acciones del governor ─────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    KeepQuality,
    PrefetchMore,
    DisableSidecar,
    DowngradeVariant,
    LiveEdgeResync,
    HoldManifest,
    BlackBackoff,
}

// ───────────────────────── Tendencia de throughput ─────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trend {
    Improving,
    Stable,
    Degrading,
    Collapsing,
}

// ───────────────────────── Reporte de buffer (INPUT del player/ARA/nginx) ─────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BufferReport {
    pub channel_id: String,
    pub buffer_s: f64,
    pub capacity_s: f64,
    pub throughput_bps: u64,
    pub variant_bps: u64,
    #[serde(default)]
    pub current_variant: Option<String>,
    #[serde(default)]
    pub rebuffer_count: u64,
    #[serde(default)]
    pub dropped_frames: u64,
    #[serde(default)]
    pub live_edge_delta_ms: i64,
    #[serde(default)]
    pub playback_state: Option<String>,
}

impl BufferReport {
    pub fn buffer_percent(&self) -> f64 {
        if self.capacity_s <= 0.0 {
            return 0.0;
        }
        (self.buffer_s / self.capacity_s * 100.0).clamp(0.0, 100.0)
    }
    pub fn upstream_alive(&self) -> bool {
        self.throughput_bps > 0
    }
}

// ───────────────────────── Decisión del governor (OUTPUT) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferDecision {
    pub channel_id: String,
    pub state: BufferState,
    pub action: Action,
    pub sidecar_enabled: bool,
    pub prefetch_depth: u32,
    pub upstream_throughput_bps: u64,
    pub headroom: f64,
    pub trend: Trend,
    pub buffer_percent: f64,
    pub decided_at_ms: i64,
}

// ───────────────────────── Tarea de prefetch ─────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrefetchTask {
    pub segment_uri: String,
    pub media_sequence: u64,
    #[serde(default = "default_priority")]
    pub priority: u32,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub variant_id: String,
    #[serde(default)]
    pub provider: String,
}
fn default_priority() -> u32 { 100 }

// ───────────────────────── Entrada del no-repeat ledger ─────────────────────────
// INVARIANTE CRÍTICO: nunca repetir media_sequence/uri/hash/program_date_time en LIVE.

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LedgerKey {
    pub session_id: String,
    pub channel_id: String,
    pub stream_id: String,
    pub variant_id: String,
    pub device_id: String,
}
impl LedgerKey {
    pub fn as_string(&self) -> String {
        format!("{}|{}|{}|{}|{}",
            self.session_id, self.channel_id, self.stream_id, self.variant_id, self.device_id)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LedgerEntry {
    pub media_sequence: u64,
    #[serde(default)]
    pub discontinuity_sequence: u64,
    #[serde(default)]
    pub program_date_time: Option<String>,
    pub segment_uri: String,
    #[serde(default)]
    pub segment_hash: Option<String>,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub variant_id: String,
    pub served_at_ms: i64,
    #[serde(default)]
    pub upstream_status: u16,
    #[serde(default)]
    pub cache_status: CacheStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CacheStatus {
    #[default]
    Fresh,
    Stale,
    Enhanced,
    Original,
}

/// Razón por la que el ledger bloquea (para telemetría y tests).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockReason {
    MediaSequenceRegression,
    UriAlreadyServed,
    HashAlreadyServed,
    ProgramDateTimeRegression,
    StaleReplacingFuture,
}

// ───────────────────────── Resultado de fetch de segmento ─────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct FetchResult {
    pub segment_uri: String,
    pub status: u16,
    pub bytes_len: usize,
    pub fresh: bool,
    /// clasificación del 403 (INVARIANTE: no ocultar 403 infinito).
    pub error_class: Option<ErrorClass>,
    pub fetched_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorClass {
    AuthTokenProblem,    // 401/403 de auth → NO ocultar infinito
    ProviderBlock,       // 403/429 anti-sharing → cooldown
    TemporaryUpstream,   // 5xx/timeout → BLACK/backoff
}

// ───────────────────────── Live edge ─────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LiveEdgeResult {
    pub manifest_uri: String,
    pub highest_media_sequence: Option<u64>,
    pub gap_detected: bool,
    pub resync_to: Option<u64>,
    pub probed_at_ms: i64,
}

// ───────────────────────── Utilidad de tiempo ─────────────────────────

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE ACEPTACIÓN (espec del propietario) — FSM pura del contrato.
// Demuestran los puntos 1, 2, 3 con asserts explícitos por estado.
// (Puntos 4,5,6 = tests de managers en main.rs; 7-10 = evidencia operativa.)
// ═══════════════════════════════════════════════════════════════════════════
#[cfg(test)]
mod acceptance_tests {
    use super::*;

    // ── Punto 1: los 5 estados clasifican por umbral exacto ──
    #[test]
    fn p1_five_states_classify_by_threshold() {
        assert_eq!(BufferState::classify(85.0, true), BufferState::Green);   // >=70
        assert_eq!(BufferState::classify(70.0, true), BufferState::Green);   // borde
        assert_eq!(BufferState::classify(60.0, true), BufferState::Yellow);  // 50-70
        assert_eq!(BufferState::classify(50.0, true), BufferState::Yellow);  // borde
        assert_eq!(BufferState::classify(40.0, true), BufferState::Orange);  // 30-50
        assert_eq!(BufferState::classify(30.0, true), BufferState::Orange);  // borde
        assert_eq!(BufferState::classify(20.0, true), BufferState::Red);     // <30
        assert_eq!(BufferState::classify(99.0, false), BufferState::Black);  // upstream muerto gana
        assert_eq!(BufferState::classify(0.0, false), BufferState::Black);
    }

    // ── Punto 2: sidecar_enabled=false en ORANGE/RED/BLACK; true GREEN/YELLOW ──
    #[test]
    fn p2_sidecar_off_when_buffer_low() {
        assert!(BufferState::Green.sidecar_enabled());
        assert!(BufferState::Yellow.sidecar_enabled());
        assert!(!BufferState::Orange.sidecar_enabled());  // OFF
        assert!(!BufferState::Red.sidecar_enabled());     // OFF
        assert!(!BufferState::Black.sidecar_enabled());   // OFF
        // sidecar FULL (upscaling pesado) SOLO en GREEN
        assert!(BufferState::Green.sidecar_full());
        assert!(!BufferState::Yellow.sidecar_full());     // limitado, no full
        assert!(!BufferState::Orange.sidecar_full());
    }

    // ── Punto 3: prefetch_depth cambia por estado (3/6/10/15/0) ──
    #[test]
    fn p3_prefetch_depth_changes_by_state() {
        assert_eq!(BufferState::Green.prefetch_depth(), 3);
        assert_eq!(BufferState::Yellow.prefetch_depth(), 6);
        assert_eq!(BufferState::Orange.prefetch_depth(), 10);
        assert_eq!(BufferState::Red.prefetch_depth(), 15);
        assert_eq!(BufferState::Black.prefetch_depth(), 0);  // BLACK no descarga agresiva
        // todos distintos (cambia por estado)
        let depths = [
            BufferState::Green.prefetch_depth(),
            BufferState::Yellow.prefetch_depth(),
            BufferState::Orange.prefetch_depth(),
            BufferState::Red.prefetch_depth(),
        ];
        for i in 0..depths.len() {
            for j in (i + 1)..depths.len() {
                assert_ne!(depths[i], depths[j], "prefetch_depth debe cambiar por estado");
            }
        }
    }

    // ── Jerarquía: buffer_percent honesto + upstream_alive ──
    #[test]
    fn p_hierarchy_buffer_percent_and_alive() {
        let r = BufferReport {
            channel_id: "c".into(), buffer_s: 21.0, capacity_s: 30.0,
            throughput_bps: 10_000_000, variant_bps: 8_000_000,
            current_variant: None, rebuffer_count: 0, dropped_frames: 0,
            live_edge_delta_ms: 0, playback_state: None,
        };
        assert_eq!(r.buffer_percent(), 70.0);
        assert!(r.upstream_alive());
        let dead = BufferReport { throughput_bps: 0, ..r.clone() };
        assert!(!dead.upstream_alive());
        assert_eq!(BufferState::classify(dead.buffer_percent(), dead.upstream_alive()), BufferState::Black);
    }
}
