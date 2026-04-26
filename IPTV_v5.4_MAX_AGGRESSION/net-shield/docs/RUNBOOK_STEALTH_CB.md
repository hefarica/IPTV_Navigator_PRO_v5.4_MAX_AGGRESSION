# Runbook — Stealth Circuit Breaker (Sub-proyecto B core)

Aplicación de `stealth-circuit-breaker.conf` en VPS `178.156.147.234`.

**Pre-requisitos:**
- Acceso SSH root al VPS
- Ventana baja-sensibilidad (~30 min, idealmente sin ONN 4K activo viendo)
- Backup de `/etc/nginx/` íntegro
- Conocer el path exacto del `server`/`location` del shield (a confirmar en VPS)

---

## Etapa 1 — Reconocimiento (lectura, no modifica)

```bash
ssh root@178.156.147.234 << 'EOF'
# Inventario shield
nginx -V 2>&1 | grep -oE 'with-[a-z_]+lua[a-z_]*' || echo "vanilla nginx (no Lua module)"
ls -la /etc/nginx/sites-enabled/
ls -la /etc/nginx/conf.d/
grep -rln 'xtream_slot\|proxy_pass.*megaott\|proxy_pass.*tivi' /etc/nginx/ 2>/dev/null
grep -rln 'limit_req_zone\|limit_conn_zone' /etc/nginx/ 2>/dev/null
EOF
```

**Output esperado:** path del archivo shield (ej: `/etc/nginx/sites-enabled/shield`), confirmación de Lua module status.

---

## Etapa 2 — Backup íntegro

```bash
ssh root@178.156.147.234 << 'EOF'
TS=$(date +%Y%m%d_%H%M%S)
BACKUP=/root/backups/nginx_pre_stealthcb_${TS}
mkdir -p ${BACKUP}
tar czf ${BACKUP}/etc_nginx.tar.gz -C / etc/nginx
nginx -T > ${BACKUP}/nginx_dashT_full_dump.txt 2>&1
iptables-save > ${BACKUP}/iptables_save.txt
systemctl status nginx > ${BACKUP}/nginx_status.txt 2>&1
echo "Backup en: ${BACKUP}"
ls -la ${BACKUP}
EOF
```

---

## Etapa 3 — Subir config nuevo

```bash
# Desde local (Windows bash):
scp "c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/net-shield/nginx/stealth-circuit-breaker.conf" \
    root@178.156.147.234:/etc/nginx/conf.d/stealth-cb-zones.conf.staging

# Validar staging (no activo aún):
ssh root@178.156.147.234 'nginx -t -c /etc/nginx/nginx.conf 2>&1 | head -20'
# Esperado: "nginx: configuration file /etc/nginx/nginx.conf test is successful"
# El archivo en .staging no es leído por NGINX hasta renombrar.
```

**El archivo subido contiene SÓLO los `limit_req_zone` y `limit_conn_zone` (válidos en `http {}`).** El `location` ejemplo es referencia comentada — la integración en el shield real es manual en Etapa 4.

---

## Etapa 4 — Integrar en el shield real

Editar el archivo del shield (ej: `/etc/nginx/sites-enabled/shield`) para añadir DENTRO del `location` que hace `proxy_pass` al upstream IPTV:

```nginx
# >>> Stealth Circuit Breaker (añadir al inicio del location, antes de proxy_pass) <<<
limit_req         zone=upstream_req   burst=15  delay=10;
limit_req_status  429;
limit_conn        upstream_conn       4;
limit_conn_status 429;

proxy_next_upstream         error timeout http_500 http_502 http_503 http_504;
proxy_next_upstream_tries   2;
proxy_next_upstream_timeout 8s;

proxy_connect_timeout       5s;
proxy_send_timeout          10s;
proxy_read_timeout          15s;
# <<< Fin Stealth Circuit Breaker >>>
```

**Activar zones globales** (rename staging → activo):

```bash
ssh root@178.156.147.234 << 'EOF'
mv /etc/nginx/conf.d/stealth-cb-zones.conf.staging /etc/nginx/conf.d/stealth-cb-zones.conf
nginx -t 2>&1 | tail -5
EOF
```

Si `nginx -t` falla, abortar y restaurar Etapa 6.

---

## Etapa 5 — Reload (no full restart)

```bash
ssh root@178.156.147.234 'systemctl reload nginx && systemctl status nginx --no-pager | head -15'
```

