<# 
═══════════════════════════════════════════════════════════════════════════════
APE UHDX WATCHDOG UNIFICADO — Windows Scheduled Task
Revive /data/local/tmp/ape-uhdx-sentinel.sh en ONN 4K y reporta heartbeat al VPS.

Uso:
  powershell -ExecutionPolicy Bypass -File .\APE_UHDX_Watchdog_Unified.ps1
  powershell -ExecutionPolicy Bypass -File .\APE_UHDX_Watchdog_Unified.ps1 -InstallTask

Recomendado: tarea cada 1 minuto. El daemon on-device hace la operación real; este
watchdog solo re-push/revive si el ONN reinicia o el proceso muere.
═══════════════════════════════════════════════════════════════════════════════
#>

param(
    [string]$OnnIp = $(if ($env:APE_ONN_IP) { $env:APE_ONN_IP } else { "192.168.10.28:5555" }),
    [string]$VpsHeartbeatUrl = $(if ($env:APE_WATCHDOG_HEARTBEAT_URL) { $env:APE_WATCHDOG_HEARTBEAT_URL } else { "https://iptv-ape.duckdns.org/prisma/api/prisma-adb-quality.php?action=watchdog_heartbeat" }),
    [switch]$InstallTask,
    [switch]$RunOnce
)

$ErrorActionPreference = "Continue"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalDaemon = Join-Path $ScriptRoot "ape-uhdx-sentinel.sh"
$RemoteDaemon = "/data/local/tmp/ape-uhdx-sentinel.sh"
$RemoteLock = "/data/local/tmp/ape-uhdx-sentinel.lock"
$RemoteLog = "/data/local/tmp/ape-uhdx-sentinel.log"

$DefaultLogDir = Join-Path $env:USERPROFILE "Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\backend"
if (-not (Test-Path $DefaultLogDir)) {
    $DefaultLogDir = $ScriptRoot
}
$LogFile = Join-Path $DefaultLogDir "ape-uhdx-watchdog.log"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Message"
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory=$true)][string[]]$Args
    )
    try {
        $out = & adb @Args 2>&1 | Out-String
        return $out
    } catch {
        return $_.Exception.Message
    }
}

function Install-ScheduledTask {
    $taskName = "APE_UHDX_Watchdog_Unified"
    $ps = (Get-Command powershell.exe).Source
    $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -RunOnce -OnnIp `"$OnnIp`""
    $action = New-ScheduledTaskAction -Execute $ps -Argument $args
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Revive APE UHDX Sentinel on ONN 4K every minute" -Force | Out-Null
    Write-Log "TASK_INSTALLED: $taskName every 1 minute"
    Write-Output "Installed scheduled task: $taskName"
}

function Test-OnnConnection {
    $connect = Invoke-Adb @("connect", $OnnIp)
    if ($connect -match "connected|already connected") {
        Write-Log "ADB_OK: $OnnIp ($($connect.Trim()))"
        return $true
    }
    Write-Log "ADB_OFFLINE: $OnnIp ($($connect.Trim()))"
    return $false
}

function Get-RemotePid {
    $pidText = Invoke-Adb @("-s", $OnnIp, "shell", "cat $RemoteLock 2>/dev/null")
    $pid = ($pidText.Trim() -replace "`r","" -replace "`n","")
    if ($pid -match "^\d+$") { return $pid }
    return $null
}

function Test-DaemonAlive {
    $pid = Get-RemotePid
    if (-not $pid) { return $false }

    $check = Invoke-Adb @("-s", $OnnIp, "shell", "kill -0 $pid 2>/dev/null; echo `$?")
    if ($check.Trim() -eq "0") {
        return $true
    }
    return $false
}

