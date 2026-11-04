# Propuesta — publicación atómica en `finalize_upload.php`

**Estado: NO APLICADA.** Sin `CONFIRMED:` del operador no se toca el fichero.
**Fecha:** 2026-11-03
**Origen:** el `.m3u8` vivo quedó en 8 bytes dos veces (2-nov y 3-nov).

---

## 1 · Qué se midió

### La causa, confirmada en el código desplegado

```
/var/www/html/finalize_upload.php   6149 B   2026-04-11   (VPS)
IPTV_v5.4_MAX_AGGRESSION/vps/finalize_upload.php   5388 B  (repo)
L70 (VPS):  $out = fopen($outputPath, 'wb');
```

`'wb'` **trunca el fichero de producción a 0 antes de saber si puede escribir los chunks.** Si un chunk
falla, el `exit` deja el fichero con lo que alcanzó. `#EXTM3U\n` son 8 bytes exactos.

**Nota:** el fichero del VPS **difiere del repo en 761 bytes** y **no está en `tools/cicd/vps_deploy_map.json`**
(`targets` no lo incluye). El VPS deriva del repo.

### La cronología del incidente

```
13:59:22.946   .gz   182.222.415 B   ← comprimido del .m3u8 sano
13:59:31.249   .m3u8          8 B   ← 8,3 s después, truncado
13:59:31       nginx: POST /finalize_upload.php
               client 181.63.176.21 · referer 127.0.0.1:5500
               PHP: [GZIP-STATIC] 576.6 MB → 173.8 MB (69.9%)
```

**El `.gz` es anterior al truncado** → con `gzip_static` nginx sirvió el `.gz` sano todo el tiempo.
**Los players nunca vieron la lista rota.** Lo que la expuso fue desactivar `gzip on`.

### Los cuatro candidatos

| Hipótesis | Veredicto |
|---|---|
| A · subida desde la APP | **confirmada** — `POST /finalize_upload.php` a las 13:59:31 |
| B · fichero creado vacío | descartada — `mtime` coincide con la escritura, `.gz` anterior |
| C · cron del VPS | descartada — el escritor es php-fpm vía FastCGI |
| D · caché de nginx | descartada — en disco había 8 bytes reales |

### Dos correcciones a los supuestos de la propuesta

**`$totalSize` no es un valor del cliente.** Se inicializa a 0 y se incrementa dentro del mismo bucle:

```php
L63: $totalSize = 0;
L73: $totalSize += strlen($data);   // junto a fwrite
```

**Por eso `$written !== $totalSize` nunca dispara:** ambos se incrementan juntos. La verificación útil es
`filesize($tmpRaw) === $written` **después de cerrar**.

**El invariante E no se puede implementar todavía.**

```
/var/www/html/prisma/db/ape_lists.db   53.248 B   .tables → SIN_TABLAS
grep registered_lists en /var/www/html → sin resultados
```

**La tabla `registered_lists` no existe.** Antes de convertirlo en chequeo de `list-activate` hay que crear el
registro o elegir otra fuente. Hoy el invariante es **no computado**, no «verde».

---

## 2 · El parche propuesto

### Reglas que implementa

1. Nunca se abre el fichero de producción para escritura.
2. Temporal **en el mismo directorio** (un `rename` entre sistemas de ficheros no es atómico).
3. Se preservan `mode`, `owner` y `group` del original: el `rename` sustituye el inodo.
4. Verificación antes de publicar: bytes escritos == bytes en disco, suelo de tamaño, y **cabecera `#EXTM3U`
   en los primeros 7 bytes** — ésta es la que habría cazado exactamente este bug.
5. `fflush` + `fsync` antes del `rename`.
6. Fallo en cualquier punto → `unlink` del temporal, producción intacta.
7. El `.gz` se verifica (magic `\x1f\x8b`, no mayor que la fuente, no menor de 1 KB).

### Por qué el `.gz` se publica primero

