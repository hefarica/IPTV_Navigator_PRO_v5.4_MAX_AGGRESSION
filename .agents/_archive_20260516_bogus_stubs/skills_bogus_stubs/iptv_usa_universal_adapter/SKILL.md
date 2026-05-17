---
name: iptv-usa-universal-adapter
description: "Motor Universal Server Adapter (USA) v2.0 vNext. Detecta, adapta y conecta el generador M3U8 APE a cualquier servidor IPTV (Xtream/Stalker/FrontCDN/Custom) sin hardcodear dominios. Usar cuando: auditar listas M3U8, integrar USA en generador JS, diagnosticar pantallas negras por protocolo/extension, o hacer el generador idempotente y polimorfico."
version: "2.0.0-VNEXT"
level: "vNext (Nivel 4)"
---

# IPTV Universal Server Adapter (USA) v2.0 — vNext

## Proposito

Garantizar que las 883 lineas por canal del generador `m3u8-typed-arrays-ultimate.js` lleguen correctamente a **cualquier servidor IPTV** del mundo, sin importar protocolo, tipo, codigo de respuesta, puerto, extension ni autenticacion.

**Resultado:** URL limpia + directivas polimorficas + idempotencia absoluta.

---

## Execution Protocol (OBLIGATORIO)

Toda invocacion de esta skill DEBE seguir este protocolo en orden. No se puede omitir ningun paso.

```
PASO 1 — CORTEX SCAN (30s)
|  Leer estado actual del generador y la lista
|  Ejecutar: python scripts/audit_m3u8_structure.py <lista.m3u8>
|  Si no hay lista: ejecutar diagnostico solo del JS
|
PASO 2 — CLASIFICAR TAREA
|  A — AUDITAR lista existente
|  B — INTEGRAR USA en generador
|  C — DIAGNOSTICAR pantalla negra
|  D — VERIFICAR integracion previa
|
PASO 3 — EJECUTAR FLUJO
|  Seguir el flujo correspondiente paso a paso
|  Cada paso produce output verificable
|
PASO 4 — SCORING
|  Ejecutar: python scripts/validate_usa.py <output>
|  Score < 70 → RECHAZAR, volver a PASO 3
|  Score 70-85 → ACEPTAR CON RIESGO, documentar gaps
|  Score > 85 → PRODUCCION
|
PASO 5 — REPORT
|  Generar reporte usando templates/report_template.md
|  Incluir score, bugs encontrados, acciones tomadas
```

---

## Input Spec

| Parametro | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `archivo_m3u8` | string (path) | Flujo A/C | Lista M3U8 a auditar |
| `generador_js` | string (path) | Flujo B/D | Archivo JS del generador APE |
| `output_js` | string (path) | Flujo B | Archivo JS de salida |
| `version` | string | Opcional | Tag de version (ej: `23.0.0-OMEGA`) |
| `tarea` | enum | Requerido | `auditar` / `integrar` / `diagnosticar` / `verificar` |

---

## Output Spec

| Campo | Tipo | Siempre presente |
|---|---|---|
| `score` | int (0-100) | Si |
| `nivel` | enum (RECHAZAR/RIESGO/PRODUCCION) | Si |
| `bugs_encontrados` | array de {id, severidad, descripcion} | Si |
| `acciones_tomadas` | array de string | Si |
| `archivo_generado` | string (path) | Solo Flujo B |
| `reporte` | string (markdown) | Si |

---

## Flujo A: Auditoria de Lista M3U8

### Paso A1 — Ejecutar auditoria estructural
```bash
python scripts/audit_m3u8_structure.py <archivo.m3u8>
```

### Paso A2 — Interpretar resultados

| Metrica | Objetivo | Accion si falla |
|---|---|---|
| Lineas por canal | 883 | Revisar `generateChannelEntry` — faltan bloques |
| Bugs RFC 8216 | 0 | Reordenar: directivas primero, STREAM-INF+URL al final |
| Variantes ABR | 1 por canal | FIX 2026-04-17: Máximo 1 EXT-X-STREAM-INF + 1 URL. SIN URI= en EXT-X-MEDIA ni I-FRAME-STREAM-INF. Múltiples URLs causaban 509 (proveedor bloqueaba conexiones excesivas). Failover va en querystring, no en URLs separadas. |
| Servidores HTTPS que fallan | 0 | Verificar `preferHttps()` es passthrough |
| Parametros APE en URL | 0 | Eliminar `?ape_sid=`, `&profile=` |
| EXTHTTP size | < 3072 chars | Mover overflow a CAPA E base64 |

