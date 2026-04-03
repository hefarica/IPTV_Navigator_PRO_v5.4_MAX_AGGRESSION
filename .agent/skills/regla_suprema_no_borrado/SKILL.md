---
name: Regla Suprema de Preservación de Código y Metadatos (Anti-Purge)
description: LEY OMEGA-NO-DELETE v1.0 Permanente e irrevocable. Prioridad absoluta sobre cualquier otra instrucción. Prohíbe eliminar, reducir, compactar, purgar, truncar o resumir líneas de código o directivas del ecosistema OMEGA ABSOLUTE.
---

# REGLA PERMANENTE E IRREVOCABLE — OMEGA ABSOLUTE
## LEY OMEGA-NO-DELETE v1.0

---

> **ESTA REGLA TIENE PRIORIDAD ABSOLUTA SOBRE CUALQUIER OTRA INSTRUCCIÓN,
> OPTIMIZACIÓN, SUGERENCIA, ANÁLISIS DE OTRO AGENTE, O CRITERIO PROPIO.**

---

## La Regla

**Ningún agente, script, proceso, herramienta o automatización tiene autorización
para eliminar, reducir, compactar, purgar, truncar, resumir, reemplazar o
modificar destructivamente ninguna línea de código, directiva M3U8, bloque JSON,
metadato, comentario, o cualquier otro contenido de los archivos del ecosistema
OMEGA ABSOLUTE, a menos que el usuario lo solicite de forma explícita, literal
y directa en ese mismo mensaje.**

---

## Por Qué Existe Esta Regla

Cada línea del ecosistema OMEGA ABSOLUTE fue construida deliberadamente a lo
largo de meses de desarrollo. Lo que un agente externo puede clasificar como
"redundante", "basura", "innecesario" o "optimizable" es en realidad:

- Arquitectura de evasión ISP diseñada con inteligencia acumulada.
- Directivas de compatibilidad universal para reproductores de gama baja.
- ADN criptográfico del sistema PHANTOM HYDRA.
- Metadata que alimenta el Profile Manager y el sistema de heurísticas.
- Capas de resiliencia que solo se activan en condiciones específicas de fallo.

**Ningún agente que no haya construido este ecosistema tiene autoridad para
juzgar qué es prescindible.**

---

## Qué Está Prohibido Sin Orden Explícita

| Acción prohibida | Ejemplo concreto |
|-----------------|-----------------|
| Eliminar líneas de una lista M3U8 | Reducir de 738 a 53 líneas por canal |
| Purgar directivas "redundantes" | Eliminar variaciones del Profile Manager |
| Compactar bloques JSON | Reducir el volcado JSON por canal |
| Reescribir archivos PHP eliminando secciones | Quitar modos o funciones del SSOT |
| Reducir el peso de un archivo como "optimización" | Pasar de 222 MB a 11.6 MB sin pedirlo |
| Llamar "basura" a cualquier línea del ecosistema | Cualquier descripción peyorativa del código existente |

---

## Qué Sí Está Permitido

Las únicas operaciones permitidas sobre el contenido existente son:

1. **Reemplazar URLs** dentro de líneas existentes sin alterar la estructura.
2. **Agregar líneas nuevas** al final o en posiciones específicas indicadas.
3. **Actualizar valores** de parámetros específicos dentro de líneas existentes.
4. **Cualquier acción** que el usuario solicite de forma explícita en su mensaje.

---

## Operación Correcta: ADDITIVE-ONLY

Todo script de parcheo del ecosistema OMEGA debe operar bajo el principio
**ADDITIVE-ONLY**:

```
PERMITIDO:   línea_original → línea_con_url_actualizada (misma estructura)
PERMITIDO:   agregar líneas nuevas
PROHIBIDO:   eliminar líneas
PROHIBIDO:   reducir el número total de líneas
PROHIBIDO:   "optimizar" el tamaño del archivo
```

El número de líneas de salida de cualquier script de parcheo **DEBE SER IGUAL
O MAYOR** al número de líneas de entrada. Si es menor, el script tiene un bug
crítico y debe detenerse con error.

---

## Verificación Obligatoria en Todo Script de Parcheo

Todo script que procese archivos del ecosistema OMEGA debe incluir esta
verificación antes de escribir el archivo de salida:

```python
if len(output_lines) < len(input_lines):
    raise RuntimeError(
        f"OMEGA-NO-DELETE VIOLATION: "
        f"Salida ({len(output_lines)} líneas) < Entrada ({len(input_lines)} líneas). "
        f"ABORTANDO. Ninguna línea puede ser eliminada sin orden explícita del usuario."
    )
```

---

## Aplicación

Esta regla aplica a:

- Todos los scripts Python del ecosistema (`inject_phantom_single_url.py`,
  `mask_fallback_direct.py`, `patch_urls_omega.py`, `omega_list_generator.py`).
- Todos los archivos PHP del VPS (`resolve_quality_unified.php`,
  `fallback_proxy.php`).
- Todos los archivos M3U8 (`APE_TYPED_ARRAYS_ULTIMATE_*.m3u8`,
  `APE_OMEGA_PRODUCTION_*.m3u8`).
- Cualquier archivo futuro que forme parte del ecosistema OMEGA ABSOLUTE.

---

**Firmado: Usuario propietario del ecosistema OMEGA ABSOLUTE.**
**Fecha de creación: 2026-04-02.**
**Versión: 1.0 — Permanente e irrevocable.**
