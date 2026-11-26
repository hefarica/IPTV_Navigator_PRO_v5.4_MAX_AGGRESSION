# R5 — Auditoría de TODAS las listas del lote (2026-11-21)

**Modo:** solo lectura sobre el VPS (`ssh hetzner-iptv`, `sudo -n`, `awk`/`join`/`stat`).
**No se escribió** en `/opt/ape-jit`, ni se publicó release, ni se tocó ninguna lista servida.
Los únicos artefactos escritos son este `.md` y su `.json`, en el workspace local.

---

## 0. Veredicto en una línea

**La fuente correcta es la vigente: `/var/www/lists/pulse/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8`.
No hay que ejecutar `--list`.** Es la única lista del lote que es **100 % cruda en el payload** (`?u=` → host del
proveedor, 11 222/11 222), con **11 222 ids únicos sin duplicados ni huérfanos**, la más reciente del lote, y la
única que trae **1 `#EXT-X-STREAM-INF` + `#EXT-X-APE-SOURCE` + `#EXT-X-APE-QOE-CONTRACT` por canal**.
El mapa vigente (release `20261121215906-0wam`) ya se construyó desde ella con `dropped=0`, `added=0`.

Las otras candidatas y por qué NO: `1795150582572_CDN` es **equivalente en payload e ids** pero sin
`STREAM-INF` (0 apariciones); `1795151699916_DIRECTA(_CABLEADA)` está **MIXTA** (11 210/11 222 payloads apuntan
a **nuestro propio host** → `reconcile.js:269-272` las cuenta como *loop* y **no las mete al mapa**);
`P3_PLACEHOLDER` sí es cruda y tiene **+9 054 ids** (20 222 canales), pero **medido**: de los 11 168 ids que
comparte con la vigente, **11 160 cambian de host de origen** (`nfqdeuxu.x1megaott.store` → `evestv.wuitf.com`).
No es «añadir cobertura»: es **reescribir el origen de 11 160 canales vivos**. Además es del 15-nov y tiene
8 tags APE/canal.

---

## 1. Método — y la corrección del error medido anterior

El reconciliador v3 clasificaba leyendo **solo la cabecera** (y su propio código lo documenta:
`/opt/ape-jit/reconcile.js:147` — *«solo los primeros 512 KB puede no encontrar ni un `?u=` y responder
"no envuelta"»*). Este trabajo **no** clasifica por cabecera:

1. **Censo full-file** de cada lista (una pasada completa por fichero, sin muestreo) contando `#EXTINF`,
   líneas de tag, `?u=`, hosts y estadística de `tvg-id`.
2. **Clasificación por payload, no por URI.** Dato duro que rompe la intuición: **las 8 listas del lote tienen
   el 100 % de sus URIs apuntando a `iptv-ape.duckdns.org` con `?u=`** (11 222/11 222 y 20 222/20 222,
   `sin_u=0`). Es decir: **a nivel de URI todas están envueltas**. Lo que distingue «cruda» de «envuelta» es
   **el host del payload `?u=`**: proveedor ⇒ cruda; nuestro host ⇒ envuelta (doble salto).
3. **Muestreo inicio + medio + fin** (índices 1-5, 5 610-5 614 y últimos 5 de 11 222) para verificar que la
   clasificación aguanta en todo el fichero y no solo al principio.
4. Comparación de ids entre listas con `comm` sobre `sort -u` de `tvg-id` (ficheros temporales en `/tmp`,
   borrados al terminar; nunca en `/opt/ape-jit`).
5. **Credenciales:** ningún `?u=` se imprime. Solo se reporta **host** del payload, número de segmentos del
   path y longitud del último token. Las entradas del mapa se muestran enmascaradas.

---

## 2. Inventario del directorio `/var/www/lists/pulse`

`ls -la` (2026-11-21): 4,7 GB en total. Ficheros relevantes:

