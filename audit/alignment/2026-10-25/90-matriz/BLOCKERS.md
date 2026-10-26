# BLOCKERS — fallos que rompen la cadena o una ley cardinal (t9 / T8)

**Tarea:** t9 (T8) · **Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`
**Regla de admisión:** aquí **solo** entran fallos que (a) rompen un eslabón de la cadena
`LAB → JSON → lista → VPS → ADB → player`, o (b) violan una de las 5 leyes cardinales del manifiesto OMEGA.
Todo lo demás (ruido, WIP ajeno, deuda cosmética, seguridad de credenciales) queda fuera y se cita donde le
corresponde. **Ningún fix de esta lista ha sido aplicado por t9**: son propuestas con archivo:línea.

Clases: `FIX_NOW_REPO` · `BLOCKED_BY_LOCK` · `FIX_VPS_GATED` · `DECISION_ARQUITECTURA` · `DOC_DEBT`.

| ID | Sev | Clase | Eslabón / Ley | Owner |
|---|---|---|---|---|
| B-01 | BLOCKER | FIX_NOW_REPO | E1 · L1 + L3 | `json-ssot` (T12) |
| B-02 | BLOCKER | FIX_NOW_REPO | L1 (Excel+JSON+APP+listas) | `json-ssot` + `app-generador` (+ ticket Excel) |
| B-03 | HIGH | FIX_NOW_REPO | E1 · L4 | `json-ssot` (T12) |
| B-04 | HIGH | FIX_NOW_REPO | E1 · L1 + L3 | `json-ssot` (T12) |
| B-05 | BLOCKER | BLOCKED_BY_LOCK | E2 · L2 | `app-generador` + `t44` |
| B-06 | BLOCKER | BLOCKED_BY_LOCK | E2 · L1 | `app-generador` |
| B-07 | BLOCKER | BLOCKED_BY_LOCK | E3/E5 · L1 | `app-generador` + `t44` |
| B-08 | HIGH | DECISION_ARQUITECTURA → FIX_VPS_GATED | E4/E5 · L1 | capitán + owner (D-40) |
| B-09 | HIGH | BLOCKED_BY_LOCK | L4 (anti-509) | `app-generador` |
| B-10 | HIGH | FIX_NOW_REPO | GOLDEN RULE | `app-generador` |
| B-11 | MEDIUM | FIX_NOW_REPO | «CMAF honesto» | `app-generador` |
| B-12 | HIGH | FIX_NOW_REPO | L3 (HLS inválido) | `json-ssot` (+ ticket Excel) |
| B-13 | HIGH | BLOCKED_BY_LOCK | L3 (RFC 8216 §4.3.4.3) | `app-generador` + `t44` |
| B-14 | MEDIUM | FIX_VPS_GATED | L3 (capacidad declarada inexistente) | capitán (D-04) |
| B-15 | HIGH | FIX_NOW_REPO | E4 (rollback envenenado) | capitán (D-26) |
| B-16 | HIGH | DOC_DEBT | L1 + L3 (plano documental) | owner (manifiesto global, D-31) |

---

## B-01 · BLOCKER · `FIX_NOW_REPO` · P1 declara 8K con un códec de 4K (Ley 1 + Ley 3)

**Archivo:línea (JSON consumido por la APP):**
`IPTV_v5.4_MAX_AGGRESSION/frontend/lab_master_22.6.0.json` (280.065 B, sha256 `099A1707…371FD4`)

| Ruta JSON | Valor actual | Valor canónico (Excel) |
|---|---|---|
| `profiles_calibrated.P1.settings.resolution` | `"7680x4320"` | `6_NIVEL_2_PROFILES!C25` = `"3840x2160"` |
| `profiles_calibrated.P1.settings.maxResolution` | `"7680x4320"` | `!C48` = `"3840x2160"` |
| `profiles_calibrated.P1.headerOverrides["X-APE-RESOLUTION"][0]` | `"7680x4320,3840x2160,2560x1440,1920x1080"` | `!C136` = `"3840x2160,2560x1440,1920x1080,1280x720"` |
| `profiles_calibrated.P1.vlcopt["video-width"]` / `["video-height"]` | `7680` / `4320` | `!C109` / `!C110` = `3840` / `2160` |

`settings.codec_full` **sí** es correcto (`hvc1.2.4.L153.B0` = `!C37`, D-34): lo que está mal es la resolución.
Combinación resultante = L153 (techo 4K@60) declarando 8K ⇒ **exactamente el patrón del freeze 2026-06-08**.

**Fix mínimo propuesto (NO aplicado):** sustituir los 5 valores por los canónicos; validar con
`node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs` → el bloque `P1` debe quedar en `diffs: []`.
**Aceptación:** ese script reporta `totalDiffs = 0` para P1 y los 6 perfiles quedan sin diffs de resolución/códec/maxRes.
**No se toca el `.xlsm`** (D-21); `C350="av01.0.15M.10,ac-3"` queda como ticket Excel (D-34).

## B-02 · BLOCKER · `FIX_NOW_REPO` · `fps=120` en 6/6 perfiles (Ley 1)

**Dónde:**
- Excel `6_NIVEL_2_PROFILES!B32..G32` = `120` en los seis (defecto de la hoja, D-35/D-36).
- JSON `profiles_calibrated.P*.settings.fps` = `"120"` en los seis (copia fiel, no invención).
- APP `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:5516` toma `$profile['fps']` y lo inyecta en
  `:5519` como `FRAME-RATE={$fps}.000` junto a `hvc1.2.4.L153.B0` ⇒ **4K@120 con nivel 5.1**.
- APP `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php:736` `$fps = $cfg['fps'] ?? 120; // MEMC-TOTAL-8K120`.

