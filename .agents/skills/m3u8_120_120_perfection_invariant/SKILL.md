---
name: M3U8 120/120 Perfection Invariant
description: "Reglas absolutas e inalterables para la generación de listas M3U8 con puntuación perfecta. Alineado al estándar OMEGA CRYSTAL V5 (796 líneas/canal, 10 capas L0-L10). Viola cualquiera de estas reglas y la lista se degrada."
---

# M3U8 OMEGA CRYSTAL V5 — Perfection Invariant (120/120)

> **Actualizado 2026-04-07**: Alineado a la arquitectura OMEGA CRYSTAL V5 (796 líneas, 10 capas L0-L10).

## Historial de Regresiones (Lecciones Aprendidas)

| Lista | Score | Causa de Regresión |
|-------|-------|-------------------|
| L2 | 70 | URL movida a 447 líneas del EXTINF |
| L3 | 90 | Todos los canales forzados a P0 |
| L6 | 105 | `btoa()` truncó OVERFLOW B64 + LCEVC-BASE-CODEC hardcodeado |
| L9 | 50 | Refactorización eliminó 6 módulos + reordenó el bloque |
| L13 | 38 | Regresión de credenciales (módulos fragmentados) |

> [!CAUTION]
> **REGLA SUPREMA: NUNCA fragmentar `generateChannelEntry` en módulos separados.**
> Las regresiones L9 y L13 fueron causadas por modularización fragmentada que desestabilizó el conteo de líneas.
> La arquitectura OMEGA CRYSTAL V5 usa un bloque MONOLÍTICO de 796 líneas — indivisible.

---

## Estructura Invariante del Bloque de Canal (10 Capas)

Cada canal tiene exactamente **796 líneas**, en este orden exacto. **NO reordenar.**

```
L0  (2 líneas)   #EXTINF + #EXT-X-STREAM-INF         ← Identidad HLS
L1  (110 líneas)  #EXTVLCOPT × 110                    ← Esclavización VLC/ExoPlayer
L2  (1 línea)     #EXTHTTP:{...JSON colosal...}       ← Payload para Resolver PHP
L3  (65 líneas)   #KODIPROP × 65                      ← Kodi ISA binding
L4  (25 líneas)   #EXT-X-CMAF × 25                    ← Pipeline fMP4/CMAF
L5  (45 líneas)   #EXT-X-APE-HDR-DV × 45              ← Override HDR10+/DV 5000 nits
L6  (10 líneas)   #EXT-X-APE-TELCHEMY × 10            ← Telemetría QoS/QoE
L7  (53 líneas)   #EXTATTRFROMURL × 53                ← Puente L2↔L7
L8  (470 líneas)  #EXT-X-APE-* × 470 (23 secciones)  ← Núcleo Crystal
L9  (13 líneas)   #EXT-X-PHANTOM-HYDRA × 13           ← Evasión ISP
L10 (5 líneas)    #EXT-X-MEDIA + I-FRAME + STREAM-INF + URL  ← 1 URL única (SIN URI= en MEDIA/I-FRAME)
─── TOTAL: 796 líneas ─────────────────────────────────
```

---

## Las 10 Capas Obligatorias

| # | Capa | Líneas | Verificación |
|---|------|--------|-------------|
| L0 | Identidad HLS | 2 | EXTINF + STREAM-INF con BANDWIDTH, RESOLUTION, CODECS, FRAME-RATE |
| L1 | EXTVLCOPT | 110 | 12 subsecciones: red, video-filter, hw-dec, codec, audio, ABR, resilience, deinterlace, HDR, red avanzada, subtítulos, reproducción |
| L2 | EXTHTTP JSON | 1 | JSON con sid, nonce, quality_levels, resilience, isp_evasion, ai_pipeline |
| L3 | KODIPROP | 65 | Manifest, hw-decode, HDR/BT.2020, audio Atmos/DTS, DRM, VRR, user-agent |
| L4 | EXT-X-CMAF | 25 | fMP4, LATENCY=ZERO, 7 fallback levels, HDR, audio |
| L5 | EXT-X-APE-HDR-DV | 45 | Peak luminance, LCEVC Phase 4, AI SR, mastering display, tone-mapping |
| L6 | EXT-X-APE-TELCHEMY | 10 | VSTQ, EPSNR, MOS, JITTER, LOSS, VMAF, PSNR, SSIM |
| L7 | EXTATTRFROMURL | 53 | 7 subsecciones: identidad, codec, evasión, DRM, transporte, caché, ABR |
| L8 | EXT-X-APE-* | 470 | 23 secciones × ~20 líneas (Buffer Nuclear, BBR, QoS, Phantom, Codec...) |
| L9 | EXT-X-PHANTOM-HYDRA | 13 | 5 UAs, 3 DNS, SNI front, HTTPS mimicry, Sandvine bypass |
| L10 | EXT-X-MEDIA + I-FRAME + STREAM-INF + URL | 5 | Audio metadata (SIN URI=), I-Frame (SIN URI=), 1 STREAM-INF + 1 URL. FIX 2026-04-17. |

---

## Fix LCEVC-BASE-CODEC (Bug Histórico)

```javascript
// ❌ PROHIBIDO — Causa mismatch AV1/HEVC
const lcevcBaseCodec = 'AV1';

// ✅ OBLIGATORIO — Evaluación dinámica
const c_str = channel.codecs || channel.codec || '';
const lcevcBaseCodec = c_str.includes('av01') && !c_str.includes('hev1') ? 'AV1' : 'HEVC';
```

---

## 3 Reglas Anti-Regresión

### Regla 1 — MONOLÍTICO: No fragmentar en módulos

```javascript
// ❌ PROHIBIDO — Causa fluctuación de líneas
function build_kodiprop(ch) { ... } // variable output
function build_ape_block(ch) { ... } // variable output

// ✅ OBLIGATORIO — Bloque atómico 796 líneas
function generateChannelEntry(ch, index, profile, creds) {
    const lines = [];
    // L0: 2 líneas (siempre)
    // L1: 110 líneas (siempre)
    // ... L2-L10 (siempre)
    // Verificación: lines.length === 796
    return lines.join('\n');
}
```

### Regla 2 — IDENTIDAD DUAL (Polimorfismo + Idempotencia)

```javascript
// _nonce796 → cambia cada descarga → evasión DPI
const _nonce796 = generateRandomString(8);
// _sid796 → NUNCA cambia → cache key del Resolver PHP
const _sid796 = FNV32(ch.id + 'OMEGA_STATIC_SEED_V5').slice(0, 16);
```

### Regla 3 — REDUNDANCIA DELIBERADA (No eliminar "duplicados")

La misma directiva aparece en EXTVLCOPT (L1), KODIPROP (L3), EXTHTTP (L2) y EXT-X-APE (L8).
Esto es **intencional** — cada reproductor lee de una capa diferente.
**NUNCA optimizar eliminando "redundancia".**

---

## Validación Pre-Exportación (Runtime)

El generador incluye validación automática (línea ~6490 del JS):

```javascript
const _omega_count = lines.length;
if (_omega_count !== 796) {
    console.warn(`[OMEGA-796] Canal ${name}: ${_omega_count} lineas (esperadas 796). Delta=${_omega_count-796}`);
}
```

Si el delta es ≠ 0, la lista se considera **FAIL** y debe investigarse.
