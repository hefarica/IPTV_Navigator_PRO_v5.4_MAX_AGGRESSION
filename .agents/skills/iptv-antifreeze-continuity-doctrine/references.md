# references.md — iptv-antifreeze-continuity-doctrine

## Política aplicada

- **No se copió ni una línea de código de ninguno de los 11 repos.** De todos se leyó
  documentación (README/readme) y de uno solo (`streamlink`) un fichero fuente completo, para
  **verificar que el concepto existe**, no para portarlo.
- **No se instaló nada** (ni Docker, ni streamlink, ni pip, ni nada) y **no se tocó el VPS**.
- **No se ejecutó** ningún artefacto de terceros.
- Licencias leídas en la API de GitHub el **2026-11-15**; cuando la API dice `NOASSERTION` o
  `null`, se cita también lo que dice el README y **gana el criterio más restrictivo**.
- Ninguna URL de este documento lleva credenciales. No se transcriben URLs de proveedor.

## Los 11 repos, medidos

Consulta: `https://api.github.com/repos/<owner>/<name>` (HTTP 200 salvo donde se indica).
Los valores de estrellas, lenguaje y licencia son los que devolvió la API ese día.

| # | Repo | Licencia (API) | Estrellas | Lenguaje | Qué se leyó | Concepto usado en la skill | ¿Copiado? |
|---|---|---|---|---|---|---|---|
| 1 | `streamlink/streamlink` | **BSD-2-Clause** | 11.923 | Python | `README` + `src/streamlink/buffers.py` (completo, 150 líneas) | `RingBuffer`: buffer circular con `Lock` + `Event` free/used, `read(block, timeout)` que lanza `OSError("Read timeout")`, tamaño por defecto `8192*4` | **No** |
| 2 | `m3ue/m3u-proxy` | **NOASSERTION** · README dice **CC BY-NC-SA 4.0** (no comercial, compartir igual) | 112 | Python | `README.md` completo | "Strict Live TS Mode: pre-buffering & circuit breaker"; failover `<100 ms`; retry `STREAM_RETRY_ATTEMPTS=3`, `LIVE_CHUNK_TIMEOUT_SECONDS=15` | **No** — y la licencia lo prohíbe |
| 3 | `back-to/liveproxy` | **null** (sin licencia declarada) | 163 | Python | `README.md` completo | Puente comando→HTTP (`/cmd/`, `/base64/`) que lanza streamlink/yt-dlp y redirige | **No** |
| 4 | `kpirnie/kptv-proxy` | **NOASSERTION** · el `readme.md` muestra badge **MIT** y hay `LICENSE` de 1.871 B (no leído) | 101 | Go | `readme.md` completo (47.936 B) | Stream Watcher: buffer < 200 KB por intervalo, inactividad 120 s, ffprobe stale 10 min, 3 fallos consecutivos; dead-stream persistido + revive; **detección por estado sin tráfico extra** | **No** |
| 5 | `JustDr00py/mmp` | **AGPL-3.0** | 1 | Go | `README.md` completo | `stall_timeout` 12 s, `low_bitrate_kbps` 20, `max_lag` 8 s, `max_cc_error_rate` 0,05, cooldown 5 s→10 min, `sort_by_health`, penalización de backbone 5 min, `429` se salta por `Retry-After` | **No** |
| 6 | `euzu/tuliprox` | **MIT** | 595 | Rust | `README.md` completo (develop) | Grupos de failover + `failover.yml` con hot reload; elección "reanudar última URL vs reiniciar por la primera"; anti ping-pong; `/healthcheck` vs `/ready` | **No** |
| 7 | `ottstreamscore/ottstreamscore` | **MIT** | 18 | PHP | `README.md` completo | Score compuesto **60 % reliability / 25 % resolución / 15 % FPS** sobre 7 días; sondeo sano cada 72 h y fallido con backoff; lock anti-concurrencia | **No** |
| 8 | `christheradioguy/stream-manager` | **null** (sin licencia) | 0 | Python | `README.md` completo | `PASS/FAIL/SKIP` ("3 ok, 2 failed, 0 skipped"); PASS = llegaron bytes **y** ffprobe encontró stream; prebuffer recortado en keyframes; "hold back a slow client" con backpressure; `content_gaps_total` | **No** |
| 9 | `rebeliptv/iptv` | **NOASSERTION** · README dice **proprietary** y *"Forking this repository is a violation of the license"* | 142 | — | `README.md` completo | Buffer server-side de **15 s**; failover aprovechando el buffer; tarjeta *Reconnecting*; rechequeo de canales offline cada **5 min** | **No** — y **no se puede** |
| 10 | `Maxhm007/IPTVTuner` | **404** — el repo no existe con ese nombre | — | — | — | — | — |
| 10b | `Maxhm007/IPTVTuner.github.io` (el real) | **null** | 0 | Python | `README.md` completo | Estados **Active/Inactive/Healing/Recovered**; ciclo cada **10 min**; dedupe; búsqueda de reemplazo; issues de GitHub como registro | **No** |
| 11 | `akashshinde700/iptv_app` | **null** | 0 | TypeScript | `README.md` completo | *health doctor* server-side que sondea M3U/Xtream/Stalker, quita streams muertos, **oculta canales sin fuente** y los restaura; watchdog de "carga y luego se congela en silencio" | **No** |

