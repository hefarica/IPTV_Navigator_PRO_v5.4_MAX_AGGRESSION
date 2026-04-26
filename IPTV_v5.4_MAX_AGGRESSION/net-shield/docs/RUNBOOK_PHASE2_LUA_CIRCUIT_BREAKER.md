# Runbook — Fase 3.5 Phase 2: Lua Circuit Breaker per Upstream

Despliegue de la state machine Lua que sustituye a la fase vanilla NGINX (rolled back 2026-04-25 13:15 UTC tras 8066 trips/4h, demasiado agresiva). Esta fase aplica stealth **solo cuando el upstream realmente rechaza**, no preventivamente.

## Contexto y por qué Lua

Vanilla `limit_req rate=3r/s burst=15 delay=10` rechazó 66% del tráfico legítimo en 4h porque:
- Patrón real: TiviMate + segundo peer prefetching + M3U8 generator probing → bursts de 5-10 req/s al mismo upstream son **normales**, no scraping
- `limit_req` no distingue tráfico humano bursty de scraping real
- Doctrina Fase 3.5: "Si upstream OK → DICTATOR; si upstream rechaza → STEALTH" — vanilla no lee respuestas del upstream, solo cuenta requests entrantes

Lua permite **leer status del upstream** (header_filter_by_lua) y **gatear solo cuando hay evidencia de rechazo**. Mirror exacto del JS Pilar 5 ya desplegado en frontend.

## Files ya preparados en repo

- `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_gate.lua` — pre-fetch gate
- `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua` — post-response state machine
- `IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/openresty-future-integration.conf` — referencia de integración

## Decisión arquitectónica: módulo dinámico vs reemplazo de binario

| Opción | Pros | Contras | Recomendado |
|---|---|---|---|
| **A. `libnginx-mod-http-lua` (paquete Ubuntu)** | Mantiene nginx 1.24 vanilla. `apt install` simple. Reversible. Sin downtime extendido. | Menos libs Lua que OpenResty bundle. Versión Lua puede ser más vieja. | ✅ **Sí** — empezar aquí |
| **B. OpenResty (reemplazo binario)** | Bundle completo con lua-resty-core, lua-resty-string, etc. Versión Lua moderna. | Reemplaza nginx vanilla → ventana 30-60s downtime. Migración de configs `/etc/nginx/` → `/usr/local/openresty/`. Riesgo alto. | Solo si A falla |

Este runbook implementa **Opción A**. Si en Etapa 3 (test sintético) detectamos que falta función Lua que necesitamos, escalamos a Opción B en runbook separado.

## Pre-requisitos

- Acceso SSH root al VPS productivo 178.156.147.234
- Ventana baja-actividad (idealmente sin streaming activo, 30 min)
- Backup íntegro de `/etc/nginx/` (lo hacemos en Etapa 1)
- Vanilla rollback confirmado (no hay `stealth_upstream_*` en config) — hecho 2026-04-25 13:15 UTC

## Estado deseado al final del runbook

- nginx 1.24 con módulo `ngx_http_lua_module` cargado
- `/etc/nginx/lua/upstream_gate.lua` y `upstream_response.lua` deployed
- `lua_shared_dict upstream_state 20m` declarado en `http {}` context
- Hooks `access_by_lua_file` + `header_filter_by_lua_file` activos en shield location
- Comportamiento: 2xx → reset, 4xx/5xx → backoff exp + cooldown, todo per upstream host
- xtream_slot=1 pre-existente intacto

---

## Etapa 1 — Reconocimiento + Backup

**Read-only, sin riesgo.**

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
# Disponibilidad del paquete
apt-cache show libnginx-mod-http-lua 2>&1 | head -10

# ¿Ya instalado? (probablemente no)
dpkg -l | grep nginx-mod-http-lua || echo "NOT_INSTALLED"

# Versión Lua disponible
apt-cache show libnginx-mod-http-lua | grep -E '^(Version|Depends)' || true

