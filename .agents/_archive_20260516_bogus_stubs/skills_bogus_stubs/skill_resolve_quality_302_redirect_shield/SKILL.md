---
name: Skill Resolve Quality 302 Redirect Shield (Backend Proxy)
description: Protocolo de resiliencia en resolve_quality_unified.php que garantiza que flujos pesados nativos (.ts) eviten encapsulamientos HLS mediante HTTP 302 Redirection.
---

# Skill: Resolve 200OK & 302 Redirect Shield

## Contexto Forense (Abril 2026)
El proxy `resolve_quality_unified.php` en modo `200ok` envuelve el canal resultante en un buffer virtual m3u8 `#EXTM3U` (HLS inline). Se descubrió que envolver un streaming interminable pesado (`.ts`) dentro de un bloque HLS asfixia a VLC y reproductores derivados. El parser del reproductor espera que el "fragmento" de video termine antes de comenzar a reproducir; pero un `.ts` Live no termina nunca.

## Doctrina Absoluta de Construcción L7
El archivo `/var/www/html/resolve_quality_unified.php` (y versiones locales) **TIENE ESTRICTAMENTE PROHIBIDO** escupir un payload genérico `#EXTM3U` sin evaluar primero la anatomía de escape de la URL de destino final (`$best_quality_url`).

1. **Extracción y Validación (Zero-Trust Base64):**
   - La URL original **SIEMPRE** se lee del parámetro nativo `$_GET['url']`. Se erradica por completo la decodificación obligatoria de Base64 o AES si `url=` está en texto plano, previniendo el letal fallo de inyección `[⚠️ APE ERROR] ADN DE CANAL CORRUPTO`.

2. **La Válvula de Escape 302 (MPEG-TS Bypass):**
   - El proxy debe usar `pathinfo()` sobre `$best_quality_url` parseada.
   - Si la extensión final del target detectada es **distinta** de `m3u8` (Específicamente `.ts`, `.mp4` o `.mkv`), el proxy rompe el blindaje M3U8 para salvar el ancho de banda y la compatibilidad, e imprime nativamente:
     `header("Location: " . $best_quality_url, true, 302); exit;`

3. **Orquestación HLS Inline (Excepción de Comportamiento):**
   - Únicamente si el target es de hecho un playlist `.m3u8` válido, el proxy tiene autorización para generar e imprimir en pantalla el bloque Master File (`#EXTM3U \n #EXT-X-VERSION:3 \n #EXT-X-TARGETDURATION...`). Esto encapsula canales sanos (como TiviOne) y oculta la credencial real.

## Consecuencias de Infracción
La omisión del 302 Redirect Shield para flujos `.ts` causará que hasta el 60% de los canales premium de la industria (Dream4k/KemoTV) se queden con el letrero eterno de cargando. La omisión cuesta la usabilidad del sistema OMEGA a nivel de producción.
