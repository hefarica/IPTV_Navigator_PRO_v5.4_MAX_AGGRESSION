# Upscaling 4K/8K en el VPS: ingeniería inversa de lo que ya existe y diseño real

> Sesión **2026-10-24**. Evidencia: código en `IPTV_v5.4_MAX_AGGRESSION/vps/` y
> `frontend/vps/cmaf_engine/`, mapa de módulos en `docs/VPS_LUA_MODULE_MAP.md`,
> mediciones HTTP/DNS/TLS en `docs/VPS_MATURITY_AND_SLO_PLAN.md`. **No se desplegó nada.**

## 1. Ingeniería inversa: qué se hizo realmente con FFmpeg

Hay **dos** pipelines FFmpeg distintos en el repo y hacen cosas muy diferentes:

### 1.1 `vps/cmaf_worker.php` — REMUX, no transcode

Comando construido (líneas 127-184):

```
ffmpeg -hide_banner -loglevel warning -probesize 10000000 -analyzeduration 10000000 \
  -fflags +genpts+discardcorrupt -err_detect ignore_err -avoid_negative_ts make_zero -max_delay 0 \
  -f mpegts -i pipe:0 \
  -map 0:v:0? -map 0:a:0? \
  -c:v copy -c:a copy \                ← ★ CERO recodificación
  -bsf:v h264_mp4toannexb -tag:v avc1 \
  -bsf:a aac_adtstoasc -tag:a mp4a \
  -b:v {targetKbps}k \
  -movflags +frag_keyframe+empty_moov+default_base_moof -max_muxing_queue_size 9999 \
  -muxdelay 0 -muxpreload 0 \
  -f dash -min_seg_duration {us} -use_timeline 1 -use_template 1 \
  -window_size 10 -extra_window_size 20 -single_file 0 \
  -init_seg_name 'init-$RepresentationID$.m4s' \
  -media_seg_name 'chunk-$RepresentationID$-$Number%05d$.m4s' \
  -hls_playlist 1 -hls_master_name master.m3u8 -hls_segment_type fmp4 manifest.mpd
```

`-c:v copy -c:a copy` = **los píxeles no se tocan**. Esto es repaquetado TS → fMP4/CMAF/DASH,
CPU ≈ 0, y es lo que daba "buenos resultados" de estabilidad: el mismo bitstream, en un contenedor
más moderno, con segmentos de 6 s y ventana deslizante.

### 1.2 `frontend/vps/cmaf_engine/modules/cmaf_packaging_engine.php` — recodifica, **pero no escala**

- `$baseEncoder = ($this->lcevcBase === 'hevc') ? 'libx265' : 'libx264'` (línea 212)
- `-c:v:N $codecLib`, `-b:v:N {bitrate}k`, `-base_params "preset=medium:tune=zerolatency"` (220)
- **No hay ningún `-vf scale=` ni `-s`** en el archivo.

Conclusión: recodifica a la **misma resolución**. Ni el worker ni el packaging engine hacen
upscaling de píxeles. `preset=medium` a 4K en CPU es además ~0.1-0.2× tiempo real: inviable.

### 1.3 De dónde salía entonces el "4K"

`vps/nginx/lua/ape_virtual_4k.lua` (cargado por `combined_body_filter.lua`, así que **sí está activo**
de forma transitiva):

```lua
-- línea 21
variant.tag = variant.tag:gsub("RESOLUTION=%d+x%d+", "RESOLUTION=3840x2160")
-- línea 14 (default)
local vcodec = opts.codec or "hvc1.2.4.L153.B0"
-- línea 33 (si with_hdr)
variant.tag = variant.tag .. ",HDR=PQ,VIDEO-RANGE=PQ,COLOR-PRIMARIES=9,TRANSFER-CHARACTERISTICS=16,..."
-- línea 65
table.insert(new_lines, "#EXT-X-APE-UHDX-UPSCALER:" .. tostring(upscaler))
```

Y los "upscalers" que inyecta son **shaders de dispositivo**, no códecs de servidor:
`Anime4K`, `FSRCNNX`, `AdaptiveSharpen`, `ESPCN-L4`, `FSRCNN`, `Lanczos`
(`vps/ape-uhdx/visual_profiles.json`), con el propio perfil diciendo
`"upscaler": "device_sr_or_lanczos_if_transcoded"` y `"no_public_virtual_4k"`.

