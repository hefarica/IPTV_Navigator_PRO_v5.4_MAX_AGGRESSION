# Council S8 — Red TCP / QUIC / WireGuard / MTU anidado

**Rol:** s8-net-tcp-quic (S8 · Network/TCP/QUIC Engineer). **Fase:** Council, SOLO LECTURA.
**Snapshot:** `git HEAD` = `e38a89bb30c02cb41050f34cef43d3711a2b0644` (`git rev-parse --short HEAD` → `e38a89b`, exit 0) · commit `2026-10-26 03:08:19 -0500`.
**Ejecutado:** solo lectura. Cero benchmarks, cero túneles, cero escrituras a VPS/configs. Única escritura: este archivo.
**Caveat obligatorio (truth_guards.md §Required final caveat):** los anchors de playlist son metadata; instalación real y wake requieren ruta VPS desplegada + host/dispositivo ADB autorizado o runtime compatible.

---

## 1. Alcance, método y denominador

Inspeccionado (read-only): `tcp_congestion_control`, `default_qdisc`, `rmem_max/wmem_max`, `somaxconn`, `tcp_fastopen`, `initcwnd/initrwnd/rto_min`; `IPTV_v5.4_MAX_AGGRESSION/vps/network/**`; WireGuard `*.conf` (**PrivateKey/PSK/Endpoint nunca impresos**); `sing-box*/`, `xray_config.json`, `singbox_onn4k_config.json` de la raíz; `*.conf` de nginx (155 rutas); `.agents/rules/{reglavps,propositovps,regla3}.md`; manifiestos obligatorios.

**Denominador declarado vs aplicado.** "Aplicado" = lo que un archivo *ejecutable o de configuración real* fija, o lo **medido** en un artefacto del repo con fecha y comando. "Declarado" = doctrina/prosa. Nunca convertí prosa en PASS.

Fuentes de medición disponibles en el repo (no re-ejecutadas):
- `audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf` + `VPS_NGINX_DUMP_ANALYSIS.md` (medición 2026-10-25).
- `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/AUDIT_2026-04-21/state-snapshot.txt` (medición 2026-04-21).
- `docs/MEDIA_FANOUT_FEASIBILITY.md` (host medido 2026-10-25/26).

---

## 2. Declarado vs aplicado — perfil de red

| Invariante | Declarado (archivo:línea) | Aplicado medido | Estado |
|---|---|---|---|
| `tcp_congestion_control=bbr` | `.agents/rules/reglavps.md:51`; `CLAUDE.md:408` | `bbr` (`VPS_NGINX_DUMP_ANALYSIS.md:134`) | **PASS** (medido) |
| `default_qdisc=fq` | `reglavps.md` (implícito BBR); `propositovps.md:87` | `fq` (`VPS_NGINX_DUMP_ANALYSIS.md:134`) | **PASS** (medido) |
| `tcp_fastopen=3` | `propositovps.md:88`; sysctl `:7` | `3` (`VPS_NGINX_DUMP_ANALYSIS.md:135`) | **PASS** (medido) |
| `tcp_slow_start_after_idle=0` | `propositovps.md:96` | `0` (ídem) | **PASS** (medido) |
| `tcp_notsent_lowat` | `131072` en `.../sysctl/99-iptv-shield.conf:52` **y** `floor_lock_config.json:30` | `131072` (medido) | **PASS con drift**: el mismo archivo lo pisa a `16384` (`:103`) |
| `rmem_max/wmem_max` | ≥128 MB (`reglavps.md:52`); 64 MB (`99-iptv-shield.conf:10-11`); 128 MB (`vps/sentinel/ape-sentinel-vps.sh:155`); 4 MB (`ape-uhdx-sentinel.sh:297`); 16 MB (`backend/fase2_hardening/.../ape_iptables_hardening.sh:235`) | `268435456` = 256 MB (medido) | **FAIL — 5 valores, ninguno es el aplicado** |
| `nf_conntrack_max` | `524288` (`99-iptv-shield.conf:43`) | `65536` (`MEDIA_FANOUT_FEASIBILITY.md:71`) | **FAIL** (8× declarado vs medido) |
| `initcwnd/initrwnd` | `400/400` (`_vps_stage/lab/floor_lock_config.json:29`; `_vps_stage/lab/ape-net-tuning.sh:17-18`) | `100/100` (`state-snapshot.txt:26,27,29-31`) · doc dice `64` (`docs/LAB_TO_VPS_ALIGNMENT.md:69`) | **FAIL — 3 valores; 400 NO-RUN** |
| `rto_min lock 40ms` | `truth_guards.md:89`; `floor_lock_config.json` (`rto_min_lock_ms:40`) | `rto_min lock 40ms` en 3 rutas (`state-snapshot.txt:29-31`) | **PASS parcial** (3 /24, no default) |

