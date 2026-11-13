# §11 roto en producción: el perfil sale del NOMBRE, no de la medición · 2026-11-13

**Lo que se midió:** 3 zonas de la lista viva `APE_LISTA_1794100720046.m3u8` (vía `Range`, HTTP **206** en las tres), filtrando solo `-OnlyProfiles 'P0,P1'` — los canales que **declaran 4K/8K** — y sondeando el segmento real de cada uno.

## El resultado completo: 21 medidos, 16 no cumplen, 5 sí

Ampliado el muestreo a 5 zonas más de la lista viva (`Range` 206 en todas):

| Zona | Medidos | NO CUMPLEN | CUMPLEN |
|---|---|---|---|
| offset 0 | 3 | 3 | 0 |
| offset 48 MB | 2 | 2 | 0 |
| offset 143 MB | 6 | 6 | 0 |
| offset 668 MB | 4 | 4 | 0 |
| **offset 1049 MB** | 6 | **1** | **5** |
| **TOTAL** | **21** | **16 (76%)** | **5** |

**Y los 5 que cumplen son 4K de verdad**, la familia NOVA PREMIERE:

```
GR| NOVA PREMIERE 9 4K  ->  3840x1600  CUMPLE   (4K scope 2.40:1)
GR| NOVA PREMIERE 8 4K  ->  3840x1600  CUMPLE
GR| NOVA PREMIERE 7 4K  ->  3840x2078  CUMPLE
GR| NOVA PREMIERE 6 4K  ->  3840x1600  CUMPLE
GR| NOVA PREMIERE 5 4K  ->  3840x2160  CUMPLE   (4K real 16:9)
```

## La formulación precisa del defecto

No es «el perfil siempre miente». Es:

> **El resolutor acierta cuando el nombre del canal es veraz y falla cuando no lo es. No tiene forma de distinguirlos.**

- `NOVA PREMIERE 5 4K` → el nombre dice 4K, el flujo **es** 4K → acierta.
- `BEIN SPORTS NBA 4K` → el nombre dice 4K, el flujo es **720p** → falla.

El acierto es una coincidencia, no una verificación. Y **16 de 21 veces la coincidencia no se da**.

## Una corrección de mi propia herramienta, que evitó 4 falsos positivos

En la primera pasada marqué como violaciones a los canales `3840x1600` y `3840x2078`: mi comprobador comparaba **solo el alto** contra 2160. Pero **3840 de ancho con menos alto es 4K scope** (2.40:1 y similares), no una degradación: el contenido tiene el ancho de 4K y el alto que le da su aspect ratio de cine.

Corregido: la clase se decide por el **lado mayor**. Con el arreglo, esos 4 canales pasan a **CUMPLE** y el veredicto del bloque de 1049 MB baja de «5 de 6 fallan» a «1 de 6 falla».

**Sin esa corrección, el informe habría acusado a cuatro canales legítimos de violar §11.** Es el tercer falso positivo que la verificación previa detiene en esta sesión.

## El hallazgo original (muestra inicial)

Filtrando solo los canales que declaran 4K/8K en 2 de 3 zonas:

| Canal | Declarado | **Medido** | Bitrate |
|---|---|---|---|
| `AR\| BEIN SPORTS NEWS 4K` | **P1 (2160p)** | **1920x1080** | — |
| `AR\| BEIN SPORTS 4K` | **P1 (2160p)** | **1920x1080** | — |
| `AR\| BEIN SPORTS NBA 4K` | **P1 (2160p)** | **1280x720** | — |
| `4KURD HD` | **P1 (2160p)** | **1920x1080** | 2,37 Mbps |
| **`\|SYR\| LANA TV 4K`** | **P1 (2160p)** | **720x576** | **1,15 Mbps** |
| `\|AE\| SAMA DUBAI 4K` | **P1 (2160p)** | **1920x1080** | 5,19 Mbps |
| `\|AE\| DUBAI TV 4K` | **P1 (2160p)** | **1920x1080** | 9,47 Mbps |

Uno sirve **576p a 1,15 Mbps**, que es SD, declarando 4K.

## La causa raíz, comprobada con la herramienta del propio sistema

No es una hipótesis. Llamando al resolutor real (`ape_profile_for_channel`):

```
AR| BEIN SPORTS NBA 4K  →  clase "4K"  (regla /\b(4K|UHD|2160)\b/i)
                       →  perfil_base P1
                       +  token premium "NBA"  →  escalado
                       →  perfil_final P0        ← ¡8K!
```

```
|SYR| LANA TV 4K       →  clase "4K"  (misma regla)
                       →  perfil_base P1
                       →  perfil_final P1
```

