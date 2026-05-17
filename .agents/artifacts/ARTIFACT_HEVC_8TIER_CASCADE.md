# ⚠ SUPERSEDED — ARTIFACT — HEVC 8-TIER CASCADE

> **STATUS: SUPERSEDED 2026-05-17 by `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md`**
> User directive: la cascada definitiva tiene **11 tiers** con 6 niveles 10-bit (incluyendo 720p HDR) antes de bajar a 8-bit.
> Este archivo se preserva per `iptv-omega-no-delete` doctrine pero NO debe usarse como referencia operativa.
> Cross-link: ver `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` para la doctrina vigente.

---

## ARTIFACT — HEVC 8-TIER CASCADE (visual quality doctrine) — SUPERSEDED

**Generated:** 2026-05-17
**Source:** `PROMPT_MAESTRO_INGENIERIA_EXTREMA.md` (lines 56-66) + `CLAUDE.md` codec ladder
**Authority:** S3 (Video Codec Engineer) + S4 (Color Scientist HDR)
**Status:** SUPERSEDED — see header
**Filosofía:** **Agotar 10-bit antes de tocar H.264**

---

## 1. Filosofía cardinal

> No se sacrifica color por resolución. No se sacrifica color por FPS.
> Cuando hay que bajar, se baja **resolución / FPS primero**, manteniendo **HEVC 10-bit** hasta el último tier disponible.
> Solo cuando todos los HEVC fallan (8-bit incluso), se cae a `avc1.640028` (H.264 High L4.0).

Este modelo difiere de muchas implementaciones que tratan "1080p 8-bit > 720p 10-bit". Aquí: **720p 10-bit > 1080p 8-bit** porque el bit-depth se traduce directamente en gradiente, evita banding en cielos/skin tones, y mantiene compatibilidad HDR latente.

---

## 2. La cascada (8 tiers — formato codec string oficial RFC 6381)

| Tier | Codec string | Profile | Level | Bit depth | Target resolution/fps | HDR | Score |
|---|---|---|---|---|---|---|---|
| **T1** | `hvc1.2.4.L153.B0` | Main10 | 5.1 | 10 | **4K (3840×2160) @ 60fps** | HDR10 if probed | **100 (CORONA)** |
| **T2** | `hvc1.2.4.L150.B0` | Main10 | 5.0 | 10 | 4K @ 30fps | HDR10 if probed | 96 |
| **T3** | `hvc1.2.4.L120.B0` | Main10 | 4.0 | 10 | 1080p @ 30fps | HDR-capable | 94 |
| **T4** | `hvc1.1.6.L153.B0` | Main | 5.1 | 8 | 4K @ 60fps | SDR | 82 |
| **T5** | `hvc1.1.6.L150.B0` | Main | 5.0 | 8 | 4K @ 30fps | SDR | 80 |
| **T6** | `hvc1.1.6.L120.B0` | Main | 4.0 | 8 | 1080p @ 30fps | SDR | 78 |
| **T7** | `hvc1.1.6.L93.B0` | Main | 3.1 | 8 | **720p @ 30fps** (último HEVC) | SDR | 70 |
| **T8** | `avc1.640028` | High | 4.0 | 8 | 1080p | SDR (H.264) | 55 |

### Reglas inmutables (per `CLAUDE.md`)
- **L153** = Level 5.1 (NO es 12-bit, NO es Main12)
- **Profile .2** = Main10 (10-bit)
- **Profile .1** = Main (8-bit)
- **Profile .4** = Main12 (12-bit) — no incluido en cascada estándar
- `.B0` = constraint flags trailing (presente en todas las variantes)

---

## 3. Tier downgrade decision tree

```
                  ┌─────────────────────────────┐
                  │  Probe / capability evidence │
                  └────────────┬─────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │ T1 hvc1.2.4.L153.B0 (4K60 HDR)  │
              └────────────────┬────────────────┘
                  10-bit fail? │
                  ┌────No──────┴─────Yes────┐
                  ↓                          ↓
              T2/T3 mantener Main10     T4 hvc1.1.6.L153.B0 (4K60 SDR)
              (bajar fps/res)               │ 8-bit 4K60 fail?
                  │                         ↓
                  │                    T5/T6 hvc1.1.6 (4K30 / 1080p)
                  │                         │
                  │                         ↓
                  │                    T7 hvc1.1.6.L93.B0 (720p HEVC último)
                  │                         │
                  │                         ↓
                  └─────────────→     T8 avc1.640028 (H.264 fallback final)
```

