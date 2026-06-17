<#
================================================================================
 host-qoe-watchdog.ps1 — WATCHDOG host-LAN del agente QoE on-device
--------------------------------------------------------------------------------
 Corre en la PC/Pi de la LAN (NO en el VPS: el VPS no alcanza el device por NAT).
 Modelado 1:1 sobre APE_UHDX_Watchdog_Unified.ps1 (patron ya probado en el repo):
   (a) keep-alive `adb connect` 1Hz (mantiene viva la sesion)
   (b) re-bootstrap del agente on-device tras REBOOT (detecta por uptime)
   (c) Ensure-AgentAlive (re-lanza el agente si su lockfile/pid murio)
 NO toca el plano de datos: el agente on-device transmite QoE SOLO (egress).
 Si el watchdog o la LAN caen, el agente sigue POSTeando (degradacion graceful).

 Limite honesto (modelo de seguridad de Android, no del diseno): en estado
 TOTALMENTE FRIO (agente muerto + 5555 cerrado + ninguna sesion ADB viva) hace
 falta 1 toque USB / re-activar Depuracion ADB en el device. El watchdog lo
 DETECTA y ALERTA en vez de loopear ciego.

 Uso:   .\host-qoe-watchdog.ps1 -DeviceIp 192.168.1.2
 Persistencia: registrar como Scheduled Task (trigger at-logon + restart-on-fail).
================================================================================
#>
param(
  [string]$DeviceIp    = "192.168.1.2",
  [int]   $Port        = 5555,
  [string]$Adb         = "adb",
  [string]$AgentLocal  = "$PSScriptRoot\ape-qoe-agent.sh",
  [string]$AgentRemote = "/data/local/tmp/ape-qoe-agent.sh",
  [string]$CurlLocal   = "$PSScriptRoot\curl",
  [string]$CurlRemote  = "/data/local/tmp/curl"
)
$Target = "{0}:{1}" -f $DeviceIp, $Port
$LastUptime = [double]::MaxValue
$ColdSince = $null

function Adb-State { (& $Adb -s $Target get-state 2>$null) }
function Device-Reachable { Test-Connection -ComputerName $DeviceIp -Count 1 -Quiet -ErrorAction SilentlyContinue }

function Bootstrap-Agent {
  Write-Host "[watchdog] $(Get-Date -Format HH:mm:ss) re-bootstrapping agente QoE on-device..."
  if (Test-Path $CurlLocal) {
    & $Adb -s $Target push $CurlLocal $CurlRemote 2>$null | Out-Null
    & $Adb -s $Target shell "chmod 755 $CurlRemote" 2>$null | Out-Null
  }
  & $Adb -s $Target push $AgentLocal $AgentRemote 2>$null | Out-Null
  & $Adb -s $Target shell "chmod 755 $AgentRemote" 2>$null | Out-Null
  # idempotente: el lockfile del agente evita duplicados, se puede disparar agresivo
  & $Adb -s $Target shell "nohup sh $AgentRemote daemon >/dev/null 2>&1 &" 2>$null | Out-Null
}

function Ensure-AgentAlive {
  $up = (& $Adb -s $Target shell "test -f /data/local/tmp/ape-qoe-agent.lock && kill -0 `$(cat /data/local/tmp/ape-qoe-agent.lock) 2>/dev/null && echo UP || echo DOWN" 2>$null)
  if ($up -notmatch "UP") { Bootstrap-Agent }
}

Write-Host "[watchdog] arrancando keep-alive 1Hz para $Target (agente=$AgentLocal)"
while ($true) {
  $state = Adb-State
  if ($state -ne "device") {
    if (Device-Reachable) {
      & $Adb connect $Target 2>$null | Out-Null
      Start-Sleep -Milliseconds 400
      $state = Adb-State
      if ($state -ne "device") {
        if (-not $ColdSince) { $ColdSince = Get-Date }
        $mins = [math]::Round(((Get-Date) - $ColdSince).TotalMinutes, 1)
        Write-Host "[watchdog] $(Get-Date -Format HH:mm:ss) device pingable pero 5555 REFUSED (${mins}min). Esperando self-heal on-device. Si >2min: activa Depuracion ADB en el Fire TV (1 toque, limite Android)."
      }
    } else {
      Write-Host "[watchdog] $(Get-Date -Format HH:mm:ss) device offline (sleep/reboot/red). Reintento 1Hz."
    }
  }
  if ($state -eq "device") {
    $ColdSince = $null
    $up = ((& $Adb -s $Target shell "cat /proc/uptime 2>/dev/null" 2>$null) -split '\s+' | Select-Object -First 1)
    $upNum = 0.0; [double]::TryParse($up, [ref]$upNum) | Out-Null
    if ($upNum -gt 0 -and $upNum -lt $LastUptime) {
      Write-Host "[watchdog] $(Get-Date -Format HH:mm:ss) REBOOT detectado (uptime=$upNum s). Re-bootstrap."
      Bootstrap-Agent
    }
    if ($upNum -gt 0) { $LastUptime = $upNum }
    Ensure-AgentAlive
  }
  Start-Sleep -Seconds 1
}
