# VERDICT — Veredicto del gate de verificación (t9 / T8)

**Auditor:** `verificador-alineacion` · **Attempt:** `3820167a-e18e-42ea-a71b-80c638a49b5e`
**Mandato:** D-01 — veto técnico del verificador. Si el veredicto es FAIL, **no hay despliegue ni commit de producción**
aunque el capitán quiera.
**Alcance medido:** Excel LAB (SSOT) → JSON → APP (generador JS + resolver PHP) → VPS (nginx/Lua) → listas `.m3u8`
(familia servida por el VPS y familia directa al proveedor) → contrato de player.
**Naturaleza:** solo lectura sobre producción; cero fixes aplicados; cero commits.

---

# VEREDICTO GLOBAL: **FAIL**

**No es un FAIL de forma ni de documentación: es un FAIL de cadena.** Tres de las cinco leyes cardinales están
violadas **simultáneamente en varias capas**, y no existe **ni un solo perfil** (P0–P5) en el que las tres capas
(Excel, JSON, lista) coincidan a la vez.

| Métrica | Valor |
|---|---|
| Filas de matriz evaluadas | **53** |
| PASS | **16** |
| FAIL | **32** |
| UNKNOWN (declarado con motivo) | **5** |
| Leyes cardinales en PASS | **2 / 5** (L4 NO-STRIP, L5 SHIELDED) |
| Leyes cardinales en FAIL | **3 / 5** (L1 Nivel↔Resolución, L2 SSOT-LAB, L3 Coherencia Triple) |
| Blockers admitidos | **16** (5 `FIX_NOW_REPO`, 5 `BLOCKED_BY_LOCK`, 2 `FIX_VPS_GATED`, 1 `DECISION_ARQUITECTURA`→gated, 1 `DOC_DEBT`) |

**Lo que este FAIL significa operativamente:** la lista que hoy se sirve **se reproduce** (no hay freeze declarado en
esta ventana) pero **declara calidad que su propio códec no puede cargar** en 1.015 de 14.343 variantes, y el
rewrite del VPS **crea** esa misma incoherencia en cada master 4K que pasa por `/cdn/` (21.040 canales). El
resultado probable no es pantalla negra: es **ABR cayendo a 1080p en el 7 % de los canales 4K** — es decir, lo
contrario de `MAX IMAGE FIRST`.

---

## 1. Las 5 leyes cardinales, una por una

> Fuente doctrinal: `iptv-omega-working-flow-manifesto` §LAS 5 LEYES CARDINALES (skill cargada en esta sesión;
> snapshot versionado en `docs/manifestos/OMEGA_WORKING_FLOW_MANIFESTO_SNAPSHOT.md`, `2D24FC33…`, D-38).

### L1 · LEY DE NIVEL↔RESOLUCIÓN — **FAIL**

*Enunciado:* el `level` del códec **debe** poder cargar la `RESOLUTION`+`fps` declarados
(`L93=720p` · `L120=1080p@30` · `L123=1080p@60` · `L150=4K@30` · **`L153`=4K@60 techo** · `L180=8K@30` ·
`L186=8K@120`). Declarar un nivel por debajo de la resolución = el freeze 2026-06-08.

**Rota en 5 capas a la vez:**

| Capa | Evidencia |
|---|---|
| Excel | `6_NIVEL_2_PROFILES` fila 32 (`fps=120` en 6/6) contra fila 37 (L153/L150/L123/L93/AVC L3.0) — `10-excel/EXCEL_PROFILES_EXTRACT.json` |
| JSON | `lab_master_22.6.0.json` copia el defecto **y añade** 4K sobre P3/P4/P5 — `20-json/JSON_PROFILES_MATRIX.json` leyes `L1_*`/`L11` |
| APP | `backend/resolve_quality_unified.php:5519-5520` declara `L153` con `FRAME-RATE={$fps}.000` (fps=120 en `ct=sports`) |
| listas servidas | **1.015 / 14.343** `STREAM-INF` con nivel < resolución (censo propio de t9, `_raw/PHYS_served_streaminf_by_profile.txt`) |
| VPS `/cdn/` | el rewrite **crea** la violación: `RESOLUTION` 3840x2160→**7680x4320** sin tocar `CODECS` (`_raw/PHYS_rewrite_experiment.txt`) |

