# Manual de Funciones
## APE Resilience Toolkit v6.3

---

## Motor 1: NeuroBufferController — Adaptive Telemetry v3.0

### Función
Mide condiciones de red en tiempo real y calcula el nivel de agresión del buffer.

### Señales de entrada
| Señal | Descripción | Cálculo |
|:---|:---|:---|
| **Request Gap** | Tiempo promedio entre requests de un canal | `avg(timestamps[-5:])` |
| **Retry Ceiling** | Número de reintentos en 60 segundos | Count en ventana deslizante |
| **Freeze Memory** | Total histórico de hits de un canal | `total_hits` acumulado |

### Niveles de salida
| Nivel | Buffer % | Trigger | TCP | DSCP |
|:---|:---:|:---|:---:|:---|
| NORMAL | 70-100% | gapSignal > 70 | 3 | AF31 |
| ESCALATING | 40-69% | gapSignal 40-70 | 4 | AF31 |
| BURST | 15-39% | gapSignal 15-40 o 3+ retries | 6 | AF41 |
| NUCLEAR | 0-14% | gapSignal < 15 o 5+ retries | 8 | EF |

### Polimorfismo Freeze Detector
```
finalSignal = min(gapSignal, retryCeiling)
→ Siempre gana la señal más agresiva
→ Si total_hits > 10 → penalización permanente -10
```

### Archivo
`/var/www/html/cmaf_engine/modules/neuro_buffer_controller.php`

---

## Motor 2: BandwidthFloorEnforcement

### Función
Impone un PISO MÍNIMO de Mbps por perfil de calidad. Nunca permite que el ISP entregue menos.

### Pisos por perfil
| Perfil | Resolución | Floor base | ESCALATING (×1.25) | BURST (×1.5) | NUCLEAR (×2.0) |
|:---:|:---|:---:|:---:|:---:|:---:|
| P0 | 4K HDR | 50 Mbps | 62.5 | 75 | 100 |
| P1 | 4K | 40 Mbps | 50 | 60 | 80 |
| P2 | FHD | 20 Mbps | 25 | 30 | 40 |
| P3 | HD | 5 Mbps | 6.25 | 7.5 | 10 |
| P4 | SD | 2 Mbps | 2.5 | 3 | 4 |
| P5 | Audio | 0.5 Mbps | 0.625 | 0.75 | 1 |

### Headers inyectados
```
#EXTVLCOPT:adaptive-logic=highest
#EXTVLCOPT:adaptive-bw-min={floor_en_bps}
```

### Archivo
Integrado en `/var/www/html/cmaf_engine/resilience_integration_shim.php`

---

## Motor 3: ModemPriorityManager — DSCP + Network

### Función
Detecta tipo de red y marca paquetes con DSCP para priorización en el router.

### DSCP por nivel
| Nivel | DSCP Tag | Significado | Prioridad router |
|:---|:---|:---|:---|
| NORMAL | AF31 | Assured Forwarding | Media-Alta |
| ESCALATING | AF31 | Assured Forwarding | Media-Alta |
| BURST | AF41 | Assured Forwarding | Alta |
| NUCLEAR | EF | Expedited Forwarding | Máxima |

### Archivo
`/var/www/html/cmaf_engine/modules/modem_priority_manager.php`

---

## Motor 4: AISuperResolutionEngine v4.0 — Visual Orchestrator

### Función
Detecta dispositivos, combina player + TV, e inyecta metadatos de mejora visual.

### Sub-funciones

#### `detectDevice(string $userAgent): array`
- Detecta el dispositivo por User-Agent
- Almacena en Device Memory para combo

#### `detectCombo(array $primaryDevice): array`
- Busca TV + Player en memoria
- Fusiona capabilities (MAX de cada una)
- Activa pipeline dividido: decode en player, AI en TV

#### `calculateBandwidthBoost(int $height, array $device): float`
- SD→4K: ×1.5 (necesita fuente limpia)
- HD→4K: ×1.3
- FHD→4K: ×1.15
- 4K nativo: ×1.0
- Combo: ×1.3 adicional

#### `injectHardwareAcceleration(array $device, array &$exthttp, array &$vlcopt): void`
- Fuerza HW decode (nunca software)
- Codec priority: HEVC > AV1 > H264
- Pipeline dividido en combo mode

#### `injectClientSideLogic(int $height, array &$exthttp, array &$vlcopt, string $userAgent): void`
- Función principal: orquesta todo el pipeline visual
- 4 cases por resolución (SD/HD/FHD/4K)
- HDR/SDR simulation siempre activo a 4000-5000 nits

### Dispositivos soportados (20)
**TVs (9):** Samsung, LG, Sony, Hisense, TCL, Philips, Xiaomi, Vizio, Panasonic
**Players (6):** Fire TV 4K Max, Apple TV 4K, NVIDIA Shield, ONN 4K, Chromecast, Roku
**Software (5):** VLC, Kodi, ExoPlayer, OTT Navigator, Stremio

### Archivo
`/var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php`

---

## Motor 5: Shim Logging

### Función
Registra cada request con JSON estructurado para auditoría y diagnóstico.

### Formato de log
```json
{
  "ts": "2026-03-27T02:12:29+00:00",
  "ch": "1572916",
  "modules": ["NeuroBuffer", "BWFloor", "ModemPriority", "AISuperRes"],
  "ms": 5.71,
  "ai": "samsung",
  "buf": "NUCLEAR",
  "net": "ethernet"
}
```

### Archivos de estado
| Archivo | Contenido |
|:---|:---|
| `/tmp/neuro_telemetry_state.json` | Timestamps y total_hits por canal |
| `/tmp/ape_device_memory.json` | Dispositivos detectados para combo |
