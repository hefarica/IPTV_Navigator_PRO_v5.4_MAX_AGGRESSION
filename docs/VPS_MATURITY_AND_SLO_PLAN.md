# VPS: cronología, nivel de desarrollo y plan para llevarlo al máximo

> Forense **2026-10-24**. Solo lectura: git (arqueología local), HEAD/GET al host público, DNS/TLS,
> y análisis estático de `IPTV_v5.4_MAX_AGGRESSION/vps/`. **Nada modificado en producción.**

## 0. Corrección importante a mi informe anterior

En la primera evaluación escribí "el VPS está proxeando video hoy". Hay que precisarlo, porque cambia el
diagnóstico:

- En el **host público** `iptv-ape.duckdns.org` **NO** se sirve video. Probado: `/live/*.m3u8`, `/live/*.ts`,
  `/hls/*`, `/shield/*`, `/px/*`, `/iptv/*` → **404 todos**.
- El proxying de video vive en los **vhosts de interceptación** de `iptv-intercept.conf`, que escuchan en
  **puerto 80** con `server_name` **de los propios proveedores**:

```
listen 80 fastopen=256;  server_name nfqdeuxu.x1megaott.online;
listen 80;               server_name line.tivi-ott.net;
listen 80;               server_name ky-tv.cc;
listen 80;               server_name tivigo.cc;
listen 80;               server_name *.rynivorn.cc rynivorn.cc;
listen 80;               server_name *.zivovrix.cc zivovrix.cc;
```

Es decir: el VPS **se hace pasar por el proveedor** para los dispositivos cuyo DNS apunta a él
(modelo NET SHIELD + DNS hijack por WireGuard). En ese modo el video **sí** pasa por el VPS
(`location ~* \.(ts|aac|m4s)$` → `proxy_pass` + `proxy_cache_valid 200 206 10m`).
Desde esta máquina `line.tivi-ott.net` resuelve a **89.37.116.214** (el proveedor real), así que aquí
el intercept **no** está activo: el túnel/DNS de tu dispositivo es lo que decide si el video pasa o no.

## 1. ¿Desde cuándo proxea video?

| Evidencia | Fecha | Qué |
|---|---|---|
| Borrador en árbol de trabajo `iptv-intercept-atomic.conf` (contiene `(ts\|aac\|m4s)`) | **2026-04-29 21:55** | primera versión con proxying de segmentos |
| `iptv-intercept-final.conf` (mismo patrón) | 2026-04-29 22:29 | ajuste |
| `vps_iptv-intercept.conf` (mismo patrón) | 2026-04-30 00:01 | versión "para VPS" |
| **Commit** `68c9c99` *hardening: full ecosystem sync + gitignore…* — introduce `(ts\|aac\|m4s)` y `NGINX-Prefetch` en git | **2026-05-12** | entra al repositorio |
| Nace el árbol `vps/` (Lua canónico) `3f85054` | 2026-05-19 | `combined_body_filter.lua` desde aquí |
| Último cambio del intercept canónico `b9703fa` | 2026-06-17 | de-hardcode IPs |
| Último cambio del body filter `61e3703` | 2026-06-18 | Canonical 4K / URL-2 |

**Respuesta: ~5 meses y 25 días** (finales de abril de 2026), con ~5 meses en git.
El prefetch de segmentos (`NGINX-Prefetch`) entró en el mismo commit del 2026-05-12.

## 2. Nivel de desarrollo (medido, no estimado)

| Capa | Archivos | Líneas | Nota |
|---|---:|---:|---|
| Lua (nginx) | 41 | **5 794** | body filter, codec cascade, floor lock, bandwidth reactor, QoE, sentinel, wake, profiles |
| nginx conf | 36 | 2 728 | intercept multi-proveedor, prisma APIs, shield, omega |
| PHP | 108 | **25 701** | cmaf_engine (AI-SR, neuro-buffer, modem priority), prisma APIs |
| Python | 36 | 5 479 | harness E2E, calidad, auditorías |
| Rust | 3 | 439 | hotpath injector / buffer governor |
| **Total** | **224** | **≈ 40 100** | stack considerable, no un script |

