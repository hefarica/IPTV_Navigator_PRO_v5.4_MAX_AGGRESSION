# OMEGA + APE Runtime Agent (ARA) — PLAN MAESTRO INTEGRADO

> **Estado:** Diseño consolidado (workflow `w31hj7qy3`, 5 agentes, 564k tokens, evidencia del repo).
> **Fecha:** 2026-06-16. **Rama:** `feat/adb-generic-visual-enhancement-installer`.
> **Doctrina LOCKED (owner):** ARA + URL-2 = bus canónico; por ahí viaja TODO; transporte =
> **streaming + conexión abierta + data-push de deltas**, nunca polling. El cliente **NO** bypasea
> el VPS. Ver memoria [[ara-url2-canonical-bus]].

---

## PARTE 0 — El modelo CORREGIDO (con evidencia, no suposición)

### 0.1 Xray = el túnel que FUERZA al device a ENTRAR al VPS (lo opuesto a un bypass)

```
ONN/Fire TV player
   │  v2rayNG VLESS+Reality  (outbound rule {network:"tcp,udp"→proxy} = TODA la sesión)
   ▼
VPS Xray :8443  (VLESS+Reality inbound, serverName camuflaje www.microsoft.com, systemd Restart=always)
   ▼
DNS hijack VPS  (x1megaott.online / tivigo.cc / … → 178.156.147.234)
   ▼
nginx shield/intercept  (iptv-intercept.conf por-host + shield-location.conf /shield/ regex)
   ▼
SurfShark wg egress → upstream provider
```

**Tanto el `.m3u8` como los segmentos `.ts/.m4s/.aac` pasan por el VPS.** El manifest se **MUTA**
VPS-side; los segmentos transitan solo para throughput/cache/telemetría (el body-filter los bypassa
en STAGE-0). La memoria vieja "Xray-directo bypassa el VPS" queda **retirada** (verificado en repo).

### 0.2 Las 3 superficies que SÍ llegan al player (el resto es metadata inerte)

| # | Superficie | Qué cambia | Quién la aplica |
|---|---|---|---|
| **A** | `#EXTVLCOPT`/`#KODIPROP` en la lista | filtros/buffer/red del player | VLC/Kodi (lista-level; OTT Navigator los ignora) |
| **B** | `device_settings` ADB (allowlist de 4) | display/VPP: frame-rate, hdr_conversion, **minimal_post_processing**, color_mode | el **ARA on-device** (caliente, al instante) |
| **C** | **Body-filter del manifest** (`combined_body_filter.lua` v2.0) | **selección/reorden de variante** + reescritura `CODECS=`/`RESOLUTION` (DORMIDA) | nginx VPS-side, el player parsea la variante elegida |

> **Verdad honesta:** lo que llega NO es "el VPS mejoró píxeles". La superficie C es **selección de
> variante** (real, no decorativa, pero no es enhancement de píxel). El único lever pixel-adjacent es
> **B** (display/VPP on-device). Sin per-frame remoto (RTT ≫ 33ms/frame — el SoC hace per-frame local).

### 0.3 URL-2 = el bus de control paralelo (3 patas), transporte streaming-push

- **(A) `/omega/*`** — zap-state writers (`log_by_lua` escribe `/dev/shm/ape_devstate_<ip>.json`).
- **(B) `ape-feedforward-stream.php` (SSE)** — **el push DOWN**: streaming abierto, device-initiated
  (EventSource, auto-reconnect, server bounded `dur≤110s`), empuja `presets[]` + `device_settings[]`
  por tick/delta. **Esta es la "conexión abierta data-push" que pediste.**
- **(C) `conviva-event.php`** — el push **UP** de QoE (fire-and-forget + cola NDJSON).
- **Spine:** `bandwidth_reactor.lua` (log-phase, en CADA location) mide throughput/TTFB/jitter y
  encadena por `pcall(dofile)` el qoe-observer + wake-on-manifest. Es la columna de telemetría de URL-2.

Correlación URL-1↔URL-2 = la IP pública del hogar (NAT compartido): `ape_device_state_by_ip(REMOTE_ADDR)`.

---

## PARTE 1 — Integración de los 10 motores (estado real + acción)

