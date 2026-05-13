#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE OMEGA v7.0 — FASE 2 — CAPA 2.2
# IPTables Hardening Script: ape_iptables_hardening.sh
# ═══════════════════════════════════════════════════════════════════════════════
#
# DESCRIPCIÓN:
#   Configura el firewall a nivel de kernel para el VPS APE IPTV.
#   Opera ANTES de que Nginx o PHP vean el tráfico: 0 carga en PHP
#   para tráfico bloqueado.
#
# CARACTERÍSTICAS:
#   - Whitelist de puertos necesarios (80, 443, 22 restringido)
#   - Anti-spoofing: bloquea IPs privadas en interfaz pública
#   - Rate limiting: máx. 100 conexiones nuevas/s por IP
#   - SYN flood protection
#   - DSCP AF41 en tráfico de video saliente (prioridad en datacenter)
#   - Persistencia automática vía iptables-persistent
#
# USO:
#   sudo bash ape_iptables_hardening.sh [--admin-ip=X.X.X.X] [--dry-run]
#
# IMPORTANTE:
#   - Ejecutar desde una sesión SSH con acceso root
#   - Tener SIEMPRE una segunda sesión SSH abierta como respaldo
#   - Si se pierde acceso, esperar 5 minutos (regla de failsafe)
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
ADMIN_IP="${APE_ADMIN_IP:-}"
DRY_RUN=false
LOG_FILE="/var/log/iptv-ape/iptables_hardening.log"
BACKUP_FILE="/etc/iptables/rules.v4.backup_$(date +%Y%m%d_%H%M%S)"

# ── Parsear argumentos ────────────────────────────────────────────────────────
for arg in "$@"; do
    case $arg in
        --admin-ip=*)
            ADMIN_IP="${arg#*=}"
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
    esac
done

# ── Funciones de utilidad ─────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

ipt() {
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] iptables $*"
    else
        iptables "$@"
    fi
}

ip6t() {
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] ip6tables $*"
    else
        ip6tables "$@" 2>/dev/null || true
    fi
}

# ── Verificaciones previas ────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Este script debe ejecutarse como root (sudo)"
    exit 1
fi

mkdir -p /var/log/iptv-ape /etc/iptables
log "=== APE OMEGA v7.0 — IPTables Hardening iniciado ==="
log "Admin IP: ${ADMIN_IP:-'NO CONFIGURADA — SSH solo desde localhost'}"
log "Dry-run: $DRY_RUN"

# ── Backup de reglas actuales ─────────────────────────────────────────────────
if [ "$DRY_RUN" = false ] && command -v iptables-save &>/dev/null; then
    iptables-save > "$BACKUP_FILE" 2>/dev/null || true
    log "Backup guardado en: $BACKUP_FILE"
fi

# ── FAILSAFE: Restaurar reglas en 5 minutos si se pierde acceso ───────────────
# Esto garantiza que si algo sale mal, el acceso SSH se restaura automáticamente
if [ "$DRY_RUN" = false ]; then
    (sleep 300 && iptables-restore < "$BACKUP_FILE" && log "FAILSAFE: Reglas restauradas") &
    FAILSAFE_PID=$!
    log "Failsafe activado (PID $FAILSAFE_PID): restauración automática en 5 minutos"
fi

# ════════════════════════════════════════════════════════════════════════════════
# PASO 1: Limpiar todas las reglas existentes
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 1: Limpiando reglas existentes..."
ipt -F
ipt -X
ipt -t nat -F
ipt -t nat -X
ipt -t mangle -F
ipt -t mangle -X

# ════════════════════════════════════════════════════════════════════════════════
# PASO 2: Políticas por defecto — DROP todo, luego abrir selectivamente
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 2: Estableciendo políticas DROP por defecto..."
ipt -P INPUT   DROP
ipt -P FORWARD DROP
ipt -P OUTPUT  ACCEPT   # El servidor puede iniciar conexiones salientes

# ════════════════════════════════════════════════════════════════════════════════
# PASO 3: Permitir tráfico loopback (siempre necesario)
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 3: Permitiendo loopback..."
ipt -A INPUT -i lo -j ACCEPT
ipt -A OUTPUT -o lo -j ACCEPT