function Push-DaemonIfNeeded {
    if (-not (Test-Path $LocalDaemon)) {
        Write-Log "FATAL: local daemon missing at $LocalDaemon"
        throw "No encuentro el daemon local: $LocalDaemon"
    }

    $exists = Invoke-Adb @("-s", $OnnIp, "shell", "test -f $RemoteDaemon; echo `$?")
    if ($exists.Trim() -ne "0") {
        Write-Log "PUSH: remote daemon missing, pushing..."
        Invoke-Adb @("-s", $OnnIp, "push", $LocalDaemon, $RemoteDaemon) | Out-Null
        Invoke-Adb @("-s", $OnnIp, "shell", "chmod 755 $RemoteDaemon") | Out-Null
        return
    }

    # Lightweight checksum comparison when toybox md5sum exists.
    $localHash = ""
    try {
        $localHash = (Get-FileHash -Algorithm MD5 $LocalDaemon).Hash.ToLower()
    } catch {}

    $remoteHashOut = Invoke-Adb @("-s", $OnnIp, "shell", "md5sum $RemoteDaemon 2>/dev/null | cut -d' ' -f1")
    $remoteHash = $remoteHashOut.Trim().ToLower()

    if ($localHash -and $remoteHash -and $localHash -ne $remoteHash) {
        Write-Log "PUSH: daemon hash changed local=$localHash remote=$remoteHash"
        Invoke-Adb @("-s", $OnnIp, "push", $LocalDaemon, $RemoteDaemon) | Out-Null
        Invoke-Adb @("-s", $OnnIp, "shell", "chmod 755 $RemoteDaemon") | Out-Null
    }
}

function Stop-LegacyDaemons {
    $cmd = @"
for f in /data/local/tmp/ape-ram-guardian.lock /data/local/tmp/ape-sentinel.lock /data/local/tmp/ape-pq-guardian.lock; do
  if [ -f `$f ]; then
    p=`$(cat `$f 2>/dev/null)
    if [ -n "`$p" ]; then kill `$p 2>/dev/null; sleep 1; kill -9 `$p 2>/dev/null; fi
    rm -f `$f
  fi
done
"@
    Invoke-Adb @("-s", $OnnIp, "shell", $cmd) | Out-Null
}

function Start-Daemon {
    Stop-LegacyDaemons
    Push-DaemonIfNeeded

    Invoke-Adb @("-s", $OnnIp, "shell", "sh $RemoteDaemon install >/dev/null 2>&1; nohup $RemoteDaemon daemon >/dev/null 2>&1 &") | Out-Null
    Start-Sleep -Seconds 3

    if (Test-DaemonAlive) {
        $pid = Get-RemotePid
        Write-Log "RESURRECTED: unified daemon alive pid=$pid"
        return $true
    }

    Write-Log "FAILED: unified daemon did not start"
    return $false
}

function Read-RemoteState {
    $cmd = "printf 'ai_sr_level='; settings get global ai_sr_level; printf 'hdr_conversion_mode='; settings get global hdr_conversion_mode; printf 'always_hdr='; settings get global always_hdr; printf 'peak_luminance='; settings get global peak_luminance; printf 'chroma='; settings get global color_mode_ycbcr422; printf 'tun0='; if ip addr show tun0 >/dev/null 2>&1; then echo UP; else echo DOWN; fi; printf 'mem='; awk '/MemAvailable/{printf \"%d\n\", `$2/1024}' /proc/meminfo"
    return Invoke-Adb @("-s", $OnnIp, "shell", $cmd)
}

function Send-Heartbeat {
    param(
        [string]$GuardianState,
        [bool]$DaemonAlive,
        [string]$RemoteState
    )

    $payload = [ordered]@{
        device = "onn4k"
        watchdog = "APE_UHDX_Watchdog_Unified"
        guardian = $GuardianState
        daemon_alive = $DaemonAlive
        onn_ip = $OnnIp
        remote_state = $RemoteState
        ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    }

    try {
        $json = $payload | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $VpsHeartbeatUrl -Method POST -Body $json -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop | Out-Null
        Write-Log "HEARTBEAT: $json"
    } catch {
        Write-Log "HEARTBEAT_FAIL: $($_.Exception.Message)"
    }
}

if ($InstallTask) {
    Install-ScheduledTask
    return
}

try {
    if (-not (Test-OnnConnection)) {
        Send-Heartbeat -GuardianState "onn_offline" -DaemonAlive $false -RemoteState ""
        return
    }

    $alive = Test-DaemonAlive
    if ($alive) {
        $pid = Get-RemotePid
        Write-Log "OK: unified daemon alive pid=$pid"
        $state = Read-RemoteState
        Send-Heartbeat -GuardianState "alive" -DaemonAlive $true -RemoteState $state
        return
    }

    Write-Log "DEAD_OR_REBOOTED: unified daemon not alive. Starting..."
    $started = Start-Daemon
    $stateAfter = Read-RemoteState
    Send-Heartbeat -GuardianState $(if ($started) { "resurrected" } else { "failed" }) -DaemonAlive $started -RemoteState $stateAfter
} catch {
    Write-Log "EXCEPTION: $($_.Exception.Message)"
    Send-Heartbeat -GuardianState "watchdog_exception" -DaemonAlive $false -RemoteState $_.Exception.Message
}