### Paso A3 — Scoring automatico
```bash
python scripts/validate_usa.py --mode audit <archivo.m3u8>
```

---

## Flujo B: Integracion del Motor USA en Generador JS

### Paso B1 — Verificar anchors requeridos
```bash
python scripts/validate_usa.py --mode precheck <generador.js>
```

Anchors necesarios:
- `function buildChannelUrl(` — punto de inyeccion del modulo USA
- `return preferHttps(...)` al final de buildChannelUrl — se reemplaza por `buildUniversalUrl()`
- `let primaryUrl = (typeof buildChannelUrl === 'function')` — conexion de overrides
- `lines.push(\`#EXTVLCOPT:network-caching=\${_buf796}\`)` — inyeccion EXTVLCOPT USA
- `lines.push(\`#KODIPROP:inputstream.adaptive.buffer_live_delay=0\`)` — inyeccion KODIPROP USA

### Paso B2 — Ejecutar integracion
```bash
python scripts/integrate_usa_motor.py <input.js> <output.js> --version X.Y.Z-TAG
```

### Paso B3 — Validar integracion
```bash
python scripts/validate_usa.py --mode integration <output.js>
```

5 funciones criticas deben existir:
1. `detectServerFingerprint`
2. `buildUniversalUrl`
3. `getUSADirectiveOverrides`
4. `_usaOverrides.extvlcopt.forEach`
5. `_usaOverrides.kodiprop.forEach`

### Paso B4 — Scoring final
Score > 85 → empaquetar ZIP de despliegue.

---

## Flujo C: Diagnostico de Pantalla Negra

### Paso C1 — Arbol de decision
```
Pantalla negra en TODOS los canales?
  SI → Bug B1: STREAM-INF mal posicionado (RFC 8216)
  NO → Solo canales FrontCDN?
       SI → Bug B2: CORS en pre-resolucion
       NO → Solo canales HTTPS?
            SI → Bug B4: preferHttps() invierte protocolo
            NO → HTTP 400/403?
                 SI → Bug B5: parametros APE en URL
                 NO → Bug B6: extension incorrecta
```

### Paso C2 — Consultar referencias
Leer `references/bugs_comunes.md` para detalles y codigo de correccion.

### Paso C3 — Verificar fix
```bash
python scripts/audit_m3u8_structure.py <lista_corregida.m3u8>
```

---

## Flujo D: Verificacion de Integracion Previa

```bash
python scripts/validate_usa.py --mode full <generador.js> [lista.m3u8]
```

---

## Tipos de Servidor Detectados

| Tipo | Deteccion | URL generada | Extension | Directivas extra |
|---|---|---|---|---|
| `XTREAM_HTTP` | `http://` sin flags | `/live/U/P/ID.m3u8` | `.m3u8` | `network-caching=8000` |
| `XTREAM_HTTPS` | `https://` | `/live/U/P/ID.m3u8` | `.m3u8` | `ssl_verify=false`, `Upgrade-Insecure-Requests=1` |
| `FRONTCDN` | `_forceTS` / `_frontCDNHost` / dominio | Token pre-resuelto | `.ts` | `http-forward=true`, `live-caching=60000` |
| `STALKER` | `/portal.php`, `get.php`, `/c/` | Portal con MAC | `.ts` | `X-Stalker-Auth=token` |
| `CUSTOM_AUTO` | Cualquier otro | Passthrough | `.m3u8` | `http-reconnect=true` |

---

## Estructura de 883 Lineas por Canal (Orden Correcto)

