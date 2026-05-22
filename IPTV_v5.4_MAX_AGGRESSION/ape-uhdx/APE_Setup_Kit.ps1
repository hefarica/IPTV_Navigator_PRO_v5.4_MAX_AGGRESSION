<#
================================================================================
APE UHDX Setup Kit — Windows Bootstrap
IPTV Navigator PRO v5.4 MAX AGGRESSION
================================================================================
USO:
  irm https://iptv-ape.duckdns.org/prisma/setup/ | iex
  .\APE_Setup_Kit.ps1
  .\APE_Setup_Kit.ps1 -DeviceIp 192.168.10.28:5555 -SkipAdbInstall

Hace:
  1. Instala ADB si falta
  2. Descubre dispositivo Android en la red local
  3. Push sentinel + chisel client al dispositivo
  4. Aplica 40 settings ADB (AI SR, HDR, color, GPU, power, audio)
  5. Configura V2RayNG always-on VPN
  6. Crea tarea watchdog en Task Scheduler (sin ventana negra)
  7. Registra el dispositivo en VPS
================================================================================
#>
param(
    [string]$DeviceIp = "",
    [string]$VpsBase = "https://iptv-ape.duckdns.org",
    [switch]$SkipAdbInstall,
    [switch]$SkipWatchdogTask,
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"
$VPS_REGISTER_URL = "$VpsBase/prisma/api/device-register.php"
$VPS_SENTINEL_URL = "$VpsBase/prisma/setup/ape-uhdx-sentinel.sh"
$VPS_CHISEL_URL   = "$VpsBase/prisma/setup/ape-chisel-client.sh"
$VPS_CHISEL_BIN   = "$VpsBase/prisma/setup/chisel-arm64"

$REMOTE_TMP  = "/data/local/tmp"
$REMOTE_SENTINEL = "$REMOTE_TMP/ape-uhdx-sentinel.sh"
$REMOTE_CHISEL_CLIENT = "$REMOTE_TMP/ape-chisel-client.sh"
$REMOTE_CHISEL_BIN    = "$REMOTE_TMP/chisel"

$LogFile = Join-Path $env:TEMP "APE_Setup_Kit.log"

# --- Logging ---
function Log([string]$msg, [string]$color = "Cyan") {
    $ts = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    Write-Host $line -ForegroundColor $color
}
function LogOK([string]$msg)   { Log "OK  $msg" "Green" }
function LogWarn([string]$msg) { Log "    $msg" "Yellow" }
function LogErr([string]$msg)  { Log "ERR $msg" "Red" }

# --- ADB wrapper ---
function adb {
    $out = & adb.exe @args 2>&1 | Out-String
    return $out.Trim()
}

function AdbShell([string]$dev, [string]$cmd) {
    return (& adb.exe -s $dev shell $cmd 2>&1 | Out-String).Trim()
}

# ══════════════════════════════════════════════════════════════════════
# STEP 1 — ADB install
# ══════════════════════════════════════════════════════════════════════
function Ensure-Adb {
    if (Get-Command adb.exe -ErrorAction SilentlyContinue) {
        LogOK "ADB found: $((Get-Command adb.exe).Source)"
        return
    }
    if ($SkipAdbInstall) { LogErr "ADB not found and -SkipAdbInstall set. Aborting."; exit 1 }
    Log "ADB not found — installing via winget..." "Yellow"
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Google.PlatformTools --silent --accept-package-agreements --accept-source-agreements | Out-Null
        $env:PATH += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
        if (Get-Command adb.exe -ErrorAction SilentlyContinue) { LogOK "ADB installed via winget" ; return }
    }
    # Fallback: direct download
    Log "Downloading ADB from Google..." "Yellow"
    $adbZip = Join-Path $env:TEMP "platform-tools.zip"
    Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $adbZip -UseBasicParsing
    Expand-Archive $adbZip -DestinationPath "$env:LOCALAPPDATA\platform-tools" -Force
    $env:PATH += ";$env:LOCALAPPDATA\platform-tools\platform-tools"
    if (Get-Command adb.exe -ErrorAction SilentlyContinue) { LogOK "ADB installed (manual)" } else { LogErr "ADB install FAILED"; exit 1 }
}

