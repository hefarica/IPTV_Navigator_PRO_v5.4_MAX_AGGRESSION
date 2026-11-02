# 07 — Adjudicación del cap de `#EXT-X-CMAF:` (RESOLUTION/BANDWIDTH en 10.573 canales)

**Cierra el cap que el censo de sumideros de t12 descubrió** y que no estaba ni en `cap_verdicts.json`
(t10) ni en la tabla de caps de t7.

- **Sujeto (solo lectura):** `C:\Users\HFRC\Downloads\APE_LISTA_1793589060441.m3u8` — **604.593.696 B**,
  `sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6` (`Get-FileHash` + recalculado
  en el pase censal: `sha256_matches_reference = true`). **10.573 canales / 10.315.662 líneas.**
- **Censo:** `scratch/cmaf_cap_03/scan.json` (bloque a bloque + sonda de literales) y
  `scratch/cmaf_cap_03/links.json` (identidades canal a canal). Escáneres:
  `scratch/cmaf_cap_03/scan_cmaf_cap.js` · `scan_cmaf_links.js`.
- **Artefacto máquina-legible:** [`../../../tools/ape-demuxed/cap_verdicts.json`](../../../tools/ape-demuxed/cap_verdicts.json)
  (entrada nueva `C8`, sin tocar las 7 de t10).

---

## VEREDICTO EN SEIS LÍNEAS

1. **El censo confirma el conteo y corrige la forma:** `#EXT-X-CMAF:` aparece **10.573 veces** (exactamente
   1 por bloque, 0 bloques con más de una), y **10.573/10.573 llevan `RESOLUTION`** — pero hay **3 valores
   distintos, no 2**: `1280x720` ×7.457 (P4) · `1920x1080` ×2.308 (P3) · **`3840x2160` ×808 (P1)**.
   La resolución del tag **es la del tier del perfil**, no un 720p/1080p universal.
2. **`BANDWIDTH` tiene 2 valores:** `8000000` ×9.765 y `19800000` ×808. **En los 10.573 canales está por
   debajo del `BANDWIDTH` del `#EXT-X-STREAM-INF` del mismo bloque** (nunca igual, nunca por encima).
3. **Tres identidades exactas, 10.573/10.573:** el `BANDWIDTH` del tag es **bit a bit** el mismo valor que
   `#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` (el cap real de t10) **y** que
   `#EXTVLCOPT:adaptive-maxbitrate` (que t7 ya elimina); y su `CODECS` es **el mismo nivel** que el de
   `#EXT-X-I-FRAME-STREAM-INF`. Es el **tercer sumidero del mismo constante de cap**.
4. **Ningún runtime de reproducción lo lee:** 0 de 366 binarios de VLC contienen el literal `EXT-X-CMAF`
   (control positivo: `EXT-X-STREAM-INF` en 3, `EXT-X-MAP` en 2, `EXT-X-MEDIA` en 4), el parser del frontend
   activo (`frontend/js/ape-v9/`) no lo menciona nunca, y **no es un tag de RFC 8216**. Para reproducir, es
   inerte.
5. **Pero NO es inocuo en el stack APE: el gobernador `ara-x` lo lee y lo usa como evidencia.** Lo extrae
   (`ara-x/scripts/policy/validate_catalog.js:281-285`), lo cuenta y **marca `cmafMalformedCodecs`** porque su
   `CODECS` lleva coma final en 10.573/10.573 (`ara-x/playlist/ara_x_validator.js:276-284`), y —lo más
   importante— **es la fuente con la que el gobernador sabe que solo P1 es 4K**:
   *"`#EXT-X-CMAF` 3840x2160 en 808 canales; P3=1080p y P4=720p están PROHIBIDOS como destino"*
   (`ara-x/controller/ara_x_decision_core.js:187-189`).
   **Borrar el tag destruye esa evidencia.**
