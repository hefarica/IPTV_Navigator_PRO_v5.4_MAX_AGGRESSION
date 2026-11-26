# Cableado: leer la lista real y contar lo que se lee (2026-11-20)

Estado: **VERIFICADO end-to-end** · Entorno: VPS `178.156.147.234` (`iptv-ape.duckdns.org`)
Ticket de prueba: `t-1795154452384-06l7uehu`

## 1 · Síntoma que reportó el operador

El panel de cableado mostraba `failed · E_LISTA_ES_SYMLINK` y, en las corridas que sí terminaban,
`progreso.canales = 0` sobre una lista de 675,60 MB / 11.222 canales. Lectura del operador:
"no lee absolutamente todo".

## 2 · Cadena de defectos medida (tres capas)

| # | Capa | Defecto medido | Evidencia |
|---|------|----------------|-----------|
| 1 | `list_cablear_core.php` (encolado) | elegía `/lists/<nombre>` — el **stub de 8–42 B** de la REGLA 84 — y se lo pasaba al worker | `entrada.path` del ticket fallido apuntaba a `/lists/...`; `canales: 0` |
| 2 | `ape-cablear-queue-worker.sh` (worker) | barrera `[ "$rdir" = "$(pwd -P de $LISTS)" ]`: exigía **igualdad exacta** con `/var/www/lists`, así que rechazaba `/var/www/lists/pulse/` aunque estuviera dentro | ticket `failed · E_LISTA_FUERA_DE_LISTS · path real fuera de /lists: /var/www/lists/pulse` |
| 3 | `ape-cablear-queue-worker.sh` (reporte) | nunca escribía `progreso.*`; el ticket se cerraba con **ceros** aunque el fichero tuviera 11.222 canales | `progreso:{lineas:0,canales:0,envueltos:0,ya_estaban:0,sin_id:0,bytes_salida:0}` con `salida.bytes=708400298` |

Los tres arreglos: (1) resolver como nginx (`try_files` prueba `pulse/` primero) — ya estaba aplicado
en el core; (2) barrera por **contención** contra `realpath($LISTS)` en vez de igualdad, conservando
`pwd -P` (un enlace que apunte fuera sigue rechazado); (3) contar la salida y el origen y escribirlos
en el ticket.

## 3 · Artefacto entregado (medido sobre HTTP, no sobre el disco)

```
GET https://iptv-ape.duckdns.org/lists/APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8
HTTP/2 200 · content-length: 708078781 · x-ape-list-source: pulse-wrapped-if-present
#EXTINF  11222
URLs /pulse/  11222
líneas  11834021
líneas ni # ni http ni vacías  0
```

El fichero en disco que produce el worker (`/var/www/lists/..._CABLEADA.m3u8`) es
`708400298 B · sha256 f368883dee59f84d52ea507d42c4ce713f998532f8870019dd2e876212301464`.
Lo que sirve nginx es `pulse/<nombre>` (708078781 B), producido por **ape-pulse-sync**
(`/var/log/ara/pulse-sync.log: wrap ... (675MB, mode=cartridge, policy=1)`). La diferencia de
321.517 B es el token `d=` regenerado por el envoltorio (ver §5).

## 4 · Cambios aplicados

- `vps/prisma/api/list_cablear_core.php` — resolución `pulse/` → `lists/` → stub con tamaño del `.gz`.
- `vps/bin/ape-cablear-queue-worker.sh` — barrera por contención; conteo real
  (`progreso.lineas/canales/envueltos/ya_estaban/sin_id/bytes_salida`).

Se **descartó** una optimización intermedia que publicaba un enlace cuando no había nada que envolver:
el artefacto servido no es ese fichero sino `pulse/`, así que el enlace creaba dos nombres con
contenido divergente. Revertido con la evidencia del pipeline.

## 5 · `ape-pulse-wrap.js`: dos mutaciones silenciosas — CORREGIDAS (orden del operador)

El envoltorio que produce el artefacto servido mutaba dos cosas que la lista ya traía bien.
Ambas se midieron sobre `APE_LISTA_1795151699916_DIRECTA_CABLEADA` y ambas están corregidas.