| # | Motor | Estado auditado | Acción para integrar al 100% |
|---|---|---|---|
| 1 | `ai_super_resolution_engine.php` | **HUÉRFANO** (solo lo llama el shim muerto) | Cablear en `ape_mesh_presets`: emitir **solo su `#EXTVLCOPT` real** (sharpen/contrast/saturation/swscale). Cuarentena de su `X-HDR-*`/`X-AI-*` (nunca STREAM-INF, nunca header tóxico). |
| 2 | `modem_priority_manager.php` | **HUÉRFANO** | Cablear honesto: hints de prioridad de red; `tc qdisc` gateado a root. NO es imagen. |
| 3 | `neuro_buffer_controller.php` | **PARCIAL** (mesh solo llama `buildApeTags` decorativo) | Llamar también **`buildVlcOpts`** → `#EXTVLCOPT` accionables (caching/reconnect = freezeless). |
| 4 | `resilience_integration_shim.php` | **HUÉRFANO** (orquestador sin caller) | **Jubilar**: absorber su patrón en `ape_mesh_presets`. NO borrar (OMEGA-NO-DELETE). |
| 5 | `visual_profiles.json` | **WIRED-inerte** (lectores leen `/etc/ape-uhdx/`, NO sincronizado por CI/CD) | **Añadir al CI/CD** (repo→`/etc/ape-uhdx/`). Esto **(a)** alimenta `ape_mesh_profile_for` y **(b) DESPIERTA** el codec-cascade/virtual-4K **dormido** de `combined_body_filter.lua`. |
| 6 | `setup_client_shaders.sh` | **HUÉRFANO** (mpv-only, **2 URLs muertas 404**) | Arreglar URLs + idempotente + `-f`. Pasa a ser el **adapter mpv/Kodi** del ARA Player Adapter. NO para ExoPlayer. |
| 7 | `onn_4k_lock_resolution.sh` | **HUÉRFANO** (setprop/surfaceflinger **solo-root**) | **Partir**: lo sin-root (`wm size/density` + `device_settings`) lo aplica el **ARA executor** cada delta; lo root-only gateado. |
| 8 | `combined_body_filter.lua` | **WIRED v2.0** (`vps/nginx/lua/`) en `.m3u8`; codec-cascade **DORMIDO** | SSOT = `vps/nginx/lua/`. Sincronizar `visual_profiles.json` lo **despierta**. **Verificar GOLDEN RULE + Ley Cardinal 1** en la reescritura `CODECS=`. Marcar la copia raíz v1.0 como stale. |
| 9 | `bandwidth_reactor.lua` | **WIRED canónico** (`vps/nginx/lua/`, log-phase, en TODO) | Ya vivo = spine de URL-2. SSOT = `vps/nginx/lua/`. Marcar `vps_bandwidth_reactor.lua` raíz (3-state 80M) como stale. |
| 10 | `vps_combined_body_filter.lua` | **NO WIRED** (raíz, byte-idéntico al v1.0 muerto) | Marcar stale (OMEGA-NO-DELETE: no borrar, anotar que `vps/nginx/lua/` es el SSOT). |

**Nota de los 3 Lua:** los archivos de la **raíz del repo** que me pasaste son **duplicados stale (2 versiones atrás)**. Las copias **canónicas vivas** están en `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/` y **ya están cableadas** en los `.conf`. Integrarlos al 100% = fijar `vps/nginx/lua/` como SSOT + despertar el body-filter vía `visual_profiles.json` + limpiar la confusión de duplicados.

---

## PARTE 2 — El APE Runtime Agent (ARA): ~80% YA existe (ensamblaje, no greenfield)

### 2.1 Lenguaje (decisión honesta): **EVOLUCIONAR el `sh` on-device + watchdog `ps1`. NO Rust/Go.**

La premisa "Rust binario estático musl aarch64" es **técnicamente falsa** para Fire TV: Android usa
**Bionic libc** (no glibc/musl) → un binario `aarch64-unknown-linux-musl` **no corre**. El único triple
viable es `aarch64-linux-android` (NDK, **dinámicamente** linkeado) → **sin ventaja de binario único**.
Cambiar de lenguaje da **CERO capacidad nueva**: el leverage del agente es **shell-out a binarios
Android** (`logcat` — única vía para que shell-user UID 2000 vea el logcat de un player 3rd-party;
`settings`/`cmd` para la allowlist; `am`/`dumpsys`; `curl` estático para el problema del CA-store TLS).
`sh` los invoca nativo, sin toolchain, sin ABI-drift en la flota heterogénea (amlogic/mtk/rtk/rk/qcom).
Ya hay patrón sh freeze-safe probado (`ape-uhdx-sentinel.sh`).

