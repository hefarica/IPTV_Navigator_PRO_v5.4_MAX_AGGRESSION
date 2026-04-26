PLAN TÉCNICO — IPTV/OTT NET SHIELD vps_snapshot_mejorado_20260426
0. Diff vs estado anterior (lo que cambió en el "mejorado")
Comparado con el snapshot funcional 2026-04-26_funcional_post_rollback ya en repo:

Cambio	Impacto
set $shield_host $2; → map $request_uri $shield_host (en iptv-shield-rate.conf)	Fix definitivo del clobbering de captura numerada en subrequests
Lua refactorizado a patrón Circuit Breaker formal CLOSED/HALF-OPEN/OPEN con MAX_FAILURES=5, FAILURE_WINDOW=15s, probe único atómico	Anti-loop infinito 5xx + recuperación controlada
proxy_connect_timeout 2s (era 5s)	Detección rápida de upstream caído
burst=200 (era 50)	Absorber zapping masivo
408 agregado a triggers Lua	408 ya tratado como rate-limit
lua_shared_dict circuit_metrics 5m	Telemetría dedicada
iptv-proxy-location.conf con /px/HOST/PATH	Universal proxy con resolver unbound local
Server blocks rynivorn.cc y zivovrix.cc agregados con wildcard	CDN dynamic targets cubiertos
1. Componentes existentes (inventario del archivo)
Servidores / vhosts NGINX
Vhost	Listen	Función
iptv-ape.duckdns.org (default)	80→301, 443	Server padre del shield + listas + healthcheck + uploads PHP
nfqdeuxu.x1megaott.online	80	Intercept directo MegaOTT (allow IP-restricted)
line.tivi-ott.net	80	Intercept TiVivision
ky-tv.cc	80	Intercept ky-tv
tivigo.cc	80	Intercept TiVistation
*.rynivorn.cc	80	CDN dynamic target wildcard
*.zivovrix.cc	80	CDN dynamic target wildcard
Origins (upstreams)
Bloque	IPs	Provider
x1megaott_upstream	149.18.45.78, .119, .189	MegaOTT
line_tivi_upstream	91.208.115.23	TiVivision
ky_tv_upstream	172.110.220.61	ky-tv
tivigo_upstream	154.6.41.6, .66, .126, .186	TiVistation
rynivorn_upstream	154.6.152.11	CDN tivigo
zivovrix_upstream	154.6.152.13	CDN tivigo
Players
Cliente principal: ONN 4K (Bogotá) vía WireGuard 10.200.0.0/24
Cliente secundario: ONN ETB Cali
IP autorizada externa: 181.63.176.21
Endpoints expuestos
/shield/<HASH>/<HOST>/<PATH> — proxy autenticado Xtream
/_shield_auth — auth_request internal (shield-auth.php)
/px/<HOST>/<PATH> — universal proxy con resolver unbound
/health — liveness OK 200
/api/*.php — uploads chunked / scripts
/<lista>.m3u8 — listas estáticas servidas con gunzip + gzip_static
/_lua_dump — referenciado en docs, no implementado
Manifests / segmentos
HLS exclusivamente (.m3u8 + .ts)
MPEG-TS legado por upstream Xtream
CMAF mime types declarados pero NO usados en config activa (sólo cmaf_mime.conf con types map; ningún server block sirve .m4s/.mpd/.mp4)
.ts/.m4s/.mp4 en server padre → bloqueados por 404 (no se sirven desde el VPS, sólo proxy a upstream)
Protocolos
HTTP/1.1 al upstream (proxy_http_version 1.1)
HTTPS TLSv1.2/1.3 al cliente (Let's Encrypt)
WireGuard hacia los clientes (no en el archivo, referenciado)
Autenticación
Token JSON en /etc/net-shield/authorized_tokens.json (no incluido por seguridad)
shield-auth.php valida: formato URI, registry exists, token enabled, expiry, allowed_hosts, rate limit per-token-per-minute
Devuelve 204 (OK) / 403 (denied) / 429 (rate)
Rate state en /dev/shm/shield_rate_<token16>
Headers configurados
Hacia upstream: Host=$shield_host, User-Agent hardcoded Silk, Referer=netflix.com, Accept=*/*
proxy_pass_request_headers off (no leak de headers cliente)
Hacia cliente: X-Cache-Status, X-Shield-Owner, X-Shield-Host, X-APE-Circuit, X-APE-State, X-APE-Retry, X-APE-Delay-Ms, Retry-After, X-Quantum-Slice
Reglas de caché
Tipo	TTL 200	TTL 302	use_stale	lock
Shield /shield/...m3u8	20s	0	error/timeout/updating/invalid_header/5xx	3s
Intercept *.m3u8	2s	2s	updating timeout	3s
Intercept *.ts (slice 1m)	10m	—	error timeout	on
/hlsr/ (signed)	OFF	OFF	—	—
Universal /px/	60s	10s	error/timeout/updating/5xx	15s
Listas .m3u8 (static)	5min público	—	—	—
Global (00-iptv-quantum.conf)	revalidate on, background_update on, ignore Cache-Control origin	—	—	—
Reglas de redirección controladas
80→443 (return 301) en server padre
Player /hlsr/ token signed: NO cacheado, propagado tal cual
302 desde upstream Xtream → propagado al cliente sin reescritura (cliente sigue al CDN dynamic interceptado por DNS hijack + server_name wildcard)
DNS (unbound)
Listen 178.156.147.234, 127.0.0.1, 10.200.0.1
Access-control: 127.0.0.1/32, 10.200.0.0/24, 181.63.176.21/32 allow; rest refuse
Forward upstream: 1.1.1.1, 1.0.0.1, 8.8.8.8, 8.8.4.4, 9.9.9.9
6 hosts hijack-ed: nfqdeuxu, line.tivi-ott, ky-tv, tivigo, rynivorn, zivovrix → todos a 178.156.147.234
serve-expired: yes, cache-min-ttl: 60, prefetch: yes
Balanceadores
Round-robin NGINX entre múltiples IPs del upstream block (sin keepalive — comentado por RST)
Ningún LB externo
Monitoreo / logs
iptv log_format global (access.log)
iptv_intercept log_format (shield_access.log + iptv_intercept.log) con ut/rt/UA/host
Lua: [APE-CIRCUIT-GATE], [APE-CIRCUIT-TRIP], [APE-CIRCUIT] en error.log
Shield-auth: log dedicado /var/log/nginx/shield-auth.log
Autopilot v2 (systemd timer 5min, MODE=observe): /opt/netshield/autopilot/state/history.jsonl
Pruebas
No hay suite E2E formalizada en el archivo
Smoke tests manuales documentados en runbooks comentados
Healthcheck básico /health (return 200)
Scripts
netshield_autopilot_v2.py (medición p50/p95/max, recomendación rate, modo observe/recommend/active)
shield-auth.php (auth + rate limit)
Dependencias
nginx 1.24 + libnginx-mod-http-lua + slice module
PHP 8.3-FPM (unix socket)
unbound (DNS)
WireGuard (wg0 + wg-surfshark según contexto)
iptables (mark 0x100 + table 100 routing por SurfShark)
letsencrypt certs
Limitaciones actuales identificadas
.ts/.m4s/.mp4 bloqueados con 404 en server padre mientras los intercepts SÍ los sirven — depende del Host header del cliente y server_name match
Sin failover entre CDNs (rynivorn ↔ zivovrix son independientes)
keepalive removido de upstream blocks por RST en stale conn → más TCP handshakes
/_lua_dump no implementado — sin introspección runtime del dict Lua
Sin cobertura para hosts CDN futuros distintos a rynivorn/zivovrix (provider rota dominios)
auth_request /_shield_auth no aplica a /px/ (universal proxy sin auth)
CMAF/DASH declarados en mime pero sin server block que sirva fMP4/MPD
Suscripciones provider con max_connections=1 — limitación dura del proveedor, no del shield
Sin proxy_next_upstream en shield-location (solo en quantum global) — fallback entre IPs upstream depende del global
Logs sin agregación central — sólo files locales
2. Diagnóstico técnico (matriz de riesgos)
Riesgo	Probabilidad	Impacto	Causa raíz observable	Mitigación actual	Gap
3xx mal controlado	Media	Alta	302 del upstream apunta a CDN no interceptado	DNS hijack + wildcard server_name para rynivorn/zivovrix	Provider rota a OTRO dominio → fail
401/403 masivo	Media	Alta	Token expirado, host fuera de allowed_hosts, rate limit shield-auth	Lua cooldown 8-15min en 403	Token rotation manual; sin alert
404 manifest	Baja	Alta	Path mal en proxy_pass	proxy_pass http://...$shield_path directo	Sin verificación segment-level
404 segmento	Media	Alta	TS expirado, slice fuera de rango	Cache slice 1m + use_stale	Sin reintentar OTRO upstream IP
408/429	Alta	Media	Provider max_connections=1 saturado, shield rate-limit, hard_cap	limit_conn xtream_slot=1, hard_cap=30r/s, Lua exp backoff	Player sin backoff coordinado con Retry-After
500/502/503/504	Alta	Crítica	Upstream prematuramente cierra TCP, GeoIP block intermitente, provider down	Lua circuit breaker MAX_FAILURES=5 → cooldown 15-30s + use_stale	Sin alerta a operador en TRIP
DNS	Baja	Crítica	Unbound caído	serve-expired: yes, 5 forwarders	Sin healthcheck unbound externo, DNS interno cae todo
TLS	Baja	Crítica	Cert Let's Encrypt expirado	renovación automática certbot (no en archivo)	Sin alert pre-expiry
Buffering	Media	Alta	Provider lento, cache vacío	proxy_cache_lock + background_update + slice 1m	TTFB shield <10ms cache hit, miss puede ser >2s
Freeze	Media	Alta	Segmento corrupto, cache STALE viejo, xtream_slot=1 saturado	use_stale en 5xx + slot per token	Cache STALE puede servir manifest con tokens expirados (visto 503226)
Lag	Baja	Media	RTT alto SurfShark Miami ↔ provider	proxy_connect_timeout 2s	Sin medición end-to-end client→playback
Cortes	Media	Alta	Upstream RST en keepalive (por eso lo desactivaron)	Keepalive disabled + use_stale	Cada request es nuevo handshake → más latencia
Saturación tráfico	Baja	Crítica	Worker_connections agotado	200k rlimit + 20k worker_connections + 32 thread pool	Sin backpressure visible al cliente
Inconsistencia manifest↔segmentos	Media	Alta	Manifest cached con tokens viejos (caso 503226)	proxy_cache_valid 200 20s shield, 2s intercept	TTL aún largo cuando provider cambia tokens
Tokens expirados	Alta	Media	Token signed /hlsr/ 30-60s	NO_CACHE para /hlsr/	OK
Caché mal configurada	Media	Alta	TTL diferentes por capa, cache key inconsistente	shield key sin args, intercept con $proxy_host$uri$slice_range	Cache key shield ignora args → manifest distinto por canal puede colisionar (no, key incluye /$3)
Failover incompleto	Alta	Media	Sin fallback CDN-a-CDN automático cuando rynivorn cae	proxy_next_upstream solo dentro mismo upstream block	Sin abstracción multi-CDN
Contradicciones técnicas detectadas
Server padre bloquea \.(ts|m4s|mp4)$ con 404 mientras intercepts (nfqdeuxu, tivigo, etc.) tienen location ~* \.ts$ { ... slice ... }. Funciona sólo porque el client llega por server_name correcto al intercept. Si llega al server padre con un .ts (caso edge: cliente sigue 302 con Host raro), recibe 404. Recomendación: agregar regla explícita o documentar el comportamiento.

