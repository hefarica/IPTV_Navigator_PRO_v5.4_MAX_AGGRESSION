---
name: iptv-pipeline-architect
description: "Diagnostico forense, planificacion e implementacion de correcciones al generador M3U8 APE (m3u8-typed-arrays-ultimate.js). Usar cuando: analizar bugs en el generador, corregir pantallas negras, sincronizar estructura con modelo de referencia, aplicar Plan Maestro v23, conectar motor USA, garantizar 6 capas de transporte con 0 headers perdidos, o empaquetar nueva version."
version: "2.0.0-VNEXT"
level: "vNext (Nivel 4)"
---

# IPTV Pipeline Architect v2.0 — vNext

## Proposito

Diagnosticar y corregir el generador M3U8 APE de forma sistematica, escalable y determinista. Resolver al 100% los 13 problemas catalogados (B1-B6, A7-A13, D1-D6) y construir la arquitectura de 6 capas de transporte con 540 headers unicos por canal y 0 headers perdidos.

---

## Execution Protocol (OBLIGATORIO)

Toda invocacion DEBE seguir este protocolo. No se puede omitir ningun paso.

```
PASO 1 — CORTEX SCAN (obligatorio, 5 capas)
|  1.1 Leer m3u8-typed-arrays-ultimate.js (estado actual)
|  1.2 Leer ape-profiles-config.js (perfiles)
|  1.3 Leer ape-runtime-evasion-engine.js (runtime)
|  1.4 Leer app.js (frontend)
|  1.5 Ejecutar: python scripts/diagnose_pipeline.py <generador.js>
|
PASO 2 — CLASIFICAR SEVERIDAD
|  Criticos (rojos) → implementar TODOS antes de continuar
|  Medios (amarillos) → implementar si no hay criticos pendientes
|  Cosmeticos → implementar al final
|
PASO 3 — PLANIFICAR PARCHES
|  Respetar orden de dependencias:
|    Paso 1 (URL limpia) → Paso 6 (buildUniversalUrl)
|    Paso 2 (semaforo FrontCDN) — independiente
|    Paso 3 (EXTHTTP unificado) → Paso 4 (JWT) → Paso 8 (ESSENTIAL_KEYS)
|    Paso 7 (limpieza VERSION) — independiente, siempre al final
|
PASO 4 — APLICAR PARCHES
|  Automatizables: python scripts/apply_patches.py <generador.js>
|  Manuales: seguir codigo exacto en references/plan_maestro_v23.md
|
PASO 5 — VALIDAR
|  python scripts/validate_pipeline.py <generador_PATCHED.js> [lista.m3u8]
|  Score < 70 → RECHAZAR, volver a PASO 4
|  Score 70-85 → ACEPTAR CON RIESGO
|  Score > 85 → PRODUCCION
|
PASO 6 — EMPAQUETAR
|  Solo si score > 85
|  zip -9 "APE_TYPED_ARRAYS_ULTIMATE_vX.Y.Z.zip" archivos...
```

---

## Input Spec

| Parametro | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `generador_js` | string (path) | Si | m3u8-typed-arrays-ultimate.js |
| `lista_m3u8` | string (path) | Opcional | Lista generada para verificar |
| `version` | string | Opcional | Tag de version objetivo |
| `modo` | enum | Opcional | `diagnostico` / `parche` / `full` (default: full) |

---

## Output Spec

| Campo | Tipo | Siempre presente |
|---|---|---|
| `score` | int (0-100) | Si |
| `nivel` | enum (RECHAZAR/RIESGO/PRODUCCION) | Si |
| `bugs_encontrados` | array de {id, sev, msg} | Si |
| `capas_estado` | object {A..F: bool} | Si |
| `parches_aplicados` | array de string | Si |
| `parches_fallidos` | array de string | Si |
| `archivo_parcheado` | string (path) | Si (si modo=parche/full) |

---