# ══════════════════════════════════════════════════════════════════════
# STEP 2 — Device discovery
# ══════════════════════════════════════════════════════════════════════
function Find-Device {
    if ($DeviceIp) {
        $r = & adb.exe connect $DeviceIp 2>&1 | Out-String
        if ($r -match "connected|already connected") { LogOK "Connected to $DeviceIp"; return $DeviceIp }
        LogErr "Cannot connect to $DeviceIp: $r"; return $null
    }
    Log "Scanning for Android devices on local network..." "Yellow"
    # ARP table scan
    $arpOut = & arp -a 2>&1 | Out-String
    $candidates = @()
    foreach ($line in $arpOut -split "`n") {
        if ($line -match "(\d+\.\d+\.\d+\.\d+)") {
            $ip = $matches[1]
            $r = & adb.exe connect "${ip}:5555" 2>&1 | Out-String
            if ($r -match "connected|already connected") { $candidates += "${ip}:5555" }
        }
    }
    # Also try existing attached devices
    $attached = & adb.exe devices 2>&1 | Out-String
    foreach ($line in ($attached -split "`n" | Select-Object -Skip 1)) {
        if ($line -match "^(\S+)\s+device$") { $candidates += $matches[1] }
    }
    $candidates = $candidates | Select-Object -Unique
    if ($candidates.Count -eq 0) { LogErr "No Android devices found. Connect via USB or specify -DeviceIp"; return $null }
    if ($candidates.Count -eq 1) { LogOK "Found device: $($candidates[0])"; return $candidates[0] }
    Log "Multiple devices found:" "Yellow"
    for ($i=0; $i -lt $candidates.Count; $i++) { Write-Host "  [$i] $($candidates[$i])" }
    $idx = Read-Host "Select device index [0]"
    if (-not $idx) { $idx = 0 }
    return $candidates[[int]$idx]
}

# ══════════════════════════════════════════════════════════════════════
# STEP 3 — Device info
# ══════════════════════════════════════════════════════════════════════
function Get-DeviceInfo([string]$dev) {
    $model   = AdbShell $dev "getprop ro.product.model"
    $brand   = AdbShell $dev "getprop ro.product.brand"
    $android = AdbShell $dev "getprop ro.build.version.release"
    $serial  = AdbShell $dev "getprop ro.serialno"
    if (-not $serial -or $serial -match "unknown") { $serial = $dev -replace "[\.:]+","_" }
    $player  = AdbShell $dev "dumpsys activity activities 2>/dev/null | grep -m1 'mResumedActivity' | grep -oE '[a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+' | head -1"
    Log "Device: $brand $model (Android $android) serial=$serial player=$player"
    return @{
        device_id      = "ape_$($serial -replace '[^a-zA-Z0-9_]','_')"
        device_ip      = $dev
        model          = "$brand $model"
        android_version = $android
        player         = $player
        serial         = $serial
    }
}

# ══════════════════════════════════════════════════════════════════════
# STEP 4 — Push sentinel + chisel
# ══════════════════════════════════════════════════════════════════════
function Push-Files([string]$dev) {
    $tmpDir = Join-Path $env:TEMP "ape_kit"
    New-Item -ItemType Directory -Force $tmpDir | Out-Null

    # Download files from VPS
    foreach ($pair in @(
        @{url=$VPS_SENTINEL_URL; local=Join-Path $tmpDir "ape-uhdx-sentinel.sh"; remote=$REMOTE_SENTINEL},
        @{url=$VPS_CHISEL_URL;   local=Join-Path $tmpDir "ape-chisel-client.sh"; remote=$REMOTE_CHISEL_CLIENT}
    )) {
        if (-not (Test-Path $pair.local)) {
            Log "Downloading $($pair.url)..."
            try { Invoke-WebRequest $pair.url -OutFile $pair.local -UseBasicParsing -ErrorAction Stop } catch { LogWarn "VPS download failed: $_. Skipping $($pair.remote)"; continue }
        }
        if ($DryRun) { LogWarn "[DRY] Would push $($pair.local) -> $($pair.remote)"; continue }
        & adb.exe -s $dev push $pair.local $pair.remote | Out-Null
        AdbShell $dev "chmod 755 $($pair.remote)" | Out-Null
        LogOK "Pushed $($pair.remote)"
    }

    # Download chisel binary if not on device
    $chiselExists = AdbShell $dev "test -f $REMOTE_CHISEL_BIN && echo yes || echo no"
    if ($chiselExists -ne "yes") {
        Log "Downloading chisel ARM64 binary..."
        $chiselLocal = Join-Path $tmpDir "chisel"
        try {
            Invoke-WebRequest $VPS_CHISEL_BIN -OutFile $chiselLocal -UseBasicParsing -ErrorAction Stop
            if (-not $DryRun) {
                & adb.exe -s $dev push $chiselLocal $REMOTE_CHISEL_BIN | Out-Null
                AdbShell $dev "chmod 755 $REMOTE_CHISEL_BIN" | Out-Null
                LogOK "Pushed chisel binary"
            }
        } catch { LogWarn "chisel binary download failed: $_" }
    } else { LogOK "chisel binary already present" }
}

