#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════
  ANTI-509 GUARDIAN v1.0 — Zero-Probe Enforcement Engine
  Prevents 509 Bandwidth Limit by detecting & killing any
  process that touches IPTV provider origins outside the
  authorized resolve path.
═══════════════════════════════════════════════════════════════
  Modes:
    --detect     Scan and report only (dry-run)
    --enforce    Kill violating processes + disable crons
    --lockdown   Full quarantine + Docker stop + block all
═══════════════════════════════════════════════════════════════
"""

import subprocess, json, re, os, sys, socket, glob, base64, hashlib
from datetime import datetime
from pathlib import Path

# ─── CONFIG ──────────────────────────────────────────────────
LOG_DIR      = Path("/var/log/iptv-ape")
LOG_FILE     = LOG_DIR / "anti_509_guard.log"
REPORT_FILE  = LOG_DIR / "anti_509_report.json"
SNAPSHOT_DIR = LOG_DIR / "forensic_snapshots"
M3U_DIRS     = ["/var/www/html", "/var/www/lists"]
RESOLVE_PHP  = "/var/www/html/resolve_quality.php"

# Patterns that MUST NOT exist in resolve_quality.php
BANNED_PHP_PATTERNS = [
    r'curl_init\s*\(',
    r'curl_exec\s*\(',
    r'file_get_contents\s*\(\s*["\']https?://',
    r'get_headers\s*\(',
    r'fsockopen\s*\(',
    r'stream_socket_client\s*\(',
    r'fopen\s*\(\s*["\']https?://',
]

# Process names that are WHITELISTED (never kill)
WHITELIST_PROCS = {
    "nginx", "php-fpm", "php-fpm8.3", "sshd", "systemd",
    "redis-server", "mysqld", "dockerd", "containerd",
    "cron", "rsyslogd", "anti_509_guard", "python3",
}

# Patterns in cmdline that indicate IPTV stream consumption
STREAM_CONSUMER_PATTERNS = [
    r'ffmpeg.*-i\s+https?://',
    r'curl.*https?://.*/(live|hls|play)/',
    r'wget.*https?://.*/(live|hls|play)/',
    r'python.*requests\.(get|head|post).*/(live|hls|play)/',
]

# ─── HELPERS ─────────────────────────────────────────────────
def log(msg, level="INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def run(cmd):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except Exception as e:
        return f"ERROR: {e}"

def resolve_ip(hostname):
    try:
        return socket.gethostbyname(hostname)
    except:
        return None

# ─── PHASE 1: EXTRACT DOMAINS FROM M3U ──────────────────────
def extract_provider_domains():
    """Extract all unique hostnames from M3U files and server maps."""
    domains = set()
    # From M3U files
    for d in M3U_DIRS:
        for ext in ("*.m3u8", "*.m3u", "*.json"):
            for f in glob.glob(os.path.join(d, ext)):
                if ".bak" in f or "backup" in f.lower():
                    continue
                try:
                    with open(f, "r", errors="ignore") as fh:
                        for line in fh:
                            urls = re.findall(r'https?://([^/:"\s]+)', line)
                            domains.update(urls)
                except:
                    pass

    # From base64-encoded &srv= params in resolve logs
    for f in glob.glob("/var/log/nginx/*.log"):
        try:
            with open(f, "r", errors="ignore") as fh:
                for line in fh:
                    for m in re.finditer(r'srv=([A-Za-z0-9+/=]+)', line):
                        try:
                            decoded = base64.b64decode(m.group(1)).decode("utf-8", errors="ignore")
                            host = decoded.split("|")[0]
                            if host and "." in host:
                                domains.add(host)
                        except:
                            pass
        except:
            pass

    # Filter out non-IPTV domains (picon servers, CDNs, local)
    iptv_domains = set()
    for d in domains:
        if any(x in d.lower() for x in ["localhost", "127.0.0.1", "iptv-ape", "duckdns", "google", "github"]):
            continue
        iptv_domains.add(d)

    return iptv_domains

def resolve_all_ips(domains):
    """Resolve all domains to IPs."""
    ip_map = {}
    for d in domains:
        ip = resolve_ip(d)
        if ip:
            ip_map[d] = ip
    return ip_map

# ─── PHASE 2: SCAN HOST PROCESSES ───────────────────────────
def scan_host_processes(provider_ips):
    """Find processes with established connections to provider IPs."""
    violations = []
    # Get all established connections with PIDs
    ss_out = run("ss -tpn state established 2>/dev/null")
    for line in ss_out.splitlines():
        for ip in provider_ips.values():
            if ip in line:
                # Extract PID
                pid_match = re.search(r'pid=(\d+)', line)
                pid = pid_match.group(1) if pid_match else "unknown"
                # Get process name
                cmdline = run(f"cat /proc/{pid}/cmdline 2>/dev/null | tr '\\0' ' '") if pid != "unknown" else ""
                proc_name = cmdline.split()[0].split("/")[-1] if cmdline else "unknown"

                if proc_name not in WHITELIST_PROCS:
                    domain = [d for d, i in provider_ips.items() if i == ip]
                    violations.append({
                        "type": "ACTIVE_CONNECTION",
                        "severity": "CRITICAL",
                        "pid": pid,
                        "process": proc_name,
                        "cmdline": cmdline[:200],
                        "peer_ip": ip,
                        "peer_domain": domain[0] if domain else ip,
                        "connection_line": line.strip()[:200],
                    })
    return violations

# ─── PHASE 3: SCAN FOR ROGUE PROCESSES ──────────────────────
def scan_rogue_processes():
    """Find processes that match IPTV stream consumption patterns."""
    violations = []
    ps_out = run("ps -eo pid,user,args --no-headers 2>/dev/null")
    for line in ps_out.splitlines():
        for pattern in STREAM_CONSUMER_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                parts = line.strip().split(None, 2)
                pid = parts[0] if len(parts) > 0 else "?"
                violations.append({
                    "type": "ROGUE_PROCESS",
                    "severity": "CRITICAL",
                    "pid": pid,
                    "cmdline": line.strip()[:200],
                    "matched_pattern": pattern,
                })
    return violations

# ─── PHASE 4: SCAN CRONTAB ──────────────────────────────────
def scan_crontab(provider_domains):
    """Check crontab for entries that might hit providers."""
    violations = []
    cron_out = run("crontab -l 2>/dev/null")
    if cron_out and "no crontab" not in cron_out.lower():
        for line in cron_out.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            for domain in provider_domains:
                if domain in line:
                    violations.append({
                        "type": "CRON_PROVIDER_HIT",
                        "severity": "CRITICAL",
                        "cron_line": line.strip(),
                        "matched_domain": domain,
                    })
            # Check for generic stream patterns
            if re.search(r'curl.*/(live|hls)/|wget.*/(live|hls)/|stream.*monitor|health.*check', line, re.IGNORECASE):
                violations.append({
                    "type": "CRON_STREAM_PROBE",
                    "severity": "HIGH",
                    "cron_line": line.strip(),
                })
    return violations

# ─── PHASE 5: SCAN RESOLVE_QUALITY.PHP ───────────────────────
def scan_resolver():
    """Verify resolve_quality.php has no banned HTTP patterns."""
    violations = []
    if not os.path.exists(RESOLVE_PHP):
        log(f"WARN: {RESOLVE_PHP} not found", "WARN")
        return violations

    with open(RESOLVE_PHP, "r", errors="ignore") as f:
        content = f.read()
        lines = content.splitlines()

    for i, line in enumerate(lines, 1):
        # Skip commented lines
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("#"):
            continue
        # Skip if inside if(false) block
        if "if (false)" in line or "if(false)" in line:
            continue

        for pattern in BANNED_PHP_PATTERNS:
            if re.search(pattern, line):
                violations.append({
                    "type": "RESOLVER_BANNED_PATTERN",
                    "severity": "CRITICAL",
                    "file": RESOLVE_PHP,
                    "line_number": i,
                    "line_content": line.strip()[:200],
                    "matched_pattern": pattern,
                })

    # Check BLIND_RESOLUTION_MODE
    if "BLIND_RESOLUTION_MODE" not in content:
        violations.append({
            "type": "RESOLVER_MISSING_BLIND_FLAG",
            "severity": "HIGH",
            "detail": "BLIND_RESOLUTION_MODE constant not found in resolve_quality.php",
        })

    return violations

# ─── PHASE 6: SCAN DOCKER ───────────────────────────────────
def scan_docker(provider_ips):
    """Check Docker containers for provider connections."""
    violations = []
    containers = run("docker ps --format '{{.Names}}' 2>/dev/null")
    if not containers:
        return violations

    for name in containers.splitlines():
        name = name.strip()
        if not name:
            continue
        # Check container connections
        net_out = run(f"docker exec {name} ss -tpn state established 2>/dev/null || true")
        for ip in provider_ips.values():
            if ip in (net_out or ""):
                violations.append({
                    "type": "DOCKER_PROVIDER_CONNECTION",
                    "severity": "CRITICAL",
                    "container": name,
                    "peer_ip": ip,
                })
    return violations

# ─── ENFORCEMENT ─────────────────────────────────────────────
def enforce(violations, mode):
    """Apply enforcement actions based on mode."""
    actions_taken = []

    for v in violations:
        if v["severity"] != "CRITICAL":
            continue

        if v["type"] in ("ACTIVE_CONNECTION", "ROGUE_PROCESS"):
            pid = v.get("pid", "unknown")
            if mode in ("enforce", "lockdown") and pid != "unknown":
                log(f"KILLING PID {pid}: {v.get('cmdline', '')[:100]}", "ENFORCE")
                run(f"kill -9 {pid}")
                actions_taken.append(f"Killed PID {pid}")

        elif v["type"] in ("CRON_PROVIDER_HIT", "CRON_STREAM_PROBE"):
            if mode in ("enforce", "lockdown"):
                log("CLEARING CRONTAB — provider-hitting entry detected", "ENFORCE")
                run("echo '' | crontab -")
                actions_taken.append("Cleared crontab")

        elif v["type"] == "DOCKER_PROVIDER_CONNECTION" and mode == "lockdown":
            container = v.get("container", "")
            if container and container not in ("coa-navigator-mysql",):
                log(f"STOPPING DOCKER container {container}", "LOCKDOWN")
                run(f"docker stop {container}")
                actions_taken.append(f"Stopped container {container}")

    return actions_taken

# ─── FORENSIC SNAPSHOT ───────────────────────────────────────
def save_snapshot(domains, ips, violations, actions):
    """Save forensic evidence."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    report = {
        "timestamp": datetime.now().isoformat(),
        "provider_domains": sorted(domains),
        "provider_ips": ips,
        "violations_count": len(violations),
        "critical_count": sum(1 for v in violations if v["severity"] == "CRITICAL"),
        "violations": violations,
        "actions_taken": actions,
        "verdict": "CLEAN" if not violations else
                   "CRITICAL_VIOLATIONS" if any(v["severity"] == "CRITICAL" for v in violations) else
                   "WARNINGS_ONLY",
    }

    report_path = SNAPSHOT_DIR / f"snapshot_{ts}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    # Also write latest report
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2, default=str)

    return report