Con `gzip_static on`, nginx sirve el `.gz` sólo si el cliente manda `Accept-Encoding: gzip`. En la ventana
entre los dos `rename`, si el `.gz` ya es nuevo y el `.m3u8` aún es viejo, ambos caminos entregan contenido
válido. Al revés, la ventana expondría un `.m3u8` nuevo con `.gz` viejo y `gzip_static` serviría lo obsoleto.

### Bloque

```php
// ── publicación atómica: nunca se escribe sobre el fichero vivo ──
$lock = @fopen($outputPath . '.lock', 'c');
if ($lock) { flock($lock, LOCK_EX); }

$dir = dirname($outputPath);
foreach (glob($outputPath . '.tmp.*') as $stale) {
    if (@filemtime($stale) < time() - 900) { @unlink($stale); }
}

$suffix = '.' . getmypid() . '.' . bin2hex(random_bytes(4));
$tmpRaw = $outputPath . '.tmp' . $suffix;
$tmpGz  = $tmpRaw . '.gz';

$out = @fopen($tmpRaw, 'wb');
if (!$out) { if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
             throw new RuntimeException('tmp fopen'); }

$written = 0;
foreach ($parts as $part) {
    $data = @file_get_contents($part);
    if ($data === false) {
        fclose($out); @unlink($tmpRaw);
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        throw new RuntimeException('chunk ilegible: ' . $part);   // producción intacta
    }
    if (@fwrite($out, $data) === false) {
        fclose($out); @unlink($tmpRaw);
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        throw new RuntimeException('fwrite falló en: ' . $part);
    }
    $written += strlen($data);
}
fflush($out);
if (function_exists('fsync')) { @fsync($out); }
fclose($out);

// ── verificación antes de publicar ──
clearstatcache(true, $tmpRaw);
$onDisk = @filesize($tmpRaw);
$err = null;
if ($onDisk !== $written)  { $err = "disco $onDisk != escritos $written"; }
elseif ($written < 1024)   { $err = "bajo el suelo: $written bytes"; }
elseif (@file_get_contents($tmpRaw, false, null, 0, 7) !== '#EXTM3U') { $err = 'sin cabecera #EXTM3U'; }

if ($err !== null) {
    @unlink($tmpRaw);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    throw new RuntimeException('verificación: ' . $err);
}

// ── preservar permisos y propietario del original ──
$mode  = @fileperms($outputPath) & 07777;
$owner = @fileowner($outputPath);
$group = @filegroup($outputPath);
@chmod($tmpRaw, $mode ?: 0644);
if ($owner !== false && function_exists('chown')) { @chown($tmpRaw, $owner); @chgrp($tmpRaw, $group); }

// ── .gz desde el temporal, verificado ──
$gzOk = false;
$in = @fopen($tmpRaw, 'rb');
$gz = @gzopen($tmpGz, 'wb6');
if ($in && $gz) {
    while (!feof($in)) { gzwrite($gz, fread($in, 1 << 20)); }
    fclose($in); gzclose($gz);
    clearstatcache(true, $tmpGz);
    $gzSize = @filesize($tmpGz);
    $magic  = @file_get_contents($tmpGz, false, null, 0, 2);
    $gzOk   = ($gzSize > 1024) && ($gzSize < $written) && ($magic === "\x1f\x8b");
    if ($gzOk) { @chmod($tmpGz, $mode ?: 0644); }
}

// ── publicar: gz primero, m3u8 después ──
if ($gzOk) { @rename($tmpGz, $outputPath . '.gz'); } else { @unlink($tmpGz); }
if (!@rename($tmpRaw, $outputPath)) {
    @unlink($tmpRaw);
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    throw new RuntimeException('rename final falló');
}

clearstatcache(true, $outputPath);
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }

if (!$gzOk) {
    error_log("[FINALIZE] gz no publicado, se conserva el anterior: $outputPath");
}
```

---

## 3 · Fricciones a resolver antes de aplicarlo

