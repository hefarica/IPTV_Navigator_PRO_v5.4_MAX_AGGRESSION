---
name: Audio Track Safety for OTT Navigator / ExoPlayer
description: |
  Prevents ArrayIndexOutOfBoundsException (length=N, index=N) crashes in OTT Navigator
  caused by hardcoded audio codec/channel/Atmos headers that don't match what IPTV streams
  actually provide. All audio-related tags MUST be profile-aware.
---

# 🔇 Audio Track Safety — OTT Navigator / ExoPlayer

## Incident Origin

**Canal:** `|UK| Sky Sports Main Events 4K`
**Error:** `ArrayIndexOutOfBoundsException: length=3, index=3`
**Síntoma:** Video reproduce (12499 kb/s, 2987 bloques) pero audio = 0 bloques decodificados.
**Player:** OTT Navigator (ExoPlayer interno)

## Causa Raíz

ExoPlayer busca pistas de audio que coincidan con los headers KODIPROP/EXTHTTP inyectados en la lista M3U8.
Si los headers piden un codec (Opus), formato (Dolby Atmos), o canal (7.1) que el stream NO tiene,
ExoPlayer itera las pistas disponibles, no encuentra match, y accede a un índice fuera de rango → **crash**.

## Regla Absoluta

> **NUNCA hardcodear valores de audio en tags M3U8.**
> Siempre usar `cfg.audio_codec`, `cfg.audio_channels` del perfil activo (P0-P5).

## Mapa de Audio por Perfil

| Perfil | audio_channels | audio_codec | Atmos | Spatial | Passthrough |
|--------|---------------|-------------|-------|---------|-------------|
| P0 (8K) | 8 | `eac3` | `true` | `DOLBY-ATMOS+DTS-X` | `true` |
| P1 (4K 60fps) | 6 | `eac3` | `false` | `NONE` | `true` |
| P2 (4K 30fps) | 6 | `eac3` | `false` | `NONE` | `true` |
| P3 (FHD) | 2 | `aac` | `false` | `NONE` | `false` |
| P4 (HD) | 2 | `aac` | `false` | `NONE` | `false` |
| P5 (SD) | 2 | `aac` | `false` | `NONE` | `false` |

## Puntos de Inyección (todos deben ser profile-aware)

### 1. KODIPROP (Líneas ~1672-1675)

```javascript
`#KODIPROP:inputstream.adaptive.audio_codec_override=${cfg.audio_codec || 'aac'}`,
`#KODIPROP:inputstream.adaptive.audio_channels=${cfg.audio_channels >= 6 ? '5.1' : '2.0'}`,
'#KODIPROP:inputstream.adaptive.audio_passthrough=false',
`#KODIPROP:inputstream.adaptive.dolby_atmos=${cfg.audio_channels >= 8 ? 'true' : 'false'}`,
```

### 2. EXTHTTP Headers (Líneas ~1872, ~1922-1927)

```javascript
"X-Audio-Track-Selection": `${cfg.audio_channels >= 8 ? 'highest-quality-extreme,dolby-atmos-first' : 'default'}`,
"X-Dolby-Atmos": String(cfg.audio_channels >= 8),
"X-Spatial-Audio": String(cfg.audio_channels >= 6),
"X-Audio-Passthrough": String(cfg.audio_channels >= 6),
```

### 3. EXT-X-APE Tags (Líneas ~2530-2545)

```javascript
`#EXT-X-APE-AUDIO-CODEC:${cfg.audio_codec === 'eac3' ? 'EAC3+AC4+AAC-LC' : 'AAC-LC+MP3'}`,
`#EXT-X-APE-AUDIO-ATMOS:${cfg.audio_channels >= 8}`,
`#EXT-X-APE-AUDIO-SPATIAL:${cfg.audio_channels >= 8 ? 'DOLBY-ATMOS+DTS-X' : 'NONE'}`,
`#EXT-X-APE-AUDIO-TRUEHD:${cfg.audio_channels >= 8}`,
```

## Checklist Anti-Regresión

Al modificar el generador M3U8, verificar SIEMPRE:

- [ ] `audio_codec_override` NO tiene un valor hardcodeado (debe ser `cfg.audio_codec`)
- [ ] `audio_channels` NO tiene un valor fijo como `7.1` (debe ser condicional)
- [ ] `dolby_atmos` NO es `true` sin condición (solo si `cfg.audio_channels >= 8`)
- [ ] `audio_passthrough` NO es `true` sin condición
- [ ] `X-Audio-Track-Selection` NO fuerza `dolby-atmos-first` sin condición
- [ ] Buscar en TODO el archivo: `grep -i "opus\|atmos.*true\|audio.*7.1\|passthrough.*true"` — NO debe haber valores fijos

## Diagnóstico Rápido

Si un canal tiene video pero NO audio en OTT Navigator:

1. **Verificar en VLC:** Abrir URL directa → Pestaña Estadísticas → Audio decodificados = 0?
2. **Si audio = 0:** El stream no tiene la pista de audio que los headers fuerzan
3. **Fix:** Revisar los 3 puntos de inyección arriba y confirmar que todos usan `cfg.*`
4. **Si audio > 0 pero sin sonido:** Es un problema de codec incompatible, no de index

## Codecs IPTV Reales (Referencia)

| Codec | Prevalencia en IPTV | Notas |
|-------|---------------------|-------|
| AAC-LC | ~90% | Default en casi todos los streams |
| AC3 | ~8% | Canales HD con 5.1 |
| E-AC3 | ~1.5% | Canales premium 4K |
| Opus | <0.5% | Prácticamente inexistente en IPTV |
| Dolby Atmos | <0.1% | Solo streaming premium (Netflix, etc.) |
