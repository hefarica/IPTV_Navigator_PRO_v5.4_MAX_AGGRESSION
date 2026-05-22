# Patrón de Implementación de 1% de Unicidad (JS)

Al modificar generadores M3U8 en repositorios (ej. `m3u8-typed-arrays-ultimate.js`), **NUNCA** debes reescribir funciones completas. Debes inyectar interceptores condicionales justo antes de que los datos se escriban en el array de salida.

## 1. Declaración de Constantes (Golden Rule)

Al inicio del archivo (ámbito global de la IIFE):

```javascript
// hvc1 = out-of-band params → SOLO para STREAM-INF CODECS= y CMAF
const HEVC_CASCADE_HVC1 = 'hvc1.2.4.L186.B0,hvc1.2.4.L183.B0,hvc1.2.4.L180.B0,' +
    'hvc1.2.4.L156.B0,hvc1.2.4.L153.B0,hvc1.2.4.L150.B0,' +
    'hvc1.2.4.L123.B0,hvc1.2.4.L120.B0,hvc1.2.4.L93.B0,hvc1.2.4.L90.B0,avc1.640028';

// hev1 = in-band params → SOLO para KODIPROP / EXTVLCOPT / APE runtime tags
const HEVC_CASCADE_HEV1 = 'hev1.2.4.L186.B0,hev1.2.4.L183.B0,hev1.2.4.L180.B0,' +
    'hev1.2.4.L156.B0,hev1.2.4.L153.B0,hev1.2.4.L150.B0,' +
    'hev1.2.4.L123.B0,hev1.2.4.L120.B0,hev1.2.4.L93.B0,hev1.2.4.L90.B0,avc1.640028';
```

## 2. Inyección en Header Global (Punto A)

Retorno temprano ANTES del return normal del header:

```javascript
// ── MAX_QUALITY MODE interceptor ─────────────────────────────────────────────
if (options && options.maxQualityMode) {
    return `#EXTM3U x-tvg-url="" ...
#EXT-X-VERSION:9
#EXT-X-TARGETDURATION:2
#EXT-X-PART-INF:PART-TARGET=0.5
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=0.5,...
#EXT-X-SESSION-DATA:DATA-ID="com.ape.codec.chain.player_pref",VALUE="dvh1,hvc1,av01,avc1,h265,h264"
...`;
}
// código existente del header normal continúa aquí intacto
```

## 3. Inyección en EXT-X-STREAM-INF (Punto B)

```javascript
// Interceptor ANTES del código que asigna _streamInfLine en la ruta normal
if (options && options.maxQualityMode) {
    const _mqVideoChain = 'dvh1.08.06,dvh1.05.09,hvc1.2.4.L186.B0,hvc1.2.4.L153.B0,...,avc1.640028';
    _streamInfLine = `#EXT-X-STREAM-INF:BANDWIDTH=...,CODECS="${_mqVideoChain},ec-3",...`;
}

// CRÍTICO: guard truth path para que NO sobreescriba el MAX_QUALITY STREAM-INF
if (!options?.maxQualityMode && _apeTruth && _R_emit && typeof _R_emit.emitStreamInfFromTruth === 'function') {
    _streamInfLine = _R_emit.emitStreamInfFromTruth(_apeTruth);
}
```

## 4. Inyección en EXTVLCOPT y KODIPROP (Puntos C y D)

```javascript
// Punto C — _codecPriority para EXTVLCOPT (nombres de familia, NUNCA cadenas RFC)
if (options && options.maxQualityMode) return 'hevc,dvhe,av1,h264';

// Punto D — KODIPROP extras
if (options && options.maxQualityMode) {
    lines.push(`#KODIPROP:inputstream.adaptive.preferred_codec=hevc`);
    lines.push(`#KODIPROP:inputstream.adaptive.video_codec_override=hevc`);
    lines.push(`#KODIPROP:inputstream.adaptive.audio_dolby_atmos=true`);
    lines.push(`#KODIPROP:inputstream.adaptive.live_delay=1`);
}
```

## Checklist de Validación Post-Inyección

1. `node -c archivo.js` (los 3 archivos del pipeline)
2. Generar lista de prueba
3. `grep "hev1\." lista.m3u8 | grep "STREAM-INF"` — **DEBE ESTAR VACÍO**
4. `getAuditSummary().channelsRemoved === 0`
