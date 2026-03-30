---
name: "Generación M3U8 Bulletproof (Strict 1:1 Protocol)"
description: "Doctrina estricta inmutable para la generación de listas M3U8. Prohíbe terminantemente duplicar URLs por canal en listas regulares, inyectar headers vacíos que rompan el parser, y colocar etiquetas de Master Playlist (#EXT-X-STREAM-INF) dentro de canales estándar. Garantiza 100% de reproducibilidad en OTT Navigator, TiviMate y ExoPlayer."
---

# 🛡️ DOCTRINA DE GENERACIÓN M3U8 BULLETPROOF (STRICT 1:1 PROTOCOL)

Esta doctrina fue forjada después del Incidente "0 Canales en Vivo" en OTT Navigator (marzo de 2026) y es de cumplimiento OBLIGATORIO Y ABSOLUTO para cualquier modificación futura a todos y cada uno de los motores de generación JS o PHP de IPTV Navigator PRO.

## 🎯 EL PROBLEMA HISTÓRICO

Los reproductores IPTV tradicionales (especialmente OTT Navigator y TiviMate, bajo el motor ExoPlayer) cuentan con parsers de .m3u8 **extremadamente estrictos y rígidos** al leer listas de canales. Durante iteraciones previas, inyectamos lógica de *Master Playlists HLS* (RFC 8216) dentro de nuestra lista *Regular* de canales. Eso produjo comportamientos destructivos:

1. **Bloqueo por Tag Vacío:** `#EXTVLCOPT:http-proxy=` vacío hizo que el cliente leyera la siguiente línea (la URL del canal) como el valor del proxy. El canal se quedó sin URL. OTT Navigator arrojó: "0 Canales en Vivo".
2. **Duplicidad de URLs:** Si se enviaban 2 URLs seguidas después de un `#EXTINF`, el parser se corrompía y saltaba el canal.
3. **Infección de `#EXT-X-STREAM-INF`:** Este tag le indica al reproductor que lo que sigue no es un canal, sino un sub-manifesto. Destruye la carga masiva en listas IPTV de canales.

## ⚖️ REGLAS DE LA DOCTRINA (INMUTABLES)

### REGLA 1: Relación 1:1 Estricta (Un `#EXTINF` = Una URL)

Cada bloque de metadatos de un canal **DEBE** terminar obligatoriamente en **una sola y única URL válida** que apunte al stream/proxy final.

* **PROHIBIDO:** Añadir URLs de *fallback* TS debajo de una URL primaria. Los reproductores IPTV estándar no saben qué hacer con dos strings consecutivas que no tienen un tag `#EXTINF` delante de cada una.
* Si se requiere fallback, el ruteo debe suceder en el backend (`resolve_quality.php`), NUNCA expuesto en múltiples URLs en el text plano del cliente.

### REGLA 2: Prohibición de Etiquetas Vacías

Si un tag u opción (como `#EXTVLCOPT:http-proxy=`) no tiene un valor válido para el cliente, **NO DEBE SER INYECTADO**.

* **PROHIBIDO:** `lines.push('#EXTVLCOPT:http-proxy=');`
* **EXPLICACIÓN:** Las cadenas de parsing sin terminación hacen un consumo glotón (*greedy consumption*) de la siguiente línea de texto.

### REGLA 3: Aislamiento del Nivel Jerárquico HLS

La etiqueta `#EXT-X-STREAM-INF` está terminantemente prohibida a nivel de Lista de Canales Principal ("Media Playlist IPTV de Catálogo").

* Esa etiqueta **solo** puede habitar en los manifiestos que devuelve el motor en el backend (`resolve_quality.php` o `cmaf_worker.php`) para adaptar la calidad de un solo canal en tiempo real.
* Si la imprimes en el listado masivo, el reproductor convertirá a tu canal en una carpeta vacía.

### REGLA 4: Prioridad y Consistencia (#EXTHTTP / Prio Quality)

* **Headers inyectados vía #EXTVLCOPT o #KODIPROP:** Deben estar completos y bien formateados (`llave=valor`).
* Si envías un JWT en los headers (Clean URL Mode), escóndelo bajo `#EXTVLCOPT:http-header:Authorization=Bearer TUKEN...` y no lo pegues crudo en un `#EXTHTTP` fuera del estándar.

---

## 🛠️ FLUJO DE PRUEBA Y AUDITORÍA

Antes de aprobar cualquier cambio en el M3U8 Generator (`m3u8-typed-arrays-ultimate.js`, `GENERATOR_V17...`, etc.), debes revisar verbalmente tu código modificado y correr esta checklist mental:

* [ ] ¿Hay solo una URL (http/https) antes del siguiente #EXTINF?
* [ ] ¿Eliminé o comenté el push de `#EXT-X-STREAM-INF` del nivel de lista principal?
* [ ] ¿Aseguré que no exista NINGUNA línea `http-proxy=` vacía?
* [ ] Si usé compactaciones, ¿confirmé que el resultado concatenado en la string final preserva el salto de línea `\n` exacto sin dejar líneas en blanco sueltas entre el bloque de metadata y la URL?

Si la respuesta a todo es SÍ, el código es **Bulletproof**.