**Fix mínimo propuesto (NO aplicado):** fijar `settings.fps` a los techos de D-35
(P0 30 · P1 60 · P2 30 · P3 60 · P4 30 · P5 30) en el JSON; en PHP, `min((int)$fps, 60)` y
`$fps = $cfg['fps'] ?? 30`; abrir ticket Excel por la fila 32.
**Aceptación:** ninguna línea `STREAM-INF` emitida declara `FRAME-RATE` mayor que el techo de su nivel.

## B-03 · HIGH · `FIX_NOW_REPO` · P3/P4 degradados a Main 8-bit / AVC (Ley 4 «piso Main10», D-37)

**Archivo:línea:** `frontend/lab_master_22.6.0.json`

| Ruta JSON | Valor actual | Canónico |
|---|---|---|
| `profiles_calibrated.P3.settings.codec_full` | `"hvc1.1.6.L120.B0"` (Main 8-bit) | `!E37` = `"hvc1.2.4.L123.B0"` |
| `profiles_calibrated.P4.settings.codec_full` | `"avc1.64001f"` (AVC) | `!F37` = `"hvc1.2.4.L93.B0"` |

**Fix mínimo:** restaurar los dos valores canónicos (y sus `codec_string` / `X-Stream-Codecs` coherentes).
**Aceptación:** el manifiesto exige piso `hvc1.2.*`; `grep -c '"hvc1.1' lab_master…json` = 0 en P3/P4.

## B-04 · HIGH · `FIX_NOW_REPO` · P3/P4/P5 declaran 4K (Ley 1 + Ley 3)

**Archivo:línea:** `frontend/lab_master_22.6.0.json` — `settings.resolution`, `settings.maxResolution`,
`headerOverrides["X-APE-RESOLUTION"]`, `vlcopt["video-width"|"video-height"]` de P3/P4/P5.

| Perfil | Excel | JSON actual |
|---|---|---|
| P3 | `!E25` `1920x1080` | `3840x2160` |
| P4 | `!F25` `1280x720` | `3840x2160` |
| P5 | `!G25` `854x480` | `3840x2160` |

**Fix mínimo:** sustituir por los valores canónicos. **Aceptación:** `which_json_is_the_export.mjs` → P3/P4/P5 sin diffs;
el perfil failsafe P5 vuelve a declarar 480p.

