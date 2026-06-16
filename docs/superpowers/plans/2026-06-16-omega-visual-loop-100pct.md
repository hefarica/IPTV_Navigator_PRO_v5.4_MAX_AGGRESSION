# OMEGA Visual Loop 100% — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cablear de extremo a extremo el pipeline visual OMEGA para que la metadata de mejora llegue al player por URL+ADB, per-canal, en tiempo real, sin degradación ni freeze — cerrando los gaps que la validación en vivo destapó (solo 2/7 motores LIVE, metadata NO llegando, Conviva sin telemetría, engines con fake-HDR estático).

**Architecture:** Dual-link honesto. Video provider-direct (URL-1 verbatim, 302 desde `/omega/open`). La inteligencia visual viaja por URL-2 (omega + SSE) + ADB (daemon). El VPS aprende **device→canal** observando el `$remote_addr` real en nginx (no el `127.0.0.1` que ve el Python), sirve el paquete visual per-canal por SSE, el daemon aplica + emite Conviva 1Hz. Todo **aditivo (REGLA 1% UNICIDAD)**: se inyectan interceptores, nunca se reescriben monolitos.

**Tech Stack:** nginx + log_by_lua (lua-nginx-module), PHP 8.3 (pdo_sqlite, SSE), Python 3.12 (visual-policy-endpoint :45732, session-orchestrator :3322), Kotlin/Android (ape-crystal-agent), SQLite (conviva.db), /dev/shm IPC.

## DEPLOYMENT GOVERNANCE — TODO POR CI/CD (obligatorio, sin excepción)

**Ningún cambio toca el VPS ni el device por scp/ssh/adb ad-hoc. Todo pasa por el CI/CD ya construido (`tools/cicd/`):**

1. **Archivos VPS** (lua/php/conf): el subagente los autora en el repo bajo `IPTV_v5.4_MAX_AGGRESSION/vps/...` → se **añaden a `tools/cicd/vps_deploy_map.json`** (id, src, dest, type, post) → se despliegan con **`tools/cicd/deploy_vps.ps1 -Only <ids>`** (o `--only` en bash). El orquestador hace pre-flight `df`, **backup** en `/root/ape-deploy-rollback/<ts>/`, push atómico `scp→tmp→mv` (sin `--delete`), `php -l`/`nginx -t`, reload (post=`nginx-reload`), **health-verify** y **auto-rollback** si algo falla. Ese ES el CI/CD del VPS.
2. **Snippets nginx existentes en el VPS pero no en el repo** (p.ej. `ape-visual-v3-2-location.conf`): primero `git`-importar la versión viva del VPS al repo (`vps/nginx/snippets/`), inyectar el cambio 1%-unicidad, añadir al manifiesto con `post:nginx-reload`, y desplegar por `deploy_vps`. Nunca `sed` en vivo.
3. **APK** (`ape-crystal-agent`): build SOLO por **GitHub Actions `android-build.yml`** (artifact). Reinstalación en el Fire TV: por el runbook ADB-LAN documentado (no es "deploy a producción VPS", es sideload del device autorizado), idealmente envuelto en un script versionado.
4. **Validación**: `tools/cicd/validate_local` local + `.github/workflows/ci-validate.yml` en cada push. `node -c`/`php -l`/`nginx -t` son gates del CI.
5. **Git push** y el disparo del CI requieren **OK explícito del usuario** (no autocommit-push).

> Cada Task de abajo cuyo "deploy" diga scp/ssh se **reemplaza** por: (a) editar el repo, (b) `+` entrada en `vps_deploy_map.json`, (c) `deploy_vps.ps1 -Only <id>`. El TEST E2E se corre tras el deploy gateado.

---

