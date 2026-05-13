"""
═══════════════════════════════════════════════════════════════════════════════
🚀 APE SERVER v15.0 ULTIMATE - UNIFIED CORE
IPTV Navigator PRO - Intelligent Streaming Middleware
═══════════════════════════════════════════════════════════════════════════════

FEATURES:
- Dual-level telemetry (100ms + 10s)
- Hysteresis-controlled failback (60s stability)
- Immediate failover (<100ms)
- Content-aware buffer optimization
- CORS-enabled API for frontend integration
- Real-time metrics and event streaming

VERSION: 15.0.0-ULTIMATE
DATE: 2026-01-03

═══════════════════════════════════════════════════════════════════════════════
"""

import os
import json
import time
import uuid
import logging
from functools import wraps
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import redis
import psutil
import requests

from hls_rewriter import HLSRewriter
from buffer_optimizer import BufferOptimizer
from telemetry_core import TelemetryCore
from hysteresis_controller import HysteresisController, get_hysteresis_controller

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

app = Flask(__name__)

# Enable CORS for frontend communication
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/health": {"origins": "*"},
    r"/stream": {"origins": "*"},
    r"/segment": {"origins": "*"}
})

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - APE-v15 - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Business Configuration
SECRET_KEY = os.environ.get('APE_SECRET_KEY', 'APE_ULTRA_SECRET_v15_2026')
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
PROFILES_PATH = os.path.join(os.path.dirname(__file__), 'config', 'ape_profiles_v15.json')
PROXY_BASE_URL = os.environ.get('PROXY_BASE_URL', 'http://localhost:8080')

# Version Info
VERSION = "15.0.0-ULTIMATE"
BUILD_DATE = "2026-01-03"

# ═══════════════════════════════════════════════════════════════════════════════
# INITIALIZATION
# ═══════════════════════════════════════════════════════════════════════════════

