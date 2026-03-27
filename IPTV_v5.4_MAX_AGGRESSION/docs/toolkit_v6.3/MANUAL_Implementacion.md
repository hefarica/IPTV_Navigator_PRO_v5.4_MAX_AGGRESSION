# Manual de Implementación
## APE Resilience Toolkit v6.3

---

## 1. Arquitectura del Sistema

```
                    ┌──────────────────────────┐
                    │  Player (Fire TV/ONN 4K) │
                    │  User-Agent + Request     │
                    └─────────┬────────────────┘
                              │ HTTP GET
                              ▼
                    ┌──────────────────────────┐
                    │  VPS (iptv-ape.duckdns)  │
                    │  resolve_quality.php      │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │ Motor 1: NeuroBuffer│  │  → buffer_pct, nivel
                    │  ├────────────────────┤  │
                    │  │ Motor 2: BW Floor   │  │  → floor Mbps
                    │  ├────────────────────┤  │
                    │  │ Motor 3: DSCP       │  │  → AF31/AF41/EF
                    │  ├────────────────────┤  │
                    │  │ Motor 4: AI Engine  │  │  → headers visuales
                    │  ├────────────────────┤  │
                    │  │ Motor 5: Logger     │  │  → JSON log
                    │  └────────────────────┘  │
                    │        ~5ms total         │
                    └─────────┬────────────────┘
                              │ M3U8 + Headers
                              ▼
                    ┌──────────────────────────┐
                    │  Player HW Decode        │
                    │  (AV1/HEVC/H264)         │
                    └─────────┬────────────────┘
                              │ HDMI 2.1 (48Gbps)
                              ▼
                    ┌──────────────────────────┐
                    │  Samsung TV              │
                    │  NQ8 AI Gen3 (768 NN)    │
                    │  AI Upscaling Pro        │
                    │  HDR10+ Advanced 5000nit │
                    └──────────────────────────┘
```

---

## 2. Requisitos del Servidor

| Componente | Mínimo | Recomendado |
|:---|:---|:---|
| OS | Ubuntu 22.04 | Ubuntu 24.04 |
| PHP | 8.1 FPM | 8.3 FPM |
| RAM | 512 MB | 1 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disco | 5 GB | 10 GB |
| Nginx | 1.18+ | 1.24+ |

### PHP Extensions requeridas
```
php-json php-curl php-mbstring php-xml
```

### Configuración PHP-FPM recomendada
```ini
; /etc/php/8.3/fpm/pool.d/www.conf
pm = dynamic
pm.max_children = 20
pm.start_servers = 5
pm.min_spare_servers = 3
pm.max_spare_servers = 10
pm.max_requests = 1000
```

---

## 3. Instalación Paso a Paso

### 3.1 Subir el paquete
```bash
scp APE_Resilience_Toolkit_v6.3.zip root@VPS_IP:/tmp/
```

### 3.2 Descomprimir
```bash
ssh root@VPS_IP
cd /tmp
unzip APE_Resilience_Toolkit_v6.3.zip
cd APE_Resilience_Toolkit_v6.3
```

### 3.3 Ejecutar instalador
```bash
chmod +x install.sh
sudo ./install.sh
```

El instalador automáticamente:
1. Verifica PHP, Nginx y web root
2. Crea backup de archivos existentes
3. Copia los 5 archivos PHP
4. Establece permisos (www-data)
5. Crea directorios de log
6. Verifica sintaxis PHP
7. Recarga PHP-FPM y Nginx

### 3.4 Verificar
```bash
# Verificar que responde
curl -s "http://localhost/resolve_quality.php?ch=test&p=P2" | head -5

# Verificar logs
tail -5 /var/log/iptv-ape/shim_operations.log
```

---

## 4. Estructura de Archivos

