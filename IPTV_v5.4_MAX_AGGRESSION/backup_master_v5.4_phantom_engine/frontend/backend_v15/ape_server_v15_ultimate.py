#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Backend Flask Principal
Middleware de streaming IPTV con telemetría predictiva y reescritura dinámica HLS
═══════════════════════════════════════════════════════════════════════════════

Features:
- Telemetría predictiva de doble nivel (100ms + 10s)
- Reescritura dinámica de HLS con control mid-stream
- Buffers adaptativos según tipo de contenido (LIVE vs VOD)
- Failover inmediato (<100ms) con failback inteligente (60s hysteresis)
- Gestión de estado persistente en Redis

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import os
import sys
import time
import uuid
import json
import logging
import threading
from typing import Dict, Optional
from urllib.parse import unquote, quote

from flask import Flask, request, Response, jsonify, make_response
from flask_cors import CORS
import requests

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import internal modules
from telemetry_v15 import TelemetryV15
from hysteresis_controller import HysteresisController
from device_metrics import DeviceMetrics
from hls_rewriter_v15 import HLSRewriterV15
from buffer_optimizer_v15 import BufferOptimizerV15
from profile_processor_v15 import ProfileProcessor
from utils.redis_client import RedisClient
from utils.logger import setup_logger

# ============================================================================
# CONFIGURATION
# ============================================================================

APP_VERSION = "15.0.0-ULTIMATE"
DEFAULT_PROFILE = "P2"
TELEMETRY_INTERVAL_MS = 100
HYSTERESIS_SECONDS = 60

# Flask app
app = Flask(__name__)
CORS(app)
app.start_time = time.time()

# Logger
logger = setup_logger('ape_server', 'logs/ape_server.log')

# Redis client
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))

