# D2 · Política de codec/HDR y 4K/8K fake (fail-closed, NEVER-DROP)

**Tarea:** `t8` (D2) · **Autor:** `codec-hdr-scientist` (S3 + S4) · **Fecha:** 2026-10-30
**Estado:** contrato repo-only. Cero VPS, cero device, cero ADB, cero props, cero generador editado.
**Entregables:** este contrato + [`ara_x_codec_policy.schema.json`](ara_x_codec_policy.schema.json) (8.600 B, sha256 `E8A726EA…D1996342`) + [`ara_x_codec_cases.json`](ara_x_codec_cases.json) (15.969 B, sha256 `FCFD2E7A…BF117F96`, 36 casos ejecutables).
**Fuentes que manda:** R2 [`4k8k_matrix.json`](4k8k_matrix.json) · R4 [`R4_telemetry_matrix.md`](../reports/R4_telemetry_matrix.md) · R5 [`R5_actuators.md`](../reports/R5_actuators.md) + [`actuator_allowlist.json`](actuator_allowlist.json) · R1 [`R1_findings.json`](../reports/R1_findings.json) · R6 [`R6_security.md`](../reports/R6_security.md) · D4 [`ara_x_device_apply.md`](ara_x_device_apply.md) · D5 [`ara_x_decision.md`](ara_x_decision.md) · [`ARA_X_SYNC_PROTOCOL.md`](ARA_X_SYNC_PROTOCOL.md).

`spec=ara-x-codec-policy.v1` · `cases=36` · `invariantes=12` · `reglas=10 grupos (POL-W/L/F/H/K/S/T/D/N/C)`

---

## 0 · Resumen ejecutivo — las 7 decisiones que toma D2

| # | Decisión | Consecuencia |
|---|---|---|
| 1 | **El piso 4K es testigo de selección/display, NO licencia de wire.** `RESOLUTION=3840x2160` puede sobrevivir como *presentación* del panel, pero **`CODECS` deja de ser parte del piso**: se deriva de la evidencia. | Mata FZ-01 sin quitar el “4K blanket” que el propietario aprobó (cambia el codec público, no la resolución). |
| 2 | **Dos posturas de señalización, una sola por defecto:** `TRUTHFUL_SIGNAL` (por defecto, fail-closed) y `DAEMON_VERIFIED` (solo con `cascade_type`/probe que haya visto `hvc1`/`hev1` reales). El daemon **no fabrica evidencia**; solo se acepta evidencia que ya exista. | Ni el VPS ni la playlist pueden “activar” un decoder ajeno: lo que no está probado, no se declara. |
| 3 | **8K = presentación, jamás wire.** `RESOLUTION=7680x4320`, `mode=8k_emulated` y niveles ≥ L180 quedan prohibidos en `amlogic_s905x4`. | Cierra R1 F-18 (knobs VLC `maxwidth=7680`, `vrr_max=120`) y la Ley Cardinal 1. |
| 4 | **Un solo FPS por canal.** Precedencia `medido > declarado > 30`; `FRAME-RATE` nunca supera el medido; `60` como *target* va en marcador inerte, no en el atributo. | Cierra R1 F-20 (triple FPS contradictorio) y R2 V11 (10.503 sobredeclaraciones). |
| 5 | **PQ se queda (LOCKED 2026-06-16) pero se etiqueta como intención.** `VIDEO-RANGE=PQ` + `#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0`; DV/HLG exigen evidencia; `MaxFALL ≤ MaxCLL`, `AVG ≤ PEAK`. | PQ deja de ser una afirmación de bitstream y pasa a ser una declaración de display explícita. |
| 6 | **Fail-closed por SoC canónico.** `{mt8696, amlogic, s905x4, s905x3}` tras normalizar (`amlogic_s905x4 → s905x4`); desconocido ⇒ `allowed=false`, `levers={}` y wire **solo veraz** (sin presentación). | Cierra R5 GAP-01/02 y D4-F01 sin depender del guard roto del cliente. |
| 7 | **La telemetría no puede mentir para decidir.** `modeled ≠ measured`, `null ≠ 0`, `qoe_score` del navegador no es playback, `decoder_error` hoy es 400 ⇒ **no existe rollback automático PQ→SDR por error de decoder**; se declara la limitación. | Cierra R4-F01/F02/F05 en la política de imagen. |

**Cambio visible en la lista (si I5 aplica esta política):** `CODECS` público pasa de
`hvc1.2.4.L153.B0,mp4a.40.2` (10.631) a la familia real (`avc1.640033` / `avc1.640028` para 9.593,
`hvc1.*` para 1.038) y `FRAME-RATE` pasa a 25/50 medidos donde se conozcan. `RESOLUTION=3840x2160` puede
seguir como presentación en el ONN 4K, **marcado**. Ninguna URL se toca y ningún canal se pierde.

---

## 1 · Qué decide este contrato (y qué NO)

