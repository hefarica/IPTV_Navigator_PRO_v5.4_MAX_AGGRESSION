<#
  run_checks.ps1 — HARNESS EJECUTABLE REAL (tarea t9 / i1)
  Equipo Enterprise 10 ADN · snapshot `git HEAD e38a89b`

  Qué hace: ejecuta 21 chequeos reales sobre el repo, registra el exit code REAL de cada
  comando y escribe HARNESS.json + totales por stdout. No declara PASS nada que no haya
  ejecutado: si la herramienta no existe, el chequeo es NOT_RUN con causa.

  Salida:  exit 0  = ningún FAIL
           exit 1  = al menos un FAIL
           exit 2  = el harness no pudo ejecutarse (error propio)

  PROHIBIDO por contrato y respetado aquí:
    · imprimir valores de secretos (los barridos emiten SOLO tipo + archivo:línea + conteo)
    · modificar el worktree, el índice o los backups de otra sesión
    · tocar el VPS o desplegar

  Uso:
    pwsh -File run_checks.ps1
    pwsh -File run_checks.ps1 -Root C:\ruta\repo -OutFile .\HARNESS.json
#>
#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$Root,
    [string]$SnapshotDir,
    [string]$OutFile,
    [string]$ExpectedHead = 'e38a89bb30c02cb41050f34cef43d3711a2b0644'
)

$ErrorActionPreference = 'Continue'
if (-not $PSScriptRoot) { Write-Error 'PSScriptRoot no disponible'; exit 2 }

# ── Resolución de la raíz del repo ───────────────────────────────────────────
# El harness vive en <repo>/audit/equipo10_operativo_2026-10-26/verificacion/.
# Subir un número fijo de niveles es frágil (un error de conteo hizo que la primera
# ejecución midiera <repo>/audit y devolviera PASS vacíos). Ahora se camina hacia
# arriba hasta el directorio que contiene .git y AGENTS.md; si no se encuentra, el
# harness ABORTA con exit 2 en vez de medir el árbol equivocado.
if (-not $Root) {
    $probe = $PSScriptRoot
    for ($i = 0; $i -lt 8; $i++) {
        if ((Test-Path (Join-Path $probe '.git')) -and (Test-Path (Join-Path $probe 'AGENTS.md'))) { $Root = $probe; break }
        $parent = Split-Path $probe -Parent
        if (-not $parent -or $parent -eq $probe) { break }
        $probe = $parent
    }
}
if (-not $Root -or -not (Test-Path (Join-Path $Root '.git')) -or -not (Test-Path (Join-Path $Root 'AGENTS.md'))) {
    Write-Error ("HARNESS ERROR: no se pudo resolver la raíz del repo (probado desde {0}). Se aborta para no medir el árbol equivocado." -f $PSScriptRoot)
    exit 2
}
Write-Host ('[harness] root = ' + $Root)
if (-not $SnapshotDir) { $SnapshotDir = Join-Path $Root 'audit/equipo10_operativo_2026-10-26/snapshot' }
if (-not $OutFile)     { $OutFile     = Join-Path $PSScriptRoot 'HARNESS.json' }
if (-not (Test-Path $SnapshotDir)) { Write-Error ('HARNESS ERROR: falta el directorio de snapshot: ' + $SnapshotDir); exit 2 }

Push-Location $Root
$script:rows = [System.Collections.Generic.List[object]]::new()
$script:startedAt = (Get-Date).ToString('o')

function Add-Row {
    param(
        [string]$CheckId,
        [string]$Comando,
        [int]$ExitCode,
        [ValidateSet('PASS', 'FAIL', 'NOT_RUN')][string]$Status,
        [string]$EvidenciaTail = ''
    )
    $tail = $EvidenciaTail -replace "`r?`n", ' ¶ '
    if ($tail.Length -gt 700) { $tail = $tail.Substring(0, 700) + ' …' }
    $script:rows.Add([pscustomobject]@{
            check_id       = $CheckId
            comando        = $Comando
            exit_code      = $ExitCode
            status         = $Status
            evidencia_tail = $tail
        })
    Write-Host ('[{0,-7}] {1,-28} exit={2}' -f $Status, $CheckId, $ExitCode)
}

