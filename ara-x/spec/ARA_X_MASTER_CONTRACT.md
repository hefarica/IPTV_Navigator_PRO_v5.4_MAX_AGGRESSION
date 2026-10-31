# ARA-X · Contrato maestro y gramática de directivas (D1)

**Tarea:** `t12` (D1) · **Autor:** `hls-architect` (S1 · HLS/M3U8 RFC 8216 + S2 · LL-HLS/CMAF)
**Fecha:** 2026-10-30 · **Estado:** **normativo, spec-only** — no se desplegó, no se sirvió, no se tocó generador, VPS, APK ni lista publicada.
**Consolida:** D2 (`ara_x_codec_policy.md`), D3 (`ARA_X_SYNC_PROTOCOL.md` §13), D4 (`ara_x_device_apply.md`), D5 (`ara_x_decision.md`) + baselines (`ARA_X_PLAYLIST_BLOCK.md`, `ARA_X_SYNC_PROTOCOL.md` §1-§12).
**Artefactos de esta tarea:** este contrato + [`ara_x_directives.json`](ara_x_directives.json) (registro máquina-legible) + [`../scripts/d1_check_master_contract.js`](../scripts/d1_check_master_contract.js) (verificador con drift gate).
**Veredicto:** el bloque canónico de **27 líneas** ya existe en el inyector y **se puede insertar en LAS DOS listas sin perder un canal**; lo que faltaba era (a) la **gramática** que lo hace validable, (b) las **refutaciones** con evidencia y (c) el **contrato Never-Drop** con denominadores correctos. Las tres están aquí y se comprueban con un comando.

---

## 0 · Qué es y qué no es este contrato

### 0.1 Alcance

| Es | No es |
|---|---|
| La **fuente única** de la gramática `#EXT-X-ARA-*`, del bloque global, de los invariantes transversales (M-1..M-16) y del contrato **Never-Drop** | Una implementación: el inyector existe (`ara-x/playlist/ara_x_injector.js`), el validador de invariantes es [`d1_check_master_contract.js`](../scripts/d1_check_master_contract.js) |
| El **árbitro de precedencia** entre D2-D5 y los baselines | El contrato de `/sync` (D3), de aplicación (D4) o del ADC (D5): aquí se **resumen y se enlazan** |
| La lista de **refutaciones** (lo que NO se emite y por qué) con evidencia medida | Un plan de despliegue: `/sync` sigue **404** (R3/R6) y el bloque **no se sirve** todavía |
| El **contrato de conservación** (10.631 canales, 0 URLs mutadas) con los 45 sin variante y los 108 nombres duplicados tratados explícitamente | Una promesa de calidad de imagen: el piso 4K es un **testigo de selección/display**, no píxeles nuevos (D2 §6.1) |

### 0.2 Precedencia normativa

| Rango | Documento | Manda en |
|---|---|---|
| 1 | **este contrato** (`ARA_X_MASTER_CONTRACT.md`) + `ara_x_directives.json` | gramática, placement, M-1..M-16, Never-Drop, refutaciones |
| 2 | D2 `ara_x_codec_policy.md` | verdad de wire, FZ-01, presentación/8K, FPS, HDR, knobs |
| 2 | D3 `ARA_X_SYNC_PROTOCOL.md` §13 | `/sync` v2: firma, replay, esquema, identidad de artefacto |
| 2 | D4 `ara_x_device_apply.md` | aplicación en device, levers, ack, térmica operativa |
| 2 | D5 `ara_x_decision.md` | features, fuzzy/Thompson, escalera, `degrade_mask` |
| 3 | `ARA_X_PLAYLIST_BLOCK.md`, `ARA_X_SYNC_PROTOCOL.md` §1-§12 | baselines **superseded** donde contradigan |
| 4 | `ara_x_codec_cases.json`, `decision_test_vectors.json`, `device_apply.vectors.json` | ejemplos ejecutables (no normativos por sí solos) |

> **Regla de conflicto:** ninguna cláusula de D2-D5 puede contradecir M-1..M-16. Si lo hace, es un **defecto del
> contrato especializado** y se corrige allí, no aquí. Si D1 contradice una medición de R1-R6, gana la medición y
> este contrato se corrige: **el contrato no override la realidad**.

### 0.3 Supersesión explícita de baselines

| Baseline | Qué sobrevive | Qué queda superseded |
|---|---|---|
| `ARA_X_PLAYLIST_BLOCK.md` §3 | la idea de bloque global inerte y el placement (antes del primer `#EXTINF`) | las 16 líneas propuestas; el bloque canónico es el de **27** (§3.1) con Never-Drop |
| `ARA_X_PLAYLIST_BLOCK.md` §2 (correcciones) | **todas** (no `VERSION:6`, no `MAX-RESOLUTION` ambiguo, no LCEVC/AI-SR, no tokens) | nada |
| `ARA_X_PLAYLIST_BLOCK.md` §5 (invariantes) | 1 URL/canal, 0 URLs mutadas, 0 duplicados ARA | se **amplían** a ND-1..ND-8 (§7) con los 45 y los 108 |
| `ARA_X_SYNC_PROTOCOL.md` §1-§12 | topología, endpoints, firma HMAC canónica, matriz de errores | ejemplos v1 de request/response → **§13 v2** es normativo |
| `V0_baseline_verification.md`, `V2_e2e_baseline.md` | números de la captura y del E2E (10.631, 27 líneas, idempotencia) | cualquier lectura de "lista perfecta" |

---

## 1 · Modelo de verdad: tres planos que no se cruzan

La causa raíz de casi todos los hallazgos de R1/R2 es **mezclar planos**. El contrato los separa:

```
┌─ WIRE (bitstream) ─────────────────────────────────────────────────────────────┐
│  Lo que el proveedor sirve. Vive en el catálogo: CODECS, RESOLUTION,           │
│  FRAME-RATE, BANDWIDTH, VIDEO-RANGE. Debe ser VERDAD o estar ausente (M-1).    │
│  Consumidor: el parser HLS del player. NO es actuador.                        │
└───────────────────────────────────────────────────────────────────────────────┘
┌─ DISPLAY (panel / emulación) ──────────────────────────────────────────────────┐
│  Lo que se quiere VER. Vive en el bloque global: piso 4K, techo decode/present,│
│  NEVER-DOWNSCALE, FPS-TARGETS, 8K-MODE:PRESENTATION, intención PQ.             │
│  Consumidor: APK ARA (parser propio). Inerte para el player genérico.          │
└───────────────────────────────────────────────────────────────────────────────┘
┌─ CONTROL (device) ────────────────────────────────────────────────────────────┐
│  Lo que se puede CAMBIAR en el device: levers VPP, térmica, degradación FPS.   │
│  Vive en `/sync` (v2) y en los levers existentes (13). Nunca toca el wire.     │
└───────────────────────────────────────────────────────────────────────────────┘
```

| Hecho | Plano | Dónde se declara | Dónde **no** puede aparecer |
|---|---|---|---|
| resolución del bitstream | WIRE | `#EXT-X-STREAM-INF:RESOLUTION` | en `/sync` (`wire.*` no viaja, D2 §15) |
| piso 4K / never-downscale | DISPLAY | bloque global (`MINIMUM-DECODE-RESOLUTION`, `NEVER-DOWNSCALE`) | como `user_preferred_resolution_*` (prohibido, D4 T4) |
| codec real vs presentación | WIRE | `CODECS` (verdad) + `#EXT-X-APE-CODEC-PREFERRED` (verdad explícita) | como `REQUIRED-CODEC:hvc1` |
| intención PQ | DISPLAY | `VIDEO-RANGE=PQ` + `#EXT-X-APE-HDR-INTENT:…VERIFIED=0` | como "HDR verificado" o DV inventado |
| FPS objetivo | DISPLAY | `FPS-TARGETS` / `#EXT-X-APE-FPS-TARGET` | en `FRAME-RATE` (sigue al medido) |
| degradación | CONTROL | `/sync:degrade.order` | en el wire o en el bloque |
| térmica | CONTROL | `/sync:thermal.*` + ack | como "frío" cuando el sensor es `null` |

---

## 2 · Invariantes maestros (M-1..M-16)

