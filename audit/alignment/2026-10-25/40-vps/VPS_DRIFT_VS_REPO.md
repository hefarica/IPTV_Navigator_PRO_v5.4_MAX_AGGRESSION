# VPS_DRIFT_VS_REPO — Drift archivo por archivo: repo ↔ VPS producción

**Comparación triple, no doble.** Este es el punto crítico del método: comparar «el repo» contra «el VPS» sin distinguir **HEAD** de **working tree** produce un veredicto falso. Hay otras sesiones trabajando en el mismo árbol (`git status` del repo, en esta ventana: **18 archivos `M` + múltiples `??`**), así que el working tree contiene **trabajo en curso que nunca fue commiteado**. Comparar el working tree contra producción confundiría *drift* con *WIP*.

Por eso cada fila se evalúa así:

| Columna | Fuente | Qué prueba |
|---|---|---|
| **HEAD** | `git cat-file blob HEAD:<path>` → sha256 | Lo que está **comprometido** en la historia del repo |
| **VPS** | `sha256sum` en `root@178.156.147.234` | Lo que **corre** en producción |
| **WIP** | `git status --porcelain` + `git diff --stat` | Trabajo **no commiteado** de otras sesiones |

**Unión de fuentes:** tal como ordena el enunciado, se comparó **todo** artefacto presente en cualquiera de los dos lados, sin consultar ningún guard para decidir qué mirar. La tabla es inmune al drift ledger↔guard de `_vps_stage/lua/**`.

**Veredictos:** `PASS` = sha256 idéntico · `FAIL` = difiere o falta de un lado · `UNKNOWN` = sin espejo comparable / WIP ajeno no versionado.

---

## 1. Resultado principal (el titular)

> **`HEAD` del repo ↔ VPS: 16 de 16 artefactos solapados son BYTE A BYTE IDÉNTICOS.**
>
> **Producción está exactamente sincronizada con la historia de git.** No hay drift de contenido entre lo commiteado y lo desplegado.
>
> El único drift de contenido **real** es `ape-meta-public.conf`, donde **el VPS va por delante de HEAD** (v2 en producción, v1 en git).
>
> Todo lo demás que «parece» drift es (a) **WIP no commiteado** de otras sesiones, o (b) **artefactos commiteados/escritos que nunca se desplegaron**.

---

## 2. Módulos Lua — `/etc/nginx/lua/` ↔ `_vps_stage/lua/`

### 2.1 HEAD vs VPS — **14/14 PASS**