# Redis Connection
try:
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.ping()
    logger.info(f"✅ Redis connected: {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.warning(f"⚠️ Redis unavailable: {e}. Running in degraded mode.")
    r = None

# Load Profiles
try:
    with open(PROFILES_PATH, 'r', encoding='utf-8') as f:
        PROFILES_CONFIG = json.load(f)
        APE_PROFILES = PROFILES_CONFIG.get('profiles', {})
    logger.info(f"✅ Loaded {len(APE_PROFILES)} APE v15 profiles")
except Exception as e:
    logger.error(f"❌ Error loading profiles: {e}")
    APE_PROFILES = {}
    PROFILES_CONFIG = {"default_profile": "P2", "hysteresis_seconds": 60}

# Initialize Components
rewriter = HLSRewriter(PROXY_BASE_URL)
optimizer = BufferOptimizer()
telemetry = TelemetryCore(rolling_samples=10, snapshot_interval_s=10)
hysteresis = get_hysteresis_controller(PROFILES_CONFIG.get('hysteresis_seconds', 60))

# Session state
current_profile = PROFILES_CONFIG.get('default_profile', 'P2')
active_sessions = {}


def build_origin_url(channel_id, profile):
    """Build origin URL (in production, query a DB of servers)."""
    return f"http://line.tivi-ott.net/live/USER/PASS/{channel_id}.m3u8"


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER DECORATORS
# ═══════════════════════════════════════════════════════════════════════════════

def with_cors(f):
    """Add CORS headers to response."""
    @wraps(f)
    def decorated(*args, **kwargs):
        response = f(*args, **kwargs)
        if isinstance(response, tuple):
            resp, code = response
        else:
            resp = response
            code = 200
        
        if isinstance(resp, Response):
            resp.headers['Access-Control-Allow-Origin'] = '*'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        
        return resp if not isinstance(response, tuple) else (resp, code)
    return decorated


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH & STATUS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Server health status."""
    if request.method == 'OPTIONS':
        return '', 204
    
    redis_status = "connected"
    if r:
        try:
            r.ping()
        except:
            redis_status = "error"
    else:
        redis_status = "disconnected"
    
    return jsonify({
        "status": "ok",
        "version": VERSION,
        "build_date": BUILD_DATE,
        "uptime_seconds": round(time.time() - app.start_time, 1) if hasattr(app, 'start_time') else 0,
        "redis": redis_status,
        "current_profile": current_profile,
        "active_sessions": len(active_sessions)
    })


@app.route('/api/status', methods=['GET', 'OPTIONS'])
def api_status():
    """Detailed server status for frontend."""
    if request.method == 'OPTIONS':
        return '', 204
    
    return jsonify({
        "server": {
            "version": VERSION,
            "uptime": round(time.time() - app.start_time, 1) if hasattr(app, 'start_time') else 0,
            "redis": "connected" if r and r.ping() else "disconnected"
        },
        "streaming": {
            "current_profile": current_profile,
            "available_profiles": list(APE_PROFILES.keys()),
            "active_sessions": len(active_sessions)
        },
        "hysteresis": hysteresis.get_state(),
        "telemetry": telemetry.get_full_report(),
        "timestamp": time.time()
    })


# ═══════════════════════════════════════════════════════════════════════════════
# METRICS API
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/metrics', methods=['GET', 'OPTIONS'])
def get_metrics():
    """Real-time system and streaming metrics."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        cpu_usage = psutil.cpu_percent(interval=None)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Get telemetry data
        tel_report = telemetry.get_full_report()
        
        return jsonify({
            "system": {
                "cpu_usage_pct": cpu_usage,
                "ram_used_mb": round(memory.used / (1024 * 1024), 1),
                "ram_available_mb": round(memory.available / (1024 * 1024), 1),
                "ram_usage_pct": memory.percent,
                "disk_free_gb": round(disk.free / (1024 * 1024 * 1024), 2)
            },
            "streaming": {
                "current_profile": current_profile,
                "rolling_metrics": tel_report.get('rolling'),
                "snapshot_metrics": tel_report.get('snapshot'),
                "trend": tel_report.get('snapshot', {}).get('trend', 'unknown') if tel_report.get('snapshot') else 'unknown'
            },
            "ape_stats": {
                "active_sessions": len(active_sessions),
                "total_requests": int(r.get("ape:requests:total") or 0) if r else 0,
                "failover_count": int(r.get("ape:failover:count") or 0) if r else 0,
                "failback_count": int(r.get("ape:failback:count") or 0) if r else 0
            },
            "events": tel_report.get('events', []),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILE MANAGEMENT API
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/profiles', methods=['GET', 'OPTIONS'])
def get_profiles():
    """Get all available profiles."""
    if request.method == 'OPTIONS':
        return '', 204
    
    profiles_list = []
    for pid, pdata in APE_PROFILES.items():
        profiles_list.append({
            "id": pid,
            "name": pdata.get("name"),
            "resolution": pdata.get("resolution"),
            "bitrate_mbps": pdata.get("bitrate_mbps"),
            "requirements": pdata.get("requirements", {}),
            "use_cases": pdata.get("use_cases", []),
            "is_active": pid == current_profile
        })
    
    return jsonify({
        "profiles": sorted(profiles_list, key=lambda x: x["id"]),
        "current": current_profile,
        "default": PROFILES_CONFIG.get("default_profile", "P2")
    })


@app.route('/api/profile', methods=['GET', 'POST', 'OPTIONS'])
def manage_profile():
    """Get or set current profile."""
    global current_profile
    
    if request.method == 'OPTIONS':
        return '', 204
    
    if request.method == 'GET':
        profile_data = APE_PROFILES.get(current_profile, {})
        return jsonify({
            "current_profile": current_profile,
            "profile_data": profile_data,
            "hysteresis_state": hysteresis.get_state()
        })
    
    # POST - Set new profile
    data = request.get_json() or {}
    new_profile = data.get('profile')
    force = data.get('force', False)
    
    if not new_profile or new_profile not in APE_PROFILES:
        return jsonify({"error": f"Invalid profile: {new_profile}"}), 400
    
    old_profile = current_profile
    
    if new_profile == current_profile:
        return jsonify({"message": "Profile unchanged", "profile": current_profile})
    
    # Check if upgrade or downgrade
    is_upgrade = hysteresis.is_upgrade(current_profile, new_profile)
    
    if is_upgrade and not force:
        # Check hysteresis
        target_reqs = APE_PROFILES[new_profile].get('requirements', {})
        metrics_ok = telemetry.check_upgrade_conditions(target_reqs)
        
        eligible, reason, progress = hysteresis.check_failback_eligibility(
            current_profile, new_profile, metrics_ok
        )
        
        if not eligible:
            return jsonify({
                "allowed": False,
                "reason": reason,
                "progress": progress,
                "message": "Use force=true to override hysteresis"
            }), 202
    
    # Apply profile change
    current_profile = new_profile
    telemetry.set_current_profile(new_profile)
    
    if r:
        r.set("ape:current_profile", new_profile)
        if is_upgrade:
            r.incr("ape:failback:count")
        else:
            r.incr("ape:failover:count")
    
    logger.info(f"🔄 Profile changed: {old_profile} → {new_profile} ({'upgrade' if is_upgrade else 'downgrade'})")
    
    return jsonify({
        "success": True,
        "old_profile": old_profile,
        "new_profile": new_profile,
        "type": "failback" if is_upgrade else "failover"
    })


@app.route('/api/failover', methods=['POST', 'OPTIONS'])
def trigger_failover():
    """Manual failover trigger."""
    global current_profile
    
    if request.method == 'OPTIONS':
        return '', 204
    
    data = request.get_json() or {}
    target = data.get('target')
    
    if not target:
        # Auto-select next lower profile
        profile_order = ["P0", "P1", "P2", "P3", "P4", "P5"]
        current_idx = profile_order.index(current_profile) if current_profile in profile_order else 2
        target = profile_order[min(current_idx + 1, 5)]
    
    if target not in APE_PROFILES:
        return jsonify({"error": f"Invalid target profile: {target}"}), 400
    
    old_profile = current_profile
    current_profile = target
    telemetry.set_current_profile(target)
    hysteresis.reset()
    
    if r:
        r.incr("ape:failover:count")
    
    logger.warning(f"🚨 MANUAL FAILOVER: {old_profile} → {target}")
    
    return jsonify({
        "success": True,
        "type": "manual_failover",
        "old_profile": old_profile,
        "new_profile": target
    })


# ═══════════════════════════════════════════════════════════════════════════════
# STREAMING ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/stream', methods=['GET'])
def stream_proxy():
    """Main streaming endpoint with HLS rewriting."""
    global current_profile
    
    channel_id = request.args.get('ch') or request.args.get('channel_id')
    profile = request.args.get('profile', current_profile)
    
    if not channel_id:
        return jsonify({"error": "Missing channel_id (ch)"}), 400
    
    if r:
        r.incr("ape:requests:total")
    
    logger.info(f"🎯 Stream Request: CH={channel_id}, Profile={profile}")
    
    # Check for proactive failover
    target_bitrate = APE_PROFILES.get(profile, {}).get('bitrate_mbps', 8)
    if telemetry.should_failover(target_bitrate):
        logger.warning(f"🚨 PROACTIVE FAILOVER TRIGGERED for CH={channel_id}")
        
        # Downgrade profile
        profile_order = ["P0", "P1", "P2", "P3", "P4", "P5"]
        current_idx = profile_order.index(profile) if profile in profile_order else 2
        new_profile = profile_order[min(current_idx + 1, 5)]
        
        if new_profile != profile:
            current_profile = new_profile
            telemetry.set_current_profile(new_profile)
            profile = new_profile
            
            if r:
                r.incr("ape:failover:count")
            
            logger.info(f"⬇️ Failover applied: New Profile={profile}")
    
    profile_config = APE_PROFILES.get(profile, APE_PROFILES.get('P2', {}))
    origin_url = build_origin_url(channel_id, profile)
    
    try:
        logger.info(f"🌐 Fetching origin: {origin_url}")
        resp = requests.get(origin_url, timeout=10, stream=True)
        
        if resp.status_code != 200:
            return jsonify({"error": f"Origin returned {resp.status_code}"}), 502
        
        content_type = resp.headers.get('Content-Type', '')
        
        if 'mpegurl' in content_type.lower() or channel_id in origin_url:
            content = resp.text
            
            # Detect content type for buffer optimization
            content_mode = optimizer.detect_content_type(content)
            strategy = optimizer.get_strategy(content_mode, profile)
            logger.info(f"📋 Mode: {content_mode}, Strategy: {strategy}")
            
            rewritten_content = rewriter.rewrite_manifest(
                content, origin_url, channel_id, profile, profile_config
            )
            
            # Add APE strategy tag
            if "#EXTM3U" in rewritten_content:
                rewritten_content = rewritten_content.replace(
                    "#EXTM3U",
                    f"#EXTM3U\n#EXT-X-APE-STRATEGY:{strategy}\n#EXT-X-APE-VERSION:{VERSION}"
                )
            
            return Response(rewritten_content, mimetype='application/vnd.apple.mpegurl')
        else:
            return Response(resp.content, mimetype=content_type)
    
    except Exception as e:
        logger.error(f"❌ Stream error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/segment', methods=['GET'])
def segment_proxy():
    """Segment proxy with buffer optimization and telemetry."""
    uri = request.args.get('uri')
    profile = request.args.get('profile', current_profile)
    is_live = request.args.get('live', '1') == '1'
    
    if not uri:
        return "Missing uri", 400
    
    # Check cache
    cached_content, cached_headers = optimizer.get_segment(uri)
    if cached_content:
        return Response(cached_content, headers=cached_headers)
    
    # Prepare headers
    origin_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*"
    }
    
    client_range = request.headers.get('Range')
    if client_range:
        origin_headers['Range'] = client_range
    
    try:
        start_time = time.time()
        resp = requests.get(uri, headers=origin_headers, timeout=15, stream=True)
        ttfb = (time.time() - start_time) * 1000
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = {name: value for (name, value) in resp.raw.headers.items()
                   if name.lower() not in excluded_headers}
        
        if resp.status_code in [200, 206]:
            content = resp.content
            duration = time.time() - start_time
            size_mb = len(content) * 8 / (1024 * 1024)
            throughput = size_mb / duration if duration > 0 else 0
            
            # Record telemetry
            cpu_pct = psutil.cpu_percent(interval=None)
            ram_mb = psutil.virtual_memory().used / (1024 * 1024)
            telemetry.record_metrics(ttfb, throughput, 0, cpu_pct, ram_mb)
            
            logger.debug(f"📈 Metrics: TTFB={ttfb:.0f}ms, Throughput={throughput:.2f}Mbps")
            
            # Cache segment
            optimizer.store_segment(uri, content, headers, is_live=is_live)
            return Response(content, status=resp.status_code, headers=headers)
        
        return Response(resp.content, status=resp.status_code, headers=headers)
    
    except Exception as e:
        logger.error(f"❌ Segment error: {e}")
        return str(e), 502


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.start_time = time.time()
    
    print(f"""
+==================================================================+
|                                                                  |
|     APE SERVER v{VERSION} - ULTIMATE                       |
|                                                                  |
|     Port: 8080                                                   |
|     Redis: {REDIS_HOST}:{REDIS_PORT}                                         |
|     Profiles: {len(APE_PROFILES)} loaded                                         |
|     Default: {current_profile}                                              |
|                                                                  |
|     API Endpoints:                                               |
|       GET  /health         - Server health                       |
|       GET  /api/status     - Full status                         |
|       GET  /api/metrics    - Real-time metrics                   |
|       GET  /api/profiles   - Available profiles                  |
|       GET  /api/profile    - Current profile                     |
|       POST /api/profile    - Set profile                         |
|       POST /api/failover   - Manual failover                     |
|       GET  /stream         - HLS stream proxy                    |
|       GET  /segment        - Segment proxy                       |
|                                                                  |
+==================================================================+
    """)
    
    logger.info(f"Starting APE SERVER v{VERSION}")
    app.run(host='0.0.0.0', port=8080, debug=True)
