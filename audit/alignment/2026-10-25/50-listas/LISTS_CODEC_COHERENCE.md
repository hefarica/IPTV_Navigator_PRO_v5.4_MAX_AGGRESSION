# LISTS_CODEC_COHERENCE — Coherencia códec/nivel/resolución/HDR en las dos familias

**Tarea:** t8 (T7) · **Auditor:** `listas-m3u8` · **Ventana:** `2026-10-26T04:07Z – 04:30Z`
**Doctrina:** **Ley Cardinal 1 — Nivel↔Resolución** (`L153` = 4K@60 techo; declararlo en 8K@120 = el freeze
2026-06-08), **GOLDEN RULE `hvc1.*`/`hev1.*`**, «sin fake HDR/CMAF/SUPPLEMENTAL-CODECS»,
`codec-rfc6381-string-validator`, `single-url-per-channel-enforcer`, `iptv-omega-working-flow-manifesto` §Leyes 1-3.

**Tabla de niveles usada** (HEVC Annex A / H.264 Annex A / AV1 §A.3) — declarada para que el auditor pueda
reproducir el veredicto:

| Resolución@fps declarada | HEVC level_idc mínimo | AVC level mínimo | AV1 `seq_level_idx` mínimo |
|---|---|---|---|
| 1280×720@30 | L93 (3.1) | 3.1 | ≤3 |
| 1920×1080@30 | L120 (4.0) | 4.0 | ≤7 |
| 1920×1080@60 | **L123 (4.1)** | **4.2** | ≤7 |
| 2560×1440@30 | L150 (5.0) | 5.0 | ≤11 |
| 3840×2160@30 | L150 (5.0) | 5.1 | 12-13 |
| 3840×2160@60 | **L153 (5.1)** | **5.2** | 14-15 |
| 3840×2160@120 | L156 (5.2) | 5.2 | 15 |
| 7680×4320@30 | L180 (6.0) | 6.0 | **16 (6.0)** |
| 7680×4320@60 | **L183 (6.1)** | 6.2 | 17 |
| 7680×4320@120 | L186 (6.2) | — | 17 |

---

## 1. Familia A — catálogo servido por el VPS

**Artefacto:** `APE_LISTA_1792869328847.m3u8.gz` · 23 510 canales · **14 343 `#EXT-X-STREAM-INF`**
(los otros 9 167 canales no declaran variante: ver `LISTS_RFC8216_AUDIT.md` §A-06).

### 1.1 Solo existen **4** combinaciones distintas `RESOLUTION | BANDWIDTH | CODECS | VIDEO-RANGE`

| # | Nº de líneas | RESOLUTION | BANDWIDTH | CODECS | VIDEO-RANGE | ¿Ley Cardinal 1? |
|---|---|---|---|---|---|---|
| 1 | **9 698** (67,6 %) | 1920×1080 | 9 000 000 | `hvc1.2.4.L150.B0,mp4a.40.2` | PQ | ✅ coherente (L150 = 4K@30 soporta 1080p de sobra) |
| 2 | **3 630** (25,3 %) | 1920×1080 | 12 000 000 | `hvc1.2.4.L123.B0,mp4a.40.2` | PQ | ✅ coherente (L123 = 1080p@60) |
| 3 | **741** (5,2 %) | **3840×2160** | 28 000 000 | **`hvc1.2.4.L123.B0`**,mp4a.40.2 | PQ | ❌ **IMPOSIBLE** — L123 (MaxLumaPs 2 228 224) < 8 294 400 px |
| 4 | **274** (1,9 %) | **3840×2160** | 28 000 000 | **`hvc1.2.4.L120.B0`**,mp4a.40.2 | PQ | ❌ **IMPOSIBLE** — L120 (4.0, MaxLumaPs 2 228 224) < 4K |

