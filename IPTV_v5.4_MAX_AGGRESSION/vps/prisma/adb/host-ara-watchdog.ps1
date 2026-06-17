# ════════════════════════════════════════════════════════════════════════════
# host-ara-watchdog.ps1 — Mantiene vivo el ARA on-device a traves de reboots.
# Corre en el HOST LAN (PC con adb + ssh al VPS). NO en el VPS (NAT).
# Descubre el device (IPs conocidas + mDNS), lo despierta, y si el agente cayo
# (post-reboot) re-bootstrapea: push curl_arm32 + agente (LF) + launcher 0700 con
# token (fetch del VPS, NO almacenado) + CURL_EXTRA (bind wlan0 + --resolve) + start.
# Idempotente: si el agente vive, no hace nada. Token hygiene: borra el launcher local.
# Persistencia: registrar como Scheduled Task at-logon (ver el bloque -Install).
# Uso:   powershell -ExecutionPolicy Bypass -File host-ara-watchdog.ps1
#        powershell -ExecutionPolicy Bypass -File host-ara-watchdog.ps1 -Install
# ════════════════════════════════════════════════════════════════════════════
param(
  [string]$Endpoint   = "https://iptv-ape.duckdns.org",
  [string]$VpsHost    = "iptv-ape.duckdns.org",
  [string]$VpsSsh     = "",                                    # vacio -> derivado del VpsIp resuelto por DNS
  [string]$DeviceConf = "$env:USERPROFILE\.ape\devices.conf", # fuera del repo, nunca commiteado
  [int]$IntervalSec   = 20,
  [switch]$Install
)
$ErrorActionPreference = "SilentlyContinue"

# VpsIp resuelto por DNS (no hardcodeado); fallback a la ultima IP buena si el DNS cae.
$VpsIp = try { ([System.Net.Dns]::GetHostAddresses($VpsHost) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString } catch { $null }
if (-not $VpsIp)  { $VpsIp  = "178.156.147.234" }   # last-known-good (DNS down)
if (-not $VpsSsh) { $VpsSsh = "root@$VpsIp" }

$Repo   = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION"
$Agent  = "$Repo\vps\prisma\adb\ape-qoe-agent.sh"
$CurlBin= "$Repo\backend\curl_arm32"
$Stage  = "C:\tmp\ara_stage"
$LogF   = "C:\tmp\host-ara-watchdog.log"
# Seed de IPs del device desde config externa (fuera del repo); mDNS (Discover) sigue siendo el descubridor dinamico.
$Known  = @()
if (Test-Path $DeviceConf) {
  $Known = @(Get-Content $DeviceConf | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}:\d+$' })
}

function Log($m){ $line="[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Add-Content -Path $LogF -Value $line }

if ($Install) {
  $self = $MyInvocation.MyCommand.Path
  $action = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$self`""
  schtasks /Create /TN "APE-ARA-Watchdog" /TR $action /SC ONLOGON /RL LIMITED /F | Out-Null
  schtasks /Run /TN "APE-ARA-Watchdog" | Out-Null
  Log "Installed + started Scheduled Task APE-ARA-Watchdog (at-logon)"
  "Scheduled Task APE-ARA-Watchdog instalada y arrancada. Log: $LogF"
  return
}

function Discover {
  foreach ($d in $Known) { adb connect $d *>$null; if ((adb -s $d get-state 2>$null) -eq "device") { return $d } }
  $m = adb mdns services 2>$null | Select-String "_adb-tls-connect" | ForEach-Object { ($_ -split '\s+')[0] } | Select-Object -First 1
  if ($m) { adb connect $m *>$null; if ((adb -s $m get-state 2>$null) -eq "device") { return $m } }
  return $null
}

function AgentAlive($d) {
  # Lockfile + kill -0 (evita el falso positivo de pgrep -f matcheando la propia shell del adb)
  $r = adb -s $d shell 'p=$(cat /data/local/tmp/ape-qoe-agent.lock 2>/dev/null); if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo ALIVE; else echo DEAD; fi'
  return [bool]($r -match 'ALIVE')
}

function Bootstrap($d) {
  $tok = (ssh -o ConnectTimeout=12 -o BatchMode=yes $VpsSsh "cat /root/ara_token.txt").Trim()
  if (-not $tok) { Log "bootstrap aborted: no token from VPS"; return }
  New-Item -ItemType Directory -Force $Stage | Out-Null
  [IO.File]::WriteAllText("$Stage\ape-qoe-agent.sh", ([IO.File]::ReadAllText($Agent) -replace "`r",""))
  $L = "#!/system/bin/sh`n" +
       "export ARA_ENDPOINT=$Endpoint`n" +
       "export ARA_TOKEN=$tok`n" +
       "export CONVIVA_EP=$Endpoint/prisma/api/conviva-event`n" +
       "export DEVICE_ID=firetv-karat`n" +
       "export CURL_EXTRA=`"--interface wlan0 --resolve iptv-ape.duckdns.org:443:$VpsIp`"`n" +
       "exec /data/local/tmp/ape-qoe-agent.sh daemon`n"
  [IO.File]::WriteAllText("$Stage\ara-run.sh", ($L -replace "`r",""))
  adb -s $d shell "mkdir -p /data/local/tmp/ape_ara_state" *>$null
  if ((adb -s $d shell "test -x /data/local/tmp/curl && echo y") -notmatch "y") {
    adb -s $d push $CurlBin /data/local/tmp/curl *>$null; adb -s $d shell "chmod 755 /data/local/tmp/curl" *>$null
  }
  adb -s $d push "$Stage\ape-qoe-agent.sh" /data/local/tmp/ape-qoe-agent.sh *>$null
  adb -s $d push "$Stage\ara-run.sh" /data/local/tmp/ara-run.sh *>$null
  adb -s $d shell "chmod 755 /data/local/tmp/ape-qoe-agent.sh; chmod 700 /data/local/tmp/ara-run.sh; rm -f /data/local/tmp/ape-qoe-agent.lock; nohup /data/local/tmp/ara-run.sh >/data/local/tmp/ape_ara_state/ara.log 2>&1 &" *>$null
  Remove-Item "$Stage\ara-run.sh" -Force *>$null
  Log "bootstrapped ARA on $d"
}

Log "host-ara-watchdog START (interval=${IntervalSec}s)"
while ($true) {
  $d = Discover
  if ($d) {
    adb -s $d shell "input keyevent KEYCODE_WAKEUP" *>$null
    if (-not (AgentAlive $d)) { Log "ARA down on $d -> re-bootstrap"; Bootstrap $d }
  } else { Log "device not found (mDNS/known IPs)" }
  Start-Sleep -Seconds $IntervalSec
}