# ─── MAIN ────────────────────────────────────────────────────
def main():
    mode = "detect"
    if "--enforce" in sys.argv:
        mode = "enforce"
    elif "--lockdown" in sys.argv:
        mode = "lockdown"
    elif "--detect" not in sys.argv and len(sys.argv) > 1:
        print(f"Usage: {sys.argv[0]} [--detect|--enforce|--lockdown]")
        sys.exit(1)

    log(f"═══ ANTI-509 GUARDIAN v1.0 — Mode: {mode.upper()} ═══")

    # Phase 1: Extract provider domains
    log("Phase 1: Extracting provider domains from M3U lists...")
    domains = extract_provider_domains()
    ips = resolve_all_ips(domains)
    log(f"  Found {len(domains)} domains, {len(ips)} resolved IPs")
    for d, ip in sorted(ips.items()):
        log(f"  → {d} = {ip}")

    all_violations = []

    # Phase 2: Scan host network connections
    log("Phase 2: Scanning host connections to providers...")
    v = scan_host_processes(ips)
    all_violations.extend(v)
    log(f"  Found {len(v)} active connection violations")

    # Phase 3: Scan rogue processes
    log("Phase 3: Scanning for rogue IPTV-consuming processes...")
    v = scan_rogue_processes()
    all_violations.extend(v)
    log(f"  Found {len(v)} rogue process violations")

    # Phase 4: Scan crontab
    log("Phase 4: Scanning crontab for provider probes...")
    v = scan_crontab(domains)
    all_violations.extend(v)
    log(f"  Found {len(v)} crontab violations")

    # Phase 5: Scan resolver PHP
    log("Phase 5: Auditing resolve_quality.php for banned patterns...")
    v = scan_resolver()
    all_violations.extend(v)
    log(f"  Found {len(v)} resolver violations")

    # Phase 6: Scan Docker
    log("Phase 6: Scanning Docker containers...")
    v = scan_docker(ips)
    all_violations.extend(v)
    log(f"  Found {len(v)} Docker violations")

    # Enforcement
    actions = []
    if all_violations and mode != "detect":
        log(f"Enforcing in {mode.upper()} mode...")
        actions = enforce(all_violations, mode)
        for a in actions:
            log(f"  ACTION: {a}", "ENFORCE")

    # Report
    critical = sum(1 for v in all_violations if v["severity"] == "CRITICAL")
    high = sum(1 for v in all_violations if v["severity"] == "HIGH")

    report = save_snapshot(domains, ips, all_violations, actions)

    log("═══════════════════════════════════════════════════")
    if not all_violations:
        log("✅ VERDICT: SYSTEM CLEAN — No provider consumption detected")
    elif critical > 0:
        log(f"🔴 VERDICT: {critical} CRITICAL + {high} HIGH violations detected", "CRITICAL")
    else:
        log(f"⚠️  VERDICT: {high} warnings detected", "WARN")
    log(f"Report saved to {REPORT_FILE}")
    log("═══════════════════════════════════════════════════")

    sys.exit(1 if critical > 0 else 0)

if __name__ == "__main__":
    main()