| Decide D2 | No decide (otros contratos / invariantes) |
|---|---|
| Valores de `RESOLUTION`, `CODECS`, `VIDEO-RANGE`, `FRAME-RATE`, `BANDWIDTH` del `#EXT-X-STREAM-INF` (el **wire**) | Gramática/placement de tags (`D1`, `I2`): ARA-X **no añade gramática HLS** (R1 handoff) |
| Clamps de knobs de player que empujan 8K/120 (`adaptive-maxwidth/maxheight`, `vrr_max`, `video-fps`, `minterpolate`) | Los 13 levers VPP y su namespace (`R5`, `D4`) |
| Postura de señalización por canal y por SoC (`TRUTHFUL_SIGNAL` / `DAEMON_VERIFIED`) | La matemática de decisión (fuzzy/Thompson/térmico) → `D5` |
| Piso 4K como **testigo** (`display.min_resolution`, `never_downscale`) y techo 8K (`eight_k`) | El contrato `/sync` completo y su HMAC/TTL/replay → `D3` |
| Qué métrica puede gatillar degradación de imagen y cuál no (provenance gates) | La aplicación material en el device → `D4`; umbrales térmicos de proceso → `D5` |
| NEVER-DROP en la capa de declaración (0 canales perdidos, 0 URLs mutadas, variante veraz para los 45) | El inyector/validador de la lista → `I2`; el motor ejecutable → `I5` |

**Regla de oro heredada:** `resolución = presentación declarada (permitida y marcada)` · `codec = verdad
(prohibido falsear)` · `nivel = el que la resolución×fps exige (nunca por debajo)`.

---

## 2 · Evidencia de entrada

### 2.1 Tiers del resolver (F0-F5) — lo que ya existe

| Tier | Evidencia | `codecVerified` | Confianza típica | Uso en D2 |
|---|---|---|---|---|
| **F0** `REAL_VERIFIED_MAX` | probe OK, 0 contradicciones | `true` | ≥ 85 | `NATIVE_VERIFIED` |
| **F1** `REAL_PARTIAL_MAX` | probe parcial | `true`/`partial` | ≥ 60 | `DAEMON_VERIFIED` si `cascade_type`; si no, `TRUTHFUL_SIGNAL` |
| **F2** `HEVC_PREMIUM_HINT` | nombre/grupo premium, sin probe | `false` | — | `TRUTHFUL_SIGNAL` (nunca `hvc1` si la familia es `h264`) |
| **F3** `HEVC_SAFE_1080P` | FHD/HD probable | `false` | — | `TRUTHFUL_SIGNAL` |
| **F4** `AVC_HIGH_SAFE` | sin evidencia HEVC ni premium | `false` | — | `TRUTHFUL_SIGNAL`, familia AVC |
| **F5** `ORIGINAL_DIRECT_SAFE` | última defensa | — | — | **sin `STREAM-INF`** (solo `EXTINF`+URL) |

### 2.2 Vector de evidencia por canal (entrada canónica)

```
{
  channel_id:           string           # tvg-id; NUNCA la URL (R6/F-03: user/pass en el path)
  evidence_tier:        F0..F5
  source_family:        hevc | h264 | av1 | vp9 | unknown     # ape-codec-family / resolver
  source_resolution:    7680x4320 | 3840x2160 | 1920x1080 | 1280x720 | unknown
  measured_fps:         24 | 25 | 30 | 50 | 60 | unknown      # ape-fps / probe
  cascade_type:         "dual-hvc1-hev1" | "single" | null     # nginx Lua observer / probe
  probe_codec_string:   string | null                          # solo si probe real
  declared:             { resolution, codecs, video_range, frame_rate }   # lo que trae la lista hoy
  player_knobs:         { vlc_maxwidth, vlc_maxheight, vlc_vrr_max, vlc_video_fps, vlc_minterpolate_fps, kodi_video_codec }
}
```
`prov` de cada campo ∈ `{measured_device, measured_server, derived, modeled, lab_ssot, unavailable}`
(R4 §6.4). `source_family` y `source_resolution` son **evidencia declarada** (resolver), no probe: la
política las trata como `hint` salvo que `cascade_type`/`probe_codec_string` las confirmen.

### 2.3 SoC canónico

```
normalize(soc_raw) = lower(trim(soc_raw)) → ALIAS → debe ∈ CANON
CANON  = {mt8696, amlogic, s905x4, s905x3}
ALIAS  = {amlogic_s905x4→s905x4, amlogic-s905x4→s905x4, s905x4_amlogic→s905x4,
          amlogic_s905x3→s905x3, amlogic-s905x3→s905x3, s905x3_amlogic→s905x3,
          firetv_mt8696→mt8696, mediatek_mt8696→mt8696}
```
Idéntico a D4 §3 y a `ape_soc_allowlisted()` (R5 §8). **El string del protocolo
(`amlogic_s905x4`) NO casa con la allowlist exacta**: normalizar antes de decidir (R5 GAP-01/02).