### L2 · LEY SSOT-LAB (no-clamp / no-override) — **FAIL**

*Enunciado:* el LAB está calibrado; no se sobrescribe codec/resolución/bitrate sin verificar coherencia.

**Medido:** el fake-8K está **encendido por defecto** (`m3u8-typed-arrays-ultimate.js:10363-10364` → `'8k'` cuando
`window.APE_FAKE_UHD` no está definido), en **contradicción directa con D-13**, que ordena default `'0'`. Además el
códec emitido **no** sale de `settings.codec_full` sino de la cascada CSV (`codec_chain_video[0]` = `L153` para los
seis perfiles), `BANDWIDTH` sale de `max(bitrate×1e6, floor)` (P0: 200 M emitido vs 80 M declarado) y
`AVERAGE-BANDWIDTH` usa `0.85` literal frente a `avg_bandwidth_ratio=0.78`. Cuatro de los cinco atributos de
variante los decide el código, no el LAB.

### L3 · LEY DE COHERENCIA TRIPLE (Excel ↔ JSON ↔ lista) — **FAIL**

*Enunciado:* Excel, JSON y lista emitida deben quedar coherentes en todo cambio.

| Perfil | Excel (celdas) | JSON (`lab_master`) | Lista servida (censo t9) | ¿Triple acuerdo? |
|---|---|---|---|---|
| P0 | 7680x4320 · dvh1.08.06 | 7680x4320 · dvh1.08.06 | **3840x2160** · L120/L123 (100 líneas) | ❌ |
| P1 | **3840x2160** · L153 | **7680x4320** · L153 | 3840x2160 · **L123/L120** (909) | ❌ |
| P2 | 3840x2160 · L150 | 3840x2160 · L150 | **ausente** (0 líneas) | ❌ |
| P3 | 1920x1080 · **L123** | **3840x2160** · **L120** | 1920x1080 · L150/L123 (13.167) | ❌ |
| P4 | 1280x720 · **L93** | **3840x2160** · **avc1** | **1920x1080** · L150/L123 (38) | ❌ |
| P5 | 854x480 · avc1.42c01e | **3840x2160** · avc1.42c01e | **1920x1080** · L150/L123 (129) | ❌ |

**6/6 incoherentes.** Es la ley que convierte un defecto local en un freeze.

### L4 · LEY NO-STRIP (las ~945 directivas trabajan) — **PASS**

**Medido:** el catálogo vigente tiene **22.271.732 líneas / 23.510 canales = 947,3 líneas por canal**;
`#EXTINF` = 23.510, `#EXTHTTP` = 23.510 (100 % de canales), 24 `#EXT-X-SESSION-DATA` globales presentes; el rewrite
de `/cdn/` **no elimina** directivas (sólo rebasa URIs, descarta líneas en blanco y añade tags propios).
**Reserva honesta:** el metadato `settings.headersCount=233` declarado contra **400–402** claves medidas en
`headerOverrides` es una **mentira de metadato** (ley `L8` de t5), no un strip. Se registra; no degrada el PASS.

### L5 · LEY SHIELDED (URLs verbatim) — **PASS**

**Medido por t9 sobre el artefacto servido:** `0` ocurrencias de `/shield/` y `0` de `/cdn/` en 22.271.732 líneas;
`curl https://127.0.0.1/shield/…` → **404**; la variante `_SHIELDED` tiene payload **byte-idéntico** a la plain
(A5 ≡ A4); las 5 listas directas sirven **95.776** URLs verbatim a `line.tivi-ott.net`.
*La contradicción es del manifiesto* (documenta `/shield/` como URL canónica) → deuda documental, no defecto de
artefacto (D-33: gana `CLAUDE.md`, y la medición lo confirma).

---

## 2. Lo que **sí** está alineado (para no inflar el FAIL en la dirección contraria)

Estos PASS son medidos, no heredados, y sostienen que el sistema **funciona** aunque declare mal:

