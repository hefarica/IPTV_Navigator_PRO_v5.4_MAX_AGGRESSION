# Alineación producción + manifiesto al piso Main10

- **Timestamp:** 2026-06-11T05:29:57Z
- **Petición:** alinear el manifiesto OMEGA y el LAB→JSON→lista de producción al piso codec Main10 (`hvc1.2.*`).
- **Método:** cortex-init (5-layer) → audit workflow (6 agentes, ground-truth exacto) → pre-edit-audit por archivo → ediciones verificadas.

## Hallazgo cardinal: la migración YA estaba en curso

`ape-hevc-cascade.js` (SSOT del generador) **ya era Main10 puro** desde el mandato HFRC 2026-05-22 (13 tiers `hvc1.2.4.L30…L186`). Y había una **migración in-flight sin commitear** (otro agente, per COORDINATION.md) que ya convirtió los ladders `video`/`codec_chain_video` de `hvc1.1.6.*` (Main 8-bit) → `hvc1.2.4.*` (Main10) en el backend JSON y `ape-profiles-config.js`. El pre-edit-audit lo detectó; no se pisó nada.

## Lo que faltaba y se aplicó (3 ediciones, aditivas, sin conflicto)

| # | Archivo | Línea | Antes | Después | Verificación |
|---|---|---|---|---|---|
| 1 | `backend/APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` | 707 (P3 header) | `avc1.640028,mp4a.40.2` | `hvc1.2.4.L123.B0,mp4a.40.2` | P3=1080p@**60** ⇒ **L123** (L120 a 60fps = under-declare = freeze; el plan lo cazó) |
| 2 | idem | 885 (P4 header) | `avc1.4d401f,mp4a.40.2` | `hvc1.2.4.L93.B0,mp4a.40.2` | P4=720p@30 ⇒ L93 ✓ |
| 3 | `frontend/js/ape-v9/ape-profiles-config.js` | 41 (SESSION-DATA) | `preferredCodecs:[dvh1,hvc1.2,hvc1.1,av01,avc1]` | `[dvh1,hvc1.2,av01,avc1]` | strip Main 8-bit del floor de preferencia (metadata, RFC 8216 §6.3.1 inerte) |

**Validación:** `node -c ape-profiles-config.js` ×3 Exit 0; backend JSON `JSON.parse` válido; 0 refs `hvc1.1` restantes; P5 failsafe intacto.

## Manifiesto skill alineado (petición explícita)

`iptv-omega-working-flow-manifesto` SKILL.md + `references/02-codec-ladder.md`: tabla del ladder reescrita al piso Main10 (P3→L123@60, P4→L93, P2→L153@60) preservando el **baseline histórico 2026-06-07** como nota, P1=AV1 por diseño, y P5=failsafe AVC. La doctrina rich-idata recibió la advertencia de fps (P3 prod @60 ⇒ L123, no L120).

## Decisiones del council respetadas (NO migradas a la fuerza)

- **P1** (8K@120) = `av01.0.15M.10` (AV1) — ningún nivel HEVC alcanza 8K@120 en HW real; aplanarlo = el freeze documentado. Intacto.
- **P5** (480p SD) header = `avc1.42c01e` (AVC primary) — es el failsafe SD universal; forzar Main10 primary arriesga pantalla negra en el device más débil (council BLOCK). Su ladder Main10 (`hvc1.2.4.L90.B0`) ya está disponible como upgrade oportunista. **Mantuve AVC primary por seguridad; revertible a Main10 si el usuario lo exige.**

## Flags abiertos (no auto-cambiados)

1. **Excel LAB SSOT (crítico para persistencia):** `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` es el SSOT que re-exporta el JSON. **Sin espejar el cambio ahí, el próximo `btnGenerateAudited`/Import-LAB revierte las 3 ediciones.** Celdas: P3 header→`hvc1.2.4.L123.B0`, P4 header→`hvc1.2.4.L93.B0`, ladders P3/P4 a Main10, strip `hvc1.1` del codec_preferences. Requiere `iptv-excel-safe-mode` (LAB aparece cerrado, sin lock file). **Pendiente de ejecutar.**
2. **P2 (line 529)** `hvc1.2.4.L150.B0` @ 4K@60 vs P1 `L153` @ 4K@60 — ambos válidos por spec estricto (L150 MaxLumaSr 534M ≥ 4K@60 497M); inconsistencia menor de señalización, NO freeze. Dejado as-is.
3. **Multi-agente:** migración in-flight de otro agente en estos archivos (COORDINATION.md). Mis ediciones son aditivas (líneas distintas). Alinear antes del commit.
4. **VPS** (`visual_profiles.json`, `ape_codec_cascade.lua`, `ape_profiles.php`): audit-only (`iptv-vps-touch-nothing`); ya Main10-compliant P0-P3/T1-T13 con AVC intencional P4-P5. Sin cambio.
5. **Audio ec-3** en P0/P1 headers — `feedback_audio_no_atmos_ec3` marca ec-3 problemático. Pre-existente, fuera de scope codec.

## Estado: runtime emisión + manifiesto = Main10 floor. Falta el espejo LAB Excel para persistencia.
