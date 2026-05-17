# ARTIFACT — MATERIAL VALIDATION TESTS (A-F · manifestación física)

**Generated:** 2026-05-17
**Source:** User directive — PROMPT MAESTRO §IV "Validación Material en el Mundo Real"
**Authority:** S12 QA Broadcast Validator + S9 Player Engineer + S4 Color Scientist
**Mission:** Toda lista .m3u8 generada DEBE pasar estos 6 tests ANTES de considerarse entregable

---

## 1. Resumen de tests

| Test | Nombre | Capa | Tiempo aprox |
|---|---|---|---|
| **A** | Validación sintáctica | manifest parser | < 1 min |
| **B** | Reproducción multi-player (5 motores) | client players | 5-10 min |
| **C** | Manifestación HDR observable | display pipeline | 2 min |
| **D** | Continuidad 60 minutos sin stall | end-to-end | 60 min |
| **E** | Switch de tier sin glitch | player ABR | 3-5 min |
| **F** | VMAF observado ≥ 93 | quality metric | offline batch |

---

## 2. TEST A — Validación sintáctica

### Objetivo
La lista cumple RFC 8216 / 8216bis · cero errores de parser estricto.

### Herramientas
| Tool | Uso |
|---|---|
| Apple `mediastreamvalidator` (mac) | gold-standard HLS strict validator |
| `hlsanalyzer` (CLI) | alternative cross-platform |
| `frontend/js/m3u8-parser-strict-ultimate.js` (CA11 in-repo) | repo native strict parser |
| `.agent/scripts/hls_strict_validator.py` | Python in-repo |

### Comando
```bash
# Apple mediastreamvalidator (si en macOS)
mediastreamvalidator -v https://example.com/master.m3u8

# Repo native CA11
node IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-parser-strict-ultimate.js /path/to/list.m3u8

# Python strict
python3 IPTV_v5.4_MAX_AGGRESSION/.agent/scripts/hls_strict_validator.py /path/to/list.m3u8
```

### Pass criteria
- Zero CRITICAL findings
- Zero RFC 8216 violations
- Zero orphan STREAM-INF
- Zero LL-HLS tags in M3U Plus catalogs
- Zero EXTHTTP trap headers

### Blocker
Si encuentra CRITICAL → bloquear publicación · invocar `iptv-hls-validator` skill (S1) para fix.

---

## 3. TEST B — Reproducción multi-player (mínimo 5 motores)

### Objetivo
La lista reproduce sin error en al menos 5 motores de player distintos.

### Players mandatorios

| Player | Plataforma | Test mínimo |
|---|---|---|
| **hls.js** | Chrome / Firefox / Edge | abre master, play 60s sin error |
| **ExoPlayer** | Android TV / Fire TV (OTT Nav o TiviMate) | abre canal, play 60s, switch ok |
| **AVPlayer** | iOS / tvOS / macOS Safari | abre canal, HDR detect, play 60s |
| **VLC** | Windows / macOS / Linux | abre canal, play 60s, codec info muestra Main10 si HDR |
| **Kodi / TiviMate / IPTV Smarters** | Android TV | abre lista, navega 3 canales |

### Test script genérico per player
```text
1. Cargar la lista
2. Seleccionar canal premium (Tier 1 o Tier 4 si disponible)
3. Esperar 1st frame · medir VST
4. Reproducir 60 segundos
5. Verificar: cero stalls, cero error overlays
6. Cerrar y reabrir 3 veces · sin warm-up issues
```

### Pass criteria
- 5/5 motores logran 1st frame en < 3s
- Zero stalls durante 60s en cualquiera
- Cero `unexpected end of stream` en OkHttp logs
- ExoPlayer logs `Main10` decoder activado para tier HDR

### Blocker
Si <5 motores reproducen → identificar player culpable · invocar `player-compatibility-engineer` subagent.

---

## 4. TEST C — Manifestación HDR observable

### Objetivo
Si la lista declara HDR (VIDEO-RANGE=PQ/HLG), el TV debe **mostrar HDR físicamente** — no SDR ni tone-mapped pseudo-HDR.

### Setup
- TV con HDR10 / Dolby Vision capability + EDID negotiable
- Cable HDMI 2.0a+ certified
- Player connected (Fire TV 4K Max, Onn 4K, Apple TV 4K, etc.)

