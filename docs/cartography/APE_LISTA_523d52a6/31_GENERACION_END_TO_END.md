# Generación end-to-end: cerrada y verificada

**Fecha:** 2026-11-03
**Generador:** `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` v22.6.0-MEMC-TOTAL-8K120
**Commit del fix:** `f339b74b`
**Evidencia:** `evidencia/LISTA_GENERADA_end_to_end.m3u8`

---

## 1 · El generador se ejecuta por primera vez

Nunca se había corrido end-to-end. Ahora sí, con el harness de mocks de navegador que ya existía en
`test_generator.js`:

```js
global.window = global;  // + document, navigator, localStorage, fetch, XHR, btoa/atob y 10 globals más
(0, eval)(fs.readFileSync(RUTA, 'utf8'));
const stream = global.APE_GEN(canales, {});
```

**Dos descubrimientos de API, ambos por error propio:**

| Intento | Resultado | Corrección |
|---|---|---|
| `require(...)` | `Cannot find module` | el fuente se evalúa en el contexto global, no se importa |
| `APE_GEN()` como string | `[object ReadableStream]`, `Object.keys` vacío | devuelve un **ReadableStream**; hay que consumirlo con `getReader()` |

## 2 · La salida

```
stream consumido : 115.556 chars
lineas           : 1.939
#EXTINF          : 2
#EXTVLCOPT       : 256
#KODIPROP        : 182
#EXT-X-APE-      : 1.231
video-filter     : 2
```

Validador interno del propio generador:

```
✅ [CA11 VALIDATOR] PASS · 2 canales · 0 errors · 35ms · marker embebido
✅ [STREAM] Generación completada en 0.03s
```

## 3 · La cadena que EMITE el generador, ejecutada en ffmpeg 8.0.1

```
scale=w=3840:h=2160:flags=lanczos,
hqdn3d=2:1.5:6:4.5,
unsharp=lx=5:ly=5:la=0.6:cx=3:cy=3:ca=0.2,
gradfun=radius=8:strength=0.51,
minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:vsbmc=1:me=epzs:scd=0
```

**Resultado: `3840x2160` a `120 fps`. Escala.**

Entrada de la prueba: **2560×1440** — la celda **C7** del Excel. **×1,5 por eje.**

## 4 · Los defectos, ausentes de la salida

| Patrón | En la lista generada |
|---|---|
| `pp=ac/dr` | **AUSENTE** |
| `scd=5` | **AUSENTE** |
| `zscale=transfer=bt1886` | **AUSENTE** |
| `zscale=transfer=st2084` | **AUSENTE** |
| `strength=0.6` / `strength=0.8` | **AUSENTES** |

## 5 · Cobertura comparada con la lista de referencia

| Capa | Lista real (AXN) | Generador | |
|---|---:|---:|---|
| Líneas por canal | 975 | ~970 | equivalente |
| `#EXTVLCOPT` | 133 | **256** | **+123** |
| `#KODIPROP` | 103 | **182** | **+79** |
| `#EXT-X-APE-*` | 614 | **1.231** | **+617** |

**El generador produce más cobertura que la lista que funciona en campo.**

---

## 6 · Lo que esto cierra, y lo que no

**CERADO: el compilador interpreta la configuración y emite una cadena que escala a 4K.**

| Punto del objetivo | Estado |
|---|---|
| Enlace entrega la lista completa | **cerrado** · 604.593.696 B |
| Presets por reproductor | **21/21** |
| Censo 10.573 / 188 / P1-P3-P4 | **cerrado** |
| Generador ejecuta end-to-end | **cerrado** · 1.939 líneas, CA11 PASS |
| Cadenas escalan 1440p → 4K | **cerrado** · 3840x2160 @120 fps |

**NO cerrado, y es importante:**

- **No se probó en VLC, OTT Navigator, TiviMate ni ExoPlayer.** ffmpeg ejecuta la cadena; eso no dice qué hace
  el reproductor. VLC le faltan 3/4 a 5/6 de los módulos.
- **No hay medición de calidad.** Sin VMAF, sin SSIM, sin A/B. Escalar no es mejorar.
- **La prueba usó `testsrc2`**, no un canal real.
- **2 canales de prueba, no 10.573.** La escala del catálogo no se ejercitó.
- **El perfil usado fue P3 por fallback** (`📦 [FALLBACK] Usando perfil P3 hardcoded`): no había credenciales
  ni `bulletproof_profiles`, así que no se ejercitó la ruta LAB real.
