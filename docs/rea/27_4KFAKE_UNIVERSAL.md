# 27 · 4K fake universal + 8K fake / 4K premium en canales nativos (t60)

**Fecha:** 2026-10-28 · **Tarea:** t60 · **Orden directa del propietario.** REPO-ONLY: sin deploy, sin publicar lista, sin commit.
**Generador:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` · 11.991 → **12.058 líneas** (+67, sólo adiciones) · sha256 **`d5dacb06ab74c66c8721d74486050d35821ee11ccbc2f1f7f8be2c5ceace1930`**

## 1. Qué hace

| # | Cambio | Implementación |
|---|---|---|
| 1 | **Cada** `#EXT-X-STREAM-INF` declara `RESOLUTION=3840x2160` y `CODECS="hvc1.2.4.L153.B0,mp4a.40.2"` | post-proceso de `_finalM3U` en `generateChannelEntry`: reescribe **sólo** esos dos atributos |
| 2 | Marca `#EXT-X-APE-4KFALSE-MODE:ACTIVE` por canal | **ya existía** (HEAD L8514) ⇒ la guarda evita duplicarla |
| 3 | Canal 4K nativo ⇒ `#EXT-X-APE-8KFAKE:ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` + `#EXT-X-APE-4K-PREMIUM:ACTIVE` | **nuevas** (no estaban en HEAD). Nativo = resolución ≥3840 **o** perfil P1/P0/P2 **o** nombre con `4K/UHD/2160` |
| 4 | `RESOLUTION=7680x4320` | **NO** por defecto. Sólo si `window.APE_8K_DECLARE === true` (flag explícito, OFF) |

## 2. Qué NO se toca (verificado por conteo antes/después)

`#EXTINF` (1) · URLs del canal · `#EXTVLCOPT` (122) · `#KODIPROP` (86) · `#EXTHTTP` (1, 203 claves) · `#EXT-X-APE-*` legacy (1.293 en fuente) · las 54 `#EXTATTRFROMURL:X-APE-*` · la línea `/a` (sigue siendo **1** con config, **0** sin config) · wrapper (== HEAD). **Cero líneas eliminadas**: el conteo de líneas subió exactamente lo insertado.

## 3. Medición (fixture PRNG)

| Perfil | Nativo | STREAM-INF 4K+HEVC/AAC | sin 8K en STREAM-INF | 8KFAKE | 4K-PREMIUM | 4KFALSE-MODE |
|---|---|---|---|---|---|---|
| P0 (7680x4320) | sí | ✔ | ✔ | 1 | 1 | 1 |
| P1 (3840x2160) | sí | ✔ | ✔ | 1 | 1 | 1 |
| P2 (3840x2160) | sí | ✔ | ✔ | 1 | 1 | 1 |
| P3 (1920x1080) | no | ✔ | ✔ | 0 | 0 | 1 |
| P4 (1280x720) | no | ✔ | ✔ | 0 | 0 | 1 |
| P5 (854x480) | no | ✔ | ✔ | 0 | 0 | 1 |

`BANDWIDTH` / `AVERAGE-BANDWIDTH` / `FRAME-RATE` / `HDCP` / `VIDEO-RANGE` se conservan. Sin duplicados (cada marca aparece 1 vez).
Ejemplo real: `#EXT-X-STREAM-INF:BANDWIDTH=26900000,AVERAGE-BANDWIDTH=21520000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",RESOLUTION=3840x2160,FRAME-RATE=60.000,…`

Propiedad `/a` en **30 corridas** (el UA rota por llamada): 29 con UA no-TiviMate ⇒ `/a=1`; 1 con UA TiviMate ⇒ `/a=0`; **0 violaciones**. `APE_8K_DECLARE=true` ⇒ `RESOLUTION=7680x4320` (verificado).

`node -c` **exit 0** ×3 · sin BOM (byte 47).

## 4. Consecuencia técnica que queda declarada (no es una objeción a la orden)

Esto **declara 4K HEVC Main10 + AAC sobre canales que pueden ser 1080p/AVC/AC3**. Es decir, el `STREAM-INF` deja de describir el bitstream real. Concretamente:
- Contradice `CLAUDE.md` → *10 Criterios de Éxito* #4/#5/#7 y la **Ley Cardinal 1 Nivel↔Resolución**.
- Un player **sin** el daemon/display-side que intente decodificar `hvc1.2.4.L153.B0` sobre bytes AVC **fallará o mostrará negro** (es el riesgo FZ-01 documentado). Aquí el 8K va marcado `NEVER_REAL=1` y **no** se pone 7680x4320 en `RESOLUTION`, que es lo que causaba el freeze: esa mitigación sí se respeta.
- El reconocimiento de canal nativo se apoya en `cfg.resolution` del perfil (P0/P1/P2), no en un probe: sin probe, "nativo" = perfil.

## 5. NOT_RUN

1. **Lista de 10.520 no regenerada ni publicada** (ventana aparte): cifras de 1 canal.
2. **Sin prueba en dispositivo**: no se midió si TiviMate/VLC/OTT reproducen o fallan con `hvc1` declarado sobre AVC.
3. `node -c` valida sintaxis, **no** comportamiento del player.
4. Sin deploy; `_vps_stage/**`, DB y listas intactas; **sin commit**.
