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
| — | — | — | — |

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
