# VERIFICATION.md — arnés de verificación del master demuxed (`verify_demuxed.js`)

> **Qué demuestra este arnés:** que un master HLS emitido por `gen_demuxed_master.js` (t7) tiene
> **estructura de audio demuxed correcta**, **cero downscale de vídeo** y **cero caps de vídeo**;
> y que el **throughpass de audio se puede medir** con `ffprobe` (codec/perfil, sample rate,
> canales, bitrate, duración) comparándolo contra lo esperado.
>
> **Qué NO demuestra:** que el audio del proveedor pase sin transcode en un canal remoto (exige
> red y acceso al segmento real: se declara `NO_COMPUTADO`), ni que un player aplique nada
> (`aplicado`/`verificado` de la escalera de evidencia requieren player en ejecución y diff de
> frames — aquí no hay ninguno de los dos).
>
> Todo lo que sigue se ha medido en esta sesión; cada cifra lleva su comando o su JSON.

---

## 0. Identidad y alcance

| Elemento | Valor |
|---|---|
| `verify_demuxed.js` | 38.990 | el arnés (4 gates) |
| Batería | `tools/ape-demuxed/fixtures/run_all_tests.js` (18 casos, se auto-comprueba) |
| Fixtures | 6 masters + 3 muestras de audio reales codificadas con ffmpeg |
| Lista de referencia | `APE_LISTA_1793589060441.m3u8` — 604.593.696 B, sha256 `523d52a6…5049d6`, **intacta** (mismo sha y mismo `lastwrite` antes y después) |
| ffprobe / ffmpeg | `8.0.1-full_build` (gyan.dev) |
| Artefactos de t7 | `gen_demuxed_master.js` (80.697 B), `cap_verdicts.json` (15.063 B): **no modificados** (mtimes de 13:39–13:46, todos anteriores a esta tarea) |

**Estados de evidencia usados (no se mezclan):**

| Estado | Significado en este arnés |
|---|---|
| `PASS` | la medición se hizo y el criterio se cumple |
| `FAIL` | la medición se hizo y el criterio NO se cumple → exit 1 |
| `NO_COMPUTADO` | no hay con qué medir (sin `--source-resolution`, sin segmento de audio, URI enmascarada o inalcanzable). **Nunca se reporta como PASS** |

**Códigos de salida**

| Exit | Significado |
|---|---|
| 0 | `PASS` (los 4 gates medidos y en verde) o `PASS_HARD_GATES` (G1–G3 verde, G4 `NO_COMPUTADO` por falta de segmento) |
| 1 | al menos un gate incumplido (incluye G4 medido y en desacuerdo) |
| 2 | algún gate **duro** quedó sin medir (p.ej. sin `--source-resolution` no se puede probar el cero-downscale), o `--strict` con cualquier gate `NO_COMPUTADO` |
| 3 | error de uso (sin master, opción desconocida) |
| 4 | IO (master inexistente/vacío/sin `#EXT-X-STREAM-INF`) |

---

## 1. Los cuatro gates: criterio → resultado → evidencia

