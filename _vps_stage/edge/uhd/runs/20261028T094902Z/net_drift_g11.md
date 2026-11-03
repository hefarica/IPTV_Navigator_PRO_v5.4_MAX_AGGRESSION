# G11 · Drift de red: `rto_min lock 40ms` — verificación READ-ONLY

**Tarea:** t36 (Fase 0 · G11) · **Miembro:** s8-net-tcp-quic · **Stamp:** `20261028T094902Z` · **HEAD repo:** `2f8861c`
**Host:** `ubuntu-2gb-ash-1` (178.156.147.234) · **0 escrituras**: solo `sysctl -n`, `ip route show`, `ss -tin`, `nstat`, `cat`/`grep`/`systemctl show`. Sin `ip route change`, sin `sysctl -w`, sin reinicios, sin deploys.
**Origen de la premisa:** G11 de t31 (`runs/20261028T093843Z/postdeploy_gates.md:23`) — «`rto_min lock 40ms` = 0 rutas (30 rutas)». **Re-medido por mí**: se confirma (§1).

## 1 · Estado actual medido (2026-10-28T09:49Z)

| Ítem | Comando | Valor real |
|---|---|---|
| `tcp_congestion_control` | `sysctl -n` | **bbr** ✓ |
| `default_qdisc` | `sysctl -n` | **fq** ✓ |
| `tcp_fastopen` | `sysctl -n` | **3** ✓ |
| `tcp_slow_start_after_idle` | `sysctl -n` | **0** ✓ |
| Rutas totales (todas las tablas) | `ip route show table all \| wc -l` | **30** |
| Rutas con `rto_min` | `… \| grep -c rto_min` | **0** ✗ |
| `initcwnd` / `initrwnd` | `… \| grep -oE` | **400 / 400** (×2 cada uno) ✓ |
| `advmss` | `… \| grep -oE` | **1340** (ruta wg0) |
| Ruta default efectiva | `ip route show default` | `metric 50 initcwnd 400 initrwnd 400` (gana) + `metric 100 proto dhcp` |
| Ruta usada hacia Internet | `ip route get 1.1.1.1` | `via 172.31.1.1 dev eth0 … cache initcwnd 400 initrwnd 400` — **sin rto_min** |
| Último arranque | `uptime -s` | **2026-07-03 01:50:39** |

## 2 · Provenance: de dónde salió «rto_min lock 40ms en 3 /24»

- **Origen único:** `IPTV_v5.4_MAX_AGGRESSION/net-shield/wireguard/AUDIT_2026-04-21/state-snapshot.txt:29-31` — tres rutas estáticas a /24 de proveedor con `initcwnd 100 rto_min lock 40ms initrwnd 100`. Es un **snapshot de estado capturado el 2026-04-21**, no una medición viva de hoy.
- **Hoy esas rutas no existen**: `ip route show table all | grep -cE "91\.208\.115|149\.18\.45|172\.110\.220"` → **0**. No hay «3 /24» que puedan llevar `rto_min`.
- El único artilugio que podría llevarlo hoy es la **ruta default**, y no lo tiene (§3).
- **Quién lo declara como invariante:** `docs/manifestos/.../truth_guards.md:89` lo lista entre los «network invariants»; `enterprise_doctrine_manifest.json:68` guarda `rto_min_lock_ms: 40`. **Pero la tabla-gate que ordena ABORTAR** (`.agents/rules/reglavps.md:51-52`) solo exige **D1 `bbr`** y **D2 `rmem≥128MB`** — **`rto_min` no está en el gate**. Es doctrina de prosa, no invariante de deploy.

## 3 · Causa raíz del `= 0` (determinada, no hipótesis)