| ID | Invariante | Origen | Gate |
|---|---|---|---|
| **M-1** | El wire es **veraz o ausente**: `CODECS`/`RESOLUTION`/`FRAME-RATE`/`BANDWIDTH` declaran la familia real o se omiten. **Nunca `hvc1.*` sobre `family=h264`** (FZ-01) | D2 POL-1/POL-2 | casos C01-C13 · `d2_check` |
| **M-2** | **Piso 4K = testigo, no actuador**: `MINIMUM-DECODE-RESOLUTION` + `NEVER-DOWNSCALE`; ninguna clave de resolución es actuadora; `resolution` prohibido en la degradación | D2 POL-5 · D5 INV-1 · D4-5 | `d1_check` D1-C/D1-E · `d5_check` |
| **M-3** | **8K = presentación**: 0 `RESOLUTION=7680x4320`; `MAX-PRESENT-RESOLUTION:7680x4320` solo con `8K-MODE:PRESENTATION`; knobs VLC clampados a 3840/2160/60 | D2 POL-3/§6.3/§9 | R1 §5.4 (0 ocurrencias) · `d1_check` D1-F |
| **M-4** | **Ley Cardinal 1**: `level_idc(CODECS) ≥ required(RESOLUTION, FRAME-RATE)`; si no cabe, se baja **fps** o la resolución declarada, **jamás el nivel** | D2 POL-4 | casos C11/C12/C22 |
| **M-5** | **FPS único**: `FRAME-RATE` = medido > declarado > 30, acotado a 60; el target de display va en `FPS-TARGETS`/`FPS-TARGET` | D2 §7 | R1 F-20 · casos C05/C06 |
| **M-6** | **PQ es intención**: `VIDEO-RANGE=PQ` + `HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0`; DV/HLG exigen evidencia; `MaxFALL ≤ MaxCLL` y `AVG ≤ PEAK` | D2 POL-12/§8 | R1 F-05/F-08 (9.823 con AVG>PEAK) |
| **M-7** | **Gate SoC fail-closed, con denuncia**: `CANON={mt8696,amlogic,s905x4,s905x3}` + alias; fuera ⇒ `allowed=false`, `levers={}`, wire `TRUTHFUL_ONLY` (sin presentación). El SoC **desconocido se admite en el request** como `soc="unknown"` + `soc_raw` (diagnóstico, fail-closed) para que **no haya silencio**; el ack L3 solo transporta token canónico (D4-F10) ⇒ la denuncia vive en L1/L2 y el aprendizaje de SoC nuevos es por heartbeat L2 | D2 POL-7 · D4 §3/§4 · **enmienda D3 requerida** (§8.3.2) | `d4_check` 120/120 · `d1_check` D1-G |
| **M-8** | **`null ≠ 0` y `modeled ≠ measured`**: sensor ausente = incertidumbre (modo conservador), no "frío"; `unknown` no es "sano" | D5 INV-6 · D2 POL-8/9 | R4-F01/F05 · `d5_check` 300 estados |
| **M-9** | **Never-Drop**: 10.631 canales, 0 URLs mutadas, 1 URL/canal; los **45 sin variante** y los **108 nombres duplicados** se cuentan, no se borran | D2 POL-10 · R1 §6/§8 | `d1_check` D1-D |
| **M-10** | **Idempotencia intra-generación**: `ref.artifact_sha256` obligatorio; ETag (tamaño gzip) y `Range` (200 chunked) **no** sirven; la 2.ª inyección es byte-idéntica | D3 §13.5 · R1 F-19 | `d1_check` D1-H · `d3` 77/77 |
| **M-11** | **El bloque es inerte**: no ejecuta, no instala, no habilita ADB, no cambia el wire, no transporta secretos ni URLs de canal (RFC 8216 §6.3.1) | CLAUDE.md truth-guards · R1 F-03 | `d1_check` D1-I |
| **M-12** | **Una gramática**: `#EXT-X-ARA-<DIR>:<valor>`, 1 ocurrencia global, placement antes del primer `#EXTINF`, **0 tags media-only nuevos** | D1 §4 | `d1_check` D1-A/B/C |
| **M-13** | **Autoridad de control**: `/sync` v2 (HMAC-SHA256, nonce single-use 600 s, `ts ±300 s`, `no-store`); `wire.*` **no** viaja en la política | D3 §13.1-§13.6 | `d3` 77/77 · R6-D3-* |
| **M-14** | **Aplicar solo lo que existe**: 13 levers VPP de las 29 claves; ≤16 escrituras por política; `read-before-write`; T4 prohibido | D4-1/§7 | `d4_check` 120/120 |
| **M-15** | **Degradación**: FPS 60→30→24 → post-proceso (9 pasos) → bitrate dentro del tier → **resolución PROHIBIDA**; anti-flap | D2 POL-6 · D5 §6/§10 | `d5_check` 26/26 |
| **M-16** | **Telemetría honesta**: solo `measured_*` con frescura puede degradar imagen; qoe de navegador excluido; `decoder_error` **no existe** (400) ⇒ sin rollback automático PQ→SDR | R4 · D2 §10.2 | R4-F01/F02 · `d5_check` |

---

## 3 · Bloque global canónico

### 3.1 Render exacto (27 líneas)

Placement: **inmediatamente antes del primer `#EXTINF`**, después de la cabecera APE. Una sola vez. EOL = el del
artefacto (LF en los dos catálogos medidos).

<!-- BLOCK:RENDER:BEGIN -->
```m3u8
#EXT-X-ARA-VERSION:2026.10.30-EVO-NODROP
#EXT-X-ARA-SCHEMA:1
#EXT-X-ARA-MODE:never-drop
#EXT-X-ARA-DYNAMIC-CONTROL:enabled
#EXT-X-ARA-PROFILE-AUTO:true
#EXT-X-ARA-SYNC:enabled
#EXT-X-ARA-VPS-SYNC:https://iptv-ape.duckdns.org/sync
#EXT-X-ARA-SYNC-CADENCE:30
#EXT-X-ARA-AUTH:HMAC-SHA256
#EXT-X-ARA-CLIENT-TYPE:onn4k
#EXT-X-ARA-MINIMUM-DECODE-RESOLUTION:3840x2160
#EXT-X-ARA-MAX-DECODE-RESOLUTION:3840x2160
#EXT-X-ARA-MAX-PRESENT-RESOLUTION:7680x4320
#EXT-X-ARA-NEVER-DOWNSCALE:true
#EXT-X-ARA-FPS-TARGETS:60,30,24
#EXT-X-ARA-MINIMUM-FPS:24
#EXT-X-ARA-PRIORITY:zero-frame-drops
#EXT-X-ARA-DEGRADE-ORDER:fps,processing
#EXT-X-ARA-EMERGENCY-DOWNSCALE:false
#EXT-X-ARA-THERMAL-60FPS:65
#EXT-X-ARA-THERMAL-30FPS:78
#EXT-X-ARA-THERMAL-24FPS:82
#EXT-X-ARA-8K-MODE:PRESENTATION
#EXT-X-ARA-THERMAL-AWARE:true
#EXT-X-ARA-THERMAL-TARGET:70
#EXT-X-ARA-FALLBACK:passthrough
#EXT-X-ARA-LIST-VERSION:2026-10-30T22:07:37Z
```
<!-- BLOCK:RENDER:END -->

> `LIST-VERSION` es el único valor variable: ancla de publicación del artefacto (aquí, el `Last-Modified` medido
> de la lista CDN, R1 §1.2). El render con `LIST-VERSION:unknown` es el que produce el inyector cuando no se le pasa
> el ancla. **El verificador compara este bloque contra `buildGlobalBlock()` del inyector: si divergen, falla.**

### 3.2 Semántica directiva por directiva

