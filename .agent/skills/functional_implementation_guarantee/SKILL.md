---
name: functional_implementation_guarantee
description: Protocolo obligatorio para que TODO lo implementado funcione operativamente, no solo exista como metadata decorativa. Clasifica cada directiva/cambio en Ejecutable vs Informativo y garantiza que lo ejecutable tenga efecto real medible.
category: Architecture & Quality
version: 1.0.0
importance: CRITICAL
---

# Garantía de Implementación Funcional (GIF Protocol)

> **"Si no se ejecuta, no existe. Si no se verifica, no funciona. Si no se mide, no importa."**

## 1. Problema que Resuelve

Cuando se implementan directivas, tags, headers o configuraciones en un sistema distribuido (M3U8 → player → backend → worker), existe el riesgo constante de:

- **Decoración técnica**: código que parece sofisticado pero ningún componente lo procesa
- **Metadata huérfana**: tags que viajan en el archivo pero ningun parser los lee
- **Cargo cult engineering**: copiar patrones sin verificar que el receptor los entiende
- **Falsa confianza**: asumir que "inyectar = funcionar"

Este skill establece el protocolo GIF (Garantía de Implementación Funcional) que OBLIGA a clasificar, verificar y demostrar que cada implementación tiene efecto real.

## 2. Clasificación Obligatoria: Ejecutable vs Informativo

### ANTES de implementar CUALQUIER directiva, tag o header, clasificar:

```
┌─────────────────────────────────────────────────────┐
│            CLASIFICACIÓN DE DIRECTIVAS              │
├──────────────────┬──────────────────────────────────┤
│   EJECUTABLE     │   INFORMATIVO                    │
│   (Efecto real)  │   (Metadata/documentación)       │
├──────────────────┼──────────────────────────────────┤
│ #EXTVLCOPT       │ #EXT-X-APE-*                     │
│ #KODIPROP        │ #EXTATTRFROMURL (parcial)         │
│ #EXTHTTP (OTT)   │ Comentarios en lista             │
│ #EXT-X-STREAM-INF│ Tags custom sin parser           │
│ #EXT-X-MAP       │ Headers HTTP sin backend          │
│ #EXT-X-KEY       │ Scoring/weights declarativos      │
│ #EXTINF          │ Matrices de compatibilidad        │
│ FFmpeg CLI params │ Fallback chains declarativas     │
└──────────────────┴──────────────────────────────────┘
```

### Regla de oro
```
Para cada directiva implementada, responder:
1. ¿QUIÉN la lee? (player, backend, proxy, worker, humano)
2. ¿QUÉ hace cuando la lee? (acción concreta)
3. ¿CÓMO se verifica que actuó? (log, métrica, comportamiento)

Si no se pueden responder las 3 → es INFORMATIVO, no EJECUTABLE
```

## 3. Protocolo GIF por Capa

### 3.1 Capa M3U8 (Lista directa al player)

| Directiva | Quién la lee | Acción verificable | Cómo verificar |
|-----------|-------------|-------------------|----------------|
| `#EXTVLCOPT:key=val` | VLC | Cambia config del player | Log VLC: buscar key en verbose |
| `#KODIPROP:key=val` | Kodi/InputStream | Configura inputstream.adaptive | Log Kodi: addon debug |
| `#EXTHTTP:{json}` | OTT Navigator | Envía headers HTTP al origen | Captura de red: verificar headers |
| `#EXT-X-STREAM-INF` | Todos los players | Selección de variante ABR | Monitorear bitrate seleccionado |
| `#EXT-X-MAP` | ~~Players fMP4~~ | ~~Init segment para CMAF~~ | **ELIMINADO del catálogo 2026-04-17**: causaba 404 (init.mp4 no existe en M3U8 de canales). Solo válido en HLS manifests reales del proveedor. |
| `#EXT-X-KEY` | Players con DRM | Descifrado de segmentos | Stream descifra o falla |
| `#EXTINF:duration` | Todos | Duración del segmento | Duración de reproducción correcta |

