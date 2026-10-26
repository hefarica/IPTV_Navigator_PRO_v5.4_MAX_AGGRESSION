# REA R3 — Auditoría de citas `archivo:línea` de docs/REA_ABR_INTERNALS.md
# Uso:  pwsh -NoProfile -File docs/evidence/REA_R3_citation_audit.ps1 [-Root <dir fuentes pinneadas>]
#
# Qué hace: extrae del documento todas las citas del tipo `archivo.ext:NNN` (ts/js/java),
# las resuelve contra los árboles pinneados (hls.js v1.6.19, Shaka v5.3.2, dash.js v5.2.1,
# archivos .java de media3/ExoPlayer2) y contra nuestro repo, e imprime la línea citada
# para revisión humana. No descarga nada: requiere haber ejecutado §10.1 del documento.
#
# Salida: una fila OK por cita (con el texto de la línea), secciones AMBIGUAS / NO RESUELTAS,
# y un RESUMEN final. Código de salida 0 si no hay NO RESUELTAS ni OUT-OF-RANGE.

param(
    [string]$Root = (Join-Path $env:TEMP 'rea_abr\src'),
    [string]$Doc  = (Join-Path $PSScriptRoot '..\..\docs\REA_ABR_INTERNALS.md'),
    [string]$Repo = (Join-Path $PSScriptRoot '..\..\IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Doc))  { throw "No existe el documento: $Doc" }
if (-not (Test-Path -LiteralPath $Root)) { throw "No existen las fuentes pinneadas: $Root (ver §10.1)" }

$rootAbs = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\', '/')
$repoAbs = (Resolve-Path -LiteralPath $Repo).Path.TrimEnd('\', '/')

# Índice: dos hashes por árbol (ruta relativa exacta y basename) -> resolución O(1)
$byRel  = @{}
$byBase = @{}
$relOf  = @{}
$trees  = @(
    [pscustomobject]@{ Id = 'src';  Path = $rootAbs },
    [pscustomobject]@{ Id = 'repo'; Path = $repoAbs }
)
foreach ($t in $trees) {
    if (-not (Test-Path -LiteralPath $t.Path)) { continue }
    Get-ChildItem -LiteralPath $t.Path -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($t.Path.Length).TrimStart('\', '/').Replace('\', '/')
        # Excluir árboles auxiliares que duplican basenames (tests/demo/dist/build/samples)
        if ($rel -imatch '(^|/)(tests?|demo|dist|build|samples|node_modules)/') { return }
        $byRel["$($t.Id)|$($rel.ToLowerInvariant())"] = $_.FullName
        $relOf[$_.FullName] = $rel
        $base = $rel.Substring($rel.LastIndexOf('/') + 1).ToLowerInvariant()
        # Alias: los .java descargados llevan prefijo de versión; permitir citarlos por su nombre real
        $alias = $base -replace '^(media3-1\.11\.1_|exo2-r2\.19\.1_)', ''
        foreach ($b in @($base, $alias) | Select-Object -Unique) {
            $k = "$($t.Id)|$b"
            if (-not $byBase.ContainsKey($k)) { $byBase[$k] = New-Object System.Collections.ArrayList }
            if (-not $byBase[$k].Contains($_.FullName)) { [void]$byBase[$k].Add($_.FullName) }
        }
    }
}

$text   = Get-Content -LiteralPath $Doc -Raw
$cites  = [regex]::Matches($text, '([A-Za-z0-9_./\-]+\.(?:ts|js|java)):(\d+)')
$seen   = @{}
$lines  = @{}
$ok = 0; $amb = 0; $unres = 0; $oor = 0

$getLines = {
    param($path)
    if (-not $lines.ContainsKey($path)) { $lines[$path] = @(Get-Content -LiteralPath $path -ErrorAction SilentlyContinue) }
    return ,$lines[$path]
}

foreach ($m in $cites) {
    $file = $m.Groups[1].Value.Replace('\', '/')
    $line = [int]$m.Groups[2].Value
    $key  = "$file`:$line"
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = 1

    # Resolver: (1) coincidencia exacta de la ruta relativa completa, (2) por basename,
    # y desempatar SIEMPRE por número de segmentos finales coincidentes con la cita.
    $segs = $file.Split('/')
    $cands = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $segs.Count; $i++) {
        $suffix = ($segs[$i..($segs.Count - 1)] -join '/').ToLowerInvariant()
        foreach ($t in $trees) {
            $k = "$($t.Id)|$suffix"
            if ($byRel.ContainsKey($k) -and -not $cands.Contains($byRel[$k])) { [void]$cands.Add($byRel[$k]) }
        }
    }
    if ($cands.Count -eq 0) {
        $base = $segs[$segs.Count - 1].ToLowerInvariant()
        foreach ($t in $trees) {
            $k = "$($t.Id)|$base"
            if ($byBase.ContainsKey($k)) { foreach ($p in $byBase[$k]) { if (-not $cands.Contains($p)) { [void]$cands.Add($p) } } }
        }
    }

    # Puntuar por segmentos finales coincidentes (resuelve events.ts vs types/events.ts,
    # samples/…/ThroughputRule.js vs src/…/ThroughputRule.js, etc.)
    $found = New-Object System.Collections.ArrayList
    if ($cands.Count -gt 0) {
        $best = -1
        foreach ($p in $cands) {
            $relSegs = $relOf[$p].Split('/')
            $score = 0
            for ($a = 1; $a -le [Math]::Min($relSegs.Count, $segs.Count); $a++) {
                if ($relSegs[$relSegs.Count - $a] -ieq $segs[$segs.Count - $a]) { $score++ } else { break }
            }
            if ($score -gt $best) { $best = $score; $found = New-Object System.Collections.ArrayList }
            if ($score -eq $best -and -not $found.Contains($p)) { [void]$found.Add($p) }
        }
    }

    if ($found.Count -eq 0) { $unres++; "NO-RESUELTA  $key"; continue }

    $printed = 0
    foreach ($path in $found) {
        $c = & $getLines $path
        $tag = if ($found.Count -gt 1) { 'AMBIGUA' } else { 'OK' }
        if ($null -eq $c -or $line -lt 1 -or $line -gt $c.Count) {
            $oor++; "$tag  $key  (fuera de rango; el archivo tiene $($c.Count) líneas: $path)"; continue
        }
        $txt = ([string]$c[$line - 1]).Trim()
        if ($txt.Length -gt 100) { $txt = $txt.Substring(0, 100) + '…' }
        $leaf = $path.Substring($path.LastIndexOf('\') + 1)
        "{0,-8} {1,-52} | {2,-42} | {3}" -f $tag, $key, $leaf, $txt
        $printed++
    }
    if ($found.Count -gt 1) { $amb++ } elseif ($printed -gt 0) { $ok++ }
}

''
"RESUMEN citas_unicas=$($seen.Count) ok=$ok ambiguas=$amb fuera_de_rango=$oor no_resueltas=$unres"
if ($oor -gt 0 -or $unres -gt 0) { exit 1 } else { exit 0 }