| # | Directiva | Valor canónico | Plano | Gramática (resumen) | Consumidor |
|---|---|---|---|---|---|
| 1 | `VERSION` | `2026.10.30-EVO-NODROP` | — | `YYYY.MM.DD-TOKEN` | APK, validador |
| 2 | `SCHEMA` | `1` | — | entero 1..99 | APK, validador |
| 3 | `MODE` | `never-drop` | — | enum cerrado | APK, VPS |
| 4 | `DYNAMIC-CONTROL` | `enabled` | CONTROL | enum | APK |
| 5 | `PROFILE-AUTO` | `true` | CONTROL | bool | APK |
| 6 | `SYNC` | `enabled` | CONTROL | enum | APK |
| 7 | `VPS-SYNC` | `https://iptv-ape.duckdns.org/sync` | CONTROL | URL sin `@? #` | APK |
| 8 | `SYNC-CADENCE` | `30` s | CONTROL | entero 10..120 | APK, VPS |
| 9 | `AUTH` | `HMAC-SHA256` | CONTROL | enum | APK, VPS |
| 10 | `CLIENT-TYPE` | `onn4k` | — | enum | APK |
| 11 | `MINIMUM-DECODE-RESOLUTION` | `3840x2160` | DISPLAY | resolución del set | APK, VPS |
| 12 | `MAX-DECODE-RESOLUTION` | `3840x2160` | DISPLAY | resolución del set | APK, VPS |
| 13 | `MAX-PRESENT-RESOLUTION` | `7680x4320` | DISPLAY | resolución del set | APK |
| 14 | `NEVER-DOWNSCALE` | `true` | DISPLAY | bool (debe ser true) | APK, VPS |
| 15 | `FPS-TARGETS` | `60,30,24` | DISPLAY | CSV descendente | APK, VPS |
| 16 | `MINIMUM-FPS` | `24` | DISPLAY | entero 24..30 | APK, VPS |
| 17 | `PRIORITY` | `zero-frame-drops` | CONTROL | enum | APK, VPS |
| 18 | `DEGRADE-ORDER` | `fps,processing` | CONTROL | CSV sin `resolution` | APK, VPS |
| 19 | `EMERGENCY-DOWNSCALE` | `false` | DISPLAY | bool (debe ser false) | APK |
| 20 | `THERMAL-60FPS` | `65` °C | CONTROL | entero 55..85 | APK |
| 21 | `THERMAL-30FPS` | `78` °C | CONTROL | entero 55..85 | APK |
| 22 | `THERMAL-24FPS` | `82` °C | CONTROL | entero 55..85 | APK |
| 23 | `8K-MODE` | `PRESENTATION` | DISPLAY | enum {PRESENTATION, DISABLED} | APK, validador |
| 24 | `THERMAL-AWARE` | `true` | CONTROL | bool | APK |
| 25 | `THERMAL-TARGET` | `70` °C | CONTROL | entero 55..85 | APK |
| 26 | `FALLBACK` | `passthrough` | CONTROL | enum | APK |
| 27 | `LIST-VERSION` | ancla de publicación | — | token ≤64 | APK, VPS |

**Notas que evitan las tres confusiones caras:**

1. **`MINIMUM-DECODE-RESOLUTION` vs `MAX-DECODE-RESOLUTION` no son redundantes.** En el ONN 4K coinciden (4K es a la
   vez suelo de selección y techo de decode) y eso es exactamente lo que hace seguro el "4K siempre": no se puede
   pedir más de lo que el SoC decodifica ni menos de lo que la política permite. En otro device podrían diferir sin
   romper la gramática.
2. **`MAX-PRESENT-RESOLUTION:7680x4320` no es una declaración de wire.** Solo tiene efecto con `8K-MODE:PRESENTATION`
   y su consumidor es el APK; un player genérico ignora ambas líneas (RFC 8216 §6.3.1). El wire sigue sin 8K: **0
   ocurrencias de `7680x4320` en los 1.140 MB de las dos listas** (R1 §5.4).
3. **`THERMAL-TARGET:70` y los umbrales 65/78/82 no se contradicen.** 65/78/82 son los **escalones** (cuts de R2/D5:
   `[65,78,82,85]`); 70 es el **objetivo de régimen**. Sin histéresis oscilaría entre 60 y 30 fps alrededor de 65;
   la histéresis es de D5 §10 (`hysteresis_handoff`), no del bloque.

### 3.3 Placement, inserción e idempotencia

```
[1..127]  cabecera APE  (#EXTM3U … #EXT-X-APE-CDN-LAB)
[128]     línea en blanco
>>>       BLOQUE ARA-X (27 líneas)          ← inserción
[129]     primer #EXTINF del canal 0
…
[final]   3 líneas en blanco + #EXT-X-APE-AUDIT-SCORECARD + #EXT-X-APE-VALIDATED
```

| Regla | Verificación |
|---|---|
| Se inserta **antes del primer `#EXTINF`** y **después** de la cabecera APE | D1-B |
| **Nunca** dentro de un bloque de canal ni después de la primera URL | D1-B |
| **Nunca** después del footer `#EXT-X-APE-VALIDATED` | D1-B |
| 1 sola ocurrencia (idempotencia): `hasAraBlock()` corta y copia byte a byte | D1-H |
| El inyector es **fail-open**: si no reconoce catálogo, copia sin tocar | D1-H |
| EOL del artefacto (LF); el bloque no cambia CRLF/LF | D1-B |

### 3.4 Qué NO hace el bloque

- **No ejecuta ni instala** código; `#EXT-X-ARA-*` es metadata desconocida para el player (RFC 8216 §6.3.1).
- **No habilita ADB** ni toca el device: los levers se aplican por `/sync` + `SettingsApplier`, y ADB exige
  autorización RSA por host.
- **No cambia el wire**: no reescribe `CODECS`, `RESOLUTION`, `BANDWIDTH` ni URLs.
- **No contiene credenciales**: ni tokens, ni `user:pass`, ni la URL del canal (R6/F-03: el par cuenta/clave viaja
  en el path de cada URL; el bloque no lo replica).
- **No sustituye a `/sync`**: declara intención; la política efectiva viaja firmada por `/sync` (hoy **404**).
- **No arregla el 4K falso por sí solo**: el arreglo del wire es de D2/emisor (§6); el bloque solo fija el piso y la
  presentación.

### 3.5 Bloque por canal (opcional, ≤6 directivas)

Solo con evidencia; se inserta tras el `#EXTINF` y antes de su URI, sin romper la adyacencia
`#EXT-X-STREAM-INF` → URL.

| Directiva | Gramática | Cuándo |
|---|---|---|
| `#EXT-X-ARA-CHANNEL-ID:<tvg-id>` | token 1..32 | siempre que exista `tvg-id` (nunca la URL) |
| `#EXT-X-ARA-PROFILE-HINT:P0..P5` | enum | si el resolver ya fijó perfil |
| `#EXT-X-ARA-8K:presentation\|disabled` | enum | si el canal tiene intención 8K (nunca `wire`) |
| `#EXT-X-ARA-THERMAL-BUDGET:60..85` | entero | presupuesto por canal (opcional) |
| `#EXT-X-ARA-CODEC-PREFERRED:<rfc6381>` | `(avc1\|hvc1\|hev1\|av01\|vp09).*` | cuando el `CODECS` público es de presentación y la verdad va aparte (D2 §5) |
| `#EXT-X-APE-UPSCALE:declared=…;codec=truthful;mode=4k;src=…;can8k=0` | marcador compañero | presentación 4K sobre fuente <4K (D2 §6.2) |
| `#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0` | marcador compañero | PQ como intención (D2 §8) |
| `#EXT-X-APE-FPS-TARGET:24\|30\|60;SCOPE=DISPLAY` | marcador compañero | target de display ≠ `FRAME-RATE` |

---

## 4 · Gramática de directivas

### 4.1 Forma general

```
directiva  = "#EXT-X-ARA-" name ":" value
name       = 1*32( ALPHA / DIGIT / "-" )          ; mayúsculas, ASCII
value      = 1*480( VCHAR )                        ; sin CR/LF; sin espacios salvo donde el campo los declare
```

### 4.2 Clases de valor

| Clase | Gramática | Ejemplo | Restricciones |
|---|---|---|---|
| `version` | `YYYY.MM.DD-[A-Z0-9-]{1,32}` | `2026.10.30-EVO-NODROP` | cambia solo con cambio de gramática/invariantes |
| `int` | `-?[0-9]{1,6}` | `30` | rango declarado por directiva |
| `bool` | `true\|false` | `true` | algunas exigen un literal (§3.2) |
| `enum` | `[A-Za-z0-9._+-]{1,40}` | `enabled` | conjunto cerrado por directiva |
| `csv` | elemento(,elemento){0,7} | `60,30,24` | orden y unicidad declarados |
| `resolution` | `[1-9][0-9]{2,4}x[1-9][0-9]{2,4}` | `3840x2160` | set permitido por directiva |
| `url` | `https://host(/seg){0,4}` | `…/sync` | **sin** `@ ? # user pass token key=` |
| `token` | `[A-Za-z0-9._:+-]{1,64}` | `2026-10-30T22:07:37Z` | sin espacios |

### 4.3 Reglas léxicas

1. **1 ocurrencia** por directiva global (el bloque es un mapa, no una lista).
2. **Case-sensitive**; nombre en mayúsculas, valor como declare la tabla.
3. **ASCII imprimible**, línea ≤512 B; sin BOM, sin CR, sin tabuladores.
4. **Sin secretos**: ni tokens, ni claves, ni `user:pass`, ni URLs de canal (el escaneo de secretos es un gate).
5. **Sin tags HLS de master/media nuevos**: esta capa no añade `#EXT-X-TARGETDURATION`, `#EXT-X-PART`,
   `#EXT-X-SERVER-CONTROL`, `#EXT-X-MAP`, `#EXT-X-MEDIA`… (R1 F-01/F-04: el catálogo ya es híbrido y no se empeora).
