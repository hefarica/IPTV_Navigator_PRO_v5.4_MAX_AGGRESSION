# Judder medido en directo: 98 % de fotogramas, por un modo forzado que anula el emparejamiento · 2026-11-13

**Medido con el operador mirando OTT Navigator en el ONN 4K.** Es el primer hallazgo de calidad de imagen con el sistema en marcha delante de alguien.

## Lo que se mide ahora mismo

```
codec              c2.amlogic.hevc.decoder        (hardware)
mime               video/hevc
resolución         3840 x 2160
framerate-content  50.000 fps
framerate-desired  60.002 Hz
frames-dropped     1 de 743        (0,13 %)
freeze             1 de 16 ms
judder-rate        0,981            ← 98,1 % de fotogramas
```

El vídeo decodifica bien: hardware, 4K, sin pérdida de fotogramas. **El problema no es la decodificación: es la cadencia.**

## La causa, y por qué engaña

```
cmd display get-match-content-frame-rate-pref
  -> Match content frame rate type: 2          (2 = ALWAYS: emparejar siempre)

cmd display get-user-preferred-display-mode
  -> User preferred display mode: 3840 2160 60.000004
```

**El emparejamiento de cadencia está ACTIVADO. Y no sirve de nada**, porque hay un **modo de pantalla preferido fijado a mano en 60,000004 Hz** que lo anula.

Cualquiera que consulte solo el primer ajuste concluye que está bien puesto. El segundo lo desactiva sin decirlo.

Y el panel **sí tiene el modo correcto**:

```
{id=125, width=3840, height=2160, fps=50.0}     <- existe
{id=124, width=3840, height=2160, fps=60.000004} <- activo (mActiveModeId=124)
```

También existen 23,976 · 24 · 25 · 29,97 · 30 · 50 · 59,94 · 60 en 4K y en 1080p.

## Por qué 50 en 60 produce judder

50 no divide a 60. Para mostrar 50 fotogramas por segundo en una pantalla de 60 Hz, unos fotogramas se muestran 1 refresco y otros 2, **de forma desigual**. El ojo lo ve como tirones suaves y constantes, sobre todo en paneos y rótulos que se desplazan. `judder-rate` lo cuenta: **98 de cada 100 fotogramas**.

## El arreglo

**Una línea, reversible:**

```
adb -s 192.168.1.3:34813 shell cmd display clear-user-preferred-display-mode
```

Libera el modo forzado y deja que el emparejamiento (ya en ALWAYS) haga su trabajo: 50 fps → 50 Hz, 60 fps → 60 Hz, 23,976 → 23,976.

**Deshacer, igual de simple:**

```
adb -s 192.168.1.3:34813 shell cmd display set-user-preferred-display-mode 3840 2160 60.000004
```

**Alternativa más conservadora** (si el emparejamiento no bastase): fijar el modo de este canal a mano,
`cmd display set-user-preferred-display-mode 3840 2160 50.0`. Menos bueno: arregla 50 fps y rompe 60.

## Lo que NO se ha hecho

**No se ha ejecutado el cambio.** Es una configuración de sistema en el dispositivo del operador y no se toca sin su palabra, aunque sea reversible. El comando está listo y verificado: `cmd display clear-user-preferred-display-mode` aparece en la ayuda real de este Android 14.

## Por qué esto importa más que el resto del informe

Todo lo demás medido en 58 rondas describe un sistema en reposo o en banco. **Esto es lo único que corresponde a lo que el operador ve en pantalla ahora mismo.**

Y es el tipo de defecto que ningún banco de pruebas detecta: la cadena Canary puede medir SSIM perfecto y el panel puede estar mostrando 50 fotogramas a 60 Hz con el 98 % de ellos mal repartidos.

**Calidad de imagen no es solo resolución y bitrate. También es cadencia.**
