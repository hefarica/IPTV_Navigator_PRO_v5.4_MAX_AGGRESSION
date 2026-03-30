---
name: Binary Output Purity v16.2 (PhD-Grade Streaming Media Engineering)
description: Doctrina de pureza binaria absoluta para proxies PHP que sirven segmentos CMAF/DASH. Exige ob_end_clean() incondicional, validación de tamaño mínimo de segmentos, y uso exclusivo de SupplementalProperty (no EssentialProperty) para metadatos CICP en manifiestos DASH.
---

# BINARY OUTPUT PURITY v16.2

## Doctrina Inmutable de Ingeniería de Streaming de Nivel PhD

**Estado:** INMUTABLE — OBLIGATORIO PARA TODO SCRIPT QUE EMITA BYTES AL PLAYER  
**Clasificación Académica:** Intersección de 5 ramas de ingeniería de nivel doctoral  

---

## 0. RAMAS DE INGENIERÍA INVOLUCRADAS

Esta Skill surge de la convergencia de disciplinas que, individualmente, son campos de investigación doctoral completos. En conjunto, definen la ciencia detrás de por qué un reproductor IPTV recibe video perfecto o una pantalla negra.

### 0.1 Streaming Media Engineering (Ingeniería de Medios de Streaming)

**Fundamento:** Transmisión de contenido audiovisual segmentado sobre HTTP.

- **ISO/IEC 23009-1 (MPEG-DASH):** Define la estructura de manifiestos MPD y segmentos CMAF.
- **RFC 8216 (HLS):** Define el formato M3U8 y la semántica de playlist.
- **ISO/IEC 23000-19 (CMAF):** Common Media Application Format — fragmentación universal.
- **Principio Shannon:** La información transmitida debe llegar sin pérdida ni adición de bits espurios. Un solo byte extra (BOM, espacio, warning de PHP) destruye el contenedor binario.

### 0.2 Protocol Engineering (Ingeniería de Protocolos)

**Fundamento:** Correcta emisión de cabeceras HTTP para que el cliente (ExoPlayer, VLC, OTT Navigator) interprete correctamente el payload.

- **RFC 7230-7235 (HTTP/1.1):** Semántica de Content-Type, Content-Length, Transfer-Encoding.
- **RFC 9110 (HTTP Semantics):** Reglas de negociación de contenido.
- **RFC 7540 / RFC 9114 (HTTP/2, HTTP/3):** Multiplexado y priorización de streams.
- **CORS (W3C):** Cabeceras `Access-Control-*` que permiten al reproductor Cross-Origin leer el payload.
- **Principio End-to-End (Saltzer, Reed, Clark, 1984):** La responsabilidad de correctitud reside en los extremos (servidor PHP ↔ ExoPlayer), no en capas intermedias (Nginx, CDN).

### 0.3 Systems I/O Programming (Programación de Entrada/Salida de Sistemas)

**Fundamento:** Control absoluto del buffer de salida de PHP-FPM para garantizar que el primer byte enviado al socket sea el primer byte del segmento de video.

- **Output Buffering (ob_start / ob_end_clean):** PHP acumula salida en buffers internos. Si no se vacían antes de emitir binario, basura textual (errores, warnings, BOM Unicode) se antepone al video.
- **Zlib Output Compression:** PHP puede comprimir la salida automáticamente con `gzip`. Para video ya comprimido (HEVC, AV1), esto introduce corrupción o latencia innecesaria.
- **Binary-Safe File I/O:** Funciones como `readfile()`, `fpassthru()`, `stream_copy_to_stream()` deben operar en modo binario sin transformación de caracteres.

### 0.4 Site Reliability Engineering (SRE — Ingeniería de Confiabilidad)

**Fundamento:** El proxy debe ser determinista: mismo input → mismo output. Sin estados ocultos, sin efectos secundarios, sin degradación silenciosa.

- **Principio de Idempotencia:** Cada request GET a un segmento debe devolver exactamente los mismos bytes.
- **Observabilidad:** Cabeceras de diagnóstico (`X-Segment-Size`, `X-Cache-Status`) para depuración sin interceptar el payload.
- **Graceful Degradation:** Si un segmento no existe en RAM-Disk, esperar con backoff antes de devolver 404, nunca devolver HTML de error.

### 0.5 Digital Signal Integrity (Integridad de Señal Digital)

**Fundamento:** El video es una señal digital muestreada. Cualquier corrupción en el contenedor (CMAF, TS, fMP4) destruye la decodificación.