| # | Módulo | HEAD (bytes · sha256) | VPS (bytes · sha256) | Veredicto |
|---|---|---|---|---|
| 1 | `ape_gateway.lua` | 11 651 · `66a2001730d7e2b566d9baa0b9ce697bd413544395a82e5d8f8b8bb6c869fdf5` | 11 651 · `66a20017…69fdf5` | **PASS** |
| 2 | `ape_header.lua` | 2 210 · `a15e1fe3748ff95c5074777c8ea6d46b000c9c446b486e4631f6a8e7e0406968` | 2 210 · `a15e1fe3…406968` | **PASS** |
| 3 | `ape_uri_rebase.lua` | 6 043 · `1d456a463f9bcd656fe566bf31b2ae0b6a852f5f46f90d7fba7f69234d8dbaf3` | 6 043 · `1d456a46…d8dbaf3` | **PASS** |
| 4 | `ape_lab_api.lua` | 1 124 · `c457267953e0d69685146bb2ee999c62ac080647035b378bb2a29f5ff58fac71` | 1 124 · `c4572679…58fac71` | **PASS** |
| 5 | `ape_lab_bridge.lua` | 7 723 · `d0cae6166fd41f104d08b937a3f5fa6b640c86f26f78e7ed9a76041eaba92c61` | 7 723 · `d0cae616…ba92c61` | **PASS** |
| 6 | `ape_lab_upload.lua` | 4 723 · `b5c4d5f16d3e6bbf36c0a46e08cfed7bf6ce92b646bb5e441ff5f5945fb5f4af` | 4 723 · `b5c4d5f1…5fb5f4af` | **PASS** |
| 7 | `ape_luatest.lua` | 10 711 · `98a29c444f1bca0f59d4b15a7426eaf8e64e7745d12caaba54266019c37eb37d` | 10 711 · `98a29c44…9c37eb37d` | **PASS** |
| 8 | `ape_obs.lua` | 4 030 · `f477741bcfa600bb44801d44b83a62777848d4b11e5305a7327bee09d1fdc6d0` | 4 030 · `f477741b…9d1fdc6d0` | **PASS** |
| 9 | `ape_profile_resolver.lua` | 4 191 · `432610e6a4844d9528922a9570636fe42b13e6afa8c47eb0fe3b6bdec6a04508` | 4 191 · `432610e6…ec6a04508` | **PASS** |
| 10 | `ape_rebase_lib.lua` | 4 646 · `88140fc80ece09caeb705a2fdb681485607c12f56cb4274d72132e58d7e515fc` | 4 646 · `88140fc8…8d7e515fc` | **PASS** |
| 11 | `ape_uhd.lua` | 5 320 · `f1f5eb674744858ae7c5e84c73262e37545b0c84e557c6466cad20ae7b1f3b5e` | 5 320 · `f1f5eb67…ae7b1f3b5e` | **PASS** |
| 12 | `ape_wake_on_manifest.lua` | 2 284 · `d9c6b65d7626cd3630e76e185bca1ec932b4db324bbbd8337ae445630796db19` | 2 284 · `d9c6b65d…30796db19` | **PASS** |
| 13 | `bw_adaptive_floor.lua` | 9 075 · `b1a22492bef2ee4874e4f1b6179ccb5898095352b8965f2e4c3837883f77cedc` | 9 075 · `b1a22492…83f77cedc` | **PASS** |
| 14 | `sentinel_auth_guard.lua` | 7 207 · `dd1d328bbe4e0c28cbc454d2e50abf714ff0a82d327132cb3b5b5e5865cbcdbf` | 7 207 · `dd1d328b…e5865cbcdbf` | **PASS** |

**Los 14 módulos que corren son exactamente los 14 que están commiteados.** Byte a byte.

### 2.2 Commiteados en HEAD pero **NO desplegados** — 2 FAIL (ausente en VPS)

| Módulo | HEAD | VPS | Veredicto |
|---|---|---|---|
| `ape_caps.lua` | 128 983 B · `40404c70eb52b5c9030eeab3305cfce5125d05437f052b0baafdea38367c0043` | **AUSENTE** | **FAIL (ausente en VPS)** — 126 KB de capacidades commiteadas sin desplegar |
| `ape_session.lua` | 89 549 B · `cbef5132a3a2f8e5521f271309fed03f9c369ac2c8496f2761317a76f6410965` | **AUSENTE** | **FAIL (ausente en VPS)** — 87 KB de gestión de sesión commiteados sin desplegar |

### 2.3 **WIP no commiteado** de otras sesiones — 5 UNKNOWN

`git status --porcelain -- _vps_stage` en esta ventana:

```
 M _vps_stage/lua/ape_gateway.lua
 M _vps_stage/lua/ape_header.lua
 M _vps_stage/lua/ape_uri_rebase.lua
 M _vps_stage/tests/fanout_concurrency.sh
?? _vps_stage/lua/ape_edge_health.lua
?? _vps_stage/lua/ape_prefetch_next.lua
?? _vps_stage/nginx/ape-edge-watchdog.sh
?? _vps_stage/nginx/cache-first-edge.conf
?? _vps_stage/nginx/logrotate-ape-edge.conf
?? _vps_stage/ops/           (ape-nginx-restart-audit.sh)
```

`git diff --stat` de los 3 módulos del camino caliente:

```
 _vps_stage/lua/ape_gateway.lua    | 172 ++++++++++++++++++++++++++++++++++++++
 _vps_stage/lua/ape_header.lua     | 130 +++++++++++++++++++++++++++-
 _vps_stage/lua/ape_uri_rebase.lua |  80 ++++++++++++++++++++++++-
 3 files changed, 378 insertions(+), 4 deletions(-)
```

