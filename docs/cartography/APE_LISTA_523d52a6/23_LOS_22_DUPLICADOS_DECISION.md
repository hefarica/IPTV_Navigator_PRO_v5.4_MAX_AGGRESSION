# Los 22 duplicados: quién emite, qué se lee, cuál es el óptimo y qué hacer

**Base:** `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` ·
**Metadata medida:** `APE_LISTA_1793589060441.m3u8`, `ape-lab-metadata-v1`, perfil P0.

---

## 0 · La regla que decide todo, encontrada en el código

El generador aplica las capas **en este orden**, todas con `upsert*` (el último que escribe gana):

| # | Capa | Línea |
|---|---|---|
| 1 | `optimized_knobs` | 10661 |
| 2 | `player_enslavement.level_3_per_channel` | 10717 |
| 3 | `actor_injections.player.exoplayer` | 10727 |
| 4 | `actor_injections.player.hlsjs` | 10749 |
| 5 | `actor_injections.panel` | 10769 |
| 6–9 | `actor_injections.{kodi,os,network,iptv_server}` | 10787–10824 |
| 10 | `actor_injections.player.vlc` | 10841 |

Y el propio autor lo dice en el comentario del paso 1c (L10699):

> «Aplicados ANTES de level_3_per_channel y actor_injections para que ellos puedan overridear»

**Dos objetos son DATO MUERTO — el generador no los lee nunca:**

```
grep "labProfile.settings"  ->  0 ocurrencias   (70 claves)
grep "labProfile.hlsjs"     ->  0 ocurrencias   (41 claves)
```

Los `#EXT-X-APE-HLSJS:` que sí salen vienen de `APE_PROFILE_MATRIX` (L10587), la tabla hardcodeada.

---

## 1 · Los 22, uno por uno

**L** = ¿lo lee el generador? · **Decisión**: DEJAR / CORREGIR / REMOVER

| # | Parámetro | Valores en el JSON | **Emitido (gana)** | Por qué | Óptimo | L | Decisión |
|---|---|---|---|---|---|---|---|
| 1 | `bufferSeconds` | `settings`=15 · `knobs`=50 | **50000 ms** → pisado a **105000** | L10664 `buffer_seconds*1000`, luego L10720 | 15000 | knobs sí / settings no | **CORREGIR**: `knobs.buffer_seconds`=15 |
| 2 | `peakLuminanceNits` | `settings`=10000 ×2 · `panel`=4000 | **4000** | L10775 `X-HDR-PEAK-LUMINANCE` | 4000 | panel sí | **DEJAR** |
| 3 | `networkCachingMs` | `settings`=15000 · `actor.vlc`=105000 | **105000** | L10846, último de la cadena | 15000 | actor sí | **CORREGIR** |
| 4 | `prefetchSegments` | `settings`=6 · `prefetch_config`=12 | **12** | L1634 `pf.prefetch_segments` | 12 | prefetch sí | **DEJAR** |
| 5 | `maxLiveSyncPlaybackRate` | 15, 15, 1.25, 1.25, 1.25 | **1.25** | L10692 + L10760 | 1.25 | sí | **DEJAR** |
| 6 | `network-caching` | `vlcopt`=15000 · `L3`=105000 | **105000** | L10720 pisa a `vlcopt` | 15000 | sí | **CORREGIR** |
| 7 | `live-caching` | 15000 · 105000 | **105000** | L10720 | 15000 | sí | **CORREGIR** |
| 8 | `file-caching` | 20000 · 105000 | **105000** | L10720 | 20000 | sí | **CORREGIR** |
| 9 | `http-max-retries` | 99 · 350 | **350** | L10673, L10720 | 350 | sí | **DEJAR** |
| 10 | `http-timeout` | 5000 · 30000 | **30000** | L10720 | 30000 | sí | **DEJAR** |
| 11 | `sout-mux-caching` | 20000 · 105000 | **105000** | L10720 | 20000 | sí | **CORREGIR** |
| 12 | `network-reconnect-count` | 99 · 350 | **350** | L10674, L10720 | 350 | sí | **DEJAR** |
| 13 | `DNT` | `headers`=0 · `L3.EXTHTTP`=1 | **1** | L10722 `upsertExthttp` | 1 | sí | **DEJAR** |
| 14 | `maxBufferLength` | `hlsjs`=50 · `actor.hlsjs`=105 | **105** | L10753 | 105 | actor sí | **DEJAR** |
| 15 | `maxMaxBufferLength` | 50 · 210 | **210** | L10754 | 210 | actor sí | **DEJAR** |
| 16 | `abrBandWidthFactor` | `hlsjs`=95 · `knobs`=0.85 · `actor`=0.85 | **0.85** | L10689 + L10737 | 0.85 | sí | **DEJAR** |
| 17 | `nudgeOffset` | `hlsjs`=1 · `actor.hlsjs`=0.1 | **0.1** | L10758 | 0.1 | actor sí | **DEJAR** |
| 18 | `nudgeMaxRetry` | 10, 13, 13, 13 | **13** | L10686 + L10757 | 13 | sí | **DEJAR** |
| 19 | `highBufferWatchdogPeriod` | 1 · 3 | **3** | L10756 | 3 | actor sí | **DEJAR** |
| 20 | `maxFragLookUpTolerance` | 25 · 0.25 | **0.25** | L10759 | 0.25 | actor sí | **DEJAR** |
| 21 | `pq_ai_dnr_enable` | global=1 · deportes=0 | **1 global, 0 deportes** | override por categoría | 1 / 0 | sí | **DEJAR** (no es contradicción) |
| 22 | `pq_dnr_enable` | global=1 · deportes=0 | **1 global, 0 deportes** | idem | 1 / 0 | sí | **DEJAR** (no es contradicción) |

