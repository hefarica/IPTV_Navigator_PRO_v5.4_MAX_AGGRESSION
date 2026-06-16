# APE Crystal Agent (APK) — el daemon hecho BIEN

> El shell daemon (`ape-outbound-agent.sh`) fue el workaround. Este APK es la **vía correcta**:
> en Fire OS sin root, una app con permisos `READ_LOGS` + `WRITE_SECURE_SETTINGS` (grantables por
> `adb pm grant`) hace lo que el shell **no puede** — y todo **HONESTO** (sin fake 4K/HDR público).

## Por qué un APK (lo que el council de 13 PhDs destapó del shell daemon)

| Problema del shell daemon (Fire OS) | Quién lo vio | Cómo lo resuelve el APK |
|---|---|---|
| `setsid` no detacha → el daemon **muere** y no persiste | S7-F1 | **Foreground Service** + `START_STICKY` + `BootReceiver` (BOOT_COMPLETED / MY_PACKAGE_REPLACED) |
| **Sin `curl`** → no hace el pull al VPS | S2/S8/S9 | **OkHttp** nativo, con **ConnectionPool keep-alive** (no paga TLS por zap — S8-N1) |
| `read_real_decode` lee **capacidad** (CodecQuerier) → "hevc 4K" falso | **S12-F1** | `DecodeObserver` lee logcat en **streaming** SOLO de tags de **decoder activo** + filtra `updateFormatChanged`/`output format` (nunca MediaCodecList) |
| `setprop persist.*` **bloqueado** sin root | **S9-F3/F4** | Usa **`Settings.Global/Secure`** con `WRITE_SECURE_SETTINGS` (sí permitido) — lo vendor-privado se **omite, no se finge** |
| iData en GET → telemetría en logs | S10-F2 / S1-H1 | **POST** body + token en header `Authorization: Bearer` |
| MATCH sin `esperado` → degradado | S1-H3 | `ChannelIndex` lee `/sdcard/ape/channels_index.json` (del generador) → inyecta `esperado` |
| KODIPROP/EXTVLCOPT no se inyectan en runtime | S9-F2 | v1: el VPS los manda en la carga (log + sidecar); **v2: servidor de lista local** (NanoHTTPD) al que OTT apunta |

## Arquitectura

```
                 ┌──────────────────────── APK (foreground service, persistente) ───────────────────────┐
   ZAP en OTT →  │ DecodeObserver (logcat decoder-ACTIVO) ──RealDecode──► AgentService.onZap()           │
                 │                                                          │ (debounce 800ms, IO)        │
                 │   ChannelIndex.esperadoFor(ch) ──esperado──┐             ▼                              │
                 │                                            └──► MatchClient ──POST iData(esperado+real)─┼──► VPS ape-match.php
                 │                                                 (OkHttp keep-alive, Bearer)            │      MATCH F0-F5
   panel 4K   ◄──│ CargaApplier (Settings.Global, honesto) ◄────────── CARGA (China Box/Huawei + QoE) ◄──┼──── (carga)
                 └────────────────────────────────────────────────────────────────────────────────────┘
   stream del proveedor → directo (verbatim), el APK NO proxea vídeo.
```

**Doctrina honesta (no player-breaking lies):** públicos `RESOLUTION/VIDEO-RANGE/CODECS` SIEMPRE veraces
(1080p SDR L120 para el caso real). El enriquecimiento (AI-SR upscale al panel, MEMC, floor-lock, color)
es **processing de display** + metadata privada APE. `VIDEO-RANGE=PQ/HLG` solo si el decoder lo probó.

## Componentes (`app/src/main/java/com/ape/crystalagent/`)

| Archivo | Rol |
|---|---|
| `AgentService.kt` | Foreground service + orquestador del lazo (persistente) |
| `DecodeObserver.kt` | logcat streaming → realidad del **decoder activo** (fix S12) |
| `MatchClient.kt` | iData → `ape-match.php` (POST, Bearer, OkHttp keep-alive) |
| `CargaApplier.kt` | Aplica la carga vía `Settings.*` (honesto; omite lo bloqueado) |
| `ChannelIndex.kt` | "lo esperado" del canal (índice local del generador) |
| `Models.kt` | `RealDecode` + `Carga` (JSON) |
| `Config.kt` | vps/token/dev (SharedPreferences; token nunca en URL) |
| `BootReceiver.kt` | persistencia tras reboot |
| `MainActivity.kt` | UI mínima Leanback (estado + instrucciones) |

## Build

Requiere Android SDK + JDK 17. Desde `android/ape-crystal-agent/`:
```sh
./gradlew :app:assembleRelease       # → app/build/outputs/apk/release/app-release-unsigned.apk
# firmar (debug key sirve para sideload):
apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --out app-release.apk app/build/outputs/apk/release/app-release-unsigned.apk
```
(O abrir en Android Studio → Build APK.)

## Install (1 sesión ADB en la LAN de Cali)
```sh
sh install.sh 192.168.1.7:5555 <TOKEN_de_ape-cmd-push_enroll> https://iptv-ape.duckdns.org app-release.apk
```
Hace: `install -r` + `pm grant READ_LOGS` + `pm grant WRITE_SECURE_SETTINGS` + arranca/provisiona el servicio.

## Verificar
```sh
adb -s 192.168.1.7:5555 logcat -s ApeAgentService:I ApeDecodeObserver:I ApeMatchClient:W ApeCargaApplier:I
# Zapea un canal → debe verse: "ZAP real → RealDecode(...)" → "CARGA aplicada: codec=hvc1.2.4.L120 ..."
```

## Roadmap v2
- **Servidor de lista local (NanoHTTPD):** OTT apunta a `http://127.0.0.1:8790/list.m3u8`; el APK sirve la
  lista del generador **enriquecida** (KODIPROP/EXTVLCOPT China Box siempre presentes) → cierra el gap S9-F2.
- **MediaSession real** para `currentChannelId` (NotificationListener) → `esperado` exacto por canal.
- **TLS pinning** del VPS + rotación de token (S10-F4).
- **Métricas** (S11): el APK postea KPIs (zaps, enriched%, fake-blocked) a `/prisma/api/metrics`.