**⇒ A-01 · HIGH · 1 015 líneas `#EXT-X-STREAM-INF` (7,08 % de las que declaran variante) violan la Ley
Cardinal 1**: declaran `RESOLUTION=3840x2160` con un nivel HEVC que **no puede cargar** esa resolución.

**Evidencia con línea y variante rastreable** (`tools/_raw_census_vigente.txt` §STREAMINF_SAMPLES, línea 85):

```
STABLE-VARIANT-ID="47_P1"  → canal 47, perfil P1
#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=30.000,
   CODECS="hvc1.2.4.L123.B0,mp4a.40.2",VIDEO-RANGE=PQ,COLOR-PRIMARIES=9,TRANSFER-CHARACTERISTICS=16,
   MATRIX-COEFFICIENTS=9,HDCP-LEVEL=TYPE-1,STABLE-VARIANT-ID="47_P1"
```

* **Por qué importa (no es cosmético):** es **exactamente el patrón del freeze 2026-06-08** — «declarar un
  nivel por debajo de la resolución». Un decoder que valide el nivel antes de inicializar (ExoPlayer
  `MediaCodec` con comprobación de perfil/nivel, algunas Smart TV) **rechaza la variante top** ⇒ el ABR cae a
  la variante siguiente (1080p) ⇒ **pérdida real de calidad** en el canal 4K, que es justo lo que
  MAX IMAGE FIRST quiere evitar.
* **Causa raíz medible:** el perfil **P1 = "4K UHD"** de la lista no usa el código del ladder doctrinal para
  4K (`hvc1.2.4.L153.B0`) sino que arrastra `L123`/`L120` de la calibración 1080p mientras la resolución sí se
  subió a 4K. Es **la "Ley de Coherencia Triple" rota en un solo borde**: resolución 4K + nivel 1080p.
* **Coincidencia con otra capa:** t5 (JSON) reportó que `P1` en la doctrina es **8K AV1** (`av01.0.15M.10`) y
  en la lista es **4K UHD** — la discrepancia de ladder sigue viva y **este borde es su consecuencia medible**.
* **Corrección (no aplicada, sólo lectura):** mapear el nivel al **máximo** que la resolución declarada exige:
  4K ⇒ `L153` como **piso**; 8K ⇒ `L180` como piso. Nunca reutilizar el nivel de un perfil inferior al subir
  la resolución.

### 1.2 Audio preservado dentro de `CODECS` — **PASS 100 %**

| Métrica | Valor |
|---|---|
| `STREAM-INF` con códec de audio dentro de `CODECS` | **14 343 / 14 343 (100 %)** |
| Códec de audio | `mp4a.40.2` (AAC-LC) en el 100 % |
| `STREAM-INF` sin audio declarado | **0** |

⇒ El rewrite del VPS **no destruye el audio** (era el riesgo #1 del `APE Crystal Edge` skill:
«al procesar `CODECS` PRESERVAR el audio sin importar el orden»). Verificado también **end-to-end** en
`LISTS_DIFF_VPS_VS_DIRECT.md` §3: el gateway reescribe `RESOLUTION` y deja `mp4a.40.2` intacto.

### 1.3 `VIDEO-RANGE` — sin duplicados, pero 100 % PQ

| Métrica | Valor |
|---|---|
| `STREAM-INF` con `VIDEO-RANGE` | **14 343 (100 %)** |
| `STREAM-INF` **sin** `VIDEO-RANGE` | **0** |
| Líneas con **`VIDEO-RANGE` duplicado** | **0** ✅ (la trampa clásica del rewrite: «reemplazar PQ sin duplicar») |
| Valor | `PQ` en el 100 % |
| `SDR` / `HLG` declarados | **0** |
| `dvh1`/`dvhe` en `CODECS` | **0** |
| `SUPPLEMENTAL-CODECS` | **0** |

* **Cumple** «sin duplicados» y «sin fake DV en `CODECS`» (la doctrina prohíbe `SUPPLEMENTAL-CODECS`
  inventado; aquí **no hay ninguno**, ni real ni falso) ✅.
