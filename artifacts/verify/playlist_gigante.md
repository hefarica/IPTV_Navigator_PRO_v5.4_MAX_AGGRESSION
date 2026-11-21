# R14 — La "playlist" del menú pesa 734 MB: qué artefacto debe recibir el player

Medido el **2026-11-21 22:0x–23:1x UTC** por `map-endpoint` (SSH **solo lectura** + `curl` desde Internet).
No se cambió nginx, no se borró el alias, no se tocó el motor. Toda cifra sale de un comando ejecutado; los
límites están en §8 como **NO COMPUTADO**.

---

## 0. Titular

El menú entrega hoy un artefacto de **734 128 578 B** del cual **el 99,0 % son directivas que el reproductor
no puede usar**. El contenido útil (una línea `#EXTINF` + una URL por canal) suma **7 432 399 B** — el
**1,01 %**. Y el motor ya sirve un catálogo equivalente de **3 574 997 B** que el player descarga y parsea en
**40,5 ms**.

Además, las **dos** rutas del menú (`/jit/playlist-calidad.m3u8` y `/jit/playlist-resolver.m3u8`) devuelven
**el mismo fichero**: para el reproductor son indistinguibles.

---

## 1. Identidad de los artefactos (medida)

| artefacto | ruta | bytes | sha256 | notas |
|---|---|---|---|---|
| **Gigante** (lo que recibe el menú hoy) | `/jit/playlist-calidad.m3u8` → `location =` **alias** `/var/www/html/lists/ape_jit_latest.m3u8` → symlink → `/var/www/lists/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8` | **734 128 578** | `3ede7cc25339bacd900b0a8a8f4fc7dff99c7cde33cbc769046c457eb1b66f63` | mtime 2026-11-20 06:06:55 |
| **Gigante .gz** (lo que paga un cliente con gzip) | mismo, `ape_jit_latest.m3u8.gz` | **200 357 421** | `fca53d169c77ee53968c3300c1ca25c00f2ea1f5133d7570131c0d1344505667` | `Content-Encoding: gzip` confirmado |
| **Catálogo del motor** | `/jit/playlist.m3u8` → `proxy_pass 127.0.0.1:3099/` | **3 574 997** | `de4e4011c3d35ee09d30907c0764a8ed8e79fc0c27d25788ff12eee60b0f5e2a` | snapshot descargado hoy |
| **Snippet que los sirve** | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf` | 170 líneas | `32a25258a3bc25c09b69631506c6034ea6eb80fe1713b18b66bafd15724d197a` | **vivo == repo** (ver §7) |

---

## 2. Comparativa (todo medido)

| métrica | GIGANTE (734 MB) | MOTOR (3,57 MB) | factor |
|---|---|---|---|
| bytes | 734 128 578 | 3 574 997 | **205,4×** |
| bytes si el cliente pide gzip | 200 357 421 | — (no aplica, `proxy_buffering off`) | 56,0× |
| líneas totales | **11 785 644** | 22 445 | **525×** |
| `#EXTINF` (canales) | 11 222 | 11 222 | 1× |
| líneas por canal | **1 050** | **2** | 525× |
| `#EXT-X-APE-*` | **7 693 581** | 0 | — |
| `#EXTVLCOPT` | **1 544 572** | 0 | — |
| `#KODIPROP` | **1 155 872** | 0 | — |
| `#EXTHTTP` | 11 222 | 0 | — |
| otras líneas `#` | 1 346 728 | ~0 | — |
| URL por canal | `https://…/pulse/<id>.m3u8?u=<url-proveedor>&d=<json>` | `https://iptv-ape.duckdns.org/jit/live/<id>/master.m3u8` | transporte distinto |
| **bytes hasta la 1.ª URL de canal** | **167 340 B** (línea **1 272**) | **355 B** (líneas 1-3) | **471×** |
| TTFB (loopback VPS) | 5-7 ms | 1,8 ms | — |
| TTFB (Internet, medido) | 433 ms (h2) / 738 ms (h1.1) | — | — |
| descarga completa medida | **NO completada** (cortada por `--max-time`, ver §3) | **5,201 s** (`exit 0`) | — |
| parseo streaming (host, `readline`) | ~**10 s** (extrapolado de 604 MB medidos, §4) | **40,5 ms** | **247×** |

---

## 3. Coste real de descarga (medido desde Internet, `curl`)

