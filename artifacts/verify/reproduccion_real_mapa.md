# R6 — Reproducción real del mapa JIT publicado (12 canales hasta bytes decodificables)

**Tarea:** t36 · **Medición:** 2026-11-21 ~22:47–23:00 UTC · **Modo:** solo lectura (GET + `nginx -T` + `ss`). **Cero POST, cero escrituras en el servicio, cero reload/restart, cero residuo en `/tmp`.**

---

## 0. Veredicto en dos capas (la distinción es el resultado)

El enunciado "¿reproduce?" tiene **dos sentidos** y no se pueden fundir en uno:

### Capa A — ¿el canal entrega bytes decodificables al salir del VPS? — **MEDIDO**

| Clasificación | Canales |
|---|---|
| **REPRODUCIBLE** (códec + resolución salieron de ffprobe sobre bytes del canal) | **11 / 12** |
| **MANIFIESTO_OK_SEGMENTO_INALCANZABLE** | **0 / 12** |
| **NO_REPRODUCIBLE** | **1 / 12** (id `1518815`, 403 `http_403`) |
| NOT_MEASURED | 0 / 12 |

### Capa B — ¿reproduce **en un player, en la red del operador**? — **NOT_MEASURED (12/12)**

**El player pide los segmentos DESDE SU RED, no desde el VPS.** No hay device en la red del operador en esta medición, así que el sentido fuerte de "reproduce en un player" **no está medido** y **no se puede afirmar ni negar**. Lo que está medido es la alcanzabilidad **VPS → proveedor**, que es condición necesaria y **no** suficiente.

> Se dice sin rodeos: **Capa A = 11/12 reproducible. Capa B = NOT_MEASURED.** Cualquier "el mapa reproduce en el player" sería una extrapolación de A a B que esta medición no sostiene.

---

## 1. Contradicción con la medición previa del capitán — resuelta con evidencia, no por mayoría

El capitán reportó **0/12 decodables desde el VPS**, con segmentos dando *"Connection reset by peer"* (DNS OK a 149.57.136.5 / 154.6.18.210) y el host del proveedor sin conectar. **Eso no reproduce hoy.** Medido por mí, en el mismo VPS y con los mismos hosts:

| Prueba | Resultado literal |
|---|---|
| Manifiesto canal **2** → primer segmento | `SEGMENTO_HTTP: 200`, **4.746.624 B**, `content-type: video/mp2t`, primer byte `0x47` (sync TS) |
| Canal **1** | `200`, **1.601.760 B**, `video/mp2t`, sync `0x47` |
| Canal **31875** | `200`, **4.286.400 B**, `video/mp2t`, sync `0x47` |
| Canal **1513015** | `200`, **6.881.364 B**, `video/mp2t`, sync `0x47` |
| DNS del host de segmento `9711897.c24s.cc` | `149.57.136.5` (coincide con lo que vio el capitán) |
| ffprobe sobre manifiestos | **11 canales** con `codec_name`, `width`, `height`, `avg_frame_rate`, audio `aac` |

**Ningún "connection reset":** lo que sí aparece es **404 por expiración de segmento**. Al repetir 8 peticiones al mismo segmento (Range 64 KB, 0,5 s), las 8 dieron **404** — los segmentos rotan fuera de la ventana live. Conclusiones honestas:

1. Un segmento **copiado** de un manifiesto caduca en segundos → **404**, no reset. Probar segmentos guardados mide caducidad, no conectividad.
2. La causa más probable del `0/12` previo es haber probado contra segmentos ya expirados y/o una ventana de fallo del proveedor. **No reproduzco el reset**, así que no lo doy por existente ni por inexistente en su ventana: queda como no reproducido.
3. Lo que **sí** confirmo de su informe: el canal `1518815` da **403**, y el id `1` dio **200 con 1 byte** en una sonda inicial (luego 562 B válidos).

---

## 2. Muestra declarada

**Base:** `/opt/ape-jit/current/channels.json` — **2.708.055 B**, `sha256 0800e2bde7367cdea49f61eba5074d9119c80eba6260bf627cdaf088188f7c49`, mtime `2026-11-21 21:59`, **11.222 claves**.
**Regla:** 4 principio / 4 medio / 4 final por **índice posicional** en el orden de claves (`mid = floor(11222/2) = 5611`).

| Pos | Índice | **id** | | Pos | Índice | **id** |
|---|---|---|---|---|---|---|
| principio | 0 | **1** | | medio | 5613 | **31877** |
| principio | 1 | **2** | | medio | 5614 | **31878** |
| principio | 2 | **3** | | final | 11218 | **1513015** |
| principio | 3 | **4** | | final | 11219 | **1517011** |
| medio | 5611 | **31875** | | final | 11220 | **1518814** |
| medio | 5612 | **31876** | | final | 11221 | **1518815** |