Y la fuente, leída en el fichero real **`tools/pulse/ape-pulse-wrap.js`** (341 líneas), líneas 72-87:

```js
L72: function profileForChannel(name, group) {
L73:   const s = (String(name || '') + ' ' + String(group || '')).toUpperCase();
L74:   const premium = /(DAZN|ESPN|SKY|HBO|MAX|PPV|UFC|F1|CHAMPIONS|NBA|NETFLIX|DISNEY|PREMIUM|EVENTO)/.test(...)
L75:   let p = 'P3';
L76:   if (/\b8K\b|4320/.test(s)) p = 'P0';
L77:   else if (/\b4K\b|UHD|2160/.test(s)) p = 'P1';
L78:   else if (/FHD|1080|FULL\s*HD/.test(s)) p = 'P3';
L79:   else if (/\bHD\b|720/.test(s)) p = 'P4';
L80:   else if (/\bSD\b|480|360|240/.test(s)) p = 'P5';
L81:   if (premium) {
L82:     const order = ['P5', 'P4', 'P3', 'P2', 'P1', 'P0'];
L83:     const i = order.indexOf(p);
L84:     if (i >= 0 && i < order.length - 1) p = order[i + 1];
L85:   }
L86:   return p;
L87: }
```

**La firma de la función es la prueba: `profileForChannel(name, group)`.** No recibe el manifiesto, ni el segmento, ni un `ffprobe`, ni un solo byte del flujo. El perfil sale **enteramente del texto** del nombre y del grupo.

Y `L75: let p = 'P3'` — el perfil por defecto es **P3 (1080p)** para cualquier canal sin token de resolución. Eso explica por qué toda la familia BEIN SPORTS («FHD») quedó en P3.

**El perfil se resuelve del NOMBRE del canal. La medición no entra en la ecuación.**

Por eso `LANA TV 4K`, que sirve **720x576**, recibe **P1**. Y por eso `BEIN SPORTS NBA 4K`, que sirve **1280x720**, recibe **P0** — el perfil más alto — porque lleva «4K» **y** «NBA».

## Por qué esto es exactamente lo que §11 prohíbe

§11, literal:

> *«No conviertas la etiqueta comercial 6K/8K en una declaración falsa de salida efectiva.»*

El sistema hace **precisamente** eso, y de forma mecánica: toma la etiqueta comercial («4K»), la convierte en clase, y de ahí en perfil declarado. La etiqueta **es** la declaración. No hay ningún paso que mire el bitstream.

Y no es un caso aislado de una lista mal hecha: la regla está en el código (`ape-pulse-wrap.js:72-87`) y se aplica a todo el catálogo.

## Lo que esto significa para el resto

Todo lo que cuelga del perfil hereda el error:

- Los **parámetros P1/P0** (buffer, prefetch, filtros `#EXTVLCOPT`) se aplican a un flujo 1080p como si fuera 4K.
- El `#EXT-X-APE-4KFALSE-MODE:ACTIVE` con `TARGET-RES:3840x2160` de la lista de pruebas **declara un upscale a 4K sobre un flujo que no es 4K** — coherente con el mecanismo, pero conviene no llamarlo 4K.
- Cualquier métrica de «cuántos canales 4K tengo» está calculada sobre la etiqueta, **no sobre lo que se sirve**.

## El alcance, sin inflarlo

- **7 medidos de 7 que declaran P1**: en las dos zonas donde aparecieron P1 (offsets 0 y 668 MB). La zona de 300 MB no tenía ninguno.
- **22 y 57 canales P1** se encontraron en esos dos bloques; se midieron 4 de cada uno.
- **No es un censo.** Es una muestra dirigida a los canales que declaran 4K, y **el 100% de la muestra falla**.
- Un canal (`BEIN SPORTS 4K ✦●✦`) quedó `NO COMPUTADO` porque el proveedor devolvió manifiesto vacío. No cuenta ni a favor ni en contra.

## Qué haría falta para arreglarlo (no se ha tocado nada)

El arreglo no es de este informe: es una decisión sobre el generador. Las opciones honestas son:

1. **Medir antes de declarar**: sondear el manifiesto al construir la lista y asignar el perfil por lo medido, no por el nombre. Es lo que hacen estas herramientas, pero cuesta un `ffprobe` por canal.
2. **Declarar la etiqueta como etiqueta**, no como perfil: mantener el nombre comercial y emitir el perfil real medido (p. ej. `ape-profile="P3"` en un canal llamado «…4K»), que es lo que §11 pide.
3. **Dejar de escalar por token premium** cuando el token premium («NBA») no aporta ninguna información de resolución.

Ninguna se ha aplicado. **Tocar el generador exige su propio A/B y la autorización del operador**; esto es la medición que lo justifica.