- **CICP (Coding-Independent Code Points, ISO/IEC 23091-2):** Metadatos de color (MatrixCoefficients, TransferCharacteristics, ColourPrimaries) que definen cómo el decodificador renderiza los píxeles.
- **NAL Unit Alignment:** Los segmentos fMP4 deben comenzar con un `moof` box válido. Si PHP antepone bytes, el parser de ExoPlayer lanza `UnrecognizedInputFormatException`.
- **Byte-Exact Content-Length:** El header `Content-Length` debe coincidir EXACTAMENTE con el tamaño del archivo servido. Si difiere, ExoPlayer aborta la descarga.

---

## 1. REGLAS MANDATORIAS (NO NEGOCIABLES)

### REGLA 1: DESTRUCCIÓN INCONDICIONAL DEL BUFFER

Antes de emitir CUALQUIER byte binario (segmento .m4s, .ts, manifiesto .mpd), ejecutar:

```php
while (ob_get_level()) { ob_end_clean(); }
@ini_set("zlib.output_compression", "Off");
```

**Justificación:** Elimina todos los niveles de buffer acumulados por PHP-FPM, plugins, o el propio framework. Desactiva la compresión zlib que corrompería datos ya comprimidos (HEVC/AV1).

### REGLA 2: CONTENT-TYPE EXACTO POR EXTENSIÓN

```php
$ext = pathinfo($filePath, PATHINFO_EXTENSION);
switch ($ext) {
    case 'm4s': case 'mp4': header('Content-Type: video/iso.segment'); break;
    case 'mpd':             header('Content-Type: application/dash+xml'); break;
    case 'm3u8':            header('Content-Type: application/vnd.apple.mpegurl'); break;
    case 'ts':              header('Content-Type: video/mp2t'); break;
    default:                header('Content-Type: application/octet-stream'); break;
}
```

**Justificación:** ExoPlayer (y TiviMate/OTT Nav vía ExoPlayer) decide el demuxer basándose en `Content-Type`. Un `text/html` accidental destruye el pipeline.

### REGLA 3: CONTENT-LENGTH BYTE-EXACT

```php
header('Content-Length: ' . filesize($filePath));
```

**Justificación:** Sin este header, HTTP/1.1 usa `Transfer-Encoding: chunked`, que algunos reproductores IPTV manejan incorrectamente para segmentos cortos.

### REGLA 4: CERO CIERRE DE TAG PHP

Los scripts que sirven binario **NUNCA** deben terminar con `?>`.  
**Justificación:** Un salto de línea después de `?>` se convierte en un byte `0x0A` antepuesto al siguiente output, corrompiendo el NAL Unit Header del video.

### REGLA 5: CERO ECHO/PRINT ANTES DEL BINARIO

Una vez decidido que se va a servir un segmento, queda **PROHIBIDO** cualquier `echo`, `print`, `var_dump`, `print_r`, `trigger_error` con output, o cualquier construcción que emita texto.

```php
// ❌ PROHIBIDO
echo "Debug: serving segment $seg\n";
readfile($filePath);

// ✅ CORRECTO
error_log("Debug: serving segment $seg"); // Va a stderr/logs, NO al socket
readfile($filePath);
```

### REGLA 6: CORS UNIVERSAL PARA REPRODUCTORES

```php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Expose-Headers: Content-Length, Content-Range');
```

**Justificación:** Los reproductores IPTV pueden correr en WebViews donde CORS aplica. Sin estos headers, `fetch()` devuelve `opaque response` y el video no se decodifica.

### REGLA 7: CACHE-CONTROL DIFERENCIADO

```php
// Para segmentos de video (inmutables una vez creados):
header('Cache-Control: public, max-age=3600, immutable');

// Para manifiestos (cambian cada 2-6 segundos en LIVE):
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
```

**Justificación:** Un manifiesto cacheado causa freeze (el player no ve segmentos nuevos). Un segmento sin cache causa re-fetches innecesarios.

### REGLA 8: VALIDACIÓN DE TAMAÑO MÍNIMO DE SEGMENTO

```php
$size = filesize($filePath);
if ($size < 100) { // Un segmento CMAF válido nunca es < 100 bytes
    http_response_code(502);
    error_log("[PURITY] Segment too small: $filePath ($size bytes)");
    exit;
}
```

**Justificación:** Un archivo de 0 bytes o truncado causa `UnrecognizedInputFormatException` en ExoPlayer. Es preferible devolver 502 y forzar un retry que enviar basura.

### REGLA 9: DASH MPD — SUPPLEMENTAL vs ESSENTIAL PROPERTY

Al emitir metadatos CICP (color) en manifiestos DASH dinámicos:

