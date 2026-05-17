---
name: Diagnóstico ExoPlayer DASH Black Screen & UnrecognizedInputFormatException
description: Matriz de diagnóstico y destrucción definitiva del error UnrecognizedInputFormatException y pantalla negra en ExoPlayer (TiviMate, OTT Navigator, Smarters) al reproducir streams DASH/CMAF vía proxy PHP.
---

# 🧠 MATRIZ ANTIGRAVITY: RESOLUCIÓN DEL `UnrecognizedInputFormatException` EN DASH

**Versión:** 1.0 ENTERPRISE  
**Clasificación:** Crítico / Arquitectura de Video  
**Aplica a:** `cmaf_proxy.php`, `cmaf_worker.php`, `resolve.php`, `resolve_quality.php`

---

## 0. CONTEXTO DEL ERROR

Cuando un reproductor basado en ExoPlayer (TiviMate, OTT Navigator, Smarters) arroja `UnrecognizedInputFormatException` reproduciendo un stream DASH (`.mpd`), significa **irrefutablemente** que:

1. El reproductor **SÍ** logró conectarse al servidor.
2. El reproductor **SÍ** solicitó el fragmento de video (`init.mp4` o `segment.m4s`).
3. El servidor **SÍ** respondió con HTTP `200 OK`.
4. **PERO** el contenido que envió el servidor **NO era un video MP4 válido**.

ExoPlayer espera que el primer byte del archivo sea la cabecera binaria `ftyp` o `moov` del formato MP4/fMP4. Si recibe cualquier otra cosa (texto, espacios, warnings PHP), se estrella instantáneamente.

---

## 1. DIAGNÓSTICO OBLIGATORIO (ANTES DE TOCAR CÓDIGO)

### 1.1 Prueba del `init.mp4` (El Semáforo de Video)

```bash
# Desde SSH al VPS:
curl -sk 'https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=3&seg=init.mp4' | head -c 100 | xxd | head -5
```

**Interpretación:**

| Resultado | Diagnóstico | Acción |
|-----------|-------------|--------|
| Ves `ftyp` o `moov` en hex | ✅ Video válido | Problema está en el `SegmentTemplate` del XML |
| Ves texto HTML/PHP Warning | ❌ Basura PHP (Causa 1) | Aplicar Parche de Pureza Binaria |
| Archivo de 0 bytes o 404 | ❌ FFmpeg no genera (Causa 2) | Revisar `cmaf_worker.php` y RAM-Disk |
| Ves bytes de MPEG-TS (`0x47`) | ❌ Contenedor incorrecto (Causa 3) | FFmpeg no está empaquetando en CMAF |

### 1.2 Verificación del RAM-Disk

```bash
ls -la /dev/shm/ape_cmaf_cache/3/
# Debe mostrar: init*.mp4, chunk-stream*.m4s, manifest.mpd
# Si está vacío o solo tiene ffmpeg.pid → FFmpeg falló silenciosamente
```

### 1.3 Verificación de FFmpeg Stderr

```bash
cat /dev/shm/ape_cmaf_cache/3/ffmpeg.log 2>/dev/null | tail -10
# Si dice "401 Unauthorized" → El worker no tiene credenciales
# Si dice "Invalid data" → Stream de origen corrupto
```

---

## 2. LAS 3 CAUSAS GLOBALES Y SUS PARCHES

### 🪲 CAUSA 1: El "Fantasma" de PHP (Basura en el Buffer)

**Probabilidad:** 90% en sistemas IPTV customizados.

El script `cmaf_proxy.php` inyecta texto (espacios, saltos de línea, warnings) **antes** de enviar los bytes binarios del video.

**🛡️ PARCHE DE PUREZA BINARIA (Obligatorio en `cmaf_proxy.php`):**

```php
<?php
// 🚀 1% AUDIT: PUREZA BINARIA ABSOLUTA
// Esta línea DEBE ser la primera del archivo. Ni un espacio antes.
ini_set('display_errors', '0');
error_reporting(0);

// ... (lógica del proxy para determinar $videoPath) ...

// Verificar que el archivo existe y NO es fantasma
if (!file_exists($videoPath) || filesize($videoPath) < 100) {
    http_response_code(404);
    exit; // 404 limpio es mejor que basura con 200
}

// Aniquilar TODA basura del buffer de salida
if (ob_get_length()) {
    ob_clean();
}

// Cabeceras sagradas de transmisión binaria
header("Content-Type: video/mp4");
header("Access-Control-Allow-Origin: *");
header("Content-Length: " . filesize($videoPath));

// Enviar bytes puros y matar el proceso
readfile($videoPath);
exit;
// ⚠️ NO incluir cierre ?> al final del archivo
```