* **`VIDEO-RANGE=PQ` sobre fuentes SDR** es **decisión LOCKED del propietario (2026-06-16)**, no un defecto:
  «se emite INCONDICIONALMENTE … describe la salida HDR que el display produce tras el enhancement».
  Se registra como **doctrina aplicada**, con su caveat honesto ya documentado en `CLAUDE.md`
  (color shift en players sin daemon, aceptado por el propietario).

### 1.4 HDR/DV: triple contradicción dentro del **mismo** bloque de canal

Canal `tvg-id="3"` (primer canal), líneas exactas del `.gz` descomprimido:

```
 351|#EXT-X-CMAF-DOLBY-VISION:PROFILE=8,LEVEL=6,ENABLED=true
 361|#EXT-X-APE-HDR-DV:MODE=SDR,NITS=400,BT2020=true
 376|#EXT-X-APE-DV-PROFILE:8
 380|#EXT-X-APE-DV-METADATA:RPU=true,EL=false,BL=true
 381|#EXT-X-APE-DV-ENHANCEMENT:ENABLED=true,SCALE=4
1059|#EXT-X-APE-CODEC-SOURCE:CASCADE_CSV_PREMIUM_HINT
1060|#EXT-X-APE-CONTAINER:unknown
1061|#EXT-X-APE-CONTAINER-VERIFIED:false
1064|#EXT-X-APE-HDR-VERIFIED:false
1069|#EXT-X-STREAM-INF:…,CODECS="hvc1.2.4.L150.B0,mp4a.40.2",VIDEO-RANGE=PQ,COLOR-PRIMARIES=9,TRANSFER-CHARACTERISTICS=16,MATRIX-COEFFICIENTS=9,…
```

Y en el `#EXTHTTP` del **mismo** canal (`census p1:47`):

```
"X-APE-HDR-Mode":"SDR","X-APE-HDR-Transfer":"BT1886","X-APE-HDR-Primaries":"BT709",
"X-Video-Range":"SDR","X-APE-Color-Space":"BT709","X-APE-HDR-Range":"LIMITED"
```

| Afirmación | Dónde | Dice |
|---|---|---|
| Rango/HDR del manifest | `1069` | **PQ** (HDR10) + `COLOR-PRIMARIES=9` (BT.2020) + `TRANSFER=16` (PQ) + `MATRIX=9` |
| Estado del propio generador | `1064` | `HDR-VERIFIED:false` |
| Headers que el player **envía al proveedor** | `#EXTHTTP` | `SDR`, `BT1886`, `BT709`, `LIMITED` |
| Dolby Vision | `351`, `381`, `1059` | `CMAF-DOLBY-VISION … ENABLED=true`, `DV-ENHANCEMENT:ENABLED=true` — pero **0** `dvh1/dvhe` en `CODECS` |
| Contenedor | `1060-1061` | `unknown` / `VERIFIED:false` — pero `CMAF … ENABLED=true` |

**⇒ A-02 · MEDIUM · `CMAF-DOLBY-VISION … ENABLED=true` + `DV-ENHANCEMENT:ENABLED=true` en 23 510 canales
sin Dolby Vision real** (0 `dvh1/dvhe` en `CODECS`, 0 `SUPPLEMENTAL-CODECS`, contenedor `unknown`).
Es la variante «metadata propietaria» del **fake DV/CMAF** que la doctrina prohíbe
(«SUPPLEMENTAL-CODECS inventado … sigue PROHIBIDO», «CMAF/fmp4 falso sin EXT-X-MAP real — sigue PROHIBIDO»).

* **Mitigante decisivo:** son tags **propietarios `#EXT-X-APE-*`/`#EXT-X-CMAF-*`** fuera de `CODECS`. RFC 8216
  §6.3.1 obliga a ignorar tags desconocidos ⇒ **el player no las lee y no hay riesgo de decoder**.
  El daño es de **trazabilidad**: quien audite la lista creerá que hay DV/CMAF donde no lo hay.