## Lo que la misión afirmaba y la fuente NO sostiene

Se declara porque es la parte que evita construir sobre un dato falso:

| Afirmación recibida | Estado medido |
|---|---|
| `Maxhm007/IPTVTuner` | **404**: ese repo no existe. El real es `Maxhm007/IPTVTuner.github.io`. Se usó el real. |
| `IPTVTuner`: "auto-tuning, desactivación temporal, búsqueda de reemplazos" | desactivación y búsqueda de reemplazo: **sí** (README). "Source-quality scoring before replacement" está en **Roadmap**, es decir **NO implementado**. |
| `back-to/liveproxy`: "auto-restart" | su README **no menciona** auto-restart ni supervisión. Es un puente comando→HTTP. **No verificado**; no se usa como fuente de auto-restart. |
| `m3ue/m3u-proxy`: "gap buffer 5–20 s" | el README habla de **pre-buffering** en "Strict Live TS Mode" y de `LIVE_CHUNK_TIMEOUT_SECONDS=15`, **sin cifra de gap buffer 5–20 s**. La cifra concreta **no está verificada**. |
| `rebeliptv/iptv`: "buffer server-side, swap sin corte visible" | el README confirma **15 s** de buffer y failover "sin detener el stream"; el "sin corte visible" es **declaración del README**, no medición independiente. |
| `kptv-proxy`: "self-healing" | el `readme.md` lo atribuye a un contribuidor ("self-healing live streams") y describe el watcher; el **algoritmo exacto** no está verificado en código (no se leyó Go). |

## Lo que NO se pudo verificar (declarado, no rellenado)

1. **Ningún umbral de los citados se comprobó en código** salvo el `RingBuffer` de streamlink.
   Todos los demás (200 KB, 120 s, 3 fallos, 12 s de stall, 5–20 s de gap, 15 s de buffer,
   pesos 60/25/15) salen de **documentación del proyecto**, y así están etiquetados en la skill.
2. **No se midió** ninguno de esos sistemas en ejecución: no hay Docker, no se instaló nada y
   el VPS es producción.
3. **Licencias ambiguas**: `kptv-proxy` (API `NOASSERTION` vs badge MIT) y `m3u-proxy`
   (API `NOASSERTION` vs CC BY-NC-SA 4.0) quedan **sin resolver**. Con la duda, no se copia.
4. **`m3u-proxy` <100 ms de failover** y **"seamless"** de `mmp` son **claims de README**; no
   se reproducen aquí.
5. **El repo `m3u-proxy` declara que su recuperación "no es seamless"** en el arranque del
   README (opt-in direct-live recovery). Ese matiz es del propio autor y se respeta.

## Fuentes internas del repo (sí verificables offline)

Todas se leyeron en esta sesión; las líneas citadas en `SKILL.md` corresponden a estos ficheros:

- `.agent/workflows/net-shield-autopista-sop.md` (302 líneas; leídas 1–120)
- `docs/policies/ANTI_DEGRADATION_LAW.md` (145 líneas, completo)
- `docs/policies/STREAMING_CONTINUITY_LAW.md` (138 líneas, completo)
- `docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md` (líneas 15–22, 49–58, 81–168 vía grep)
- `docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md` (líneas 30–169)
- `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md:43`, `:88`
- `docs/architecture/ESTADO_DEL_ARTE_20261115.md:46`, `:52`, `:217`
- `docs/audits/SEGMENT_PROXY_FIX_20261114.md` (74 líneas, completo)
- `docs/audits/LIVE_CAPTURE_20261114.md` (líneas 248–340 vía grep)
- `docs/audits/E2E_PULSE_20261114.md:70-131`
- `docs/audits/CANARY_STACK_FORENSICS_20261114.md:310`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php` (786 líneas; leídas 576–786 + grep)
- `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh` (215 líneas; leídas 40–215)
- `IPTV_v5.4_MAX_AGGRESSION/vps/systemd/ape-module-watchdog.timer:3`
- `tools/ops/ape-zapping-meter.sh` (148 líneas, completo)

## Reproducir esta lectura

```bash
# metadatos y licencia (los 11, uno por repo)
curl -s https://api.github.com/repos/<owner>/<name> | grep -E '"stargazers_count"|"spdx_id"|"default_branch"'

# el único fuente leído (concepto de ring buffer)
curl -s https://raw.githubusercontent.com/streamlink/streamlink/master/src/streamlink/buffers.py
```

Estado de la verificación: **documentación sí, código no** (salvo streamlink). No se declara
más de lo que se midió.