**No usar `systemctl restart` salvo que se haya tocado `proxy_cache_path`** (ver `feedback_nginx_cache_path_requires_full_restart.md`). Esta config no toca cache, reload basta.

---

## Etapa 6 — Verificación inmediata

```bash
ssh root@178.156.147.234 << 'EOF'
# ¿Reglas activas?
nginx -T 2>&1 | grep -E 'limit_req|limit_conn|proxy_next_upstream' | head -20

# ¿Errores nuevos en log?
tail -50 /var/log/nginx/error.log

# ¿Tráfico cursando?
tail -30 /var/log/nginx/access.log
EOF
```

**Test sintético desde local** (provocar 429 controlado):

```bash
# Hacer 30 requests rápidas al shield para mismo upstream → debería ver 429 a partir de la req 16
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code} " "https://iptv-ape.duckdns.org/shield/test-channel-1.m3u8"
done
echo
# Esperado: ~15 × 200 + ~15 × 429 (o cola con delay si <15)
```

**Test real de zapping** (con ONN 4K):
- Hacer zapping rápido de 10 canales DISTINTOS en 5 segundos → todos deben abrir <200ms (cada uno tiene su `$proxy_host` distinto si el shield rutea por upstream).
- Hacer zapping del MISMO canal 10 veces en 3 segundos → algunos pueden colarse en delay (queue), pero no debe haber 429 antes del 16°.

---

## Etapa 7 — Rollback (si algo va mal)

```bash
ssh root@178.156.147.234 << 'EOF'
# Restaurar zones
rm -f /etc/nginx/conf.d/stealth-cb-zones.conf

# Restaurar shield original (recordar el path real, ajustar):
cp /root/backups/nginx_pre_stealthcb_*/etc_nginx.tar.gz /tmp/
tar xzf /tmp/etc_nginx.tar.gz -C / etc/nginx/sites-enabled/shield 2>/dev/null \
  || echo "ajustar path del shield manualmente"

# Validar y reload
nginx -t && systemctl reload nginx
systemctl status nginx --no-pager | head -10
EOF
```

**Criterio de rollback inmediato:**
- Cualquier 5xx que NO existía antes
- Zapping TTFB observable >500ms
- ONN 4K reporta freeze que no había
- `nginx -t` falla post-cambio

---

## Etapa 8 — Observación 24h

```bash
ssh root@178.156.147.234 << 'EOF'
# Métrica: ¿bajaron los 403/429 vistos del upstream?
awk '$9 ~ /^(403|429)$/' /var/log/nginx/access.log | tail -50 | wc -l
awk '$9 ~ /^(403|429)$/' /var/log/nginx/access.log.1 | wc -l    # día anterior

# Métrica: ¿cuántos limit_req trips tuvimos?
grep -c 'limiting requests' /var/log/nginx/error.log
EOF
```

**Criterios de éxito (post-24h):**
- Counts de 403/429 desde upstream bajan ≥30% vs 24h previo
- Counts de 429 emitidos por NUESTRO shield al cliente son <5/hora (si es más, el rate=3r/s es muy bajo, subir a 5r/s)
- Zapping TTFB observable sigue <200ms (manual con cronómetro)
- Sin tickets nuevos de freeze por parte tuya

Si todo verde → planificar Sub-proyecto B' (OpenResty/Lua) en ventana siguiente.

---

## Tunables conocidos

| Param | Valor inicial | Subir si... | Bajar si... |
|---|---|---|---|
| `rate` | `3r/s` | Zapping de mismo upstream se traba | Counts de 429 from upstream NO bajan |
| `burst` | `15` | Sigues viendo 429 emitidos por shield | (poco impacto) |
| `delay` | `10` | Zapping perceptiblemente lento | (poco impacto) |
| `limit_conn` | `4` | Hay slots libres y aún 429 | Saturación de slots |
| `proxy_next_upstream_tries` | `2` | Multi-upstream estable | (no debería ser problema) |

---

## Si no hay shield identificable en el VPS

Si Etapa 1 no encuentra el shield (sin grep hits para upstreams típicos), el shield podría ser:
- Un script externo que reescribe URLs en lugar de proxy_pass
- Un servicio en otro puerto (8080, 8081, 8888)
- Un módulo de Apache si conviven

En ese caso: pausar deployment, mapear topología real con `ss -tlnp` y `iptables -L -n -v`, replantear la integración.
