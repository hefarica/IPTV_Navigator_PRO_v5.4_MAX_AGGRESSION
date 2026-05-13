//! ═══════════════════════════════════════════════════════════════════════════
//! 🦀 IPTV Navigator PRO - Upload Server (Rust/Axum)
//! ═══════════════════════════════════════════════════════════════════════════
//! Enterprise-grade chunked upload server with:
//! - JWT authentication with scopes
//! - Chunked uploads with resume support
//! - WebSocket progress notifications
//! - MD5 checksum validation
//! - Rate limiting per IP
//! - Automatic cleanup
//! - Real-time metrics
//! ═══════════════════════════════════════════════════════════════════════════

mod state;
mod jwt;
mod upload;
mod ws;
mod cleanup;
mod metrics;

use axum::{
    Router,
    routing::{get, post},
    http::{Method, HeaderValue},
};
use tower_http::cors::{CorsLayer, Any};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;
use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;
use crate::metrics::Metrics;

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🦀 IPTV Navigator PRO - Upload Server v1.0.0");
    tracing::info!("   Starting enterprise upload service...");

    // Create shared state
    let state = Arc::new(AppState::new());
    let metrics = Arc::new(Metrics::new());

    // Create directories
    std::fs::create_dir_all("uploads/tmp").ok();
    std::fs::create_dir_all("uploads/state").ok();
    std::fs::create_dir_all("uploads/final").ok();

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .expose_headers(Any);

    // Build router
    let app = Router::new()
        // Health check
        .route("/health", get(health_check))
        
        // Upload endpoints
        .route("/upload/init", post(upload::init_upload))
        .route("/upload/chunk", post(upload::upload_chunk))
        .route("/upload/status/:upload_id", get(upload::upload_status))
        .route("/upload/finalize", post(upload::finalize_upload))
        
        // WebSocket progress
        .route("/ws/progress/:upload_id", get(ws::ws_progress))
        
        // Metrics
        .route("/metrics", get(metrics::metrics_endpoint))
        
        // Apply layers
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(25 * 1024 * 1024)) // 25MB per chunk
        .layer(TraceLayer::new_for_http())
        .with_state((state.clone(), metrics.clone()));

    // Start cleanup task
    let cleanup_state = state.clone();
    let cleanup_metrics = metrics.clone();
    tokio::spawn(async move {
        cleanup::start_cleanup(cleanup_state, cleanup_metrics).await;
    });

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 8766));
    tracing::info!("🚀 Server listening on http://{}", addr);
    tracing::info!("   Endpoints:");
    tracing::info!("     POST /upload/init");
    tracing::info!("     POST /upload/chunk");
    tracing::info!("     GET  /upload/status/:upload_id");
    tracing::info!("     POST /upload/finalize");
    tracing::info!("     WS   /ws/progress/:upload_id");
    tracing::info!("     GET  /metrics");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "service": "IPTV Upload Server (Rust)",
        "version": "1.0.0",
        "features": ["chunked", "jwt", "websocket", "resume"]
    }))
}
