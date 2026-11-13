<#
  check_display_state.ps1 — Verifica que el estado de pantalla del ONN no quedo sucio.

  POR QUE EXISTE
  ==============
  El 2026-11-13, probando la politica de composicion, deje puestas DOS claves que no
  estaban en el aparato del operador:
      display_size_forced   = 1920x1080   (de fabrica viene null)
      override de densidad  = 640         (de fabrica 320)
  El operador reporto: "cuando escojo 4K, la imagen queda grandisima".

  Esta herramienta existe para que eso no vuelva a pasar en silencio. Se corre ANTES y
  DESPUES de cualquier prueba de pantalla, y si algo esta fuera de baseline lo dice con
  el comando exacto para revertirlo.

  USO
  ===
    powershell -File tools/probe/check_display_state.ps1
    powershell -File tools/probe/check_display_state.ps1 -Serial 192.168.1.3:34813
    powershell -File tools/probe/check_display_state.ps1 -Fix     # revierte lo desviado

  SALIDA: cada linea es MEDIDO / ESPERADO / VEREDICTO. Exit 0 si todo limpio, 1 si hay
  desvio. No aplica nada salvo con -Fix, y con -Fix solo revierte las DOS claves de
  geometria y los overrides de wm; no toca nada mas.
#>

param(
    [string]$Serial = '192.168.1.3:34813',
    [switch]$Fix
)

$ErrorActionPreference = 'Continue'
$desvios = 0
$acciones = @()