---

## 3 · Invariantes (12)

| ID | Invariante | Verificación |
|---|---|---|
| **POL-1** | El wire (`RESOLUTION`/`CODECS`/`VIDEO-RANGE`/`FRAME-RATE`/`BANDWIDTH`) es **veraz o está ausente**; nunca se inventa un codec que el bitstream no sostiene | casos C01-C12, C31-C33 |
| **POL-2** | `hvc1.*` público **solo** si `source_family=hevc` **o** `cascade_type="dual-hvc1-hev1"`; jamás sobre `family=h264` | C05/C06/C07/C13 |
| **POL-3** | Wire 8K prohibido: `RESOLUTION≠7680x4320`, `mode≠8k_emulated`, nivel `≤ L153` en `s905x4` | C09/C10/C27 |
| **POL-4** | Ley de niveles: `level_idc(CODECS) ≥ required_level(RESOLUTION, FRAME-RATE)`; si no cabe, se baja **fps**, nunca resolución | C11/C12/C22 |
| **POL-5** | Piso 4K = testigo: `display.min_resolution=3840x2160`, `never_downscale=true`; ninguna clave de resolución es actuador (INV-1 de D5) | C15-C18 |
| **POL-6** | Degradación: `fps 60→30→24` → post-proceso → (bitrate dentro del tier 4K) → **resolución prohibida**; `degrade.order` en `s905x4` = `[fps, processing]` | C19/C20/C30 |
| **POL-7** | Fail-closed SoC: fuera de CANON ⇒ `device.allowed=false`, `levers={}`, wire `TRUTHFUL_ONLY` (sin presentación) | C23/C24 |
| **POL-8** | `null ≠ 0`: sensor ausente ⇒ `thermal_unavailable`, 0 clamps nuevos, y **nunca** se declara “frío” | C25/C26 |
| **POL-9** | `modeled ≠ measured`: `buffer_health_pct` (modelo del daemon) no gatilla degradación de imagen; `qoe_score` del navegador no es playback | C28/C29 |
| **POL-10** | NEVER-DROP: 10.631 canales, 0 URLs mutadas, 1 URL/canal; los 45 sin variante reciben bloque veraz o quedan F5 y se cuentan como warning | C34/C35/C36 |
| **POL-11** | Determinismo/idempotencia: decisión = función pura de la evidencia (sin reloj/RNG/red); misma entrada ⇒ mismo byte | runner de casos |
| **POL-12** | PQ es intención de display (LOCKED 2026-06-16) y **no** habilita codec/DV/HLG sin evidencia; metadata HDR físicamente posible (`MaxFALL ≤ MaxCLL`, `AVG ≤ PEAK`) | C13/C14/C21 |

---

## 4 · Matriz de wire (el núcleo)

### 4.1 Postura por evidencia

| Evidencia | `wire.mode` | `RESOLUTION` | `CODECS` (familia) | Nivel | `codec_verified` |
|---|---|---|---|---|---|
| F0 + probe HEVC/AV1 + cascade | `NATIVE_VERIFIED` | **real** (`res_src`) | la del probe (`hvc1`/`hev1`/`av01`) | `required(res,fps)` ≤ techo SoC | `true` |
| F1 + `cascade_type="dual-hvc1-hev1"` | `DAEMON_VERIFIED` | real (o 4K si `res_src=4K`) | `hvc1` | `required` | `false` (hint verificado por cascada, no por probe) |
| F2/F3/F4 con `family=h264` | `TRUTHFUL_SIGNAL` | **real** (presentación 4K solo con marcador, §6) | `avc1.640033` si declara 4K (solo fps≤30) · `avc1.64002A` (1080p≥50) · `avc1.640028` (resto) | L5.1 / L4.2 / L4.0 | `false` |
| F2/F3 con `family=hevc` | `TRUTHFUL_SIGNAL` | real | `hvc1.2.4.L*` según res/fps | `required` | `false` |
| F0/F1 con `family=av1` | `TRUTHFUL_SIGNAL` | real | `av01.0.13M.10` (4K) / `av01.0.08M.08` | — | `true` si probe |
| `family=unknown` | `TRUTHFUL_SIGNAL` | **ausente** | **ausente** (sin `CODECS`) | — | `false` |
| F5 | `PASSTHROUGH_F5` | — | — | — | — (sin `STREAM-INF`) |

### 4.2 Tabla maestra (evidencia × SoC × player)

> `soc_ok` = SoC canónico en `CANON`. `presentación` = `RESOLUTION=3840x2160` sobre fuente < 4K, marcada.
> Todas las filas cumplen POL-1..POL-4; las celdas dicen **solo** lo que cambia.

