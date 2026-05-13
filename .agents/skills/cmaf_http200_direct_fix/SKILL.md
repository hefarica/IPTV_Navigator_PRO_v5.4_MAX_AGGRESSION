---
name: "APE v18.8+ CMAF HTTP 200 Direct — Cómo se llegó a imagen funcional"
description: "Documentación definitiva del fix que logró imagen real en OTT Navigator vía CMAF/fMP4. NO REVERTIR ESTOS CAMBIOS."
---

# 🏆 APE v18.8+ CMAF HTTP 200 Direct — Punto de Referencia

> **⚠️ REGLA ABSOLUTA: Este fix funciona. NO lo reviertas. NO lo modifiques sin probar primero.**

## El Problema Original

OTT Navigator mostraba:
```
Error occurred
┃DE┃ DAZN BAR 2 4K
Couldn't match #EXTINF:([\d\.]+)\b in #EXTINF:-1,
```

El canal DAZN BAR 2 4K (ch=1196) no reproducía. Dos bugs separados:

1. **Bug #1 — `$forceDash` capturaba `format=cmaf`**: En `resolve_quality.php` línea 1544, la variable `$forceDash` incluía `$format === 'cmaf'`, lo que causaba un **302 redirect a `manifest.mpd`** ANTES de que el switch maestro (`case 'cmaf'` en línea 1600) fuera alcanzado. El flujo CMAF HTTP 200 Direct nunca se ejecutaba.

2. **Bug #2 — Parseo EXTINF**: OTT Navigator no podía parsear `#EXTINF:-1,` con el regex `([\d\.]+)` porque `-1` no matchea solo dígitos positivos.

## El Fix Exacto (NO BORRAR)

### Fix #1 — `resolve_quality.php` línea 1544

```diff
- $forceDash = ($format === 'mpd' || $format === 'dash' || $format === 'cmaf' || $bridgeConfig === 'DASH_STRICT');
+ $forceDash = ($format === 'mpd' || $format === 'dash' || $bridgeConfig === 'DASH_STRICT');
+ // ⚠️ APE v18.8 FIX: format=cmaf MUST NOT be in $forceDash.
+ // CMAF is handled by the switch maestro case 'cmaf' (HTTP 200 Direct with master.m3u8).
+ // Including it here caused a 302 redirect to manifest.mpd, defeating the entire v18.8 flow.
```

**Por qué funciona**: Al sacar `cmaf` de `$forceDash`, el flujo CMAF ya no es interceptado por el dispatcher DASH (líneas 1550-1568). En su lugar, cae directamente al `case 'cmaf'` del switch maestro (líneas 1600-1669), donde:
1. Se lanza el `cmaf_worker.php` en background
2. Se espera hasta **12 segundos** al `master.m3u8`
3. Se lee el archivo y se **reescriben las URLs relativas como absolutas**
4. Se sirve con **HTTP 200** + `Content-Type: application/vnd.apple.mpegurl`
5. **Sin redirects** — OTT Navigator recibe HLS v7 + fMP4 en una sola llamada

### Fix #2 — APE v18.9 RFC8216 PURE

El ZIP `APE_v18.9_RFC8216_PURE.zip` corrigió el parseo del `#EXTINF` para compatibilidad con OTT Navigator.

## Flujo CMAF Completo que Funciona

```
OTT Navigator → resolve_quality.php?ch=1196&format=cmaf
                    ↓ triggerAtomicCMAFWorker() lanza cmaf_worker.php en background
                    ↓ $forceDash = false (NO incluye cmaf)
                    ↓ $preferDash = false
                    ↓ $serveDash = false
                    ↓ switch($format) → case 'cmaf':
                    ↓ espera hasta 12s al master.m3u8 en /dev/shm/ape_cmaf_cache/1196/
                    ↓ lee el archivo y reescribe URLs relativas → absolutas
                    ← HTTP 200 + Content-Type: application/vnd.apple.mpegurl
                    ← master.m3u8 con URLs absolutas al proxy

OTT Navigator → cmaf_proxy.php?sid=1196&seg=media_0.m3u8
                    ← HTTP 200 con segmentos .m4s como URLs absolutas

OTT Navigator → cmaf_proxy.php?sid=1196&seg=chunk-stream0-NNNNN.m4s
                    ← HTTP 200/206 bytes fMP4 puros
```

## Archivos Involucrados y Versiones

| Archivo | Ubicación VPS | Fix aplicado |
|---------|--------------|--------------|
| `resolve_quality.php` | `/var/www/html/` | v18.9 + forceDash fix |
| `cmaf_worker.php` | `/var/www/html/` | v18.8 (BSF + 300s Suicide + probesize 10MB) |
| `cmaf_proxy.php` | `/var/www/html/` | v18.8 (reescritura URLs absolutas + auto-launch worker) |
| `ape_hls_generators.php` | `/var/www/html/` | v18.8 (sin cambios vs toolkit) |

## Resultado Confirmado

- ✅ **IMAGEN en OTT Navigator** — Canal DAZN BAR 2 4K
- ✅ **HTTP 200 directo** — Sin redirects 302
- ✅ **URLs absolutas** en master.m3u8 y sub-manifiestos
- ⚠️ **Tirones/cortes** — Pendiente de optimización del worker (buffer, reconnect)

## Comandos de Verificación Rápida

```bash
# Verificar que CMAF sirve HTTP 200 (NO 302)
curl -s -D - "https://iptv-ape.duckdns.org/resolve_quality.php?ch=1196&format=cmaf" | head -5

# Verificar que el worker genera segmentos
ls -lt /dev/shm/ape_cmaf_cache/1196/ | head -10

# Verificar que ffmpeg está corriendo
ps aux | grep ffmpeg | grep -v grep

# Purgar caché y reiniciar (si hay problemas)
rm -rf /dev/shm/ape_cmaf_cache/1196 && systemctl restart php8.3-fpm
```

## Próximos Pasos (SIN romper lo actual)

1. Optimizar buffer del worker para reducir tirones
2. Aumentar tolerancia de reconexión de ffmpeg al origin
3. Evaluar si el Suicide Switch de 300s es suficiente