**S8-01 (HIGH)** `rmem_max/wmem_max`: cinco valores en cinco capas y **ninguno coincide con el medido**. `audit/.../VPS_NGINX_DUMP_ANALYSIS.md:135` marca "PASS (perfil de autopista completo)" apoyándose en el valor medido, no en ningún archivo del repo → el PASS es de la caja, no del árbol.
**S8-02 (HIGH)** `99-iptv-shield.conf` tiene **claves duplicadas con last-wins**: `tcp_notsent_lowat` 131072(`:52`)→16384(`:103`) y `tcp_max_tw_buckets` 1000000(`:61`)→2000000(`:114`). Lo medido (`notsent_lowat=131072`) **prueba que ese archivo no es lo aplicado**: hay otro productor (probablemente `ape-sentinel-vps.sh:155-156`, que reescribe 128 MB). El archivo es además **UTF-16 LE con BOM** (7286 B, 3633 NUL) → no es un `.conf` de sysctl válido para `sysctl -p`/`systemd-sysctl` sin conversión.
**S8-03 (HIGH)** Dos comentarios afirman efectos que **ninguna directiva del archivo produce**: `:79` «TCP delayed ACK reducido 40→10ms» (no existe directiva de delayed ACK en el archivo; la línea siguiente es `tcp_no_metrics_save`); `:106` «Reducir `rto_min` del kernel a 40ms» — **`rto_min` no es sysctl**, es atributo de ruta (`ip route … rto_min`). El archivo documenta una capacidad que no tiene.
**S8-04 (MEDIUM)** Claves que en kernels modernos fueron eliminadas o no aplican (`tcp_low_latency:81`, `tcp_fack:29`, `tcp_early_retrans:82`, `busy_poll/busy_read:91-92`) siguen declaradas como activas en `propositovps.md:89`. **NOT_RUN**: verificar `sysctl -a | grep -E 'tcp_low_latency|tcp_fack|tcp_early_retrans'` exige el host; prohibido tocarlo.
**S8-05 (HIGH)** `initcwnd=400` es el invariante cardinal de S8 (`truth_guards.md:89`) y **no hay artefacto que pruebe su aplicación**: `_vps_stage/lab/ape-net-tuning.service|.timer` existen en staging, el directorio `vps/vps-live-snapshot-20260428/systemd/` está **vacío**, y la única medición (`state-snapshot.txt:26-31`) muestra `100`. Estado: **BLOCKED** (no verificable sin ventana autorizada en el VPS).

---

## 3. MTU de túneles anidados — validación contra `.conf` reales

**Cadena declarada:** ONN → `wg0` → VPS → `wg-surfshark` → proveedor (`wireguard-routing.md:7-13`, `shielded-sop.md:23`).

