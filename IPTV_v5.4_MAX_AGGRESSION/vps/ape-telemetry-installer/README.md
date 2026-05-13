# APE Telemetry Installer — ADB Player Setup Package

> **Version:** 1.0.0 — 2026-04-28
> **Purpose:** Paquete completo para instalar telemetría en CUALQUIER player Android con ADB

## ¿Qué hace este paquete?

Configura la cadena completa de telemetría desde el player hasta PRISMA:

```
Player Android (Fire Stick / Onn 4K / Shield TV / Chromecast)
    │ ADB over WiFi (puerto 5555)
    │
    ├─→ [1] setup-device.sh — Prepara el dispositivo (ADB WiFi + developer mode)
    │
    └─→ VPS (WireGuard 10.200.0.X)
        │
        ├─→ [2] add-device.sh — Registra nuevo dispositivo en Guardian config
        │
        ├─→ Guardian daemon — Lee logcat via ADB, extrae codec/resolution/bitrate
        │       ↓ escribe
        │   /var/log/ape-realtime-guardian/audit.jsonl
        │       ↓ lee
        ├─→ [3] Bridge daemon — Ya instalado, transforma audit → SHM
        │       ↓ escribe
        │   /dev/shm/guardian_player_state.json
        │       ↓ lee
        └─→ PRISMA PHP — Calcula lane metrics con datos REALES
```

## Dispositivos soportados

| Dispositivo | SoC | ADB WiFi | Player soportado |
|---|---|---|---|
| Fire TV Stick 4K | MT8696 | ✅ | OTT Navigator, TiviMate |
| Fire TV Stick 4K Max | MT8696 | ✅ | OTT Navigator, TiviMate |
| Fire TV Cube 3rd Gen | Amlogic S922X | ✅ | OTT Navigator, TiviMate |
| Onn 4K Streaming Box | Amlogic S905X4 | ✅ | OTT Navigator, TiviMate |
| NVIDIA Shield TV Pro | Tegra X1+ | ✅ | OTT Navigator, TiviMate |
| Chromecast with Google TV | Amlogic S905X3 | ✅ | OTT Navigator |
| Xiaomi Mi Box S | Amlogic S905X3 | ✅ | OTT Navigator, TiviMate |
| Mecool KM6 | Amlogic S905X4 | ✅ | OTT Navigator |
| Formuler Z11 Pro | Amlogic S905X4 | ✅ | MyTVOnline, OTT Navigator |

## Prerequisitos

### En tu PC (Windows)
- ADB instalado (`adb.exe` en PATH) → [Platform Tools](https://developer.android.com/tools/releases/platform-tools)
- SSH al VPS configurado (`ssh root@178.156.147.234`)
- WireGuard activo entre el player y el VPS

### En el dispositivo Android
- **Developer Options** activado
- **USB Debugging** activado
- **ADB over network** activado (puerto 5555)
- Conectado a la misma red WiFi que el VPS puede alcanzar via WireGuard

## Uso rápido

### Paso 1: Preparar el dispositivo

```bash
# Desde tu PC (Windows PowerShell):
# Conectar al dispositivo via ADB WiFi
adb connect 192.168.1.XXX:5555

# Verificar conexión
adb devices

# Ejecutar el script de preparación
bash setup-device.sh 192.168.1.XXX
```

### Paso 2: Registrar dispositivo en VPS

```bash
# Copiar el script al VPS
scp add-device.sh root@178.156.147.234:/tmp/

# Ejecutar en VPS — agrega el dispositivo al Guardian
ssh root@178.156.147.234 "bash /tmp/add-device.sh \
  --name mi_firestick \
  --address 10.200.0.5:5555 \
  --player ott_navigator \
  --location sala"
```

### Paso 3: Verificar telemetría

```bash
# Esperar 30 segundos, luego:
ssh root@178.156.147.234 "cat /dev/shm/guardian_player_state.json | python3 -m json.tool"

# Esperado:
# {
#   "codec": "hevc",
#   "resolution": "4K",
#   "bitrate_kbps": 7058,
#   "decoder_type": "HW",
#   "dropped_frames": 0,
#   "buffer_ms": 12500,
#   "timestamp": 1777380738.45
# }
```

## Estructura del paquete

```
ape-telemetry-installer/
├── README.md                  # Este archivo
├── setup-device.sh            # Prepara el dispositivo Android para ADB WiFi
├── add-device.sh              # Registra un nuevo dispositivo en Guardian config
├── verify-pipeline.sh         # Verifica la cadena completa de telemetría
├── enable-mediacodec-log.sh   # Activa logging MediaCodecLogger en el player
└── wireguard-device.conf      # Template WireGuard config para nuevo dispositivo
```

## Rollback

Si necesitas deshacer todo:
```bash
# Quitar un dispositivo del Guardian
ssh root@178.156.147.234 "bash /tmp/add-device.sh --remove --name mi_firestick"

# Desinstalar el bridge completo
ssh root@178.156.147.234 "bash /opt/prisma-guardian-bridge/uninstall.sh"
```
