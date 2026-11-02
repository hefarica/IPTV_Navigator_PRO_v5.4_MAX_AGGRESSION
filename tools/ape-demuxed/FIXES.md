# FIXES.md — t9: tres huecos cerrados sobre `gen_demuxed_master.js`

**Entrada:** `tools/ape-demuxed/gen_demuxed_master.js`
**Muestra de validación:** `scratch/avisynth_probe_2026/live_corrected/sample_in.m3u8` (1.165 líneas = cabecera + **1** bloque)
**Lista de referencia (corrida completa):** `APE_LISTA_1793589060441.m3u8` · 604.593.696 B · sha256 `523d52a6…5049d6`

> **AVISO DE SCOPE (heredado de t10) — no mezclar números.**
> `scratch/avisynth_probe_2026/live_corrected/report.json` es la corrida sobre una **muestra de 1 bloque**
> (141 KB de entrada). Los **74.011 / 84.584** caps son de la corrida **completa** sobre los **604 MB**.
> Son dos scopes distintos y **no** son comparables entre sí. En este documento, cada cifra declara su scope.

---

## HUECO 1 (CRÍTICO, seguridad) — `--mask-credentials` no enmascaraba el URI del canal

### Diagnóstico: eran DOS defectos, no uno

| # | Defecto | Evidencia |
|---|---|---|
| **B1** | El enmascarado **nunca** se aplicaba al cuerpo emitido. `maskCredentials()` solo se usaba dentro de `buildMediaLine()` (URIs de `#EXT-X-MEDIA`). El URI del canal se escribía con `write(line)` verbatim. | `sample_out.m3u8` conservaba `/live/<user>/<pass>/3.m3u8` **sin un solo cambio**, con `mask_credentials: true` en el reporte. |
| **B2** | El enmascarador estaba **mal** para rutas Xtream con prefijo: cogía los dos **primeros** segmentos de la ruta, no el par usuario/password. | Medido: `maskCredentials("http://h/live/USERX/PASSX/3.m3u8")` devolvía `http://h/***/***/PASSX/3.m3u8` → **la contraseña quedaba expuesta**. |
| **B1b** | Mi fixture de t7 **ocultó** B2: sus URIs ya venían con dos segmentos `***`, y la guarda de idempotencia hacía `skip` justo cuando el bug se habría visto. | Un fixture pre-enmascarado no prueba el enmascarador. Es un error de método mío, no del fixture. |

**Corolario honesto:** el hueco reportado (B1) era el síntoma visible; al arreglarlo habría aparecido B2 y la
contraseña habría seguido saliendo. Arreglar solo B1 no habría cerrado nada.

### Fix

1. **Enmascarador segment-aware** (`maskCredentials`): localiza el par usuario/password **por la forma de la
   ruta**, saltando prefijos estructurales (`live`, `movie`, `series`, `vod`, `audio`, `hls`…), sin tocar
   segmentos ya enmascarados ni palabras estructurales. Idempotente (aplicarla dos veces da lo mismo).
2. **Se aplica al cuerpo completo**: cada línea que se escribe pasa por el enmascarador, no solo `#EXT-X-MEDIA`.
3. **Dos modos con marker y semántica propia** (ver `SECURITY.md`):
   - `--redact-credentials` (alias `--mask-credentials`) → marker `# APE-SENSITIVE: redacted, NOT playable`,
     `playable: false`.
   - default → marker `# APE-SENSITIVE: contains credentials, DO NOT DISTRIBUTE`, `playable: true`,
     `sensitive: true`.
4. **Gate por modo, NUNCA universal**: en redactado se verifica un invariante de idempotencia (un fallo ahí
   es un **defecto del programa**, exit 1); en default el gate es **de RUTA** y ocurre en el **preflight**
   (exit 6). En default **no** se evalúa el contenido de la URI: evaluarlo empujaría a entregar una lista
   rota — un hash en el path da **404 al arrancar el canal**.

### Evidencia de la corrida

Fixture nuevo `examples/fixture_t9_credentials.m3u8` con credencial **sintética y visible**
(`USUARIO_SINTETICO` / `PASSWORD_SINTETICA`, dominio `.invalid`):

| Modo | exit | marker en la salida | URI emitido | credenciales sintéticas en la salida |
|---|---|---|---|---|
| default | 0 | `# APE-SENSITIVE: contains credentials, DO NOT DISTRIBUTE` | `…/live/USUARIO_SINTETICO/PASSWORD_SINTETICA/3.m3u8` (intacto) | **2** (esperado: es reproducible) |
| `--redact-credentials` | 0 | `# APE-SENSITIVE: redacted, NOT playable` | `…/live/***/***/3.m3u8` | **0** |

