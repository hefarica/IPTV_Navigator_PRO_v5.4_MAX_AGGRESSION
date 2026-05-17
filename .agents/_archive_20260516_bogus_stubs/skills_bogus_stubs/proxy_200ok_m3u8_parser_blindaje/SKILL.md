---
name: Protocolo de Blindaje 200OK & 302 Redirect (VPS Proxy)
description: Regla maestra sobre cómo el Proxy resolve_quality_unified.php enruta dinámicamente streams HLS y TS para evitar bloqueos y colapsos de VLC.
---

# Protocolo de Blindaje 200OK & 302 Redirect

Este documento establece la doctrina absoluta para la manipulación de extensiones y URLs dentro de `resolve_quality_unified.php` (El Single Source of Truth del Proxy VPS de IPTV Navigator PRO).

## 1. Regla del 302 Redirect para Streams de Transporte (.TS, .MP4, .MKV)
Si el generador M3U8 de interfaz inyecta un formato de transporte puro (`.ts`, `.mp4` o `.mkv`) dentro del parámetro `url=`, el proxy **NO PUEDE** envolver el canal en un contenedor HLS (`#EXTM3U`). Hacer esto causa un "Buffer Float" en reproductores como VLC, donde el player se asfixia esperando un cierre de fragmento para un streaming en vivo que jamás termina.
- **Acción Obligatoria:** Implementar detección de `pathinfo()` sobre `$best_quality_url`. Si la extensión NO es `m3u8`, se debe disparar instantáneamente un `header("Location: URL, true, 302); exit;`.

## 2. Regla del Wrapper para Streams HLS (.M3U8)
Si el stream objetivo tiene extensión `.m3u8` (Ej. TiviOne, o Dream4K forzado a HLS mediante Profile Manager), el proxy permite el enrutamiento y envuelve el canal con la cápsula maestra `#EXTM3U`. 
- **Acción Obligatoria:** Se imprime `#EXT-X-VERSION:3`, `#EXT-X-TARGETDURATION:10` y se suministra la URL hacia el servidor upstream (o la versión alterada local mediante Smart Routing).

## 3. Extracción de URLs (La Misión Crítica "ADN Corrupto")
Bajo ninguna circunstancia el resolver debe suponer que la URL viene codificada o atada a identificadores inyectados al final de la cadena de consulta (como ocurría en APE v4) si el parámetro explícito `$_GET['url']` está presente.
El intento de desencriptar URLs inexistentes generó el fallo `ADN CORRUPTO`, inyectando HTML dentro de la sesión de video y destruyendo el parser de OTT Navigator.
- **Validación Estricta:** `$origin_url = urldecode($_GET['url']);` es la fuente primaria e irrefutable de la resolución inicial, la cual se somete luego a los diccionarios cruzados SSL.