**Composición del mapa (medida):** los 11.222 canales apuntan a **un solo host** (`iptv-ape.duckdns.org`); el proveedor va en el *path*. **2 proveedores**: `nfqdeuxu.x1megaott.store` **11.215** canales / 1 credencial · `evestv.wuitf.com` **7** canales / 1 credencial.

> **Limitación:** los 12 del muestreo cayeron **todos** en el proveedor dominante. El segundo se midió aparte (§6).

UA usado (el que el mapa declara, 123 chars):
`Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.213 Safari/537.36 WebAppManager`

---

## 3. Tabla ruta · manifiesto · segmento · clasificación (Capa A)

| id | Manifiesto | CT | Bytes | ¿M3U8? | Segs | Vídeo (ffprobe) | fps | Audio | **Clasificación** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 200 | `application/x-mpegurl` | 562 | sí | 2 | h264 **848×480** | 30 | aac | **REPRODUCIBLE** ⚠ |
| 2 | 200 | `application/x-mpegurl` | 2926 | sí | 6 | h264 **1920×1080** | 25 | aac | **REPRODUCIBLE** ✓seg |
| 3 | 200 | `application/x-mpegurl` | 2926 | sí | 6 | h264 **1920×1080** | 30 | aac | **REPRODUCIBLE** ⚠ |
| 4 | 200 | `application/x-mpegurl` | 2926 | sí | 6 | h264 **1920×1080** | 25 | aac | **REPRODUCIBLE** ⚠ |
| 31875 | 200 | `application/x-mpegurl` | 2990 | sí | 6 | h264 **1920×1080** | 59,94 | aac | **REPRODUCIBLE** ✓seg ⚠ |
| 31876 | 200 | `application/x-mpegurl` | 2998 | sí | 6 | h264 **1280×720** | 29,97 | aac | **REPRODUCIBLE** |
| 31877 | 200 | `application/x-mpegurl` | 2998 | sí | 6 | h264 **1280×720** | 29,97 | aac | **REPRODUCIBLE** |
| 31878 | 200 | `application/x-mpegurl` | 2998 | sí | 6 | h264 **1920×1080** | 50 | aac | **REPRODUCIBLE** |
| 1513015 | 200 | `application/x-mpegurl` | 3039 | sí | 6 | h264 **1920×1080** | 25 | aac | **REPRODUCIBLE** ✓seg |
| 1517011 | 200 | `application/x-mpegurl` | 3039 | sí | 6 | h264 **1920×1080** | 25 | aac | **REPRODUCIBLE** |
| 1518814 | 200 | `application/x-mpegurl` | 3039 | sí | 6 | h264 **1920×1080** | 50 | aac | **REPRODUCIBLE** |
| **1518815** | **403** | `application/json` | 160 | no | 0 | — | — | — | **NO_REPRODUCIBLE** |

`✓seg` = además comprobé el **segmento real** descargado (200 + `video/mp2t` + sync `0x47`), no solo el manifiesto.
`⚠` = fallo observado en ventana previa, recuperado (detalle §4).

**Censo de códecs de los 11 decodables:** `h264` **11**, `hevc` **0**, `av1` **0**. Resoluciones: 848×480 ×1, 1280×720 ×2, 1920×1080 ×8. **≥2160p: 0.**
→ En esta muestra el mapa entrega **H.264 + AAC**, nunca HEVC ni 4K.

---

## 4. Fallos transitorios medidos

| Canal | Qué pasó | Evidencia |
|---|---|---|
| **1** | 200 con **1 byte** `text/html`; después 562 B M3U8 válido (`MEDIA-SEQUENCE:0`) | `bytes:1` → `bytes:562` |
| **4** | ffprobe intento 1 → `403 Forbidden`; intento 2 (8 s) → OK | dos intentos, misma URL |
| **3** | sirvió `#EXT-X-APE-STALE:1`; ffprobe **2 intentos / 8 s → 0 frames**. Con manifiesto fresco decodifica | cabecera en cuerpo; `stdout_len:0` |
| **31875** | ffprobe: `non-existing SPS 0 / PPS 0 referenced` — decodifica igual | stderr de ffprobe |

> **Regla:** un **200 no es reproducción**, y un **200 con `#EXT-X-APE-STALE:1` tampoco**. Mientras dura la ventana stale, el canal se clasifica NO decodable.

---

## 5. Slot de proveedor: la etiqueta esperada **no** es la que falla

| Concepto | Medido |
|---|---|
| `PROVIDER_SLOT_BUSY` | **0 / 12** (y 0 / 19 sondas) |
| Fallo real en la muestra | `all_upstreams_failed` + `reason: http_403` → 1 |
| Fallo real en el 2.º proveedor | `all_upstreams_failed` + `reason: http_406` → **7 / 7** |

La etiqueta `PROVIDER_SLOT_BUSY` existe en el código (`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js:4937`, `:5124`) pero **no apareció nunca**.
**No es rate-limit del VPS:** 5 GET consecutivos al mismo canal (1 s) → **5 × 200 con los mismos 2926 B**.