| # | Punto | Estado |
|---|---|---|
| 1 | `$totalSize` no sirve como referencia | **resuelto arriba**: se compara contra `filesize()` |
| 2 | `fsync` sobre el `.gz` | `gzclose` no garantiza durabilidad. Aceptable para este caso; si se quiere rigor, `deflate_init` sobre un descriptor propio |
| 3 | El `.lock` se acumula | añadir `*.m3u8.lock` a `.gitignore` y al barrido de temporales |
| 4 | `gzip_static` es `on`, no `always` | verificado: `sites-enabled-default.PATCHED-206-dual.conf:134`. Un cliente sin gzip recibe el `.m3u8`, así que el orden gz-primero es el correcto |
| 5 | El VPS deriva del repo | `finalize_upload.php` **no está en `vps_deploy_map.json`**. Hay que añadirlo como `type: php` o el próximo deploy no lo llevará |
| 6 | Tamaños divergentes | VPS 6.149 B vs repo 5.388 B. Antes de portar el parche hay que **decidir cuál es la fuente** |

---

## 4 · Despliegue propuesto

1. **Añadir `finalize_upload.php` a `tools/cicd/vps_deploy_map.json`** con `type: php`.
2. **Reconciliar** el fichero del VPS con el del repo: hoy no son el mismo.
3. `validate_local.sh` + `php -l` en verde.
4. `deploy_vps.sh --only php-finalize-upload --yes` (backup fechado + rollback automático).
5. **Prueba dirigida:** subir una lista con un chunk forzado a fallar y confirmar que el `.m3u8` vivo **conserva
   su tamaño anterior**, no queda en 8 bytes.
6. Observación: el par `.m3u8`/`.gz` con `mtime` y tamaño coherentes en cada subida.

---

## 5 · Correcciones colaterales

**`gzip on` → `gzip off`.** El cambio expuso el bug, pero era el correcto: 576 MB merece `gzip_static` y no
compresión en vuelo. **`gzip_static on` está activo** (verificado). **Si el `.gz` falta, hoy no hay respaldo**
— merece considerarse.

**El invariante E.** No implementable hasta que exista un registro. Hoy `/var/www/html/prisma/db/ape_lists.db`
está vacía (`SIN_TABLAS`). **`SIN_TABLAS` no es verde: es no computado.**

---

## 6 · Lo que este documento NO afirma

- **No hay prueba de que el parche funcione.** No está aplicado ni ejecutado.
- **No sé qué subida exacta falló** a las 13:59:31. Sé que fue `POST /finalize_upload.php`, no cuál chunk falló.
- **El barrido de 1 KB dio un resultado no confiable** por un error de quoting mío en el `sh -c` anidado:
  reportó `listas=1 rotas=1` con nombre vacío. **No lo doy por bueno.**

---

# Adenda — E corrido, invariante implementado, y lo que encontró

**Ronda 2.** E se ejecutó, la propuesta está escrita y el invariante quedó operativo. **Nada aplicado.**

## E · los resultados reales

### La tabla no existe

```
/opt/netshield/data/ape_lists.db           → AUSENTE
/var/www/html/prisma/db/ape_lists.db       → existe, 53.248 B, 2026-11-01
  .tables                                  → SIN_TABLAS
  .schema                                  → (vacío)
grep registered_lists en /var/www/html     → sin resultados
```

**`registered_lists` no existe en ninguna parte.** El invariante «canales registrados contra bytes servidos»
**no se puede implementar** sobre una tabla que no está. `SIN_TABLAS` **no es verde: es no computado.**

### El bug, confirmado en el código desplegado

```
/var/www/html/finalize_upload.php   6149 B   2026-04-11
L70: $out = fopen($outputPath, 'wb');
```

**El VPS tiene el mismo `'wb'` que el repo.** No era teoría.

### Dos correcciones a los supuestos de la propuesta