| Fichero | Bytes | mtime |
|---|---:|---|
| `APE_LISTA_1793558303852_CDN.m3u8.gz` | 161 944 562 | 2026-11-05T08:09:06 |
| `APE_LISTA_1793589060441_441VISUAL.m3u8.gz` | 161 705 122 | 2026-11-05T08:09:22 |
| `APE_LISTA_1793589060441.m3u8.gz` | 161 743 594 | 2026-11-05T08:09:38 |
| `APE_LISTA_1793787155230.m3u8.gz` | 165 668 148 | 2026-11-05T08:09:54 |
| `APE_LISTA_1794100720046.m3u8.pre-harness.gz` | 360 048 948 | 2026-11-13T08:33:02 |
| `APE_LISTA_1794100720046_P3_PLACEHOLDER.m3u8` | 237 624 878 | 2026-11-15T18:40:44 |
| `APE_LISTA_1794100720046_P5_CABLEADA.m3u8` | 521 259 | 2026-11-15T14:45:40 |
| `APE_LISTA_1794100720046_P5.m3u8` | 521 259 | 2026-11-15T14:35:40 |
| `APE_LISTA_1795150582572_CDN_LEAN.m3u8.gz` | 1 960 612 | 2026-11-20T05:16:05 |
| `APE_LISTA_1795150582572_CDN.m3u8` | 703 972 055 | 2026-11-20T05:12:30 |
| `APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8` | 708 400 298 | 2026-11-20T06:14:11 |
| `APE_LISTA_1795151699916_DIRECTA.m3u8` | 708 400 298 | 2026-11-20T05:37:30 |
| `APE_LISTA_1795153321616_CDN_CABLEADA.m3u8` | 734 128 578 | 2026-11-20T06:08:46 |
| `APE_LISTA_1795153321616_CDN.m3u8` | 734 128 578 | 2026-11-20T06:03:49 |
| `APE_PRUEBA_ORDER_OK.m3u8.gz` / `APE_PRUEBA_PERFILES.m3u8.gz` | 42 168 / 42 165 | 2026-11-05T08:09:54 |
| `probe.txt` | 5 | 2026-11-05T02:57:03 |

`APE_LISTA_*.m3u8` sin comprimir = **8 ficheros**, pero **5 identidades distintas** (pares byte-idénticos,
mismo `sha256` y mismo tamaño):

| Par | sha256 | ¿Idénticos? |
|---|---|---|
| `1795153321616_CDN` ≡ `1795153321616_CDN_CABLEADA` | `3ede7cc25339bacd900b0a8a8f4fc7dff99c7cde33cbc769046c457eb1b66f63` | **sí** (734 128 578 B) |
| `1795151699916_DIRECTA` ≡ `1795151699916_DIRECTA_CABLEADA` | `f368883dee59f84d52ea507d42c4ce713f998532f8870019dd2e876212301464` | **sí** (708 400 298 B) |
| `1794100720046_P5` ≡ `1794100720046_P5_CABLEADA` | `47fe283d27d2c010efd54b0e133fd0eb5609201d39af4c8212202a2c44a8ce9b` | **sí** (521 259 B) |

Otros `sha256` medidos: `1795150582572_CDN` = `44d755817b55c6730fc6b0752bd294f3987d7c67834009dbf70883ccdc17ab95`;
`1794100720046_P3_PLACEHOLDER` = `7f063ba10442af0d5fb1c2b862f1f93b2baf1c7f8d8c5a4c37a65f4e3b8d7fed`.

> Nota: el sufijo `_CABLEADA` **no implica contenido distinto**. En los tres pares el fichero `_CABLEADA` es
> copia byte a byte. La etiqueta nombra el **estado de cableado del lote**, no una transformación.

---

## 3. Censo completo (full-file, no cabecera)

| Lista | Canales | Ids únicos | Ids con dup | `max_dup` | Sin `tvg-id` | Líneas de tag | `#EXT-X-APE-*` | `#EXTHTTP` | `QOE-CONTRACT` | `STREAM-INF` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `1795153321616_CDN(=CABLEADA)` | 11 222 | 11 222 | 0 | 1 | 0 | 11 751 975 | 7 693 581 | 11 222 | **11 222** | **11 222** |
| `1795150582572_CDN` | 11 222 | 11 222 | 0 | 1 | 0 | 11 729 531 | 7 682 359 | 11 222 | 0 | 0 |
| `1795151699916_DIRECTA(=CABLEADA)` | 11 222 | 11 222 | 0 | 1 | 0 | 11 800 352 | 7 674 626 | 11 222 | 0 | *n.m.* |
| `1794100720046_P3_PLACEHOLDER` | 20 222 | 20 222 | 0 | 1 | 0 | 202 260 | 161 812 | 20 222 | 0 | *n.m.* |
| `1794100720046_P5(=CABLEADA)` | 11 | 11 | 0 | 1 | 0 | 255 | *n.m.* | *n.m.* | *n.m.* | *n.m.* |