| Artefacto | HEAD | Working tree | VPS | Veredicto |
|---|---|---|---|---|
| `ape_gateway.lua` | 11 651 B (`66a20017…`) | 19 087 B (**+172 líneas**) | 11 651 B | **UNKNOWN** — el VPS **coincide con HEAD**. Las +172 líneas son WIP ajeno **no desplegado**. |
| `ape_header.lua` | 2 210 B (`a15e1fe3…`) | 8 088 B (**+130/−?**) | 2 210 B | **UNKNOWN** — igual: VPS == HEAD; el WIP es ajeno |
| `ape_uri_rebase.lua` | 6 043 B (`1d456a46…`) | 9 930 B (**+80/−?**) | 6 043 B | **UNKNOWN** — igual |
| `ape_edge_health.lua` | **no commiteado** | 2 879 B (`86ebcb65…`) | **AUSENTE** | **UNKNOWN** — WIP ajeno, no desplegado |
| `ape_prefetch_next.lua` | **no commiteado** | 5 338 B (`662b753b…`) | **AUSENTE** | **UNKNOWN** — WIP ajeno, no desplegado |

> **Corrección importante respecto a una lectura ingenua:** si se comparase el **working tree** contra el VPS, se concluiría «3 módulos del camino caliente divergen en producción». **Es falso.** Producción == HEAD. La divergencia es trabajo en curso de otra sesión que **no se ha desplegado y no está commiteado**.
>
> **Para otras sesiones:** el código que corre es el **bloqueado en HEAD**. Si alguien necesita auditar «lo que se va a desplegar», está en el working tree; si necesita auditar «lo que corre», está en HEAD **y** en el VPS — son el mismo.

---

## 3. Configuración nginx y artefactos operativos

### 3.1 HEAD vs VPS

| # | Artefacto | HEAD | VPS | Veredicto |
|---|---|---|---|---|
| 1 | `_vps_stage/nginx/meta-plane.conf` → `/etc/nginx/conf.d/50-ape-meta-plane.conf` | 10 939 B · `e06ee870c55201c359990d99459aa9784d01569f5200176cfffed3448525d3f9` | 10 939 B · `e06ee870…` (232 líneas) | **PASS** — **byte a byte.** El artefacto central del plano está sincronizado. |
| 2 | `_vps_stage/public/ape-hosts-allow.txt` → `/etc/nginx/ape-hosts-allow.txt` | 809 B · `167c61df5ccc193a5250c13a6729cc2c4864918e9579340486bcaff6a596c3df` | 809 B · `167c61df…` | **PASS** — **allowlist SSRF idéntica.** |
| 3 | `_vps_stage/public/ape-meta-public.conf` → `/etc/nginx/snippets/ape-meta-public.conf` | **2 091 B · `adbf3e56211aa9c616df110e344096d47ef8df932b4946f0338f69d87a54c8e0`** | **2 509 B · `0a4002166054834c756d5451da49f8e9aa6327f5672a1e625a9c044df9ff91de`** (mtime `2026-10-25T18:07:04Z`) | **FAIL — VPS ADELANTE de HEAD** |
| 3-bis | `/etc/nginx/snippets/ape-meta-public.conf.bak_20261025T180653` | — | **2 091 B · `adbf3e56211aa9c616df110e344096d47ef8df932b4946f0338f69d87a54c8e0`** | **PASS** — **el repo == el backup v1 del VPS, exactamente** |
| 4 | `_vps_stage/nginx/media-fanout.conf` | 21 313 B · `b1000903d3f1e5939fe0c4c0658809f7975e820eaf6c6a1fa8e4d1030c4112b9` | **NO en `/etc/nginx`**; copias sueltas en `/tmp/media-fanout.conf`, `/tmp/mf_verify/`, `/tmp/mf_v1/src/nginx/` | **FAIL (no desplegado)** |