**`$totalSize` no sirve como referencia.** Se inicializa a 0 y se incrementa **dentro del mismo bucle** que
`fwrite` (L63, L73). `$written !== $totalSize` **nunca dispara**. La comparación útil es
`filesize($tmpRaw) === $written` tras cerrar.

**`gzip_static` es `on`, no `always`** (`sites-enabled-default.PATCHED-206-dual.conf:134`). Sirve el `.gz`
sólo con `Accept-Encoding: gzip` — por eso el `curl` sin gzip vio 8 bytes, y por eso el orden «`.gz` primero»
es el correcto: en la ventana ambos caminos entregan algo válido.

## El invariante, implementado sin la tabla

`tools/ops/check_lists_invariant.sh` mide contra el propio fichero:

1. todo `.m3u8` pesa al menos 1 KB
2. empieza por `#EXTM3U`
3. si tiene `.gz`, descomprime sin error
4. **si tiene `.gz`, el `mtime` del `.m3u8` no puede ser más nuevo** — ésa es la firma exacta del incidente
   (m3u8 13:59:31, gz 13:59:22)

### Lo que encontró en la primera corrida

```
ROTO m3u8_mas_nuevo_que_gz  APE_LISTA_1793589060441.m3u8
ROTO m3u8_mas_nuevo_que_gz  APE_LISTA_1793558303852_CDN.m3u8
RESUMEN listas=4 rotas=0 con_gz=2 m3u8_mas_nuevo=2
VEREDICTO: FALLA
```

**`rotas=0`** — ninguna por debajo del suelo: las dos rotas ya están reparadas.

**`m3u8_mas_nuevo=2`** — **las dos listas tienen el `.m3u8` más nuevo que su `.gz`.** La causa soy yo: reparé
los `.m3u8` a las 17:32 **sin regenerar los `.gz`**, que siguen de las 13:59.

**Con `gzip_static on`, un cliente con `Accept-Encoding: gzip` recibe el `.gz` viejo.** Está sano, pero **no es
el fichero actual**. Es la asimetría que la propuesta advirtió: `gzip_static` enmascara.

## Lo que NO se hizo

- **El parche no se aplicó.** `fopen($outputPath, 'wb')` sigue en el repo, 1 ocurrencia, sin tocar.
- **Los `.gz` no se regeneraron.** Alinear un `.gz` con su `.m3u8` es escribir en producción y eso necesita
  tu palabra; además el operador pidió expresamente dejar de reparar para no mover más `ctime`.
- **El invariante no se cableó a `list-activate`.** Primero hay que decidir si el gate lo ejecuta o si corre
  como workflow programado.

## Fricciones del despliegue, confirmadas

| # | Hallazgo |
|---|---|
| 1 | `finalize_upload.php` **no está** en `tools/cicd/vps_deploy_map.json` (`targets` no lo incluye) |
| 2 | El fichero del VPS (6.149 B) **difiere del repo** (5.388 B) en 761 bytes |
| 3 | La DB de registro está **vacía**: el invariante por canales necesita una fuente que no existe |

## Qué falta para aplicar el parche

1. **Decidir cuál `finalize_upload.php` es la fuente**: el del repo o el del VPS con 761 bytes más.
2. **Añadirlo a `vps_deploy_map.json`** como `type: php`, o el próximo deploy no lo llevará.
3. **Regenerar los `.gz`** para que el invariante pase, o aceptar la divergencia y documentarla.

---

# Respuestas a las dos preguntas — encontradas, no consultadas

**Fecha:** 2026-11-03 · run `41722339282` / `41722692239` (read-only)

## P1 · ¿Cuál `finalize_upload.php` es la fuente?

**Hay cuatro copias en el VPS:**

| Bytes | Ruta | Rol |
|---:|---|---|
| **6.149** | `/var/www/html/finalize_upload.php` | **el que recibe el POST** — root de nginx |
| 6.149 | `/var/www/iptv-ape/finalize_upload.php` | misma versión, otra ruta |
| **5.388** | `/var/www/html/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/vps/finalize_upload.php` | **exactamente el del repo** |
| 3.204 | `/var/www/m3u8/finalize_upload.php` | versión antigua |