### 2.2 Híbrido (LOCKED): on-device executor + LAN-host supervisor + VPS policy plane

```
VPS (policy plane)          LAN-host (supervisor, ps1)        Fire TV (executor, sh UID 2000)
 selecciona variantes/QoE     watchdog 1Hz adb keep-alive       lee SU logcat (QoE real)
 PQ→SDR rollback (Phase G)     mDNS discovery + reboot-detect    aplica device_settings (allowlist)
 sirve SSE (URL-2 push)        re-push idempotente               POST QoE fire-and-forget (cola)
 NUNCA empuja al device  ◄──── (NAT: el device disca, no al revés) ───►  self-heal + lock único
```

### 2.3 Mapa de módulos del ARA (existe vs gap)

| Módulo | Estado | Reuso / acción |
|---|---|---|
| **Connection Manager** | EXISTE (FeedForwardClient.kt SSE-down + ape-qoe-agent.sh POST-up) | Unificar bajo **una** señal de salud. |
| **Metadata Receiver** | EXISTE (parser SSE de FeedForwardClient) | Extender para leer `engines/risk/pq` (hoy solo lee `device_settings`). |
| **Policy Engine** | EXISTE split (SettingsApplier allowlist on-device + `playback_profile_decider.sh`/`tv_capability_probe.sh` VPS) | Añadir **cross-check de hardware local** (cache de caps) para clampar lo que el panel no soporta. |
| **Player Adapter** | EXISTE (`ape-universal-player-orchestrator.sh` `adapter_for` + `current_player()`) | Reusar contrato. Documentar: VLC/Kodi = lista-level; el daemon = capa display Android. |
| **QoE Monitor** | EXISTE (ape-qoe-agent.sh `logcat_loop` UID 2000) | Reusar verbatim. **Calibrar regex** contra logcat real ONN (4K HEVC). |
| **Watchdog** | EXISTE (host ps1 + adb-keepalive mDNS + AgentService START_STICKY + BootReceiver) | Consolidar. Host-watchdog **obligatorio** (el VPS no alcanza el NAT). |
| **State Persistence** | **PARCIAL → NET-NEW** | Crear **state.db on-device** (SQLite o ficheros estructurados): last-known-good `device_settings` por canal, ledger idempotente, caps de hardware, estado del FSM. |
| **Recovery Engine** | **PARCIAL → NET-NEW** | FSM explícito **HEALTHY/DEGRADED/RECOVERING/OFFLINE_CACHE/RESTORED** sobre los primitivos existentes (backoff/heal/watchdog) + **OFFLINE_CACHE** (re-aplicar last-good cuando el VPS no responde) + **RESTORED** (re-sync al volver el SSE). |

### 2.4 Transporte (LOCKED): SSE streaming-push DOWN + fire-and-forget POST UP

Device-initiated egress HTTPS:443 (atraviesa NAT/CGNAT). **DOWN** = SSE EventSource (`ape-feedforward-stream.php`),
push de deltas con auto-reconnect (`Last-Event-ID`), backoff 1.5s→30s — **preferido sobre wss** (HTTP
sobrevive NAT agresivo, reusa el passthrough nginx, `sh`+`curl` lo hacen trivial; un handshake wss +
masking en sh es frágil). **UP** = POST QoE fire-and-forget + cola NDJSON. **Descubrimiento** = mDNS-first
(`adb mdns services`) + **port-pin fallback** (helper APK `BOOT_COMPLETED` hace `tcpip 5555`). Correlación
por `ro.serialno` (no IP).

---

## PARTE 3 — Secuencia de construcción (fases, desplegable por CI/CD)

