# references.md — iptv-failover-upstream-discipline

## Política aplicada

- **No se copió código.** De los tres repos que aportan concepto se toma **la regla de
  comportamiento** (qué dispara un cambio de fuente, qué cooldown, cuándo se vuelve), no su
  implementación.
- **No se instaló nada** (ni Docker, ni streamlink, ni dependencias) y **no se ejecutó** nada.
- **No se tocó el VPS**: la skill es normativa y sus comandos son de lectura.
- Licencias leídas en la API de GitHub el **2026-11-15**.

## Repos usados como fuente de concepto

| Repo | Licencia (API) | Estrellas | Qué se leyó | Concepto tomado | ¿Copiado? |
|---|---|---|---|---|---|
| `JustDr00py/mmp` | **AGPL-3.0** | 1 | `README.md` completo | Clasificación del fallo por motivo (`stalled`, `low_bitrate`, `corrupted`, `eof`, `behind`); cooldown exponencial `5 s → 10 min`; penalización de **backbone** 5 min; `429` se salta por `Retry-After`; dos backbones que fallan en <10 min ⇒ no se cambia, se reabre en el live edge | **No** (AGPL: sólo concepto) |
| `euzu/tuliprox` | **MIT** | 595 | `README.md` completo | Grupos de failover en YAML con **hot reload**; elección explícita entre "reanudar la última URL buena" y "reiniciar por la primera"; **anti ping-pong**; `/healthcheck` (vivo) separado de `/ready` (capacidad) | **No** |
| `christheradioguy/stream-manager` | **null** (sin licencia) | 0 | `README.md` completo | Fuentes en **orden de prioridad**, reanudación desde la primera tras un minuto sano; backoff que se resetea al sobrevivir 60 s; distinción **reopen** (rotación esperada de token/ventana, no sube el backoff) vs **failure**; por qué reabrir sin continuidad de timestamps desincroniza al player | **No** |

## Los 11 repos del encargo (estado de lectura)

| # | Repo | Licencia (API) | ¿Usado aquí? | Motivo |
|---|---|---|---|---|
| 1 | `streamlink/streamlink` | BSD-2-Clause | No | su reconexión es de librería cliente, no de upstream del VPS |
| 2 | `m3ue/m3u-proxy` | NOASSERTION · README **CC BY-NC-SA 4.0** | No (citado en skill 1) | su `failover_urls` es por stream, multiproveedor; útil como concepto, licencia NC |
| 3 | `back-to/liveproxy` | null | No | no gestiona failover |
| 4 | `kpirnie/kptv-proxy` | NOASSERTION · badge MIT | No | su failover es "dead stream" persistido; citado en skill 1 |
| 5 | `JustDr00py/mmp` | AGPL-3.0 | **Sí** | cooldown, motivos, backbone |
| 6 | `euzu/tuliprox` | MIT | **Sí** | YAML + hot reload, reanudar vs reiniciar, anti ping-pong |
| 7 | `ottstreamscore/ottstreamscore` | MIT | No | es scoring, no failover |
| 8 | `christheradioguy/stream-manager` | null | **Sí** | prioridad, reset a 60 s, reopen vs failure |
| 9 | `rebeliptv/iptv` | NOASSERTION · **proprietary** | No | "multi-source stream fallback" citado como concepto general en skill 1 |
| 10 | `Maxhm007/IPTVTuner.github.io` | null | No | reemplazo de fuente es automático y agresivo: **no** sirve de modelo (no tiene la restricción de cuenta única) |
| 11 | `akashshinde700/iptv_app` | null | No | su "automatic server switching" cambia de servidor por ranking de salud: concepto válido, sin detalle publicable |

`Maxhm007/IPTVTuner` (sin sufijo) devuelve **404**: ese repo no existe. El real es
`Maxhm007/IPTVTuner.github.io`.

## Fuentes internas (la parte que manda)

| Artefacto | Qué se tomó | Línea |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php` | retry único sólo para `0/≥500/513/461/429/408/302`; sleeps; `stale=1` a 60 s; **código real al cliente** y el defecto del 502 fijo | `:610-624`, `:671-680`, `:685-720` |
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh` | `pulse-canal` marca `sin-muestra` ante `502/461/000/403/407/404/429/451`; "un canal caído no es un módulo caído"; 407 = código de bloqueo de este proveedor | `:137-160` |
| `.agent/workflows/net-shield-autopista-sop.md` | `proxy_next_upstream error timeout http_502 http_503 http_504` (sin 4xx); `proxy_cache_use_stale` con `http_403` **sólo** en la ruta CDN por token caducado | `:64`, `:87` |
| `docs/policies/ANTI_DEGRADATION_LAW.md` | Art. 1 (prohibición), Art. 5 (rebuffering), Art. 8 (no mentir), Art. 10 (prioridad) | `:7-21`, `:70-89`, `:113-122`, `:138-145` |
| `docs/policies/STREAMING_CONTINUITY_LAW.md` | Art. 7 cadena HDR→SDR 1080→720 (reconciliada como incapacidad de decoder) | `:82-90` |
| `CLAUDE.md` | Single URL Per Channel (Anti-509) y lista de cosas que nunca se hacen | §Single URL Per Channel |
| `docs/audits/LIVE_CAPTURE_20261114.md` | 499 = el operador zappeando | `:301` |
| `docs/audits/CANARY_STACK_FORENSICS_20261114.md` | el canary roba la conexión del proveedor si hay zap reciente; guard de 180 s | `:310` |

## Lo que NO se pudo verificar

1. **"Failover <100 ms" de `m3u-proxy` y "sin cortar la conexión" de `mmp`**: son claims de
   README, **no reproducidos** aquí (no hay Docker ni permiso para instalar).
2. **Ningún umbral se comprobó en código**; todos provienen de documentación y así están
   etiquetados. La excepción es el código interno del repo, que sí se leyó línea a línea.
3. **El comportamiento real del proveedor ante un segundo intento tras 429** no se midió en
   esta sesión. `pulse.php` reintenta a los 250 ms porque se midió que el CDN se recupera en
   segundos (`:611-614`), pero eso es del proveedor actual, no una ley general.
4. **La tabla `canal → [primario, backup]` no existe**; su diseño (§7 de `SKILL.md`) es una
   **propuesta** no implementada y fuera del scope de esta tarea.
5. **El efecto de un failover a mitad de ventana HLS** no se midió en este stack; la
   advertencia de §5.1 se apoya en la razón técnica (salto de secuencia/PTS) y en el
   testimonio de `stream-manager`, no en una captura propia.
6. **No se verificó** que nginx tenga hoy `proxy_next_upstream` con esa lista exacta: se cita
   el SOP del repo. El estado del `nginx -T` desplegado no se leyó en esta sesión.

## Reproducir

```bash
# licencias de las tres fuentes de concepto
curl -s https://api.github.com/repos/JustDr00py/mmp              | grep -E '"spdx_id"|"stargazers_count"'
curl -s https://api.github.com/repos/euzu/tuliprox               | grep -E '"spdx_id"|"stargazers_count"'
curl -s https://api.github.com/repos/christheradioguy/stream-manager | grep -E '"license"'

# la parte que manda, offline
sed -n '605,625p' IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php
sed -n '137,160p' IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh
sed -n '60,90p'   .agent/workflows/net-shield-autopista-sop.md
```

Estado: **regla verificada en el código del repo; conceptos externos verificados en
documentación; implementación del failover multiproveedor NO EXISTE y se declara propuesta.**