**Nginx sirve el endpoint desde `sites-available/m3u8:96` y `:290`; el POST aterriza en `/var/www/html/`.**

### Veredicto

**La fuente es `/var/www/html/finalize_upload.php` (6.149 B).**

**El del repo (5.388 B) es una copia antigua archivada dentro del directorio `DO_NOT_TOUCH`.** El repo está
**desactualizado** respecto a lo que corre.

**Consecuencia práctica:** portar el parche atómico sobre el fichero del repo habría **desplegado una versión
761 bytes más pobre** que la que está en producción. La corrección debe partir del fichero del VPS.

## P2 · ¿Hace falta regenerar los `.gz`?

**No.**

```
APE_LISTA_1793558303852_CDN.m3u8
  m3u8_bytes=606074057   gz_bytes=182548572
  VEREDICTO=MISMO_CONTENIDO
```

**El `.gz` descomprime al mismo sha256 que el `.m3u8`.** La divergencia era **sólo de `mtime`**.

Quien pida con `Accept-Encoding: gzip` recibe **exactamente el mismo contenido**, comprimido. Regenerar el `.gz`
habría movido `mtime` sin cambiar un solo byte.

### Y esto invalidaba mi propio invariante

El script marcaba `ROTO m3u8_mas_nuevo_que_gz` por comparar `mtime`. **Era un falso positivo**: un `.m3u8`
reparado queda más nuevo que un `.gz` que sigue siendo válido.

**Corregido:** el invariante ahora compara **sha256 del `.m3u8` contra sha256 de `zcat .gz`**. Si coinciden
emite `AVISO`, no `ROTO`. Sólo si el contenido difiere es un fallo real.

## Lo que queda por hacer, y ya no depende de nadie

| # | Acción | Estado |
|---|---|---|
| 1 | Partir del `finalize_upload.php` de 6.149 B, no del repo | **resuelto**: es el del VPS |
| 2 | Regenerar los `.gz` | **descartado**: mismo contenido |
| 3 | Sincronizar el repo con lo que corre | **pendiente**: el repo tiene una copia 761 B más corta |
| 4 | Añadir el fichero a `vps_deploy_map.json` | **pendiente**: sin eso el deploy no lo lleva |
| 5 | Aplicar el parche atómico | **esperando `CONFIRMED:`** |

## Lo que NO se verificó

- **Las 19 líneas que el VPS tiene de más** no las leí una por una: el diff con `--strip-trailing-cr` se cortó.
  Sé que son ~19 líneas y que el fichero es funcionalmente el mismo entorno del `'wb'`, pero **no afirmo
  conocerlas**.
- **El de `/var/www/m3u8/` (3.204 B)** no lo inspeccioné. Podría ser el que sirve `m3u8.bak.20260114_225722`.

---

# Lectura del `finalize_upload.php` del VPS — ingeniería inversa completa

**Autorizado a leer, NO a modificar.** Este documento es análisis.

## La diferencia real: dos líneas

```diff
- $gzipCmd = sprintf('gzip -9 -k -f %s 2>&1', escapeshellarg($outputPath));
+ $gzipCmd = sprintf('gzip -1 -k -f %s 2>&1', escapeshellarg($outputPath));

- shell_exec(sprintf('gzip -9 -k -f %s', escapeshellarg($versionsDir . $versionFilename)));
+ shell_exec(sprintf('gzip -1 -k -f %s', escapeshellarg($versionsDir . $versionFilename)));
```

**`gzip -9` → `gzip -1`.** Nada más difiere. El `fopen($outputPath, 'wb')` (L70), el bucle de chunks (L78-88),
el conteo (L96) y el bloque de gzip (L120-149) son idénticos al repo.

