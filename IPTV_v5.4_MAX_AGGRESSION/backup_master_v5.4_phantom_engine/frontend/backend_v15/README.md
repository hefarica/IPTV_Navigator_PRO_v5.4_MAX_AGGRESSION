# APE v15.0 ULTIMATE

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Redis 6+
- pip

### Installation

```bash
# Run installer (Linux/macOS/Termux)
chmod +x install_ape_v15_ultimate.sh
./install_ape_v15_ultimate.sh

# Or manual installation
pip install flask flask-cors redis requests psutil
```

### Start Server

```bash
cd backend-ape-v15
python ape_server_v15_ultimate.py
```

Server runs on `http://localhost:8080`

### Parametrize M3U

```bash
python tools/m3u_parametrizer.py your_list.m3u8 -o output_APE_v15.m3u8
```

### Run Tests

```bash
python test_ape_v15_http.py
```

---

## 📁 Directory Structure

```
backend-ape-v15/
├── ape_server_v15_ultimate.py    # Main Flask server
├── telemetry_v15.py              # Dual-level telemetry (100ms + 10s)
├── hysteresis_controller.py      # 60s failback control
├── device_metrics.py             # System/network metrics
├── hls_rewriter_v15.py           # HLS manifest rewriting
├── buffer_optimizer_v15.py       # Content-aware buffering
├── profile_processor_v15.py      # Profile evaluation
├── test_ape_v15_http.py          # HTTP test suite
├── config/
│   └── ape_profiles_v15.json     # 6 profiles (P0-P5)
├── tools/
│   └── m3u_parametrizer.py       # M3U converter
├── frontend/
│   └── APE_MONITOR_v15.html      # Monitoring dashboard
├── utils/
│   ├── __init__.py
│   ├── logger.py                 # Structured logger
│   └── redis_client.py           # Redis wrapper
└── logs/
    └── ape_server.log
```

---

## 🎯 Features

### Dual-Level Telemetry

- **Level 1 (100ms):** Rolling window for micro-degradation detection
- **Level 2 (10s):** Snapshots with percentiles (p50, p90, p99)

### Adaptive Profiles (P0-P5)

- P0: 8K Ultra (100 Mbps)
- P1: 4K High FPS (60 Mbps)
- P2: 4K Standard (40 Mbps) - Default
- P3: FHD Balanced (12 Mbps)
- P4: HD Basic (6 Mbps)
- P5: SD Failsafe (3 Mbps)

### Intelligent Failover

- **Downgrade:** Immediate (<100ms)
- **Upgrade:** 60s hysteresis for stability

### Content-Aware Buffers

- LIVE_SPORTS: 2-4s (low latency)
- LIVE_NEWS: 3-6s (balanced)
- VOD_MOVIES: 10-18s (stability)
- VOD_SERIES: 8-15s (stability)

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status |
| `/stream?channel_id=X&original_url=Y` | GET | Stream proxy |
| `/segment?uri=X` | GET | Segment proxy |
| `/api/metrics` | GET | Global/session metrics |
| `/api/sessions` | GET | List active sessions |
| `/api/force_failover` | POST | Manual profile change |

---

## 📊 Monitoring

Open `frontend/APE_MONITOR_v15.html` in browser for real-time dashboard:

- Active sessions
- CPU/RAM usage
- Failover/failback events
- Session details

---

## 🧪 Testing

```bash
# Run full test suite
python test_ape_v15_http.py --server http://localhost:8080

# Generate HTML report
python test_ape_v15_http.py --output test_report.html
```

---

## 📄 License

MIT License - APE Team 2026
