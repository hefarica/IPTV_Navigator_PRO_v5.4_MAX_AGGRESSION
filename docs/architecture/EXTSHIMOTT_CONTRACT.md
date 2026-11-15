# Contrato `#EXTSHIMOTT` — semántica campo a campo (ver 1)

> **Artefactos de este contrato**
> - Schema: [`contracts/extshimott_contract.json`](../../contracts/extshimott_contract.json) (`$id`: `ape.extshimott.v1`)
> - Validador: [`tools/quality/validate_extshimott.js`](../../tools/quality/validate_extshimott.js)
> - Fixture sano (3 canales): [`tests/fixtures/extshimott_sample.m3u8`](../../tests/fixtures/extshimott_sample.m3u8)
> - Baseline (el mismo fixture **sin** el tag): [`tests/fixtures/extshimott_sample_baseline.m3u8`](../../tests/fixtures/extshimott_sample_baseline.m3u8)
> - Fixture negativo: [`tests/fixtures/extshimott_sample_bad.m3u8`](../../tests/fixtures/extshimott_sample_bad.m3u8)
>
> **Estado:** contrato + validador + fixtures. **No** se tocó código de producción
> (generador, VPS, APK, shim): esta entrega define el sobre y cómo se verifica, no
> cómo se emite ni cómo se consume.

---

## 1. Qué es y qué no es

`#EXTSHIMOTT:{...}` es un tag **HLS propietario, aditivo y de una sola línea** que
transporta, por canal, los ajustes que el shim de la APK aplica al dispositivo y el
routing por target (OTT / VLC / Kodi), junto con los metadatos reales de la fuente
servida.

- **Es** un sidecar de configuración. Lo lee el shim de la APK.
- **No es** una declaración de variante. No sustituye `CODECS=`, `RESOLUTION=`,
  `BANDWIDTH=` ni `VIDEO-RANGE=` del `#EXT-X-STREAM-INF`.
- **No es** un bloque de cabeceras. No sustituye ni modifica el `#EXTHTTP:` del canal.
- **No es** un sustituto de `#EXTVLCOPT:` / `#KODIPROP:`: los targets `vlc` y `kod`
  siguen leyendo esas líneas; el tag solo añade lo que no cabe ahí.

### Por qué un player genérico no se rompe

El tag cae en la familia que el ecosistema ya usa en producción (`#EXTHTTP:`,
`#EXTVLCOPT:`, `#KODIPROP:`): líneas que empiezan por `#` y que un parser HLS
desconoce. La regla aplicable es la que cita la skill `m3u8-hls-manifest-supremo`:
*«Clients MUST ignore any unrecognized tags»* (RFC 8216 §4.1, según la cita literal
de esa skill; el RFC no se re-descargó en esta tarea). El repo ya emite esa misma
familia de líneas en producción (`#EXTHTTP:` 199 por canal — conteo **declarado por
el operador**, medido con el censo del validador en §8, no en esta entrega), lo que
hace que el patrón sea consistente con lo desplegado.

**Riesgo real que sí existe:** un parser que trunque la línea (buffer fijo) puede
quedar con un fragmento que parezca una URI. Por eso el techo de longitud es parte
del contrato (§7) y no una recomendación.

### Convención de nombres que hay que leer dos veces

Hay **dos `hdr` de naturaleza distinta** en el mismo objeto:

| Ruta | Tipo | Significado |
|---|---|---|
| `v.hdr` | string enum | rango dinámico **real de la fuente** (`sdr`/`hdr10`/`hdr10plus`/`dolby_vision`) |
| `hdr` | objeto | **cabeceras** que el shim inyecta: `ua`, `rf` |

No es un error del contrato: es la forma que fijó el operador. El validador los
trata por separado sin ambigüedad.

---

## 2. Contradicción detectada y resuelta: `ver`

El ejemplo canónico del encargo **omite** `"ver":1`, pero la **regla dura 5** exige
versión explícita. Un ejemplo ilustrativo no puede anular una regla dura.

**Resolución:** `ver` es **obligatorio** (`required`) y su valor es `const 1`. Un
payload sin `ver` es inválido (`E_SCHEMA_REQUIRED`). Esta es la forma canónica
vigente (la del fixture, 615 chars medidos):