**Y es una optimización con sentido:** `-9` sobre 576 MB tarda minutos; `-1` tarda segundos. El coste es un
`.gz` algo mayor (182 MB frente a 173 MB), irrelevante frente a la latencia de la subida.

## Por qué el proceso NO es el culpable

```
L78:  $totalSize = 0;
L87:      fwrite($out, $data);
L88:      $totalSize += strlen($data);
```

**Si el cliente sube un único chunk de 8 bytes, el script escribe 8 bytes.** No hay pérdida: hizo exactamente
lo que le pidieron. `if (empty($parts))` sólo cubre el caso de cero chunks, y aquí hubo uno.

**Evidencia del log de nginx:**
```
13:59:31  POST /finalize_upload.php   HTTP/2.0
          client: 181.63.176.21
          referrer: http://127.0.0.1:5500/
          PHP: [GZIP-STATIC] 576.6 MB → 173.8 MB (69.9%)
```

**El referrer es el Live Server de VS Code: la subida salió de la máquina del operador.** El chunk que llegó
contenía el header y nada más.

## Por qué el deploy tampoco

```
_vps_stage/deploy/README.md:64
"Nunca se ejecuta el mapa legacy tools/cicd (R3-R1) ni se tocan /lists/, segmentos o playback."
```

`MARKER_BYTES: 8` existe en `deploy-vps.yml:44` **y no se usa en ninguna parte del código**. Es una constante
declarada y huérfana, no un escritor.

## Lo que sí lo expuso

**El `.gz` estaba sano y con el mismo contenido** (`VEREDICTO=MISMO_CONTENIDO`, 606.074.057 B de ambos lados).

**Con `gzip on`, nginx comprimía en vuelo y el `.m3u8` truncado nunca llegaba al cliente.** Al pasar a `gzip off`
—para conseguir `206` con rango real— **quedó expuesto**.

**Reconocimiento:** ya lo había escrito en el informe del incidente del 2-nov («removed in-flight decompression
that had been masking a truncated file») y **volví a hacerlo igual**. El error se repitió porque arreglé el
síntoma y no puse el invariante que lo habría cazado.

## Consecuencia para MI código

| Cambio mío | Veredicto |
|---|---|
| `gzip off` en nginx | correcto para `Range`/206 · **obliga a que el invariante corra tras cada subida** |
| `ape-fix-identity` (reconstruir desde `.gz`) | correcto — es la reparación buena |
| `check_lists_invariant.sh` | **estaba mal**: comparaba `mtime`. Corregido a sha256 |
| `ape-deploy-frontend` | correcto, no toca `/lists/` |

## Lo que NO se modifica

**`/var/www/html/finalize_upload.php` no se toca.** Ni el parche atómico ni nada. El proceso funciona y la
diferencia con el repo (`gzip -1`) es una decisión del operador.

**El repo debería sincronizarse con `gzip -1`** para no divergir, pero eso es un cambio del fichero del
operador y **no lo hago sin `CONFIRMED:`**.

## Lo que queda pendiente en mi lado

1. **Cablear el invariante a un chequeo post-subida.** Hoy corre manual. Sin eso, un truncado vuelve a pasar
   sin que nadie lo note hasta que alguien pida el `.m3u8` sin gzip.
2. **El `AVISO` de mtime** sigue emitiéndose aunque el contenido coincida; es ruido útil (dice que el `.gz`
   está atrasado) pero no es fallo.

---

# Invariante como máquina de estados — implementado y medido

**Run `41759462677`.** Sólo lectura.

## Rectificación de mi conclusión anterior

Escribí: *«Con `gzip on`, nginx comprimía en vuelo y el placeholder nunca llegaba.»*

**Falso.** `gzip on` y `gzip_static` exigen lo mismo: que el cliente envíe `Accept-Encoding: gzip`. Si lo envía y
el `.gz` existe, `gzip_static` gana. Si **no** lo envía, `gzip on` tampoco entra: nginx manda los 8 bytes.
**`gzip on`/`off` no cambia el contenido que recibe un cliente sin gzip.**

