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
