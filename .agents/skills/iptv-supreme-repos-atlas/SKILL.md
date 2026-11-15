---
name: iptv-supreme-repos-atlas
description: Use when evaluating, citing or adapting knowledge from the six supreme IPTV 4K upstream projects (iptv-org, freearhey/iptv-checker, Guovin/iptv-api, Dispatcharr, euzu/tuliprox, dearbulut/iptv) — maps what each one actually contributes, which public endpoints are verified and which are refuted, the license of each source, and the concepts that may be adapted into APE without copying a single line of code.
specialist: S1
kind: anchor
---

# iptv-supreme-repos-atlas

## 1. Qué es esta skill

Un mapa de seis proyectos externos de IPTV/4K, con **una sola utilidad**: saber qué
concepto se puede adoptar de cada uno, cómo citarlo y por qué **no** se copia su
código. No es una lista de enlaces ni un tutorial de instalación.

**Esta skill NO enseña a instalar, clonar ni ejecutar esos proyectos.** El repo no
instala npm ni pip para esto, y la regla dura del encargo es explícita.

## 2. Cuándo usarla

- Hay que justificar una decisión de diseño citando un proyecto de referencia.
- Hay que responder "¿de dónde sale la idea de verificar resolución real?".
- Hay que decidir si un endpoint público de terceros sirve como fuente de datos.
- Alguien propone "copiar el validador de X" y hay que frenarlo con la licencia.

## 3. Cuándo NO usarla

- Para generar o validar una lista concreta → `iptv-hls-validator`,
  `iptv-real-resolution-verifier`.
- Para decidir degradación de perfil → `iptv-profile-fallback-doctrine`.
- Para tocar el VPS o el generador. Esta skill no autoriza ninguno de los dos.

## 4. Regla de oro — concepto ≠ código

| Licencia medida | Qué permite en este repo |
|---|---|
| **AGPL-3.0** (`Guovin/iptv-api`, `Dispatcharr`) | **Solo concepto.** Copiar código AGPL en un servicio de red obliga a publicar el fuente completo del derivado. Aquí no entra ni un fragmento. |
| **MIT** (`freearhey/iptv-checker`, `dearbulut/iptv`) | Concepto **y**, si el operador lo autoriza por escrito, adaptación con atribución. Por defecto: solo concepto. |
| **CC0** (`iptv-org/iptv`) | Aplica a los **datos/playlists**, no al código de nuestros módulos. No mezcla licencias. |
| **NO VERIFICADA** (`euzu/tuliprox`) | Tratamiento AGPL. Cero código. |

Regla operativa: **se lee la semántica, no el texto**. Se reimplementa en las
convenciones del destino y se demuestra con vectores propios. Un paste no es un port.

## 5. Mapa de los seis repos

Datos de licencia y aporte leídos de la documentación pública (detalle y estado de
cada lectura en `references.md`).

| Repo | Licencia (medida) | Qué aporta el CONCEPTO | Qué NO aporta a APE |
|---|---|---|---|
| `iptv-org/iptv` | CC0 (datos) | Taxonomía M3U Plus pública: `tvg-id/tvg-name/tvg-logo/group-title`, agrupación por categoría, país, idioma, subdivisión y ciudad | No hay playlists por calidad (ver §6.2). No es fuente de canales del operador |
| `freearhey/iptv-checker` | MIT | **La idea central**: el `ffprobe` decide, no la etiqueta. Reporta `codec_name`, `width`, `height`, `r_frame_rate`, `bits_per_raw_sample` y códigos de error por ítem | No se copia el CLI ni el modelo de resultados |
| `Guovin/iptv-api` | **AGPL-3.0** | **Filtro por resolución medida** con umbrales declarados: `min_resolution 1280x720`, `max_resolution 3840x2160`, y mapa `resolution_speed_map 1280x720:0.2,1920x1080:0.5,3840x2160:1.0` (MiB/s) | Nada de código. La AGPL lo prohíbe de facto en un servicio de red |
| `Dispatcharr` | **AGPL v3.0** | Proxy/relay de streams, *failover* automático, EPG matching, salida multi-formato M3U/Xtream/HDHomeRun | Nada de código |
| `euzu/tuliprox` | **NO VERIFICADA** | Gateway Rust con *reverse proxy* y *redirect*, sesiones HLS compartidas, grupos de failover, *quality guards* por clúster, probe FFprobe de códec/resolución/HDR/audio, etiqueta automática tipo `[2160p 4K HEVC HDR TrueHD 7.1]` | Nada de código ni de vocabulario de config |
| `dearbulut/iptv` | MIT | **Health score 0–100 con EWMA** (`score_alpha 0.3`, `retire_after_failures 10`), 403 geobloqueo **excluido** del score, y la regla de oro: un canal sin observación concluyente se reporta `0`/"unchecked" en vez de inventar un número | No se copia el pipeline ni el esquema JSON |

## 6. Endpoints públicos — lo verificado y lo refutado

### 6.1 Citados en documentación (NO sondeados en esta sesión)