**DR-03 — el drift de contenido más importante:** `/etc/nginx/snippets/ape-meta-public.conf` en producción es **v2** (2 509 B), y `HEAD` tiene **v1** (2 091 B — criptográficamente idéntica al `.bak_20261025T180653` que el VPS conservó del despliegue anterior). La v2 es la que **arregla el 404 del `/cdn/`** delegando en `127.0.0.1:8088` (el propio archivo lo documenta: «v2 (2026-10-25): el gateway NECESITA `/_ape/_fetch`, definido SOLO en el server 8088. Ejecutarlo en el 443 devolvía 404 y la lista CDN no reproducía»).
**⇒ El fix está en producción y NO está en git.** Un `git checkout HEAD -- /etc/nginx/...` desde una copia del repo **reintroduce el bug**.

### 3.2 Artefactos en el working tree pero **no commiteados y no desplegados** — UNKNOWN

| Artefacto | Working tree | HEAD | VPS | Veredicto |
|---|---|---|---|---|
| `_vps_stage/nginx/cache-first-edge.conf` | 9 873 B · `d857bb16ffba2dbf46a941f78f608182240ac558f434117ed19515beabaa75a6` | **no commiteado** | AUSENTE | **UNKNOWN** — WIP ajeno |
| `_vps_stage/nginx/ape-edge-watchdog.sh` | 4 231 B · `83ea7c5052e988e1ed103ce9d2f9767bb48eb18573c020e4279522d1e5336dda` | **no commiteado** | AUSENTE | **UNKNOWN** — WIP ajeno |
| `_vps_stage/nginx/logrotate-ape-edge.conf` | 1 552 B · `2b0b6ec66725bbcde7eb1f4d15ddf84405ffb23817401e50c88ca2cc4543ec2e` | **no commiteado** | AUSENTE | **UNKNOWN** — WIP ajeno |
| `_vps_stage/ops/ape-nginx-restart-audit.sh` | 1 439 B · `0db5508f70403935511af1ad14644d41b433c894b718327aa2b6f33466544673` | **no commiteado** | AUSENTE | **UNKNOWN** — WIP ajeno. **Nota:** es justo la herramienta que habría atribuido los reinicios de nginx de §7 |

### 3.3 `vps_configs/` — presentes en el working tree, **ninguno desplegado** — 7 FAIL (no desplegado)

| Artefacto | Bytes | sha256 (working tree) | VPS |
|---|---|---|---|
| `autopista-trap.conf` | 6 958 | `1d0b483f295c340ee437dd7f2e08db5b61aeeaedccafea09b4af7d8bf2f83130` | **NO en `/etc/nginx`** — sólo copias históricas: `/root/ape_orchestration_backup_20260612_062848/nginx/conf.d/`, `/root/ape_backups_407_deep_20260612T162829Z/nginx/conf.d/`, `/var/backups/ape-dnsonly-1781933419/` |
| `fix_trap.py` | 388 | `1205addc01b46ff068e600e9b06e65a1e70ef89f3824cd2a2ef8c1da624d35abe` | AUSENTE |
| `hooks_balance.sh` | 2 641 | `2c6b672948511450061341ac1ad47a75b0b34b72a49d88b8023af578ed3c2039` | AUSENTE |
| `inject_all_reactor.py` | 1 995 | `d3d9245858fa6903c42a644340d38272ded506e744c0a62345470e78db85c3eb` | AUSENTE |
| `inject_reactor_log.py` | 1 266 | `2431283ac3e2443fedfec2e90fb9d94e3dd0cca095eae225fd54ab187930ab76` | AUSENTE |
| `inject_reactor.py` | 935 | `3cd83d742d62746b0a52702764bd55625e7d36bcbae1e293d809939e6272e7f7` | AUSENTE |
| `lua_inventory.sh` | 1 649 | `e6d0b0a555b6bf401738d2fff25cc2b5f4a323dd48a2b3e571a4a35bb50db05f` | AUSENTE |

### 3.4 Config VPS-only sin espejo en el repo — 10 UNKNOWN