## Arquitectura Objetivo — 6 Capas de Transporte

```
540 headers unicos por canal, 0 perdidos

CAPA A — #EXTHTTP funcional (~30 headers, <3KB)
  Headers HTTP reales: UA, Referer, Origin, Cookie, Authorization
  SIEMPRE en #EXTHTTP como JSON valido

CAPA B — Cookie header (~50 campos, dentro de CAPA A)
  Metadata key=value: ape_p=P3; ape_c=HEVC; ape_sid=ABC; ape_v=23.0
  Generado por _buildApeCookie()

CAPA C — JWT real en Authorization (30+ claims, dentro de CAPA A)
  Bearer eyJhbGciOiJub25lIn0...
  Generado por generateJWT68Fields() REAL, no stub

CAPA D — #KODIPROP stream_headers (142 headers)
  inputstream.adaptive.stream_headers=User-Agent=...
  NO TOCAR — ya implementado

CAPA E — #EXT-X-APE-OVERFLOW-HEADERS base64 (~460 headers)
  X-EL-*, X-AF-*, X-Video-*, X-HEVC-*, X-HDR10-*, X-ISP-*
  Runtime Evasion Engine ya los decodifica

CAPA F — #EXT-X-APE-* tags L5-L8 (~550 tags)
  Metadata del player, clasificacion, perfiles
  NO TOCAR — ya implementado
```

---

## Inventario Completo de Problemas (13 catalogados)

### Bugs Originales

| ID | Bug | Severidad | Estado base |
|---|---|---|---|
| B1 | STREAM-INF mal posicionado (RFC 8216) | CRITICO | Resuelto v22.2 |
| B2 | FrontCDN CORS — fetch directo | CRITICO | Resuelto v22.2 |
| B3 | ApeModuleManager.getStatus no es funcion | MEDIO | Resuelto |
| B4 | preferHttps() invierte protocolo | CRITICO | Resuelto (passthrough) |
| B5 | Parametros ape_sid/ape_nonce en URL | CRITICO | PENDIENTE Paso 1 |
| B6 | Extension .ts/.m3u8 forzada incorrectamente | MEDIO | PENDIENTE Paso 5 |

### Anomalias

| ID | Anomalia | Severidad |
|---|---|---|
| A7 | Parameter Pollution &profile= duplicado | CRITICO |
| A10 | Doble ejecucion FrontCDN v2+v3 → 1992 fetch | CRITICO |

### Deuda Arquitectural

| ID | Deuda | Severidad |
|---|---|---|
| D1 | Dos pipelines EXTHTTP — 440 headers descartados | CRITICO |
| D2 | generateJWT68Fields() es stub — JWT falso | CRITICO |
| D3 | OVERFLOW nunca se emite | CRITICO |
| D4 | buildUniversalUrl() nunca se llama | CRITICO |
| D5 | __getOmegaGodTierDirectives() codigo muerto | COSMETICO |
| D6 | VERSION inconsistente — 3 strings distintos | COSMETICO |

---

## Plan de Implementacion — 8 Pasos (con dependencias)

### PASO 1 — URL limpia (B5 + A7)

Eliminar inyeccion de `ape_sid/ape_nonce/profile` en URL.
Reemplazar `getTierUrl()` con limpiador regex.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 1.

### PASO 2 — Semaforo FrontCDN (A10)

Guardia `window.__APE_FRONTCDN_RESOLVING__` al inicio de `preResolveFrontCDNRedirects()`.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 2.

### PASO 3 — Pipeline EXTHTTP unificado (D1 + D3)

Eliminar `build_exthttp()` de `generateChannelEntry()`.
Nuevo L2 unificado con 3 sub-capas (A, B, E).
Emitir `#EXT-X-APE-OVERFLOW-HEADERS` en base64.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 3.

### PASO 4 — JWT real (D2)

Reemplazar stub `generateJWT68Fields()` con 30+ claims reales.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 4.

