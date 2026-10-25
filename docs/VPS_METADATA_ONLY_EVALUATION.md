# Evaluación: VPS como plano de METADATA (no de video)

> Forense realizado **2026-10-24 14:54–15:10** sobre `https://iptv-ape.duckdns.org` y el árbol
> `IPTV_v5.4_MAX_AGGRESSION/vps/`. Todo el trabajo fue **solo lectura**: GET/HEAD contra el host,
> DNS, TLS y análisis estático de nginx/Lua. **No se modificó nada en producción.**

## 0. Veredicto en una línea

Sirve —y es la pieza correcta— como **plano de control/metadata** (reescritura de playlists,
perfiles por dispositivo, telemetría). **No debe estar en el plano de datos de video**: hoy sí lo está,
y eso contradice el objetivo de "0 video por el VPS".

## 1. Forense HTTP (evidencia medida)

| Ruta | HTTP | tiempo | cuerpo | Lectura |
|---|---|---:|---:|---|
| `/` | 403 | 0.82 s | 146 B | nginx vivo, raíz cerrada (`Server: nginx`, `ACAO: *`) |
| `/api/health` | 404 | 0.28 s | 146 B | existe `vps/api/health.php` en repo → no ruteado |
| `/api/jwt-config` | 404 | 0.33 s | 146 B | existe `vps/api/jwt-config.php` → no ruteado |
| `/api/netshield-sentinel.php` | **503** | 0.31 s | 62 B | **endpoint vivo**: `{"ok":false,"error":"no snapshot yet — first cycle pending"}` |
| `/prisma/api/sentinel-status` | 404 | 0.29 s | 146 B | definido en `prisma-floor-lock.conf` → **no desplegado / otro vhost** |
| `/prisma/api/telemetry-full` | 404 | 0.29 s | 146 B | igual |
| `/prisma/api/channel-hdcp-bulk.php` | **200** | 0.32 s | 101 B | PHP desplegado y sano |
| `/prisma/api/channel-pq-bulk.php` | **200** | 0.28 s | 2 B (`[]`) | sin datos PQ todavía |
| `/prisma/api/channel-image-bulk.php` | **200** | 0.29 s | 51 B | sano |
| `/upload/` | 404 | 0.32 s | 146 B | probablemente solo POST |
| `/omega/open` | 404 | 0.27 s | 146 B | `ape-visual-v3-2-location.conf` no aplicado |
| `178.156.147.234:8765/health` | **000** | 4.81 s | — | probe server caído / filtrado |

TLS al host: `connect 0.56 s`, `appconnect 0.74 s` (≈740 ms solo de handshake, RTT transatlántico).

## 2. Hallazgo P0: el DNS publica 10 A-records y **9 están muertos**

```
iptv-ape.duckdns.org -> 178.156.147.234, 15.223.106.16, 15.222.19.97, 99.79.143.35,
                        35.182.183.211, 35.183.157.249, 3.97.51.116, 99.79.16.64,
                        3.97.58.28, 15.223.21.81
```

Probado fijando cada IP con `--resolve`:

| IP | `sentinel` | handshake |
|---|---|---|
| `178.156.147.234` (Hetzner, tu VPS) | 503 esperado | OK |
| `3.97.51.116` (AWS) | **000** timeout | — |
| `99.79.143.35` (AWS) | **000** timeout | — |
| `35.183.157.249` (AWS) | **000** timeout | — |

**Consecuencia:** cada conexión nueva tiene ~90 % de probabilidad de resolver a una IP que no responde.
El navegador reintenta y a veces gana, pero explica la intermitencia ("a veces no conecta") y cualquier
intento de medir latencia estable. **Es la corrección #1, y no se hace en el VPS**: se hace en el
registro DuckDNS / en la zona DNS (dejar **un solo A**, o un CNAME a un host con un único A).

## 3. Qué proxya hoy (mapa de `location`)

| Config | Regla | Efecto sobre video |
|---|---|---|
| `iptv-intercept.conf` | `~* \.m3u8$` → cache 3 s | metadata (correcto) |
| `iptv-intercept.conf` | **`~* \.(ts\|aac\|m4s)$` → `proxy_pass` + cache 10 min** | **VIDEO por el VPS** |
| `iptv-intercept.conf` | `~* /hls/` → cache 30 s | video/segmentos |
| `shield-location.conf` | `/shield/<hash>/<host>/<path>` → `proxy_pass` dinámico + cache 20 s | puede ser video |
| `iptv-proxy-location.conf` | `/px/<id>/<path>` → cache 60 s | genérico |
| `iptv-brazil-backup-loopback.conf` | `location /` → upstreams Brasil | todo |
| `prisma-*.conf` | APIs Lua/PHP locales | metadata (correcto) |
| `ape-visual-v3-2-location.conf` | `/omega/*` → `127.0.0.1:45732` y `:3322` | control |

## 4. El bug de diseño para "cero video por el VPS"

`combined_body_filter.lua` (22 KB, el del árbol `vps/`):

- Solo actúa si la URI contiene `.m3u8`/`.m3u` (líneas 33-34) y solo si el cuerpo trae
  `#EXT-X-STREAM-INF` (86-87) → **master playlists**.
- Inyecta `#EXT-X-APE-UHDX-MODE:LUA_SUPREMACY` (397) y `#EXT-X-APE-CODEC-CHAIN` (399).
- **Prefetchea el último segmento por socket crudo**: `sock:send("GET <ts_path> HTTP/1.1 ... NGINX-Prefetch/1.0")`
  (446-477) → el VPS descarga video por su cuenta.