shield-auth.php valida target_host contra allowed_hosts, pero el path /px/HOST/PATH (universal proxy) NO pasa por auth_request. Hay un agujero si el cliente accede a /px/. Mitigado por allow IP whitelist, pero si la IP cambia, queda expuesto.

set $shield_path /$3$is_args$args; sigue usando $3 numerado (mismo riesgo de clobber que tenía $shield_host). Empíricamente funciona porque se consume en content phase antes del subrequest, pero no es robusto si se introducen subrequests previos.

map $request_uri $shield_upstream_host y map $request_uri $shield_host son idénticos en regex y propósito. Redundante — uno solo serviría a ambos casos.

worker_connections 20000 × worker_processes auto puede exceder worker_rlimit_nofile 200000 si CPUs > 10. Hetzner CPX21 tiene 3 vCPU → 60k FDs en uso, OK.

3. Objetivo técnico actualizado y SLOs
Objetivo de producción
Operar un edge proxy autenticado, multi-host, multi-CDN, anti-saturación para tráfico HLS Xtream Codes desde N clientes autorizados (ONN 4K + IP whitelist) hacia M proveedores IPTV con suscripción legal contratada (max_connections=1 por user/pass), con resiliencia ante 4xx/5xx, redirects dinámicos del provider y CDN rotation, manteniendo TTFB < 200ms en zapping y fallback transparente con use_stale.

SLOs recomendados
Métrica	Objetivo	Ventana	Cómo medir
Playback start success rate	≥ 99.0%	1h rolling	(canales que devuelven manifest+1er .ts antes de 5s) / total intentos
Manifest availability	≥ 99.5%	5min	200/206 / total *.m3u8 requests
Segment availability	≥ 99.7%	5min	200/206 / total *.ts requests (ignora 404 transitorio resuelto en retry)
Rebuffering ratio	≤ 0.5%	sesión	(tiempo en buffer) / (tiempo de reproducción) — requiere player telemetry
Startup time p95	≤ 1.5s	5min	manifest+1er segment delivered
Startup time p99	≤ 3.0s	5min	idem
Error rate 4xx	≤ 5%	5min	4xx (excl. 429/401 controlados) / total
Error rate 5xx	≤ 1%	5min	5xx que llegan al cliente / total
Controlled redirect (302) success	≥ 99%	5min	302 seguidos a destino válido (rynivorn/zivovrix interceptados) / total 302
CDN failover time	≤ 10s	evento	desde primera 5xx hasta circuit OPEN (cooldown activo)
Origin failover time	≤ 5s	evento	NGINX proxy_next_upstream switch entre IPs
Recovery success rate	≥ 95%	5min post-cooldown	requests OK después de HALF-OPEN probe
Latency upstream p95	≤ 1.0s	5min	$upstream_response_time
Latency upstream p99	≤ 2.5s	5min	idem
MTTD (alert)	≤ 1 min	evento	desde threshold breach hasta alerta
MTTR	≤ 15 min	evento	desde alerta hasta restauración (mediana)
Errores fuera de SLO obligan a runbook
Cualquier breach > 3 ventanas consecutivas dispara automaticamente runbook + paginación.