| Tier | family | `soc_ok` | Player que honra `STREAM-INF` | Player que lo ignora (OTT/TiviMate/VLC catálogo) |
|---|---|---|---|---|
| F0 | hevc | sí | `NATIVE_VERIFIED` · real · `hvc1` L153 si 4K60 · verified | igual (los atributos son inertes para él) |
| F1 | hevc | sí | `DAEMON_VERIFIED` si cascade; si no `TRUTHFUL_SIGNAL` | idem |
| F2 | h264 | sí | `TRUTHFUL_SIGNAL` · `avc1.640033` si presenta 4K (fps≤30); si fps>30, 1080p nativo con `avc1.64002A` · presentación **marcada** | idem |
| F2 | hevc | sí | `TRUTHFUL_SIGNAL` · `hvc1` (familia correcta) · presentación marcada | idem |
| F3 | h264 | sí | `TRUTHFUL_SIGNAL` · codec según res declarada y fps (§4.1) · presentación marcada | idem |
| F3 | hevc | sí | `TRUTHFUL_SIGNAL` · codec según res declarada y fps (§4.1) | idem |
| F4 | h264 | sí | `TRUTHFUL_SIGNAL` · codec según res declarada y fps (§4.1) | idem |
| F5 | any | — | `PASSTHROUGH_F5` (sin `STREAM-INF`) | idem |
| cualquiera | unknown | sí | sin `CODECS`, sin `RESOLUTION` | idem |
| cualquiera | cualquiera | **no** | `TRUTHFUL_ONLY`: real, sin presentación | idem |

**Player que honra `STREAM-INF`** (ExoPlayer/hls.js y derivados: OTT Navigator, TiviMate en su parser
interno, Smarters) = riesgo FZ-01 real si el `CODECS` miente. **Player que lo ignora** (VLC/Kodi en
catálogo, TiviMate con EXTINF+URL) = el wire no le afecta, pero **sí** los knobs `#EXTVLCOPT`/`#KODIPROP`
(§9) — por eso el gate cubre ambas capas.

---

## 5 · FZ-01: las dos posturas y el gate

### 5.1 Definición operativa

```
FZ-01  ⇔  CODECS público declara una familia ≠ familia real del bitstream
          (el caso medido: 9.593 canales con family=h264 y CODECS=hvc1.2.4.L153.B0)
```

El daemon **no** puede arreglarlo: el decoder lo elige el player a partir de `CODECS` (Android no permite
cambiar el decoder de un player ajeno desde fuera — `UltraEnhancePipeline.kt:12-15`, R5 §12.4). Por eso:

| Postura | Cuándo | Qué emite | Riesgo |
|---|---|---|---|
| **`TRUTHFUL_SIGNAL`** (default) | siempre que no haya cascade/probe | `avc1.*` para `h264`; `hvc1` para `hevc`; nada para `unknown` | ninguno de freeze; pierde “4K blanket” solo en el atributo `CODECS` |
| **`DAEMON_VERIFIED`** | solo si `cascade_type="dual-hvc1-hev1"` **o** `probe_codec_string` empieza por `hvc1`/`hev1` | `hvc1.2.4.L*` | ninguno si la evidencia es real; si se falsifica la evidencia, freeze |
| **`PASSTHROUGH_F5`** | F5 | ni `STREAM-INF` | ninguno (pero el player no recibe hint) |

### 5.2 Gate (fail-closed)

```
mode = F5                                         si tier = F5
     | TRUTHFUL_SIGNAL                           si !cascade && !probe && family != unknown
     | DAEMON_VERIFIED                            si (cascade || probe_hevc) && family in {hevc, unknown}
     | NATIVE_VERIFIED                            si tier = F0 && probe && family != unknown
     | TRUTHFUL_SIGNAL                            en cualquier otro caso

prohibido(hvc1_public) ⇔ family = h264 && mode != DAEMON_VERIFIED_con_cascade
```

**Nunca** se “arregla” FZ-01 reescribiendo `CODECS` a `hvc1` para sostener el 4K: se cambia el codec a la
verdad o se deja la señal sin codec. El 4K de presentación vive en `RESOLUTION` + marcador, no en `CODECS`.

---

## 6 · Resolución: piso 4K, presentación y 8K

### 6.1 Semántica del piso

```
display.min_resolution = "3840x2160"      # testigo (D5 INV-1): no es un actuador
display.wire_resolution = valor declarado  # lo que el VPS sirve (nunca 7680x4320)
display.never_downscale = true             # el ADC/degradación no baja de 4K
```

- El piso **no** crea píxeles: si la fuente es 720p, la imagen sigue siendo 720p y el panel escala.
- El piso **sí** obliga a: (a) no elegir un perfil/tier por debajo de 4K en la selección; (b) no degradar
  resolución para “arreglar” un stall (POL-6); (c) marcar la presentación (§6.2).

### 6.2 Presentación 4K (permitida y marcada)