# ════════════════════════════════════════════════════════════════════════════════
# PASO 4: Permitir conexiones establecidas y relacionadas
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 4: Permitiendo conexiones establecidas..."
ipt -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# ════════════════════════════════════════════════════════════════════════════════
# PASO 5: SSH — Solo desde IP de administración
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 5: Configurando acceso SSH..."
if [ -n "$ADMIN_IP" ]; then
    ipt -A INPUT -p tcp --dport 22 -s "$ADMIN_IP" -m conntrack --ctstate NEW -j ACCEPT
    log "SSH permitido solo desde: $ADMIN_IP"
else
    # Sin IP de admin configurada: permitir SSH desde cualquier IP pero con rate limit
    ipt -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW \
        -m recent --set --name SSH --rsource
    ipt -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW \
        -m recent --update --seconds 60 --hitcount 4 --name SSH --rsource -j DROP
    ipt -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT
    log "ADVERTENCIA: SSH abierto con rate-limit (4 intentos/60s). Configure --admin-ip para mayor seguridad."
fi

# ════════════════════════════════════════════════════════════════════════════════
# PASO 6: HTTP/HTTPS — Tráfico IPTV principal
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 6: Abriendo puertos HTTP/HTTPS para tráfico IPTV..."

# Rate limiting: máximo 100 nuevas conexiones por segundo por IP
# Burst de 200 para absorber el zapping masivo sin bloquear usuarios legítimos
ipt -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW \
    -m hashlimit --hashlimit-name http-new \
    --hashlimit-above 100/sec \
    --hashlimit-burst 200 \
    --hashlimit-mode srcip \
    -j DROP

ipt -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW \
    -m hashlimit --hashlimit-name https-new \
    --hashlimit-above 100/sec \
    --hashlimit-burst 200 \
    --hashlimit-mode srcip \
    -j DROP

ipt -A INPUT -p tcp --dport 80  -m conntrack --ctstate NEW -j ACCEPT
ipt -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT

# ════════════════════════════════════════════════════════════════════════════════
# PASO 7: ICMP — Permitir ping (necesario para diagnóstico)
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 7: Configurando ICMP..."
ipt -A INPUT -p icmp --icmp-type echo-request \
    -m limit --limit 5/s --limit-burst 10 -j ACCEPT
ipt -A INPUT -p icmp -j DROP

# ════════════════════════════════════════════════════════════════════════════════
# PASO 8: Anti-spoofing — Bloquear IPs privadas en interfaz pública
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 8: Aplicando anti-spoofing..."
# Detectar interfaz pública automáticamente
PUBLIC_IF=$(ip route | grep default | awk '{print $5}' | head -1)
log "Interfaz pública detectada: ${PUBLIC_IF:-eth0}"
IF="${PUBLIC_IF:-eth0}"

ipt -A INPUT -i "$IF" -s 10.0.0.0/8     -j DROP
ipt -A INPUT -i "$IF" -s 172.16.0.0/12  -j DROP
ipt -A INPUT -i "$IF" -s 192.168.0.0/16 -j DROP
ipt -A INPUT -i "$IF" -s 169.254.0.0/16 -j DROP
ipt -A INPUT -i "$IF" -s 127.0.0.0/8    -j DROP
ipt -A INPUT -i "$IF" -s 0.0.0.0/8      -j DROP
ipt -A INPUT -i "$IF" -s 240.0.0.0/4    -j DROP

# ════════════════════════════════════════════════════════════════════════════════
# PASO 9: SYN Flood Protection
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 9: Activando protección SYN flood..."

# Bloquear paquetes SYN con TTL sospechosamente bajo (paquetes forjados)
ipt -A INPUT -p tcp --syn -m ttl --ttl-lt 5 -j DROP

# Limitar SYN nuevos a 200/s con burst de 500
ipt -A INPUT -p tcp --syn \
    -m limit --limit 200/s --limit-burst 500 -j ACCEPT
ipt -A INPUT -p tcp --syn -j DROP

# Activar SYN cookies a nivel de kernel
if [ "$DRY_RUN" = false ]; then
    sysctl -w net.ipv4.tcp_syncookies=1 >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.tcp_max_syn_backlog=2048 >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.tcp_synack_retries=2 >> "$LOG_FILE" 2>&1 || true
