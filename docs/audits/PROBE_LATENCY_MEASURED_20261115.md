# COSTE REAL DE UN PROBE AL SINTONIZAR — medido, con percentiles

**Tarea:** t75 · **Autor:** http-prober · **Fecha:** 2026-11-15 · **Kind:** work
**VPS:** 178.156.147.234 (sólo se escribió en `/tmp` y `/var/lib/ape`, como autoriza el encargo)

---

## 0. RESULTADO EN SEIS LÍNEAS

1. **Un probe completo cuesta p50 ≈ 1,65 s por canal** (manifest 0,65 s + primer segmento 0,92 s + ffprobe 0,08 s). Frente a un presupuesto de **5 ms**, sobra un factor **≈330×**.
2. **El lookup NO es el problema**: en memoria cuesta **0,000 ms** (p95 0,001) y una lectura de tabla SQLite por id **0,0029 ms** (p99 0,018). Los dos caben en 5 ms con holgura de 3 órdenes de magnitud.
3. **Lo que sí se come el presupuesto es `json_decode` del índice: p50 4,04 ms, p95 4,77 ms, p99 6,61 ms** para 21.224 canales (1,49 MB). Es decir: **sin caché, cargar el índice agota los 5 ms él solo**, y lo paga cada petición.
4. **El primer segmento no pesa 1,6 MB como asumía la herramienta: p50 4,30 MB, máx 16,74 MB.** Eso cambia la cuenta del censo: **108 GB** de tráfico, no 34 GB.
5. **Firmas reales: 3** por (host + ruta) — las credenciales son idénticas por host (`/live/<user>/<pass>`) — y **9** por (host, perfil). Probar 1 por firma cubre el 100% de las *cuentas*, pero **no da confianza estadística** sobre la heterogeneidad interna.
6. **Mínimo de probes para una proporción con ±5% y 95%: 378** (global). **±3%: 1.017 · ±1%: 6.613.** Lo que **NO** se puede alcanzar está en §7.

---

## 1. QUÉ SE MIDIÓ, CON QUÉ, Y DÓNDE ESTÁ EL ARTEFACTO