---

## 6. Extra: segundo proveedor `evestv.wuitf.com` — 7 / 7 caídos

| id | HTTP | Bytes | ¿M3U8? | Clasificación |
|---|---|---|---|---|
| 50716 · 50725 | **406** | 150 | no | NO_REPRODUCIBLE |
| 101119 · 126482 · 167073 · 167075 · 167079 | **406** | 151 | no | NO_REPRODUCIBLE |

```json
{"ok":false,"path":"/live/2RHAVYWB/SDXH4MYV/50716.m3u8","tried":["evestv.wuitf.com"],"error":"all_upstreams_failed","ms":238,"reason":"http_406"}
```

**7/7 NO_REPRODUCIBLE.** Son 0,06 % del mapa pero el **100 %** de ese proveedor.

---

## 7. Evidencia literal del NO_REPRODUCIBLE (`1518815`)

```json
{"tried":["nfqdeuxu.x1megaott.store"],"reason":"http_403","path":"/live/2E2ETBH3/HZHXPBUD/1518815.m3u8","error":"all_upstreams_failed","ok":false,"ms":300}
```

403 **del upstream**: el motor declara que probó el proveedor y este respondió 403. Reproducible en ≥4 intentos espaciados. No es nginx ni el motor.

---

## 8. Camino real de servicio (medido con `nginx -T` y `ss`)

```
player → GET https://iptv-ape.duckdns.org/cdn/<proveedor>/live/<u>/<p>/<id>.m3u8
           │
           ▼  nginx -T:442-444
   location ~ ^/cdn/(?<ape_host>[^/]+)(?<ape_path>/.*)$ {
       content_by_lua_file /etc/nginx/lua/ape_gateway.lua;     ← gateway Lua, NO el motor 3099
   }
           │  subrequest interno
           ▼  location = /_ape/_fetch (internal)
       proxy_pass http://$arg_h$arg_p$arg_qs;  proxy_pass_request_headers off;
           │
           ▼  el proveedor devuelve el manifiesto con segmentos ABSOLUTOS:
   http://9711897.<host>.cc/hlsr/…/<id>_<seq>.ts     ← el PLAYER los baja del proveedor
```

- El motor JIT escucha **solo** en `127.0.0.1:3099` (node pid 1379189) y **no** sirve `/cdn/`.
- `/cdn/…\.(ts|m4s|mp4)$` → **404** (`nginx -T:947`): el VPS no sirve media.
- `/cdn/(127\.|10\.|192\.168\.|…)` → **403** (`nginx -T:942`): bloqueo SSRF a rangos internos.
- **Consecuencia para la Capa B:** como el media va directo proveedor→player, la alcanzabilidad medida desde el VPS **no** predice la del device. De ahí NOT_MEASURED.

---

## 9. NO COMPUTADO (declarado, no rellenado)

| Campo | Por qué |
|---|---|
| **bitrate** | ffprobe devuelve `bit_rate=null` en TS live. Se podría estimar con bytes/duración de segmento; **no se hizo** para no añadir carga al proveedor. `null` es más honesto que una estimación. |
| **duration** | HLS live: `format.duration=null` por diseño del demuxer `hls`. |
| **reproducción en player real (Capa B)** | Sin device en la red del operador. La unidad probada es bytes decodificables por ffprobe desde el VPS. |
| **continuidad / cero freeze** | Prohibido prometerlo. Cada sonda cubre segundos, no minutos. No se mide rebuffering. |

---

## 10. Límites

1. **12 de 11.222 = 0,107 %.** No es un censo.
2. **12/12 en un solo proveedor**; el otro (7 canales) medido aparte.
3. **Medido desde el egress del VPS** (Hetzner Ashburn), no desde la red del operador.
4. **3 de 12 con fallo transitorio** confirmado; un instante no describe un canal.
5. **ffprobe 6.1.1** en el VPS.
6. **Residuo:** ninguno. Todas las sondas fueron `python3` por stdin con `urllib` en memoria — sin `-o`, sin `open(...,'w')`, sin ficheros temporales. Los `/tmp/{x,p}.m3u8` que aparecen en el VPS **no son míos** (no ejecuté ninguna escritura).

---

## 11. Frontera de evidencia

`#EXT-X-APE-STALE` y `all_upstreams_failed` se observan **en el cable** pero **no están** en la copia canónica del motor de este árbol (`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js`, 480.976 B); el único rastro es un fixture (`_vps_stage/tests/channel_alive_assert.js:94,121`). **⇒ El binario que sirve producción no está identificado byte a byte aquí: su paridad es t39, no t36.**

---

## 12. Artefactos

- `artifacts/verify/reproduccion_real_mapa.md` — este informe.
- `artifacts/verify/reproduccion_real_mapa.json` — data estructurada (12 filas, censo de códecs, evidencia de segmento, 2.º proveedor, contradicción, NO COMPUTADO).