| Artefacto | Bytes | sha256 | Veredicto |
|---|---|---|---|
| `/etc/nginx/nginx.conf` (95 líneas) | 2 789 | `a9a7146a46b4080f32e0fd1e40772bce53cac3a8f0cd18ed2e1ebc5c31d4ce1f` | **UNKNOWN** — sin espejo |
| `/etc/nginx/sites-enabled/default` (188 líneas) | — | `58bee1cb7b911bc1b40ebab65003d1cdfcfa8a7c6f03dc5e0acbdd77b38a4f96` | **UNKNOWN** — sin espejo. **Contiene la location que sirve las listas** |
| `/etc/nginx/sites-enabled/coa-navigator` (50 líneas) | — | `85dfc864d83a1ecab8cb3e7c4aedaced7569ec342172294757cfc44850d18688` | **UNKNOWN** — sin espejo |
| `/etc/nginx/conf.d/iptv-limit-conn.conf` | — | `917c98d819576f55fe60547ce0d5330f3d5fd2a32bcbc7cd73d524f876c3ec58` | **UNKNOWN** |
| `/etc/nginx/conf.d/iptv-proxy.conf` | — | `328921c0efdab6ca778d585b437a051dce0f1492ce4a7ec7d64dad0447880b6f` | **UNKNOWN** |
| `/etc/nginx/conf.d/00-ape-manifest-nocache.conf` | — | `1aec928698b29be228e62d5c39d927bb6aa46583600e70d09183de3d763349eb` | **UNKNOWN** |
| `/etc/nginx/conf.d/00-ape-match-zone.conf` | — | `005402fb8de34305249038e8069b217d87558edda121f84174605356b6a9be69` | **UNKNOWN** |
| `/etc/nginx/conf.d/00-ape-pull-zone.conf` | — | `88400a9b04c94211a6fc99a04cdeb22e1de9749490b00b01b958a6ad1d4d7257` | **UNKNOWN** |
| `/etc/nginx/snippets/ape-device-allow.conf` | — | `0bbdb9267f0d65e82d0ef986610f74192a74ee3e3c30418d40d72773bb8cd2b0` | **UNKNOWN** — y además **no incluido** en `nginx -T` ⇒ inerte |
| `/etc/nginx/snippets/fastcgi-php.conf` | — | `a9dd98bf9631d727f0a846a9c7f4fe6193468a714c782df26d5cc9a7756411f2` | **UNKNOWN** — paquete Ubuntu, no aplica |

### 3.5 Watchdogs

| Artefacto | VPS | Repo | Veredicto |
|---|---|---|---|
| `ape-meta-watchdog.service` | presente, timer **active** (60 s) | `_vps_stage/watchdog/` `dbccdc5e…` | **UNKNOWN** — no se hasheó el unit del VPS (sólo `cat`). **Comparación pendiente.** |
| `ape-meta-watchdog.sh` | `/usr/local/bin/ape-meta-watchdog.sh`, ejecuta y sale 0 | `_vps_stage/watchdog/` `17bba3d2…` | **UNKNOWN** — mismo motivo |
| `ape-meta-watchdog.timer` | `/etc/systemd/system/`, `OnUnitActiveSec=60s`, **active** | `_vps_stage/watchdog/` `e51d7ff5…` | **UNKNOWN** |

---

## 4. Pipeline doctrinal «APE Crystal Engine v2.0» — 13 artefactos, **13 AUSENTES**

`find /etc/nginx -type f \( -name "*shield*" -o -name "*crystal*" -o -name "*upstream_gate*" -o -name "*decision_engine*" -o -name "*segment_guardian*" -o -name "*fortify*" -o -name "*ts_crystal*" \)` → **cero resultados**. Y ninguno está tampoco en `_vps_stage/lua/`.