```xml
<!-- ✅ CORRECTO: SupplementalProperty (el player puede ignorarlo si no lo entiende) -->
<SupplementalProperty schemeIdUri="urn:mpeg:mpegB:cicp:MatrixCoefficients" value="1"/>

<!-- ❌ PROHIBIDO: EssentialProperty (el player DEBE entenderlo o rechaza el stream) -->
<EssentialProperty schemeIdUri="urn:mpeg:mpegB:cicp:MatrixCoefficients" value="1"/>
```

**Justificación:** OTT Navigator y TiviMate usan versiones de ExoPlayer que no implementan todos los `EssentialProperty`. Si encuentran uno que no entienden, rechazan el `AdaptationSet` completo → pantalla negra.

### REGLA 10: ELIMINACIÓN DE FIRMAS DEL SERVIDOR

```php
header_remove('X-Powered-By');
header('Server: cloudflare'); // Camuflaje de origen
```

**Justificación:** Ocultar que es PHP/Nginx reduce la superficie de ataque y dificulta el fingerprinting por parte de ISPs que throttlean tráfico IPTV.

---

## 2. PLANTILLA CANÓNICA DE PROXY BINARIO

```php
<?php
declare(strict_types=1);
// ═══════════════════════════════════════════════════════════
// BINARY OUTPUT PURITY v16.2 — Canonical Proxy Template
// ═══════════════════════════════════════════════════════════

// PASO 1: Destruir buffer y compresión
while (ob_get_level()) { ob_end_clean(); }
@ini_set("zlib.output_compression", "Off");

// PASO 2: Validar entrada
$seg = basename($_GET['seg'] ?? '');
$sid = preg_replace('/[^a-zA-Z0-9._-]/', '', $_GET['sid'] ?? '');
if ($seg === '' || $sid === '' || strpos($seg, '..') !== false) {
    http_response_code(403);
    exit;
}

// PASO 3: Localizar archivo
$filePath = "/dev/shm/ape_cmaf_cache/{$sid}/{$seg}";

// PASO 4: Esperar si está en proceso de escritura (backoff)
$maxWait = 15;
for ($i = 0; $i < $maxWait && !file_exists($filePath); $i++) {
    usleep(100000);
}
if (!file_exists($filePath)) {
    http_response_code(404);
    exit;
}

// PASO 5: Validar tamaño mínimo
$size = filesize($filePath);
if ($size < 100) {
    http_response_code(502);
    error_log("[PURITY] Segment too small: {$filePath} ({$size}B)");
    exit;
}

// PASO 6: Headers exactos
$ext = pathinfo($filePath, PATHINFO_EXTENSION);
switch ($ext) {
    case 'm4s': case 'mp4': header('Content-Type: video/iso.segment'); break;
    case 'mpd':             header('Content-Type: application/dash+xml'); break;
    default:                header('Content-Type: application/octet-stream');
}
header('Content-Length: ' . $size);
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Expose-Headers: Content-Length, Content-Range');
header('Cache-Control: public, max-age=3600, immutable');
header_remove('X-Powered-By');

// PASO 7: Emitir binario puro
readfile($filePath);
// SIN CIERRE ?> — NUNCA
```

---

## 3. CHECKLIST DE AUDITORÍA (OBLIGATORIO ANTES DE DEPLOY)

Para cada archivo PHP que sirva contenido al player, verificar:

- [ ] `ob_end_clean()` presente antes del primer byte de salida
- [ ] `zlib.output_compression` desactivado
- [ ] `Content-Type` correcto según extensión (NO `text/html`)
- [ ] `Content-Length` presente y byte-exact
- [ ] CORS headers presentes (`Access-Control-Allow-Origin: *`)
- [ ] Cero `echo` o `print` antes del binario
- [ ] Sin cierre `?>` al final del archivo
- [ ] Validación de tamaño mínimo (> 100 bytes para segmentos)
- [ ] `Cache-Control` diferenciado (immutable para segmentos, no-cache para manifiestos)
- [ ] Firma del servidor eliminada (`X-Powered-By` removido)

---

## 4. ARCHIVOS AFECTADOS EN EL ECOSISTEMA

| Archivo | Función | Aplica Purity |
|---------|---------|---------------|
| `cmaf_proxy.php` | Sirve segmentos .m4s/.mp4 desde RAM-Disk | ✅ OBLIGATORIO |
| `cmaf_worker.php` | Descarga y cachea segmentos (cURL interno) | ⚠️ Solo en salida |
| `resolve.php` | Redirección 302 o passthrough HLS | ✅ OBLIGATORIO |
| `resolve_quality.php` | Genera MPD dinámico o redirige | ✅ OBLIGATORIO |
| `upload.php` | Recibe archivos del frontend | ❌ No aplica |
| `health.php` | Health check JSON | ❌ No aplica |

**Ejecución inmediata e inexorable. Sin excepciones. Sin negociación.**