### 3.2 Capa HTTP Headers (Backend/CDN)

| Header | Quién lo lee | Acción verificable | Cómo verificar |
|--------|-------------|-------------------|----------------|
| `User-Agent` | CDN/Origen | Permite/bloquea acceso | HTTP 200 vs 403 |
| `Referer` | CDN/Origen | Valida origen permitido | HTTP 200 vs 403 |
| `X-Forwarded-For` | CDN | Geolocalización | Contenido correcto por región |
| `X-Custom-*` | Backend propio | Solo si backend los procesa | Log del backend |

### 3.3 Capa FFmpeg (Worker/Transcoder)

| Parámetro | Acción verificable | Cómo verificar |
|-----------|-------------------|----------------|
| `-c:v libx265` | Encode en HEVC | `ffprobe`: codec_name=hevc |
| `-f dash` | Output DASH | Archivos .mpd + .m4s generados |
| `-hls_segment_type fmp4` | Segmentos fMP4 | Extensión .m4s, no .ts |
| `-vf tonemapx` | Tone-mapping HDR→SDR | Comparar color space output |
| `deblock:-1:-1` | Deblocking reducido | No verificable visualmente a simple vista |

## 4. Checklist Pre-Implementación (OBLIGATORIO)

Antes de escribir código, responder para CADA directiva nueva:

```markdown
## Directiva: [nombre]
- [ ] ¿Quién la parsea? → [player/backend/worker/nadie]
- [ ] ¿Qué componente actúa? → [nombre específico]
- [ ] ¿Qué sucede si el receptor NO la entiende? → [ignora/error/crash]
- [ ] ¿Cómo verifico que tuvo efecto? → [método concreto]
- [ ] ¿Existe alternativa ejecutable? → [sí: cuál / no]
- [ ] Clasificación final: → [EJECUTABLE / INFORMATIVO]
```

## 5. Reglas de Implementación

### 5.1 Cada feature EJECUTABLE debe tener prueba de vida

```
NO ACEPTABLE:
  ✗ "Inyecté 80 tags APE de transport decision"
  ✗ "Agregué headers X-Cortex-* al JSON"
  ✗ "El scoring weight viaja en la lista"

ACEPTABLE:
  ✓ "Inyecté #EXTVLCOPT:avcodec-codec=hevc → verificado en log VLC"
  ✓ "KODIPROP:inputstream.adaptive.manifest_type=hls → Kodi carga inputstream"
  ✓ "EXTHTTP User-Agent rotado → HTTP 200 en todos los orígenes testeados"
```

### 5.2 Si es INFORMATIVO, declararlo explícitamente

```javascript
// ✅ CORRECTO: declarar que es metadata informativa
// INFORMATIVO: Tag APE para auditoría y trazabilidad del motor Cortex
lines.push('#EXT-X-APE-TRANSPORT-ENGINE:v2.0.0');

// ❌ INCORRECTO: pretender que tiene efecto ejecutable
// "Fuerza el motor de transporte v2.0 en el player"
lines.push('#EXT-X-APE-TRANSPORT-ENGINE:v2.0.0');
```

### 5.3 Maximizar directivas EJECUTABLES

Para cada directiva INFORMATIVA, buscar si existe un equivalente EJECUTABLE:

```
INFORMATIVO → EJECUTABLE (si existe):

#EXT-X-APE-CMAF-SEGMENT-TYPE:fmp4
  → #KODIPROP:inputstream.adaptive.manifest_type=hls
  → #KODIPROP:inputstream.adaptive.stream_selection_type=adaptive

#EXT-X-APE-TRANSPORT-HDR-PASSTHROUGH:true
  → #EXTVLCOPT:avcodec-hw=any
  → #KODIPROP:inputstream.adaptive.force_hdr=true

#EXT-X-APE-CMAF-LOW-LATENCY:true
  → #KODIPROP:inputstream.adaptive.play_timeshift_buffer=true
  → #EXTVLCOPT:network-caching=1000
```