```text
#EXTSHIMOTT:{"ver":1,"id":"es_c01","v":{"c":"hevc","p":"main10","hdr":"hdr10plus","w":3840,"h":2160,"f":50,"g":50,"tf":"bt2020"},"a":{"c":"ec-3","ch":6,"l":"es"},"hdr":{"ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36","rf":"https://www.google.com/"},"flt":"nlmeans=s=1.0:p=7:r=15,unsharp=5:5:0.8:3:3:0.4,gradfun=1.2:16,zscale=t=709:m=709:r=limited","cad":{"mode":"fixed","fps":50,"seg":4},"dev":{"hdr_c":1,"mcr":2,"mmp":0,"res_w":3840,"res_h":2160,"di":"off"},"ott":{"buf":8,"hw":1,"asp":"fit"},"vlc":{"f":1},"kod":{"isa":1},"tgt":"ott|vlc|kod"}
```

`#EXTSHIMOTT:` ocupa 12 caracteres; por tanto el payload máximo es **4084 chars**.

---

## 3. Ubicación exacta

Un **canal** se define así: empieza en `#EXTINF:` y termina en la primera línea que
no es comentario (no empieza por `#`) ni está vacía — su URI.

```text
#EXTINF:-1 tvg-id="es_c01" ...,NOMBRE
#EXTHTTP:{...}                 ← capas existentes intactas
#EXTVLCOPT:...
#KODIPROP:...
#EXT-X-APE-...
#EXT-X-STREAM-INF:...CODECS="hvc1.2.4.L153.B0,ec-3",RESOLUTION=3840x2160...
#EXTSHIMOTT:{...}              ← ÚLTIMA línea de tag, inmediatamente antes de la URI
https://.../master.m3u8        ← URI del canal
```

Reglas verificadas por el validador:

| Regla | Código si se viola |
|---|---|
| exactamente **1** ocurrencia por canal | `E_TAG_MISSING` / `E_TAG_DUP` |
| es la línea **inmediatamente** anterior a la URI (0 líneas entre medias) | `E_TAG_NOT_LAST` |
| no aparece en el encabezado ni fuera de un bloque de canal | `E_TAG_OUTSIDE` |
| forma `#EXTSHIMOTT:{` en columna 1, sin espacios iniciales | `E_TAG_MALFORMED` |
| sin espacios al final | `W_TAG_TRAILING_WS` |

---

## 4. Reglas duras → cómo se hacen cumplir

| # | Regla | Enforcement verificable |
|---|---|---|
| 1 | JSON compacto de una línea, sin saltos ni comas finales | línea única por construcción del formato; `E_TRAILING_COMMA`; `E_JSON_PARSE`; `W_NOT_CANONICAL` (compara `JSON.stringify(parse(payload))` con el payload) |
| 2 | Si no se conoce un campo, se **omite**; nunca se inventa | cada subobjeto exige `minProperties: 1` (`E_SCHEMA_MINPROPS`): `"dev":{}` es error, no un vacío silencioso. No existen centinelas (`null`, `-1`, `"unknown"`) en el dominio de ningún campo |
| 3 | Cabe en el límite de línea sin romper el parser | `E_LINE_TOO_LONG` (>4096 chars) y `W_LINE_NEAR_LIMIT` (>3840). Justificación y mediciones en §7 |
| 4 | **Nunca** sustituye `CODECS=`/`RESOLUTION=` del `STREAM-INF` ni los `EXTHTTP` | el tag es aditivo por construcción; el validador lo **prueba** con `--baseline` (§8). `never_replaces` está declarado en `x-ape` del contrato |
| 5 | Versión explícita `"ver":1` | `required` + `const: 1` (`E_SCHEMA_REQUIRED` / `E_SCHEMA_CONST`) |
| 6 | Validador que verifica JSON, tipos, `tgt`, coherencia `cad.seg`↔`v.g/v.f`, 1 tag por canal | `tools/quality/validate_extshimott.js`, §9 |

**Extensión de campos:** `additionalProperties: false`. Un campo nuevo en `ver:1` es
`E_SCHEMA_ADDITIONAL`, no un warning: la vía es subir `ver` y versionar el contrato.
Los enums son **cerrados** por la misma razón (un valor nuevo es un cambio de
contrato, no un dato).

---

## 5. Campo a campo

Convención de lectura: **tipo** · **dominio** · **consumidor** · **si falta**.

### 5.1 Raíz

| Campo | Tipo | Dominio | Consumidor | Si falta |
|---|---|---|---|---|
| `ver` | integer | `1` | todos (gate de versión) | error |
| `id` | string | `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$` | shim (identidad por canal) | error |
| `tgt` | string | pipe-list de `ott`/`vlc`/`kod`, sin duplicados | shim (routing) | error |