**Regla:** entre T3 (Main10 1080p) y T4 (Main 4K60 SDR), preferir **T3** porque preserva 10-bit.

---

## 4. Bitrate floor por tier (per `CLAUDE.md` doctrine)

| Tier | Codec | Resolution | BANDWIDTH (bps) | AVERAGE-BANDWIDTH (bps) |
|---|---|---|---|---|
| T1 | HEVC Main10 | 3840×2160 @ 60 | 28,000,000 | 22,000,000 |
| T2 | HEVC Main10 | 3840×2160 @ 30 | 22,000,000 | 18,000,000 |
| T3 | HEVC Main10 | 1920×1080 @ 30 | 12,000,000 | 9,000,000 |
| T4 | HEVC Main 8-bit | 3840×2160 @ 60 | 18,000,000 | 14,000,000 |
| T5 | HEVC Main 8-bit | 3840×2160 @ 30 | 14,000,000 | 10,000,000 |
| T6 | HEVC Main 8-bit | 1920×1080 @ 30 | 9,000,000 | 6,500,000 |
| T7 | HEVC Main 8-bit | 1280×720 @ 30 | 5,500,000 | 4,000,000 |
| T8 | AVC High | 1920×1080 | 9,000,000 | 6,500,000 |

Si `bitrate_real < 0.7 × BANDWIDTH` declarado → mark **`is_fake_<tier>`** y degradar al tier inferior.

---

## 5. Cross-reference con APE Fallback Resolver F0-F5

**Importante:** 8-tier ≠ F0-F5. Son ortogonales.

| Eje | Definición |
|---|---|
| **8-tier (este artifact)** | Codec ladder estático · pertenece al CONTENIDO emitido por canal |
| **F0-F5 (`ape-fallback-resolver.js`)** | Per-channel state machine basado en probe confidence · pertenece al PROCESO de resolución |

| F-tier | Cuándo se aplica | Tier típico esperado |
|---|---|---|
| F0 REAL_VERIFIED_MAX | probe confidence ≥85, 0 contradicciones | T1 (si 4K HDR) |
| F1 REAL_PARTIAL_MAX | probe confidence ≥60, ≤1 contradicción | T2-T3 |
| F2 HEVC_PREMIUM_HINT | probe falla pero canal premium | T3 (Main10 1080p PREFERRED) |
| F3 HEVC_SAFE_1080P | sin info clara, probable FHD/HD | T6 (Main 8-bit 1080p) |
| F4 AVC_HIGH_SAFE | sin evidencia HEVC ni premium | T8 (`avc1.640028`) |
| F5 ORIGINAL_DIRECT_SAFE | última línea defensa | (sin STREAM-INF — solo EXTINF + URL) |

---

## 6. Reglas honestas (CRÍTICO — no maquillar)

Per `CLAUDE.md` sección "Reglas Honestas":

| Campo | Solo emitir si... |
|---|---|
| `VIDEO-RANGE=PQ\|HLG` | Probe detectó `VIDEO-RANGE` real en el manifest del proveedor |
| `SUPPLEMENTAL-CODECS` | Probe encontró real con `dvh1`/`dvhe` |
| `HDCP-LEVEL` | Probe encontró HDCP real (**NUNCA hardcodear `TYPE-1`** — ver §7) |
| Tier 1-3 (Main10) "verified" | Probe confirmó profile/level real en stream |

Para tiers preferred (sin evidencia 100%):
- Emitir como `#EXT-X-APE-CODEC-PREFERRED:<codec>` (custom tag)
- NO como `CODECS=` real en STREAM-INF si no hay evidencia

---

## 7. HDCP-LEVEL=TYPE-1 — política

El master prompt (`PROMPT_MAESTRO_INGENIERIA_EXTREMA.md` §10) sugiere `HDCP-LEVEL=TYPE-1` para forzar decoder hardware.

`CLAUDE.md` doctrina actual (sección "Reglas Honestas" → "PROHIBIDO hardcoded eliminado"):
```
HDCP-LEVEL="TYPE-1"              ← ELIMINADO (rompe players que evalúan HDCP)
```

