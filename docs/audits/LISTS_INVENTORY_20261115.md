# INVENTARIO Y SEGUIMIENTO DE LAS 14 LISTAS SERVIDAS

**Tarea:** t89 · **Autor:** canary-auditor · **Fecha:** 2026-11-15 · **Modo:** **SOLO LECTURA** (no se ha modificado ninguna lista, ni el VPS, ni el OTT, ni la APK; no se ha tocado `/opt/ape-jit`).

## 0. Aviso de alcance, antes de la tabla

**No tengo acceso al VPS desde esta sesión**: cualquier comando con `ssh` es **rechazado por la política del harness antes de ejecutarse** (mismo bloqueante documentado en `CANARY_STACK_FORENSICS_20261114.md` §0 y en `502_FORENSIC_20261114.md` §0). Por tanto:

| Se afirma con verificación local | Se cita de la medición del capitán | Se declara `NO_COMPUTADO` |
|---|---|---|
| **la causa de los 57 B** (§5.1, código `:70`) · **las reglas de clasificación** (§2, código de `ape-list-light.sh` / `ape-list-project.sh`) · **la partición aritmética de canales** (§5.3) · **los duplicados por bytes** (§5.2) | la tabla de bytes/canales/pulse de §1 | **quién consume cada lista** (§3) y **el hueco del device** (§4): requieren el log de nginx |

---

## 1. Inventario (cifras del capitán, con mis comprobaciones aritméticas al lado)

| # | Lista | Bytes | Canales | `/pulse/` | Clase (§2) | Comprobación |
|---|---|---:|---:|---:|---|---|
| 1 | `APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` | 250.932.745 | 21.224 | 21.224 | **LIGHT** | 0,193 × la completa |
| 2 | `APE_LISTA_1794100720046_CABLEADA.m3u8` | **1.298.222.092** | 21.224 | 21.224 | **COMPLETA** | coincide con el baseline (t42) |
| 3 | `APE_LISTA_1794100720046_P3_CABLEADA_LIGHT.m3u8` | 238.198.463 | 20.222 | 20.222 | **LIGHT+P3** | **duplicado exacto de #4** |
| 4 | `APE_LISTA_1794100720046_P3_CABLEADA_LIGHT_CABLEADA.m3u8` | 238.198.463 | 20.222 | 20.222 | **LIGHT+P3** | **duplicado exacto de #3** |
| 5 | `APE_LISTA_1794100720046_P3_CABLEADA.m3u8` | 240.723.972 | 20.222 | 20.222 | **PERFIL** | **Δ 41 B con #6** |
| 6 | `APE_LISTA_1794100720046_P3.m3u8` | 240.724.013 | 20.222 | 20.222 | **PERFIL** | **Δ 41 B con #5** |
| 7 | `APE_LISTA_1794100720046_P1.m3u8` | 12.626.302 | 933 | 933 | **PERFIL** | 933 ✓ |
| 8 | `APE_LISTA_1794100720046_P4.m3u8` | 1.199.384 | 58 | 58 | **PERFIL** | 58 ✓ |
| 9 | `APE_LISTA_1794100720046_P5.m3u8` | 516.221 | 11 | 11 | **PERFIL** | **mismo tamaño que #10** |
| 10 | `APE_LISTA_1794100720046_P5_CABLEADA.m3u8` | 516.221 | 11 | 11 | **PERFIL** | **mismo tamaño que #9** |
| 11 | `APE_LISTA_1794100720046_P5_CABLEADA_LIGHT.m3u8` | 156.075 | 11 | 11 | **LIGHT+P5** | 0,302 × #9 |
| 12 | `APE_PRUEBA_PERFILES.m3u8` / `APE_PRUEBA_ORDER_OK*.m3u8` | 163.187 | 3 | **0** | **SIN_SALIDA** | **es un glob: pueden ser ≥2 ficheros** |
| 13 | `ape_jit_latest.m3u8` | **57** | *(21.224)* | *(21.224)* | **ENLACE, no lista** | **§5.1: es un symlink** |

> **Nota sobre el «14».** Las filas son **13** porque la 12 **agrupa un glob** (`APE_PRUEBA_ORDER_OK*.m3u8`). El número real de ficheros en `/var/www/html/lists` **`NO_COMPUTADO`** hasta correr el §6 con `--full`. Declararlo importa: si el glob son 2 ficheros, hay 14; si son 3, hay 15.

