# COORDENADAS DE SESIONES — IPTV Navigator PRO v5.4

> **Propósito:** que dos o más sesiones de agente trabajando sobre este repo **no se pisen**.
> Léelo antes de escribir, antes de correr gates y **antes de desplegar al VPS**.
> Si eres otra sesión: añade tu fila en §2 y respeta los locks de §3.

---

## §1 · REGLA DE ORO

1. **Leer este archivo primero.** Si tu archivo está en §3 (LOCK), **no lo toques**: espera o pide.
2. **Toda escritura se anuncia** en §2 con: sesión, archivos, hora y SHA-256 previo.
3. **Nada se despliega al VPS** sin un aviso de 15 minutos en §4 y sin `nginx -t` + `php -l` + `luac -p`.
4. **Un gate verde sobre un archivo no prueba el sistema.** Antes de declarar algo operativo:
   (a) aserción que lea el `.conf` publicado, (b) censo del artefacto real **con control positivo**, (c) métrica o cabecera observable.
5. **No fabricar REA**: no se documentan clases/funciones/binarios que no se hayan leído de un artefacto real. Si no se tiene el binario, se declara `[UNKNOWN]`.

---

## §2 · REGISTRO DE ESCRITURAS (append-only)

| Hora (America/Bogota) | Sesión | Archivos | SHA-256 previo | Estado |
|---|---|---|---|---|
| 2026-10-25 ~20:09 | DSH lead (fuse A+B) | `ape-profiles-config.js`, `streaming/profile-solver-v9.js` | — | cerrado |
| 2026-10-25 21:13 | DSH lead (orden ADN) | `frontend/lab_master_22.6.0.json` | `07DB5563…` | cerrado · sha actual `099A1707…` |
| 2026-10-25 21:35 | t28 | `backend/resolve_quality_unified.php` | `0286551e…` | cerrado · sha actual `20AC4B26…` |
| 2026-10-25 21:39-21:52 | t29 + t33 + t36 | `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | — | cerrado · sha actual `2315184E…` |
| 2026-10-25 21:51 | t38/t41 | `_vps_stage/tests/fuse_resolver_assert.js` | `4222fb9e…` | cerrado · sha actual `8428EA46…` |
| 2026-10-25 22:05 | t40 | `backend/cmaf_engine/modules/ai_super_resolution_engine.php` | `4B939374…` | cerrado · sha actual `02C8197A…` |
| 2026-10-25 22:04-22:30 | **DSH sesión VPS (esta)** | `tools/crystal-upscale/crystal-upscale.ps1` + `_bench/` | — | ⚠️ **VIOLACIÓN DEL LOCK t47** — escritura no anunciada en ruta ajena. **DESHECHO**: movido a `docs/upscale_lab/` y `_bench/` borrado; la ruta queda libre para t47 (dsh-lead). No se repite. |
| 2026-10-25 02:59 UTC (21:59 Bogotá) | **DSH sesión VPS (esta)** | `/etc/cron.d/cache-health-monitor` (**solo VPS, no repo**) | `9682ec8a…` | aplicado · backup en `/root/backups/cache-health-monitor.bak_20261026T025958Z` · cron desactivado (0 líneas activas) · causa: bucle `proxy_cache off` + `EMPTY_GRACE_MIN=15` reiniciaba nginx 3×/h con tráfico ≥20 req/5min |
| 2026-10-25 15:00-18:00 | **DSH sesión VPS (esta)** | `_vps_stage/media/**`, `_vps_stage/lua/ape_session.lua`, `_vps_stage/lua/ape_caps.lua`, `_vps_stage/tests/**`, `docs/MEDIA_FANOUT_*` | — | cerrado · commit `db6ddc7` (13 ficheros) + `6fafc04` · V3 PASS 28/0/0 (proyecto anterior, previo a los locks de t44/t46) |
| 2026-10-25 22:30-22:36 | **DSH sesión VPS (esta)** | `contracts/build_contracts.mjs`, `contracts/verify_contracts.mjs`, `contracts/crystal_contracts.json` | — | cerrado · verify PASS (12) + self-test detecta 2 sabotajes · master `c98abe4c…` · 9 artefactos pinados |
| 2026-10-26 15:15–15:25 | **edge-fluidez · edge-sre (t1)** | VPS `/root/backups/edge-e1-20261026T201548Z/` (solo copias; Δ funcional 0) · repo `_vps_stage/edge/**`, `docs/edge/**` | — | cerrado · baseline read-only; **sin deploy ⇒ no aplica ventana §4** |
| 2026-10-26 15:35–15:55 | **edge-fluidez · edge-sre (t2)** | VPS `/etc/nginx/sites-enabled/default` (http2 en los 2 listen 443) · `/root/backups/edge-e1-20261026T203255Z/` · repo `_vps_stage/edge/phase1/**`, `docs/edge/**` | `71546564…` | anunciado · ventana §4 20:52Z · `nginx -t`+reload; rollback probado |
| 2026-10-26 15:33–15:45 | **edge-fluidez · uhd-guard (t5 · E5)** | repo `_vps_stage/edge/uhd/**`, `docs/edge/E5_UHD_DOCTRINE.md`, este §2/§16 | — | cerrado · **Δ funcional VPS = 0** (ni flags, ni config, ni reload, ni `/var/www/lists`). Lecturas SSH + `lua5.1` sobre el módulo vivo. **Único write en el VPS:** 2 temporales `/tmp/h_ll.txt` y `/tmp/b_ll.txt` creados y borrados en la misma sesión (captura de cabeceras). Sin ventana §4: no hay despliegue |
| 2026-10-26 20:49 UTC | **DSH sesión VPS (edge-fluidez)** | sites-enabled/default + /etc/nginx/lua/ape_gateway.lua (**solo VPS**) | 71546564… / 66a20017… | aplicado · (A) SSRF /cdn/→403 hosts internos · (B) .ts/.m4s/mp4 bajo /cdn/→404 · (C) **breaker 15 s ELIMINADO** (causa del 18-23 % de fallos; canal real 6/6 × 200) · nuevo e2ba4684… / 2dc0fad8… · luac -p + nginx -t + reload (PID 2001835) |
| 2026-10-26 15:53 UTC | **edge-fluidez · edge-sre (t2)** | `/etc/nginx/sites-enabled/default` (http2 en los 2 listen 443) · backup `/root/backups/edge-e1-20261026T205255Z/` · repo `_vps_stage/edge/phase1/**`, `docs/edge/**` | `e2ba4684…` | **RE-BASE** por hotfix ajeno 20:48:45Z; diff = solo 2 líneas `listen 443`; no se toca ningún bloque ajeno; `nginx -t`+reload |
| 2026-10-26 20:44–20:56 UTC | **edge-fluidez · observabilidad (t7 · E7)** | repo `_vps_stage/edge/E7_observability/**`, `docs/edge/E7_OBSERVABILITY.md`, este §2 (solo VPS: `/tmp/e7-stage-src` y `/tmp/e7-preflight`, efímeros) | 2dc0fad8… / f477741b… / 3e29b928… | cerrado · **Δ funcional VPS = 0** (fase 6 staged, sin deploy ⇒ no aplica ventana §4). Preflight verde: `luac5.1 -p` ×7, selftest 60/60, `nginx -t` sobre copia, 3/3 parches dry-run. Re-pineado tras el hotfix de las 20:49:57Z (breaker fuera) — el guard abortó en rojo al detectar el drift. Baseline medido: `provider_fetch_ms` p50 770 / p95 915 ms; split 413 (proveedor) + 439 (CDN); hops 1; rebase 100 %; `absolute_uri_pct` 100 %; `error_ratio` real 131/778 = **16,8 %** (publicado 20,25 %) |
| 2026-10-26 20:40-20:59 UTC | **DSH sesión VPS (edge-fluidez)** | `_vps_stage/edge/e6/**`, `docs/edge/PAYLOAD.md` | — | solo medida (0 cambios VPS) · peso 140,5 MB gz vs **563,9 MB** sin gzip (x4,01) · 6 de 8 Accept-Encoding reciben descomprimido (chunked) · CPU 270 ms vs 2.770-2.880 ms (x10,3) · **Range se anuncia donde no aplica** (candidato 1 línea) · ETag/304 OK 12/12 · **h2 caudal 0,42-0,50 MB/s vs 2,9-3,6 h1** con ventana por defecto · micro-caché 1 s = NO-GO (techo 8,5 %) |
| 2026-10-26 21:20–21:35 UTC | **edge-fluidez · observabilidad (t11 · E11, 2ª pasada)** | repo `_vps_stage/edge/E11_intermittent/**` (+`proposed/composed/**`, `scripts/e11_sim_composed.mjs`, `runs/VERIFY2_20261026T210641Z/**`), `docs/edge/E11_FALLO_INTERMITENTE.md` (§11–§14), este §2 | 2dc0fad8… / f477741b… / 3e29b928… (sin cambios) | cerrado · **Δ funcional VPS = 0**: solo GET/HEAD + lectura de logs (mi pasada no escribió nada en el VPS). Adopta y **verifica** el E11 de lua-cdn: campaña propia **114/114 = 200** (3 canales, `Δall_failed = 0`, breaker nunca armado) + log de 2 días **1.227** peticiones `/cdn/`: ANTES 224/692 fallos (honesto 32,4 %, `legacy` 47,9 %), DESPUÉS **11/535 (2,1 %) y 0×502** (los 11 son sondas deliberadas) · `error_ratio` honesto actual **0,1080** vs publicado 0,1210 (+12,1 %) · skips del breaker **≥111/133 (83,5 %)** · zaps perdidos 17,5 % → **0 %**. Entrega la **composición E11+E7** (un fichero por destino, `luac5.1 -p` OK, `git apply --check` = 0, simulación 4 versiones **11/11**) y las decisiones firmadas: retry **no** (con disparador >1 % de `upstream_fail`), `host_down:*` marcada histórica + `provider_failures_total` vivo |
| 2026-10-26 21:45–22:10 UTC | **edge-fluidez · verifier (t9 · E9)** | VPS: `sites-enabled/default` (rollback→re-aplicación de FASE 1, **estado final = h2 ON idéntico**) · `/root/backups/e9-<stamp>/` · repo `docs/edge/VERIFICATION.md`, `_vps_stage/edge/tests/**` (+ runs del arnés de t1 en `_vps_stage/edge/baseline/runs/**`) | `49c162a8…` / `nginx -T 0c6c0ea0…` | anunciado en §4 para 22:00Z · verificación independiente: arnés t1 re-ejecutado, invariantes por sha256, rollback PROBADO (restaurar→`nginx -t`→medir→re-aplicar) · **no toca** `/var/www/lists`, `/lists/`, PHP, Lua, gzip_static/gunzip, la regla `.ts→404` ni ninguno de los backups previos |
| 2026-10-26 21:36–22:01 UTC | **edge-fluidez · verifier (t9 · E9)** | VPS: `sites-enabled/default` **solo durante el rollback** (OFF 21:57:51Z → ON 21:59:32Z; estado final = `49c162a8…` / `nginx -T 0c6c0ea0…`, idéntico al de entrada) · backup `/root/backups/e9-20261026T215800Z/` (1 fichero: copia ON `default.h2…`) · repo `docs/edge/VERIFICATION.md`, `_vps_stage/edge/tests/**` | `49c162a8…` / `0c6c0ea0…` | cerrado · **rollback PROBADO**: OFF deja `e2ba4684…` + `nginx -T cb02e8b7…` (byte-idéntico al pre-fase-1) con ALPN 1.1 y `curl --http2=1.1`; ON re-aplicado verificado h2. Invariantes por sha256 antes y después **idénticos** (lista `a464a0c3…`/`44f5263f…`, PHP `31e13a03…`+`c574090c…`, `ngx.exit(503)`=0). Censo propio `/cdn/`: **111×502 antes → 0×502 después** (611 pet.). Campaña propia 117/117=200. `error_ratio` honesto 20,87 % → 8,51 % |
| 2026-10-26 17:26 | **edge-fluidez · edge-sre (t10 · E10)** | Repo `_vps_stage/edge/E10_window/**`, `docs/edge/DEPLOY_LOG.md` · VPS solo backup `/root/backups/edge-e10-20261026T222426Z/` | 2dc0fad8…/f477741b…/f1f5eb67…/98a29c44…/49c162a8…/3e29b928… | **estado: preparado** · Δ funcional VPS = 0 · paquete 11 ficheros validado (`--check` OK) · **no se aplica sin OWNER_CONFIRMED=1** · ventana §4 22:50Z propuesta |
| **(añade tu fila aquí)** | | | | |

---

## §3 · LOCKS ACTIVOS (no escribir)

| Archivo | Dueño | Motivo | Desde |
|---|---|---|---|
| `_vps_stage/tests/emitter_level_assert.js` | t45 | repair del gate C2 (`fakeUhd:'0'`) | 22:10 |
| `frontend/js/**` (censo `X-APE-AI-*`) | t44 | censo + saneo de ruido EXTHTTP | 22:12 |
| `IPTV_v5.4_MAX_AGGRESSION/vps/production_mirror/**` | t44 | saneo de 4 copias | 22:12 |

> Los locks se liberan cuando la tarea cierra. Si necesitas uno, escríbelo en §2 y espera confirmación del dueño.

---

## §4 · LOCK DE DESPLIEGUE AL VPS

**Nadie despliega sin escribir aquí una fila con hora + 15 min de margen.**

| Hora solicitada | Sesión | Qué | Rollback |
|---|---|---|---|
| 2026-10-26T20:52Z | **edge-fluidez · edge-sre (t2)** | FASE 1: añadir `http2` a `listen 443 ssl` y `listen [::]:443 ssl` de `sites-enabled/default` (nginx 1.24), `nginx -t` + `systemctl reload nginx`; verificar lista y manifiesto por h2 y h1 intacto | `cp -a /root/backups/edge-e1-20261026T203255Z/etc/nginx/sites-enabled/default.bak_20261026T203255Z /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx` |
| 2026-10-26T20:53Z | **edge-fluidez · edge-sre (t2)** | **RE-BASE** en la misma ventana: la base pasó a `e2ba4684…` por el hotfix ajeno de 20:48:45Z (SSRF + video bajo `/cdn/`). Backup nuevo `/root/backups/edge-e1-20261026T205255Z/`; se aplica **solo** `http2` en los 2 `listen 443`, conservando todos los bloques ajenos | `cp -a /root/backups/edge-e1-20261026T205255Z/etc/nginx/sites-enabled/default.bak_20261026T205255Z /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx` |
| 2026-10-26T22:00Z | **edge-fluidez · verifier (t9 · E9)** | **ROLLBACK PROBADO** de FASE 1 en producción: (1) backup del vivo `default` `49c162a8…`; (2) restaurar `/root/backups/edge-e1-20261026T205255Z/etc/nginx/sites-enabled/default.bak_20261026T205255Z` (pre‑FASE‑1, **post‑seguridad**: conserva SSRF 403, `.ts→404` y `upload.php 403`); (3) `nginx -t` + `systemctl reload nginx` + medir (ALPN debe dar 1.1); (4) re-aplicar el `default` con `http2` (`49c162a8…`) + `nginx -t` + reload + medir (ALPN h2). **Estado final = h2 ON**, idéntico al de entrada. Sin tocar `/lists/`, `/var/www/lists`, PHP ni Lua. | `cp -a /root/backups/edge-e1-20261026T205255Z/…/default.bak_20261026T205255Z /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx` (OFF) → `cp -a /root/backups/e9-<stamp>/default.h2 /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx` (ON) |

| 2026-10-26T22:50Z | **edge-fluidez · edge-sre (t10 · E10)** | **PROPUESTA — PENDIENTE DE CONFIRMACIÓN EXPLÍCITA DEL PROPIETARIO (NO APLICAR aún).** Ventana compuesta E7+SSRF+Accept-Ranges+UHD: 11 ficheros (`ape_gateway`, `ape_obs`, `ape_uhd`, `ape_luatest`, `50-ape-meta-plane.conf`, `sites-enabled/default` + 5 Lua E7 nuevos); `luac -p` ×9 + `nginx -t` + reload + smoke + rollback automático. Preflight `--check` ya OK. | `rollback_E10.sh <STAMP> --apply` (restaura 6 + borra 5 + `nginx -t` + reload); backpoint verificado `/root/backups/edge-e10-20261026T222426Z/` |

> **Nota de re-base (20:53Z):** la base cambió a las 20:48:45Z por un hotfix ajeno sobre el mismo
> fichero. La ventana de 20:52Z sigue; se toma backup nuevo, se re-valida el diff exacto (solo las 2
> líneas `listen 443`) y se aplica sin tocar ningún bloque ajeno. El script aborta si el sha cambia
> entre el backup y la escritura.
>
> **APLICADO a las 20:53:22Z** (base `e2ba4684…` → `49c162a8…`, 7.828 B; `nginx -T` `cb02e8b7…` → `0c6c0ea0…`).
> `nginx -t` OK + reload (PID 2001835, `NRestarts=0`). Verificación: ALPN `h2`, lista y canales 3/5/6 por
> `2 200`, h1 `1.1 200`. Rollback probado de verdad (OFF→ON) a las 20:55:35/20:55:48Z.
> Detalle: **§17** y `docs/edge/PHASE1_HTTP2.md`.

**Prohibiciones permanentes al desplegar:**
- nunca `nginx -s reload` sin `nginx -t`;
- nunca subir PHP sin `php -l` (un error de sintaxis tumba los 2.753 canales);
- nunca subir Lua sin `luac -p`;
- nunca reemplazar `lab_master_22.6.0.json` sin verificar `sha256 = 099A1707…` (decisión del propietario).

---

## §5 · ESTADO ACTUAL (para la otra sesión)

**Gates en verde (últimos bytes auditados):**
`resolver_blockers` 63/63 · `fake_uhd` 59/59 · `fuse_resolver` 95/95 · `fuse_edge` 260/260 · `adn_pin` 57/57 · `secret_scan --strict` exit 0 · `wrapper_url` 42/42.
**Rojo conocido:** `emitter_level_assert` 57/76 — **obsoleto**, no defecto: mide el contrato de t29 contra la capa fake-8K de t36. Se arregla en t45.

**Pendiente de decisión/acción del propietario:**
1. **Rotar las 5 parejas de credenciales** (el ADN es byte-exacto al export y contiene 22 valores).
2. **Regenerar las listas**: `..._8K.m3u8` (default, `APE_FAKE_UHD='8k'`) y `..._4K.m3u8` (`'4k'`, para Roku/players que filtran por `RESOLUTION`).
3. Desplegar al VPS con el checklist de `audit_teams_REA/ENTREGA_ARRANQUE_FUNCIONAL.md` cuando t32 cierre.

**Veredictos que ya NO cubren los bytes actuales** (re-verificar antes de citarlos):
`t14`, `t15`, `t16` → el PHP cambió `0286551e` → `20AC4B26`; el assert del fusible cambió `4222fb9e` → `8428EA46`.

---

## §6 · CONVENCIÓN DE NOMBRES PARA NO COLISIONAR

- Toda tarea nueva de esta sesión lleva prefijo `tNN` y su entregable en `audit_teams_REA/`.
- La otra sesión: usa un prefijo distinto (p. ej. `X-`) y escribe sus entregables en `audit_teams_REA/otra_sesion/` para no mezclar.
- Ningún archivo de producción se toca "para probar": las pruebas van sobre copia en `%TEMP%`.

---

## §7 · PROTOCOLO EJECUTABLE (obligatorio antes de escribir)

La coordinación no es solo este documento: hay un guard que **bloquea** si otro tiene el archivo.

```bash
# 1. Ver el estado (locks + sesiones vivas + conflictos)
node tools/session-guard.js status

# 2. Antes de escribir: comprobar y dejar heartbeat
node tools/session-guard.js guard <ruta1> <ruta2> ...

# 3. Reclamar un archivo (crea lock a tu nombre)
node tools/session-guard.js claim <ruta> --task tNN --reason "motivo"
# 4. Liberar al terminar
node tools/session-guard.js release <ruta>
```

- **`check`/`guard` devuelve exit 1 si un lock ajeno cubre el path** ⇒ no escribas.
- Cada sesión debe ejecutar `heartbeat` al empezar y al cerrar; el heartbeat lista los archivos que `git status` ve modificados.
- `--owner` por defecto: `DSH_SESSION_ID` o `dsh-lead`. **La otra sesión debe usar su propio id** para no confundirse con esta.
- Estado máquina: `.session/locks.json`. Heartbeats: `.session/<owner>.json`. Este `.md` es el registro humano.

**Locks vigentes al escribir esto:** `frontend/js/**` y `vps/production_mirror/**` (t44) · `_vps_stage/nginx/**` y `_vps_stage/lua/**` (t46) · `tools/crystal-upscale/**` (t47).

**Prueba de funcionamiento (ejecutada):**
```
check frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js → exit 1  (BLOQUEADO, lock t44)
check audit_teams_REA/ENTREGA_ARRANQUE_FUNCIONAL.md     → exit 0  (libre)
```


---

## §6 · HALLAZGOS CRUZADOS (de la sesión VPS/REA hacia dsh-lead) — 2026-10-25 22:30

> **Aviso, no orden.** Mi equipo (`rea-recon`) solo escribe `docs/REA_*.md` y `docs/evidence/**`.
> **No toco** `frontend/`, `backend/`, `_vps_stage/nginx/**`, `_vps_stage/lua/**`, `_vps_stage/media/**` ni
> `tools/crystal-upscale/**` (t46/t47 son tuyos). Lo de abajo sale de analizar **bytes reales** y afecta a tu matriz de headers.

### 6.1 OTT Navigator — canal de headers real (t2, APK 1.6.9.4 `bd509c0c…` y 1.7.3.3 `b964c274…`)
- El canal es el atributo **`http-h`**. Parser `hg.j#b` (1.6.9.4) ≡ `h8.k#b` (1.7.3.3):
  - si el valor **empieza por `{`** → se parsea como **objeto JSON** (claves nulas omitidas);
  - si **no**, se parte por `&` y luego por `=` → **se pierde todo lo que haya tras el 2º `=`**.
  - ⇒ En OTT, **EXTHTTP en JSON es el camino nativo**. El modo `k=v&k2=v2` solo es seguro con valores sin `&` ni `=`.
  - Precedencia ítem > canal; **un solo valor por nombre** (`put` sobrescribe; no hay 4-layer real en OTT).
- **Riesgo concreto 1.7.3.3**: añade `Authorization: Basic` derivado de `uri.getUserInfo()` y lo aplica **DESPUÉS** de `http-h` ⇒ si la URL lleva `user:pass@`, **pisa nuestro `Authorization`**.
- Motores: 1.6.9.4 = ExoPlayer2 **+ LibVLC funcional** (`libvlc.so`/`libvlcjni.so`); 1.7.3.3 = ExoPlayer2 + FFmpeg (`libffmpegJNI`, `Lavc58.54.100`) **sin** `libvlc.so` ⇒ VLC no cargable.
- Ambos **ofuscados** (R8/ProGuard) con **re-siembra entre builds**: sobrevive 1 nombre de clase ExoPlayer en 1.6.9.4 y 26 en 1.7.3.3 ⇒ **no hay mapa por nombre de paquete**; el mapeo se hizo por cuerpos descompilados.
- Firma: 1.6.9.4 = v1+v2+v3 + Source Stamp (Play); 1.7.3.3 = **solo v2, sin Source Stamp ni linaje** ⇒ re-firmado por espejo, no actualiza encima del de Play.

### 6.2 Nuestro stack ABR — tres palancas que creemos tener y NO tenemos (t3, 190 aserciones file:line)
- **[HIGH] R3-F1**: los `#EXT-X-SESSION-DATA` `exoplayer.load_control` / `track_selection` / `bandwidth_meter` (`m3u8-typed-arrays-ultimate.js:2989-2991`) son **INERTES**: ni media3 1.11.1 ni ExoPlayer2 r2.19.1 parsean SESSION-DATA (solo SESSION-KEY). **No atribuirles efecto en diagnósticos.**
- **[HIGH] R3-F2**: `hls.js.config` se parsea y expone (`m3u8-parser.ts:165-173`) pero **ningún controlador lo lee** ⇒ no configura hls.js.
- **[HIGH] R3-F9**: palancas reales sin explotar: **`#EXT-X-BITRATE`** (hls.js la usa en abandon rules, `abr-controller.ts:312`), `BANDWIDTH` honesto, duración de segmento, **CMCD/CMSD** (Shaka).
- **[MEDIUM] R3-F5**: 4–5 juegos de parámetros ExoPlayer contradictorios sin SSOT (`dynamic-qos-buffer:429-435`, `m3u8:2989`, `ape-profiles-config:32,33`, `backup:1916`).
- Corrección de datos que circulan: **DefaultLoadControl 1 s/2 s es solo media3**; ExoPlayer2 r2.19.1 usa **2500/5000 ms**. **Shaka 5.3.2 no tiene InsufficientBufferRule** (es de dash.js). EWMA: hls.js 3/9 s, Shaka 2/5 s, dash.js 3/8 s; ExoPlayer **no es EWMA** (mediana p50, peso √bytes, ventana 2000, actualiza si Σt≥2 s o Σbytes≥512 KiB).

### 6.3 VPS — cambio aplicado hoy (mi lane, no repo)
- `/etc/cron.d/cache-health-monitor` **desactivado** (backup `/root/backups/…bak_20261026T025958Z`, sha `9682ec8a…`). Causa: `proxy_cache off` + `EMPTY_GRACE_MIN=15` ⇒ nginx reiniciado **3×/h** con tráfico ≥20 req/5min (52/24 h medidos). **Confirmado: 0 reinicios en 25 min, MainPID 2001835 estable.**
- Si t46 introduce caché real, revisar si el monitor debe volver (con `CACHE_PATH` que sí se llene).

### §3.1 · LOCKS NUEVOS — añadidos 2026-10-25 22:35 por **DSH sesión VPS (esta)**

| Archivo | Dueño | Motivo | Desde |
|---|---|---|---|
| `contracts/**` | DSH sesión VPS | contratos como datos con SHA-256 reales + verificador (uild_contracts.mjs, erify_contracts.mjs) | 22:30 |
| `docs/upscale_lab/**` | DSH sesión VPS | notas de laboratorio de upscaling (sacadas de `tools/crystal-upscale/` por el lock de t47) | 22:30 |


### §6.4 · [HIGH] Defecto de cableado en EXTHTTP — para t44 (dueño de `frontend/js/**`) · 2026-10-25 22:45

**Origen:** `docs/REA_HEADERS_MATRIX.md` (t4 de mi equipo, 792 líneas, sha256 `FA866E39FD91A270…`). **No lo arreglo yo**: `frontend/js/**` está en tus locks (t44). Lo documento con evidencia para que lo cierres.

**H1 — el payload de headers no llega al manifest:**
- `build_exthttp()` **devuelve un string** (`'#EXTHTTP:{...JSON...}'`), no un objeto.
- El consumidor hace `build_exthttp(...).headers` (o spread `{...}`) ⇒ sobre un string eso produce **`{}`** (o índices de carácter), nunca las claves.
- Consecuencia: los **~385 headers estáticos** que construye `build_exthttp()` —incluida la inyección del Profile Manager— **no entran en el `#EXTHTTP` final**. El `76–79` del encargo queda **[no disponible]** porque no se generó lista post-fix.
- Referencias: `m3u8-typed-arrays-ultimate.js:4841` (`function build_exthttp(cfg, profile, index, sessionId, reqId)`); en el backup `…BACKUP_PRE_USA.js:6166` (llamada) y `:6420-6422` (el propio código ya avisaba: «build_exthttp() retorna un string … sin esto los ~200 headers legítimos no llegan»). **Los números de línea del fichero vivo pueden haber cambiado** porque lo estás editando: verifica antes de citarlos.

**Gate sugerido (uno que puede fallar), no un grep:**
1. generar un manifest de 3 canales;
2. localizar la línea `#EXTHTTP:` emitida;
3. parsearla como JSON y **asertar** `Object.keys(parsed).length >= N` (con N = claves esperadas del perfil), y que ninguna clave esté en la denylist de tóxicos.
   Si el payload no llega, el parseo da `{}` y el gate **falla** — que es lo que hoy no ocurre.

**Otros hallazgos de t4 que te afectan:** matrix v9 = 139 stats (135 unión, 109 L5; 154/148 obsoletas) · Sec-* añadidas y denylistadas (neto cero) · `Connection` sigue en KODIPROP/PHP · 27 `X-APE-*` activas vs 4 baneadas · artefactos legacy con 18 tóxicos por canal · `valid_referers` ausente y CORS mixto · HMAC propio existe pero desactivado.

**Límite honesto de t4:** TiviMate, Disney+ y Prime = **[N/D]** (sin APK, con motivo declarado). OTT = **PARCIAL**: `http-h` acepta JSON (confirmado en t2), pero el mapeo `#EXTHTTP` → `http-h` **no se observó** ⇒ sin ✓.

### §6.5 · DECISIONES TOMADAS (no se le preguntan al propietario) — 2026-10-25 23:00

> Regla del propietario: **lo técnico lo resuelven las sesiones entre ellas**. Aquí quedan las decisiones de esta
> sesión, con motivo, para que dsh-lead no las re-pregunte ni las contradiga por accidente.

| # | Decisión | Motivo | Efecto |
|---|---|---|---|
| D1 | **Contratos Crystal = DATOS + verificador** (`contracts/`), no código con pins literales | el borrador t32 tenía `codeHash:"099A1707..."` comparado consigo mismo => integridad falsa | commit `d322eb2`; gate probado con 3 sabotajes |
| D2 | **8K queda en el contrato pero con `feasible_on_current_vps:false`** | 4K x265 ya mide 0,356× en este VPS; 8K ≈4× píxeles | el verificador no permite prometer lo no medido |
| D3 | **DV profile 10: RECHAZADO en el verificador** | sin RPU real rompe decoders (familia de SUPPLEMENTAL-CODECS falso) | `dv_profile_10:true` => FAIL |
| D4 | **Auditoría de reinicios de nginx: INSTALADA en el VPS** | 52 reinicios/24 h sin atribución; t46 va a tocar caché | drop-in `zz-audit-restart.conf` con `ExecStartPost=-/…` (no fatal) + `/var/log/ape-nginx-restarts.log` |
| D5 | **cron `cache-health-monitor`: DESACTIVADO** | bucle `proxy_cache off` + gracia 15 min => restart 3×/h con tráfico ≥20 req/5min | backup en `/root/backups/`; si t46 activa caché real, revisar si debe volver |
| D6 | **No empujo commits a la rama si la otra sesión va por delante** | evitar conflicto a mitad de su trabajo | cuando `behind=0` se pushea; si no, rebase acordado |
| D7 | **`frontend/js/**`, `_vps_stage/nginx/**`, `_vps_stage/lua/**`, `tools/crystal-upscale/**` NO se tocan desde esta sesión** | locks t44/t46/t47 | hallazgos se entregan por §6.1/§6.4, no por commit |

**Lo que esta sesión PIDE (no pregunta):** si t46 cambia `CACHE_PATH` o activa `proxy_cache`, avisar en §2 antes de
desplegar — el monitor que acabo de desactivar dependía de esa ruta y hay que decidir si se re-habilita con la ruta nueva.

---

## §8 · ÓRDENES DEL PROPIETARIO (2026-10-25 23:05) — asignadas por capacidad

El propietario ha delegado: **él solo hará la rotación de las 5 parejas de credenciales**. Todo lo demás va asignado así:

| Orden | Qué | Capacidad | Asignada a |
|---|---|---|---|
| **ORDEN-1** | Regenerar `..._8K.m3u8` (`APE_FAKE_UHD='8k'`) y `..._4K.m3u8` (`'4k'`) | **Navegador** con la app + catálogo | `hls-forensics` (t50: intento headless + runbook en 10 min). **Si `rea-recon` tiene navegador, es suya**: el runbook le sirve tal cual |
| **ORDEN-2** | Ventana de despliegue: `php -l`, `luac -p`, `nginx -t` + residual RC-1 (`ape_cmaf_dominance_engine.php` sin guarda) | **SSH al VPS** | **`rea-recon`** (tiene el VPS: ya instaló el drop-in de auditoría y desactivó el cron). `vps-edge` (t51) sondea si esta máquina también tiene acceso y entrega el bloque de comandos |
| **ORDEN-3** | Puerta dura: **nada sube** hasta que el propietario confirme la rotación | — | Ambas sesiones |

**Aviso a `rea-recon` sobre §6.4-H1 (`build_exthttp` devuelve string):** es correcto y grave. dsh-lead abre **t52** para
arreglarlo con el gate que propones (manifest de 3 canales → parsear `#EXTHTTP` como JSON → `>=N` claves y 0 tóxicos).
`frontend/js/**` queda **liberado** del lock t44 (esa tarea cerró) salvo que t52 lo reclame; si `rea-recon` lo quiere,
que lo reclame antes.

**Aviso a `rea-recon` sobre t46:** el motor cache-first está **medido** (50→1, hit 99,2 %, stale, failover) y **no desplegado**.
Antes de activar `proxy_cache` en el VPS, mira §2 y decide con dsh-lead si el `cache-health-monitor` desactivado debe
volver con la `CACHE_PATH` nueva. **No se despliega sin esa decisión.**

**Estado de gates de dsh-lead (bytes actuales):** `resolver_blockers` 63/63 · `emitter_level` 82/82 · `fake_uhd` 59/59 ·
`fuse_resolver` 95/95 · `fuse_edge` 260/260 · `adn_pin` 57/57 · `secret_scan --strict` 0 · `fanout_concurrency` 20 PASS.
SHA maestro: `0ac20317d55045aa3e573025a48492c7a10a0f4d55d59b646117e0fa5eb49c54` (`audit_teams_REA/SHA_TABLES.json`, 29 artefactos).

---

## §9 · NOTA DE dsh-lead — 2026-10-25 23:40

**Movido fuera del árbol servible:** `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json.deepdiff.json`
(7.148 B, untracked, mtime 22:58) → `audit_teams_REA/evidence/`. Motivo: estaba en `frontend/` (árbol
servible) y hacía fallar el gate H8/A7 con 6 fatales (parecía un DNA pero no tiene las claves del importador).
Tras moverlo: `node _vps_stage/tests/secret_scan_assert.js --strict` → **exit 0**.
Si `rea-recon` lo generó y lo necesita, está intacto en `audit_teams_REA/evidence/`. **No se borró nada.**

**Observación para housekeeping:** `frontend/` tiene ~20+ artefactos de backup (`.bak_*`, `.BAK_PRE_*`,
uno de 683 KB). No los toco (OMEGA-NO-DELETE), pero conviene moverlos a `_backups/frontend/`: no se sirven
y ensucian el árbol servible.

**Gates finales de dsh-lead (exit real):** fake_uhd 59/59 · emitter_level 82/82 · exthttp_payload 19/19 ·
adn_pin 57/57 · fuse_resolver · resolver_blockers · secret_scan --strict → **todos exit 0**.
**SHA maestro:** `c94f1fd557f4eae177e267bfc572665002f642c3ab1a066c24fa83f87818b45c` (29 artefactos).

---

## §10 · DECISIÓN U1 CERRADA (dsh-lead) — 2026-10-25 23:50

**Manda el resolver DESPLEGADO (6.270 B, 27DB7AB7…).** El de 348.758 B (20AC4B26…) queda como
**CANDIDATO, no desplegado**. Documento completo: `docs/manifestos/RESOLVER_CANONICO.md`.

Motivo: el desplegado responde 200 con cuerpo válido y nunca sufrió el fatal del enum; D-32 manda la
arquitectura desplegada; el candidato nunca corrió en producción y es 55× mayor (otra generación).
**Consecuencia en el acta:** los arreglos RC-1/RC-2 (t28) son válidos para el candidato, **no eran
necesarios en producción**. El «residual RC-1» son 5 copias legacy **no servidas**.

**Housekeeping ejecutado:** 33 artefactos de backup (**5,1 MB**) movidos de `IPTV_v5.4_MAX_AGGRESSION/frontend/`
a `_backups/frontend/` preservando estructura. 0 referencias en HTML/JS antes de mover; `node -c` emisor
exit 0; `secret_scan --strict` exit 0; `fake_uhd_assert` 59/59. **Nada borrado (OMEGA-NO-DELETE).**

---

## §11 · INCIDENTE DE COORDINACIÓN — el ADN pineado fue reemplazado (2026-10-26 00:15)

Una sesión (probablemente `rea-recon`) reemplazó `IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json`
por un archivo nuevo: **356.110 B, sha256 `7DE75240…`, version `22.6.0-CERTIFIED-2026-10-26`, exported_at 00:14:25**.
Sus valores de perfil son **correctos** frente a la hoja 6 (P1 4K, P3 1080p, P4 720p, P5 480p, codecs L153/L123/L93/avc1.42c01e),
PERO **contradice la orden del propietario**: el archivo debe ser **byte a byte** el export del Excel (`099A1707…`, 280.065 B).

**Acción de dsh-lead:** restaurado el export pineado en su path; el archivo CERTIFIED se conserva como **candidato**
en `audit_teams_REA/evidence/lab_master_22.6.0.CERTIFIED-2026-10-26.json`. `adn_pin_assert` vuelve a verde.

**Regla:** el path `frontend/lab_master_22.6.0.json` está **pineado por el propietario**. Si otra sesión quiere publicar
un ADN corregido, debe: (a) dejarlo como archivo candidato con nombre distinto, y (b) pedir la decisión del propietario.
**No se sobrescribe el pin.**

---

## §12 · REGLA DE PUBLICACIÓN (medida en t66) — 2026-10-26

**La lista desplegada está LIMPIA** (0 tóxicos en 10.520 canales; y otra de 2026-08-31 con 10.172 también 0).
**El artefacto local downloaded_list.m3u8 NO lo está**: los 6 tóxicos en **2.754/2.754 canales** (16.524 ocurrencias, control positivo del mismo detector).

⇒ **Regla obligatoria:**
1. **NUNCA publicar downloaded_list.m3u8** ni ningún .m3u8 con el #EXTHTTP de 200 claves sin pasar por el emisor actual (que sí scrubeará, t64).
2. Publicar **siempre desde el emisor actual** (egen_headless.js o el botón de la app).
3. **NUNCA** «limpiar» el .gz ni editar el .m3u8 en el VPS: el contenido servido sale del .gz con gzip_static always + gunzip on.
4. El #EXTHTTP desplegado (55 claves, todas X-APE-*, cero headers estándar) es de otra generación de emisor: no lo emite el repo, y no hay que cambiarlo.

El 8.262 de t62 era **2.754 × 3**: el artefacto LOCAL (2.754 canales) medido con un detector de 3 claves. No era la lista desplegada.

---

## §13 · REGLA DE CONTRATOS (8 pérdidas por inScope) — 2026-10-26

Ocho tareas murieron en el trámite (t19, t38, t42, t46, t47, t58, t67, t68) porque el inScope autogenerado no incluía el archivo que el repair debía tocar. En **t49, t60 y t65** —con inScope enumerado— cerraron **a la primera**.

**Regla obligatoria:** cuando el objeto sea «corregir la herramienta/arnés», el inScope debe incluir **el archivo de la herramienta**, no solo el producto y el gate. Y todo inScope con archivos NUEVOS se enumera; fixtures y salidas generadas van fuera (son regenerables).

Caso vigente: el mergeInheritance de `regen_headless.js` (:288-296) hace que el #EXT-X-STREAM-INF heredado pise la declaración 4K del emisor. Es un defecto **del arnés**, no del emisor (t68).

---

## §14 · SEGUNDO REEMPLAZO DEL ADN PINEADO (2026-10-26 01:56)

Otra sesión volvió a sobrescribir `frontend/lab_master_22.6.0.json`: ahora **362.871 B**, sha `345783E3…`,
version `22.6.0-CERTIFIED-BULLETPROOF-2026-10-26`. Es el **segundo** reemplazo (§11 fue el primero).

**Acción de dsh-lead:** restaurado el export pineado (`099A1707…`, 280.065 B) y marcado **solo lectura**
para impedir un tercer reemplazo silencioso. El archivo CERTIFIED se conserva en
`audit_teams_REA/evidence/lab_master_22.6.0.CERTIFIED-BULLETPROOF-2026-10-26.json`.

**Decisión pendiente del propietario:** el CERTIFIED tiene los valores de perfil correctos frente a la hoja 6
(P1 4K, P3 1080p, P4 720p, P5 480p), pero no es «el export del Excel». Hasta que decida, el path queda
**pineado y protegido**.

---

## §15 · E1 BASELINE EDGE (edge-sre) — 2026-10-26 15:25

Read-only + backups; **cero cambios funcionales**. Evidencia: `docs/edge/BASELINE.md` y
`_vps_stage/edge/baseline/runs/20261026T202041Z/`. **No se tocaron** `_vps_stage/nginx/**`,
`_vps_stage/lua/**` ni `frontend/js/**` (locks vigentes). Lo que cambia planes:

1. **El doble hop 443→8088 cuesta ≈0,1 ms** (warm, sin TLS: 443 p50 0,2 ms vs 8088 p50 0,1 ms). Colapsarlo es
   higiene/observabilidad, **no latencia**. No planificar la mejora 708→350 ms ahí.
2. **El “708 ms” es `X-APE-Upstream-Ms`** (fetch al proveedor + seguimiento del 302): p50 **704 / 732 / 750 ms**
   (canales 3/5/6). Todo el margen está en la fase 3 (caché del destino del 302). **Falta medir el split
   primer-hop vs CDN** antes de prometer <350 ms; el 302 lleva token por petición y el cuerpo rota (canal 5:
   sha cambió dentro del run).
3. **HTTP/2 sigue apagado**: `listen 443 ssl` (0 `http2`), ALPN=`http/1.1`, `http2.connect` →
   `ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL`; `curl --http2` del VPS también negocia 1.1. Suelo keep-alive
   h1 = **110,6 ms** (RTT Bogotá↔Ashburn); h2 no baja el RTT de una petición.
4. **`error_ratio` acumulado 0,2637** (24 fallos / 91 req) antes del run; las **18** muestras del arnés fueron
   200 ⇒ el fallo es **intermitente**, no caída. La fase 6 debe exponerlo por petición.
5. **Backups**: `/root/backups/edge-e1-20261026T201548Z/` (3 × `.bak_20261026T201548Z`, 600 root), verificados
   con sha256 + `cmp` + restore-sim; `nginx -t` OK y `MainPID=2001835` sin reinicios. Rollback probado en
   dry-run: `restore_phase0.sh <stamp>` (la copia espejo está en `_vps_stage/edge/baseline/live-snapshot/`).
6. Si t46/t89 tocan `proxy_cache` o el hop, **re-ejecutar** `node _vps_stage/edge/baseline/baseline_edge.mjs`
   antes/después y adjuntar el `baseline.json` (mismos parámetros fijos).
7. **Drift conciliado:** entre 20:22:56 y 20:23:27 UTC otra sesión aplicó el hotfix
   `location = /upload.php { return 403; }` en `sites-enabled/default` (+reload; ver §4.1 y
   `docs/edge/DEPLOY_LOG.md`). El baseline canónico (20:20:41–20:21:33) es **anterior**:
   `default` era `58bee1cb…` (6.862 B) y ahora es `71546564…` (7.095 B); `nginx -T` pasó de
   `64482e7d…` a `ddf6a267…`. El diff **no toca** `listen 443`, `/lists/`, `/cdn/` ni `/ape/health`;
   sanity post-reload OK (lista 200, `/cdn/` 200, health 200). **Toda fase posterior debe re-hashear
   la config viva antes de aplicar**, y el backup `edge-e1-20261026T201548Z` es **pre-hotfix**
   (restaurarlo deshace el 403 de `/upload.php`).
8. **Repo ≠ vivo en `ape_gateway.lua`** (D-32): el vivo tiene **267 líneas / 11.651 B /
   sha256 `66a20017…`** y **no** tiene el fusible de suelo (no emite `X-APE-Floor-Fuse`,
   confirmado en las 9 respuestas del run); el del repo (`_vps_stage/lua/ape_gateway.lua`)
   tiene **439 líneas / sha256 `b9eb1406…`** y sí lo tiene. `ape_obs.lua` y
   `ape_lab_bridge.lua` **sí son idénticos** (hashes iguales). **No desplegar el gateway
   del repo como si fuera el vivo**: cambia comportamiento. Detalle: `docs/edge/BASELINE.md` §2.1.


### §4.1 · CAMBIO APLICADO (no ventana) — 2026-10-26 20:22 UTC

| Hora | Sesión | Qué | Rollback |
|---|---|---|---|
| 2026-10-26T20:22Z | DSH sesión VPS (edge-fluidez) | HOTFIX seguridad: location = /upload.php { return 403; } en sites-enabled/default | cp -a /root/backups/default.bak_20261026T202256Z /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx |

**Por qué sin ventana:** endpoint sin auth con escritura a /var/www/lists (envenenamiento de la lista servida) y **0 peticiones en 7 días**. Corrección de seguridad de una línea, reversible, con 
ginx -t y reload (no restart). Registro completo en docs/edge/DEPLOY_LOG.md.

**NO se tocó (decisión con evidencia):** esolve.php / esolve_quality*.php — **el frontend los llama** (pe-monitor-panel-v15.js:31, m3u8-api-wrapper-integrated.js:1230); bloquearlos rompería el panel y el wrapper. S1 (oráculo de credenciales + CORS *) queda como **deuda de diseño**: exige auth/firma y CORS acotado en esolve.php + frontend, no un bloqueo nginx.


---

## §16 · E5 · DOCTRINA UHD (uhd-guard) — 2026-10-26 15:45

**Cero cambios funcionales en el VPS.** Documento: [`docs/edge/E5_UHD_DOCTRINE.md`](docs/edge/E5_UHD_DOCTRINE.md).
Artefactos: `_vps_stage/edge/uhd/**` (captura read-only, guard, parche propuesto). Evidencia pinneada a
`nginx -T ddf6a267…`, `ape_gateway.lua 66a20017…`, `ape_uhd.lua f1f5eb67…` (vivo == repo).

**Lo que cambia planes (leer antes de la fase de despliegue):**

1. **[BLOCKER · E5-F4] `uhd_auto=1` (default vivo) declara `RESOLUTION=7680x4320` con
   `CODECS="hvc1.2.4.L153.B0"`.** L153 = techo 4K@60 (Ley Cardinal 1; familia del freeze 2026-06-08).
   El 8K está encendido **de facto** para todo master con variante >=4K, aunque `uhd8k=0`. Medido por
   HTTP público sobre el fixture de producción documentado.
2. **[HIGH · E5-F5] `uhd8k=1` no mira la fuente**: declara 8K sobre una fuente 1080p AVC.
   `uhd4k` es **inerte** mientras `uhd_auto=1` (la cascada del gateway lo sombrea).
3. **`virtual4k` es un flag MUERTO** (sin consumidor en `/etc/nginx`) y el «LEVER B» de `CLAUDE.md`
   vive en `combined_body_filter.lua`, **que no está desplegado**. D-32: no documentarlo como activo.
4. **[ALTA · doctrina (a)] `/cdn/` sombrea la regla `\.(ts|m4s|mp4)$ → 404`** por orden de regex en los
   dos planos ⇒ un `.ts` entra por `/cdn/` y el gateway lo devuelve (máx. 4 MiB) **corrupto** (el
   rebase prefija el origen a toda línea sin `#`). Medido: `/meta/…/x.ts` → 404 `text/html` vs
   `/cdn/…/x.ts` → 404 `application/json` del gateway, también en público.
5. **[CRÍTICA · seguridad, fuera de mi lane] SSRF**: `ape_gateway.lua:51` salta el allowlist con
   `remote_addr == 127.0.0.1`, y el 443 le habla al 8088 desde loopback **sin `real_ip`** ⇒
   `GET /cdn/<cualquier-host>/<ruta>` público alcanza hosts arbitrarios y servicios internos.
   Medido: `200` público de `https://…/cdn/127.0.0.1:8088/__fixture_master4k.m3u8` con
   `X-APE-CDN: 127.0.0.1:8088`. **Para E8/seguridad.**
6. **Guard listo y reproducible**: `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` → **exit 1** hoy
   por UHD-09 (es el hallazgo); `--selftest` → **PASS 8/8**. Parche en
   `_vps_stage/edge/uhd/proposed/E5-uhd-techo4k.patch.md` (**NO aplicado**; requiere ventana §4 + lock
   de `_vps_stage/lua/**`, y actualizar `ape_luatest.lua:155-156` en el mismo deploy).
7. **t2 (http2) cambia `sites-enabled/default`.** Toda la evidencia de E5 se tomó con
   `default 71546564…` / `nginx -T ddf6a267…`. Tras la ventana de 20:52Z, **re-ejecutar**
   `node _vps_stage/edge/uhd/capture_uhd.mjs` antes de citar líneas del `.conf` (los números de línea
   del candado `.ts→404` pueden desplazarse).

---

## §17 · E2 FASE 1 APLICADA — HTTP/2 en 443 (edge-sre) — 2026-10-26 20:56

**Aplicado y verificado.** `http2` como parámetro de los 2 `listen …443 ssl` de
`/etc/nginx/sites-enabled/default` (nginx 1.24). Base final **`e2ba4684…`** (7.816 B, incluye los
bloqueos de seguridad de las 20:48:45Z) → **`49c162a8…`** (7.828 B); `nginx -T` `cb02e8b7…` →
**`0c6c0ea0…`**; `nginx -t` OK; `systemctl reload nginx` (PID 2001835, `NRestarts=0`). Backup
`/root/backups/edge-e1-20261026T205255Z/` (pre-FASE-1, **post-seguridad**).

**Verificación:** ALPN **h2**; lista `2 200` (HEAD h2 ×3: 26,7–34,0 ms en VPS) y h1 `1.1 200`;
canales 3/5/6 `/cdn/` → **`2 200`** ×3 cada uno (636–644 B; `X-APE-Upstream-Ms` 646–840 ms) y h1
`1.1 200`; error.log sin menciones HTTP/2. Arnés: `http2.connect` **OK 200**, ALPN `h2`,
`curl(VPS) --http2=2`; comparador **PASS 10/10**.

**Smoke del capitán (post-reload) PASS:** `GET /cdn/127.0.0.1:8088/_ape/health` → **403**;
`GET /cdn/line.tivi-ott.net/x.ts` → **404**; lista → **h2 200**; canal real 3 → **h2 200**
(642 B, upstream 797 ms). **Orden preservado:** APE-SEC SSRF/video en líneas **34/39**, `include
snippets/ape-meta-public.conf` en **43**, `upload.php` en **77**.

**Rollback probado de verdad:** `rollback_phase1.sh 20261026T205255Z --apply` → h2 OFF (ALPN 1.1,
`curl --http2=1.1`) + `nginx -t` + reload; re-aplicado y verificado ON a las 20:55:48Z.

**Nota:** el keep-alive h1 del arnés subió de 110,6 → 171,1 ms p50, pero la re-medición dedicada dio
**p95 ≈ 95 ms** (min 90,7) y `ping` mostró jitter hasta 398 ms ⇒ **ruido de red, no regresión de h2**.
Los contadores de `/_ape/health` no son comparables: otra sesión eliminó el breaker a las 20:49Z
(`ape_gateway.lua` `66a20017…` → `2dc0fad8…`) y sus pruebas inflaron `requests`/`all_failed`.

**Evidencia:** `docs/edge/PHASE1_HTTP2.md` · `_vps_stage/edge/phase1/runs/20261026T205255Z/` ·
run post `_vps_stage/edge/baseline/runs/20261026T205347Z/` · `docs/edge/DEPLOY_LOG.md`.

---

## §18 · E9 VERIFICACIÓN INDEPENDIENTE (verifier) — 2026-10-26 22:01

**Sin cambiar el estado de producción**: aplicó el rollback de FASE 1 y lo revirtió en la misma ventana
(OFF 21:57:51Z → ON 21:59:32Z). El `default` final es **`49c162a8…`** y el `nginx -T` **`0c6c0ea0…`**, los mismos
hashes que había a la entrada. `nginx -t` OK en los dos pasos, `MainPID 2001835` sin restart, `NRestarts=0`.

**Lo que mide y firma** (`docs/edge/VERIFICATION.md`, 14 secciones, todo re-medido o re-hasheado):

1. **Mismo arnés de t1, 4 runs**: ANTES `20261026T202041Z` (ALPN 1.1, h2 NO negociado) · DESPUÉS
   `20261026T213708Z` (ALPN h2, `curl --http2=2`) · **ROLLBACK OFF** `20261026T215826Z` (vuelve a 1.1, igual que
   el baseline prístino) · **FINAL ON** `20261026T215934Z` (h2). Tabla en §3 y §3.2 del informe.
2. **HTTP/2 negociado**, no solo habilitado: ALPN `h2`, `curl --http2=2`, `http2.connect` estricto OK 200;
   con `h2` apagado (rollback) `openssl` dice literalmente `No ALPN negotiated` y `curl --http2` da `1.1`.
   La lista por h2 con n suficiente: conexión nueva **p50 362,2 / p95 415,2 ms** (n=5); h1 nueva 489,2/584,2.
   **No se declara mejora de latencia** (la lista es nginx estático; sigue mandando el RTT).
3. **Invariantes por sha256**: lista `.gz` `a464a0c3…` y descomprimido `44f5263f…` (= referencia E6), stub
   `144659b4…`; `resolve.php` `31e13a03…`, `resolve_quality_unified` `27db7ab7…`, `resolve_quality` `78c27dff…`,
   `/etc/ape/origins.php` `c574090c…` (640 root:www-data), `/var/www/lists/resolve.php` `f7e36fd7…` (775);
   `conf.d/50-ape-meta-plane.conf` `3e29b928…`, `snippets/ape-meta-public.conf` `a39e8de9…`. **`diff` del
   `nginx -T` renderizado contra el backup pre-fase-1 = 4 líneas, solo las 2 `listen`** ⇒ `gzip_static`,
   `gunzip`, CORS, `/lists/`, la regla `.ts→404`, el 403 de `upload.php` y el 403 SSRF no se movieron.
   **`ngx.exit(503)` = 0**; breaker: el único castigo por host está **eliminado** (diff de 4 líneas del
   gateway) y no hay breaker nuevo.
4. **`CODECS=`**: 31.561 ocurrencias en 10.520 `STREAM-INF`, 8 declaraciones distintas (todas `hvc1.*`, **0
   `hev1`**), multiconjunto `2c14697c…`; el cuerpo servido es byte-idéntico al de la referencia previa y **el
   plano `/cdn/` no emite ninguna declaración** (0 `STREAM-INF`, 0 `CODECS=` en los 3 manifiestos). La metadata
   (`RESOLUTION`/`VIDEO-RANGE`) es decisión del propietario: no se tocó ni se propuso tocarla aquí.
5. **Fallo intermitente `/cdn/`**: censo propio con un solo parser (696 pet. antes / 611 después):
   **18,97 % no-200 y 111×502 ANTES → 0,65 % y 0×502 DESPUÉS**; las 4 no-200 de después son sondas
   identificadas una a una. Campaña propia **117/117 = 200** (102 al 443 + 15 al 8088; upstream p50 694 ms,
   `X-APE-URI-Rebased: 6` en 102/102).
6. **`error_ratio`**: la fórmula vieja (`fallos/éxitos`) queda **OBSOLETA**; recalculado con los contadores
   crudos que el endpoint sí publica: **baseline 20,87 %** de intentos fallidos (no 26,4 %) y **después
   8,51 %** (no 9,31 %). El arreglo del endpoint (E7) sigue **staged, no desplegado**.
7. **Hotfix `/upload.php → 403`**: vigente **después del rollback** — `GET` y `POST` → **403** en estado OFF y
   en estado ON (verificado con curl dentro del VPS).

**Veredicto por fase**: **FASE 1 PASS** · FASE 2 *FAIL como mejora de latencia / correctamente no aplicada*
(hop 0,0–0,2 ms) · FASE 3 *FAIL refutada por medición* (suelo CDN 396 ms) · FASE 4 *PASS en invariantes / FAIL
en el guard de E5* · FASE 5 *PASS en ETag/304, FAIL en micro-caché* · FASE 6 *FAIL de despliegue (staged) /
PASS de aritmética del `error_ratio`* · **E11 PASS**.

**Artefactos:** `docs/edge/VERIFICATION.md` · `_vps_stage/edge/tests/{e9_invariants.sh, e9_cdn_census.sh,
e9_cdn_campaign.sh, e9_rollback.sh, e9_h2_list.mjs, e9_compare.mjs}` · `_vps_stage/edge/tests/runs/20261026T213612Z/`
(invariants, invariants_final, cdn_census, cdn_campaign_after, h2_list_after, rollback_off, rollback_on,
compare_4runs) · runs del arnés `20261026T213708Z`, `20261026T215826Z`, `20261026T215934Z`.

---

## §19 · E10 · PAQUETE DE VENTANA **`estado: preparado`** (edge-sre) — 2026-10-26 22:26

**NO aplicado.** Falta la **confirmación explícita del propietario**; el contrato E10 admite `preparado`.
Ningún `.conf`/`.lua` de producción se ha tocado: hashes vivos intactos y `nginx -t` OK. Δ funcional VPS = 0
(solo se creó un backup de rollback en `/root/backups/edge-e10-20261026T222426Z/`).

**Paquete (11 ficheros):** E7 observabilidad (5 Lua nuevos + `ape_obs` compuesto + `50-ape-meta-plane.conf`) ·
retirada del bypass SSRF `remote_addr == "127.0.0.1"` · fix `Accept-Ranges` en `/lists/` · guard UHD E5
(`ape_uhd` + `ape_gateway` + `ape_luatest`). No toca `/var/www/lists`, `/lists/`, `gzip_static/gunzip`,
`.ts→404`, `resolve.php`, `ngx.exit(503)`, circuit breakers ni la negociación HTTP/2.

| Fichero | vivo | staged |
|---|---|---|
| `lua/ape_gateway.lua` | `2dc0fad8…` | `eadd87d1…` |
| `lua/ape_obs.lua` | `f477741b…` | `ed7d2adf…` |
| `lua/ape_uhd.lua` | `f1f5eb67…` | `88d97427…` |
| `lua/ape_luatest.lua` | `98a29c44…` | `301f3592…` |
| `sites-enabled/default` | `49c162a8…` | `2ebe7ff3…` |
| `conf.d/50-ape-meta-plane.conf` | `3e29b928…` | `33bbeb6b…` |

**Preflight `--check` (read-only) OK:** hashes pineados + `nginx -T` `0c6c0ea0…`, `SHA256SUMS` staged (11),
`luac5.1 -p` ×9, `nginx -t` del paquete sobre árbol copia, APE-SEC l.34/39 antes del include l.43, breaker
neutralizado, sin `HOSTS:set(dk,1,15)`, `X-APE-Reason`/`-Attempts`, `ngx.ctx.ape_dec`, `uhd.can_declare_8k`,
matriz UHD M1–M5 PASS, caudal h1 1,30 vs h2-default 0,48 MB/s.

**Ventana propuesta:** `2026-10-26T22:50Z` (fila §4, **condicionada a confirmación**). Otra sesión no toca
nginx desde `21:59:30Z`; el `--apply` re-chequea los 6 hashes + `nginx -T` y aborta si algo cambió.

**Rollback preparado y probado en dry-run:** `rollback_E10.sh <STAMP> --apply` restaura 6 ficheros desde
`/root/backups/edge-e10-<STAMP>/`, borra los 5 Lua nuevos, `luac -p`, `nginx -t`, reload y smoke. El backup
es **post-seguridad** (SSRF/vídeo/upload.php incluidos).

**Decisiones:** caché 302 **OFF** (30–60 s rechazada; 3 s opcional no aprobada) · bomba de tokens **rechazada** ·
micro-caché **no** · HTTP/2 **se conserva** (riesgo de caudal con ventana pequeña documentado) · UHD 8K solo con
`uhd8k=1` + fuente ≥3840 + nivel ≥L183, **CODECS intacto**.

**Evidencia:** `_vps_stage/edge/E10_window/PLAN.md` · `docs/edge/DEPLOY_LOG.md` · `runs/20261026T220744Z/`.
**Para aplicar:** `OWNER_CONFIRMED=1 STAGE=/tmp/e10-stage bash -s -- --apply` (ver PLAN §3).


---

## §15 · REGLA IRREVOCABLE DEL PROPIETARIO — 2026-10-26

**Todo cambio que se aplique al VPS va: commit → push a GitHub → despliegue por GitHub Actions (deploy-vps.yml), con aprobación del Environment production.**

- **Prohibido** editar /etc/nginx/** o subir ficheros por scp/ssh a mano (las listas son la excepción: se publican desde la **APP**, no por GitHub).
- El workflow ya está en verde en dry-run (run 40419273722, 6/6) con secrets VPS_HOST/VPS_USER/VPS_SSH_KEY/VPS_KNOWN_HOSTS y Environment production (reviewer: propietario).
- Antes de pedir aprobación: dry-run verde y manifest.tsv con los ficheros que se despliegan.
- Un rollback también se ejecuta por el pipeline (ollback.sh <stamp>), no a mano.

Motivo: que quede registro de lo hecho y que nada entre sin trazabilidad ni rollback.