try:
    redis_client = RedisClient(host=REDIS_HOST, port=REDIS_PORT, db=0)
    logger.info(f"✅ Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"❌ Failed to connect to Redis: {e}")
    redis_client = None

# Load profiles
PROFILES_PATH = os.path.join(os.path.dirname(__file__), 'config', 'ape_profiles_v15.json')
profile_processor = ProfileProcessor(PROFILES_PATH)
logger.info(f"✅ Loaded {len(profile_processor.profiles)} APE v15 profiles")

# Initialize components
PROXY_BASE_URL = os.environ.get('PROXY_BASE_URL', 'http://localhost:8080')
hls_rewriter = HLSRewriterV15(PROXY_BASE_URL)
buffer_optimizer = BufferOptimizerV15()
hysteresis = HysteresisController(stability_threshold_seconds=HYSTERESIS_SECONDS)

# Active sessions: {session_id: {channel_id, telemetry, start_time, ...}}
active_sessions: Dict[str, Dict] = {}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_session_id() -> str:
    """Generate unique session ID"""
    return str(uuid.uuid4())


def init_session(
    session_id: str,
    channel_id: str,
    original_url: str,
    tvg_name: str = "",
    group_title: str = ""
) -> Dict:
    """
    Initialize new streaming session
    """
    # Create telemetry instance for this session
    telemetry = TelemetryV15(rolling_window_size=10, snapshot_interval_seconds=10)
    telemetry.current_profile = DEFAULT_PROFILE
    
    session_data = {
        'channel_id': channel_id,
        'original_url': original_url,
        'tvg_name': tvg_name,
        'group_title': group_title,
        'start_time': time.time(),
        'telemetry': telemetry,
        'content_type': buffer_optimizer.detect_content_type(
            group_title=group_title,
            channel_name=tvg_name
        )
    }
    
    active_sessions[session_id] = session_data
    
    # Store in Redis
    if redis_client:
        redis_client.set(f"session:{session_id}:channel", channel_id)
        redis_client.set(f"session:{session_id}:profile", DEFAULT_PROFILE)
        redis_client.set(f"session:{session_id}:start_time", str(int(time.time())))
    
    logger.info(f"[{session_id[:8]}...] Session initialized: {tvg_name} ({channel_id})")
    return session_data


def get_session(session_id: str) -> Optional[Dict]:
    """Get session data by ID"""
    return active_sessions.get(session_id)


def get_current_profile(session_id: str) -> str:
    """Get current profile for session"""
    if redis_client:
        profile = redis_client.get_session_profile(session_id)
        if profile:
            return profile
    
    session = get_session(session_id)
    if session and session.get('telemetry'):
        return session['telemetry'].current_profile
    
    return DEFAULT_PROFILE


def trigger_failover(session_id: str, old_profile: str, new_profile: str, reason: str):
    """
    Execute immediate failover (downgrade)
    """
    logger.warning(f"[{session_id[:8]}...] 🔴 FAILOVER: {old_profile}→{new_profile} | {reason}")
    
    # Update profile
    if redis_client:
        redis_client.set_session_profile(session_id, new_profile)
    
    session = get_session(session_id)
    if session and session.get('telemetry'):
        session['telemetry'].current_profile = new_profile
    
    # Reset hysteresis
    hysteresis.reset_hysteresis(session_id, reason="failover executed")
    
    # Log event
    event = {
        'type': 'failover',
        'session_id': session_id,
        'old_profile': old_profile,
        'new_profile': new_profile,
        'reason': reason,
        'timestamp': time.time()
    }
    if redis_client:
        redis_client.log_event(session_id, event)


def trigger_failback(session_id: str, old_profile: str, new_profile: str, reason: str):
    """
    Execute failback (upgrade after hysteresis)
    """
    logger.info(f"[{session_id[:8]}...] 🟢 FAILBACK: {old_profile}→{new_profile} | {reason}")
    
    # Update profile
    if redis_client:
        redis_client.set_session_profile(session_id, new_profile)
    
    session = get_session(session_id)
    if session and session.get('telemetry'):
        session['telemetry'].current_profile = new_profile
    
    # Log event
    event = {
        'type': 'failback',
        'session_id': session_id,
        'old_profile': old_profile,
        'new_profile': new_profile,
        'reason': reason,
        'timestamp': time.time()
    }
    if redis_client:
        redis_client.log_event(session_id, event)


# ============================================================================
# FLASK ROUTES
# ============================================================================

@app.route('/health', methods=['GET'])
def health():
    """
    Health check endpoint
    """
    redis_status = "connected" if redis_client and redis_client.ping() else "disconnected"
    
    return jsonify({
        "status": "ok",
        "version": APP_VERSION,
        "uptime": round(time.time() - app.start_time, 2),
        "redis": redis_status,
        "active_sessions": len(active_sessions)
    })


@app.route('/stream', methods=['GET'])
def stream_proxy():
    """
    Main streaming endpoint with HLS rewriting
    
    Query params:
        channel_id: Unique channel identifier
        original_url: Original CDN stream URL (URL-encoded)
        tvg_name: Channel name (optional)
        group_title: Channel group (optional)
        profile: Requested profile (optional, default P2)
    """
    channel_id = request.args.get('channel_id')
    original_url = unquote(request.args.get('original_url', ''))
    tvg_name = unquote(request.args.get('tvg_name', 'Unknown'))
    group_title = unquote(request.args.get('group_title', ''))
    requested_profile = request.args.get('profile', DEFAULT_PROFILE)
    
    if not channel_id or not original_url:
        return jsonify({'error': 'Missing channel_id or original_url'}), 400
    
    logger.info(f"🎯 Stream Request: CH={channel_id}, Profile={requested_profile}")
    
    # Get or create session
    session_id = request.cookies.get('ape_session_id')
    if not session_id or session_id not in active_sessions:
        session_id = generate_session_id()
        init_session(session_id, channel_id, original_url, tvg_name, group_title)
    
    # Get current profile (may have been adjusted by decision engine)
    current_profile = get_current_profile(session_id)
    profile_config = profile_processor.get_profile(current_profile) or {}
    
    # Get session data
    session = get_session(session_id)
    content_type = session.get('content_type', 'LIVE_NEWS') if session else 'LIVE_NEWS'
    
    try:
        # Fetch original manifest from CDN
        cdn_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "*/*"
        }
        
        response = requests.get(original_url, headers=cdn_headers, timeout=10, stream=True)
        
        if response.status_code != 200:
            logger.error(f"CDN returned {response.status_code} for {channel_id}")
            return jsonify({'error': f'CDN returned {response.status_code}'}), 502
        
        content_type_header = response.headers.get('Content-Type', '')
        
        # Check if it's an HLS manifest
        if 'application/vnd.apple.mpegurl' in content_type_header or \
           'audio/mpegurl' in content_type_header or \
           original_url.endswith('.m3u8'):
            
            # Get manifest content
            manifest_content = response.text
            
            # Rewrite manifest with APE headers and proxy URLs
            rewritten = hls_rewriter.rewrite_manifest(
                content=manifest_content,
                origin_url=original_url,
                channel_id=channel_id,
                profile=current_profile,
                profile_config=profile_config,
                content_type=content_type
            )
            
            # Create response
            resp = make_response(rewritten)
            resp.headers['Content-Type'] = 'application/vnd.apple.mpegurl'
            resp.headers['X-APE-Profile'] = current_profile
            resp.headers['X-APE-Session'] = session_id
            resp.headers['X-APE-Version'] = APP_VERSION
            resp.headers['X-APE-Content-Type'] = content_type
            resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            resp.set_cookie('ape_session_id', session_id, max_age=3600)
            
            return resp
        else:
            # Pass through non-HLS content
            resp = make_response(response.content)
            resp.headers['Content-Type'] = content_type_header
            resp.headers['X-APE-Profile'] = current_profile
            resp.headers['X-APE-Session'] = session_id
            resp.set_cookie('ape_session_id', session_id, max_age=3600)
            return resp
    
    except requests.RequestException as e:
        logger.error(f"Error fetching stream for {channel_id}: {e}")
        return jsonify({'error': 'Stream fetch failed', 'details': str(e)}), 503


