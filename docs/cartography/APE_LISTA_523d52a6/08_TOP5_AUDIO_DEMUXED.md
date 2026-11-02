# Práctica del 5 % en audio demuxed — contraste contra fuentes de terceros

**Fecha:** 2026-11-02 · **Método:** leer la práctica publicada y **contrastarla con mi propio generador**,
regla por regla. No se copia código: solo se adoptan semántica y criterios.

**Fuente principal:** [Ship multi-language audio in HLS (DEV, jul-2026)](https://dev.to/masonwritescode/ship-multi-language-audio-in-hls-author-the-manifest-wire-the-hlsjs-switcher-c7)
· [ngx_http_gunzip_module](https://nginx.org/en/docs/http/ngx_http_gunzip_module.html) para el 206.

---

## 1 · Las reglas del manifiesto demuxed, y si mi generador las cumple

| # | Regla (fuente) | Mi generador | Veredicto |
|---|---|---|---|
| 1 | `#EXT-X-MEDIA:TYPE=AUDIO` con `GROUP-ID`, `NAME`, `LANGUAGE` (BCP-47), `DEFAULT`, `AUTOSELECT`, `CHANNELS`, `URI` | emite la rendition solo si hay fuente real; si no, **NO_COMPUTADO** | ✓ coherente (y la lista no tiene fuente) |
| 2 | Cada `#EXT-X-STREAM-INF` debe llevar `AUDIO="grupo"` y **coincidir exacto, incluida mayúsculas** | G1 valida `AUDIO=` → `GROUP-ID` existente | ✓ ya cubierto |
| 3 | `BANDWIDTH` de la variante **debe incluir el bitrate del grupo de audio**, o el ABR calcula sobre un total falso | se **preserva** el `BANDWIDTH` original muxed, que ya era vídeo+audio | ✓ correcto por conservador (sobreestima, no subestima) |
| 4 | `#EXT-X-VERSION:6` (o superior) al usar grupos de audio | la lista emite VERSION **9** | ✓ |
| 5 | **Misma duración de segmento** en vídeo y en todas las renditions de audio, o el desfase aparece a los minutos | no aplica: el generador no segmenta | — fuera de alcance |
| 6 | **Exactamente un `DEFAULT=YES` por grupo** | G1 lo verifica | ✓ ya cubierto |
| 7 | **Un códec por grupo de audio**; mezclar AAC y EC-3 exige grupos separados | el generador rechaza renditions no verificables | ✓ fail-closed |
| 8 | Safari/nativo lee `EXT-X-MEDIA` directo, sin JS | — | informativo |

**Conclusión: mi arnés G1 ya implementaba 2 de las reglas críticas antes de leer esta fuente**, y las demás
no aplican o se cumplen. La única que **no** tenía explícita es la 3, y se cumple por construcción: el
`BANDWIDTH` original es el muxed, así que incluye el audio.

## 2 · El modo de fallo que la fuente nombra y yo puedo medir

> «El bug clásico: el player carga, suena, pero el selector está vacío. `hls.audioTracks → []`.
> Casi siempre es el manifiesto, no el player.»

Sus cuatro causas, en su orden:

1. No hay `#EXT-X-MEDIA:TYPE=AUDIO` en absoluto.
2. Alguna variante no lleva `AUDIO="aud"`.
3. `GROUP-ID` y el valor de `AUDIO` no coinciden **exactamente**.
4. Versión insuficiente.

**En esta lista, la causa es la 1 y es estructural:** 0 `EXT-X-MEDIA` en 10.573 canales. No es un bug de
player ni de configuración: **el origen es muxed**. Ningún ajuste de manifiesto lo arregla; hace falta un
packager que produzca las renditions.

## 3 · Lo que la fuente confirma del 206 (fuente distinta, misma conclusión)

> «Byte-range requests for video: build a 206 server…»

Y la documentación de nginx: `gunzip` existe para clientes **sin** gzip y **no puede** dar rangos.
Coincide con lo medido aquí: 206 solo cuando el cliente pide `Accept-Encoding: gzip` y el `.gz` existe en
disco.

## 4 · Validación en CI — la práctica que el 95 % no tiene

La fuente propone ~20 líneas que fallan el build si una variante referencia un grupo inexistente.
Es exactamente el principio de `G1_structure` de `verify_demuxed.js`, y el mismo criterio que
`tools/ape-http-conformance/verify_http_matrix.js` aplica al transporte:

> **un manifiesto que no se valida en CI se rompe en el player.**

Aquí ya está en CI: `deploy-vps.yml` corre el smoke y el verificador HTTP en cada dry-run.

## 5 · Repositorios revisados y por qué no se adoptó código

| Repo | Qué aporta | Por qué no se copia |
|---|---|---|
| [Streamline-Media-Lab/iptv-m3u-validator](https://github.com/Streamline-Media-Lab/iptv-m3u-validator) | enfoque de validación de listas IPTV (duplicados, geo, lentos) con salida JSON para CI | licencia no verificada en el sha; y ya tenemos validador propio medido |
| [alexey-lapin/m3u8-parser](https://github.com/alexey-lapin/m3u8-parser) | parser HLS en Java, referencia de comportamiento en cliente | idem: sin verificación de licencia en un sha fijado |
| [dev.to · 206 server](https://dev.to/masonwritescode/byte-range-requests-for-video-build-a-206-server-test-seeking-in-chromium-fix-moov-placement-3b5l) | patrón de servidor 206 verificable | es artículo, no repo; ya implementado en nginx |

**Regla aplicada (FUSILE binding 3):** sin licencia leída en un `sha` fijado, **no entra código**. Se
adopta la semántica, citada, y se implementa con las convenciones de este repo.

## 6 · Lo único que falta y no es código

Un packager que genere las renditions de audio. En un VPS metadata-only (`.ts/.m4s/.mp4 → 404`) no existe,
y hacerlo requiere descargar segmentos del proveedor: **eso es la misión de bitstream, con riesgo de
capital**. Sin eso, el throughpass de audio en esta lista seguirá siendo `NO_COMPUTADO`, no un fallo.
