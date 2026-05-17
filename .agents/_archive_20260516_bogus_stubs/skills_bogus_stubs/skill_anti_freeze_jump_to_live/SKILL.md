---
name: "Skill_Anti_Freeze_Jump_To_Live"
description: "Doctrina de hardware para ExoPlayer/VLC: Evita la repetición de segmentos durante cortes de red, forzando un 'Jump-to-Live' y salto atómico de fotogramas atrasados."
version: "1.0"
---

# Skill_Anti_Freeze_Jump_To_Live

## Propósito
ExoPlayer y libVLC, ante la caída de un stream HLS, intentan (por convención predeterminada de listas antiguas) re-ejecutar el buffer histórico si se les envía directivas como `loop=1` o `input-repeat`. Esto ahoga la experiencia deportiva en vivo, causando el famoso efecto de "Frame o Jugada Repetida" (Déjà vu de 5 segundos) después de un congelamiento (freeze). Esta habilidad impone la **Regla de Cero Repetición (Jump-To-Live)** como constante transversal a todos los Perfiles (P0-P5).

## Implementación Técnica Absoluta
Cada manifiesto M3U8 forjado DEBE incluir el siguiente armamento estricto en el encabezado de `#EXTVLCOPT` para reventar el bucle infinito:

```javascript
#EXTVLCOPT:input-repeat=0
#EXTVLCOPT:loop=0
#EXTVLCOPT:skip-frames
#EXTVLCOPT:drop-late-frames
```

### Justificación de Parámetros
1. `input-repeat=0` & `loop=0`: Aniquila el reproductor intentando ciclar el segmento anterior `N=65535` cuando EOF / Stalled network ocurre.
2. `skip-frames` & `drop-late-frames`: Fuerza al hardware decodificador a sacrificar los fotogramas (B-frames/P-frames) que la red no pudo entregar a tiempo a causa del cuello de botella, permitiendo empatar la línea de tiempo a costa de 0.1s de micro-tartamudez negra en lugar de desincronizar audio/video estirándolo.

### Inyección de Cabecera ExoPlayer-JSON (`#EXTHTTP` o `streamHeaders` Kodiprop)
Adicionalmente a VLC, exoPlayer obedece cabeceras de metadatos `X-` vía parseo dinámico de JSON en el Frontend.
```json
"X-Buffer-Underrun-Action": "jump-to-live",
"X-ExoPlayer-Live-Edge-Start": "true"
```
* **Underrun Action**: Al vaciarse la caché pre-fetch, el decodificador salta de inmediato a la cabecera actual del Stream Proxy (`resolve_quality`), omitiendo el agujero histórico provocado por la inestabilidad de la red satelital / CDN.

## Reglas de Arquitectura
* Está totalmente **PROHIBIDO** el restablecimiento del código a `input-repeat=65535` en `m3u8-typed-arrays-ultimate.js`.
* Todos los perfiles deben obedecer este comportamiento (P0 a P5). La inestabilidad no exime de ver en tiempo real el evento.
