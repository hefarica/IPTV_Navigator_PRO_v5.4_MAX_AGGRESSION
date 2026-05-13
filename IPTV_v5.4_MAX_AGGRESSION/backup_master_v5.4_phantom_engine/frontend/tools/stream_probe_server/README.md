# Stream Probe Server (Rust)

High-performance IPTV stream quality analyzer using ffprobe.

## Quick Start (Recommended)

**Double-click this file to start everything:**
```
iptv_nav/files/start_iptv_navigator.bat
```

This will:
1. Start the Probe Server automatically
2. Open IPTV Navigator PRO in your browser

## Requirements

- **Rust** (1.70+): https://rustup.rs/
- **FFmpeg** (with ffprobe): https://ffmpeg.org/download.html

Both are already installed if you followed the setup process.

## Manual Installation

```bash
# Install FFmpeg (Windows - using winget)
winget install Gyan.FFmpeg

# Install Rust (Windows - using winget)
winget install Rustlang.Rustup

# Build the server (only first time)
cd iptv_nav/files/tools/stream_probe_server
cargo build --release
```

## Manual Usage

```bash
# Run the compiled server
.\target\release\stream_probe_server.exe

# Or use PowerShell script (starts in background)
powershell -ExecutionPolicy Bypass -File start_probe_server.ps1
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check and ffprobe availability |
| `/probe-all` | POST | Probe all channels (JSON body) |
| `/ws/progress` | WS | WebSocket for real-time progress |

## API Example

### POST /probe-all

```json
{
  "channels": [
    {
      "id": "12345",
      "url": "http://example.com/stream.m3u8",
      "name": "ESPN HD",
      "resolution": "1080p"
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "total": 26000,
  "success_count": 24500,
  "error_count": 1500,
  "duration_secs": 892.5,
  "results": [
    {
      "channel_id": "12345",
      "success": true,
      "width": 1920,
      "height": 1080,
      "codec": "h264",
      "bitrate": 6500,
      "fps": 29.97
    }
  ]
}
```

## Performance

- 150 concurrent probes by default
- 5-second timeout per stream
- ~26,000 channels in ~15 minutes

## Configuration

Edit `src/main.rs` constants:

```rust
const MAX_CONCURRENT_PROBES: usize = 150;
const PROBE_TIMEOUT_SECS: u64 = 5;
const SERVER_PORT: u16 = 8765;
```
