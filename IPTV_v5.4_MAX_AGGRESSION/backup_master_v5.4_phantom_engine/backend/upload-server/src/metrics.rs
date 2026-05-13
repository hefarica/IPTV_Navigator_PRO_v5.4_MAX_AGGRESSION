//! Real-time metrics

use axum::{extract::State, Json};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use sysinfo::System;

use crate::state::AppState;

pub struct Metrics {
    pub uploads_active: AtomicU64,
    pub uploads_completed: AtomicU64,
    pub uploads_cleaned: AtomicU64,
    pub chunks_received: AtomicU64,
    pub chunk_errors: AtomicU64,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            uploads_active: AtomicU64::new(0),
            uploads_completed: AtomicU64::new(0),
            uploads_cleaned: AtomicU64::new(0),
            chunks_received: AtomicU64::new(0),
            chunk_errors: AtomicU64::new(0),
        }
    }
}

type SharedState = (Arc<AppState>, Arc<Metrics>);

pub async fn metrics_endpoint(
    State((state, metrics)): State<SharedState>,
) -> Json<serde_json::Value> {
    // Get system info
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    let used_memory = sys.used_memory();
    let total_memory = sys.total_memory();
    let memory_percent = (used_memory as f64 / total_memory as f64) * 100.0;
    
    // Calculate upload details
    let mut uploads_detail = Vec::new();
    for entry in state.uploads.iter() {
        let upload_id = entry.key();
        let upload_state = entry.value();
        uploads_detail.push(serde_json::json!({
            "upload_id": upload_id,
            "filename": upload_state.filename,
            "progress": upload_state.get_progress(),
            "received": upload_state.received_count.load(Ordering::Relaxed),
            "total": upload_state.total_chunks,
            "idle_secs": upload_state.idle_seconds(),
        }));
    }
    
    Json(serde_json::json!({
        "status": "ok",
        "service": "IPTV Upload Server",
        "version": "1.0.0",
        "metrics": {
            "uploads_active": metrics.uploads_active.load(Ordering::Relaxed),
            "uploads_completed": metrics.uploads_completed.load(Ordering::Relaxed),
            "uploads_cleaned": metrics.uploads_cleaned.load(Ordering::Relaxed),
            "chunks_received": metrics.chunks_received.load(Ordering::Relaxed),
            "chunk_errors": metrics.chunk_errors.load(Ordering::Relaxed),
        },
        "system": {
            "memory_used_mb": used_memory / 1024 / 1024,
            "memory_total_mb": total_memory / 1024 / 1024,
            "memory_percent": format!("{:.1}%", memory_percent),
        },
        "active_uploads": uploads_detail,
    }))
}