## B-05 · BLOCKER · `BLOCKED_BY_LOCK` · fake-8K ACTIVADO por defecto (Ley 2)

**Archivo:línea:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`
- `:10363-10364` → `const fakeMode = window.APE_FAKE_UHD === '4k' ? '4k' : ((… === '0' || … === false) ? '0' : '8k')`
  ⇒ **con la variable indefinida el resultado es `'8k'`**.
- `:2500` `if (fakeMode === '8k') { … 7680x4320 }` · `:10377` emite `#EXT-X-APE-UPSCALE:fake8k,…`.

**Decisión vigente que contradice el código:** **D-13** ordena `default '0'` (apagado). Hoy está encendido.
**Lock:** `frontend/js/**` es de escritura de `t44` (board L-002) ⇒ `BLOCKED_BY_LOCK`.
**Fix mínimo propuesto (NO aplicado):** invertir el default a `'0'` manteniendo la capacidad detrás de flag explícito
(`'8k'` sólo si el operador la pide). **Aceptación:** con `window.APE_FAKE_UHD` indefinido, el `RESOLUTION` emitido
iguala `profiles_calibrated.P*.settings.resolution` en 6/6.

## B-06 · BLOCKER · `BLOCKED_BY_LOCK` · resolver PHP declara L153 con 120 fps (Ley 1)

**Archivo:línea:** `IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php:5514-5522`
(`buildStreamInf()`), con el `$fps` de `:5516`.
```
5519: return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
5520:     . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
```
Doble defecto: (1) L153 con fps=120 es imposible; (2) `HDR=PQ` no existe en RFC 8216 y `AUDIO`/`SUBTITLES`
referencian `GROUP-ID` inexistentes. `AVERAGE-BANDWIDTH={$bw}` == `BANDWIDTH`, y `:4544` añade un segundo
`STREAM-INF` huérfano (ver B-09).
**Lock:** el archivo está ` M` en el working tree por trabajo de otra sesión (D-11) ⇒ `BLOCKED_BY_LOCK`
(D-15 ya fija el criterio: bajar fps a 60, no inventar L156).
**Fix mínimo:** `$fps = min((int)$profile['fps'], 60);` y eliminar `HDR=PQ`/`AUDIO`/`SUBTITLES` o declararlos con
`GROUP-ID` real. **Aceptación:** `node tools/assert_streaminf.mjs` (APP_EMISSION_CONTRACT §9 A1) pasa con este emisor.

## B-07 · BLOCKER · `BLOCKED_BY_LOCK` · el catálogo servido lleva 1.015 STREAM-INF imposibles (Ley 1)

**Medido por t9 sobre el artefacto vigente** (`APE_LISTA_1792869328847.m3u8.gz`, `7F1CD8A7…CCC360`):

| Perfil | Líneas | RESOLUTION | FRAME-RATE | CODECS | ¿L1? |
|---|---:|---|---|---|---|
| P0 | 96 + 4 | `3840x2160` | 60 / 30 | `hvc1.2.4.L120.B0` / `L123` | ❌ |
| P1 | 737 + 172 | `3840x2160` | 30 / 60 | `hvc1.2.4.L123.B0` / `L120` | ❌ |
| P3 | 6 | `3840x2160` | 60 | `hvc1.2.4.L120.B0` | ❌ |

Total **1.015** líneas — coincide exactamente con lo que midió t8 (`LISTS_CODEC_COHERENCE.md` §1.1).
**Causa:** el nivel se deriva de una calibración 1080p mientras la resolución la pone el probe/SSOT.
**Archivo:línea (origen):** `frontend/js/ape-v9/ape-hevc-cascade.js` `resolveTierByResolution()` consumido en
`m3u8-typed-arrays-ultimate.js:7883-7884` / `:2549-2559`, emisión en `:10393`.
**Fix mínimo propuesto:** antes de escribir `CODECS`, derivar el nivel de la **resolución+fps declaradas**
(`reqLevel(h,f)` de APP_EMISSION_CONTRACT §9-A1) y **cortar la emisión** si `lv < reqLevel`
(no inventar nivel: subir la resolución real o bajar la declarada).
**Aceptación:** 0 líneas con `lv < reqLevel` en el censo del `.gz`.

