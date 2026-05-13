//! Stream Probe Server - High-performance IPTV stream quality analyzer
//! 
//! Features:
//! - Parallel stream probing with configurable concurrency (default 150)
//! - WebSocket progress updates in real-time
//! - ffprobe-based stream analysis (resolution, codec, bitrate, fps)
//! - 5-second timeout per stream for efficiency

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    process::Command,
    sync::{broadcast, Mutex, OnceCell},
    time::timeout,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tracing::info;

// Global cache for ffprobe availability (checked once at startup)
static FFPROBE_AVAILABLE: OnceCell<bool> = OnceCell::const_new();

// ============================================================================
// CONFIGURATION - V1.0.5 OPTIMIZED FOR STABILITY
// ============================================================================

const MAX_CONCURRENT_PROBES: usize = 20;  // Reduced from 150 to prevent crashes
const PROBE_TIMEOUT_SECS: u64 = 8;        // Increased timeout for slower streams
const SERVER_PORT: u16 = 8765;
const MAX_BODY_LIMIT_MB: usize = 50;
const BATCH_SIZE: usize = 100;            // Process 100 channels at a time internally

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// V1.0.3: Campos más flexibles para manejar null/undefined de JS
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChannelInput {
    #[serde(default)]
    id: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    resolution: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProbeResult {
    channel_id: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bitrate: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProbeRequest {
    channels: Vec<ChannelInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProbeResponse {
    success: bool,
    total: usize,
    success_count: usize,
    error_count: usize,
    duration_secs: f64,
    results: Vec<ProbeResult>,
}

#[derive(Debug, Clone, Serialize)]
struct ProgressUpdate {
    current: usize,
    total: usize,
    percent: f64,
    success_count: usize,
    error_count: usize,
    eta_seconds: f64,
    current_channel: String,
}

// ============================================================================
// APP STATE
// ============================================================================

struct AppState {
    progress_tx: broadcast::Sender<ProgressUpdate>,
    is_probing: Mutex<bool>,
}

impl AppState {
    fn new() -> Self {
        let (progress_tx, _) = broadcast::channel(100);
        Self {
            progress_tx,
            is_probing: Mutex::new(false),
        }
    }
}

// ============================================================================
// HANDLERS
// ============================================================================

async fn health_handler() -> impl IntoResponse {
    // Use cached ffprobe availability (instant response)
    let ffprobe_available = FFPROBE_AVAILABLE.get_or_init(|| async {
        check_ffprobe_available_internal().await
    }).await;
    
    Json(serde_json::json!({
        "status": "OK",
        "version": "1.0.5",
        "service": "Stream Probe Server (Rust)",
        "max_concurrent": MAX_CONCURRENT_PROBES,
        "probe_timeout_secs": PROBE_TIMEOUT_SECS,
        "body_limit_mb": MAX_BODY_LIMIT_MB,
        "ffprobe_available": *ffprobe_available
    }))
}

async fn check_ffprobe_available_internal() -> bool {
    Command::new("ffprobe")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

async fn probe_all_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProbeRequest>,
) -> impl IntoResponse {
    // Check if already probing
    {
        let mut is_probing = state.is_probing.lock().await;
        if *is_probing {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "success": false,
                    "error": "Probe already in progress"
                })),
            );
        }
        *is_probing = true;
    }

    let start_time = std::time::Instant::now();
    
    // V1.0.3: Filtrar canales con URL vacía
    let total_input = request.channels.len();
    let valid_channels: Vec<ChannelInput> = request.channels
        .into_iter()
        .filter(|ch| !ch.url.is_empty() && ch.url.starts_with("http"))
        .collect();
    
    let total_received = valid_channels.len();
    let skipped = total_input.saturating_sub(total_received);
    
    info!("📊 Received {} channels, {} valid (skipped {} without URL)", 
          total_received + skipped, total_received, skipped);

    if total_received == 0 {
        let mut is_probing = state.is_probing.lock().await;
        *is_probing = false;
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "error": "No valid channels with URLs provided"
            })),
        );
    }

    // Verify ffprobe is available (using cached value)
    let ffprobe_available = FFPROBE_AVAILABLE.get_or_init(|| async {
        check_ffprobe_available_internal().await
    }).await;
    
    if !*ffprobe_available {
        let mut is_probing = state.is_probing.lock().await;
        *is_probing = false;
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "success": false,
                "error": "ffprobe not found. Please install FFmpeg."
            })),
        );
    }

    let total = total_received;
    info!("🔬 Starting probe of {} channels (batch={}, concurrent={})", total, BATCH_SIZE, MAX_CONCURRENT_PROBES);

    // V1.0.5: Process in smaller batches with reduced concurrency for stability
    let progress_tx = state.progress_tx.clone();
    let mut results = Vec::with_capacity(total);
    let mut success_count = 0;
    let mut error_count = 0;

    // Process channels in batches
    for batch_start in (0..total).step_by(BATCH_SIZE) {
        let batch_end = std::cmp::min(batch_start + BATCH_SIZE, total);
        let batch_channels: Vec<_> = valid_channels[batch_start..batch_end].to_vec();
        let batch_size = batch_channels.len();
        
        info!("📦 Processing batch {}-{} of {} ({} channels)", 
              batch_start, batch_end, total, batch_size);

        // Create channel for this batch's results
        let (result_tx, mut result_rx) = tokio::sync::mpsc::channel::<ProbeResult>(batch_size);
        let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_PROBES));

        // Spawn tasks for this batch only
        for channel in batch_channels {
            let semaphore = semaphore.clone();
            let result_tx = result_tx.clone();
            
            tokio::spawn(async move {
                let _permit = semaphore.acquire().await.unwrap();
                let result = probe_single_stream(&channel).await;
                let _ = result_tx.send(result).await;
            });
        }

        drop(result_tx); // Close sender to allow receiver to complete

        // Collect batch results
        while let Some(result) = result_rx.recv().await {
            if result.success {
                success_count += 1;
            } else {
                error_count += 1;
            }
            
            let current = results.len() + 1;
            let elapsed = start_time.elapsed().as_secs_f64();
            let rate = current as f64 / elapsed;
            let remaining = total - current;
            let eta = if rate > 0.0 { remaining as f64 / rate } else { 0.0 };

            // Send progress update
            let _ = progress_tx.send(ProgressUpdate {
                current,
                total,
                percent: (current as f64 / total as f64) * 100.0,
                success_count,
                error_count,
                eta_seconds: eta,
                current_channel: result.channel_id.clone(),
            });

            results.push(result);
        }
        
        info!("✅ Batch completed. Progress: {}/{} ({:.1}%)", 
              results.len(), total, (results.len() as f64 / total as f64) * 100.0);
    }

    let duration = start_time.elapsed().as_secs_f64();
    
    info!(
        "Probe completed: {}/{} successful in {:.1}s ({:.1} ch/s)",
        success_count, total, duration, total as f64 / duration
    );

    // Release probing lock
    {
        let mut is_probing = state.is_probing.lock().await;
        *is_probing = false;
    }

    (
        StatusCode::OK,
        Json(serde_json::json!(ProbeResponse {
            success: true,
            total,
            success_count,
            error_count,
            duration_secs: duration,
            results,
        })),
    )
}

