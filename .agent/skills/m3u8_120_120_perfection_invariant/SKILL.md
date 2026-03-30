---
name: M3U8 120/120 Perfection Invariant
description: Reglas absolutas e inalterables para la generación de listas M3U8 APE v18.2 con puntuación perfecta 120/120. Viola cualquiera de estas reglas y la lista se degrada.
---

# M3U8 APE v18.2 — Perfection Invariant (120/120)

## Historial de Regresiones (Lecciones Aprendidas)

| Lista | Score | Causa de Regresión |
|-------|-------|--------------------|
| L2 | 70 | URL movida a 447 líneas del EXTINF |
| L3 | 90 | Todos los canales forzados a P0 |
| L6 | 105 | `btoa()` truncó OVERFLOW B64 + LCEVC-BASE-CODEC hardcodeado |
| L9 | 50 | Refactorización eliminó 6 módulos + reordenó el bloque |

> [!CAUTION]
> **REGLA SUPREMA: NUNCA refactorizar `generateChannelEntry`.** Las regresiones L2, L3 y L9 fueron causadas por refactorizaciones "inofensivas". Aplicar SOLO cambios quirúrgicos de 1 línea.

---

## Estructura Invariante del Bloque de Canal

Cada canal tiene exactamente esta estructura, en este orden exacto. **NO reordenar.**

```
LÍNEA 0: #EXTINF:-1 tvg-id="..." ...
LÍNEA 1: #EXT-X-STREAM-INF:BANDWIDTH=...,CODECS="avc1...,hev1...,av01...,mp4a..."
LÍNEA 2: http://stream.url/live/...         ← URL SIEMPRE aquí (máx 2 líneas del EXTINF)
LÍNEA 3: #EXTHTTP:{...JSON 200+ campos...}
LÍNEA 4: #EXT-X-APE-OVERFLOW-HEADERS:...base64...
LÍNEA 5+: #EXTVLCOPT:...                   ← ~30 tags VLC
          #KODIPROP:...                     ← ~6 tags Kodi
          #EXT-X-APE-VERSION:18.2           ← build_ape_block (~120 tags)
          ...                               ← Cortex Omega (10 tags)
          ...                               ← AV1 Fallback (10 tags)
          ...                               ← LCEVC SDK Injector (13 tags)
          ...                               ← IP Rotation (10 tags)
          ...                               ← Stealth UA (3 tags)
          ...                               ← Pre-Armed Response (~60 tags)
          ...                               ← ISP Throttle (~12 tags)
```

---

## Los 11 Módulos Obligatorios

| # | Módulo | Tags | Verificación |
|---|--------|------|-------------|
| 1 | Estructura Canal | 3 | URL a línea 2 del EXTINF |
| 2 | Perfiles P0-P5 | 1 | P0=107, P1=164, P2=1211, P3=5394, P4=14, P5=20 |
| 3 | HDR10+/DV/HLG | 3 | Triple stack en 6,910 canales |
| 4 | LCEVC Phase4 + SDK | 13 | `LCEVC-HTML5-SDK` + `VNOVA-LCEVC-CONFIG-B64` en 6,910 |
| 5 | Módulo IA | 23 | `APE-AI-*` en 6,910 |
| 6 | Cortex Omega | 10 | `CORTEX-OMEGA` + `250_LAYERS` en 6,910 |
| 7 | Degradación 7L | 7 | `DEGRADATION-LEVEL-1` a `7` en 6,910 |
| 8 | IP Rotation | 10 | `IP-ROTATION` en 6,910 |
| 9 | AV1 Fallback | 10 | `AV1-FALLBACK-ENABLED` en 6,910 |
| 10 | OVERFLOW B64 | 1 | 68+ campos decodificables |
| 11 | EXTHTTP JSON | 1 | 200+ campos válidos |

---

## Fix LCEVC-BASE-CODEC (El Único Bug Histórico Persistente)

