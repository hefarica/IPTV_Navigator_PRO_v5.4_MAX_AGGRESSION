# QUÉ LE PASA A LA IMAGEN — diagnóstico del vídeo del operador · 2026-11-13

**Entrada:** `WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4` — 1.721.025 B, 1024x576, 30 fps, 10 s, grabado con el teléfono apuntando al televisor.

**Lo que se ve en los fotogramas extraídos** (t=1 s, 8,8 s, 9,8 s): partido de fútbol con tres artefactos claros:

1. **Banding vertical** en el césped — franjas anchas claras/oscuras en lo que debería ser un degradado continuo.
2. **El rótulo del canal degradado a bloques de color** en el centro del campo.
3. **Saturación pasada** — verde enfermizo, rojo quemado — y **falta total de detalle fino** en la hierba.

**Los tres son espaciales, no temporales.** No es judder, no es cadencia, no es movimiento: es la imagen en reposo.

---

## 1 · La causa raíz: el canal entrega 720p y se llama 4K

Medido en el aparato mientras ese partido se reproducía:

```
codec              = c2.amlogic.avc.decoder
mime               = video/avc          (H.264, 8 bits)
width x height     = 1280 x 720
framerate-content  = 29.41 fps
framerate-actual   = 24.99 fps
judder-rate        = 0.9887
```

Y lo que la lista publica para ese mismo canal:

| tvg-id | nombre en la lista |
|---|---|
| 22198 | **`beIN SPORTS NEWS UHD`** |
| 242288 | **`|AR| BEIN SPORTS NEWS 4K S1`** |

**Un flujo de 1280x720 H.264 vendido como «UHD» y «4K S1».**

Eso explica los tres artefactos sin necesidad de más hipótesis:

- **Falta de detalle**: no hay detalle que mostrar. 720p escalado a un panel 4K de 1000 nits no inventa textura; la amplifica el escalador del televisor.
- **Banding**: un H.264 de 8 bits a bitrate moderado, sobre un degradado suave (césped iluminado), pierde escalones. Al escalarlo ×3, los escalones se convierten en franjas de decenas de píxeles.
- **El rótulo en bloques**: es la misma compresión, pero sobre un borde duro con texto, donde el cuantizador se queda sin bits.
- **Saturación pasada**: procesado de color del televisor sobre una señal SDR que ya viene sobresaturada del proveedor.

**Ninguna cantidad de metadata, cadencia ni VPP convierte un 720p en 4K.** Es física: la información no está.

---

## 2 · La cadena de filtros que lo arreglaría EXISTE, y nadie la aplica

El bloque de ese canal en la lista:

```
L125979  #EXTINF:-1 tvg-id="22198" tvg-name="beIN SPORTS NEWS UHD" …
L125999  #EXTVLCOPT:deinterlace=-1
L126000  #EXTVLCOPT:deinterlace-mode=bwdif
L126035  #EXTVLCOPT:video-filter=deinterlace:hqdn3d:adjust:sharpen
```

`hqdn3d` es denoise, `adjust` es color, `sharpen` es realce, `bwdif` es desentrelazado. **Son módulos de VLC, la sintaxis correcta para `#EXTVLCOPT`.**

**Y no se aplican**, por dos motivos independientes:

### 2a · OTT Navigator ignora `#EXTVLCOPT`

Es la única app de reproducción instalada en el aparato:

```
pm list packages | grep -iE "vlc|kodi|mpv|mx.tech|smarters|tivimate|ottnavigator"
  → studio.scillarium.ottnavigator    (y ninguna otra)
cmd package query-activities … -t application/vnd.apple.mpegurl
  → No activities found
```

OTT lee la URL y los atributos de `#EXTINF`. Las opciones de VLC no las interpreta. **La cadena viaja en el 100 % de los canales y no la ejecuta nadie.**

### 2b · Y la cadena no lleva debanding, que es el artefacto que se ve

Medido sobre los primeros 200.000 renglones de la lista:

```
269 canales con #EXTVLCOPT video-filter
  0 de ellos con gradfun / deband
```

**El artefacto más visible del vídeo — el banding del césped — es justo el que ninguna cadena ataca.** `hqdn3d` suaviza ruido, `sharpen` realza bordes; ninguno reconstruye un degradado cuantizado. Para eso hace falta `gradfun` (debanding), y está en **0 de 269** canales.

---

## 3 · Lo que esto descarta, definitivamente

| Hipótesis | Estado |
|---|---|
| «Es el judder de la cadencia» | **DESCARTADA** — los artefactos son espaciales; el judder es temporal y es otro problema (ver `07_FALSIFICACION`) |
| «Es el VPP que no llega» | **DESCARTADA para esta imagen** — el VPP realzaría; no puede crear detalle de 720p |
| «Es `Display4K` pisando el modo» | **DESCARTADA para esta imagen** — afecta a la cadencia, no a la nitidez |
| «Es el VPS reescribiendo mal» | **DESCARTADA** — el VPS no transporta vídeo (`\.(ts|m4s|mp4) → 404`) |
| «Es la APK procesando mal» | **DESCARTADA** — sus efectos GL están en pantalla negra, no activos |

**La imagen es exactamente lo que un 720p H.264 de bitrate moderado parece en un panel 4K.** El sistema no la ha degradado: **el proveedor nunca entregó 4K**.

---

## 4 · Lo que sí se puede hacer, por orden de impacto real

1. **Comparar el mismo canal en un reproductor que honre `#EXTVLCOPT`** (VLC, Kodi, mpv). Si la cadena `deinterlace:hqdn3d:adjust:sharpen` mejora la imagen, queda demostrado que el canal de metadata sirve — y basta con instalar un player. **Coste: instalar VLC. Riesgo: ninguno.**
2. **Añadir `gradfun` a la cadena del generador**: `deinterlace:hqdn3d:gradfun:adjust:sharpen`. Ataca el artefacto dominante. **Coste: una línea en el generador. Verificable con A/B de captura.**
3. **Dejar de llamar «UHD» y «4K» a canales de 720p.** Es la doctrina del propio repo: *no player-breaking lies*. Un nombre honesto no mejora la imagen, pero evita perseguir un 4K que no existe.
4. **Buscar la variante real de ese canal**: `|AR| BEIN SPORTS NEWS 4K S1` (tvg-id 242288) es **otra entrada** con otra URL. Puede que sí sirva 4K. **Eso es exactamente lo que resuelve la selección de variante (FIX 3)**, y es la siguiente prueba obvia.

---

## 5 · Reproducibilidad

```bash
# 1. Los artefactos, en el vídeo del operador
ffmpeg -ss 8.8 -i "WhatsApp Video 2026-11-13 at 1.01.22 AM.mp4" -frames:v 1 f.png

# 2. Lo que entrega el canal
adb -s 192.168.1.3:34813 shell 'dumpsys media.metrics | grep "{codec," | grep mode=video | tail -1'

# 3. La cadena de filtros del bloque
grep -n 'video-filter' downloaded_list_4K.m3u8 | head

# 4. Cuántos canales llevan debanding
grep -c 'video-filter' downloaded_list_4K.m3u8
grep 'video-filter' downloaded_list_4K.m3u8 | grep -c 'gradfun\|deband'
```