Módulos Lua más pesados: `combined_body_filter.lua` (22.7 KB), `bandwidth_reactor.lua` (22.1 KB),
`ape_codec_cascade.lua` (20.0 KB), `floor_lock_filter.lua` (18.0 KB), `lab_config.lua` (15.5 KB),
`prisma_telemetry_full.lua` (15.0 KB), `sentinel_auth_guard.lua` (13.0 KB), `quality_realtime.lua` (12.2 KB).

### Qué está REALMENTE desplegado en el host público (probado)

| Endpoint | HTTP | Lectura |
|---|---|---|
| `/prisma/api/channel-hdcp-bulk.php` | **200** | metadata HDCP viva |
| `/prisma/api/channel-pq-bulk.php` | **200** (`[]`) | metadata PQ viva, sin datos aún |
| `/prisma/api/channel-image-bulk.php` | **200** | metadata imagen viva |
| `/api/netshield-sentinel.php` | **503** `no snapshot yet — first cycle pending` | vivo, sin ciclo |
| `/prisma/api/qoe-flush.php` | **403** (37 B) | correcto: solo localhost |
| `/prisma/api/sentinel-status` | **404** | definido en `prisma-floor-lock.conf` → **no desplegado o en otro vhost** |
| `/prisma/api/telemetry-full` | **404** | ídem |
| `/prisma/api/bandwidth-reactor` | **404** | ídem |
| `/quality-realtime` | **404** | ídem |
| `/api/health`, `/api/jwt-config` | **404** | existen en `vps/api/*.php` pero no ruteados |
| `/ara/version`, `/omega/*` | **404** | plano de control/daemon no expuesto |
| `178.156.147.234:8765/health` | **000** (timeout 4.8 s) | probe server caído |

**Conclusión de madurez:** el *código* está a nivel 8/10 (modular, documentado en `master`, con tests y
runbooks); el *despliegue* está a 3/10 en el host público. Hay **drift real** entre repo y producción, y
el plano de decisión (sentinel/bandwidth-reactor/quality-realtime) no responde desde internet.

## 3. Scorecard honesto por capa

| Capa | Nota | Por qué |
|---|---:|---|
| Inyección de metadata en playlist | **8/10** | 139-949 líneas/canal, perfiles, HDCP adaptativo, PQ |
| Rebase de URIs (metadata-only) | **1/10** | no existe: dependes del proxy para que el player pida segmentos |
| Selección de variante suprema | **6/10** | escalera implementada; sin probe medido en producción |
| Plano de datos de video (si intercepta) | **4/10** | un solo VPS, TLS ~740 ms, cache 10 min, prefetch compitiendo por slots |
| Telemetría / QoE | **3/10** | endpoints 404/503, sin snapshot |
| Operación 24/7 | **4/10** | probe caído, sin alertas verificables, DNS con 9/10 IPs muertas |
| Transporte | **5/10** | BBR/sysctl declarados en repo; HTTP/2 **no verificable** (mi curl no soporta h2 → pendiente) |
| Tests / harness | **6/10** | `vps/buffer-governor/tests` (373 líneas), `tools/quality/*`, testdata de playlists malformadas |
| Seguridad | **7/10** | `upstream_gate` passthrough, secretos fuera de git, 403 en qoe-flush |

## 4. Respuesta directa a tu pregunta: ¿es lo mejor o se puede afinar mucho más?

**Se puede afinar mucho más, y las mejoras más grandes no son más Lua.** Por impacto:

### P0 — lo que hoy te quita calidad y disponibilidad