| Archivo (real) | Objeto | MTU declarado |
|---|---|---|
| `net-shield/wireguard/AUDIT_2026-04-21/wg0.conf:11` | wg0 (VPS) | **1380** |
| `net-shield/wireguard/AUDIT_2026-04-21/onn.conf:10` | ONN 4K | **1380** |
| `backend/wg-surfshark.conf:5` | egress Miami | **1280** |
| `backend/wg-surfshark-br.conf:5` | egress Brasil | **1280** |
| `vps/network/wg-mtu-tuning.if-up:7-9` | override al boot | **1340 / 1420 / 1420** |
| `net-shield/wireguard/server/wg-enroll.sh:53` | plantilla de peer | **1420** |
| `vps/ape-telemetry-installer/wireguard-device.conf:38` | device telemetría | **1420** |
| `singbox_onn4k_config.json:33` | ONN (otro stack) | **1400** |

**S8-06 (HIGH) La doctrina "wg0≈1340, wg-surfshark≈1420" no la cumple ningún `.conf`.** Solo la cumple un hook de arranque. Los `.conf` reales dicen 1380 y **1280**. `1340` en los documentos medidos es `advmss`, no MTU: `state-snapshot.txt:27` (`advmss 1340`) y `MEDIA_FANOUT_FEASIBILITY.md:72` — con MTU 1380, MSS = 1340. Confundir `advmss` con MTU es el origen del "1340" doctrinal.
**S8-07 (CRITICAL) Anidamiento sin margen si el hook no corre.** Con los `.conf`: paquete interior 1380 + 60 (overhead WG/IPv4) = **1440 > 1280** del túnel exterior ⇒ fragmentación / PMTU black hole en el camino a proveedor. El hook corrige a 1340 (1340+60=1400 ≤ 1420 ✓) pero **no hay unidad que lo instale** (`vps/network/` solo contiene `*.service|.timer|.path` para `wg-health-fast` y `brazil-route-persist`; `wg-mtu-tuning.if-up` se instala por `if-up.d`, que en Ubuntu/systemd-networkd **no ejecuta** porque `$IFACE` no se define). Aplicación: **NOT_RUN**.
**S8-08 (MEDIUM) La "matemática" del hook cuenta doble el header IPv4.** `wg-mtu-tuning.if-up:4` → `1340 + 60 (wg0) + 60 (wg-surfshark) + 20 (IP) = 1480`. Los 60 B de overhead WireGuard **ya incluyen** el IPv4 exterior (20 IPv4 + 8 UDP + 32 WG): el paquete real en `eth0` es **1460**, no 1480. La conclusión (cabe en 1500) es correcta; la justificación no.
**S8-09 (CRITICAL) `wg0.conf` del repo es un artefacto inválido.** `net-shield/wireguard/AUDIT_2026-04-21/wg0.conf:24` (y `:33`) concatenan **dos directivas en una línea** — verificado byte a byte (153 chars, sin LF): `…--set-dscp-class EFPostUp = iptables -t mangle -A POSTROUTING…`. `wg-quick up wg0` fallaría en `PostUp`. Prueba de que **no es copia fiel de lo desplegado**: el archivo del repo pesa **2818 B / 42 líneas** y el del VPS medido pesa **1824 B** (`state-snapshot.txt:98`). Desplegar desde el repo rompe el túnel.
**S8-10 (MEDIUM)** Clamp MSS asimétrico: hay `TCPMSS --clamp-mss-to-pmtu` para `-o wg0`, `-i wg0` y `OUTPUT -o wg0` (`wg0.conf:25-27`; aplicado en `state-snapshot.txt:38-40`) pero **ninguno para `wg-surfshark*`**. El camino egress a proveedor queda sin clamp explícito; el MSS sale del MTU de interfaz (1280 ó 1420 según quién ganó), que es justamente el valor en disputa.

---

## 4. HTTP/2 y HTTP/3 — configs reales