| PASS | Evidencia |
|---|---|
| **GOLDEN RULE en producción** — `hvc1.*` en 14.343/14.343 `STREAM-INF`, `hev1.*` en 0 `STREAM-INF`, `hev1.2.4.L150.B0` sólo en 23.510 tags de player | `50-listas/LISTS_CODEC_COHERENCE.md` §1.5 + censo t9 |
| **Audio preservado en `CODECS`** — `mp4a.40.2` en 14.343/14.343; el rewrite no lo toca (diff físico) | `_raw/PHYS_rewrite_experiment.txt` |
| **Sin `VIDEO-RANGE` duplicado** — 1 antes, 1 después del rewrite | idem |
| **`/lists/` es estático y byte-idéntico** — `gzip_static + gunzip`, **cero Lua**, cero headers `X-APE-*`; sha256 del cuerpo servido == sha256 del `.gz` en disco | `_raw/PHYS_rewrite_experiment.txt` + `50-listas/LISTS_INVENTORY.md` §1.4 |
| **HEAD == VPS byte a byte (16/16)** — 14 módulos Lua + `meta-plane.conf` + `ape-hosts-allow.txt` | `40-vps/VPS_DRIFT_VS_REPO.md` §1 (DR-02) |
| **Sintaxis: 4/4 JS y 6/6 PHP limpias** — `node --check` EXIT 0 (stderr vacío); `php -l` con PHP portable 8.3.36 EXIT 0 | `_raw/PHYS_syntax_and_hashes.txt` |
| **El exportador Excel→JSON es FIEL: 0 diffs / 24 celdas** — el artefacto `Downloads/LAB_CALIBRATED_20260611_020645.json` reproduce exactamente las 6 tuplas canónicas | `_raw/which_json_is_export.json` |
| **El contrato Crystal está sano** — pin `9b774bff…` == bytes de HEAD; el único rojo es WIP ajeno | `_raw/PHYS_contracts_gate.txt` (D-11) |

---

## 3. Correcciones a premisas del tablero que este gate aporta (medidas, no opinadas)

1. **El eslabón Excel→JSON NO está roto en el escritor; está roto en el artefacto.** El export del Excel canónico
   (`LAB_CALIBRATED_20260611_020645.json`, 222.364 B, `6931BAF4…`) coincide en **24/24** celdas mapeadas. El repo
   consume **otro** artefacto (`lab_master_22.6.0.json` = `CRYSTAL-4K-UHD`, `099A1707…`) que diverge en **10/24**.
   `ape-lab-import-helper.js:36` (`DEFAULT_PATH = 'lab_master_22.6.0.json'`) es el punto donde entra el divergente.
   **Consecuencia para T12:** el fix mínimo no es "re-exportar", es **alinear el artefacto que la APP carga** (B-01..B-04).
2. **El defecto de resolución no es solo de P1.** D-34 acota P1; la medición muestra que **P3, P4 y P5 también**
   declaran `3840x2160` en el JSON frente a `1920x1080` / `1280x720` / `854x480` en la hoja (B-04). El perfil
   *failsafe* P5 dejó de serlo.
3. **P2 no se emite.** Cero `STREAM-INF` con sufijo `_P2` en 14.343 líneas del catálogo vigente. Las aristas
   E3/E4/E5 de P2 quedan **UNKNOWN** con ese motivo, no en PASS.
4. **El rewrite del VPS no toca el catálogo** (confirma H1 de t8 con verificación física propia): `/lists/` no tiene
   Lua. El rewrite vive sólo en `/cdn/` (443→8088) y `/meta/` es inalcanzable (su regex no admite `host:puerto`).
5. **La coincidencia 1.015 es exacta:** mi censo independiente por perfil (96+4 P0 → 100; 737+172 P1 → 909;
   6 P3) suma **1.015** líneas imposibles, idéntico al recuento de t8 por combinación única. Dos métodos distintos,
   mismo número.

---

## 4. Qué falta para poder declarar éxito (lista cerrada y verificable)

El veredicto pasa a PASS cuando se cumplan **las siete condiciones siguientes**, cada una con su comando de
aceptación. Nada de esto se ha aplicado.