1. **`iptv-tcp-autosync` es un no-op que declara éxito cada ~60 s.** Su fuente es `NGINX_CONF=/etc/nginx/conf.d/iptv-intercept.conf` (script `/usr/local/sbin/iptv-tcp-autosync:22`), y ese archivo **NO EXISTE** en la caja (`[ -f ]` → ABSENT). El `grep … 2>/dev/null` devuelve vacío ⇒ el bucle de /24 nunca itera ⇒ `exit 0`. (El `.service` figura `disabled`, pero su `.timer` está **enabled**, así que la unidad **corre igual**: por eso el journal muestra ejecuciones.) Journal del 28-10: `Finished iptv-tcp-autosync.service … success` a las 09:44:32 / 09:45:34 / 09:46:36 / 09:47:37, `Result=success`, `ExecMainStatus=0`. **Verde permanente con efecto cero.**
2. **La ruta que realmente se usa no viene de ese script.** `ape-net-tuning` (timer activo; último disparo 2026-10-24T16:50Z) hace `ip route replace default … initcwnd 400 initrwnd 400` **sin `rto_min`** (`_vps_stage/lab/ape-net-tuning.sh:27-28`) y crea la ruta **metric 50**, que gana a la de DHCP. `ip route replace` **sobrescribe el objeto de ruta**: cualquier atributo no listado se pierde.
3. **Hook redundante y mudo:** `/etc/networkd-dispatcher/routable.d/50-ape-rto-min.sh` sí pasa `rto_min 40ms`, pero actúa sobre la default y con `… 2>/dev/null || true`: si el `ip route change` no casa, **falla en silencio**.
4. **Ningún mecanismo del host BORRA rutas** (solo `replace`/`change`). Con el arranque del **2026-07-03**, los atributos de ruta no sobreviven al reboot y las 3 /24 de abril **nunca se recrearon**: no hay unidad ni script que las cree.

## 4 · Veredicto

> ### **PRE-EXISTENTE** — no es una regresión del deploy de Fase 0
> **No REGRESIÓN:** el deploy de hoy escribió **solo 10 ficheros nginx** (`postdeploy_gates.md:24`, paridad 10/10: 9 Lua + `conf.d/50-ape-meta-plane.conf`) y **no ejecutó ningún `ip route` ni `sysctl -w`** (`postdeploy_remote*.sh` son lectura). Nada de ese deploy puede quitar un atributo de ruta. Además la ausencia precede al deploy: arranque 2026-07-03, deploy 2026-10-28.
> **No NO_VERIFICABLE:** estado actual medido por mí (§1) y causa raíz reproducida (§3).
> **Lo que sí es NOT_RUN:** la **fecha exacta** en que desaparecieron las 3 /24 (no hay artefacto que registre la remoción; la inferencia «reboot 2026-07-03 + nadie las recrea» es derivada, no observada).

## 5 · Impacto real en streaming y qué NO hacer

- **Qué se pierde:** sin `rto_min`, el suelo de RTO es el del kernel (`TCP_RTO_MIN` = 200 ms, constante del kernel — no medida en esta corrida). Solo afecta al **primer retransmit de un paquete perdido sin dupacks** (con SACK/fast-retransmit el caso es raro). En el edge actual (**metadata-only**: manifiestos y poco más) el peor caso es **una cola de ~200–1000 ms en un GET**, que el player reintenta. **Impacto: BAJO.**
- **⚠️ NO restaurarlo a ciegas — sería contraproducente.** RTT pasivo medido (`ss -tin`, 4 flujos WAN): **13,4 · 15,6 · 87,0 · 122,5 ms**. Dos de cuatro rutas tienen RTT **2–3× mayor que 40 ms**: con `rto_min 40ms` el temporizador dispararía **antes** de que pueda volver el ACK legítimo ⇒ **retransmisiones espurias** y señal falsa de pérdida para BBR. La doctrina de 40 ms asume un path de ~28 ms (claim no medido, ver council S8 §6.1); **este host no está en ese régimen.**
- **Contexto (sin tasa):** `nstat` acumulado desde el arranque: `TcpRetransSegs 62 231 304`, `TcpExtTCPTimeouts 73 444 313`. **No calculo tasa**: falta denominador (segmentos enviados) ⇒ **NOT_RUN**.
- **Acción propuesta (NO ejecutada; requiere ventana + autorización del propietario):** (i) **arreglar G11**, no la red: separar invariantes medibles (`bbr`, `fq`, `fastopen=3`, `slow_start=0`, `initcwnd/initrwnd=400` — todos PASS) del ítem informativo `rto_min`, que hoy no puede ser FAIL; (ii) **retirar o reparar** `iptv-tcp-autosync` + `50-ape-rto-min.sh` (dos mecanismos que compiten y uno miente); si se restaura, una sola fuente de verdad = `ape-net-tuning.sh` incluyendo `rto_min`, con valor **≥ RTT del destino** (p. ej. 150 ms), no 40 ms; (iii) solo entonces re-medir.
- **Riesgo de la acción (ii):** tocar la ruta default de producción puede cortar salida si el `replace` sale mal; el rollback es `ip route replace default via 172.31.1.1 dev eth0 proto dhcp metric 100`, y exige ventana.