async fn probe_single_stream(channel: &ChannelInput) -> ProbeResult {
    let url = &channel.url;
    
    if url.is_empty() {
        return ProbeResult {
            channel_id: channel.id.clone(),
            success: false,
            width: None,
            height: None,
            codec: None,
            bitrate: None,
            fps: None,
            error: Some("Empty URL".to_string()),
        };
    }

    // Run ffprobe with timeout
    let probe_future = async {
        Command::new("ffprobe")
            .args([
                "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-select_streams", "v:0",
                "-analyzeduration", "3000000",  // 3 seconds
                "-probesize", "5000000",        // 5MB
                url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .await
    };

    let result = match timeout(Duration::from_secs(PROBE_TIMEOUT_SECS), probe_future).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            return ProbeResult {
                channel_id: channel.id.clone(),
                success: false,
                width: None,
                height: None,
                codec: None,
                bitrate: None,
                fps: None,
                error: Some(format!("ffprobe error: {}", e)),
            };
        }
        Err(_) => {
            return ProbeResult {
                channel_id: channel.id.clone(),
                success: false,
                width: None,
                height: None,
                codec: None,
                bitrate: None,
                fps: None,
                error: Some("Timeout".to_string()),
            };
        }
    };

    // Parse ffprobe JSON output
    let stdout = String::from_utf8_lossy(&result.stdout);
    
    match serde_json::from_str::<serde_json::Value>(&stdout) {
        Ok(json) => {
            if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
                if let Some(stream) = streams.first() {
                    let width = stream.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
                    let height = stream.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
                    let codec = stream.get("codec_name").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let bitrate = stream.get("bit_rate")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<u64>().ok())
                        .map(|b| b / 1000); // Convert to kbps
                    
                    // Parse FPS from avg_frame_rate (e.g., "30000/1001")
                    let fps = stream.get("avg_frame_rate")
                        .and_then(|v| v.as_str())
                        .and_then(|s| {
                            let parts: Vec<&str> = s.split('/').collect();
                            if parts.len() == 2 {
                                let num: f64 = parts[0].parse().ok()?;
                                let den: f64 = parts[1].parse().ok()?;
                                if den > 0.0 { Some(num / den) } else { None }
                            } else {
                                s.parse().ok()
                            }
                        });

                    return ProbeResult {
                        channel_id: channel.id.clone(),
                        success: width.is_some() && height.is_some(),
                        width,
                        height,
                        codec,
                        bitrate,
                        fps,
                        error: None,
                    };
                }
            }
            
            ProbeResult {
                channel_id: channel.id.clone(),
                success: false,
                width: None,
                height: None,
                codec: None,
                bitrate: None,
                fps: None,
                error: Some("No video stream found".to_string()),
            }
        }
        Err(e) => ProbeResult {
            channel_id: channel.id.clone(),
            success: false,
            width: None,
            height: None,
            codec: None,
            bitrate: None,
            fps: None,
            error: Some(format!("JSON parse error: {}", e)),
        },
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut progress_rx = state.progress_tx.subscribe();

    // Forward progress updates to WebSocket
    let send_task = tokio::spawn(async move {
        while let Ok(progress) = progress_rx.recv().await {
            if let Ok(json) = serde_json::to_string(&progress) {
                if sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Handle incoming messages (just keep alive)
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}

// ============================================================================
// MAIN
// ============================================================================

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "stream_probe_server=info".into()),
        )
        .init();

    let state = Arc::new(AppState::new());

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router with increased body limit (50MB for large channel lists)
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/probe-all", post(probe_all_handler))
        .route("/ws/progress", get(ws_handler))
        .layer(RequestBodyLimitLayer::new(50 * 1024 * 1024)) // 50MB limit
        .layer(cors)
        .with_state(state);

    let addr = format!("127.0.0.1:{}", SERVER_PORT);
    info!("╔═══════════════════════════════════════════════════════════════╗");
    info!("║     STREAM PROBE SERVER v1.0.2 (Rust)                        ║");
    info!("╠═══════════════════════════════════════════════════════════════╣");
    info!("║  HTTP: http://{}                                  ║", addr);
    info!("║  WS:   ws://{}/ws/progress                     ║", addr);
    info!("║  Concurrent probes: {}                                      ║", MAX_CONCURRENT_PROBES);
    info!("║  Probe timeout: {}s                                          ║", PROBE_TIMEOUT_SECS);
    info!("║  Body limit: 50MB (para listas grandes)                       ║");
    info!("╚═══════════════════════════════════════════════════════════════╝");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