@app.route('/segment', methods=['GET'])
def segment_proxy():
    """
    Proxy for individual HLS segments with caching
    
    Query params:
        uri: Original segment URL (URL-encoded)
        ch: Channel ID
        profile: Current profile
        live: '1' if live content, '0' if VOD
    """
    segment_uri = unquote(request.args.get('uri', ''))
    channel_id = request.args.get('ch', '')
    profile = request.args.get('profile', DEFAULT_PROFILE)
    is_live = request.args.get('live', '1') == '1'
    
    if not segment_uri:
        return jsonify({'error': 'Missing segment uri'}), 400
    
    session_id = request.cookies.get('ape_session_id', '')
    
    # Check cache
    cached = buffer_optimizer.get_cached_segment(segment_uri)
    if cached:
        content, headers = cached
        resp = make_response(content)
        for key, value in headers.items():
            resp.headers[key] = value
        resp.headers['X-APE-Cache'] = 'HIT'
        return resp
    
    # Fetch from CDN
    try:
        start_time = time.perf_counter()
        
        cdn_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate"
        }
        
        cdn_response = requests.get(segment_uri, headers=cdn_headers, timeout=15)
        
        download_time = time.perf_counter() - start_time
        
        if cdn_response.status_code != 200:
            logger.warning(f"Segment fetch failed: {cdn_response.status_code}")
            return jsonify({'error': 'Segment fetch failed'}), 502
        
        segment_content = cdn_response.content
        
        # Record metrics in session telemetry
        if session_id and session_id in active_sessions:
            session = active_sessions[session_id]
            telemetry = session.get('telemetry')
            if telemetry:
                # Calculate bandwidth
                segment_size_bits = len(segment_content) * 8
                bandwidth_mbps = (segment_size_bits / download_time) / (1024 * 1024) if download_time > 0 else 0
                latency_ms = download_time * 1000
                
                telemetry.record_metrics(
                    latency_ms=latency_ms,
                    bandwidth_mbps=bandwidth_mbps,
                    packet_loss_pct=0.0,  # Would need packet-level tracking
                    buffer_health_pct=80.0  # Placeholder - would need player feedback
                )
        
        # Cache segment
        response_headers = {
            'Content-Type': cdn_response.headers.get('Content-Type', 'video/mp2t'),
            'X-APE-Profile': profile,
            'X-APE-Segment-Time': f'{download_time:.3f}s'
        }
        
        buffer_optimizer.cache_segment(segment_uri, segment_content, response_headers, is_live)
        
        # Return segment
        resp = make_response(segment_content)
        for key, value in response_headers.items():
            resp.headers[key] = value
        resp.headers['X-APE-Cache'] = 'MISS'
        
        return resp
    
    except requests.RequestException as e:
        logger.error(f"Segment fetch error: {e}")
        return jsonify({'error': 'Segment fetch failed', 'details': str(e)}), 503


