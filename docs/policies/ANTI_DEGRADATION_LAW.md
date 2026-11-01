# LEY ANTI-DEGRADACIÓN DE SEÑAL

**Estado:** OBLIGATORIA E INNEGOCIABLE  
**Ámbito:** generador, LAB, listas, VPS, JIT, ARA, player y cualquier agente  
**Vigencia:** desde 2026-11-01

## Artículo 1 — Prohibición de degradar

Ningún agente, script, workflow, fallback, solver o “fix” puede:

```text
bajar resolución (4K → FHD/HD/SD)
bajar codec (HEVC → H.264) para ocultar un fallo
bajar HDR (PQ/HLG → SDR) para ocultar un fallo
bajar fps (50/60 → 25/30)
bajar bitrate de vídeo
reducir canales de audio
sustituir la fuente 4K por una variante FHD
```

Un fallo de reproducción **no autoriza** degradar la señal.

## Artículo 2 — 4K permanece 4K

Si la fuente es:

```text
3840x2160 HEVC Main10 HDR10/PQ
```

la salida debe seguir siendo:

```text
3840x2160 HEVC Main10 HDR10/PQ
```

La única excepción es una decisión explícita, escrita y separada del propietario para ese canal, dispositivo y sesión. Nunca automática.

## Artículo 3 — Diagnóstico antes de tocar

Antes de cualquier cambio:

```text
1. Sondear el TS real (ffprobe).
2. Verificar vídeo, audio, HDR, fps y bitrate.
3. Verificar si el fallo es fuente, red, decoder o lista.
4. Documentar la evidencia.
```

Un `0 Hz / 0 canales` de audio no se “arregla” sustituyendo el 4K por FHD.

## Artículo 4 — Fuente sin audio

Si el TS 4K no contiene audio válido:

```text
NO se cambia el vídeo 4K por FHD.
NO se inventa audio.
NO se declara audio que no existe.
```

Se debe:

```text
a) reportar la fuente al proveedor, o
b) obtener una fuente 4K con audio válido, o
c) declarar el canal como 4K SIN AUDIO hasta que exista audio real.
```

## Artículo 5 — Rebuffering

El rebuffering se corrige con:

```text
JIT 4K nativo copy (sin transcode)
mejor ruta / proxy
buffer/prefetch
CDN autorizado
corrección de metadata falsa (BANDWIDTH)
```

No se corrige con:

```text
FHD
H.264
SDR
bitrate recortado
```

## Artículo 6 — Metadatos honestos

Se permite corregir metadatos:

```text
BANDWIDTH declarado → bitrate real medido
AUDIO CODEC vacío → no declarar EAC3/Atmos
RESOLUTION declarada → resolución real
```

Corregir un metadato **no autoriza** cambiar la calidad del vídeo.

## Artículo 7 — Gate obligatorio

Ningún cambio se considera entregado si no pasa:

```bash
node tools/check_anti_degradation_policy.js
```

El gate comprueba que la ley, el contrato y el enlace en AGENTS.md existen y que no se ha introducido una regla de degradación automática.

## Artículo 8 — Prohibición de mentir

Prohibido declarar:

```text
“4K arreglado” si se cambió a FHD
“HDR arreglado” si se cambió a SDR
“sin pérdida” si se recodificó a menor calidad
“audio arreglado” si se silenció o se inventó
```

## Artículo 9 — Excepción

La única excepción válida es una autorización explícita del propietario, por escrito, para:

```text
canal concreto
dispositivo concreto
degradación concreta
motivo
fecha
```

Sin esos cinco datos, la degradación está prohibida.

## Artículo 10 — Prioridad

```text
VERDAD DE LA FUENTE > compatibilidad > conveniencia
4K REAL > FHD “que funciona”
HDR REAL > SDR “que no falla”
SIN AUDIO HONESTO > audio inventado
```
