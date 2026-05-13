# ═══════════════════════════════════════════════════════════════════
# APE PQ WATCHDOG — Windows Scheduled Task for ONN 4K Guardian
# ═══════════════════════════════════════════════════════════════════
# Runs every 5 minutes via Task Scheduler.
# Checks if the PQ Guardian daemon is alive on the ONN 4K.
# If not (e.g., after reboot), automatically restarts it.
# Completely transparent to the user.
# ═══════════════════════════════════════════════════════════════════

$ONN_IP = "192.168.10.28:5555"
$VPS_URL = "https://iptv-ape.duckdns.org/ape-pq-heartbeat.php"
$LOG_FILE = "$env:USERPROFILE\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\pq-watchdog.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

# ── Step 1: Connect to ONN 4K ────────────────────────────────────
$connectResult = & adb connect $ONN_IP 2>&1 | Out-String
if ($connectResult -notmatch "connected") {
    Log "OFFLINE: ONN 4K not reachable ($connectResult)"
    exit 0
}

# ── Step 2: Check if Guardian daemon is running ──────────────────
$lockCheck = & adb -s $ONN_IP shell "cat /data/local/tmp/ape-pq-guardian.lock 2>/dev/null" 2>&1 | Out-String
$lockPid = $lockCheck.Trim()

$daemonAlive = $false
if ($lockPid -match '^\d+$') {
    $procCheck = & adb -s $ONN_IP shell "kill -0 $lockPid 2>/dev/null; echo `$?" 2>&1 | Out-String
    if ($procCheck.Trim() -eq "0") {
        $daemonAlive = $true
    }
}

# ── Step 3: If dead, resurrect ───────────────────────────────────
if (-not $daemonAlive) {
    Log "REBOOT DETECTED: Guardian not running. Restarting..."

    # Clean stale lock
    & adb -s $ONN_IP shell "rm -f /data/local/tmp/ape-pq-guardian.lock" 2>&1 | Out-Null

    # Verify script exists
    $scriptExists = & adb -s $ONN_IP shell "test -f /data/local/tmp/ape-pq-guardian.sh; echo `$?" 2>&1 | Out-String
    if ($scriptExists.Trim() -ne "0") {
        Log "CRITICAL: Guardian script missing! Re-pushing..."
        $scriptPath = "$env:USERPROFILE\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend\ape-pq-guardian.sh"
        if (Test-Path $scriptPath) {
            & adb -s $ONN_IP push $scriptPath /data/local/tmp/ape-pq-guardian.sh 2>&1 | Out-Null
            & adb -s $ONN_IP shell "chmod 755 /data/local/tmp/ape-pq-guardian.sh" 2>&1 | Out-Null
        } else {
            Log "FATAL: Script not found at $scriptPath"
            exit 1
        }
    }

    # Start daemon
    & adb -s $ONN_IP shell "nohup /data/local/tmp/ape-pq-guardian.sh daemon > /dev/null 2>&1 &" 2>&1 | Out-Null
    Start-Sleep -Seconds 3

    # Verify
    $verifyLock = & adb -s $ONN_IP shell "cat /data/local/tmp/ape-pq-guardian.lock 2>/dev/null" 2>&1 | Out-String
    if ($verifyLock.Trim() -match '^\d+$') {
        Log "RESURRECTED: Guardian daemon started (PID $($verifyLock.Trim()))"
    } else {
        Log "FAILED: Could not start Guardian daemon"
    }
} else {
    # Daemon is alive — silent heartbeat
    Log "OK: Guardian alive (PID $lockPid)"
}

# ── Step 4: Quick settings verification ──────────────────────────
$settingsCheck = & adb -s $ONN_IP shell "settings get global aisr_enable; settings get global aipq_enable; settings get global always_hdr" 2>&1 | Out-String
$values = $settingsCheck.Trim() -split "`n"

$status = @{
    device   = "onn4k"
    guardian = if ($daemonAlive) { "alive" } else { "resurrected" }
    aisr     = $values[0].Trim()
    aipq     = $values[1].Trim()
    hdr      = $values[2].Trim()
    ts       = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
}

# ── Step 5: Report to VPS (heartbeat) ────────────────────────────
try {
    $json = $status | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $VPS_URL -Method POST -Body $json -ContentType "application/json" -TimeoutSec 5 -ErrorAction SilentlyContinue | Out-Null
    Log "HEARTBEAT sent to VPS: $json"
} catch {
    # VPS unreachable — not critical, guardian still works locally
}
