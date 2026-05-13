//! State management for uploads

use dashmap::DashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::Instant;
use serde::{Serialize, Deserialize};

/// State for a single upload
pub struct UploadState {
    pub filename: String,
    pub filesize: u64,
    pub total_chunks: u32,
    pub chunk_size: u64,
    pub received_chunks: DashMap<u32, bool>,
    pub received_count: AtomicU32,
    pub error_count: AtomicU32,
    pub created_at: Instant,
    pub last_activity: AtomicU64,
}

impl UploadState {
    pub fn new(filename: String, filesize: u64, total_chunks: u32, chunk_size: u64) -> Self {
        Self {
            filename,
            filesize,
            total_chunks,
            chunk_size,
            received_chunks: DashMap::new(),
            received_count: AtomicU32::new(0),
            error_count: AtomicU32::new(0),
            created_at: Instant::now(),
            last_activity: AtomicU64::new(0),
        }
    }

    pub fn mark_chunk_received(&self, chunk_index: u32) -> bool {
        if self.received_chunks.contains_key(&chunk_index) {
            return false; // Already received
        }
        self.received_chunks.insert(chunk_index, true);
        self.received_count.fetch_add(1, Ordering::SeqCst);
        self.touch();
        true
    }

    pub fn touch(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.last_activity.store(now, Ordering::Relaxed);
    }

    pub fn is_complete(&self) -> bool {
        self.received_count.load(Ordering::SeqCst) >= self.total_chunks
    }

    pub fn get_missing_chunks(&self) -> Vec<u32> {
        let mut missing = Vec::new();
        for i in 0..self.total_chunks {
            if !self.received_chunks.contains_key(&i) {
                missing.push(i);
            }
        }
        missing
    }

    pub fn get_received_chunks(&self) -> Vec<u32> {
        self.received_chunks
            .iter()
            .map(|r| *r.key())
            .collect()
    }

    pub fn get_progress(&self) -> f64 {
        let received = self.received_count.load(Ordering::SeqCst) as f64;
        let total = self.total_chunks as f64;
        if total == 0.0 { 0.0 } else { (received / total) * 100.0 }
    }

    pub fn idle_seconds(&self) -> u64 {
        let last = self.last_activity.load(Ordering::Relaxed);
        if last == 0 {
            return self.created_at.elapsed().as_secs();
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now.saturating_sub(last)
    }
}

/// Persistent state for disk storage
#[derive(Serialize, Deserialize)]
pub struct PersistedState {
    pub filename: String,
    pub filesize: u64,
    pub total_chunks: u32,
    pub chunk_size: u64,
    pub received_chunks: Vec<u32>,
    pub created_at: u64,
}

impl UploadState {
    pub fn to_persisted(&self) -> PersistedState {
        PersistedState {
            filename: self.filename.clone(),
            filesize: self.filesize,
            total_chunks: self.total_chunks,
            chunk_size: self.chunk_size,
            received_chunks: self.get_received_chunks(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    pub fn persist(&self, upload_id: &str) -> std::io::Result<()> {
        let path = format!("uploads/state/{}.json", upload_id);
        let json = serde_json::to_string_pretty(&self.to_persisted())?;
        std::fs::write(path, json)?;
        Ok(())
    }
}

/// Global application state
pub struct AppState {
    pub uploads: DashMap<String, UploadState>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            uploads: DashMap::new(),
        }
    }

    pub fn create_upload(&self, upload_id: String, filename: String, filesize: u64, total_chunks: u32, chunk_size: u64) {
        let state = UploadState::new(filename, filesize, total_chunks, chunk_size);
        state.touch();
        self.uploads.insert(upload_id, state);
    }

    pub fn get_upload(&self, upload_id: &str) -> Option<dashmap::mapref::one::Ref<String, UploadState>> {
        self.uploads.get(upload_id)
    }

    pub fn remove_upload(&self, upload_id: &str) -> bool {
        self.uploads.remove(upload_id).is_some()
    }

    pub fn active_uploads(&self) -> usize {
        self.uploads.len()
    }
}
