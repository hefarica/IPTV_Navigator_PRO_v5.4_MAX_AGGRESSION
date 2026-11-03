# 24 · Slots de calidad en `/a/2` — audio, chroma, GOP, HDR, perfil (t57)

**Fecha:** 2026-10-28 · **Tarea:** t57 · Base: t55 (restaurada) + t56 (slots 0–6). **Aditivo puro.**
**Generador:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` · 11.924 → **11.991 líneas** (+67) · sha256 **`4ea2ad4ad83ff326b058ee8a1bd92d3cc97c2c8eba10a2d1ed23716506b3be86`**
**Intactos:** 54 `#EXTATTRFROMURL:X-APE-*` · 1.293 del namespace APE custom · 203 claves `#EXTHTTP` · wrapper **== HEAD** (`1a7e8ed4…4d54b`) · URL-1.

## 1. Tabla slot → significado → fuente real

| Slot | Nombre | Valores | Fuente en el generador | ¿Emitido? |
|---|---|---|---|---|
| 16 | AUDIO_CODEC | 1 AAC · 2 AC3 · 3 EAC3 · 4 AC4 · 5 OPUS · 6 MP3 · 7 otro | `_codecAudio` (probe / canal / LAB, con normalización `ec-3→ac-3` de L8170) | sí, si hay dato |
| 17 | AUDIO_CHANNELS | 1/2/6/8 | **no existe** en el generador | **omitido (0xFFFF)** |
| 18 | CHROMA | 1 4:2:0 · 2 4:2:2 · 3 4:4:4 | `X-Chroma-Subsampling` es cabecera fija del LAB, no dato por canal | **omitido** |
| 19 | GOP_SECONDS ×100 | 200 = 2,00 s | `X-TELCHEMY-GOP-POLICY` es política de texto (`IDEAL=2000`), no GOP medido | **omitido** |
| 20 | HDR_PROFILE | 0 SDR · 1 HDR10 · 2 HLG · 3 HDR10+ · 4 DV P8.1 · 5 DV P5 · 6 DV P8.2 | `cfg.hdr_mode` del LAB; fallback `_apeTruth.hdr` | sí, si hay dato |
| 21 | QUALITY_PROFILE | 0=P0 … 5=P5 | parámetro `profile` con el que se genera el canal | sí |
| 22 | BIT_DEPTH | 8/10/12 | derivado del **códec declarado**: `hvc1.2`→10 · `hvc1.4`→12 · `hvc1.1`→8 · `av01.*.10`→10 · `avc1`→8 | sí, si hay códec |
| 23 | FRAME_RATE ×100 | 5994 = 59,94 | `_fps796` (probe → cfg → 60) | sí |
| 24/25 | SOURCE_W / SOURCE_H | 3840 / 2160 | `_res796` (probe → cfg → default) | sí |
| 26 | TIER | 0=F0 … 5=F5 | `_apeTruth.tier` del resolver (`F0_REAL_VERIFIED_MAX`…) | sí, si el resolver corrió |

**Regla aplicada:** si el dato no existe, el slot **no viaja** (0xFFFF). No se inventó ninguno.

## 2. Medición (puerto Lua de `M.parse_payload`, `body == set*2`)

| Escenario | Slots | Payload | URL | Faltantes (0xFFFF) |
|---|---|---|---|---|
| Fixture (mock mínimo: sin probe, sin LAB `hdr_mode`) | **11** | 196 ch | **299 B** | 16, 20, 26 — no hay dato |
| Unitario con todos los datos reales | **14** | 204 ch | **301 B** | ninguno |

Fixture: `{0:0, 1:0, 3:1, 4:0, 5:0, 6:8, 21:1, 22:10, 23:6000, 24:3840, 25:2160}` · `decode_err=none`.
Unitario (`hdr_mode=HDR10PLUS`, `audioCodec=ac-3`, `codec=hvc1.2.4.L153.B0`, `fps=59.94`, `tier=F1`): `{… 6:12, 16:2, 20:3, 21:1, 22:10, 23:5994, 24:3840, 25:2160, 26:1}` — audio **2 (AC3)**, HDR **3 (HDR10+)**, bit depth **10 (Main10)**, tier **1 (F1)**, y el FLAGS pasa a `0x0C` (0x0004 hdr + 0x0008 uhd4k).

**Antes → después del payload:** 183 → **196 chars** (fixture) / **204** (completo). URL 286 → **299/301 B**, muy por debajo del techo de 3 KB incluso con 14 slots.

## 3. Verificación

`node -c` **exit 0** ×3 · sin BOM (byte 47) · fixture: **895 → 896 líneas**, legacy **54/54**, `/a` real **0 → 1** · URL-1 **intacta** · gate TiviMate ⇒ `null` · wrapper byte-idéntico a HEAD.

## 4. NOT_RUN y límites

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte): todas las cifras son de 1 canal.
2. **Sin invocación real a `/a/2/`**: validado con el puerto del parser, no contra el endpoint vivo.
3. **Slots 17 (audio channels), 18 (chroma) y 19 (GOP)** quedan sin implementar **por falta de dato real por canal**; el generador sólo tiene cabeceras/políticas fijas, no medidas. Implementarlos exigiría un probe de pista de audio y del GOP efectivo.
4. **DV genérico → 4**: el generador no distingue P5 / P8.1 / P8.2; se declara 4 (P8.1, el cross-compatible) y queda escrito aquí para que el consumidor lo sepa.
5. Sin deploy; `_vps_stage/**`, DB y listas intactas; **sin commit**.
