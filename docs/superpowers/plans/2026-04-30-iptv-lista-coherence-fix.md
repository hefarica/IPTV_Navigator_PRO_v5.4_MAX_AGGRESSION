# IPTV Lista Coherence Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar las 25+ incoherencias detectadas en `APE_LISTA_1777515679668.m3u8` cableando la corrección desde el LAB Excel hasta los generadores JS, validándolas con un Toolkit Python y un audit endpoint en el Backend PHP — todo SSOT, cero hardcode, doctrina OMEGA preservada.

**Architecture:** Cuatro capas cosidas a la médula espinal del manifest (LAB → Generator JS → Backend → Toolkit), con cada incoherencia atacada en su FUENTE. El generador JS lee del LAB Excel via `pmProfile.*` (SSOT existente); el LAB Excel agrega columnas/hojas para los nuevos parámetros; el Backend PHP gana un endpoint `/api/audit/lab-coherence` que detecta drift entre capas; el Toolkit Python `audit_lista_emitted.py` corre las 7+8 trampas + B1..B6 sobre cualquier `.m3u8` y devuelve scorecard.

**Tech Stack:** JavaScript ES6+ (generadores), VBA + Excel (LAB calibration), PHP 8 (backend audit), Python 3.10 (toolkit), bash (smoke harness).

---

## Context — incoherencias detectadas

| # | Cat | Tag/Key | Ocurrencias | Problema |
|---|---|---|---|---|
| **A1** | Header | `#EXT-X-DATERANGE:ID="omega-live-P0"` | 1 | Hardcoded P0 en lista multi-perfil |
| **A2** | Header | `#EXT-X-DEFINE:VALUE="P0_PERPROFILE_BULLETPROOF"` | 1 | Hardcoded P0 |
| **A3** | Header | `#EXT-X-DEFINE:NAME="OMEGA_BUILD"` huérfano | 1 | Duplicado sin VALUE |
| **A4** | Header | `User-Agent` Chrome/91 base UA | 1 | Mayo 2021, hoy abril 2026 |
| **A5** | Header | `Referer/Origin: netflix.com` | 1 | Anti-bot trigger |
| **B1** | Per-canal | `video-filter=zscale=transfer=st2084` + `video-hdr-mode=SDR` | 34,377 (92.6%) | PQ HDR transfer + modo SDR contradictorio |
| **B2** | Per-canal | `video-hdr-nits=300` + `video-tone-mapping-peak=300` | 37,128 | 300 nits es SDR-tier |
| **B3** | Per-canal | `adaptive-maxwidth=60000` `adaptive-maxheight=60000` | 37,128 | Valor absurdo, no existe display 60000px |
| **B4** | Per-canal | `http-iface=` `http-proxy=` `http-proxy-pwd=` (vacíos) | 111,384 | Ruido + algunos parsers VLC fallan |
| **B5** | Per-canal | `video-crop=` `audio-filter=` `audio-visual=` `sub-file=` `hls-aes-key=` `ts-extra-pmt=` (vacíos) | 222,768 | Ruido |
| **B6** | Per-canal | `ape-codec-family=""` en `#EXTINF` | 37,128 | Tag vacío universal — meta no calculada |
| **C1** | EXTHTTP | 10 `X-User-Agent-{Android,iOS,...}` con UAs cruzados de label | 371,280 | Falsificación anti-coherente → fingerprint anti-bot trivial |
| **C2** | EXTHTTP | `X-Forwarded-For/X-Real-IP/X-Client-IP` con IP `159.69.20.202` | ~10,000+ | **🚨 SECURITY LEAK — IP del VPS Hetzner Ashburn expuesta al provider** |
| **C3** | EXTHTTP | `X-Cache`, `X-Varnish`, `X-Served-By`, `X-Timer`, `X-Age`, `X-TTL`, `X-Grace`, `X-Hits`, `X-Cache-Lookup`, `X-Cache-Status`, `X-Fetch-Error` | 408,408 | Akamai/Varnish forensic markers fakes — provider es Xtream simple |
| **C5** | EXTHTTP | `X-Video-Range=SDR` + `X-HDR-Nits=300` + `X-Codec-Primary=hvc1` (Main10) + `X-Device-Capabilities=hdr10=true,...` + `ape-profile=P3` (FHD) | 37,128 | Auto-contradicción: ¿SDR o HDR? ¿FHD o 4K? |
| **C6** | EXTHTTP | `Sec-CH-UA-Platform="Android"` + `Sec-CH-UA-Mobile="?1"` con UA SmartTV | 37,128 | Mismatch chrome client hints + UA |
| **C7** | EXTHTTP | `Connection: keep-alive` + `Keep-Alive: timeout=300, max=1000` | 37,128 | Hop-by-hop headers (RFC 7230) — NO se pasan upstream → ruido |

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Generador master (~5500 líneas) — emite EXTVLCOPT, KODIPROP, EXTHTTP, CMAF/APE | MODIFY (8 secciones quirúrgicas) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | Profile config SSOT — 6 perfiles con dicts vlcopt/kodiprop/headerOverrides | MODIFY (purga UAs falsos en headerOverrides + nuevos campos `ua_pool`, `hdr_mode_canonical`) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js` | Bridge LAB → window.APE_PROFILES_CONFIG | READ-ONLY (verificar contrato) |
| `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_CoherenceGuard.bas` | Validator VBA: bloquea export si HDR/SDR contradictorio | CREATE |
| `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_UAPool.bas` | UA pool refresh: importa pool actualizado a hoja `33_UA_POOL` | CREATE |
| `LAB.xlsm` hojas 7_NIVEL_3_CHANNEL + 32_PLACEHOLDERS_MAP + 33_UA_POOL (nueva) | Calibración LAB | MODIFY via VBA (Stage 2 separado) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api_audit_coherence.php` | Endpoint `/api/audit/lab-coherence` — diff JS↔LAB↔Backend | CREATE |
| `IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/audit_lista_emitted.py` | Toolkit Python: 7+8+B+C trampas → scorecard JSON | CREATE |
| `IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/coherence_baseline.py` | Smoke comparativa pre/post fix sobre lista emitida | CREATE |
| `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/` | Snapshot pre-cambio (3 archivos JS) | CREATE |

---

## Doctrines aplicables (no violar)

