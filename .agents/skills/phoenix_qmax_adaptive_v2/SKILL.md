---
name: phoenix_qmax_adaptive_v2
description: "Protocolo PHOENIX-QMAX-ADAPTIVE v2.0 para maximización de calidad perceptual en listas M3U8. Implementa Greedy Best-Available Selection: Request 8K → Accept Best Available → Never Downgrade. Cubre: Quality Tier Scoring, Anti-Downgrade Rules, Adaptive Buffer Escalation 1GB, MPQF v2.0 Scoring con Selection Efficiency, y URL rewriting con quality=max."
---

# 🧠 PHOENIX-QMAX-ADAPTIVE v2.0 — Greedy Best-Available Selection

**Codename:** PHOENIX-QMAX-ADAPTIVE  
**Versión:** 2.0  
**Motor:** `m3u8-quality-upgrader-v2.js`  
**Filosofía:** *"Request the stars, accept the sky."*

## 1️⃣ Cambio Central vs v1.0

| Aspecto | v1.0 (HARDCODED) | v2.0 (ADAPTIVE) |
|---------|-------------------|-----------------|
| Quality Header | `bitrate-60000` | `bitrate-max,resolution-max,never-downgrade` |
| URL Params | `&quality=8K&bitrate=60000` | `&quality=max&resolution=max&never-downgrade=true` |
| Network-Caching | 45000 (45s) | **60000 (60s)** |
| Buffer-Size | 750000 (750MB) | **1000000 (1GB)** |
| Read-Buffer | 16384 (16KB) | **32768 (32KB)** |
| Prebuffer | — | **30 seconds** |
| STREAM-INF extras | — | `#EXT-X-APE-GREEDY-SELECTION:ENABLED` |
| MPQF weight F | — | **Selection Efficiency (0.05)** |

## 2️⃣ GREEDY SELECTION CASCADE

```
IF server has 8K     → SELECT 8K     (Score: 1000)
IF server has 4K     → SELECT 4K     (Score: 800)
IF server has QHD    → SELECT QHD    (Score: 600)
IF server has FHD    → SELECT FHD    (Score: 400)
IF server has HD     → SELECT HD     (Score: 200)
IF only SD           → SELECT SD     (Score: 100)

BONUSES:
  HDR available:  +20% al score
  60fps:          +10% al score
  HEVC:           +15% al score
```

## 3️⃣ ANTI-DOWNGRADE RULES (CRÍTICAS)

> ⚠️ **REGLA 1:** Si existe variante 4K, seleccionar 1080p = **FALLO**
> ⚠️ **REGLA 2:** Si existe variante 1080p, seleccionar 720p = **FALLO**
> ⚠️ **REGLA 3:** Si existe variante 720p, seleccionar SD = **FALLO**

Estas reglas **ANULAN**:
- Suposiciones de velocidad de red
- Suposiciones de capacidad del dispositivo
- Comportamiento por defecto del player

## 4️⃣ Headers Optimizados

### X-Quality-Preference (Greedy)

```
"X-Quality-Preference":
  "codec-hevc,codec-av1,
   profile-main-10,profile-main,
   resolution-max,
   bitrate-max,
   hdr-dv,hdr-hdr10+,hdr-hdr10,hdr-hlg,
   fps-max,
   quality-tier-s-first,
   fallback-tier-a,
   never-downgrade,
   select-best-available"
```

### URL Parameters (Greedy)

```
&quality=max
&resolution=max
&bitrate=max
&hdr=max
&fps=max
&codec=hevc,av1
&tier=s,a,b,c,d
&prefer-highest=true
&never-downgrade=true
&fallback=4K,fallback=1080p,fallback=720p
```

### Buffer Architecture (8K-class)

```
"X-Network-Caching": "60000"    ← 60 seconds
"X-Buffer-Size": "1000000"      ← 1 GB
"X-Read-Buffer": "32768"        ← 32 KB chunks
"X-Live-Caching": "5000"        ← 5 seconds
"X-Prebuffer": "30"             ← 30 seconds
```

## 5️⃣ MPQF v2.0 Score Formula

```
MPQF = (A × 0.30) + (B × 0.20) + (C × 0.20) + (D × 0.15) + (E × 0.10) + (F × 0.05)

A = Resolution Score     (8K=100, 4K=80, QHD=60, FHD=40, HD=20, SD=10)
B = Bitrate Density      (bpp / 0.20 × 100, capped at 100)
C = Codec Efficiency     (HEVC Main10=95, AV1=92, AVC=70)
D = Color Volume         (DV+12bit+BT2020=100, HDR10=90, SDR=50)
E = Temporal Stability   (60fps=100, 50fps=90, 30fps=70)
F = Selection Efficiency (Best available=100, 2nd=60, 3rd+=30)

BONUS:  +5 if Selected = Best Available
PENALTY: -20 if Selected < Best Available
```

| Rango | Tier |
|-------|------|
| 90-100 | REFERENCE (visually lossless) |
| 80-89 | EXCELLENT |
| 70-79 | VERY GOOD |
| 60-69 | GOOD |
| 50-59 | FAIR |
| <50 | POOR |

## 6️⃣ Ejecución

### CLI

```bash
node m3u8-quality-upgrader-v2.js input.m3u8 output.m3u8
```

### Browser

```js
const upgrader = new M3U8QualityUpgraderV2();
const result = upgrader.upgrade(m3u8String);
// result.content = upgraded M3U8
// result.stats = { channelsProcessed, urlsRewritten, headersUpgraded, ... }
```

### Verificación (16 checks)

```js
const result = verifyUpgradeV2(content);
// Checks: quality=max, never-downgrade, 60s cache, 1GB buffer,
//         STREAM-INF, QMAX-ADAPTIVE version, VMAF-MAXIMIZATION, etc.
```

## 7️⃣ Directivas Globales Inyectadas

```
#EXT-X-APE-QMAX-VERSION:2.0-ADAPTIVE
#EXT-X-APE-QMAX-STRATEGY:GREEDY-BEST-AVAILABLE
#EXT-X-APE-QMAX-ANTI-DOWNGRADE:ENFORCED
#EXT-X-APE-QMAX-TIER-CASCADE:S>A>A->B>C>D
#EXT-X-APE-QMAX-SELECTION-RULE:IF-4K-EXISTS-1080P-FORBIDDEN
#EXT-X-APE-QMAX-BUFFER-CLASS:8K-ADAPTIVE-1GB
#EXT-X-APE-PERCEPTUAL-OPTIMIZATION:VMAF-MAXIMIZATION-ENABLED
#EXT-X-APE-BANDWIDTH-SAFETY-MARGIN:0.30
```
