//! Upload handlers

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    body::Bytes,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::io::Write;

use crate::state::AppState;
use crate::metrics::Metrics;
use crate::jwt;

type SharedState = (Arc<AppState>, Arc<Metrics>);

// ═══════════════════════════════════════════════════════════════════════════
// INIT UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
pub struct InitRequest {
    pub filename: String,
    pub filesize: u64,
    #[serde(default = "default_chunk_size")]
    pub chunk_size: u64,
}

fn default_chunk_size() -> u64 {
    20 * 1024 * 1024 // 20MB
}

#[derive(Serialize)]
pub struct InitResponse {
    pub success: bool,
    pub upload_id: String,
    pub total_chunks: u32,
    pub chunk_size: u64,
    pub jwt_init: String,
    pub jwt_status: String,
    pub jwt_finalize: String,
}

pub async fn init_upload(
    State((state, metrics)): State<SharedState>,
    Json(req): Json<InitRequest>,
) -> Result<Json<InitResponse>, (StatusCode, String)> {
    tracing::info!("📤 Init upload: {} ({} bytes)", req.filename, req.filesize);

    // Calculate total chunks
    let total_chunks = (req.filesize as f64 / req.chunk_size as f64).ceil() as u32;
    
    // Generate upload ID
    let upload_id = format!("upload_{}_{}", 
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4().to_string()[..8].to_string()
    );

    // Create upload state
    state.create_upload(
        upload_id.clone(),
        req.filename.clone(),
        req.filesize,
        total_chunks,
        req.chunk_size,
    );

    // Create chunks directory
    let chunk_dir = format!("uploads/tmp/{}", upload_id);
    std::fs::create_dir_all(&chunk_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create directory: {}", e)))?;

    // Generate JWTs
    let jwt_init = jwt::sign_init_jwt(&upload_id, total_chunks);
    let jwt_status = jwt::sign_status_jwt(&upload_id);
    let jwt_finalize = jwt::sign_finalize_jwt(&upload_id);

    // Update metrics
    metrics.uploads_active.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Persist state
    if let Some(upload_state) = state.get_upload(&upload_id) {
        upload_state.persist(&upload_id).ok();
    }

    tracing::info!("✅ Upload initialized: {} ({} chunks)", upload_id, total_chunks);

    Ok(Json(InitResponse {
        success: true,
        upload_id,
        total_chunks,
        chunk_size: req.chunk_size,
        jwt_init,
        jwt_status,
        jwt_finalize,
    }))
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD CHUNK
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Serialize)]
pub struct ChunkResponse {
    pub success: bool,
    pub upload_id: String,
    pub chunk_index: u32,
    pub chunk_size: usize,
    pub received_chunks: u32,
    pub total_chunks: u32,
    pub progress: f64,
    pub complete: bool,
}