**Higiene de ids: las cinco listas están limpias** (0 duplicados, 0 canales sin `tvg-id`, `max_dup=1`).
Ninguna se descarta por higiene.

Lectura de densidad: `3321616` tiene **685 tags APE por canal**; `P3_PLACEHOLDER` tiene **8 por canal**
(161 812/20 222). `P3_PLACEHOLDER` es una lista de **metadata placeholder**, no una lista finalizada.

---

## 4. Clasificación CRUDA / ENVUELTA / MIXTA — por payload, con conteo full-file

Tabla 100 % del fichero (no muestreo). `payload_NUESTRO` = `?u=` resuelve a `iptv-ape.duckdns.org` o
`178.156.147.234`; `payload_PROVEEDOR` = cualquier otro host (el origen real del stream).

| Lista | URI | `?u=` | payload NUESTRO | payload PROVEEDOR | Clase |
|---|---:|---:|---:|---:|---|
| `1795153321616_CDN(=CABLEADA)` | 11 222 | 11 222 | **0** | **11 222** | **CRUDA** |
| `1795150582572_CDN` | 11 222 | 11 222 | **0** | **11 222** | **CRUDA** |
| `1795151699916_DIRECTA(=CABLEADA)` | 11 222 | 11 222 | **11 210** | 12 | **MIXTA** |
| `1794100720046_P3_PLACEHOLDER` | 20 222 | 20 222 | **0** | **20 222** | **CRUDA** |
| `1794100720046_P5(=CABLEADA)` | 11 | 11 | 0 | 11 | CRUDA (mini, 11 canales) |

Desglose por host de proveedor:

| Lista | Proveedores (payload) |
|---|---|
| `1795153321616_CDN` | `nfqdeuxu.x1megaott.store` 11 215 · `evestv.wuitf.com` 7 |
| `1795150582572_CDN` | `nfqdeuxu.x1megaott.store` 11 215 · `evestv.wuitf.com` 7 *(idéntico)* |
| `1795151699916_DIRECTA` | `nfqdeuxu.x1megaott.store` 12 *(resto: nosotros)* |
| `1794100720046_P3_PLACEHOLDER` | `evestv.wuitf.com` 11 170 · `line.tivi-ott.net` 9 051 · `nfqdeuxu.x1megaott.store` 1 |
| `1794100720046_P5` | `evestv.wuitf.com` 6 · `line.tivi-ott.net` 5 |

### 4.1 Muestreo inicio / medio / fin (la prueba de que no es un artefacto de cabecera)

`1795153321616_CDN` — idx 1-5, 5 610-5 614 y 11 218-11 222: **los 15 puntos** con
`payload_host=nfqdeuxu.x1megaott.store`, `scheme=http`, `path_segs=4`.

`1795150582572_CDN` — los mismos 15 índices: **los 15** con `nfqdeuxu.x1megaott.store`.

`1795151699916_DIRECTA` — idx 1-5 y 5 610-5 614: `payload_host=iptv-ape.duckdns.org` (**nosotros**);
idx 11 218-11 219: nosotros; **idx 11 220-11 222: `nfqdeuxu.x1megaott.store`**. Esta es exactamente la
forma que produce el **falso negativo**: 11 210 canales envueltos y una cola cruda de 12. Clasificarla por
cabecera la etiqueta «envuelta»; clasificarla solo por la cola la etiqueta «cruda». **Las dos lecturas son
falsas**: es MIXTA.

`1794100720046_P3_PLACEHOLDER` (ventanas inicio / offset 118 812 439 / fin): `evestv.wuitf.com` al inicio,
`line.tivi-ott.net` en medio y al final, `path_segs=5`. Coherente con el censo full-file (0 payloads nuestros).

---

## 5. Comparación de cobertura de ids entre las crudas