### 5.1 · Token `d=` reescrito (perdía `hdr` y `p`)

```
origen    d={"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":30,"hdr":"sdr","p":"P3"}
entregado d={"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":60}
```

−321.517 B repartidos en 11.222 canales. `rebuildDeviceData()` reescribía el `d=` con la
resolución del `#EXT-X-APE-STREAM-TRUTH`. Ahora `deviceTokenUsable()` devuelve la URL
**verbatim** cuando el `d=` ya decodifica a un objeto; sólo se reconstruye si falta o está
corrupto (el caso para el que se escribió la función).

### 5.2 · Nombres de canal con UTF-8 multibyte corrompidos

`d.toString('utf8')` por trozo: una secuencia multibyte partida entre dos chunks se decodifica
como dos fragmentos inválidos y Node la sustituye por U+FFFD.

```
entrada  tvg-name="✦●✦ GENERAL HD✦●✦ [MEGA]"     (línea 8.450.535, canal 125649)
salida   tvg-name="���●✦ GENERAL HD✦●✦ [MEGA]"   0xE2 0x9C 0xA6 → 3× U+FFFD = +6 B
```

Corregido con `string_decoder.StringDecoder`, que arrastra los bytes incompletos al trozo
siguiente.

### 5.3 · Prueba de que no queda mutación

```
cmp  lists/..._CABLEADA.m3u8  pulse/..._CABLEADA.m3u8   →  IDÉNTICOS
tamaño ambos                                            →  708400298
GET (identity)                                          →  content-length 708400298
sha256 entregado                                        →  f368883dee59f84d…  (= el del worker)
#EXTINF 11222 · URLs /pulse/ 11222
```

Es decir: lo que se produce y lo que se sirve son ya el mismo byte a byte.

### 5.4 · Artefactos ya publicados de otras listas: NO reparables desde disco

Para las listas del panel, `lists/<n>.m3u8` es un **symlink** a `pulse/<n>.m3u8`: la única copia
en disco es ya la envuelta. Re-envolverla no recupera el `d=` original (no existe en disco) ni
repara un nombre ya sustituido (el U+FFFD está en el origen). Sólo se regeneran re-exportando
desde el panel. Los artefactos cableados, que sí tienen fichero real en `lists/`, se regeneran
re-ejecutando el cableado + `ape-pulse-sync.sh --force --only <base>`.

## 6 · Disco

Antes: 2.353 MB libres (94 %). Se liberaron 1.571.954.772 B de archivos del agente (tarballs de junio),
492 MB de journal y scratch de `/tmp`, y después —con orden explícita del operador— las generaciones
`1794783650337` y `1795114283307` (6.643.914.724 B inventariados en
`/root/ape-reclaim-20261120/inventario-glob.txt` antes de borrar).
Después: **8.912 MB libres (76 %)**.

## 7 · Reproducir

```bash
# 1. encolar (form-urlencoded; JSON NO se parsea: el endpoint lee $_POST)
curl -sS -X POST https://iptv-ape.duckdns.org/prisma/api/cablear.php \
  --data-urlencode 'lista=APE_LISTA_1795151699916_DIRECTA.m3u8' --data 'publicar=1' --data 'forzar=1'

# 2. estado
curl -sS 'https://iptv-ape.duckdns.org/prisma/api/cablear-estado.php?ticket=<ticket>'

# 3. lo que se sirve de verdad
curl -sS -H 'Accept-Encoding: identity' \
  https://iptv-ape.duckdns.org/lists/APE_LISTA_1795151699916_DIRECTA_CABLEADA.m3u8 \
  | grep -c '^#EXTINF'   # 11222
```

## 8 · NO COMPUTADO

- No se ha probado el cableado de una lista **sin** URLs envueltas (`envueltos > 0`): las tres listas
  disponibles ya vienen envueltas por el panel, así que la rama de envoltura no se ejercitó en esta
  sesión. Medido: `envueltos=0`, `ya_estaban=11222`.
- No se ha instalado la lista cableada en un dispositivo real (sin ADB disponible).