| Pieza | Cómo |
|---|---|
| (a) manifest server-side | **Endpoint del proyecto** `probe-manifest.php` (SSRF-safe): devuelve `elapsedMs` medido por él |
| (a') petición PHP completa | cronómetro alrededor de la llamada HTTP (incluye cargar el índice) |
| (b) manifest crudo + primer segmento | harness propio en `/tmp/t75_measure.py`, mismo UA `OTT Navigator/1.7.3.3` y misma lógica que `ape-probe-deep.sh` |
| (c) ffprobe sobre el segmento | `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,avg_frame_rate` |
| lookup memoria / tabla disco | `/tmp/t75_lookup.php` (PHP 8.3.6, APCu + sqlite3 + OPcache) |
| firmas | `/tmp/t75_sig.py` y `/tmp/t75_groups.py` sobre `ch-url-index.json` + la lista servida **en lectura** |

**Artefactos** (en el VPS, `sha256` calculado con `sha256sum`):

```
087b5290dd69aff96d32d15e460956c7251a969cae9abc6c77169abd9b371eb7  /var/lib/ape/t75_measure.jsonl
e800242d7413cfa2c60584b3eef92874ea4d3ba49ab18f5f8a953906d7869687  /var/lib/ape/t75_run.log
7a2e18d699d2158dfc8904f2770e31b885c2f0912d19d18d07bb481717774067  /var/lib/ape/t75_measure.py
38955a03ec93cb45e2ad4a1ca18654f61049097e874da00ee02b9bbc271fbba4  /var/lib/ape/t75_lookup.php
```

**N real: 41 canales** = **20** (evestv.wuitf.com) + **20** (line.tivi-ott.net) + **1** (nfqdeuxu.x1megaott.store).
El tercer host tiene **un solo canal en todo el catálogo** (población = 1), así que su N no es una decisión de muestreo: es el universo entero.

---

## 2. (a) FETCH DEL MANIFEST SERVER-SIDE — `elapsedMs` del endpoint

Milisegundos. Percentil por orden estadístico (`sorted[i]`, `i = floor(q·(n-1))`).

| host | N | min | **p50** | **p95** | **p99** | max |
|---|---|---|---|---|---|---|
| evestv.wuitf.com | 20 | 402 | **504** | **5.526** | **5.526** | 8.223 |
| line.tivi-ott.net | 20 | 309 | **737** | **948** | **948** | 8.301 |
| nfqdeuxu.x1megaott.store | 1 | 212 | 212 | *NO COMPUTADO* | *NO COMPUTADO* | 212 |
| **TOTAL** | **41** | 212 | **645** | **5.526** | **8.223** | **8.301** |

**Lectura honesta:** el p50 está en 0,5–0,74 s, pero la cola se dispara a 5,5–8,3 s. Esa cola **no es latencia del proveedor: es el techo del endpoint**. `probe-manifest.php` declara `TIMEOUT_S = 8` y hay **2 timeouts medidos** (`Operation timed out after 8002 milliseconds`) más un `403`. Ver §6 para la censura.

## 3. (a') PETICIÓN PHP COMPLETA (índice + fetch)

| host | N | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| evestv.wuitf.com | 20 | 416,58 | **518,30** | 5.541,70 | 5.541,70 | 8.239,58 |
| line.tivi-ott.net | 20 | 356,59 | **751,01** | 973,64 | 973,64 | 8.322,91 |
| nfqdeuxu.x1megaott.store | 1 | 225,32 | 225,32 | *NO COMPUTADO* | *NO COMPUTADO* | 225,32 |
| **TOTAL** | **41** | 225,32 | **662,78** | 5.541,70 | 8.239,58 | 8.322,91 |

Diferencia con (a): **~14 ms** de envoltorio PHP (carga de índice + parseo + overhead). Coincide con lo medido en §5.

## 4. (b) MANIFEST CRUDO Y PRIMER SEGMENTO

### (b1) manifest, cronometrado por el harness

| host | N | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| evestv.wuitf.com | 20 | 405,26 | **480,37** | 1.636,58 | 1.636,58 | 3.020,24 |
| line.tivi-ott.net | 20 | 310,17 | **689,84** | 878,10 | 878,10 | 3.116,18 |
| nfqdeuxu.x1megaott.store | 1 | 238,93 | 238,93 | *NO COMPUTADO* | *NO COMPUTADO* | 238,93 |
| **TOTAL** | **41** | 238,93 | **657,08** | 1.636,58 | 3.020,24 | 3.116,18 |

### (b2) primer segmento (bajado del host del redirect)

| host | N | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| evestv.wuitf.com | 19 | 715,31 | **892,89** | 1.251,45 | 1.251,45 | 1.610,79 |
| line.tivi-ott.net | 19 | 774,43 | **1.009,39** | 1.081,23 | 1.081,23 | 10.602,78 |
| nfqdeuxu.x1megaott.store | **0** | — | *NO COMPUTADO* | *NO COMPUTADO* | *NO COMPUTADO* | — |
| **TOTAL** | **38** | 715,31 | **924,95** | 1.251,45 | 1.610,79 | **10.602,78** |

**N=38 y no 41** porque 3 canales no dieron manifest y el del tercer host tampoco dio segmento. Se declara, no se rellena.

**Tamaño de lo que se baja** (esto es lo que cuesta el probe en tráfico):

```
N=38 · p50 = 4.301.158 B (4,30 MB) · max = 16.736.700 B (16,74 MB) · suma = 193,5 MB
=> 5,09 MB por canal (media de la muestra)
```

## 5. (c) FFPROBE SOBRE EL SEGMENTO

| host | N | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| evestv.wuitf.com | 19 | 68,69 | **82,65** | 109,67 | 109,67 | 111,52 |
| line.tivi-ott.net | 19 | 69,58 | **90,41** | 137,05 | 137,05 | 155,11 |
| nfqdeuxu.x1megaott.store | 0 | — | *NO COMPUTADO* | *NO COMPUTADO* | *NO COMPUTADO* | — |
| **TOTAL** | **38** | 68,69 | **83,12** | 127,51 | 137,05 | 155,11 |

ffprobe es **barato** (~83 ms): el coste está en la red, no en el análisis.

**Alturas realmente medidas** en esta muestra: `1920x1080` ×20, `1280x720` ×9, `720x576` ×5, `1024x576` ×2, `960x540` ×1, `720x404` ×1.
Coincide con el rango ya reportado (360–2160): **este catálogo NO es 4K de forma mayoritaria**, por eso el multiplicador a 3240 px llega a x9,00.

### Coste total por canal (suma de p50)

```
manifest 0,645 s + primer segmento 0,925 s + ffprobe 0,083 s = 1,653 s por canal
Presupuesto 5 ms -> 1,653 / 0,005 = 330,6x
```

---

## 6. PRESUPUESTO DE 5 ms: LOOKUP EN MEMORIA vs TABLA EN DISCO vs CARGAR EL ÍNDICE

PHP 8.3.6, N=300 iteraciones por métrica (30 en las de arranque). Milisegundos.

| Métrica | n | min | **p50** | p95 | p99 | max | vs 5 ms |
|---|---|---|---|---|---|---|---|
| **lookup en array PHP** (índice ya decodificado) | 300 | 0,000 | **0,000** | 0,001 | 0,001 | 0,0012 | bajo la resolución del cronómetro (<0,0005 ms) |
| **lookup vía APCu** (array cacheado) | 300 | 0,000 | **0,000** | 0,001 | 0,0012 | 0,0012 | bajo la resolución del cronómetro (<0,0005 ms) |
| **tabla SQLite: `SELECT url FROM ch WHERE id=?`** | 300 | 0,0019 | **0,0029** | 0,006 | 0,0179 | 0,0331 | **~1.700× por debajo** |
| abrir conexión SQLite + `SELECT 1` | 20 | 0,0219 | **0,0229** | 0,0331 | 0,0331 | 0,0739 | 218× por debajo |
| leer el índice JSON del disco (1.485.312 B) | 30 | 0,1352 | **0,1581** | 1,065 | 1,090 | 1,0951 | 31× por debajo |
| **`json_decode` del índice (21.224 canales)** | 30 | 3,8111 | **4,0410** | **4,7669** | **6,6059** | 7,3779 | **el presupuesto ENTERO** |

**Conclusión medible:** el lookup y la lectura de tabla **no son el cuello de botella**: el array está por debajo de la resolución del cronómetro de PHP (<0,0005 ms) y SQLite tarda 2,9 µs. El problema es que el endpoint, tal como está escrito, hace `json_decode` del índice en **cada** petición: **p50 4,04 ms y p99 6,61 ms**. Sin caché, el presupuesto de 5 ms se agota **antes** de hablar con el proveedor.
**Arreglo obvio y medido:** cachear el array en **APCu** (0,000 ms) o leer de **SQLite** por id (0,0029 ms). Los dos dejan el presupuesto libre para la red.

---

## 7. FIRMAS: CUÁNTOS PROBES HACEN FALTA DE VERDAD

### 7.1 Por estructura de URL (host + ruta)

```
firmas (host):                        3
firmas (host + directorio completo):  3
credenciales: UNA sola ruta /live/<user>/<pass> por host
   evestv.wuitf.com          -> /live/2RHAVYWB/SDXH4MYV      (11.350 canales)
   line.tivi-ott.net         -> /live/3JHFTC/U56BDP          ( 9.873 canales)
   nfqdeuxu.x1megaott.store  -> /live/2E2ETBH3/HZHXPBUD      (     1 canal)
extensión: m3u8 en 21.224/21.224
```

**3 firmas.** Probar 1 por firma cubre el **100% de las cuentas de proveedor**, y con eso se aprende la resolución típica de cada cuenta.

### 7.2 Por (host, perfil declarado) — 9 grupos, los mismos que ya reportó la herramienta

| host | perfil | canales |
|---|---|---|
| evestv.wuitf.com | P3 | 11.170 |
| line.tivi-ott.net | P3 | 9.051 |
| line.tivi-ott.net | P1 | 760 |
| evestv.wuitf.com | P1 | 173 |
| line.tivi-ott.net | P4 | 57 |
| evestv.wuitf.com | P5 | 6 |
| line.tivi-ott.net | P5 | 5 |
| nfqdeuxu.x1megaott.store | P3 | 1 |
| evestv.wuitf.com | P4 | 1 |
| **TOTAL** | | **21.224** |

### 7.3 Mínimo de probes para cubrir 21.224 canales, con qué confianza

Muestreo para estimar una **proporción** (p=0,5 el caso más exigente, z=1,96 = 95%, con corrección por población finita):

| Ámbito | N | ±10% | **±5%** | ±3% | ±1% |
|---|---|---|---|---|---|
| catálogo completo | 21.224 | 96 | **378** | 1.017 | 6.613 |
| host evestv | 11.350 | 96 | **372** | 976 | 5.203 |
| host line | 9.873 | 96 | **370** | 964 | 4.869 |
| host x1megaott | 1 | 1 | 1 | 1 | 1 |

**Respuesta corta:** **378 probes** dan ±5% con 95% de confianza sobre «qué fracción del catálogo es X» (p.ej. cuántos son 1080p reales). **1.017** dan ±3%. **3** probes (una por firma) dan cobertura del 100% de las cuentas, pero **confianza estadística ~0** sobre la mezcla interna.

### 7.4 Qué confianza NO se puede alcanzar

| Lo que se querría | Por qué no se puede |
|---|---|
| **Verdad por canal** | Requiere **censo: 21.224 probes**. Medido: **108,1 GB** de tráfico (5,09 MB/canal × 21.224) y **9,7 h en secuencial** (0,6 h con 16 en paralelo). Y ni así es «verdad»: es una foto del instante (el índice está fechado `built: 2026-11-15T14:23:33Z`) |
| **p95 y p99 por host fiables** | Con **n=20**, el p95 es el **19.º de 20** y el p99 es **el máximo**: no son percentiles, son el extremo de la muestra. Para que el p99 sea utilizable hacen falta **n≈1.000** (≈10 puntos por encima). Ver §9 |
| **p99 por canal** | Necesitaría ~1.000 muestras **por canal** = ~21 millones de probes |
| **Latencia fuera de la ventana medida** | La tanda se hizo en **una sola ventana horaria**. Variación diurna/semanal: **NO COMPUTADO** |
| **El techo real del proveedor cuando cuelga** | Censurado por `TIMEOUT_S=8` del endpoint (§8) |

---

## 8. CENSURA: LOS 8,2 s NO SON LATENCIA DEL PROVEEDOR

`probe-manifest.php` fija `TIMEOUT_S = 8`. En la muestra:

```
a_err: 5/41
   96607     HTTP 403
   1364673   FETCH_FAILED: Operation timed out after 8002 milliseconds with 0 bytes received
   734065    FETCH_FAILED: Operation timed out after 8002 milliseconds with 0 bytes received
b_manifest_err: 3/41
   96607     HTTPError: HTTP Error 403: Forbidden
   961138    HTTPError: HTTP Error 407: Proxy Authentication Required
   34296     HTTPError: HTTP Error 406: Not Acceptable
```

`httpStatus` observados por el endpoint: **200 ×36 · 302 ×2 · 403 ×1 · 407 ×1 · 406 ×1**.
Por tanto los máximos de 8.223 / 8.301 ms son **el techo impuesto por el endpoint**, no cuánto tarda el proveedor. **La latencia real de un canal colgado es NO COMPUTADO** con esta herramienta.

**Tasa de fallo útil para el diseño:** **3 de 41 (7,3%)** no dieron manifest por bloqueo del proveedor (403/406/407) — el `407` es especialmente relevante: el proveedor pide autenticación de proxy para ese canal.

---

## 9. POR QUÉ p95/p99 CON N=20 HAY QUE LEERLOS CON CUIDADO

Orden estadístico: para que el cuantil *q* quede dentro de la muestra con puntos por encima, hace falta `n·(1-q) ≥ 5`:

| cuantil | n=20 | n=100 | n=300 | n=1000 |
|---|---|---|---|---|
| p50 | 10 pts → utilizable | 50 → utilizable | 150 → utilizable | 500 → utilizable |
| p95 | **1 pt → marginal (es el máximo)** | 5 → utilizable | 15 → utilizable | 50 → utilizable |
| p99 | **0,2 pts → NO COMPUTABLE** | 1 → marginal | 3 → marginal | 10 → utilizable |

Los p95/p99 de §2–§5 **están publicados porque el encargo los pide**, pero su lectura correcta es: *«p95 con n=20 es el segundo peor de la muestra»* y *«p99 con n=20 es el máximo»*. No son estimadores estables de la cola.

---

## 10. NO COMPUTADO (declaración explícita)

| Item | Razón |
|---|---|
| Percentiles del host `nfqdeuxu.x1megaott.store` | **N=1**: la población entera es 1 canal. Un percentil con n=1 no existe; se reporta el único valor (212 ms manifest) y NO un p50/p95/p99 |
| p95/p99 de (b2) y (c) para el tercer host | 0 segmentos válidos: ese canal no entregó segmento |
| Latencia real de un canal colgado | Censurada por `TIMEOUT_S=8` del endpoint; los máximos son el techo, no la medida |
| Variación diurna / semanal de la latencia | Una sola ventana de medición. Sin serie temporal |
| Varianza **dentro** de cada firma (host+cuenta) | Con N=20 por host no se puede separar varianza «de cuenta» de varianza «de canal» |
| Coste de `ffprobe` con ffprobe ya caliente en caché de SO | No se controló el estado de caché; los valores incluyen lo que hubiera |
| Coste real de un probe con caché APCu **en el endpoint** | Medí APCu aislado (0,000 ms), pero **no** modifiqué `probe-manifest.php` (prohibido: no reescribir herramientas). El ahorro es una inferencia medida en piezas, no en el endpoint completo |

---

## 11. COMANDOS LITERALES USADOS

```bash
# 0) inventario y hashes de las herramientas (solo lectura)
ssh root@178.156.147.234 "ls -l /opt/ape-pulse/ape-probe-deep.sh \
  /var/www/html/prisma/api/probe-manifest.php /var/lib/ape/ch-url-index.json \
  /opt/ape-pulse/ape-build-ch-index.sh"

# 1) estructura del índice (script escrito por stdin en /tmp, ejecutado aparte)
ssh root@178.156.147.234 "cat > /tmp/t75_index.py"    # <- se le pasó el script por stdin
ssh root@178.156.147.234 "python3 /tmp/t75_index.py"
#   claves top: ['version','built','source','count','from_pulse','from_direct','urls']
#   canales en urls: 21224 · hosts distintos: 3

# 2) prueba de alcance del endpoint antes de la tanda larga
ssh root@178.156.147.234 "curl -sk -m 15 -H 'Host: iptv-ape.duckdns.org' \
  'https://127.0.0.1/prisma/api/probe-manifest.php?ch=31664'"
#   -> {"ok":true,...,"httpStatus":200,"elapsedMs":519,"kind":"media",...}

# 3) TANDA DE MEDICIÓN (41 canales = 20 + 20 + 1, semilla 75), en segundo plano
ssh root@178.156.147.234 "cat > /tmp/t75_measure.py"   # <- script por stdin
ssh root@178.156.147.234 "cd /tmp && nohup python3 /tmp/t75_measure.py > /tmp/t75_run.log 2>&1 &"
#   fases por canal: (a) elapsedMs del endpoint · (b1) manifest crudo · (b2) primer
#   segmento · (c) ffprobe; escribe /var/lib/ape/t75_measure.jsonl

# 4) percentiles por host y fase
ssh root@178.156.147.234 "cat > /tmp/t75_stats.py"
ssh root@178.156.147.234 "python3 /tmp/t75_stats.py"

# 5) lookup en memoria vs tabla SQLite vs json_decode
ssh root@178.156.147.234 "cat > /tmp/t75_lookup.php"
ssh root@178.156.147.234 "php /tmp/t75_lookup.php"

# 6) firmas
ssh root@178.156.147.234 "python3 /tmp/t75_sig.py"      # host + ruta  -> 3
ssh root@178.156.147.234 "python3 /tmp/t75_groups.py"   # host+perfil -> 9

# 7) persistencia de artefactos y hashes
ssh root@178.156.147.234 "cp -f /tmp/t75_run.log /var/lib/ape/t75_run.log"
ssh root@178.156.147.234 "sha256sum /var/lib/ape/t75_measure.jsonl /var/lib/ape/t75_run.log \
  /var/lib/ape/t75_measure.py /var/lib/ape/t75_lookup.php"
```

**Lo que NO se hizo:** no se escribió nada en `/var/www/html`, ni en `/var/www/lists`, ni en `/etc/nginx`, ni en `/opt/ape-pulse`. La lista servida se abrió **sólo en lectura** para leer los `ape-profile`. `probe-manifest.php` y `ape-probe-deep.sh` **no se modificaron**.

---

## 12. TRES CONCLUSIONES OPERATIVAS

1. **Cachear el índice (APCu o SQLite) es obligatorio** antes de meter un probe en la ruta de sintonización: el `json_decode` solo ya cuesta 4,04 ms de los 5 disponibles.
2. **El probe NO cabe en la ruta interactiva de zapping**: 1,65 s de p50 (y 5,5–8,3 s en cola) es un orden de magnitud de un arranque de canal. Su sitio es **asíncrono** (precálculo por firma) o **bajo demanda explícita**, nunca bloqueando el zapping.
3. **Con 3 firmas y 378 probes se cubre lo que hace falta para clasificar**, no para afirmar verdad por canal. Cualquier afirmación del tipo «este canal concreto es X» exige medirlo, y eso son 5,09 MB y 1,65 s por canal.