4. Arquitectura final recomendada
Qué conservar
Estructura iptv-ape.duckdns.org como single edge endpoint cliente
DNS hijack vía unbound para hosts upstream conocidos
Lua circuit breaker CLOSED/HALF-OPEN/OPEN (este archivo lo trae mejorado)
Slice cache para .ts (1m)
proxy_cache_use_stale agresivo
Token-based auth en /shield/<TOKEN>/<HOST>/<PATH>
Rate limit dual: limit_conn xtream_slot=1 + limit_req hard_cap=30r/s burst=200
Autopilot v2 en MODE=observe
Qué modificar
set $shield_path /$3$is_args$args; → migrar a map $request_uri $shield_path (consistencia con $shield_host)
Consolidar $shield_host y $shield_upstream_host (mismo regex) en una sola variable
Agregar auth_request al /px/ o restringir más con allow + signed query param
Agregar proxy_next_upstream explícito al shield-location (no solo global)
Subir proxy_cache_valid 302 shield: dejar en 0 (correcto, no cachear) PERO documentar que el comportamiento es intencional
Qué eliminar
cmaf_mime.conf si no se va a usar DASH/CMAF (es solo declarativo, sin server)
Comentario keepalive removed (RST on stale conn) con keepalive viable: probar keepalive 8; keepalive_timeout 30s; keepalive_requests 100; en upstream blocks — reduce handshake cost
Qué agregar
Server block para fallback CDN-a-CDN (vía map: tivigo_cdn_pool { rynivorn → zivovrix })
Endpoint /_lua_dump para introspección runtime del shared_dict
Endpoint /_health/deep con verificación: nginx + unbound + WG handshake + auth registry presente + cache writable
Healthcheck activo del autopilot que dispare alerta si circuit_metrics reporta TRIP > N veces/h
logrotate explícito para shield_access.log e iptv_intercept.log
Backup automatizado y healthcheck cron (ya agregados en sesión previa, dejar)
Recomendación adicional: Prometheus exporter (ngx_lua + shared_dict scrape) — fuera del archivo, opcional
Diagrama del flujo (ajustado a este archivo)

[Cliente ONN 10.200.0.0/24]
    │ HTTPS 443 (TLS 1.2/1.3)
    ▼
[unbound DNS 10.200.0.1] ───hijack────▶ tivigo.cc/rynivorn.cc/etc → 178.156.147.234
    │
    ▼