**Recuento (recalculado por lab_metadata_decode.js, no a mano): 16 DEJAR · 5 CORREGIR · 0 NO_EMITIDO.**

---

## 2 · Los 5 que hay que corregir, y por qué

Todos son el mismo número: **105000 ms = 105 segundos de caché**. Llega a VLC como
`#EXTVLCOPT:network-caching=105000`.

**Para IPTV en directo eso son 105 s de latencia respecto a la emisión.** Y el propio código lo tiene
documentado como intencional (L11474: «105 s en el LAB vigente»), así que no es un bug: es una decisión
que se coló en 6 claves.

El óptimo es **15000** porque es el valor que el repo ya usa en dos sitios independientes y coherentes:

- `vlcopt['network-caching']` = 15000 (la capa que el LAB escribe)
- `APE_PROFILE_MATRIX` P4 = 30000, P5 = 10000 (la tabla del generador)

**Por qué 15000 y no otro:** 15 s cubre un bache de red de 15 s sin cortar imagen, y mantiene la latencia
en un rango que el usuario no percibe como «voy por detrás del directo». 105 s no.

**Qué corregir exactamente:** en el LAB, la capa 2 (`player_enslavement.level_3_per_channel.EXTVLCOPT`)
y la capa 10 (`actor_injections.player.vlc.network_caching_ms`) deben llevar 15000 en las cuatro claves
de caché y 15000 en el `network_caching_ms`. `http-max-retries=350` y `http-timeout=30000` se quedan: esos
son anti-freeze y están bien.

---

## 3 · Los dos objetos MUERTOS: qué hacer con ellos

`fields.settings` (70 claves) y `fields.hlsjs` (41 claves) no se leen. **No los removería del schema**
—el decodificador los usa para auditar— pero sí hay que tratarlos por lo que son:

**No los remueve nadie porque no hacen daño; el daño es que ENGañAN.** Alguien ajusta
`fields.hlsjs.abrBandWidthFactor` esperando mover hls.js y no pasa nada. Ocho de los 22 duplicados son
ruido por esta única causa: cualquier valor escrito ahí es una opinión, no una configuración.

**Acción:** que el generador **emita `#EXT-X-APE-LAB-DEAD:settings,hlsjs`** para que el VPS y el propio
decodificador sepan qué partes del JSON no tienen efecto. Sin eso, la metadata miente por omisión.

---

## 4 · Lo que este análisis NO prueba

- **No medí latencia real** con 105 s frente a 15 s. Sé qué valor se emite; el «óptimo» es criterio
  técnico (cubre baches sin latencia perceptible), no una medición de arranque por canal.
- **No leí todos los consumidores.** Verifiqué `upsertVlcopt`/`upsertKodiprop`/`upsertExthttp` y su orden
  de llamada; puede haber otra ruta de emisión que no vi.
- **`peak_luminance_nits`=4000** lo considero correcto por rango HDR habitual (1000–4000 nits). No medí
  el mastering display real del contenido.
- **Los `bounds` del LAB** dicen `buffer` ∈ [105,315] s, o sea que el propio límite pide 105 s o más. Si
  el óptimo es 15 s, **los bounds están mal, no el knob.** Eso es una corrección de calibración que
  requiere decisión del propietario.