```javascript
// ❌ PROHIBIDO — Causa mismatch AV1/HEVC en el motor LCEVC
const lcevcBaseCodec = 'AV1';

// ✅ OBLIGATORIO — Evaluación dinámica contra el codec REAL del canal
const c_str = channel.codecs || channel.codec || '';
const lcevcBaseCodec = c_str.includes('av01') && !c_str.includes('hev1') ? 'AV1' : 'HEVC';
```

**Resultado esperado:** AV1=107, HEVC=6,803

---

## 3 Reglas Anti-Regresión

### Regla 1 — OVERFLOW B64: Usar Buffer, NUNCA btoa()

```javascript
// ❌ btoa() corrompe UTF-8 en el byte ~1979
const b64 = btoa(JSON.stringify(overflowHeaders));

// ✅ Buffer.from robusto con UTF-8
const b64 = Buffer.from(JSON.stringify(overflowHeaders), 'utf8').toString('base64');
```

### Regla 2 — URL a exactamente 2 líneas del EXTINF

```
#EXTINF:-1 ...          ← línea 0
#EXT-X-STREAM-INF:...   ← línea 1
http://url...            ← línea 2 (AQUÍ, no más lejos)
```

### Regla 3 — NO eliminar STREAM-INF

El `#EXT-X-STREAM-INF` es OBLIGATORIO. Contiene los codecs reales (`hev1`, `av01`, `avc1`) que los players leen para seleccionar el decodificador de hardware. Sin él, el auditor falla en "Estructura de Canal".

---

## Orden de generateChannelEntry (INMUTABLE)

```javascript
// BLOQUE 1: EXTINF → STREAM-INF → URL → EXTHTTP
lines.push(generateEXTINF(...));
lines.push(`#EXT-X-STREAM-INF:...`);
lines.push(buildChannelUrl(...));
lines.push(build_exthttp(...));

// BLOQUE 2: EXTVLCOPT + KODIPROP
lines.push(...EXTVLCOPT);
lines.push(...KODIPROP);

// BLOQUE 3: APE TAGS (con LCEVC-BASE-CODEC dinámico)
lines.push(...build_ape_block(cfg, profile, index, channel));

// BLOQUE 4: CORTEX OMEGA (10 tags estáticos, INCONDICIONAL)
// BLOQUE 5: AV1 FALLBACK CHAIN (10 tags estáticos)
// BLOQUE 6: LCEVC SDK INJECTOR (13 tags + VNOVA B64)
// BLOQUE 7: IP ROTATION (10 tags con IPs dinámicas)
// BLOQUE 8: STEALTH + PRE-ARMED + ISP THROTTLE
```

---

## Validación Pre-Exportación

Ejecutar ANTES de escribir el archivo. Si falla, ABORTAR.

```javascript
function validateGeneratedList(content) {
  const errors = [];
  const cc = (content.match(/#EXTINF/g) || []).length;
  if (cc < 6910) errors.push(`CANALES: ${cc}`);

  const av1 = (content.match(/LCEVC-BASE-CODEC:AV1\b/g) || []).length;
  const hevc = (content.match(/LCEVC-BASE-CODEC:HEVC\b/g) || []).length;
  if (av1 !== 107) errors.push(`AV1=${av1} (esperado 107)`);
  if (hevc !== 6803) errors.push(`HEVC=${hevc} (esperado 6803)`);

  for (const [tag, min] of Object.entries({
    'LCEVC-HTML5-SDK': 6910, 'IP-ROTATION': 6910,
    'AV1-FALLBACK-ENABLED': 6910, 'CORTEX-OMEGA': 6910,
    'DEGRADATION-LEVEL-7': 6910
  })) {
    const n = (content.match(new RegExp(tag, 'g')) || []).length;
    if (n < min) errors.push(`${tag}: ${n} < ${min}`);
  }

  if (errors.length) { errors.forEach(e => console.error(`⚠ ${e}`)); process.exit(1); }
  console.log(`✅ VALIDACIÓN OK — ${cc} canales, AV1=${av1}, HEVC=${hevc}`);
}
```