**Reglas inquebrantables:**

- `<?php` DEBE ser la primera línea y columna (sin BOM, sin espacios).
- **ELIMINAR** la etiqueta de cierre `?>` si existe al final.
- `ob_clean()` SIEMPRE antes de `readfile()`.
- `exit` SIEMPRE después de `readfile()`.

---

### 🪲 CAUSA 2: FFmpeg Generó un `init.mp4` Fantasma o Corrupto

**Probabilidad:** 30% cuando el RAM-Disk se llena o FFmpeg falla silenciosamente.

El manifiesto `.mpd` le dice a ExoPlayer que busque `init.mp4`. Si FFmpeg falló en segundo plano (CPU, códecs incompatibles, RAM-Disk lleno), el archivo puede existir con 0 bytes.

**🛡️ PARCHE DE VALIDACIÓN DE SEGMENTOS:**

```php
// En cmaf_proxy.php, antes de servir el archivo:
if (!file_exists($videoPath) || filesize($videoPath) < 100) {
    http_response_code(404);
    die(); // 404 limpio > archivo corrupto de 0 bytes
}
```

**🛡️ VERIFICACIÓN DE LOGS FFmpeg:**

El `cmaf_worker.php` DEBE redirigir stderr a un log accesible:

```php
// Cambiar en cmaf_worker.php:
// DE: > /dev/null 2>&1
// A:  > /dev/null 2> /dev/shm/ape_cmaf_cache/{ID}/ffmpeg.log
```

---

### 🪲 CAUSA 3: Desajuste de Contenedor (M2TS vs MP4/fMP4)

**Probabilidad:** 15% cuando FFmpeg hace `-c copy` desde MPEG-TS.

El stream de origen viene en formato `.ts` (MPEG-TS) y FFmpeg NO logra remuxear correctamente a fMP4/CMAF.

**🛡️ VERIFICACIÓN:**

```bash
# Inspeccionar el contenedor real del init.mp4:
file /dev/shm/ape_cmaf_cache/3/init*.mp4
# Debe decir: "ISO Media, MP4" o "MPEG-4"
# Si dice: "MPEG transport stream" → FFmpeg no transcodificó
```

**🛡️ SOLUCIÓN:** Asegurar que FFmpeg use `-f dash -dash_segment_type mp4` (no `-f mpegts`).

---

### 🪲 CAUSA 4: Redirección de Protocolo Inválida (DASH → HLS via HTTP 302)

**Symptoma visual exacto:** `Unexpected token (position:TEXT #EXTM3U #EXT-X-VERSION... @18:1)`
**Probabilidad:** Muy alta si el script proxy (p. ej. `resolve_quality.php`) ejecuta un *Atomic Fallback* con `HTTP 302 Location: ...m3u8` cuando la URL original terminaba en `.mpd`.

**Descripción:**
ExoPlayer se "ancla" al analizador de manifiestos según la intención de la solicitud (DASH requiere `DashManifestParser`, que lee estrictamente XML). Si el proxy PHP demora y decide abortar la solicitud DASH respondiendo con un `302 Redirect` a un archivo `.m3u8` (HLS) nativo, ExoPlayer descargará el M3U8 y tratará de leerlo como XML. Al toparse con texto plano (`#EXTM3U`), colapsará con la excepción `Unexpected token`.

**🛡️ PARCHE DE DEFENSA ESTRICTA (Obligatorio en resolver PHP):**

NUNCA redirigir peticiones `.mpd` a `.m3u8`. Si el manifest DASH aún no está listo:

```php
// En resolve_quality.php, bloque if ($format === 'mpd')
// MAL: header('Location: ' . $baseUrlM3U8, true, 302); exit;

// BIEN (503 Retry Nativo):
http_response_code(503);
header('Retry-After: 1');
header('X-APE-Fallback: dash-timeout-retry');
header('Content-Type: text/plain; charset=utf-8');
echo "503 - Stream assembling, please retry.";
exit;
// ExoPlayer auto-reintentará la conexión sin romper el parser.
```

---

## 3. REPARACIÓN DEL `SegmentTemplate` (DASH XML)