De `iptv-org/iptv`: `https://iptv-org.github.io/iptv/index.m3u`,
`/iptv/index.category.m3u`, `/iptv/categories/<cat>.m3u`, `/iptv/countries/<cc>.m3u`,
`/iptv/languages/<iso3>.m3u`, `/iptv/subdivisions/<sub>.m3u`, `/iptv/cities/<city>.m3u`.
Categorías listadas: 29 (Animation 185 … General 2752 … Undefined 1549).

De `dearbulut/iptv`: `/api/v1/index.json`, `/channels.json`, `/by-country/<cc>.json`,
`/by-category/<id>.json`, `/health.json`, `/playlists/best.m3u`,
`/playlists/online.m3u`, `/epg/guide.xml.gz`.

**Estado: citados, no medidos.** No se declara código HTTP ni contenido.

### 6.2 Refutado con medición propia

| Afirmación | Medición | Veredicto |
|---|---|---|
| `iptv-org` publica categorías `4k.m3u` y `8k.m3u` | `https://iptv-org.github.io/iptv/categories/4k.m3u` → **HTTP 404**; `…/8k.m3u` → **HTTP 404**; y `PLAYLISTS.md` tiene **0** ocurrencias de `4k`, `8k` o `quality` | **FALSO**. iptv-org no publica playlists por calidad |

Consecuencia útil: la escalera de calidad de este repo (`P0`–`P5`) **no tiene
equivalente upstream**. No se puede importar de ahí; se mantiene la propia.

**Ruta correcta si alguna vez hace falta el 4K público:** `api/streams.json` filtrado por
`quality: 2160p` — **no** por categoría. Lo midieron las skills hermanas
`iptv-supreme-repos-4k` e `iptv-4k-pipeline-automation` en esta misma sesión
(declaran 20 streams 2160p sobre 18.689). **No re-verificado en esta tarea.** Y aun
así: usar canales de terceros exige autorización del operador (regla legal del repo).

## 7. Catálogo de conceptos adoptables (C1–C7)

| ID | Concepto | Origen | Dónde vive en APE | Estado |
|---|---|---|---|---|
| **C1** | La resolución se **mide**, no se cree | iptv-checker, dearbulut, tuliprox | `#EXT-X-APE-STREAM-TRUTH` + `ape-quality-prober.js` | Implementado como declaración; la medición real sigue siendo externa (§8) |
| **C2** | Score de salud con EWMA + retiro por fallos consecutivos | dearbulut | `APE_PREDICT` (EWMA² sobre `APE_BW`) | Implementado en el panel |
| **C3** | Merge + dedupe antes de publicar | tuliprox, Dispatcharr | skill `duplicate-stream-deduper` | Implementado |
| **C4** | EPG fuzzy con **no-match reportado**, nunca adivinado | dearbulut, Dispatcharr, tuliprox | `tvg-id-tvg-name-formatter` | Implementado |
| **C5** | Proxy/relay con failover por error de upstream | Dispatcharr, tuliprox | `/pulse/` + `failover-pattern` | Implementado |
| **C6** | Filtro por resolución mínima con umbral explícito | Guovin/iptv-api | clasificación por perfil + coherencia bitrate | Parcial (ver skill hermana) |
| **C7** | API JSON estática como superficie de consulta | dearbulut | `channels.json` del JIT | Implementado |

**C2 y el fail-honest son el mismo concepto.** `dearbulut` escribe: *"A channel is only
given a score once at least one of its streams has produced a conclusive observation;
until then the API reports 0 and the UI says unchecked rather than inventing a
number."* Eso es exactamente la doctrina de este repo: un dato no computado se declara,
no se rellena.

## 8. Lo que estos repos NO resuelven aquí

- **Ninguno mide píxeles bajo el player.** Miden el manifest/segmento con ffprobe. La
  mejora de imagen en el device es VPP del SoC (ver `ape-image-pipeline-truth`).
- **Ninguno conoce `#EXT-X-APE-*`.** Son ajenos a nuestra capa declarativa.
- **Ninguno certifica que un canal declarado 4K sea 4K real** en nuestra lista servida:
  eso exige probe propio. Ver `iptv-real-resolution-verifier` §5.

## 9. Formato de cita obligatorio

```
[fuente: owner/repo, README/PLAYLISTS, leído <fecha>] concepto: <qué>
[NO COPIADO] licencia <X> — se reimplementa, no se transcribe
```

Sin fecha y sin licencia, la cita no vale.

## 10. Verificación reproducible

```bash
# La refutación de 4k.m3u/8k.m3u (medida el 2026-11-15)
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-org.github.io/iptv/categories/4k.m3u   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://iptv-org.github.io/iptv/categories/8k.m3u   # 404
```

Nota: si el entorno no tiene red, el comando no prueba nada; se reporta **NO COMPUTADO**
y se conserva la medición previa con su fecha.

## 11. Riesgos

- Tratar una playlist pública ajena como fuente de canales del operador: **prohibido**
  por la regla legal del repo (solo fuentes autorizadas).
- Citrar un endpoint como "verificado" porque el README lo dice: el README no es HTTP 200.
- Importar AGPL: contamina el árbol completo.