```
permitida ⇔ soc_ok && family != unknown && res_src ∈ {1280x720,1920x1080} && !wire_8k_requested
marcador obligatorio:
  #EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k;src=<res_src>;can8k=0
  (formato ya definido en _vps_stage/lua/ape_uhd.lua v2)
```
`RESOLUTION=3840x2160` puede convivir con `CODECS=avc1.640033` (verdad). **Nunca** se permite presentación
sobre `family=unknown` ni sobre SoC no allowlisted (`TRUTHFUL_ONLY`: se declara la resolución real).

### 6.3 8K

| Camino 8K | Política |
|---|---|
| `RESOLUTION=7680x4320` | **prohibido** (wire) — si la fuente lo pide, se emite 4K y `flag=wire_8k_suppressed` |
| `CODECS` con nivel ≥ `L180` | prohibido en `s905x4`/`mt8696` |
| `display.mode=8k_emulated` | prohibido hoy (GAP-07: el APK nunca emite `caps.soc_8k`) |
| `eight_k` | siempre `presentation_only` |
| `user_preferred_resolution_*` a 7680×4320 | prohibido (D4 T4 / R5 P-4) |
| `8KFAKE` | permitido solo como `ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` (ya cumple) |

---

## 7 · FPS: fuente única y techo

```
canonical_fps = measured_fps                       si ∈ {24,25,30,50,60}
              | declared_frame_rate                 si medido desconocido y declarado ∈ {24,25,30,50,60}
              | 30                                  si ambos desconocidos

frame_rate_out = min(canonical_fps, fps_ceiling(soc), 60)
fps_ceiling:  s905x4/mt8696/amlogic/s905x3 → 60 ; unknown → 30
```
- **Nunca** `FRAME-RATE > measured_fps` cuando el medido existe (R2 V11; cierra F-20).
- El *target* de presentación (p. ej. 60 por MEMC) va en `#EXT-X-APE-FPS-TARGET:60;SCOPE=DISPLAY`, no en
  `FRAME-RATE`.
- `fps.target` de la política (`/sync`) es el objetivo del ADC (60/30/24) y puede ser **mayor** que el
  `FRAME-RATE` del wire: son cosas distintas y así se documenta.

---

## 8 · HDR: PQ de intención y límites físicos

| Señal | Regla |
|---|---|
| `VIDEO-RANGE=PQ` | **permitido** (LOCKED 2026-06-16) como intención de display; obligatorio `#EXT-X-APE-HDR-INTENT:display-pq;SCOPE=DISPLAY;VERIFIED=0` |
| `hdr_verified` | `false` salvo probe con transfer PQ/primaries BT.2020/bit-depth 10 confirmados |
| `HLG` / `HDR10` / DV | solo con evidencia; DV exige `dvh1.08.*` en `CODECS`/`SUPPLEMENTAL` + BL HEVC (R2 §6) |
| `MaxCLL` / `MaxFALL` | `MaxFALL ≤ MaxCLL` y `AVG ≤ PEAK`; si no, se corrige a `min()` y `flag=hdr_metadata_fixed` |
| `APE-HDR-TRANSFER` | no puede contradecir `TRANSFER-CHARACTERISTICS`; con PQ público debe declarar `PQ` y no `BT1886` |
| Rollback PQ→SDR | **solo** por `post_step ≥ 8` (D5 §6.2) o blacklist Phase-G; **nunca** por `decoder_error` (hoy 400, R4-F01) |

---

## 9 · Knobs de player (gate de la capa cliente: R1 F-18/F-20)

La lista transporta `#EXTVLCOPT`, `#KODIPROP` y `#EXT-X-SYS-*` que empujan 8K/120 en 10.631 bloques. El
gate D2 los clampa **en la lista** (no requiere device):

| Knob | Hoy (medido R1) | Regla D2 | Motivo |
|---|---|---|---|
| `adaptive-maxwidth` | 7680 ×10.631 | `min(3840, declared_w)` | evita que el player pida 8K |
| `adaptive-maxheight` | 4320 ×10.631 | `min(2160, declared_h)` | idem |
| `video-vrr_max` | 120 ×10.631 | `min(60, fps_ceiling)` | 4K@120 no existe en S905X4 |
| `video-fps` | 60 ×10.631 | `canonical_fps` (§7) | F-20: un solo FPS |
| `minterpolate fps` | 120 ×10.631 | **0 / eliminar** | no hay MEMC verificado (R5 §8: `memc enabled:false`) |
| `inputstream.adaptive.video_codec` | `hevc,av1,vp9,h264` | familia declarada primero (o solo la familia) | no anunciar familias que el bitstream no tiene |
| `#EXT-X-SYS-VIDEO-CODEC-PRIORITY` | `dvh1,dvhe,hvc1,hev1,av01,vp09,avc1` | **metadata inerte** (no se toca) | no es un atributo de variante; no gatilla decoder |
| Knobs de resolución de salida (`user_preferred_resolution_*`) | no están en la lista | **prohibidos** | D4 T4 / R5 P-4 (8K por la puerta de atrás) |