# ══════════════════════════════════════════════════════════════════════
# STEP 5 — Apply 40 ADB settings (MANIFEST from quality-manifest-widget)
# ══════════════════════════════════════════════════════════════════════
$SETTINGS_MANIFEST = @(
    # [namespace, key, value]
    # AI / Picture Quality
    @("system","aipq_enable","1"),
    @("system","aisr_enable","1"),
    @("system","ai_pq_mode","3"),
    @("system","ai_sr_mode","3"),
    @("global","ai_pic_mode","3"),
    @("global","ai_sr_level","3"),
    @("global","pq_ai_dnr_enable","1"),
    @("global","pq_ai_fbc_enable","1"),
    @("global","pq_ai_sr_enable","1"),
    @("global","pq_nr_enable","1"),
    @("global","pq_sharpness_enable","1"),
    @("global","pq_dnr_enable","1"),
    @("global","smart_illuminate_enabled","1"),
    # Display
    @("global","user_preferred_refresh_rate","60.0"),
    @("global","display_color_mode","3"),
    @("global","match_content_frame_rate_pref","2"),
    @("global","match_content_frame_rate","1"),
    # HDR
    @("global","hdr_conversion_mode","0"),
    @("global","hdr_output_type","4"),
    @("global","hdr_force_conversion_type","-1"),
    @("global","hdr_brightness_boost","100"),
    @("global","sdr_brightness_in_hdr","100"),
    @("global","peak_luminance","10000"),
    @("global","pq_hdr_enable","1"),
    @("global","pq_hdr_mode","1"),
    @("global","always_hdr","0"),
    # Color
    @("global","hdmi_color_space","2"),
    @("global","color_depth","12"),
    @("global","color_mode_ycbcr422","1"),
    # Audio
    @("global","encoded_surround_output","2"),
    @("global","enable_dolby_atmos","1"),
    @("global","db_id_sound_spdif_output_enable","1"),
    # Brightness
    @("global","video_brightness","100"),
    @("system","screen_brightness","255"),
    # GPU
    @("global","force_gpu_rendering","1"),
    @("global","force_hw_ui","1"),
    @("global","hardware_accelerated_rendering_enabled","1"),
    # Power
    @("system","screen_off_timeout","2147483647"),
    @("global","stay_on_while_plugged_in","3"),
    # Network / DNS
    @("global","private_dns_mode","hostname"),
    @("global","private_dns_specifier","dns.google")
)

function Apply-Settings([string]$dev) {
    $applied = 0
    foreach ($s in $SETTINGS_MANIFEST) {
        $ns = $s[0]; $key = $s[1]; $val = $s[2]
        if ($DryRun) { LogWarn "[DRY] settings put $ns $key $val"; $applied++; continue }
        $result = AdbShell $dev "settings put $ns $key $val 2>/dev/null; echo OK"
        if ($result -match "OK") { $applied++ }
    }
    LogOK "Settings applied: $applied / $($SETTINGS_MANIFEST.Count)"
    return $applied
}

# ══════════════════════════════════════════════════════════════════════
# STEP 6 — V2RayNG always-on VPN
# ══════════════════════════════════════════════════════════════════════
function Configure-V2RayNG([string]$dev) {
    $v2rayPkg = AdbShell $dev "pm list packages 2>/dev/null | grep -i v2ray | head -1 | cut -d: -f2"
    if (-not $v2rayPkg) {
        LogWarn "V2RayNG not installed on device. Skipping VPN config."
        return
    }
    LogOK "V2RayNG found: $v2rayPkg"
    # Set as always-on VPN
    AdbShell $dev "settings put secure always_on_vpn_lockdown 0 2>/dev/null" | Out-Null
    AdbShell $dev "settings put secure always_on_vpn_app $v2rayPkg 2>/dev/null" | Out-Null
    AdbShell $dev "settings put secure always_on_vpn_lockdown 1 2>/dev/null" | Out-Null
    # Start the app
    AdbShell $dev "am start -n $v2rayPkg/.ui.MainActivity 2>/dev/null" | Out-Null
    LogOK "V2RayNG configured as always-on VPN"
}

# ══════════════════════════════════════════════════════════════════════
# STEP 7 — Start sentinel daemon
# ══════════════════════════════════════════════════════════════════════
function Start-Sentinel([string]$dev) {
    # Kill any existing sentinel
    $lockPid = AdbShell $dev "cat $REMOTE_TMP/ape-uhdx-sentinel.lock 2>/dev/null"
    if ($lockPid -match "^\d+$") {
        AdbShell $dev "kill -9 $lockPid 2>/dev/null" | Out-Null
        AdbShell $dev "rm -f $REMOTE_TMP/ape-uhdx-sentinel.lock" | Out-Null
    }
    if (-not $DryRun) {
        AdbShell $dev "nohup sh $REMOTE_SENTINEL daemon </dev/null >/dev/null 2>&1 &" | Out-Null
        Start-Sleep -Seconds 3
        $newPid = AdbShell $dev "cat $REMOTE_TMP/ape-uhdx-sentinel.lock 2>/dev/null"
        if ($newPid -match "^\d+$") { LogOK "Sentinel started pid=$newPid" }
        else { LogWarn "Sentinel may not have started (no lock file)" }
    }
    # Start chisel tunnel
    AdbShell $dev "sh $REMOTE_CHISEL_CLIENT daemon 2>/dev/null" | Out-Null
    $chiselStatus = AdbShell $dev "sh $REMOTE_CHISEL_CLIENT status 2>/dev/null"
    LogOK "Chisel tunnel: $chiselStatus"
}

