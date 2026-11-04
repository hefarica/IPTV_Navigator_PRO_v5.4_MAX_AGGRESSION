# Auditoría end-to-end de los campos del perfil P3

**Fecha:** 2026-11-04 · **Lista auditada:** `APE_LISTA_1793589060441_441VISUAL.m3u8`
**Método:** canal 1 de la lista real (974 líneas) contrastado contra los 16 campos del panel P3.

## Resultado: 1 campo correcto de 16

| # | Campo panel | Valor panel | Directiva en la lista | Veredicto |
|---|---|---|---|---|
| 1 | Resolución | FHD 1920x1080 | `adaptive-maxwidth=7680` / `maxheight=4320` | **FALLA** |
| 2 | Códec | AV1 (Eco Max) | `CODECS="hvc1.2.4.L123.B0"` | **FALLA** |
| 3 | FPS | 61 | `FRAME-RATE=30.000` | **FALLA** |
| 4 | Buffer base | 8 s | `adaptive-maxbuffer=55000` | **FALLA** |
| 5 | Estrategia | Adaptative | no emitida | **FALLA** |
| 6 | BITRATE | 14,9 Mbps | `adaptive-maxbitrate=8000000` | **FALLA** |
| 7 | BITRATE FLOOR | 5 Mbps | `adaptive-minbitrate=8000000` | **FALLA** |
| 8 | THROUGHPUT T1 | 19,4 | `X-APE-THROUGHPUT-T1` ausente | **FALLA** |
| 9 | THROUGHPUT T2 | 23,8 | `X-APE-THROUGHPUT-T2` ausente | **FALLA** |
| 10 | BUFFER TOTAL | 26667 | suma C1+C2+player | derivado |
| 11 | PLAYER BUFFER | 10667 | `file-caching=55000` | **FALLA** |
| 12 | HEADERS COUNT | 200 | 1 bloque `#EXTHTTP` | indeterminado |
| 13 | CLOCK JITTER | 1000 | `clock-jitter` ausente | **FALLA** |
| 14 | CLOCK SYNCHO | 1 | `clock-synchro=1` | **OK** |
| 15 | BUFFER C1 | 8000 | `network-caching=55000` | **FALLA** |
| 16 | BUFFER C2 | 8000 | `live-caching=55000` | **FALLA** |

## Causa raíz 1 — el `localStorage` no coincide con el panel

`ape-profiles-config.js` lee `localStorage['ape_profiles_v9']` (L4531) y `getProfile()` devuelve
`this.profiles[profileId]` (L5473). El panel y el generador leen **la misma clave**, pero los valores
que la lista revela para P3 son:

```
resolution         = 7680x4320   ← el panel muestra 1920x1080
bitrate            = 8000 kbps   ← el panel muestra 14,9 Mbps
bitrate_floor_mbps = 8           ← el panel muestra 5
buffer_seconds     = 55 s        ← el panel muestra 8 s
```

**Conclusión:** el perfil guardado en el navegador difiere del que el panel muestra. O el panel
renderiza los defaults del código mientras el storage tiene otra cosa, o hay dos escrituras en
competencia. **No lo afirmo sin leer el `localStorage` real** — hace falta abrir la UI con Chrome.

## Causa raíz 2 — cuatro hardcodes que ignoran el perfil

| Línea | Código | Efecto |
|---|---|---|
| **L3650** | `clampFallback = (val) => Math.max(30000, Math.min(val \|\| 30000, 60000))` | **piso de 30 s**: un perfil de 8 s emite 30000 |
| **L3658** | `clock-synchro=1` literal | ignora `cfg['clock-synchro']` |
| **L9114** | `adaptive-maxbitrate=${_bw796}` | usa `_bw796`, no el bitrate del perfil |
| **L9115** | `adaptive-minbitrate=${_minBw796}` | usa `_bitrateFloor`, que sale 8 Mbps |
| **L10740** | `bufMs = (opt.buffer_seconds \|\| 0) * 1000` | el buffer viene de `optimized_knobs` del LAB, no del panel |
| **L8760** | `_res796 = _probeData?.resolution \|\| cfg.resolution` | si el probe trae 8K, el perfil se ignora |

## Lo que sí está bien

- **`clock-synchro=1`** llega y coincide con el panel.
- **`BUFFER TOTAL`** es la suma de C1+C2+player, coherente con la definición del panel.
- **`RESOLUTION` del STREAM-INF** ya toma el bitrate del perfil tras el fix `6acf43cb`, pero la
  resolución sigue viniendo de `_res796`, no de `cfg.resolution`.

## Qué hay que hacer

1. **Leer el `localStorage` real** con Chrome headless y compararlo campo por campo con lo que
   renderiza el panel. Sin eso, cualquier corrección es a ciegas.
2. **Eliminar el piso de 30 s de `clampFallback`** (L3650) o ampliarlo para que respete el perfil.
3. **Hacer que `clock-synchro` lea `cfg`** en vez del literal (L3658).
4. **Que `adaptive-maxbitrate`/`minbitrate` usen `cfg.bitrate` y `cfg.bitrate_floor_mbps`**
   (L9114-9115), igual que se corrigió el `BANDWIDTH` del STREAM-INF.
5. **Que `_res796` prefiera `cfg.resolution`** sobre el probe cuando el perfil manda (L8760).

## Lo que esta auditoría NO afirma

- **No verifiqué el `localStorage` real.** Los valores de P3 que aparecen arriba están **deducidos**
  del contenido de la lista, no leídos del navegador.
- **No sé si el panel muestra los defaults del código o valores editados.** Los defaults del config
  (L2140-2149 para P3) son `buffer=12000, t1=12.0, t2=15.0, playerBuffer=30000, headersCount=233,
  bufferSeconds=12` — **tampoco coinciden con el panel** (8 s / 19,4 / 23,8 / 10667 / 200).
- **La lista `_441VISUAL` se generó antes del fix `6acf43cb`**, así que el `BANDWIDTH` que muestra
  (8000000) no refleja el código actual.
