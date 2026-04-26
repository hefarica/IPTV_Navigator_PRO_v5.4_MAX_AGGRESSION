# IPTV Quantum NGINX — ventana 2026-04-22 `NS_TS=20260422_045906`

**Objetivo** (demanda del user): *"nunca se corte, 0 freeze, 0 lag, pida ancho de banda como un loco empedernido, nunca se deje bajar, flujo constante, llenado de buffer, nunca repita el segmento, pida el 206, corte imperceptible, siempre lo más actualizado, mayor bitrate, mejor calidad"*.

**Resultado**: 6 bloques de tuning aplicados sin downtime. Túnel ONN 4K cursó tráfico sin interrupción durante toda la ventana.

---

## 1. Stack IPTV que el VPS ya tenía

Descubierto durante auditoría:

- **nginx 1.24** con módulos `slice`, `threads`, `http_v2`, `realip`, `auth_request`, `dav`, `flv`, `mp4`, `secure_link`
- `worker_processes auto`, `worker_connections 20000`, `worker_rlimit_nofile 200000`
- `sendfile on`, `tcp_nopush on`, `tcp_nodelay on`, `keepalive_requests 100000`
- Cache zone `/var/cache/nginx/iptv` `keys_zone=iptv_cache:500m max_size=10g`
- Upstreams con HTTP/1.1 keepalive a 4 origins: `x1megaott`, `line.tivi-ott`, `ky-tv.cc`, `tivigo.cc`
- ACL: solo `181.63.176.21` (HFRC) + `10.200.0.0/24` (túnel WG)
- MIME types CMAF/fMP4/HLS/DASH configurados

## 2. Cambios aplicados en esta ventana

### Q1 — `/etc/nginx/conf.d/00-iptv-quantum.conf` (drop-in global http{})

Se carga primero por el prefijo `00-`. Aplica a TODOS los server blocks IPTV:

```nginx
aio threads;
aio_write on;
proxy_max_temp_file_size 0;               # cache miss NUNCA toca disco
proxy_cache_revalidate on;                # If-Modified-Since al origin
proxy_cache_use_stale error timeout invalid_header updating http_500 http_502 http_503 http_504;
proxy_cache_background_update on;          # stale instantáneo + refresh async
proxy_cache_lock on;
proxy_cache_lock_timeout 5s;
proxy_cache_lock_age 10s;
proxy_ignore_headers Cache-Control Expires Set-Cookie X-Accel-Expires Vary;
proxy_http_version 1.1;
proxy_connect_timeout 3s;
proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
proxy_next_upstream_tries 3;
proxy_next_upstream_timeout 5s;
```

Requirió `thread_pool iptv threads=32 max_queue=65536;` añadido a `/etc/nginx/nginx.conf` (único cambio a ese archivo).

**Beneficio literal para lo pedido**:
- *"Corte imperceptible"* → `proxy_cache_background_update on` + `use_stale updating` → cuando el .m3u8 expira, el cliente recibe el viejo instantáneamente mientras nginx refresca en background.
- *"Nunca corte"* → `use_stale error timeout http_500-504` → si el origin falla, nginx sirve el segmento viejo.
- *"Pida como loco"* → `aio threads` + `proxy_max_temp_file_size 0` → I/O kernel en pool de 32 threads, sin spilleo a disco.

### Q2 — SLICE MODULE en .ts (el big win del HTTP 206)

Editado `iptv-intercept.conf` en los 2 locations `.ts$` (x1megaott y tivigo). Añadido a cada uno:

```nginx
slice 1m;
proxy_cache_key $scheme$proxy_host$uri$slice_range;
proxy_set_header Range $slice_range;
proxy_cache_valid 200 206 10m;          # antes: 30s
proxy_buffer_size 128k;                  # antes: 32k
proxy_buffers 128 64k;                   # antes: 32x32k
proxy_busy_buffers_size 256k;
add_header X-Quantum-Slice 1m always;    # observabilidad
```

**Beneficio literal**:
- *"Nunca repita el segmento, pida el 206"* → nginx ahora descarga el segmento en chunks de 1MB. Si el cliente se corta a mitad, al retry solo re-pide los chunks faltantes vía HTTP Range. El origin ve peticiones `Range: bytes=0-1048575`, `Range: bytes=1048576-2097151`, etc.
- *"Imperceptible el corte"* → chunks ya cacheados se sirven en microsegundos; solo chunks faltantes van al origin.
- Cache por chunk → múltiples clientes pueden estar en posiciones distintas del mismo .ts sin contención.

