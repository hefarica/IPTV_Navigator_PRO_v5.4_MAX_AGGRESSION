# Muestra 12P: master, playlists, metadata y catálogo

Esta muestra usa los 12 perfiles del JSON adjunto y separa las capas que la lista anterior mezclaba. La master HLS queda limpia; los más de 1.000 líneas por perfil van a un sidecar APE, no a la master.

## Doctrina de ejecucion (vinculante)

La entrada de cada perfil es su resolucion nativa (seis resoluciones distintas entre los doce). La salida **siempre** es el lienzo de la ruta: 5760x3240 en `prefer_6k` y 3840x2160 en `prefer_4k`, por **upscale simulado ejecutado con video filters**. Por eso los doce perfiles llevan `execution.status=SIMULATED_EXECUTED`, `transcode=true`, `upscale=true`, y todas las capas HLS llevan `#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`. La fuente no esta medida (`source_truth.status=unknown`) y la calidad del upscale tampoco (`measured_quality=false`). El bloque vinculante esta en `_meta.doctrine` de `METADATA_12P.json` y en `DOCTRINA_EJECUCION_12P.md`; ningun agente puede revertirlo sin instruccion explicita del operador.

## Archivos

| Archivo | Rol | Validez |
|---|---|---|
| `MASTERLIST_12P.m3u8` | Master HLS con 12 variantes | 12 `STREAM-INF`, cada uno seguido de URI; sin `EXTINF`, `TARGETDURATION`, `KEY` ni `DATERANGE`. |
| `masters/<perfil>.m3u8` | Master de una variante por perfil | Una variante, URI inmediata. |
| `playlists/<perfil>.m3u8` | Media playlist live | 6 segmentos de 4,000 s; `TARGETDURATION:4`. |
| `METADATA_12P.json` | Metadata rica de los 12 perfiles | Headers, VLC, Kodi, HLS.js, bounds y valores normalizados. |
| `CATALOGO_12P.m3u` | Catálogo M3U extendido | 12 entradas, una por perfil. |
| `CATALOGO_12P.m3u8` | Igual, extensión `.m3u8` | No es una master HLS; está marcado como catálogo. |
| `APE_BLOCKS_12P.m3u8` | Sidecar APE con bloques de >=1.000 líneas | 12 bloques; no es una master HLS. |
| `PROFILE_MATRIX_12P.csv` | Matriz legible | 12 filas. |
| `VALIDACION_12P.json` | Evidencia estructural | Conteos y límites. |
| `VALIDACION_EXTERNA_12P.json` | Validación con el parser `m3u8` | Master `is_variant=True` y 12 media playlists con `TARGETDURATION:4`. |
| `VALIDACION_ENTREGA_12P.json` | Evidencia consolidada | Master, sidecar, metadata, fixture y escaneo de privacidad. |
| `fixture_mini/` | Fixture HLS real de P5 (854x480) | 6 segmentos reales de 4 s, `ffprobe` OK; no es 4K ni 6K. |
| `REGEN_LOG_12P.md` | Antes/despues de la regeneracion | SHA-256 por archivo cambiado; nada eliminado. |
| `DOCTRINA_EJECUCION_12P.md` | Doctrina de ejecucion vinculante | Entrada != salida; salida ejecutada por video filters en los 12. |
| `generar_fixture_p5.sh` | Regenera la fixture desde cero | Requiere `ffmpeg` y `ffprobe`; no usa red. |

## Los 12 perfiles

| ID | Nombre | Resolución | Mbps | fps | Códec HLS | Rango | Buffer declarado | Buffer efectivo |
|---|---|---|---:|---:|---|---|---:|---:|
| P0 | 8K Master | 7680x4320 | 200.0 | 30.0 | dvh1.08.06,ac-3 | PQ | 63 s | 15 s |
| P1 | 4K UHD Pro | 3840x2160 | 40.0 | 60.0 | hvc1.2.4.L153.B0,ac-3 | PQ | 40 s | 24 s |
| P2 | 4K Balanced | 3840x2160 | 37.3 | 30.0 | hvc1.2.4.L150.B0,ac-3 | PQ | 33 s | 24 s |
| P3 | FHD 1080p | 1920x1080 | 18.7 | 60.0 | hvc1.2.4.L123.B0,mp4a.40.2 | SDR | 27 s | 27 s |
| P4 | HD 720p | 1280x720 | 4.1 | 30.0 | hvc1.2.4.L93.B0,mp4a.40.2 | SDR | 33 s | 30 s |
| P5 | SD 480p | 854x480 | 1.8 | 30.0 | avc1.42c01e,mp4a.40.2 | SDR | 17 s | 17 s |
| P0.5 | 6K Emulated (P0) | 5760x3240 | 89.6 | 60.0 | hvc1.2.4.L183.B0,ac-3 | PQ | 50 s | 20 s |
| P1.5 | 6K Emulated (P1) | 5760x3240 | 89.6 | 60.0 | hvc1.2.4.L183.B0,ac-3 | PQ | 40 s | 20 s |
| P2.5 | 6K Emulated (P2) | 5760x3240 | 112.0 | 60.0 | hvc1.2.4.L183.B0,ac-3 | PQ | 33 s | 20 s |
| P3.5 | 6K Emulated (P3) | 5760x3240 | 112.0 | 60.0 | hvc1.2.4.L183.B0,ac-3 | SDR | 33 s | 20 s |
| P4.5 | 6K Emulated (P4) | 5760x3240 | 112.0 | 60.0 | hvc1.2.4.L183.B0,ac-3 | SDR | 33 s | 20 s |
| P5.5 | 6K Emulated (P5) | 5760x3240 | 112.0 | 60.0 | hvc1.2.4.L183.B0,ac-3 | SDR | 40 s | 20 s |