function Get-Dev([string]$cmd) {
    $r = & adb -s $Serial shell $cmd 2>&1
    return (($r | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Check([string]$nombre, [string]$medido, [string]$esperado, [scriptblock]$ok) {
    $pasa = & $ok $medido
    # Write-Host, NO Write-Output: si se usa Write-Output, cualquier "| Out-Null" en el
    # punto de llamada se traga la linea y el check queda invisible. Pasaba con la mitad
    # de las comprobaciones antes de esta correccion.
    if ($pasa) {
        Write-Host ("  OK     {0,-26} medido='{1}'" -f $nombre, $medido)
    } else {
        Write-Host ("  DESVIO {0,-26} medido='{1}' esperado='{2}'" -f $nombre, $medido, $esperado)
        $script:desvios++
    }
    return $pasa
}

Write-Output ""
Write-Output "=== ESTADO DE PANTALLA — $Serial ==="
Write-Output ""

$conectado = (& adb -s $Serial get-state 2>&1) -join ''
if ($conectado -notmatch 'device') {
    Write-Output "  NO CONECTADO: adb no ve $Serial. Nada que verificar."
    exit 2
}

# ── 1 · wm size: el override debe ser el nativo o estar ausente ────────────────
$wmSize = Get-Dev 'wm size'
$fisico = if ($wmSize -match 'Physical size:\s*(\S+)') { $matches[1] } else { '?' }
$override = if ($wmSize -match 'Override size:\s*(\S+)') { $matches[1] } else { $null }

Write-Output "  -- wm size --"
Check 'Physical size' $fisico '3840x2160' { param($v) $v -eq '3840x2160' } | Out-Null
if ($override) {
    # Un override de composicion es aceptable SOLO si es <=1080p (tope del firmware) y
    # el operador lo sabe. Se reporta como advertencia, no como fallo, salvo que sea ilegal.
    $dim = $override -split 'x'
    $ancho = [int]($dim[0] -replace '\D','')
    $alto  = [int]($dim[1] -replace '\D','')
    if ($ancho -gt 1920 -or $alto -gt 1080) {
        Write-Output ("  DESVIO Override size          medido='{0}' excede el tope 1920x1080 del firmware" -f $override)
        $desvios++
        $acciones += 'wm size reset'
    } else {
        Write-Output ("  AVISO  Override size          medido='{0}' (dentro del tope; la composicion NO es nativa)" -f $override)
    }
} else {
    Write-Output "  OK     Override size          ausente (composicion nativa)"
}

# ── 2 · wm density: NUNCA debe haber override ─────────────────────────────────
Write-Output ""
Write-Output "  -- wm density --"
$wmDens = Get-Dev 'wm density'
$densFis = if ($wmDens -match 'Physical density:\s*(\d+)') { $matches[1] } else { '?' }
$densOvr = if ($wmDens -match 'Override density:\s*(\d+)') { $matches[1] } else { $null }

Check 'Physical density' $densFis '320' { param($v) $v -eq '320' } | Out-Null
if ($densOvr) {
    # ESTE es el que causo la imagen gigante. Un override de densidad es SIEMPRE sospechoso.
    Write-Output ("  DESVIO Override density       medido='{0}' — esto es lo que agranda la interfaz" -f $densOvr)
    $desvios++
    $acciones += 'wm density reset'
} else {
    Write-Output "  OK     Override density       ausente"
}

# ── 3 · Claves persistentes de geometria: deben estar AUSENTES ───────────────
Write-Output ""
Write-Output "  -- claves persistentes --"
$sizeForced = Get-Dev 'settings get global display_size_forced'
$densForced = Get-Dev 'settings get secure display_density_forced'

$sizeVacio = ($sizeForced -eq '' -or $sizeForced -eq 'null')
if (-not $sizeVacio) {
    Write-Output ("  DESVIO display_size_forced    medido='{0}' — sobrevive a reinicios" -f $sizeForced)
    $desvios++
    $acciones += 'settings delete global display_size_forced'
} else {
    Write-Output "  OK     display_size_forced    ausente"
}

$densVacio = ($densForced -eq '' -or $densForced -eq 'null')
if (-not $densVacio) {
    Write-Output ("  DESVIO display_density_forced medido='{0}'" -f $densForced)
    $desvios++
    $acciones += 'settings delete secure display_density_forced'
} else {
    Write-Output "  OK     display_density_forced ausente"
}

# ── 4 · Modo de display: el panel debe seguir en 4K ──────────────────────────
Write-Output ""
Write-Output "  -- salida HDMI --"
$modo = if ((Get-Dev 'dumpsys display | grep -oE "mActiveModeId=[0-9]+" | head -n 1') -match '=(\d+)') { $matches[1] } else { '?' }
Check 'mActiveModeId' $modo '123 (3840x2160@59.94)' { param($v) $v -eq '123' } | Out-Null

$pref = Get-Dev 'cmd display get-user-preferred-display-mode'
if ($pref -match 'null') {
    Write-Output "  OK     modo preferido         null (sin forzar; el panel elige)"
} else {
    Write-Output ("  AVISO  modo preferido         '{0}' — alguien forzo un modo de display" -f $pref)
}

# ── 5 · Estado HDR: passthrough es lo correcto ───────────────────────────────
Write-Output ""
Write-Output "  -- HDR y post-proceso --"
$hdr = Get-Dev 'settings get global hdr_conversion_mode'
Check 'hdr_conversion_mode' $hdr '1 (PASSTHROUGH)' { param($v) $v -eq '1' } | Out-Null
$mpp = Get-Dev 'settings get secure minimal_post_processing_allowed'
Check 'minimal_post_processing' $mpp '0 (VPP completo permitido)' { param($v) $v -eq '0' } | Out-Null

# ── Veredicto ────────────────────────────────────────────────────────────────
Write-Output ""
Write-Output "----------------------------------------"
if ($desvios -eq 0) {
    Write-Output "  LIMPIO: ningun desvio. El aparato esta en estado baseline."
    exit 0
}

Write-Output ("  {0} DESVIO(S) detectado(s)." -f $desvios)
Write-Output ""
Write-Output "  Para revertir, en este orden:"
foreach ($a in ($acciones | Select-Object -Unique)) {
    Write-Output ("    adb -s {0} shell '{1}'" -f $Serial, $a)
}

if ($Fix) {
    Write-Output ""
    Write-Output "  APLICANDO -Fix (solo las claves de geometria y los overrides de wm):"
    foreach ($a in ($acciones | Select-Object -Unique)) {
        & adb -s $Serial shell $a 2>&1 | Out-Null
        Write-Output ("    ejecutado: {0}" -f $a)
    }
    Write-Output "  Reejecuta sin -Fix para confirmar."
}

exit 1
