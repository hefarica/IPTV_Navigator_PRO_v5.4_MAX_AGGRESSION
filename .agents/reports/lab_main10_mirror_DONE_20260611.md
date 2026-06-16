# LAB Excel → Main10 mirror — COMPLETADO + export generado y validado

- **Fecha:** 2026-06-11
- **Petición:** "USA EL EXCEL Y GENERA LOS ARCHIVOS... MAPEA COMO ESTÁ ANTES DE CUALQUIER MODIFICACIÓN... QUIRÚRGICO... GARANTIZA QUE NO DAÑES NADA."
- **SSOT:** `C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm`

## Disciplina aplicada (safe-mode)

1. **Backup ANTES de tocar:** `APE_M3U8_LAB_v8_FIXED.xlsm.bak_20260611_014149` (3,582,471 bytes).
2. **Mapa completo ANTES de modificar:** `.agents/reports/lab_codec_BEFORE_map.txt` (todas las filas de codec de `6_NIVEL_2_PROFILES`, marcando cuáles exportan).
3. **VBA descifrado (oletools):** el export `Brain_ExportToFrontend` lee `6_NIVEL_2_PROFILES` cols B-G = P0-P5, solo filas con prefijo de sección (`settings.`/`headerOverrides.`/etc.), y escribe `Downloads\LAB_CALIBRATED_<ts>.json`. Filas sin prefijo (650/651/659/660) NO exportan.
4. **Edición quirúrgica con verify-before-write:** 27 celdas, cada una verificada contra el mapa antes de escribir; 0 mismatches; guardado.
5. **COM hygiene:** Visible=false, DisplayAlerts=false, ReleaseComObject + GC×2. Sin zombies EXCEL, sin lock files.

## Celdas migradas (solo P3/P4 → Main10; P0/P1/P2/P5 intactos)

`6_NIVEL_2_PROFILES`, 27 celdas en filas: 33 (codec), 37 (codec_full), 104 (vlcopt.codec-priority), 126 (X-Video-Codecs), 135 (X-APE-CODEC), 261 (X-Codec-Support), 350 (X-Stream-Codecs), 631 (codec_primary), 632 (codec_string), 640 (codec_chain_video ×6 cols — Main8 rungs eliminados), 641 (codec_chain_video_family ×6 — etiquetas Main8 eliminadas), 644 (player_pref).
- P3: `hvc1.1.6.L120` → `hvc1.2.4.L123.B0` (1080p@60, fps confirmado vía X-Stream-FPS R352=60).
- P4: `avc1.64001f` → `hvc1.2.4.L93.B0` (720p@30).
- Malformado `hvc1.1.6.L120.90` (X-APE-CODEC/X-Codec-Support P3) corregido a `hvc1.2.4.L123.B0`.
- **P5 = `avc1.42c01e` SIN TOCAR** (failsafe SD universal, decisión del usuario).
- **P1 = `av01.0.15M.10` SIN TOCAR** (AV1 8K por diseño).

## Archivo generado por el Excel y validado

Corrí `Brain_ExportToFrontend` vía el propio Excel (inyección COM-safe de sub temporal con `WIRING_SILENT=True` para suprimir MsgBox; módulo temporal removido; workbook cerrado sin re-guardar).

**`Downloads\LAB_CALIBRATED_20260611_020645.json`** (222,364 bytes) — JSON válido. `profiles_calibrated`:

| Perfil | codec_full | X-Stream-Codecs |
|---|---|---|
| P0 | dvh1.08.06 | dvh1.08.06,ac-3 |
| P1 | hvc1.2.4.L153.B0 | av01.0.15M.10,ac-3 |
| P2 | hvc1.2.4.L150.B0 | hvc1.2.4.L150.B0,ac-3 |
| P3 | hvc1.2.4.L123.B0 | hvc1.2.4.L123.B0,mp4a.40.2 |
| P4 | hvc1.2.4.L93.B0 | hvc1.2.4.L93.B0,mp4a.40.2 |
| P5 | avc1.42c01e | avc1.42c01e,mp4a.40.2 |

**Garantías verificadas:** 0 ocurrencias `hvc1.1.6` (Main8), 0 `L120.90` malformados, P5/P1 preservados, JSON parseable.

## Rollback disponible

`Copy-Item "...xlsm.bak_20260611_014149" "...APE_M3U8_LAB_v8_FIXED.xlsm" -Force` restaura el LAB pre-migración.

## Estado final coherente (LAB→JSON→lista→backend→manifiesto)

- **LAB (SSOT)** = Main10 floor ✓ (guardado + verificado)
- **Export LAB_CALIBRATED** = Main10 floor ✓ (generado + validado)
- **Backend** `APE_ALL_PROFILES_v10_REALTIME_ENGINE.json` = P3 L123 / P4 L93 headers ✓
- **Frontend** `ape-hevc-cascade.js` = ya Main10 puro ✓ + `ape-profiles-config.js` metadata sin hvc1.1 ✓
- **Manifiesto** `iptv-omega-working-flow-manifesto` = Main10 documentado ✓
- **Doctrina** rich-idata = Main10 + guarda FREEZELESS ✓