`id` debe ser la **misma clave** que `ape_lists.db`. Si el `#EXTINF` trae `tvg-id` y
no coincide, el validador avisa (`W_ID_TVGID`) pero **no falla**: el `tvg-id` puede
ser un alias de EPG o faltar. Anclar la identidad en `tvg-id` es lo que permite el
warning; no hay forma de compararlo contra la base sin acceso a ella.

### 5.2 `v` — video de la **fuente real servida**

| Campo | Tipo | Dominio | Nota |
|---|---|---|---|
| `v.c` | string | `hevc` `av1` `vvc` `h264` `vp9` | codec real; el shim decide decoder |
| `v.p` | string | `main` `main8` `main10` `main12` `high` `high10` `professional` | **etiqueta**, no se resuelve a nivel RFC 6381 (eso vive en `CODECS=`) |
| `v.hdr` | string | `sdr` `hdr10` `hdr10plus` `dolby_vision` | rango **real de la fuente** |
| `v.w` / `v.h` | integer | 2..7680 / 2..4320 | resolución **real servida**, nunca la deseada |
| `v.f` | number | >0 .. 240 | fps **efectivo del segmento** |
| `v.g` | integer | 1..2000 | GOP en frames; duración = `v.g / v.f` |
| `v.tf` | string | `bt709` `bt2020` `smpte428` | transfer characteristic declarada |

**`v.w`/`v.h` son la fuente, no el display.** Escribir 3840x2160 sobre una fuente
que el proveedor sirve en 1920x1080 es exactamente la mentira que la Ley
Anti-Degradación prohíbe (declarar 4K falso). El campo de display es `dev.res_w`/
`dev.res_h`, que es una **preferencia**, y el validador no lo usa para degradar nada.

**Ley Cardinal 1 (Nivel↔Resolución):** el nivel declarado en `CODECS=` del
`#EXT-X-STREAM-INF` sigue mandando; `v.w`/`v.h` no lo alteran. El validador no
cruza ambos (son líneas distintas y `CODECS=` no es su responsabilidad).

### 5.3 `a` — audio

| Campo | Tipo | Dominio | Nota |
|---|---|---|---|
| `a.c` | string | `aac` `aac-lc` `he-aac` `ec-3` `ac-3` `opus` `mp3` `flac` `truehd` `dts` | consumidor: shim (passthrough vs transcode) |
| `a.ch` | integer | 1..16 | 2=estéreo, 6=5.1, 8=7.1 |
| `a.l` | string | `^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$` | BCP-47 en **minúsculas** a propósito: el matcher no depende de mayúsculas |

### 5.4 `hdr` — cabeceras que inyecta el shim

| Campo | Tipo | Dominio | Nota |
|---|---|---|---|
| `hdr.ua` | string | 1..512, sin CR/LF | User-Agent |
| `hdr.rf` | string | `^https?://[^\s]+$`, 8..512 | Referer |

Prohibiciones con código propio, heredadas del checklist EXTHTTP del repo:

| Prohibición | Código | Por qué |
|---|---|---|
| `%20` en el UA | `E_UA_PCT20` | el UA no es una URL; `%20` rompe el whitelist del upstream (trampa 2) |
| CR/LF en el UA | `E_UA_CRLF` | inyección de cabeceras (trampa 3) |
| Referer apuntando al VPS propio (`iptv-ape`, `duckdns`, `178.156`, `hetzner`) | `E_RF_VPS` | SPOF: un bloqueo del CDN mataría todos los canales (trampa 14) |
| Huella de motor (`OMEGA`, `CRYSTAL`, `APE_`) en el UA | `W_UA_ENGINE_FP` | fingerprint de generador (trampa 11); aviso, no error, porque puede ser legítimo en un UA de player propio |

**`hdr` no reemplaza al `#EXTHTTP:`.** El `#EXTHTTP:` del canal sigue siendo la
fuente de verdad de las cabeceras del player; `hdr.ua`/`hdr.rf` son lo que el
shim/nginx inyecta en **su** petición. Si ambos discrepan, no hay conflicto: son dos
consumidores distintos. Esta entrega no toca el `#EXTHTTP:` ni lo valida.

### 5.5 `flt` — cadena ffmpeg compacta

String de 1..1024 chars, charset `[A-Za-z0-9_.,:=+*/\[\] -]`.