- **OMEGA-NO-DELETE** — los CMAF/APE forensic tags se MANTIENEN. Solo modifico EMISIONES (filtros condicionales) — no remuevo `lines.push()` salvo que la línea sea **vacía** post-evaluación
- **NO clampar valores LAB** — emisión verbatim, omit si vacío, never floor/ceil
- **OkHttp single-value** para Connection/Keep-Alive en EXTHTTP (los quitamos por C7)
- **AUTOPISTA** — sin tocar shield NGINX, Lua reactor, warmers VPS
- **iptv-vps-touch-nothing** — el endpoint PHP nuevo va al filesystem `vps/prisma/` pero NO se deploya en este plan (solo source-code add)
- **iptv-excel-safe-mode** — Excel cerrado, COM batch, backup SHA-256 antes de cualquier escritura `.xlsm`
- **iptv-pre-edit-audit** — antes del primer Edit/Write de cada archivo, leer ±20 líneas alrededor del target

---

## Task 1: Snapshot pre-cambio + script audit baseline

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/`
- Create: `IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/audit_lista_emitted.py`

- [ ] **Step 1: Snapshot 3 archivos JS pre-fix**

```bash
mkdir -p IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix
cp IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/m3u8-typed-arrays-ultimate.js.PRE
cp IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/ape-profiles-config.js.PRE
cp IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/profile-manager-v9.js.PRE
```

- [ ] **Step 2: Crear `audit_lista_emitted.py` (Toolkit Python)**

```python
#!/usr/bin/env python3
"""
audit_lista_emitted.py — Auditor de M3U8 emitidas.

Aplica las 7+8 trampas (URL Constructor + EXTHTTP) y B1..B6 sobre
cualquier .m3u8 y produce scorecard JSON con conteos exactos.

Usage:
    python audit_lista_emitted.py <ruta.m3u8> [--out scorecard.json]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path


CHECKS = {
    # Header global
    "A1_omega_live_p0_hardcoded": r'^#EXT-X-DATERANGE:.*ID="omega-live-P0"',
    "A2_omega_build_p0_hardcoded": r'^#EXT-X-DEFINE:.*VALUE="P0_PERPROFILE_BULLETPROOF"',
    "A3_omega_build_orphan": r'^#EXT-X-DEFINE:NAME="OMEGA_BUILD"$',
    "A4_chrome_91_outdated": r'Chrome/9[0-9](?!\d)',
    # Per-canal
    "B1_st2084_with_sdr": None,  # cross-line check
    "B3_adaptive_60000": r'adaptive-max(width|height)=60000',
    "B4_empty_http_iface": r'^#EXTVLCOPT:http-iface=$',
    "B4_empty_http_proxy": r'^#EXTVLCOPT:http-proxy=$',
    "B4_empty_http_proxy_pwd": r'^#EXTVLCOPT:http-proxy-pwd=$',
    "B5_empty_video_crop": r'^#EXTVLCOPT:video-crop=$',
    "B5_empty_audio_filter": r'^#EXTVLCOPT:audio-filter=$',
    "B5_empty_audio_visual": r'^#EXTVLCOPT:audio-visual=$',
    "B5_empty_sub_file": r'^#EXTVLCOPT:sub-file=$',
    "B5_empty_hls_aes_key": r'^#EXTVLCOPT:hls-aes-key=$',
    "B5_empty_ts_extra_pmt": r'^#EXTVLCOPT:ts-extra-pmt=$',
    "B6_empty_ape_codec_family": r'ape-codec-family=""',
    # EXTHTTP
    "C1_x_ua_label_count": r'"X-User-Agent-[A-Za-z]+":',
    "C2_ip_leak_xff": r'"X-Forwarded-For":"(159\.69\.|46\.|78\.46\.)',  # Hetzner CIDRs
    "C3_akamai_varnish_fakes": r'"X-(Cache|Varnish|Served-By|Timer|Age|TTL|Grace|Hits|Cache-Lookup|Cache-Status|Fetch-Error)":',
    "C5_x_video_range_sdr_with_hdr": None,  # cross-field check
    "C6_sec_ch_ua_android_with_smarttv": None,  # cross-field check
    "C7_connection_keepalive_in_exthttp": r'"Connection":"keep-alive"',
}


def audit(path: Path) -> dict:
    counts = Counter()
    channels = 0
    sdr_with_st2084 = 0
    pending_sdr_check = None

    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("#EXTINF:"):
                channels += 1
                pending_sdr_check = {"sdr": False, "st2084": False}
            for name, pattern in CHECKS.items():
                if pattern and re.search(pattern, line):
                    counts[name] += 1
            if pending_sdr_check is not None:
                if "video-hdr-mode=SDR" in line:
                    pending_sdr_check["sdr"] = True
                if "video-filter=zscale=transfer=st2084" in line:
                    pending_sdr_check["st2084"] = True
                if line.startswith("#EXTINF:") and pending_sdr_check["sdr"] and pending_sdr_check["st2084"]:
                    sdr_with_st2084 += 1

    counts["B1_sdr_with_st2084"] = sdr_with_st2084
    counts["TOTAL_CHANNELS"] = channels
    return dict(counts)


def main(argv):
    if len(argv) < 2:
        print("Usage: audit_lista_emitted.py <ruta.m3u8> [--out scorecard.json]")
        sys.exit(1)
    path = Path(argv[1])
    out = None
    if "--out" in argv:
        out = Path(argv[argv.index("--out") + 1])
    result = audit(path)
    text = json.dumps(result, indent=2)
    if out:
        out.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 3: Correr script sobre lista actual → baseline**

```bash
python IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/audit_lista_emitted.py "C:/Users/HFRC/Downloads/APE_LISTA_1777515679668.m3u8" --out IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/baseline_scorecard.json
```

Expected: scorecard JSON con conteos coincidiendo con audit manual (TOTAL_CHANNELS=37128, B3=74256 (37128×2), C2 ≥10000, etc).

- [ ] **Step 4: Commit Task 1**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/ IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/audit_lista_emitted.py
git commit -m "feat(toolkit): audit_lista_emitted.py + baseline scorecard pre-coherence-fix"
```

---

## Task 2: Fix B3 — `adaptive-maxwidth/maxheight=60000` → derivado de `_res796`

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (buscar `adaptive-maxwidth=60000` + emisor)

- [ ] **Step 1: Localizar emisor del 60000**

```bash
grep -n "adaptive-maxwidth=60000\|adaptive-maxheight=60000" IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
grep -n "adaptive-maxwidth=\|adaptive-maxheight=" IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

Expected: encontrar la línea hardcoded (probablemente en función `composeProfileTransport` o `selectionProps`). Anotar línea exacta.

- [ ] **Step 2: Read ±25 líneas alrededor del target**

Read the source lines ±25 alrededor de cada hit del paso 1.

- [ ] **Step 3: Reemplazar `60000` por derivado de `_res796` o `cfg.width/height`**

Pattern reemplazo (ejemplo, ajustar a ubicación real):

```javascript
// ANTES:
'#EXTVLCOPT:adaptive-maxwidth=60000',
'#EXTVLCOPT:adaptive-maxheight=60000',

// DESPUÉS:
`#EXTVLCOPT:adaptive-maxwidth=${(_res796 && _res796.split('x')[0]) || cfg.width || 7680}`,
`#EXTVLCOPT:adaptive-maxheight=${(_res796 && _res796.split('x')[1]) || cfg.height || 4320}`,
```

- [ ] **Step 4: Verificar no romper sintaxis JS**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

Expected: OK syntax.

- [ ] **Step 5: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(generator): B3 adaptive-maxwidth/maxheight 60000 → derivado de _res796"
```

---

## Task 3: Fix B4-B5 — Helper `pushIfNonEmpty()` + omit empty values

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Definir helper `pushIfNonEmpty` cerca de la función generadora principal**

Buscar inicio de la función que emite los EXTVLCOPT (alrededor de `lines.push(`#EXTVLCOPT:hls-caching`)`). Insertar al principio del bloque:

```javascript
// Helper SSOT: omitir línea si el valor es vacío/null/undefined.
// Casos: http-iface, http-proxy, http-proxy-pwd, video-crop, audio-filter,
// audio-visual, sub-file, hls-aes-key, ts-extra-pmt — emitirlos como vacíos
// genera ~371k líneas de ruido por lista y algunos parsers VLC fallan.
function pushIfNonEmpty(arr, key, value) {
    if (value === null || value === undefined) return;
    const s = String(value).trim();
    if (s === '' || s === 'undefined' || s === 'null') return;
    arr.push(`#EXTVLCOPT:${key}=${s}`);
}
```

- [ ] **Step 2: Reemplazar las 9 emisiones empty-prone**

Por cada uno de los 9 keys problemáticos, cambiar:

```javascript
// ANTES:
lines.push(`#EXTVLCOPT:http-iface=${cfg.http_iface || ''}`);

// DESPUÉS:
pushIfNonEmpty(lines, 'http-iface', cfg.http_iface);
```

Aplicar a: `http-iface`, `http-proxy`, `http-proxy-pwd`, `video-crop`, `audio-filter`, `audio-visual`, `sub-file`, `hls-aes-key`, `ts-extra-pmt`.

- [ ] **Step 3: Sintaxis check**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

- [ ] **Step 4: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(generator): B4-B5 pushIfNonEmpty helper — omit 9 empty EXTVLCOPT keys (~371k líneas saved)"
```

---

## Task 4: Fix B6 — `ape-codec-family` derivado del perfil

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` (buscar `ape-codec-family`)

- [ ] **Step 1: Localizar emisión `#EXTINF` con `ape-codec-family`**

```bash
grep -n "ape-codec-family" IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

- [ ] **Step 2: Derivar codec family de `pmProfile.settings.codec`**

```javascript
// ANTES:
const codecFamily = '';

// DESPUÉS:
const codecRaw = (pmProfile?.settings?.codec || cfg.codec || 'H264').toString().toUpperCase();
const codecFamily = ({
    'AV1': 'av1',
    'HEVC': 'hevc', 'H.265': 'hevc', 'H265': 'hevc',
    'H.264': 'h264', 'H264': 'h264', 'AVC': 'h264',
    'VP9': 'vp9'
})[codecRaw] || codecRaw.toLowerCase();
```

- [ ] **Step 3: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(generator): B6 ape-codec-family derivado de pmProfile.settings.codec"
```

---

## Task 5: Fix B1-B2 — HDR/SDR coherencia (mode + tone-mapping + transfer)

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js`

- [ ] **Step 1: Agregar campo `hdr_canonical` al dict `settings` de cada perfil P0..P5**

En `ape-profiles-config.js`, dentro de cada bloque `"settings": { ... }`, agregar:

| Perfil | `hdr_canonical` | `nits_target` |
|---|---|---|
| P0 | `dolby-vision` | `4000` |
| P1 | `hdr10+` | `1500` |
| P2 | `hdr10` | `1000` |
| P3 | `hlg` | `400` |
| P4 | `sdr` | `100` |
| P5 | `sdr` | `100` |

- [ ] **Step 2: En el generador, derivar `_hdrMode` de `pmProfile.settings.hdr_canonical`**

```javascript
// Derivar HDR mode canónico (NUNCA mezclar st2084 transfer con mode SDR)
const _hdrCanonical = (pmProfile?.settings?.hdr_canonical || 'sdr').toLowerCase();
const _hdrModeM3U = ({
    'dolby-vision': 'DOLBY_VISION',
    'hdr10+': 'HDR10_PLUS',
    'hdr10': 'HDR10',
    'hlg': 'HLG',
    'sdr': 'SDR'
})[_hdrCanonical] || 'SDR';
const _isHdr = _hdrCanonical !== 'sdr';
const _hdrNitsCanonical = parseInt(pmProfile?.settings?.nits_target || (_isHdr ? 1000 : 100), 10);
```

- [ ] **Step 3: Reemplazar emisiones contradictorias por bloque condicional**

```javascript
// SDR → BT709 + bt1886 transfer + bt709 primaries
// HDR10/HDR10+/DV → BT2020 + ST2084 transfer + bt2020 primaries  
// HLG → BT2020 + arib-std-b67 transfer + bt2020 primaries
if (_isHdr && (_hdrCanonical === 'hdr10' || _hdrCanonical === 'hdr10+' || _hdrCanonical === 'dolby-vision')) {
    lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=st2084:chromal=topleft:matrix=2020_ncl:primaries=2020:range=limited`);
    lines.push(`#EXTVLCOPT:video-color-space=BT2020`);
    lines.push(`#EXTVLCOPT:video-transfer-function=SMPTE-ST2084`);
    lines.push(`#EXTVLCOPT:video-color-primaries=BT2020`);
} else if (_hdrCanonical === 'hlg') {
    lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=arib-std-b67:matrix=2020_ncl:primaries=2020:range=limited`);
    lines.push(`#EXTVLCOPT:video-color-space=BT2020`);
    lines.push(`#EXTVLCOPT:video-transfer-function=ARIB-STD-B67`);
    lines.push(`#EXTVLCOPT:video-color-primaries=BT2020`);
} else {
    // SDR
    lines.push(`#EXTVLCOPT:video-filter=zscale=transfer=bt1886:matrix=bt709:primaries=bt709:range=limited`);
    lines.push(`#EXTVLCOPT:video-color-space=BT709`);
    lines.push(`#EXTVLCOPT:video-transfer-function=BT1886`);
    lines.push(`#EXTVLCOPT:video-color-primaries=BT709`);
}
lines.push(`#EXTVLCOPT:video-hdr=${_isHdr ? 'true' : 'false'}`);
lines.push(`#EXTVLCOPT:video-hdr-mode=${_hdrModeM3U}`);
lines.push(`#EXTVLCOPT:video-hdr-nits=${_hdrNitsCanonical}`);
lines.push(`#EXTVLCOPT:video-tone-mapping=${_isHdr ? 'hable' : 'off'}`);
if (_isHdr) {
    lines.push(`#EXTVLCOPT:video-tone-mapping-peak=${_hdrNitsCanonical}`);
    lines.push(`#EXTVLCOPT:video-tone-mapping-reference=203`);
}
lines.push(`#EXTVLCOPT:video-bt2020=${_isHdr ? 'true' : 'false'}`);
```

> Eliminar las viejas emisiones hardcoded de `video-filter=zscale=transfer=st2084` que se aplicaban a TODO canal.

- [ ] **Step 4: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/{m3u8-typed-arrays-ultimate.js,ape-profiles-config.js}
git commit -m "fix(generator+profiles): B1-B2 HDR/SDR canonical mode + tone-mapping coherente por perfil"
```

---

## Task 6: 🚨 Fix C2 CRÍTICO — Remove IP VPS leak en X-Forwarded-For/X-Real-IP/X-Client-IP

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Localizar emisión de `X-Forwarded-For`/`X-Real-IP`/`X-Client-IP` en EXTHTTP builder**

```bash
grep -n '"X-Forwarded-For"\|"X-Real-IP"\|"X-Client-IP"' IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

- [ ] **Step 2: Comentar las 3 emisiones (NO eliminar — preservar OMEGA-NO-DELETE) con razón**

```javascript
// REMOVED 2026-04-30 — C2 SECURITY LEAK: estos headers exponían la IP del
// VPS Hetzner Ashburn (159.69.20.202) y otras IPs de Akamai falsificadas
// al provider Xtream. Aún si el upstream Xtream no los lee, el shield NGINX
// los reenvía y deja fingerprint. NO RE-INTRODUCIR sin doctrina explícita.
// 'X-Forwarded-For': spoofedIp,
// 'X-Real-IP': spoofedIp,
// 'X-Client-IP': spoofedIp,
```

- [ ] **Step 3: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(security): C2 CRITICAL remove X-Forwarded-For/X-Real-IP/X-Client-IP — VPS Hetzner IP leaked al provider"
```

---

## Task 7: Fix C3 — Remove Akamai/Varnish forensic fakes

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Identificar las 11 emisiones Varnish/Akamai fakes**

```bash
grep -n '"X-Cache"\|"X-Varnish"\|"X-Served-By"\|"X-Timer"\|"X-Age"\|"X-TTL"\|"X-Grace"\|"X-Hits"\|"X-Cache-Lookup"\|"X-Cache-Status"\|"X-Fetch-Error"' IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

- [ ] **Step 2: Comentar el bloque entero con razón**

```javascript
// REMOVED 2026-04-30 — C3: estos 11 headers emulan output de Varnish/Akamai
// (X-Cache, X-Varnish, X-Served-By, X-Timer, X-Age, X-TTL, X-Grace, X-Hits,
// X-Cache-Lookup, X-Cache-Status, X-Fetch-Error). El provider Xtream NO usa
// Varnish ni Akamai → la presencia de estos headers es fingerprint trivial
// para anti-bot WAF. NO RE-INTRODUCIR.
```

- [ ] **Step 3: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(stealth): C3 remove 11 Akamai/Varnish forensic fakes (~408k líneas saved)"
```

---

## Task 8: Fix C1 — UA pool real coherente (1 User-Agent, 0 X-User-Agent-*)

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js`

- [ ] **Step 1: Agregar pool de UAs reales actualizados a `ape-profiles-config.js`**

Crear sección global (no per-perfil) `window.APE_UA_POOL` con 12 UAs verificados Chrome 134-138 / Firefox 133+ / Safari 17.4+ / Web0S Chrome 119+ / SmartTV recientes:

```javascript
// At the end of ape-profiles-config.js, before the IIFE close:
window.APE_UA_POOL_2026 = [
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeCross/1.0 SamsungBrowser/2.6 Chrome/63.0.3239.84 TV Safari/538.1',
    'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Tizen 6.5; SmartHub; SMART-TV; SmartTV; U; Maple2012) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; AFTKA Build/STT1.231215.001) AppleWebKit/537.36 (KHTML, like Gecko) Silk/138.5.7 like Chrome/138.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240105.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Kodi/21.0 (Windows 10) Version/21.0-Omega',
    'OTT Navigator/1.7.0.0 (Linux;Android 13) ExoPlayer/2.19.1',
    'TiviMate/4.7.0 (Linux;Android 13) ExoPlayer/2.19.1'
];
```

- [ ] **Step 2: En el generador, reemplazar emisión de 10 X-User-Agent-* por 1 sólo User-Agent rotado**

Localizar y eliminar las emisiones de los 10 `X-User-Agent-*` (Android, iOS, Chrome, TiviMate, OTT, Kodi, ExoPlayer, VLC, Safari) en el builder de EXTHTTP. Conservar SOLO `User-Agent` rotado de pool.

```javascript
// Pool de UAs actualizados (mayo 2026 fresh)
const _uaPool = (typeof window !== 'undefined' && window.APE_UA_POOL_2026)
    ? window.APE_UA_POOL_2026
    : ['Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager'];

// Selección determinista por _sid796 hash → mismo canal siempre el mismo UA
const _uaIdx = parseInt(_sid796.slice(0, 4), 16) % _uaPool.length;
const _uaChosen = _uaPool[_uaIdx];

// EMITIR SOLO User-Agent (UN solo header, no 10 falsificados):
// 'User-Agent': _uaChosen,

// REMOVED 2026-04-30 — C1: los 10 X-User-Agent-{Android,iOS,Chrome,TiviMate,
// OTT,Kodi,ExoPlayer,VLC,Safari} llevaban UAs cruzados de label (Android con
// UA de Windows, iOS con UA de MAG322, etc.) → fingerprint anti-bot trivial.
```

- [ ] **Step 3: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/{m3u8-typed-arrays-ultimate.js,ape-profiles-config.js}
git commit -m "fix(stealth): C1 + A4 UA pool 2026 + remove 10 X-User-Agent-* falsificados"
```

---

## Task 9: Fix C5 + C6 — Body declarations coherentes + Sec-CH-UA derivado

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Cablear `X-Video-Range`, `X-HDR-Nits`, `X-Codec-Primary`, `X-Resolution`, `X-Framerate` desde el perfil**

Reemplazar los hardcoded por valores derivados de `_hdrModeM3U`, `_hdrNitsCanonical`, `_codec796`, `_res796`, `_fps796`:

```javascript
// X-Video-Range coherente con HDR mode
'X-Video-Range': _hdrModeM3U,  // ya correcto, era SDR hardcoded
'X-HDR-Nits': String(_hdrNitsCanonical),
'X-Codec-Primary': _codec796,
'X-Codec-Audio': _codecAudio,
'X-Resolution': _res796,
'X-Framerate': String(_fps796),
```

- [ ] **Step 2: `X-Device-Capabilities` derivado del perfil real (no listar lo que no aplica)**

```javascript
const _devCaps = [];
if (_isHdr) {
    if (_hdrCanonical === 'hdr10' || _hdrCanonical === 'hdr10+') _devCaps.push('hdr10=true');
    if (_hdrCanonical === 'hdr10+') _devCaps.push('hdr10plus=true');
    if (_hdrCanonical === 'dolby-vision') _devCaps.push('dolbyvision=true');
    if (_hdrCanonical === 'hlg') _devCaps.push('hlg=true');
}
const _resHeight = parseInt((_res796 || '1080x720').split('x')[1], 10);
if (_resHeight >= 4320) _devCaps.push('8k=true');
else if (_resHeight >= 2160) _devCaps.push('4k=true');
else if (_resHeight >= 1080) _devCaps.push('fhd=true');
else if (_resHeight >= 720) _devCaps.push('hd=true');
const _codecLow = _codec796.toLowerCase();
if (_codecLow.includes('hev1') || _codecLow.includes('hvc1')) _devCaps.push('hevc=true');
if (_codecLow.includes('av01') || _codecLow.includes('av1')) _devCaps.push('av1=true');
if (_codecLow.includes('avc1') || _codecLow.includes('h264')) _devCaps.push('h264=true');
const _devCapsStr = _devCaps.join(',');

// 'X-Device-Capabilities': _devCapsStr,
```

- [ ] **Step 3: Sec-CH-UA-Platform / Sec-CH-UA-Mobile derivados del UA**

```javascript
// Detectar platform/mobile del UA chosen
let _secPlatform = 'Unknown';
let _secMobile = '?0';
if (/Android/i.test(_uaChosen)) {
    _secPlatform = 'Android';
    _secMobile = /Mobile|Phone|Pixel/i.test(_uaChosen) ? '?1' : '?0';
} else if (/Web0S|Tizen|SMART-TV|SmartHub|Maple2012/i.test(_uaChosen)) {
    _secPlatform = 'Linux';
    _secMobile = '?0';
} else if (/Macintosh|Mac OS X/i.test(_uaChosen)) {
    _secPlatform = 'macOS';
    _secMobile = '?0';
} else if (/Windows/i.test(_uaChosen)) {
    _secPlatform = 'Windows';
    _secMobile = '?0';
} else if (/X11|Linux/i.test(_uaChosen)) {
    _secPlatform = 'Linux';
    _secMobile = '?0';
}

// 'Sec-CH-UA-Platform': `"${_secPlatform}"`,
// 'Sec-CH-UA-Mobile': _secMobile,
```

- [ ] **Step 4: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(coherence): C5 + C6 body declarations + Sec-CH-UA derivados del perfil real"
```

---

## Task 10: Fix C7 — Quitar Connection/Keep-Alive del EXTHTTP

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Localizar emisión y comentar**

```bash
grep -n '"Connection":"keep-alive"\|"Keep-Alive":"timeout' IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

```javascript
// REMOVED 2026-04-30 — C7: Connection y Keep-Alive son hop-by-hop headers
// (RFC 7230 §6.1) — el shield NGINX los descarta antes del upstream.
// Su presencia en EXTHTTP no afecta upstream, solo añade ruido (~74k líneas).
// 'Connection': 'keep-alive',
// 'Keep-Alive': 'timeout=300, max=1000',
```

- [ ] **Step 2: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(generator): C7 remove Connection/Keep-Alive from EXTHTTP (hop-by-hop noise)"
```

---

## Task 11: Fix A1-A2-A3 — Header global per-profile + dedupe EXT-X-DEFINE

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

- [ ] **Step 1: Localizar generador del header global (función que produce `#EXT-X-VERSION:7` block)**

```bash
grep -n "omega-live-P0\|P0_PERPROFILE_BULLETPROOF\|EXT-X-DEFINE" IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
```

- [ ] **Step 2: A1 fix — DATERANGE dinámico**

```javascript
// ANTES:
header.push(`#EXT-X-DATERANGE:ID="omega-live-P0",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="HDR10+DV-P81-P10",X-HDR-MAX-CLL=10000`);

// DESPUÉS: si la lista mezcla múltiples perfiles emitir MULTI; si single-profile, ese
const _profilesInList = options.profilesEmitted || ['MULTI'];
const _drId = _profilesInList.length === 1 ? `omega-live-${_profilesInList[0]}` : 'omega-live-MULTI';
header.push(`#EXT-X-DATERANGE:ID="${_drId}",X-OMEGA-TYPE="LIVE-CATCHUP",X-HDR-TYPE="HDR10+DV-P81-P10",X-HDR-MAX-CLL=10000`);
```

- [ ] **Step 3: A2 fix — OMEGA_BUILD VALUE per-list**

```javascript
// ANTES:
header.push(`#EXT-X-DEFINE:NAME="OMEGA_BUILD",VALUE="P0_PERPROFILE_BULLETPROOF"`);

// DESPUÉS:
const _buildValue = `${_profilesInList.join('+')}_PERPROFILE_BULLETPROOF_v5.4`;
header.push(`#EXT-X-DEFINE:NAME="OMEGA_BUILD",VALUE="${_buildValue}"`);
```

- [ ] **Step 4: A3 fix — eliminar EXT-X-DEFINE huérfano (sin VALUE)**

```bash
grep -n '#EXT-X-DEFINE:NAME="OMEGA_BUILD"' IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js | head
```

Localizar el segundo EXT-X-DEFINE huérfano (el que sale en L91 sin VALUE) y eliminar/comentar:

```javascript
// REMOVED 2026-04-30 — A3: emisión duplicada sin VALUE huérfana.
// La definición canónica con VALUE ya se emite arriba.
// header.push(`#EXT-X-DEFINE:NAME="OMEGA_BUILD"`);
```

- [ ] **Step 5: Sintaxis + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "fix(generator): A1-A3 header global per-profile + dedupe EXT-X-DEFINE huérfano"
```

---

## Task 12: LAB Excel — VBA validator coherence + UA pool sheet

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_CoherenceGuard.bas`
- Create: `IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_UAPool.bas`

> **Nota Stage 2:** estos `.bas` se generan en el filesystem ahora; importarlos a `LAB.xlsm` requiere Excel cerrado + COM batch (skill `iptv-excel-safe-mode`). Stage 2 separado para cumplir doctrina.

- [ ] **Step 1: Crear `mod_PRISMA_CoherenceGuard.bas`**

```vb
Attribute VB_Name = "mod_PRISMA_CoherenceGuard"
Option Explicit

' PRISMA Coherence Guard — bloquea export si hay incoherencia HDR/SDR.
' Llamado desde btnExportToFrontend antes de Brain_ExportToFrontend.
' Reglas:
'   R1: si hdr_canonical=sdr → video-filter NO debe contener 'st2084'
'   R2: si hdr_canonical=hdr10 → video-filter DEBE contener 'st2084'
'   R3: si hdr_canonical=hlg → video-filter DEBE contener 'arib-std-b67'
'   R4: nits_target debe coincidir con tier (sdr=100, hlg<=400, hdr10>=1000, hdr10+>=1500, dv>=4000)

Public Function ValidateCoherence() As Boolean
    Dim ws As Worksheet
    Dim profileRow As Long
    Dim hdr As String
    Dim filter As String
    Dim nits As Long
    Dim violations As String
    
    Set ws = ThisWorkbook.Sheets("7_NIVEL_3_CHANNEL")
    violations = ""
    
    For profileRow = 2 To 7  ' P0..P5
        hdr = LCase(Trim(ws.Cells(profileRow, ws.Range("hdr_canonical_col").Column).Value))
        filter = LCase(Trim(ws.Cells(profileRow, ws.Range("video_filter_col").Column).Value))
        nits = CLng(Val(ws.Cells(profileRow, ws.Range("nits_target_col").Column).Value))
        
        If hdr = "sdr" And InStr(filter, "st2084") > 0 Then
            violations = violations & "R1 fail: P" & (profileRow - 2) & " sdr+st2084" & vbCrLf
        End If
        If (hdr = "hdr10" Or hdr = "hdr10+" Or hdr = "dolby-vision") And InStr(filter, "st2084") = 0 Then
            violations = violations & "R2 fail: P" & (profileRow - 2) & " " & hdr & " sin st2084" & vbCrLf
        End If
        If hdr = "hlg" And InStr(filter, "arib-std-b67") = 0 Then
            violations = violations & "R3 fail: P" & (profileRow - 2) & " hlg sin arib-std-b67" & vbCrLf
        End If
        Select Case hdr
            Case "sdr": If nits > 200 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " sdr nits>200" & vbCrLf
            Case "hlg": If nits > 500 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hlg nits>500" & vbCrLf
            Case "hdr10": If nits < 1000 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hdr10 nits<1000" & vbCrLf
            Case "hdr10+": If nits < 1500 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " hdr10+ nits<1500" & vbCrLf
            Case "dolby-vision": If nits < 4000 Then violations = violations & "R4 fail: P" & (profileRow - 2) & " dv nits<4000" & vbCrLf
        End Select
    Next profileRow
    
    If Len(violations) > 0 Then
        MsgBox "Coherence Guard violations:" & vbCrLf & violations, vbCritical, "PRISMA"
        ValidateCoherence = False
    Else
        ValidateCoherence = True
    End If
End Function
```

- [ ] **Step 2: Crear `mod_PRISMA_UAPool.bas`**

```vb
Attribute VB_Name = "mod_PRISMA_UAPool"
Option Explicit

' PRISMA UA Pool — escribe pool 2026-fresh a hoja 33_UA_POOL.
' Llamado desde btnRefreshUAPool. Sobrescribe hoja entera.

Public Sub RefreshUAPool()
    Dim ws As Worksheet
    Dim pool As Variant
    Dim i As Long
    
    pool = Array( _
        "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager", _
        "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeCross/1.0 SamsungBrowser/2.6 Chrome/63.0.3239.84 TV Safari/538.1", _
        "Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (Linux; Tizen 6.5; SmartHub; SMART-TV; SmartTV; U; Maple2012) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36", _
        "Mozilla/5.0 (Linux; Android 12; AFTKA Build/STT1.231215.001) AppleWebKit/537.36 (KHTML, like Gecko) Silk/138.5.7 like Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240105.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36", _
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", _
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", _
        "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0", _
        "Kodi/21.0 (Windows 10) Version/21.0-Omega", _
        "OTT Navigator/1.7.0.0 (Linux;Android 13) ExoPlayer/2.19.1", _
        "TiviMate/4.7.0 (Linux;Android 13) ExoPlayer/2.19.1" _
    )
    
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets("33_UA_POOL")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = "33_UA_POOL"
    End If
    
    ws.Cells.Clear
    ws.Cells(1, 1).Value = "INDEX"
    ws.Cells(1, 2).Value = "USER_AGENT"
    ws.Cells(1, 3).Value = "DEVICE"
    For i = 0 To UBound(pool)
        ws.Cells(i + 2, 1).Value = i
        ws.Cells(i + 2, 2).Value = pool(i)
        ws.Cells(i + 2, 3).Value = ClassifyDevice(CStr(pool(i)))
    Next i
    
    MsgBox "UA Pool refreshed: " & (UBound(pool) + 1) & " UAs en hoja 33_UA_POOL", vbInformation
End Sub

Private Function ClassifyDevice(ua As String) As String
    If InStr(ua, "Web0S") > 0 Then
        ClassifyDevice = "WebOS-TV"
    ElseIf InStr(ua, "Tizen") > 0 Then
        ClassifyDevice = "Tizen-TV"
    ElseIf InStr(ua, "SHIELD") > 0 Then
        ClassifyDevice = "Android-TV"
    ElseIf InStr(ua, "AFTKA") > 0 Then
        ClassifyDevice = "Fire-TV"
    ElseIf InStr(ua, "Pixel") > 0 Then
        ClassifyDevice = "Android-Mobile"
    ElseIf InStr(ua, "Macintosh") > 0 Then
        ClassifyDevice = "macOS"
    ElseIf InStr(ua, "Windows") > 0 Then
        ClassifyDevice = "Windows"
    ElseIf InStr(ua, "Kodi") > 0 Then
        ClassifyDevice = "Kodi"
    ElseIf InStr(ua, "OTT Navigator") > 0 Then
        ClassifyDevice = "OTT-Navigator"
    ElseIf InStr(ua, "TiviMate") > 0 Then
        ClassifyDevice = "TiviMate"
    Else
        ClassifyDevice = "Generic"
    End If
End Function
```

- [ ] **Step 3: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_CoherenceGuard.bas IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/mod_PRISMA_UAPool.bas
git commit -m "feat(lab-vba): mod_PRISMA_CoherenceGuard + mod_PRISMA_UAPool — Stage 2 import to LAB.xlsm pending"
```

---

## Task 13: Backend PHP — endpoint /api/audit/lab-coherence

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api_audit_coherence.php`

> **Nota:** archivo creado en source-tree. NO se deploya al VPS en este plan (doctrina iptv-vps-touch-nothing). Deploy en sesión aparte previa autorización.

- [ ] **Step 1: Crear endpoint PHP**

```php
<?php
/**
 * /api/audit/lab-coherence — devuelve diff JS↔LAB↔Backend por perfil.
 *
 * Lee:
 *   - LAB_CALIBRATED.json (Stage 1.6 bulletproof embed)
 *   - ape-profiles-config.js parseado para sacar settings.{hdr_canonical,nits_target}
 *   - prisma_state.json del backend
 * Devuelve:
 *   - status: ok|drift
 *   - drifts[]: cada uno con {layer_a, layer_b, key, value_a, value_b}
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$labPath = __DIR__ . '/../downloads/LAB_CALIBRATED.json';
$jsPath  = __DIR__ . '/../../frontend/js/ape-v9/ape-profiles-config.js';
$bePath  = __DIR__ . '/prisma_state.json';

function loadJson(string $p): array {
    if (!file_exists($p)) return [];
    $c = file_get_contents($p);
    if ($c === false) return [];
    $j = json_decode($c, true);
    return is_array($j) ? $j : [];
}

function extractJsField(string $jsContent, string $profileKey, string $fieldKey): ?string {
    // Regex muy básica: "P0": { ... "settings": { ... "hdr_canonical": "..." ... } }
    $pattern = '/"' . preg_quote($profileKey, '/') . '"\s*:\s*\{[^}]*"settings"\s*:\s*\{[^}]*"' . preg_quote($fieldKey, '/') . '"\s*:\s*"([^"]*)"/s';
    if (preg_match($pattern, $jsContent, $m)) return $m[1];
    return null;
}

$lab = loadJson($labPath);
$be = loadJson($bePath);
$jsRaw = @file_get_contents($jsPath) ?: '';

$drifts = [];
foreach (['P0','P1','P2','P3','P4','P5'] as $p) {
    foreach (['hdr_canonical','nits_target'] as $k) {
        $vJs  = extractJsField($jsRaw, $p, $k);
        $vLab = $lab['profiles'][$p][$k] ?? null;
        $vBe  = $be['profiles'][$p][$k] ?? null;
        if ($vJs !== null && $vLab !== null && $vJs !== (string)$vLab) {
            $drifts[] = ['layer_a' => 'JS', 'layer_b' => 'LAB', 'profile' => $p, 'key' => $k, 'value_a' => $vJs, 'value_b' => (string)$vLab];
        }
        if ($vLab !== null && $vBe !== null && (string)$vLab !== (string)$vBe) {
            $drifts[] = ['layer_a' => 'LAB', 'layer_b' => 'BE', 'profile' => $p, 'key' => $k, 'value_a' => (string)$vLab, 'value_b' => (string)$vBe];
        }
    }
}

echo json_encode([
    'status' => count($drifts) === 0 ? 'ok' : 'drift',
    'timestamp' => date('c'),
    'drift_count' => count($drifts),
    'drifts' => $drifts,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
```

- [ ] **Step 2: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api_audit_coherence.php
git commit -m "feat(backend): /api/audit/lab-coherence endpoint — diff JS↔LAB↔BE drift detection (deploy pending)"
```

---

## Task 14: Toolkit Python — `coherence_baseline.py` smoke comparativa

**Files:**
- Create: `IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/coherence_baseline.py`

- [ ] **Step 1: Crear script comparativo pre/post fix**

```python
#!/usr/bin/env python3
"""
coherence_baseline.py — Compara dos scorecards (pre y post fix) y reporta delta.