## 6 · Corrección a mi propio council S8

`S8-05` marcaba `initcwnd=400` como **BLOCKED / sin prueba de aplicación**. **Hoy está medido y aplicado**: `initcwnd 400 initrwnd 400` en las **dos** rutas default y en `ip route get 1.1.1.1` (§1). La fila `rto_min` del council (§2, «PASS parcial (3 /24)») se degrada a **PRE-EXISTENTE, no aplicado** con la causa de §3.

## 7 · Evidencia (comandos + exit)

| Comando (read-only, vía `ssh -o BatchMode=yes`) | Exit | Resultado |
|---|---|---|
| `sysctl -n tcp_congestion_control default_qdisc tcp_fastopen tcp_slow_start_after_idle` | 0 | `bbr fq 3 0` |
| `ip route show table all \| wc -l` / `\| grep -c rto_min` | 0 | `30` / `0` |
| `ip route show table all \| grep -oE "initcwnd…\|initrwnd…\|advmss…\|mtu…"` | 0 | `initcwnd 400`×2, `initrwnd 400`×2, `advmss 1340`×1 |
| `ip route show default` · `ip route get 1.1.1.1` · `uptime -s` | 0 | 2 defaults (m50 gana) · sin rto_min · `2026-07-03 01:50:39` |
| `grep -cE "91\.208\.115\|149\.18\.45\|172\.110\.220"` (tabla) | 0 | `0` |
| `grep -nE "^NGINX_CONF=\|^INITCWND=\|^INITRWND=\|^RTO_MIN=" /usr/local/sbin/iptv-tcp-autosync` | 0 | `22:NGINX_CONF=…/iptv-intercept.conf`, `25:400`, `26:400`, `27:40ms` |
| `[ -f /etc/nginx/conf.d/iptv-intercept.conf ]` | 0 | **ABSENT** |
| `systemctl show iptv-tcp-autosync.service -p Result -p ExecMainStatus` | 0 | `success` / `0` (corrió 09:47:37Z) |
| `systemctl list-unit-files "iptv-*" "ape-net*"` | 0 | `iptv-tcp-autosync.service **disabled**`; `.timer` **enabled**; `ape-net-tuning.timer` **enabled+active** |
| `ss -tin state established \| grep -oE "rtt:…"` | 0 | `15,6 · 87,0 · 13,4 · 122,5` ms (4 WAN) |
| `nstat -az \| grep -E "TcpRetransSegs\|TcpExtTCPTimeouts"` | 0 | `62 231 304` / `73 444 313` (acumulado desde boot) |

**No ejecutado (prohibido por contrato):** `ip route change`, `sysctl -w`, reinicios, `systemctl start/stop`, cualquier escritura en el VPS, cualquier benchmark.
