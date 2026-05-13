//! JWT authentication with scopes

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;

// Secret key - in production, load from environment
static SECRET: Lazy<String> = Lazy::new(|| {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| "IPTV_UPLOAD_SECRET_KEY_2026".to_string())
});

/// JWT Claims structure
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub upload_id: String,
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_chunks: Option<u32>,
    pub exp: usize,
    pub iat: usize,
}

/// Scopes for different operations
pub mod scopes {
    pub const INIT: &str = "upload:init";
    pub const CHUNK: &str = "upload:chunk";
    pub const STATUS: &str = "upload:status";
    pub const FINALIZE: &str = "upload:finalize";
}

/// Generate JWT for upload init
pub fn sign_init_jwt(upload_id: &str, total_chunks: u32) -> String {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        upload_id: upload_id.to_string(),
        scope: scopes::INIT.to_string(),
        chunk: None,
        total_chunks: Some(total_chunks),
        exp: now + 3600, // 1 hour
        iat: now,
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(SECRET.as_bytes()),
    ).unwrap()
}

/// Generate JWT for a specific chunk
pub fn sign_chunk_jwt(upload_id: &str, chunk_index: u32) -> String {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        upload_id: upload_id.to_string(),
        scope: scopes::CHUNK.to_string(),
        chunk: Some(chunk_index),
        total_chunks: None,
        exp: now + 300, // 5 minutes
        iat: now,
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(SECRET.as_bytes()),
    ).unwrap()
}

/// Generate JWT for status check
pub fn sign_status_jwt(upload_id: &str) -> String {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        upload_id: upload_id.to_string(),
        scope: scopes::STATUS.to_string(),
        chunk: None,
        total_chunks: None,
        exp: now + 3600, // 1 hour
        iat: now,
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(SECRET.as_bytes()),
    ).unwrap()
}

/// Generate JWT for finalize
pub fn sign_finalize_jwt(upload_id: &str) -> String {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        upload_id: upload_id.to_string(),
        scope: scopes::FINALIZE.to_string(),
        chunk: None,
        total_chunks: None,
        exp: now + 600, // 10 minutes
        iat: now,
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(SECRET.as_bytes()),
    ).unwrap()
}

/// Validate JWT and return claims
pub fn validate_jwt(token: &str) -> Result<Claims, String> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(SECRET.as_bytes()),
        &Validation::default(),
    ).map_err(|e| format!("Invalid JWT: {}", e))?;
    
    Ok(token_data.claims)
}

/// Validate JWT for chunk upload
pub fn validate_chunk_jwt(token: &str, expected_upload_id: &str, expected_chunk: u32) -> Result<Claims, String> {
    let claims = validate_jwt(token)?;
    
    if claims.scope != scopes::CHUNK {
        return Err(format!("Invalid scope: expected {}, got {}", scopes::CHUNK, claims.scope));
    }
    
    if claims.upload_id != expected_upload_id {
        return Err("Upload ID mismatch".to_string());
    }
    
    if claims.chunk != Some(expected_chunk) {
        return Err(format!("Chunk mismatch: expected {}, got {:?}", expected_chunk, claims.chunk));
    }
    
    Ok(claims)
}

/// Validate JWT for status check
pub fn validate_status_jwt(token: &str, expected_upload_id: &str) -> Result<Claims, String> {
    let claims = validate_jwt(token)?;
    
    if claims.scope != scopes::STATUS && claims.scope != scopes::INIT {
        return Err(format!("Invalid scope for status: {}", claims.scope));
    }
    
    if claims.upload_id != expected_upload_id {
        return Err("Upload ID mismatch".to_string());
    }
    
    Ok(claims)
}

/// Validate JWT for finalize
pub fn validate_finalize_jwt(token: &str, expected_upload_id: &str) -> Result<Claims, String> {
    let claims = validate_jwt(token)?;
    
    if claims.scope != scopes::FINALIZE && claims.scope != scopes::INIT {
        return Err(format!("Invalid scope for finalize: {}", claims.scope));
    }
    
    if claims.upload_id != expected_upload_id {
        return Err("Upload ID mismatch".to_string());
    }
    
    Ok(claims)
}

/// Extract token from Authorization header
pub fn extract_bearer_token(auth_header: Option<&str>) -> Result<String, String> {
    let header = auth_header.ok_or("Missing Authorization header")?;
    
    if !header.starts_with("Bearer ") {
        return Err("Invalid Authorization header format".to_string());
    }
    
    Ok(header[7..].to_string())
}