6. **Idempotencia**: misma entrada ⇒ mismo bloque byte a byte (determinista, sin reloj; `LIST-VERSION` es parámetro).

### 4.4 Registro y drift gate

El registro completo vive en [`ara_x_directives.json`](ara_x_directives.json):

- `block.order[27]` — directiva, clase, canónico, rango/enum, semántica, consumidor, origen.
- `per_channel[]` — 5 directivas opcionales + 3 marcadores compañeros.
- `forbidden[]` — 15 entradas con motivo, reemplazo y evidencia.
- `namespace`, `placement`, `value_classes`, `secret_scan`.

**Drift gate:** el verificador exige (a) que el render del §3.1 sea **idéntico** a
`buildGlobalBlock({listVersion:'2026-10-30T22:07:37Z'})` del inyector, (b) que cada línea del bloque exista en
`block.order`, (c) que ninguna directiva `forbidden` aparezca, y (d) que el orden del documento y del JSON coincidan.
Si el inyector cambia una línea y el contrato no, **falla**.

### 4.5 Namespace y extensiones

- Prefijo reservado: `#EXT-X-ARA-` (y `#EXT-X-APE-` para los marcadores heredados).
- Experimental: `#EXT-X-ARA-X-*`, solo con flag **OFF** por defecto; un consumidor que no lo conoce lo ignora.
- Cualquier directiva nueva exige: entrada en el JSON + fila en §3.2 + test en el verificador + revisión de D1.

---

## 5 · Refutaciones (lo que NO se emite y por qué)

| ID | Afirmación refutada | Por qué es falsa | Evidencia | Qué se emite en su lugar |
|---|---|---|---|---|
| **R-01** | `#EXT-X-VERSION:6` "para compatibilidad" | Es un **downgrade**: el artefacto ya declara `VERSION:9`; bajar puede romper features en uso y no arregla nada. RFC 8216 solo define 1..7, así que "6" tampoco es más "RFC-válido" que 9 | `ARA_X_PLAYLIST_BLOCK.md` §2 · R1 §4 (fila 6) | conservar `#EXT-X-VERSION:9` del artefacto; no tocarlo |
| **R-02** | `#EXT-X-ARA-MAX-RESOLUTION:7680x4320` | **Ambiguo**: un solo "máximo" mezcla decode y presentación. Si un consumidor lo lee como wire, declara un decode imposible en S905X4 (Ley Cardinal 1) | `ARA_X_PLAYLIST_BLOCK.md` §2/§6 · D2 POL-3 | par explícito `MAX-DECODE-RESOLUTION:3840x2160` + `MAX-PRESENT-RESOLUTION:7680x4320` + `8K-MODE:PRESENTATION` |
| **R-03** | "LCEVC real en la lista" (`#EXT-X-CMAF-LCEVC:PHASE=4`, `#EXT-X-APE-LCEVC-*`, `#EXT-X-VNOVA-LCEVC*`, `KODIPROP video_lcevc=true`) | **No hay capa LCEVC en el bitstream**: 0 `#EXT-X-MAP`, `CONTAINER:mpegts`, y ningún decoder/filtro LCEVC en las versiones objetivo. Ver Anexo B | R1 F-06/§5.5 · R1 probe: 10.631 `EXT-X-CMAF` sin MAP | nada: no se emite LCEVC; el realce real es el VPP del device por levers |
| **R-04** | "remux/transcode 4K/8K en el VPS" | El VPS es **rebase-only metadata**: no transporta vídeo (`.ts/.m4s → 404`), no hay motor Rust `:8084` ni `combined_body_filter.lua` desplegado; 16 Lua inventariados y 0 de transcoding | CLAUDE.md (realidad medida 2026-10-25) · R3 §2/§7 · R3-R1 | selección de variante + metadata; el píxel lo pone el VPP del device |
| **R-05** | `RESOLUTION=7680x4320` (wire 8K) | Decode imposible en `s905x4/mt8696`; freeze 2026-06-08 | D2 POL-3 · R1 §5.4 (0 ocurrencias) | 4K en wire + `8K-MODE:PRESENTATION`; `flag=wire_8k_suppressed` |
| **R-06** | `user_preferred_resolution_*` como "lever de calidad" | Es la **puerta trasera** al 8K: escribe resolución de salida y salta el piso | D4 §5 (T4 prohibido) · R5 P-4 | no se emite; la resolución no es actuador |
| **R-07** | `#EXT-X-ARA-FORCE-HDR:hdr10` / "PQ verificado" / DV inventado | PQ es **intención de display**, no HDR verificado; DV exige `dvh1.*` + BL HEVC real | D2 POL-12/§8 · R1 F-05/F-06 | `VIDEO-RANGE=PQ` + `HDR-INTENT:…VERIFIED=0`; DV/HLG solo con evidencia |
| **R-08** | Tokens, claves o `user:pass` dentro del bloque | Secreto en artefacto público (546 MB, CORS `*`) | R6/F-03 · R1 §7 | `AUTH:HMAC-SHA256` describe el esquema; la clave vive en device/env |
| **R-09** | `#EXT-X-ARA-8K:wire` / `8K-MODE:WIRE` | Es R-05 con otro nombre | D2 §6.3 | `8K:presentation` / `8K-MODE:PRESENTATION` |
| **R-10** | "el bloque configura al player" | Los players ignoran tags desconocidos (RFC 8216 §6.3.1); el APK ARA es el único que lo parsea | R1 §0.2 · `ARA_X_PLAYLIST_BLOCK.md` §7 | el bloque declara intención; la configuración efectiva va por `/sync` + levers |

---

## 6 · Política de wire (D2) — lo que el contrato exige del emisor

### 6.1 FZ-01 y las dos posturas

```
FZ-01 ⇔ CODECS público declara una familia ≠ familia real del bitstream
        (caso medido: 9.593 canales family=h264 con CODECS=hvc1.2.4.L153.B0)
```

| Postura | Cuándo | Qué emite |
|---|---|---|
| **`TRUTHFUL_SIGNAL`** (default) | sin `cascade_type="dual-hvc1-hev1"` y sin probe HEVC | `avc1.*` para h264; `hvc1.*` para hevc; `av01.*` para av1; **sin `CODECS`** para `unknown` |
| **`DAEMON_VERIFIED`** | solo con cascada dual o probe real que empiece por `hvc1`/`hev1` | `hvc1.2.4.L*` |
| **`NATIVE_VERIFIED`** | F0 con probe OK | la del probe |
| **`PASSTHROUGH_F5`** | F5 | sin `#EXT-X-STREAM-INF` (solo `#EXTINF` + URL) |

**Nunca** se "arregla" FZ-01 reescribiendo `CODECS` a `hvc1` para sostener el 4K. Se cambia el codec a la verdad o se
deja la señal sin codec; el 4K de presentación vive en `RESOLUTION` + marcador (D2 §5.2).

### 6.2 Migración concreta del catálogo medido

| Familia | Canales | Hoy (wire) | Con D1+D2 |
|---|---|---|---|
| `h264` | **9.593** (90,24 %) | `hvc1.2.4.L153.B0` (mentira, FZ-01) | `avc1.640033` si declara 4K y fps≤30 · `avc1.64002A` si 1080p y fps≥50 · `avc1.640028` resto |
| `hevc` | **1.038** (9,76 %) | `hvc1.2.4.L153.B0` | `hvc1.2.4.L*` según `required(res,fps)` (Ley Cardinal 1) |
| `unknown` | 0 hoy | — | sin `CODECS` ni `RESOLUTION` |
| 4K **declarado por la capa in-band** (P1) | **808** (7,60 %) | 4K/L153/PQ | 4K nativo + codec verdadero; `verified` solo con probe (la metadata no es probe) |
| 4K **de presentación** (P3+P4) | **9.823** (92,40 %) | 4K/L153/PQ blanket | `RESOLUTION=3840x2160` **marcado** con `#EXT-X-APE-UPSCALE` (`src=<res real>;can8k=0`) y codec verdadero |

Cifras de R1/R2: perfiles P4=7.523 (720p), P3=2.300 (1080p), P1=808 (4K); `BANDWIDTH` 9/12/28 Mbps; 9.778 canales
declaran 4K con un bitrate por debajo de la tabla del propio repo (28 Mbps) — la firma del upscale que el marcador
hace **explícito** en vez de negarlo.

### 6.3 Presentación 4K: condiciones y marcador

```
permitida ⇔ soc_ok && family ≠ unknown && res_src ∈ {1280x720,1920x1080} && !wire_8k_requested
marcador obligatorio:
  #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k;src=<res_src>;can8k=0
```

