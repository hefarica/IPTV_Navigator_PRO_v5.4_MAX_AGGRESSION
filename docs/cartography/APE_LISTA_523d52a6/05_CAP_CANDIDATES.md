# 05 — Veredicto de los 7 candidatos a cap de vídeo (t9b)

**Cierra los 7 tokens que t7 dejó en `candidates_not_removed`.** Un veredicto por token, con la
evidencia censal de la lista real y la semántica documentada de `inputstream.adaptive`.

- **Sujeto (solo lectura, sin modificar):** `APE_LISTA_1793589060441.m3u8` — 604.593.696 B,
  `sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`
  (**recalculado en este pase**: `scan.source.sha256_matches_reference = true`).
- **Insumo:** `scratch/avisynth_probe_2026/live_corrected/report.json` (t7, `candidates_not_removed`).
- **Evidencia censal propia:** `scratch/cap_candidates_02/scan.json` (1 pase secuencial, 10.315.662
  líneas, **10.573 canales censados, 0 muestreo**), producido por
  `scratch/cap_candidates_02/scan_cap_candidates.js` (27 s, sin red).
- **Semántica del addon:** wiki oficial de `inputstream.adaptive`
  ([Integration](https://github.com/xbmc/inputstream.adaptive/wiki/Integration) y
  [Stream selection types properties](https://github.com/xbmc/inputstream.adaptive/wiki/Stream-selection-types-properties)),
  consultada 2026-11-02.
- **Matriz que se aplica:** [`04_LANE_CAPABILITY_MATRIX.md`](04_LANE_CAPABILITY_MATRIX.md) — en VLC 3.0.24
  los tokens `adaptive-*` y `video-*` **no existen** en los binarios (`VLC_OPT_AUDIT.md`: 80 de 138 ausentes).
- **Artefacto máquina-legible:** [`../../../tools/ape-demuxed/cap_verdicts.json`](../../../tools/ape-demuxed/cap_verdicts.json).

---

## VEREDICTO EN CINCO LÍNEAS

1. **1 de los 7 es un cap de vídeo real y debe eliminarse:** `inputstream.adaptive.chooser_bandwidth_max`
   — es una propiedad **documentada** de ISA (máximo bitrate en bit/s) y su valor queda **por debajo del
   `BANDWIDTH` declarado en el mismo bloque en los 10.573 canales** (8.000.000 < 9.000.000 / 12.000.000 /
   28.000.000; 19.800.000 < 28.000.000).
2. **4 son inertes y se pueden borrar sin efecto medible** (tokens **ausentes** de los binarios de VLC y sin
   otro runtime que los lea): `adaptive-bandwidth-factor`, `adaptive-maxbw`, `video-fps`, `video-display-fps`.
   `adaptive-maxbw=999999999` está **por encima** del `BANDWIDTH` en 10.573/10.573 → no caparía ni si se leyera.
3. **1 es inerte hoy y se retira por política defensiva:** `preferred_video_resolution=2160` — no es una clave
   documentada de ISA (las documentadas son `chooser_resolution_max` / `chooser_resolution_secure_max`, con
   enum `480p…4K`), su valor no usa ese enum, y `2160` coincide con la resolución vertical declarada
   (`3840x2160`) en **10.573/10.573** → no capa nada hoy.
4. **1 queda `indeterminado` (NO_COMPUTADO), y se declara por qué:** `max_buffer_duration` (104/110/144). No
   aparece en ninguna de las dos páginas de propiedades de ISA; por semántica **no limita píxeles**, pero
   borrarlo a ciegas cambia una política de buffering cuyo efecto **no se puede medir sin Kodi en ejecución**.
   No se inventa veredicto: se marca `indeterminado` con la razón exacta y la acción recomendada.
5. **Ninguno de los 7 es un cap "invisible" en VLC**: los cuatro `#EXTVLCOPT` están en la familia de tokens
   que t4 midió ausentes del binario, así que su efecto en VLC es **cero** (y siguen siendo basura en el
   manifiesto). El único cap con efecto en un runtime real es el `#KODIPROP` de Kodi, y es el único que hay
   que quitar por la ley del operador.

---

## 1. Tabla de veredictos (el entregable)

| # | Tag completo | Valor(es) censados | ¿Limita vídeo? | ¿Quién lo lee? | **Veredicto** | Razón | Artefacto |
|---|---|---|---|---|---|---|---|
| 1 | `#EXTVLCOPT:adaptive-bandwidth-factor` | `1.0` × 10.573 | **No** (valor neutro: ×1.0) | **Nadie**: token ausente en VLC (`adaptive-*`), y fuera de VLC nadie lee `#EXTVLCOPT` | **`inocuo_para_vlc`** | Token inexistente ⇒ no se aplica; y aun si se aplicara, `1.0` es el multiplicador neutro (no recorta ABR). Basura borrable | `04_LANE_CAPABILITY_MATRIX.md` §7.3 + `VLC_OPT_AUDIT.md` (familia `adaptive-*`, 36 ausentes); valor en `scan.json → per_token.abf` |
| 2 | `#EXTVLCOPT:adaptive-maxbw` | `999999999` × 10.573 | **No**: 999.999.999 bit/s ≈ 1 Gbps **> `BANDWIDTH`** en **10.573/10.573** | **Nadie** (token ausente en VLC) | **`inocuo_para_vlc`** | Doble razón medida: el nombre no existe en VLC **y** el valor está por encima de cualquier `BANDWIDTH` declarado (9/12/28 Mbps) ⇒ no caparía ni en la hipótesis de que se leyera | `scan.json → cap_effective["inputstream.adaptive.adaptive-maxbw"]` = `{channels_above_declared_BANDWIDTH: 10573}` |
| 3 | `#EXTVLCOPT:video-display-fps` | `30` × 7.457 · `60` × 3.116 | **No hoy** (token ausente). Si se leyera, **sí** en 1.185 canales (60→30) | **Nadie** (token ausente en VLC) | **`inocuo_para_vlc`** | Inerte por inexistencia. Se documenta el riesgo latente: hay **1.185** canales donde el token declara 30 mientras la variante declara `FRAME-RATE=60.000` (cap descendente si algún día se honrara) | `scan.json → crosstab.vfps_vs_framerate` (`vfps=30|framerate=60.000: 1185`) |
| 4 | `#EXTVLCOPT:video-fps` | `30` × 7.457 · `60` × 3.116 | **No hoy** (token ausente). Mismo riesgo latente que #3 | **Nadie** (token ausente en VLC) | **`inocuo_para_vlc`** | Idéntico a #3: `video-fps` está en la familia `video-*` ausente de los binarios (17 tokens) | `VLC_OPT_AUDIT.md` §"Familia `video-*` declarativa (17)"; `scan.json → per_token.vfps` |
| 5 | `#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` | `8000000` × 9.765 · `19800000` × 808 | **SÍ — cap real de bitrate de vídeo**, y **por debajo del `BANDWIDTH` del mismo bloque en 10.573/10.573** | **Kodi + inputstream.adaptive** (propiedad **documentada**) | **`cap_de_video`** | ISA documenta: *"Allows to set the maximum stream bandwidth. The value is defined in bit/s."* El valor 8 Mbps recorta la variante de 9/12/28 Mbps y 19,8 Mbps recorta la de 28 Mbps ⇒ **debe eliminarse** (ley: el vídeo no se capa) | Doc ISA (stream-selection-types-properties); `scan.json → crosstab.chooser_vs_bw` = `{8M/9M:7963, 8M/12M:1757, 8M/28M:45, 19.8M/28M:808}` |
| 6 | `#KODIPROP:inputstream.adaptive.max_buffer_duration` | `104` × 7.457 · `110` × 2.308 · `144` × 808 | **No** (buffer, no píxeles) | **No documentado** en ISA; sin Kodi en ejecución no se puede verificar | **`indeterminado`** | **NO_COMPUTADO:** la clave no figura en las dos páginas de propiedades de ISA; por nombre/semántica es un knob de **buffering** (no de vídeo), pero retirarla a ciegas cambia una política de buffer cuyo efecto **no es medible aquí**. No se convierte la duda en veredicto | Doc ISA (Integration + stream-selection: buffer documentado = `manifest_config.timeshift_bufferlimit`, `live_delay`; **no** `max_buffer_duration`); `scan.json → per_token.buf` |
| 7 | `#KODIPROP:inputstream.adaptive.preferred_video_resolution` | `2160` × 10.573 | **No hoy**: `2160` = vertical de la variante declarada (`3840x2160`) en **10.573/10.573** | **No documentado** en ISA; las claves de resolución documentadas son `chooser_resolution_max` / `chooser_resolution_secure_max` con enum `480p/640p/720p/1080p/2K/1440p/4K` | **`inocuo_para_vlc`** | No es una clave ISA; su valor `2160` **no** usa el enum documentado; y numéricamente coincide con la resolución ya declarada ⇒ **no capa nada observable**. Se retira por política defensiva (nombra resolución ⇒ presunción de cap) | Doc ISA (las 2 páginas: `preferred_video_resolution` no existe); `scan.json → crosstab.prefres_vs_res` = `{pref=2160|res=3840x2160: 10573}` |

---

## 1.1 Los tres ejes obligatorios, token por token

| # | Token | **Eje 1: ¿limita resolución/bitrate/fps de vídeo?** | **Eje 2: ¿lo lee algún runtime real?** | **Eje 3: si se elimina, ¿rompe algo?** |
|---|---|---|---|---|
| 1 | `adaptive-bandwidth-factor` | **No** (valor `1.0` = neutro) | **Ninguno**: ausente en VLC; fuera de VLC nadie lee `#EXTVLCOPT` | **Nada medible**: no hay runtime que lo consuma |
| 2 | `adaptive-maxbw` | **No** (1 Gbps > `BANDWIDTH` en 10.573/10.573) | **Ninguno**: ausente en VLC | **Nada medible** |
| 3 | `video-display-fps` | **No hoy**; latente sí en 1.185 canales (30 vs 60) | **Ninguno**: ausente en VLC | **Nada medible** |
| 4 | `video-fps` | **No hoy**; mismo riesgo latente | **Ninguno**: ausente en VLC | **Nada medible** |
| 5 | `chooser_bandwidth_max` | **SÍ** (techo de bitrate por debajo del declarado en 10.573/10.573) | **Kodi/ISA** (propiedad documentada) | **Sí, y es el objetivo**: Kodi pierde el techo de la playlist y pasa a usar su ajuste de usuario/ISA (la propiedad solo puede *bajar* ese ajuste, nunca subirlo) |
| 6 | `max_buffer_duration` | **No** (buffer, no píxeles) | **No documentado**; sin Kodi en ejecución no verificable | **No medible**: cambiaría una política de buffering que no se puede probar aquí |
| 7 | `preferred_video_resolution` | **No hoy** (`2160` == vertical declarada) | **Ninguno documentado** (no es clave ISA; valor fuera del enum) | **Nada medible hoy** |

---

## 2. Evidencia censal que sostiene la tabla

Todo de `scratch/cap_candidates_02/scan.json` (un pase, 10.573 canales, `sha256_matches_reference: true`).

### 2.1 Presencia y valores (0 canales sin el token)

| Token | Valores censados | Canales |
|---|---|---|
| `adaptive-bandwidth-factor` | `1.0` | 10.573 |
| `adaptive-maxbw` | `999999999` | 10.573 |
| `video-display-fps` | `30` / `60` | 7.457 / 3.116 |
| `video-fps` | `30` / `60` | 7.457 / 3.116 |
| `inputstream.adaptive.chooser_bandwidth_max` | `8000000` / `19800000` | 9.765 / 808 |
| `inputstream.adaptive.max_buffer_duration` | `104` / `110` / `144` | 7.457 / 2.308 / 808 |
| `inputstream.adaptive.preferred_video_resolution` | `2160` | 10.573 |

`missing_token_channels` = **0** para los 7 → los 7 están en el 100 % de los canales.

### 2.2 El cruce que decide #5: el cap contra el `BANDWIDTH` **del mismo bloque**

| `chooser_bandwidth_max` | `BANDWIDTH` declarado | Canales | Lectura |
|---|---|---|---|
| `8000000` | `9000000` | 7.963 | cap 0,89× por debajo |
| `8000000` | `12000000` | 1.757 | cap 0,67× por debajo |
| `8000000` | `28000000` | 45 | cap 0,29× por debajo (los 45 bloques "cortos" de `01_STRUCTURE.md` §3.4) |
| `19800000` | `28000000` | 808 | cap 0,71× por debajo |

**`channels_below_declared_BANDWIDTH = 10.573` / `channels_at_or_above = 0`.** No es una interpretación: en
cada bloque, el techo que ISA aplicaría está por debajo del bitrate que la propia playlist declara.

### 2.3 El cruce que decide #2 (y protege del falso positivo)

`adaptive-maxbw=999999999` contra el `BANDWIDTH` del bloque: **10.573/10.573 por encima**. Un techo de 1 Gbps
no recorta nada. Se documenta para que nadie lo confunda con un cap por su nombre (`maxbw`).

### 2.4 El cruce que documenta el riesgo latente de #3/#4

| `video-fps` / `video-display-fps` | `FRAME-RATE` de la variante | Canales |
|---|---|---|
| `30` | `30.000` | 6.272 |
| `60` | `60.000` | 737 |
| `60` | `30.000` | 2.379 |
| **`30`** | **`60.000`** | **1.185** ← cap descendente si se honrara |

Coinciden 7.009 de 10.573; hay 3.564 discrepancias, de las cuales **1.185 irían en dirección descendente**.

---

## 3. Contexto: lo que t7 ya resolvió (no se re-litiga)

t7 eliminó **74.011** caps con estas **8** reglas (`tools/ape-demuxed/gen_demuxed_master.js:140-151`), **todas
correctas según la evidencia de esta fase**. *Provenance del 74.011: es la corrida completa de t7
(`heredado_citado`); el `report.json` de esta carpeta es una corrida de **muestra** (1 bloque, 141 KB),
no la corrida de 604 MB.*

| Token eliminado | Por qué era cap real | Valor en la lista |
|---|---|---|
| `#KODIPROP:inputstream.adaptive.max_resolution` | resolución máxima | `1920x1080` (bajo un `3840x2160` declarado) |
| `#KODIPROP:inputstream.adaptive.max_bitrate` | bitrate máximo | — |
| `#KODIPROP:inputstream.adaptive.max_framerate` | fps máximo | — |
| `#EXTVLCOPT:adaptive-maxbitrate` | bitrate (declarado; inerte en VLC) | — |
| `#EXTVLCOPT:adaptive-maxwidth` / `-maxheight` | resolución (declarado; inerte en VLC) | — |
| `#EXTVLCOPT:video-width` / `-height` | resolución (declarado; inerte en VLC) | — |

La diferencia con los 7 de esta fase es de **prueba**, no de gravedad: t7 tenía reglas para esos 7 y no para
estos. Aquí se cierra el hueco.

---

## 4. Regla de decisión aplicada (para que el generador sea consistente)

```
1. ¿El token está en la lista de nombres AUSENTES de VLC (VLC_OPT_AUDIT.md)?
   → inocuo_para_vlc. Se puede borrar sin efecto. (aplica a #EXTVLCOPT adaptive-*, video-*)
2. ¿Es una clave DOCUMENTADA de inputstream.adaptive con semántica de límite
   (bitrate / resolución / fps)?
   → cap_de_video. Se elimina. (aplica a chooser_bandwidth_max)
3. ¿Nombra una magnitud de VÍDEO pero no está documentada?
   → política defensiva: se retira (presunción de cap), y se declara que hoy no capa.
   (aplica a preferred_video_resolution)
4. ¿Nombra una magnitud que NO es vídeo (buffer, red, reloj) y no está documentada?
   → indeterminado: no es cap, pero borrarlo a ciegas tiene un efecto no medible.
   (aplica a max_buffer_duration)
```

**Por qué el paso 3 y el 4 no se contradicen:** el criterio no es "documentado sí/no", es **qué magnitud
nombra**. La ley del operador prohíbe capar vídeo: ante una directiva de vídeo no verificable, se retira
(riesgo de cap > riesgo de perder una preferencia). Una directiva de buffer no puede capar vídeo, así que no
hay urgencia legal y sí un riesgo real de empeorar QoE al tocarla sin medir.

---

## 5. Contrato para el generador (`tools/ape-demuxed/cap_verdicts.json`)

El JSON es consumible directamente: expone las reglas en la **misma forma** que
`VIDEO_CAP_RULES` (`{tag, key, kind, effect}`) para que se puedan anexar sin traducción.

| Campo | Contenido | Uso |
|---|---|---|
| `prohibited[]` | `chooser_bandwidth_max` (kodi-addon-key, bitrate) | anexar a `VIDEO_CAP_RULES` → se elimina y se cuenta como `caps_limiting` |
| `inert_removable[]` | los 4 `#EXTVLCOPT` + `preferred_video_resolution` | borrar sin efecto; se reporta como `inert-vlc` |
| `indeterminado[]` | `max_buffer_duration` | **no** borrar en modo automático; reportar y pedir decisión |
| `already_resolved_by_t7[]` | las 7 reglas de t7 | contexto, no se duplican |
| `by_tag` | mapa `tag → veredicto` | consulta O(1) del emisor |

**Consecuencia medida si se aplica `prohibited[]`:** desaparecen **10.573** líneas
`#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` (una por canal), y con ellas el único techo de bitrate
de vídeo con efecto real en un runtime del catálogo. **Trade-off honesto:** en un enlace débil, Kodi ya no
recibirá ese techo desde la playlist y usará su ajuste de usuario/ISA; el operador puede fijarlo en el
dispositivo. La ley (MAX IMAGE FIRST, sin caps de vídeo) manda sobre la comodidad de red, y el techo
**sigue disponible** por la vía legítima (ajuste del addon), no por un tag del manifiesto.

---

## 6. Límites (fail-honest)

- **Ningún veredicto de esta fase está en `aplicado` ni `verificado`:** no hay Kodi ni ISA instalados; no se
  ejecutó ningún player. La semántica del addon se apoya en su **wiki oficial**, no en una ejecución.
- **`indeterminado` de `max_buffer_duration`** es deliberado: la ausencia en la documentación **no** prueba que
  el addon no lea la clave (puede existir soporte no documentado). Se declara el hueco en vez de taparlo.
- **El valor de `adaptive-maxbw` (999.999.999)** se interpreta como bit/s por analogía con las opciones de red
  de VLC; **no** se verificó su unidad en ningún runtime (el token no existe en VLC).
- **El cruce cap↔BANDWIDTH** compara contra el `BANDWIDTH` **declarado** por la lista; el bitrate **real** del
  canal no se midió (requiere probe del manifest remoto; `NO COMPUTADO` por diseño).
- **No se tocó** la lista, el VPS, Excel ni git. Solo se escribieron los dos entregables y `scratch/cap_candidates_02/`.

---

## 7. Artefactos

| Artefacto | Qué prueba |
|---|---|
| `scratch/cap_candidates_02/scan.json` | censo de los 7 tokens + cross-tabs + `sha256_matches_reference: true` |
| `scratch/cap_candidates_02/scan_cap_candidates.js` | el escáner reproducible (1 pase, 27 s) |
| `scratch/avisynth_probe_2026/live_corrected/report.json` | origen de la lista de 7 (`candidates_not_removed`) |
| `tools/ape-demuxed/gen_demuxed_master.js:140-166` | reglas de t7 y la tabla de candidatos que se amplía |
| `docs/cartography/APE_LISTA_523d52a6/04_LANE_CAPABILITY_MATRIX.md` §7.3 | tokens ausentes de VLC (base de `inocuo_para_vlc`) |
| `tools/ape-image-recipes/VLC_OPT_AUDIT.md` | las familias `adaptive-*` y `video-*` ausentes de los binarios |
| `tools/ape-demuxed/cap_verdicts.json` | veredictos máquina-legibles para el generador |
