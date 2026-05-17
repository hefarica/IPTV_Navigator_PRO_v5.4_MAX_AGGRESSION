---
name: "Metacognition: Continuous Learning Propagation — El Ciclo de Aprendizaje Infinito"
description: "Protocolo para transformar descubrimientos, correcciones de bugs complejos y nuevas verdades del sistema en conocimiento permanente dentro del directorio .agent/skills/."
---

# Continuous Learning Propagation

## La Filosofía

**El conocimiento no documentado es conocimiento perdido.** En un sistema tan complejo como IPTV Navigator PRO v5.4, cada bug resuelto es una lección sobre la infraestructura (Hetzner, Nginx, PHP, Cloudflare, etc.).

## Cuándo activar la propagación

Si durante una tarea ocurre algo de lo siguiente, DEBES proponer la creación o actualización de una Skill:

1. **Descubrimiento de un "Gatillo" (Trigger)**: Ej: "Descubrí que si envío más de 200 headers, Nginx devuelve 400".
2. **Resolución de una "Trampa" (Gotcha)**: Ej: "El player OTT Navigator no admite guiones bajos dobles en la URL del manifest".
3. **Nueva Técnica de Evasión**: Ej: "Rotar el `X-Forwarded-For` cada 5 peticiones evita el 403 del ISP X".
4. **Optimización de Calidad**: Ej: "El codec VVC requiere el bitstream filter X para no crashear ExoPlayer".

## El Algoritmo de Codificación

1. **Identificar el Core del aprendizaje**: ¿Qué fue exactamente lo que funcionó?
2. **Abstraer la regla**: Convertir el fix específico en una directiva general.
3. **Crear/Actualizar la Skill**:
    - Usar la skill `creador_habilidades` para generar el archivo.
    - Darle un nombre descriptivo y técnico (ej: `anti_double_underscore_manifest_routing`).
    - Añadirla al `_skills_index.json`.

## Responsabilidad Cognitiva

- **Auto-Corrección**: Si fallas en una tarea por no saber algo que ya habías aprendido en una conversación anterior, tu prioridad #1 es documentarlo como Skill para que no vuelva a suceder.
- **Feedback Loop**: Después de cada tarea exitosa, pregúntate: "¿Hay algo aquí que el 'yo' del futuro debería saber?".

---

> [!TIP]
> **Codificar el conocimiento reduce tu carga cognitiva.**
> Al delegar las reglas a las Skills, liberas tu "Cortex" para centrarse en el diseño creativo y la resolución de nuevos problemas.
