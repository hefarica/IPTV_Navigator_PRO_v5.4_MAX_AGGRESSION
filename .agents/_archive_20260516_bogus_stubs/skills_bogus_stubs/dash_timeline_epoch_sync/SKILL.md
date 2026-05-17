---
name: dash_timeline_epoch_sync
description: Regla arquitectónica inmutable que exige un Epoch Anchor fijo y un startNumber dinámico en todos los manifiestos DASH generados por los resolvers PHP, previniendo el freeze periódico de ExoPlayer cada 2 minutos.
---

# Sincronización DASH con Epoch Anchor Fijo (Anti-Freeze v16.2)

## Objetivo

Erradicar permanentemente el **freeze periódico de ExoPlayer cada ~2 minutos** al reproducir streams vía DASH-CMAF. Este congelamiento se produce cuando el manifiesto MPD usa un `availabilityStartTime` dinámico (hora actual) combinado con un `startNumber="1"` fijo, causando que el reproductor pierda la sincronía con los segmentos reales después de ~60 segmentos (120 segundos).

## Causa Raíz Forense

### ❌ Código Defectuoso (PROHIBIDO)

```php
$availStart = gmdate('Y-m-d\TH:i:s\Z'); // ← Cambia en cada request
// ...
echo '... startNumber="1" ...';           // ← Fijo, nunca avanza
```

**¿Por qué falla?**

1. Cada vez que ExoPlayer solicita el manifiesto (refresh), `availabilityStartTime` cambia.
2. Pero `startNumber="1"` no avanza.
3. ExoPlayer calcula: `segmento_actual = (now - availabilityStartTime) / segment_duration`
4. Como `availabilityStartTime` cambia, ExoPlayer **recalcula** un número de segmento diferente cada vez.
5. Tras ~60 segmentos, la discrepancia acumulada hace que ExoPlayer solicite segmentos que no existen → **freeze + rebuffering infinito**.

### ✅ Solución Correcta (OBLIGATORIA)

```php
// Ancla de tiempo FIJA — nunca cambia entre requests
$epochStart = 1735689600; // 2025-01-01T00:00:00Z

// startNumber DINÁMICO — avanza con el reloj real
$segDurMs   = 2000;       // 2 segundos por segmento
$nowMs      = (int)(microtime(true) * 1000);
$startNum   = (int)(($nowMs - ($epochStart * 1000)) / $segDurMs);

// availabilityStartTime FIJO — anclado al epoch
$availStart = gmdate('Y-m-d\TH:i:s\Z', $epochStart);
```

**¿Por qué funciona?**

1. `availabilityStartTime` es **siempre** `2025-01-01T00:00:00Z` (invariable).
2. `startNumber` se calcula como la cantidad de segmentos de 2s desde el epoch hasta ahora.
3. ExoPlayer siempre calcula el mismo segmento actual independientemente de cuántas veces refresque el manifiesto.
4. La sincronía es **eterna** → 0% freezes por desync.

## Procedimiento (Paso a Paso)

1. **Localizar TODOS los puntos de generación DASH** en el ecosistema:
   - `resolve.php` → función `renderDASHManifest()`
   - `resolve_quality.php` → función `renderDASHManifest()`
   - Cualquier futuro resolver PHP que genere XML MPD

2. **Verificar** que cada uno contenga exactamente:

   ```php
   $epochStart = 1735689600;
   $segDurMs   = 2000;
   $nowMs      = (int)(microtime(true) * 1000);
   $startNum   = (int)(($nowMs - ($epochStart * 1000)) / $segDurMs);
   $availStart = gmdate('Y-m-d\TH:i:s\Z', $epochStart);
   ```

3. **Verificar** que el `<SegmentTemplate>` use `startNumber="' . $startNum . '"` (NO `startNumber="1"`).

4. **Verificar** que el `<MPD>` use `availabilityStartTime="' . $availStart . '"`.

5. **Desplegar** ambos resolvers al VPS y purgar la caché CMAF (`/dev/shm/ape_cmaf_cache/*`).

## Reglas Estrictas

1. **PROHIBIDO** usar `gmdate('Y-m-d\TH:i:s\Z')` sin argumento de timestamp para `availabilityStartTime`. Siempre debe recibir `$epochStart`.
2. **PROHIBIDO** usar `startNumber="1"` hardcodeado en cualquier `<SegmentTemplate>`.
3. **OBLIGATORIO** mantener paridad 1:1 entre `resolve.php` y `resolve_quality.php` en la lógica de generación DASH.
4. **OBLIGATORIO** que `$epochStart` sea idéntico en ambos resolvers (actualmente `1735689600`).
5. **OBLIGATORIO** purgar `/dev/shm/ape_cmaf_cache/*` después de cada despliegue para evitar segmentos stale.
6. El valor de `$segDurMs` debe coincidir con el atributo `duration` del `<SegmentTemplate>` (actualmente ambos son `2000`).

## Archivos Afectados

| Archivo | Ruta VPS | Función |
| --- | --- | --- |
| `resolve.php` | `/var/www/html/resolve.php` | `renderDASHManifest()` |
| `resolve_quality.php` | `/var/www/html/resolve_quality.php` | `renderDASHManifest()` |

## Verificación Post-Despliegue

```bash
curl -s "https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=auto&mode=dash" | grep -oP 'availabilityStartTime="[^"]*"'
# Esperado: availabilityStartTime="2025-01-01T00:00:00Z"

curl -s "https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=auto&mode=dash" | grep -oP 'startNumber="[^"]*"'
# Esperado: startNumber="XXXXXXX" (número grande, NO "1")
```