**S8-11 (HIGH) HTTP/2: declarado en staging, ausente en la config viva.** `listen 443 ssl http2` aparece en ≥12 `.conf` del repo (`frontend/vps/nginx-hls-max.conf:13-14`, `backend/nginx-live-current.conf:18-19`, `frontend/vps/nginx-m3u8-site-https.conf:11-12`, y los gemelos en `backup_master_v5.4_phantom_engine/`, que son duplicados byte-a-byte de los mismos 6 nombres). La **config viva medida** no lo tiene: `audit/alignment/2026-10-25/40-vps/_raw/nginx-T.conf:639-640` → `listen 443 ssl default_server;` sin `http2`. `grep -i http2` sobre ese dump: **0**. El borde sirve **HTTP/1.1**. Estado aplicado: HTTP/2 **NOT PRESENT**.
**S8-12 (HIGH) HTTP/3/QUIC: cero implementación, y en este build es imposible.** `grep -E 'quic|http3|Alt-Svc|ssl_alpn|http_v3'` sobre los **155 `*.conf`** del repo → **0 coincidencias**. El servidor medido es `nginx/1.24.0 (Ubuntu)` con `--with-compat --with-debug --with-pcre-jit` y **sin `--with-http_v3_module`** (`DOCTRINE_CORRECTION.md:121`; `VPS_INVENTORY.md:37`). QUIC nativo entra en nginx 1.25+; en 1.24.0 stock **no hay h3 posible sin upgrade de paquete**. Cualquier afirmación de HTTP/3 en este snapshot es falsa por construcción.
**S8-13 (MEDIUM) El generador promete h3 al proveedor y al player:**
- `frontend/js/ape-v9/headers-matrix-v9.js:272` emite `"Alt-Svc": 'h3=":443"; ma=2592000'` como **header de request**. `Alt-Svc` es un header **de respuesta** (RFC 7838): enviado en un request es inerte y añade superficie de fingerprinting.
- `scripts/m3u8-typed-arrays-ultimate.js:798` inyecta `#EXT-X-APE-GLOBAL-HEADER:name=Alt-Svc, value='h3=":443"; ma=86400'` en el manifiesto — declara una capacidad que el borde no tiene.
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:1474-1535` fija `quic:true, http3:true` desde P1 ⇒ emite `#EXTVLCOPT:adaptive-reload-use-http3=true` / `-use-quic=true`. Inerte (VLC cae a TCP) pero es capacidad inexistente declarada.
- **Contradicción interna**: `frontend/js/ape-v9/ape-profiles-config-v5.js:60` fija `quic:false, http3:false` para el mismo perfil → dos fuentes de verdad del mismo flag.
**S8-14 (LOW)** `sing-box-1.11.11-linux-armv7/`, `sing-box-1.13.11-linux-armv7/` (solo binario + LICENSE, sin config), `SFA-*.apk`, `v2rayNG.apk`, `xray_config.json` (sniff `quic`, `:53`) y `singbox_onn4k_config.json` (`tun.mtu=1400`, `:33`) son **residuo de dispositivo ONN 4K**, no configuración de red del proyecto ni del VPS. No participan en la cadena de borde.

---

## 5. Valores contradictorios entre capas (raíz ↔ `_vps_stage` ↔ `vps/`)

