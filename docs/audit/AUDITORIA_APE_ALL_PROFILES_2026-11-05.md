# Auditoría — APE_ALL_PROFILES_2026-11-05T18-42-56-671Z.json

**Fichero auditado**
`C:\Users\HFRC\Downloads\APE_ALL_PROFILES_2026-11-05T18-42-56-671Z.json`
405.437 B · sha256 `60e3cf07c3c8d1dbfadb1ccba5f3f79a…` · `_meta.version = APE_v9.0` · exportado `2026-11-05T18:42:56Z`

**Alcance:** los 6 perfiles (P0 `8K Master` … P5 `SD 480p`), **940 campos por perfil** en los
14 bloques principales. Auditado en modo lectura, sin modificar el fichero.

---

## CALIFICACIÓN

| Criterio pedido | Nota | Fundamento |
|---|---|---|
| **Máxima calidad de imagen 4K** | **8.0 / 10** | Cadenas de codec correctas en 5/6 y bitrate de sobra. P0 declara 12-bit con cadena Main10 |
| **0 cortes** | **6.0 / 10** | El buffer se declara con **cuatro valores distintos** en el mismo perfil |
| **0 lags** | **7.0 / 10** | `live_delay` coherente y dentro de bounds en los 6. `abrBandWidthFactor` 0.50–0.55 en P4/P5 fuerza calidad baja |
| **0 freeze** | **5.0 / 10** | **La política anti-freeze está truncada a 203 bytes y no es legible** |
| **24/7 365 días** | **4.5 / 10** | **`guarantees_10`, `error_decision_tree`, `error_407_specialized_tree`, `multi_provider_integration`, `master_audit_unified` y `buffer_aggression_policy`: los seis truncados** |
| **GLOBAL** | **6.1 / 10** | |

**Potencial con los arreglos listados al final: 9.0–9.5 / 10.** La arquitectura es sólida; los
defectos son de exportación y de coherencia interna, no de diseño.

---

## 1 · Lo que está BIEN, y es la mayor parte

### 1.1 · Cero headers tóxicos — verificado en los 6

```
P0..P5   headers=227   toxicos=0
```

Sin `Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`.
**Esta es la causa documentada de `unexpected end of stream` en OkHttp (OTT, TiviMate, ExoPlayer),
y está limpia.** Es el defecto que más reproducciones rompe en este ecosistema.

### 1.2 · Ley Cardinal 1 (nivel ↔ resolución) correcta en 5 de 6

| Perfil | Resolución | fps | codec_full | Veredicto |
|---|---|---|---|---|
| P1 | 3840×2160 | 60 | `hvc1.2.4.L153.B0` | ✅ L153 = 4K@60 |
| P2 | 3840×2160 | 30 | `hvc1.2.4.L150.B0` | ✅ L150 = 4K@30 |
| P3 | 1920×1080 | 60 | `hvc1.2.4.L123.B0` | ✅ L123 = 1080p@60 |
| P4 | 1280×720 | 30 | `hvc1.2.4.L93.B0` | ✅ L93 = 720p@30 |
| P5 | 854×480 | 30 | `avc1.42c01e` | ✅ AVC Baseline L3.0 |
| **P0** | 7680×4320 | 30 | `dvh1.08.06` | ⚠️ ver 2.2 |

### 1.3 · Bitrate generoso donde importa

| Perfil | Resolución | Mbps | Mínimo HEVC | Margen |
|---|---|---|---|---|
| P1 | 4K@60 | **49.8** | 25 | **+99 %** |
| P3 | 1080p@60 | **18.7** | 8 | **+134 %** |
| P5 | 480p | 3.1 | 1.5 | +107 % |
| P4 | 720p | 5.5 | 3.5 | +57 % |
| **P2** | 4K@30 | 24.9 | 25 | **−0 %** (al límite) |
| **P0** | 8K@30 | 79.6 | 80 | **−1 %** (al límite) |

### 1.4 · Jerarquía de codec correctamente degradada

```
P0  dvh1,dvhe,hvc1,hev1,av01,vp09
P1  hvc1,hev1,av01,vp09
P5  hvc1,avc1,av01
```
`dvh1` (Dolby Vision) solo en el perfil que puede sostenerlo. Sin cruzar la GOLDEN RULE.

### 1.5 · `live_delay` dentro de bounds en los 6

```
P0 20/35  P1 16/29  P2 13/20  P3 11/16  P4 8/12  P5 7/8
```

---

## 2 · Defectos, con su medida