Reporte: `playable=true, sensitive=true, distribution=DO-NOT-DISTRIBUTE` vs
`playable=false, sensitive=false, lines_masked=2`.

Prueba negativa (el bug, fijada): el mismo fixture por la ruta vieja habría dejado `PASSWORD_SINTETICA`.
Ahora la salida redactada tiene **0** coincidencias.

---

## HUECO 2 — `audio_eac3=false` no se reactivaba

### Hecho medido que lo justifica

La lista **apaga** `inputstream.adaptive.audio_eac3` mientras su propia
`audio_codec_priority=eac3,ac3,aac,mp3` lo pone **primero**. Medido en la muestra:
`L177 audio_codec_priority=eac3,ac3,aac,mp3` · `L344 audio_eac3=false`. En la lista completa:
`audio_eac3=false` en **10.573/10.573** canales. Apagar el códec que se declara preferir es una
contradicción, y el operador aprobó reactivarlo.

### Fix

Flag `--enable-audio-passthrough` (alias `--enable-eac3`). Para
`audio_{eac3,ac3,dolby_atmos,dts,truehd}=false`:

- si el códec está en la **prioridad declarada** → **se elimina la línea** (ausencia = habilitado), y se
  reporta con qué token casó;
- si **no** está en la prioridad → **se deja intacta** y se reporta como `left_not_in_priority`;
- si ya es `true` → no se toca;
- **sin flag → no se toca nada.**

`audio_eac3` es **booleano**: se compara con `"false"`, **no** numéricamente (un `=\d+` sobre
`max_resolution=1920x1080` deja `x1080` huérfano; ese error de patrón no se comete aquí).

Mapeo declarado y auditable: `audio_dolby_atmos → ['atmos','eac3','ec-3']` porque Atmos viaja sobre DD+.
Cuando casa por `eac3`, el reporte lo dice en `matched_token`.

### Evidencia (`examples/fixture_t9_audio_passthrough.m3u8`)

| | con `--enable-audio-passthrough` | sin flag |
|---|---|---|
| `reactivated_total` | **2** (`audio_eac3`, `audio_dolby_atmos`) | 0 |
| `left_total` | **2** (`audio_dts`, `audio_truehd`) | 0 |
| `priority_source` | `per_channel` (`eac3,ac3,aac,mp3`) | — |
| `^#KODIPROP:…audio_eac3=` en la salida | **0** | **1** (intacta) |

Sobre la muestra real `sample_in.m3u8` (1 bloque): `reactivated=2` (eac3 vía token `eac3`, atmos vía token
`eac3`), `left_not_in_priority=2` (dts, truehd), `priority_source=global_header`.

---

## HUECO 3 — 7 candidatos a cap sin veredicto

### Fix: consumir `cap_verdicts.json` (t10), sin traducir ni re-litigar

Al cargar reglas se **anexa** `cap_verdicts.json.prohibited[]` a `VIDEO_CAP_RULES` (misma forma:
`{tag,key,kind,effect}`). Además, el reporte emite **veredicto explícito para los 7** del fichero,
consumido de `verdicts[]` — el generador **no** adjudica por su cuenta.

`inert_removable[]` e `indeterminado[]` **no se tocan** (instrucción de capitán): son opcionales y
NO_COMPUTADO respectivamente.

| Candidato | veredicto (t10) | presente | eliminado por el generador |
|---|---|---|---|
| `#KODIPROP:…chooser_bandwidth_max` | **`cap_de_video`** | 10.573 | **SÍ** |
| `#KODIPROP:…max_buffer_duration` | `indeterminado` | 10.573 | no (conservada) |
| `#KODIPROP:…preferred_video_resolution` | `inocuo_para_vlc` | 10.573 | no (conservada) |
| `#EXTVLCOPT:adaptive-bandwidth-factor` | `inocuo_para_vlc` | 10.573 | no (conservada) |
| `#EXTVLCOPT:adaptive-maxbw` | `inocuo_para_vlc` | 10.573 | no (conservada) |
| `#EXTVLCOPT:video-fps` | `inocuo_para_vlc` | 10.573 | no (conservada) |
| `#EXTVLCOPT:video-display-fps` | `inocuo_para_vlc` | 10.573 | no (conservada) |

Resumen del reporte: `{"cap_de_video":1,"inocuo_para_vlc":5,"indeterminado":1}` — **7/7, ninguno sin veredicto.**

### El cap real que t7 dejó vivo (dato de t10)

`chooser_bandwidth_max = 8000000` en 9.765 canales y `19800000` en 808. Es propiedad **documentada** de
ISA ("maximum stream bandwidth … bit/s") y queda **por debajo** del `BANDWIDTH` del mismo bloque en
**10.573/10.573** canales. Ese sí muerde en Kodi; por eso se elimina y no se deja como candidato.

