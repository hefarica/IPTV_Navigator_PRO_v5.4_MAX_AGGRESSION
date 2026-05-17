---
description: Auditoría end-to-end del pipeline de procesamiento de canales IPTV, desde el servidor hasta el M3U8 final
---

# Skill: Auditoría End-to-End del Pipeline M3U8

## Propósito

Garantizar que **todos los valores en el M3U8 generado** sean un fiel reflejo de las parametrizaciones del **Gestor de Perfiles APE v9.0** (`ape-profiles-config.js`), sin truncamiento de datos, sin valores hardcodeados que sobreescriban, y con trazabilidad completa.

---

## Arquitectura del Pipeline

```
Servidor IPTV → API (player_api.php) → Frontend (state.activeServers)
                                              ↓
                          Gestor de Perfiles APE v9.0 (ape-profiles-config.js)
                                              ↓
                              APE Profile Bridge v9.1 (profile-bridge-v9.js)
                                    ↓                     ↓
                             [PRIORIDAD 1]          [PRIORIDAD 2]
                          Bridge desde Frontend    Perfiles internos
                          (window.APE_PROFILES_CONFIG)  (PROFILES en generador)
                                    ↓                     ↓
                              getProfileConfig(profileId)
                                              ↓
                              Generador M3U8 Typed Arrays Ultimate
                                              ↓
                    EXTINF → EXTHTTP → EXTVLCOPT → KODIPROP → APE tags → STREAM-INF → URL
```

---

## Fuentes de Verdad (Prioridad)

| Prioridad | Fuente | Archivo | Variable |
|-----------|--------|---------|----------|
| **1** | Gestor de Perfiles APE v9.0 | `ape-profiles-config.js` | `window.APE_PROFILES_CONFIG` |
| **2** | Perfiles internos (fallback) | `m3u8-typed-arrays-ultimate.js` | `PROFILES` (const) |
| ❌ | Config v5 (NO CONECTADO) | `ape-profiles-config-v5.js` | `APE_PROFILES_V5` (nadie lo usa) |

---

## Checklist de Auditoría

### 1. Servidor IPTV → Datos del Canal

```javascript
// Verificar en buildChannelUrl() — línea ~1503
server.baseUrl → cleanBase (sin /player_api.php, sin /)
baseUrl = `${cleanBase}/live/${server.username}/${server.password}/${channel.stream_id}.m3u8`
```

**Verificar:**
- [ ] `server.baseUrl` no está vacío
- [ ] `server.username` y `server.password` no están truncados
- [ ] `channel.stream_id` es numérico y correcto
- [ ] La URL final es válida y accesible

### 2. Asignación de Perfil (determineProfile)

**Verificar:**
- [ ] Canales con `4K`, `UHD` en nombre → perfil correcto según Gestor
- [ ] Canales con `SPORTS` → perfil correcto según Gestor
- [ ] Canales con `FHD`, `HD`, `SD` → perfil correcto
- [ ] Canales sin etiqueta → fallback a P3

### 3. Bridge → Generador (CAMPOS CABLEADOS)

El bridge convierte así (línea 79 de profile-bridge-v9.js):

```javascript
bitrateKbps = Math.round((profile.settings.bitrate || 8) * 1000)
// Gestor P0: bitrate=13.4 → bitrateKbps=13400
// Gestor P1: bitrate=42.9 → bitrateKbps=42900
// Gestor P3: bitrate=3.7  → bitrateKbps=3700
```

**Campos cableados por el bridge (40+):**

| Grupo | Campos |
|-------|--------|
| Básicos | `name, resolution, width, height, fps, bitrate` |
| Buffers | `buffer_ms, network_cache_ms, live_cache_ms, file_cache_ms, player_buffer_ms` |
| VLCOPT | `clock_jitter, clock_synchro` |
| Bandwidth | `max_bandwidth, min_bandwidth, throughput_t1, throughput_t2` |
| Prefetch | `prefetch_segments, prefetch_parallel, prefetch_buffer_target, prefetch_min_bandwidth` |
| Codecs | `codec_primary, codec_fallback, codec_priority` |
| Calidad | `hdr_support, color_depth, audio_channels` |
| HEVC | `hevc_tier, hevc_level, hevc_profile, color_space, chroma_subsampling, transfer_function, matrix_coefficients, compression_level, sharpen_sigma, rate_control, entropy_coding, video_profile, pixel_format` |
| Manifest | `manifest_version, jwt_expiration, multilayer_strategy, matrix_type` |
| Metadata | `headers_count, enabled_categories, strategy, device_class, quality_level` |