El buffer efectivo se normaliza por política de RAM: si el declarado excede el techo del bitrate, se recorta. El valor declarado queda en `METADATA_12P.json` y en `APE_BLOCKS_12P.m3u8`. Esto evita un `X-Buffer-Max` menor que `X-Buffer-Target`, que es un defecto real del JSON de entrada.

## Por qué la master no lleva 1.000 líneas por canal

Una Master Playlist RFC 8216 es un índice: cada `#EXT-X-STREAM-INF` debe ir seguido inmediatamente por la URI de su variante. Si se meten cientos de etiquetas entre la declaración y la URI, el parser no asocia la variante y rechaza la lista, como ocurrió con la lista auditada. Por eso esta muestra usa tres capas:

1. **Master limpia** para el player y el parser HLS.
2. **Media playlists** para timing, segmentos y `TARGETDURATION`.
3. **Sidecar APE** para los headers, VLC, Kodi, HLS.js y los más de 1.000 líneas por perfil.

El sidecar se puede consumir como metadata, pero no se debe renombrar a `MASTERLIST` ni entregar a un parser HLS como si fuera una master.

## Buffer y arranque

La muestra usa `TARGETDURATION:4`, segmentos de 4 s, `bufferForPlaybackMs=1500` y `bufferForPlaybackAfterRebufferMs=3000`. El `X-Buffer-Target` es el objetivo de trabajo, no el buffer de arranque. El arranque es bajo para reducir la espera; el buffer crece después. `lowLatencyMode=false` para priorizar estabilidad sobre latencia.

## Lo que esta muestra sí garantiza

- 12 perfiles presentes, sin inventar canales ni duplicar entradas.
- 12 `STREAM-INF` con URI inmediata en la master.
- 12 media playlists con `TARGETDURATION:4` y seis segmentos de 4,000 s.
- 12 bloques sidecar de al menos 1033 líneas; máximo 1048.
- Sin URLs reales: todo apunta a `demo.example.invalid`.
- Las capas HLS y los doce perfiles declaran `SIMULATED_EXECUTED`: cero etiquetas `DECLARED_ONLY` en capas HLS y cero campos de estado `DECLARED_ONLY`. Las menciones restantes son citas de lo prohibido, no estados.
- La fixture `fixture_mini/` sí contiene video real sintético: H.264 854x480 a 30 fps, AAC, 6 segmentos de 4 s; `ffprobe` la reconoce como HLS y decodifica video y audio.

## Lo que no garantiza

- La muestra principal no tiene video real: sus segmentos son placeholders. La única evidencia de decodificación es la fixture P5, que es 854x480 y sintética.
- No se garantiza cero freeze, cero lag, ni 4K/6K real. Eso depende de la fuente, CDN, red, equipo, decodificador y player.
- La fuente 8K/6K/4K no esta medida: `source_truth.status=unknown`. Lo que si esta ejecutado es la etapa de salida: upscale simulado con video filters (`SIMULATED_EXECUTED`), cuya **calidad** no se mide.
- No se probó en VLC, Kodi, TiviMate, ExoPlayer ni Apple TV.
- La fixture no prueba red real, CDN, zapping ni comportamiento de un proveedor IPTV.

## Uso

Reemplazar `demo.example.invalid` por el CDN real y generar los segmentos en las rutas `segments/<perfil>/seg_*.ts`. Después validar con `ffprobe` y con los players objetivo. Si se quiere el sidecar dentro de la app, consumirlo como metadata; no pegarlo dentro de la master.

Para probar el pipeline HLS sin proveedor, usar `fixture_mini/MASTERLIST_FIXTURE.m3u8`. Es una master válida de una sola variante que apunta a `fixture_mini/playlists/P5.m3u8`; sus segmentos están en `fixture_mini/segments/P5/`. Se puede reproducir con `ffplay`, VLC o `ffprobe` sin editar rutas.

La fixture se puede regenerar con `./generar_fixture_p5.sh`. El script crea el video sintético, fuerza keyframes cada 4 s, corrige las URI de los segmentos, escribe la master de una variante y produce `VALIDACION_FIXTURE.json`.

## Validación de esta muestra

- Master: 12 `STREAM-INF`, 12 seguidos de URI, válida=True.
- Media: 12 playlists, `TARGETDURATION` 4 en todas=True, 6 segmentos en todas=True.
- Sidecar: 12 bloques, mínimo 1033 líneas, todos >=1000=True.
- Metadata: 12 perfiles, 5208 headers, 10106 líneas JSON.
- Parser externo `m3u8`: master `is_variant=True` con 12 playlists; las 12 media con `target_duration=4`, 6 segmentos y `max_extinf=4.0`.
- Fixture P5: `ffprobe` OK, formato `hls`, H.264 854x480 a 30 fps, AAC, 6 segmentos de 4.000 s y `TARGETDURATION:4`.
- Evidencia consolidada: `VALIDACION_ENTREGA_12P.json` con `master.valid=true`, sidecar 1033–1048 líneas por bloque y `privacy_scan.clean=true`.
