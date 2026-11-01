# Workflow de seguimiento MediaSession (ONN)

## Propietario real

La sesión activa es de **OTT Navigator**:

```text
package = studio.scillarium.ottnavigator
state   = PLAYING
title   = SKY SPORTS F1 UHD (ejemplo medido)
```

El agente APE **no debe crear otra MediaSession ni robar botones**. Su papel es observar y reportar.

## Rutina read-only

```bash
node tools/media_session_routine.js \
  --serial 192.168.1.7:5555 \
  --samples 3 \
  --interval 10 \
  --out artifacts/media_session
```

Comprueba:

```text
1. Existe una sesión activa.
2. Estado PLAYING.
3. Metadata/título presentes.
4. La posición avanza entre muestras.
5. Guarda JSONL + latest.json.
```

No envía `MediaSession.dispatchMediaKeyEvent`, no cambia volumen, no hace `force-stop`, no crea sesión.

## Interpretación

| Resultado | Acción |
|---|---|
| `ok:true` | Reproducción viva y avanzando |
| `state_not_playing` | Capturar estado; no reiniciar a ciegas |
| `position_static_live_or_stalled` | Advertencia: en live OTT puede no avanzar la posición; usar `--strict` para tratarlo como fallo |
| `no_active_media_session` | Comprobar que OTT Navigator sigue en primer plano |
| `metadata_missing` | Comprobar que OTT publica metadata; no inventar canal |

## QoE al VPS

Con `--vps`, cada muestra activa publica un `quality_change` real a:

```text
POST /prisma/api/conviva-event.php
```

Verificado:

```text
conviva_events = 2 filas
player = OTT_Navigator
channel = SKY-SPORTS-F1-UHD
qoe_score = 75
decision = NO_ACTION
```

Esto cubre QoE del player externo desde MediaSession. No inventa bitrate del decoder ni frame drops; usa lo que el MediaSession expone (estado, posición, metadata).

## Frecuencia recomendada

- On-demand durante diagnóstico: 3 muestras / 10 s.
- Vigilancia: 1 muestra / 30 s.
- No ejecutar más de una instancia simultánea.

## Automatización GitHub

El workflow `.github/workflows/media-session-device.yml` usa un runner **self-hosted** con ADB y el device autorizado. Un runner `ubuntu-latest` de GitHub no puede ver el ONN por USB, así que no se usa para fingir seguimiento.

## Seguimiento real actual

El agente APE mantiene:

```text
AgentService
CaptureWatchdogService
```

y el MediaSession de OTT sigue activo. Si OTT se cierra, el MediaSession desaparece; eso no se arregla desde el VPS porque el VPS no controla el player externo.