| Gate | Criterio (qué se exige) | Tipo | Fixture correcto | Se dispara en | Evidencia en el JSON |
|---|---|---|---|---|---|
| **G1** `structure` | cada `#EXT-X-MEDIA:TYPE=AUDIO` declara `GROUP-ID`, `NAME`, `LANGUAGE`, `CHANNELS`, `DEFAULT`, `AUTOSELECT`, `URI`; cada `AUDIO="g"` resuelve a un `GROUP-ID` existente; ninguna variante se queda sin `AUDIO=` si hay renditions; `GROUP-ID+NAME+LANGUAGE` único; como mucho un `DEFAULT=YES` por grupo; `#EXT-X-SESSION-DATA` usa `DATA-ID` (nunca `NAME=`) | **duro** | `PASS` (7/7 checks) | C4, C5 | `gates.g1_structure.checks[]` con `line N` |
| **G2** `zero_video_downscale` | `RESOLUTION` de cada variante ≥ `--source-resolution` (ancho **y** alto); `BANDWIDTH` ≥ `--min-video-bitrate`; `FRAME-RATE` ≥ `--source-framerate`; variante sin `RESOLUTION` ⇒ FAIL (no se puede demostrar lo que no se mide) | **duro** | `PASS` (1/1 variante a 3840x2160) | C2, C15 | `failures[]` con `line`, `kind`, `detail: "1920x1080 < 3840x2160"` |
| **G3** `zero_video_caps` | prohibidos los **8 tokens del encargo** (`max_resolution`, `max_bitrate`, `max_framerate`, `video-width`, `video-height`, `adaptive-maxbitrate`, `adaptive-maxwidth`, `adaptive-maxheight`) **más** los `prohibited[]` de `cap_verdicts.json` de t10 (`chooser_bandwidth_max`) ⇒ 9 tokens | **duro** | `PASS` (0 líneas) | C3, C6, lista real | `failures[]` con la línea literal + `by_token[]` |
| **G4** `audio_throughpass` | `ffprobe` mide codec (con perfil AAC / AC-3 / E-AC-3), sample rate, canales, bitrate y duración del segmento o de la rendition, y los compara con `--expect-audio-codec`, `--expect-sample-rate`, `--expect-channels`. **No** penaliza bajar audio (permitido por ley) | **medido** (duro cuando hay recurso) | `NO_COMPUTADO` sin segmento · `PASS` con audio real | C7/C8/C9 (PASS), C10 (FAIL) | `measurements[]` con `audio{codec,codec_rfc6381,profile,sample_rate,channels,bit_rate,bit_rate_source,duration_s}` |

**Detalle de G3 — dónde se busca y dónde no (falso positivo corregido, medido):**
el escaneo se aplica **solo a líneas de tag reales** (`^#[A-Za-z0-9.\-]+:`), nunca a comentarios
(`# texto…`), y **excluye `#EXT-X-SESSION-DATA`** (su `VALUE` es texto libre: puede nombrar una
clave sin pedirla). Antes de esta corrección el arnés marcaba como cap:
`line 4: "# Caso: CAP DE VIDEO. \`inputstream.adaptive.max_resolution=…\`"` (un **comentario** del
fixture) y `line 10: #EXT-X-SESSION-DATA:…VALUE="master_cap_max_resolution"` (un **nombre**
de fixture). Con la corrección, C3 cita **una sola** línea (`line 12: #KODIPROP:…max_resolution=1920x1080`)
y el censo de la lista real cuadra **exacto** con `rg` (§3).

---

## 2. Batería completa — 18/18 como se esperaba

Salida literal de `node tools/ape-demuxed/fixtures/run_all_tests.js --with-real-list`:

```text
OK  C1_master_correcto         exit=0   esperado=0   verdict=PASS_HARD_GATES g1=PASS g2=PASS g3=PASS g4=NO_COMPUTADO
OK  C2_downscale_video         exit=1   esperado=1   verdict=FAIL            g2=FAIL
OK  C3_cap_max_resolution      exit=1   esperado=1   verdict=FAIL            g3=FAIL
OK  C4_session_data_name       exit=1   esperado=1   verdict=FAIL            g1=FAIL
OK  C5_audio_group_inexistente exit=1   esperado=1   verdict=FAIL            g1=FAIL
OK  C6_cap_chooser_t10         exit=1   esperado=1   verdict=FAIL            g3=FAIL
OK  C7_audio_ac3_51_ok         exit=0   esperado=0   verdict=PASS            g4=PASS
OK  C8_audio_eac3_51_ok        exit=0   esperado=0   verdict=PASS            g4=PASS
OK  C9_audio_aac_st_ok         exit=0   esperado=0   verdict=PASS            g4=PASS
OK  C10_audio_codec_equivocado exit=1   esperado=1   verdict=FAIL            g4=FAIL
OK  C11_sin_source_resolution  exit=2   esperado=2   verdict=NO_COMPUTADO    g2=NO_COMPUTADO
OK  C12_strict                 exit=2   esperado=2   verdict=NO_COMPUTADO    g4=NO_COMPUTADO
OK  C13_rendition_enmascarada  exit=0   esperado=0   verdict=PASS_HARD_GATES g4=NO_COMPUTADO
OK  C14_rendition_inalcanzable exit=0   esperado=0   verdict=PASS_HARD_GATES g4=NO_COMPUTADO
OK  C15_min_bitrate_suelo      exit=1   esperado=1   verdict=FAIL            g2=FAIL
OK  C16_sin_entrada            exit=3   esperado=3   verdict=—
OK  C17_fichero_inexistente    exit=4   esperado=4   verdict=—
OK  C18_lista_referencia       exit=1   verdict=FAIL            caps_lines=84584 (esperado 84584 = 8 x 10573)  18870 ms

TODOS LOS CASOS COMO SE ESPERABA
```

