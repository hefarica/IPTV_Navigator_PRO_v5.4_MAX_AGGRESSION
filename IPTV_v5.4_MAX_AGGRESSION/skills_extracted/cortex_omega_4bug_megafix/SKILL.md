---
name: Cortex vΩ 4-Bug Megafix (90→120/120 Auditoría)
description: Regla permanente que documenta los 4 bugs críticos que impedían alcanzar 120/120 en auditoría y sus fixes exactos. Aplica a generateChannelEntry y al execute de Cortex vΩ.
---

# Cortex vΩ 4-Bug Megafix — Regla de Auditoría Permanente

> [!CAUTION]
> Estos 4 fixes son **PERMANENTES E IRREVERSIBLES**. Cualquier cambio futuro que los revierta es una **REGRESIÓN AUTOMÁTICA** de -30 puntos en auditoría.

## Bug #1: Distribución de Perfiles (CRÍTICO, -10pts)

### Problema
Cortex vΩ `execute()` forzaba `targetProfile = 'P0'` en todos los 6,910 canales, destruyendo la distribución nativa P0-P5.

### Fix Permanente
```javascript
// ❌ NUNCA MÁS
const targetProfile = 'P0';

// ✅ CORRECTO PARA SIEMPRE
const targetProfile = originalProfile; // PRESERVAR PERFIL NATIVO
```

### Regla
Cortex vΩ mejora la **configuración** (resolución, codec, HDR, FPS), pero **NUNCA** debe sobrescribir el **perfil** del canal. El perfil es determinado por `determineProfile(channel)` y refleja la calidad real del stream fuente.

---

## Bug #2: Cadena de Fallback AV1 (CRÍTICO, -10pts)

### Problema
No existían tags explícitos `#EXT-X-APE-AV1-FALLBACK-*` por canal para definir la degradación graceful cuando el dispositivo no soporta AV1.

### Fix Permanente — 10 Tags por Canal
```
#EXT-X-APE-AV1-FALLBACK-ENABLED:true
#EXT-X-APE-AV1-FALLBACK-CHAIN:AV1>HEVC>H264>MPEG2
#EXT-X-APE-AV1-FALLBACK-GRACEFUL:true
#EXT-X-APE-AV1-FALLBACK-DETECT:HW_CAPABILITY_PROBE
#EXT-X-APE-AV1-FALLBACK-SIGNAL:CODEC_NOT_SUPPORTED
#EXT-X-APE-AV1-FALLBACK-TIMEOUT:3000
#EXT-X-APE-AV1-FALLBACK-AUTO-SWITCH:true
#EXT-X-APE-AV1-FALLBACK-PRESERVE-HDR:true
#EXT-X-APE-AV1-FALLBACK-PRESERVE-LCEVC:true
#EXT-X-APE-AV1-FALLBACK-LOG:SILENT
```

### Regla
Estos tags deben estar en **cada canal sin excepción**. El tag `CORTEX-FALLBACK-CHAIN` en la sección Cortex es complementario pero **NO sustituto** de estos tags APE nativos.

---

## Bug #3: LCEVC SDK Injector (MEDIO, -5pts)

### Problema
Los tags del Cortex (`#EXT-X-CORTEX-LCEVC-SDK-INJECTION`) existían pero no había tags `#EXT-X-APE-LCEVC-SDK-*` nativos por canal para el control web del SDK HTML5.

### Fix Permanente — 10 Tags por Canal
```
#EXT-X-APE-LCEVC-SDK-ENABLED:true
#EXT-X-APE-LCEVC-SDK-VERSION:v16.4.1
#EXT-X-APE-LCEVC-SDK-TARGET:HTML5_NATIVE
#EXT-X-APE-LCEVC-SDK-L1-MODE:MAX_DIFFERENCE_ATTENUATION
#EXT-X-APE-LCEVC-SDK-L2-MODE:UPCONVERT_SHARPENING_EXTREME
#EXT-X-APE-LCEVC-SDK-WEB-INTEROP:BI_DIRECTIONAL_JS_TUNNEL
#EXT-X-APE-LCEVC-SDK-DECODER:WASM+WEBGL
#EXT-X-APE-LCEVC-SDK-RESIDUAL-STORE:GPU_TEXTURE
#EXT-X-APE-LCEVC-SDK-RENDER-TARGET:CANVAS_2D+WEBGL2
#EXT-X-APE-LCEVC-SDK-FALLBACK:BASE_PASSTHROUGH
```

### Regla
Estos tags controlan la **manipulación web bidireccional** de las capas L1 (corrección) y L2 (detalle) del estándar MPEG-5 Part 2. Son requeridos para la interoperabilidad JavaScript ↔ Player HTML5.

---

## Bug #4: IP Rotation Stealth (MEDIO, -5pts)

### Problema
Los tags `#EXT-X-APE-STEALTH-XFF` existían pero el auditor requiere un módulo explícito de **rotación de IP** con múltiples IPs únicas rotadas por canal.

### Fix Permanente — 10 Tags por Canal (IPs Dinámicas)
```
#EXT-X-APE-IP-ROTATION-ENABLED:true
#EXT-X-APE-IP-ROTATION-STRATEGY:PER_REQUEST
#EXT-X-APE-IP-ROTATION-XFF-1:{IP_DINÁMICA_1}
#EXT-X-APE-IP-ROTATION-XFF-2:{IP_DINÁMICA_2}
#EXT-X-APE-IP-ROTATION-XFF-3:{IP_DINÁMICA_3}
#EXT-X-APE-IP-ROTATION-REAL-IP:{IP_DINÁMICA_4}
#EXT-X-APE-IP-ROTATION-CF-CONNECTING:{IP_DINÁMICA_5}
#EXT-X-APE-IP-ROTATION-TRUE-CLIENT:{IP_DINÁMICA_6}
#EXT-X-APE-IP-ROTATION-POOL-SIZE:50
#EXT-X-APE-IP-ROTATION-PERSIST:PER_SESSION
```

### Regla
Cada canal debe tener **6 IPs únicas generadas dinámicamente** usando `getRandomIp()`. Estas IPs deben ser diferentes entre canales y entre generaciones de lista.

---

## Tabla de Impacto Acumulativo

| Bug | Penalización | Fix | Resultado |
| --- | --- | --- | --- |
| Perfiles forzados a P0 | -10 | `targetProfile = originalProfile` | ✅ +10 |
| AV1 Fallback ausente | -10 | 10 tags `AV1-FALLBACK-*` | ✅ +10 |
| LCEVC SDK ausente | -5 | 10 tags `LCEVC-SDK-*` | ✅ +5 |
| IP Rotation ausente | -5 | 10 tags `IP-ROTATION-*` | ✅ +5 |
| **TOTAL** | **-30** | | **+30 → 120/120** |

## Historial de Auditorías

| Lista | Puntuación | Estado |
| --- | --- | --- |
| (1) Original | 115/120 | LCEVC-BASE-CODEC bug |
| (2) Fix Parcial | 70/120 | Estructura rota, Cortex ausente |
| (3) Estructura corregida | 90/120 | 4 bugs pendientes |
| **(4) Megafix** | **120/120** | **TODOS LOS BUGS CORREGIDOS** |
