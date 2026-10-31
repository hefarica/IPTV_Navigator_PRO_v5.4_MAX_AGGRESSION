#!/usr/bin/env pwsh
<#
  X2 · constructor y probador del paquete de entrega ARA-X.

  - Copia `ara-x/**` a un staging EXCLUYENDO `evidence/`, `deliverables/` y el propio
    `reports/X2_final_report.md` (auto-referencial).
  - Genera `EVIDENCE_MANIFEST.json` (sha256+tamaño de las 10 capturas de evidence/, que
    NO se empaquetan por tamaño y por llevar el par cuenta/clave en el path).
  - Genera `MANIFEST_SHA256.txt` (sha256 + bytes por archivo del payload; el manifiesto
    no se lista a sí mismo).
  - Escanea secretos el staging con el scanner de V3 (debe dar 0 findings).
  - Crea el ZIP, lo prueba con Expand-Archive y verifica el árbol extraído con
    `VERIFY_PACKAGE.js` contra el manifiesto.
  - Deja en `ara-x/deliverables/`: ZIP, manifiesto, EVIDENCE_MANIFEST.json, MANIFEST.json,
    BUILD_SUMMARY.json, secret_scan_stage.json, verify_package_result.json.

  Uso:  pwsh -File ara-x/deliverables/build_package.ps1 [-Stamp 20261030_222000] [-KeepTemp]
  Exit: 0 si ZIP+manifiesto+verificación+secrets OK; !=0 en cualquier fallo.
#>
[CmdletBinding()]
param(
  [string]$Stamp = (Get-Date -Format 'yyyyMMdd_HHmmss'),
  [switch]$KeepTemp
)

$ErrorActionPreference = 'Stop'