| Caso | Qué es | Comando (resumen) | Exit esperado → obtenido |
|---|---|---|---|
| **C1** | master demuxed correcto | `verify_demuxed.js fixtures/master_ok.m3u8 --source-resolution 3840x2160` | 0 → **0** (`PASS_HARD_GATES`) |
| **C2** | variante **1920x1080** declarando fuente 3840x2160 | idem + `master_downscale_variant.m3u8` | 1 → **1** (G2 `FAIL`, cita `line 15`) |
| **C3** | `max_resolution=1920x1080` | + `master_cap_max_resolution.m3u8` | 1 → **1** (G3 `FAIL`, cita `line 12`) |
| **C4** | `SESSION-DATA:NAME=` en vez de `DATA-ID=` | + `master_session_data_name.m3u8` | 1 → **1** (G1 `FAIL`) |
| **C5** | `AUDIO="grp"` sin `GROUP-ID` declarado | + `master_audio_group_missing.m3u8` | 1 → **1** (G1 `FAIL`) |
| **C6** | **extra**: `chooser_bandwidth_max` (único cap real según t10, fuera de los 8 del encargo) | + `master_chooser_cap_only.m3u8` | 1 → **1** (G3 `FAIL`, cita `line 16`) |
| **C7** | AC-3 5.1 48 kHz real | `--audio-segment fixtures/audio/ac3_51_48k.ts --expect-audio-codec ac-3 --expect-sample-rate 48000 --expect-channels 6` | 0 → **0** (`PASS`, G4 medido) |
| **C8** | E-AC-3 5.1 48 kHz real | `--audio-segment fixtures/audio/eac3_51_48k.ts --expect-audio-codec ec-3 …` | 0 → **0** |
| **C9** | AAC-LC estéreo 44,1 kHz real | `--audio-segment fixtures/audio/aac_st_44100.aac --expect-audio-codec mp4a.40.2 --expect-sample-rate 44100 --expect-channels 2` | 0 → **0** |
| **C10** | se espera `ec-3` y el segmento es **ac-3** | `--audio-segment ac3_51_48k.ts --expect-audio-codec ec-3` | 1 → **1** (G4 `FAIL`: el gate **discrimina**) |
| **C11** | sin `--source-resolution` | `verify_demuxed.js fixtures/master_ok.m3u8` | 2 → **2** (G2 `NO_COMPUTADO`) |
| **C12** | `--strict` con throughpass sin medir | idem + `--strict` | 2 → **2** |
| **C13** | rendition con URI **enmascarada** (`***`) | `--probe-rendition "EAC3 5.1"` sobre el master redacted de t7 | 0 → **0** (G4 `NO_COMPUTADO` declarado) |
| **C14** | rendition con dominio `.invalid` (inalcanzable) | `--probe-rendition "EAC3 5.1"` sobre `master_ok` | 0 → **0** (G4 `NO_COMPUTADO` con el error literal de ffprobe) |
| **C15** | suelo de bitrate 8 Mbps con variante de 4 Mbps | `--min-video-bitrate 8000000` | 1 → **1** (G2 `FAIL`) |
| **C16** | sin argumentos | `verify_demuxed.js` | 3 → **3** |
| **C17** | master inexistente | `verify_demuxed.js fixtures/no_existe.m3u8` | 4 → **4** |
| **C18** | **lista de referencia completa** (604 MB) | `verify_demuxed.js <lista> --source-resolution 3840x2160` | 1 → **1** (G3 `FAIL`, ver §3) |

---

## 3. Corrida sobre la lista de referencia (604.593.696 B, 10.573 canales)