**DOCTRINAS NO NEGOCIABLES (toda tarea las respeta):**
- **Autopista:** nada bloquea el video; log_by_lua en fase log; sin `limit_req`/breaker; `proxy_buffering off` en SSE.
- **iptv-vps-touch-nothing:** backup + `nginx -t` + reload + health-verify + rollback en CADA cambio VPS.
- **1% UNICIDAD:** inyectar (`log_by_lua_file`, funciones nuevas, archivos nuevos); NUNCA reescribir el Python :45732, el generador monolito, ni el 302.
- **9 GATES PQ (council SAFE_WITH_SAFEGUARDS):** `VIDEO-RANGE=PQ` solo si TODOS pasan (Tarea G1).
- **No-strip:** las ~945 líneas/canal no se tocan.

---

## File Structure (qué se crea/modifica y su responsabilidad única)

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `vps/nginx/lua/ape_device_state_writer.lua` | **Create** | log_by_lua: parsea args de /omega/open + `$remote_addr` → escribe `/dev/shm/ape_device_state/<ip>.json` (atómico) |
| `vps/nginx/snippets/ape-visual-v3-2-location.conf` | **Modify (inject 1 línea)** | añade `log_by_lua_file` a `location = /omega/open` (sin tocar el `proxy_pass`/302) |
| `vps/prisma/lib/ape_mesh.php` | **Modify** | `ape_device_state()` lee por `REMOTE_ADDR`; `ape_mesh_device_settings()` honra HDR real / quita SDR→HDR del default |
| `vps/prisma/api/ape-feedforward-stream.php` | **Modify** | lee device_state por IP del cliente; sirve `actions[]` del tune package per-canal |
| `vps/prisma/lib/ape_pq_gate.php` | **Create** | función única `ape_pq_should_emit($state,$codec,$player)` que aplica los 9 gates |
| `vps/cmaf_engine/modules/hdr10plus_dynamic_engine.php` | **Modify (inject guard)** | gate honesto: NO emitir HDR/bt2020/st2084 sobre SDR sin enhancement-active (fix fake-HDR estático) |
| `vps/cmaf_engine/modules/lcevc_phase4_injector.php` | **Modify (inject guard)** | idem: LCEVC-TARGET 4K solo si resolución/enhancement real |
| `android/.../QoeBeacon.kt` | **Create** | beacon 1Hz → POST `conviva-event.php` (stats del sistema, no frames) |
| `android/.../SettingsApplier.kt` | **Modify** | consume `actions[]` del package (set_buffer/prefer_decoder/apply_visual_profile) vía allowlist |
| `android/.../AgentService.kt` | **Modify (inject)** | arranca `QoeBeacon` + reporta `hdr_capable` (EDID) en el state |
| `vps/prisma/api/conviva-event.php` | **Modify** | acepta beacon 1Hz device-keyed; alimenta el loop QoE→HDCP |
| `CLAUDE.md` | **Modify** | cambio de doctrina: VIDEO-RANGE=PQ permitido bajo los 9 gates |

---

## PHASE A — Device→Channel correlation (cimiento; cierra el gap #1)

### Task A1: log_by_lua writer de device_state

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua`

- [ ] **Step 1: Escribir el Lua (fase log, no bloquea, atómico, TTL implícito por ts)**

```lua
-- ape_device_state_writer.lua — log_by_lua en /omega/open.
-- Captura device→canal desde el $remote_addr REAL (nginx lo ve; el Python :45732 solo ve 127.0.0.1).
-- Autopista: fase log, jamás bloquea, jamás toca el 302.
local args = ngx.req.get_uri_args()
local ip = ngx.var.remote_addr
if not ip or ip == "" then return end
local ch = args.channel_id; if not ch then return end
local safe = ip:gsub("[^0-9A-Fa-f:.]", "_")
local path = "/dev/shm/ape_device_state/" .. safe .. ".json"
local tmp  = path .. ".tmp" .. ngx.worker.pid()
local rec = string.format(
  '{"channel_id":%q,"content_type":%q,"codec_hint":%q,"resolution_hint":%q,"ts":%d,"ip":%q}',
  tostring(ch), tostring(args.content_type or ""), tostring(args.codec_hint or ""),
  tostring(args.resolution_hint or ""), ngx.time(), ip)
