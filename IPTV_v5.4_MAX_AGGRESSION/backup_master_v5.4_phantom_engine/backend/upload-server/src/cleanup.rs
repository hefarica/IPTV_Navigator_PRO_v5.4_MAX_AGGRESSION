//! Automatic cleanup of stale uploads

use std::sync::Arc;
use tokio::time::{interval, Duration};

use crate::state::AppState;
use crate::metrics::Metrics;

const CLEANUP_INTERVAL_SECS: u64 = 300;  // 5 minutes
const MAX_IDLE_SECS: u64 = 900;          // 15 minutes
const MAX_ERROR_RATE: f32 = 0.3;         // 30% error rate

pub async fn start_cleanup(state: Arc<AppState>, metrics: Arc<Metrics>) {
    tracing::info!("🧹 Cleanup task started (interval: {}s, max idle: {}s)", 
        CLEANUP_INTERVAL_SECS, MAX_IDLE_SECS);
    
    let mut tick = interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
    
    loop {
        tick.tick().await;
        
        let mut cleaned = 0;
        let mut to_remove = Vec::new();
        
        // Collect uploads to clean
        for entry in state.uploads.iter() {
            let upload_id = entry.key().clone();
            let upload_state = entry.value();
            
            let idle = upload_state.idle_seconds();
            let error_count = upload_state.error_count.load(std::sync::atomic::Ordering::Relaxed);
            let received = upload_state.received_count.load(std::sync::atomic::Ordering::Relaxed);
            let total = upload_state.total_chunks;
            
            let error_rate = if received > 0 {
                error_count as f32 / received as f32
            } else {
                0.0
            };
            
            // Cleanup conditions
            let should_clean = 
                // Too idle and incomplete
                (idle > MAX_IDLE_SECS && received < total) ||
                // Too many errors
                (error_rate > MAX_ERROR_RATE && error_count > 5);
            
            if should_clean {
                to_remove.push((upload_id, idle, error_count));
            }
        }
        
        // Remove stale uploads
        for (upload_id, idle, errors) in to_remove {
            tracing::warn!("🧹 Cleaning stale upload: {} (idle: {}s, errors: {})", 
                upload_id, idle, errors);
            
            // Remove files
            let chunk_dir = format!("uploads/tmp/{}", upload_id);
            std::fs::remove_dir_all(&chunk_dir).ok();
            std::fs::remove_file(format!("uploads/state/{}.json", upload_id)).ok();
            
            // Remove from state
            state.remove_upload(&upload_id);
            metrics.uploads_active.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
            metrics.uploads_cleaned.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            
            cleaned += 1;
        }
        
        if cleaned > 0 {
            tracing::info!("🧹 Cleanup complete: {} uploads removed", cleaned);
        }
    }
}
