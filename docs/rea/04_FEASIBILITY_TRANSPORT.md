# 04 · Viabilidad física, transporte y coste real — 2 GB VPS vs nodo GPU

**Ciclo REA · entregable 04.** Snapshot medido: `git HEAD` = `a8ff0e9` (2026-10-27 07:20:57 -0500). *El goal del equipo cita `e38a89b`; el árbol avanzó por trabajo de otros miembros — se declara el HEAD real medido, no el citado.*
**Método:** solo lectura. Cero benchmarks nuevos, cero instalaciones, cero SSH. Toda cifra propia sale de una medición **ya existente y fechada** en el repo (se cita `archivo:línea`) o de una **fórmula explícita**. Lo que no tiene medición ni fuente pública se marca **NOT_RUN**. Los precios externos son **referencia de lista pública 2026-10, NO cotización**.
**Caveat heredado (obligatorio):** el VPS es *metadata-only*; no transporta vídeo (`CLAUDE.md` §REALIDAD MEDIDA). Este documento **no propone** cambiar eso.

---

## 1 · Tabla de escenarios (resumen ejecutivo)

| # | Escenario | Hardware | Coste/mes (referencia, no cotización) | Latencia G2G | Canales | Veredicto |
|---|---|---|---|---|---|---|
| E0 | **Actual: metadata/edge, vídeo directo proveedor→player** | Hetzner Cloud 3 vCPU / 3 819 MiB (medido) | Precio de la caja ya pagada. CPX21 (3 vCPU/4 GB) **no apareció** en la lista recuperada (página truncada tras CPX22); el par publicado más cercano es CPX22 2 vCPU/4 GB = **€19,99** ([Hetzner Cloud](https://www.hetzner.com/cloud/regular-performance/)) | La del origen: **6–10 s** (GOP ~1 s) / **15–25 s** (GOP ≥10 s), medido en `MEDIA_FANOUT_FEASIBILITY.md:352-353` | **Sin límite por diseño** (solo sirve listas; 0 egress de vídeo) | **GO** — es la única ruta con coste marginal ≈ 0 |
| E1 | **Transcode 4K en el VPS actual (CPU x265)** | mismos 3 vCPU, sin GPU | €0 adicionales | +≥1 GOP sobre E0 → **≥3–5 s extra** (`VPS_UPSCALE_4K_DESIGN.md:112`) | **0** (0,39× realtime; ver §4) | **NO-GO** (físico, no económico) |
| E2 | **Nodo GPU dedicado (RTX PRO 4000 Blackwell SFF 24 GB)** | Hetzner **GEX45**: i5-13500, 64 GB, 2×512 GB NVMe, 1 Gbit/s | **€214,00** + **€209,00** setup ([GEX45](https://www.hetzner.com/dedicated-rootserver/gex45/)) | Transcode añade ≥1 GOP; con GOP corto + LL-HLS **≥1,3 s** (derivado, §3) | **NOT_RUN** (capacidad NVENC 4K HEVC no publicada; techo de NIC = **45** viewers 4K simultáneos, §5) | **GO condicional** — solo opt-in por canal, jamás sobre el VPS de metadata |
| E3 | **E2 + WebRTC (para `latency_target 500 ms`)** | E2 + TURN (p. ej. CPX22 €19,99) | €214 + €19,99 ≈ **€233,99** + egress/relay 2× | **<1 s** (clase WebRTC, por diseño UDP) | mismo techo de NIC, **÷2** por el relay TURN | **NO-GO para los 6 players del repo** (TiviMate/OTT/VLC/Kodi/Smarters/ExoPlayer son HLS, `CLAUDE.md` §coverage matrix) |

---

## 2 · Coste de transcodificar 4K: fórmulas y cifras medidas

### 2.1 Fórmulas (universales, no dependen del host)

```
cores_por_stream_1x   = (CPU_% / 100) / speed_ratio          # speed_ratio = fps_salida / fps_fuente
speed_max_en_host     = vCPU_utiles / cores_por_stream_1x
canales_en_host       = floor(vCPU_utiles / cores_por_stream_1x)
pared_por_segundo     = cores_por_stream_1x / vCPU           # >1 ⇒ el buffer crece sin límite
canales_por_RAM       = floor(RAM_disponible / RSS_por_sesion)
canales_por_disco     = floor(disco_libre / ventana_por_canal)
```

`vCPU_utiles` con la reserva del 30 % que usa el propio repo (`MEDIA_FANOUT_FEASIBILITY.md:323`): `3 × 0,7 = 2,1`.

### 2.2 Medido en ESTE VPS (x86, sin GPU) — `docs/MEDIA_FANOUT_FEASIBILITY.md:325-332`

| Prueba | fps | speed | CPU % | core·s/s | Cores para 1× | Techo en 3 vCPU | RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| **x265 1080p→2160p `ultrafast`** (contenido real) | 8,9 | 0,356× | 269 % | 7,61 | **7,6** | **0,39×** | 542 MiB |
| x265 2160p30 `ultrafast` (sintético) | 12 | 0,412× | 264 % | 6,42 | 6,4 | 0,47× | 480 MiB |
| x265 2160p30 `medium` (sintético) | 5,9 | 0,194× | 245 % | 12,62 | 12,6 | 0,24× | 572 MiB |
| x264 1080p→2160p `ultrafast` (real) | 39 | 1,56× | 230 % | 1,50 | 1,5 | 2,0× | 243 MiB |
| remux `-c copy` (referencia, **es lo que hace hoy**) | ~997× | — | 103 % | **0,011** | 0,01 | >200 | 61 MiB |

Verificación aritmética de la primera fila: `2,69 / 0,356 = 7,56 ≈ 7,61 core·s/s` ✓. Y `3 / 7,61 = 0,394×` ✓ — la tabla del repo es internamente consistente.

### 2.3 Consecuencias cuantificadas

- **Un solo canal 4K HEVC realtime exige 7,6 cores; el host tiene 3.** `pared_por_segundo = 7,61/3 = **2,54**`: por cada segundo de vídeo el encoder consume 2,54 s de pared ⇒ **1 h de contenido = 2,54 h de CPU**. Divergencia monótona, sin punto fijo. **NO-GO físico.**
- **`medium` empeora a 12,6 cores** (4,2× el host) ⇒ subir preset no es una opción.
- **x264 8-bit**: 1 stream = 1,5 cores = 50 % del host; 2 = 100 %, sin CPU para nginx/ingesta/supervisor; y `ultrafast` 4K no mejora la imagen frente al AI-SR del dispositivo (`MEDIA_FANOUT_FEASIBILITY.md:340-342`). Además viola el contrato HEVC Main10 del repo.
- **RAM**: `2995 / 542 = 5,5` sesiones por memoria ⇒ **no es el cuello**; el cuello es CPU (0 canales).
- **NVMe**: ventana de 300 MB/canal (`ape-sentinel`: «300MB/300s») ⇒ `13 GB / 0,3 GB = **43**` canales por disco en este VPS; en GEX45 `512 GB / 0,3 = **1 706**`. Tampoco es el cuello.
- **Latencia de pipeline** (fórmula): `L = buffer_captura + GOP + PART-HOLD-BACK + red`. Un GOP de 1 s ya obliga a `≥1 s`; `PART-HOLD-BACK ≥ 3×PART-TARGET` (regla documentada en la skill `part-hold-back-tuner`) añade `≥1,5 s` con partes de 0,5 s. **Un transcode nunca baja de ~1 GOP de latencia: no existe "transcodificar para reducir latencia" sin acortar el GOP en origen.**

### 2.4 GPU (NVENC) — qué está documentado y qué no

- **Sesiones concurrentes**: matriz oficial [NVIDIA Video Encode/Decode Support Matrix](https://developer.nvidia.com/video-encode-decode-support-matrix). Leído: familia **GeForce = 12** sesiones máx.; familia **RTX PRO / Quadro = `Unrestricted`**. La fila exacta de la RTX PRO 4000 Blackwell SFF del GEX45 **no se recuperó** (página truncada) ⇒ límite de sesiones de *esa* tarjeta = **NOT_RUN**.
- **Throughput**: el único dato de fabricante recuperado es de **otra GPU**: L4 (Ada, 24 GB, 72 W) = «**1000+ streams AV1 720p30**», ~3× T4 ([blog NVIDIA L4](https://developer.nvidia.com/blog/supercharging-ai-video-and-ai-inference-performance-with-nvidia-l4-gpus/)). Es AV1 **720p**, no HEVC **2160p**: **no se extrapola**. Streams 4K HEVC por GPU = **NOT_RUN** (exigiría benchmark en el nodo; no ejecutado y no autorizado).
- **VRAM/RAM/disco del GEX45** son holgados para cualquier cifra razonable (64 GB, 24 GB VRAM, 2×512 GB): el límite práctico será la **NIC de 1 Gbit/s** (§5), no el encoder.

---

## 3 · Transporte: WebRTC vs LL-HLS vs RTMP, y qué implica `latency_target 500 ms`

| Transporte | Base | Latencia alcanzable (derivación) | Cache/CDN | Estado por espectador | Compatibilidad con los 6 players del repo |
|---|---|---|---|---|---|
| **LL-HLS** | HTTP/TCP (RFC 8216 + partes) | `≥ PART-HOLD-BACK(3×PART-TARGET) + GOP + red`. Con PART-TARGET 0,5 s y GOP 1 s ⇒ **≥2,5 s**; realista **3–5 s** | **Sí** (HTTP cacheable, CDN barata) | **Sin estado** (1 GET por segmento) | **Sí** — es lo que ya consumen |
| **WebRTC** | UDP/SRTP, ICE/STUN/**TURN** | **<1 s** por diseño (jitter buffer configurable) | **No** (no hay caché HTTP intermedia) | **Con estado por viewer** (ICE, DTLS, SRTP) | **NO** — TiviMate/OTT/VLC/Kodi/Smarters/ExoPlayer hablan HLS (matriz S9). WebRTC exigiría otro player |
| **RTMP** | TCP, protocolo de *ingest* (Adobe) | Segundos (bloques de 1+ GOP) | No | Con estado por publisher | **No es de entrega**: sirve para *meter* el stream al nodo, no para servirlo al player |

### Qué implicaría exactamente `latency_target = 500 ms`

1. **LL-HLS no llega.** Para que sólo el *hold-back* quepa en 500 ms haría falta `PART-TARGET ≤ 166 ms`; y con el GOP medido en los canales reales (**~1 s en ch3, 1,2 s en ch47, 5 s en ch894968, ≥10 s en ch701** — `MEDIA_FANOUT_FEASIBILITY.md:350`) el segmento mínimo lo fija el keyframe. El repo ya concluyó: *«LL-HLS real no es alcanzable con remux-only de forma general; requiere GOP corto en origen (**no controlable**) o transcode (**NO-GO**). **No prometer < 4 s**»* (`:354-355`).
2. **500 ms ⇒ WebRTC**, y eso es un **cambio de clase de transporte**, no un parámetro: player distinto, TURN obligatorio, relay 2× ancho de banda, cero caché CDN, estado por espectador.
3. **Lo que se pierde**: (a) compatibilidad con los 6 players del repo; (b) la economía de la caché HTTP (cada viewer = un flujo dedicado); (c) el `GO` de §1 E0 completo; (d) tolerancia a pérdida: en UDP la pérdida se ve; en LL-HLS se reintenta.
4. **Lo que se gana**: sólo latencia. Para un catálogo de canales lineales (no apuestas, no subastas) el valor de 500 ms frente a 6–10 s es **cero QoE**, porque el usuario no interactúa con el reloj del evento.

---

## 4 · El VPS actual: por qué NO puede transcodificar (`NO-GO` explícito)

**Inventario medido** (`MEDIA_FANOUT_FEASIBILITY.md:62-72`, 2026-10-25/26): 3 vCPU AMD EPYC-Rome @ 2,0 GHz **sin AVX-512**; 3 819 MiB RAM (~2 995 disponibles); `/dev/sda1` 38 G (13 G libres); `/dev/shm` 1,9 GiB; **GPU = Virtio 1.0**; `libva: virtio_gpu_drv_video.so init failed → resource allocation failed → Device creation failed: -5`; **sin `nvidia-smi`, sin `vainfo`**; kernel 6.8.0-124; `nf_conntrack_max` efectivo 65 536.

**Demostración numérica del NO-GO (4 vías independientes, basta una):**

1. **CPU**: `7,61 cores / 3 vCPU = 2,54 s de CPU por s de vídeo` ⇒ máximo `0,394×`. **Canales 4K sostenibles = `floor(2,1 / 7,61) = 0`.**
2. **CPU alternativa AVC**: `floor(2,1 / 1,50) = 1` canal, con el host al 71 % y sin headroom para ingesta/nginx; y 8-bit AVC no cumple el contrato de imagen.
3. **GPU**: no hay. `ffmpeg -encoders` **lista** `hevc_nvenc`/`hevc_vaapi`/`av1_qsv` **pero no hay hardware detrás** — trampa documentada en `:87-88`. Cualquier `-c:v hevc_vaapi` muere en `init_hw_device`.
4. **RAM** (`5,5` sesiones) y **disco** (`43` canales) **no** son el cuello: no rescatan el veredicto.

> ### `NO-GO` — Re-encode (transcode/upscale 4K) en el VPS actual
> **Estado: NO-GO físico, no económico.** No es cuestión de configurar mejor: `0,394×` realtime significa que el pipeline **no alcanza el tiempo real** y el buffer crece hasta romper el directo. **No se habilita, no se "prueba en un canal"**, y el perfil 4K escalado permanece `state: off` gateado (`REA_DIAGNOSIS_AND_FIXES.md:530`). Cualquier documento que prometa `/process` con `libx265` en este host es falso (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:47`).

**Advertencia contable honesta:** el host tiene **3 vCPU** y el par comercial CPX21 (3 vCPU/4 GB) **no apareció** en la lista de precios recuperada (la página se truncó tras CPX22) ⇒ el «coste actual» de la caja es **NOT_RUN** (no hay factura ni cotización en el snapshot). No se inventa un número ni se afirma que el plan esté retirado.

---

## 5 · Coste: escenario $0 vs nodo GPU, y ancho de banda por canal

### 5.1 Ancho de banda por canal (bitrates **declarados** por el repo, `CLAUDE.md` tabla de bitrate — no medidos en los canales ⇒ cifra de diseño, no de campo)

`TB/mes = (Mbps_avg / 8) × 86 400 × 30 / 1 000 000` → simplificado: **`TB/mes = Mbps_avg × 0,324`**

| Perfil | AVG declarado | **TB/mes por espectador 24/7** | Espectadores que caben en 20 TB incluidos |
|---|---:|---:|---:|
| 4K (3840×2160) | 22 Mbps | **7,13 TB** | **2,8** |
| QHD | 12 Mbps | 3,89 TB | 5,1 |
| 1080p@30 | 6,5 Mbps | 2,11 TB | 9,5 |
| 720p | 4,0 Mbps | 1,30 TB | 15,4 |
| 480p | 1,8 Mbps | 0,58 TB | 34,3 |

**Cifras de control:** `N_viewers_4K_en_1Gbit = 1000 / 22 = **45**` (techo de NIC del GEX45, sin overhead); `N_viewers_4K_en_20TB = 20 / 7,13 = **2,8**`.

### 5.2 Coste por escenario

- **E0 · $0 marginal (real).** Egress de vídeo del VPS = **0** (el player va directo al proveedor; los segmentos dan `404` en el borde). Coste incremental de añadir canales: **€0**. No hay factura de tránsito que crezca con la audiencia. **Ésta es la razón económica —no ideológica— por la que la doctrina actual es correcta.**
- **E2 · Nodo GPU.** **€214,00/mes** + **€209,00 setup** (una vez) = **€423,00 el primer mes**, exento de IVA ([GEX45](https://www.hetzner.com/dedicated-rootserver/gex45/)). La página declara **tráfico ilimitado**; el cobro de **€1,00/TB** aplica al *addon* de uplink 10G, no a la config base ⇒ en 1 Gbit/s el límite es de **fan-out (45 viewers 4K)**, no de factura. Coste por slot 4K saturado ≈ `214 / 45 = **€4,76/viewer-4K·mes**`.
- **E2 con transcode de N canales**: el coste **no escala por canal** hasta saturar la NIC o el encoder; el gasto es fijo. Por eso el nodo sólo tiene sentido si hay **canales seleccionados** que justifiquen €214/mes — no para el catálogo completo.
- **E3 · WebRTC**: + TURN (CPX22 **€19,99**, [Hetzner Cloud](https://www.hetzner.com/cloud/regular-performance/)) y **el relay duplica el ancho de banda** ⇒ el techo de 45 viewers 4K cae a **~22**. Coste por slot ≈ `(214+20) / 22 = **€10,64**`, 2,2× el de E2.
- **Factura de tránsito si se usara Cloud en vez de dedicado**: 20 TB incluidos y **€1,00/TB** de exceso en EU (la misma página lo escribe como «€ 1.00 per hour», errata evidente de la lista: se cita el importe, no la unidad). 100 espectadores 4K = **713 TB** ⇒ **693 TB de exceso = €693/mes**; 1 000 ⇒ **€7 110/mes**. Ésta es la cifra que hace inviable "pasar el vídeo por el VPS" y la que confirma el `NO-GO` de §4 por la vía económica, no sólo física.

### 5.3 Precios externos: referencia, no cotización

Todos los importes son **lista pública consultada 2026-10**, `excl. VAT`, sin contrato ni negociación, y **no** constituyen oferta: (a) [Hetzner GEX45](https://www.hetzner.com/dedicated-rootserver/gex45/) — €214,00/mes, €209,00 setup, tráfico ilimitado, 1 Gbit/s garantizado; (b) [Hetzner Cloud Regular](https://www.hetzner.com/cloud/regular-performance/) — CPX22 €19,99/mes, 20 TB incluidos EU, exceso €1,00/TB; (c) [NVIDIA Support Matrix](https://developer.nvidia.com/video-encode-decode-support-matrix) — sesiones; (d) [NVIDIA L4 blog](https://developer.nvidia.com/blog/supercharging-ai-video-and-ai-inference-performance-with-nvidia-l4-gpus/) — 1000+ AV1 720p30, 24 GB, 72 W. **Ningún proveedor fue contactado; ningún VPS fue tocado.**

---

## 6 · Ruta de integración sin romper fluidez

1. **Se conserva E0 como camino por defecto, sin excepciones.** El vídeo sigue yendo **proveedor→player directo**; el VPS sigue siendo *metadata-only*. Es lo que mantiene el coste en €0 y el egress en 0.
2. **Si se añade nodo (E2), es un nodo SEPARADO del VPS de metadata.** El VPS actual no gana procesos, ni ffmpeg, ni egress: se preservan íntegros los invariantes de red medidos (`bbr`+`fq`, `tcp_fastopen=3`, `tcp_slow_start_after_idle=0`, `rto_min lock 40ms` en 3 /24 — auditados en el council S8). Meter vídeo en esa caja rompería el perfil de autopista que hoy está medido y sano.
3. **Opt-in por canal, nunca por defecto.** El nodo publica capacidad; si no hay hueco o la GPU no responde, el manifiesto sigue sirviendo la **URL directa**. El repo ya tiene el patrón: gate con `412 Precondition Failed` + `X-MF-Reason: gpu-unavailable` y fallback a directo (`MEDIA_FANOUT_DEPLOY.md:571`). **El fallback debe ser el camino, no la excepción.**
4. **Red/CDN**: el nodo necesita **CDN delante** para que el fan-out no salga de su NIC de 1 Gbit/s; sin CDN, el techo son 45 viewers 4K (§5.1). Con CDN el nodo sólo paga **1× egress**, y la CDN paga el fan-out — pero eso **sí** cuesta y no está cotizado aquí (**NOT_RUN**).
5. **Lo que cambia en red**: aparece un segundo salto de vídeo (proveedor→nodo→CDN→player), por lo que la latencia **sube** ~1 GOP respecto a E0. Es decir: **añadir el nodo empeora la latencia de todo canal que pase por él.** El nodo sólo se justifica para **calidad/consistencia** (GOP corto, HDR real, upscale verificado), nunca para "más rápido".
6. **Nunca** mover `wg0`/`wg-surfshark` ni el ruteo del VPS hacia el nodo GPU: el nodo se alcanza por HTTPS público; tunelizarlo multiplicaría el MTU anidado ya frágil (ver council S8: `wg0=1380` vs `wg-surfshark=1280`).

---

## 7 · Límites de este documento (lo que NO se midió)

| Punto | Estado | Por qué |
|---|---|---|
| Streams 4K HEVC por GPU (GEX45) | **NOT_RUN** | No hay cifra de fabricante para *esa* tarjeta; medirla exige el nodo y un benchmark (no autorizado, no instalado) |
| Límite de sesiones NVENC de la RTX PRO 4000 SFF | **NOT_RUN** | Fila exacta del matrix no recuperada (página truncada); sólo se leyó GeForce=12 y RTX PRO=`Unrestricted` |
| Bitrate **real** de los canales | **NOT_RUN** | El repo aporta la tabla **declarada** (`CLAUDE.md`); no hay medición de campo en el snapshot |
| Coste actual de la caja de producción | **NOT_RUN** | CPX21 3 vCPU/4 GB no figura en la lista 2026-10; no hay factura en el snapshot |
| Coste de CDN para el fan-out del nodo | **NOT_RUN** | Requiere cotización de un tercero; prohibido inventarla |
| Latencia G2G con nodo GPU | **derivada**, no medida | `L = GOP + PART-HOLD-BACK + red`; sin nodo, no hay medición |
| Capacidad de los 6 players en WebRTC | **NOT_RUN** | La matriz S9 del repo es HLS; WebRTC no fue probado en device |

**Conclusión.** Con lo medido basta para dos decisiones firmes y ninguna más: **(1) re-encode 4K en el VPS actual = `NO-GO` físico** (`0,394×` realtime, 0 canales, sin GPU real); **(2) el escenario `$0` (metadata + vídeo directo) es el único con coste marginal cero y no debe abandonarse**. Añadir un nodo GPU es una decisión de **producto** (€214/mes fijos, opt-in, con CDN y fallback a directo) que **sólo** se puede cerrar midiendo streams 4K HEVC en ese nodo — hoy: **NOT_RUN**.