| Target | Qué hace con `flt` |
|---|---|
| VPS | la usa **solo si transcoda** |
| `vlc` | la aplica como argumentos de filtro **solo si `vlc.f=1`** |
| `ott` | **NO la toca nunca**, ni siquiera si viene |

Coherencias verificadas:

| Situación | Código |
|---|---|
| `vlc` en `tgt` + `vlc.f=1` + sin `flt` | `E_VLC_FLT_MISSING` (declarar la intención sin la cadena no aplica nada) |
| hay `flt` y ningún consumidor lo aplica | `W_FLT_UNUSED` (cadena inerte) |
| `ott` en `tgt` y hay `flt` | `N_OTT_IGNORES_FLT` (nota: OTT debe ignorarla) |

**El validador no comprueba que los filtros existan** en el ffmpeg instalado: el
charset y la longitud se validan, la existencia es del gate de ffmpeg
(`tools/ape-image-recipes`, fuera de este alcance). Inventar una lista de filtros
aquí sería hardcodear una versión de ffmpeg.

### 5.6 `cad` — cadencia y segmentación

| Campo | Tipo | Dominio | Nota |
|---|---|---|---|
| `cad.mode` | string | `fixed` `adaptive` | |
| `cad.fps` | number | >0 .. 240 | con `fixed` y distinto de `v.f` → `W_CAD_FPS_MISMATCH` |
| `cad.seg` | number | >0 .. 30 | segundos; **multiplo entero de `v.g/v.f`** |

**Coherencia de GOP (la regla de la tarea):** `seg` debe ser `k · (g/f)` con `k`
entero ≥ 1, tolerancia 1e-3 s.

- `k=2.5` → `E_GOP_COHERENCE` (el segmento partiría GOPs, y con `fixed` eso implica
  cortes en la cadencia declarada).
- `seg < 1 GOP` → `E_GOP_COHERENCE` explícito.
- si falta `v.g`, `v.f` o `cad.seg` → **`N_GOP_NOT_COMPUTED`**: se reporta como *no
  computado*, jamás como OK. Ausencia de dato no es cero.

### 5.7 `dev` — ajustes de dispositivo (los mismos que hoy van por ADB/settings)

| Campo | Tipo | Dominio | Clave Android medida | Evidencia en el repo |
|---|---|---|---|---|
| `hdr_c` | integer | `0` `1` `2` `3` | `global hdr_conversion_mode` | `CLAUDE.md` (corrección 2026-06-17): `0`=UNKNOWN, `1`=PASSTHROUGH, `2`=SYSTEM, `3`=FORCE. **No hace SDR→HDR** |
| `mcr` | integer | `0` `1` `2` | `secure match_content_frame_rate` | `_APK_INVENTARIO`/`actuator_allowlist.json`: regex medida `^[012]$`; `2`=ALWAYS |
| `mmp` | integer | `0` `1` | `secure minimal_post_processing_allowed` | **mapeo INFERIDO** (ver abajo) |
| `res_w` | integer | 1..7680 | `global user_preferred_resolution_width` | `docs/sistema/01_APK_INVENTARIO.md` (dump de namespaces) |
| `res_h` | integer | 1..4320 | `global user_preferred_resolution_height` | idem |
| `di` | string | `off` `on` `auto` | — | **significado NO verificado** (ver abajo) |

**Dos huecos declarados, no tapados:**

1. `mmp` → `minimal_post_processing_allowed`: la **expansión de la abreviatura `mmp`
   no aparece escrita en el repo**; la clave `minimal_post_processing_allowed` sí
   existe (dump de namespaces de la APK). El mapeo se infiere por dominio `{0,1}` y
   por ser la única clave con ese rol. El contrato fija el **valor**; el nombre de la
   clave es responsabilidad de la capa dispositivo. **No verificado** contra el shim.
2. `di`: la expansión de la abreviatura (¿desentrelazado? ¿interpolación de
   display?) **no está verificada**. El contrato fija el dominio de valores y deja el
   significado al shim, que es el que lo consume.

Estos dos puntos no bloquean el contrato: bloquean la afirmación de que el shim ya
los aplica. Eso se cierra en la tarea del shim, con recibo del dispositivo.

### 5.8 `ott` / `vlc` / `kod`

| Campo | Tipo | Dominio | Nota |
|---|---|---|---|
| `ott.buf` | number | >0 .. 512 | buffer en MB |
| `ott.hw` | integer | `0` `1` | decoder hardware |
| `ott.asp` | string | `fit` `fill` `center` | aspecto |
| `vlc.f` | integer | `0` `1` | aplicar `flt` como args VLC |
| `kod.isa` | integer | `0` `1` | Kodi IS-A (`inputstream.adaptive`) |

