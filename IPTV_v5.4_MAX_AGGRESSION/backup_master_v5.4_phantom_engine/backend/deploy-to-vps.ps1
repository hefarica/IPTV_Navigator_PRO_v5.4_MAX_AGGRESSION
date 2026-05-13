# ============================================
# 🚀 IPTV Navigator PRO - Deploy to VPS
# Script para subir listas M3U8 a tu VPS Hetzner
# ============================================

param(
    [Parameter(Mandatory=$false)]
    [string]$VpsHost = "",
    
    [Parameter(Mandatory=$false)]
    [string]$VpsUser = "iptv",
    
    [Parameter(Mandatory=$false)]
    [string]$VpsPath = "/var/www/m3u8",
    
    [Parameter(Mandatory=$false)]
    [string]$LocalPath = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$SaveConfig,
    
    [Parameter(Mandatory=$false)]
    [switch]$TestConnection
)

# ============================================
# 📋 CONFIGURACIÓN
# ============================================

$CONFIG_FILE = Join-Path $PSScriptRoot "vps-config.json"

# Cargar configuración guardada
function Load-Config {
    if (Test-Path $CONFIG_FILE) {
        $config = Get-Content $CONFIG_FILE | ConvertFrom-Json
        return $config
    }
    return $null
}

# Guardar configuración
function Save-Config {
    param($Host, $User, $Path)
    
    $config = @{
        VpsHost = $Host
        VpsUser = $User
        VpsPath = $Path
        LastUpdated = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    
    $config | ConvertTo-Json | Set-Content $CONFIG_FILE
    Write-Host "✅ Configuración guardada en: $CONFIG_FILE" -ForegroundColor Green
}

# ============================================
# 🔧 FUNCIONES
# ============================================

function Test-VpsConnection {
    param($Host, $User)
    
    Write-Host "`n🔍 Probando conexión a $User@$Host..." -ForegroundColor Cyan
    
    try {
        $result = ssh -o ConnectTimeout=10 -o BatchMode=yes "$User@$Host" "echo 'OK'" 2>&1
        if ($result -eq "OK") {
            Write-Host "✅ Conexión exitosa!" -ForegroundColor Green
            
            # Verificar nginx
            $nginx = ssh "$User@$Host" "systemctl is-active nginx 2>/dev/null || echo 'not-running'"
            if ($nginx -eq "active") {
                Write-Host "✅ Nginx está corriendo" -ForegroundColor Green
            } else {
                Write-Host "⚠️ Nginx no está activo: $nginx" -ForegroundColor Yellow
            }
            
            return $true
        }
    } catch {
        Write-Host "❌ Error de conexión: $_" -ForegroundColor Red
    }
    
    return $false
}

function Upload-File {
    param($LocalFile, $Host, $User, $RemotePath)
    
    $fileName = Split-Path $LocalFile -Leaf
    $remoteDest = "$User@${Host}:$RemotePath/$fileName"
    
    Write-Host "📤 Subiendo: $fileName" -ForegroundColor Cyan
    
    try {
        scp -q $LocalFile $remoteDest
        Write-Host "   ✅ Completado" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "   ❌ Error: $_" -ForegroundColor Red
        return $false
    }
}

function Upload-Directory {
    param($LocalDir, $Host, $User, $RemotePath)
    
    $files = Get-ChildItem $LocalDir -File
    $success = 0
    $failed = 0
    
    foreach ($file in $files) {
        if (Upload-File -LocalFile $file.FullName -Host $Host -User $User -RemotePath $RemotePath) {
            $success++
        } else {
            $failed++
        }
    }
    
    return @{ Success = $success; Failed = $failed }
}

# ============================================
# 🎯 MAIN
# ============================================

Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║        🚀 IPTV Navigator PRO - VPS Deploy Script            ║
║                    Hetzner VPS Upload                        ║
╚══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# Cargar configuración existente
$savedConfig = Load-Config

# Usar configuración guardada si no se proporcionan parámetros
if (-not $VpsHost -and $savedConfig) {
    $VpsHost = $savedConfig.VpsHost
    $VpsUser = $savedConfig.VpsUser
    $VpsPath = $savedConfig.VpsPath
    Write-Host "📋 Usando configuración guardada:" -ForegroundColor Yellow
    Write-Host "   Host: $VpsHost" -ForegroundColor Gray
    Write-Host "   User: $VpsUser" -ForegroundColor Gray
    Write-Host "   Path: $VpsPath" -ForegroundColor Gray
}

# Verificar que tenemos host
if (-not $VpsHost) {
    Write-Host "❌ Error: No se especificó el host del VPS" -ForegroundColor Red
    Write-Host "`nUso:" -ForegroundColor Yellow
    Write-Host "  .\deploy-to-vps.ps1 -VpsHost '123.45.67.89' -LocalPath 'C:\listas'" -ForegroundColor Gray
    Write-Host "  .\deploy-to-vps.ps1 -VpsHost 'mi-vps.com' -SaveConfig" -ForegroundColor Gray
    Write-Host "  .\deploy-to-vps.ps1 -TestConnection" -ForegroundColor Gray
    exit 1
}

# Solo probar conexión
if ($TestConnection) {
    Test-VpsConnection -Host $VpsHost -User $VpsUser
    exit 0
}

# Guardar configuración si se solicita
if ($SaveConfig) {
    Save-Config -Host $VpsHost -User $VpsUser -Path $VpsPath
}

# Verificar ruta local
if (-not $LocalPath) {
    # Buscar listas generadas en ubicaciones comunes
    $possiblePaths = @(
        (Join-Path $PSScriptRoot "..\exports"),
        (Join-Path $PSScriptRoot "..\generated"),
        (Join-Path $env:USERPROFILE "Desktop\IPTV_Listas")
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $LocalPath = $path
            Write-Host "📁 Usando directorio: $LocalPath" -ForegroundColor Cyan
            break
        }
    }
}

