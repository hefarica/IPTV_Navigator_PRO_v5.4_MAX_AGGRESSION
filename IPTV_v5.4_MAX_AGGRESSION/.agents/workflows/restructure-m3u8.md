---
description: Reestructurar un M3U8 de producción aplicando Rules Engine, deduplicación, FALLBACK B64, KODIPROP profile-aware, y validación Balanced Scorecard
---

# /restructure-m3u8

Workflow para reestructurar una lista M3U8 de producción generada por APE Typed Arrays Ultimate.

> **Leer primero**: Skill `m3u8_restructuring_rules_engine` para entender las 68 reglas.

## Prerequisitos

- Node.js instalado
- `scripts/restructure_m3u8.js` disponible
- `scripts/validate_m3u8_compat.js` disponible
- Archivo M3U8 de entrada (puede ser 500MB+)

## Paso 1: Identificar el archivo de entrada

Pedir al usuario la ruta del M3U8 a reestructurar. Típicamente está en:
```
C:\Users\HFRC\Downloads\APE_TYPED_ARRAYS_ULTIMATE_{YYYYMMDD}.m3u8
```

## Paso 2: Generar nombre de salida

El archivo de salida debe seguir la convención:
```
APE_ULTIMATE_RESTRUCTURED_{YYYYMMDD}.m3u8
```
Donde `{YYYYMMDD}` es la fecha actual.

// turbo
## Paso 3: Ejecutar el reestructurador

```powershell
node scripts\restructure_m3u8.js "<INPUT_PATH>" "<OUTPUT_PATH>"
```

Esperar a que procese. Debería tomar <60s para archivos de ~500MB.

Verificar que el log muestre:
- ✅ Canales procesados
- ✅ Reducción de tamaño (~15%)
- ✅ Unicode pipes corregidos

// turbo
## Paso 4: Validar con Rules Engine

```powershell
node scripts\validate_m3u8_compat.js "<OUTPUT_PATH>"
```

**Criterios de PASS**:
- ✅ PASS: 100% de canales
- 🟡 WARN: 0
- 🔴 FAIL: 0

Si hay FAIL, revisar el JSON de validación generado automáticamente:
```
<OUTPUT_PATH>_validation.json
```

## Paso 5: Verificar sample de canales

Abrir el archivo de salida y verificar manualmente:

1. **Canal P3 (FHD)**: `preferred-resolution=1080`, `max_resolution=1920x1080`, `max_bandwidth=15000000`
2. **Canal P1 (4K)**: `preferred-resolution=2160`, `max_resolution=3840x2160`, `max_bandwidth=50000000`
3. **Canal P0 (8K)**: `preferred-resolution=4320`, `max_resolution=7680x4320`, `max_bandwidth=130000000`
4. **EXTVLCOPT**: Sin duplicados, `network-caching=120000`, `avcodec-hw=any`, `clock-synchro=1`
5. **FALLBACK**: Exactamente 4 líneas (CHAIN + STRATEGY + PERSIST + GENOME-B64)
6. **URL**: Siempre la última línea de cada canal

## Paso 6: Balanced Scorecard

Evaluar el resultado con las 5 perspectivas:

| Perspectiva | Peso | Mínimo |
|---|---|---|
| Compatibilidad Universal | 30% | 95% |
| Calidad Técnica | 25% | 95% |
| Agresión de Red | 20% | 100% |
| Integridad Estructural | 15% | 100% |
| Eficiencia | 10% | 90% |

**Score total mínimo: 97/100**

## Paso 7: Subir al VPS (si aplica)

Si la lista va a producción:

```powershell
# Usar el workflow de upload existente
# Ver skill: upload_pipeline_vps
```

## Troubleshooting

| Problema | Causa | Solución |
|---|---|---|
| `JavaScript heap out of memory` | Archivo demasiado grande | El script usa streaming, no debería pasar. Si pasa: `node --max-old-space-size=4096 scripts\restructure_m3u8.js` |
| Canales sin URL | Entrada corrupta | Revisar el M3U8 original para entradas incompletas |
| WARN en validación | Key no reconocida | Agregar la key al Rules Engine en `validate_m3u8_compat.js` |
| `index=3` persiste | FALLBACK no consolidado | Verificar que `FALLBACK-GENOME-B64` existe y los FALLBACK-ID sueltos fueron eliminados |