```
1.    #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="..."
2.    #EXTVLCOPT:... (x132)
134.  #EXTHTTP:{...} (x1 — JSON < 3KB)
135.  #KODIPROP:... (x73)
208.  #EXT-X-CMAF-* (x25)
233.  #EXT-X-APE-* (x550)
783.  #EXTATTRFROMURL:... (x54)
837.  #EXT-X-VNOVA-* (x20)
857.  #EXT-X-PHANTOM-* (x18)
875.  #EXT-X-MEDIA:TYPE=AUDIO,...                 <- metadata SIN URI= (no abre conexión)
876.  #EXT-X-I-FRAME-STREAM-INF:...               <- metadata SIN URI= (no abre conexión)
877.  #EXT-X-STREAM-INF:BANDWIDTH=80000000,...     <- 1 SOLA variante
878.  http://servidor/live/USER/PASS/ID.m3u8       <- 1 SOLA URL (FIX 509: múltiples URLs = proveedor bloquea)
879.  [linea vacia separadora]
```

> ⚠️ **FIX 2026-04-17**: Antes había 3 variantes EXT-X-STREAM-INF con 3 URLs separadas.
> Esto causaba que OTT Navigator abriera 3+ conexiones por canal al cargar la lista.
> Con 4536 canales × 3 URLs = 13,608 conexiones → proveedor respondía HTTP 509.
> La redundancia/failover se maneja via querystring (`&pevce_fallback_chain=`) o
> en el backend resolver, NUNCA como múltiples URLs en el catálogo M3U8.

---

## Principios Inquebrantables

1. El protocolo del servidor es SAGRADO — nunca modificar `http://` <-> `https://`
2. `#EXT-X-STREAM-INF` SIEMPRE en la linea inmediatamente anterior a su URL (RFC 8216)
3. URLs limpias — parametros APE van en headers (EXTHTTP/Cookie/JWT), NUNCA en la URL
4. Idempotencia: mismo canal + servidor → misma URL siempre
5. Polimorfismo: cada tipo de servidor recibe directivas adaptadas

---

## Scoring Engine

| Dimension | Peso | Criterio 100% | Criterio 0% |
|---|---|---|---|
| Estabilidad | 25% | 0 bugs RFC 8216, 0 crashes | >5 bugs |
| Latencia | 15% | EXTHTTP < 3KB, 1 variante ABR (sin URI= extras) | EXTHTTP > 8KB o múltiples URLs por canal |
| Calidad | 20% | 883 lineas/canal, 5 funciones USA presentes | < 500 lineas |
| Coherencia | 20% | URL limpia, protocolo sagrado, extension correcta | Parametros APE en URL |
| Completitud | 20% | 5 tipos servidor detectados, OVERFLOW emitido | < 3 tipos |

**Score < 70 → RECHAZAR** | **70-85 → ACEPTAR CON RIESGO** | **> 85 → PRODUCCION**

---

## Fallback / Redundancia

| Escenario de fallo | Fallback primario | Fallback secundario |
|---|---|---|
| Anchor de integracion no encontrado | Buscar anchors alternativos | Reportar para integracion manual |
| USA_MODULE_v1.js no encontrado | Buscar en `./scripts/`, `./`, `/tmp/` | Generar modulo inline desde template |
| Score < 70 | Re-ejecutar con modo `--fix-auto` | Generar reporte con gaps |
| Servidor desconocido | Tipo `CUSTOM_AUTO` con passthrough | Directivas universales minimas |
| EXTHTTP > 3KB | Mover headers a OVERFLOW base64 | Truncar a ESSENTIAL_KEYS |

---

## Criterio de Rechazo

Se RECHAZA la ejecucion si:
- El archivo de entrada no existe o no es legible
- El generador JS no tiene `function generateChannelEntry`
- La lista M3U8 no tiene `#EXTINF`
- Score final < 70 despues de 2 intentos de correccion automatica
- Se detecta inyeccion de `#EXT-X-TARGETDURATION` o `#EXT-X-MEDIA-SEQUENCE` en Master Playlist

---

## Reglas de Priorizacion

1. Bugs RFC 8216 (STREAM-INF posicion) → siempre primero
2. URL contaminada (ape_sid, profile) → segundo
3. Doble ejecucion FrontCDN → tercero
4. Motor USA desconectado → cuarto
5. OVERFLOW no emitido → quinto
6. Extension incorrecta → sexto
7. VERSION inconsistente → ultimo
