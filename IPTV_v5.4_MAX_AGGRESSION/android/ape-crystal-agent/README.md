# APE Crystal Agent (APK) — daemon APLICADOR PURO (device-keyed)

> **Re-concebido 2026-06-15** tras auditoría adversarial (6 lentes, veredicto FLAWED). La versión
> previa (DecodeObserver→MatchClient→CargaApplier) tenía un fallo que rompía todo: una app
> **sideloaded** con `READ_LOGS` **solo ve los logs de su propio UID** desde Android 4.1 — NO puede
> leer el decoder de TiviMate/OTT/ExoPlayer. El "observar" era imposible en sideload.

## Concepción correcta: el daemon NO observa, SOLO aplica

```
   El VPS YA proxea el tráfico del device (DNS-hijack) → sabe qué canal/decode juega.
   ┌─────────────── APK (foreground service, persistente) ───────────────┐
   │  FeedForwardClient ──suscribe SSE ?device=<id>──►  VPS               │
   │        │  (Bearer, reconnect, cancel-on-stop)      ape-feedforward-  │
   │        ▼                                            stream.php        │
   │  SettingsApplier ◄── device_settings[] (allowlist) ◄─────────────────┤
   │        │ aplica Settings.Global/System (frame-rate, hdr-conv…)        │
   └────────┼─────────────────────────────────────────────────────────────┘
            ▼ panel: frame-rate match (anti-judder), HDR-conv solo si HDR real
   stream del proveedor → directo (verbatim); el APK NO proxea vídeo, NO cambia canales, NO abre apps.
```

- **No observa** (sin `READ_LOGS`, sin logcat). El VPS hace el "ver" — ya tiene el tráfico del device.
- **No manda telemetría** — solo se suscribe por `device-id`.
- **Solo aplica** lo que el VPS dicta, y **solo** lo que pasa la **ALLOWLIST** del `SettingsApplier`
  (frame-rate, hdr-conversion, minimal-post-processing, display-color) — nada arbitrario pese a
  tener `WRITE_SECURE_SETTINGS`.
- **Honesto:** los EXTVLCOPT/KODIPROP/EXT-X-APE-* (zscale, SR, color) son **list-level** → llegan al
  player por la **LISTA** (VPS body_filter/generador), no por el daemon. `hdr_conversion` solo si el
  VPS probó HDR real (truth-guard del lado VPS).

## Componentes (`app/src/main/java/com/ape/crystalagent/`)

| Archivo | Rol |
|---|---|
| `AgentService.kt` | Foreground service persistente; cablea FeedForwardClient + SettingsApplier; `onTaskRemoved`→re-arranque |
| `FeedForwardClient.kt` | Suscriptor SSE **device-keyed** (`?device=`); parsea `device_settings`; cancela el Call al parar |
| `SettingsApplier.kt` | Aplica `device_settings` vía `Settings.*` con **ALLOWLIST** estricta + validación de valor |
| `Config.kt` | vps/dev (SharedPreferences); **token por ARCHIVO 0600**, nunca en command-line |
| `BootReceiver.kt` | Persistencia tras reboot (BOOT_COMPLETED / MY_PACKAGE_REPLACED) |
| `MainActivity.kt` | UI mínima Leanback (estado + provisión) |

Permisos: **`WRITE_SECURE_SETTINGS`** (grantable por adb) + INTERNET/BOOT/FOREGROUND_SERVICE. **Ya NO usa `READ_LOGS`.**

## Build
Requiere Android SDK + JDK 17. Desde `android/ape-crystal-agent/`:
```sh
./gradlew :app:assembleRelease
apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --out app-release.apk app/build/outputs/apk/release/app-release-unsigned.apk
```

## Install (1 sesión ADB)
```sh
sh install.sh 10.200.0.3:5555 <TOKEN> https://iptv-ape.duckdns.org firestick-cali app-release.apk
```
Hace: `install -r` + `pm grant WRITE_SECURE_SETTINGS` + **token a `/sdcard/ape/token` (0600)** + arranca/provisiona.

## Verificar (en device real)
```sh
adb -s 10.200.0.3:5555 logcat -s ApeAgentService:I ApeFeedForward:W ApeSettingsApplier:I
# Debe verse: "START dev=… token=set" → (cada tick SSE) "device_settings aplicados=N rechazados=0"
```

## Pendiente (lado VPS, para tuning per-canal)
- **Correlación device→canal:** un `log_by_lua` (autopista-safe) en el path del manifest escribe
  `/dev/shm/ape_device_state/<device>.json` con el canal/decode real que el device pide → el SSE
  añade `hdr_conversion` solo cuando el canal es HDR real. Hoy device-keyed sin estado = frame-rate match (seguro).
- TLS pinning del VPS + rotación de token. Métricas (zaps/applied/rejected).
- (Opcional, mayor impacto visual) servidor de lista local (NanoHTTPD) para que los EXTVLCOPT/KODIPROP
  lleguen a un player 3rd-party que hoy no los lee de la lista del VPS.