if (-not $LocalPath -or -not (Test-Path $LocalPath)) {
    Write-Host "❌ Error: Especifica la ruta de los archivos con -LocalPath" -ForegroundColor Red
    exit 1
}

# Probar conexión primero
if (-not (Test-VpsConnection -Host $VpsHost -User $VpsUser)) {
    Write-Host "`n❌ No se puede conectar al VPS. Verifica:" -ForegroundColor Red
    Write-Host "   1. La IP/hostname es correcta" -ForegroundColor Yellow
    Write-Host "   2. SSH está configurado (ssh-keygen, ssh-copy-id)" -ForegroundColor Yellow
    Write-Host "   3. El firewall permite conexiones SSH (puerto 22)" -ForegroundColor Yellow
    exit 1
}

# Subir archivos
Write-Host "`n📦 Subiendo archivos desde: $LocalPath" -ForegroundColor Cyan
Write-Host "   Destino: $VpsUser@${VpsHost}:$VpsPath" -ForegroundColor Gray

$isFile = (Get-Item $LocalPath).PSIsContainer -eq $false

if ($isFile) {
    # Subir archivo individual
    $result = Upload-File -LocalFile $LocalPath -Host $VpsHost -User $VpsUser -RemotePath $VpsPath
    if ($result) {
        Write-Host "`n✅ Archivo subido exitosamente!" -ForegroundColor Green
    }
} else {
    # Subir directorio
    $result = Upload-Directory -LocalDir $LocalPath -Host $VpsHost -User $VpsUser -RemotePath $VpsPath
    
    Write-Host "`n" + "=" * 50 -ForegroundColor Gray
    Write-Host "📊 RESUMEN" -ForegroundColor Cyan
    Write-Host "=" * 50 -ForegroundColor Gray
    Write-Host "   ✅ Exitosos: $($result.Success)" -ForegroundColor Green
    Write-Host "   ❌ Fallidos: $($result.Failed)" -ForegroundColor $(if ($result.Failed -gt 0) { "Red" } else { "Gray" })
}

# Mostrar URL de acceso
Write-Host "`n🌐 Tu lista está disponible en:" -ForegroundColor Cyan
$protocol = if ($VpsHost -match "\.") { "http" } else { "http" }
Write-Host "   ${protocol}://${VpsHost}/listas/TU_LISTA.m3u8" -ForegroundColor Yellow

Write-Host "`n✨ ¡Deploy completado!" -ForegroundColor Green