- **No hay evidencia de rebase de URIs a absolutas**: si el playlist trae segmentos relativos, el player
  los resuelve contra el host del VPS → **el video termina pasando por el VPS** (coherente con la
  `location \.(ts|m4s)$` con caché de 10 min).

### Contrato propuesto: metadata-only edge

1. El VPS sirve **solo** `.m3u8` (master y media).
2. Toda URI dentro del playlist (variantes, segmentos, `#EXT-X-KEY:URI`, `#EXT-X-MAP:URI`,
   `#EXT-X-PART:URI`, `#EXT-X-PRELOAD-HINT:URI`) se **rebasa a absoluta del proveedor**.
3. En ese vhost: `location ~* \.(ts|aac|m4s|mp4)$ { return 404; }` → si una URI se escapara, **falla
   ruidoso** en vez de convertir el VPS en CDN de video.
4. Prefetch de segmentos: **eliminado** o gateado por flag (`ngx.shared.ape_flags.prefetch = 0`).
5. Playlist: `proxy_cache_valid 200 1-2s` (live), `proxy_read_timeout 5s`, `proxy_next_upstream error timeout`,
   **nunca** cachear 3xx.
6. `proxy_buffering on` solo para el playlist (KB), `proxy_pass_request_headers off`.

## 5. Latencia y "0 freeze"

- 740 ms de handshake TLS es tolerable **una vez** por playlist (keep-alive lo amortiza en las recargas
  siguientes: 0.28-0.33 s medidos). Para **cada segmento** sería catastrófico → refuerza el punto 3.
- La reproducción **no debe depender** del VPS: la lista ya lleva la URL directa del canal; si el VPS cae,
  el player sigue por la URL original (F5) o por fallback. Eso ya está en la doctrina del repo.
- Nada de lo propuesto añade buffering en el camino de video, porque el video **sale** de ese camino.

## 6. Lua y calidad de imagen: qué sube la imagen y qué la rompe

**Sí (metadata, cero píxeles):**
- Elegir/ordenar la variante **real** suprema (VVC > DV > HEVC Main12 > Main10 > AV1-10 > Main8 > AV1-8 > AVC).
- `VIDEO-RANGE` (doctrina PQ incondicional del propietario), `HDCP-LEVEL` adaptativo por incidentes,
  `STABLE-VARIANT-ID` para evitar yoyo de ABR.
- Perfil por dispositivo (`ape_profile_resolver.lua`) y comandos al daemon vía `/ara/events`.
- EXTVLCOPT / KODIPROP / EXT-X-APE (las ~139 líneas por canal que ya emite el generador).
- Telemetría QoE server-side (`qoe_server_side_observer.lua`) y bulk HDCP/PQ.

**No (rompe reproducción):**
- Declarar codec/nivel que el decoder no soporta — GOLDEN RULE `hvc1`/`hev1` y Ley Cardinal 1
  (Nivel↔Resolución): es exactamente el freeze 2026-06-08.
- `SUPPLEMENTAL-CODECS` / CMAF falsos sin `#EXT-X-MAP` real.
- **Pretender mejorar píxeles desde el VPS**: no hay transcode. La imagen la sube el **decoder + VPP del
  dispositivo** (AI-SR/AI-PQ), comandado por metadata (`push_pq_profile.php` → perfiles
  `max_image/sports/cinema/off`). El VPS ordena, el hardware dibuja.

## 7. Riesgos priorizados

| Prio | Riesgo | Impacto |
|---|---|---|
| **P0** | DNS con 10 A y 9 muertas | intermitencia de conexión/telemetría |
| **P0** | video (`.ts/.m4s`) proxeado y cacheado 10 min en el VPS | ancho de banda, latencia, punto único de fallo |
| P1 | prefetch de segmentos desde Lua | consumo de slots/banda del proveedor |
| P1 | drift repo↔desplegado (`sentinel-status`, `telemetry-full`, `health`, `jwt-config`, `/omega/*` en 404) | telemetría y control ciegos |
| P2 | probe server `:8765` sin respuesta | sin health de red |
| P2 | sentinel 503 "no snapshot yet" | paneles vacíos |
| P3 | TLS 740 ms | TTFB de playlist |

## 8. Plan de implementación (por fases, sin tocar producción ahora)

- **F0 — local, riesgo 0.** Fork de `combined_body_filter.lua` con rebase absoluto de URIs + harness de
  replay sobre playlists sintéticas (`tools/quality/testdata/*.m3u8`, `selftest_hls_lint.json`).
  Validación: `luac -p`, y aserción de que **toda** URI de salida es absoluta y del host del proveedor.
- **F1 — DNS.** Dejar un solo A (o CNAME a host con un A). Fuera del VPS. Medir `sentinel` 100 veces.
- **F2 — vhost paralelo `/meta/`.** Un solo canal, acceso real, y comprobar en el access log que
  **no aparece ni un `.ts`**. Rollback: quitar el vhost.
- **F3 — telemetría.** Ciclo del sentinel (que produzca el primer snapshot) + probe server.
- **F4 — medición.** TTFB playlist p50/p95, rebuffer ratio, y confirmación de 0 hits a `.ts` en 24 h.

## 9. Límite explícito de esta evaluación

Las herramientas REA de binario/firmware no aplican a un servicio HTTP: su equivalente aquí es lo que se
hizo —matriz de probes, fingerprint de TLS/DNS, y análisis estático de nginx+Lua+PHP. Cualquier cambio en el
VPS productivo (systemd, nginx, Lua, firewall) requiere autorización explícita y `nginx -t` + backup previo,
conforme a la doctrina `iptv-vps-touch-nothing`.