6. **Veredicto: `no_cap` — se conserva.** No limita vídeo (nadie lo aplica como techo), y su efecto real es el
   contrario de un cap: es el dato que el gobernador usa para **prohibir** destinos degradados. Lo que sí es:
   una **contradicción declarativa** con el `STREAM-INF` en 9.765/10.573 canales (92,4 %) y un defecto de
   forma (`CODECS` con coma final) que ya dispara un check.

---

## 1. Censo (censo, no muestra)

Artefacto: `scratch/cmaf_cap_03/scan.json`.

| Métrica | Valor |
|---|---|
| Ocurrencias de `#EXT-X-CMAF:` (con dos puntos) | **10.573** |
| Canales con el tag | **10.573 / 10.573** (100 %) |
| Canales con **más de uno** | **0** |
| Tags sin `RESOLUTION` / sin `BANDWIDTH` / sin `CODECS` | **0 / 0 / 0** |
| Familia completa `#EXT-X-CMAF*:` | 25 tags × 10.573 = **264.325** líneas (coincide con `01_STRUCTURE.md` §5.1) |
| `#EXT-X-CMAF:` frente a sus 24 hermanos | es **1** de los 25; los otros 24 son `-LATENCY`, `-CONTAINER`, `-HDR`, `-LCEVC`, `-AI-SR`, `-VRR`… |

### 1.1 Valores distintos y distribución por perfil

| `RESOLUTION` | Canales | Perfil | `CODECS` del tag | I-FRAME del mismo bloque |
|---|---:|---|---|---|
| `1280x720` | 7.457 | **P4** | `hvc1.2.4.L93.B0,` | `hvc1.2.4.L93.B0` |
| `1920x1080` | 2.308 | **P3** | `hvc1.2.4.L123.B0,` | `hvc1.2.4.L123.B0` |
| `3840x2160` | 808 | **P1** | `hvc1.2.4.L153.B0,` | `hvc1.2.4.L153.B0` |

| `BANDWIDTH` | Canales | Perfil |
|---|---:|---|
| `8000000` | 9.765 | P4 (7.457) + P3 (2.308) |
| `19800000` | 808 | P1 |

Biyectiva perfecta perfil → (resolución, bandwidth, nivel). **No hay residuo.**

### 1.2 El tag frente al `#EXT-X-STREAM-INF` del mismo bloque

| Comparación | Canales |
|---|---:|
| `CMAF.RESOLUTION` **<** `STREAM-INF.RESOLUTION` | **9.765** (72,7 % + 21,8 %) |
| `CMAF.RESOLUTION` **=** `STREAM-INF.RESOLUTION` | **808** (P1: 3840x2160 = 3840x2160) |
| `CMAF.RESOLUTION` **>** `STREAM-INF.RESOLUTION` | **0** |
| `CMAF.BANDWIDTH` **<** `STREAM-INF.BANDWIDTH` | **10.573** |
| `CMAF.BANDWIDTH` **=** `STREAM-INF.BANDWIDTH` | **0** |

`scan.json → comparisons`: `cmaf_res_below_si_res=9765`, `equal=808`, `above=0`,
`cmaf_bw_below_si_bw=10573`, `equal=0`, `above=0`.

---

## 2. Las tres identidades: el tag es el tercer sumidero del MISMO cap

Artefacto: `scratch/cmaf_cap_03/links.json` (canal a canal, 10.573).

| Identidad | Canales que la cumplen | Difieren |
|---|---:|---:|
| `#EXT-X-CMAF.BANDWIDTH` == `#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` | **10.573** | 0 |
| `#EXT-X-CMAF.BANDWIDTH` == `#EXTVLCOPT:adaptive-maxbitrate` | **10.573** | 0 |
| `#EXT-X-CMAF.CODECS` == `#EXT-X-I-FRAME-STREAM-INF.CODECS` | **10.573** | 0 |