---

## 2. Clasificación de output — reglas sacadas del CÓDIGO, no inventadas

| Clase | Regla operativa | Fuente |
|---|---|---|
| **LIGHT** | **lista blanca**: se conservan `#EXTM3U`, `#EXTINF`, `#EXTHTTP`, `#EXTSHIMOTT` y los `#EXT-X-<estándar>`; **cae todo lo propietario** (APE, VNOVA-LCEVC, PHANTOM-HYDRA, CMAF, `#EXTVLCOPT`). Fail-closed: `exit 3` si el wrap falla, `exit 4` si la proyección no tiene 1 tag y 1 URL por canal o le quedan APE | `vps/bin/ape-list-light.sh:8-28` |
| **PERFIL** | **una sola P**: la lista se proyecta a los canales de ese perfil | `vps/bin/ape-list-project.sh:1-26` · `vps/bin/ape-profile-project.js` |
| **COMPLETA** | todos los canales con el cartucho íntegro | `ape-list-project.sh:20-25` (`<nombre>_FULL.m3u8  todo tal cual`) |
| **SIN_SALIDA** | **0** URLs en `/pulse/` **y** **0** en `/cdn/` | derivada: es la única combinación que no llega al motor |

**Cómo se distingue LIGHT de COMPLETA sin leer 1,3 GB** — y esto es lo importante para el seguimiento multivariante:

```
LIGHT  =>  grep -c '^#EXT-X-APE-' = 0     (es la invariante que el propio script verifica en su exit 4)
COMPLETA =>  grep -c '^#EXT-X-APE-' > 0
```

No hace falta pesar ni hashear: **una lista LIGHT se reconoce por la ausencia del namespace propietario**. Es la firma barata.

---

## 3. Quién consume cada lista — `NO_COMPUTADO`, con el comando exacto

**`NO_COMPUTADO`**: requiere `/var/log/nginx/playlist_access.log`, que vive en el VPS y no alcanzo desde aquí. Lo que sí puedo dejar cerrado es **el comando correcto**, con las dos exclusiones que evitan el falso positivo que ya documentó t79 (**96 % del tráfico es autotráfico del VPS**):

```bash
LOG=/var/log/nginx/playlist_access.log
HOSTIP=$(hostname -I | awk '{print $1}')
# $1=remote_addr  $4=[fecha  $7="GET /lists/... HTTP/1.1"  $9=status   (combined)
awk -v host="$HOSTIP" '
  $1!="127.0.0.1" && $1!="::1" && $1!=host && $7 ~ /\/lists\/[^ ]*\.m3u8/ {
    n[$7]++; ip[$7" "$1]++; last[$7" "$1]=$4
  }
  END{
    for (r in n) {
      printf "%s\t%d peticiones\n", r, n[r]
      for (k in ip) if (index(k, r" ")==1) printf "    %s  %d  ultima=%s\n", k, ip[k], last[k]
    }
  }' "$LOG" | sort
```

**Tres decisiones en ese comando, y por qué:**

1. **Se excluye `127.0.0.1`, `::1` y la IP del propio host** — si no, t79 ya demostró que el 96 % del conteo es el VPS hablándose a sí mismo.
2. **Se agrupa por ruta *y* por IP**: dos IPs distintas pueden consumir la misma lista con propósitos distintos (el operador y el device).
3. **Se guarda `ultima=`**: una lista con 1 petición de hace 6 días **no se está consumiendo**, aunque el contador diga 1.

---

## 4. El hueco del device — **cuatro** hipótesis, no tres, y cómo se distingue cada una

El hecho: **`181.130.154.235` tiene CERO peticiones en 48 h** y sólo hay **2 descargas de lista, una desde loopback**.

**Hipótesis (a) — lista importada como fichero local en el OTT.**
*Predicción falsable:* el device **no** pide ninguna lista, pero **sí** debe pedir cada canal a `/pulse/<id>` al reproducir (las URLs del catálogo son absolutas y apuntan al VPS).
*Discriminador:* `grep -c '181.130.154.235'` sobre las peticiones `/pulse/`. **Si hay >0, la reproducción ocurre y (a) gana; si es 0, no hay reproducción en absoluto y (a) no explica nada.**
*Nota:* sólo es compatible con (a) la variante «lista en fichero»; la variante «lista pegada en texto» produce el mismo patrón y **no se distingue desde el VPS**.

