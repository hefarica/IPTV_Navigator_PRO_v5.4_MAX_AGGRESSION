#!/usr/bin/env python3
"""
Stream Probe Server - VPS Version
Listens on 0.0.0.0:8765 for external access

Requirements:
    apt install python3-aiohttp

Usage:
    nohup python3 /opt/probe_server_vps.py > /var/log/probe_server.log 2>&1 &
"""

import asyncio
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

try:
    from aiohttp import web, WSMsgType
except ImportError:
    print("ERROR: aiohttp not installed. Run: apt install python3-aiohttp")
    exit(1)

# Configuration
HOST = "0.0.0.0"  # Listen on all interfaces
PORT = 8765
MAX_CONCURRENT = 50  # Reduced for VPS memory
PROBE_TIMEOUT = 5

# Global state
probe_in_progress = False
progress_subscribers = []
current_progress = {
    "current": 0, "total": 0, "percent": 0,
    "success_count": 0, "error_count": 0,
    "eta_seconds": 0, "current_channel": ""
}


def probe_single_stream(channel):
    """Probe a single stream using ffprobe"""
    url = channel.get("url", "")
    channel_id = channel.get("id", "")
    
    if not url or not url.startswith("http"):
        return {"channel_id": channel_id, "success": False, "error": "Invalid URL"}
    
    try:
        cmd = [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-select_streams", "v:0",
            "-analyzeduration", "2000000", "-probesize", "3000000",
            url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=PROBE_TIMEOUT)
        
        if result.returncode != 0:
            return {"channel_id": channel_id, "success": False, "error": "ffprobe failed"}
        
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        
        if not streams:
            return {"channel_id": channel_id, "success": False, "error": "No video stream"}
        
        stream = streams[0]
        
        # Parse FPS
        fps = None
        avg_frame_rate = stream.get("avg_frame_rate", "0/1")
        if "/" in avg_frame_rate:
            num, den = avg_frame_rate.split("/")
            if float(den) > 0:
                fps = float(num) / float(den)
        
        # Parse bitrate
        bitrate = stream.get("bit_rate")
        if bitrate:
            bitrate = int(bitrate) // 1000
        
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
        return {"channel_id": channel_id, "success": False, "error": "Timeout"}
    except Exception as e:
        return {"channel_id": channel_id, "success": False, "error": str(e)[:50]}


async def broadcast_progress(progress):
    global current_progress
    current_progress = progress
    dead = []
    for ws in progress_subscribers:
        try:
            await ws.send_json(progress)
        except:
            dead.append(ws)
    for ws in dead:
        progress_subscribers.remove(ws)


async def health_handler(request):
    ffprobe_ok = False
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=2)
        ffprobe_ok = True
    except:
        pass
    
    return web.json_response({
        "status": "OK",
        "version": "1.0.0-VPS",
        "service": "Stream Probe Server",
        "max_concurrent": MAX_CONCURRENT,
        "ffprobe_available": ffprobe_ok
    })


async def probe_all_handler(request):
    global probe_in_progress
    
    if probe_in_progress:
        return web.json_response({"success": False, "error": "Busy"}, status=409)
    
    try:
        data = await request.json()
        channels = data.get("channels", [])
        
        if not channels:
            return web.json_response({"success": False, "error": "No channels"}, status=400)
        
        probe_in_progress = True
        total = len(channels)
        results = []
        success_count = 0
        error_count = 0
        start_time = time.time()
        
        print(f"[PROBE] Starting {total} channels...")
        
        loop = asyncio.get_event_loop()
        
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
            futures = {loop.run_in_executor(executor, probe_single_stream, ch): ch for ch in channels}
            
            for i, future in enumerate(asyncio.as_completed(futures.keys())):
                result = await future
                results.append(result)
                
                if result.get("success"):
                    success_count += 1
                else:
                    error_count += 1
                
                current = i + 1
                if current % 10 == 0 or current == total:
                    elapsed = time.time() - start_time
                    rate = current / elapsed if elapsed > 0 else 1
                    eta = (total - current) / rate if rate > 0 else 0
                    await broadcast_progress({
                        "current": current, "total": total,
                        "percent": round((current / total) * 100, 1),
                        "success_count": success_count,
                        "error_count": error_count,
                        "eta_seconds": round(eta, 1)
                    })
        
        duration = time.time() - start_time
        print(f"[PROBE] Done: {success_count}/{total} in {duration:.1f}s")
        
        return web.json_response({
            "success": True, "total": total,
            "success_count": success_count, "error_count": error_count,
            "duration_secs": round(duration, 2), "results": results
        })
        
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
    finally:
        probe_in_progress = False


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    progress_subscribers.append(ws)
    
    try:
        await ws.send_json(current_progress)
        async for msg in ws:
            if msg.type in (WSMsgType.TEXT, WSMsgType.ERROR):
                if msg.type == WSMsgType.TEXT and msg.data == "close":
                    break
    finally:
        if ws in progress_subscribers:
            progress_subscribers.remove(ws)
    return ws


def main():
    app = web.Application()
    
    async def cors_middleware(app, handler):
        async def mw(request):
            if request.method == "OPTIONS":
                return web.Response(headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                })
            response = await handler(request)
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        return mw
    
    app.middlewares.append(cors_middleware)
    app.router.add_get("/health", health_handler)
    app.router.add_post("/probe-all", probe_all_handler)
    app.router.add_get("/ws/progress", websocket_handler)
    
    print("=" * 60)
    print(f"  STREAM PROBE SERVER v1.0.0-VPS")
    print(f"  Listening on http://{HOST}:{PORT}")
    print("=" * 60)
    
    web.run_app(app, host=HOST, port=PORT, print=None)


if __name__ == "__main__":
    main()