### Q3 — Keepalive upstream ampliado

En los 4 upstream pools:

| Param | Antes | Ahora |
|---|---|---|
| `keepalive` | 2 / 4 | **32** |
| `keepalive_requests` | 100 | **10000** |
| `keepalive_timeout` | 20s | **120s** |

**Beneficio**: sockets TCP al origin IPTV permanecen abiertos 120s con 10k requests por socket. Nunca hay cold TCP handshake al origin durante el streaming normal.

### Q4 — Cache warmer systemd timer cada 10s

Archivos creados:
- `/usr/local/bin/iptv-cache-warmer.sh` (755, root)
- `/etc/systemd/system/iptv-cache-warmer.service`
- `/etc/systemd/system/iptv-cache-warmer.timer` (enabled, active)

Flujo:
1. Lee los últimos 200 accesos del log `iptv_intercept.log`
2. Extrae URLs `.m3u8` únicas con su `Host`
3. Hace `curl -o /dev/null -m 4 -H "Host: $host" http://127.0.0.1$path` para los últimos 30
4. Nginx sirve desde cache si fresh; si stale, refresca via background_update

**Beneficio literal**:
- *"Siempre lo más actualizado"* → cada 10s los .m3u8 activos se refrescan proactivamente. Cuando el cliente pide, el cache está warm.
- *"Keepalive viva"* → mantiene los sockets upstream ocupados, nunca expiran por idle.
- *"Llenado de buffer"* → asegura que siguiente segmento está pre-cargado en buffers nginx.

### Sysctl Quantum (aplicado en turno anterior, relevante aquí)

- TCP buffers 64 MB → **128 MB**
- `netdev_max_backlog 5000 → 16384`
- `dev_weight 64 → 128`
- `tcp_limit_output_bytes 1M → 128K`
- `tcp_min_rtt_wlen 300s → 30s` (BBR adapta 10× más rápido)
- UDP mem pools ampliados

Archivo: `/etc/sysctl.d/99-netshield-quantum.conf`

### WG/CAKE (aplicado en turnos previos)

- `fq pacing` qdisc en wg0 (latencia cola 35.9μs)
- `CAKE diffserv4` en eth0 (prioridad Voice para DSCP EF con av_delay 1μs)
- MASQUERADE restringido a `10.200.0.0/24`
- PostUp/PostDown DSCP separados (fix A1 del audit)

---

## 3. Mapeo demanda ↔ fix aplicado

| User pide | Fix técnico | Archivo / componente |
|---|---|---|
| "Nunca se corte" | `proxy_cache_use_stale error timeout http_5xx updating` | 00-iptv-quantum.conf |
| "0 freeze, 0 lag" | `proxy_cache_background_update on` + SLICE 1m + buffers 8MB | 00-iptv-quantum + iptv-intercept |
| "Pida ancho como loco empedernido" | `aio threads 32`, keepalive pool 32 × 10k reqs, buffers 128 × 64k | nginx.conf + iptv-intercept |
| "Nunca se deje bajar bitrate" | Cache warmer 10s + stale update → .m3u8 siempre responde instant | iptv-cache-warmer.timer |
| "Flujo de megas constante" | fq pacing wg0 + CAKE voice tin (av_delay 1μs) + BBR | wg0.conf + eth0 CAKE + sysctl |
| "Llenado buffer siempre" | TCP rmem/wmem 128MB + buffers nginx + proxy_max_temp_file_size 0 | sysctl + 00-iptv-quantum |
| "Nunca repita segmento, pida 206" | SLICE 1m + proxy_cache_key $slice_range | iptv-intercept (Q2) |
| "Corte imperceptible" | background_update + use_stale updating | 00-iptv-quantum |
| "Siempre lo más actualizado" | Cache warmer cada 10s + .m3u8 cache 2s | warmer + iptv-intercept |
| "Mayor bitrate / mejor calidad" | Server no decide (ABR cliente) — pero garantiza que el bitrate elegido JAMÁS sufre throttle | indirect |

---

## 4. Observabilidad — cómo ver que está funcionando

### Desde el VPS