### Procedimiento
1. Abrir canal Tier 1 (4K@60 HDR10)
2. En el menú info del TV (botón "Info" del remote), verificar:
   - Pantalla muestra "**HDR10**" o "**Dolby Vision**"
   - NO debe decir "SDR" ni "HDR (tone-mapped)" ni "HLG → SDR conversion"
3. Comparar lado a lado con stream SDR conocido (T11) → diferencia visual de contraste/colores

### Tools
- HDFury Diva / Vertex2 (EDID analyzer) — confirma HDR signaling
- TV menu Info / EIA-CEA-861 InfoFrame — confirma transfer function
- Apple TV "Audio & Video" → "Match Content" muestra range detected

### Pass criteria
- TV info pantalla muestra HDR mode activo
- No tone-mapping warning
- Color volume expanded (contrast > 800 nits observable)

### Blocker
Si TV muestra SDR aunque manifest declare PQ → eslabón roto · ver `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` §7 failure modes table.

---

## 5. TEST D — Continuidad 60 minutos sin stall

### Objetivo
Reproducción sostenida durante 60 minutos sin interrupciones.

### Setup
- Reproducir canal premium (Tier 1 o 4)
- Player con telemetría activa (preferible OTT Nav + Conviva engine wired)

### Procedimiento
1. Iniciar reproducción
2. Dejar correr 60 minutos sin tocar
3. Medir telemetría continua:
   - Stall count (target: 0)
   - Rebuffer ratio (target: < 0.1%)
   - Zap time si se cambia de canal (target: < 1.2s)

### Tools
- Conviva QoE engine (in-repo) → `window.ConvivaQoE.getActiveSnapshot()` al finalizar
- ADB logcat (Fire TV / Android TV) → grep `MediaCodecLogger`
- Prometheus `iptv_stall_count_total`

### Pass criteria
- `stall_count == 0` durante 60 min
- `rebuffer_ratio < 0.001` (0.1%)
- `zap_time_p95 < 1.2s` (sample 10 zaps a otros canales)

### Blocker
- Si stall > 0 → invocar `stream-watchdog-sre` skill + investigar eslabón culpable
- Si rebuffer > 0.1% → ABR mal tuneado · revisar Bondad 3

---

## 6. TEST E — Switch de tier sin glitch

### Objetivo
Cuando el player cambia variant (ABR upgrade/downgrade entre Tier 1 ↔ Tier 5 por ejemplo), no debe haber frame drop visible ni glitch.

### Setup
- Master playlist con mínimo 3 tiers (top + mid + universal)
- Player + simulador de ancho de banda variable (network throttle dev tool)

### Procedimiento
1. Iniciar reproducción
2. Throttle bandwidth a 30 Mbps → player elige T1
3. Throttle a 8 Mbps → player downgrade a T5
4. Throttle de regreso a 30 Mbps → player upgrade a T1
5. Observar cada transition:
   - Frame drop visible? (target: no)
   - Audio glitch? (target: no)
   - Resolution change visible pero suave (acceptable)

### Tools
- Chrome DevTools Network throttle (para hls.js)
- `tc qdisc` en Linux (para clients Linux)
- WANem (network emulator) para Android TV

### Pass criteria
- Zero visual glitch (no black frame, no green frame, no compression artifact spike)
- Zero audio dropout
- STABLE-VARIANT-ID previene yoyo (si emitido) — < 2 switches per minuto bajo throttle estable

### Blocker
Si glitch visible → revisar `EXT-X-INDEPENDENT-SEGMENTS` + `STABLE-VARIANT-ID` emission · invocar S9.

---

## 7. TEST F — VMAF observado ≥ 93

### Objetivo
La calidad visual real (no declarada) iguala o supera VMAF 93 en panel calibrado.

### Setup
- Master uncompressed reference clip (10 segundos, 4K HDR si aplica)
- Encoder local que produce el mismo clip a Tier 1 (28 Mbps HEVC Main10)
- ffmpeg compilado con libvmaf

