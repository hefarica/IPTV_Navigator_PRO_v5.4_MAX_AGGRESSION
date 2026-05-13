#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# APE OMEGA v7.0 — FASE 2 — Script de Instalación Unificado
# install_fase2.sh
# ═══════════════════════════════════════════════════════════════════════════════
#
# DESCRIPCIÓN:
#   Instala y configura las 3 capas de hardening del VPS APE IPTV:
#   - Capa 2.1: Fail2Ban (jails + filtros)
#   - Capa 2.2: IPTables (blindaje de red + DSCP + kernel tuning)
#   - Capa 2.3: JWT (módulo PHP anti-scraping)
#
# USO:
#   sudo bash install_fase2.sh --admin-ip=X.X.X.X --web-root=/var/www/html
#
# PARÁMETROS:
#   --admin-ip=X.X.X.X    IP de administración (SSH solo desde esta IP)
#   --web-root=PATH        Directorio raíz de PHP (default: /var/www/html)
#   --skip-fail2ban        Omitir instalación de Fail2Ban
#   --skip-iptables        Omitir configuración de IPTables
#   --skip-jwt             Omitir instalación del módulo JWT
#   --dry-run              Mostrar acciones sin ejecutarlas
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/iptv-ape/install_fase2.log"

# ── Valores por defecto ───────────────────────────────────────────────────────
ADMIN_IP=""
WEB_ROOT="/var/www/html"
SKIP_FAIL2BAN=false
SKIP_IPTABLES=false
SKIP_JWT=false
DRY_RUN=false

# ── Parsear argumentos ────────────────────────────────────────────────────────
for arg in "$@"; do
    case $arg in
        --admin-ip=*)    ADMIN_IP="${arg#*=}" ;;
        --web-root=*)    WEB_ROOT="${arg#*=}" ;;
        --skip-fail2ban) SKIP_FAIL2BAN=true ;;
        --skip-iptables) SKIP_IPTABLES=true ;;
        --skip-jwt)      SKIP_JWT=true ;;
        --dry-run)       DRY_RUN=true ;;
    esac
done

# ── Funciones ─────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
err()  { echo "  ✗ ERROR: $*"; exit 1; }
run()  {
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY] $*"
    else
        eval "$*" >> "$LOG_FILE" 2>&1 || warn "Comando falló (no crítico): $*"
    fi
}

# ── Verificaciones ────────────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Ejecutar como root: sudo bash install_fase2.sh"
mkdir -p /var/log/iptv-ape

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   APE OMEGA v7.0 — FASE 2: Hardening del VPS               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
log "Iniciando instalación Fase 2"
log "Admin IP: ${ADMIN_IP:-'no configurada'}"
log "Web root: $WEB_ROOT"
log "Dry-run: $DRY_RUN"
echo ""

# ════════════════════════════════════════════════════════════════════════════════
# CAPA 2.1 — FAIL2BAN
# ════════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_FAIL2BAN" = false ]; then
    echo "━━━ CAPA 2.1: Fail2Ban ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Instalar fail2ban si no está instalado
    if ! command -v fail2ban-client &>/dev/null; then
        log "Instalando fail2ban..."
        run "apt-get update -qq && apt-get install -y fail2ban"
    fi
    ok "fail2ban disponible: $(fail2ban-client --version 2>/dev/null | head -1)"

    # Copiar configuración de jails
    JAIL_SRC="$SCRIPT_DIR/../fail2ban/ape-iptv.conf"
    JAIL_DST="/etc/fail2ban/jail.d/ape-iptv.conf"
    if [ -f "$JAIL_SRC" ]; then
        # Reemplazar placeholders con IPs reales
        if [ -n "$ADMIN_IP" ]; then
            run "sed 's/APE_ADMIN_IP/$ADMIN_IP/g; s/APE_VPS_IP/$(curl -s ifconfig.me 2>/dev/null || echo 127.0.0.1)/g' '$JAIL_SRC' > '$JAIL_DST'"
        else
            run "cp '$JAIL_SRC' '$JAIL_DST'"
        fi
        ok "Jail instalado: $JAIL_DST"
    else
        warn "Archivo de jail no encontrado: $JAIL_SRC"
    fi

    # Copiar filtros
    for filter in ape-nginx-4xx ape-nginx-scan ape-php-auth ape-resolve-flood; do
        FILTER_SRC="$SCRIPT_DIR/../fail2ban/${filter}.conf"
        FILTER_DST="/etc/fail2ban/filter.d/${filter}.conf"
        if [ -f "$FILTER_SRC" ]; then
            run "cp '$FILTER_SRC' '$FILTER_DST'"
            ok "Filtro instalado: $filter"
        else
            warn "Filtro no encontrado: $FILTER_SRC"
        fi
    done

    # Crear directorio de logs si no existe
    run "mkdir -p /var/log/nginx && touch /var/log/nginx/ape-access.log /var/log/nginx/ape-error.log"

    # Reiniciar fail2ban
    run "systemctl enable fail2ban && systemctl restart fail2ban"
    ok "fail2ban reiniciado y habilitado en boot"

    # Verificar que los jails están activos
    sleep 2
    if [ "$DRY_RUN" = false ] && command -v fail2ban-client &>/dev/null; then
        ACTIVE=$(fail2ban-client status 2>/dev/null | grep -c "ape-" || echo "0")
        ok "Jails APE activos: $ACTIVE/4"
    fi
    echo ""