**Lectura:** el constante `8.000.000` / `19.800.000` no es un valor propio del tag CMAF: es **el techo del
tier**, escrito en tres sinks a la vez (dos que nadie de reproducción lee, uno que sí: el `#KODIPROP`).
Y el `CODECS` del tag no es una declaración independiente: **duplica el nivel del ladder de trick-play
(I-FRAME)**, que a su vez es el ladder por perfil de `01_STRUCTURE.md` §7.2 (`L93`/`L123`/`L153`).

**Consecuencia operativa (nueva, y es la más útil de esta fase):** aplicando t7 (`adaptive-maxbitrate` fuera)
+ t10 (`chooser_bandwidth_max` fuera), **el constante de cap sobrevive exactamente en un sitio: esta línea
inerte**. Es el mejor estado posible: cero enforcement de un techo de vídeo, y la evidencia de tier intacta.

---

## 3. Naturaleza del tag: quién lo lee de verdad

`#EXT-X-CMAF` **no está definido por RFC 8216** (no es `EXT-X-STREAM-INF`, `-MAP`, `-MEDIA`, `-KEY`,
`-DATERANGE` ni ninguno de los tags del estándar). Medido, no inferido:

| Runtime | ¿Lo lee? | Evidencia |
|---|---|---|
| **VLC 3.0.24** | **No** | Sonda de literales sobre **366 binarios / 150.518.756 B**: `EXT-X-CMAF` → **0 archivos**. Controles positivos: `EXT-X-STREAM-INF` → 3, `EXT-X-MAP` → 2, `EXT-X-MEDIA` → 4. La sonda discrimina |
| **Frontend activo APE** (`frontend/js/ape-v9/`) | **No** | `rg -l 'EXT-X-CMAF' frontend/` → **0 archivos** |
| **OTT Navigator / TiviMate / ExoPlayer / Kodi+ISA / hls.js** | **No** | Tag no estándar ⇒ ignore por el parser (04 §6.2–6.6, §7.5). Sin mecanismo documentado que lo consuma |
| **VPS nginx-Lua** | **No** | rebase-only: no parsea tags de vídeo (04 §6.7) |
| **`ara-x` (gobernador APE, no es un player)** | **SÍ** | `validate_catalog.js:281-285` extrae `cmafRes/cmafCodecs/cmafBandwidth`; `ara_x_validator.js:276-284` cuenta y marca `cmafMalformedCodecs`; `ara_x_decision_core.js:187-189` usa el tag como evidencia de qué perfil es 4K |

**Distinción que decide el veredicto:** "nadie lo lee" es verdad para los **7 runtimes de reproducción** del
catálogo, y **falso** para el gobernador del propio stack. Un tag inerte para el reproductor puede ser
*cargante* para el policy engine.

---

## 4. Veredicto

```json
{
  "tag": "#EXT-X-CMAF",
  "key": "#EXT-X-CMAF:",
  "kind": "resolution+bitrate",
  "effect": "inert-vlc",
  "verdict": "no_cap",
  "limits_video": false,
  "declares_below_variant": true,
  "read_by": ["ara-x (gobernador APE, no player)"],
  "deletable": false
}
```

**Por qué `no_cap` y no `cap_de_video`:** un cap existe cuando un runtime lo aplica. Aquí **ningún runtime de
reproducción lo aplica** (0/366 binarios de VLC, 0 parsers del frontend, tag no estándar) ⇒ el vídeo no se
recorta por esta línea. Llamarlo `cap_de_video` sería inventar el efecto que t10 sí pudo medir para
`chooser_bandwidth_max` (documentado por ISA **y** por debajo del `BANDWIDTH` en 10.573/10.573).

**Por qué `no_cap` y no `inocuo_para_vlc`:** `inocuo_para_vlc` significa "ningún runtime lo consume ⇒ se puede
borrar sin efecto". Aquí **sí hay un consumidor real en el stack** (`ara-x`), y su borrado **destruye
evidencia**: el gobernador perdería el único dato in-band que le dice que `3840x2160` corresponde a 808 canales
y que P3/P4 no son destinos 4K. Además su `CODECS` con coma final **ya dispara** un check
(`cmafMalformedCodecs`), o sea que el tag **produce un hallazgo** hoy.

