#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════════════
# NET SHIELD AUTOPILOT v2 — measure-recommend(-active) loop
# ────────────────────────────────────────────────────────────────────────────
# Fixes vs v1 postmortem:
#   H6: excluir requests con ut=- (rate-limited propio) y STALE/HIT (cache, no upstream real)
#   H8: STABILITY_WINDOWS=288 (24h × 12 ventanas/h) — coincide con doc
#   H9: MAX_RATE=100, cap burst ≤ rate × 10
#   H10: glob *.log* (incluye rotated + gz)
# Modos:
#   observe    — solo mide y persiste history (no escribe config)
#   recommend  — escribe candidate.conf (no aplica)
#   active     — aplica si stability_check pasa, hace backup + nginx -t + reload
# ════════════════════════════════════════════════════════════════════════════
import os, re, json, math, time, glob, gzip, shutil, subprocess
from datetime import datetime, timezone, timedelta
from collections import defaultdict, Counter

LOG_GLOB   = os.getenv("NS_LOG_GLOB", "/var/log/nginx/shield_access.log*")
ERROR_LOG  = os.getenv("NS_ERROR_LOG", "/var/log/nginx/shield_error.log")
STATE_DIR  = os.getenv("NS_STATE_DIR", "/opt/netshield/autopilot/state")
OUT_CONF   = os.getenv("NS_OUT_CONF", "/etc/nginx/conf.d/netshield-autopilot-rate.conf")
MODE       = os.getenv("NS_AUTOPILOT_MODE", "observe")
WIN_MIN    = int(os.getenv("NS_WINDOW_MINUTES", "15"))
MIN_RATE   = int(os.getenv("NS_MIN_RATE", "10"))
MAX_RATE   = int(os.getenv("NS_MAX_RATE", "100"))
STAB_WIN   = int(os.getenv("NS_STABILITY_WINDOWS", "288"))  # 24h with 5min cycles

os.makedirs(STATE_DIR, exist_ok=True)

ts_re = re.compile(r"\[(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d)")
status_re = re.compile(r'"\S+ [^"]+ \S+"\s+(\d{3})\s+')
host_re = re.compile(r"/shield/[a-f0-9]+/([^/\s\?]+)")

def parse_time(line):
    m = ts_re.search(line)
    if not m: return None
    try: return datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
    except Exception: return None

def parse_status(line):
    m = status_re.search(line)
    return int(m.group(1)) if m else None

def parse_host(line):
    m = host_re.search(line)
    return m.group(1).lower() if m else None

def is_rate_limited(line):
    # 429 con ut=- = rechazo del propio shield, NO upstream real
    return "ut=-" in line

def is_cache(line):
    # Cache hits no representan upstream actual
    return " STALE " in line or " HIT " in line or " BYPASS " in line or " EXPIRED " in line

def load_lines():
    files = sorted(glob.glob(LOG_GLOB), key=os.path.getmtime, reverse=True)
    lines = []
    for f in files[:3]:
        try:
            opener = gzip.open if f.endswith(".gz") else open
            with opener(f, "rt", errors="ignore") as fh:
                # leer últimos 30MB del archivo si es grande
                fh.seek(0, 2)
                size = fh.tell()
                if size > 30 * 1024 * 1024:
                    fh.seek(size - 30 * 1024 * 1024)
                    fh.readline()  # discard partial
                else:
                    fh.seek(0)  # FIX: archivos pequeños — leer desde inicio
                for line in fh:
                    lines.append(line)
            if len(lines) > 500000: break
        except FileNotFoundError:
            continue
        except Exception:
            continue
    return lines

def percentile(values, p):
    if not values: return 0
    values = sorted(values)
    if len(values) == 1: return values[0]
    k = (len(values) - 1) * p / 100
    f, c = math.floor(k), math.ceil(k)
    if f == c: return values[int(k)]
    return values[f] + (values[c] - values[f]) * (k - f)

now = datetime.now(timezone.utc)
cutoff = now - timedelta(minutes=WIN_MIN)

events = []
total = excl_old = excl_rl = excl_cache = excl_noparse = 0

for line in load_lines():
    total += 1
    ts = parse_time(line)
    if not ts: excl_noparse += 1; continue
    if ts < cutoff: excl_old += 1; continue
    if is_rate_limited(line): excl_rl += 1; continue
    if is_cache(line): excl_cache += 1; continue
    host = parse_host(line)
    status = parse_status(line)
    if host and status:
        events.append((int(ts.timestamp()), host, status))

status_counts = Counter(s for _,_,s in events)
host_sec = defaultdict(Counter)
host_status = defaultdict(Counter)
for sec, host, status in events:
    host_sec[host][sec] += 1
    host_status[host][status] += 1