### Evidencia

`examples/fixture_t9_cap_candidates.m3u8`, verificado con **patrones anclados al tag** (no al comentario —
los comentarios del propio fixture contienen los nombres y producían falsos positivos):

```
^#KODIPROP:…chooser_bandwidth_max=        -> 0  (eliminada)
^#KODIPROP:…max_buffer_duration=          -> 1  (conservada)
^#KODIPROP:…preferred_video_resolution=   -> 1  (conservada)
^#EXTVLCOPT:adaptive-bandwidth-factor=    -> 1
^#EXTVLCOPT:adaptive-maxbw=               -> 1
^#EXTVLCOPT:video-fps=                    -> 1
^#EXTVLCOPT:video-display-fps=            -> 1
```

Corrida completa (604 MB, `--report-only`, 11,6 s):

| Métrica | Valor |
|---|---|
| Caps eliminados | **84.584** = **74.011** (reglas t7) + **10.573** (`cap_verdicts.json`) |
| `caps_removed_by_rule_source` | `{"t7-VideoCapRules":74011,"cap_verdicts.json":10573}` |
| Limitaban de verdad | 52.434 = 41.861 + 10.573 |
| No limitaban | 32.150 |
| Violaciones downscale | 0 |

**Los 10.573 nuevos son exactamente el `lines_removed_if_prohibited_applied` que t10 declaró.** Coincide.

---

## Decisión de capitán sobre los códigos de salida (citada)

El capitán corrigió su propia especificación: **no se renumera un código ya documentado y probado cuando
existe uno libre.**

- `3` **se queda** como `VIDEO_DOWNSCALE_VIOLATION`. Ya está en la cabecera del script, en el README y en una
  corrida real. Moverlo convertiría una garantía en una **regresión silenciosa** para cualquier consumidor
  que lo lea (t8, checklists del operador, trazabilidad de corridas). **Sumar es aditivo; renumerar no.**
- El gate de ruta es una **clase de fallo distinta**: rechazo de política/seguridad **antes** de escribir
  (preflight), no una validación de contenido. Merece **código propio: 6**.
- Un gate automático que vea `3` debe poder afirmar "hubo downscale" sin ambigüedad. Con `6` lo consigue.

**Tabla final:**

| Código | Significado |
|---|---|
| 0 | OK |
| 1 | `INTERNAL_INVARIANT` — defecto del programa (fuera de la tabla de política) |
| 2 | `AUDIO_NO_COMPUTADO` |
| 3 | `VIDEO_DOWNSCALE_VIOLATION` (sin cambios desde t7) |
| 4 | `INPUT_MISSING` |
| 5 | `INVALID_EVIDENCE` |
| 6 | `OUTPUT_PATH_INSIDE_REPO` (gate de ruta, preflight) |
| 7 | **reservado — no usar** |
| 8 | `OUTPUT_EXISTS` — el destino ya existe y no se pasó `--force` |

Sobre `fs.openSync(path,'wx')`: **sí se usa** (`flags:'w'` sólo con `--force`). Un `EEXIST` es una
**colisión de destino**, no un rechazo de política: devuelve **8**, nunca 6. El 6 queda con un solo
significado. `--force` permite la sobrescritura legítima.

Evidencia: 1.ª corrida exit 0 · 2.ª sin `--force` **exit 8 y hash del fichero intacto** · 3.ª con `--force`
exit 0 y contenido idéntico.

---

## Lo que NO se cerró (fail-honest)

1. **No se verificó reproducción real** de ninguna salida en VLC/ExoPlayer/hls.js/Kodi. Todo lo afirmado es
   forma del manifiesto, no runtime.
2. **`preferred_video_resolution` y `max_buffer_duration`**: se consume el veredicto de t10
   (`inocuo_para_vlc` / `indeterminado`); este generador **no** los re-evalúa. `max_buffer_duration` sigue
   en NO_COMPUTADO por t10: no es vídeo y no hay evidencia para tocarlo — se conserva.
3. **La existencia real de una URI de audio no se comprueba por HTTP.** El generador no hace red; rechaza
   placeholders y exige que el operador declare la evidencia. La garantía es del operador.
4. **`strace`/`inotifywait` no existen en este host** (Windows): no se promete esa evidencia. La prueba de
   preflight es la de tres partes de `SECURITY.md` §3.
5. **El demo de 1 bloque no extrapola**: `sample_in.m3u8` tiene 1 canal; los conteos por canal de la lista
   completa están en el reporte de 604 MB, y ambos scopes se declaran por separado.