**Player matrix (qué se puede aplicar):**

| Player | Lee `STREAM-INF` | Lee `#EXTVLCOPT`/`#KODIPROP` | Gate aplicable en lista | Gate aplicable en device |
|---|---|---|---|---|
| APK ARA (media3) | sí | no | wire + marcadores | levers VPP (`/a/cfg`/SSE) |
| OTT Navigator (Exo2) | sí | parcial | wire + `EXTVLCOPT` | — |
| TiviMate / Smarters | a veces | parcial (TiviMate: single-value) | wire + `EXTVLCOPT` | — |
| VLC / Kodi | no (catálogo) | **sí** | **knobs** (§9) | — |
| hls.js (si existiera) | sí | no | wire | — |
| Genérico | depende | depende | wire + knobs | — |

---

## 10 · SoC, telemetría y fail-closed

### 10.1 Gate SoC (reusa D4 §3)

| Caso | `device.allowed` | `levers` | Wire |
|---|---|---|---|
| SoC canónico en CANON | `true` | según allowlist VPP | `PRESENTATION` permitida (si aplica) |
| Alias (`amlogic_s905x4`) | `true` + `flag=soc_alias_used` | idem | idem |
| SoC fuera de CANON / `unknown` | `false` | `{}` | `TRUTHFUL_ONLY` (sin presentación) |
| Sin `caps` (no heartbeat) | `false` | `{}` | `TRUTHFUL_ONLY` |
| Política con SoC ≠ SoC medido | `false` | `{}` | `TRUTHFUL_ONLY` |

### 10.2 Qué telemetría puede gatillar qué (R4)

| Feature (prov) | ¿Puede degradar imagen? | Condición |
|---|---|---|
| `vst_ms`, `rebuffer_events/ms`, `frame_drop_count`, `bitrate_bps` (`measured_*`) | **sí** | frescura `age ≤ 2×cadencia` y `conf ≥ 0.3` |
| `frame_drop_ratio`, `stutter_probability` (`derived`) | sí, solo si sus primitivas son `measured` | fórmula R4 §6.3; si no, `null` |
| `buffer_health_pct` (`modeled`, daemon) | **no** (solo ABR/envelope) | R4 §6.4 regla 2 |
| `qoe_score` del navegador | **no** (no mide playback: R4-F02) | excluido |
| `thermal_status` (`measured_device`, API 29+) | sí (bandas D5) | si `unknown` ⇒ 0 clamps nuevos + `thermal_unknown` |
| `cpu_temp_c`/`gpu_load_pct`/`vpu_load_pct` | **no** (unavailable) | `null`, nunca 0 |
| `decoder_error` | **no existe** (400, R4-F01) | limitación declarada: sin rollback automático |
| `content.*` (`lab_ssot`) | no gatilla; solo contexto | no se inventa en device |

**Prior cuando no hay observación:** `P2` + `qoe_unknown` + sin levers nuevos (fail-closed suave), **no**
“sano”. `ape_risk_from_qoe([])` no es sano (R4).

---

## 11 · Degradación y NEVER-DROP

```
rank 1  fps          60 → 30 → 24      (D5 §6.1; aplicable si el player tiene selector)
rank 2  processing   9 pasos VPP       (D5 §6.2; se atenúa antes que el bitrate)
rank 3  bitrate      variantes 4K      (ABR dentro del mismo tier)
rank 4  resolution   PROHIBIDO         (piso 3840x2160; POL-5)
```

- `degrade.order` en `s905x4` = `["fps","processing"]` — **sin** el token `resolution` (aunque el schema de
  D3 lo admita, la política no lo emite; si un cliente lo recibe, lo ignora y marca `flag=resolution_token_rejected`).
- Un `fps_step>0` que el player no puede aplicar **no se declara aplicado** (D5 INV-7):
  `fps.applied=false` + `flag=fps_unavailable` + `post_step = max(post, min(2×fps_step, 9))`.
- **NEVER-DROP:** 10.631 canales antes/después; 0 URLs mutadas; 1 URL/canal; F5 conserva el canal; los 45
  sin variante reciben bloque veraz (o quedan F5) y se cuentan `channels_without_variant=45` como warning
  explícito (R1 F-12 / handoff). Un fallo de actuador **no** se propaga al player (INV-7 de R5).

---

## 12 · Algoritmo de referencia (determinista)

