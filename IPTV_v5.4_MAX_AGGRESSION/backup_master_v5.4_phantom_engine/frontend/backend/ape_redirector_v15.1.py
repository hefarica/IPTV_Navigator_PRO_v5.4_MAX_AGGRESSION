#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
🎯 APE v15.1 REDIRECT MODE - Pure HTTP Redirector
═══════════════════════════════════════════════════════════════════════════

ARQUITECTURA:
    Cliente (OTT Navigator) 
    → APE Redirector (Flask)
    → HTTP 302/307 Redirect
    → CDN Original (conexión directa)

PROHIBIDO:
    ❌ requests.get(stream=True)
    ❌ iter_content / yield chunks
    ❌ Buffering de video
    ❌ Proxy de contenido multimedia

PERMITIDO:
    ✅ HTTP Redirects (302/307)
    ✅ URL validation
    ✅ CDN whitelist
    ✅ Logging
    ✅ <5ms response time
    
VERSION: 15.1.0-REDIRECT
═══════════════════════════════════════════════════════════════════════════
"""

from flask import Flask, redirect, request, jsonify, Response, stream_with_context
from urllib.parse import unquote, quote
from werkzeug.datastructures import FileStorage
import logging
import time
import re

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

ALLOWED_CDN_DOMAINS = [
    # Add your trusted CDN domains here
    'example-cdn.com',
    'stream-server.net',
    'iptv-cdn.io',
    # Wildcards handled in validation
]

# Server base URL for M3U transformation
# Change this to your actual server URL in production
REDIRECTOR_BASE_URL = "http://localhost:5000"

# Max file size (500MB)
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger('ape_redirector')

# ═══════════════════════════════════════════════════════════════════════════
# FLASK APP
# ═══════════════════════════════════════════════════════════════════════════

app = Flask(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# VALIDATION FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def is_valid_url(url: str) -> bool:
    """
    Validate that URL is properly formed and uses http/https.
    Does NOT download anything.
    """
    if not url:
        return False
    
    url_lower = url.lower()
    if not (url_lower.startswith('http://') or url_lower.startswith('https://')):
        return False
    
    # Basic SSRF protection - reject localhost/private IPs
    dangerous_patterns = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '192.168.',
        '10.',
        '172.16.',
        '::1',
        'metadata.google.internal'  # GCP protection
    ]
    
    for pattern in dangerous_patterns:
        if pattern in url_lower:
            return False
    
    return True


def is_whitelisted_cdn(url: str) -> bool:
    """
    Check if URL domain is in the allowed CDN whitelist.
    """
    if not ALLOWED_CDN_DOMAINS:
        # If whitelist is empty, accept all (NOT RECOMMENDED for production)
        logger.warning("⚠️ CDN whitelist is empty - accepting all domains")
        return True
    
    url_lower = url.lower()
    
    for allowed_domain in ALLOWED_CDN_DOMAINS:
        # Check if domain appears in URL (simple substring match)
        if allowed_domain.lower() in url_lower:
            return True
    
    return False


def is_stream_url(line: str) -> bool:
    """
    Check if line is a stream URL (not a directive).
    """
    line = line.strip()
    return line and not line.startswith('#') and (
        line.startswith('http://') or line.startswith('https://')
    )


def extract_channel_id(extinf_line: str) -> str:
    """
    Extract a simple channel ID from EXTINF line.
    Uses tvg-id if available, otherwise generates from channel name.
    """
    # Try to extract tvg-id
    tvg_id_match = re.search(r'tvg-id="([^"]+)"', extinf_line)
    if tvg_id_match:
        return tvg_id_match.group(1).lower().replace(' ', '_')
    
    # Try to extract channel name (last part after comma)
    name_match = re.search(r',(.+)$', extinf_line)
    if name_match:
        channel_name = name_match.group(1).strip()
        # Sanitize for URL
        return re.sub(r'[^a-z0-9_-]', '', channel_name.lower().replace(' ', '_'))
    
    return 'unknown'


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.route('/stream', methods=['GET'])
def redirector():
    """
    PURE HTTP REDIRECT - Does NOT download or proxy video.
    
    Parameters:
        - channel_id: Channel identifier (optional, for logging)
        - original_url: CDN URL to redirect to (URL-encoded)
    
    Returns:
        HTTP 302/307 redirect to original_url
    """
    start_time = time.time()
    
    # Extract parameters
    channel_id = request.args.get('channel_id', 'unknown')
    original_url_encoded = request.args.get('original_url', '')
    
    # Decode URL
    try:
        original_url = unquote(original_url_encoded)
    except Exception as e:
        logger.error(f"[{channel_id}] URL decode failed: {e}")
        return jsonify({
            'error': 'Invalid URL encoding',
            'channel_id': channel_id
        }), 400
    
    # Validate URL format
    if not is_valid_url(original_url):
        logger.warning(f"[{channel_id}] Invalid URL: {original_url[:100]}")
        return jsonify({
            'error': 'Invalid or dangerous URL',
            'channel_id': channel_id
        }), 403
    
    # Check CDN whitelist
    if not is_whitelisted_cdn(original_url):
        logger.warning(f"[{channel_id}] CDN not whitelisted: {original_url[:100]}")
        return jsonify({
            'error': 'CDN domain not allowed',
            'channel_id': channel_id
        }), 403
    
    # Calculate response time
    elapsed_ms = (time.time() - start_time) * 1000
    
    # Log redirect (for analytics/debugging)
    logger.info(f"[{channel_id}] REDIRECT → {original_url[:80]}... ({elapsed_ms:.2f}ms)")
    
    # ═══════════════════════════════════════════════════════════════════════
    # CRITICAL: PURE HTTP REDIRECT - NO PROXYING
    # ═══════════════════════════════════════════════════════════════════════
    # 302 = Temporary redirect (can change in future)
    # 307 = Temporary redirect (preserves method - use for POST if needed)
    # 301 = Permanent redirect (cacheable - NOT recommended for streams)
    
    return redirect(original_url, code=302)  # or 307 if you prefer


@app.route('/upload-m3u', methods=['POST'])
def upload_m3u():
    """
    STREAMING M3U UPLOAD - Process files up to 500MB without loading into memory.
    
    CRITICAL: Uses line-by-line streaming processing.
    - NO .read() of entire file
    - NO loading complete M3U into memory
    - Memory usage stays <50MB constant
    
    Accepts:
        - multipart/form-data with 'file' field
        - application/octet-stream raw body
    
    Returns:
        - Streaming response with transformed M3U
        - HTTP 200 with Content-Type: application/x-mpegURL
    """
    start_time = time.time()
    
    logger.info("📤 [UPLOAD] Receiving M3U file...")
    
    # ═══════════════════════════════════════════════════════════════════════
    # STEP 1: Get file stream (NO reading into memory)
    # ═══════════════════════════════════════════════════════════════════════
    
    file_stream = None
    content_type = request.headers.get('Content-Type', '')
    
    if 'multipart/form-data' in content_type:
        # File uploaded via form
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'error': 'Empty file'}), 400
        
        # Get file stream (Werkzeug FileStorage)
        file_stream = file.stream
        filename = file.filename
        logger.info(f"📄 [UPLOAD] File: {filename}")
        
    else:
        # Raw body stream (application/octet-stream)
        file_stream = request.stream
        filename = 'upload.m3u'
        logger.info(f"📄 [UPLOAD] Raw stream upload")
    
    # ═══════════════════════════════════════════════════════════════════════
    # STEP 2: Stream generator function (processes line-by-line)
    # ═══════════════════════════════════════════════════════════════════════
    
    def transform_m3u_stream():
        """
        Generator that processes M3U line-by-line.
        Memory usage: O(1) - only one line in memory at a time.
        """
        current_channel_id = 'unknown'
        lines_processed = 0
        urls_transformed = 0
        
        try:
            # Read file line-by-line from stream
            # CRITICAL: This does NOT load entire file into memory
            for line in file_stream:
                # Decode bytes to string
                if isinstance(line, bytes):
                    line = line.decode('utf-8', errors='ignore')
                
                stripped = line.strip()
                lines_processed += 1
                
                # Log progress every 10000 lines
                if lines_processed % 10000 == 0:
                    logger.info(f"   Processing line {lines_processed}, {urls_transformed} URLs transformed")
                
                # Pass through M3U header
                if stripped.startswith('#EXTM3U'):
                    yield line
                    continue
                
                # Extract channel ID from EXTINF
                if stripped.startswith('#EXTINF'):
                    current_channel_id = extract_channel_id(stripped)
                    yield line
                    continue
                
                # Transform stream URLs
                if is_stream_url(stripped):
                    original_url = stripped
                    
                    # URL-encode the original URL
                    encoded_url = quote(original_url, safe='')
                    
                    # Build redirect URL
                    redirect_url = f"{REDIRECTOR_BASE_URL}/stream?channel_id={current_channel_id}&original_url={encoded_url}"
                    
                    yield redirect_url + '\n'
                    urls_transformed += 1
                    
                    # Reset channel ID for next entry
                    current_channel_id = 'unknown'
                else:
                    # Pass through comments and other directives
                    yield line
            
            # Log completion
            elapsed = time.time() - start_time
            logger.info(f"✅ [UPLOAD] Complete: {lines_processed} lines, {urls_transformed} URLs transformed in {elapsed:.2f}s")
            
        except Exception as e:
            logger.error(f"❌ [UPLOAD] Error during streaming: {e}")
            yield f"# ERROR: {str(e)}\n"
    
    # ═══════════════════════════════════════════════════════════════════════
    # STEP 3: Return streaming response
    # ═══════════════════════════════════════════════════════════════════════
    
    # CRITICAL: stream_with_context ensures generator runs in request context
    # Response streams data as it's generated (NO buffering)
    return Response(
        stream_with_context(transform_m3u_stream()),
        mimetype='application/x-mpegURL',
        headers={
            'Content-Disposition': f'attachment; filename="redirect_{filename}"',
            'X-APE-Version': '15.1.0-REDIRECT',
            'X-APE-Mode': 'streaming'
        }
    )


@app.route('/health', methods=['GET'])
def health():
    """
    Health check endpoint.
    Returns server status and version.
    """
    return jsonify({
        'status': 'ok',
        'version': '15.1.0-REDIRECT',
        'mode': 'pure_redirect',
        'proxy': False,
        'bandwidth_usage': 'zero',
        'allowed_cdn_count': len(ALLOWED_CDN_DOMAINS)
    }), 200


@app.route('/', methods=['GET'])
def index():
    """
    Root endpoint - basic info.
    """
    return jsonify({
        'service': 'APE v15.1 Redirector',
        'mode': 'REDIRECT ONLY (no proxy)',
        'endpoints': {
            '/stream': 'Redirect to CDN (GET)',
            '/upload-m3u': 'Stream transform M3U (POST)',
            '/health': 'Health check'
        },
        'usage': {
            'redirect': '/stream?channel_id=XXX&original_url=URL_ENCODED',
            'upload': 'POST /upload-m3u with multipart/form-data file'
        }
    }), 200


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    logger.info("═══════════════════════════════════════════════════════════")
    logger.info("🚀 APE v15.1 REDIRECT MODE - Starting Server")
    logger.info("═══════════════════════════════════════════════════════════")
    logger.info(f"Mode: PURE HTTP REDIRECT (Zero Bandwidth)")
    logger.info(f"Allowed CDN Domains: {len(ALLOWED_CDN_DOMAINS)}")
    logger.info(f"Proxy Mode: DISABLED")
    logger.info("═══════════════════════════════════════════════════════════")
    
    # Run server
    # For production, use gunicorn or uwsgi instead
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,  # Production mode
        threaded=True  # Handle concurrent requests
    )