### PASO 5 — Extension dinamica (B6)

Implementar `resolveStreamExtension()` con tabla por tipo de servidor.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 5.

### PASO 6 — Conectar buildUniversalUrl (D4)

Reemplazar llamada a `buildChannelUrl()` con `buildUniversalUrl()` + fallback.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 6.

### PASO 7 — Limpieza (D5 + D6)

Eliminar funcion huerfana. Unificar VERSION string.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 7.

### PASO 8 — ESSENTIAL_KEYS (mejora)

Actualizar set con headers criticos de QoS, JWT y UA rotation.
Codigo exacto: `references/plan_maestro_v23.md` seccion PASO 8.

---

## Scoring Engine

| Dimension | Peso | Criterio 100% | Criterio 0% |
|---|---|---|---|
| Estabilidad | 25% | 0 bugs criticos, semaforo FrontCDN activo | >3 bugs criticos |
| Latencia | 15% | EXTHTTP < 3KB, URL limpia | EXTHTTP > 8KB o params en URL |
| Calidad | 20% | 6 capas activas, JWT real, OVERFLOW emitido | <3 capas, JWT stub |
| Coherencia | 20% | VERSION unica, 0 codigo muerto critico | 3+ versiones, funciones huerfanas |
| Completitud | 20% | 8/8 pasos aplicados, score audit > 85 | <5 pasos aplicados |

**Score < 70 → RECHAZAR** | **70-85 → ACEPTAR CON RIESGO** | **> 85 → PRODUCCION**

---

## Fallback / Redundancia

| Escenario de fallo | Fallback primario | Fallback secundario |
|---|---|---|
| Parche regex no matchea | Buscar anchor alternativo con fuzzy match | Reportar para edicion manual |
| apply_patches.py falla en 1 parche | Continuar con los demas, reportar fallido | Aplicar parche manual |
| Score < 70 post-parche | Re-ejecutar diagnostico, identificar gap | Generar reporte detallado |
| Generador sin generateChannelEntry | RECHAZAR — archivo incorrecto | Pedir archivo correcto |
| Lista sin EXTINF | RECHAZAR — formato invalido | Pedir lista valida |

---

## Criterio de Rechazo

Se RECHAZA la ejecucion si:
- `generador_js` no contiene `function generateChannelEntry`
- `lista_m3u8` no contiene `#EXTINF` (si se proporciona)
- Score final < 70 despues de 2 ciclos de correccion
- Se detectan bugs B1 (STREAM-INF) post-parche — regresion fatal
- Se detecta `#EXT-X-TARGETDURATION` en Master Playlist — violacion RFC 8216

---

## Reglas de Priorizacion

1. Bugs criticos (B1, B5, A7, A10, D1-D4) → resolver TODOS primero
2. Bugs medios (B6, CAPA_B, CAPA_C) → resolver si no hay criticos
3. Cosmeticos (D5, D6) → resolver al final
4. Mejoras (ESSENTIAL_KEYS) → solo si score > 70

---

## Decisiones Clave de Diseno

**URL siempre limpia:** ape_sid, ape_nonce, profile NUNCA en la URL. Viajan en CAPA A/B/C/F.

**Protocolo sagrado:** preferHttps() es passthrough absoluto. Nunca cambiar protocolo del servidor.

**FrontCDN siempre .ts:** Servidores con _forceTS=true usan extension .ts. El redirect HTTP→CDN es incompatible con .m3u8.

**Semaforo FrontCDN:** Sin `__APE_FRONTCDN_RESOLVING__`, genera 1992 fetch simultaneos y bucle UA.

**OVERFLOW base64:** Runtime Evasion Engine ya decodifica. Si no se emite, ~460 headers se pierden.

**generateChannelEntry() monolitico:** NO se fragmenta. 796 lineas en una sola funcion. Doctrina OMEGA.