1. **DNS: 9 de 10 A-records muertas.** Medido con `--resolve`: solo `178.156.147.234` responde;
   `3.97.51.116`, `99.79.143.35`, `35.183.157.249` (AWS) → timeout. ~90 % de conexiones nuevas fallan al
   primer intento. **Ninguna optimización de Lua compensa esto.** Es un cambio de zona DNS, no del VPS.
2. **Decidir el plano de datos.** Hoy hay dos modos incompatibles conviviendo:
   - *Intercept* (DNS del device → VPS): el video pasa por el VPS. Ventaja: inyectas metadata en caliente
     y cacheas. Coste: RTT transatlántico, un solo servidor, prefetch compitiendo por slots del proveedor.
   - *Directo* (DNS → proveedor real): video jamás toca el VPS. Ventaja: máxima calidad/velocidad y
     el VPS no puede añadir latencia. Coste: la metadata tiene que inyectarse **antes** (en la lista), no
     en el body filter.
   Para "0 lags / 0 freeze", **directo + metadata en la lista** es superior. El intercept solo tiene sentido
   si necesitas reescribir en el momento.

### P1 — que el plano de control exista de verdad

3. **Cerrar el drift**: que `sentinel-status`, `telemetry-full`, `bandwidth-reactor`, `quality-realtime`,
   `/ara/version` respondan (o retirarlos del frontend para no generar 404 cada 60 s).
4. **Producir el primer snapshot del sentinel** (hoy 503 `no snapshot yet`) y **levantar el probe server :8765**.
   Sin esto, cualquier decisión de ABR/buffer es a ciegas.
5. **Rebase absoluto de URIs** en `combined_body_filter.lua` + `location ~* \.(ts|m4s)$ { return 404; }` en el
   vhost de metadata → así puedes servir listas *sin* que el video entre al VPS (modo híbrido: metadata en
   caliente, video directo).

### P2 — afinar con medida

6. **"Pedir megas": el VPS no puede añadir Mbps.** El ancho de banda es del proveedor hacia el device. Lo que
   sí puede el plano de metadata es **elegir el espejo más rápido por canal** (multi-CDN medido: latencia y
   throughput real por variante) y publicar esa URL. Eso es el lever real de velocidad.
7. **SLO del plano de metadata:** TTFB playlist p95 < 150 ms (cache hit) / < 400 ms (miss), 0 hits a `.ts`
   en logs, 100 % DNS OK en 100 sondas, disponibilidad de endpoints > 99.5 %.
8. **Transporte del plano de metadata:** HTTP/2 (pendiente de verificar), TLS session resumption/1.3 0-RTT,
   keep-alive, cache de playlist 1-2 s con `ETag`/304.
9. **Imagen:** la sube la **variante real suprema** + el **VPP del dispositivo** (AI-SR/AI-PQ). Nunca declarar
   codec/nivel que el decoder no soporta (GOLDEN RULE `hvc1`/`hev1`, Ley Cardinal 1) — ese es el freeze del
   2026-06-08.
10. **Audio:** jamás tocar el reloj del audio (ni transcode ni time-stretch en el VPS). Cualquier
    "aceleración" produce desincronización A/V; el sync se resuelve con metadata (`EXT-X` + perfiles), no
    procesando audio.

## 5. Lo que es físicamente imposible (para no vender humo)

- **0 lag/freeze garantizado**: si el ISP o el proveedor cortan, no hay metadata que lo arregle. Lo que sí
  se garantiza es que **el fallo sea local y recuperable** (URL directa en la lista, fallback, jump-to-live).
- **Subir Mbps desde el VPS**: no. Solo elegir mejor el origen.
- **Mejorar píxeles en el VPS**: no hay transcode; el VPS ordena, el hardware dibuja.
- **Audio "más rápido"**: contraproducente; rompe el sync.

## 6. Siguiente paso sugerido

Antes de tocar nada en producción: (a) arreglar DNS, (b) decidir directo vs intercept, (c) desplegar el plano
de control para medir. Con esos tres, el resto (rebases, SLO, tuning) se vuelve medible en vez de opinable.
