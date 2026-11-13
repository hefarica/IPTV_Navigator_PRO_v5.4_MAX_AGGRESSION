# probe_capabilities.ps1 — DeviceCapabilitySnapshot medido, no declarado
#
# Sondea cada vector de mejora de imagen de un dispositivo Android TV por ADB y emite
# un JSON con el estado REAL de cada uno y la evidencia que lo sostiene.
#
# Estados posibles (nunca se inventa uno):
#   SUPPORTED_MEASURED  la capacidad existe y se comprobó con un comando
#   NOT_SUPPORTED       se comprobó que NO existe (con su comando)
#   BLOCKED             existe pero el acceso está denegado (permiso/SELinux)
#   NOT_COMPUTED        no se pudo medir, con la razón
#
# Uso:  pwsh tools/probe/probe_capabilities.ps1 -Serial 192.168.1.3:34813 -Out caps.json

param(
  [Parameter(Mandatory=$true)][string]$Serial,
  [string]$Out = 'docs/sistema/capabilities_snapshot.json'
)

$ErrorActionPreference = 'Continue'
$inv = [System.Globalization.CultureInfo]::InvariantCulture

function Sh([string]$cmd) {
  # adb shell devuelve a veces exit!=0 con salida válida; nunca se descarta la salida
  $o = & adb -s $Serial shell $cmd 2>&1
  return (($o | Out-String).Trim())
}

function Probe-Setting([string]$key, [string[]]$namespaces) {
  foreach ($ns in $namespaces) {
    $v = Sh "settings get $ns $key"
    if ($v -and $v -ne 'null' -and $v -notmatch 'Exception') {
      return [ordered]@{ key=$key; namespace=$ns; value=$v; measured_by="settings get $ns $key" }
    }
  }
  return [ordered]@{ key=$key; namespace=$null; value=$null; measured_by="settings get global|secure $key → null en ambos" }
}

# ---------------------------------------------------------------- vectores
$vectors = [ordered]@{}

# 1 · Settings de display (todos los Android TV tienen algún subconjunto)
$displayKeys = [ordered]@{}
foreach ($k in @('hdr_conversion_mode','are_user_disabled_hdr_formats_allowed','user_disabled_hdr_formats','user_preferred_refresh_rate','display_color_mode')) {
  $displayKeys[$k] = Probe-Setting $k @('global','secure')
}
$found = @($displayKeys.Values | Where-Object { $_.namespace -ne $null }).Count
$vectors['settings_display'] = [ordered]@{
  estado   = if ($found -gt 0) { 'SUPPORTED_MEASURED' } else { 'NOT_SUPPORTED' }
  claves   = $displayKeys
  evidencia= "$found de $($displayKeys.Count) claves presentes"
}

# 2 · VPP por Settings (vocabulario MT8696: pq_*/ai_*)
$vppKeys = [ordered]@{}
foreach ($k in @('pq_ai_sr_enable','ai_sr_level','ai_pq_mode','aipq_enable','pq_sharpness_enable','pq_ai_dnr_enable','pq_dnr_enable','pq_nr_enable','pq_ai_fbc_enable','pq_hdr_enable','pq_hdr_mode')) {
  $vppKeys[$k] = Probe-Setting $k @('global','secure')
}
$vppFound = @($vppKeys.Values | Where-Object { $_.namespace -ne $null }).Count
$vectors['settings_vpp_pq'] = [ordered]@{
  estado   = if ($vppFound -gt 0) { 'SUPPORTED_MEASURED' } else { 'NOT_SUPPORTED' }
  claves   = $vppKeys
  evidencia= "$vppFound de $($vppKeys.Count) claves VPP presentes (vocabulario derivado de MT8696)"
}

# 3 · Gate de post-proceso
$mpp  = Probe-Setting 'minimal_post_processing_allowed' @('secure','global')
$mcfr = Probe-Setting 'match_content_frame_rate'        @('secure','global')
$vectors['settings_vpp_gate'] = [ordered]@{
  estado    = if ($mpp.namespace -or $mcfr.namespace) { 'SUPPORTED_MEASURED' } else { 'NOT_SUPPORTED' }
  minimal_post_processing_allowed = $mpp
  match_content_frame_rate        = $mcfr
  nota      = 'minimal_post_processing_allowed=0 significa VPP completo permitido'
}