```text
verify_demuxed 1.0.0  ->  FAIL  (exit 1)
  master: APE_LISTA_1793589060441.m3u8  (604593696 B, 10315662 líneas, sha256 523d52a6d147f81c…, modo catalogue)
  G1_structure              NO_COMPUTADO  el master no declara #EXT-X-MEDIA TYPE=AUDIO; no hay estructura de demuxed que verificar
  G2_zero_video_downscale   PASS          ok
  G3_zero_video_caps        FAIL          84584 fallo(s)
  G4_audio_throughpass      NO_COMPUTADO  no se aportó --audio-segment ni --probe-rendition…
```

| Medición | Valor | Evidencia |
|---|---|---|
| Modo detectado | `catalogue` (10.573 `#EXTINF`) | `input.mode`, `input.extinf_blocks` |
| Variantes `#EXT-X-STREAM-INF` | **10.573** (1 por canal) | `gates.g1_structure.variants` |
| `#EXT-X-MEDIA TYPE=AUDIO` | **0** → master **muxed** | `gates.g1_structure.audio_renditions` |
| `#EXT-X-SESSION-DATA` | 24 líneas, todas con `DATA-ID` | `gates.g1_structure.session_data_lines` |
| G2 con fuente 3840x2160 | **PASS**: 10.573/10.573 variantes declaran `RESOLUTION=3840x2160`; peor variante = 3840x2160 (línea 1161) | `gates.g2_zero_video_downscale.worst_variant` |
| G3 | **FAIL**: 84.584 líneas de cap | `gates.g3_zero_video_caps.caps_lines` |
| Tiempo de escaneo | 10,3 s (una pasada, streaming, sha256 incluido) — **varía con la caché de página**: dos corridas del mismo fichero dieron 10.307 ms y 18.870 ms | `summary.scan_ms` |

**Censo por token (el arnés) vs `rg -c -F` (implementación independiente) — cuadra exacto:**

| Token | Arnés (`by_token[].n`) | `rg -c -F '<token>'` | ¿Coincide? |
|---|---|---|---|
| `video-width` | 10.573 | 10.573 | ✅ |
| `video-height` | 10.573 | 10.573 | ✅ |
| `adaptive-maxwidth` | 10.573 | 10.573 | ✅ |
| `adaptive-maxheight` | 10.573 | 10.573 | ✅ |
| `adaptive-maxbitrate` | 10.573 | 10.573 | ✅ |
| `max_resolution` | 10.573 | 10.573 | ✅ |
| `max_framerate` | 10.573 | 10.573 | ✅ |
| `inputstream.adaptive.chooser_bandwidth_max` | 10.573 | 10.573 | ✅ |
| `max_bitrate` | **0** | **0** (`rg` exit 1) | ✅ |
| **Total** | **84.584** = 8 × 10.573 | `rg -c '<alternancia de los 9>'` → **84.584** | ✅ |

> **Hecho que corrige una premisa:** `inputstream.adaptive.max_bitrate` **no existe** en la lista
> de referencia (0 ocurrencias; `rg -c -F` exit 1). El cap de bitrate real es
> `#EXTVLCOPT:adaptive-maxbitrate=8000000` (10.573) y, en Kodi, `chooser_bandwidth_max` (10.573).
> El arnés no lo inventa: reporta 0 para `max_bitrate` porque no está.

Primeras evidencias citadas por el arnés (texto literal):

```text
line 231: #EXTVLCOPT:video-width=1920
line 232: #EXTVLCOPT:video-height=1080
line 279: #EXTVLCOPT:adaptive-maxwidth=7680
line 280: #EXTVLCOPT:adaptive-maxheight=4320
line 283: #EXTVLCOPT:adaptive-maxbitrate=8000000
line 329: #KODIPROP:inputstream.adaptive.max_resolution=1920x1080
line 330: #KODIPROP:inputstream.adaptive.max_framerate=60
line 400: #KODIPROP:inputstream.adaptive.chooser_bandwidth_max=8000000
```

