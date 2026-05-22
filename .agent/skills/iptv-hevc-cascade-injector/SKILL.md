---
name: iptv-hevc-cascade-injector
description: Inyecta y orquesta la cascada dual de codecs HEVC (hvc1 y hev1) en listas M3U8 y en el repositorio generador IPTV APE. Úsalo cuando el usuario necesite implementar la GOLDEN RULE de codecs (hvc1 para STREAM-INF/CMAF, hev1 para KODIPROP/EXTVLCOPT) para lograr máxima compatibilidad en reproductores IPTV, o cuando requiera auditar/corregir violaciones RFC 8216 en listas maestras.
---

# IPTV HEVC Cascade Injector

Esta skill encapsula el conocimiento procedimental y la GOLDEN RULE para implementar cascadas de codecs HEVC en ecosistemas IPTV, garantizando máxima calidad (8K/4K HDR) sin sacrificar compatibilidad universal.

## La GOLDEN RULE de la Cascada Dual

| Namespace | Dónde | Reproduce en |
|-----------|-------|-------------|
| `hvc1.*` | `#EXT-X-STREAM-INF CODECS=`, `#EXT-X-CMAF` | Apple AVFoundation, Tizen, webOS |
| `hev1.*` | `#KODIPROP`, `#EXTVLCOPT`, `#EXT-X-APE-*` | ExoPlayer (Android TV), Kodi ISA, DVB |
| `hevc` (familia) | `#EXTVLCOPT:codec=`, `#KODIPROP:preferred_codec=` | VLC, ExoPlayer ISA (API semántica) |

**NUNCA** cruzar. `hev1.*` en `STREAM-INF` rompe Tizen/webOS/Apple.

## Capacidades

### 1. Auditoría de Listas M3U8

Usa `scripts/audit_and_fix_m3u8.py`:

```bash
python .agent/skills/iptv-hevc-cascade-injector/scripts/audit_and_fix_m3u8.py input.m3u8 output.m3u8
```

Detecta/corrige:
- `hev1.*` en `STREAM-INF` (violación GOLDEN RULE → sustituye por `hvc1.*`)
- `#EXT-X-TARGETDURATION` en Master Playlists (RFC 8216 §4.3.3.1 violation)
- `#EXT-X-PART-INF` en Master Playlists (violation)
- Múltiples `#EXT-X-START` conflictivos
- `ec-3` inseguro → `ac-3` (salvo `--keep-atmos`)

**No hace**: downgrade de VERSION:9, modificar URLs, eliminar canales.

### 2. Implementación en el Generador APE

Ver `references/implementation_pattern.md` para el patrón REGLA 1% UNICIDAD.

Archivos clave del repositorio:
- `frontend/js/ape-v9/ape-hevc-cascade.js` — SSOT cascada (v1.2.0-dual)
- `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` — generador principal
- `frontend/js/ape-v9/ape-profiles-config.js` — P0-P5 con `codec_ladder_hvc1` + `codec_ladder_hev1`

### 3. Validación Post-Cambio

```bash
node -c frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node -c frontend/js/ape-v9/ape-fallback-resolver.js
node -c frontend/js/ape-v9/ape-profiles-config.js
# Los 3 deben retornar exit 0

# Test GOLDEN RULE en lista generada:
grep "hev1\." lista.m3u8 | grep "STREAM-INF"
# DEBE estar vacío
```

## Estado Actual del Repo (2026-05-22)

- Cascada dual `hvc1`+`hev1` implementada: commit `4b559db`
- MAX_QUALITY OVERRIDE mode (DV+Atmos+LL-HLS): commit `3a30666`
- Truth path fix + LL-HLS tags: commit `369bdc0`
- `HEVC_CASCADE_HVC1` y `HEVC_CASCADE_HEV1` como constantes en el generador (L27-50)
- `resolveCodecForChannel()` → hvc1 | `resolveCodecHev1ForChannel()` → hev1 en `ape-hevc-cascade.js`