**Hipótesis (b) — URL remota con caché que no recarga.**
*Predicción falsable:* el device pidió la lista **al menos una vez** antes de la ventana de 48 h, y el intervalo de refresco del OTT es **mayor** que 48 h.
*Discriminador:* ampliar la ventana a **7 días** y contar las peticiones del device a `/lists/`. Si hay 1 y la fecha es antigua → (b). Si hay 0 en 7 días → (b) cae, porque el OTT refresca el catálogo al abrir la app.

**Hipótesis (c) — otro origen u otro nombre.**
*Predicción falsable:* el device pide una lista, pero **por otro host** (IP directa, `duckdns`, Cloudflare, R2) o **con otro nombre**.
*Discriminador:* buscar por **UA y por IP**, no por ruta: `awk '$1=="181.130.154.235"'` sobre **todos** los vhosts, y `grep -c 'OTT Navigator'`. Si aparece cualquier petición del device con UA de OTT a un `.m3u8` que no está en esta tabla → (c).

**Hipótesis (d) — el device no está reproduciendo nada.** *La que faltaba, y la más simple.*
*Predicción falsable:* **cero peticiones de cualquier tipo** desde esa IP en 48 h (no sólo de listas).
*Discriminador:* `grep -c '^181.130.154.235 ' /var/log/nginx/*.log`. **Si es 0 en todos los logs, ninguna de (a)(b)(c) aplica**: el aparato está apagado, sin red o no es ese aparato. Elegir (a) sin descartar (d) sería exactamente la suposición que el encargo prohíbe.

> **Regla de arbitraje:** las cuatro se resuelven **en este orden** — primero (d) (¿hay *algún* tráfico del device?), luego (c) (¿tráfico a otro host?), luego (a) (¿hay `/pulse/` sin `/lists/`?), luego (b) (¿hay `/lists/` en 7 días?). Cada paso **descarta** o **confirma**; no se elige la más cómoda.

---

## 5. Incoherencias

### 5.1 `ape_jit_latest.m3u8` con 57 B y «21.224 canales» — **NO es una incoherencia: son dos medidas distintas del mismo nombre**

**El fichero es un enlace simbólico.** `vps/bin/ape-jit-latest.sh:70` hace literalmente:

```bash
ln -sfn "$best" "$LISTS/ape_jit_latest.m3u8"
```

donde `$best` sale de `ls "$LISTS"/APE_LISTA_*_CABLEADA.m3u8` (`:49-51`, ranking por **número de lista** descendente, no por mtime — `:26-31`). Consecuencia:

- `stat -c%s` sobre el **enlace** devuelve **la longitud del path de destino** → **57 B**.
- `grep -c '^#EXTINF'` sobre el **destino** (siguiendo el enlace) devuelve **21.224**.

**Los dos números son correctos y describen objetos distintos.** Lo que estaba mal era la fila de la tabla, que mezclaba la medida del enlace con la del contenido.

**Aritmética que lo CIERRA, no que lo sugiere:**

```
longitud("/var/www/html/lists/")                        = 20
longitud("APE_LISTA_1794100720046_CABLEADA.m3u8")       = 37
                                        20 + 37 = 57  ← exactamente los 57 B medidos
```

Es decir: **el enlace apunta a `APE_LISTA_1794100720046_CABLEADA.m3u8`**, la **lista COMPLETA** (1.298.222.092 B, 21.224 canales, 100 % `/pulse/`). Los dos números de la fila son, en realidad, **la medida del enlace y la medida del destino** — y encajan al byte. No hay nada roto: había una fila mal compuesta.

La comprobación en el VPS es de una línea, y sirve para confirmar el destino (no para decidir si hay incoherencia, que ya está resuelta):

```bash
stat -c '%s %N' /var/www/html/lists/ape_jit_latest.m3u8   # el 57 es la longitud del destino
readlink -f /var/www/html/lists/ape_jit_latest.m3u8        # el destino real
stat -c%s "$(readlink -f /var/www/html/lists/ape_jit_latest.m3u8)"   # el tamaño de verdad
```