Lectura: `adaptive-maxwidth=7680`/`adaptive-maxheight=4320` están **por encima** de la fuente
(no caparían ni leyéndose), pero `video-width=1920`, `video-height=1080`, `max_resolution=1920x1080`
y `max_framerate=60` sí piden algo distinto de la fuente — y `chooser_bandwidth_max=8000000` queda
**por debajo** del `BANDWIDTH=9000000` del mismo bloque. Por ley, **ninguno** debe sobrevivir al
master emitido: por eso G3 los marca todos y el generador de t7 los quita.

---

## 4. Gate 4 medido: el throughpass es medible y discrimina

Tres muestras de audio **reales** (codificadas con ffmpeg 8.0.1, no mocks) y lo que `ffprobe` reporta
— valores tomados de `fixtures/out/C7_audio_ac3.verify.json` y de la corrida C8/C9:

| Fixture | `codec` | `codec_rfc6381` | Perfil | Sample rate | Canales | Layout | Bitrate | Origen del bitrate | Duración | Contenedor |
|---|---|---|---|---|---|---|---|---|---|---|
| `audio/ac3_51_48k.ts` | `ac3` | **`ac-3`** | — (A/52A) | **48.000** | **6** | `5.1(side)` | **384.000** bps | `stream` | 2,016 s | `mpegts` |
| `audio/eac3_51_48k.ts` | `eac3` | **`ec-3`** | — (A/52B) | **48.000** | **6** | `5.1(side)` | **640.000** bps | `stream` | 1,984 s | `mpegts` |
| `audio/aac_st_44100.aac` | `aac` | **`mp4a.40.2`** | **LC** | **44.100** | **2** | `stereo` | **130.160** bps | `stream` | 2,026 s | `aac` |

**Discriminación (C10):** con el segmento AC-3 y `--expect-audio-codec ec-3` el gate da
`FAIL` con `codec esperado ec-3, medido ac-3 (ac3)` y exit 1. Es decir: el gate **no** es un
trámite que siempre pasa — distingue el códec real del declarado.

**Bajar audio está permitido y el arnés no lo penaliza:** C9 mide un AAC-LC **estéreo** 44,1 kHz
frente a un master que declara un grupo 5.1 `ec-3`; el gate lo reporta como `PASS` porque la ley
del operador permite downscale de audio (canales/bitrate). El arnés no convierte una decisión de
producto en un fallo técnico. `--allow-audio-downscale` deja constancia explícita en el JSON.

**Resolución del códec a forma HLS/RFC 6381:** `ac3 → ac-3`, `eac3 → ec-3`,
`aac + profile LC → mp4a.40.2`, `aac + HE-AAC → mp4a.40.5`, `aac + HE-AACv2 → mp4a.40.29`
(tabla en el código; el perfil se lee de `ffprobe`, no se asume).

### Por qué NO se usa md5 del segmento (razón, no pereza)

Un md5 dice "estos bytes son los mismos bytes". **No dice nada del audio**:

1. **Cualquier repackage cambia el md5 con audio idéntico**: pasar un segmento de MPEG-TS a fMP4
   (o re-muxear con otro muxer) altera el contenedor y con él el hash, aunque el throughpass sea
   bit a bit perfecto. Se obtendría un `FAIL` falso.
2. **Y al revés, un transcode puede colisionar**: dos encodes AAC 5.1 al mismo bitrate pueden dar
   el mismo tamaño — un md5 "parecido" no prueba que no hubo recodificación.
3. **El md5 no dice lo que la ley permite cambiar**: codec, sample rate, canales, bitrate y
   duración son exactamente los campos donde el operador autoriza bajar (audio) y donde hay que
   demostrar que no bajó nada más.

`ffprobe` mide la **esencia del stream** (invariante al contenedor) y por eso es el juez correcto.
El md5 sigue siendo válido como control de integridad de transferencia — no como prueba de
throughpass. (Razón documentada también en la cabecera de `verify_demuxed.js`.)

---

## 5. Cadena real t7 → t8 (el master que emite el generador)