Usage:
    python coherence_baseline.py <pre.json> <post.json>
"""
import json
import sys
from pathlib import Path


def main(argv):
    if len(argv) < 3:
        print("Usage: coherence_baseline.py <pre.json> <post.json>")
        sys.exit(1)

    pre = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    post = json.loads(Path(argv[2]).read_text(encoding="utf-8"))

    keys = sorted(set(pre.keys()) | set(post.keys()))
    print(f"{'Check':<40}{'PRE':>12}{'POST':>12}{'DELTA':>12}")
    print("-" * 76)
    regressions = 0
    improvements = 0
    for k in keys:
        if k.startswith("TOTAL_"):
            continue
        a = int(pre.get(k, 0))
        b = int(post.get(k, 0))
        delta = b - a
        if delta < 0:
            improvements += 1
        elif delta > 0:
            regressions += 1
        marker = "✓" if delta < 0 else ("✗" if delta > 0 else " ")
        print(f"{marker} {k:<38}{a:>12}{b:>12}{delta:>+12}")
    print("-" * 76)
    print(f"Improvements: {improvements} | Regressions: {regressions}")
    sys.exit(0 if regressions == 0 else 2)


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 2: Commit**

```bash
git add IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/coherence_baseline.py
git commit -m "feat(toolkit): coherence_baseline.py pre/post smoke comparativa"
```

---

## Task 15: KODIPROP manifest_headers + stream_headers (sintaxis Kodi correcta)

**Files:**
- Modify: `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`

**Context:** Kodi `inputstream.adaptive` separa headers para manifest vs segments. Sintaxis estricta:
- Separador `&` (NO comas, NO punto y coma)
- NO espacios alrededor del `=` ni del `&`
- `manifest_headers` aplica al `.m3u8` (1 petición)
- `stream_headers` aplica a CADA `.ts`/`.m4s` (decenas/min)
- **CRÍTICO:** ambos deben tener el MISMO User-Agent — Flussonic crea sesión al recibir manifest y valida que segmentos vengan del mismo cliente; si cambia → corte a 2-6s
- Manifest: `Accept=application/vnd.apple.mpegurl,*/*`
- Segments: `Accept=video/mp2t,video/MP2T,*/*` + `Accept-Encoding=identity` (gzip corrompe video)

- [ ] **Step 1: Localizar emisión KODIPROP per-canal y agregar manifest_headers + stream_headers**

```bash
grep -n "inputstream.adaptive.network_user_agent\|inputstream.adaptive.network_list_hash" IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js | head
```

- [ ] **Step 2: Construir helper `buildKodiHeaders()` cerca del bloque KODIPROP**

```javascript
// Helper SSOT — construye manifest_headers / stream_headers con sintaxis Kodi estricta:
//   - separador `&` (no comas, no espacios alrededor del = ni del &)
//   - mismo User-Agent en ambos (Flussonic session affinity)
//   - manifest: Accept=application/vnd.apple.mpegurl,*/*
//   - stream: Accept=video/mp2t,*/* + Accept-Encoding=identity (gzip corrompe video)
function buildKodiHeaders(ua, referer, origin, kind /* 'manifest' | 'stream' */) {
    const sep = '&';
    const parts = [];
    parts.push(`User-Agent=${ua}`);
    if (referer) parts.push(`Referer=${referer}`);
    if (origin) parts.push(`Origin=${origin}`);
    if (kind === 'manifest') {
        parts.push(`Accept=application/vnd.apple.mpegurl,*/*`);
    } else {
        parts.push(`Accept=video/mp2t,video/MP2T,*/*`);
        parts.push(`Accept-Encoding=identity`);  // CRÍTICO: gzip corrompe segmentos .ts
    }
    parts.push(`Accept-Language=es-ES,en;q=0.9`);
    parts.push(`Connection=keep-alive`);
    return parts.join(sep);
}
```

- [ ] **Step 3: Emitir `manifest_headers` + `stream_headers` per canal**

Justo después de la emisión `network_user_agent` (L7249) y antes del bloque CMAF, agregar:

```javascript
// Kodi manifest_headers + stream_headers (sintaxis & estricta, mismo UA crítico)
const _refererCanonical = (() => {
    try {
        const u = new URL(_streamUrl796);
        return `${u.protocol}//${u.hostname}/`;
    } catch { return ''; }
})();
const _originCanonical = _refererCanonical ? _refererCanonical.replace(/\/$/, '') : '';
const _manifestHdrs = buildKodiHeaders(_uaChosen, _refererCanonical, _originCanonical, 'manifest');
const _streamHdrs = buildKodiHeaders(_uaChosen, _refererCanonical, _originCanonical, 'stream');
lines.push(`#KODIPROP:inputstream.adaptive.manifest_headers=${_manifestHdrs}`);
lines.push(`#KODIPROP:inputstream.adaptive.stream_headers=${_streamHdrs}`);
```

> **Importante:** `_streamUrl796` debe estar en scope. Si no, derivar el referer del `baseUrl` del provider. Verificar grep del símbolo antes de implementar.

- [ ] **Step 4: Sintaxis check + commit**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git add IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git commit -m "feat(generator): KODIPROP manifest_headers + stream_headers Kodi-correct (& separator, same UA, Accept-Encoding=identity)"
```

---

## Task 16: Smoke test E2E

- [ ] **Step 1: Sintaxis final ambos JS**

```bash
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node --check IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
```

Expected: ambos OK.

- [ ] **Step 2: User regenera lista desde la UI (manual)**

> Usuario: abrir frontend, click "Generate Audited" sobre provider de prueba, descargar `.m3u8` resultante a `Downloads/`.

- [ ] **Step 3: Correr audit post-fix**

```bash
python IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/audit_lista_emitted.py "C:/Users/HFRC/Downloads/APE_LISTA_<NEW_TIMESTAMP>.m3u8" --out IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/post_scorecard.json
```

- [ ] **Step 4: Comparativa pre/post**

```bash
python IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/coherence_baseline.py IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/baseline_scorecard.json IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/post_scorecard.json
```

Expected: B3, B4, B5, B6, C1, C2, C3, C5, C6, C7 todos a 0 o muy reducidos. A1, A2, A3, A4 reducidos a 0 o coherente.

- [ ] **Step 5: Commit final integrador**

```bash
git add -A IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/
git commit -m "test(coherence): post-fix scorecard + delta vs baseline"
```

---

## Verification end-to-end

- ✓ Sintaxis JS válida en ambos archivos modificados
- ✓ CMAF/APE forensic markers preservados (1253 ocurrencias intactas)
- ✓ Lista regenerada → B3 (60000) = 0, B4-B5 (vacíos) = 0, B6 (codec-family vacío) = 0
- ✓ C2 (X-Forwarded-For/X-Real-IP/X-Client-IP con IP Hetzner) = 0
- ✓ C3 (Akamai/Varnish forensic fakes) = 0
- ✓ C1 (10 X-User-Agent-* falsos) = 0
- ✓ B1 (st2084 + SDR contradicción) = 0 — solo P0/P1/P2 emiten st2084
- ✓ Endpoint PHP devuelve `status: ok` (drift=0) post-fix
- ✓ Toolkit `audit_lista_emitted.py` ejecutable sobre cualquier `.m3u8`
- ✓ Stage 2 (LAB Excel COM import + VPS deploy PHP) documentado pero no aplicado

## Rollback

- Snapshot pre-fix en `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-30_pre_coherence_fix/`
- 14 commits atómicos → `git revert <hash>` granular si una task rompe algo
- Cada task es ortogonal a las demás (excepto Task 5 que toca 2 archivos)

## Stage 2 (fuera de este plan)

1. Importar `mod_PRISMA_CoherenceGuard.bas` + `mod_PRISMA_UAPool.bas` a `LAB.xlsm` (Excel cerrado, COM batch — skill `iptv-excel-safe-mode`)
2. Crear hoja `33_UA_POOL` y poblar con `RefreshUAPool` macro
3. Hookear `ValidateCoherence` en `btnExportToFrontend` antes de `Brain_ExportToFrontend`
4. Promover `hdr_canonical` + `nits_target` a hoja `7_NIVEL_3_CHANNEL` LAB Excel (placeholders en `32_PLACEHOLDERS_MAP`)
5. Deploy `api_audit_coherence.php` al VPS (post auth explícito)
6. Cron diario que llama el endpoint y emite alerta Slack/log si drift detectado

## Out of scope explícito (no tocar en este plan)

- **A5 — `Referer/Origin: https://www.netflix.com/`** se preserva. La memoria `reference_working_list_0411_recipe.md` lo identifica como parte del recipe verificado funcional (Web0S UA + netflix.com Referer + .m3u8 + STREAM-INF con `?profile=PX`). Cambiar Referer requiere doctrina explícita y A/B test contra provider real.
- 73 líneas CMAF/APE forensic markers existentes — OMEGA-NO-DELETE
- Shield NGINX, Lua reactor, warmers VPS — autopista doctrine
- WireGuard, DNS, ADB persistence daemon — Fire TV DNS protection rule
- Las 35 ADB Master Directives v1.4 — capa complementaria
- EXTHTTP single-value headers (Connection/Keep-Alive ya son single-value, los quitamos por C7 razón distinta)
- URLs upstream (R1-R7 del URL Constructor — verbatim, ya cumple)
