# Decisión del propietario · "4K prevalece" (2026-10-24)

> **Supersede** `audit_teams_REA/01_OWNER_RULE_LADDER_4K.md` §2.3 y §5 para el plano de metadata.
> Registrado aquí para que futuros agentes no vuelvan a oscilar entre criterios.

## 1. La decisión

> *"TODO ES AL CONTRARIO: PREVALECE 4K Y SE UPSCALA SI SE SIRVE 1080P O MENOR"* — propietario, 2026-10-24.

Traducción implementada:

| Antes (auditoría) | Ahora (decisión del propietario) |
|---|---|
| Prohibido `RESOLUTION=3840x2160` sobre bytes 1080p | **Permitido**: la variante top declara 4K |
| "Si sirve 1080p NO se fabrica 4K" | **Se declara 4K y se upscala** (display o GPU) |
| 8K nunca | **`uhd8k` disponible** (opt-in, ver §4) |

## 2. Lo que se implementó

Módulo `ape_uhd.lua`, invocado por el gateway `/cdn/` cuando la playlist es un **master**.

### 2.1 Regla AUTOMÁTICA (segunda iteración, decidida por el propietario)

> *"SIEMPRE buscar RESOLUTION=3840x2160 sobre bytes 1920x1080; si es 1080p o menor se upscala a 4K;
> y las 4K se llevan a 8K fake."*

`uhd_auto=1` (default). Se lee la **resolución real** que declara la variante top del proveedor:

| Resolución real de la variante top | Declaración que emite el edge | Modo |
|---|---|---|
| `< 3840` (1080p, 720p, 480p…) | `RESOLUTION=3840x2160` | `4k` |
| `>= 3840` (4K real) | `RESOLUTION=7680x4320` | `8k` |

`CODECS` se copia **tal cual** del proveedor en ambos casos.

### 2.2 Salida real medida en producción

**Caso A — fuente 1080p AVC** (`/cdn/<host>/__fixture_master.m3u8`):

```m3u8
#EXTM3U
#EXT-X-APE-UPSCALE:declared=3840x2160;codec=truthful;mode=4k
#EXT-X-STREAM-INF:BANDWIDTH=5000000,...,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="avc1.640028,mp4a.40.2"
http://…/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9000000,...,RESOLUTION=1280x720,FRAME-RATE=60.000,CODECS="avc1.64001f,..."
http://…/720p/index.m3u8
```

**Caso B — fuente 4K HEVC** (`/cdn/<host>/__fixture_master4k.m3u8`):

```m3u8
#EXTM3U
#EXT-X-APE-UPSCALE:declared=7680x4320;codec=truthful;mode=8k
#EXT-X-STREAM-INF:BANDWIDTH=28000000,...,RESOLUTION=7680x4320,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
http://…/2160p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9000000,...,RESOLUTION=1920x1080,...,CODECS="hvc1.1.6.L123.B0,..."
http://…/1080p/index.m3u8
```

En ambos: la variante de fallback se preserva y las URIs salen absolutas.

## 3. La guardia que NO se mueve (y por qué)

**No se toca `CODECS`.** Declarar `hvc1.*` sobre bytes AVC es el **freeze FZ-01 del 2026-06-08**:
el player inicializa un decoder HEVC para un bitstream H.264 → pantalla negra/spinner.

La diferencia técnica:

| Campo | Qué hace el player | Riesgo |
|---|---|---|
| `RESOLUTION=` alto | lo usa para ABR y para el hint de presentación; decodifica el frame **real** | ninguno (el TV escala) |
| `CODECS=` falso | inicializa el decoder equivocado | **freeze** |

Por eso `ape_uhd.lua` tiene además `codec_truth_fields()`, que **rechaza** aplicar UHD si detecta
`hev1` dentro de `CODECS` en un `STREAM-INF` (GOLDEN RULE).

## 4. Flags en caliente

```bash
# ver
curl -s http://127.0.0.1:8088/_ape/flags
# activar 8K declarado
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd8k&v=1"
# añadir VIDEO-RANGE=PQ (ojo: color-shift en players sin daemon)
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd_pq&v=1"
# volver a 4K
curl -s "http://127.0.0.1:8088/_ape/flags?k=uhd8k&v=0"
```

| Flag | Default | Efecto |
|---|---|---|
| `uhd4k` | **1** | `RESOLUTION=3840x2160` en la variante top |
| `uhd8k` | 0 | `RESOLUTION=7680x4320` en la variante top |
| `uhd_pq` | 0 | añade `VIDEO-RANGE=PQ` (color-shift posible sin daemon) |

## 5. Consecuencias honestas (lo que la declaración NO hace)

1. **No crea píxeles.** Declarar 4K/8K sobre 1080p no añade detalle; el panel/TV escala.
   Para píxeles reales hace falta **transcode**: GPU (NVENC) — imposible en este VPS
   (3 vCPU, sin GPU; medido: 249 Mpx/s de encode). Ver `docs/VPS_UPSCALE_4K_DESIGN.md`.
2. **8K**: ningún decoder de consumo lo acepta hoy; el techo del ecosistema es `L153`=4K@60.
   Está **disponible pero apagado** porque puede provocar rechazo de stream en players estrictos.
3. **PQ sobre SDR**: en players sin el daemon puede dar color-shift (no freeze).
4. La regla anterior de la auditoría queda **superseded por decisión del propietario**, no por descuido.

## 6. Verificación (producción)

- `[13] UHD — 4K prevalece`: `✓ RESOLUTION=3840x2160 declarada` · `✓ CODECS AVC intacto (sin riesgo de freeze FZ-01)`
  · `✓ marca #EXT-X-APE-UPSCALE` · `✓ variantes rebasadas/absolutas` → **12/12 bloques OK**.
- Regresión 443: `200 / 200 / 503` idéntica.
- `:8088` sigue cerrado desde internet (000).
