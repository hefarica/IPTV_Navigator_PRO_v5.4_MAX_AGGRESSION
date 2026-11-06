# Parche: los 6 levers de Amazon (Fire TV MT8696) por la cadena VPS → ARA

**Estado:** PREPARADO, **NO DESPLEGADO**. Requiere autorización explícita por tocar `ape_mesh.php`.
**Fecha:** 2026-11-05

---

## Por qué existe

Medido hoy sobre `firestick-cali` (AFTKRT, `ro.board.platform=mt8696`):

| Los 6 `com.amazon.tv.*` en el device | Valor |
|---|---|
| `motion_smoothness` | 2 (MEMC por hardware) |
| `picture_sharpness` | 65 |
| `dynamic_contrast` | high |
| `picture_mode` | movie |
| `noise_reduction` | auto |
| `color_temperature` | cool |

**Están puestos, pero los puse por ADB.** Si el device se resetea o se reinstala la app, se pierden y **el VPS no puede recuperarlos** porque hay dos muros:

1. **`ape_ff_settings_ns_map()`** tiene 15 claves y **ninguna de Amazon** → `continue` antes de mirar el valor.
2. **El filtro de tipo** solo admite enteros (`-?\d{1,4}`) y luego hace `(string)(int)$v` → **`"high"`, `"movie"`, `"auto"`, `"cool"` se convierten en `0`**, y los `0` significarían *off*, no *high*.

Sin este parche, ampliar el `ALLOW_KEY` del APK no sirve de nada: el VPS nunca emitiría esas filas.

---

## Cambio 1 — `ape_mesh.php`, función `ape_ff_settings_ns_map()`

Añadir al final del array, antes del cierre:

```php
// ── FIRE TV / AMAZON (MT8696) ────────────────────────────────────────────────
// Viven en `system`. Sin estas 6 el Fire TV no puede recibir su lever real de imagen
// por la cadena; solo tiene lo que se le puso por ADB, que se pierde en un reset.
'com.amazon.tv.motion_smoothness' => 'system',
'com.amazon.tv.picture_sharpness' => 'system',
'com.amazon.tv.dynamic_contrast'  => 'system',
'com.amazon.tv.picture_mode'      => 'system',
'com.amazon.tv.noise_reduction'   => 'system',
'com.amazon.tv.color_temperature' => 'system',
```

## Cambio 2 — `ape_mesh.php`, función `ape_ff_device_settings_from_delta()`

**Antes** (una sola rama para todo):

```php
if (!isset($nsMap[$k])) continue;
if (!(is_int($v) || is_float($v) || (is_string($v) && preg_match('/^-?\d{1,4}$/', $v)))) continue;
$out[] = $nsMap[$k] . ' ' . $k . ' ' . (string)(int)$v;
if ($k === 'ai_pq_mode') $out[] = 'global ai_pic_mode ' . (string)(int)$v;
```

**Después** (rama separada para Amazon, sin tocar la rama numérica):

```php
if (!isset($nsMap[$k])) continue;
// Amazon expone valores de TEXTO (high/movie/auto/cool). Pasarlos por (int) los volveria
// 0, que significa "off" en su vocabulario -> se aplicaria lo contrario de lo pedido.
// Se validan con una allowlist de palabras, no con cast.
if (strpos($k, 'com.amazon.tv.') === 0) {
    $vs = strtolower(trim((string)$v));
    if (!preg_match('/^(off|low|medium|high|auto|cool|normal|warm|standard|movie|dynamic|vivid|game|[0-9]{1,3})$/', $vs)) continue;
    $out[] = $nsMap[$k] . ' ' . $k . ' ' . $vs;
    continue;
}
if (!(is_int($v) || is_float($v) || (is_string($v) && preg_match('/^-?\d{1,4}$/', $v)))) continue;
$out[] = $nsMap[$k] . ' ' . $k . ' ' . (string)(int)$v;
if ($k === 'ai_pq_mode') $out[] = 'global ai_pic_mode ' . (string)(int)$v;
```

**La rama numérica queda byte a byte igual.** El cambio es un `if` nuevo que se evalúa antes y solo actúa si la clave empieza por `com.amazon.tv.`.

## Cambio 3 — `SettingsApplier.kt` (ya aplicado en el repo)

- **6 entradas en `NS_HINT`** → `system`
- **6 entradas en `ALLOW_KEY`** con regex por clave:
  ```
  motion_smoothness  ^[0-3]$                          // 0 off · 1 low · 2 med · 3 high
  picture_sharpness  ^\d{1,3}$                        // 0..100, sweet spot 50-70
  dynamic_contrast   ^(off|low|medium|high)$
  picture_mode       ^(standard|movie|dynamic|vivid|game|auto)$
  noise_reduction    ^(off|low|medium|high|auto)$
  color_temperature  ^(cool|normal|warm)$
  ```

**Sigue siendo allowlist estricta con regex.** El VPS no puede escribir nada fuera de esos rangos.

---

## Verificación antes de desplegar

```bash
# 1 · el PHP resultante compila
php -l ape_mesh.php

# 2 · el diff es solo aditivo (no debe quitar lineas)
git diff --stat -- IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_mesh.php

# 3 · las 6 claves nuevas aparecen exactamente una vez en el mapa
grep -c "com.amazon.tv" ape_mesh.php     # esperado: 6 en el mapa + 1 en el if = 7

# 4 · la rama numerica sigue intacta
grep -n "(string)(int)" ape_mesh.php     # debe seguir ahi
```

## Despliegue (cuando se autorice)

**El workflow NO despliega `lib/ape_mesh.php`.** Desplegarlo exige un paso nuevo, y ese fichero lo usan **todos** los endpoints (`url2-cartridge`, `ape-parity-tags`, `ape-last`, `qoe-flush`, `events-sse`, `feedforward`…).

**Riesgo real:** un error de sintaxis en `ape_mesh.php` tumba los seis endpoints a la vez. Ya pasó en esta sesión con otro fichero.

**Secuencia segura:**

1. `php -l` del fichero modificado **en el runner**, antes de tocar nada
2. **Copia de seguridad con stamp**: `/var/backups/ape-deploy/<stamp>/ape_mesh.php`
3. `install` del fichero
4. **`php -l` en el destino**, no solo en el runner
5. `curl` a los 6 endpoints comprobando HTTP 200
6. Si cualquiera falla → **restaurar el backup en el mismo step**

**Rollback en una línea:**
```bash
cp -a /var/backups/ape-deploy/<stamp>/ape_mesh.php /var/www/html/prisma/lib/ape_mesh.php
```

## Después del despliegue

1. `systemctl start ape-quality-sync.service` (empuja el delta con los 6 Amazon)
2. El ARA debería pasar de **13 → 19** filas aplicadas
3. Verificar en el device:
   ```bash
   adb shell settings get system com.amazon.tv.motion_smoothness   # 2
   ```

**Y para que el APK los acepte hace falta el build nuevo con el `SettingsApplier.kt` modificado.** Sin ese build, el VPS las emitirá y el APK las rechazará con `RECHAZADO (no allowlist)` en su log.

---

## Lo que este parche NO hace

- **No toca `RESOLUTION`, `CODECS` ni `BANDWIDTH`.**
- **No altera la rama numérica** que ya funciona para MediaTek y Amlogic.
- **No se despliega solo.** El fichero del repo queda modificado; el VPS sigue con su versión hasta que se autorice.
- **No promete que la imagen mejore.** El MEMC del MT8696 ya está en `2` desde ADB; esto solo garantiza que se recupere tras un reset.