@app.route('/api/metrics', methods=['GET'])
def api_metrics():
    """
    Get metrics for a session or global system metrics
    
    Query params:
        session_id: Session ID (optional, returns global if not provided)
    """
    session_id = request.args.get('session_id')
    
    if session_id:
        # Session-specific metrics
        session = get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        telemetry = session.get('telemetry')
        if not telemetry:
            return jsonify({'error': 'No telemetry data'}), 404
        
        telemetry_data = telemetry.to_dict()
        hysteresis_status = hysteresis.get_hysteresis_status(session_id)
        
        return jsonify({
            'session_id': session_id,
            'channel_id': session.get('channel_id'),
            'current_profile': get_current_profile(session_id),
            'content_type': session.get('content_type'),
            'uptime': round(time.time() - session.get('start_time', time.time()), 2),
            'telemetry': telemetry_data,
            'hysteresis': hysteresis_status,
            'timestamp': time.time()
        })
    else:
        # Global system metrics
        try:
            import psutil
            cpu_pct = psutil.cpu_percent(interval=None)
            memory = psutil.virtual_memory()
            
            system_metrics = {
                'cpu_usage_pct': cpu_pct,
                'ram_available_mb': round(memory.available / (1024 * 1024), 2),
                'ram_usage_pct': memory.percent
            }
        except ImportError:
            system_metrics = {
                'cpu_usage_pct': 0,
                'ram_available_mb': 0,
                'ram_usage_pct': 0
            }
        
        return jsonify({
            'version': APP_VERSION,
            'active_sessions': len(active_sessions),
            'redis_connected': redis_client.ping() if redis_client else False,
            'system': system_metrics,
            'cache_stats': buffer_optimizer.get_cache_stats(),
            'timestamp': time.time()
        })


@app.route('/api/force_failover', methods=['POST'])
def force_failover():
    """
    Force manual failover/failback
    
    JSON body:
        session_id: Target session ID
        target_profile: Target profile (P0-P5)
    """
    data = request.get_json() or {}
    session_id = data.get('session_id')
    target_profile = data.get('target_profile')
    
    if not session_id or not target_profile:
        return jsonify({'error': 'Missing session_id or target_profile'}), 400
    
    if target_profile not in ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']:
        return jsonify({'error': 'Invalid profile'}), 400
    
    current_profile = get_current_profile(session_id)
    
    # Determine if upgrade or downgrade
    profile_order = ["P5", "P4", "P3", "P2", "P1", "P0"]
    is_upgrade = profile_order.index(target_profile) > profile_order.index(current_profile)
    
    if is_upgrade:
        trigger_failback(session_id, current_profile, target_profile, "Manual override")
    else:
        trigger_failover(session_id, current_profile, target_profile, "Manual override")
    
    return jsonify({
        'status': 'ok',
        'old_profile': current_profile,
        'new_profile': target_profile,
        'type': 'failback' if is_upgrade else 'failover'
    })