**Por qué NO se borra y qué sí hay que arreglar:** el defecto no es el tag, es su contenido en 9.765 canales
(declara la resolución del tier cuando el bloque promete 4K) y la coma final del `CODECS`. La corrección
correcta es de **emisión** (alinear o marcar la línea como "tier"), no de borrado. Decisión del operador; aquí
solo se mide y se adjudica.

---

## 5. Coherencia con t10 (¿cambia algo de los 7?)

**No cambia ninguno de los 7 veredictos.** Explícitamente:

| Veredicto | t10 | Con el CMAF añadido |
|---|---|---|
| `cap_de_video` | 1 (`chooser_bandwidth_max`) | **1 — sin cambio** |
| `inocuo_para_vlc` | 5 | **5 — sin cambio** |
| `indeterminado` | 1 (`max_buffer_duration`) | **1 — sin cambio** |
| `no_cap` | 0 | **1 (nuevo: `#EXT-X-CMAF`)** |
| Total candidatos | 7 | **8** |

Y hay una consecuencia que **refuerza** t10: el cap real (`chooser_bandwidth_max`, 10.573 líneas a eliminar)
tiene su constante replicada en dos sinks inertes; quitar los dos que se aplican deja el valor **solo** en la
línea que no se aplica. La ley del operador se cumple sin perder trazabilidad.

---

## 6. La contradicción doctrinal: ¿cap que muerde, etiqueta de fallback, o ambas?

**Ninguna de las dos opciones del enunciado, y la evidencia dice exactamente qué es.**

1. **¿Muerde?** **No.** 0 lectores de reproducción medidos (VLC 0/366 binarios, frontend 0 archivos, tag fuera
   de RFC 8216). Un techo que nadie aplica no recorta un píxel.
2. **¿Es una etiqueta de fallback?** **No en el sentido HLS**: un fallback de variante sería otra entrada de
   `#EXT-X-STREAM-INF` (con su URI) o una `#EXT-X-MEDIA`. Este tag **no tiene URI** y no crea alternativa: es
   una línea suelta dentro del bloque.
3. **¿Qué es entonces?** Una **declaración de tier**, con tres componentes medidos: (a) el **techo de bitrate**
   del tier (idéntico al cap real, `10.573/10.573`); (b) el **nivel del ladder de trick-play** (idéntico al
   `I-FRAME`, `10.573/10.573`); y (c) la **resolución del tier**, que es la del perfil (biyectiva).
4. **¿Y la contradicción con el 4K?** Es **real pero parcial**: afecta a **9.765/10.573 canales (92,4 %)** —
   P4 (720p) y P3 (1080p) — y **no** a los 808 P1, donde el tag también dice `3840x2160`. Es una contradicción
   **declarativa** (dos capas del mismo bloque dicen resoluciones distintas), del mismo género que las C1–C7 de
   `01_STRUCTURE.md` §9.

**Veredicto de la pregunta 5:** es **una etiqueta de tier inerte con contradicción declarativa parcial**, y
además **evidencia operativa** para el gobernador. No es un cap que muerda.

---

## 7. Correcciones a la premisa de la tarea (medidas)

| Premisa | Estado | Medido |
|---|---|---|
| "`#EXT-X-CMAF:` con dos puntos: 10.573 ocurrencias" | **CONFIRMADO** | 10.573 (1 por bloque, 0 con más de una) |
| "10.573 llevan `RESOLUTION=` (100 %)" | **CONFIRMADO** | 10.573/10.573 (y también 10.573 con `BANDWIDTH` y con `CODECS`) |
| "Declara variantes de 1080p **y** 720p" | **INCOMPLETO** | son **3** valores: 720p (7.457) + 1080p (2.308) + **3840x2160 (808)** |
| "`BANDWIDTH=8000000`" | **INCOMPLETO** | 8.000.000 en **9.765**; **19.800.000** en los 808 restantes |
| "mientras `STREAM-INF` del mismo bloque declara `3840x2160`" | **CONFIRMADO en 10.573**, pero la **contradicción de resolución** es 9.765 | en los 808 P1 ambas capas coinciden en 4K |

