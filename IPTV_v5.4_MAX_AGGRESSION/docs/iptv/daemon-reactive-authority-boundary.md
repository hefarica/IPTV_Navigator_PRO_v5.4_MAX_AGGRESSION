# Daemon Reactive Authority Boundary

**El daemon no es el piloto. No es el usuario. No gobierna apps. Es el brazo técnico del VPS.**

```
La lista transporta la inteligencia → el VPS interpreta y decide → el daemon despierta y aplica
→ el player reproduce → el TV/SoC mejora → ADB observa → QoE retroalimenta.
```

## Regla madre
El daemon NO: lanza apps · cierra apps · cambia de canal · controla UI · navega menús · fuerza
playback · hace login · cambia URLs de proveedor · toca nginx/SHIELDED · mata el player · crea un
segundo watchdog. Es **únicamente un reactor** despertado por el VPS (ver [wake-on-playback](universal-player-visual-enhancement-orchestrator.md)).

## Contrato de autoridad (3 planos)
1. **Observación** — puede leer codec/decoder/res/fps/buffer/dropped/judder/MediaCodec/SurfaceFlinger/
   logs acotados/red/thermal. Solo para **reportar al VPS**, nunca para gobernar la app.
2. **Aplicación técnica** — aplica SOLO lo que el VPS manda: settings compatibles, setprop best-effort,
   MEMC/AIPQ/AISR/super-res si el SoC soporta, match frame rate, HDR policy, `persist.ape.visual.*`,
   deviceidle whitelist. Idempotente · reversible · best-effort · unsupported≠error.
3. **Respuesta** — telemetry/applied/failed/unsupported/codec/decoder/QoE/rollback al VPS.

## Enforcement — `vps/prisma/players/lib/daemon_authority_guard.sh`
Chokepoint que HACE CUMPLIR la frontera (no es solo documentación):
- `ape_guarded_adb_shell <T> <cmd>` — ejecuta SOLO si el comando no gobierna app/UI/playback.
  **Rechaza (rc=99)**: `am start`, `force-stop`/`am kill`/`killall`, `input keyevent/tap/swipe/text`,
  `monkey`, `pm clear/disable/uninstall/hide/suspend`, `svc`, `reboot`, `setprop ctl.`, `kill -9`.
  **Permite**: `settings get/put`, `getprop/setprop`, `am broadcast` (vendor técnico), `cmd deviceidle
  whitelist`, `test/cat`, y `pkill -USR1 ape-sentinel` (señal de **wake** a nuestro daemon, no un kill).
- `ape_payload_fresh <issued_at> <ttl_ms>` — **TTL**: payload caduco no se aplica (default 30 000 ms).
- `ape_codec_level <tv120> <buffer_ok>` — **L153** (`hvc1.2.4.L153.B0`, 4K@60 CORONA) seguro por defecto;
  **L156** (4K@120) SOLO si 120 Hz + buffer probados. Nunca L156 default universal.

## Payload del VPS (TTL + codec policy)
`visual_metadata_payload.sh` emite, además del perfil/algorithm_stack/do_not_fake:
```json
"codec_policy":{"preferred":"hvc1.2.4.L153.B0","forbidden_default":"hvc1.2.4.L156.B0","allow_l156_only_if_capability_proven":true},
"ttl_ms":30000,"issued_at":<epoch>
```
`visual_payload_apply.sh` carga el guard, y si el payload está caduco (TTL) → baja a
`TRUTHFUL_SOURCE_SAFE` (sin MEMC/HDR agresivo). Codec level resuelto por `ape_codec_level`.

## Flujo end-to-end
`m3u8 (SESSION-DATA/EXTHTTP/KODIPROP/EXTVLCOPT/codec chain/QoE)` → VPS ingesta →
`m3u8_variant_analyzer + tv_capability_probe + collect_player_telemetry + rust-visual-engine +
visual_lab_engine + visual_payload_decider` deciden → `visual_metadata_payload` empaqueta (TTL) →
**wake** (log_by_lua + ape-wake-worker → SIGUSR1) → daemon `visual_payload_apply` (solo lo permitido,
vía guard) → observa (`collect_player_telemetry`) → reporta → `qoe_feedback_loop` ajusta
(freeze/rebuffer→baja; judder→MEMC off; HW estable→mantiene/sube).

## Invariantes verificadas — `tests/test_daemon_authority_boundary.sh` (18/18)
1–5 ningún script operativo emite `am start`/`force-stop`/`input`/`monkey`/`pm` destructivo/`kill -9`.
6 guard selftest. 7 TTL caduco rechazado / fresco aceptado. 8 payload lleva `ttl_ms`.
9 MEMC con judder → `avoid_due_to_judder`. 10 L156 gated. 11 L153 default. 12 codec_policy bloquea L156.
14 no toca nginx/URL/provider. 5c `ape_guarded_adb_shell` rechaza `force-stop` (rc=99).

## Cross-references
`iptv-onn-sentinel-never-down` (el sentinel nunca abajo; wake = SIGUSR1, no kill) ·
`iptv-adb-guardian-watchdog-surgery` (un solo watchdog, PPID, clean-detach) ·
`iptv-autopista-doctrine` (el wake es log-phase fire-and-forget, no bloquea) · `iptv-vps-touch-nothing`.