```
function decide(input):                       # puro: sin reloj, sin RNG, sin red
  soc      = canonical_soc(input.soc_raw)      # {mt8696,amlogic,s905x4,s905x3} | unknown
  soc_ok   = soc ∈ CANON
  fam      = input.source_family               # hevc|h264|av1|vp9|unknown
  tier     = input.evidence_tier
  cascade  = input.cascade_type == "dual-hvc1-hev1" || probe_is_hevc(input.probe_codec_string)
  fps      = canonical_fps(input.measured_fps, input.declared.frame_rate)   # §7
  fps      = min(fps, fps_ceiling(soc))
  res_src  = input.source_resolution
  eight_k_req = (input.declared.resolution == "7680x4320" || input.requested_8k)

  # 1) postura + codec
  if tier == F5: return F5(...)                # sin STREAM-INF
  if fam == unknown: mode = TRUTHFUL; codecs = null; res_out = null
  else if tier == F0 && probe_ok: mode = NATIVE_VERIFIED; codecs = probe.family_string
  else if cascade && fam in {hevc, unknown}: mode = DAEMON_VERIFIED; codecs = hvc1(...)
  else: mode = TRUTHFUL; codecs = family_string(fam, res_decl, fps)   # avc1/hvc1/av01

  # 2) resolución declarada (presentación permitida solo con soc_ok y family conocida)
  if eight_k_req: flag wire_8k_suppressed; res_decl = min(4K, res_src)  # nunca 8K
  else if res_src known: res_decl = (soc_ok && fam != unknown && res_src < 4K) ? 4K : res_src
       else: res_decl = null

  # 3) nivel (Ley Cardinal 1): si required(res_decl,fps) > level_max(codecs) → bajar fps
  (codecs, fps, res_decl) = enforce_level_law(codecs, res_decl, fps, soc)

  # 4) display/fps/degrade/knobs (D5 fields + §9 clamps)
  ...
  return decision
```

**Orden de resolución de conflictos:** 8K→4K (nunca al revés) · nivel>techo ⇒ fps-- (nunca res--) ·
SoC desconocido ⇒ sin presentación · familia desconocida ⇒ sin codec.

---

## 13 · Tabla de casos (resumen; los 36 están en `ara_x_codec_cases.json`)

| ID | Escenario | Esperado (claves) |
|---|---|---|
| C01 | F0, hevc, 4K, 60fps, s905x4, probe | `NATIVE_VERIFIED` · `hvc1.2.4.L153.B0` · `res 4K` · `verified` |
| C02 | F0, av1, 4K, 60, s905x4, probe | `av01.0.13M.10` · `NATIVE_VERIFIED` |
| C03 | F1, hevc, 4K, cascade | `DAEMON_VERIFIED` · `hvc1.2.4.L153.B0` · `verified=false` |
| C04 | F1, hevc, 4K, sin cascade | `TRUTHFUL_SIGNAL` · `hvc1.2.4.L153.B0` (familia correcta) |
| C05 | F2, **h264**, 1080p, 25fps | `TRUTHFUL_SIGNAL` · **`avc1.640033`** (4K presentación) · `PREFERRED:avc1.640028` · `FRAME-RATE=25` |
| C06 | F2, h264, 1080p, 50fps | `avc1.64002A` (L4.2) · `FRAME-RATE=50` |
| C07 | F2, h264, 4K real, 30fps | `avc1.640033` (L5.1) · res 4K nativa |
| C08 | F3, hevc, 720p, 30fps | `hvc1.2.4.L150.B0` (4K presentación) · `CODEC-PREFERRED:hvc1.2.4.L93.B0` |
| C09 | F2, h264, 1080p, `declared=7680x4320` | `wire_8k_suppressed` · res 4K · `avc1.640033` |
| C10 | F0, hevc, 8K real, probe | `wire_8k_suppressed` · res 4K · nivel ≤ L153 |
| C11 | F0, hevc, 4K, 120fps, probe | fps→60 · `hvc1.2.4.L153.B0` · `fps_clamped_120` |
| C12 | F2, h264, 1080p, 60fps, SoC desconocido | `TRUTHFUL_ONLY` · res 1080p · `avc1.640028` · `FRAME-RATE=30` (techo SoC) |
| C13 | F2, h264, 1080p + `VIDEO-RANGE=PQ` | PQ permitido + marcador HDR-INTENT · sin DV |
| C14 | F0, hevc, DV request sin `dvh1` | DV rechazado · `flag=dv_without_codec` |
| C15 | degradación térmica status=3 | `fps.target=30` · `post_step>0` · res 4K intacta |
| C16 | status=5 | `fps.target=24` · `post_step≥6` · res intacta |
| C17 | status=unknown | 0 clamps nuevos · `thermal_unknown` · res intacta |
| C18 | thermal + `fps_unavailable` (player nativo) | `fps.applied=false` · `post_step` compensado |
| C19 | QoE unknown (`[]`) | `profile=P2` · `qoe_unknown` · sin levers nuevos |
| C20 | `buffer_health_pct` modelado bajo | **no** degrada imagen · solo envelope ABR |
| C21 | `MaxFALL=1000 > MaxCLL=100` | `hdr_metadata_fixed` · MaxFALL=100 |
| C22 | 4K@60 con `L120` heredado | nivel elevado a L153 (o fps 30) · `level_fixed` |
| C23 | `soc=amlogic_s905x4` | `soc=s905x4` · `soc_alias_used` · `allowed=true` |
| C24 | `soc=unknown` | `allowed=false` · `levers={}` · `TRUTHFUL_ONLY` |
| C25 | `soc=firetv_mt8696` | `mt8696` · techo 4K60 (no 8K) |
| C26 | 45 sin variante, family=hevc | bloque veraz (`hvc1.2.4.L150.B0` por 4K@25) + `channels_without_variant` |
| C27 | petición explícita 8K (`requested_8k=true`) | rechazada · `wire_8k_suppressed` |
| C28 | knobs VLC 7680/4320/120 | clamp 3840/2160/60 · `knobs_clamped` |
| C29 | `video-fps=60` con medido 25 | `video-fps=25` · `fps_fixed` |
| C30 | 4K@60 + post_step=9 | `hdr_hint=SDR` · res 4K · `pq_rollback` |
| C31 | family=unknown, tier=F2 | sin `CODECS` · sin `RESOLUTION` · `codec_unknown` |
| C32 | F5 | sin `STREAM-INF` · canal conservado |
| C33 | `avc1` declarado con family=hevc | normalizado a `hvc1` · `family_fixed` |
| C34 | URL con user:pass | **no** se transporta en la decisión · `url_not_in_decision` |
| C35 | 10.631 canales | contador invariante `channels=10631` |
| C36 | doble ejecución | byte-idéntico · `idempotent=true` |

