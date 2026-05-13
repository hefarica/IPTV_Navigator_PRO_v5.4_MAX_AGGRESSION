# Performance Budget - IPTV Navigator PRO

## Overview

Este documento define los budgets de performance para la aplicación IPTV Navigator PRO. Los budgets son límites máximos que las operaciones no deben exceder para mantener una experiencia de usuario fluida.

---

## 📊 Performance Budgets

### Operaciones Críticas

| Operación | Budget | Tolerancia | Notas |
|-----------|--------|------------|-------|
| Tab Switch | 200ms | +100ms | Incluye hibernación |
| Hibernación de Tab | 100ms | +50ms | Vaciar DOM pesado |
| Render Inicial Análisis | 500ms | +200ms | Primera carga de tabla |
| Paginación Análisis | 100ms | +50ms | Cambio de página |
| Búsqueda/Filtro | 300ms | +100ms | Filtrado en memoria |

### Generación M3U8

| Métrica | Budget | Para N canales |
|---------|--------|----------------|
| Generación | 10s | 50,000 canales |
| Generación | 20s | 100,000 canales |
| Generación | 60s | 300,000 canales |
| Progreso Update | 50ms | Por batch de 500 |

### Memoria

| Métrica | Budget | Notas |
|---------|--------|-------|
| Heap Usage (idle) | < 100MB | Sin datos cargados |
| Heap Usage (loaded) | < 500MB | 50k canales |
| Heap Growth per tab | < 50MB | Al cambiar pestañas |
| Post-Hibernation Drop | > 30% | Liberación efectiva |

---

## ⚠️ Alertas y Acciones

### Nivel 1: Warning (Amarillo)

- Operación excede budget pero está dentro de tolerancia
- **Acción:** Registrar en logs, monitorear tendencia

### Nivel 2: Error (Rojo)

- Operación excede budget + tolerancia
- **Acción:** Investigar causa, optimizar código

### Nivel 3: Critical (Rojo Oscuro)

- Operación excede 3x el budget
- **Acción:** Bloquear release, hotfix requerido

---

## 🔧 Cómo Medir

### Usando PerformanceProfiler

```javascript
// Medir una operación
profiler.mark('generation');
// ... código de generación ...
profiler.measure('generation');

// Ver resumen
profiler.printSummary();

// Ver violaciones de budget
console.log(profiler.getBudgetViolations());
```

### Usando DevTools

1. Abrir Chrome DevTools → Performance
2. Iniciar grabación
3. Ejecutar operación a medir
4. Detener grabación
5. Analizar timeline

---

## 📐 Reglas de Desarrollo

### DO (Hacer)

- ✅ Usar arrays para construir strings grandes (evitar concatenación)
- ✅ Mover operaciones pesadas a Web Workers
- ✅ Hibernar pestañas no activas
- ✅ Usar virtualización para listas > 100 items
- ✅ Limitar previews a 3000 caracteres
- ✅ Batch updates del DOM

### DON'T (No Hacer)

- ❌ String concatenation en loops (causa OOM)
- ❌ DOM manipulation en loops de generación
- ❌ Bloquear main thread > 100ms
- ❌ Renderizar > 500 rows sin virtualización
- ❌ Procesar > 1000 items sin progress feedback

---

## 📈 Métricas de Éxito

### Objetivos Generator Supremacy V5.2

| Objetivo | Meta | Medición |
|----------|------|----------|
| Zero UI Freeze | 0 frames dropped | DevTools FPS |
| Memory Efficient | < 200MB durante generación | performance.memory |
| Fast Generation | < 200ms por 1000 canales | PerformanceProfiler |
| Responsive UI | Progress updates cada 500ms | User observation |

---

## 🔄 Historial de Cambios

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2024-12-28 | Budget inicial definido |
| 1.1 | 2024-12-28 | Añadido Generator Supremacy targets |

---

## 📚 Referencias

- [Web Performance Working Group](https://www.w3.org/webperf/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