### Procedimiento
```bash
# 1. Decodificar el clip del stream IPTV a YUV raw
ffmpeg -i <stream_t1_segment.m4s> -t 10 -pix_fmt yuv420p10le decoded.yuv

# 2. Comparar contra reference
ffmpeg -i reference.yuv -i decoded.yuv -lavfi libvmaf=model_path=vmaf_4k_v0.6.1.pkl -f null -

# 3. Output incluye: VMAF score (0-100)
```

### Pass criteria
- VMAF score ≥ 93 para Tier 1 (premium)
- VMAF score ≥ 88 para Tier 5 (1080p HDR)
- VMAF score ≥ 80 para Tier 9 (1080p SDR)
- VMAF score ≥ 70 para Tier 11 (universal fallback)

### Tools
- libvmaf (Netflix open source)
- ffmpeg with `-lavfi libvmaf`
- Calibrated reference monitor (Sony PVM-A250 o equivalente) para panel evaluation

### Blocker
Si VMAF < threshold → provider bitrate insuficiente para resolución declarada (fake-4K trap) · invocar `codec-quality-analyzer` skill.

---

## 8. Test execution matrix (when to run which)

| Trigger | Tests obligatorios | Tests opcionales |
|---|---|---|
| New list generated | A · B (3/5 mínimo) | C, E |
| Generator change committed | A · B (5/5) · E | C, F |
| Nginx VPS config change | A · D | B, E |
| Codec ladder change (cascada) | A · B (5/5) · C · F | D |
| New channel added | A | B, C |
| Pre-production sprint | A · B · C · D · E · F (ALL) | — |
| Hotfix urgent | A · smoke B (1 player) | — |

---

## 9. Test automation status

| Test | Automatable? | Status actual |
|---|---|---|
| A | Yes (CI runnable) | ✅ scripts existentes (CA11, hls_strict_validator.py) |
| B | Partial (hls.js headless via Playwright) | ⏳ scaffolding · 2/5 motores requieren device físico |
| C | No (requires display + observer) | ❌ manual only |
| D | Yes (Conviva engine + 60-min recording) | ⏳ wire pending (Conviva untracked) |
| E | Partial (Chrome DevTools throttle scriptable) | ⏳ pendiente |
| F | Yes (ffmpeg libvmaf en CI) | ⏳ needs reference clips |

---

## 10. CI/CD integration plan (next session)

```yaml
# .github/workflows/iptv-validate.yml
name: IPTV Validation
on: [pull_request, push]
jobs:
  test-a-syntax:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: node IPTV_v5.4_MAX_AGGRESSION/frontend/js/m3u8-parser-strict-ultimate.js samples/*.m3u8

  test-b-players-headless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx playwright test tests/hls-js-e2e.spec.ts

  test-f-vmaf:
    runs-on: ubuntu-latest
    needs: [test-a-syntax]
    steps:
      - run: docker run --rm jrottenberg/ffmpeg -i samples/t1.m4s -i samples/reference.yuv -lavfi libvmaf -f null -
```

---

## 11. Acceptance gates summary (GO/NO-GO per list)

| Gate | Pass | Action si fail |
|---|---|---|
| Test A | 100% | BLOCK publication |
| Test B | ≥ 4/5 motores PASS | WARN si 4/5; BLOCK si < 4 |
| Test C | HDR confirmed visualmente | WARN (no block) si single TV test |
| Test D | stall=0, rebuffer<0.1% | BLOCK si stall>0 |
| Test E | zero visual glitch | BLOCK si glitch detected |
| Test F | VMAF >= threshold per tier | WARN si VMAF -5pts, BLOCK si VMAF -10pts |

---

## 12. Cross-references

- `ARTIFACT_M3U8_VALIDATION_SPEC.md` — gates de Test A
- `ARTIFACT_PLAYER_COMPATIBILITY_MATRIX.md` — players de Test B
- `ARTIFACT_HDR10_METADATA_TRIFECTA.md` — qué debe ver Test C
- `ARTIFACT_QOE_DASHBOARD_SPEC.md` — telemetría para Test D
- `ARTIFACT_HEVC_11TIER_CASCADE_DEFINITIVE.md` — tiers para Test E
- `ARTIFACT_TAG_PARSING_GUARANTEE.md` — garantía universal Test B
- `ARTIFACT_CHAIN_OF_MANIFESTATION_11_ESLABONES.md` — failure mode analysis

---

**Fin Material Validation Tests A-F.**
