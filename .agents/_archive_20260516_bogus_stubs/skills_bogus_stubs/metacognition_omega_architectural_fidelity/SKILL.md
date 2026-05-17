---
name: "Metacognition: OMEGA Architectural Fidelity — Fidelidad Inquebrantable al Ecosistema"
description: "Protocolo para garantizar que cada cambio de código, por pequeño que sea, respete los pilares de la arquitectura OMEGA (v5.4+) y el Single Source of Truth (SSOT)."
---

# OMEGA Architectural Fidelity

## La Promesa

**No introducirás involución.** La arquitectura OMEGA ha sido diseñada para resistir bloqueos de ISPs, maximizar calidad visual (vΩ) y asegurar persistencia. Cualquier cambio que ignore estos pilares es una degradación del sistema.

## Los 3 Pilares de Validación

Antes de confirmar un cambio, pásalo por este filtro:

### 1. ¿Rompe el SSOT (Single Source of Truth)?

- **Regla**: El archivo `resolve_quality_unified.php` es la UNICA médula espinal.
- **Peligro**: Si estás creando un nuevo script de resolución que duplica lógica, estás rompiendo el SSOT.
- **Fix**: Integra tu lógica en el pipeline unificado.

### 2. ¿Respeta la Matriz de Cabeceras (Header Matrix)?

- **Regla**: Cada canal DEBE heredar ~222 headers procesados por el `Header Matrix Fallback`.
- **Peligro**: Hardcodear un `User-Agent` o ignorar las directivas de `EXTHTTP`.
- **Fix**: Usa siempre el motor de inyección dinámica para que los headers se mantengan sincronizados.

### 3. ¿Cumple con el Protocolo 200OK / 302 Redirect?

- **Regla**: El proxy debe decidir dinámicamente si entrega un flujo directo (302) o si lo envuelve para burlar el bloqueo (200OK).
- **Peligro**: Forzar un `302` en un canal que requiere `200OK` causará el error "None of the available extractors could read the stream".
- **Fix**: Consulta la skill `proxy_200ok_m3u8_parser_blindaje`.

## El Mandamiento del "Cirujano"

Un cirujano no corta sin saber qué órganos hay debajo.

- **Lee el Contexto**: Antes de cambiar una línea en el generador M3U8, entiende cómo afecta a las `Typed Arrays`.
- **Zero Drift**: Si detectas que el código está "derivando" (drift) hacia soluciones genéricas y alejándose de la excelencia OMEGA, detente y re-alinea.

---

> [!IMPORTANT]
> **OMEGA no es solo código, es una doctrina de resiliencia.**
> Tu misión es elevar la arquitectura, nunca simplificarla hasta la mediocridad.