### 2.1 · 🔴 CRÍTICO — Seis campos truncados a exactamente 203 bytes

```
guarantees_10                203,203,203,203,203,203
error_decision_tree          203,203,203,203,203,203
error_407_specialized_tree   203,203,203,203,203,203
multi_provider_integration   203,203,203,203,203,203
master_audit_unified         203,203,203,203,203,203
buffer_aggression_policy     203,203,203,203,203,203
```

**Los seis cortados en el mismo byte, en los seis perfiles.** Es un bug de exportación.

Lo que se alcanza a leer:
```
guarantees_10:        "{"1_zero_freezes": "gap-controller tuned", "2_zero_cortes":
                       "ABR 4 levels, upFactor=0.7", "3_zero_rebuffer": "buffer=60s
                       floor=50%", "4_zero_lag": "liveSyncDC=3 catchup=1.5x",
                       "5_zero_bugs_cmcd": "CMC...
error_decision_tree:  "{"version": "APE_ERR_TREE_v1.0_2026-04-11", "silentRecovery": true,
                       "escalationPolicy": "NEVER_REACH_PLAYER", "redirects": {"301": ...
```

**Se corta a mitad de palabra.** Las cinco garantías que se piden auditar (`0 freeze`, `0 cortes`,
`0 rebuffer`, `0 lag`, `0 bugs`) **existen en el perfil pero no son legibles completas.**

**Sin estos seis campos no se puede verificar 24/7 con honestidad.** Se ve que el diseño las
contempla; no se ve cómo las implementa.

### 2.2 · 🔴 P0 declara 12-bit con cadena Main10, y L183 con fps=30

```
resolution       : 7680x4320
fps              : 30
bit_depth        : 12          ← declara 12 bits
codec_chain_video: dvh1.08.06,hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,...
                       ↑ Main10 = 10 bits    ↑ L183 = 8K@120
```

**Dos incoherencias en la misma cadena:**
- **12 bits declarados, `hvc1.2.4` es Main10 (10 bits).** Para 12 bits debe ser `hvc1.4.*` (Main12).
- **`L183` es 8K@120**, pero el perfil declara `fps=30`. Corresponde **`L180` (8K@30)**, que de
  hecho está en segundo lugar.

`actor_injections.panel.bit_depth` también dice **12**, así que el error es consistente en dos
sitios: o la cadena está mal, o el bit depth.

### 2.3 · 🔴 El buffer se declara CUATRO veces con CUATRO valores

```
perfil | optimized.buffer_seconds | opt.buffer | vlcopt network-caching | actor.vlc.network_caching_ms | hlsjs.maxBufferLength
P0     | 50                       | 105        | 15000 (15 s)           | 105000 (105 s)               | 50
P1     | 40                       | 72         | 12000 (12 s)           | 72000  (72 s)                | 40
P2     | 33                       | 58         | 10000 (10 s)           | 58000  (58 s)                | 33
P3     | 27                       | 55         | 8000   (8 s)           | 55000  (55 s)                | 27
P4     | 20                       | 52         | 6000   (6 s)           | 52000  (52 s)                | 20
P5     | 17                       | 30         | 5000   (5 s)           | 30000  (30 s)                | 17
```

**En P0 conviven 15 s, 50 s y 105 s.** Si el player aplica `vlcopt network-caching` (el que viaja
en la playlist, `#EXTVLCOPT:network-caching=15000`), **tiene 15 s cuando el solver calculó 105 s:
7 veces menos resiliencia de la diseñada.**

**Este es el defecto que más afecta a `0 cortes` y `0 freeze`.** No es que falte buffer: es que se
declara cuatro veces y no se sabe cuál gana.

### 2.4 · 🟠 Tres perfiles violan sus propios bounds

```
P0  buffer_seconds=50  fuera de [105, 315]
P1  buffer_seconds=40  fuera de [72, 195]
P2  buffer_seconds=33  fuera de [45, 130]
```

**El solver calculó un rango y el knob quedó por debajo del mínimo.** P3–P5 sí están dentro.

Coherente con esto: `fitness` de P1 y P2 es **1.0000** pese a violar un bound. **La función de
fitness no está midiendo el cumplimiento de sus propios límites** — un perfil que los viola no
puede puntuar perfecto.

### 2.5 · 🟠 Cascadas de fallback invertidas

```
P0  4 niveles   P1  4 niveles
P2  1 nivel     P3  1 nivel   P4  1 nivel   P5  1 nivel
```

**Los perfiles bajos tienen MENOS resiliencia que los altos.** Debería ser al revés: un perfil
480p es el que más necesita cadena de fallback, no el que menos.