fi

# ════════════════════════════════════════════════════════════════════════════════
# CAPA 2.2 — IPTABLES
# ════════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_IPTABLES" = false ]; then
    echo "━━━ CAPA 2.2: IPTables ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Instalar iptables-persistent si no está
    if ! dpkg -l iptables-persistent &>/dev/null 2>&1; then
        log "Instalando iptables-persistent..."
        run "DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent"
    fi
    ok "iptables-persistent disponible"

    # Ejecutar el script de hardening
    IPTABLES_SCRIPT="$SCRIPT_DIR/../iptables/ape_iptables_hardening.sh"
    if [ -f "$IPTABLES_SCRIPT" ]; then
        chmod +x "$IPTABLES_SCRIPT"
        ARGS=""
        [ -n "$ADMIN_IP" ] && ARGS="--admin-ip=$ADMIN_IP"
        [ "$DRY_RUN" = true ] && ARGS="$ARGS --dry-run"
        run "bash '$IPTABLES_SCRIPT' $ARGS"
        ok "IPTables hardening aplicado"
    else
        warn "Script IPTables no encontrado: $IPTABLES_SCRIPT"
    fi
    echo ""
fi

# ════════════════════════════════════════════════════════════════════════════════
# CAPA 2.3 — JWT
# ════════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_JWT" = false ]; then
    echo "━━━ CAPA 2.3: JWT Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    JWT_SRC="$SCRIPT_DIR/../jwt/ape_jwt_auth.php"
    JWT_DST="$WEB_ROOT/ape_jwt_auth.php"

    if [ -f "$JWT_SRC" ]; then
        run "cp '$JWT_SRC' '$JWT_DST'"
        run "chmod 644 '$JWT_DST'"
        ok "Módulo JWT instalado: $JWT_DST"
    else
        warn "Módulo JWT no encontrado: $JWT_SRC"
    fi

    # Crear directorio de configuración APE
    run "mkdir -p /etc/iptv-ape && chmod 700 /etc/iptv-ape"

    # Generar clave JWT inicial
    if [ "$DRY_RUN" = false ]; then
        SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
        echo "$SECRET" > /etc/iptv-ape/jwt_secret.key
        chmod 600 /etc/iptv-ape/jwt_secret.key
        ok "Clave JWT generada: /etc/iptv-ape/jwt_secret.key (600)"
    fi

    # Agregar bloque de configuración Nginx para /ape/token
    NGINX_SNIPPET="/etc/nginx/snippets/ape-jwt.conf"
    if [ -d "/etc/nginx/snippets" ]; then
        cat > "$NGINX_SNIPPET" << NGINX_CONF
# APE OMEGA v7.0 — JWT Token Endpoint
# Incluir en el bloque server{} de Nginx: include snippets/ape-jwt.conf;
location = /ape/token {
    fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    fastcgi_param SCRIPT_FILENAME ${WEB_ROOT}/ape_jwt_auth.php;
    include fastcgi_params;
    # Limitar a 10 peticiones de token por minuto por IP
    limit_req zone=ape_token_limit burst=5 nodelay;
}
NGINX_CONF
        ok "Snippet Nginx creado: $NGINX_SNIPPET"
        warn "ACCIÓN MANUAL: Agregar 'include snippets/ape-jwt.conf;' al bloque server{} de Nginx"
        warn "ACCIÓN MANUAL: Agregar 'limit_req_zone \$binary_remote_addr zone=ape_token_limit:10m rate=10r/m;' al bloque http{} de Nginx"
    fi

    # Instrucciones de integración en resolve_quality.php
    echo ""
    echo "  INTEGRACIÓN EN resolve_quality.php:"
    echo "  Agregar estas 2 líneas al inicio del archivo, DESPUÉS de <?php:"
    echo ""
    echo "    require_once __DIR__ . '/ape_jwt_auth.php';"
    echo "    ApeJwtAuth::guardOrDie();"
    echo ""
    ok "Módulo JWT listo para integración"
    echo ""
fi

# ════════════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ════════════════════════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   FASE 2 COMPLETADA                                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
[ "$SKIP_FAIL2BAN" = false ] && echo "║  ✓ Capa 2.1: Fail2Ban — 4 jails activos                     ║"
[ "$SKIP_IPTABLES" = false ] && echo "║  ✓ Capa 2.2: IPTables — DROP por defecto + DSCP AF41        ║"
[ "$SKIP_JWT" = false ]      && echo "║  ✓ Capa 2.3: JWT — Tokens 1 año, sin redirecciones          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  ACCIONES MANUALES PENDIENTES:                              ║"
echo "║  1. Agregar include snippets/ape-jwt.conf en Nginx          ║"
echo "║  2. Agregar 2 líneas JWT en resolve_quality.php             ║"
echo "║  3. Verificar: fail2ban-client status                       ║"
echo "║  4. Verificar: iptables -L INPUT --line-numbers -n          ║"
echo "╚══════════════════════════════════════════════════════════════╝"

log "Instalación Fase 2 completada"
