# FORENSE DEL APILAMIENTO DE CANARIES Y SU COSTE EN 502 — 2026-11-14

**Autor:** canary-auditor (team `canary-jit-20261111`, task `t40`) · **Modo:** sólo lectura · **VPS:** no accesible desde esta sesión.

## Veredicto en una línea

**No pude medir ninguno de los cinco puntos en vivo: el único intento de lectura remota fue rechazado por la política del harness antes de ejecutarse (§0).** Todo dato de runtime es **`NO_COMPUTADO`** con su razón y su comando — **ningún cero inventado**. Lo que sí entrego, medido y con hash: **la cadena causal está declarada en dos scripts del repo** (§2, con la etiqueta de procedencia bien puesta: es **declaración de d3, no mi medición**), **el artefacto parcheado no está versionado** (§3) y **la ventana de 90 s del capitán no puede sostener «estable»** (§5.1).

---

## 0. El blocker, con evidencia literal

Intento de lectura remota (sólo lectura, `BatchMode`, timeout 8 s, host del `~/.ssh/config` del operador):

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=8 hetzner-iptv "hostname; date -u; systemctl is-active ape-pulse-canary.timer"
```

**Resultado:** `Auto review rejected tool "pwsh"; its body was not executed`.

El comando **no llegó a ejecutarse**. No fue error de red, ni timeout, ni rechazo del servidor: se cortó antes. Por tanto no hay `journalctl`, ni `/proc`, ni `/var/log/nginx/playlist_access.log` desde aquí.

**Regla que manda sobre todo el documento:** lo que no se midió **no es cero**. Un canary que no pude contar **no es "0 canaries"; es desconocido**.

**Vía de desbloqueo medida:** `~/.ssh/config` define `hetzner-iptv` → `178.156.147.234`, user `root`, key `~/.ssh/id_ed25519_hetzner`; `178.156.147.234` está en `known_hosts`. **La vía existe; falta una sesión con permiso de red.** El protocolo de §6 está listo para pegarse tal cual.

---

## 1. Lo que SÍ se midió (artefactos locales, bytes/líneas/sha256)

Medido en esta corrida con `Get-Item` / `Get-FileHash`.

| Artefacto | Ruta | Bytes | Líneas | SHA-256 |
|---|---|---|---|---|
| Worker del canary (**el que va al VPS**) | `vps/bin/ape-pulse-canary-worker.sh` | 4.043 | **93** | `a17281d6cf865b37f869924124af04c9296827565709c64ceaedd84db5ac282e` |
| Worker del canary (**copia vieja**) | `IPTV_v5.4_MAX_AGGRESSION/vps/ape-pulse/ape-pulse-canary-worker.sh` | 2.802 | **66** | `ec52af6d588debc89348f6762978df4a6524be44593f5e56b5266b0ad0dc0509` |
| Control del canary | `_vps_stage/canary/ape-canaryctl` | 4.787 | **133** | `7f9745d4f58df302dae5a7d683342b2eb14545519c9b2f56cbc1fc73ad11eec5` |
| Unit del canary | `_vps_stage/canary/ape-canary@.service` | 783 | 36 | `d1dc2a135be8d7b1230bcfc3b89fef419f5175e2deef96a19fc6f80195b50e43` |
| Service del worker (`Type=oneshot`) | `IPTV_v5.4_MAX_AGGRESSION/vps/systemd/ape-pulse-canary.service` | 478 | — | `6f3de8790800633b1daa6b961e6d27e14f65be0a1e0e0954477a813cd36ce9d5` |
| **Timer del worker** | `IPTV_v5.4_MAX_AGGRESSION/vps/systemd/ape-pulse-canary.timer` | 204 | — | `eb51a07aa1afb1564a788aeb4f0761f2f9a3a0dbae6715979cf21cab78681bf9` |
| **Aplicador del lock** (d3) | `tools/ops/ape-canary-lock.sh` | 3.282 | 80 | `7445d47f56eca0d69b6dcdfa7f20b8c8a7656a0655253c83b1ad8b34b7fd8cef` |
| **Aplicador de la espera + fecha** (d3) | `tools/ops/ape-canary-wait.sh` | 4.451 | 105 | `e841e83156f1576c1ef42f984a285ab68e9ef0acc7d798ddf605efc3e8516bc7` |
| Script de triaje de 502 (d3) | `tools/ops/ape-502-rootcause.sh` | 2.219 | 56 | `56e8ccd2a6eb5e26361008697679b8b065fd56799a82c9fb2f508ea908ed75e4` |
| Manifiesto (fila del worker) | `_vps_stage/deploy/manifest.tsv` (6.501 B · `5f5adcf10f66e742dcc68d06cbfc75f0e11c69cf7cc1de695f5372b946f018ed`) `:61` | — | — | `vps/bin/ape-pulse-canary-worker.sh → /opt/ape-pulse/ape-pulse-canary-worker.sh` |

---

## 2. La cadena causal: **declarada por d3**, no medida por mí

**Procedencia, sin ambigüedad:** lo que sigue está escrito en las cabeceras de `tools/ops/ape-canary-lock.sh` (L4-19) y `tools/ops/ape-canary-wait.sh` (L4-17). **No lo he verificado contra el `journal`** (no tengo acceso). Lo cito porque es la única fuente de las horas y de los conteos, y porque **es contrastable con el mecanismo del código**, que sí verifiqué.

### 2.1 Bug 1 — la guarda no era atómica

> `ape-canary-lock.sh:4-15`: *«CAUSA MEDIDA 2026-11-14 01:21-01:26 — **8 canaries** arrancaron uno por minuto: `01:21:44` `01:22:05` `01:23:44` `01:24:49` `01:25:30` `01:26:11` `01:26:15` `01:26:23`. Cada uno dura hasta 5 min (RuntimeMaxSec=300), asi que se acumularon. **8 ffmpeg** contra el mismo proveedor. El proveedor permite UNA conexion por cuenta -> el player recibia **461** -> pulse.php lo publicaba como **502**.»*

> `ape-canary-lock.sh:11-15`: *«El guard existente era `if systemctl list-units --state=active | grep -q 'ape-canary@'; then exit 0`. Eso NO es atomico: dos workers pueden evaluar el grep ANTES de que el otro haya arrancado su unidad. **La ventana la agravo el .path** que añadi para despertar con el zap (dispara en cada cambio de la cola).»*

**Lo que yo sí verifiqué en el código del repo:** ese guard es exactamente el que está en `vps/bin/ape-pulse-canary-worker.sh:31-33`, y **no hay `flock` en ninguna de las dos copias del worker** (medido: `grep -c flock` → **0** en ambas). La copia del repo es, por tanto, **la versión con el bug 1**.

### 2.2 Bug 2 — el `flock` se soltaba al arrancar, no al terminar

> `ape-canary-wait.sh:4-14`: *«Linea 130: `"$CTL" start "$id" ... --seconds N`. ape-canaryctl arranca `ape-canary@<id>.service`, que es **Type=simple**. `systemctl start` de un Type=simple **RETORNA EN CUANTO ARRANCA**, no cuando termina. El worker sale, su flock se libera, y el siguiente worker (**9 tickets en cola**) lanza otro canary. Resultado: **10 canaries y 10 ffmpeg** contra un proveedor que da UNA conexion -> 461 -> 502.»*

**Lo que yo sí verifiqué:** `ape-canary@.service:9` es **`Type=simple`**, y `ape-canaryctl:64` hace `systemctl start "$UNIT"` — coherente con la explicación. Además `RuntimeMaxSec=300` (`:17`) fija la vida máxima, y el propio worker documenta `wall_seconds=194` (`:36-37`): con 20 s de ciclo del timer (`OnUnitActiveSec=20s`), **una unidad viva 194-300 s cubre 10-15 ticks**. La aritmética del apilamiento cierra.

### 2.3 Corrección de mi propia hipótesis previa

En mi primer análisis de este mismo encargo propuse, leyendo el código, que el agujero principal era que `--state=active` **no ve** una unidad en `activating` (hasta 60 s por `TimeoutStartSec=60`, `:15`). **La fuente de d3 no señala eso**: señala la **no atomicidad del `grep`** y el **`.path`** añadido después. Mantengo mi lectura como **ventana secundaria posible** (sigue siendo cierta como propiedad del código), pero **degrada a hipótesis no observada**: no la presento como causa. La causa declarada es la de §2.1.

### 2.4 La distinción de `cwd` que pide el punto 2 — está escrita en el repo

El worker ya documenta el criterio correcto y lo implementa:

```
41: # Por eso el canary NO dispara mientras el JIT tenga un ffmpeg sirviendo. Se
42: # distingue por el cwd del proceso: el JIT lanza ffmpeg con cwd=/dev/shm/ape-jit/<id>,
43: # el canary con cwd=/var/lib/ara/canary/<id>. Asi esta guarda no confunde su
44: # propio ffmpeg con el del JIT.
```

`jit_busy()` (`:45-56`) itera `/proc/[0-9]*`, filtra `cmdline` con `ffmpeg` y hace `readlink /proc/<pid>/cwd`, devolviendo 0 sólo si casa `/dev/shm/ape-jit/*`. **El criterio está bien puesto; que en el pico se cumpliera es `NO_COMPUTADO`.**

---

## 3. El artefacto arreglado: **CERRADO el 2026-11-14** (ver §10)

> **Actualización posterior a la primera versión de este documento.** Cuando lo escribí, el worker con el arreglo **no estaba versionado**. El capitán lo cerró en el **commit `ebdf3f81`** («fix(canary): versionar el ARTEFACTO desplegado, no solo el aplicador»). La tabla de abajo es el **registro histórico** de por qué el hueco importaba; el estado actual y su verificación en el repo están en **§10**.

| Qué | Estado (antes del commit) | Evidencia |
|---|---|---|
| El **worker con el arreglo** (`/opt/ape-pulse/ape-pulse-canary-worker.sh`) | **no estaba en el repo** | las 3 copias locales medían 93 / 66 / 133 líneas y **ninguna tenía `flock`** |
| Los **aplicadores** que lo parchean en el VPS | **sí estaban** | `tools/ops/ape-canary-lock.sh` (`7445d47f…`), `tools/ops/ape-canary-wait.sh` (`e841e831…`) |
| `sha256` del worker desplegado | **`NO_COMPUTADO`** → hoy **cerrado** (§10) | no había copia local con `flock` |

**Consecuencia, y es la misma clase de hueco que `DELIVERY_GAP_20261111.md`:** el repo contenía **el script que muta el VPS**, no **el artefacto resultante**. Se podía reproducir la *acción*, no el *estado*. Sin el hash del fichero parcheado, «el arreglo está puesto» era una afirmación sin artefacto — exactamente lo que este equipo prohíbe. **Ya está resuelto: §10.**

### 3.1 «El parseo de fecha está corregido»

`ape-canary-wait.sh:16-18` lo identifica y lo corrige: *«corrige el parseo de fecha del guard de prioridad del reproductor: `date -d "14/Nov/2026 01:28:37"` **devuelve 0** y el guard nunca actuaba. Ahora se mapea el mes a numero.»* El fichero trae el `case Jan) MESNUM=01 … Dec) MESNUM=12` que lo sustituye.

**En las copias locales de entonces no existía ese `date -d`** (`ape-canaryctl:79-80` usa `ActiveEnterTimestampMonotonic` + `/proc/uptime`, ambos monotónicos) — el bug vivía en **el worker del VPS**. Quedó `NO_COMPUTADO` con el comando en §6.6.

**→ Medido después, en el artefacto ya versionado: el `date -d` está, pero SIGUE devolviendo 0. Ver §11 (hallazgo de severidad alta).**

---

## 4. Los cinco puntos del encargo: estado y comando

| # | Dato pedido | Estado | Razón | Comando |
|---|---|---|---|---|
| 1 | Cuántas `ape-canary@` arrancaron y **a qué hora** | **`NO_COMPUTADO`** (declarado por d3: **8**, horas en §2.1) | sin `journal` propio | §6.1 |
| 2 | **Pico** de ffmpeg y su **cwd** | **`NO_COMPUTADO`** (declarado: **8-10** ffmpeg) | sin `/proc` del VPS | §6.2 |
| 3 | Tabla **502/min** × minutos con >1 canary | **`NO_COMPUTADO`** | sin `playlist_access.log` | §6.3 |
| 4 | Estado tras el arreglo: N disparos ×3, máximo | **`NO_COMPUTADO`** | el artefacto arreglado no está en el repo (§3) | §6.4 |
| 5 | Si el pico vuelve, **con el número** | **`NO_COMPUTADO`** | depende de 1-4 | §6.4 |

**Ninguno de estos `NO_COMPUTADO` es un cero.** Los números de d3 (8 / 10 / 461) se citan **como declaración**, con su fichero y línea, no como medición mía.

---

## 5. El dato del capitán: lo que no puedo cerrar y lo que sí puedo tumbar

**Afirmación:** *«4 disparos dejan 1 canary y 1 ffmpeg, estable en 90 s».*

**No la confirmo ni la tumbo**: exige contar unidades y ffmpeg en el VPS. Lo que hago es fijar **antes de medir** qué la tumba:

| # | Criterio de falsación | Detección |
|---|---|---|
| **F1** | **>1** unidad `ape-canary@*` en cualquier instante de la ventana | §6.4, muestreo 2-4 s |
| **F2** | **>1** `ffmpeg` con `cwd` en `/var/lib/ara/canary/*` | §6.2/§6.4 |
| **F3** | El **máximo de 3 repeticiones** es >1 (un disparo bueno no es un arreglo) | §6.4 |
| **F4** | El worker desplegado **no contiene** `flock -n` ni el bloque «ESPERA AL CANARY» | §6.6 |
| **F5** | Hay **502 en minutos con ≤1 canary** → la atribución causal al apilamiento es falsa aunque el arreglo funcione | §6.3 |

### 5.1 El defecto metodológico, y es serio

| Dato | Valor | Fuente |
|---|---|---|
| Ventana de la afirmación | **90 s** | el enunciado |
| `RuntimeMaxSec` del canary | **300 s** | `ape-canary@.service:17` |
| Duración observada de un canary 4K | `wall_seconds=194` | worker `:36-37` |
| Ciclo del timer | **20 s** | `ape-pulse-canary.timer` |
| **Espera añadida por el arreglo** | `LIMITE = SECONDS_SAMPLE + 240` = **246 s** con el default | `ape-canary-wait.sh:44` |

**Consecuencia:** 90 s **no cubren ni una vida completa** de la unidad (194-300 s) **ni un ciclo completo de la espera** (246 s). Ver 1 unidad y 1 ffmpeg a los 90 s **no demuestra estabilidad**: el primer canary puede seguir vivo hasta t=300 s y el cuarto disparo puede entrar a t=80 s y arrancar en t=100 s.

**Para que «estable» signifique algo, la ventana debe ser ≥ 600 s (2×RuntimeMaxSec) o, mejor, durar hasta que no quede ninguna unidad viva** — que es lo que hace §6.4.

---

## 6. Protocolo de medición (pegar desde una sesión con VPS)

Sólo lectura; guarda cada salida como evidencia.

### 6.1 Histórico de unidades y horas
```bash
journalctl -u ape-pulse-canary.service --since '2026-11-13' --no-pager -o short-iso > /tmp/t40_worker.log
journalctl --since '2026-11-13' --no-pager -o short-iso \
  | grep -E 'ape-canary@[A-Za-z0-9._-]+\.service' \
  | grep -E 'Starting|Started|Deactivated|Failed' | tee /tmp/t40_units.log
awk '{print substr($1,1,13)}' /tmp/t40_units.log | sort | uniq -c | sort -k2
# CONTRASTE con lo declarado en §2.1: deben aparecer 01:21:44, 01:22:05, 01:23:44,
# 01:24:49, 01:25:30, 01:26:11, 01:26:15, 01:26:23 (8). Si no salen, la causa
# declarada no casa con el journal y hay que reabrirla.
```

### 6.2 Pico de ffmpeg y `cwd` (canary vs JIT)
```bash
for i in $(seq 1 300); do
  nc=0; nj=0
  for p in /proc/[0-9]*; do
    c=$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null) || continue
    case "$c" in *ffmpeg*) ;; *) continue ;; esac
    w=$(readlink "$p/cwd" 2>/dev/null) || continue
    case "$w" in /var/lib/ara/canary/*) nc=$((nc+1));; /dev/shm/ape-jit/*) nj=$((nj+1));; esac
  done
  printf '%s canary_ffmpeg=%d jit_ffmpeg=%d\n' "$(date -u +%H:%M:%S)" "$nc" "$nj" >> /tmp/t40_peak.log
  sleep 2
done
echo "PICO canary = $(awk -F'canary_ffmpeg=' '{split($2,a," ");print a[1]}' /tmp/t40_peak.log | sort -n | tail -1)"
echo "PICO jit    = $(awk -F'jit_ffmpeg='    '{split($2,a," ");print a[1]}' /tmp/t40_peak.log | sort -n | tail -1)"
```

### 6.3 502 por minuto (mismo criterio que `tools/ops/ape-502-rootcause.sh:15`)
```bash
awk '$9==502 {print substr($4,2,17)}' /var/log/nginx/playlist_access.log | sort | uniq -c | sort -k2 > /tmp/t40_502min.txt
head -40 /tmp/t40_502min.txt
```
El cruce con «minutos con >1 canary» se construye a partir de los intervalos de vida de §6.1; **no se inventa aquí**.

### 6.4 Los 4 disparos × 3, ventana ≥600 s
```bash
# reposo: parar canaries vivos ANTES de medir (declarado, no silencioso)
systemctl list-units 'ape-canary@*' --all --no-legend | awk '{print $1}' | xargs -r systemctl stop
for r in 1 2 3; do
  : > /tmp/t40_rep$r.log
  for shot in 1 2 3 4; do
    systemctl start ape-pulse-canary.service
    for t in $(seq 1 150); do        # 150 × 4 s = 600 s
      u=$(systemctl list-units 'ape-canary@*' --all --no-legend 2>/dev/null | grep -c 'ape-canary@')
      f=$(for p in /proc/[0-9]*; do c=$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)||continue; case "$c" in *ffmpeg*) ;; *) continue;; esac; w=$(readlink "$p/cwd" 2>/dev/null)||continue; case "$w" in /var/lib/ara/canary/*) echo x;; esac; done | wc -l)
      printf '%s shot=%d t=%03d units=%d canary_ffmpeg=%d\n' "$(date -u +%H:%M:%S)" "$shot" "$t" "$u" "$f" >> /tmp/t40_rep$r.log
      sleep 4
    done
  done
done
for r in 1 2 3; do echo "rep$r MAX units=$(awk -F'units=' '{split($2,a," ");print a[1]}' /tmp/t40_rep$r.log|sort -n|tail -1) MAX ffmpeg=$(awk -F'canary_ffmpeg=' '{split($2,a," ");print a[1]}' /tmp/t40_rep$r.log|sort -n|tail -1)"; done
```

### 6.5 Estado de reposo (declararlo, no suponerlo)
```bash
systemctl list-units 'ape-canary@*' --all --no-legend   # debe salir vacío
pgrep -a ffmpeg | wc -l                                   # ffmpeg del canary: 0
```

### 6.6 ¿Está aplicado el arreglo? — **CERRADO el 2026-11-14** (§10). Se deja el comando porque es el que debe repetirse tras cada cambio en el worker
```bash
sha256sum /opt/ape-pulse/ape-pulse-canary-worker.sh; wc -l /opt/ape-pulse/ape-pulse-canary-worker.sh
grep -n 'flock -n' /opt/ape-pulse/ape-pulse-canary-worker.sh          # F4
grep -n 'ESPERA AL CANARY' /opt/ape-pulse/ape-pulse-canary-worker.sh  # espera presente
grep -n 'MESNUM' /opt/ape-pulse/ape-pulse-canary-worker.sh            # fecha corregida
scp root@178.156.147.234:/opt/ape-pulse/ape-pulse-canary-worker.sh /tmp/w.vps
diff -u vps/bin/ape-pulse-canary-worker.sh /tmp/w.vps
```

---

## 7. `NO_COMPUTADO` consolidado

| Afirmación | Estado | Razón |
|---|---|---|
| Nº de unidades y sus horas (**verificado por mí**) | **NO_COMPUTADO** | sin `journalctl`; lo de §2.1 es **declaración de d3**, contrastable con §6.1 |
| Pico de ffmpeg y si el `cwd` era canary o JIT | **NO_COMPUTADO** | sin `/proc` del VPS |
| 502/min y la tabla cruzada | **NO_COMPUTADO** | sin `playlist_access.log` |
| Estado tras el arreglo (4×3, máximo) | **NO_COMPUTADO** | el worker parcheado no está en el repo y no puedo ejecutarlo |
| `sha256` del worker desplegado | **CERRADO (§10)** | `70b1922e…`, 7.894 B, 164 líneas; el repo coincide byte a byte (commit `ebdf3f81`) |
| Que la corrección de fecha **funcione** | **MEDIDO: NO FUNCIONA** (§11) | el artefacto versionado conserva el `[` en el campo del día -> `date -d` = 0 -> el guard de prioridad nunca dispara |
| Que el pico no vuelva | **NO_COMPUTADO** | depende de §6.4 |
| Que los 502 vinieran del apilamiento | **NO_COMPUTADO** | exige §6.3; F5 lo podría tumbar |

### 7.1 Un dato que parecía evidencia y no lo es

Los `_vps_stage/deploy/snapshots/dryrun_remote_hashes_20261112T*.txt` **no sirven para fechar el estado remoto**:

| Snapshot | Filas | `AUSENTE` | Con hash real |
|---|---|---|---|
| `...T081737Z.txt` | 68 | **68** | **0** |
| `...T140340Z.txt` | 68 | **67** | **0** |

Y `...T081737Z.txt` trae **35 filas basura** cuyo «path» es sintaxis de shell (`;`, `do`, `if`, `[`, `-f`, `"$f"`). Marca `AUSENTE` incluso `/var/www/html/prisma/api/pulse.php`, que es el endpoint vivo. **Es un fallo del generador de snapshots, no una ausencia real**: quien use estos ficheros para decir «el worker no está desplegado» se equivoca.

---

## 8. Lo que este documento NO afirma

1. **No afirma que hubiera 8 canaries por medición propia**: lo cita de `ape-canary-lock.sh:4-15` como **declaración de d3**.
2. **No afirma que el arreglo funcione ni que falle**: afirma que **el artefacto arreglado no está en el repo** (§3) y que **90 s no bastan** para sostener «estable» (§5.1).
3. **No atribuye los 502 al apilamiento**: sin §6.3 es hipótesis, y F5 la puede tumbar.
4. **No he tocado el VPS, ni units, ni worker, ni `wg0`/`eth0`.** El único `ssh` fue rechazado **antes de ejecutarse**.
5. **No he editado nada fuera de este `.md`.**

---

## 9. Lo mínimo para cerrar t40

| Paso | Quién | Qué produce | Por qué primero |
|---|---|---|---|
| **1** | operador / d3 con sesión de red | **§6.6**: hash, líneas, `grep flock`, diff | **sin identificar el artefacto, todo lo demás mide un fichero anónimo** |
| 2 | idem | §6.1 y contraste con las 8 horas de §2.1 | confirma o tumba la causa declarada |
| 3 | idem | §6.4 (3 × 4 disparos, ≥600 s) | resuelve F1-F3 con un máximo, no con una anécdota |
| 4 | idem | §6.3 | resuelve F5 y permite la tabla del punto 3 |
| 5 | canary-auditor | veredicto F1-F5 y las tablas | con los 4 ficheros anteriores |

---

## 10. Cierre de §6.6 — el artefacto ya no es anónimo (2026-11-14)

El capitán midió el worker **con VPS** y lo versionó. **Verificación del lado local, hecha por mí en esta sesión:**

| Dato | Declarado por el capitán | **Medido por mí en el repo** | ¿Coincide? |
|---|---|---|---|
| ruta | `/opt/ape-pulse/ape-pulse-canary-worker.sh` | `vps/bin/ape-pulse-canary-worker.sh` (trackeado) | sí (origen→destino de `manifest.tsv:61`) |
| bytes | 7.894 | **7.894** | **sí** |
| líneas | 164 | **164** | **sí** |
| sha256 | `70b1922e69b4d5226158575c4942cd7a744d9db1839795cc40f48bfa2909bf4a` | **`70b1922e69b4d5226158575c4942cd7a744d9db1839795cc40f48bfa2909bf4a`** | **sí, byte a byte** |
| `flock -n` | 2 | **2** | sí |
| `ESPERA AL CANARY` | 1 | **1** | sí |
| `MESNUM` | presente | **5 ocurrencias** | sí |

**Commit:** `ebdf3f81` — *«fix(canary): versionar el ARTEFACTO desplegado, no solo el aplicador»* — toca **un solo fichero** (`+72 / −1`), `HEAD` = `ebdf3f81`, y el fichero está **limpio** en `git status`.

**Lo que esto cierra:** el `NO_COMPUTADO` del `sha256` del worker desplegado (§7) queda **cerrado en su mitad local**. Lo que sigue sin ser mío es la mitad remota —**que el VPS tenga ese mismo fichero**—: es la afirmación del capitán, y ahora es **falsable con un comando** (`§6.6`: `sha256sum` + `diff`). Con eso, el hueco de «se versiona la acción, no el estado» **está cerrado**. Bien.

### 10.1 Auditoría del artefacto (no sólo de su hash)

| Bloque | Líneas | Veredicto |
|---|---|---|
| Lock atómico | `8-12` (`exec 9>`, `flock -n 9`, `exit 0`) | **correcto**: se libera al morir el proceso (fd cerrado por el kernel); se toma antes de `set -euo pipefail` (`:28`), lo cual funciona |
| Espera al canary | `147-161` | **correcto**: `UNIDAD="ape-canary@${id}.service"` casa con `ape-canaryctl:19`; el `while` mantiene el `flock` tomado; `LIMITE=SECONDS_SAMPLE+240`; `break` con log al agotarse |
| Prioridad del reproductor | `48-79` | **❌ NO FUNCIONA — ver §11** |
| Nota menor | `:10` escribe en `/var/log/ape-canary.log`, pero `LOG=/var/log/ara/canary.log` (`:33`) | el mensaje de *skip* va a **otro log**: quien busque apilamientos en `canary.log` no verá los skips (severidad baja, pero engaña al forense) |
| Nota menor | `systemctl is-active` (`:155`) no considera `activating` como activo | latente: hoy no se alcanza porque `ape-canaryctl:64` usa `systemctl start` **bloqueante**; si alguien pasa a `--no-block`, la espera se rompe |

---

## 11. HALLAZGO DE SEVERIDAD ALTA — el guard de prioridad del reproductor estaba muerto

> **ESTADO: CORREGIDO el mismo día en el commit `8eb94bf2`** («fix(jit,canary): versionar los 3 artefactos desplegados + matar el guard muerto»). El artefacto versionado mide ahora **8.338 B / 171 líneas / sha256 `394f360b7fae5c8371f4bf3a860580f6e3ee1cd2f3fc41e975edbcf2ce0d286a`** y el corchete se sanea **una sola vez en el origen** (`:61`, `| tr -d '[]'` sobre `ULT`), con un aviso `fail-VISIBLE` en `:76-78` (`MESNUM=00` o `EPOCA<=0` → `log "… GUARD INACTIVO"`). El comentario `:57-60` cita este hallazgo. **Lo que sigue es el registro de lo medido; la política fail-OPEN que quedó viva la sustituye el gate de §13.**

El bloque `48-79` existe para una cosa: **no lanzar el canary si el operador ha zapeado en los últimos 180 s**, porque el proveedor da **una conexión por cuenta** y el canary se la robaría (`:49-53`). El guard se apoya en convertir a epoch la hora del último zap desde `playlist_access.log`.

**Cadena medida sobre el artefacto versionado (`70b1922e…`):**

| Línea | Código | Resultado |
|---|---|---|
| `:57` | `ULT=$(tail -n 400 "$PLEG" \| awk '/\/pulse\// && /z=1/ {print $4}' \| tail -n 1)` | `$4` del log nginx es **`[14/Nov/2026:01:28:37`** — **con el `[` delante** |
| `:59` | comentario del propio autor | *«$4 es **[**dd/Mmm/aaaa:HH:MM:SS»* — **el `[` está reconocido en el comentario** |
| `:60` | `ISO=$(… \| tr -d '[]' \| sed …)` | limpia el `[`… **pero `ISO` no se usa nunca**: código muerto |
| `:61` | `MES=$(… cut -d/ -f2)` | `Nov` → `MESNUM=11` **correcto** |
| `:68` | `FDIA=$(printf '%s' "$ULT" \| cut -d/ -f1)` | **`[14`** ← **el `[` sobrevive** |
| `:69` | `FANO=$(… cut -d/ -f3 \| cut -d: -f1)` | `2026` correcto |
| `:70` | `FHMS=$(… cut -d: -f2-4)` | `01:28:37` correcto |
| `:71` | `EPOCA=$(date -u -d "$FANO-$MESNUM-$FDIA $FHMS" +%s 2>/dev/null \|\| echo 0)` | **`date -d "2026-11-[14 01:28:37"`** → fecha inválida → **`EPOCA=0`** |
| `:74` | `if [ "$EPOCA" -gt 0 ] && [ $((AHORA - EPOCA)) -lt "$PLAYER_WINDOW" ]` | `0 > 0` es falso ⇒ **el guard NUNCA dispara** |

**Simulación determinista de las mismas operaciones de cadena** (no requiere bash, son `split`/`cut`):

```
ULT  = [14/Nov/2026:01:28:37
MES  = Nov          -> MESNUM=11        OK
FDIA = [14           <- incluye el '['
FANO = 2026                             OK
FHMS = 01:28:37                         OK
date -d "2026-11-[14 01:28:37"          -> invalida -> 0
```

**El propio fichero se contradice:** reconoce el `[` en el comentario (`:59`) y lo limpia en una variable que **nunca usa** (`:60`), mientras la que **sí usa** (`:68`) no lo limpia. Es el **mismo síntoma que el bug original** —`date -d` devuelve 0 y el guard no actúa— con otra cadena: antes `"14/Nov/2026 01:28:37"`, ahora `"2026-11-[14 01:28:37"`.

**Por qué es ALTA y no cosmética:**

1. El bloque entero (`48-79`) queda **inerte**: la protección que da prioridad al operador sobre el canary **no existe en la práctica**.
2. **Rompe la atribución causal tal como estaba planteada.** Con este guard muerto, **un solo canary** —no hace falta apilamiento— puede quitarle la conexión al operador y producir **502 con ≤1 canary**. Es exactamente el escenario **F5**, y ahora **se espera que ocurra**. Conclusión operativa: *«no hay pila ⇒ no hay 502»* es una inferencia **inválida** mientras este guard no funcione.
3. Falla **en silencio**: `2>/dev/null || echo 0` convierte un error de parseo en «no pasó nada». Un guard que no puede distinguir *«no hubo zap»* de *«no supe parsear la fecha»* no es un guard.

**Corrección (una línea, y no la aplico: el worker es de d3):**

```bash
# :68  — quitar el '[' de la fuente, que es de donde viene
FDIA=$(printf '%s' "$ULT" | tr -d '[]' | cut -d/ -f1)
```

y, para que no vuelva a fallar callado, que el `0` sea **visible**:

```bash
# tras :71
[ "$MESNUM" = "00" ] && log "PRIORIDAD: mes no parseado en '$ULT' — guard INACTIVO"
[ "$EPOCA" -le 0 ]   && log "PRIORIDAD: fecha no parseada en '$ULT' — guard INACTIVO"
```

Además, borrar `ISO` (`:60`): hoy es código muerto que **da la falsa impresión** de que el `[` se limpia.

**Estado de la corrección: `NO APLICADA`.** No toco el worker (es de d3). Queda declarada con línea exacta, prueba y parche listo.

### 11.1 Efecto sobre F1-F5 (no se retocan: siguen como se pre-registraron)

- **F1-F4**: sin cambios.
- **F5** (*502 en minutos con ≤1 canary ⇒ la atribución al apilamiento es falsa*): **sigue siendo el criterio correcto**, y §11 le da un mecanismo concreto por el que puede cumplirse: guard de prioridad inerte. Si aparece 502 con ≤1 canary, **no** habrá que buscar «otra causa rara»: estará en `48-79`.

---

## 12. Estado de la sesión para los 5 puntos

Sigo **sin permiso de red**: el `ssh` de §0 fue rechazado antes de ejecutarse. **No invento los 5 puntos.** El capitán los mide y me pasa la salida cruda de §6.1-§6.5; con ella audito F1-F5 y construyo la tabla de 502/min.

**Lo que pido, y para qué:**

| Fichero | Para qué |
|---|---|
| `/tmp/t40_units.log` (§6.1) | contrastar las **8 horas** de §2.1 contra el journal: si no salen, la causa declarada no casa |
| `/tmp/t40_peak.log` (§6.2) | pico de ffmpeg **y su `cwd`** (canary vs JIT) |
| `/tmp/t40_rep1..3.log` (§6.4) | máximo de **3 repeticiones** con ventana ≥600 s: lo único que puede sostener «estable» |
| `/tmp/t40_502min.txt` (§6.3) | tabla 502/min y F5 |
| salida de §6.5 | estado de reposo declarado (no supuesto) |

**Antes de gastar esa medición:** arreglar §11. Con el guard de prioridad inerte, una tanda de disparos puede dar 502 **por robar la conexión del operador** y atribuírselos al apilamiento, o al revés. Medir el stacking con el guard roto mide dos cosas a la vez.

---

## 13. Coordinación con t42 (provider-arbiter) — 2026-11-14

Mensaje recibido de `provider-arbiter` (t42, attempt `417cfd46`). Puntos verificados por mí y **correcciones al registro**, incluida una que afecta a la conclusión.

### 13.1 Atribución: la versión de las 01:50:49Z **no la desplegué yo**

`provider-arbiter` la llama «tu versión». **No es mía en el sentido de autoría del despliegue:** esta sesión **nunca ha escrito en el VPS** (el único `ssh` fue rechazado por política, §0). Lo que hice fue **proponer el parche en §11**; quien lo aplicó y desplegó es el autor del commit **`8eb94bf2`**. La atribución importa: un rastro de auditoría que asigna un cambio al agente equivocado es un registro falso. El comentario `:60` del fichero dice «Bug medido por canary-auditor (t40 §11)», que es correcto como **origen del hallazgo**, no como autor del deploy.

Ese backup (`/var/backups/ape-mutexgate/20261114T015514Z/…`, 8.338 B / 171 líneas) coincide en **bytes y líneas** con `8eb94bf2`, así que la identidad del artefacto es coherente.

### 13.2 Acepto los tres puntos de t42

| # | Su objeción | Veredicto |
|---|---|---|
| 1 | **FAIL-OPEN**: mi aviso `fail-VISIBLE` deja rastro pero **no impide el daño**; con `EPOCA=0` el `[ "$EPOCA" -gt 0 ]` es falso y **el canary arranca** | **CORRECTA y la acepto.** Mi parche arregló el *parseo*, no la *política*. Para un guard cuya función es proteger la única conexión del operador, el defecto correcto es **DENY**. Su `reason=player_state_unknown_failclosed` es estrictamente mejor. |
| 2 | **`tail -n 400` se queda corto** (~2 líneas/s de `conviva-event.php` ⇒ ~360 líneas en 180 s) | **PLAUSIBLE y no la puedo contradecir**: la ventana es de **d3/capitán** (`:61`), no la toqué en §11. Su `5000` es margen razonable. **`NO_COMPUTADO`** el ritmo real (sin el log). |
| 3 | **Carrera de reintento**: hueco de 10 s entre «Main process exited» (01:41:27) y «Scheduled restart job» (01:41:37) | **Ver §13.3: no puede juzgarse sin resolver una contradicción en el artefacto de la unit.** |

También acepto su dato **2 ffmpeg por unidad** (4 unidades / 8 ffmpeg a las 01:41:57Z): aritmética coherente, y **corrige el objetivo del contrato** («1 canary y 1 ffmpeg») que yo mismo repetí.

### 13.3 HALLAZGO NUEVO — la unit versionada dice `Restart=no`, pero el journal muestra «Scheduled restart job»

| Dato | Valor | Fuente |
|---|---|---|
| `Restart=` en la unit **versionada** | **`Restart=no`** | `_vps_stage/canary/ape-canary@.service:18` (783 B, `d1dc2a13…`, la fila `manifest.tsv:40`) |
| `RuntimeMaxSec` | `300` | idem `:17` |
| Lo que el journal muestra | «Main process exited» → **«Scheduled restart job»** a los 10 s | declaración de `provider-arbiter` (t42) |
| Drop-ins versionados | **ninguno** (sólo la unit y el service del worker) | barrido del repo |

**Con `Restart=no` systemd NO programa reinicios.** Las dos lecturas posibles:

1. La unit **desplegada** difiere de la versionada (drop-in en `/etc/systemd/system/ape-canary@.service.d/` o edición directa) → otra vez el hueco *acción vs estado*, ahora en la unit: **el artefacto que gobierna los reinicios no es el del repo**.
2. El «Scheduled restart job» del journal pertenece a **otra unidad** (p. ej. el propio worker o el timer), y entonces la carrera de 10 s **no existe** y los 4 canaries / 8 ffmpeg necesitan otra explicación.

**`NO_COMPUTADO` cuál de las dos rige**, y es **bloqueante para la calibración del gate de t42**: si es (2), el «asentamiento de 15 s + contar `activating`» compensa un mecanismo que no está ocurriendo, y añade 15 s de latencia por disparo sin cerrar nada. Comando que lo resuelve en una línea:

```bash
systemctl cat 'ape-canary@*.service' 2>/dev/null | head -40      # ¿hay drop-ins?
systemctl show -p Restart -p RuntimeMaxSec -p DropInPaths ape-canary@<id>.service
grep -n '^Restart=' /etc/systemd/system/ape-canary@.service
sha256sum /etc/systemd/system/ape-canary@.service     # ¿es d1dc2a13… como el versionado?
```

### 13.4 F2 se queda como está; se añade **F2'** (pre-registrada AHORA)

Con **2 ffmpeg por unidad sana**, mi **F2** («>1 ffmpeg con `cwd` de canary») **dispararía con un solo canary correcto** — está mal calibrada. **No retoco F2**: se conserva como se pre-registró, para que el registro no se pueda acomodar al resultado. Se añade, **antes de ver la medición**, una criterio adicional que no la sustituye:

| # | Criterio | Sustituye a |
|---|---|---|
| **F2'** | **>2** procesos `ffmpeg` con `cwd` en `/var/lib/ara/canary/*` **o** >1 unidad `ape-canary@*` en el mismo instante | nada: se **suma** a F2. Si F2 dispara y F2' no, es **un solo canary sano**, no apilamiento |

Regla de lectura acordada: **unidad = la unidad de cuenta del apilamiento; ffmpeg solo no lo es** (2 por unidad).

### 13.5 Verificación independiente de su vector de test

`provider-arbiter` afirma que `'14/Nov/2026:01:28:37'` → **epoch `1794619717`**. Lo comprobé sin bash:

```
epoch 1794619717        -> 2026-11-14T01:28:37Z
'14/Nov/2026:01:28:37'  -> 2026-11-14T01:28:37Z (As UTC)
COINCIDE = True ; epoch recalculado = 1794619717
```

**Su vector es correcto.** Su `${1#\[}` y mi `tr -d '[]'` llegan al mismo sitio: el suyo es más quirúrgico (quita sólo el `[` de cabecera), el mío tolera también un `]` residual.

### 13.6 No voy a escribir el VPS

No hay riesgo de que sobrescriba el gate de t42: **no tengo permiso de red** y `t40` es una tarea de **medición**, no de mutación. Lo único que escribo es este `.md` y el inventario de mis tareas. Si en el futuro hiciera falta un cambio en el worker, pasa por d3/t42 con su gate.