Mismo patrón en `X-APE-Prefetch-Segments` y `X-APE-Quality-Threshold`.

### 2.6 · 🟠 P3, P4 y P5 no declaran color space

```
P3/P4/P5  settings.transfer_characteristics = ausente
P3/P4/P5  settings.matrix_coefficients      = ausente
```

`lab_sync` sí los tiene (`transfer_characteristics: 16`, `matrix_coefficients: 9`). **Ausente en un
bloque, presente en otro: el consumidor que lea `settings` no sabe el color space.**

### 2.7 · 🟡 P0: chroma incoherente

```
settings.chroma_subsampling          = 4:2:0
actor_injections.panel.chroma_subsampling = 4:2:2
```

P1–P5 son coherentes. Solo P0 discrepa.

### 2.8 · 🟡 Dos knobs son strings donde debería haber números

```
buffer_seconds     : "50"    (string)
live_delay_seconds : "20"    (string)
```

Un consumidor que haga `buffer + 10` obtiene `"5010"`. **Riesgo real de bug silencioso** en el player.

### 2.9 · 🟡 `hlsjs.liveSyncDuration` ausente

`maxBufferLength` y `maxMaxBufferLength` existen (50 y 50 en P0, o 105 y 210 en
`actor_injections.player.hlsjs`), pero `liveSyncDuration` es `undefined` en los 6.

---

## 3 · Recuento de incoherencias por perfil

| Perfil | # | Detalle |
|---|---|---|
| **P0** | **4** | buffer fuera de bounds · 12-bit con Main10 · chroma 4:2:0 vs 4:2:2 · buffer como string |
| **P1** | **2** | buffer fuera de bounds · buffer como string |
| **P2** | **3** | buffer fuera de bounds · buffer como string · cascada de 1 nivel |
| **P3** | **3** | buffer como string · cascada de 1 nivel · sin transfer_characteristics |
| **P4** | **4** | 8-bit con Main10 · buffer como string · cascada de 1 nivel · sin transfer_characteristics |
| **P5** | **3** | buffer como string · cascada de 1 nivel · sin transfer_characteristics |

**19 incoherencias en 6 perfiles.** Más los 6 campos truncados × 6 perfiles = 36 campos ilegibles.

---

## 4 · Qué haría para llegar a 9.5

| # | Acción | Criterio que sube | Δ |
|---|---|---|---|
| 1 | Arreglar el export: los 6 campos a 203 B | 24/7 y freeze | **+1.8** |
| 2 | Un único valor de buffer por perfil, dentro de bounds y en ms o s coherente | cortes | **+1.2** |
| 3 | P0: `hvc1.4.4.L180` si es 12-bit, o `bit_depth: 10` | calidad | **+0.5** |
| 4 | Cascadas de 4 niveles también en P2–P5 | 24/7 | **+0.5** |
| 5 | `transfer_characteristics` y `matrix_coefficients` en P3–P5 | calidad | **+0.2** |
| 6 | `buffer_seconds` y `live_delay_seconds` como números | estabilidad | **+0.2** |
| 7 | Revisar la función de fitness (P1=1.0 violando bound) | confianza | **+0.2** |
| 8 | P0: chroma 4:2:0 o 4:2:2, pero el mismo en los dos bloques | calidad | **+0.1** |

**De 6.1 a ~9.5.**

---

## 5 · Lo que esta auditoría NO puede afirmar

- **No afirma que estos perfiles sostengan 24/7 365.** La política de buffer, el árbol de errores
  y las garantías están cortados antes de la mitad. **Lo que se ve promete
  (`silentRecovery: true`, `escalationPolicy: NEVER_REACH_PLAYER`), pero prometer no es medir.**
- **No afirma 0 freeze ni 0 cortes reales.** El fichero declara intenciones; no hay telemetría de
  sesiones en él.
- **No verifica el bitstream.** El fichero declara `dvh1.08.06` y `bitrate 79.6`; no hay muestra de
  vídeo que confirme que la fuente sirve eso.
- **No hay medición de VMAF/SSIM.** El perfil declara `vmaf_target: 95` en `lab_sync`; es un
  objetivo configurado, no una medición.
- **No audita el generador** (`m3u8-typed-arrays-ultimate.js`), solo el JSON exportado.

---

**Artefacto:** este documento. **Fichero auditado sin modificar** (sha256 `60e3cf07…`).
**Método:** lectura del JSON, comparación de bloques, verificación de bounds y Ley Cardinal 1.