**Veredicto de la ingeniería inversa:** el "480/720 → 4K" que se vio bonito **no se generó en el VPS**.
El VPS (a) remuxeaba sin tocar píxeles y (b) **declaraba** 3840x2160 + un hint de upscaler. El upscale
real lo hizo **el TV / el SoC del dispositivo** (AI-SR por hardware, o shaders en mpv/VLC). Eso explica
que los resultados fueran buenos sin que hubiera transcode alguno en el servidor.

## 2. Mapa completo de módulos Lua (resumen)

Detalle por módulo en **`docs/VPS_LUA_MODULE_MAP.md`** (generado automáticamente; JSON en
`_storage_dump/lua_map.json`).

| Métrica | Valor |
|---|---:|
| Módulos Lua (todos, incluyendo snapshots y borradores) | **49** |
| Árbol vivo | 28 |
| Snapshots históricos (`vps-live-snapshot-*`, `baseline-live`, `production_mirror`, `buffer-governor`) | 13 |
| Borradores `.lua` en la raíz | 8 |
| Líneas totales | **8 660** |
| Cableados en `.conf` (árbol vivo) | 15 de 28 |
| **Muertos de verdad** (sin `.conf` y sin `require` de nadie) | **6 módulos / ~554 LOC** |

Módulos muertos confirmados (nadie los referencia): `sentinel_auth_guard.lua` (174),
`bw_adaptive_floor.lua` (151), `ape_profile_resolver.lua` (85), `shield_follow_302.lua` (63),
`ape_wake_on_manifest.lua` (42), `follow_redirect.lua` (39).

Cableado transitivo verificado por `require`: `combined_body_filter.lua` →
`ape_codec_cascade`, `ape_uhdx_score`, `ape_virtual_4k`; `reactor_tick.lua` → `qm_apply_worker`;
`bandwidth_reactor`/`decision_engine` → `lab_config`.

## 3. ¿Se puede upscalear de verdad en el VPS? Los números

Para 480p → 2160p30: 8,29 Mpx/frame × 30 fps = **249 Mpx/s** de codificación sostenida. Eso es lo caro
(decodificar 480p es trivial; codificar 4K no).

| Plataforma | 4K30 HEVC realtime (1 canal) | Canales concurrentes | Veredicto |
|---|---|---|---|
| Hetzner CPX21 (3 vCPU AMD EPYC) | libx265 ultrafast ≈ 8-12 fps → **0,3-0,4×** | **0** | **imposible** |
| 8 vCPU dedicados (CCX) | ultrafast ≈ 0,7-1,0× | 0-1 con suerte | frágil, se cae al primer pico |
| GPU NVIDIA T4 (1 NVENC) | NVENC sí, pero calidad preset p1 | 1-2 | viable puntual |
| GPU NVIDIA L4 / A10 | NVENC + NVDEC | 2-4 | viable para "mis canales" |
| 23 833 canales del catálogo | — | **×1000 del hardware necesario** | **imposible** |

Ancho de banda: 4K HEVC a 18-25 Mbps **por espectador**. 10 concurrentes = 180-250 Mbps de egress
sostenido, más el ingest de las fuentes. Eso es tráfico real de un servidor con puerto de 1 Gbit
compartido en la mayoría de planes.

Latencia: cualquier transcode añade ≥1 GOP de buffer. Con GOP 1 s + LL-HLS + CMAF: **3-5 s
glass-to-glass**, y no se puede bajar de ahí porque hay que codificar antes de servir. Sumado al
handshake medido de 740 ms al VPS, un 4K transcodeado **empeora** la experiencia frente a la URL directa.

### Sobre 8K: rechazo técnico, no pereza

- Ningún decoder de player IPTV de consumo (ExoPlayer/hls.js/TiviMate/OTT) acepta 8K hoy.
- El techo documentado del ecosistema es `L153` = **4K@60**; declarar 8K es exactamente el
  **freeze del 2026-06-08** (Ley Cardinal 1, Nivel↔Resolución).