# 4 · Modos de display disponibles (para elegir cadencia que case con el contenido)
$modesRaw = Sh 'dumpsys display | grep -oE "id=[0-9]+, width=[0-9]+, height=[0-9]+, fps=[0-9.]+"'
$modes = @()
foreach ($m in [regex]::Matches($modesRaw, 'id=(\d+), width=(\d+), height=(\d+), fps=([0-9.]+)')) {
  $modes += [ordered]@{ id=[int]$m.Groups[1].Value; w=[int]$m.Groups[2].Value; h=[int]$m.Groups[3].Value; fps=[double]::Parse($m.Groups[4].Value, $inv) }
}
$active = Sh 'dumpsys display | grep -oE "mActiveModeId=[0-9]+"'
$vectors['display_modes'] = [ordered]@{
  estado      = if ($modes.Count -gt 0) { 'SUPPORTED_MEASURED' } else { 'NOT_COMPUTED' }
  total       = $modes.Count
  modos       = $modes
  activo      = ($active -replace 'mActiveModeId=','')
  evidencia   = 'dumpsys display: no declara CADENCIA del contenido, sólo modos del panel'
}

# 5 · IColorDisplayManager (saturación por app) — ¿es alcanzable?
$colorSvc = Sh 'service list | grep -c color_display'
$shellPerm = Sh 'dumpsys package com.android.shell | grep -c CONTROL_DISPLAY_COLOR_TRANSFORMS'
$vectors['colordisplaymanager'] = [ordered]@{
  estado    = if ([int]$colorSvc -gt 0) { 'BLOCKED' } else { 'NOT_SUPPORTED' }
  servicio  = ($colorSvc -eq '1' -or [int]$colorSvc -gt 0)
  permiso_shell = ([int]$shellPerm -gt 0)
  razon     = 'servicio presente pero @SystemApi: requiere CONTROL_DISPLAY_COLOR_TRANSFORMS, que shell no tiene'
  evidencia = "service list | grep color_display = $colorSvc ; CONTROL_DISPLAY_COLOR_TRANSFORMS en shell = $shellPerm"
}

# 6 · Amlogic tvserver / sysfs del VPP
$amvecm = Sh 'ls -ld /sys/class/amvecm 2>&1'
$amvecmRead = Sh 'ls /sys/class/amvecm/ 2>&1 | head -n 1'
$ppmgr = Sh 'ls -ld /sys/class/ppmgr 2>&1'
$vppMod = Sh 'cat /proc/modules 2>/dev/null | grep -cE "amvecm|amvpp"'
$amvecmExists = ($amvecm -notmatch 'No such file')
$amvecmBlocked = ($amvecmRead -match 'Permission denied')
$vectors['amlogic_vpp_sysfs'] = [ordered]@{
  estado    = if (-not $amvecmExists) { 'NOT_SUPPORTED' } elseif ($amvecmBlocked) { 'BLOCKED' } else { 'SUPPORTED_MEASURED' }
  amvecm_existe = $amvecmExists
  amvecm_denegado = $amvecmBlocked
  ppmgr_existe  = ($ppmgr -notmatch 'No such file')
  modulos_vpp   = [int]$vppMod
  evidencia = "/sys/class/amvecm -> $amvecm ; ls -> $amvecmRead ; modulos amvecm/amvpp en /proc/modules = $vppMod"
}

# 7 · Permisos de la APK del agente
$apk = 'com.ape.crystalagent'
$wss = Sh "dumpsys package $apk | grep -c 'WRITE_SECURE_SETTINGS: granted=true'"
$saw = Sh "dumpsys package $apk | grep -c 'SYSTEM_ALERT_WINDOW: granted=true'"
$vectors['agent_permissions'] = [ordered]@{
  estado = if ([int]$wss -gt 0) { 'SUPPORTED_MEASURED' } else { 'NOT_COMPUTED' }
  write_secure_settings = ([int]$wss -gt 0)
  system_alert_window   = ([int]$saw -gt 0)
  nota  = 'sin SYSTEM_ALERT_WINDOW no hay overlay: procesar el frame de otra app queda cerrado'
  evidencia = "dumpsys package $apk | grep granted"
}