## B-08 · HIGH · `DECISION_ARQUITECTURA` → `FIX_VPS_GATED` · el rewrite `/cdn/` **crea** la violación de Ley 1

**Prueba física de t9 (read-only, fixture permanente del VPS):**
```
ANTES   GET http://127.0.0.1:8088/__fixture_master4k.m3u8         sha256 4A96480B…  (== fichero en disco)
        #EXT-X-STREAM-INF:…,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
DESPUÉS GET https://127.0.0.1/cdn/127.0.0.1:8088/__fixture_master4k.m3u8   sha256 87CAB2A2…
        #EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k
        #EXT-X-STREAM-INF:…,RESOLUTION=7680x4320,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
headers: X-APE-UHD: 8k:1 · X-APE-URI-Rebased: 2
```
**Archivo:línea:** `_vps_stage/lua/ape_uhd.lua:92-107` (`declare_auto`: `if w >= 3840 then TARGET_8K`),
invocado desde `_vps_stage/lua/ape_gateway.lua` (bloque `uhd_auto`, default 1). Desplegado == HEAD (`f1f5eb67…`).
**Clase:** es **decisión declarada del propietario (2026-10-24)** documentada en `ape_uhd.lua:1-22` ⇒ no se revierte
por auditoría: `DECISION_ARQUITECTURA`; su ejecución en el VPS exige gates D-04 (snapshot + `nginx -t` + smoke + rollback).
**Fix mínimo propuesto (a decidir, NO aplicado):** guardar la inflación con
`if reqLevel(target_w,target_h,fps) <= declared_level then inflar end`; en su defecto, no tocar `RESOLUTION` cuando
`CODECS` no se va a tocar. **Aceptación:** el fixture de 4K con L153 sale con `RESOLUTION=3840x2160`.

## B-09 · HIGH · `BLOCKED_BY_LOCK` · `STREAM-INF` huérfano duplica la variante por documento (anti-509 + validador propio)

**Archivo:línea:** `backend/resolve_quality_unified.php:4544`
```php
4544: $enriched[] = '#EXT-X-STREAM-INF:BANDWIDTH=384000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"';
```
Inyectado justo después de `#EXTM3U` en P0/P1 ⇒ **2 STREAM-INF por documento** (el segundo sin URI), lo que además
dispara el propio validador del archivo (`:856`, `:861`: «sin URI entre EXT-X-STREAM-INF y URL»).
**Fix mínimo:** eliminar la línea 4544 (o convertirla en tag propio `#EXT-X-APE-ABR-NUDGE:…`, inerte por RFC 8216 §6.3.1).
**Aceptación:** 1 `STREAM-INF` con URI por canal; el validador interno devuelve 0 hallazgos sobre su propia salida.

## B-10 · HIGH · `FIX_NOW_REPO` · GOLDEN RULE rota en el generador PHP

**Archivo:línea:** `IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php:737-742`
```php
737: $codecs = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
738:             ? 'hev1.2.4.L153.B0,mp4a.40.2'
739:             : 'avc1.640028,mp4a.40.2';
741: echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
742:    . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";
```
`hev1.*` dentro de `CODECS` de `STREAM-INF` es el sitio prohibido por la GOLDEN RULE (debe ser `hvc1.*`).
**Fix mínimo:** `? 'hvc1.2.4.L153.B0,mp4a.40.2' : 'avc1.640028,mp4a.40.2'`, dejando `hev1.*` sólo en
`#KODIPROP`/`#EXTVLCOPT`. **Aceptación:** `grep -n 'hev1.*EXT-X-STREAM-INF'` = 0 en el repo; el par `hvc1`/`hev1`
sigue existiendo en la cascada dual.

## B-11 · MEDIUM · `FIX_NOW_REPO` · `EXT-X-MAP` apunta al `.m3u8` del proveedor (CMAF falso)