**Riesgo operativo que sí es real** (y que el propio script ya advierte en `:87-93`): si el enlace apunta a una `_CABLEADA` **sin `/pulse/`**, el menú del agente serviría una lista que va **directa al proveedor** y el menú mentiría. El script sale con `exit 3` en ese caso — pero **el `exit 3` no se ve desde el menú**. El inventario de §6 comprueba ese invariante por lista.

### 5.2 Duplicados: uno confirmado por bytes, uno por confirmar

| Par | Evidencia | Estado |
|---|---|---|
| **#3 `P3_CABLEADA_LIGHT` vs #4 `P3_CABLEADA_LIGHT_CABLEADA`** | **mismos 238.198.463 B** y mismo recuento | **duplicado probable; confirmar con `sha256sum`** (el nombre del segundo delata el doble cableado) |
| **#9 `P5` vs #10 `P5_CABLEADA`** | **mismos 516.221 B** | **duplicado probable; confirmar con `sha256sum`** — que `_CABLEADA` y su fuente pesen **exactamente lo mismo** sugiere que el cableado no reescribió nada |
| **#5 `P3_CABLEADA` vs #6 `P3`** | **Δ 41 B** (240.723.972 vs 240.724.013) | **casi-duplicados**: 41 B es compatible con **una línea de cabecera** de diferencia. Se confirma con `diff <(head -c 4096 a) <(head -c 4096 b)` |

**Por qué importa y no es cosmético:** cada copia de 238 MB se **sirve** y se **descarga**; si el OTT apunta a la equivocada, el operador paga bytes por una lista que nadie mantiene. Y un duplicado que se regenera solo (el `_CABLEADA` del `_CABLEADA`) es **síntoma de que la cadena de proyección no es idempotente en el nombre**, no sólo en el contenido.

### 5.3 Lo que SÍ cuadra (y conviene dejar escrito): la partición de canales es exacta

```
P3 20.222 + P1 933 + P4 58 + P5 11 = 21.224   ✓ exacto
```

**No se perdió ni un canal en la proyección por perfiles.** Esto descarta la clase de fallo más caras (perder canales al proyectar) y conviene tenerlo medido antes de que alguien lo sospeche.

### 5.4 Otras dos que anoto

- **#12 `APE_PRUEBA_*` son 163.187 B con 3 canales y 0 salidas**: están en el directorio que **se sirve al público**. Un `SIN_SALIDA` servido es una trampa para cualquiera que lo importe. **Sólo lectura: no se toca**; se reporta.
- **`_LIGHT` de 250.932.745 B (21.224 canales)** frente a la promesa del script de `_CABLEADA_LIGHT` para OTT: **0,193 ×** la completa, pero **muy por encima** de los 3,3 MB que anunciaba el commit `ddff9ce0` («de 353 MB a 3,3 MB»). **`NO_COMPUTADO` si es la misma proyección**: 250 MB sugiere que esa LIGHT **no** aplicó la lista blanca completa (conserva parte del cartucho). Se zanja con `grep -c '^#EXT-X-APE-'`: **0 = LIGHT real; >0 = LIGHT a medias**.

---

## 6. El inventario vivo: script de solo lectura, repetible y barato

Cópialo a `/tmp` y ejecútalo. **No escribe nada** salvo el TSV de caché en `/var/lib/ape/` (o donde diga `APE_INV_CACHE`).