`comm -12/-23/-13` sobre `tvg-id` únicos:

| A vs B | Comunes | Solo A | Solo B |
|---|---:|---:|---:|
| `1795153321616` vs `1795150582572` | **11 222** | 0 | 0 |
| `1795153321616` vs `1795151699916` | **11 222** | 0 | 0 |
| `1795150582572` vs `1795151699916` | **11 222** | 0 | 0 |
| `1795153321616` vs `1794100720046_P3` | 11 168 | **54** | **9 054** |

Las tres listas de 11 222 canales cubren **exactamente el mismo catálogo de ids**. `P3_PLACEHOLDER` cubre
**9 054 ids adicionales** y **no tiene 54** de los actuales.

### 5.1 Los payloads de `3321616` y `0582572` son idénticos, no solo equivalentes

- `sha256` del **conjunto ordenado de valores `?u=`**: `ce9aeac01976a57af655a8ed77fb4e61f5fcc0268a477e2e7b5ec595833e0574`
  en **las dos** (11 222 valores únicos cada una).
- Comparación **posición a posición**: `idénticos=11222 distintos=0`.
- `DIRECTA` da otra huella: `06bd187e5ed8f0dc3fb6bd321384b18a3ecac40a61f189a1780ab1b9951bbd94`.

Conclusión: `3321616` y `0582572` son **el mismo mapeo de proveedor**, y la diferencia está solo en las
líneas de declaración.

### 5.2 Diferencia exacta de tags entre `3321616` (A) y `0582572` (B)

Histograma completo de nombres de tag (`899` nombres en A, `896` en B). Solo cuatro difieren:

| Tag | A | B | Δ |
|---|---:|---:|---:|
| `#EXT-X-APE-QOE-CONTRACT` | 11 222 | **0** | +11 222 |
| `#EXT-X-APE-SOURCE` | 11 222 | **0** | +11 222 |
| `#EXT-X-APE-STREAM-TRUTH` | 11 222 | 22 444 | −11 222 |
| `#EXT-X-STREAM-INF` | **11 222** | **0** | +11 222 |

`ΔAPE = +11 222 +11 222 −11 222 = +11 222` → cuadra con `7 693 581 − 7 682 359 = 11 222`.
Traducción: **A es una lista finalizada por REA** (un `STREAM-INF` real por canal, `SOURCE`, `STREAM-TRUTH`
una sola vez y el contrato QoE por canal); **B no declara ni un `#EXT-X-STREAM-INF`** y duplica `STREAM-TRUTH`.

### 5.3 El dato que descarta P3 como «más correcta»: cambia el ORIGEN de 11 160 canales

Comparación **id → host de origen** entre `P3_PLACEHOLDER` y la vigente (una pasada por fichero, hash en
memoria, sin `sort`/`join`):

```
comunes=11168  mismo_host=8  host_distinto=11160
  igual   evestv.wuitf.com              7
  igual   nfqdeuxu.x1megaott.store      1
  CAMBIA  nfqdeuxu.x1megaott.store -> evestv.wuitf.com   11160
```

Es decir: usar `P3_PLACEHOLDER` como fuente **no añade** 9 054 canales y deja el resto igual — **reescribe el
host de origen del 99,93 % de los canales actuales**. Eso convierte el `--list` de P3 en una migración de
origen masiva, no en un cambio de fuente inocuo, y exige verificar antes que `evestv.wuitf.com` sirve esos
11 160 canales con la misma calidad (ley anti-degradación: no se cambia origen a ciegas).

---

## 6. El mapa vigente y su procedencia (medido, no heredado)

```
/opt/ape-jit/.reconciled
{"path":"/var/www/lists/pulse/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8","size":734128578,
 "mtimeMs":1795154926187.9504,"at":1795298346618,"release":"20261121215906-0wam"}

/opt/ape-jit/current -> releases/20261121215906-0wam
meta.json: {"source":"…/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8",
            "listKey":"APE_LISTA_1795153321616_CDN_CABLEADA",
            "prevKey":"APE_LISTA_1795151699916_DIRECTA_CABLEADA",
            "channels":11222,"prev_channels":11222,"dropped":0,"added":0,"sin_id":0,
            "misma_lista":false,"at":1795298346617}
```