function Write-Utf8([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$arax = Join-Path $repo 'ara-x'
$deliv = $PSScriptRoot
$stageRoot = Join-Path $env:TEMP "ara_x_x2_stage_$Stamp"
$stage = Join-Path $stageRoot 'ara-x'
$extract = Join-Path $env:TEMP "ara_x_x2_test_$Stamp"
$zipPath = Join-Path $deliv "ARA_X_DELIVERY_$Stamp.zip"
$excludedTop = @('evidence', 'deliverables')
# Fecha determinista derivada del stamp: mismo stamp ⇒ mismo payload/manifiesto/ZIP.
$generatedIso = "$($Stamp.Substring(0,4))-$($Stamp.Substring(4,2))-$($Stamp.Substring(6,2))T$($Stamp.Substring(9,2)):$($Stamp.Substring(11,2)):$($Stamp.Substring(13,2))"

Write-Host "[X2] repo=$repo"
Write-Host "[X2] staging=$stage"
if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# ── 1 · copiar payload (sin evidence/, deliverables/ ni el reporte auto-referencial) ──
$copied = 0
Get-ChildItem -Path $arax -Recurse -File | ForEach-Object {
  $rel = [IO.Path]::GetRelativePath($arax, $_.FullName).Replace('\', '/')
  $top = ($rel -split '/')[0]
  if ($excludedTop -contains $top) { return }
  if ($rel -eq 'reports/X2_final_report.md') { return }
  if ($rel -eq 'reports/DEPLOY_PENDING_SINCE_25OCT.md' -and -not (Test-Path $_.FullName)) { return }
  $dest = Join-Path $stage ($rel.Replace('/', '\'))
  $dir = Split-Path -Parent $dest
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
  $copied++
}
Write-Host "[X2] payload copiado: $copied archivos"

# Herramientas de verificación dentro del paquete
Copy-Item -LiteralPath (Join-Path $deliv 'VERIFY_PACKAGE.js') -Destination (Join-Path $stage 'VERIFY_PACKAGE.js') -Force
Copy-Item -LiteralPath (Join-Path $deliv 'PACKAGE_README.md') -Destination (Join-Path $stage 'PACKAGE_README.md') -Force

# ── 2 · EVIDENCE_MANIFEST.json (evidence/ NO se empaqueta; solo hashes) ──
$evFiles = @(Get-ChildItem -Path (Join-Path $arax 'evidence') -File | Sort-Object Name)
$evRows = @()
foreach ($f in $evFiles) {
  $evRows += [ordered]@{
    path   = 'ara-x/evidence/' + $f.Name
    bytes  = $f.Length
    sha256 = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$evManifest = [ordered]@{
  schema       = 'ara-x.x2.evidence/1'
  generated_at = $generatedIso
  note         = 'Capturas crudas y salidas ARA-X de las listas A/B. NO se empaquetan (4,7 GB y el par cuenta/clave del path, V3-F-01). Se entrega size+sha256; reproducibles/verificables con los scripts de V2/R1.'
  files        = $evRows
  total_bytes  = [long](($evFiles | Measure-Object -Property Length -Sum).Sum)
}
$evPath = Join-Path $stage 'EVIDENCE_MANIFEST.json'
Write-Utf8 $evPath (($evManifest | ConvertTo-Json -Depth 6) + "`n")

# ── 3 · MANIFEST_SHA256.txt (payload; el manifiesto no se lista a sí mismo) ──
$manifestStagePath = Join-Path $stage 'MANIFEST_SHA256.txt'
$files = @(Get-ChildItem -Path $stage -Recurse -File | Sort-Object FullName)
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# ARA-X delivery manifest (X2) — formato: sha256  bytes  path')
$lines.Add('# Paths relativos a la raíz del paquete (contiene ara-x/). El manifiesto no se lista a sí mismo.')
$payloadBytes = [long]0
$entries = 0
foreach ($f in $files) {
  if ($f.FullName -eq $manifestStagePath) { continue }
  $rel = 'ara-x/' + [IO.Path]::GetRelativePath($stage, $f.FullName).Replace('\', '/')
  $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $lines.Add("$h  $($f.Length)  $rel")
  $payloadBytes += $f.Length
  $entries++
}
Write-Utf8 $manifestStagePath (($lines -join "`n") + "`n")
Write-Host "[X2] manifiesto: $entries archivos, $payloadBytes bytes"

# ── 4 · escaneo de secretos del staging (V3 scanner) ──
$scanner = Join-Path $arax 'scripts\security\scan_secrets.js'
$scanOut = (& node $scanner --root $stage --json 2>&1 | Out-String).Trim()
$scanCode = $LASTEXITCODE
Write-Utf8 (Join-Path $deliv 'secret_scan_stage.json') ($scanOut + "`n")
if ($scanCode -ne 0) { throw "secret scan del staging FALLÓ (exit $scanCode): $scanOut" }
Write-Host "[X2] secret scan staging: exit 0"

# ── 5 · ZIP + prueba real (Expand-Archive) + verificación de manifiesto ──
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Push-Location $stageRoot
try {
  Compress-Archive -Path 'ara-x' -DestinationPath $zipPath -CompressionLevel Optimal -Force
} finally {
  Pop-Location
}
$zipBytes = (Get-Item -LiteralPath $zipPath).Length
$zipSha = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "[X2] zip: $zipPath ($zipBytes B) sha256=$zipSha"

if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extract -Force
$verifyOut = (& node (Join-Path $extract 'ara-x\VERIFY_PACKAGE.js') --manifest (Join-Path $extract 'ara-x\MANIFEST_SHA256.txt') --root $extract 2>&1 | Out-String).Trim()
$verifyCode = $LASTEXITCODE
Write-Utf8 (Join-Path $deliv 'verify_package_result.json') ($verifyOut + "`n")
if ($verifyCode -ne 0) { throw "VERIFY_PACKAGE FALLÓ (exit $verifyCode): $verifyOut" }
$verifyJson = $null
try { $verifyJson = $verifyOut | ConvertFrom-Json } catch { }
$tarEntries = @(& tar -tf $zipPath).Count
Write-Host "[X2] Expand-Archive OK · VERIFY_PACKAGE OK · tar entries=$tarEntries"

# ── 6 · hashes de entradas clave (evidencia enlazada) ──
$keyInputs = @(
  'ara-x/spec/ARA_X_MASTER_CONTRACT.md',
  'ara-x/spec/ara_x_directives.json',
  'ara-x/spec/4k8k_matrix.json',
  'ara-x/spec/actuator_allowlist.json',
  'ara-x/reports/R1_list_forensics.md',
  'ara-x/reports/R1_findings.json',
  'ara-x/reports/R2_codec_truth.md',
  'ara-x/reports/R3_vps_sync_reality.md',
  'ara-x/reports/R4_telemetry_matrix.md',
  'ara-x/reports/R5_actuators.md',
  'ara-x/reports/R5_policy_catalog.md',
  'ara-x/reports/R6_security.md',
  'ara-x/reports/D3_sync_contract.md',
  'ara-x/reports/T0_ownership_registration.md',
  'ara-x/reports/V0_baseline_verification.md',
  'ara-x/reports/V1_validation.log',
  'ara-x/reports/V2_e2e_report.md',
  'ara-x/reports/V2_e2e.json',
  'ara-x/reports/V3_security.md',
  'ara-x/reports/V3_repair_r2.md',
  'ara-x/reports/V3_repair_t26.md',
  'ara-x/reports/V3_repair_t26_final.md',
  'ara-x/reports/DEPLOY_PENDING_SINCE_25OCT.md',
  'ara-x/integration/baseline.json'
)
$inputs = @()
foreach ($rel in $keyInputs) {
  $full = Join-Path $repo ($rel.Replace('/', '\'))
  if (-not (Test-Path $full)) { throw "entrada clave ausente: $rel" }
  $inputs += [ordered]@{
    path   = $rel
    bytes  = (Get-Item -LiteralPath $full).Length
    sha256 = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$manifestBytes = (Get-Item -LiteralPath $manifestStagePath).Length
$manifestSha = (Get-FileHash -LiteralPath $manifestStagePath -Algorithm SHA256).Hash.ToLowerInvariant()
$evBytes = (Get-Item -LiteralPath $evPath).Length
$evSha = (Get-FileHash -LiteralPath $evPath -Algorithm SHA256).Hash.ToLowerInvariant()
$scanJson = $null
try { $scanJson = $scanOut | ConvertFrom-Json } catch { $scanJson = $scanOut }

# Copias junto al ZIP
Copy-Item -LiteralPath $manifestStagePath -Destination (Join-Path $deliv 'MANIFEST_SHA256.txt') -Force
Copy-Item -LiteralPath $evPath -Destination (Join-Path $deliv 'EVIDENCE_MANIFEST.json') -Force

# ── 7 · MANIFEST.json + BUILD_SUMMARY.json ──
$head = (& git -C $repo rev-parse --short HEAD).Trim()
$branch = (& git -C $repo branch --show-current).Trim()
$origin = (& git -C $repo rev-parse --short "origin/$branch" 2>$null).Trim()
$manifestJson = [ordered]@{
  schema        = 'ara-x.x2.package/1'
  stamp         = $Stamp
  generated_at  = $generatedIso
  git           = [ordered]@{ head = $head; branch = $branch; origin_head = $origin; staged = 0 }
  zip           = [ordered]@{ file = (Split-Path -Leaf $zipPath); bytes = $zipBytes; sha256 = $zipSha }
  manifest      = [ordered]@{
    file         = 'MANIFEST_SHA256.txt'
    bytes        = $manifestBytes
    sha256       = $manifestSha
    entries      = $entries
    payload_bytes = $payloadBytes
    excludes_self = $true
  }
  evidence_manifest = [ordered]@{
    file        = 'EVIDENCE_MANIFEST.json'
    bytes       = $evBytes
    sha256      = $evSha
    files       = $evFiles.Count
    total_bytes = $evManifest.total_bytes
  }
  exclusions = @(
    'ara-x/evidence/** — 10 archivos, 4.715.998.572 B; capturas con par cuenta/clave en el path (V3-F-01). Solo hashes en EVIDENCE_MANIFEST.json.',
    'ara-x/deliverables/** — directorio del propio paquete (ZIP/manifiestos).',
    'ara-x/reports/X2_final_report.md — cita el sha256 del ZIP (auto-referencia); se entrega al lado.'
  )
  verification = [ordered]@{
    expand_archive   = 'OK'
    verify_package   = if ($verifyJson) { $verifyJson } else { $verifyOut }
    verify_exit      = $verifyCode
    tar_entries      = $tarEntries
  }
  secret_scan = [ordered]@{
    exit   = $scanCode
    output = $scanJson
  }
  key_inputs = $inputs
}
Write-Utf8 (Join-Path $deliv 'MANIFEST.json') (($manifestJson | ConvertTo-Json -Depth 10) + "`n")

$summary = [ordered]@{
  ok = $true
  stamp = $Stamp
  zip = $manifestJson.zip
  manifest = $manifestJson.manifest
  evidence_manifest = $manifestJson.evidence_manifest
  verification = $manifestJson.verification
  secret_scan_exit = $scanCode
  key_inputs = $inputs
}
Write-Utf8 (Join-Path $deliv 'BUILD_SUMMARY.json') (($summary | ConvertTo-Json -Depth 8) + "`n")

if (-not $KeepTemp) {
  Remove-Item -Path $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $extract -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[X2] OK · zip=$zipPath · sha256=$zipSha"
Write-Output (($summary | ConvertTo-Json -Depth 5) + "`n")
exit 0