Un objeto por-target declarado **sin** su target en `tgt` es dato muerto: el shim no
lo aplicará. El validador lo avisa con `W_OBJ_NOT_TARGETED` (WARN, no ERROR: es
configuración inerte, no una violación de forma).

### 5.9 `tgt` — pipe-list de lectores

- Valores permitidos: `ott`, `vlc`, `kod`.
- **Sin duplicados** (`E_TGT_DUP`): `"ott|ott"` es una contradicción gratis.
- No implica orden de aplicación ni prioridad; solo *quién lee el objeto*.
- `"ott"` mínimo 3 chars, máximo 14 (la cadena más larga legal es `ott|vlc|kod`).

---

## 6. Ejemplo mínimo legal (demuestra la regla de omisión)

Un canal del que solo se conoce la identidad y el target:

```text
#EXTSHIMOTT:{"ver":1,"id":"es_c99","tgt":"ott"}
```

Es válido: 35 chars, sin campos inventados. El shim no aplicará nada que no se le
haya dicho. Es el caso de la regla dura 2, y por eso cada subobjeto exige
`minProperties: 1`: `"dev":{}` no es "no sé", es un objeto vacío que no informa.

---

## 7. Límite de longitud: por qué 4096 (y presupuesto 3840)

### Números medidos en esta tarea

| Medición | Comando | Valor |
|---|---|---|
| Ejemplo canónico completo | `node -e` sobre `examples[0]` del contrato | **615 chars** (`payload` 603) |
| Peor payload **legal según el propio schema** (todos los campos en su máximo: `id` 64, `ua` 512, `rf` 512, `flt` 1024, etc.) | `node -e` construyendo el objeto máximo | **2520 chars** (headroom 1576 vs 4096) |
| Tag de prueba sobre el techo | línea de 4151 chars | `E_LINE_TOO_LONG` (rechazada) |
| `#EXTSHIMOTT:` prefix | — | 12 chars → payload ≤ 4084 |

### Justificación

1. **El schema nunca puede llegar al techo.** Con todos los campos en su máximo
   legal el payload mide 2520 chars; el techo de 4096 no es alcanzable por un
   payload válido. Si alguien necesita más, es una señal de que está metiendo varias
   cosas en un solo canal: la respuesta correcta es otro campo versionado, no una
   línea más larga.
2. **4096 es la frontera de buffer de línea más común.** Muchos lectores C leen
   líneas con `fgets(buf, 4096)`: eso deja 4093–4095 chars útiles. Una línea de 4096
   chars + `\n` + `\0` se **parte**, y el fragmento sobrante puede parecer una URI a
   un parser ingenuo. Ese es el fallo que hay que evitar, y es peor que ignorar el
   tag: rompería el canal.
3. **3840 es el presupuesto operativo**, no el techo: deja 256 chars de margen bajo
   un buffer de 4096 bytes. El validador avisa a partir de ahí, no falla.
4. **Por qué no 8192:** el repo ya emite `#EXTHTTP:` de hasta 8192 B, pero ese
   presupuesto lo fijó el proyecto (`APE_SanityCheck` I1), **no** una medición de
   parser. Para un tag nuevo no hay razón para heredar un número que nadie midió.

### Límite honesto de esta justificación

**No se midió truncado real en ningún player.** No hay evidencia en esta tarea de
que ExoPlayer/VLC/Kodi corten a 4096. La elección es de diseño (frontera de buffer
común + consistencia con el propio schema), y así queda declarado en el contrato
(`x-ape.limits.note`). Presentarlo como hecho medido sería el modo de fallo (c):
estado declarado como verificado sin artefacto.

---

## 8. Aditivo, y cómo se **prueba**

Declarar "no rompe nada" es prosa. El validador lo convierte en una comparación
ejecutable:

```bash
node tools/quality/validate_extshimott.js <lista_nueva.m3u8> --baseline <lista_original.m3u8>
```

Qué hace: quita **todas** las líneas `#EXTSHIMOTT:` de la lista validada y exige
**igualdad exacta, línea por línea y en orden**, con la baseline. Cualquier otro
cambio (una coma, un header, un `EXTVLCOPT` de más o de menos) rompe la igualdad y
emite `E_BASELINE_DIFF` con el número de línea y ambas versiones.

Evidencia de esta tarea:

