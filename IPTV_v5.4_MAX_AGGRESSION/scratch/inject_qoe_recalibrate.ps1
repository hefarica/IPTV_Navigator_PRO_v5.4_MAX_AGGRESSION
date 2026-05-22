#==============================================================================
# F4 - Inject mod_PRISMA_QoE_Recalibrate + hook into exportPrismaConfig
# SAFE-MODE COM: backup, single instance, events off, ReleaseComObject + GC x2.
# AccessVBOM toggled (saved/restored). Auto-rollback to backup on failure.
#==============================================================================
$ErrorActionPreference = "Stop"
$xlsm = "C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm"
$bas  = "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\IPTV_v5.4_MAX_AGGRESSION\lab-vba\mod_PRISMA_QoE_Recalibrate.bas"
$modName = "mod_PRISMA_QoE_Recalibrate"

# ---- Pre-flight (SAFE-MODE rules 1,10) ----
$running = Get-Process EXCEL -ErrorAction SilentlyContinue
if ($running) { Write-Output "ABORT: Excel is running (PID $($running.Id -join ',')). Close it first."; exit 2 }
if (-not (Test-Path $xlsm)) { Write-Output "ABORT: workbook not found: $xlsm"; exit 2 }
if (-not (Test-Path $bas))  { Write-Output "ABORT: module .bas not found: $bas"; exit 2 }
Get-ChildItem "C:\Users\HFRC\Downloads\~`$*.xlsm" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# ---- Backup (SAFE-MODE rule 2) ----
$ts  = Get-Date -Format "yyyyMMdd_HHmmss"
$bak = "$xlsm.bak_${ts}_PRE_QOE_F4"
Copy-Item $xlsm $bak -Force
Write-Output "backup: $bak"

# ---- AccessVBOM: enable (save prior) so COM can touch the VBProject ----
$verKeys = Get-ChildItem "HKCU:\Software\Microsoft\Office" -ErrorAction SilentlyContinue |
           Where-Object { $_.PSChildName -match '^\d+\.\d+$' } | ForEach-Object { $_.PSChildName }
if (-not $verKeys) { $verKeys = @("16.0") }
$savedVBOM = @{}
foreach ($v in $verKeys) {
    $sec = "HKCU:\Software\Microsoft\Office\$v\Excel\Security"
    if (-not (Test-Path $sec)) { New-Item -Path $sec -Force | Out-Null }
    $cur = (Get-ItemProperty -Path $sec -Name AccessVBOM -ErrorAction SilentlyContinue).AccessVBOM
    $savedVBOM[$sec] = $cur
    Set-ItemProperty -Path $sec -Name AccessVBOM -Value 1 -Type DWord
}
Write-Output ("AccessVBOM set for: " + ($verKeys -join ', '))

$excel=$null; $wb=$null; $vbproj=$null; $ok=$false; $errMsg=""
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false; $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false; $excel.EnableEvents = $false; $excel.ScreenUpdating = $false
    $excel.AutomationSecurity = 3   # msoAutomationSecurityForceDisable: don't run Workbook_Open macros
    Write-Output ("Excel COM up, version " + $excel.Version)

    $wb = $excel.Workbooks.Open($xlsm, 0, $false)   # UpdateLinks=0, ReadOnly=$false

    # Trust check
    try { $vbproj = $wb.VBProject; $null = $vbproj.VBComponents.Count }
    catch { throw "VBProject access denied (Trust access to the VBA project object model). AccessVBOM toggle may need an Excel restart." }

    # Remove existing module (idempotent re-run)
    foreach ($c in @($vbproj.VBComponents)) {
        if ($c.Name -eq $modName) { $vbproj.VBComponents.Remove($c); Write-Output "removed existing $modName" }
    }
    # Add as fresh std module via AddFromString (encoding/BOM-proof; no Attribute line)
    $src = Get-Content -Path $bas -Raw
    $src = $src.TrimStart([char]0xFEFF)
    $body = (($src -split "`r?`n") | Where-Object { $_ -notmatch '^\s*Attribute\s+VB_Name' }) -join "`r`n"
    $comp = $vbproj.VBComponents.Add(1)   # 1 = vbext_ct_StdModule
    $comp.Name = $modName
    $comp.CodeModule.AddFromString($body)
    Write-Output ("added $modName (" + $comp.CodeModule.CountOfLines + " lines)")

    # Hook into exportPrismaConfig
    $hookDone = $false; $alreadyHooked = $false; $hostComp = $null
    foreach ($c in @($vbproj.VBComponents)) {
        $cm = $c.CodeModule
        if ($cm.CountOfLines -lt 1) { continue }
        $code = $cm.Lines(1, $cm.CountOfLines)
        if ($code -match "Sub\s+exportPrismaConfig") {
            $hostComp = $c.Name
            if ($code -match "QoE_RecalibrateFromFeedback") { $alreadyHooked = $true; break }
            $n = $cm.CountOfLines
            for ($ln=1; $ln -le $n; $ln++) {
                if ($cm.Lines($ln,1) -match "Sub\s+exportPrismaConfig") {
                    $insertAt = $ln
                    $limit = [Math]::Min($ln+6, $n)
                    for ($j=$ln+1; $j -le $limit; $j++) {
                        if ($cm.Lines($j,1) -match "On Error GoTo") { $insertAt = $j; break }
                    }
                    $cm.InsertLines($insertAt+1, "    Call QoE_RecalibrateFromFeedback  ' [F4 QoE->LAB hook 2026-05-21]")
                    $hookDone = $true
                    break
                }
            }
            break
        }
    }
    if ($alreadyHooked) { Write-Output "hook: already present in $hostComp (skipped)" }
    elseif ($hookDone) { Write-Output "hook: inserted into $hostComp (exportPrismaConfig)" }
    else { throw "exportPrismaConfig not found in any module - cannot hook" }

    $wb.Save()
    Write-Output "saved workbook"
    $wb.Close($false); $wb = $null
    $ok = $true
}
catch { $errMsg = $_.Exception.Message; Write-Output "ERROR: $errMsg" }
finally {
    if ($wb)    { try { $wb.Close($false) } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($excel) { try { $excel.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers(); [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    foreach ($sec in $savedVBOM.Keys) {
        if ($null -eq $savedVBOM[$sec]) { Remove-ItemProperty -Path $sec -Name AccessVBOM -ErrorAction SilentlyContinue }
        else { Set-ItemProperty -Path $sec -Name AccessVBOM -Value ([int]$savedVBOM[$sec]) -Type DWord }
    }
    Write-Output "AccessVBOM restored; COM released."
}

if (-not $ok) {
    Write-Output "ROLLBACK: restoring backup (no changes kept)"
    Copy-Item $bak $xlsm -Force
    Write-Output "restored from $bak"
    exit 1
}
Write-Output "INJECT_F4_OK"