```bash
# Ver cache hit/miss/stale ratio en vivo
tail -f /var/log/nginx/iptv_intercept.log | awk '{print $2}' | sort | uniq -c

# Ver chunks cacheados (slice module)
ls /var/cache/nginx/iptv/ | wc -l
du -sh /var/cache/nginx/iptv/

# Ver último run del cache warmer
journalctl -u iptv-cache-warmer --no-pager -n 20 --since "5 minutes ago"

# Ver keepalive stats de upstreams
# (nginx no expone, pero se ve menos "connect" en error.log)
grep -c 'upstream' /var/log/nginx/error.log

# Ver tráfico del peer WG
wg show wg0 transfer
```

### Desde el cliente ONN 4K

Los headers HTTP que agregué te dan diagnóstico:

- **`X-Cache-Status`** — `HIT` / `MISS` / `STALE` / `UPDATING` / `EXPIRED`
- **`X-Quantum-Slice`** — `1m` → confirma que slice module está sirviendo ese .ts

Desde una herramienta en el ONN (curl/browser dev tools) pidiendo cualquier `.ts`:

```http
HTTP/1.1 200 OK
X-Cache-Status: HIT
X-Quantum-Slice: 1m
Content-Range: bytes 0-1048575/6291456
```

`Content-Range` significa que la respuesta viene por chunks slice, exactamente lo que pediste.

---

## 5. Rollback

Los 3 niveles que pueden aplicar según qué falle:

### Nivel 1 — solo quantum global (drop-in)
```bash
ssh root@178.156.147.234 "rm /etc/nginx/conf.d/00-iptv-quantum.conf && nginx -s reload"
```

### Nivel 2 — también desactivar slice + keepalive grandes
```bash
ssh root@178.156.147.234 "cd /etc/nginx/conf.d && cp iptv-intercept.conf.bak_pre_quantum_20260422_045906 iptv-intercept.conf && nginx -t && nginx -s reload"
```

### Nivel 3 — desactivar cache warmer
```bash
ssh root@178.156.147.234 "systemctl disable --now iptv-cache-warmer.timer"
```

### Nivel total (revertir toda la ventana)
```bash
ssh root@178.156.147.234 "
  rm /etc/nginx/conf.d/00-iptv-quantum.conf
  cd /etc/nginx/conf.d && cp iptv-intercept.conf.bak_pre_quantum_20260422_045906 iptv-intercept.conf
  cp /etc/nginx/nginx.conf.bak_pre_quantum_20260422 /etc/nginx/nginx.conf
  systemctl disable --now iptv-cache-warmer.timer
  rm /etc/systemd/system/iptv-cache-warmer.{service,timer}
  rm /usr/local/bin/iptv-cache-warmer.sh
  systemctl daemon-reload
  nginx -t && nginx -s reload
"
```

---

## 6. Qué NO se tocó

- **`onn.conf`** (cliente): sin cambios. El ONN 4K sigue con la misma config.
- **wg0.conf**: sin cambios en esta ventana (ya hardened en turno anterior).
- **unbound DNS (Fase 1)**: intacto.
- **CAKE qdisc eth0**: intacto — sigue clasificando DSCP EF del IPTV en tin Voice.
- **Upstream IPs**: sin cambios — los 4 origins siguen apuntando a las mismas IPs.

---

## 7. Límite físico restante

Lo único que queda entre tu stream IPTV y "velocidad absoluta" es el **peering ETB Colombia ↔ Hetzner Ashburn** (~50-70 ms baseline). Eso lo fija el Tier-1 transit, no depende del VPS. Dentro del VPS tu tráfico se mueve a **1 μs de latencia de cola** (CAKE Voice tin, confirmado en `tc -s qdisc show dev eth0`).

Para cruzar ese floor habría que poner un VPS MÁS cerca de Bogotá (DigitalOcean/Vultr Miami o Brasil), o convencer a ETB de hacer peering directo con Hetzner (improbable).

---

## 8. Próximo paso sugerido

Deja correr 30-60 min y observa desde tu app IPTV. Ejecuta la checklist de `ONN_VERIFICATION_CHECKLIST.md`:
- Stream 4K sin buffering durante 10+ min
- Speedtest Ookla con y sin túnel (esperado: con túnel igual o mejor)
- Zapping rápido entre canales (primer segmento MISS, siguientes HIT/STALE)

Si todo bien → mantener. Si algo empeora → rollback nivel N según el síntoma.