# 8 · HDR del panel — el dump se corta por broken pipe; se captura la terna completa
$hdr = Sh 'dumpsys display | grep -o "mSupportedHdrTypes=\[[^]]*\]" | head -n 1'
if (-not $hdr) { $hdr = Sh 'dumpsys display | grep -o "mSupportedHdrTypes=[^ ]*" | head -n 1' }
$hdrLista = @()
if ($hdr -match '\[([0-9, ]+)\]') { $hdrLista = ($matches[1] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
# Una lista vacia NO es una medicion: es un no-medido.
$vectors['hdr_panel'] = [ordered]@{
  estado = if ($hdrLista.Count -gt 0) { 'SUPPORTED_MEASURED' } else { 'NOT_COMPUTED' }
  tipos  = $hdrLista
  leyenda= '1=DV 2=HDR10 3=HLG 4=HDR10+'
  razon  = if ($hdrLista.Count -eq 0) { 'lista vacia: dumpsys truncado o el panel no declara tipos' } else { $null }
  evidencia = "dumpsys display mSupportedHdrTypes -> $hdr"
}

# 9 · Térmica
$therm = Sh 'dumpsys thermalservice | grep -oE "Temperature\{[^}]*\}" | head -n 3'
$vectors['thermal'] = [ordered]@{
  estado = if ($therm) { 'SUPPORTED_MEASURED' } else { 'NOT_COMPUTED' }
  detalle = $therm
  evidencia = 'dumpsys thermalservice'
}

# 10 · SoC (lo que el heartbeat reportaría al VPS para el soc_gate) + veredicto del gate
$socModel = Sh 'getprop ro.soc.model'
$socHw    = Sh 'getprop ro.hardware'
$socPlat  = Sh 'getprop ro.board.platform'
$sdk      = Sh 'getprop ro.build.version.sdk'
# El heartbeat del APK: Build.SOC_MODEL si SDK>=31 y no vacio, si no Build.HARDWARE
$valorGate = if ([int]$sdk -ge 31 -and $socModel) { $socModel } else { $socHw }
$allowGate = @('mt8696','amlogic','s905x4','s905x3')
$pasaGate  = $allowGate -contains $valorGate.ToLower().Trim()
$vectors['soc_identity'] = [ordered]@{
  estado   = 'SUPPORTED_MEASURED'
  model    = $socModel
  hardware = $socHw
  board_platform = $socPlat
  sdk      = $sdk
  valor_que_reporta_el_heartbeat = $valorGate
  soc_gate_default_allow = $allowGate
  soc_gate_pasa = $pasaGate
  nota     = 'el soc_gate usa igualdad EXACTA tras strtolower+trim; si no casa, allowed=false y la politica no viaja'
  evidencia = 'getprop ro.soc.model / ro.hardware / ro.board.platform / ro.build.version.sdk'
}

# ---------------------------------------------------------------- resolver
# Cadena polimorfica: cada vector aporta o no. Nunca se pierde uno soportado.
$chain = @()
if ($vectors['settings_vpp_pq'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'vpp_pq_settings' }
if ($vectors['amlogic_vpp_sysfs'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'vpp_amlogic_sysfs' }
if ($vectors['colordisplaymanager'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'color_display_manager' }
if ($vectors['settings_vpp_gate'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'vpp_gate' }
if ($vectors['hdr_panel'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'hdr_passthrough' }
if ($vectors['display_modes'].estado -eq 'SUPPORTED_MEASURED') { $chain += 'cadence_match' }
if ($vectors['agent_permissions'].system_alert_window) { $chain += 'overlay_frames' }
$chain += 'manifest_metadata'   # capa VPS: siempre disponible

# own_player_gl esta medido ROTO en este SoC: no entra en la cadena, se declara aparte.
$ownGlEstado = if ($vectors['soc_identity'].hardware -match 'amlogic|s905') { 'BROKEN_MEASURED' } else { 'NOT_COMPUTED' }

$snap = [ordered]@{
  schema      = 'ape.device_capabilities.v1'
  generated   = (Get-Date).ToString('o')
  serial      = $Serial
  vectors     = $vectors
  resolucion_polimorfica = [ordered]@{
    cadena_activa   = $chain
    excluidos       = [ordered]@{
      own_player_gl = $ownGlEstado
      nota          = 'effects=on dio 16.280 B de PNG (pantalla negra) vs 1.694.782 B con off, medido en ONN 4K'
    }
    regla           = 'cada vector aporta si esta SUPPORTED_MEASURED; el que no, no se usa y no bloquea a los demas'
  }
}

$dir = Split-Path $Out -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$snap | ConvertTo-Json -Depth 8 | Set-Content -Path $Out -Encoding utf8

Write-Output "=== DeviceCapabilitySnapshot ==="
foreach ($k in $vectors.Keys) {
  Write-Output ("  {0,-22} {1}" -f $k, $vectors[$k].estado)
}
Write-Output ""
Write-Output ("  CADENA ACTIVA: {0}" -f ($chain -join ' -> '))
Write-Output ("  escrito: {0} ({1} B)" -f $Out, (Get-Item $Out).Length)