per_host_metrics = {}
all_peaks = []
for host, sc in host_sec.items():
    vals = list(sc.values())
    if not vals: continue
    p50 = percentile(vals, 50)
    p95 = percentile(vals, 95)
    pmax = max(vals)
    all_peaks.extend(vals)
    per_host_metrics[host] = {
        "p50_rps": round(p50, 2),
        "p95_rps": round(p95, 2),
        "max_rps": pmax,
        "samples": len(vals),
        "statuses": dict(host_status[host]),
    }

global_p95 = percentile(all_peaks, 95) if all_peaks else 0
global_max = max(all_peaks) if all_peaks else 0

# Calibración: rate ≥ p95 × 1.5, clamp [MIN, MAX]
rec_rate = max(MIN_RATE, min(MAX_RATE, math.ceil(global_p95 * 1.5)))
# Burst absorbe ráfagas de zapping pero no desactiva el rate
rec_burst = max(50, min(150, math.ceil(global_max * 2)))
if rec_burst > rec_rate * 10:
    rec_burst = rec_rate * 10  # H9 cap

upstream_4xx = sum(status_counts[s] for s in [400,401,403,405,429])
upstream_5xx = sum(status_counts[s] for s in [500,502,503,504])

report = {
    "generated_at": now.isoformat(),
    "mode": MODE,
    "window_minutes": WIN_MIN,
    "scan": {
        "total_lines": total,
        "excluded_old": excl_old,
        "excluded_ratelimit_self": excl_rl,
        "excluded_cache": excl_cache,
        "excluded_unparseable": excl_noparse,
        "events_real_upstream": len(events),
    },
    "global": {"p95_rps": round(global_p95, 2), "max_rps": global_max},
    "recommended": {
        "rate_rps": rec_rate,
        "burst": rec_burst,
        "delay": 0,  # nodelay siempre
    },
    "signals": {
        "upstream_4xx": upstream_4xx,
        "upstream_5xx": upstream_5xx,
    },
    "per_host": per_host_metrics,
}

print(json.dumps(report, indent=2))

# Persistir history
hist_file = f"{STATE_DIR}/history.jsonl"
with open(hist_file, "a") as f:
    f.write(json.dumps(report) + "\n")

if MODE == "observe":
    raise SystemExit(0)

# Generar conf candidate
conf = f"""# AUTO-GENERATED autopilot v2 — {report['generated_at']}
# samples_real_upstream={len(events)} (excl rate-limited + cache)
# p95={global_p95}/s max={global_max}/s
map $request_uri $shield_upstream_host {{
    "~^/shield/[^/]+/([^/]+)/"  "$1";
    default                       "";
}}
limit_req_zone $shield_upstream_host zone=hard_cap:10m rate={rec_rate}r/s;
"""

if MODE == "recommend":
    cand = OUT_CONF + ".candidate"
    open(cand, "w").write(conf)
    print(f"[OK] candidate written: {cand}")
    print(f"     rate={rec_rate}/s burst={rec_burst}")
    raise SystemExit(0)

if MODE == "active":
    # Stability check: últimas STAB_WIN ventanas con varianza ≤20%
    if not os.path.exists(hist_file):
        print("[ARMED] no history yet")
        raise SystemExit(0)
    lines = open(hist_file).readlines()[-STAB_WIN:]
    if len(lines) < STAB_WIN:
        print(f"[ARMED] only {len(lines)}/{STAB_WIN} stable windows")
        raise SystemExit(0)
    rates = [json.loads(l)["recommended"]["rate_rps"] for l in lines]
    avg = sum(rates) / len(rates)
    spread = max(rates) - min(rates)
    if spread > max(3, int(avg * 0.20)):
        print(f"[ARMED] not stable: spread={spread}, avg={avg:.1f}")
        raise SystemExit(0)

    # Apply
    backup_dir = "/opt/netshield/autopilot/backups"
    os.makedirs(backup_dir, exist_ok=True)
    backup = f"{backup_dir}/rate.conf.{int(time.time())}.bak"
    if os.path.exists(OUT_CONF):
        shutil.copy2(OUT_CONF, backup)
    open(OUT_CONF, "w").write(conf)
    test = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    if test.returncode != 0:
        print(test.stdout)
        print(test.stderr)
        if os.path.exists(backup):
            shutil.copy2(backup, OUT_CONF)
        else:
            try: os.remove(OUT_CONF)
            except FileNotFoundError: pass
        raise SystemExit("[AUTOPILOT] nginx -t failed. Rolled back.")
    reload = subprocess.run(["systemctl", "reload", "nginx"], capture_output=True, text=True)
    if reload.returncode != 0:
        raise SystemExit("[AUTOPILOT] reload failed.")
    print(f"[APPLIED] rate={rec_rate}/s burst={rec_burst} (backup={backup})")