- 4K→8K multiplica ×4 los píxeles a codificar (996 Mpx/s) y ×2-4 el bitrate: ni hardware ni enlace.
- Conclusión: **8K se descarta**. El techo honesto es 4K, y solo cuando hay fuente 4K real o upscale
  bien hecho en el dispositivo.

## 4. Diseño que sí cumple "imagen excepcional sin freeze"

### Tier 0 — Upscale en el dispositivo (ya implementado, coste 0, riesgo 0)

Es lo que funcionaba y es el mejor ROI: AI-SR/AI-PQ del SoC (Amlogic/MediaTek) vía ADB + perfiles
`max_image/sports/cinema/off` (`push_pq_profile.php`), más shaders (`Anime4K`, `FSRCNNX`) donde el
player los soporte, más la declaración `ape_virtual_4k` con guardas (LEVER B: en P2-P5 solo si la
variante top no es AVC). **Cero red, cero CPU del VPS, cero latencia añadida.**

### Tier 1 — Upscale real por GPU, solo para canales seleccionados (viable, acotado)

Arquitectura:

```
player ── HLS ──> VPS/GPU:  ffmpeg -hwaccel cuda -hwaccel_output_format cuda
                            -i <url_fuente_directa>            (NVDEC)
                            -vf scale_cuda=3840:2160:interp_algo=lanczos
                            -c:v hevc_nvenc -preset p1 -tune ll -rc cbr -b:v 20M -g 30 -bf 0
                            -c:a copy
                            -f hls -hls_segment_type fmp4 -hls_time 1 -hls_list_size 6 \
                            -hls_flags delete_segments+independent_segments
```

Reglas no negociables:
1. **Solo se publica** el canal si `encode_speed ≥ 1,5× realtime` (medido, con reserva).
2. La lista emitida lleva **la URL directa como fallback**; si el nodo baja de 1,2×, el player cambia a
   directo → degradación, nunca freeze.
3. `-c:a copy` siempre: **prohibido** tocar el reloj del audio (transcode o time-stretch rompe el sync).
4. Techo 4K@60. Nunca declarar un nivel por debajo de la resolución.
5. Un canal = un proceso; watchdog que mata el proceso si el buffer de salida se atrasa.

### Tier 2 — Declaración "virtual 4K" con guardas (ya existe; mantener)

Mantener `ape_virtual_4k` **solo** como hint de presentación, con el guard de LEVER B y nunca en
cadenas donde el codec real sea AVC en tiers bajos. Es lo que da el look 4K sin coste.

## 5. Qué gana y qué pierde cada enfoque

| Enfoque | Imagen | Latencia | Coste | Riesgo de freeze | Veredicto |
|---|---|---|---|---|---|
| Tier 0 (device AI-SR + virtual 4K) | muy buena (la que ya viste) | 0 ms añadidos | 0 | bajo | **recomendado** |
| Tier 1 (GPU, pocos canales) | buena (upscale + sharpen) | +3-5 s | alto (GPU + 200 Mbps) | medio si no hay fallback | puntual |
| Transcode CPU en el VPS actual | — | — | — | **total** | **descartado** |
| 8K en cualquier forma | engañosa | — | — | **freeze garantizado** | **descartado** |

## 6. Siguiente paso técnico

Lo que puedo entregar **sin tocar producción** ahora mismo:

1. Cablear los 6 módulos muertos que sí valen la pena (`ape_profile_resolver`, `sentinel_auth_guard`,
   `ape_wake_on_manifest`) o retirarlos; dejar el mapa cerrado.
2. Rebase absoluto de URIs en `combined_body_filter.lua` + `location \.(ts|m4s)$ { return 404; }` →
   modo híbrido: metadata por el VPS, video directo.
3. Blueprint Tier 1 completo (systemd unit, ffmpeg flags, watchdog, health, rollback) listo para
   desplegar en un nodo GPU **cuando exista** — no en el CPX actual.

Para desplegar en el VPS hace falta **acceso SSH autorizado** y ventana de cambio con
`nginx -t` + backup. En esta sesión solo tengo HTTP (read-only).