`RESOLUTION=3840x2160` puede convivir con `CODECS=avc1.640033` (verdad). **Nunca** presentación sobre `unknown` ni
sobre SoC no allowlisted: ahí se declara la resolución real (`TRUTHFUL_ONLY`).

### 6.4 8K

| Camino | Política |
|---|---|
| `RESOLUTION=7680x4320` | **prohibido**; si la fuente lo pide → 4K + `flag=wire_8k_suppressed` |
| `CODECS` nivel ≥ `L180` | prohibido en `s905x4`/`mt8696` |
| `display.mode=8k_emulated` | **inalcanzable hoy** (GAP-07: el APK no emite `caps.soc_8k`) |
| `eight_k` | siempre `presentation_only` o `disabled` |
| `#EXT-X-APE-8KFAKE` | permitido solo como `ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` (ya cumple en 10.631/808) |
| knobs VLC | `adaptive-maxwidth 7680→3840`, `maxheight 4320→2160`, `vrr_max 120→60`, `minterpolate fps 120→eliminar` |

### 6.5 FPS único

```
canonical_fps = measured_fps            si ∈ {24,25,30,50,60}
              | declared_frame_rate     si medido desconocido y declarado ∈ {24,25,30,50,60}
              | 30                      si ambos desconocidos
FRAME-RATE    = min(canonical_fps, fps_ceiling(soc), 60)     ; fps_ceiling(ONN 4K)=60
```

`FRAME-RATE` **nunca** supera el medido. El target de display (60 por MEMC) va en `FPS-TARGETS` o
`#EXT-X-APE-FPS-TARGET`, no en el wire. Hoy conviven cuatro FPS distintos en el mismo bloque (`ape-fps` 25/50,
`EXTVLCOPT video-fps=60`, `FRAME-RATE` 30/60, `X-Framerate` 30/60) — R1 F-20: ≥1.186 canales se contradicen.

### 6.6 HDR

- `VIDEO-RANGE=PQ` **permitido** como intención LOCKED (2026-06-16) + `HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0`.
- `hdr_verified=false` salvo probe con PQ/BT.2020/10-bit confirmados.
- DV/HLG solo con evidencia (`dvh1.08.*` + BL HEVC); `#EXT-X-APE-DV-PROFILE:8` sin `dvcC` **no** es DV.
- `MaxFALL ≤ MaxCLL` y `AVG ≤ PEAK`: hoy 9.823 canales tienen `AVG=1000 > PEAK=100/400` (R1 F-08) → se corrige a `min()` + `flag=hdr_metadata_fixed`.
- `#EXT-X-APE-HDR-TRANSFER` no puede decir `BT1886` mientras el wire dice `TRANSFER-CHARACTERISTICS=16` (PQ).

### 6.7 Knobs de player clampados (capa lista, sin device)

| Knob | Medido hoy (R1) | Regla |
|---|---|---|
| `adaptive-maxwidth` | 7680 ×10.631 | `min(3840, declared_w)` |
| `adaptive-maxheight` | 4320 ×10.631 | `min(2160, declared_h)` |
| `video-vrr_max` | 120 ×10.631 | `min(60, fps_ceiling)` |
| `video-fps` | 60 ×10.631 | `canonical_fps` |
| `minterpolate fps` | 120 ×10.631 | eliminar (MEMC no verificado) |
| `inputstream.adaptive.video_codec` | `hevc,av1,vp9,h264` | familia declarada primero |
| `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` | `dvh1,dvhe,hvc1,…` | **inerte**: no se toca |

---

## 7 · Never-Drop (el contrato de conservación)

### 7.1 Denominadores correctos

| Objeto | Denominador | Fuente |
|---|---|---|
| Canales | **`#EXTINF` = 10.631** (A y B) | R1 §2.2 |
| URLs de canal | **10.631**, exactamente 1 por canal, 0 duplicadas | R1 §6 |
| `#EXT-X-APE-CHANNELS` | 10.631 (declarado) | R1 §1.1 |
| Variantes (`#EXT-X-STREAM-INF`) | **10.631 (A) · 10.586 (B)** — **no** es el denominador de canales | R1 F-12 |
| `tvg-id` | 10.631 únicos | R1 §6 |
| Nombres (`tvg-name`) | 10.523 únicos → **108 duplicados tolerados** | R1 §6 |

### 7.2 Invariantes ND-1..ND-8

| ID | Invariante | Evidencia / verificación |
|---|---|---|
| **ND-1** | `#EXTINF` antes = después = **10.631** | R1; `d1_check` D1-D (ambas listas) |
| **ND-2** | URLs: **10.631**, 1/canal, 0 mutadas (sha256 por URL) | R1 §6; `d1_check` D1-D |
| **ND-3** | Orden de canales preservado (`tvg-id` en la misma posición) | R1 §3.1; `d1_check` D1-D |
| **ND-4** | `tvg-id` únicos preservados (10.631) | R1 §6 |
| **ND-5** | **Los 108 nombres duplicados no se "arreglan" borrando canales**: se cuentan (`name_duplicate=108`) | R1 F-14 |
| **ND-6** | **Los 45 canales sin variante** no son pérdida: `channels_without_variant=45` (warning), reciben bloque veraz o quedan F5 | R1 F-12 |
| **ND-7** | 0 tags media-only **nuevos** por esta capa (`TARGETDURATION`, `PART`, `SERVER-CONTROL`, `MAP`, `MEDIA`) | R1 §4; `d1_check` D1-C |
| **ND-8** | **Fail-open**: cualquier excepción del inyector ⇒ salida byte-idéntica a la entrada | `ara_x_injector.js`; `d1_check` D1-H |

### 7.3 Los 45 y los 108 (política explícita)

- **45 sin variante** (ids `904505–904581` con huecos, perfil P4, grupo `|IL|`): en la lista servida (B) perdieron su
  `#EXT-X-STREAM-INF`. No son canales perdidos —la URL sigue— pero rompen la simetría `EXTINF == STREAM-INF`.
  El contrato **prohíbe** contarlos como error y **prohíbe** borrarlos; exige reportarlos como warning y, si se
  regeneran, restaurarles variante veraz.
- **108 nombres duplicados**: dos canales pueden llamarse igual con `tvg-id` y URL distintos. Nunca se deduplica por
  nombre: se marca `name_duplicate` y se conserva el canal.

### 7.4 Idempotencia e identidad de artefacto

- `ref.artifact_sha256` (64 hex) identifica los bytes **descomprimidos** que el device cargó: A
  `E27C03EB…E2A680` (572.170.477 B) · B `81DBDD11…BE14E` (568.241.457 B).
- El **ETag** de `/lists/` es el tamaño del gzip (`W/"6ae51529-9b2a1b7"` = 162.701.751 B) y **`Range` no se honra**
  (`bytes=0-0` → `200` chunked): ninguno sirve para identificar ni verificar por partes (R1 F-19).
- La lista **muta entre generaciones** (30 tags UA/SPOOF rotan, R1 §0.8): la byte-identidad solo vale
  **intra-generación**. Publicar dos veces el mismo contenido puede dar hashes distintos: se fija el artefacto, no
  la "misma lista".

### 7.5 Fail-open

Si el inyector no reconoce el archivo como catálogo (`#EXTINF` + `tvg-id/tvg-name`), si ya hay bloque, o si algo
falla: **copia byte a byte**. La reproducción nunca depende de esta capa (D4-7).

---

## 8 · Superficie de control: qué viaja y qué no

### 8.1 Frontera `/sync`

| Objeto | ¿Viaja en `/sync`? | Dónde vive |
|---|---|---|
| `wire.*` (resolution/codecs/video_range/frame_rate) | **NO** (D2 §15) | catálogo (emisor) |
| `display.*` (mode/wire_resolution/min_resolution/never_downscale/eight_k/hdr_hint) | sí | respuesta v2 (D3 §13.4) |
| `fps.target/current/min` | sí (display) | respuesta v2 |
| `degrade.order` | sí, **sin `resolution`** en SoC `no_wire_8k` | respuesta v2 |
| `device.allowed/soc`, `processing.tier`, `thermal.*` | sí | respuesta v2 |
| levers VPP | sí, allowlist de 13 | respuesta v2 + `state.levers` |
| URLs, canales, títulos, credenciales, IPs | **NO** (prohibido a cualquier profundidad) | — |
| `ref.artifact_sha256` / `generation_id` / `list_version` | sí (identidad) | request + response |

### 8.2 `/sync` v2 — gates que el contrato exige

