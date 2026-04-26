#!/usr/bin/env bash
# ============================================================================
# NET SHIELD — Checkpoint snapshot vs T0 baseline (Fase 3.5 validación 24-72h)
# Uso: bash checkpoint.sh <label>      ej: bash checkpoint.sh T+24h
# Output: net-shield/metrics/snapshot_<label>_<timestamp>.json
# ============================================================================
set -e

LABEL="${1:?falta label, ej: T+1h, T+24h, T+48h, T+72h}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR="$(dirname "$0")"
OUT="${OUT_DIR}/snapshot_${LABEL//[^A-Za-z0-9+]/_}_${TS}.json"

VPS="${VPS:-178.156.147.234}"
SSH_USER="${SSH_USER:-root}"

# ISO 8601 deploy timestamp — comparación lexicográfica ordenada con logs
DEPLOY_ISO="2026-04-25T08:56:03"

REMOTE_OUT=$(ssh -o BatchMode=yes ${SSH_USER}@${VPS} bash -s <<REMOTE_EOF
set -e
DEPLOY_ISO="${DEPLOY_ISO}"

# ---------- Sentinel snapshot ----------
SENTINEL=\$(cat /dev/shm/netshield_sentinel.json 2>/dev/null || echo '{}')
SIGNATURES=\$(cat /opt/netshield/state/signatures.json 2>/dev/null || echo '{}')

# ---------- Mi rate/conn trips desde deploy ----------
# Formato error.log: 2026/04/25 08:56:03 [error] ...
# Convertimos al vuelo a ISO comparable: "2026-04-25T08:56:03"
LIMIT_REQ=\$(awk -v d="\$DEPLOY_ISO" '
  /limiting requests.*zone "stealth_upstream_req"/ {
    iso = \$1 "T" \$2;
    gsub(/\//, "-", iso);
    if (iso >= d) c++
  }
  END { print c+0 }
' /var/log/nginx/error.log 2>/dev/null)

LIMIT_CONN=\$(awk -v d="\$DEPLOY_ISO" '
  /limiting connections by zone "stealth_upstream_conn"/ {
    iso = \$1 "T" \$2;
    gsub(/\//, "-", iso);
    if (iso >= d) c++
  }
  END { print c+0 }
' /var/log/nginx/error.log 2>/dev/null)

# ---------- shield_access.log: counts desde deploy ----------
# Formato: 178.156.147.234 - [2026-04-25T08:45:07+00:00] "GET ..." 429 ...
SINCE_DEPLOY_REQ=\$(awk -v d="\$DEPLOY_ISO" '
  match(\$0, /\[2026-[0-9-]+T[0-9:]+/) {
    ts = substr(\$0, RSTART+1, RLENGTH-1);
    if (ts >= d) c++
  }
  END { print c+0 }
' /var/log/nginx/shield_access.log 2>/dev/null)

# Status code distribution
STATUS_DIST=\$(awk -v d="\$DEPLOY_ISO" '
  match(\$0, /\[2026-[0-9-]+T[0-9:]+/) {
    ts = substr(\$0, RSTART+1, RLENGTH-1);
    if (ts >= d) print \$7
  }
' /var/log/nginx/shield_access.log 2>/dev/null | sort | uniq -c | sort -rn | \
  awk 'BEGIN{printf "{"} NR>1{printf ","} {gsub(/"/, "", \$2); printf "\"%s\":%d", \$2, \$1} END{print "}"}')

# Avg rt para 200/206
RT_STATS=\$(awk -v d="\$DEPLOY_ISO" '
  match(\$0, /\[2026-[0-9-]+T[0-9:]+/) {
    ts = substr(\$0, RSTART+1, RLENGTH-1);
    if (ts >= d && \$7 ~ /^(200|206)\$/) {
      match(\$0, /rt=[0-9.]+/);
      if (RLENGTH > 3) {
        rt = substr(\$0, RSTART+3, RLENGTH-3) + 0;
        sum += rt; n++;
        if (rt > max) max = rt
      }
    }
  }
  END {
    if (n > 0) printf "{\"rt_avg\":%.4f,\"rt_max\":%.4f,\"samples\":%d}", sum/n, max, n
    else printf "{\"samples\":0}"
  }
' /var/log/nginx/shield_access.log 2>/dev/null)

# Top errores por upstream (4xx/5xx)
TOP_ERRORS=\$(awk -v d="\$DEPLOY_ISO" '
  match(\$0, /\[2026-[0-9-]+T[0-9:]+/) {
    ts = substr(\$0, RSTART+1, RLENGTH-1);
    if (ts >= d && \$7 ~ /^(403|404|429|500|502|503|504)\$/) {
      match(\$0, /\/shield\/[a-f0-9]+\/[^\/]+/);
      s = substr(\$0, RSTART, RLENGTH);
      n2 = split(s, a, "/");
      if (n2 >= 4) print a[4] "|" \$7
    }
  }
' /var/log/nginx/shield_access.log 2>/dev/null | sort | uniq -c | sort -rn | head -10 | \
  awk 'BEGIN{printf "["} NR>1{printf ","} {split(\$2, a, "|"); printf "{\"upstream\":\"%s\",\"status\":%d,\"count\":%d}", a[1], a[2], \$1} END{print "]"}')

# WG transfer
WG_TRANSFER=\$(wg show wg0 transfer 2>/dev/null | \
  awk 'BEGIN{printf "["} NR>1{printf ","} {printf "{\"peer\":\"%s\",\"rx\":%s,\"tx\":%s}", \$1, \$2, \$3} END{print "]"}')

# Load
LOAD=\$(uptime | grep -oE 'load average:.*' | sed 's/load average:[ ]*//')
WORKERS=\$(ps -ef | grep -c '[n]ginx: worker')

cat <<JSON
{
  "captured_at_utc": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sentinel_snapshot": \${SENTINEL},
  "lifetime_counts": \$(echo \$SIGNATURES | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(json.dumps(d.get("lifetime_counts",{})))
except Exception:
    print("{}")'),
  "my_trips_since_deploy": {
    "limit_req_stealth_upstream_req": \${LIMIT_REQ:-0},
    "limit_conn_stealth_upstream_conn": \${LIMIT_CONN:-0}
  },
  "shield_access_since_deploy": {
    "total_requests": \${SINCE_DEPLOY_REQ:-0},
    "status_distribution": \${STATUS_DIST:-"{}"},
    "rt_stats_2xx": \${RT_STATS:-"{}"},
    "top_errors_by_upstream": \${TOP_ERRORS:-"[]"}
  },
  "wg_transfer": \${WG_TRANSFER:-"[]"},
  "nginx_health": {
    "workers": \${WORKERS:-0},
    "load_avg": "\${LOAD}"
  }
}
JSON
REMOTE_EOF
)

echo "${REMOTE_OUT}" > "${OUT}"
echo "[OK] ${LABEL} snapshot → ${OUT}"
echo
echo "Quick read:"
python3 << PYEOF
import json
try:
    d = json.load(open(r'''${OUT}'''))
except Exception as e:
    print(f"WARN: JSON parse failed: {e}")
    raise SystemExit(0)

t = d.get('my_trips_since_deploy', {})
print(f"  my trips: req={t.get('limit_req_stealth_upstream_req',0)} conn={t.get('limit_conn_stealth_upstream_conn',0)}")
print(f"  shield reqs since deploy: {d.get('shield_access_since_deploy',{}).get('total_requests',0)}")
print(f"  status dist: {d.get('shield_access_since_deploy',{}).get('status_distribution',{})}")
print(f"  rt 2xx: {d.get('shield_access_since_deploy',{}).get('rt_stats_2xx',{})}")
lc = d.get('lifetime_counts', {})
for k in ['nginx_upstream_prem_closed','nginx_connect_refused','iptv_slow_response','iptv_5xx','iptv_403','iptv_429']:
    print(f"  {k}: {lc.get(k,0)}")
nh = d.get('nginx_health', {})
print(f"  workers: {nh.get('workers',0)}, load: {nh.get('load_avg','?')}")
PYEOF