```text
$ node tools/ape-demuxed/gen_demuxed_master.js \
    --in tools/ape-demuxed/examples/fixture_master_demuxed_source.m3u8 \
    --out <TEMP>/demuxed_out.m3u8 --report <TEMP>/demuxed_report.json --force
modo=master  bloques=1  STREAM-INF=1
audio: OK (in_source, 2 rendition(s))
caps de vídeo quitados: 5  limitaban=5 no_limitaban=0 indeterminado=0
violaciones de downscale: 0
exit=0 demuxed emitido

$ node tools/ape-demuxed/verify_demuxed.js <TEMP>/demuxed_out.m3u8 --source-resolution 3840x2160
verify_demuxed 1.0.0  ->  PASS_HARD_GATES  (exit 0)
  G1_structure              PASS          ok
  G2_zero_video_downscale   PASS          ok
  G3_zero_video_caps        PASS          ok
  G4_audio_throughpass      NO_COMPUTADO  no se aportó --audio-segment ni --probe-rendition…
```

El master emitido por t7 tiene: 2 `#EXT-X-MEDIA:TYPE=AUDIO` (GROUP-ID `aud`, con los 7 campos),
1 `#EXT-X-STREAM-INF` con `AUDIO="aud"` y `CODECS="hvc1.2.4.L153.B0,ec-3,mp4a.40.2"`, 3840x2160,
y **cero** líneas de cap. El arnés lo confirma de forma independiente al generador (no lee su
reporte: parsea el `.m3u8`).

---

## 6. Fail-honest: lo que queda `NO_COMPUTADO` y por qué

| Caso | Estado | Razón declarada por el arnés |
|---|---|---|
| C11 — sin `--source-resolution` | G2 `NO_COMPUTADO`, exit **2** | la resolución nativa la declara el operador; inferirla del propio master haría el gate vacuo (siempre pasaría). Sin fuente no hay prueba de cero-downscale |
| C12 — `--strict` | exit **2** | el throughpass sin segmento no es PASS: con `--strict` se convierte en bloqueo |
| C13 — rendition con URI `***` | G4 `NO_COMPUTADO` | master en modo redacted: la URI no existe como recurso, no hay nada que medir |
| C14 — dominio `.invalid` | G4 `NO_COMPUTADO` | `ffprobe exit 1: Failed to resolve hostname fx.invalid` (error literal conservado) |
| C18 — lista de referencia | G1 y G4 `NO_COMPUTADO` | la lista es **muxed** (0 `#EXT-X-MEDIA`): no hay estructura de demuxed que verificar; y no se aportó segmento de audio |
| **Throughpass del proveedor real** | `NO_COMPUTADO` | medirlo exige descargar una rendition del proveedor. Este arnés **no hace red por su cuenta**: la decisión es del operador (`--audio-segment <url>`), y el master de la lista está enmascarado (no reproducible) |
| **"El player lo aplica"** | `NO_COMPUTADO` | requiere player en ejecución y log; el arnés es estático + ffprobe |
| **"El frame cambió"** | `NO_COMPUTADO` | requiere captura y diff de frames; no hay vídeo decodificado en esta fase |

Ninguno de estos huecos se ha rellenado con una estimación: se declaran con su razón y con su
código de salida propio.

---

## 7. Artefactos y reproducción

| Artefacto | Bytes | Para qué |
|---|---|---|
| `verify_demuxed.js` | 38.990 | el arnés (4 gates) |
| `VERIFICATION.md` | 22.831 | este informe |
| `fixtures/master_ok.m3u8` | 1.492 | caso correcto (G1 7/7, G2, G3) |
| `fixtures/master_downscale_variant.m3u8` | 1.293 | variante 1080p sobre fuente 2160p ⇒ FAIL |
| `fixtures/master_cap_max_resolution.m3u8` | 1.041 | cap `max_resolution` ⇒ FAIL |
| `fixtures/master_session_data_name.m3u8` | 1.093 | `SESSION-DATA:NAME=` ⇒ FAIL |
| `fixtures/master_audio_group_missing.m3u8` | 1.041 | `AUDIO=` huérfano ⇒ FAIL |
| `fixtures/master_chooser_cap_only.m3u8` | 1.369 | cap de t10 fuera de los 8 del encargo ⇒ FAIL |
| `fixtures/audio/ac3_51_48k.ts` | 113.364 | audio real AC-3 5.1 48 kHz |
| `fixtures/audio/eac3_51_48k.ts` | 184.428 | audio real E-AC-3 5.1 48 kHz |
| `fixtures/audio/aac_st_44100.aac` | 32.971 | audio real AAC-LC estéreo 44,1 kHz |
| `fixtures/run_all_tests.js` | 8.150 | batería de 18 casos que se auto-comprueba |
| `fixtures/out/reference_list.verify.json` | 21.583 | evidencia de la corrida sobre la lista real |
| `fixtures/out/C1_master_ok.verify.json` | 7.832 | evidencia del caso correcto |
| `fixtures/out/C7_audio_ac3.verify.json` | 9.557 | evidencia del throughpass medido |