| Escenario | Resultado medido |
|---|---|
| fixture (39 líneas) vs baseline (36 líneas, sin tag) | `N_ADDITIVE_OK`: *quitando 3 líneas #EXTSHIMOTT la lista es idéntica a la baseline (36 líneas, orden y contenido)* · exit **0** |
| baseline alterada en una sola línea (`network-caching=4000`→`9999`) | `E_BASELINE_DIFF · linea 11` · exit **1** (el check no es vacuo) |
| baseline que ya trae tags | `E_BASELINE_HAS_TAG` (se pasó el fichero equivocado) |

Complemento: en cada corrida el validador **censa** las familias protegidas
(`EXTHTTP`, `EXT-X-APE-*`, `EXTVLCOPT`, `KODIPROP`, `EXT-X-STREAM-INF`) para que la
no-regresión sea comparable entre versiones de la lista. Censo del fixture:
`EXTHTTP=3 EXT-X-APE-*=8 EXTVLCOPT=6 KODIPROP=4 EXT-X-STREAM-INF=3`.

> **Honestidad sobre los conteos 199/109/21/6.** Son los que declara el operador por
> canal. Esta tarea **no** los mide sobre una lista real (no se usó ninguna lista de
> producción). El censo del validador es el instrumento para medirlos: correrlo sobre
> la lista real y comparar contra la baseline da el número medido.

---

## 9. El validador

```bash
# validar (sale 0 si no hay ERROR)
node tools/quality/validate_extshimott.js tests/fixtures/extshimott_sample.m3u8

# probar que el tag es aditivo
node tools/quality/validate_extshimott.js <nueva.m3u8> --baseline <original.m3u8>

# salida para CI
node tools/quality/validate_extshimott.js <nueva.m3u8> --json

# contrato alternativo (p. ej. ver:2 cuando exista)
node tools/quality/validate_extshimott.js --contract <schema.json> <nueva.m3u8>
```

- **Sin dependencias.** Node ≥ 18. Solo lee; no escribe ni modifica nada.
- **Schema-driven:** lee `contracts/extshimott_contract.json`. No hay una segunda
  lista de campos hardcodeada en el JS. Si el contrato usa una palabra clave de
  JSON Schema que el motor no implementa, **aborta con exit 2** en vez de ignorarla
  en silencio (subconjunto declarado en la cabecera del archivo).
- **Exit:** `0` sin ERROR (warnings y notas permitidos) · `1` hay ERROR · `2` uso,
  IO o contrato no soportado.

### Códigos