### FASE 1 — Mesh accionable + visual_profiles SSOT *(VPS, desplegable HOY, sin daemon nuevo)*
- `ape_mesh_profile_for()` (lee `visual_profiles.json`, P máximo por defecto, de-escala por `riskScore`).
- `ape_mesh_presets()` accionable: `NeuroBuffer.buildVlcOpts` + `AISuperRes` EXTVLCOPT + ModemPriority (gated).
- `ape_mesh_device_settings()` += `minimal_post_processing_allowed 0` (VPP máx).
- CI/CD: `visual_profiles.json`→`/etc/ape-uhdx/` + 3 motores→`modules/`. **Despierta** el codec-cascade de `combined_body_filter.lua`.
- **Gate de seguridad:** verificar GOLDEN RULE (`hvc1` en CODECS / `hev1` en KODIPROP·EXTVLCOPT) + Ley Cardinal 1 (nivel↔resolución) en la reescritura `CODECS=` del body-filter al despertar.
- Verificación E2E: curl el SSE (`--resolve`), seed device_state; presets ahora con EXTVLCOPT accionable + `minimal_post_processing 0`; inyectar QoE alto → de-escala.

### FASE 2 — ARA: consolidación del 80% existente *(on-device + host)*
- Connection Manager unificado (SSE-down + QoE-up, una salud).
- Metadata Receiver extendido (engines/risk/pq).
- QoE Monitor calibrado (regex vs logcat real ONN).
- Player Adapter reusado + documentado.

### FASE 3 — ARA: los 2 net-new *(la parte realmente nueva)*
- **State Persistence**: state.db on-device.
- **Recovery Engine**: FSM 5-estados + OFFLINE_CACHE replay + RESTORED reconcile.

### FASE 4 — Adapters + hardening
- `setup_client_shaders.sh`: arreglar 2 URLs 404 + idempotente → adapter mpv/Kodi.
- `onn_4k_lock_resolution.sh`: split root/sin-root → executor.
- Helper APK `BOOT_COMPLETED` (port-pin) + **instalador unificado** (token 0600, push sh+curl, grant WRITE_SECURE_SETTINGS, BootReceiver, host-watchdog).
- Marcar duplicados Lua raíz como stale (SSOT = `vps/nginx/lua/`).

### FASE 5 — Verificación en device real
- Requiere Fire TV alcanzable por ADB (hoy `192.168.1.1:46543` wireless-debugging vía mDNS).
- `selftest`: uid=2000, grupo log=1007, logcat READABLE, curl OK; aplica device_settings; allowlist rechaza lo fuera-de-lista.

---

## PARTE 4 — Truth-guards (enforced) + preguntas a VERIFICAR

**Truth-guards:** players ciegos a `#EXT-X-APE-*` (RFC 8216 §6.3.1); VPS selecciona variantes/metadata/QoE,
no píxeles; sin per-frame remoto; ADB no se habilita remoto (agente autorizado on-device + host LAN);
GOLDEN RULE hvc1/hev1; Ley Cardinal 1 nivel↔resolución; no fake-HDR player-facing salvo PQ LOCKED +
Phase G; autopista (Lua log/body phase, pcall, passthrough, nunca `ngx.exit`/mid-stream block); egress
fire-and-forget; OMEGA-NO-DELETE (marcar stale, no borrar).

**A verificar en el VPS (no inventar):**
1. Zona unbound (provider-domain→VPS) — no está en el repo, vive en el VPS.
2. El 302 de `/omega/open` → ¿la URL destino es un hostname hijackeado (segmentos in-VPS) o IP cruda?
3. Player de producción real (OTT Navigator player-blind vs VLC/Kodi que sí honran EXTVLCOPT/KODIPROP).
4. Cuál intercept golpea el cliente (`iptv-intercept.conf` per-host vs `shield-location.conf` /shield/) — ambos cablean el body-filter, así que no afecta, pero confirmar.

**Riesgos del ARA (con mitigación):** cold-boot necesita 1 toque físico USB/Dev-Options (límite Android →
helper APK para warm reboots); drift de regex logcat (calibrar + heartbeat); mDNS flaky (port-pin fallback);
SELinux bloquea setprop adb-port (usar helper APK WRITE_SECURE_SETTINGS); Fire OS→Vega OS no-Android (pinear
flota Android); LMK/doze mata el daemon (host-watchdog 1Hz + footprint mínimo freeze-safe).
