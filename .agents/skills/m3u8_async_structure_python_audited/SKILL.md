---
name: Estructura Asíncrona M3U8 Python-Audited (Regla Estructural Absoluta)
description: Regla arquitectónica inquebrantable que define el orden exacto de tags por canal en el M3U8, con la URL anclada a los 3 primeros tags HLS Core y la carga masiva APE enterrada POST-URL para compatibilidad universal.
---

# Estructura Asíncrona M3U8 — Python-Audited (REGLA ABSOLUTA)

> [!CAUTION]
> **ESTA REGLA ES INQUEBRANTABLE.** Ninguna optimización, fix, o nueva feature puede alterar el orden de los primeros 3 elementos de cada bloque de canal. Cualquier cambio que mueva la URL por debajo de la línea 3 del bloque es una **REGRESIÓN CRÍTICA**.

## Problema que Resuelve

Los reproductores genéricos (VLC, TiviMate, OTT Navigator, Perfect Player, GSE, MX Player) parsean un archivo M3U8 de manera lineal y esperan encontrar la URL del stream **inmediatamente después** del tag `#EXTINF` (o `#EXT-X-STREAM-INF` si existe). Si la URL está separada del `#EXTINF` por cientos de líneas de tags custom (APE, LCEVC, Cortex, ISP Throttle, etc.), el reproductor **no puede resolverla** y el canal aparece como muerto o el parseo falla silenciosamente.

## Evidencia Forense (Script Python de Auditoría)

Un script de corrección estructural fue ejecutado sobre una lista de 6,910 canales y demostró:

| Métrica                        | Antes (Bug) | Después (Fix) |
| ------------------------------ | ----------- | ------------- |
| Distancia `#EXTINF` → URL     | 447 líneas  | 2 líneas      |
| Canales corregidos             | —           | 6,910 / 6,910 |
| Tags `#EXTHTTP` preservados   | 6,910       | 6,910 ✅       |
| Tags `#EXTVLCOPT` preservados  | 214,210     | 214,210 ✅     |
| Tags `#KODIPROP` preservados   | 41,460      | 41,460 ✅      |
| Tags APE-FALLBACK preservados  | 428,420     | 428,420 ✅     |
| Tags LCEVC-BASE-CODEC          | 6,910       | 6,910 ✅       |

**Cero pérdida de datos. 100% de compatibilidad restaurada.**

## Orden Estructural Obligatorio (Por Canal)

```
┌─────────────────────────────────────────────────────────────┐
│           BLOQUE HLS CORE (Líneas 1-3: INTOCABLES)         │
├─────────────────────────────────────────────────────────────┤
│ 1. #EXTINF:-1 tvg-id="..." tvg-name="...",Nombre           │
│ 2. #EXT-X-STREAM-INF:BANDWIDTH=...,CODECS="...",FRAME-RATE │
│ 3. http://stream.url/live/...                               │
├─────────────────────────────────────────────────────────────┤
│       BLOQUE ASÍNCRONO POST-URL (Carga Útil Masiva)        │
├─────────────────────────────────────────────────────────────┤
│ 4. #EXTHTTP:{...200+ headers JSON asimétricos...}          │
│ 5. #EXT-X-APE-OVERFLOW-HEADERS:base64(...)                 │
│ 6. #EXTVLCOPT:preferred-resolution=480                     │
│    #EXTVLCOPT:preferred-resolution=720                     │
│    #EXTVLCOPT:preferred-resolution=1080                    │
│    #EXTVLCOPT:preferred-resolution=2160                    │
│    #EXTVLCOPT:preferred-resolution=4320                    │
│    #EXTVLCOPT:adaptive-logic=highest                       │
│    #EXTVLCOPT:hw-dec-accelerator=any                       │
│    #EXTVLCOPT:video-filter=hqdn3d                          │
│    ... (31 líneas EXTVLCOPT)                               │
│ 7. #KODIPROP:inputstream=inputstream.adaptive              │
│    #KODIPROP:inputstream.adaptive.manifest_type=hls         │
│    ... (6 líneas KODIPROP)                                 │
│ 8. #EXT-X-APE-VERSION:18.2                                 │
│    #EXT-X-APE-PROFILE:P0                                   │
│    ... (450+ líneas APE tags)                              │
│ 9. #EXT-X-CORTEX-OMEGA-STATE:ACTIVE_DOMINANT               │
│    #EXT-X-CORTEX-FALLBACK-CHAIN:AV1>HEVC>H264             │
│    #EXT-X-CORTEX-LCEVC-SDK-INJECTION:ACTIVE_HTML5_NATIVE   │
│    ... (10+ líneas Cortex)                                 │
│10. #EXT-X-APE-STEALTH-UA:Mozilla/5.0 (...)                 │
│    #EXT-X-APE-STEALTH-XFF:xxx.xxx.xxx.xxx                  │
│    ... (tags Fusión Fantasma)                              │
│11. #EXT-X-APE-ISP-THROTTLE-ESCALATION:LEVEL=NUCLEAR        │
│    ... (tags ISP Throttle Nuclear)                         │
└─────────────────────────────────────────────────────────────┘
```

## Implementación en `generateChannelEntry()` (JS APE v9)

```javascript
// 1. 🔴 ESTRUCTURA PYTHON-AUDITED: EXTINF Primero
lines.push(generateEXTINF(channel, profile, index));

// 2. 🔴 ESTRUCTURA PYTHON-AUDITED: EXT-X-STREAM-INF Segundo
lines.push(streamInf);

// 3. 🔴 ESTRUCTURA PYTHON-AUDITED: URL Tercero (Base de reproductores genéricos)
lines.push(urlStr);

// 4. 🔴 ESTRUCTURA PYTHON-AUDITED: Bloque Asíncrono HLS POST-URL
lines.push(build_exthttp(...));
lines.push(...generateEXTVLCOPT(profile));
lines.push(...build_kodiprop(...));
lines.push(...build_ape_block(...));
lines.push(...cortex_omega_tags);
lines.push(...fusion_fantasma_tags);
lines.push(...isp_throttle_tags);
```

## Por Qué Funciona

1. **Los reproductores genéricos** solo leen `#EXTINF` + la siguiente línea no-tag (la URL). Todo lo demás es ignorado por parsers simples.
2. **Los reproductores avanzados** (OTT Navigator, Kodi con inputstream.adaptive) leen TODO el bloque incluyendo los tags post-URL.
3. **La carga masiva post-URL** actúa como metadata asíncrona: los reproductores que la entienden la absorben, los que no, la ignoran sin consecuencia.

## Regla de Validación (Auditoría)

Para verificar la conformidad de cualquier lista M3U8 generada:

```python
# La distancia entre #EXTINF y la URL debe ser <= 2 líneas
# (solo #EXT-X-STREAM-INF puede existir entre ambos)
import re
pattern = re.compile(r"(#EXTINF:.*?\n)(#EXT-X-STREAM-INF:.*?\n)?(https?://.*?\n)")
matches = pattern.findall(content)
assert len(matches) == total_channels, "REGRESIÓN ESTRUCTURAL DETECTADA"
```

## Historial de Incidentes

| Fecha      | Incidente                                              | Resolución                          |
| ---------- | ------------------------------------------------------ | ----------------------------------- |
| 2026-03-19 | URL separada del EXTINF por 447 líneas de tags APE     | Script Python de corrección masiva  |
| 2026-03-19 | EXT-X-STREAM-INF eliminado por "fix" erróneo           | Restaurado por orden del usuario    |
| 2026-03-19 | Estructura V1 "Brutal" no coincidía con la V2 corregida | Implementada heurística nativa en JS |