| prueba | bytes movidos | tiempo | ritmo | proyección al total |
|---|---|---|---|---|
| h1.1 `--max-time 120` | 366 329 386 | 120,0 s | 3,05 MB/s (24,4 Mbps) | **≈241 s (4,0 min)** |
| h2 (por defecto) `--max-time 60` | 92 175 914 | 60,0 s | 1,54 MB/s (12,3 Mbps) | ≈478 s (8,0 min) |
| gzip `--compressed --max-time 45` | 123 362 835 | 45,0 s | 2,74 MB/s (21,9 Mbps) | **≈73 s (1,2 min)** |
| Range `0-1023` | 1 024 | 0,45 s | — | el servidor soporta rangos |
| **motor `/jit/playlist.m3u8`** | **3 574 997** | **5,201 s** | — | **completo, `exit 0`** |
| `/jit/playlist-resolver.m3u8` (mismo alias) | 280 198 698 | 120,0 s | 2,33 MB/s | ≈314 s |

Los cuatro `exit 28` son **mi `--max-time`**, no un fallo del servidor: el cuerpo fluye. Lo que no hice fue
esperar 4-8 minutos por la descarga completa (§8).

**Nota de honestidad sobre HTTP/2 en loopback:** `curl` contra `https://127.0.0.1/jit/playlist-calidad.m3u8`
devolvió `exit 92` (stream error) con 0 bytes, también con `Range`. Desde Internet el mismo recurso **sí**
fluye (tabla de arriba). Lo registro como medición, **no** como defecto de producción: es un artefacto de mi
loopback/h2, no reproducido en la ruta pública.

---

## 4. Coste de parseo (medido, no estimado de folleto)

Dos métodos sobre el mismo tipo de artefacto:

| artefacto | método | líneas | EXTINF | tiempo |
|---|---|---|---|---|
| motor 3,57 MB | `readline` streaming (node) | 22 445 | 11 222 | **40,5 ms** |
| gigante-proxy local 604 MB (`scratch/LISTA_ACTUAL.m3u8`) | `readline` streaming (node) | 10 315 662 | 10 573 | **8 238,6 ms** |
| gigante real 734 MB (VPS) | `awk` una pasada | 11 785 644 | 11 222 | **2,56 s** (C caliente) / **6,61 s** (con censo de bytes) |
| gigante real 734 MB | proyección lineal desde el proxy (13,64 ms/MB) | — | — | **≈10,0 s** |

Y un límite duro que no es opinión: **`MAX_STRING_LENGTH` de V8 = 536 870 888** caracteres. Un player
JavaScript/WebView **no puede** materializar 734 MB en un string:

```
node -e "require('buffer').constants.MAX_STRING_LENGTH"  → 536870888
node -e "'x'.repeat(6e8)"                                → Invalid string length
```

O sea: en un player basado en web no es "lento", es **imposible** con el fichero entero en memoria.

---

## 5. Dónde están los 734 MB: censo de bytes por clase de línea (medido, una pasada)

| clase de línea | líneas | bytes | % del total |
|---|---|---|---|
| `#EXTINF` (canal) | 11 222 | 5 016 117 | 0,68 % |
| **URL de canal** | 11 222 | 2 416 282 | 0,33 % |
| **directivas `#` (APE/VLC/Kodi/EXTHTTP)** | **11 751 975** | **726 676 622** | **99,00 %** |
| otros | 11 225 | 11 225 | 0,00 % |
| **total** | 11 785 644 | 734 120 246 | 100 % |

**Recorte mínimo `#EXTINF` + URL = 7 432 399 B (1,012 %).** Ese es el tamaño del catálogo "útil" que hoy
viaja envuelto en 727 MB de metadata.

---

## 6. Recomendación

### Uno para el menú: **`/jit/playlist.m3u8` (3 574 997 B, del motor)**

Criterio de reproductor, por orden de peso:

1. **205× menos bytes** que hoy (3,57 MB vs 734 MB; y 56× menos que el `.gz`).
2. **Parseo 247× menor** (40,5 ms vs ≈10 s proyectados) y **cabe en memoria de cualquier player** (734 MB
   supera el máximo de string de V8).
3. **Primer canal en 355 B / línea 3**, frente a **167 340 B / línea 1 272**: el player no necesita tragarse
   1 271 líneas de preámbulo para pintar el primer canal.
4. **Ya existe y ya se sirve** (no hay que generar ni publicar un artefacto nuevo).
5. Una URL por canal, apuntando a `/jit/live/<id>/master.m3u8` (**Single URL per channel**, doctrina del repo).

### Por qué NO el de 734 MB

- **99,0 % del peso son directivas** (727 MB / 11,75 M líneas) que el reproductor **no consume**: el motor y
  el VPS son quienes las usan.
- **4-8 minutos** de descarga medidos a 12-24 Mbps solo para el catálogo; el `.gz` baja a ≈73 s. Eso no es
  QoE: es el player sin pintar nada mientras descarga.
- Con gzip el cliente sigue pagando **200 MB**.
- Las **dos** entradas del menú sirven **el mismo fichero**, así que "calidad" y "resolver" no eligen nada.

### Qué se pierde al cambiar (con conteo, no a ojo)