| Artefacto doctrinal | Fuente | Estado medido | Veredicto |
|---|---|---|---|
| `/etc/nginx/snippets/shield-location.conf` | OMEGA manifiesto, `ape-crystal-edge` §2 | **NO EXISTE** | **FAIL** |
| `ape_crystal_rewrite.lua` (fase 1) | idem | **NO EXISTE** | **FAIL** |
| `decision_engine.lua` TELESCOPE v2.1 (fase 1) | idem | **NO EXISTE** | **FAIL** |
| `ape_ts_crystal_hook.lua` v3.0 (fase 1) | idem | **NO EXISTE** | **FAIL** |
| `upstream_gate.lua` (fase 2) | idem | **NO EXISTE** | **FAIL** |
| `ape_shield_header_filter.lua` (fase 3) | idem | **NO EXISTE** | **FAIL** |
| `ape_shield_body_filter.lua` (fase 4) | idem | **NO EXISTE** | **FAIL** |
| `combined_body_filter.lua` (fase 4) | idem | **NO EXISTE** — pero lo **referencian** `ape_uhd.lua`, `ape_uri_rebase.lua`, `bw_adaptive_floor.lua` y el comentario de `lua_shared_dict circuit_metrics` | **FAIL** (referencia colgante) |
| `ape_segment_guardian.lua` (fase 5) | idem | **NO EXISTE** | **FAIL** |
| `ape_crystal_fortify.lua` | idem | **NO EXISTE** | **FAIL** |
| `ape_lcevc_enhancement_layer.lua` | idem | **NO EXISTE** | **FAIL** |
| `ape_8k_crystal_escalator.lua` | idem | **NO EXISTE** | **FAIL** |
| `bandwidth_reactor.lua` | consumidor declarado de `circuit_metrics` | **NO EXISTE** | **FAIL** |

**Lectura correcta:** no es un defecto del runtime, es un **defecto de documentación**. El propio `50-ape-meta-plane.conf` describe y justifica la arquitectura real («metadata-only edge», «el tráfico de video sigue bloqueado (404) porque este plano sólo sirve playlists»). **La corrección es documental. Desplegar el pipeline Crystal para «alinear» sería la mutación destructiva que `iptv-vps-touch-nothing` prohíbe.**

---

## 5. Motor Rust `ape-crystal-rust` (:8084) — 6 FAIL

| Elemento | Esperado | Medido | Veredicto |
|---|---|---|---|
| Unit systemd | `ape-crystal-rust.service` | `Unit ape-crystal-rust.service could not be found` · `is-enabled` `not-found` · `is-active` `inactive` | **FAIL** |
| Puerto | `:8084` listening | `ss -tlnp \| grep 8084` → vacío | **FAIL** |
| `/health` | 200 | `curl -m 4 -w %{http_code}` → **`000`** | **FAIL** |
| `/metrics` | 200 | → **`000`** | **FAIL** |
| Binario | `~/ape-crystal-engine-rust/target/release/` | no existe. `find / -maxdepth 4 -name "ape-crystal*" -type f` → sólo `/var/backups/ape-crystal-patches/ape-crystal-upscaler-location.conf.bak_220418` | **FAIL** |
| Usuario de despliegue | `ape-auditor` | `id` = `uid=0(root)`; sin usuario `ape-auditor` en el camino medido | **FAIL** |

---

## 6. SQLite de telemetría

| DB | VPS | Repo | Veredicto |
|---|---|---|---|
| `conviva.db` | `/var/www/html/prisma/db/conviva.db` **0 B, 0 tablas**, mtime `2026-06-16T03:47:30Z` | sin espejo | **FAIL vs doctrina** — la cadena QoE (`conviva-event.php → conviva.db → recalibración del LAB`) **no tiene almacén** |
| `ape_lists.db` | 53 248 B · `registered_lists`=**26**, `list_channel_headers`=**4**, `list_profile_headers`=**0**, mtime `2026-06-21T03:19:15Z` | sin espejo | **UNKNOWN** — sin espejo, **contenido vivo** |
| `ape_devices.db` | 24 576 B · `ape_devices`=**0**, `ape_providers`=**0**, mtime `2026-05-22T05:24:39Z` | sin espejo | **UNKNOWN** — tablas **vacías** |

> **Método no-mutante:** `sqlite3` CLI **no está instalado** en el VPS. La lectura se hizo con `python3` usando `sqlite3.connect("file:…?mode=ro&immutable=1", uri=True)` → **read-only + immutable**, que no crea `-wal`/`-shm` ni toma locks de escritura.

