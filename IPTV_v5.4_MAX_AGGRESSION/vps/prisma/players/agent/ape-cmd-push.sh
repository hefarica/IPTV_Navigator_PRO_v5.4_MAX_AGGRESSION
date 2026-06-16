#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# APE — Outbound command operator CLI (VPS-side, par de ape-pull.php / agente)
#   enroll <device_id>          → genera token, guarda sha256(token), IMPRIME el token
#                                  (provisionarlo en el device: /data/local/tmp/ape-agent.token)
#   push   <device_id> <type>   → encola un comando (ENUM allowlisted) para ese device
#   list                        → lista devices enrolados
#   queue  <device_id>          → muestra la cola pendiente
#
# Los comandos son un ENUM seguro: wake | refresh | apply_profile | noop.
# El agente del device los mapea a acciones LOCALES; NUNCA se transmite shell.
# ══════════════════════════════════════════════════════════════════════════
set -eu
BASE="${APE_PRISMA_BASE:-/var/www/html/prisma}"
TOKDIR="$BASE/db/ape_agent_tokens"
CMDDIR="${APE_CMD_DIR:-/dev/shm/ape_cmd}"
ALLOW="wake refresh apply_profile noop"

_id() { printf '%s' "$1" | tr -cd 'A-Za-z0-9_.-'; }

cmd_enroll() {
    dev="$(_id "${1:-}")"; [ -n "$dev" ] || { echo "uso: $0 enroll <device_id>" >&2; exit 2; }
    # [fix deploy 2026-06-09] chown :www-data al DIR (no solo al file): PHP-FPM (www-data) debe poder
    # ATRAVESAR el dir para leer el hash; sin esto, $stored='' → 403 aunque el token sea correcto.
    mkdir -p "$TOKDIR"; chown root:www-data "$TOKDIR" 2>/dev/null || true; chmod 750 "$TOKDIR" 2>/dev/null || true
    # token aleatorio (32 bytes hex). Guardamos SOLO el sha256 (el VPS nunca guarda el token en claro).
    tok="$(head -c 32 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n')"
    [ -n "$tok" ] || { echo "no se pudo generar token (/dev/urandom)" >&2; exit 1; }
    printf '%s' "$tok" | sha256sum | cut -d' ' -f1 > "$TOKDIR/$dev"
    # [sec review MEDIUM] el HASH lo lee PHP-FPM (www-data); chown+640 evita el fallo silencioso de lectura.
    chown root:www-data "$TOKDIR/$dev" 2>/dev/null || true
    chmod 640 "$TOKDIR/$dev" 2>/dev/null || true
    echo "ENROLLED device=$dev"
    echo "TOKEN (provisiónalo en el device → /data/local/tmp/ape-agent.token):"
    echo "$tok"
}

cmd_push() {
    dev="$(_id "${1:-}")"; type="${2:-}"
    [ -n "$dev" ] && [ -n "$type" ] || { echo "uso: $0 push <device_id> <$ (echo $ALLOW|tr ' ' '|')>" >&2; exit 2; }
    case " $ALLOW " in *" $type "*) : ;; *) echo "tipo no permitido: $type (allow: $ALLOW)" >&2; exit 2 ;; esac
    [ -f "$TOKDIR/$dev" ] || { echo "device no enrolado: $dev (corre: $0 enroll $dev)" >&2; exit 2; }
    # [fix deploy 2026-06-09] dir setgid root:www-data (2770) → www-data (pull) puede atravesar+rw;
    # el archivo .jsonl chgrp www-data + 660 → el pull (www-data) lo lee y lo drena (ftruncate).
    mkdir -p "$CMDDIR"; chown root:www-data "$CMDDIR" 2>/dev/null || true; chmod 2770 "$CMDDIR" 2>/dev/null || true
    printf '{"type":"%s","ts":%s}\n' "$type" "$(date +%s)" >> "$CMDDIR/$dev.jsonl"
    chgrp www-data "$CMDDIR/$dev.jsonl" 2>/dev/null || true; chmod 660 "$CMDDIR/$dev.jsonl" 2>/dev/null || true
    echo "QUEUED device=$dev type=$type"
}

cmd_list() { ls -1 "$TOKDIR" 2>/dev/null || echo "(ninguno)"; }
cmd_queue() { dev="$(_id "${1:-}")"; cat "$CMDDIR/$dev.jsonl" 2>/dev/null || echo "(cola vacía)"; }

case "${1:-}" in
    enroll) shift; cmd_enroll "$@" ;;
    push)   shift; cmd_push   "$@" ;;
    list)   cmd_list ;;
    queue)  shift; cmd_queue  "$@" ;;
    *) echo "uso: $0 {enroll <dev>|push <dev> <type>|list|queue <dev>}"; exit 2 ;;
esac