* **No hay `dvh1` en `CODECS`** ⇒ no se cae en el freeze FZ-01 ni en el pantallazo negro por declarar DV
  sobre bytes que no lo son. **Ese borde está bien guardado.**

**⇒ A-03 · MEDIUM · La misma canal se declara HDR10 (PQ/BT.2020) en el manifest y SDR (BT.709/BT.1886) en los
headers `X-APE-HDR-*` que se envían al proveedor.** Dos consumidores distintos leen dos verdades distintas.
Coherencia exigible: `VIDEO-RANGE` ↔ `COLOR-PRIMARIES` ↔ `TRANSFER-CHARACTERISTICS` ↔ `X-APE-HDR-*`.

### 1.5 GOLDEN RULE — **PASS** en el catálogo

| Comprobación | Medido | Veredicto |
|---|---|---|
| `hvc1.*` dentro de `CODECS` de `STREAM-INF` | 14 343 (100 %) | ✅ es el sitio correcto |
| `hev1.*` dentro de `CODECS` de `STREAM-INF` | **0** | ✅ PASS |
| `hvc1.*` en `#EXTVLCOPT` | **0** | ✅ PASS |
| `hvc1.*` en `#KODIPROP` | **0** | ✅ PASS |
| `hev1.*` en tag del lado del player | **23 510** → `#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1:hev1.2.4.L150.B0` (línea `1051`) | ✅ **correcto por la GOLDEN RULE** |

**Observación fina (INFO):** el manifest declara `hvc1.2.4.L150.B0` (línea 1069) y el runtime del player recibe
`hev1.2.4.L150.B0` (línea 1051). **Es el diseño de la cascada dual** (`hvc1` en el manifest, `hev1` en el lado
del player) y cumple la GOLDEN RULE. `hvc1`/`hev1` difieren en **dónde viajan los parameter sets**, no en el
códec: un player que use `CODECS` para inicializar el decoder recibe `hvc1` y el bitstream puede traer los PS
in-band. **Riesgo bajo y documentado**, no se cuenta como hallazgo.

### 1.6 El generador **declara** que estima: F2 con `CONFIDENCE:0`

Canal `tvg-id="3"` (líneas 1051-1064) — cadena de evidencia completa:

```
1051|#EXT-X-APE-CHANNEL-RUNTIME-CODEC-HEV1:hev1.2.4.L150.B0
1052|#EXT-X-APE-QUALITY-SOURCE:ESTIMATED
1053|#EXT-X-APE-FALLBACK-TIER:F2_HEVC_PREMIUM_HINT
1054|#EXT-X-APE-CONFIDENCE:0
1057|#EXT-X-APE-CODEC-PREFERRED:hvc1.2.4.L150.B0
1058|#EXT-X-APE-CODEC-VERIFIED:false
1064|#EXT-X-APE-HDR-VERIFIED:false
```

* **No es violación:** `F2_HEVC_PREMIUM_HINT` + `PREFERRED` (no `VERIFIED`) es **exactamente** el tier F2 de la
  doctrina. La lista **marca honestamente** que no hay evidencia (`CONFIDENCE:0`, `VERIFIED:false` en códec,
  HDR y contenedor).
* **Pero** el `#EXT-X-STREAM-INF` de la línea `1069` no lleva ninguna marca de "no verificado": emite
  `CODECS=` y `VIDEO-RANGE=PQ` con la misma forma que una variante probada. Un jugador/auditor externo **no
  puede distinguir** una variante F0 verificada de una F2 estimada mirando solo el `STREAM-INF`.
* **Recomendación:** propagar la confianza al `STREAM-INF` (p. ej. `#EXT-X-APE-PREFERRED-ONLY` inmediatamente
  antes, o el ya existente `STABLE-VARIANT-ID="<ch>_<profile>"` extendido con el tier). **No aplicado.**