pub async fn upload_chunk(
    State((state, metrics)): State<SharedState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ChunkResponse>, (StatusCode, String)> {
    // Extract headers
    let upload_id = headers.get("x-upload-id")
        .and_then(|h| h.to_str().ok())
        .ok_or((StatusCode::BAD_REQUEST, "Missing X-Upload-Id header".to_string()))?
        .to_string();

    let chunk_index: u32 = headers.get("x-chunk-index")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or((StatusCode::BAD_REQUEST, "Missing or invalid X-Chunk-Index header".to_string()))?;

    let expected_md5 = headers.get("x-chunk-md5")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    // Validate MD5 if provided
    if let Some(expected) = &expected_md5 {
        let actual = format!("{:x}", md5::compute(&body));
        if &actual != expected {
            metrics.chunk_errors.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Err((StatusCode::BAD_REQUEST, format!(
                "MD5 mismatch: expected {}, got {}", expected, actual
            )));
        }
    }

    // Get upload state
    let upload_state = state.get_upload(&upload_id)
        .ok_or((StatusCode::NOT_FOUND, format!("Upload not found: {}", upload_id)))?;

    // Check if chunk already received
    if upload_state.received_chunks.contains_key(&chunk_index) {
        return Ok(Json(ChunkResponse {
            success: true,
            upload_id: upload_id.clone(),
            chunk_index,
            chunk_size: body.len(),
            received_chunks: upload_state.received_count.load(std::sync::atomic::Ordering::SeqCst),
            total_chunks: upload_state.total_chunks,
            progress: upload_state.get_progress(),
            complete: upload_state.is_complete(),
        }));
    }

    // Save chunk to disk
    let chunk_path = format!("uploads/tmp/{}/{:06}.part", upload_id, chunk_index);
    let mut file = std::fs::File::create(&chunk_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create chunk file: {}", e)))?;
    
    file.write_all(&body)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write chunk: {}", e)))?;

    // Mark chunk as received
    upload_state.mark_chunk_received(chunk_index);

    // Update metrics
    metrics.chunks_received.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Persist state
    upload_state.persist(&upload_id).ok();

    let received = upload_state.received_count.load(std::sync::atomic::Ordering::SeqCst);
    let progress = upload_state.get_progress();
    let complete = upload_state.is_complete();

    tracing::debug!("📦 Chunk {}/{} received for {} ({:.1}%)", 
        chunk_index + 1, upload_state.total_chunks, upload_id, progress);

    Ok(Json(ChunkResponse {
        success: true,
        upload_id,
        chunk_index,
        chunk_size: body.len(),
        received_chunks: received,
        total_chunks: upload_state.total_chunks,
        progress,
        complete,
    }))
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD STATUS
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Serialize)]
pub struct StatusResponse {
    pub success: bool,
    pub upload_id: String,
    pub filename: String,
    pub filesize: u64,
    pub total_chunks: u32,
    pub received_chunks: Vec<u32>,
    pub missing_chunks: Vec<u32>,
    pub progress: f64,
    pub complete: bool,
}

pub async fn upload_status(
    State((state, _metrics)): State<SharedState>,
    Path(upload_id): Path<String>,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let upload_state = state.get_upload(&upload_id)
        .ok_or((StatusCode::NOT_FOUND, format!("Upload not found: {}", upload_id)))?;

    Ok(Json(StatusResponse {
        success: true,
        upload_id: upload_id.clone(),
        filename: upload_state.filename.clone(),
        filesize: upload_state.filesize,
        total_chunks: upload_state.total_chunks,
        received_chunks: upload_state.get_received_chunks(),
        missing_chunks: upload_state.get_missing_chunks(),
        progress: upload_state.get_progress(),
        complete: upload_state.is_complete(),
    }))
}

// ═══════════════════════════════════════════════════════════════════════════
// FINALIZE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
pub struct FinalizeRequest {
    pub upload_id: String,
    #[serde(default)]
    pub strategy: String,
}

#[derive(Serialize)]
pub struct FinalizeResponse {
    pub success: bool,
    pub upload_id: String,
    pub filename: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub channels: u32,
    pub chunks_assembled: u32,
    pub public_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_url: Option<String>,
    pub strategy: String,
}

pub async fn finalize_upload(
    State((state, metrics)): State<SharedState>,
    Json(req): Json<FinalizeRequest>,
) -> Result<Json<FinalizeResponse>, (StatusCode, String)> {
    let upload_id = &req.upload_id;
    let strategy = if req.strategy.is_empty() { "replace".to_string() } else { req.strategy };

    tracing::info!("🔧 Finalizing upload: {} (strategy: {})", upload_id, strategy);

    // Get upload state
    let upload_state = state.get_upload(upload_id)
        .ok_or((StatusCode::NOT_FOUND, format!("Upload not found: {}", upload_id)))?;

    // Check if complete
    if !upload_state.is_complete() {
        let missing = upload_state.get_missing_chunks();
        return Err((StatusCode::BAD_REQUEST, format!(
            "Upload incomplete. Missing chunks: {:?}", missing
        )));
    }

    let filename = upload_state.filename.clone();
    let total_chunks = upload_state.total_chunks;
    
    // Drop the reference before removing
    drop(upload_state);

    // Assemble file
    let chunk_dir = format!("uploads/tmp/{}", upload_id);
    let output_path = format!("uploads/final/{}", filename);
    
    let mut output = std::fs::File::create(&output_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create output: {}", e)))?;

    let mut total_size: u64 = 0;
    
    for i in 0..total_chunks {
        let chunk_path = format!("{}/{:06}.part", chunk_dir, i);
        let data = std::fs::read(&chunk_path)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read chunk {}: {}", i, e)))?;
        total_size += data.len() as u64;
        output.write_all(&data)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write chunk {}: {}", i, e)))?;
    }

    drop(output);

    // Count channels
    let content = std::fs::read_to_string(&output_path).unwrap_or_default();
    let channels = content.matches("#EXTINF:").count() as u32;

    // Cleanup chunks
    std::fs::remove_dir_all(&chunk_dir).ok();
    std::fs::remove_file(format!("uploads/state/{}.json", upload_id)).ok();

    // Remove from state
    state.remove_upload(upload_id);
    metrics.uploads_active.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    metrics.uploads_completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Create version if needed
    let version_url = if strategy == "both" || strategy == "version" {
        let versions_dir = "uploads/versions";
        std::fs::create_dir_all(versions_dir).ok();
        let version_filename = format!("{}_v{}.m3u8", 
            filename.trim_end_matches(".m3u8").trim_end_matches(".m3u"),
            chrono::Utc::now().format("%Y%m%d_%H%M%S")
        );
        let version_path = format!("{}/{}", versions_dir, version_filename);
        std::fs::copy(&output_path, &version_path).ok();
        Some(format!("http://178.156.147.234/versions/{}", version_filename))
    } else {
        None
    };

    // Format size
    let size_formatted = if total_size > 1024 * 1024 {
        format!("{:.2} MB", total_size as f64 / 1024.0 / 1024.0)
    } else {
        format!("{:.2} KB", total_size as f64 / 1024.0)
    };

    tracing::info!("✅ Upload finalized: {} ({}, {} channels)", 
        upload_id, size_formatted, channels);

    Ok(Json(FinalizeResponse {
        success: true,
        upload_id: upload_id.clone(),
        filename: filename.clone(),
        size_bytes: total_size,
        size_formatted,
        channels,
        chunks_assembled: total_chunks,
        public_url: format!("http://178.156.147.234/{}", filename),
        version_url,
        strategy,
    }))
}