**Muestras de audio: cómo se generaron (comando exacto, ffmpeg 8.0.1).**

```bash
ffmpeg -y -v error -f lavfi -i "sine=frequency=1000:duration=2:sample_rate=48000" \
  -af "pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0" -c:a ac3  -b:a 384k -f mpegts fixtures/audio/ac3_51_48k.ts
ffmpeg -y -v error -f lavfi -i "sine=frequency=1000:duration=2:sample_rate=48000" \
  -af "pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0" -c:a eac3 -b:a 640k -f mpegts fixtures/audio/eac3_51_48k.ts
ffmpeg -y -v error -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" \
  -af "pan=stereo|FL=c0|FR=c0" -c:a aac -b:a 128k -f adts fixtures/audio/aac_st_44100.aac
```

**Reproducir todo:**

```bash
node --check tools/ape-demuxed/verify_demuxed.js
node --check tools/ape-demuxed/fixtures/run_all_tests.js
node tools/ape-demuxed/fixtures/run_all_tests.js --with-real-list      # 18/18, exit 0
node tools/ape-demuxed/verify_demuxed.js tools/ape-demuxed/fixtures/master_ok.m3u8 \
     --source-resolution 3840x2160 --help                              # ayuda completa
```

Salida por defecto: `verify_demuxed.json` en el CWD; la batería escribe en `os.tmpdir()` para no
ensuciar el repo.

---

## 8. Límites conocidos del arnés (declarados, no escondidos)

1. **No valida contenido de vídeo**: G2 compara lo **declarado** (`RESOLUTION`, `BANDWIDTH`,
   `FRAME-RATE`) contra la fuente declarada por el operador. Si el proveedor sirve 1080p y el
   master declara 2160p, el arnés no lo detecta: eso exige probe del bitstream.
2. **G3 es léxico, no semántico**: busca los 9 tokens en líneas de tag. Un cap disfrazado con otro
   nombre (p.ej. una clave ISA nueva no catalogada) no se detecta. Se mitiga con
   `cap_verdicts.json` (veredicto medido de t10) y con la lista de 8 tokens del encargo.
3. **G1 no valida que la URI de la rendition exista**: valida que el campo esté y que el grupo
   resuelva. La existencia del recurso se prueba midiéndolo (G4) o no se prueba.
4. **Un solo master por corrida**: no compara generaciones (para eso, dos JSON y un diff).
5. **ffprobe es el juez de G4**: si no está en PATH ni en `--ffprobe`, el gate es `NO_COMPUTADO`
   (no se simula el resultado).

---

## 9. Integridad de la ejecución

| Comprobación | Resultado |
|---|---|
| Lista de referencia intacta | bytes `604.593.696`, sha256 `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6`, `lastwrite` sin cambio |
| Artefactos de t7 / t10 intactos | `gen_demuxed_master.js` 80.697 B, `cap_verdicts.json` 15.063 B, `README.md`, `SECURITY.md`, `FIXES.md` — mtimes anteriores a esta tarea; no se escribieron |
| `examples/` de t7 | solo lectura (usados como entrada del caso C13 y de la cadena §5) |
| Escrituras de esta tarea | únicamente `tools/ape-demuxed/verify_demuxed.js`, `tools/ape-demuxed/VERIFICATION.md` y `tools/ape-demuxed/fixtures/**` |
| Red | el arnés no hace red; si el operador pasa una URL, la resuelve `ffprobe` (decisión del operador) |
| Git / VPS / Excel / lista | no tocados |