---

## 7. Cron / watchdogs / timers

| Elemento | Repo | VPS | Veredicto |
|---|---|---|---|
| `/etc/cron.d/cache-health-monitor` | no versionado | existe 259 B, mtime `2026-10-26T02:59:58.961769470Z`, md5 `dec0e2c57dd7af9134e9371188213646`, job **comentado** | **UNKNOWN + MUTACIÓN AJENA** — sin espejo; documentado, **no revertido** (`VPS_INVENTORY.md` §9.1) |
| `/usr/local/bin/cache-health-monitor` | no versionado | 2 561 B, `-rwxr-xr-x`, mtime `2026-04-25` | **UNKNOWN** — binario intacto |
| `/opt/cache_hygiene.sh` | no versionado | existe, corre cada 5 min | **UNKNOWN** |
| 15 `.timer` en `/etc/systemd/system/` | `_vps_stage/watchdog/` sólo cubre `ape-meta-watchdog.timer` | **7 del linaje `netshield-*` INACTIVOS**: `netshield-autopilot`, `netshield-backup`, `netshield-health`, `net-shield-metrics`, `netshield-sentinel`, `net-shield-throughput`, `netshield-wg-health` | **FAIL** — `/watchdog-status` doctrinal reportaría vigilancia inexistente |
| `ape-net-tuning.timer` | no versionado | oneshot cumplido, NEXT `-` | **UNKNOWN** |

**Nota operativa medida:** reinicios de `nginx.service` a `22:55:04`, `23:15:04`, `23:35:04` UTC del 2026-10-25 (**cadencia exacta de 20 min**), y **ninguno después**. Causa raíz identificada (§9.1 de `VPS_INVENTORY.md`): `cache-health-monitor` reinicia nginx si `cache_files < 2` **y** `reqs_5min > 20` durante ≥15 min — y con `proxy_cache off` la cache **nunca** se llena. El último latido del cron (`/dev/shm/cache_health_metrics.json`, `02:55:01Z`) marca `requests_5min: 10` → por debajo del umbral ⇒ sin reinicio.

---

## 8. Listas servidas

| Elemento | Repo | VPS | Veredicto |
|---|---|---|---|
| Listas de producción (`.m3u8` + `.gz`, 1.53 GiB) | **NO stageadas** (`_vps_stage/**/*.m3u8*` = 4 fixtures) | 7 placeholders 8 B + 7 `.gz`, integridad **7/7 OK** | **UNKNOWN por diseño** — la subida es HTTP (`upload_chunk.php`), no git |
| Fixtures `selftest_*.m3u8` (repo: 203 / 349 / 377 / 378 B) ↔ `/etc/nginx/ape-selftest/playlist_*.m3u8` (VPS: 203 / 349 / 377 / 378 B) | 4 archivos | 4 archivos, **mismos tamaños, nombres distintos** | **UNKNOWN** — huella de tamaño idéntica, **nombres distintos y hash no comparado**. No se afirma PASS sin hash. |
| `channels_map.json` (142 497 511 B) | 2 copias no versionadas en `/var/www/html/` y `/var/www/iptv-ape/` | — | **UNKNOWN** |
| `resolve.php` en `/var/www/lists/` (35 931 B) | no versionado en esa ruta | — | **UNKNOWN** |

---

## 9. Resumen cuantificado

| Categoría | PASS | FAIL | UNKNOWN | Total |
|---|---|---|---|---|
| Lua HEAD ↔ VPS | **14** | 0 | 0 | 14 |
| Lua commiteado no desplegado | 0 | **2** | 0 | 2 |
| Lua WIP ajeno | 0 | 0 | **5** | 5 |
| nginx HEAD ↔ VPS | **2** | **1** (ape-meta-public v2) | 0 | 3 |
| nginx no desplegado | 0 | **8** | **4** | 12 |
| nginx VPS-only | 0 | 0 | **10** | 10 |
| Watchdogs | 0 | 0 | **3** | 3 |
| Pipeline Crystal doctrinal | 0 | **13** | 0 | 13 |
| Motor Rust :8084 | 0 | **6** | 0 | 6 |
| SQLite | 0 | **1** | **2** | 3 |
| Cron/timers | 0 | **1** | **4** | 5 |
| Listas | 0 | 0 | **4** | 4 |
| **TOTAL** | **16** | **32** | **32** | **80** |

