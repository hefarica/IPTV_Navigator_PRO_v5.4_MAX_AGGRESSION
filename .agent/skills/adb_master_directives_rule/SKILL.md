---
name: "adb-master-directives-rule"
description: "Regla ABSOLUTA: Inventario completo de TODAS las directivas que se deben inyectar vía ADB al Fire TV Stick 4K. Desde WireGuard hasta la última directiva de señal, red e imagen. Toda nueva directiva DEBE agregarse aquí primero."
---

# 🛡️ APE PRISMA — Master ADB Directives Rule

## Propósito

Este archivo es el **SSOT (Single Source of Truth)** de TODAS las directivas que se inyectan al Fire TV Stick 4K vía ADB. Cualquier nueva directiva de señal, red, imagen, audio o rendimiento **DEBE registrarse aquí primero** antes de implementarse en el daemon.

## Dispositivo Target

| Propiedad | Valor |
|---|---|
| Modelo | Fire TV Stick 4K Max (AFTKRT) |
| SoC | MediaTek MT8696 |
| Android | 11 (Fire OS 8.0) |
| Resolución nativa | 3840x2160 |
| WiFi | 802.11ax (WiFi 6), 5 GHz |
| ADB endpoint | `10.200.0.3:5555` (via WireGuard) |
| Refresh rate | 60Hz nativo (120Hz para contenido compatible) |

---

## CATEGORÍA 1: Infraestructura de Red (WireGuard + DNS)

### 1.1 WireGuard VPN Client Setup (Manual — una vez)

```bash
# Instalar WireGuard app via ADB
adb install wireguard.apk

# O configurar via intent (si la app ya está instalada)
adb shell am start -n com.wireguard.android/.activity.SettingsActivity

# Tunnel config se importa manualmente vía la app WireGuard
# Interface: 10.200.0.3/32
# Peer: VPS 178.156.147.234
# AllowedIPs: 0.0.0.0/0 (todo el tráfico por VPN)
# DNS: 1.1.1.1, 8.8.8.8
```

### 1.2 DNS Hardening (Daemon — cada 1s)

```bash
# Forzar DNS seguro via Google
settings put global private_dns_mode hostname
settings put global private_dns_specifier dns.google
```

---

## CATEGORÍA 2: Red y Ancho de Banda (24 directivas actuales)

### 2.1 WiFi Aggressive Mode

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `captive_portal_detection_enabled` | global | `0` | Elimina check de portal cautivo (ahorra 1 request/30s) |
| `wifi_sleep_policy` | global | `2` | WiFi NUNCA duerme (ni en standby) |
| `wifi_scan_always_enabled` | global | `0` | No escanear redes en background (ahorra CPU) |
| `wifi_networks_available_notification_on` | global | `0` | Sin notificaciones de redes disponibles |
| `network_scoring_ui_enabled` | global | `0` | Desactiva scoring de red (ahorra CPU) |
| `wifi_watchdog_poor_network_test_enabled` | global | `0` | **CRÍTICO**: Impide que Android desconecte WiFi por "mala señal" |
| `wifi_suspend_optimizations_enabled` | global | `0` | Sin optimizaciones de suspensión WiFi |

### 2.2 TCP/Bandwidth Enforcement

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `tcp_default_init_rwnd` | global | `60` | Ventana TCP inicial 60 segments (~87KB) |
| `background_data_enabled` | global | `0` | **CRÍTICO**: Corta TODA data de background apps |
| `data_roaming` | global | `0` | Sin roaming de datos |

### 2.3 System Updates Kill

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `package_verifier_enable` | global | `0` | Elimina verificación de paquetes (ahorra bandwidth) |
| `device_provisioned` | global | `1` | Marca como provisionado (evita setup wizard) |

---

## CATEGORÍA 3: Display e Imagen (HDR + Resolución)

### 3.1 HDR & Frame Rate

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `always_hdr` | global | `1` | **CRÍTICO**: Fuerza HDR siempre activo |
| `match_content_frame_rate` | global | `1` | Matching de frame rate con contenido |

### 3.2 Nuevas directivas de imagen (A IMPLEMENTAR)

| Directiva | Namespace | Valor | Efecto | Estado |
|---|---|---|---|---|
| `display_color_mode` | secure | `3` | Modo de color natural/boosted (3=enhanced) | ⏳ PENDIENTE |
| `color_mode` | system | `2` | Color automático HDR | ⏳ PENDIENTE |
| `hdr_conversion_mode` | global | `1` | Conversión HDR automática | ⏳ PENDIENTE |
| `user_preferred_resolution_height` | global | `2160` | Forzar 4K siempre | ⏳ PENDIENTE |
| `user_preferred_resolution_width` | global | `3840` | Forzar 4K siempre | ⏳ PENDIENTE |
| `user_preferred_refresh_rate` | global | `60.0` | Forzar 60Hz base | ⏳ PENDIENTE |