1. `v=2` explícito; el servidor rechaza `v=1` (sin reinterpretación).
2. HMAC-SHA256 hex-64 sobre el **body crudo**; canónico `ARA-X-SYNC-V1\n{device_id}\n{seq}\n{ts}\n{nonce}\n{sha256(body)}`.
3. `ts ±300 s`; `nonce` 16..64 hex single-use 600 s; `seq` estrictamente monótono.
4. Idempotencia: mismo `(device_id, seq, body_sha256)` ⇒ **200** + `X-ARA-Idempotent: 1`; mismo `seq` con otro body ⇒ **409**.
5. Rate-limit **solo** en `/sync` (`3r/m`, `burst=6`); playback sin límites nuevos (autopista).
6. `no-store` + `nosniff`, `client_max_body_size 16k`, sin CORS, solo `POST` por 443.
7. Anti-SSRF: `additionalProperties:false` + guard de claves URL; **0 funciones de red** en el endpoint.
8. Errores uniformes (401 sin eco), logs sin body/nonce/firma/IP.
9. `state.apply` = ack L3 de D4 (≤1 KB, esquema cerrado).
10. `display.wire_resolution ∈ {720p,1080p,1440p,2160p}` — **nunca** `7680x4320`.
11. `ref.artifact_sha256` obligatorio y `flags:["artifact_mismatch"]` si no coincide.

### 8.3 Aplicación en device (D4)

| Concepto | Regla |
|---|---|
| Estados | 5, con precedencia: `denied`(1) · `partial`(2) · `deferred`(3) · `applied`(4) · `noop`(5) |
| Razones bloqueantes | `soc_unmapped` · `soc_mismatch` · `device_not_allowed` · `wire_8k_forbidden` · `eight_k_native_forbidden` · `policy_expired` · `policy_invalid` |
| Warnings | `soc_alias_used` · `wire_above_panel` · `thermal_unavailable` · `thermal_status_disagreement` · `cadence_unknown` · `degrade_resolution_not_actuable` |
| Skipped | `lever_not_reachable` · `value_out_of_domain` · `forbidden_by_contract` · `key_absent_on_soc` |
| Orden | `T0` seguridad → `T1` cadencia → `T2` post-proceso → `T3` formato → **`T4` resolución PROHIBIDO** |
| Escrituras | ≤16 por política, `read-before-write`, `Dispatchers.IO` |
| Levers | 13 VPP de las 29 claves; 15 alcanzables, 14 no, 3 prohibidas, 1 alias (`ai_pic_mode`) |
| Ack | L1 local (`SharedPreferences`/logcat) · L2 heartbeat `caps.apply` · L3 `state.apply` en `/sync` (solo con `/sync` vivo) |
| Térmica | `tier_efectivo = lower(processing.tier, pasos)`; pasos solo con `prov=measured`; `unknown` = 0 pasos + `thermal_unavailable` |
| Fallo | `partial` + filas base intactas; el player **no** espera (Never-Drop) |

#### 8.3.1 Traducciones contrato → wire del ack (obligatorias)

El ack habla el vocabulario **cerrado** de `sync_features.json → ack`, no el del contrato. Tres traducciones son
obligatorias y las demás son 1:1:

| Contrato | Wire (`state.apply`) | Regla |
|---|---|---|
| `state` | `st` | idéntico: `denied·partial·deferred·applied·noop` |
| `ack_reason` | `rs` | idéntico (17 códigos) o `null` |
| `soc.gate = allowlisted` | `soc.g = "allowlisted"` | 1:1 |
| **`soc.gate = denied`** | **`soc.g = "not_allowlisted"`** (o **`"no_caps"`** si no hay caps) | **traducción obligatoria: `denied` no es un valor del wire** |
| `deferred_codes = <k>:player_active` | `df[] = {k, r:"player_active"}` | 1:1 |
| **`<k>:player_inactive` · `<k>:next_media_source`** | **`df[] = {k, r:"lifecycle_pending"}`** | **traducción obligatoria** |
| **`clamped[] = {key, from, to}`** | **`cl[] = {k, from, to}`** | **`key` → `k`** |
| `skipped[] = {key, code}` | `sk[] = {k, r}` | `key`→`k`, `code`→`r` |
| `writes[]` | `ap[]` | patrón `^[a-z_]+ [a-z0-9_]+ -?[0-9]{1,4}$`, ≤16, `ap_trunc` si se corta |
| `unchanged_count` | `un` | entero ≥ 0 |
| `held_levers` | `hl[]` | lista de claves |

> Verificado contra el validador real: los acks mapeados de **V1, V2 y V4** pasan `client.validateApply()`; el de
> **V3** no puede (SoC medido `rk3588`) — ver §8.3.2.

#### 8.3.2 D4-F10 · SoC desconocido: la denuncia no se pierde

**Hecho medido:** `client.soc` exige token canónico y **rechaza incluso `unknown` con 400**; `state.apply.soc.m`
también exige token canónico. Por tanto un `denied/soc_unmapped` **no puede viajar por L3**.

**Decisión normativa (D1):**

1. **Admisión sin silencio:** el request v2 **debe** admitir `client.soc = "unknown"` acompañado de
   `client.soc_raw` (token ≤32, saneado, solo diagnóstico). Con `unknown` la respuesta es **fail-closed**:
   `device.allowed=false`, `levers={}`, `display` en modo `TRUTHFUL_ONLY` (sin presentación), `degrade.order` sin
   `resolution`, y `flags` incluye `soc_unknown`. *(Enmienda requerida a D3: hoy el schema/cliente devuelven 400;
   estado: **pendiente**, no implementado.)*
2. **El ack L3 sigue siendo canónico:** `state.apply.soc.m` no se relaja. Un SoC no canónico **no** se acuña como
   token canónico: se reporta por **L1** (local) y **L2** (heartbeat `data.caps.apply`, campo libre persistido en
   `ara_heartbeats.caps_json`).
3. **Aprendizaje de SoC nuevos = heartbeat L2.** El puente al reconciliador (`/var/lib/ape/soc_seen.jsonl`) **no
   está implementado**; hasta que exista, el único camino es L2. Se declara como deuda **D1-G1**, no como capacidad.

**Por qué así:** admitir `unknown` en el request cierra el silencio sin inventar un token canónico ni relajar el ack;
y el vocabulario del wire queda intacto (una sola traducción, no tres).

### 8.4 Decisión (D5)

| Concepto | Regla |
|---|---|
| Cadencias | 100 / 500 / 5.000 / 10.000 / 30.000 ms |
| Escalera | FPS 60→30→24 → 9 pasos de post-proceso → bitrate dentro del tier → **nunca resolución** |
| Fuzzy | 12 reglas Mamdani + singleton, media ponderada |
| Thompson | fraccional, 5 brazos de **proceso** (nunca resolución) |
| Red | EWMA + Holt para throughput/RTT |
| `degrade_mask` | 16 bits |
| Invariantes | 12 (INV-1..INV-12), `null≠0`, `u_T`, anti-flap |

---

## 9 · Honestidad de telemetría (R4)

| Señal | `prov` | ¿Puede degradar imagen? | Condición |
|---|---|---|---|
| `vst_ms`, `rebuffer_*`, `frame_drop_count`, `bitrate_bps` | `measured_*` | **sí** | frescura ≤2× cadencia y `conf ≥ 0.3` |
| `frame_drop_ratio`, `stutter_probability` | `derived` | sí, si sus primitivas son `measured` | si no, `null` |
| `buffer_health_pct` (daemon) | `modeled` | **no** | solo ABR/envelope |
| `qoe_score` del navegador | — | **no** | no mide playback (R4-F02) |
| `thermal_status` (API 29+) | `measured_device` | sí (bandas D5) | `unknown` ⇒ 0 clamps + `thermal_unknown` |
| `cpu_temp_c`, `gpu_load_pct`, `vpu_load_pct` | `unavailable` | **no** | `null`, nunca 0 |
| `decoder_error` | — | **no existe** (400) | sin rollback automático PQ→SDR (R4-F01) |
| `content.*` | `lab_ssot` | no | solo contexto |

**Sin observación:** `P2` + `qoe_unknown` + sin levers nuevos. **`unknown` no es "sano"** (R4).

---

## 10 · Seguridad (R6) y realidad del VPS (R3): lo que este contrato no puede asumir

### 10.1 Hallazgos de seguridad vigentes (pre-existentes, no introducidos por ARA-X)