### 5.4 Ratio mínimo ejecutable/informativo

```
OBJETIVO: ≥ 30% de directivas deben ser EJECUTABLES
ACTUAL:   Auditar y reportar el ratio real
ACCIÓN:   Si ratio < 30%, buscar equivalentes ejecutables
```

## 6. Protocolo de Verificación Post-Implementación

### Paso 1: Generar lista de prueba
```bash
# Generar M3U8 con un solo canal
# Abrir el archivo y contar directivas por tipo
```

### Paso 2: Clasificar cada directiva
```
EJECUTABLES encontradas: N
INFORMATIVAS encontradas: M
Ratio: N/(N+M) = X%
```

### Paso 3: Verificar las EJECUTABLES
```
Para cada EJECUTABLE:
  1. Abrir en el player correspondiente
  2. Buscar en logs que el player la procesó
  3. Confirmar efecto (codec cambiado, header enviado, etc.)
  4. Documentar resultado: ✅ funciona / ❌ ignorada / ⚠️ parcial
```

### Paso 4: Documentar honestamente
```markdown
## Reporte de Verificación GIF
- Total directivas: X
- Ejecutables verificadas: Y/Z funcionando
- Informativas: N (metadata para auditoría)
- Ratio funcional: Y/X = W%
```

## 7. Anti-Patrones Prohibidos

| Anti-patrón | Por qué es malo | Qué hacer en su lugar |
|------------|----------------|----------------------|
| Inyectar 100 tags sin verificar ninguno | Falsa sensación de sofisticación | Verificar al menos los ejecutables |
| Decir "viaja al decodificador" sin probarlo | Promesa técnica infundada | Probar con player real y mostrar log |
| "Estrangula el hardware" como descripción | Marketing, no ingeniería | Medir FPS, CPU%, latencia real |
| Copiar directivas de documentación sin adaptarlas | Cargo cult | Entender qué hace cada una en contexto |
| Asumir que custom tags hacen algo | Ignorancia del parser | Verificar qué tags lee cada player |

## 8. Aplicación a Este Proyecto (IPTV Navigator PRO)

### Directivas EJECUTABLES confirmadas:
- `#EXTVLCOPT:*` → VLC las procesa ✅
- `#KODIPROP:*` → Kodi las procesa ✅
- `#EXTHTTP:{json}` → OTT Navigator envía headers ✅
- `#EXTINF`, `#EXT-X-STREAM-INF`, `#EXT-X-MAP` → Estándar HLS ✅

### Directivas INFORMATIVAS (metadata embebida):
- `#EXT-X-APE-*` → Ningún player las parsea nativamente
- `#EXTATTRFROMURL:*` → Solo OTT Navigator y forks compatibles
- Headers `X-Cortex-*`, `X-Transport-*` → Solo si el backend los lee

### Acción requerida siempre:
1. Cuando se agreguen nuevos APE tags → declararlos como INFORMATIVOS
2. Cuando se agreguen EXTVLCOPT/KODIPROP → verificar en player real
3. Cuando se agreguen headers HTTP → verificar que el backend/CDN responde
4. Nunca prometer efecto ejecutable de un tag informativo

## 9. Resumen Ejecutivo

```
╔══════════════════════════════════════════════════════════╗
║  REGLA #1: Clasificar ANTES de implementar              ║
║  REGLA #2: Verificar DESPUÉS de implementar              ║
║  REGLA #3: Documentar HONESTAMENTE el resultado          ║
║  REGLA #4: Maximizar EJECUTABLES sobre INFORMATIVOS      ║
║  REGLA #5: Nunca prometer lo que no se puede probar      ║
╚══════════════════════════════════════════════════════════╝
```

> **Este skill se aplica a TODA implementación futura. No hay excepciones.**