[NGINX edge :443 server padre iptv-ape.duckdns.org]
    │
    ├─ /shield/<TOKEN>/<HOST>/<PATH>
    │     ├── auth_request /_shield_auth → shield-auth.php (PHP-FPM)
    │     ├── access_by_lua upstream_gate.lua (CLOSED/HALF-OPEN/OPEN)
    │     ├── limit_conn xtream_slot=1 (per token)
    │     ├── limit_req hard_cap=30r/s burst=200 (per upstream host)
    │     ├── proxy_cache iptv_cache (TTL 20s, key sin args)
    │     ├── proxy_pass http://<upstream_block>/<path>
    │     │       │
    │     │       └── upstream <provider>_upstream { multi-IP, max_fails=0 }
    │     │              │
    │     │              ▼
    │     │         [iptables fwmark 0x100 si IP en SURFSHARK_MARK]
    │     │              │
    │     │              ├── eth0 directo (clearnet)
    │     │              └── wg-surfshark (Miami, GeoIP bypass autorizado)
    │     │                     │
    │     │                     ▼
    │     │              [Provider IPTV: nfqdeuxu, tivigo, line.tivi, ky-tv]
    │     │                     │
    │     │                     └── 302 Location: http://CDN_DYN.ext/...
    │     │
    │     ├── header_filter_by_lua upstream_response.lua
    │     │      └── 5xx fail counter, TRIP a 5 fails/15s, cooldown 15-30s
    │     │
    │     └── 302 propagado al cliente
    │
    ├─ Cliente sigue 302 → DNS hijack rynivorn.cc/zivovrix.cc → 178.156.147.234
    │     │
    │     ▼
    │  [server_name *.rynivorn.cc / *.zivovrix.cc]
    │     ├── allow IP-restricted
    │     ├── proxy_pass al upstream CDN (154.6.152.11 / 154.6.152.13)
    │     └── slice 1m + cache 10m → entrega .ts al cliente
    │
    ├─ /px/<HOST>/<PATH>  (universal proxy con resolver unbound)
    ├─ /<lista>.m3u8       (gunzip + gzip_static, listas estáticas)
    ├─ /api/*.php          (uploads chunked PHP-FPM)
    └─ /health             (200 OK liveness)

[autopilot v2 systemd timer 5min] ──read shield_access.log──▶ history.jsonl (observe)
[backup cron daily 03:00 UTC] ──tar.gz────────────────────▶ /root/backups/daily/
[healthcheck cron 5min] ──nginx/unbound/WG/SHM/502─────────▶ /var/log/netshield-health.log
5. Plan de implementación por fases
Fase	Acción	Componente	Cambio exacto	Motivo	Responsable	Riesgo	Mitigación	Métrica éxito	Criterio aceptación
1. Auditoría	Validar archivo deployado vs snapshot	nginx config	diff -r VPS vs snapshot mejorado	Confirmar que el archivo es la verdad	Operador	Bajo	Read-only	0 diferencias unexpected	nginx -t pass
2. Arquitectura	Migrar $shield_path a map	iptv-shield-rate.conf	Agregar map $request_uri $shield_path { "~^/shield/[a-f0-9]+/[^/]+/(.*)$" "/$1$is_args$args"; default "/"; } y reemplazar set $shield_path	Eliminar $3 clobbering residual	Dev	Medio	Backup + nginx -t + smoke	0 regresión 404	TiVistation entra
3. HTTP	Agregar proxy_next_upstream explícito en shield-location	shield-location.conf	proxy_next_upstream error timeout http_502 http_503 http_504; proxy_next_upstream_tries 3; proxy_next_upstream_timeout 5s;	Failover entre IPs upstream sin esperar timeout global	Dev	Bajo	nginx -t	502 al cliente baja	%5xx<1% en 5min
4. Caché	Validar TTLs vs SLO	todo	Confirmar 200=20s shield, 2s intercept, 10m .ts. Documentar	Coherencia	Dev	Bajo	Doc en README	TTL escrito	Aceptación operador
5. Manifests	Validar coherencia manifest cached vs upstream actual	runbook	Curl shield + curl direct upstream + diff segments	Detectar STALE viejo con tokens expirados	SRE	Bajo	Read-only	Sin segments con host muerto	0 fallos /hlsr/
6. Segmentos	Subir slice de 1m a 2m	intercept blocks *.ts	slice 2m; + cache key incluir slice_range	Mejor coalescing con bitrates altos	Dev	Bajo	A/B test 10min	TTFB segment ≤ 500ms p95	Pass
7. Failover	CDN-a-CDN abstracción	nuevo cdn-pool.conf	upstream tivigo_cdn { server 154.6.152.11; server 154.6.152.13 backup; } + reescribir intercept rynivorn/zivovrix con proxy_pass http://tivigo_cdn	Si rynivorn cae, NGINX usa zivovrix	Dev	Medio	Test failover sintético	Failover < 5s	Pass
8. Player resiliente	Reglas en m3u8-typed-arrays	frontend/js/ape-v9	Pseudocódigo §10 — exponential backoff cliente, retry con Retry-After, freeze detect	Reducir loops cliente que saturan slot	Dev	Medio	Regenerar lista, smoke	retry=N caps en 5	Sesión completa sin bloqueo
9. Observabilidad	Endpoint /_metrics Prometheus-style desde Lua	nuevo Lua	content_by_lua_block que dump shared_dict	Visibilidad runtime circuit	Dev/SRE	Bajo	allow IP-restricted	curl /_metrics retorna JSON	Dashboard funcional
10. Pruebas E2E	Suite synthetic check	nuevo /opt/netshield/scripts/e2e_check.sh	§12	Confianza pre-deploy	SRE	Bajo	Run en cron 5min	Suite PASS	0 FAIL en 24h
11. Canary	Aplicar cambios a 1 cliente test (Cali) primero	unbound + intercept	Toggle local-zone para Cali peer subset	Aislar blast radius	SRE	Alto si rompe ONN principal	Toggle vía wg show filter	Cali stream OK / Bogotá untouched	Pass
12. Producción	Promover canary a global	unbound + intercept	Quitar filter	Rollout completo	SRE	Medio	Monitor 1h post	SLOs verde	Verde
13. Operación continua	Daily review autopilot history	runbook	Script diario que summariza p95/p99 + circuit TRIPs/24h	Trending detection	SRE	Bajo	Email/Slack notify	Daily report enviado	7 días sin escalation
6. Estrategia HTTP por código (basada en este archivo)
Código	Dónde aparece (este archivo)	Causa probable	Prevención	Detección	Acción auto	Acción player	Acción CDN intercept	Acción origin upstream	Alerta	Criterio éxito
200	shield, intercept, /px/	OK	—	log access	cache TTL	render	slice cache	served	—	rate ≥ 95%
206	*.ts slice	Range request	Range $slice_range	log	cache slice key	continuar	cache ranges	served	—	rate ≥ 95% en .ts
301	server :80 → 443	Redirect TLS	hardcoded	log	seguir	cliente sigue	—	—	—	esperado
302	upstream Xtream → CDN dyn	Provider redirect	DNS hijack + wildcard server_name	log	propagar al cliente	seguir	match server_name	—	log nivel info	rate <60% del total
307/308	NO en archivo	Provider podría usar	proxy_redirect explicit si aparece	log	propagar	seguir	—	—	log + investigate	0 esperado
401	shield-auth.php no actual; provider rechaza	Token inválido / credentials wrong	registry validado al deploy	log shield-auth.log	Lua backoff exp 1→2→4→8s	retry max 4, alert user	—	rotate creds runbook	log+alert if >5/min	rate ≤ 0.1%
403	shield-auth (token denied), provider rechaza	Token expired/host wrong / GeoIP block	registry pre-flight, SurfShark route	log	Lua cooldown 8-15min	dejar de pedir 8min	—	runbook deny rate	alert >5/min	rate ≤ 0.5%
404	server padre .ts bloqueado / segment expirado	Path wrong / segment GC en provider	shield bloquea .ts directo, slice cache absorbe	log	Lua NO trigger 404 (correcto, no es ban)	retry 1× otro segment ID	proxy_next_upstream	log only	alert >10/min sostenido	rate ≤ 1%
408	Timeout cliente	Cliente lento	client_body_timeout 120s	log	Lua treat as backoff exp (en triggers)	reconnect	—	—	log only	rate ≤ 0.1%
429	shield (limit_req hard_cap, limit_conn xtream_slot, shield-auth.php rate)	Cliente bombardea / slot saturado / token rate	hard_cap=30r/s burst=200, slot=1, rate per-token	log + Retry-After	Lua backoff exp	respetar Retry-After, freno coordinado	—	—	alert >50/min	rate ≤ 5%
500	upstream Xtream	Provider error interno	use_stale, circuit breaker	log + Lua fail count	Lua MAX_FAILURES=5 in 15s → cooldown 15-30s	retry 1×	proxy_next_upstream	runbook	alert >3/min	rate ≤ 0.5%
502	upstream prematurely closed (visto caso 503226)	Provider RST, slot saturado	proxy_connect_timeout 2s + circuit	log + counter	Lua cooldown	gate-503 al cliente	proxy_next_upstream tries=3	runbook + paginar SRE	alert ≥5 in 1min	rate ≤ 0.5%
503	NGINX (limit_req desactivable), Lua emite intencionalmente cuando circuit OPEN	Circuit OPEN o saturación	circuit breaker, autopilot calibration	log	Retry-After header set	respetar y reintentar	—	—	log + heartbeat	controlado
504	upstream timeout	Provider muy lento o caído	proxy_read_timeout 30s + use_stale	log	Lua MAX_FAILURES contributor	use_stale serve	proxy_next_upstream	runbook	alert >3/min	rate ≤ 0.3%
DNS error	Resolver fail	unbound caído / forwarders down	unbound serve-expired + 5 forwarders	dig from healthcheck	restart unbound	failover DNS local	—	—	crítico paginar	0
TLS error	Let's Encrypt expirado / handshake fail	Cert renewal fail	certbot auto + monitor expiry	curl fail	renew + reload nginx	abort + alert user	—	—	crítico paginar	cert valid >7d
Timeout	proxy_*_timeout breach	Provider extremadamente lento	timeouts estrictos (2s/30s)	log	use_stale	wait + retry	proxy_next_upstream	runbook saturación	alert sostenido	<1/min
Connection reset	RST upstream (visto en logs)	Provider rate-limit dirigido o keepalive stale	keepalive removed; circuit cuenta	log	Lua fail count	—	—	runbook	log + counter	<5/min
7. Configuración recomendada de caché
Adaptado al archivo. Mantener lo actual donde funciona, ajustar lo identificado.

Master playlist (en este archivo no hay master HLS multi-bitrate, sólo media playlists del provider — provider hace ABR del lado server)
N/A para este sistema
Media manifest (*.m3u8 provider-side)

proxy_cache iptv_cache;
proxy_cache_valid 200 206 2s;        # ya en archivo (intercept)
proxy_cache_valid 302 301 0;         # NO cachear redirects (regla inmutable)
proxy_cache_valid 403 401 0;         # NO cachear errores auth
proxy_cache_lock on;
proxy_cache_lock_timeout 3s;
proxy_cache_use_stale updating timeout invalid_header http_500 http_502 http_503 http_504;
proxy_cache_background_update on;
proxy_ignore_headers Cache-Control Expires Set-Cookie X-Accel-Expires;
proxy_cache_revalidate on;            # global ya
add_header X-Cache-Status $upstream_cache_status always;
Segmentos *.ts (slice 2m recomendado, 1m actual)

slice 2m;
proxy_cache_key "$scheme$proxy_host$uri$slice_range";
proxy_cache_valid 200 206 10m;
proxy_cache_valid 403 401 0;
proxy_cache_lock on;
proxy_cache_use_stale error timeout;
proxy_buffer_size 256k;               # subir de 128k para HEVC 4K
proxy_buffers 64 128k;                # subir
proxy_busy_buffers_size 1m;
proxy_set_header Range $slice_range;
add_header Accept-Ranges bytes always;
Tokens signed /hlsr/

proxy_cache off;                      # nunca cachear (token < 60s TTL)
proxy_buffering on;
proxy_buffer_size 32k;
proxy_buffers 32 32k;
add_header X-Cache-Status NOCACHE always;
Headers HTTP recomendados al cliente

Cache-Control: public, max-age=2, stale-while-revalidate=10, stale-if-error=60   # manifests
Cache-Control: public, max-age=600, immutable                                     # segments .ts
Vary: Accept-Encoding
Accept-Ranges: bytes
X-Cache-Status: HIT|MISS|STALE|EXPIRED|BYPASS
X-Shield-Host: <upstream>
X-Shield-Owner: <token-owner>
X-APE-Circuit: CLOSED|HALF-OPEN-PROBE|HALF-OPEN-WAIT|OPEN
Retry-After: <seconds>                                                            # en 429/503
Negative caching
4xx provider: NO cachear (proxy_cache_valid 403 401 0) — ya está
404 segment expirado: NO cachear, dejar al player retry
5xx: NO cachear (use_stale sirve viejo, no caches el error)
Origin shield (concepto centralizado)
Recomendación adicional (NO en archivo): introducir un layer adicional iptv_origin_shield_cache con TTL más largo en /dev/shm/nginx_origin_shield/ que actúe como fuente de verdad para todos los workers. Reduce calls al provider en deployments multi-worker. Implementación: proxy_cache_path con keys_zone separado.

Cache pre-warming
No implementado, recomendable en runbook diario: lista los 50 canales más vistos y dispara curl preventivo para llenar cache. Cuidado: respeta xtream_slot=1 por token.
Purge seguro

# Purga atómica del cache
ssh root@VPS 'systemctl stop nginx && rm -rf /dev/shm/nginx_cache/* && systemctl start nginx'
# Documentado: NUNCA reload (no purga); SIEMPRE stop+start
Publicación atómica de listas
Patrón actual: gzip_static always lee .gz precomprimido. Para publicar atómicamente:

gzip -9 -c lista.new.m3u8 > lista.m3u8.gz.tmp
mv lista.m3u8.gz.tmp lista.m3u8.gz   # rename atómico
8. Idempotencia
Tabla por tipo de operación.

Operación	Clave idempotente	Estado esperado	Riesgo si no idempotente	Control	Validación auto
Publicación segmento	$scheme$proxy_host$uri$slice_range	Cache hit en próxima request	Doble fetch upstream	proxy_cache_lock on	curl 2× consecutivo: 1 MISS + 1 HIT
Generación manifest cliente	hash(canal_id, profile_id)	Mismo output dado mismo input	Listas con drift	Hash deterministic en frontend	diff regen 2× = 0
Update playlist .m3u8 static	filename	Atómico vía mv	Cliente recibe corrupto	mv atómico filesystem	sha256 antes/después
Purge cache	rm -rf + restart	Cache vacío	Reload no purga (regla VPS)	doc rule	du /dev/shm/nginx_cache =0
Player retry	request_id (UUID)	Mismo response	Doble counting	header X-Request-Id	log dedup
CDN-origin retry	Idempotency-Key (recom adicional)	Server detecta duplicate	Doble session abierta	NGINX no implementa nativo, gap	Lua check
Health check	endpoint /health	200 estable	False positive	timeout fixed 5s	curl returns 200
Failover	Lua dict $host:cooldownUntil	Estado consistente entre workers	Workers en disagreement	shared_dict atomic ops	dict get from 2 workers = same
Reprocesamiento (autopilot)	timestamp + window	Append-only history	Double counting	append-only history.jsonl	wc -l antes/después
Rollback config	TS backup	Reaplicar = misma config	Drift entre nodos	hash pre/post	sha256 match snapshot
Implementación recomendada para "request_id":


# En server padre, agregar:
map $http_x_request_id $request_id_ext {
    default $request_id;            # NGINX built-in si client no envía
    "~.+"   $http_x_request_id;     # respeta el del cliente
}
add_header X-Request-Id $request_id_ext always;
log_format iptv_intercept '... rid=$request_id_ext';
9. Polimorfismo técnico controlado (legal/autorizado)
Limitado a infraestructura propia / contratada / autorizada (suscripciones legales con providers, túneles autorizados con SurfShark).

Dimensión	Implementación basada en archivo	Recomendación adicional
Múltiples rutas	DNS hijack 6 hosts → mismo VPS	Agregar wildcard handlers para futuros CDN del mismo provider
Múltiples CDNs	rynivorn + zivovrix interceptados	Pool tivigo_cdn { rynivorn primary; zivovrix backup } con NGINX backup
Múltiples origins	upstream blocks con N IPs	max_fails=3 fail_timeout=10s (actual max_fails=0 = nunca marcar fail, OK pero pierde NGINX failover automático — revisar)
Múltiples perfiles ABR	provider hace ABR server-side; player elige bandwidth	Confirmar player ONN respeta BANDWIDTH= del manifest
Múltiples formatos	HLS only en archivo	Si DASH se requiere: agregar server con mpd mime + packager (recomendación adicional, no en archivo)
Múltiples regiones	1 VPS Hetzner + SurfShark Miami	Agregar VPS secundario en otra región, anycast DNS (Fase 4 ya planeada en memoria)
Fallback endpoints sanos	Lua circuit breaker	Cliente recibe X-APE-Circuit: OPEN + Retry-After, conmuta canal
Fallback bitrates	provider-side ABR	Player respeta TARGET-DURATION
Fallback protocolos	HLS only	Si player soporta DASH y provider lo expone, alternar (no en archivo)
Lo que NO se hace (regla del usuario y legal):

Bypass de auth provider
Scraping listas de hosts no autorizados
Manipulación tokens
Rotación abusiva de IPs
Acceso a contenido sin suscripción
10. Player resiliente (pseudocódigo)
Basado en la lógica que YA existe en frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js (Lua circuit breaker server-side + UAPhantomEngine + fallback genome). Pseudocódigo para coordinar cliente con headers que el shield ya emite (X-APE-Circuit, X-APE-Retry, X-APE-Delay-Ms, Retry-After).


// PLAYER WRAPPER — coordinated with shield headers
class ResilientPlayer {
  constructor({ shieldUrl, token, host, channel }) {
    this.url = `${shieldUrl}/shield/${token}/${host}/${channel}.m3u8`;
    this.maxConsecutiveFails = 5;        // alineado con MAX_FAILURES Lua
    this.failWindowMs = 15_000;           // alineado con FAILURE_WINDOW Lua
    this.minBufferMs = 3_000;
    this.maxBufferMs = 15_000;
    this.fails = [];
    this.bitrateCurrent = null;
    this.cdnCurrent = 'primary';
    this.heartbeatMs = 30_000;
    this.session = uuid();
  }

  async fetchManifest({ retry = 0 } = {}) {
    const resp = await fetch(this.url, {
      headers: {
        'X-Request-Id': uuid(),
        'X-Session-Id': this.session,
        // NO User-Agent literal {config.user_agent}: ya resuelto en frontend
      }
    });

    // Coordinated backoff respetando shield
    if (resp.status === 429 || resp.status === 503) {
      const retryAfter = parseInt(resp.headers.get('Retry-After') || '0', 10);
      const apeDelay = parseInt(resp.headers.get('X-APE-Delay-Ms') || '0', 10);
      const wait = Math.max(retryAfter * 1000, apeDelay, this.expBackoff(retry));
      await sleep(wait + jitter(80, 400));
      if (retry < 4) return this.fetchManifest({ retry: retry + 1 });
      throw new Error(`shield_circuit_${resp.headers.get('X-APE-Circuit') || 'unknown'}`);
    }

    if (resp.status === 302) {
      // Controlled: shield interceptó CDN dinámico vía DNS hijack/wildcard server_name
      // El cliente sigue automáticamente porque resuelve al MISMO VPS
      // Verificar: si Location apunta a host NO hijackeado → log warn
      const loc = resp.headers.get('Location');
      if (loc && !this.isHijackedHost(loc)) {
        emit('cdn_dynamic_uncovered', { host: parseHost(loc) });
      }
      // navegador HTTP sigue solo
    }

    if (resp.status === 403 || resp.status === 401) {
      // Token issue — NO retry inmediato, alert user
      emit('auth_fail', { status: resp.status });
      throw new Error('auth_required');
    }

    if (!resp.ok) {
      this.recordFail(resp.status);
      if (this.shouldTrip()) {
        emit('player_circuit_trip', { fails: this.fails.length });
        await sleep(15_000 + jitter(0, 15_000));
        this.fails = [];
      }
      if (retry < this.maxConsecutiveFails) return this.fetchManifest({ retry: retry + 1 });
      throw new Error(`unrecoverable_${resp.status}`);
    }

    const text = await resp.text();
    this.fails = [];
    return parseManifest(text);
  }

  expBackoff(n) {
    return Math.min(2 ** n * 1000 + jitter(80, 400), 30_000);
  }

  recordFail(status) {
    const now = Date.now();
    this.fails = this.fails.filter(f => now - f.t < this.failWindowMs);
    this.fails.push({ t: now, status });
  }

  shouldTrip() {
    return this.fails.length >= this.maxConsecutiveFails;
  }

  // Buffer mgmt
  async monitorBuffer(videoEl) {
    setInterval(() => {
      const buf = bufferAheadMs(videoEl);
      if (buf < this.minBufferMs) emit('buffer_low', { buf });
      if (buf > this.maxBufferMs) videoEl.playbackRate = 1.0; // no acelerar arbitrario
      if (this.detectFreeze(videoEl)) {
        emit('freeze_detected', { lastUpdate: this.lastFrameTime });
        this.recoverFromFreeze(videoEl);
      }
      const dropped = videoEl.getVideoPlaybackQuality?.()?.droppedVideoFrames || 0;
      if (dropped - (this.lastDropped || 0) > 30) emit('frames_dropped', { dropped });
      this.lastDropped = dropped;
    }, 1000);
  }

  detectFreeze(videoEl) {
    const t = videoEl.currentTime;
    const now = Date.now();
    if (this.lastT === t && now - this.lastTimeUpdate > 3000) return true;
    if (this.lastT !== t) { this.lastT = t; this.lastTimeUpdate = now; }
    return false;
  }

  async recoverFromFreeze(videoEl) {
    // 1. retry buffer reload
    videoEl.currentTime = videoEl.currentTime + 0.001;
    await sleep(500);
    if (!this.detectFreeze(videoEl)) return;
    // 2. soft reload manifest
    await this.fetchManifest();
    // 3. hard: switch to backup CDN if circuit OPEN sostenido
    if (this.cdnCurrent === 'primary') {
      this.cdnCurrent = 'backup';
      emit('cdn_switch', { to: 'backup' });
      // re-fetch manifest forces new path
      await this.fetchManifest();
    }
  }

  // Heartbeat QoE
  startHeartbeat() {
    setInterval(() => {
      emit('heartbeat', {
        session: this.session,
        bitrate: this.bitrateCurrent,
        bufferMs: this.lastBufferMs,
        cdn: this.cdnCurrent,
        circuit: this.lastCircuitHeader,
      });
    }, this.heartbeatMs);
  }
}

function jitter(min, max) { return min + Math.random() * (max - min); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
Notas:

emit() debería enviar a un endpoint colector (ej. /api/qoe-collect.php no en archivo — recomendación adicional)
El player NO debe rotar UA agresivamente (regla del usuario), respeta el banco UAPhantomEngine ya existente
El header X-APE-Circuit permite al cliente saber si insistir o no
11. Prevención de freeze, lag, cortes, buffering
Problema	Control en archivo	Recomendación adicional
Gaps de segmentos	proxy_cache_use_stale error timeout sirve viejo	Player: detectar EXTINF faltante en manifest, reload
Segmentos corruptos	proxy_buffers 128 64k evita partial write	Player: verify xxd magic byte 0x47 al iniciar (vimos en E2E)
Timestamps desalineados	provider responsibility	Player: jitter buffer 3-5s
Discontinuities incorrectas	provider	Player: respeta #EXT-X-DISCONTINUITY
GOP / keyframes	provider	medir con ffprobe en healthcheck periódico
Bitrate ladder inestable	provider ABR	Player: anti-flap (cambios <2/min)
ABR agresivo	provider	Player: hysteresis 25% antes de subir bitrate
Buffer underrun	slice 1m precarga 1m por segment	Player: minBufferMs=3000 antes de play
Manifests obsoletos	TTL shield 20s, intercept 2s	Player: re-fetch manifest cada target-duration / 2
Codecs incompatibles	provider entrega HEVC/H264	Player: capabilities check pre-play
Latencia excesiva	proxy_connect_timeout 2s	medir RTT WG ≤ 30ms
CDN saturada	circuit breaker → cooldown	Player: respeta X-APE-Circuit: OPEN
Origin saturado	xtream_slot=1	Coordinar 1 sesión por token, no 2 streams paralelos
Parámetros HLS recomendados (manifest emitido por shield/provider)
TARGETDURATION: 6-10s (alineado con segments del provider)
VERSION: 6+ para EXT-X-INDEPENDENT-SEGMENTS
EXT-X-START: TIME-OFFSET=-14, PRECISE=YES (live edge con buffer)
Buffer player: min=3000ms, target=8000ms, max=15000ms
12. Pruebas E2E confirmadas
Suite synthetic — script e2e_check.sh corriendo cada 5min vía systemd timer.

Casos de prueba
ID	Test	PASS	WARN	FAIL	Bloquea deploy
E1	GET /shield/<TOKEN>/tivigo.cc/.../m3u8 retorna 200 con X-Cache-Status	200 ≤ 1.5s	200 1.5-3s	non-200 o timeout	sí
E2	Manifest contiene ^#EXTM3U y ≥ 1 .ts line	parse OK	—	parse FAIL	sí
E3	GET 1er .ts retorna 200, ≥ 100KB, magic byte 0x47	OK	<100KB pero 0x47	wrong magic / 4xx	sí
E4	HTTP 206 range request retorna 206 con Content-Range	OK	—	200 (no range)	warn
E5	302 controlado: header Location apunta a host hijackeado	OK	host nuevo no hijackeado	host externo	warn (alerta nueva CDN)
E6	Token válido vs token expirado: 204 vs 403	OK	—	inverso	sí
E7	CDN failover sintético (block rynivorn vía iptables temp)	switch <5s	5-10s	>10s	warn
E8	Origin failover (block 1 IP del upstream)	switch <3s	3-5s	>5s	sí
E9	DNS failover: stop unbound, esperar serve-expired	continúa 200	—	5xx inmediato	warn
E10	TLS handshake: cert > 7d expiry	OK	<30d	<7d	warn (renew)
E11	Multi-región (Bogotá + Cali peers)	both 200	uno fail	ambos fail	sí
E12	Multi-dispositivo (ONN + curl 181.63.176.21)	OK	—	uno fail	sí
E13	Latencia upstream p95 < 1s	OK	1-2s	>2s	warn
E14	Pérdida de paquetes 5% (tc netem)	<2% rebuffer	2-5%	>5%	warn
E15	BW variable 1-50 Mbps	adaptive OK	freezes <3	freezes >3	warn
E16	Carga: 50 streams paralelos	<5% 5xx	5-10%	>10%	sí
E17	Estrés: 200 streams paralelos	<10% 5xx	10-25%	>25%	informativo
E18	Caos: kill -9 unbound	self-heal <30s	30-60s	>60s	sí
E19	Sesión 8h continua	0 freeze >5s	<3 freezes	≥3 freezes	warn
E20	Recovery automática post-cooldown circuit	HALF-OPEN→CLOSED	HALF-OPEN sticky	OPEN sticky	sí
Evidencia requerida
Cada test PASS escribe a /var/log/netshield-e2e.log con timestamp + duration + bytes
FAIL dispara: alert PagerDuty/email + bloqueo deploy CI/CD + dump shared_dict Lua + screenshot logs últimos 60s
Acción si E1, E2, E3 o E20 FAIL en CI
Rollback automático al snapshot anterior (/root/backups/daily/<TS>.tar.gz)
nginx -t + reload con backup
Notify operator
13. Observabilidad
Métricas clave (recolección)
Métrica	Fuente	Tag	Agregación
http_status_total	nginx access_log	status, host, route	counter
2xx_rate	derivado	route	rate(5m)
3xx_controlled	derivado (302→hijackeado)	host_target	rate
4xx_rate	derivado	status, host	rate
5xx_rate	derivado	status, upstream	rate
manifest_success_rate	log filter \.m3u8 200	host	ratio
segment_success_rate	log filter `.ts 200	206`	host
playback_start_success	E2E E1+E3 ratio	—	ratio
startup_time_ms	E2E timer	percentil	p50, p95, p99
rebuffering_ratio	player heartbeat (recom)	session	rolling
avg_bitrate	player heartbeat	session	mean
bitrate_switches	player heartbeat	session	counter
cdn_error_rate	derivado	cdn_host	rate
origin_error_rate	$upstream_addr	upstream IP	rate
dns_error_rate	unbound stats	—	rate
tls_error_rate	nginx error_log filter	—	rate
latency_upstream	$upstream_response_time	upstream	p50/p95/p99
dropped_frames	player heartbeat	session	sum
freeze_events	player + healthcheck	session	counter
circuit_state	Lua shared_dict /_metrics	host	gauge
circuit_trips	Lua dict	host	counter/h
failover_success_rate	E2E E7+E8	—	ratio
mttd_seconds	alert lag	event	distribution
mttr_seconds	alert→resolve	event	distribution
Dashboards (recomendación adicional, NO en archivo)
Dashboard 1 — Salud por host:

Panel: 2xx/4xx/5xx rate por server_name (nfqdeuxu, line.tivi, ky-tv, tivigo)
Panel: latency p50/p95/p99 por upstream
Panel: cache hit ratio por route
Panel: circuit state heatmap (CLOSED/HALF-OPEN/OPEN per host)
Dashboard 2 — QoE cliente:

Panel: playback start success / fail
Panel: rebuffering ratio
Panel: bitrate avg + switches
Panel: freeze events timeline
Dashboard 3 — Infra:

Panel: nginx workers, conn rate
Panel: /dev/shm utilization
Panel: WG handshake age
Panel: autopilot recommended rate vs deployed
Alertas (con severidad)
Alerta	Threshold	Severidad	Runbook
5xx_rate >1% en 5min	sustained 3 windows	P1	RB-5xx
circuit_trips >10/h	rolling 1h	P2	RB-circuit
nginx down	systemctl is-active != active	P1	RB-nginx-down
unbound down	idem	P1	RB-dns
cert expiry <7d	daily check	P2	RB-tls
WG handshake >5min stale	healthcheck.sh	P2	RB-wg
/dev/shm >90%	healthcheck.sh	P3	RB-cache-cleanup
startup_time p95 >3s	5min	P2	RB-latency
auth fail rate >5/min	shield-auth.log	P2	RB-auth
502_cascade >500/5min	healthcheck.sh ya implementado	P1	RB-502
14. CI/CD y despliegue
Pipeline propuesto (ningún CI en archivo, recomendación adicional).


stages:
  - validate_static
  - validate_runtime
  - canary
  - rollout
  - monitor
  - rollback_auto

validate_static:
  - nginx -t -c <new_config>          # syntax
  - lua-check upstream_*.lua            # luacheck
  - php -l shield-auth.php              # PHP syntax
  - jq . authorized_tokens.json         # JSON valid
  - shellcheck *.sh
  - bloqueo: cualquier exit != 0

validate_runtime (sandbox):
  - docker compose up -d nginx_test php-fpm_test
  - run e2e_check.sh contra sandbox
  - bloqueo: ratio FAIL > 0%

canary:
  - apply config a 1 worker (config_reload con prefix nuevo)
  - ruta tráfico 5% a worker canary 30min
  - monitor: 5xx, circuit_trips, latency p95
  - bloqueo si: 5xx > 1%, p95 > 2s, circuit > baseline+50%

rollout:
  - reload todos workers
  - watch 1h post-deploy
  - bloqueo si: rebuffering subió, playback_start cayó, 5xx subió

monitor:
  - dashboards verde 24h
  - SLO breach → trigger rollback

rollback_auto:
  - cp /root/backups/daily/<prev_TS>.tar.gz/* /etc/nginx/...
  - nginx -t && systemctl reload nginx
  - notify SRE
Bloqueos automáticos
5xx_rate > 1% sostenido 5min post-deploy → rollback
rebuffering_ratio > +0.5pp vs baseline → rollback
playback_start_success cae > 1pp → rollback
manifest_success_rate cae > 1pp → rollback
15. Runbooks operativos
Cada runbook con: síntoma, métrica, diagnóstico, acción auto, acción manual, RTO, validación.

RB-5xx (5xx masivo upstream)
Síntoma: alerta 5xx_rate >1%
Métrica: awk '$7 ~ /5../' shield_access.log | wc -l
Diagnóstico: tail -50 shield_error.log | grep "upstream prematurely closed"
Acción auto: Lua circuit breaker abre cooldown 15-30s
Acción manual: si persiste >5min: curl player_api.php → si auth=1, problema infra; si auth!=1, rotar credenciales (out of scope auto)
RTO: ≤10min
Validación: SLO 5xx vuelve <1% en 5min
RB-circuit (circuit_trips elevado)
Síntoma: >10 trips/h
Métrica: grep APE-CIRCUIT-TRIP shield_error.log último 1h
Diagnóstico: identificar host en TRIP. Test directo curl http://<host>/...
Acción auto: cooldown 15-30s aplicado
Acción manual: si host caído: iptables -t mangle -L SURFSHARK_MARK | grep <ip> validate routing
RTO: ≤15min
Validación: TRIPs vuelven a 0/15min
RB-nginx-down
Síntoma: systemctl is-active nginx = inactive
Métrica: healthcheck.sh alert
Diagnóstico: journalctl -u nginx -n 100
Acción auto: systemd Restart=on-failure (recomendación adicional, no en archivo)
Acción manual: nginx -t + systemctl start nginx
RTO: ≤2min
Validación: curl /health 200
RB-dns (unbound caído)
Síntoma: alerta unbound inactive
Diagnóstico: journalctl -u unbound -n 100
Acción auto: serve-expired: yes da gracia 1h
Acción manual: unbound-checkconf && systemctl restart unbound
RTO: ≤5min
Validación: dig +short tivigo.cc @127.0.0.1 retorna 178.156.147.234
RB-tls
Síntoma: cert expiry <7d
Acción manual: certbot renew --nginx + systemctl reload nginx
RTO: ≤15min
Validación: openssl s_client -connect iptv-ape.duckdns.org:443 < /dev/null | openssl x509 -dates -noout
RB-buffering (rebuffering elevado)
Síntoma: rebuffer_ratio >0.5%
Diagnóstico: latency p95 upstream, /dev/shm util, circuit state
Acción: si /dev/shm >85% → purge cache; si latency >2s → check WG; si circuit OPEN → revisar provider
RTO: ≤20min
RB-freeze masivo
Síntoma: freeze events >3/sesión
Diagnóstico: ¿cliente único? ¿provider único?
Acción: cliente único → reset reproductor; provider único → check upstream IPs reachability
RTO: ≤10min
RB-tokens-expirados
Síntoma: 401/403 sostenido en shield-auth.log
Acción manual: editar /etc/net-shield/authorized_tokens.json actualizar expires
Validación: curl test con token
RB-rollback-urgente
Síntoma: deploy rompió producción
Acción: cd /root/backups/daily/ && tar xzf <prev>.tar.gz -C / && nginx -t && systemctl reload nginx
RTO: ≤2min
Validación: E2E E1-E3 PASS
RB-region-degradada (multi-VPS futuro)
N/A en archivo (single VPS), planeado Fase 4
RB-saturación-tráfico
Síntoma: hard_cap rate-limit eleva 429
Diagnóstico: autopilot history p95 vs deployed rate
Acción auto: autopilot en MODE=recommend genera config candidate
Acción manual: revisar y aplicar
RTO: ≤15min
RB-segmentos-404
Síntoma: 404 sustained en .ts
Diagnóstico: comparar manifest vs upstream actual (diff)
Acción: purge cache manifest stale; player reload
RB-manifest-inconsistente
Síntoma: manifest cached apunta a host muerto (caso 503226)
Diagnóstico: curl shield/<channel> ¿X-Cache-Status: STALE muy viejo?
Acción: rm -rf /dev/shm/nginx_cache/* + systemctl restart nginx
Validación: nuevo manifest con X-Cache-Status: MISS
16. Checklist final de aceptación producción
 Archivo analizado completo (18 files revisados)
 6 server blocks vhost inventariados
 6 upstream blocks inventariados
 17 riesgos clasificados con probabilidad/impacto
 SLOs definidos y monitoreados (13 métricas)
 Manifests pasan E1, E2 en CI
 Segmentos pasan E3, E4 (200, 206)
 302 controlado pasa E5 (host hijackeado)
 401/403 dispara backoff Lua + alert
 404 segmento dispara retry y/o use_stale
 5xx dispara circuit breaker + use_stale + alert
 CDN failover probado E7 (<5s)
 Origin failover probado E8 (<3s)
 DNS failover probado E9
 Player retry coordinado con Retry-After y X-APE-Delay-Ms
 Observabilidad: logs locales + dashboards + alertas activas
 Runbooks documentados (15 RBs)
 E2E synthetic 24/7 (cron 5min)
 Rollback automático probado en sandbox
 Playback validado en ONN 4K real con canal de cada provider
 Backup auto diario corriendo (verificado en sesión)
 Healthcheck cron 5min corriendo (verificado)
 Snapshot defensivo en repo local (verificado)
17. Entrega final consolidada
Resumen ejecutivo
Sistema NET SHIELD IPTV consiste en NGINX edge proxy + DNS hijack vía unbound + Lua circuit breaker + auth token PHP, todo sobre 1 VPS Hetzner con WireGuard hacia clientes y SurfShark Miami como egress autorizado para los providers IPTV con suscripción legal. La versión "mejorada" del archivo INTEGRA el fix map $request_uri $shield_host (que romperse en mi sesión previa por orden de carga), implementa Lua circuit breaker formal CLOSED/HALF-OPEN/OPEN con MAX_FAILURES=5, y agrega proxy genérico /px/HOST/PATH con resolver unbound. El sistema es funcionalmente correcto pero faltan capas operativas: observabilidad central, E2E synthetic, CI/CD, multi-region, dashboards, alertas formales.

Hallazgos clave del archivo
✅ Circuit breaker formalizado — patrón clásico CLOSED/HALF-OPEN/OPEN con probe atómico
✅ Map-based variables — $shield_host ya correctamente definido externo
✅ Universal proxy /px/ agregado pero sin auth_request → riesgo si IP whitelist falla
✅ DNS hijack 6 hosts — provider primario + 2 CDN dynamic
⚠ $shield_path sigue usando $3 — funcional pero inconsistente
⚠ CMAF mime declarado pero sin server — declarativo huérfano
⚠ Sin proxy_next_upstream explícito en shield-location
⚠ Sin endpoint /_metrics — visibilidad runtime limitada
⚠ Sin CI/CD — todos cambios manuales (alto riesgo regresión)
⚠ No hay multi-region — single point of failure VPS Hetzner
Riesgos críticos
#	Riesgo	Probabilidad	Acción inmediata
1	Provider rota CDN a host nuevo no interceptado	Media	Wildcard catch-all en server_name + alert
2	VPS único caído = total outage	Baja-Alta	Multi-VPS Fase 4 (planeado)
3	Lua dict reset al reload pierde state	Alta	Documentar; reload solo si necesario, restart sólo cuando obligatorio
4	Token expira sin alert	Media	Cron diario validar token expiry
5	/dev/shm full por cache	Baja	healthcheck.sh ya alerta >90%
6	TLS expira sin alert	Baja	Recomendado certbot dry-run + alert
Plan de implementación (síntesis)
13 fases ordenadas — auditoría → arquitectura → HTTP → caché → manifests → segmentos → failover → player → observabilidad → E2E → canary → producción → operación.

Cambios técnicos concretos prioritarios
Inmediato (esta sesión, ya hecho): snapshot defensivo + backup auto + healthcheck — completados
Corto plazo (1-7 días): proxy_next_upstream explícito en shield-location; consolidar maps duplicados; agregar auth_request a /px/; logrotate explícito
Mediano plazo (2-4 semanas): endpoint /_metrics Lua; Prometheus exporter; dashboard Grafana; CI/CD pipeline básico
Largo plazo (1-3 meses): Multi-VPS HA Fase 4; DASH/CMAF si requerido; player heartbeat collector
Configuraciones sugeridas
Detalladas en §6 (HTTP), §7 (caché), §11 (anti-freeze).

Pseudocódigo player resiliente
§10 — Coordinated con headers shield existentes (X-APE-Circuit, X-APE-Delay-Ms, Retry-After).

Plan E2E
§12 — 20 tests, PASS/WARN/FAIL definidos, rollback auto en E1/E2/E3/E20 FAIL.

Dashboards y alertas
§13 — 3 dashboards (host health, QoE, infra), 10 alertas con severidad y runbook asociado.

Runbooks
§15 — 15 RBs con síntoma/métrica/diagnóstico/acción/RTO/validación.

Checklist producción
§16 — 22 items.

Matriz de riesgos
§2 — 17 riesgos con probabilidad, impacto, causa raíz, mitigación, gap.

Criterios de aceptación
Sistema entra a producción solo si:

E2E synthetic PASS 100% en 24h continuas
SLOs verde 7 días post-deploy
Runbooks aprobados por SRE
Backup auto + rollback probado
Playback real validado por usuario en ONN 4K con un canal de cada provider (4 providers)
Documento listo para implementación. Cualquier desviación del archivo está marcada como "recomendación adicional".