### 1.7 `HDCP-LEVEL=TYPE-1` en el 100 % de las variantes

* Medido: `HDCP-LEVEL=TYPE-1` en las 14 343 líneas `STREAM-INF`.
* **Doctrina vigente (HDCP-Adaptive Engine 2026-05-19):** `TYPE-1` es el **default agresivo** y debe degradarse a
  `NONE` cuando Conviva mide `VST > 3000 ms`, vía `APE_HDCP_PROFILE[channel_id]` (bulk fetch) ⇒ **la lista es
  estática y no puede reflejar el perfil por canal**. Aquí **todas** salen `TYPE-1`.
* **Consecuencia:** si el cache bulk falla o el canal nunca recibió un incidente, un TV con HDCP 1.4 recibe
  `TYPE-1` (que pide HDCP 2.x) ⇒ **pantalla negra sin recovery**. La doctrina lo acepta como "agresivo por
  defecto", pero el mecanismo adaptativo **no está reflejado en la lista auditada** (0 canales con `NONE`).
* **Severidad:** LOW-MEDIUM (depende del parque de TVs). Se reporta para que la capa APP/JSON confirme si el
  bulk fetch se aplica al generar.

---

## 2. Familia B — listas directas (repo)

### 2.1 B-02 HIGH · `hev1.*` dentro de `CODECS` de `STREAM-INF` (+ 2º códec de vídeo en la misma variante)

**Archivo:** `temp_analysis/APE_TYPED_ARRAYS_ULTIMATE_20260319 (17).m3u8` — **1 359 / 1 359 canales (100 %)**

```
19|#EXT-X-STREAM-INF:BANDWIDTH=86000000,AVERAGE-BANDWIDTH=68800000,RESOLUTION=3840x2160,CODECS="avc1.640028,hev1.1.6.L153.B0,mp4a.40.2",FRAME-RATE=120,HDCP-LEVEL=NONE
```

| Defecto | Detalle |
|---|---|
| **GOLDEN RULE rota** | `hev1.1.6.L153.B0` está en `STREAM-INF CODECS` (sitio prohibido) |
| **Dos códecs de vídeo** en un `CODECS` | `avc1.640028` **y** `hev1.1.6.L153.B0` para una sola variante |
| **Nivel↔Resolución** | `avc1.640028` = AVC **L4.0** (MaxFS 8 192 MB) con `RESOLUTION=3840x2160` ⇒ requiere **L5.1/L5.2** ⇒ **imposible** (1 359/1 359) |
| **Bit-depth** | `hev1.1.6` = Main **8-bit** (no Main10) sobre una lista que declara 4K@120 |