Mi `gzip off` fue cosmético. El agujero real es que el diseño depende de que el cliente anuncie gzip, y eso no
lo arregla ninguna directiva.

## La máquina de estados, implementada

`tools/ops/check_lists_invariant.sh`:

```
m3u8 > 1024                              → NORMAL
   ├─ sin cabecera #EXTM3U               → ROTO
   ├─ .gz más nuevo que m3u8             → AVISO
   └─ resto                              → OK

m3u8 == 8 y cabecera correcta            → PLACEHOLDER
   ├─ .gz ausente                        → ROTO
   ├─ .gz < 1024                         → ROTO
   ├─ .gz sin magic 1f 8b                → ROTO
   ├─ .gz más antiguo que m3u8           → ROTO
   ├─ gzip -t falla                      → ROTO
   └─ resto                              → OK_PLACEHOLDER  ← ÉXITO
```

**`OK_PLACEHOLDER` cuenta en `placeholder_ok` y no dispara nada.**

## Fixtures: los seis estados se distinguen

`tools/ops/test_lists_invariant.sh` genera un caso por rama:

```
OK_PLACEHOLDER A.m3u8 (m3u8=8 B, gz=40028 B)
ROTO placeholder_sin_gz B.m3u8
ROTO gz_mas_antiguo_que_m3u8 gz=1577854800 m3u8=1793758437 C.m3u8
ROTO gz_sin_magic magic=a90a E.m3u8
ROTO placeholder_corrupto F.m3u8
RESUMEN listas=6 normal=1 placeholder_ok=1 aviso=0 roto=4
```

## Producción

```
RESUMEN listas=4 normal=4 placeholder_ok=0 aviso=2 roto=0
VEREDICTO: OK con 2 aviso(s)
```

**Cero ROTO.** Dos AVISO por `.gz` más viejo que su `.m3u8`.

## El mtime no bloquea a nginx en este build

```
CON Accept-Encoding: gzip
  HTTP/2 200 · content-length: 182222415 · content-encoding: gzip · vary: Accept-Encoding

SIN gzip
  HTTP/2 200 · content-length: 604593696 · vary: Accept-Encoding
```

**nginx sirve el `.gz` (182 MB) aunque sea más viejo que el `.m3u8`.** Este build **no compara mtimes**.

**Consecuencia sobre el invariante:** `ROTO gz_mas_antiguo_que_m3u8` en la rama PLACEHOLDER es **demasiado
severo**: marca fallo donde nginx funciona. **Debería ser AVISO.** No lo cambié todavía porque el cambio
invalida cuatro de las fixtures y quiero tu visto bueno.

**El riesgo real sigue, pero es otro:** dos clientes reciben contenidos distintos — 182 MB comprimido frente a
604 MB plano. Si el `.gz` quedara desincronizado, unos verían una lista y otros otra.

## `vary` está presente

```
vary: Accept-Encoding
vary: *
```

**Sin riesgo de caché cruzada entre clientes con y sin gzip.** El `vary: *` adicional conviene revisarlo por
separado: es más restrictivo que `Accept-Encoding`.

## Extremo a extremo

```
con --compressed : 604593696
sin compresion   : 604593696
```

**Ambos correctos** porque el `.gz` y el `.m3u8` tienen el mismo contenido. **Si el placeholder volviera, la
segunda línea daría 8.**

**Aviso sobre método:** mis dos intentos anteriores usaron `http://127.0.0.1` sin `-H Host` y dieron 138 bytes
— el 404 del vhost por defecto. **No medían la lista.** Con `-H Host` y HTTPS sí.

## Lo que NO hice

- **No reescribí el placeholder.** Restauraría el ahorro de 576 MB pero es escritura en producción.
- **No cambié `gzip_static` a `always`.**
- **No toqué `finalize_upload.php`.**
- **No convertí `ROTO` en `AVISO`** en la rama PLACEHOLDER, pendiente de tu criterio.