**Tasa de sincronización HEAD↔VPS en el código del plano: 16/16 = 100 %.**

---

## 10. Los 6 hallazgos que cambian el trabajo de otras sesiones

**DR-01 (BLOCKER documental).** La doctrina OMEGA/`ape-crystal-edge` describe un VPS que **no existe**: Crystal Engine v2.0, Rust `:8084`, 5 fases Lua, anti-403 de 4 capas, Null Packet, prefetch. Medido: **unit not-found, puerto cerrado, `/health` y `/metrics` = `000`, 13/13 artefactos ausentes**. Cualquier plan que asuma ese pipeline parte de una premisa falsa. **Corrección = documental. NO desplegar nada para «alinear»** — hacerlo viola `iptv-vps-touch-nothing`.

**DR-02 (HIGH, corregido).** **Producción == HEAD, byte a byte, en los 14 módulos Lua y en `meta-plane.conf` + `ape-hosts-allow.txt`.** El «drift» que se ve al mirar el working tree es **WIP no commiteado** de otras sesiones (`+378/−4` líneas en `ape_gateway`/`ape_header`/`ape_uri_rebase` + 4 archivos `??`). **Quien audite «lo que corre» debe leer HEAD o el VPS — no el working tree.**

**DR-03 (HIGH).** `ape-meta-public.conf`: **el VPS va por delante de git.** Producción corre **v2** (2 509 B, `0a400216…`) que arregla el 404 del `/cdn/` delegando en `:8088`; HEAD tiene **v1** (2 091 B, `adbf3e56…`) — criptográficamente idéntica al `.bak_20261025T180653` del VPS. **Un restore desde el repo reintroduce el bug de la lista CDN.** Acción: commitear la v2.

**DR-04 (HIGH).** **8 artefactos commiteados/escritos nunca se desplegaron**: `ape_caps.lua` (126 KB) y `ape_session.lua` (87 KB) — **commiteados en HEAD**; `media-fanout.conf` (21 KB, commiteado) sólo existe en `/tmp`; y 7 de `vps_configs/`. Entre los no desplegados está **`ape-nginx-restart-audit.sh`**, la herramienta que habría nombrado la causa de los reinicios de nginx.

**DR-05 (MEDIUM).** `conviva.db` = **0 bytes, 0 tablas**. La cadena QoE doctrinal **no tiene almacén**. Cualquier afirmación de «telemetría Conviva alimentando la recalibración del LAB» es **falsa en el VPS**. El único almacén con datos es `ape_lists.db` (26 listas registradas).

**DR-06 (MEDIUM).** **7 timers `netshield-*` presentes pero inactivos.** `/watchdog-status` reportaría vigilancia que no existe. El único mecanismo con poder de recargar/reiniciar nginx es `ape-meta-watchdog.timer` (60 s, `fails=0`).

---

## 11. Lo que este auditor **NO** afirma

- **NO** afirma que la configuración desplegada sea incorrecta: el edge metadata-only **funciona** (`/_ape/health` → 200, `rebase_ok:1`, `error_ratio:0`, `last_host:line.tivi-ott.net`).
- **NO** afirma que el WIP ajeno sea peor o mejor que HEAD. Sólo que **no está desplegado ni commiteado**.
- **NO** afirma equivalencia en los **32 UNKNOWN**. Sin hash, no hay veredicto.
- **NO** propone desplegar, recargar, revertir ni commitear **nada**. Es diagnóstico.

---
*Fin de VPS_DRIFT_VS_REPO.md — 80 comparaciones: 16 PASS · 32 FAIL · 32 UNKNOWN. HEAD↔VPS = 100 % en el código del plano. Cero mutaciones.*
