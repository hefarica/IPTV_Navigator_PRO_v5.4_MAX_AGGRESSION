---
name: Protocolo 200OK SSOT Playback Assurance & Cosmetic URLs
description: Regla y Workflow que documenta por qué la orquestación 200ok a través de resolve_quality_unified.php reproduce con éxito burlando el bloqueo, y cómo aplicar cambios cosméticos mediante PathInfo.
---

# REGLA Y WORKFLOW: Protocolo 200OK SSOT Playback & Cosmetic Naming

## 1. La Regla del Éxito (El Secreto del 200OK)

El ecosistema OMEGA logra reproducir la señal y burlar los bloqueos (incluido el error "unrecognized format" o banneos L7) porque fuerza al reproductor cliente a transitar por un embudo de engaño (`resolve_quality_unified.php`) utilizando el **Modo 200 OK** con extensiones forzadas. 

**Componentes inmutables para el éxito de la URL:**
- `mode=200ok`: Le dice al script PHP que se comporte como un proxy directo transparente, descargando él mismo el stream HLS y modificando todos los manifiestos internos (M3U8 anidados), en lugar de enviar un HTTP 302 Redirect (que expone el origen al ISP).
- `url=[ORIGEN_ENCODED]`: Transporta la URL pura del origen. Esta URL suele incluir un token criptográfico mastodóntico (`ape_jwt=...` y `ctx=...`) forjado en el frontend para burlar controles de conexión concurrentes y proteger la IP. **(NUNCA ALTERAR SU CONCEPCIÓN MATH-CRYPT MATRICIAL)**.
- `ext=.m3u8` (Inyectado si hace falta): Fuerza a motores tontos (como reproductores de LG/Samsung TV antiguos o parsers no muy robustos) a reconocer forzosamente que el output será de tipo aplicación HLS Apple (`application/vnd.apple.mpegurl`).
- **El Wrapper PathInfo (El Truco Cosmético):** Añadir `/Nombre_Del_Canal.m3u8` justo después de `.php`.

---

## 2. El Cambio Cosmético (Cosmetic PathInfo Trick)

Cuando inyectamos la URL de SSOT en la lista M3U8, la adición de los JWT criptográficos (que ocupan cientos de caracteres) causa que el OSD (On-Screen Display) de algunos reproductores colapse visualmente, mostrando una maraña de texto ilegible en vez del nombre del canal.

**Solución Implementada:**
Aplicación de inyección **PathInfo API**.
Los servidores web como Nginx/Apache que interpretan PHP ignoran funcionalmente cualquier ruta que exista después de la extensión `.php/` pero la proveen como ruta virtual. Los reproductores IPTV leen la URL de derecha a izquierda o separan las query strings (`?`) y usan la última secuencia de la ruta lógica como el **nombre del archivo/canal a mostrar**.

**Transformación:**
*URL Original OSD Destructiva:*
`https://iptv-ape.duckdns.org/resolve_quality_unified.php?ch=3&profile=DEFAULT&mode=200ok&url=...ape_jwt...`

*URL Cosmética Perfecta (OSD UX):*
`https://iptv-ape.duckdns.org/resolve_quality_unified.php/Nombre_Del_Canal_HD.m3u8?ch=3&profile=DEFAULT&mode=200ok&url=...ape_jwt...`

Al usar esta técnica, el reproductor leerá "Nombre_Del_Canal_HD" y lo mostrará hermosamente en la interfaz cuando pida el renderizado de red. La construcción paralela de los queries se mantiene intacta asegurando la invulnerabilidad del token JWT.

---

## 3. Workflow de Parcheo Cosmético (ADDITIVE-ONLY)

1. En el script de inyección o generación (como `patch_urls_additive_only.py`), leer la directiva `#EXTINF`.
2. Extraer el nombre humano que se encuentra después de la última coma: `#EXTINF:-1 tvg-id="3",Top Channel 4K` -> `Top Channel 4K`.
3. Sanitizar este nombre reemplazando espacios y caracteres conflictivos por guiones bajos: `Top_Channel_4K`.
4. Inyectarlo inmediatamente después del endpoint `.php/` y cerrarlo con `.m3u8`.
```python
# Ejemplo de inyección PathInfo nativa:
new_url = f"https://iptv-ape.duckdns.org/resolve_quality_unified.php/{channel_name_safe}.m3u8?ch={ch}&mode=200ok&url={encoded_origin}"
```
5. Escribir el nuevo M3U8 sin borrar ni una sola línea original del ecosistema.

**RESULTADO:** El reproductor se traga toda la URL mastodóntica invisiblemente por red, pero el operador solo ve el nombre bonito del canal en la UI de carga.