| ID | Hallazgo | Impacto en D1 |
|---|---|---|
| R6-F-01 | `/lists/` público con `Access-Control-Allow-Origin: *` | el bloque no añade superficie, pero **no debe** contener nada sensible (M-11) |
| R6-F-02 | cache `public, max-age=300` duplicada | el bloque cambia por generación → cachear 300 s es aceptable, pero pinchar por sha256 |
| R6-F-03 | `/a/` fail-open (`stale:hmac_ausente`) | el bloque **no** depende de `/a/`; la política va por `/sync` |
| R6-F-04 | sin rate-limit en `/a/` | D3 lo pone **solo** en `/sync`, nunca en playback |

**Deploy de ARA-X: NO-GO** hasta cerrar F-01..F-04 y ejecutar los gates en ventana (R6 §0).

### 10.2 Realidad del VPS que el contrato no puede asumir

| ID | Hecho medido | Consecuencia para D1 |
|---|---|---|
| R3-R1 | CI/CD tiene dos motores; el **legacy** (`tools/cicd`) incluye `combined_body_filter.lua`, `ape_virtual_4k.lua`, `quality_realtime` | ejecutarlo **reintroduce el pipeline Crystal prohibido**: D1 prohíbe esas rutas |
| R3-R2 | drift repo↔VPS en `ape-meta-public.conf` (2.610 vs 3.096 B) y `prisma-ara-enroll.conf` (1.767 vs 403 B) | ninguna afirmación de paridad sin `deploy --verify` |
| R3-R3 | `.gitattributes` sin `*.conf` | riesgo CRLF en config (no afecta al bloque, que es LF) |
| R3-R4 | bloque `deny` de `default:198` comentado con `\n` literales | no se asume endurecimiento |
| R3-R10 | `/a/` devuelve `base64url` de `#EXT-X-APE-STALE:1`, no texto | cualquier validador debe decodificar, no comparar strings |
| R3 | `/sync` **404**; `:8088` interno (INPUT DROP); `ape-crystal-rust` inactive; 16 Lua, 0 de transcoding | el bloque declara `SYNC:enabled` pero **el device debe fail-open** (M-11/`FALLBACK:passthrough`) |

**D4-F10 (MED, abierto) — el SoC desconocido no viaja por L3.** `client.soc` rechaza `unknown` (400) y
`state.apply.soc.m` exige token canónico: `denied/soc_unmapped` queda en L1/L2 y el puente al reconciliador no
existe. D1 lo norma en §8.3.2: **admisión de `unknown`+`soc_raw` fail-closed en el request** (enmienda D3 pendiente)
y **denuncia por L1/L2** hasta que exista el puente. **D4-F01 y D4-F02 quedan cerrados por D3 v2** (`no_wire_8k`
cubre los 4 SoC canónicos; `state.apply` existe en el schema y el ack mapeado valida 3/3).

### 10.3 Lo que este contrato no puede arreglar

- El **4K blanket de 9.823 canales** está en el emisor; D1 fija la regla, no reescribe la lista servida.
- La **fragmentación de gramática** (R1 F-01: master+media+M3U Plus en un archivo) no se corrige añadiendo tags:
  se corrige decidiendo el formato aguas arriba. D1 prohíbe empeorarla (ND-7).
- El **endpoint `/sync`**: D3 lo tiene staged; D1 solo declara la intención y el fail-open.

---

## 11 · Aceptación del contrato

### 11.1 Gates D1

| Gate | Qué comprueba | Cómo |
|---|---|---|
| **D1-A** | Registro `ara_x_directives.json` coherente: 27 directivas ordenadas, sin duplicados, gramática válida contra su propio canónico | verificador |
| **D1-B** | El render del §3.1 es **idéntico** a `buildGlobalBlock()` del inyector (drift gate) | verificador |
| **D1-C** | El bloque insertado **no añade tags media-only** y no contiene directivas prohibidas | verificador |
| **D1-D** | Inserción en **ambas listas**: `#EXTINF` 10.631 → 10.631; URLs 10.631 y **sha256 por URL idéntico**; `STREAM-INF` 10.631/10.586 sin cambios; 45 contados | verificador (streaming) |
| **D1-E** | `MINIMUM-DECODE-RESOLUTION`/`NEVER-DOWNSCALE`/`FPS-TARGETS`/`PRIORITY`/`8K-MODE` presentes y con el valor canónico | verificador |
| **D1-F** | 8K: `RESOLUTION=7680x4320` = 0 en ambas listas; `MAX-PRESENT` presente; `8K-MODE` ∈ {PRESENTATION, DISABLED} | verificador |
| **D1-G** | Gate SoC: el set canónico del bloque coincide con `sync_features.socs.canonical` (D3) y con D2 §2.3; §8.3.2 fija la admisión `unknown`+`soc_raw` y las **3 traducciones obligatorias** del ack (`soc.gate denied→not_allowlisted\|no_caps`, `player_inactive\|next_media_source→lifecycle_pending`, `clamped.key→cl[].k`) | verificador |
| **D1-H** | Idempotencia: 2.ª inyección ⇒ `injected=false` y bytes idénticos; `hasAraBlock` detecta | verificador |
| **D1-I** | Escaneo de secretos en los tres entregables: 0 hits (tokens, `user:pass`, `/a/…`, claves) | verificador |
| **D1-J** | Coherencia numérica con R1/R2 y con D3/D4/D5: 10.631 · 808 · 9.823 · 45 · 108 · 29 features · 13 levers · 15/14/3/1 · 36 casos · 26 vectores | verificador |

### 11.2 Comando

```powershell
node ara-x/scripts/d1_check_master_contract.js
# PASS D1-A..D1-J · checks=12 pass=12 fail=0 · ALL_OK   (~5 min: inyecta el bloque en AMBAS listas)
node ara-x/scripts/d1_check_master_contract.js --no-inject
# PASS D1-A..D1-J (sin D1-D) · checks=10 pass=10 fail=0 · ALL_OK   (<1 s)
```

El verificador es **determinista**, sin red y sin dependencias npm. Lee: este `.md`, `ara_x_directives.json`,
`ara-x/playlist/ara_x_injector.js`, las **dos** listas de `ara-x/evidence/` y los artefactos de D2/D3/D4/D5/R1.

### 11.3 Lo que NO se verifica (honesto)

- **No se sirve el bloque**: la lista publicada sigue sin `#EXT-X-ARA-*` (0 tags ARA medidos, R1 §2.2).
- **No hay device**: nada se aplica; los levers y el ack son contratos (D4 120/120 en repo, no en ONN 4K).
- **`/sync` no existe**: 404 medido (R3/R6); el estado `enabled` del bloque es una intención.
- **No se prueba el wire arreglado**: D2 tiene 36 casos y 1.435 PASS, pero el emisor no se ha modificado.
- **El bloque no arregla el 4K blanket** (92,4 %): solo lo hace explícito y le pone marcador cuando se aplique.

---

## 12 · Handoff y deuda declarada

| Consumidor | Qué toma de D1 | Estado |
|---|---|---|
| **I2 / V2** (inyección y publicación) | bloque de 27 líneas + placement + ND-1..ND-8 + `LIST-VERSION` | listo para cablear; el inyector ya lo produce |
| **I5** (policy engine) | M-1..M-16 como precondiciones; D2 §12 como pseudocódigo | pendiente de implementación |
| **D3** (deploy `/sync`) | M-10, M-13, frontera §8.1, **§8.3.2 admisión de `soc="unknown"`+`soc_raw`** (enmienda de schema/cliente) y las 3 traducciones del ack (§8.3.1) | NO-GO hasta R6 F-01..F-04; enmienda de SoC **pendiente** |
| **D4/D5** (runtime) | M-14, M-15, M-16, §8.3/§8.3.1/§8.3.2 | contratos cerrados (D4 120/120), sin device |
| **Emisor de listas** | §6 completo (FZ-01, presentación, 8K, FPS, HDR, knobs) | **no implementado** (deuda principal) |

**Deuda declarada:** (a) el emisor no aplica todavía §6 — el wire sigue con 4K blanket; (b) `MAX-PRESENT-RESOLUTION`
no tiene consumidor más allá del APK (GAP-07); (c) `decoder_error` no existe como señal (R4-F01) ⇒ sin rollback
automático PQ→SDR; (d) la lista muta entre generaciones ⇒ identidad por `artifact_sha256` + `generation_id`;
(e) 45 canales sin variante y 108 nombres duplicados son **warnings permanentes**, no defectos a "limpiar";
(f) **D1-G1**: el puente SoC-desconocido → reconciliador (`/var/lib/ape/soc_seen.jsonl`) no existe: el aprendizaje
de SoC nuevos es solo por heartbeat L2; (g) **D1-G2**: la admisión de `soc="unknown"` en `/sync` requiere enmienda
de schema/cliente (hoy 400).

---

## Anexo A · Compatibilidad directiva × player