**Archivo:línea:** `vps/ape_hls_generators.php:729`
```php
729: echo "#EXT-X-MAP:URI=\"{$providerM3u8}\"\n";
```
`EXT-X-MAP` debe apuntar a un **segmento de inicialización** (`.mp4`/`.m4s` con `ftyp`+`moov`), no a un manifest.
**Fix mínimo:** emitir `EXT-X-MAP` sólo si existe init real; en su defecto, no emitirlo (y no declarar CMAF).
**Aceptación:** 0 `EXT-X-MAP:URI=….m3u8` en cualquier lista.

## B-12 · HIGH · `FIX_NOW_REPO` · `avgBitrate > maxBitrate` en 5/6 perfiles (produce HLS inválido)

**Excel `6_NIVEL_2_PROFILES`:** `C49=40.000 < C50=75.000` (P1) · `D49=25.000 < D50=35.000` (P2) ·
`E49=10.000 < E50=15.000` (P3) · `F49=5.000 < F50=6.000` (P4) · `G49=2.000 < G50=2.200` (P5). Solo P0 está bien.
**JSON:** `profiles_calibrated.P1..P5.settings.{max,avg}BitrateKbps` copia el orden imposible.
**Efecto en la cadena:** al emitir, `AVERAGE-BANDWIDTH > BANDWIDTH` es inválido en RFC 8216 §4.3.4.2 y confunde al ABR.
**Fix mínimo:** en la emisión, `AVERAGE-BANDWIDTH = min(BANDWIDTH, avg)` (ya hay aritmética de `_avgBw`), y en el JSON
no inventar bitrates físicos: dejar los valores y abrir ticket Excel (D-36). **Aceptación:** 0 líneas con
`AVERAGE-BANDWIDTH > BANDWIDTH` en el catálogo.

## B-13 · HIGH · `BLOCKED_BY_LOCK` · `EXT-X-I-FRAME-STREAM-INF` sin `URI` en el 100 % de los canales

**Medido por t9:** 23.510 líneas `#EXT-X-I-FRAME-STREAM-INF` y **0** con `URI=` en el catálogo vigente
(`RFC 8216 §4.3.4.3`: `URI` es **obligatorio** en ese tag).
**Archivo:línea (origen):** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js:9949` (y `:3061` en la cabecera global).
**Fix mínimo:** añadir el `URI` real de la variante I-frame o dejar de emitir el tag (no inventar un URI).
**Aceptación:** `I-FRAME-STREAM-INF` con `URI=` == nº de `I-FRAME-STREAM-INF`, o 0 tags.

## B-14 · MEDIUM · `FIX_VPS_GATED` · se declara `CAN-BLOCK-RELOAD=YES` sin implementación

**Dónde se declara:** cabecera del catálogo servido, línea 6 del `.gz` descomprimido:
`#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0,HOLD-BACK=3.0`, e inyectado
también por `_vps_stage/lua/ape_rebase_lib.lua:76-87` en fuentes LL-HLS.
**Medido:** `grep -rn "_HLS_msn\|_HLS_part" /etc/nginx/` ⇒ **0** coincidencias: no hay blocking reload.
**Fix mínimo:** emitir `CAN-BLOCK-RELOAD=YES` sólo cuando exista el handler, o retirar el atributo.
**Aceptación:** ningún manifest declara `CAN-BLOCK-RELOAD=YES` sin handler; `CAN-SKIP-UNTIL ≥ 6×TARGETDURATION`.
Gates D-04 si se toca el VPS.

## B-15 · HIGH · `FIX_NOW_REPO` · `ape-meta-public.conf`: producción va por delante y un restore reintroduce el 404