| Código | Severidad | Qué detecta |
|---|---|---|
`E_JSON_PARSE` | ERROR | payload no es JSON estricto
`E_TRAILING_COMMA` | ERROR | coma final antes de `}`/`]`
`E_PAYLOAD_NOT_OBJECT` | ERROR | payload que no es objeto (`[]`, `"x"`, `1`)
`W_NOT_CANONICAL` | WARN | JSON válido pero no en forma compacta canónica
`E_SCHEMA_TYPE` | ERROR | tipo incorrecto
`E_SCHEMA_CONST` | ERROR | `ver` distinto de 1
`E_SCHEMA_ENUM` | ERROR | valor fuera del enum
`E_SCHEMA_PATTERN` | ERROR | no casa con el patrón
`E_SCHEMA_RANGE` | ERROR | fuera de mínimo/máximo
`E_SCHEMA_LEN` | ERROR | longitud fuera de rango
`E_SCHEMA_REQUIRED` | ERROR | falta un campo obligatorio
`E_SCHEMA_ADDITIONAL` | ERROR | campo no declarado en `ver:1`
`E_SCHEMA_MINPROPS` | ERROR | subobjeto vacío
`E_SCHEMA_ANYOF` / `E_SCHEMA_ONEOF` / `E_SCHEMA_NOT` | ERROR | combinadores del schema
`E_TAG_MISSING` | ERROR | canal sin el tag
`E_TAG_DUP` | ERROR | más de 1 ocurrencia en el canal
`E_TAG_NOT_LAST` | ERROR | no es la línea inmediatamente anterior a la URI
`E_TAG_OUTSIDE` | ERROR | tag fuera del bloque de canal
`E_TAG_MALFORMED` | ERROR | forma incorrecta (espacios iniciales, sin `:`)
`W_TAG_TRAILING_WS` | WARN | espacios al final de la línea
`E_LINE_TOO_LONG` | ERROR | > techo del contrato (4096)
`W_LINE_NEAR_LIMIT` | WARN | > presupuesto operativo (3840)
`E_TGT_DUP` | ERROR | `tgt` repite targets
`E_GOP_COHERENCE` | ERROR | `cad.seg` no es múltiplo entero del GOP / es menor que 1 GOP
`N_GOP_OK` | NOTE | coherencia calculada y correcta (con el `k` medido)
`N_GOP_NOT_COMPUTED` | NOTE | faltan datos: **no computado**, no OK
`W_CAD_FPS_MISMATCH` | WARN | `mode=fixed` con `cad.fps ≠ v.f`
`E_VLC_FLT_MISSING` | ERROR | `vlc.f=1` sin `flt`
`W_FLT_UNUSED` | WARN | `flt` sin consumidor que lo aplique
`N_OTT_IGNORES_FLT` | NOTE | `ott` en `tgt` con `flt` presente
`W_OBJ_NOT_TARGETED` | WARN | objeto por-target sin su target en `tgt`
`E_UA_PCT20` | ERROR | `%20` en `hdr.ua` (trampa 2)
`E_UA_CRLF` | ERROR | CR/LF en `hdr.ua` (trampa 3)
`W_UA_ENGINE_FP` | WARN | huella de motor en `hdr.ua` (trampa 11)
`E_RF_VPS` | ERROR | Referer al VPS propio (trampa 14)
`W_ID_TVGID` | WARN | `id` ≠ `tvg-id` del `#EXTINF`
`E_EXTINF_WITHOUT_URI` | ERROR | bloque `#EXTINF` sin URI
`W_URI_WITHOUT_EXTINF` | WARN | URI sin `#EXTINF`
`E_NO_CHANNELS` | ERROR | el archivo no es un catálogo de canales
`W_MASTER_VARIANT_WITHOUT_EXTINF` | WARN | `#EXT-X-STREAM-INF` sin `#EXTINF` (forma master)
`E_BASELINE_HAS_TAG` | ERROR | la baseline ya trae el tag
`E_BASELINE_DIFF` | ERROR | la lista sin el tag difiere de la baseline
`N_ADDITIVE_OK` | NOTE | prueba aditiva superada

---

## 10. Qué **no** verifica este contrato (fallos honestos)

| No verificado | Dónde se cierra |
|---|---|
| Que los filtros de `flt` existan en el ffmpeg instalado | gate de ffmpeg / `tools/ape-image-recipes` |
| Que el bitstream real coincida con `v.w/h/f/c` (verdad de la fuente) | probe del generador |
| Que el generador emita el tag | tarea del generador |
| Que nginx/shim lea `hdr.ua`/`hdr.rf` | tarea del VPS |
| Que la APK/shim aplique `dev.*`/`ott.*` y devuelva recibo | tarea APK/shim |
| Claves duplicadas **dentro** del mismo objeto JSON | `JSON.parse` colapsa duplicados; un detector exigiría un parser propio. No implementado |
| Truncado de línea en players reales (§7) | medición con device; no hecha |
| Los conteos 199/109/21/6 por canal | se miden con el censo del validador sobre la lista real |

---

## 11. Versionado

- `ver:1` es este contrato. Un payload con otro `ver` es inválido para este
  validador (`E_SCHEMA_CONST`): no se adivina el formato futuro.
- Cambios **compatibles**: ninguno. Añadir un campo, un valor de enum o relajar un
  patrón es un cambio de contrato → `ver:2` + `--contract` apuntando al nuevo
  schema. El validador nunca aplica dos versiones a la vez.
- Retrocompatibilidad operativa: `ver:1` debe seguir siendo válido mientras existan
  listas emitidas con él. El shim debe rechazar (o ignorar con log) un `ver` que no
  conozca, nunca interpretarlo como `ver:1`.

---

## 12. Peso del tag en la lista completa (medido)

§7 justifica el **techo** (4096) y el **presupuesto** (3840). Falta lo que cuesta de verdad: cuánto engorda
la lista del operador. Medido con `Buffer.byteLength(UTF-8)` sobre la línea completa, no estimado.

### 12.1 Anatomía del ejemplo del encargo: 512 B

| Parte | Bytes |
|---|---|
| `#EXTSHIMOTT:` (prefijo) | 12 |
| payload JSON | 500 |
| **línea completa** | **512** |

Y dentro del payload, lo que cuesta cada bloque (`clave` + valor serializado):