```bash
#!/usr/bin/env bash
# ape-lists-inventory.sh — SOLO LECTURA. No modifica ninguna lista.
# Uso:  bash ape-lists-inventory.sh [--full|--fast]
#   --full  (por defecto) lee cada lista UNA vez y cuenta EXACTO
#   --fast  muestrea los primeros 64 MB y EXTRAPOLA por tamaño (≈±1 %)
set -uo pipefail
LISTS="${APE_LISTS_DIR:-/var/www/html/lists}"
CACHE="${APE_INV_CACHE:-/var/lib/ape/lists-inventory.tsv}"
MODE="${1:---full}"
SAMPLE=67108864

printf 'fichero\tbytes\tcanales\tpulse\tcdn\tdirectas\tstreaminf\tlab\tape\tclase\tsha256\n'
for f in "$LISTS"/*.m3u8; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  real=$(readlink -f "$f" 2>/dev/null || echo "$f")
  size=$(stat -c%s "$real")
  mtime=$(stat -c%Y "$real")

  # sha256 SOLO si cambio (size+mtime): es lo unico caro del inventario
  sha=$(awk -F'\t' -v n="$name" -v s="$size" -v m="$mtime" \
          '$1==n && $2==s && $3==m {print $4}' "$CACHE" 2>/dev/null)
  if [ -z "${sha:-}" ]; then
    sha=$(sha256sum "$real" | cut -d' ' -f1)
    if [ -f "$CACHE" ]; then
      awk -F'\t' -v n="$name" 'BEGIN{OFS="\t"} $1!=n' "$CACHE" > "$CACHE.new" \
        && mv "$CACHE.new" "$CACHE"
    fi
    printf '%s\t%s\t%s\t%s\n' "$name" "$size" "$mtime" "$sha" >> "$CACHE"
  fi

  if [ "$MODE" = "--fast" ] && [ "$size" -gt "$SAMPLE" ]; then
    counts=$(head -c "$SAMPLE" "$real" | awk -v factor="$(awk -v s="$size" -v k="$SAMPLE" 'BEGIN{printf "%.6f", s/k}')" '
      /^#EXTINF/{e++} /\/pulse\//{p++} /\/cdn\//{c++} /^#EXT-X-STREAM-INF/{s++}
      /^#EXT-X-APE-LAB/{l++} /^#EXT-X-APE-/{a++}
      /^[^#]/ && !/\/pulse\// && !/\/cdn\//{d++}
      END{printf "%d %d %d %d %d %d %d", e*factor, p*factor, c*factor, s*factor, l*factor, a*factor, d*factor}')
  else
    counts=$(awk '
      /^#EXTINF/{e++} /\/pulse\//{p++} /\/cdn\//{c++} /^#EXT-X-STREAM-INF/{s++}
      /^#EXT-X-APE-LAB/{l++} /^#EXT-X-APE-/{a++}
      /^[^#]/ && !/\/pulse\// && !/\/cdn\//{d++}
      END{printf "%d %d %d %d %d %d %d", e,p,c,s,l,a,d}' "$real")
  fi
  read -r e p c s l a d <<<"$counts"

  # clasificacion por las reglas de §2 (firma barata, sin pesar)
  if   [ "$p" -eq 0 ] && [ "$c" -eq 0 ];            then clase=SIN_SALIDA
  elif [ "$a" -eq 0 ] && [[ "$name" == *_LIGHT* ]];  then
       clase=LIGHT; [[ "$name" =~ _P([0-9]) ]] && clase="LIGHT+P${BASH_REMATCH[1]}"
  elif [[ "$name" =~ _P[0-9] ]]; then
       clase=PERFIL; [[ "$name" == *_LIGHT* ]] && clase=PERFIL+LIGHT
  else                                                    clase=COMPLETA
  fi
  [ -L "$f" ] && clase="$clase(ENLACE)"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$name" "$size" "$e" "$p" "$c" "$d" "$s" "$l" "$a" "$clase" "${sha:-}"
done
```

**Coste, medido en piezas y declarado:**

| Qué | Coste | Se puede evitar |
|---|---|---|
| `stat -c%s` + mtime | **O(1)** por lista | no hace falta evitarlo |
| **`sha256sum`** | **lee el fichero entero**: 1,3 GB ≈ **4-8 s** | **sí**: sólo se recalcula si `size` o `mtime` cambian (caché TSV) |
| recuento con `awk` | **una pasada secuencial** ≈ 1-2 s por GB | **sí**: `--fast` muestrea 64 MB y extrapola (≈±1 %, como t57) |
| **total `--full` primera vez** | **~1,8 GB leídos** (suma de las 13 filas) ≈ **6-10 s** | — |
| **total `--fast`** | **~0,9 GB** (13 × 64 MB) ≈ **2-3 s** | — |

