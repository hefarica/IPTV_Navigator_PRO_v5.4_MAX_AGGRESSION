#!/usr/bin/env python3
"""
Stream Probe Server - Python Alternative
High-performance IPTV stream quality analyzer using ffprobe

Requirements:
    pip install aiohttp

Usage:
    python probe_server.py

Endpoints:
    GET  /health     - Health check
    POST /probe-all  - Probe all channels
    WS   /ws/progress - WebSocket for progress updates
"""

import asyncio
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from aiohttp import web, WSMsgType

# Configuration
PORT = 8765
MAX_CONCURRENT = 150
PROBE_TIMEOUT = 5  # seconds

# Global state
probe_in_progress = False
progress_subscribers = []
current_progress = {
    "current": 0,
    "total": 0,
    "percent": 0,
    "success_count": 0,
    "error_count": 0,
    "eta_seconds": 0,
    "current_channel": ""
}


def probe_single_stream(channel):
    """Probe a single stream using ffprobe"""
    url = channel.get("url", "")
    channel_id = channel.get("id", "")
    
    if not url:
        return {
            "channel_id": channel_id,
            "success": False,
            "error": "Empty URL"
        }
    
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-select_streams", "v:0",
            "-analyzeduration", "3000000",
            "-probesize", "5000000",
            url
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=PROBE_TIMEOUT
        )
        
        if result.returncode != 0:
            return {
                "channel_id": channel_id,
                "success": False,
                "error": "ffprobe failed"
            }
        
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        
        if not streams:
            return {
                "channel_id": channel_id,
                "success": False,
                "error": "No video stream found"
            }
        
        stream = streams[0]
        
        # Parse FPS
        fps = None
        avg_frame_rate = stream.get("avg_frame_rate", "0/1")
        if "/" in avg_frame_rate:
            num, den = avg_frame_rate.split("/")
            if float(den) > 0:
                fps = float(num) / float(den)
        else:
            fps = float(avg_frame_rate) if avg_frame_rate else None
        
        # Parse bitrate
        bitrate = stream.get("bit_rate")
        if bitrate:
            bitrate = int(bitrate) // 1000  # Convert to kbps
        
        return {
            "channel_id": channel_id,
            "success": True,
            "width": stream.get("width"),
            "height": stream.get("height"),
            "codec": stream.get("codec_name"),
            "bitrate": bitrate,
            "fps": round(fps, 2) if fps else None
        }
        
    except subprocess.TimeoutExpired:
        return {
            "channel_id": channel_id,
            "success": False,
            "error": "Timeout"
        }
    except Exception as e:
        return {
            "channel_id": channel_id,
            "success": False,
            "error": str(e)
        }


async def broadcast_progress(progress):
    """Send progress to all WebSocket subscribers"""
    global current_progress
    current_progress = progress
    
    dead_sockets = []
    for ws in progress_subscribers:
        try:
            await ws.send_json(progress)
        except:
            dead_sockets.append(ws)
    
    for ws in dead_sockets:
        progress_subscribers.remove(ws)


async def health_handler(request):
    """Health check endpoint"""
    # Check if ffprobe is available
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=2)
        ffprobe_available = True
    except:
        ffprobe_available = False
    
    return web.json_response({
        "status": "OK",
        "version": "1.0.0",
        "service": "Stream Probe Server (Python)",
        "max_concurrent": MAX_CONCURRENT,
        "probe_timeout_secs": PROBE_TIMEOUT,
        "ffprobe_available": ffprobe_available
    })


async def probe_all_handler(request):
    """Probe all channels endpoint"""
    global probe_in_progress
    
    if probe_in_progress:
        return web.json_response({
            "success": False,
            "error": "Probe already in progress"
        }, status=409)
    
    try:
        data = await request.json()
        channels = data.get("channels", [])
        
        if not channels:
            return web.json_response({
                "success": False,
                "error": "No channels provided"
            }, status=400)
        
        probe_in_progress = True
        total = len(channels)
        results = []
        success_count = 0
        error_count = 0
        start_time = time.time()
        
        print(f"🔬 Starting probe of {total} channels...")
        
        # Use ThreadPoolExecutor for parallel probing
        loop = asyncio.get_event_loop()
        
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
            # Submit all tasks
            futures = {
                loop.run_in_executor(executor, probe_single_stream, ch): ch
                for ch in channels
            }
            
            # Process results as they complete
            for i, future in enumerate(asyncio.as_completed(futures.keys())):
                result = await future
                results.append(result)
                
                if result.get("success"):
                    success_count += 1
                else:
                    error_count += 1
                
                current = i + 1
                elapsed = time.time() - start_time
                rate = current / elapsed if elapsed > 0 else 0
                eta = (total - current) / rate if rate > 0 else 0
                
                # Broadcast progress every 10 channels
                if current % 10 == 0 or current == total:
                    await broadcast_progress({
                        "current": current,
                        "total": total,
                        "percent": round((current / total) * 100, 1),
                        "success_count": success_count,
                        "error_count": error_count,
                        "eta_seconds": round(eta, 1),
                        "current_channel": result.get("channel_id", "")
                    })
        
        duration = time.time() - start_time
        print(f"✅ Probe completed: {success_count}/{total} successful in {duration:.1f}s")
        
        return web.json_response({
            "success": True,
            "total": total,
            "success_count": success_count,
            "error_count": error_count,
            "duration_secs": round(duration, 2),
            "results": results
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500)
    finally:
        probe_in_progress = False


async def websocket_handler(request):
    """WebSocket handler for progress updates"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    progress_subscribers.append(ws)
    print(f"📡 WebSocket client connected ({len(progress_subscribers)} total)")
    
    try:
        # Send current progress immediately
        await ws.send_json(current_progress)
        
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                if msg.data == "close":
                    break
            elif msg.type == WSMsgType.ERROR:
                break
    finally:
        if ws in progress_subscribers:
            progress_subscribers.remove(ws)
        print(f"📡 WebSocket client disconnected ({len(progress_subscribers)} total)")
    
    return ws


def main():
    app = web.Application()
    
    # CORS middleware
    async def cors_middleware(app, handler):
        async def middleware_handler(request):
            if request.method == "OPTIONS":
                return web.Response(headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                })
            
            response = await handler(request)
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        return middleware_handler
    
    app.middlewares.append(cors_middleware)
    
    # Routes
    app.router.add_get("/health", health_handler)
    app.router.add_post("/probe-all", probe_all_handler)
    app.router.add_get("/ws/progress", websocket_handler)
    
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║     STREAM PROBE SERVER v1.0.0 (Python)                       ║")
    print("╠═══════════════════════════════════════════════════════════════╣")
    print(f"║  HTTP: http://127.0.0.1:{PORT}                                  ║")
    print(f"║  WS:   ws://127.0.0.1:{PORT}/ws/progress                        ║")
    print(f"║  Concurrent probes: {MAX_CONCURRENT}                                      ║")
    print(f"║  Probe timeout: {PROBE_TIMEOUT}s                                          ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