Se pierden **11 751 975 líneas de directivas / 726,7 MB**, en concreto:

| directiva | líneas | qué hacía | ¿la necesita el player? |
|---|---|---|---|
| `#EXT-X-APE-*` | 7 693 581 | metadata APE por canal (perfil, HDR, códec, URL-2, contratos) | **No**: la consume el VPS/motor y el cartucho de la lista; un player la ignora por RFC 8216 §6.3.1 |
| `#EXTVLCOPT` | 1 544 572 | `network-caching`, deinterlace, filtros de VLC | **Sí para VLC/Kodi**: se pierde el afinado de caché por perfil |
| `#KODIPROP` | 1 155 872 | pistas, códec, UA de Kodi | **Sí para Kodi**: se pierde el hint de códec/UA |
| `#EXTHTTP` | 11 222 | cabeceras por canal (UA/Referer) | **No en la ruta JIT**: el motor abre el stream con el UA del canal en servidor (`server.js:4533,4542,5092` → `spec.ua || 'VLC/3.0.19 LibVLC/3.0.19'`) |

**Lo que NO se pierde** (importante para no vender un empeoramiento):

- **El contrato de buffer** (piso 24 s / `X-Buffer-Min` 62,5 %) vive en el **motor** (`server.js:1345`, R9),
  no en la playlist del menú: cambiar el menú no lo toca.
- El **UA del proveedor** y las cabeceras de origen los pone el servidor; el player no las necesita.
- Los **11 222 canales** siguen ahí (mismo `#EXTINF`, misma metadata de nombre/logo/grupo).

### Alternativa B (si la política de slot único bloquea la ruta JIT)

**Recorte de la lista cableada: 7 432 399 B (1,012 %)** — `#EXTINF` + URL, mismas URLs `pulse` de hoy, sin
directivas. Es 2,08× el catálogo del motor y conserva el transporte actual. Cuesta: un generador nuevo y
perder lo mismo que la opción A (EXTVLCOPT/KODIPROP, §6). **No lo recomiendo como primera opción** porque
implica un artefacto más que mantener; sí como plan B medido.

### Caveats medidos hoy (condicionan la recomendación, no la invalidan)

- **El JIT es de un solo slot y ahora está denegando**: `/health` → `provider_gate {checks:57, allow:0,
  deny:57, last_reason:"player_active"}`. Consecuencia medida: `/jit/live/1/master.m3u8` devolvió el texto
  `PROVIDER_SLOT_BUSY: use provider-direct; source unchanged`. El **catálogo** parsea en 40 ms, pero un
  canal concreto puede ser denegado mientras el slot lo tenga otro.
- **El transporte `pulse` del gigante tampoco está limpio ahora**: la primera URL del gigante
  (`/pulse/1.m3u8?u=…&d=…`) respondió **HTTP 502** (122 B, 0,63 s). Es una medición puntual de un canal.
- Conclusión honesta: **hoy ninguno de los dos transportes es un camino limpio**; lo que cambia con esta
  decisión es el **coste del catálogo** (3,57 MB / 40 ms vs 734 MB / ~10 s), no la disponibilidad del canal.

---

## 7. ¿Toca `ape-jit.conf`? SÍ — y hay que corregir la premisa del encargo

El encargo dice «va DESPUÉS de t42». **Medido: el snippet de t42 ya está aplicado en producción.**

```
sha256 vivo  /etc/nginx/snippets/ape-jit.conf = 32a25258a3bc25c09b69631506c6034ea6eb80fe1713b18b66bafd15724d197a
sha256 repo  IPTV_v5.4_MAX_AGGRESSION/vps/nginx/snippets/ape-jit.conf = 32a25258… (idéntico, 170 líneas)
include      /etc/nginx/sites-enabled/default:72 → include snippets/ape-jit.conf;
```

Es decir: t42 **no está pendiente de aplicar**; está aplicado y coincide byte a byte con el repo. Por tanto
este cambio **no espera a t42** — lo que exige es **su propia ventana de nginx** (no mezclar con el despliegue
del motor de R11/t41 ni con otras ediciones del snippet).

### Cambio propuesto (a aplicar en esa ventana, NO ahora)

En `§1` del snippet, repuntar las **dos** entradas del menú al catálogo del motor y **conservar el alias**
(moverlo, no borrarlo) para diagnóstico y rollback:

