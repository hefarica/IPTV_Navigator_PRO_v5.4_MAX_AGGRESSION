---
name: sniper_mode_v31_8gaps
description: APE Sniper Mode v3.1 ULTIMATE — 8 GAPs implementation that brings the system from 99% to 100%. Covers zscale+tonemap, resolution-adaptive denoise, afftdn, Stream Validator integration, and all protected parameter rules.
---

# Skill: Sniper Mode v3.1 ULTIMATE — 8 GAPs

## Arquitectura

```
rq_sniper_mode.php (1,686 líneas, 17 funciones)
├── Módulo 1:  Fast Start Engine (line ~159)
├── Módulo 2:  Active Channel Detector (line ~194)
├── Módulo 3:  ACRP State Machine — 5 estados (line ~320)
├── Módulo 4:  ACRP Transition (line ~380)
├── Módulo 5:  CDP Cut Detection (line ~448)
├── Módulo 6:  PDS Degradation Shield (line ~500)
├── Módulo 7:  Error Handler (line ~548)
├── Módulo 8:  Recovery Playlist (line ~582)
├── Módulo 9:  Parallel Reconnect Race (line ~631)
├── Módulo 10: FFmpeg Pipeline Engine ← GAPs 2,3,4 (line ~666)
├── Módulo 11: Image Enhancement (line ~763)
├── Módulo 12: KODIPROP Engine (line ~1156)
├── Módulo 13: GPU Acceleration (line ~1201)
├── Módulo 14: Resource Allocator (line ~1247)
├── Módulo 15: Integrate (RIS Bridge) ← GAPs 1,6,7,8 (line ~1439)
├── Módulo 16: Idle Helper (line ~263)
└── Módulo 17: Count Streaming (line ~278)
```

## Los 8 GAPs Implementados

### GAP 1: Stream Validator Integration (CRÍTICO)
- **Función:** `ape_sniper_stream_guard()` llamado en `rq_sniper_integrate()`
- **Condición:** Solo si `$origin` empieza con `http` Y `function_exists('ape_sniper_stream_guard')`
- **Backward-safe:** Si `ape_stream_validator_proxy.php` no existe, se salta sin error
- **Require:** `file_exists(__DIR__ . '/ape_stream_validator_proxy.php')` antes de `require_once`

### GAP 2: zscale + tonemap=hable
- **Filtro:** `zscale=t=linear:p=bt709,tonemap=hable:desat=0,zscale=t=bt709`
- **Ubicación:** STEP 5 del FFmpeg pipeline, entre UNSHARP y MINTERPOLATE
- **Condición:** Solo si ACRP ≠ RECONNECTING y ≠ CUT_DETECTED (evitar overhead en recovery)

### GAP 3: Denoise Adaptativo por Resolución
- **Parámetro nuevo:** `$resolution_hint` en `rq_sniper_ffmpeg_pipeline()`
- **4K/8K:** Denoise OFF (Parámetro Protegido #4). Solo `hqdn3d=2:1:3:2` en recovery activo
- **SD/HD:** `hqdn3d` + `afftdn` cascada completa
- **Unknown:** Lógica ACRP pura (backward-compatible)
- **Detección en integrate():**
  - SNIPER activo → `4k`
  - Profile contiene NUCLEAR/4K/FHD → `4k`
  - Profile contiene HD → `hd`
  - Profile contiene SD → `sd`

### GAP 4: afftdn=nf=-20
- **Filtro:** `afftdn=nf=-20` (FFT Denoiser, dominio frecuencia)
- **Solo para:** SD/HD. **NUNCA** para 4K/8K
- **Complementa:** hqdn3d (dominio espacial-temporal)

### GAP 6: JSON Command Metadata
- Campos nuevos en `modules_active`:
  - `stream_validator_proxy` → bool
  - `stream_guard_status` → string (OK, NEEDS_PROXY, REPAIRED)
  - `stream_guard_method` → string (direct, proxy, extract)

### GAP 7: HTTP Headers Stream Guard
- `X-APE-Stream-Guard: NEEDS_PROXY|REPAIRED`
- `X-APE-Stream-Guard-Method: direct|proxy|extract`

### GAP 8: Prefetch Auto-Scale bajo Proxy
- Proxy activo → prefetch × 1.3, buffer × 1.15
- Compensa latencia VPS intermedio (~50-100ms)

## Pipeline FFmpeg Completo (v3.1)

```
INPUT → BWDIF(1) → HQDN3D/afftdn(SD/HD) → EQ(bt2020) → CAS(0.7)+UNSHARP(0.8) → ZSCALE+TONEMAP(hable) → MINTERPOLATE(120fps) → OUTPUT
```

## 10 Parámetros Protegidos (NUNCA MODIFICAR)

| # | Parámetro | Valor | Grep |
|---|-----------|-------|------|
| 1 | Deinterlace | `bwdif=1` | `grep 'bwdif=1'` |
| 2 | Sharpness | `cas=0.7` + `unsharp=5:5:0.8` | `grep 'cas=0.7'` |
| 3 | AI-SR | `level-low,psf-aware` | `grep 'level-low'` |
| 4 | Denoise 4K | OFF | Verificar que no hay hqdn3d para 4k STABLE |
| 5 | ALLM | `false` | `grep 'ALLM.*false'` |
| 6 | Audio | eARC | `grep 'eARC'` |
| 7 | Upscaling | TV native first | `grep 'tv-native'` |
| 8 | Color Temp | WARM | `grep 'WARM'` |
| 9 | Contrast | `1.0` | `grep 'contrast=1.0'` |
| 10 | Saturación | `0.65` (65%) | `grep 'saturation=0.65'` |

## Verificación Post-Deploy

```bash
# 1. Syntax check
php -l /var/www/html/iptv-ape/rq_sniper_mode.php

# 2. Function count (debe ser 17)
grep -c '^function ' /var/www/html/iptv-ape/rq_sniper_mode.php

# 3. Protected params (debe ser ≥11 matches)
grep -c 'bwdif=1\|cas=0.7\|unsharp=5:5:0.8\|contrast=1.0\|saturation=0.65\|ALLM.*false' /var/www/html/iptv-ape/rq_sniper_mode.php

# 4. New features present (debe ser ≥20)
grep -c 'zscale\|afftdn\|resolution_hint\|stream_guard\|Stream-Guard' /var/www/html/iptv-ape/rq_sniper_mode.php

# 5. Curl test
curl -sk 'https://localhost/iptv-ape/resolve_quality.php?ch=12&srv=TOKEN' \
  -o /dev/null -w '%{http_code} %{content_type}\n'
# Esperado: 200 application/vnd.apple.mpegurl; charset=utf-8

# 6. Restart
systemctl restart php8.3-fpm
```

## Reglas de Implementación

1. **R5:** Sintaxis PHP 7.4+ — sin named arguments, sin `match`, sin `?->`
2. **R6:** `LOCK_EX` en todas las escrituras a archivos de estado
3. **R9:** Backward-compatible — usar `function_exists()` para módulos opcionales
4. **R10:** Comentarios en español