```
/var/www/html/
├── resolve_quality.php                    ← Entry point
│   ├── Profiles P0-P5 (bitrate, resolution, min_bw)
│   ├── Server resolution (multi-server)
│   └── Calls resilience_integration_shim.php
│
└── cmaf_engine/
    ├── resilience_integration_shim.php    ← Pipeline controller
    │   ├── deriveBufferFromTelemetry()    ← Freeze Detector v3.0
    │   ├── applyBandwidthFloor()          ← BW Floor Enforcement
    │   └── executeResiliencePipeline()    ← Orchestrates all motors
    │
    └── modules/
        ├── neuro_buffer_controller.php    ← Motor 1
        │   └── buildAggressionProfile()   ← TCP + DSCP per level
        │
        ├── modem_priority_manager.php     ← Motor 3
        │   └── detectNetwork()            ← ethernet/wifi/cellular
        │
        └── ai_super_resolution_engine.php ← Motor 4 (v4.0.0)
            ├── detectDevice()             ← 20 devices
            ├── detectCombo()              ← Player+TV merge
            ├── calculateBandwidthBoost()  ← AI BW multiplier
            ├── injectHardwareAcceleration()← HW decode forcing
            └── injectClientSideLogic()    ← Visual orchestrator

/var/log/iptv-ape/
├── shim_operations.log     ← JSON per request
├── neuro_telemetry.log     ← Buffer decisions
├── bw_floor.log            ← Bandwidth floor applied
├── ctx_inherit.log         ← Context inheritance
└── fallback.log            ← Server fallback events

/tmp/
├── neuro_telemetry_state.json  ← Channel state persistence
└── ape_device_memory.json      ← Device combo memory
```

---

## 5. Configuración Nginx

```nginx
server {
    listen 80;
    server_name iptv-ape.duckdns.org;
    root /var/www/html;
    index index.php;

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_read_timeout 30;
    }
}
```

---

## 6. Parámetros Ajustables

### NeuroBuffer (resilience_integration_shim.php)
| Parámetro | Default | Efecto |
|:---|:---:|:---|
| `GAP_FLOOR_BASE` | 0.3s | Gap mínimo para señal de stress |
| `GAP_CEILING` | 5.0s | Gap máximo (normalizado a 0-100) |
| `DEGRADING penalty` | -20.0 | Penalización por trend degradante |
| `Total hits > 10` | -10.0 | Penalización permanente por canal problemático |

### BW Floor (resilience_integration_shim.php)
| Parámetro | Default | Efecto |
|:---|:---:|:---|
| `P0 floor` | 50 Mbps | Floor base para 4K HDR |
| `P2 floor` | 20 Mbps | Floor base para FHD |
| `NUCLEAR multiplier` | 2.0x | Multiplica floor en crisis |

### AI Engine (ai_super_resolution_engine.php)
| Parámetro | Default | Efecto |
|:---|:---:|:---|
| `nitsTarget` | 4000-5000 | Nits objetivo para HDR simulation |
| `bw_boost combo` | 1.3x | BW extra cuando hay combo player+TV |
| `SD aiBoost` | 1.5x | BW extra cuando upscale SD→4K |

---

## 7. Agregar un Nuevo Dispositivo

Para agregar un TV o player no soportado:

```php
// En ai_super_resolution_engine.php → $deviceCapabilities
'mi_nuevo_tv' => [
    'pattern'          => '/MiMarca|MiOS/i',    // Regex del User-Agent
    'type'             => 'tv',                  // 'tv', 'player', o 'software'
    'supports_ai'      => true,
    'ai_processor'     => 'NOMBRE_CHIP',
    'neural_networks'  => 128,
    'ai_header'        => 'X-MiMarca-AI-Mode',
    'ai_value'         => 'AI_UPSCALE',
    'upscale_mode'     => 'AI_4K_UPSCALING',
    'hdr_type'         => 'HDR10_PLUS',
    'hdr_nits'         => 2000,
    'ai_motion'        => 'SMOOTH_MOTION',
    'ai_color'         => 'COLOR_ENGINE',
    'ai_depth'         => 'DEPTH_ENHANCE',
    'ai_brightness'    => 'AUTO_BRIGHTNESS',
    'ai_sound'         => 'DTS_X',
    'genre_optimization' => false,
    'max_res'          => '3840x2160',
    'hdmi_version'     => '2.1',
],
```

Después: subir el archivo y verificar sintaxis:
```bash
scp ai_super_resolution_engine.php root@VPS:/var/www/html/cmaf_engine/modules/
ssh root@VPS "php -l /var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php"
```

---

## 8. Integración con M3U8 Generator

La lista M3U8 generada debe apuntar los canales a `resolve_quality.php`:

```
#EXTINF:-1 tvg-id="canal1" ...,Canal 1
http://iptv-ape.duckdns.org/resolve_quality.php?ch=ID&p=P2&origin=SERVIDOR
```

**NUNCA** apuntar directamente al proveedor:
```
# ❌ INCORRECTO — el pipeline NO se activa
http://line.tivi-ott.net/CANAL

# ✅ CORRECTO — el pipeline SE activa
http://iptv-ape.duckdns.org/resolve_quality.php?ch=ID&p=P2&origin=line.tivi-ott.net
```
