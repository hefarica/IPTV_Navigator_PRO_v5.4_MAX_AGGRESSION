//! WebSocket progress notifications

use axum::{
    extract::{Path, State, WebSocketUpgrade, ws::{WebSocket, Message}},
    response::IntoResponse,
};
use std::sync::Arc;
use tokio::time::{interval, Duration};
use futures::{SinkExt, StreamExt};

use crate::state::AppState;
use crate::metrics::Metrics;

type SharedState = (Arc<AppState>, Arc<Metrics>);

pub async fn ws_progress(
    Path(upload_id): Path<String>,
    State(state): State<SharedState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, upload_id, state))
}

async fn handle_ws(socket: WebSocket, upload_id: String, (state, _metrics): SharedState) {
    let (mut sender, mut receiver) = socket.split();
    
    tracing::info!("📡 WebSocket connected for upload: {}", upload_id);
    
    // Send progress updates every 500ms
    let upload_id_clone = upload_id.clone();
    let state_clone = state.clone();
    
    let mut send_task = tokio::spawn(async move {
        let mut tick = interval(Duration::from_millis(500));
        
        loop {
            tick.tick().await;
            
            if let Some(upload_state) = state_clone.get_upload(&upload_id_clone) {
                let received = upload_state.received_count.load(std::sync::atomic::Ordering::SeqCst);
                let total = upload_state.total_chunks;
                let progress = upload_state.get_progress();
                let complete = upload_state.is_complete();
                
                let msg = serde_json::json!({
                    "type": "progress",
                    "upload_id": upload_id_clone,
                    "received": received,
                    "total": total,
                    "percent": progress,
                    "complete": complete
                });
                
                if sender.send(Message::Text(msg.to_string())).await.is_err() {
                    break;
                }
                
                // If complete, send final message and close
                if complete {
                    let final_msg = serde_json::json!({
                        "type": "complete",
                        "upload_id": upload_id_clone,
                        "message": "Upload complete, ready for finalization"
                    });
                    sender.send(Message::Text(final_msg.to_string())).await.ok();
                    break;
                }
            } else {
                // Upload not found, might be completed/cleaned up
                let error_msg = serde_json::json!({
                    "type": "error",
                    "upload_id": upload_id_clone,
                    "message": "Upload not found"
                });
                sender.send(Message::Text(error_msg.to_string())).await.ok();
                break;
            }
        }
    });
    
    // Handle incoming messages (for ping/pong or commands)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    // Could handle commands here
                    tracing::debug!("📨 WS received: {}", text);
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });
    
    // Wait for either task to complete
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
    
    tracing::info!("📡 WebSocket disconnected for upload: {}", upload_id);
}