### 4. STREAM-INF (Fórmula de Bandwidth)

```javascript
// Línea 1543 del generador
const bandwidth = (cfg.bitrate || 5000) >= 1000000 ? cfg.bitrate : cfg.bitrate * 1000;
const avgBandwidth = Math.round(bandwidth * 0.8);
const resolution = cfg.resolution || '1920x1080';
const fps = cfg.fps || 30;
```

**Tabla de valores esperados (con Gestor v9.0 activo):**

| Perfil | Bitrate Gestor | Bridge kbps | Generador BW | Resolución | FPS |
|--------|---------------|-------------|--------------|------------|-----|
| P0 | 13.4 Mbps | 13400 | 13,400,000 | 3840x2160 | 60 |
| P1 | 42.9 Mbps | 42900 | 42,900,000 | 7680x4320 | 60 |
| P2 | 13.4 Mbps | 13400 | 13,400,000 | 3840x2160 | 60 |
| P3 | 3.7 Mbps | 3700 | 3,700,000 | 1920x1080 | 50 |
| P4 | 2.8 Mbps | 2800 | 2,800,000 | 1280x720 | 60 |
| P5 | 1.5 Mbps | 1500 | 1,500,000 | 854x480 | 25 |

### 5. Headers Exclusivos del Generador (NO vienen del Gestor)

Estos headers son generados internamente por el generador y NO se pierden con el cableado:

| Componente | Cantidad | Fuente |
|-----------|----------|--------|
| APE tags (10 paquetes) | 301 | `build_ape_block()` |
| EXTHTTP | 238 campos | `build_exthttp()` + Gestor |
| EXTVLCOPT | 21 directivas | `generateEXTVLCOPT()` |
| KODIPROP | 6 propiedades | `build_kodiprop()` |
| LCEVC Phase 3 | 9 tags | `build_ape_block()` paquete C |
| JWT | 68 campos | `generateJWT68Fields()` |

### 6. localStorage (⚠️ CUIDADO)

El Gestor carga de localStorage primero:

```javascript
// ape-profiles-config.js, línea 787
this.profiles = this._load() || JSON.parse(JSON.stringify(DEFAULT_PROFILES));
```

**Si el usuario modificó valores en el UI**, esos están en `localStorage['ape_profiles_v9']` y **sobreescriben los defaults**.

**Para limpiar:**
```javascript
localStorage.removeItem('ape_profiles_v9');
```

---

## Problemas Conocidos y Resueltos

### Problema: P1 con valores de 8K (86Mbps) — RESUELTO

**Causa**: El Gestor de Perfiles v9.0 tiene P1 como "8K_SUPREME" con `resolution: 7680x4320`. Los perfiles internos del generador tenían P0 como "8K" y P1 como "4K" (al revés). Además, `localStorage` tenía un `bitrate` personalizado que producía 86Mbps.

**Fix aplicado**: Perfiles internos del generador sincronizados con los defaults del Gestor v9.0.

### Problema: FRAME-RATE=120 en todos los canales — RESUELTO

**Causa**: El perfil interno P0 tenía `fps: 120`. Cuando el bridge no estaba activo, el generador usaba ese valor para todos los canales.

**Fix aplicado**: P0 interno ahora tiene `fps: 60` (como el Gestor).

---

## Verificación Post-Generación

Ejecutar después de cada generación de lista:

```bash
python -c "
import re
p = 'RUTA_AL_M3U8.m3u8'
with open(p, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read(50_000_000)
bw = set(re.findall(r'BANDWIDTH=(\d+)', content))
fps = set(re.findall(r'FRAME-RATE=([0-9.]+)', content))
res = set(re.findall(r'RESOLUTION=([0-9x]+)', content))
print('BW:', {f'{int(v)/1e6:.1f}Mbps' for v in bw})
print('FPS:', fps)
print('RES:', res)
"
```

**Valores esperados (Gestor v9.0 defaults):**

| Métrica | Valores válidos |
|---------|----------------|
| BANDWIDTH | 1.5M, 2.8M, 3.7M, 13.4M, 42.9M |
| FRAME-RATE | 25, 50, 60 |
| RESOLUTION | 854x480, 1280x720, 1920x1080, 3840x2160, 7680x4320 |