---

## 14 · Validación ejecutada

- **36/36 casos** ejecutados contra la implementación de referencia (temp, no commiteada): **1.435 aserciones PASS · 0 FAIL** (36 casos + 300 estados sintéticos + schema + invariantes).
- **Schema** [`ara_x_codec_policy.schema.json`](ara_x_codec_policy.schema.json) valida las 36 salidas
  (`additionalProperties:false` en todos los objetos, enums cerrados, `degrade.order` sin `resolution`).
- **Invariantes** POL-1..POL-12 comprobadas sobre los 36 casos + 300 estados sintéticos: 0 violaciones.
- **Idempotencia:** cada caso se ejecuta dos veces y la salida es byte-idéntica (POL-11).
- **Secretos:** 0 URLs, 0 credenciales, 0 tokens en los 3 entregables (scan de 4 patrones).

Comandos (host Windows, Node v24):

```powershell
node <tmp>/d2_check.js            # 36/36 casos + 300 estados + schema + invariantes
node -e "JSON.parse(fs.readFileSync('ara-x/spec/ara_x_codec_cases.json'))"
```

---

## 15 · Handoff

| Consumidor | Qué toma de D2 |
|---|---|
| **D1** (contrato maestro) | `policy.wire` (modo, resolución, codecs, nivel), `display.*`, `degrade.order`, `knobs.*`, `fz01` |
| **D3** (`/sync`) | Los 7 campos que ya existen en `sync_response.schema.json` v2: `display.mode/wire_resolution/min_resolution/never_downscale/eight_k/hdr_hint`, `fps.target/current/min`, `degrade.order` (sin `resolution`), `device.allowed/soc`, `processing.tier` |
| **D4** (device apply) | Nada nuevo de levers: D2 solo **valida** `wire_resolution` y prohíbe `user_preferred_resolution_*`; la canonicalización es la misma |
| **D5** (decisión) | `wire` no participa en fuzzy/Thompson; `display.hdr_hint` sí (`post≥8→SDR`); `fps.target` es su salida |
| **I5** (policy engine) | `ara_x_codec_cases.json` como vectores + `ara_x_codec_policy.schema.json` como contrato de salida + §12 como pseudocódigo |

**Frontera con `/sync`:** el objeto `wire.*` (resolution/codecs/video_range/frame_rate) es salida del **emisor/validador de la lista**, NO viaja en la política `/sync` (D5 INV-1 prohíbe claves de resolución actuables). D3 consume solo `display.*`, `fps.*`, `degrade.*`, `device.allowed/soc` y `processing.tier`, que ya existen en `sync_response.schema.json` v2. `wire.resolution` es metadata de lo declarado, nunca un actuador.

**Gaps honestos:** (a) `source_family`/`source_resolution` son evidencia del resolver, no probe — por eso
existe `DAEMON_VERIFIED`; (b) el APK no emite `caps.ai_sr` ni `caps.soc_8k` (GAP-07) ⇒ `8k_emulated` es
inalcanzable y así se declara; (c) no hay medición de `decoder_error` (400) ⇒ no hay rollback automático
PQ→SDR por esa vía; (d) el efecto térmico real de cada escalón no está medido (R5 §14.6.3); (e) la lista
muta entre generaciones (R1 F-13): la idempotencia es intra-generación y `/sync` debe fijar el sha256 del
artefacto (D3).

---

*Fin del contrato. Toda cifra de catálogo proviene de `R2`/`R1`; toda restricción de device, de `R5`/`D4`;
toda restricción de telemetría, de `R4`/`D5`.*