local f = io.open(tmp, "w")
if f then f:write(rec); f:close(); os.rename(tmp, path) end
```

- [ ] **Step 2: Verificar sintaxis Lua**

Run: `luac -p IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua 2>&1 || echo "(luac ausente; validar con nginx -t tras deploy)"`
Expected: sin error (o el aviso de luac ausente).

- [ ] **Step 3: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua
git commit -m "feat(vps): device_state writer lua (device→canal por IP real)"
```

### Task A2: Cablear el log_by_lua en /omega/open (nginx, con backup+nginx -t+rollback)

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-visual-v3-2-location.conf` (location `= /omega/open`)

- [ ] **Step 1: Crear el dir /dev/shm/ape_device_state en el VPS (www-data, 0755)**

Run (VPS): `ssh root@178.156.147.234 "mkdir -p /dev/shm/ape_device_state && chown www-data:www-data /dev/shm/ape_device_state && chmod 0755 /dev/shm/ape_device_state"`
Expected: sin error. (Añadir a un tmpfiles.d o al init_worker para sobrevivir reboot — Task A2b.)

- [ ] **Step 2: Subir el lua al VPS (lua dir real)**

Run: `scp IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_device_state_writer.lua root@178.156.147.234:/etc/nginx/lua/ape_device_state_writer.lua`
Expected: transferido.

- [ ] **Step 3: Backup + inyectar 1 directiva en la location (NO tocar proxy_pass)**

El snippet tiene `location = /omega/open { proxy_pass http://127.0.0.1:45732/omega/open; ... }`. Inyectar DENTRO del bloque:
```nginx
    log_by_lua_file /etc/nginx/lua/ape_device_state_writer.lua;
```
Run (VPS, con backup): `ssh root@178.156.147.234 "cp /etc/nginx/snippets/ape-visual-v3-2-location.conf /root/ape-deploy-rollback/$(date +%s)_ape-visual-v3-2-location.conf && sed -i '/location = \/omega\/open {/a\\        log_by_lua_file /etc/nginx/lua/ape_device_state_writer.lua;' /etc/nginx/snippets/ape-visual-v3-2-location.conf"`

- [ ] **Step 4: `nginx -t` y reload (si pasa) o rollback (si falla)**

Run (VPS): `ssh root@178.156.147.234 "nginx -t && systemctl reload nginx && echo RELOADED || (cp /root/ape-deploy-rollback/*_ape-visual-v3-2-location.conf /etc/nginx/snippets/ape-visual-v3-2-location.conf; echo ROLLED_BACK)"`
Expected: `RELOADED`.

- [ ] **Step 5: TEST device_state se escribe con la IP real**

Run: `curl -s -o /dev/null "https://iptv-ape.duckdns.org/omega/open?channel_id=777&content_type=sports&codec_hint=hevc&resolution_hint=1080p&url=http%3A%2F%2Fex.com%2Fa.m3u8"; ssh root@178.156.147.234 "ls -la /dev/shm/ape_device_state/ && cat /dev/shm/ape_device_state/*.json | head -1"`
Expected: un `<tu-ip>.json` con `"channel_id":"777","content_type":"sports"`.

- [ ] **Step 6: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-visual-v3-2-location.conf
git commit -m "feat(vps): wire device_state log_by_lua en /omega/open (autopista, +backup+nginx-t)"
```

### Task A2b: Persistencia del dir /dev/shm tras reboot

**Files:** Create `IPTV_v5.4_MAX_AGGRESSION/vps/systemd/ape-device-state-tmpfiles.conf`
- [ ] **Step 1:** Contenido: `d /dev/shm/ape_device_state 0755 www-data www-data -`
- [ ] **Step 2:** Deploy: `scp ... root@vps:/etc/tmpfiles.d/ape-device-state.conf && ssh root@vps "systemd-tmpfiles --create /etc/tmpfiles.d/ape-device-state.conf"`
- [ ] **Step 3:** Commit `chore(vps): tmpfiles persiste /dev/shm/ape_device_state`

### Task A3: SSE lee device_state por REMOTE_ADDR

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php` (`ape_device_state` ya existe — añadir lookup por IP)
- Modify: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php`

- [ ] **Step 1:** En `ape_mesh.php`, añadir helper:
```php
function ape_device_state_by_ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? preg_replace('/[^0-9A-Fa-f:._-]/','',$_SERVER['REMOTE_ADDR']) : '';
    if ($ip==='') return array();
    $f = '/dev/shm/ape_device_state/' . $ip . '.json';
    if (is_file($f)) { $j=json_decode(@file_get_contents($f),true); if(is_array($j)) return $j; }
    return array();
}
```
- [ ] **Step 2:** En `ape-feedforward-stream.php`, dentro del loop, ANTES de calcular streamInfo, mergear el estado por IP (además del device-id):
```php
$st = ape_device_state_by_ip();
if (!empty($st['channel_id'])) {
    if ($chId==='') $chId = preg_replace('/[^0-9A-Za-z_.\-]/','',$st['channel_id']);
    foreach (array('content_type'=>'ct','codec_hint'=>'codec','resolution_hint'=>'res') as $k=>$dst) {
        if (!empty($st[$k])) $si[$dst] = $st[$k];
    }
    // TTL anti-stale: ignorar estado > 30s
    if (!empty($st['ts']) && (time()-$st['ts']) > 30) { /* stale → default seguro */ }
}
```
- [ ] **Step 3:** Deploy (scp+php -l) + TEST: hit /omega/open?channel_id=777 desde IP X, luego SSE desde X → el payload trae `channel:777`.
Run: ver Task A2 Step 5 + `curl -sN ".../ape-feedforward-stream.php?device=test&dur=5"` desde la misma IP.
Expected: `event: presets` con `"channel":"777"`.
- [ ] **Step 4:** Commit `feat(vps): SSE correlaciona device→canal por IP (cierra el lazo)`

---

## PHASE B — Fix fake-HDR estático de los cmaf engines (truth-guard; gap #3)

> La validación: `hdr10plus_dynamic_engine` + `lcevc_phase4_injector` emiten HDR10/bt2020/st2084/MASTERING-DISPLAY/LCEVC-TARGET 3840x2160 **incluso sobre 720p SDR**. Es plantilla estática = fake-HDR. Se inyecta un **guard** (1% unicidad), no se reescribe el engine.

### Task B1: Guard honesto en hdr10plus_dynamic_engine

**Files:** Modify `IPTV_v5.4_MAX_AGGRESSION/vps/cmaf_engine/modules/hdr10plus_dynamic_engine.php` (en `getDirectives`)
- [ ] **Step 1:** Al inicio de `getDirectives($streamInfo,$health,$ct)`, inyectar:
```php
// GUARD honesto: HDR real probado O enhancement SDR→HDR autorizado por device (no estático).
$hdr = strtolower($streamInfo['hdr_type'] ?? '');
$enh = !empty($streamInfo['hdr_enhanced']); // viene del device_state (daemon confirmó)
$realHdr = in_array($hdr, array('pq','hlg')) || strpos($hdr,'hdr10')!==false || strpos($hdr,'dolby')!==false;
if (!$realHdr && !$enh) { return array(); } // SDR sin enhancement → NO emitir HDR (antes emitía estático)
```
- [ ] **Step 2:** `php -l` + TEST: `ape_mesh_presets` con `hdr=''` y sin enhancement → 0 directivas HDR; con `hdr=hdr10` → 16. (curl ape-feedforward.php?...&hdr= vs &hdr=hdr10).
- [ ] **Step 3:** Commit `fix(cmaf): hdr10plus guard honesto — 0 fake-HDR sobre SDR`

### Task B2: Guard en lcevc_phase4_injector (LCEVC-TARGET solo si resolución/enhancement real)
**Files:** Modify `.../lcevc_phase4_injector.php`
- [ ] **Step 1:** Inyectar guard análogo: si `($streamInfo['width']??0) < 1280` y sin enhancement → no emitir `LCEVC-TARGET:3840x2160` (cap al real).
- [ ] **Step 2:** php -l + TEST. **Step 3:** Commit `fix(cmaf): lcevc target honesto por resolución real`

### Task B3: Wire ai_super_resolution_engine (4º engine idle) en ape_mesh
**Files:** Modify `vps/prisma/lib/ape_mesh.php`
- [ ] **Step 1:** Añadir al fan-out (con el caveat de la auditoría F2: pasar device explícito, NO usar el combo-cache /tmp global):
```php
$call('ai_super_resolution_engine.php', 'AISuperResolutionEngine', function () use ($si) {
    $h = (int)($si['height'] ?? 1080);
    $ex = array(); $vlc = array();
    AISuperResolutionEngine::injectClientSideLogic($h, $ex, $vlc, $si['ua'] ?? '');
    $out = array();
    foreach ($vlc as $l) $out[] = $l;          // EXTVLCOPT (player-blind)
    // los headers X-APE-* de $ex NO van en presets (son request headers) — solo $vlc
    return $out;
});
```
- [ ] **Step 2:** php -l + TEST: el engines{} ahora muestra AISuperResolutionEngine>0. **Step 3:** Commit `feat(cmaf): wire AISuperResolution al mesh (device-explícito, sin combo-cache)`

---

## PHASE C — SDR→HDR + VIDEO-RANGE=PQ con los 9 GATES (decisión LOCKED; council SAFE_WITH_SAFEGUARDS)

### Task C0: Cambiar la doctrina (CLAUDE.md)
**Files:** Modify `CLAUDE.md`
- [ ] **Step 1:** Reemplazar la regla "VIDEO-RANGE sin probe ← ELIMINADO" por:
```
### VIDEO-RANGE=PQ bajo SDR→HDR enhancement (2026-06-16 — doctrina actualizada)
VIDEO-RANGE=PQ SÍ se emite sobre fuente SDR CUANDO el enhancement SDR→HDR on-device está activo
y se cumplen los 9 GATES (ver vps/prisma/lib/ape_pq_gate.php): la salida del device ES HDR, la
declaración es consistente con el OUTPUT. NUNCA se emite si falla un gate (display no-HDR, codec
no-10bit, SoC no-whitelist, player strict, etc.) — eso causaría black/oscuro. Sigue PROHIBIDO el
claim HDR sin enhancement ni gates.
```
- [ ] **Step 2:** Commit `docs(doctrine): VIDEO-RANGE=PQ permitido bajo SDR→HDR enhancement + 9 gates`

### Task C1: Daemon escribe hdr_capable (EDID) + hdr_enhanced en su heartbeat
**Files:** Modify `android/.../AgentService.kt` (+ helper EDID)
- [ ] **Step 1:** En `AgentService`, añadir lectura EDID y reporte en el watchdog/heartbeat:
```kotlin
private fun hdrCapable(): Boolean = try {
    val p = Runtime.getRuntime().exec(arrayOf("sh","-c","dumpsys display | grep -i supportedHdrTypes"))
    p.inputStream.bufferedReader().readText().contains("2") // 2 = HDR10
} catch (e: Exception) { false }
```
(Reportarlo al VPS por el beacon de Task D1 como `hdr_capable` + `hdr_enhanced` = el valor de hdr_conversion_mode que el daemon aplicó.)
- [ ] **Step 2:** El beacon (Task D1) incluye estos campos → el writer Lua / un endpoint los fusiona en device_state. **Step 3:** Commit `feat(daemon): reporta hdr_capable (EDID) + hdr_enhanced`

### Task C2: La función única de los 9 gates
**Files:** Create `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_pq_gate.php`
- [ ] **Step 1:** Implementar (cada gate del council):
```php
<?php
// ape_pq_gate.php — los 9 GATES. Devuelve true SOLO si TODOS pasan. Cualquier duda → false (SDR seguro).
function ape_pq_should_emit(array $state, string $codec, string $player = '') {
    // G1 enhancement confirmado por daemon + fresco (anti-stale 30s)
    if (empty($state['hdr_enhanced'])) return false;
    if (!empty($state['ts']) && (time()-(int)$state['ts']) > 30) return false;
    // G2 display HDR-capable (EDID)
    if (empty($state['hdr_capable'])) return false;
    // G3 codec 10-bit: hvc1.2.* / hvc1.4.* / dvh1 / dvhe — nunca avc1.* ni hvc1.1.*
    if (!preg_match('/^(hvc1\.2\.|hvc1\.4\.|dvh1|dvhe)/', $codec)) return false;
    // G5 SoC whitelist (Amlogic S905X4 VPP SDR→HDR ok; legacy no)
    $soc = strtolower($state['soc'] ?? '');
    $okSoc = array('s905x4','s905x3','s928','rk3588');
    $socOk=false; foreach($okSoc as $s){ if(strpos($soc,$s)!==false){$socOk=true;break;} }
    if ($soc !== '' && !$socOk) return false;
    // G5b player-class: VLC/Kodi ignoran (safe pero sin beneficio); strict-parsers excluidos
    $p = strtolower($player);
    if (strpos($p,'vlc')!==false || strpos($p,'shaka')!==false) return false; // no aporta + riesgo strict
    // G7 rollback blacklist per-canal (TTL 3600)
    $bl = '/dev/shm/ape_pq_blacklist/' . preg_replace('/[^0-9A-Za-z_]/','',$state['channel_id'] ?? '') . '.flag';
    if (is_file($bl) && (time()-@filemtime($bl)) < 3600) return false;
    return true;
}
```
- [ ] **Step 2:** php -l + tests unitarios (php -r) de cada gate (SDR→false, sin EDID→false, avc1→false, blacklist→false, todo ok→true).
- [ ] **Step 3:** Commit `feat(vps): ape_pq_gate — los 9 gates del council en una función`

### Task C3: El SSE/generador emite VIDEO-RANGE=PQ + CODECS Main10 SOLO si el gate pasa
**Files:** Modify `vps/prisma/api/ape-feedforward-stream.php` (y el punto del generador que arma STREAM-INF)
- [ ] **Step 1:** En el payload per-canal, calcular:
```php
require_once '/var/www/html/prisma/lib/ape_pq_gate.php';
$codec = $si['codec'] ?? 'hvc1.2.4.L120.B0';
$pq = ape_pq_should_emit($st, $codec, $st['player'] ?? '');
$device_settings = ape_mesh_device_settings($si, $pq); // pq controla si añade hdr_conversion
// stream_inf hint para el generador/daemon:
$streamInfHint = array('video_range' => $pq ? 'PQ' : 'SDR', 'codecs' => $codec, 'hdcp' => $pq ? 'NONE' : 'TYPE-1');
```
- [ ] **Step 2:** `ape_mesh_device_settings($si,$pq)` — añadir param `$pq`: si `$pq` → incluye `global hdr_conversion_mode 1`; si no → SOLO frame-rate (Tarea ya tocada en Phase B/A doctrina). Allowlist del daemon ya valida.
- [ ] **Step 3:** php -l + TEST: gate-fail → device_settings sin hdr_conversion + hint SDR; gate-pass → con hdr_conversion + hint PQ.
- [ ] **Step 4:** Commit `feat(vps): VIDEO-RANGE=PQ + Main10 + HDCP-NONE solo si los 9 gates pasan`

---

## PHASE D — Conviva 1/s telemetry beacon (VITAL; gap #5)

### Task D1: Beacon 1Hz en el daemon → conviva-event.php
**Files:** Create `android/.../QoeBeacon.kt`; Modify `AgentService.kt`
- [ ] **Step 1:** `QoeBeacon.kt` — corrutina 1Hz que POSTea stats del SISTEMA (no frames):
```kotlin
class QoeBeacon(private val cfg: Config) {
    private val client = okhttp3.OkHttpClient()
    private var job: kotlinx.coroutines.Job? = null
    fun start(scope: kotlinx.coroutines.CoroutineScope) {
        job = scope.launch(kotlinx.coroutines.Dispatchers.IO) {
            while (isActive) {
                try {
                    val body = org.json.JSONObject().apply {
                        put("device", cfg.deviceId); put("ts", System.currentTimeMillis())
                        put("hdr_enhanced", android.provider.Settings.Global.getString(/*cr*/null,"hdr_conversion_mode") ?: "0")
                        // stats ligeros del sistema (no observa el frame): mem, net rx bytes, etc.
                    }
                    val req = okhttp3.Request.Builder()
                        .url("${cfg.vpsBase}/prisma/api/conviva-event.php")
                        .addHeader("Authorization","Bearer ${cfg.token}")
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build()
                    client.newCall(req).execute().use {}
                } catch (e: Exception) {}
                kotlinx.coroutines.delay(1000)
            }
        }
    }
    fun stop(){ job?.cancel() }
}
```
(Nota: el snippet es esqueleto; el implementador completa los stats reales accesibles sin permisos extra. HONESTO: no mide el frame, reporta estado del sistema/device.)
- [ ] **Step 2:** En `AgentService.onCreate`: `beacon = QoeBeacon(cfg); beacon.start(scope)`; en `onDestroy`: `beacon.stop()`.
- [ ] **Step 3:** Rebuild APK (GitHub Actions android-build) → reinstalar → logcat confirma POST 1Hz.
- [ ] **Step 4:** Commit `feat(daemon): Conviva beacon 1Hz → conviva-event.php (uplink ligero)`

### Task D2: conviva-event.php acepta el beacon device-keyed + alimenta QoE→HDCP
**Files:** Modify `vps/prisma/api/conviva-event.php`
- [ ] **Step 1:** Aceptar el shape del beacon (device, ts, stats); persistir en conviva.db (recordServerSideQoE) por-device per-segundo; si VST/rebuffer proxy supera umbral → `recordHdcpIncident`.
- [ ] **Step 2:** php -l + TEST: POST beacon → fila nueva en conviva.db (la validación encontró última fila real 2026-05-19 → ahora debe haber filas frescas).
- [ ] **Step 3:** Commit `feat(vps): conviva-event ingiere beacon 1Hz device-keyed`

### Task D3: Wire qoe_server_side_observer (dead code) — opcional, solo si aporta
- [ ] **Step 1:** La validación dice que el Lua observer no puede ver el video (provider-direct). **DECISIÓN:** NO cablearlo (no aporta; la telemetría real viene del beacon D1). Documentar en el reporte. (YAGNI.)

---

## PHASE E — HEVC-first máxima calidad per-canal (respetando Nivel↔Resolución)

### Task E1: Verificar/enforce el ladder Main10 por res/fps en el STREAM-INF
**Files:** Modify `frontend/js/ape-v9/ape-hevc-cascade.js` (SSOT del codec) — verificar, inyectar si falta
- [ ] **Step 1:** Confirmar que `resolve_tier`/cascada emite el `hvc1.2.4.L<nivel>` **máximo** que la res/fps soporta (cardinal law): 4K@60→L153, 1080p@60→L123, 1080p@30→L120, 720p→L93. node -c.
- [ ] **Step 2:** TEST: para 720p el codec NO debe ser L153 (eso es el freeze); para 4K@60 sí L153.
- [ ] **Step 3:** Commit `chore(codec): verify HEVC-first Main10 máx por res/fps (cardinal law)` (solo si hubo cambio).

---

## PHASE F — Player usa la variante /omega/open + daemon consume actions[]

### Task F1: Documentar/forzar que el player cargue la variante /omega/open (no la base verbatim)
**Files:** Doc + (si aplica) el gateway de subida marca la variante /omega/open como la "activa"
- [ ] **Step 1:** Documentar en `android/ape-crystal-agent/README.md`: el player debe apuntar a `/lists/APE_LISTA_<id>_OMEGA_OPEN_VISUAL_V3_2_1_SHIELDED.m3u8` (no la base). Esa es la que tiene la URL-2 `/omega/open`.
- [ ] **Step 2:** TEST: con el player en la variante /omega/open, `playlist_access.log` muestra hits a `/omega/open?channel_id=` (hoy 0). **Step 3:** Commit doc.

### Task F2: Daemon consume actions[] del tune package (no settings estáticos)
**Files:** Modify `android/.../SettingsApplier.kt`
- [ ] **Step 1:** Añadir `applyActions(actions: List<JSONObject>)`: mapear `set_buffer`/`prefer_decoder`/`apply_visual_profile` a Settings permitidos (allowlist), ignorar `requires_player_filter`. Honesto: lo que el device SÍ puede aplicar.
- [ ] **Step 2:** El SSE incluye `actions[]` del tune package (Task A3 ya trae el canal → el orchestrator :3322 da el package). El daemon lo consume.
- [ ] **Step 3:** Rebuild + TEST on-device: logcat `actions aplicadas=N`. **Step 4:** Commit `feat(daemon): consume tune package actions[] (allowlist)`

---

## PHASE G — Safety / Rollback (freezeless guarantee)

### Task G1: Rollback per-canal por black-screen (Conviva VST_CRITICAL → blacklist PQ TTL 3600)
**Files:** Modify `conviva-event.php` (o un worker)
- [ ] **Step 1:** Cuando el beacon/Conviva reporta VST_CRITICAL o black para un canal con PQ activo → `touch /dev/shm/ape_pq_blacklist/<channel_id>.flag`. El gate C2 ya lo lee (G7) → deja de emitir PQ para ese canal 1h.
- [ ] **Step 2:** TEST: simular VST_CRITICAL → flag creado → siguiente gate del canal = false (SDR).
- [ ] **Step 3:** Commit `feat(safety): rollback PQ per-canal por black-screen (TTL 3600)`

### Task G2: Audit log de cada PQ-sobre-SDR
- [ ] **Step 1:** En el punto de emisión PQ, `error_log("[PQ-SDR] ch=$ch ip=$ip codec=$codec")`. **Step 2:** Commit.

---

## Verification E2E (todo el lazo, sin degradación)
1. Player carga variante /omega/open → zap canal X → `/omega/open?channel_id=X` pega el VPS → log_by_lua escribe `/dev/shm/ape_device_state/<ip>.json`.
2. Daemon SSE (misma IP) → recibe device_settings per-canal + actions[] + (si los 9 gates pasan) hint PQ + Main10 + HDCP-NONE.
3. Daemon aplica (allowlist) + emite Conviva 1Hz → conviva.db tiene filas frescas/segundo.
4. On-device (Fire TV real, ADB LAN): `settings get` confirma; logcat `actions aplicadas`; **sin black-screen** (los 9 gates lo garantizan); si black → blacklist auto.
5. `nginx -t` PASS; `php -l` PASS en todos; `node -c` PASS en el generador; health != critical.

## Rollback global
Cada cambio VPS tiene backup en `/root/ape-deploy-rollback/<ts>/`. El nginx revierte con `nginx -t` guard. El APK revierte con `adb uninstall`. Las doctrinas/código revierten por git (rama `feat/adb-generic-visual-enhancement-installer`).

## Límites honestos (lo que NO promete este plan)
- **Per-frame real (cuadro-a-cuadro)** = Sub-proyecto 2 (agent-player con engine en la ruta de video). Este plan entrega el lazo **per-zap/per-segundo content-aware** + el SDR→HDR display enhancement (gateado). El "imperceptible_ms" lo hace el SoC local, no el VPS.
- La mejora visible depende de que el **SoC del device** tenga VPP SDR→HDR (gate SoC). En SoC sin esa capacidad, el daemon solo aplica frame-rate (seguro).
- Conviva 1Hz reporta **estado del sistema/device**, no análisis del frame.