**S8-15 (CRITICAL) El estado medido contradice la arquitectura de 3 túneles.** `wireguard-routing.md:7-13` declara `wg0` + `wg-surfshark` + `wg-surfshark-br`. La medición `state-snapshot.txt`: `wg show all dump` lista **solo `wg0`** (`:9`); `ip -br addr` **no muestra** `wg-surfshark*` (`:17-23`); `/etc/wireguard/` **no contiene** `wg-surfshark*.conf` (`:91-100`); y las rutas a proveedor van **`via 172.31.1.1 dev eth0`** (`:29-31`) ⇒ egreso **directo**, sin SurfShark. Los `backend/wg-surfshark*.conf` son **staging no aplicado** (al 2026-04-21). Cualquier razonamiento de MTU anidado sobre "wg-surfshark=1420" parte de un túnel que no consta desplegado.
**S8-16 (HIGH) Tres dueños de la misma tabla de ruteo.** `miami-route-persist.sh:11-17` (PostUp de `wg-surfshark.conf`) y `surfshark-routing.sh:44-70` (boot + failover) escriben ambos `ip rule fwmark 0x100 table 100` y `default dev wg-surfshark table 100`, con sintaxis distinta (`table 100` vs `lookup 100`) y sin orden garantizado. Un tercer actor (`brazil-route-persist.service|.path`) observa `wg-surfshark-br.conf`.
**S8-17 (HIGH) El "failover sub-segundo" no es sub-segundo.** `net-shield/scripts/wg-health-fast.sh:27` `FAIL_THRESHOLD=3` × `OnUnitActiveSec=2s` (`wg-health-fast.timer:5`) = **≥6 s** de detección; `:57` sondea `ping -c1 -W1 -I wg-surfshark 1.1.1.1` (Cloudflare, **no el proveedor**); `:29`+`:39-42` imponen `COOLDOWN_SECONDS=600` durante los cuales el script hace `exit 0` **sin detectar nada** (si Brasil también cae, no hay swap por 10 min). El comentario `:3` «Sub-second failover detector» es falso respecto a sus propias constantes.
**S8-18 (MEDIUM)** `vps/network/wg-health-fast.service:8` ejecuta `/opt/netshield/scripts/wg-health-fast.sh`, pero el snapshot VPS medido solo tiene `wg-health-monitor.sh` y `netshield_autopilot_v2.py` en `scripts/` ⇒ el script del timer **no consta desplegado**: unidad no verificable (**NOT_RUN**), y el timer de 2 s sobre un script ausente reinicia en falso cada 2 s.
**S8-19 (MEDIUM) IPs de proveedor hardcodeadas** en `net-shield/scripts/surfshark-routing.sh:30` (10 IPv4/CIDR) para el flush de conntrack. Viola `iptv-no-hardcode-doctrine` (dato productivo como literal) y deja sin flush a cualquier proveedor no listado. El flush es `conntrack -D --orig-dst` (`:31`): no cubre `--orig-src` ni puertos, y `91.208.115.0/24` como `--orig-dst` puede no aceptarse (queda silenciado por `|| true`).
**S8-20 (MEDIUM) DSCP EF sin cola que lo use.** `wg0.conf:24` marca EF en PREROUTING y en POSTROUTING (ambas directivas concatenadas en esa línea) y la medición confirma las reglas (`state-snapshot.txt:37,41-46`). Pero `default_qdisc=fq` **no tiene clases**, así que la marca EF no altera el encolado. Beneficio QoE: **NOT_RUN** (no medido, no medible sin ventana).
**S8-21 (LOW) Rutas doctrinales inexistentes.** `CLAUDE.md:355-360` ordena leer `.gemini/settings/reglavps.md`, `propositovps.md` y `regla3.md`. `.gemini/settings/` contiene **7 archivos** y ninguno es esos; los reales están en `.agents/rules/`. La obligación de lectura apunta a una ruta vacía.
**S8-22 (LOW) Host inconsistente, afecta cualquier cifra de capacidad.** `state-snapshot.txt:3` → «Hetzner **CX22, ubuntu-2gb-ash-1**»; `docs/PROMPT_MAESTRO_INGENIERIA_EXTREMA.md:22` y `MEDIA_FANOUT_FEASIBILITY.md:62` → «**CPX21**, 3 vCPU, 4 GB». No son la misma máquina.

---

## 6. Cifras sin medición reproducible (NO-RUN) y disensos

### 6.1 Toda cifra de throughput/latencia sin medición reproducible = **NO-RUN**

| Cifra | Dónde | Veredicto |
|---|---|---|
| «Miami 28ms / Brasil 121ms» | `surfshark-routing.sh:6-7`; `wireguard-routing.md:30` («SIEMPRE el primario 28ms vs 121ms») | **NO-RUN** — sin comando, sin fecha, sin artefacto. Y el túnel SurfShark no consta desplegado (§5). |
| «1 Gbit/s nominal» | `MEDIA_FANOUT_FEASIBILITY.md:72` | **NO-RUN** — es el plan del proveedor; en la misma fila se admite `speed=-1` (la NIC no reporta). |
| «Sub-second failover» | `wg-health-fast.sh:3` | **REFUTADO por el propio código** (§S8-17). |
| Beneficio de DSCP EF | `wg0.conf:24` | **NO-RUN** — sin qdisc con clases no hay efecto medible. |
| `initcwnd=400` como mejora de arranque | `floor_lock_config.json:13` | **NO-RUN** — no hay A/B medido; y el valor aplicado medido es 100. |
| «128 MB de buffers = autopista completa» | `reglavps.md:52`; `propositovps.md:91` | **NO-RUN** — el medido es 256 MB; sin prueba de que el tamaño mejore nada. |