- Release actual: `APE_JIT_LIST.m3u8` 3 574 997 B · `channels.json` 2 708 055 B · `channels_added.txt` **0 B** ·
  `channels_dropped.txt` **0 B**.
- `channels.json` = 11 222 entradas; cada entrada tiene **solo `ua` y `url`**.
- Forma de la `url` (enmascarada): `https://iptv-ape.duckdns.org/jit/live/<host-proveedor>/<user>/<pass>/<id>.m3u8`.
  Es **por diseño**: el mapa sirve por nuestro host y proxya al proveedor. No es un bucle del mapa; el «bucle»
  que el reconciliador descarta es el del **payload de origen**, no el de la URL servida.
- El `prevKey` (`DIRECTA_CABLEADA`) es justamente la lista **MIXTA**: con el `reconcile.js` actual, 11 210 de
  sus canales se contarían como *loop* (`reconcile.js:269-272`).

Regla del reconciliador que hace que lo anterior importe:

```
reconcile.js:269-272
 * si el `u=` ya es nuestro /jit/live/…, el canal NO entra al mapa
 * y se cuenta como loop; si el `u=` es del proveedor, se envuelve como siempre.
```

---

## 7. Veredicto

**LA lista fuente correcta es la vigente: `APE_LISTA_1795153321616_CDN_CABLEADA.m3u8`. No se cambia nada.**

Criterios, todos medidos:

1. **Corrección de origen (peso máximo):** 11 222/11 222 payloads al proveedor, 0 a nosotros. Es la condición
   que evita que el mapa se construya sobre sí mismo (§6). `DIRECTA` falla este criterio en el 99,89 %.
2. **Cobertura:** 11 222 ids, empatada con `0582572` y `DIRECTA`; por encima de `P5` (11). Solo `P3` la supera.
3. **Higiene:** 0 duplicados, 0 sin `tvg-id`.
4. **Frescura:** 2026-11-20T06:08:46, la más reciente de todo el directorio.
5. **Declaración:** única con `#EXT-X-STREAM-INF` (11 222), `#EXT-X-APE-SOURCE` (11 222) y
   `#EXT-X-APE-QOE-CONTRACT` (11 222). `0582572` tiene **0** `STREAM-INF`.
6. **Trazabilidad:** es la que ya produjo el release vigente con `dropped=0` / `added=0`.

### 7.1 Orden a ejecutar si se quiere **re-verificar** la vigente (sin escribir)

```bash
sudo node /opt/ape-jit/reconcile.js \
  --list /var/www/lists/pulse/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8 \
  --out  /opt/ape-jit --dry-run --verbose
```

Efecto: ninguno sobre `current/` (dry-run). Debe reportar `channels=11222`, `dropped=0`, `added=0`.

### 7.2 Orden si el operador decide **cambiar a P3** (NO recomendado; efecto medido en §5.3)

```bash
sudo node /opt/ape-jit/reconcile.js \
  --list /var/www/lists/pulse/APE_LISTA_1794100720046_P3_PLACEHOLDER.m3u8 \
  --out  /opt/ape-jit --verbose
```

Efecto declarado: `channels 11 222 → 20 222`; **entran 9 054 ids**, **salen 54**; **11 160 canales cambian
de host de origen** a `evestv.wuitf.com`; el `meta.json` registrará `LIST_CHANGED` (`misma_lista=false`) y
`channels_dropped.txt` debe nombrar esos 54. Rollback = reapuntar el symlink `current` a `releases/<anterior>`
(los 5 releases previos se conservan). **Antes de ejecutar:** probar que `evestv.wuitf.com` sirve los 11 160
ids como mínimo igual que `nfqdeuxu.x1megaott.store`.

---

## 8. Riesgos operativos que condicionan cualquier `--list`

Medidos con `systemctl list-timers` y `systemctl cat`:

| Timer | ExecStart | Cadencia |
|---|---|---|
| `ape-jit-reconcile.timer` | `/usr/bin/node /opt/ape-jit/reconcile.js` **(sin `--list`)** | ~5 min |
| `ape-cablear-auto.timer` | `/opt/ape-pulse/ape-cablear-auto.sh` | ~15 min |
| `ape-list-phantom-repair.timer` | `/usr/local/bin/ape-list-phantom-repair.sh` | ~5 min |