**Medido:** VPS `/etc/nginx/snippets/ape-meta-public.conf` = **2.509 B** (`0a400216…`, v2, arregla el 404 de `/cdn/`
delegando en `127.0.0.1:8088`); HEAD = **2.091 B** (`adbf3e56…`, v1, criptográficamente idéntica al
`.bak_20261025T180653` del propio VPS).
**Riesgo de cadena:** cualquier `git checkout`/restore desde el repo **vuelve a romper** la lista CDN (21.040 canales).
**Fix mínimo:** commitear la v2 al repo (`_vps_stage/public/ape-meta-public.conf`) con el hash de evidencia (D-26).
**Aceptación:** `sha256` de HEAD == `0a400216…` y `node contracts/verify_contracts.mjs` sigue sin tocar ese archivo.

## B-16 · HIGH · `DOC_DEBT` · la doctrina describe un sistema inexistente y contradice al SSOT en P1

Dos afirmaciones documentales rompen leyes en el plano del documento y **arrastrarían a cualquiera que las tome
como base de remediación**:

1. **Pipeline Crystal de 5 fases + motor Rust `:8084` + OpenResty + `/shield/`** — medido: 13/13 artefactos ausentes,
   `ape-crystal-rust.service` = `not-found`, `:8084` cerrado, `/health` y `/metrics` = `000`, `/shield/` = **404**
   (re-medido por t9), pipeline real de **3 fases**. Corregir esto desplegando violaría `iptv-vps-touch-nothing`.
2. **Tabla P0–P5 del manifiesto: P1 = 8K (AV1) `av01.0.15M.10` @7680x4320@120** — el Excel canónico dice
   `!C25="3840x2160"` + `!C37="hvc1.2.4.L153.B0"`, y su export fiel lo repite. La hoja se autrocontradice en
   `!C350="av01.0.15M.10,ac-3"` (D-34): de ahí nació el híbrido de B-01.

**Clase:** `DOC_DEBT` (la corrección es documental: D-25/D-32/D-33/D-39). **Owner:** el propietario para el
manifiesto global (D-31: no se edita desde el repo) y el capitán para el snapshot versionado.
**Fix mínimo:** aplicar los 9 bloques de parche de T14 al manifiesto **global** cuando el owner lo promueva al repo;
mientras tanto, `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` + `CLAUDE.md` son la referencia autorizada.
**Aceptación:** ninguna afirmación doctrinal sobre `/shield/`, Rust o 5 fases sin marca explícita de «no desplegado».

---

## Fuera de esta lista (declarado para que no se reabra como falso positivo)

| Tema | Por qué NO es blocker de alineación | Dónde vive |
|---|---|---|
| `contracts/verify_contracts.mjs` → `RESULT=FAIL (1/12)` | El pin `9b774bff…` **== bytes de HEAD** (98.126 B); el disco (99.666 B) es WIP ajeno no commiteado ⇒ `CONTRACT_DRIFT` (D-11), no FAIL de cadena | `_raw/PHYS_contracts_gate.txt` |
| `.mkv` aplanado en la raíz del repo | Escritura ajena, `no_touch` (D-12) | `00-inflight/NO_TOUCH_LIST.md` |
| Credenciales de proveedor en `channels_map.json` (repo público) | Fuga de seguridad real, **no** rompe la cadena de alineación; rotación = owner (D-24) | `20-json/SECRETS_SCAN.md` · `80-seguridad/` |
| `conviva.db` = 0 B y 7 timers `netshield-*` inactivos | No rompe la cadena de emisión; prohibido afirmar QoE activa (D-27) | `40-vps/VPS_DRIFT_VS_REPO.md` §6/§7 |
| 8 artefactos commiteados no desplegados (`ape_caps.lua`, `ape_session.lua`, `media-fanout.conf`) | Ejecución futura, no estado actual; la cadena vigente funciona sin ellos | `40-vps/VPS_DRIFT_VS_REPO.md` §2.2/DR-04 |

---

*Fin de `BLOCKERS.md`. 16 fallos admitidos: 5 `FIX_NOW_REPO`, 5 `BLOCKED_BY_LOCK`, 1 `DECISION_ARQUITECTURA`
(gated a `FIX_VPS_GATED`), 2 `FIX_VPS_GATED` (B-08, B-14), 1 `DOC_DEBT`. Ninguno aplicado por t9.*