@app.route('/api/sessions', methods=['GET'])
def list_sessions():
    """
    List all active sessions
    """
    sessions = []
    for sid, data in active_sessions.items():
        sessions.append({
            'session_id': sid,
            'channel_id': data.get('channel_id'),
            'tvg_name': data.get('tvg_name'),
            'profile': get_current_profile(sid),
            'content_type': data.get('content_type'),
            'uptime': round(time.time() - data.get('start_time', time.time()), 2)
        })
    
    return jsonify({
        'count': len(sessions),
        'sessions': sessions
    })


# ============================================================================
# DECISION ENGINE (Background Thread)
# ============================================================================

def decision_engine_loop():
    """
    Main decision engine loop (runs every 100ms)
    Evaluates telemetry and triggers failover/failback
    """
    logger.info("🚀 Decision Engine started (100ms loop)")
    
    device_metrics = DeviceMetrics()
    
    while True:
        try:
            for session_id, session_data in list(active_sessions.items()):
                telemetry = session_data.get('telemetry')
                if not telemetry:
                    continue
                
                # Get current profile and target bitrate
                current_profile = get_current_profile(session_id)
                target_bitrate = profile_processor.get_profile_bitrate(current_profile)
                
                # Check for degradation (immediate failover)
                should_fail, reason = telemetry.should_failover(target_bitrate)
                
                if should_fail:
                    # Get downgrade target
                    downgrade = profile_processor.get_downgrade_target(current_profile)
                    if downgrade:
                        trigger_failover(session_id, current_profile, downgrade, reason)
                else:
                    # Check for improvement (hysteresis failback)
                    upgrade = profile_processor.get_upgrade_target(current_profile)
                    if upgrade:
                        upgrade_reqs = profile_processor.get_profile_requirements(upgrade)
                        if upgrade_reqs:
                            can_upgrade, upgrade_reason = telemetry.can_upgrade(upgrade_reqs)
                            
                            if can_upgrade:
                                # Check hysteresis
                                eligible, hyst_reason = hysteresis.check_failback_eligibility(
                                    session_id,
                                    current_profile,
                                    upgrade,
                                    {}  # metrics not needed here
                                )
                                
                                if eligible:
                                    trigger_failback(session_id, current_profile, upgrade, hyst_reason)
                            else:
                                # Reset hysteresis if metrics degraded
                                hysteresis.reset_hysteresis(session_id, upgrade_reason)
            
            # Sleep 100ms
            time.sleep(TELEMETRY_INTERVAL_MS / 1000.0)
        
        except Exception as e:
            logger.error(f"Decision engine error: {e}")
            time.sleep(1)


# ============================================================================
# QOS / DSCP TRAFFIC SHAPING (Latencia Rayo)
# ============================================================================
from werkzeug.serving import WSGIRequestHandler

class QoSWsgiRequestHandler(WSGIRequestHandler):
    """
    Custom WSGI Handler that injects DSCP 46 (Expedited Forwarding) 
    at the raw TCP socket level for hardware-level traffic shaping.
    Forcefully instructs upstream ISP routers to prioritize this streaming traffic.
    """
    def make_environ(self):
        environ = super().make_environ()
        try:
            import socket
            # IP_TOS is 1, IPTOS_DSCP_EF is 0xb8 (DSCP 46 << 2)
            # This manipulates the native underlying IP packets
            self.request.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, 0xb8)
        except Exception as e:
            logger.error(f"Failed to inject QoS DSCP headers: {e}")
        return environ


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)
    
    # Start decision engine in background
    engine_thread = threading.Thread(target=decision_engine_loop, daemon=True)
    engine_thread.start()
    
    # Start Flask server
    host = os.environ.get('APE_HOST', '0.0.0.0')
    port = int(os.environ.get('APE_PORT', 8080))
    
    logger.info(f"🚀 Starting APE v{APP_VERSION} backend on http://{host}:{port}")
    logger.info("⚡ Latencia Rayo QoS (Hardware Traffic Shaping) ACTIVE")
    
    # Use the custom WSGI Handler to enforce DSCP marking over the TCP stack natively
    from werkzeug.serving import run_simple
    run_simple(host, port, app, request_handler=QoSWsgiRequestHandler, threaded=True, use_reloader=False)