```diff
 location = /jit/playlist-calidad.m3u8 {
-    alias /var/www/html/lists/ape_jit_latest.m3u8;
+    proxy_pass http://127.0.0.1:3099/;      # sirve /playlist.m3u8 del motor (3,57 MB)
+    proxy_http_version 1.1;
+    proxy_set_header Host $host;
+    proxy_buffering off;
+    proxy_read_timeout 65s;
-    add_header Content-Type "application/vnd.apple.mpegurl" always;
+    # el Content-Type lo pone el motor: mantener el add_header lo DUPLICA
+    # (medido en el alias vivo: el HEAD devuelve `content-type` dos veces)
     add_header Cache-Control "no-store" always;
     add_header Keep-Alive "timeout=5, max=100" always;
-    add_header X-APE-Jit-Source "lista cableada (ape-jit-latest)" always;
+    add_header X-APE-Jit-Source "motor JIT (playlist.m3u8)" always;
     add_header Access-Control-Allow-Origin "*" always;
-    gzip_static on;
 }
# igual para /jit/playlist-resolver.m3u8
+
+# el alias NO se borra: se conserva para diagnóstico/rollback bajo otra ruta
+location = /jit/playlist-cableada.m3u8 {
+    alias /var/www/html/lists/ape_jit_latest.m3u8;   # 734 MB, intacto
+    add_header X-APE-Jit-Source "lista cableada (diagnostico)" always;
+}
```

- **Rollback**: backup del snippet + restaurar el `alias` en las dos rutas + `nginx -t` + `nginx -s reload`.
- **Prohibido** en este cambio: borrar el alias, tocar `ape-jit-latest.sh`, o mezclarlo con el deploy del motor.
- Verificación posterior (3 comandos): `curl -sI` de las dos rutas → `Content-Length: 3574997`;
  `curl -s … | head -3` → primer `#EXTINF` en línea 2 y URL en línea 3; `/jit/playlist-cableada.m3u8` sigue
  devolviendo 734 128 578.

---

## 8. NO COMPUTADO (con razón)

1. **Descarga completa de los 734 MB**: no la esperé (corté a 60/120/45 s). El tiempo total es **proyección**
   desde el ritmo medido, no un cronómetro de extremo a extremo.
2. **Descarga gzip completa**: igual; moví 123 362 835 de 200 357 421 B en 45 s.
3. **Parseo en el device real** (OTT Navigator / TiviMate / VLC en TV): no hay dispositivo en esta tarea. Los
   40,5 ms y ≈10 s son CPU de host (node/awk); en ARM de TV será peor, pero **no lo he medido**.
4. **Si algún player concreto exige `EXTHTTP`/`EXTVLCOPT` de la playlist**: no medido en device. Lo argumento
   con evidencia de código (el motor aplica UA en servidor) y con la pérdida declarada en §6.
5. **El `exit 92` de loopback**: registrado, no reproducido en la ruta pública; sin diagnóstico de causa.
6. **Por qué `/pulse/1.m3u8` devuelve 502**: fuera de alcance de R14 (es el transporte del gigante, no el
   tamaño del catálogo). Queda como medición para quien tome ese frente.

---

## 9. Evidencia (comandos ejecutados)

```text
# identidad y tamaño (SSH solo lectura)
readlink -f /var/www/html/lists/ape_jit_latest.m3u8   → /var/www/lists/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8
stat -Lc %s → 734128578 ; sha256sum → 3ede7cc2…b66f63 ; .gz 200357421 / fca53d16…505667
sha256sum /etc/nginx/snippets/ape-jit.conf → 32a25258…d197a  (== repo, 170 líneas)

# estructura del gigante (una pasada)
awk '/^#EXTINF/{e++} END{print NR, e}' → lines=11785644 extinf=11222 first_extinf_line=230
grep -c '^#EXT-X-APE' → 7693581 ; '^#EXTVLCOPT' → 1544572 ; '^#KODIPROP' → 1155872 ; '^#EXTHTTP' → 11222
awk 'first /^https?:/ → NR=1272' ; head -n 1272 | wc -c → 167340
censo: bytes_extinf=5016117 bytes_url=2416282 bytes_directivas=726676622 recorte=7432399

# motor
curl -s -o /dev/null -w '%{size_download} %{time_total}' http://127.0.0.1:3099/playlist.m3u8 → 3574997, 5,201 s (Internet)
readline streaming: 22445 líneas, 11222 EXTINF, 40,5 ms
curl -s http://127.0.0.1:3099/health → provider_gate deny=57 last_reason=player_active

# descarga (Internet)
h1.1 120 s → 366329386 B ; h2 60 s → 92175914 B ; gzip 45 s → 123362835 B (Content-Encoding: gzip, CL 200357421)
Range 0-1023 → 206 ; /jit/live/1/master.m3u8 → "PROVIDER_SLOT_BUSY: use provider-direct; source unchanged"
primera URL pulse del gigante → HTTP 502
```

**Conteo final:** 3 artefactos comparados con bytes/líneas/EXTINF/forma de URL medidos; 2 alternativas de
menú con tamaño medido (3,57 MB y 7,43 MB); 0 cambios aplicados (prohibido); 6 límites declarados.