Consecuencias directas:

1. **Un `--list` manual no queda fijado**: a los ≤5 min el timer vuelve a ejecutar `reconcile.js` sin `--list`
   y `pickList()` elige **la lista más reciente por mtime** (`reconcile.js:126-136`, con el comentario
   explícito de que mtime es la variable correcta porque el sync de `.gz` falsifica mtimes). Hoy eso resuelve a
   `3321616_CDN_CABLEADA`, que es la correcta — pero la elección **no está pineada**.
2. **La clasificación es un blanco móvil**: `ape-cablear-auto` re-envuelve listas periódicamente. Así se
   explica que `DIRECTA` (cruda cuando se generó) tenga hoy 11 210 payloads apuntando a nosotros. **Cualquier
   censo debe repetirse inmediatamente antes de decidir**, y este documento caduca con el siguiente ciclo.
3. Si el operador quiere que la fuente quede **fijada**, hace falta **pinear** (p.ej. `--list` en la unidad
   systemd o un fichero de selección que `pickList()` honre). Eso es un cambio de infraestructura y **no se
   ejecutó aquí**: queda como decisión explícita.

---

## 9. Reproducibilidad (comandos exactos usados)

```bash
# censo full-file de cada lista
awk '/^#EXTINF/{...} /^#/{...} NF{...}' <lista>      # EXTINF, tags, ?u=, hosts, tvg-id

# clasificación por payload (100% del fichero)
awk 'function auth(s){a=s;sub(/^[a-zA-Z0-9+.-]+:\/\//,"",a);sub(/[\/?].*/,"",a);return a}
     /^#EXTINF/{next} /^#/{next} NF{ p=index($0,"?u="); ... }' <lista>

# huella del conjunto de payloads
awk '... print s }' <lista> | sort | sha256sum

# ids
awk '/^#EXTINF/{if(match($0,/tvg-id="[^"]*"/)){id=substr($0,RSTART+8,RLENGTH-9); if(id!="")print id}}' <lista> | sort -u
comm -12 /tmp/r5_A.ids /tmp/r5_B.ids   # comunes; -23 solo A; -13 solo B

# histograma de tags y diff
awk '/^#/ && !/^#EXTINF/{n=$0;sub(/:.*/,"",n);c[n]++} END{for(k in c)printf "%s\t%d\n",k,c[k]}' <lista> | sort
join -t$'\t' -a1 -a2 -e0 -o 0,1.2,2.2 A.tsv B.tsv | awk -F'\t' '$2!=$3'
```

---

## 10. NO COMPUTADO

1. **Vida real de los 9 054 ids nuevos de `P3_PLACEHOLDER`** (¿responden?). No se sondeó ningún proveedor: la
   tarea es de auditoría de listas y un probe a 9 054 orígenes ajenos excede su alcance. Consecuencia: se sabe
   **qué** cambia (11 160 orígenes + 9 054 altas) pero **no si esos orígenes sirven**.
   *(El mapeo id→host, que en una primera pasada quedó sin computar porque un `join` sobre entradas sin ordenar
   no terminó a tiempo, **sí quedó medido** en la segunda pasada — ver §5.3.)*
2. **Contenido de los `.gz` de 2026-11-05** y de `1794100720046.m3u8.pre-harness.gz` (160-360 MB cada uno): no
   se descomprimieron. Se descartan como fuente por antigüedad (5 nov / 13 nov) y porque su `.m3u8` equivalente
   ya no está en el lote; **no se afirma nada sobre su contenido**.
3. **`1795150582572_CDN_LEAN.m3u8.gz`** (1 960 612 B, 2026-11-20T05:16): no se auditó su contenido; por nombre y
   tamaño es una proyección reducida, no una lista de catálogo. No se usa como fuente.
4. **`STREAM-INF` detallado de `1795151699916_DIRECTA`**: se midieron `APE=7 674 626` y `EXTHTTP=11 222`, pero
   **no** el conteo de `STREAM-INF` (marcado *n.m.*). No afecta al veredicto: DIRECTA queda descartada por payload.
