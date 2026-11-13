# FIX 3 — Selección de variante: el único mecanismo que consigue de verdad la máxima resolución

**Estado: PARCHE REVISABLE. Nada desplegado, nada cableado.**

---

## 1 · El problema, medido

El operador pidió que el sistema «pida la máxima resolución al proveedor a través de las URIs, fromurl y las maneras que hay de solicitarlo». Lo que existe hoy, medido sobre la lista real (`downloaded_list_4K.m3u8`, 220.194.640 B, 2.051.453 líneas, 2.754 canales):

| Mecanismo | ¿Existe? | Efecto real |
|---|---|---|
| `#EXTATTRFROMURL:quality=top,resolution=highest,bitrate=max` | **SÍ, 100 % de los canales** | **Ninguno.** Etiqueta propietaria; RFC 8216 §6.3.1 manda ignorar lo desconocido |
| query en la URL (`?quality=…`) | **NO** — las URLs son `https://iptv-ape.duckdns.org/live/N.m3u8` sin query | — |
| `sort.*bandwidth` en el generador | **0 ocurrencias** | — |
| `variantSelector` / `selectVariant` / `pickVariant` | **0 ocurrencias** | — |
| `RESOLUTION=3840x2160` declarado | SÍ (39 ocurrencias) | Declara; no garantiza nada |

**Conclusión: la lista declara la máxima resolución, pero no la pide.** Lo único que un reproductor consume de verdad, porque es estándar, es el **orden y el contenido del master playlist**.

---

## 2 · La solución: reordenar el master, sin mentir

`tools/vps/variant_select.js` — implementación de referencia, **37/37 PASS**.

**Qué hace:** reordena los bloques `#EXT-X-STREAM-INF` + URI para que quede primero el de mayor calidad **real**.

**Qué NO hace, y no debe hacer nunca:**

- **No elimina variantes.** Quitarlas rompe el fallback cuando la mejor falla.
- **No reescribe** `BANDWIDTH`, `RESOLUTION`, `CODECS` ni ningún atributo. Eso sería mentir.
- **No toca las URLs.** Ni el query, ni el token, ni nada.
- Si el cuerpo no es un master limpio, **lo devuelve intacto**.

**Orden de prioridad — la resolución manda y el bitrate sólo desempata.**

Esto no es un detalle: un fixture real del propio repo lo demuestra. En `_vps_stage/fixtures/selftest_master.m3u8`:

```
#EXT-X-STREAM-INF:BANDWIDTH=5000000,...,RESOLUTION=1920x1080,...   ← 1080p a 5 Mbps
#EXT-X-STREAM-INF:BANDWIDTH=9000000,...,RESOLUTION=1280x720,...    ← 720p  a 9 Mbps
```

**Ordenar por bitrate pondría el 720p primero.** Sería degradar con la excusa de un número más alto, exactamente lo que la Ley Anti-Degradación prohíbe.

Escala aplicada: **área de píxeles → rango de códec (DV > VVC > HEVC > AV1 > AVC > VP9) → bandwidth**.

---

## 3 · La prueba, y su control negativo

`tools/quality/test_variant_select.js` — **37/37 PASS**, sin dispositivo.

**Control negativo ejecutado:** al inyectar el bug de ordenar por bitrate, el test baja a **34/37** y falla exactamente en:

```
- 1080p queda PRIMERO aunque el 720p declare mas bitrate
- el 720p de 9 Mbps NO sube al primer puesto
- a igual resolucion gana HEVC aunque el H264 tenga mas bitrate
```

Restaurado: 37/37 y exit 0. **El test caza la degradación.**

Casos cubiertos: la trampa del bitrate · orden invertido · idempotencia · HEVC desempata a igual resolución · resolución gana al códec · passthrough en master mezclado con segmentos · passthrough en playlist de segmentos · passthrough con una sola variante · URLs con query intactas · `VIDEO-RANGE=PQ` intacto · `#EXT-X-I-FRAME-STREAM-INF` intacto · conteo de líneas invariante.

---

## 4 · El port para el VPS, y por qué NO está cableado

`IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_variant_select.lua` (6.473 B), `body_filter_by_lua`.

**Comprobaciones que SÍ se hicieron:**
- `ngx.exit` aparece **sólo en un comentario** (L148); el código usa `pcall` y passthrough.
- Bloques balanceados: `function 8 + if 20 + for 9 + while 3 = 40` aperturas, `end` = 40.
- **No cableado** en ningún `.conf` ni otro `.lua` (buscado exhaustivamente).
- Declara `STAGED. NO DESPLEGADO` en su cabecera.

**Comprobaciones que NO se pudieron hacer, y se declaran:**
- **`luac -p` NO ejecutado** — no hay intérprete Lua en este host (`lua` y `luac`: NO).
- **`nginx -t` NO ejecutado** — no hay nginx aquí.

**Por eso no se despliega.** Un Lua sin `luac -p` en un `body_filter` es exactamente el tipo de cambio que rompe la reproducción de todos los canales a la vez.

---

## 5 · Procedimiento de despliegue, cuando el operador lo autorice

```bash
# 1. Sintaxis (en el VPS, donde SI hay interprete)
luac -p /etc/nginx/lua/ape_variant_select.lua     # debe salir 0

# 2. Cablear SOLO en el location del master, nunca en segmentos
#    location ~ ^/live/[0-9]+\.m3u8$ {
#        body_filter_by_lua_file /etc/nginx/lua/ape_variant_select.lua;
#    }

# 3. Config
nginx -t                                          # debe salir 0

# 4. Baseline ANTES de recargar
curl -s 'https://iptv-ape.duckdns.org/live/1.m3u8' > /tmp/master_antes.txt

# 5. Recargar y comparar
nginx -s reload
curl -s 'https://iptv-ape.duckdns.org/live/1.m3u8' > /tmp/master_despues.txt
diff /tmp/master_antes.txt /tmp/master_despues.txt   # SOLO el orden debe cambiar

# 6. Verificar que no se perdio ninguna variante
grep -c 'EXT-X-STREAM-INF' /tmp/master_antes.txt
grep -c 'EXT-X-STREAM-INF' /tmp/master_despues.txt   # debe ser igual
```

**Rollback:** quitar la línea `body_filter_by_lua_file` y `nginx -s reload`. Un solo cambio, un solo comando.

**Criterio de reversión automática:** si el conteo de `STREAM-INF` baja, o si el `diff` muestra cualquier cambio que no sea reordenamiento de líneas, se revierte.

---

## 6 · Lo que esto consigue y lo que no

**Consigue:** que el ABR arranque en la mejor variante real en vez de arrancar bajo y subir. Es el único mecanismo que un reproductor estándar (OTT Navigator, TiviMate, ExoPlayer, hls.js) obedece.

**No consigue:** que el proveedor sirva una variante que no sirve. Si el proveedor publica un solo `STREAM-INF` de 1080p, reordenar no crea un 4K. En ese caso el script no hace nada (`less_than_two_variants`) y lo declara.

**No es un transcode.** No se toca ni un byte de vídeo.