| Player | ¿Lee `#EXT-X-ARA-*`? | Lee `STREAM-INF` | Lee `#EXTVLCOPT`/`#KODIPROP` | Qué le afecta de verdad |
|---|---|---|---|---|
| **APK ARA** (media3) | **sí** (parser propio) | sí | no | bloque + `/sync` + levers VPP |
| OTT Navigator (Exo2) | no | sí | parcial | `CODECS`/`RESOLUTION` (riesgo FZ-01) |
| TiviMate / Smarters | no | a veces | parcial (single-value) | wire + `EXTVLCOPT` |
| VLC (catálogo) | no | no | **sí** | knobs clamps (§6.7) |
| Kodi (inputstream.adaptive) | no | no | **sí** | `KODIPROP` clamps |
| hls.js (si existiera) | no | sí | no | wire |
| ExoPlayer genérico | no | sí | no | wire |

**Consecuencia:** el bloque es para el APK ARA; el wire es para los parsers HLS; los knobs son para VLC/Kodi. Por eso
M-1 (wire veraz) y §6.7 (knobs clampados) son **ambos** obligatorios: cerrar solo uno deja el riesgo abierto.

---

## Anexo B · LCEVC: rechazo explícito de filtros y tags inexistentes

**Lo que la lista dice hoy** (medido, R1 §5.5):

| Tag/línea | Conteo | Qué promete |
|---|---|---|
| `#EXT-X-CMAF-LCEVC:PHASE=4,ENABLED=true` | 10.631 | capa LCEVC fase 4 |
| `#EXT-X-APE-LCEVC-PHASE:4` | 10.631 | ídem |
| `#EXT-X-APE-LCEVC-ENABLED:true` | 10.631 | ídem |
| `#EXT-X-APE-LCEVC-BITRATE-SAVING:50%` | 10.631 | ahorro de bitrate |
| `#EXT-X-VNOVA-LCEVC*` (20 tags) | 10.631 cada uno | codec/base/enhancement layers |
| `#KODIPROP:inputstream.adaptive.video_lcevc=true` | 10.631 | Kodi decodifica LCEVC |
| `#EXT-X-CMAF-CONTAINER:mpegts` | 10.631 | contenedor **no** CMAF |

**Lo que hay de verdad:**

1. **No hay capa de mejora**: `#EXT-X-MAP` = **0**, `#EXT-X-KEY` = 0, `#EXT-X-PROGRAM-DATE-TIME` = 0; el contenedor
   declarado es `mpegts`, no fMP4/CMAF. Sin init segment no hay `hvcC`/`lvcC` donde viviría una capa LCEVC.
2. **No hay decoder LCEVC** en las versiones objetivo del proyecto (VLC 3.x, Kodi 20/21, ExoPlayer 1.6.15/media3):
   `video_lcevc=true` es una clave que el player no conoce y descarta.
3. **No hay filtro LCEVC**: la cadena `#EXTVLCOPT:video-filter=` del propio bloque es
   `nlmeans,bwdif,gradfun,unsharp,zscale,minterpolate` — ninguno es LCEVC (ni existe un filtro VLC con ese nombre).
   `minterpolate=fps=120` es interpolación por CPU, no una capa de mejora, y además contradice `FRAME-RATE` (§6.5).
4. **El VPS no lo añade**: es rebase-only (R-04), no hay transcode ni packager.

**Regla D1:** `#EXT-X-ARA-LCEVC*`, `#EXT-X-ARA-AI-SR`, `#EXT-X-ARA-AI-FI` y `#EXT-X-ARA-FORCE-HDR` están en
`forbidden[]` con motivo y reemplazo. No se emiten; si un consumidor los encuentra en una lista vieja, los ignora
(RFC 8216 §6.3.1) y el validador los marca como **metadata ficticia** (warning, no error de reproducción).

---

## Anexo C · Índice de evidencia (sha256 medidos 2026-10-30)

| Artefacto | Bytes | sha256 | Uso en D1 |
|---|---|---|---|
| `ara-x/spec/ara_x_codec_policy.md` (D2) | 30.469 | `4A15A9C5…730560AD` | §6 completo |
| `ara-x/spec/ara_x_codec_policy.schema.json` (D2) | 8.600 | `E8A726EA…D1996342` | M-1/M-4 |
| `ara-x/spec/ara_x_codec_cases.json` (D2) | 15.969 | `FCFD2E7A…BF117F96` | 36 casos |
| `ara-x/spec/ARA_X_SYNC_PROTOCOL.md` (D3) | 31.027 | `7FE4AC47…6791328` | §8.1/§8.2 |
| `ara-x/vps/schema/sync_features.json` (D3 v2, rev. 2026-10-30 18:26) | 11.058 | `CC9EAD72…1EF0DAD4` | M-7/Gate D1-G |
| `ara-x/spec/ara_x_device_apply.md` (D4, rev. 2026-10-30 18:04) | 35.597 | `D13FC146…1159C633` | §8.3/§8.3.1/§8.3.2 (120/120 PASS) |
| `ara-x/spec/lever_namespace_map.json` (D4) | 22.004 | `F445236F…F3899A` | M-14 |
| `ara-x/spec/ara_x_decision.md` (D5) | 33.917 | `3BAFAC9C…71D0E55F` | §8.4 |
| `ara-x/spec/decision_test_vectors.json` (D5) | 32.392 | `1AA96BB3…12FDBD73` | M-15 |
| `ara-x/reports/R1_list_forensics.md` | 40336 | `305C8EE6…AA5FD24` | §6.2/§7 |
| `ara-x/reports/R1_findings.json` | 27.102 | `55C9A6EA…9F95800` | ND-1..ND-7 |
| `ara-x/reports/R2_codec_truth.md` | 33.087 | `193BF597…537B7CD8` | FZ-01 |
| `ara-x/reports/R3_vps_sync_reality.md` | 43.424 | `A75BE185…A8DBAF5D` | §10.2 |
| `ara-x/reports/R4_telemetry_matrix.md` | 55.594 | `92420FF0…3E0F8D85` | §9 |
| `ara-x/reports/R5_actuators.md` | 32.440 | `5AF6F98D…2D87BDD` | M-14 |
| `ara-x/reports/R6_security.md` | 39.630 | `9823C728…B79AB954` | §10.1 |

Listas de referencia (no versionadas por `.gitignore`): A `572.170.477 B` / `E27C03EB…E2A680`;
B `568.241.457 B` / `81DBDD11…BE14E`.

---

## Anexo D · Glosario y colisiones de nombres

| Término | Definición en este contrato | Colisión típica |
|---|---|---|
| **WIRE** | lo que el proveedor sirve y el catálogo declara | confundirlo con "display" |
| **DISPLAY** | lo que se quiere ver (piso, targets, presentación) | tratarlo como actuador |
| **CONTROL** | lo que el device puede cambiar (levers, térmica, degradación) | meterlo en el wire |
| **MINIMUM-DECODE-RESOLUTION** | **suelo** de selección (no bajar de 4K) | leerlo como "el bitstream es 4K" |
| **MAX-DECODE-RESOLUTION** | **techo** de decode del SoC (4K@60 en ONN) | leerlo como "presentación" |
| **MAX-PRESENT-RESOLUTION** | techo de **presentación/emulación** (hasta 8K) | leerlo como wire 8K |
| **FPS-TARGETS** | escalera de **display** 60/30/24 | confundirlo con `FRAME-RATE` |
| **FRAME-RATE** | fps del **wire** (medido>declarado>30) | igualarlo al target |
| **THERMAL-TARGET** | objetivo de régimen (70 °C) | confundirlo con los escalones 65/78/82 |
| **THERMAL-6x** | umbral de escalón de FPS | tratarlos como límites de apagado |
| **degrade.order** | orden de palancas; `resolution` **prohibido** en ONN | admitir `resolution` porque el schema lo admite |
| **8K-MODE** | `PRESENTATION` o `DISABLED` | `WIRE`/`ENABLED` |
| **artifact_sha256** | identidad de los bytes cargados | usar el ETag (tamaño gzip) |
| **prov** | procedencia de un dato (`measured_*`, `modeled`, `lab_ssot`, `unavailable`) | tratar `modeled` como medido |
| **allowed=false** | gate SoC cerrado; no se aplican levers nuevos | leerlo como "device roto" |

---

*Fin del contrato. Toda cifra de catálogo proviene de R1/R2; toda restricción de wire de D2; de sync de D3; de
aplicación de D4; de decisión de D5; de telemetría de R4; de actuadores de R5; de seguridad de R6; de realidad del
VPS de R3. Ninguna se inventa aquí.*
