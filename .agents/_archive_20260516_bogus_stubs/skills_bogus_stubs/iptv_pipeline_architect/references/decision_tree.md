# Arbol de Decision del Pipeline Architect — vNext

## Paso 1: Clasificar la tarea

```
Usuario pide diagnostico?
  SI → Ejecutar diagnose_pipeline.py → Reportar
  NO ↓

Usuario pide parche?
  SI → Ejecutar apply_patches.py → Validar → Reportar
  NO ↓

Usuario pide full (diagnostico + parche + validacion)?
  SI → diagnose → apply → validate → Reportar
  NO ↓

DEFAULT → Ejecutar diagnostico y preguntar
```

## Paso 2: Orden de parches (dependencias)

```
INDEPENDIENTES (ejecutar en cualquier orden):
  Paso 2 — Semaforo FrontCDN (A10)
  Paso 7 — Limpieza VERSION (D5+D6)

CADENA 1 (URL):
  Paso 1 (URL limpia B5+A7) → Paso 6 (buildUniversalUrl D4) → Paso 5 (extension B6)

CADENA 2 (Headers):
  Paso 3 (EXTHTTP unificado D1+D3) → Paso 4 (JWT real D2) → Paso 8 (ESSENTIAL_KEYS)
```

## Paso 3: Decidir automatico vs manual

```
Parche tiene regex confiable?
  SI → apply_patches.py (automatico)
  NO → Edicion manual con codigo de plan_maestro_v23.md

Parches automatizables: B5+A7, A10, D4, D5, D6
Parches manuales: Paso 3 (EXTHTTP), Paso 4 (JWT), Paso 5 (extension), Paso 8 (ESSENTIAL_KEYS)
```

## Paso 4: Fallback si parche falla

```
Regex no matchea?
  → Buscar anchor alternativo (lista en script)
  → Si todos fallan → Reportar para edicion manual
  → NUNCA inventar anchor ni forzar match

Score < 70 post-parche?
  → Re-ejecutar diagnostico
  → Identificar bug especifico que baja score
  → Aplicar fix quirurgico
  → NUNCA re-ejecutar todos los parches (riesgo de regresion)
```

## Paso 5: Validacion post-parche

```
node -c generador.js → Sintaxis OK?
  NO → Revertir desde backup, diagnosticar error
  SI ↓

diagnose_pipeline.py → Bugs criticos = 0?
  NO → Identificar y corregir
  SI ↓

Score >= 85?
  SI → PRODUCCION — empaquetar
  NO → Score >= 70?
       SI → ACEPTAR CON RIESGO — documentar gaps
       NO → RECHAZAR — volver a Paso 4
```