### Problema Conocido de ExoPlayer

ExoPlayer a veces falla al concatenar un `<BaseURL>` absoluto con parámetros GET dentro del `media` o `initialization`.

**❌ INCORRECTO (causa pantalla negra):**

```xml
<BaseURL>https://iptv-ape.duckdns.org/</BaseURL>
<SegmentTemplate media="cmaf_proxy.php?sid=3&amp;seg=$Number$.m4s" 
                 initialization="cmaf_proxy.php?sid=3&amp;seg=init.mp4" />
```

**✅ CORRECTO (URLs absolutas directas):**

```xml
<!-- SIN <BaseURL> -->
<SegmentTemplate timescale="1000" 
                 media="https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=3&amp;seg=$Number$.m4s" 
                 startNumber="1" 
                 duration="2000" 
                 initialization="https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=3&amp;seg=init.mp4" />
```

**Aplicar en:** `resolve.php` y `resolve_quality.php`, función `renderDASHManifest()`.

---

## 4. REPARACIÓN DEL RELOJ DINÁMICO (Timeline)

### Problema

Fijar `startNumber="1"` con `availabilityStartTime="1970-01-01T00:00:00Z"` puede confundir a ExoPlayer pensando que el stream lleva 50 años corriendo.

**🛡️ SOLUCIÓN:** Usar la hora actual como `availabilityStartTime`:

```php
$now = gmdate('Y-m-d\TH:i:s\Z');
// En la etiqueta <MPD>:
echo '<MPD ... availabilityStartTime="' . $now . '" ...>';
```

**Alternativa de prueba rápida:** Cambiar `type="dynamic"` a `type="static"` para verificar si el video arranca.

---

## 5. CHECKLIST DE VERIFICACIÓN FINAL

- [ ] `cmaf_proxy.php` tiene `<?php` como primer byte absoluto (sin BOM/espacios)
- [ ] `cmaf_proxy.php` NO tiene etiqueta de cierre `?>`
- [ ] `cmaf_proxy.php` ejecuta `ob_clean()` antes de `readfile()`
- [ ] `cmaf_proxy.php` valida `filesize() >= 100` antes de servir
- [ ] `cmaf_proxy.php` envía `Content-Type: video/mp4`
- [ ] `resolve.php` genera `<SegmentTemplate>` con URLs absolutas (sin `<BaseURL>`)
- [ ] `resolve.php` genera `availabilityStartTime` con hora actual o epoch
- [ ] FFmpeg está generando archivos `init*.mp4` y `chunk-stream*.m4s` en RAM-Disk
- [ ] Los archivos en RAM-Disk pesan > 100 bytes
- [ ] `curl -sk URL/cmaf_proxy.php?sid=3&seg=init.mp4 | xxd | head -5` muestra `ftyp`

---

## 6. COMANDOS DE DIAGNÓSTICO RÁPIDO (SSH)

```bash
# 1. ¿FFmpeg está corriendo?
pgrep -a ffmpeg | head -5

# 2. ¿Hay segmentos en RAM-Disk?
ls -lh /dev/shm/ape_cmaf_cache/3/

# 3. ¿El init.mp4 es un video real?
file /dev/shm/ape_cmaf_cache/3/init*.mp4

# 4. ¿Qué le llega al cliente?
curl -sk 'https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=3&seg=init.mp4' | xxd | head -5

# 5. ¿FFmpeg tuvo errores?
cat /dev/shm/ape_cmaf_cache/3/ffmpeg.log 2>/dev/null | tail -10
```

---

## 7. REGLA DE ORO DEVOPS (Ley V14)

Después de aplicar CUALQUIER parche a `cmaf_proxy.php`, `resolve.php` o `resolve_quality.php`:

```bash
# 1. Subir al webroot CORRECTO
scp -i ~/.ssh/id_ed25519_hetzner archivo.php root@178.156.147.234:/var/www/html/

# 2. Flush nuclear de OPcache + Nginx cache
systemctl restart php8.3-fpm
rm -rf /var/cache/nginx/resolver/*
systemctl reload nginx

# 3. Higiene RAM-Disk
rm -rf /dev/shm/ape_cmaf_cache/*

# 4. Verificar
curl -sk 'https://iptv-ape.duckdns.org/cmaf_proxy.php?sid=3&seg=init.mp4' | xxd | head -5
```

**El código no existe hasta que está operando en `/var/www/html/`.**