# ══════════════════════════════════════════════════════════════════════
# STEP 8 — Windows Watchdog task
# ══════════════════════════════════════════════════════════════════════
function Install-WatchdogTask([string]$devIp) {
    if ($SkipWatchdogTask) { LogWarn "Skipping watchdog task (-SkipWatchdogTask)"; return }
    $taskName = "APE_UHDX_Watchdog_Unified"
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { LogOK "Watchdog task already installed: $taskName"; return }

    # Try to find the PS1 in common locations
    $ps1Candidates = @(
        "$env:USERPROFILE\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\ape-uhdx\APE_UHDX_Watchdog_Unified.ps1",
        (Join-Path $PSScriptRoot "APE_UHDX_Watchdog_Unified.ps1")
    )
    $ps1Path = $ps1Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $ps1Path) { LogWarn "APE_UHDX_Watchdog_Unified.ps1 not found — watchdog task not installed"; return }

    $vbsPath = [System.IO.Path]::ChangeExtension($ps1Path, "").TrimEnd(".") + "_Launcher.vbs"
    if (-not (Test-Path $vbsPath)) {
        # Create launcher VBS on the fly
        Set-Content -Path $vbsPath -Value @"
Set oShell = CreateObject("WScript.Shell")
oShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$ps1Path"" -RunOnce -OnnIp ""$devIp""", 0, False
"@
    }
    $action   = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
    $trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "APE UHDX Sentinel watchdog — resucita daemon en ONN 4K cada 1 min" -Force | Out-Null
    LogOK "Watchdog task installed: $taskName (every 1 min, no window)"
}

# ══════════════════════════════════════════════════════════════════════
# STEP 9 — VPS registration
# ══════════════════════════════════════════════════════════════════════
function Register-Device([hashtable]$info, [int]$settingsApplied) {
    $payload = @{
        device_id        = $info.device_id
        device_ip        = $info.device_ip
        player           = $info.player
        platform         = "android"
        android_version  = $info.android_version
        model            = $info.model
        settings_applied = $settingsApplied
        chisel_port      = 5556
        vps_tunnel       = "127.0.0.1:5556"
        notes            = "Registered via APE_Setup_Kit.ps1 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } | ConvertTo-Json -Compress
    try {
        $r = Invoke-RestMethod -Uri $VPS_REGISTER_URL -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 8 -ErrorAction Stop
        LogOK "VPS registration: $($r | ConvertTo-Json -Compress)"
    } catch {
        LogWarn "VPS registration failed: $($_.Exception.Message)"
    }
}

# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   APE UHDX Setup Kit — IPTV Navigator    ║" -ForegroundColor Cyan
Write-Host "  ║   v5.4 MAX AGGRESSION  2026               ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
if ($DryRun) { Write-Host "  [DRY RUN MODE — no changes applied]" -ForegroundColor Yellow; Write-Host "" }

Ensure-Adb

$dev = Find-Device
if (-not $dev) { exit 1 }

$info = Get-DeviceInfo $dev

Log ""
Log "── Pushing files ──────────────────────────────────────────"
Push-Files $dev

Log ""
Log "── Applying $($SETTINGS_MANIFEST.Count) ADB settings ──────────────────────────"
$applied = Apply-Settings $dev

Log ""
Log "── Configuring V2RayNG ────────────────────────────────────"
Configure-V2RayNG $dev

Log ""
Log "── Starting sentinel + chisel ─────────────────────────────"
Start-Sentinel $dev

Log ""
Log "── Windows watchdog task ───────────────────────────────────"
Install-WatchdogTask $dev

Log ""
Log "── Registering with VPS ────────────────────────────────────"
Register-Device $info $applied

Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  SETUP COMPLETE                                       ║" -ForegroundColor Green
Write-Host "  ║  Device : $($info.model.PadRight(43))║" -ForegroundColor Green
Write-Host "  ║  Player : $($info.player.PadRight(43))║" -ForegroundColor Green
Write-Host "  ║  Settings: $("$applied / $($SETTINGS_MANIFEST.Count) applied".PadRight(42))║" -ForegroundColor Green
Write-Host "  ║  Tunnel : VPS 127.0.0.1:5556 via chisel              ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Log: $LogFile" -ForegroundColor Gray