---

## CATEGORÍA 4: Rendimiento y Animaciones

### 4.1 Animaciones Zero (ya implementado)

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `window_animation_scale` | global | `0.0` | Sin animaciones de ventana |
| `transition_animation_scale` | global | `0.0` | Sin transiciones |
| `animator_duration_scale` | global | `0.0` | Sin duración de animador |

### 4.2 Nuevas directivas de rendimiento (A IMPLEMENTAR)

| Directiva | Namespace | Valor | Efecto | Estado |
|---|---|---|---|---|
| `forced_app_standby_enabled` | global | `1` | Forzar standby a apps no-OTT | ⏳ PENDIENTE |
| `app_standby_enabled` | global | `1` | App standby bucket activo | ⏳ PENDIENTE |
| `adaptive_battery_management_enabled` | global | `0` | Desactiva gestión adaptativa (da todo a OTT) | ⏳ PENDIENTE |

---

## CATEGORÍA 5: Energía y Always-On

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `stay_on_while_plugged_in` | global | `3` | Siempre encendido (USB+AC) |
| `low_power` | global | `0` | Modo de bajo consumo DESACTIVADO |
| `screen_off_timeout` | system | `2147483647` | Timeout de pantalla = infinito |
| `screensaver_enabled` | secure | `0` | Sin screensaver |

---

## CATEGORÍA 6: Audio

| Directiva | Namespace | Valor | Efecto |
|---|---|---|---|
| `hdmi_system_audio_control` | global | `1` | CEC audio control activo |

### 6.1 Nuevas directivas de audio (A IMPLEMENTAR)

| Directiva | Namespace | Valor | Efecto | Estado |
|---|---|---|---|---|
| `encoded_surround_output` | global | `2` | Forzar passthrough surround (Dolby/DTS) | ⏳ PENDIENTE |
| `encoded_surround_output_enabled_formats` | global | `""` | Todos los formatos habilitados | ⏳ PENDIENTE |

---

## CATEGORÍA 7: Métricas QoE vía ADB (Telemetría Predictiva)

Datos que el daemon RECOLECTA (no inyecta) desde el device cada 1s:

| Métrica | Comando ADB | Uso |
|---|---|---|
| WiFi Link Speed | `dumpsys wifi \| grep mWifiInfo` | Throughput máximo teórico |
| WiFi RSSI | `dumpsys wifi \| grep mWifiInfo` | Calidad de señal |
| WiFi Frequency | `dumpsys wifi \| grep mWifiInfo` | Banda 2.4/5 GHz |
| Throughput real | `/proc/net/dev` (delta RX bytes) | Mbps reales |
| OTT Navigator PID | `pidof studio.scillarium.ottnavigator` | Player vivo |
| Buffer Level | `dumpsys media.player` | Segundos en buffer |
| Frame Drops | `dumpsys SurfaceFlinger` | Drops/segundo |
| CPU temp | `cat /sys/class/thermal/thermal_zone0/temp` | Throttling risk |

---

## CATEGORÍA 8: Kill de procesos que roban bandwidth

```bash
# Kill background apps que compiten por bandwidth
adb shell cmd appops set com.amazon.device.software.ota RUN_IN_BACKGROUND deny
adb shell cmd appops set com.amazon.kindle RUN_IN_BACKGROUND deny
adb shell cmd appops set com.amazon.avod RUN_IN_BACKGROUND deny
adb shell pm disable-user com.amazon.device.software.ota  # Kill OTA updates
adb shell pm disable-user com.amazon.whisperplay.service   # Kill DIAL/Cast
```

---

## Regla de Gobernanza

> [!CAUTION]
> **TODA nueva directiva** (de red, imagen, audio, o rendimiento) **DEBE**:
> 1. Registrarse en este archivo primero (con categoría, namespace, valor y efecto)
> 2. Implementarse en `prisma_adb_daemon.sh` en el array correspondiente
> 3. Verificarse empíricamente via `adb shell settings get <namespace> <key>`
> 4. Nunca ser un one-shot — el daemon la verifica cada 1s y corrige drift

> [!WARNING]
> **Directivas que NUNCA se deben tocar vía ADB** (riesgo de brick):
> - `adb_enabled` — perderíamos acceso ADB
> - `install_non_market_apps` — Amazon lo puede resetear
> - `development_settings_enabled` — requerido para ADB
> - Settings de `secure/` que requieran root (el device NO tiene root)