**No ejecuté ningún benchmark** (prohibido por contrato). Las únicas cifras que reporto como PASS son las que ya están medidas en un artefacto fechado del repo, y las cito con `archivo:línea`.

### 6.2 Disensos (declarados, no resueltos — no los convierto en PASS)

- **D-1 · MTU: ¿1340 o 1380 para `wg0`?** El hook (`1340`) es más conservador bajo un exterior de 1420; el `.conf` (`1380`) coincide con el `advmss 1340` **medido** en abril y con `onn.conf` + `firetv-dns-immutable.md:44`. Disiento de unificar a 1340 sin medir PMTU por proveedor: si el exterior real es 1280 (como dicen los `.conf` de SurfShark), ni 1340 ni 1380 sirven y hace falta bajar el interior a ≤1220. **Decisión correcta = medir `tracepath` por proveedor; sin eso, todo valor es NO-RUN.**
- **D-2 · `rmem_max=256 MB` en una caja de 3.8 GB.** Está **medido**, pero `rmem_max` es techo por socket: con `nf_conntrack_max` efectivo 65536 y sin `tcp_mem` declarado en ningún archivo del repo, existe riesgo de presión de memoria. No puedo medirlo (prohibido tocar el VPS) ⇒ lo dejo como **disenso abierto para S7**, no como PASS de calidad.
- **D-3 · HTTP/3 como invariante.** El borde es *metadata-only* y no transporta vídeo (`CLAUDE.md` §REALIDAD MEDIDA). Incluso con nginx 1.25+, h3 sólo aceleraría el handshake del manifiesto. Disiento de tratar h3 como prioridad: **el orden correcto es MTU/clamp → failover real → conntrack → h2**, y h3 último. Recomendación: **NO-GO** de h3 en este snapshot, no por falta de ganas sino porque el binario medido no lo soporta.
- **D-4 · Failover sin conntrack completo.** `conntrack -D --orig-dst` por IP fija (`surfshark-routing.sh:31`) sólo invalida flujos cuyo destino original coincide. Disiento de llamarlo "reconnect inmediato" (`:69`): los flujos con NAT previo o SNI compartido sobreviven al swap y siguen negros hasta el timeout de conntrack. Sin medición de `conntrack -S` no hay veredicto.

### 6.3 Totales y veredicto

| Severidad | N |
|---|---|
| CRITICAL | 3 (S8-07, S8-09, S8-15) |
| HIGH | 9 (S8-01, S8-02, S8-03, S8-05, S8-06, S8-11, S8-12, S8-16, S8-17) |
| MEDIUM | 7 (S8-04, S8-08, S8-10, S8-13, S8-18, S8-19, S8-20) |
| LOW | 3 (S8-14, S8-21, S8-22) |
| **Total** | **22** |

**Veredicto S8: WARN — no PASS.** Núcleo del borde sano y medido (BBR + fq + fastopen + slow_start 0). Pero: (a) ningún `.conf` de WireGuard del repo es desplegable sin romper el túnel; (b) el MTU anidado depende de un hook sin instalador conocido y con matemática mal justificada; (c) HTTP/2 no está en la config viva y HTTP/3 es imposible en el binario medido mientras el generador lo promete; (d) `initcwnd=400` — el invariante cardinal de S8 — **no tiene una sola prueba de aplicación**. Todo lo anterior es **corregible en documentación y artefactos**: ninguna corrección exige tocar el VPS en esta fase.