| # | Condición | Cómo se verifica |
|---|---|---|
| 1 | **B-01/B-03/B-04 cerrados:** `lab_master_22.6.0.json` coincide con la hoja canónica en resolución, `maxResolution`, `codec_full` y `X-APE-RESOLUTION` para P0–P5 | `node audit/alignment/2026-10-25/90-matriz/tools/which_json_is_the_export.mjs` → `lab_master_repo.totalDiffs === 0` |
| 2 | **B-02 cerrado:** `settings.fps` = techos D-35 (30/60/30/60/30/30) y ningún emisor declara `FRAME-RATE` por encima del techo de su nivel | aserción A1 de `30-app/APP_EMISSION_CONTRACT.md` §9 sobre la lista emitida |
| 3 | **B-05/B-07 cerrados:** con `window.APE_FAKE_UHD` indefinido, `RESOLUTION` == `settings.resolution` en 6/6 y **0** líneas con `lv < reqLevel(h,f)` | censo `zcat … \| grep '^#EXT-X-STREAM-INF'` + validador de nivel |
| 4 | **B-06/B-09/B-10/B-11 cerrados:** resolver PHP y `ape_hls_generators.php` sin `L153` a 120 fps, sin `STREAM-INF` huérfano, sin `hev1` en `STREAM-INF`, sin `EXT-X-MAP` a un `.m3u8` | `php -l` 6/6 + `grep` de las cuatro invariantes |
| 5 | **B-12/B-13/B-14 cerrados:** 0 líneas con `AVERAGE-BANDWIDTH > BANDWIDTH`, 0 `I-FRAME-STREAM-INF` sin `URI`, ningún `CAN-BLOCK-RELOAD=YES` sin handler | censo sobre el `.gz` vigente + `grep -rn "_HLS_msn" /etc/nginx/` |
| 6 | **B-08 resuelto:** decisión explícita del propietario sobre el `RESOLUTION` del rewrite `/cdn/` y, si se cambia, gates D-04 + verificación del fixture (`4K@60+L153` debe salir `3840x2160`) | `curl -sk https://127.0.0.1/cdn/127.0.0.1:8088/__fixture_master4k.m3u8 \| grep RESOLUTION` |
| 7 | **B-15 y B-16 cerrados:** `ape-meta-public.conf` v2 commiteado; doctrina corregida (o marcada como no desplegada) y sin contradicción con el SSOT en P1 | `sha256` de HEAD == `0a400216…` + `git log` del parche doctrinal |

**Además, para poder declarar éxito según `AGENTS.md` («Condición de éxito, no negociable») faltan tres cosas que
este gate NO puede dar y que no son de alineación:**
(a) **prueba E2E de reproducción real** en al menos un player (ExoPlayer/hls.js) — hoy no hay ninguna medición de
frame-decode en esta campaña;
(b) **telemetría QoE con almacén** — `conviva.db` sigue en 0 B y los 7 timers `netshield-*` inactivos (D-27 prohíbe
afirmar lo contrario);
(c) **rotación de las credenciales expuestas** en `channels_map.json` (D-24) — acción del owner, ajena a la cadena.

---

## 5. Declaraciones de honestidad (lo que este veredicto NO afirma)

- **No** afirma que la reproducción esté rota. No se midió ningún player. La inferencia de "rechazo de variante por
  nivel" es **de especificación** (HEVC Annex A, `MaxLumaPs`), no una observación de dispositivo.
- **No** convierte ningún UNKNOWN en PASS. Los 5 UNKNOWN tienen motivo escrito: P2 ausente del catálogo (×3),
  `/meta/` inalcanzable, familia B no versionada como espejo.
- **No** reabre los falsos positivos prohibidos: el rojo de `contracts/verify_contracts.mjs` es `CONTRACT_DRIFT`
  (D-11, verificado comparando **bytes de HEAD**: el pin coincide con HEAD), el `.mkv` aplanado es ajeno (D-12), y
  `VPS_READONLY_ATTESTATION.md` y `SECRETS_SCAN.md` **existen** y se citan como evidencia (D-30).
- **No** propone desplegar nada: B-08/B-14 son `FIX_VPS_GATED` y exigen D-04. B-16 es `DOC_DEBT`: **se corrige el
  documento, no el VPS** (D-25/D-32).
- **No** aplicó ningún fix: cero escrituras fuera de `audit/alignment/2026-10-25/90-matriz/`, cero commits.

---

*Fin de `VERDICT.md` — Veredicto global **FAIL**: 32 FAIL / 16 PASS / 5 UNKNOWN sobre 53 filas; 3 de 5 leyes
cardinales violadas; 16 blockers clasificados con archivo:línea y fix mínimo propuesto, ninguno aplicado.*