**Regla de cadencia:** `--full` **una vez al día** (o al desplegar); `--fast` **cada 15 min**; el `sha256` **sólo** cuando cambia `size|mtime`. Con eso el seguimiento multivariante cuesta **~3 s cada 15 min** y **una lectura completa diaria**, no 1,3 GB por vuelta.

**Duplicados:** se obtienen agrupando por la columna `sha256`:
```bash
bash ape-lists-inventory.sh --full | awk -F'\t' 'NR>1{n[$11]=n[$11]" "$1; c[$11]++} END{for(s in c) if(c[s]>1) print c[s]" ficheros con sha "s":"n[s]}'
```

---

### 6.1 Prueba funcional del script (no es prosa: se ejecutó)

Se corrió con **bash real** (`bash -n` → `exit 0`) y contra **4 fixtures sintéticos** con las cuatro formas posibles. Resultado literal:

| Fixture | clase que devolvió | ¿Correcto? |
|---|---|---|
| con `#EXT-X-APE-*` + `/pulse/` | **COMPLETA** | ✅ |
| sin APE + `/pulse/` + `_LIGHT` en el nombre | **LIGHT** | ✅ |
| `_P3` + APE | **PERFIL** | ✅ |
| sin `/pulse/` ni `/cdn/` | **SIN_SALIDA** | ✅ |

Y dos comprobaciones más, que son las que importan para «solo lectura» y «barato»:

1. **La segunda pasada reutilizó el `sha256` de la caché** (mismo hash, sin releer): el invariante «sólo se hashea si cambia `size|mtime`» funciona.
2. **El único fichero que escribió fue `cache.tsv`** — ni una lista fue tocada.

**Orden de prioridad de la clasificación** (explícito, porque un nombre puede ser dos cosas a la vez): `SIN_SALIDA` > `LIGHT` > `PERFIL` > `COMPLETA`. Por eso un `_P3_..._LIGHT` sale como **`LIGHT+P3`**, no como PERFIL: **la clase LIGHT manda por contenido (0 APE) y el perfil se lee del nombre.**
## 7. `NO_COMPUTADO` (declaración explícita, no ceros)

| Item | Razón |
|---|---|
| Bytes, canales, pulse y sha256 reales de las 13 filas | **no alcanzo el VPS**: `ssh` rechazado por política antes de ejecutarse. La tabla de §1 es la medición del capitán, no la mía |
| Nº real de ficheros en `/var/www/html/lists` (13 vs 14 vs 15) | depende de cuántos casen con el glob `APE_PRUEBA_ORDER_OK*` |
| **Quién consume cada lista** (IPs, peticiones, última) | requiere `playlist_access.log` — comando en §3 |
| **Cuál de las 4 hipótesis del device es** | requiere cruzar 4 consultas (§4); ninguna se elige aquí |
| Destino exacto de `ape_jit_latest.m3u8` | requiere `readlink` (§5.1). Lo que **sí** está resuelto es **por qué** mide 57 B |
| Si `_CABLEADA_LIGHT` (250 MB) aplicó la lista blanca completa | `grep -c '^#EXT-X-APE-'` sobre ella |
| Si los pares #3/#4 y #9/#10 son idénticos | `sha256sum` |
| Cadencia real de refresco del OTT en el device | vive en la configuración del device, no en el VPS |

---

## 8. Resumen en cinco líneas

1. **`ape_jit_latest.m3u8` no está roto: es un symlink.** 57 B es la longitud del destino (`ape-jit-latest.sh:70`); los 21.224 canales son del destino. La tabla mezclaba dos objetos.
2. **La clasificación se hace por firma barata:** `#EXT-X-APE-` = 0 → LIGHT; una sola `P` → PERFIL; 0 `/pulse/` y 0 `/cdn/` → SIN_SALIDA. **Sin leer 1,3 GB.**
3. **La partición de canales cuadra exacta:** 20.222 + 933 + 58 + 11 = **21.224**. No se perdió ninguno.
4. **El consumo y el hueco del device son `NO_COMPUTADO`** — con los comandos exactos en §3 y §4, incluido el orden de arbitraje de las **cuatro** hipótesis (la cuarta: *el device no está reproduciendo nada*).
5. **`--fast` cada 15 min + `--full` diario**, y `sha256` sólo si cambia `size|mtime`: el seguimiento cuesta ~3 s, no 1,3 GB por vuelta.