### 2.2 B-03 HIGH · `hvc1.1.6.L153.B0` declarado en **7680×4320@60** (182 ocurrencias)

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/snapshots/2026-04-26_audit_92_omega_premium/APE_LISTA_1777243113563_SHIELDED.m3u8`
Líneas medidas: `146714`, `3647130`, `3648058`, `3648986`, …

```
146714|#EXT-X-STREAM-INF:BANDWIDTH=200000000,AVERAGE-BANDWIDTH=170000000,CODECS="hvc1.1.6.L153.B0,ec-3",RESOLUTION=7680x4320,FRAME-RATE=60.000,VIDEO-RANGE="PQ",HDCP-LEVEL="TYPE-1",SUPPLEMENTAL-CODECS="lcev.1"
```

* `L153` = HEVC **5.1**: `MaxLumaPs = 8 912 896` < `7680×4320 = 33 177 600` ⇒ **imposible**; para 8K@60 se
  requiere **L183 (6.1)**. Es la violación canónica de la Ley Cardinal 1 (nivel **tres escalones** por debajo).
* Además: `SUPPLEMENTAL-CODECS="lcev.1"` = **LCEVC inventado** (prohibido por la doctrina) y
  `VIDEO-RANGE="PQ"`/`HDCP-LEVEL="TYPE-1"` **entrecomillados** (violación de gramática, ver RFC audit B-04).

### 2.3 B-04 HIGH · AV1 con nivel imposible en 8K@120 (`audit_bulletproof_output.m3u8`)

**Archivo:** `IPTV_v5.4_MAX_AGGRESSION/audit_bulletproof_output.m3u8` — **10 / 10 canales**

```
1010|#EXT-X-STREAM-INF:BANDWIDTH=120000000,AVERAGE-BANDWIDTH=102000000,CODECS="av01.0.08M.08,eac3",RESOLUTION=7680x4320,FRAME-RATE=120.000,VIDEO-RANGE="PQ",HDCP-LEVEL="TYPE-1",SUPPLEMENTAL-CODECS="lcev.1.1"
```

* `av01.0.08M.08` → `seq_level_idx 8` = AV1 **4.0** (`MaxPicSize 2 228 224` px) declarando **8K**
  (33 177 600 px) ⇒ requiere `seq_level_idx ≥ 16` (**6.0**). **Salto de 8 niveles.**
* `SUPPLEMENTAL-CODECS="lcev.1.1"` = LCEVC inventado (prohibido).
* **Coincidencia con t5:** el JSON auditado tiene `P1 = av01.0.15M.10` (idx 15 = 5.3, `MaxPicSize 8 912 896`)
  para 8K@120 ⇒ **también imposible por spec** (8K exige idx ≥ 16). Es el **mismo error de clase**, medido en
  dos capas distintas: se sube RESOLUTION a 8K sin subir el nivel del códec.

### 2.4 Tabla consolidada Familia B (nivel/resolución)

| Archivo | Canales | Imposibles | Patrón exacto |
|---|---|---|---|
| `temp_analysis/…(17).m3u8` | 1 359 | **1 359** | `avc1.640028` (L4.0) @ 3840×2160@120 → requiere L5.2 |
| `snapshots/…_SHIELDED.m3u8` | 15 444 | **182** | `hvc1.1.6.L153.B0` @ 7680×4320@60 → requiere L183 |
| `audit_bulletproof_output.m3u8` | 10 | **10** | `av01.0.08M.08` @ 7680×4320@120 → requiere idx 16 |
| `_vps_stage/fixtures/selftest_master.m3u8` | 0 (master) | **1** | `avc1.640028` @ 1920×1080@60 → requiere L4.2 |
| `APE_OMEGA_PRODUCTION_v5.2` / `APE_TYPED_ARRAYS_ULTIMATE` / `downloaded_list` | 2 754 c/u | **0** | sin `STREAM-INF` ⇒ sin declaración de códec |
| `lista_omega_v5.4.m3u8` · `lista_omega_mock.m3u8` | 8 366 · 100 | **0** | sin `STREAM-INF` |
| **Total histórico** | — | **1 552** | |

---

## 3. El rewrite del VPS **crea** una violación de la Ley Cardinal 1 (medido end-to-end)

`ape_uhd.lua` (desplegado, sha `f1f5eb674744858a…`, **idéntico a HEAD**) reescribe `RESOLUTION` de la variante
top a `3840x2160` si la top es < 4K, y a `7680x4320` si es ≥ 4K — **sin tocar `CODECS`** (decisión del
propietario 2026-10-24, documentada en el propio fichero, líneas 1-22).

**Experimento (loopback, sin proveedor, sólo lectura)** — mismo fichero antes/después:

```
ENTRADA  (GET http://127.0.0.1:8088/__fixture_master4k.m3u8)
  #EXT-X-STREAM-INF:…,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
  2160p/index.m3u8

SALIDA   (GET https://127.0.0.1/cdn/127.0.0.1:8088/__fixture_master4k.m3u8)
  #EXTM3U
  #EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k
  #EXT-X-STREAM-INF:…,RESOLUTION=7680x4320,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
  http://127.0.0.1:8088/2160p/index.m3u8
headers: X-APE-UHD: 8k:1 · X-APE-URI-Rebased: 2 · X-APE-LL-HLS: none
```

| Antes | Después | Veredicto |
|---|---|---|
| `RESOLUTION=3840x2160` + `L153` (5.1, 4K@60) | `RESOLUTION=7680x4320` + `L153` | ✅ antes: coherente · ❌ **después: Ley Cardinal 1 violada** (L153 tope 4K@60, se declara 8K) |
| `CODECS` con `mp4a.40.2` | `CODECS` con `mp4a.40.2` | ✅ **audio preservado** (no se pierde) |
| `VIDEO-RANGE=PQ` (1 vez) | `VIDEO-RANGE=PQ` (1 vez) | ✅ **sin duplicar** |
| 2 URIs relativas | 2 URIs absolutas | ⚠️ ver `LISTS_DIFF_VPS_VS_DIRECT.md` §4 (resolución relativa incorrecta) |

* **Alcance medido:** la regla `declare_auto` se aplica cuando `top_resolution >= 3840` ⇒ **todo master 4K real
  pasa a declarar 8K**. Con `L153` (o el nivel que traiga) ⇒ **8K con nivel 4K** = Ley Cardinal 1 violada
  **en cada canal 4K servido por `/cdn/`**.
* **Por qué no es freeze (honesto):** `CODECS` **no se toca** ⇒ no se dispara FZ-01 (decoder HEVC sobre bytes
  AVC). El riesgo es que el player **descarte/ignore** la variante declarada 8K por incoherencia de nivel, con
  lo que el ABR puede quedarse abajo ⇒ **pérdida de calidad**, no pantalla negra.
* **Recomendación (decisión del propietario, no de este auditor):** si se mantiene «8K declarado», el `CODECS`
  debería subir a un nivel que soporte 8K (`L180`+) **sólo si el bitstream lo soporta**; si no, mantener
  `RESOLUTION` real. La doctrina ya prohíbe lo segundo que hace falta aquí: «PROHIBIDO declarar un codec/nivel
  que el decoder no soporta ».

---

## 4. Resumen de coherencia (semáforo)

| Dimensión | Familia A (VPS, producción) | Familia B (repo, histórico) |
|---|---|---|
| Nivel ↔ Resolución (Ley Cardinal 1) | ❌ 1 015/14 343 (7,1 %) + **el rewrite crea más** | ❌ 1 552 canales en 4 archivos |
| GOLDEN RULE `hvc1`/`hev1` | ✅ PASS (0 cruces) | ❌ 1 359 (hev1 en `STREAM-INF`) |
| Audio dentro de `CODECS` | ✅ 100 % | ✅ (los que declaran) |
| `VIDEO-RANGE` duplicado | ✅ 0 | ✅ 0 |
| `VIDEO-RANGE` ↔ `X-APE-HDR-*` | ❌ PQ/BT.2020 vs SDR/BT.709 | ❌ (mismo patrón) |
| DV/CMAF real vs declarado | ❌ `ENABLED=true` sin `dvh1` (23 510) | ❌ `SUPPLEMENTAL-CODECS="lcev.1"` inventado |
| `SUPPLEMENTAL-CODECS` inventado | ✅ 0 | ❌ 192 (182 + 10) |
| Marcado de evidencia (preferred vs verified) | ✅ honesto (`CONFIDENCE:0`, `VERIFIED:false`) | ⚠️ variable |

---

*Fin de `LISTS_CODEC_COHERENCE.md`. Ley Cardinal 1 medida en ambas familias; GOLDEN RULE PASS en producción y
1 359 violaciones en el histórico; el rewrite del VPS **crea** una violación de nivel↔resolución demostrada
antes/después sobre el mismo fichero.*