# Estado de los módulos cargados actualmente
ls /etc/nginx/modules-enabled/ 2>/dev/null
ls /usr/lib/nginx/modules/*.so 2>/dev/null | head -10

# Backup íntegro
TS=$(date +%Y%m%d_%H%M%S)
BACKUP=/root/backups/nginx_pre_lua_${TS}
mkdir -p ${BACKUP}
tar czf ${BACKUP}/etc_nginx.tar.gz -C / etc/nginx
nginx -T > ${BACKUP}/nginx_dashT_full.txt 2>&1
echo "BACKUP=${BACKUP}"
ls -la ${BACKUP}
EOF
```

**Criterios de aceptación**:
- `libnginx-mod-http-lua` disponible en apt
- Backup creado y verificable
- Si paquete NO disponible → STOP, escalar a Opción B (OpenResty) en runbook separado

---

## Etapa 2 — Instalar módulo Lua

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
set -e
DEBIAN_FRONTEND=noninteractive apt-get install -y libnginx-mod-http-lua

# Verificar que se instaló
dpkg -l | grep nginx-mod-http-lua

# Listar módulos disponibles
ls -la /usr/share/nginx/modules-available/mod-http-lua.conf 2>&1
cat /usr/share/nginx/modules-available/mod-http-lua.conf 2>&1
ls -la /etc/nginx/modules-enabled/ 2>&1

# Test config (el módulo se auto-enabled)
nginx -t 2>&1 | tail -3
EOF
```

**Criterios de aceptación**:
- Paquete instalado
- `nginx -t` PASS con módulo cargado
- Símbolo `ngx_http_lua_module.so` listable en /usr/lib/nginx/modules/

**NO reload todavía**. El módulo está cargado pero no usado.

---

## Etapa 3 — Subir Lua scripts + declarar shared dict

```bash
# Desde local (Windows bash):
scp "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_gate.lua" \
    root@178.156.147.234:/etc/nginx/lua/upstream_gate.lua

scp "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/lua/upstream_response.lua" \
    root@178.156.147.234:/etc/nginx/lua/upstream_response.lua

# (Crear /etc/nginx/lua/ si no existe primero)
ssh root@178.156.147.234 'bash -s' << 'EOF'
set -e
mkdir -p /etc/nginx/lua
chmod 755 /etc/nginx/lua

# Crear archivo nuevo con shared dict para el http context
cat > /etc/nginx/conf.d/iptv-lua-circuit.conf << 'NGINX_EOF'
# ═══════════════════════════════════════════════════════════════════════════
# NET SHIELD Fase 3.5 Phase 2 — Lua Circuit Breaker per upstream host
# ───────────────────────────────────────────────────────────────────────────
# Estado in-memory por worker → multi-worker requires shared dict.
# 20MB ≈ ~250k entries (key=host, value=state JSON).
# ═══════════════════════════════════════════════════════════════════════════
lua_shared_dict upstream_state 20m;
NGINX_EOF
chmod 644 /etc/nginx/conf.d/iptv-lua-circuit.conf

ls -la /etc/nginx/lua/
ls -la /etc/nginx/conf.d/iptv-lua-circuit.conf
EOF

# Validar (todavía sin hooks en location)
ssh root@178.156.147.234 'nginx -t 2>&1 | tail -3'
```

**Criterios de aceptación**:
- Archivos Lua presentes con permisos correctos
- `lua_shared_dict` declarado en http context
- `nginx -t` PASS

---

## Etapa 4 — Integrar hooks en shield-location.conf

**Cambio quirúrgico**: añadir 2 directivas dentro del `location ~ ^/shield/...` justo después del `auth_request` y antes del `proxy_pass`.

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
set -e
TS=$(date +%Y%m%d_%H%M%S)
SHIELD=/etc/nginx/snippets/shield-location.conf

# Backup pre-cambio
cp ${SHIELD} ${SHIELD}.bak_pre_lua_${TS}

# Inyección quirúrgica con python3 (anchor + insert)
python3 << 'PY'
p = '/etc/nginx/snippets/shield-location.conf'
content = open(p).read()

if 'access_by_lua_file' in content:
    print("ALREADY: hook ya presente, skip")
    raise SystemExit(0)

anchor = 'auth_request_set $shield_owner $upstream_http_x_shield_owner;'
inject = '''auth_request_set $shield_owner $upstream_http_x_shield_owner;

    # >>> NET SHIELD Fase 3.5 Phase 2: Lua Circuit Breaker <<<
    # PRE: gate de cooldown — si host en cooldown activo → 503 sin tocar upstream
    access_by_lua_file /etc/nginx/lua/upstream_gate.lua;
    # POST: state machine — actualiza retry/cooldown según status del upstream
    header_filter_by_lua_file /etc/nginx/lua/upstream_response.lua;
    # <<< End Phase 2 <<<'''

if anchor not in content:
    print("ERROR: anchor not found")
    raise SystemExit(2)

new = content.replace(anchor, inject, 1)
open(p, 'w').write(new)
print("INJECTED_OK")
PY

# Diff
diff -u ${SHIELD}.bak_pre_lua_${TS} ${SHIELD} | head -20

# Validar
nginx -t 2>&1 | tail -3
EOF
```

**Criterios de aceptación**:
- Diff muestra solo 6 líneas añadidas (los 2 hooks + comentarios)
- `nginx -t` PASS sin errores Lua
- Backup creado

**NO reload todavía**.

---

## Etapa 5 — Reload + smoke test sintético

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
set -e
echo "=== Reload ==="
systemctl reload nginx
sleep 1
systemctl is-active nginx
ps -ef | grep -c '[n]ginx: worker'

echo "=== ¿Lua activo? buscar mensajes init ==="
tail -20 /var/log/nginx/error.log

echo "=== Test 1: 5 requests con token inválido — esperamos 200/302/403, header X-APE-Circuit ==="
for i in 1 2 3 4 5; do
  curl -sI "http://127.0.0.1/shield/00000000/nfqdeuxu.x1megaott.online/test.m3u8" -H "Host: iptv-ape.duckdns.org" 2>&1 | grep -E '^(HTTP|X-APE)' | head -3
  echo "---"
done

echo "=== Test 2: dict tiene entries? (vía lua) ==="
# Forzar un check del shared dict sin tocar producción
curl -s "http://127.0.0.1/shield/00000000/test.invalid/test.m3u8" -H "Host: iptv-ape.duckdns.org" -o /dev/null -w "HTTP %{http_code}\n"

echo "=== Errors recientes ==="
tail -10 /var/log/nginx/shield_error.log
EOF
```

**Criterios de aceptación**:
- nginx active post-reload, workers respawned
- 0 errores Lua en error log (no `[error] X failed to load Y`)
- Header `X-APE-Circuit` aparece en respuestas (puede ser `reset` o ausente si no hay state previa)
- Tráfico real cursando (verificar `wg show wg0 transfer` aumenta)

---

## Etapa 6 — Observación 1h

```bash
# Cada 15 min:
ssh root@178.156.147.234 'bash -s' << 'EOF'
echo "=== Estado dict (quick & dirty via Lua hook) ==="
# El Lua escribe logs warn cuando hace backoff. Counts:
grep -c '\[APE-CIRCUIT\]' /var/log/nginx/error.log /var/log/nginx/shield_error.log 2>/dev/null

echo "=== Tipos de evento Lua ==="
grep '\[APE-CIRCUIT\]' /var/log/nginx/error.log /var/log/nginx/shield_error.log 2>/dev/null | \
  grep -oE 'status=[0-9]+' | sort | uniq -c | sort -rn | head

echo "=== ¿Reset por 2xx ocurre? ==="
grep -c 'X-APE-Circuit: reset' /var/log/nginx/shield_access.log 2>/dev/null || echo "0"

echo "=== ¿Backoff por 4xx/5xx? ==="
grep -c 'X-APE-Circuit: backoff' /var/log/nginx/shield_access.log 2>/dev/null || echo "0"

echo "=== ¿Cooldown disparó? (503 con header X-APE-Circuit: cooldown) ==="
grep -c 'X-APE-Circuit: cooldown' /var/log/nginx/shield_access.log 2>/dev/null || echo "0"

echo "=== Total requests + status dist post-deploy ==="
DEPLOY="$(stat -c %Y /etc/nginx/lua/upstream_gate.lua | xargs -I{} date -u -d @{} +%Y-%m-%dT%H:%M:%S)"
echo "Deploy ts: ${DEPLOY}"
awk -v d="${DEPLOY}" '
  match($0, /\[2026-[0-9-]+T[0-9:]+/) {
    ts=substr($0, RSTART+1, RLENGTH-1);
    if (ts >= d) print $7
  }' /var/log/nginx/shield_access.log 2>/dev/null | sort | uniq -c | sort -rn | head
EOF
```

**Criterios de aceptación T+1h**:
- 0 errores Lua nuevos
- Si hay backoff events → solo cuando upstream realmente devolvió 4xx/5xx
- 0 cooldowns disparados sin justificación (i.e., todos los cooldowns deben corresponder a hosts que tuvieron 5+ errores secuenciales reales)
- Tráfico fluye normalmente (counts 200 dominan)

---

## Etapa 7 — Validación 24h vs comparación con baseline pre-Lua

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
echo "=== Sentinel signature delta vs T0 baseline ==="
cat /opt/netshield/state/signatures.json | python3 -c '
import json,sys
d=json.load(sys.stdin)
lc=d.get("lifetime_counts",{})
baseline_t0={"nginx_upstream_prem_closed":975,"nginx_connect_refused":195,"iptv_slow_response":53,"iptv_5xx":4}
print("Signature           T0     T+24h    Δ")
for k,v0 in baseline_t0.items():
    v=lc.get(k,0)
    delta=v-v0
    pct=(100*delta/v0) if v0>0 else 0
    print(f"{k:30s} {v0:>5d} {v:>5d}  {delta:+d} ({pct:+.0f}%)")
'

echo "=== Lua circuit events (counts por upstream) ==="
grep '\[APE-CIRCUIT\]' /var/log/nginx/error.log /var/log/nginx/shield_error.log 2>/dev/null | \
  grep -oE 'host=[^ ]+ status=[0-9]+' | sort | uniq -c | sort -rn | head -20
EOF
```

**Decisión Go/No-Go T+24h**:
- 🟢 **GREEN**: ↓ ≥30% en (`nginx_upstream_prem_closed` + `nginx_connect_refused`) AND 0 falsos cooldowns. → Mantener producción, planear ajuste fino
- 🟡 **YELLOW**: ↓ <30% AND 0 regresiones. → Mantener, observar otras 24h
- 🔴 **RED**: regresiones (5xx, slow, freeze ONN reportado por usuario). → Rollback Etapa 8

---

## Etapa 8 — Rollback (siempre listo)

```bash
ssh root@178.156.147.234 'bash -s' << 'EOF'
set -e
TS=$(date +%Y%m%d_%H%M%S)

# 1. Restaurar shield-location.conf a versión sin hooks Lua
LATEST_BAK=$(ls -t /etc/nginx/snippets/shield-location.conf.bak_pre_lua_* 2>/dev/null | head -1)
[[ -n "$LATEST_BAK" ]] && cp "$LATEST_BAK" /etc/nginx/snippets/shield-location.conf

# 2. Eliminar conf con shared_dict
rm -f /etc/nginx/conf.d/iptv-lua-circuit.conf

# 3. Validar y reload
nginx -t && systemctl reload nginx
echo "[OK] Rollback completo"

# 4. Verificar
nginx -T | grep -E 'lua_shared_dict|access_by_lua|header_filter_by_lua' | head || echo "(ninguna directiva Lua activa — rollback OK)"
EOF
```

**Si querés desinstalar el módulo también** (rollback profundo):

```bash
ssh root@178.156.147.234 'apt remove -y libnginx-mod-http-lua && systemctl reload nginx'
```

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Módulo Lua dispara segfault en worker | Worker se reinicia automáticamente (nginx supervisor). Si recurrente → rollback Etapa 8 |
| `lua_shared_dict 20m` se llena | Monitor: añadir métrica de uso. Si llena → escalar a 50m |
| Race condition get+set en dict bajo carga alta | Aceptable — peor caso doble update, eventualmente consistente. Lua atomic ops para counters disponibles si necesario |
| Lua scripts fallan parsear → nginx no levanta | `nginx -t` antes de reload SIEMPRE. Backup garantiza rollback en <30s |
| Lua latency adds TTFB | Lua add ~0.1ms por hook. Insignificante vs zapping target <200ms. Verificar empíricamente en Etapa 5. |
| Versión Lua muy vieja para sintaxis usada | Etapa 1 verifica versión. Scripts usan Lua 5.1 puro, sin features modernas. Compatible con LuaJIT 2.0+. |

## Tunables conocidos (post-deploy)

| Param | Inicial (lua) | Subir si... | Bajar si... |
|---|---|---|---|
| Backoff base (ms) | 1000 | Provider sigue 4xx tras retries | Recuperación demasiado lenta |
| Cooldown range | 5–15 min | Provider banea persistente | Cooldown impacta UX |
| `lua_shared_dict` size | 20m | Logs muestran "no memory" | (poco impacto reducir) |
| Status triggers | 400/401/403/405/429/5xx | Otros status también dispararon ban | Falsos positivos en algún status |

## Próximos pasos post-Phase 2 estable

- **Métricas en Sentinel**: añadir signature `lua_circuit_cooldown` para visibility
- **Dashboard frontend**: exponer dict counts vía JSON endpoint
- **Sub-proyecto C** (Multi-VPS HA reframed): solo después de 7+ días Phase 2 estable

## Estimación de tiempo

| Etapa | Duración | Riesgo |
|---|---|---|
| 1. Recon + backup | 5 min | Nulo |
| 2. Instalar módulo | 2 min | Bajo |
| 3. Subir Lua + dict | 3 min | Bajo |
| 4. Integrar hooks | 5 min | Medio |
| 5. Reload + smoke | 5 min | Medio |
| 6. Observación 1h | 60 min | (pasivo) |
| 7. Validación 24h | 24 h | (pasivo) |
| 8. Rollback ready | <2 min | (defensivo) |

**Tiempo activo total**: ~20 min antes de empezar observación. Ventana corta vs OpenResty replacement (≥1h).