**Política reconciliada (este artifact):**
- ❌ NO emitir `HDCP-LEVEL=TYPE-1` por defecto
- ✅ Emitir SOLO si:
  - El probe confirmó que el provider declara HDCP real, **O**
  - El player target tiene Widevine L1 confirmado y se ha medido (no asumido) que `TYPE-1` mejora startup time
- ⚠ Si se emite, marcar con `#EXT-X-APE-HDCP-VERIFIED:probed-by-<source>` como evidence trail
- 📋 Documentar caso por caso en `audit-report.md` del canal afectado

Esta política implementa el espíritu del master prompt (HW decoder forzado cuando aplica) sin violar la doctrina honesta del proyecto.

---

## 8. STABLE-VARIANT-ID (anti-yoyo ABR)

Per master prompt §10:
- `STABLE-VARIANT-ID="<id>"` evita que ExoPlayer/hls.js cambien de variant innecesariamente
- ID debe ser estable across reloads del manifest
- Formato sugerido: `"ape-<tier>-<resolution>-<codec_hash>"` (e.g. `"ape-t3-1080p30-hvc124L120"`)
- Inmutable durante una sesión del canal

---

## 9. Validation gates antes de emitir un tier

```python
def can_emit_tier(channel, tier):
    if tier in [T1, T2, T3]:
        # Main10 — needs 10-bit evidence
        if not channel.probe.confirmed_bit_depth_10:
            return False  # preferred, not verified
    if tier == T1 or tier == T4:
        # 4K @ 60fps — high resource
        if channel.bitrate_real < 14_000_000:
            return False  # fake-4K
    if channel.declared_hdr and not channel.probe.video_range_pq_or_hlg:
        return False  # fake HDR — block HDR-tier
    return True
```

---

## 10. Test matrix (smoke per tier — antes de production)

| Tier | Test channel ideal | Player target | Pass criteria |
|---|---|---|---|
| T1 | ESPN 4K HDR live | OTT Nav Fire TV 4K Max | < 2s startup, no freeze 5min, HDR10 confirmed in EDID |
| T2 | Premium 4K SDR live | OTT Nav Fire TV 4K | < 2s, bitrate observed ≥ 14 Mbps |
| T3 | 1080p HEVC channel | TiviMate Onn 4K | < 2s, no banding visible |
| T4 | 4K SDR HEVC (rare) | OTT Nav Fire TV 4K | < 2s, bitrate ≥ 12 Mbps |
| T5-T6 | 1080p 8-bit HEVC | TiviMate Fire TV Stick 1080p | < 2s |
| T7 | 720p HEVC fallback | Cualquier Android TV | < 3s |
| T8 | H.264 1080p | Universal (incluye hls.js browser) | < 3s |

Si un tier falla, NO subir, sino DEGRADAR al tier inferior y republicar.

---

## 11. Anti-patterns prohibidos

- ❌ Declarar T1 con bitrate < 14 Mbps (fake-4K obvious)
- ❌ Declarar HDR sin VIDEO-RANGE=PQ/HLG probado
- ❌ Mezclar T1 + T8 en el mismo manifest sin separar variants (causa ABR confusion)
- ❌ Saltar de T3 a T8 directamente (debe pasar por T4/T5/T6/T7 si HEVC capability existe)
- ❌ Emitir AVERAGE-BANDWIDTH > BANDWIDTH (matemática inválida per RFC)
- ❌ Emitir `HDCP-LEVEL=TYPE-1` hardcoded (per §7)

---

## 12. Cross-references

- Master prompt: `PROMPT_MAESTRO_INGENIERIA_EXTREMA.md` §"CASCADA HEVC-FIRST (8 TIERS)"
- Doctrina: `CLAUDE.md` "Codec Ladder" + "Correcciones técnicas inmutables"
- Implementación: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-fallback-resolver.js`
- Bitrate fallback: `CLAUDE.md` "Bitrate Fallback por Resolución"
- Skill anchor: `.agents/skills/codec-quality-analyzer/SKILL.md` (S3)
- Skill anchor HDR: `.agents/skills/color-scientist-hdr/SKILL.md` (S4)

---

**Fin HEVC 8-Tier Cascade.**