# Devuelve SOLO "archivo:línea" de cada match. El contenido de la línea nunca se propaga:
# así el barrido de secretos no puede filtrar un valor ni por accidente.
function Get-GrepSites {
    param([string]$Pattern, [string[]]$Paths)
    $raw = & git grep -n -I -E -- $Pattern -- @Paths 2>$null
    $sites = @()
    foreach ($line in @($raw)) {
        if ($line -match '^(?<f>[^:]+):(?<l>\d+):') { $sites += ('{0}:{1}' -f $Matches.f, $Matches.l) }
    }
    return , $sites
}

function Get-GitGrepCount {
    param([string]$Pattern, [string[]]$Paths)
    $sites = Get-GrepSites -Pattern $Pattern -Paths $Paths
    return $sites.Count
}

# La lista de los 6 headers prohibidos por CLAUDE.md ("Headers PROHIBIDOS (causan EOF/304/403)").
$ToxicSix = 'Range|If-None-Match|If-Modified-Since|TE|Priority|Upgrade-Insecure-Requests'

try {
    # ─────────────────────────────────────────────────────────────────────
    # C01 · node disponible
    # ─────────────────────────────────────────────────────────────────────
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Add-Row -CheckId 'C01_node_version' -Comando 'node -v' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'node no está en PATH'
    }
    else {
        $v = (& node -v 2>&1) -join ' '
        Add-Row -CheckId 'C01_node_version' -Comando 'node -v' -ExitCode $LASTEXITCODE -Status $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $v
    }

    # ─────────────────────────────────────────────────────────────────────
    # C02 · python disponible
    # ─────────────────────────────────────────────────────────────────────
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pyCmd) {
        Add-Row -CheckId 'C02_python_version' -Comando 'python -V' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'python no está en PATH'
    }
    else {
        $v = (& python -V 2>&1) -join ' '
        Add-Row -CheckId 'C02_python_version' -Comando 'python -V' -ExitCode $LASTEXITCODE -Status $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $v
    }

    # ─────────────────────────────────────────────────────────────────────
    # C03 · nginx (no hay nginx local: NOT_RUN con causa, nunca PASS)
    # ─────────────────────────────────────────────────────────────────────
    $ngxCmd = Get-Command nginx -ErrorAction SilentlyContinue
    if (-not $ngxCmd) {
        Add-Row -CheckId 'C03_nginx_version' -Comando 'nginx -v' -ExitCode -1 -Status 'NOT_RUN' `
            -EvidenciaTail 'nginx ausente de PATH en el host de auditoría (Windows). No hay nginx local ni WSL con nginx: `nginx -t` sobre el SSOT del VPS es NO EJECUTABLE aquí, y ejecutarlo en el VPS está prohibido (iptv-vps-touch-nothing).'
    }
    else {
        $v = (& nginx -v 2>&1) -join ' '
        Add-Row -CheckId 'C03_nginx_version' -Comando 'nginx -v' -ExitCode $LASTEXITCODE -Status $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $v
    }

    # ─────────────────────────────────────────────────────────────────────
    # C04 · git HEAD == snapshot declarado
    # ─────────────────────────────────────────────────────────────────────
    $head = (& git rev-parse HEAD 2>&1) -join ''
    $headOk = ($head.Trim() -eq $ExpectedHead)
    Add-Row -CheckId 'C04_git_head' -Comando 'git rev-parse HEAD' -ExitCode $LASTEXITCODE `
        -Status $(if ($headOk) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ("HEAD={0} esperado={1}" -f $head.Trim(), $ExpectedHead)

    # ─────────────────────────────────────────────────────────────────────
    # C05 · git status: solo conteos (el WT está siendo mutado por otra sesión)
    # ─────────────────────────────────────────────────────────────────────
    $st = & git status --porcelain 2>&1
    $stAll = @($st)
    $nM = @($stAll | Where-Object { $_ -match '^ ?M ' }).Count
    $nD = @($stAll | Where-Object { $_ -match '^ ?D ' }).Count
    $nU = @($stAll | Where-Object { $_ -match '^\?\?' }).Count
    Add-Row -CheckId 'C05_git_status_counts' -Comando 'git status --porcelain' -ExitCode $LASTEXITCODE -Status 'PASS' `
        -EvidenciaTail ("total={0} modified={1} deleted={2} untracked={3}" -f $stAll.Count, $nM, $nD, $nU)

    # ─────────────────────────────────────────────────────────────────────
    # C06 · node -c sobre CADA .js del generador (frontend/js/ape-v9/*.js)
    # ─────────────────────────────────────────────────────────────────────
    $genDir = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9'
    $jsFiles = @(Get-ChildItem -File (Join-Path $genDir '*.js') -ErrorAction SilentlyContinue | Sort-Object Name)
    if (-not $nodeCmd) {
        Add-Row -CheckId 'C06_node_check_generator' -Comando 'node -c <cada .js de frontend/js/ape-v9/>' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'node ausente'
    }
    elseif ($jsFiles.Count -eq 0) {
        Add-Row -CheckId 'C06_node_check_generator' -Comando 'node -c <cada .js de frontend/js/ape-v9/>' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail ('no hay .js en ' + $genDir)
    }
    else {
        $fails = @()
        $checked = 0
        foreach ($f in $jsFiles) {
            $checked++
            $err = (& node -c $f.FullName 2>&1) -join ' | '
            if ($LASTEXITCODE -ne 0) { $fails += ('{0} -> {1}' -f $f.Name, ($err -replace '\s+', ' ')) }
        }
        $tail = 'archivos=' + $checked + ' ok=' + ($checked - $fails.Count) + ' fallos=' + $fails.Count
        if ($fails.Count -gt 0) { $tail += ' :: ' + (($fails | Select-Object -First 5) -join ' ;; ') }
        Add-Row -CheckId 'C06_node_check_generator' -Comando ('node -c <{0} archivos {1}/*.js>' -f $jsFiles.Count, $genDir) `
            -ExitCode $(if ($fails.Count -eq 0) { 0 } else { 1 }) `
            -Status $(if ($fails.Count -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $tail
    }

    # ─────────────────────────────────────────────────────────────────────
    # C07 · .agents/skills_index.json parsea como JSON (JSON.parse real)
    # ─────────────────────────────────────────────────────────────────────
    $idxRaw = & node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(".agents/skills_index.json","utf8"));process.stdout.write(JSON.stringify({n:(j.skills||[]).length,names:(j.skills||[]).map(s=>s.name)}))' 2>&1
    $idxExit = $LASTEXITCODE
    $idx = $null
    if ($idxExit -eq 0) { try { $idx = ($idxRaw -join '') | ConvertFrom-Json } catch { $idx = $null } }
    if ($idxExit -ne 0 -or -not $idx) {
        Add-Row -CheckId 'C07_skills_index_json' -Comando 'node -e "JSON.parse(.agents/skills_index.json)"' -ExitCode $(if ($idxExit) { $idxExit } else { 1 }) -Status 'FAIL' `
            -EvidenciaTail (('el índice NO parsea: ' + (($idxRaw -join ' ') -replace '\s+', ' ')))
    }
    else {
        Add-Row -CheckId 'C07_skills_index_json' -Comando 'node -e "JSON.parse(.agents/skills_index.json)"' -ExitCode 0 -Status 'PASS' `
            -EvidenciaTail ('JSON válido · entradas=' + $idx.n)
    }

    # ─────────────────────────────────────────────────────────────────────
    # C08 · índice (N entradas) vs disco (.agents/skills/*/)
    # ─────────────────────────────────────────────────────────────────────
    if ($idx) {
        $diskNames = @(Get-ChildItem -Directory '.agents/skills' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
        $idxNames = @($idx.names)
        $missing = @($idxNames | Where-Object { $diskNames -notcontains $_ })
        $extra = @($diskNames | Where-Object { $idxNames -notcontains $_ })
        $ok = ($missing.Count -eq 0 -and $extra.Count -eq 0)
        $tail = ('indice={0} disco={1} faltan_en_disco={2} sobran_en_disco={3}' -f $idxNames.Count, $diskNames.Count, $missing.Count, $extra.Count)
        if ($missing.Count) { $tail += ' :: solo_en_indice=' + (($missing | Select-Object -First 8) -join ',') }
        if ($extra.Count) { $tail += ' :: solo_en_disco=' + (($extra | Select-Object -First 8) -join ',') }
        Add-Row -CheckId 'C08_skills_index_vs_disk' -Comando 'compare .agents/skills_index.json vs Get-ChildItem .agents/skills -Directory' `
            -ExitCode $(if ($ok) { 0 } else { 1 }) -Status $(if ($ok) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $tail
    }
    else {
        Add-Row -CheckId 'C08_skills_index_vs_disk' -Comando 'compare índice vs disco' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'depende de C07 (índice ilegible)'
    }

    # ─────────────────────────────────────────────────────────────────────
    # C09/C10 · .claude/agents y .claude/commands vs doctrina (AGENTS.md: 10 y 7)
    # ─────────────────────────────────────────────────────────────────────
    $agents = @(Get-ChildItem -File '.claude/agents/*.md' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    $cmds = @(Get-ChildItem -File '.claude/commands/*.md' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
    Add-Row -CheckId 'C09_claude_agents_count' -Comando 'Get-ChildItem .claude/agents/*.md' `
        -ExitCode $(if ($agents.Count -eq 10) { 0 } else { 1 }) -Status $(if ($agents.Count -eq 10) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('medido={0} doctrina_AGENTS.md=10 · archivos={1}' -f $agents.Count, ($agents -join ','))
    Add-Row -CheckId 'C10_claude_commands_count' -Comando 'Get-ChildItem .claude/commands/*.md' `
        -ExitCode $(if ($cmds.Count -eq 7) { 0 } else { 1 }) -Status $(if ($cmds.Count -eq 7) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('medido={0} doctrina_AGENTS.md=7 · archivos={1}' -f $cmds.Count, ($cmds -join ','))

    # ─────────────────────────────────────────────────────────────────────
    # C11/C12 · headers tóxicos: emisores activos (frontend/**)
    #   Se separa el bloque DEFAULT_HEADER_VALUES (ape-profiles-config.js) porque es la
    #   tabla de valores por defecto, no una lista de headers por perfil.
    # ─────────────────────────────────────────────────────────────────────
    $fePaths = @('IPTV_v5.4_MAX_AGGRESSION/frontend/*')
    # Árboles de archivo/backup congelados: NO son código vivo. Se cuentan aparte y se informan.
    $archiveRx = '(?i)(\.PRE$|\.CORRUPT|\.FREEZE|ape-v9-backup|/_backups/|/backup_master|/snapshots/)'
    $strictRx = '^[[:space:]]*"(' + $ToxicSix + ')"[[:space:]]*:[[:space:]]*"[^.]'
    $allToxic = Get-GrepSites -Pattern $strictRx -Paths $fePaths
    $defaultsBlock = @($allToxic | Where-Object { $_ -like 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js:*' } | Where-Object {
            $ln = [int]($_ -split ':')[-1]; ($ln -ge 3994 -and $ln -le 4050)
        })
    $inArchive = @($allToxic | Where-Object { (($_ -split ':')[0]) -match $archiveRx })
    $profileToxic = @($allToxic | Where-Object { $defaultsBlock -notcontains $_ -and $inArchive -notcontains $_ })

    Add-Row -CheckId 'C11_toxic_in_profile_lists' -Comando ('git grep -n -I -E ''' + $strictRx + ''' -- ' + $fePaths[0] + '  (excluye DEFAULT_HEADER_VALUES 3994-4050 y árboles de backup)') `
        -ExitCode $(if ($profileToxic.Count -eq 0) { 0 } else { 1 }) -Status $(if ($profileToxic.Count -eq 0) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('emisores_vivos={0} excluidos_por_ser_backup={1} sitios={2}' -f $profileToxic.Count, $inArchive.Count, $(if ($profileToxic.Count) { (($profileToxic | Select-Object -First 10) -join ' ') } else { 'ninguno' }))

    Add-Row -CheckId 'C12_toxic_in_default_values' -Comando 'git grep -n -I -E ''"^(Range|If-None-Match|...)"'' -- ape-profiles-config.js (líneas 3994-4050)' `
        -ExitCode $(if ($defaultsBlock.Count -eq 0) { 0 } else { 1 }) -Status $(if ($defaultsBlock.Count -eq 0) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('valores_por_defecto_toxicos={0} sitios={1}' -f $defaultsBlock.Count, (($defaultsBlock | Select-Object -First 10) -join ' '))

    # ─────────────────────────────────────────────────────────────────────
    # C13 · DNT: el mapa TOXIC lo prohíbe pero se emite
    # ─────────────────────────────────────────────────────────────────────
    $toxMap = Get-GitGrepCount -Pattern "'dnt'[[:space:]]*:[[:space:]]*1" -Paths @('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-field-homologator.js')
    $dntAll = Get-GrepSites -Pattern '^[[:space:]]*"DNT"[[:space:]]*:[[:space:]]*"[^.]' -Paths $fePaths
    $dntArchive = @($dntAll | Where-Object { (($_ -split ':')[0]) -match $archiveRx })
    $dntEm = @($dntAll | Where-Object { $dntArchive -notcontains $_ })
    $dntOk = ($toxMap -eq 0 -or $dntEm.Count -eq 0)
    Add-Row -CheckId 'C13_dnt_contradiction' -Comando 'git grep -n -I -E ''"DNT"\s*:\s*"[^.]'' -- frontend/* (sin árboles de backup) + TOXIC dnt' `
        -ExitCode $(if ($dntOk) { 0 } else { 1 }) -Status $(if ($dntOk) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('toxico_en_mapa={0} emisiones_vivas={1} excluidas_backup={2} sitios={3}' -f $toxMap, $dntEm.Count, $dntArchive.Count, (($dntEm | Select-Object -First 10) -join ' '))

    # ─────────────────────────────────────────────────────────────────────
    # C14/C15 · secretos: SOLO tipo + archivo:línea + conteo (jamás el valor)
    # ─────────────────────────────────────────────────────────────────────
    $material = [ordered]@{}
    $material['PRIVATE_KEY_BLOCK'] = Get-GrepSites -Pattern '-----BEGIN [A-Z ]*PRIVATE KEY-----' -Paths @('*')
    $material['WG_PRIVATE_KEY'] = Get-GrepSites -Pattern '^[[:space:]]*PrivateKey[[:space:]]*=[[:space:]]*[A-Za-z0-9+/=]{20,}' -Paths @('*')
    $material['WG_PRESHARED_KEY'] = Get-GrepSites -Pattern '^[[:space:]]*PresharedKey[[:space:]]*=[[:space:]]*[A-Za-z0-9+/=]{20,}' -Paths @('*')
    $material['CLI_BASIC_AUTH'] = Get-GrepSites -Pattern '--auth[[:space:]]+[A-Za-z0-9_.-]+:[A-Za-z0-9_./+-]{6,}' -Paths @('*')
    $matTotal = 0
    $matDetail = @()
    foreach ($k in $material.Keys) {
        $matTotal += $material[$k].Count
        if ($material[$k].Count) { $matDetail += ('{0}={1}[{2}]' -f $k, $material[$k].Count, (($material[$k] | Select-Object -First 4) -join ' ')) }
    }
    Add-Row -CheckId 'C14_secret_sweep_material' -Comando 'git grep -n -I -E <patrones: private-key block | WG PrivateKey | WG PresharedKey | CLI --auth user:pass> (valores NO impresos)' `
        -ExitCode $(if ($matTotal -eq 0) { 0 } else { 1 }) -Status $(if ($matTotal -eq 0) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('hallazgos={0} · {1}' -f $matTotal, $(if ($matDetail.Count) { ($matDetail -join ' | ') } else { 'ninguno' }))

    $xtream = Get-GrepSites -Pattern 'https?://[A-Za-z0-9.-]+:[0-9]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]{3,}/[0-9]+' -Paths @('*')
    $xtreamByFile = @($xtream | ForEach-Object { ($_ -split ':')[0] } | Group-Object | Sort-Object Count -Descending)
    $xtail = 'sitios=' + $xtream.Count + ' archivos=' + $xtreamByFile.Count
    if ($xtreamByFile.Count) { $xtail += ' :: ' + (($xtreamByFile | Select-Object -First 5 | ForEach-Object { '{0}({1})' -f $_.Name, $_.Count }) -join ' ') }
    Add-Row -CheckId 'C15_secret_sweep_provider_creds' -Comando 'git grep -n -I -E <url Xtream con user:pass en el path> (valores NO impresos)' `
        -ExitCode $(if ($xtream.Count -eq 0) { 0 } else { 1 }) -Status $(if ($xtream.Count -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail $xtail

    # ─────────────────────────────────────────────────────────────────────
    # C16 · .gitignore cubre los materiales hallados
    # ─────────────────────────────────────────────────────────────────────
    $gi = @(Get-Content -LiteralPath '.gitignore' -ErrorAction SilentlyContinue)
    $ignConf = @($gi | Where-Object { $_.Trim() -match '^(\*\*/)?\*?\.conf$' }).Count -gt 0
    $ignMap = @($gi | Where-Object { $_.Trim() -match 'channels_map' }).Count -gt 0
    $trackedPem = @(git ls-files | Where-Object { $_ -match '\.(pem|key|p12|pfx)$' }).Count
    $giOk = ($ignConf -and $ignMap -and $trackedPem -eq 0)
    Add-Row -CheckId 'C16_gitignore_coverage' -Comando 'Get-Content .gitignore + git ls-files <*.pem|*.key|*.p12|*.pfx>' `
        -ExitCode $(if ($giOk) { 0 } else { 1 }) -Status $(if ($giOk) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('ignora_*.conf={0} ignora_channels_map={1} trackeados_pem/key={2} lineas_gitignore={3}' -f $ignConf, $ignMap, $trackedPem, $gi.Count)

    # ─────────────────────────────────────────────────────────────────────
    # C17 · validador portable del paquete ADN (exit code REAL)
    # ─────────────────────────────────────────────────────────────────────
    $valPath = '_inbox_EQUIPO_ADN/EQUIPO_ENTERPRISE_10_COUNCIL_ADN/validate_imports_portable.py'
    if (-not $pyCmd) {
        Add-Row -CheckId 'C17_validate_imports_portable' -Comando ('python ' + $valPath) -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'python ausente'
    }
    elseif (-not (Test-Path $valPath)) {
        Add-Row -CheckId 'C17_validate_imports_portable' -Comando ('python ' + $valPath) -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail ('no existe ' + $valPath)
    }
    else {
        $vout = (& python $valPath 2>&1) -join ' | '
        $vex = $LASTEXITCODE
        Add-Row -CheckId 'C17_validate_imports_portable' -Comando ('python ' + $valPath) -ExitCode $vex `
            -Status $(if ($vex -eq 0) { 'PASS' } else { 'FAIL' }) -EvidenciaTail ($vout -replace '\s+', ' ')
    }

    # ─────────────────────────────────────────────────────────────────────
    # C18 · blobs HEAD del snapshot: tamaño byte a byte == git cat-file -s
    # ─────────────────────────────────────────────────────────────────────
    $snapJsonForBlobs = Join-Path $SnapshotDir 'SNAPSHOT.json'
    $headBlobs = @(Get-ChildItem -File (Join-Path $SnapshotDir '*.HEAD.blob') -ErrorAction SilentlyContinue)
    if ($headBlobs.Count -eq 0 -or -not (Test-Path $snapJsonForBlobs)) {
        Add-Row -CheckId 'C18_snapshot_head_blobs' -Comando 'compare <basename>.HEAD.blob vs git cat-file -s' -ExitCode -1 -Status 'NOT_RUN' `
            -EvidenciaTail ('faltan blobs o SNAPSHOT.json en ' + $SnapshotDir)
    }
    else {
        # El tamaño del .HEAD.blob se compara contra el tamaño real del objeto git declarado
        # en SNAPSHOT.json (no se adivina la ruta del repo a partir del basename: eso daba
        # un PASS vacío cuando el basename no resuelve por sí solo).
        $sd = Get-Content -LiteralPath $snapJsonForBlobs -Raw | ConvertFrom-Json
        $bad = @(); $verified = 0
        foreach ($e in $sd.files) {
            $blobName = $e.blob_files.head
            $bp = Join-Path $SnapshotDir $blobName
            if (-not (Test-Path $bp)) { $bad += ($blobName + ': AUSENTE'); continue }
            $gitSize = [int64]((& git cat-file -s $e.head_blob_sha 2>&1) -join '')
            $blobSize = (Get-Item -LiteralPath $bp).Length
            if ($gitSize -ne $blobSize) { $bad += ('{0}: blob={1}B git={2}B' -f $blobName, $blobSize, $gitSize) }
            else { $verified++ }
        }
        Add-Row -CheckId 'C18_snapshot_head_blobs' -Comando 'compare <basename>.HEAD.blob vs git cat-file -s <sha de SNAPSHOT.json>' `
            -ExitCode $(if ($bad.Count -eq 0) { 0 } else { 1 }) -Status $(if ($bad.Count -eq 0) { 'PASS' } else { 'FAIL' }) `
            -EvidenciaTail ('blobs={0} verificados_byte_a_byte={1} discrepancias={2} {3}' -f $headBlobs.Count, $verified, $bad.Count, ($bad -join ' ; '))
    }

    # ─────────────────────────────────────────────────────────────────────
    # C19 · el WT no se movió desde el congelamiento (mide el WT AHORA)
    # ─────────────────────────────────────────────────────────────────────
    $genPath = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js'
    $snapJson = Join-Path $SnapshotDir 'SNAPSHOT.json'
    if (-not (Test-Path $genPath)) {
        Add-Row -CheckId 'C19_wt_stable_since_freeze' -Comando 'Get-FileHash -Algorithm SHA256 <generador>' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail ('no existe ' + $genPath)
    }
    elseif (-not (Test-Path $snapJson)) {
        Add-Row -CheckId 'C19_wt_stable_since_freeze' -Comando 'Get-FileHash -Algorithm SHA256 <generador>' -ExitCode -1 -Status 'NOT_RUN' -EvidenciaTail 'falta SNAPSHOT.json'
    }
    else {
        $genNow = (Get-FileHash -Algorithm SHA256 -LiteralPath $genPath).Hash.ToLower()
        $snapData = Get-Content -LiteralPath $snapJson -Raw | ConvertFrom-Json
        $gen = @($snapData.files | Where-Object { $_.path -eq $genPath }) | Select-Object -First 1
        $frozen = $gen.wt_sha256
        $same = ($genNow -eq $frozen)
        Add-Row -CheckId 'C19_wt_stable_since_freeze' -Comando 'Get-FileHash -Algorithm SHA256 <generador> vs SNAPSHOT.json' `
            -ExitCode $(if ($same) { 0 } else { 1 }) -Status $(if ($same) { 'PASS' } else { 'FAIL' }) `
            -EvidenciaTail ('sha_actual={0} sha_congelado={1} lineas_congeladas={2}' -f $genNow, $frozen, $gen.wt_lines)
    }

    # ─────────────────────────────────────────────────────────────────────
    # C20 · artefactos de snapshot presentes (5)
    # ─────────────────────────────────────────────────────────────────────
    $need = @('SNAPSHOT.json', 'REPORT_HASHES.json', 'REGLA_DE_ORIGEN.md')
    $present = @($need | Where-Object { Test-Path (Join-Path $SnapshotDir $_) })
    $blobCount = @(Get-ChildItem -File (Join-Path $SnapshotDir '*.blob') -ErrorAction SilentlyContinue).Count
    $c20ok = ($present.Count -eq $need.Count -and $blobCount -ge 8)
    Add-Row -CheckId 'C20_snapshot_artifacts' -Comando 'Test-Path snapshot/{SNAPSHOT.json,REPORT_HASHES.json,REGLA_DE_ORIGEN.md} + count *.blob' `
        -ExitCode $(if ($c20ok) { 0 } else { 1 }) -Status $(if ($c20ok) { 'PASS' } else { 'FAIL' }) `
        -EvidenciaTail ('presentes={0}/{1} blobs={2} faltan={3}' -f $present.Count, $need.Count, $blobCount, (($need | Where-Object { $present -notcontains $_ }) -join ','))

    # ─────────────────────────────────────────────────────────────────────
    # C21 · hashes declarados por los 8 informes Council vs hash real en disco
    # ─────────────────────────────────────────────────────────────────────
    $reports = @(Get-ChildItem -File 'audit/equipo10_operativo_2026-10-26/council/*.md' -ErrorAction SilentlyContinue | Sort-Object Name)
    $rhJson = Join-Path $SnapshotDir 'REPORT_HASHES.json'
    if ($reports.Count -eq 0 -or -not (Test-Path $rhJson)) {
        Add-Row -CheckId 'C21_council_report_hashes' -Comando 'Get-FileHash <council/*.md> vs REPORT_HASHES.json' -ExitCode -1 -Status 'NOT_RUN' `
            -EvidenciaTail 'faltan informes council/ o snapshot/REPORT_HASHES.json'
    }
    else {
        # Recorre el artefacto: cada hash declarado por su autor se re-verifica contra el archivo en disco.
        $rh = Get-Content -LiteralPath $rhJson -Raw | ConvertFrom-Json
        $checked = 0; $matched = 0; $undeclared = 0; $mismatched = @(); $selfInFile = 0
        foreach ($e in $rh.reports) {
            $fp = Join-Path 'audit/equipo10_operativo_2026-10-26/council' $e.informe
            if (-not (Test-Path $fp)) { $mismatched += ($e.informe + '(ausente)'); continue }
            $real = (Get-FileHash -Algorithm SHA256 -LiteralPath $fp).Hash.ToLower()
            # ¿el propio informe contiene su SHA-256 completo? (dato de auditoría, no criterio de PASS)
            if ((Get-Content -LiteralPath $fp -Raw) -match [regex]::Escape($real)) { $selfInFile++ }
            if (-not $e.hash_declarado) { $undeclared++; continue }
            $checked++
            $dl = $e.hash_declarado.ToString().ToLower()
            $ok = if ($dl.Length -eq 64) { $real -eq $dl } else { $real.StartsWith($dl) }
            if ($ok) { $matched++ } else { $mismatched += ('{0}(decl={1} real={2})' -f $e.informe, $dl.Substring(0, [Math]::Min(8, $dl.Length)), $real.Substring(0, 8)) }
        }
        $c21ok = ($mismatched.Count -eq 0)
        Add-Row -CheckId 'C21_council_report_hashes' -Comando 'Get-FileHash -Algorithm SHA256 <council/*.md> vs hash declarado en REPORT_HASHES.json' `
            -ExitCode $(if ($c21ok) { 0 } else { 1 }) -Status $(if ($c21ok) { 'PASS' } else { 'FAIL' }) `
            -EvidenciaTail ('informes={0} con_hash_declarado={1} coinciden={2} sin_declarar={3} informes_que_contienen_su_propio_sha={4} discrepan={5} :: {6}' -f $reports.Count, $checked, $matched, $undeclared, $selfInFile, $mismatched.Count, ($mismatched -join ' '))
    }

    # ─────────────────────────────────────────────────────────────────────
    # Resumen + HARNESS.json
    # ─────────────────────────────────────────────────────────────────────
    $p = @($script:rows | Where-Object { $_.status -eq 'PASS' }).Count
    $f = @($script:rows | Where-Object { $_.status -eq 'FAIL' }).Count
    $n = @($script:rows | Where-Object { $_.status -eq 'NOT_RUN' }).Count
    $exit = $(if ($f -gt 0) { 1 } else { 0 })

    $doc = [ordered]@{
        harness        = 'run_checks.ps1'
        task           = 't9 / i1 — harness ejecutable real con exit codes'
        repo_head      = $head.Trim()
        expected_head  = $ExpectedHead
        host           = [ordered]@{ os = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription; pwsh = $PSVersionTable.PSVersion.ToString(); cwd = $Root }
        started_at     = $script:startedAt
        finished_at    = (Get-Date).ToString('o')
        exit_code      = $exit
        totals         = [ordered]@{ checks = $script:rows.Count; pass = $p; fail = $f; not_run = $n }
        checks         = $script:rows
    }
    $doc | ConvertTo-Json -Depth 8 | Out-File -LiteralPath $OutFile -Encoding utf8

    Write-Host ''
    Write-Host ('=== TOTALES: checks={0} PASS={1} FAIL={2} NOT_RUN={3} → exit {4}' -f $script:rows.Count, $p, $f, $n, $exit)
    Write-Host ('HARNESS.json -> ' + $OutFile)
    if ($f -gt 0) { Write-Host 'FAIL:'; $script:rows | Where-Object { $_.status -eq 'FAIL' } | ForEach-Object { Write-Host ('  - ' + $_.check_id) } }
    if ($n -gt 0) { Write-Host 'NOT_RUN:'; $script:rows | Where-Object { $_.status -eq 'NOT_RUN' } | ForEach-Object { Write-Host ('  - ' + $_.check_id + ' :: ' + $_.evidencia_tail) } }
    Pop-Location
    exit $exit
}
catch {
    Write-Error ('HARNESS ERROR: ' + $_.Exception.Message)
    Pop-Location
    exit 2
}