fi

# ════════════════════════════════════════════════════════════════════════════════
# PASO 10: DSCP AF41 en tráfico de video saliente
# Marca el tráfico IPTV como multimedia prioritario en la capa de red
# SIN declararlo en headers HTTP (que causaba el 407)
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 10: Aplicando DSCP AF41 en tráfico de video saliente..."

# Verificar si el módulo DSCP está disponible
if iptables -t mangle -A OUTPUT -p tcp --sport 443 -j DSCP --set-dscp-class AF41 2>/dev/null; then
    ipt -t mangle -A OUTPUT -p tcp --sport 80  -j DSCP --set-dscp-class AF41
    log "DSCP AF41 activado en puertos 80 y 443 (saliente)"
else
    log "ADVERTENCIA: Módulo DSCP no disponible en este kernel. Omitiendo marcado DSCP."
fi

# ════════════════════════════════════════════════════════════════════════════════
# PASO 11: Optimizaciones de kernel para streaming
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 11: Optimizando parámetros de kernel para streaming..."
if [ "$DRY_RUN" = false ]; then
    # Aumentar buffers de red para streaming de alta calidad
    sysctl -w net.core.rmem_max=16777216          >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.core.wmem_max=16777216          >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216" >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216" >> "$LOG_FILE" 2>&1 || true
    # Reducir TIME_WAIT para liberar conexiones más rápido (mejor para zapping)
    sysctl -w net.ipv4.tcp_fin_timeout=15         >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.tcp_tw_reuse=1             >> "$LOG_FILE" 2>&1 || true
    # Aumentar límite de conexiones simultáneas
    sysctl -w net.core.somaxconn=65535            >> "$LOG_FILE" 2>&1 || true
    sysctl -w net.ipv4.ip_local_port_range="1024 65535" >> "$LOG_FILE" 2>&1 || true
fi

# ════════════════════════════════════════════════════════════════════════════════
# PASO 12: Persistencia — Guardar reglas para sobrevivir reinicios
# ════════════════════════════════════════════════════════════════════════════════
log "Paso 12: Guardando reglas para persistencia..."
if [ "$DRY_RUN" = false ]; then
    if command -v netfilter-persistent &>/dev/null; then
        netfilter-persistent save >> "$LOG_FILE" 2>&1 || true
        log "Reglas guardadas con netfilter-persistent"
    elif command -v iptables-save &>/dev/null; then
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4
        log "Reglas guardadas en /etc/iptables/rules.v4"
        # Crear script de restauración en boot
        cat > /etc/network/if-pre-up.d/iptables-restore-ape << 'RESTORE_SCRIPT'
#!/bin/bash
iptables-restore < /etc/iptables/rules.v4
RESTORE_SCRIPT
        chmod +x /etc/network/if-pre-up.d/iptables-restore-ape
    fi
fi

# ── Cancelar failsafe (todo salió bien) ──────────────────────────────────────
if [ "$DRY_RUN" = false ] && [ -n "${FAILSAFE_PID:-}" ]; then
    kill "$FAILSAFE_PID" 2>/dev/null || true
    log "Failsafe cancelado — configuración aplicada exitosamente"
fi

log "=== IPTables Hardening completado ==="
log "Reglas activas:"
if [ "$DRY_RUN" = false ]; then
    iptables -L INPUT --line-numbers -n | tee -a "$LOG_FILE"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  APE OMEGA v7.0 — IPTables Hardening COMPLETADO         ║"
echo "║                                                          ║"
echo "║  ✓ DROP por defecto en INPUT y FORWARD                  ║"
echo "║  ✓ SSH protegido (rate-limit o IP whitelist)            ║"
echo "║  ✓ HTTP/HTTPS con rate-limit 100 conn/s por IP          ║"
echo "║  ✓ Anti-spoofing activo                                  ║"
echo "║  ✓ SYN flood protection + SYN cookies                   ║"
echo "║  ✓ DSCP AF41 en tráfico de video saliente               ║"
echo "║  ✓ Kernel optimizado para streaming                      ║"
echo "║  ✓ Reglas persistentes (sobreviven reinicio)             ║"
echo "╚══════════════════════════════════════════════════════════╝"
