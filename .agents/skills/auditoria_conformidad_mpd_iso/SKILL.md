---
name: auditoria_conformidad_mpd_iso
description: Auditoría Forense de Conformidad de Manifiestos MPD contra parámetros ISO/IEC 23009-1 y DASH-IF IOP para streaming Live/LL-DASH.
---

# Auditoría Forense de Conformidad: Manifiesto MPD vs. Estándares Internacionales

## 1. Las Normas Rectoras del Universo DASH

El universo MPEG-DASH exige que un manifiesto `.mpd` sea compatible y cumpla con:

1. **ISO/IEC 23009-1:** Norma madre estructural y de atributos de MPEG-DASH.
2. **DASH-IF Interoperability Points (IOP) v4.x:** Buenas prácticas que garantizan compatibilidad en ExoPlayer, Dash.js, etc.
3. **ISO/IEC 23000-19 (CMAF):** Define empaquetado de fragmentos y constraints de sub-segmentos.
4. **Registros de Codecs (RFC 6381, AOM):** Define sintaxis estricta como `hev1.2.4.L153.B0` y `av01.0.12M.10`.

## 2. Requisitos Absolutos para "God-Tier" (100% Conformidad)

Todo script o proxy (como `resolve_quality.php` o `cmaf_proxy.php`) que despache el manifiesto MPD de FFmpeg debe alterarlo o estructurarlo para contener obligatoriamente estos elementos para `type="dynamic"`:

| # | Atributo / Elemento | Norma | Regla Estricta para Cumplimiento |
| :-- | :--- | :--- | :--- |
| 1 | `minBufferTime` | ISO/IEC 23009-1 | Obligatorio en `<MPD>`. Define el buffer seguro inicial (ej. `PT2S`). |
| 2 | `availabilityStartTime` | ISO/IEC 23009-1 | Obligatorio para `type="dynamic"`. Ancla el timeline. |
| 3 | `timeShiftBufferDepth` | DASH-IF IOP v4.2 | Obligatorio. Define la ventana DVR (ej. `PT30S`). |
| 4 | `<Period>` | ISO/IEC 23009-1 | Obligatorio. Todo `AdaptationSet` DEBE estar envuelto en un nodo `<Period>`. NUNCA en la raíz. |
| 5 | `mimeType` | DASH-IF IOP v4.2 | Obligatorio. Cada AdaptationSet o Representation (ej. `video/mp4`, `audio/mp4`). |
| 6 | `startWithSAP` | DASH-IF IOP v4.2 | Obligatorio en Video. Usualmente `startWithSAP="1"` (IDR limpio al inicio). |
| 7 | `maxWidth` / `maxHeight` | DASH-IF IOP v4.2 | Obligatorio en Video para informar al player del límite máximo del set. |
| 8 | `AdaptationSet` de Audio | DASH-IF IOP v4.2 | Obligatorio. Debe existir al menos una pista de audio (aac, ac-3). |
| 9 | `bitDepth` de AV1 | AOM AV1 Registry | El string AV1 debe reflejar 10-bit si es HDR (ej. `av01.0.12M.10`). |
| 10 | `publishTime` | DASH-IF IOP v4.2 | Recomendado inyectar `publishTime` igual al tiempo dinámico actual para lives. |
| 11 | `SegmentTimeline` Live | ISO/IEC 23009-1 | Para live infinito, `<S t="..." d="..." r="-1" />` (r=-1 para infinito). |

## 3. Protocolo de Ejecución Activa

Si FFmpeg no genera esto por defecto, el Resolver PHP (`resolve_quality.php`) o el generador estático DEBEN interceptar el texto del archivo `manifest.mpd` (DOMDocument o Regex), inyectar estos 11 parámetros críticos y luego despachar el XML modificado al cliente con el Content-Type adecuado.
Cualquier auditoría a archivos MPD bajo el protocolo Zapping 0s debe contrastar el Payload final contra esta matriz.
