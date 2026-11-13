# §11 roto en producción: el perfil sale del NOMBRE, no de la medición · 2026-11-13

**Lo que se midió:** 3 zonas de la lista viva `APE_LISTA_1794100720046.m3u8` (vía `Range`, HTTP **206** en las tres), filtrando solo `-OnlyProfiles 'P0,P1'` — los canales que **declaran 4K/8K** — y sondeando el segmento real de cada uno.

## El resultado: 7 de 7 «4K» no son 4K

| Canal | Declarado | **Medido** | Bitrate |
|---|---|---|---|
| `AR\| BEIN SPORTS NEWS 4K` | **P1 (2160p)** | **1920x1080** | — |
| `AR\| BEIN SPORTS 4K` | **P1 (2160p)** | **1920x1080** | — |
| `AR\| BEIN SPORTS NBA 4K` | **P1 (2160p)** | **1280x720** | — |
| `4KURD HD` | **P1 (2160p)** | **1920x1080** | 2,37 Mbps |
| **`\|SYR\| LANA TV 4K`** | **P1 (2160p)** | **720x576** | **1,15 Mbps** |
| `\|AE\| SAMA DUBAI 4K` | **P1 (2160p)** | **1920x1080** | 5,19 Mbps |
| `\|AE\| DUBAI TV 4K` | **P1 (2160p)** | **1920x1080** | 9,47 Mbps |

**Siete canales que declaran 2160p. Ninguno sirve 2160p.** Uno sirve **576p a 1,15 Mbps**, que es SD.

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