| Bloque | B | Bloque | B | Bloque | B |
|---|---|---|---|---|---|
| `v` | 89 | `dev` | 64 | `a` | 28 |
| `flt` | 92 | `cad` | 33 | `tgt` | 13 |
| `hdr` | 48 | `ott` | 28 | `kod` | 9 |
| `id` | 8 | `vlc` | 7 | `ver` | 1 |

Suma de bloques 420 B; el JSON completo son 500 B (las 80 B restantes son comas, llaves y corchetes).

### 12.2 Extrapolación a los 21.224 canales de la lista medida (1.311.467.322 B)

| Variante del tag | Bytes/canal | × 21.224 | MiB | % de la lista |
|---|---|---|---|---|
| Mínimo legal (`ver`+`id`+`tgt`) | 47 | 997.528 | 0,95 | 0,076 % |
| **Ejemplo del encargo** | **512** | **10.866.688** | **10,36** | **0,829 %** |
| Máximo del fixture (medido por el validador) | 615 | 13.052.760 | 12,45 | 0,995 % |
| Peor payload legal según el schema | 2.534 | 53.781.616 | 51,29 | 4,101 % |
| Presupuesto operativo (3840) | 3.840 | 81.500.160 | 77,72 | 6,214 % |
| Techo duro (4096) | 4.096 | 86.933.504 | 82,91 | 6,629 % |

**Lectura honesta:** con el tag realista (512–615 B) la lista pasa de 1.311.467.322 B a ~1.322.334.010 B:
**+10,36 MiB, un 0,83 %**. Es el precio de que el shim y el VPS sepan qué sirve cada canal sin sondear.
El techo del contrato costaría un 6,63 %, y por eso 3840 es **presupuesto operativo** (aviso) y no objetivo:
si un canal se acerca ahí, el problema es el contenido del tag, no el límite.

**Por qué los nombres son cortos (§R5).** Un nombre de campo de 12 caracteres en vez de 3, en los 39
campos del schema, costaría ~350 B por canal: **7,1 MiB extra en la lista** (0,56 % más) sin aportar
nada al consumidor. El vocabulario corto (`v.c`, `a.ch`, `dev.hdr_c`) es una decisión de peso, no de estilo.

---

## 13. Repro exacto de esta entrega

```bash
node --check tools/quality/validate_extshimott.js
python3 -c "import json;d=json.load(open('contracts/extshimott_contract.json',encoding='utf-8'));print(d['x-ape']['contract'],d['properties']['ver']['const'])"
node tools/quality/validate_extshimott.js tests/fixtures/extshimott_sample.m3u8
node tools/quality/validate_extshimott.js tests/fixtures/extshimott_sample.m3u8 --baseline tests/fixtures/extshimott_sample_baseline.m3u8
node tools/quality/validate_extshimott.js tests/fixtures/extshimott_sample_bad.m3u8   # exit 1 esperado
```

### Huellas de contenido (medidas al cerrar esta entrega)

| Artefacto | Líneas | sha256 |
|---|---|---|
| `contracts/extshimott_contract.json` | 402 | `798a00a7147b4d877cb986a2d02a5d5a0169678dd854458c7671c6cef142048a` |
| `tools/quality/validate_extshimott.js` | 558 | `858f2d3e4bdfea90d235b0ff30097e4466a40b00c9e4908f822e7bbd00f66154` |
| `tests/fixtures/extshimott_sample.m3u8` | 39 | `ebfcd25f8b67a812e5aee2e06c8285eac60feb1a9f4fa545a6901076169a8165` |
| `tests/fixtures/extshimott_sample_baseline.m3u8` | 36 | `b28fdd4e10f9cb2735c13ed5fa98ef0a2f58d366f24c07d0e69b76a4353ce16f` |
| `tests/fixtures/extshimott_sample_bad.m3u8` | 32 | `450d992b6a15aee216104989c523d0f09508a958808ef64409d1eb01421f3dec` |

### Ámbito respetado

Solo se escribieron estos caminos: `contracts/`, `docs/architecture/`,
`tools/quality/validate_extshimott.js` y `tests/fixtures/extshimott_sample*.m3u8`.
Ningún archivo de producción (generador, VPS, APK, shim) fue tocado.
`git status` muestra además modificaciones **ajenas y previas** a esta sesión en
`IPTV_v5.4_MAX_AGGRESSION/{android,vps}`, `ottshim/`, `tools/ops/` y
`tools/quality/test_list_cablear_panel.js` (mtime 2026-11-14 13:25, ~7 h antes del
cierre): no forman parte de esta entrega y no se tocaron.