---

## 8. Entrada añadida a `cap_verdicts.json` (contrato del generador)

Se añade **`C8`** con la misma forma que las de t10 y **sin tocar** las 7 anteriores:

| Campo | Valor | Uso por el generador |
|---|---|---|
| `tag` | `#EXT-X-CMAF` | match por prefijo de tag |
| `key` | `#EXT-X-CMAF:` | la línea completa es la unidad (no hay `key=value` única) |
| `kind` | `resolution+bitrate` | se declaran los dos; `kinds: ["resolution","bitrate"]` |
| `effect` | `inert-vlc` | el mismo enum de t7 (no se introduce un valor nuevo que rompa el switch) |
| `verdict` | `no_cap` | **no** entra en `prohibited[]` ni en `inert_removable[]` |
| `deletable` | `false` | borrarlo destruye la evidencia del gobernador |
| `policy_consumer` | `ara-x` (rutas citadas) | quien lo lee de verdad |

**Lo que el generador NO debe hacer:** añadirlo a la lista de caps a eliminar. Si en el futuro se quiere
eliminar, hay que sustituir antes la evidencia que `ara_x_decision_core.js` deriva de él.

---

## 9. Límites (fail-honest)

- **No hay medición de reproducción**: ningún player se ejecutó. "Ningún runtime lo lee" se apoya en (a) el
  tag no está en RFC 8216, (b) 0 literales en 366 binarios de VLC con controles positivos que sí aparecen, y
  (c) 0 menciones en el parser del frontend activo. **No** se hizo un test de reproducción con el tag inyectado.
- **OTT Navigator / TiviMate / ExoPlayer / Kodi / hls.js no se ejecutaron**: su "no lo lee" es normativo
  (tag desconocido ⇒ ignorado) más ausencia de mecanismo, igual que en 04 §6.
- **El efecto en `ara-x` es de lectura de código**, no de ejecución: se citan las líneas que lo extraen y lo
  usan como evidencia, pero **no se corrió** `validate_catalog.js` sobre la lista (fuera de este alcance).
- **El bitrate real del canal no se midió** (sin red): las comparaciones son contra el `BANDWIDTH`
  **declarado**.
- No se tocó la lista, ni `03`, ni `05`, ni la skill, ni el VPS, ni Excel, ni git.

---

## 10. Artefactos

| Artefacto | Qué prueba |
|---|---|
| `scratch/cmaf_cap_03/scan.json` | censo del tag, valores distintos, por perfil, comparaciones vs STREAM-INF, sonda de literales (VLC + repo) |
| `scratch/cmaf_cap_03/links.json` | las tres identidades canal a canal (10.573/10.573) |
| `scratch/cmaf_cap_03/scan_cmaf_cap.js` | escáner reproducible del censo |
| `scratch/cmaf_cap_03/scan_cmaf_links.js` | escáner reproducible de las identidades |
| `ara-x/scripts/policy/validate_catalog.js:281-285` | consumidor que extrae `cmafRes/cmafCodecs/cmafBandwidth` |
| `ara-x/playlist/ara_x_validator.js:276-284` | consumidor que marca `cmafMalformedCodecs` (coma final) |
| `ara-x/controller/ara_x_decision_core.js:187-189` | el tag como evidencia de "solo P1 es 4K" |
| `tools/ape-demuxed/cap_verdicts.json` | entrada `C8` + recuento actualizado (8 candidatos) |
| `docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md` §7.5 | regla del tag desconocido = metadata inerte |
