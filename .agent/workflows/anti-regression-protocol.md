---
description: Protocolo Estricto Anti-Amnesia (Anti-Regression) para Modificaciones JS
---

# 🛡️ Protocolo de Protección Anti-Amnesia (Anti-Regression Protocol)

**NIVEL DE SEVERIDAD:** NUCLEAR (No Negociable)
**PROPÓSITO:** Prevenir la pérdida ("Amnesia") de directivas HLS o APE previas durante procesos complejos de refactorización o inyección de nuevas lógicas.

## 🔴 Regla Base de la "Filosofía de Arrays"
Cada nueva lógica que modifique la salida (output) del archivo M3U8 en `m3u8-typed-arrays-ultimate.js` **DEBE:**
1. Crear una función modular `build_[nombre_logica](cfg, profile)`.
2. Esta función debe instanciar un `const arr = [];` y hacer `push()` de TODAS las directivas relevantes como Strings.
3. Esta función debe devolver el array `return arr;`.
4. El array debe insertarse en el hilo principal (`generateChannelString`) usando el spread operator: `lines.push(...build_[nombre_logica](...));`.

## 🟡 Prohibición de Hardcodeo o Reemplazo
- **NUNCA** utilices el método `replace_file_content` para eliminar o sobrescribir un boque masivo de variables, a menos que tu intención certificada y validada sea deprecarlas.
- En caso de duda sobre una etiqueta, **PRESERVA**. Es preferible inyectar un tag sin uso o "redundante" antes que causar un Black Screen o fallos de HW Decoding porque la directiva se extravió en el Diff.

## 🟩 Obligación Pre-Ejecutiva
Antes de aplicar *Replace File Content* en JavaScript (específicamente la inyección de directivas M3U8), debes **leer con view_file** un mínimo de 15 líneas hacia arriba y 15 hacia abajo del punto de inserción para garantizar que no estás pisando una directiva como `EXT-X-STREAM-INF` o el EPG Global.

***Este documento actúa como un Guardrail del Ecosistema 2026. Viola este protocolo e introducirás deuda técnica destructiva.***
