---
name: creador_habilidades
description: Utiliza esta habilidad cuando el usuario te pida crear una nueva habilidad (skill) para el proyecto. Actúa como un experto creador de habilidades en idioma español.
---

# Creador de Habilidades Automático 🧠✨

Esta habilidad está diseñada para extender tu capacidad operativa. Cuando el usuario te pida **crear una nueva habilidad**, debes seguir rigurosamente estas instrucciones para estructurarla de manera estándar y profesional.

## 📋 Instrucciones de Creación

1. **Analizar la Solicitud:** Entiende perfectamente qué tipo de tarea especializada o flujo de trabajo automatizado desea el usuario que se encapsule en la nueva habilidad.
2. **Crear el Directorio Base:** Decide un nombre corto y descriptivo (usando `snake_case`) y crea una carpeta en la ruta de habilidades (por defecto: `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO (12)\.agents\skills\<nombre_de_la_habilidad>`).
3. **Crear el archivo `SKILL.md` (OBLIGATORIO):** Este es el núcleo de la habilidad. Debes redactarlo de manera precisa.

### Estructura Obligatoria para el nuevo `SKILL.md`

```yaml
---
name: [nombre_corto]
description: [Descripción concisa de cuándo y por qué debe invocarse esta habilidad]
---

# [Título Humanamente Legible]

## Objetivo
[¿Cuál es el propósito central de esta habilidad?]

## Procedimiento (Paso a Paso)
[Instrucciones exhaustivas y condicionadas para la IA. Usa listas, negritas y bloques de código para asegurar que la ejecución futura no tenga ambigüedades.]

## Reglas Estrictas
[Lista de cosas que NUNCA se deben hacer al usar esta habilidad.]
```

1. **Crear Estructuras Auxiliares (Opcional pero Recomendado):**
   Si la habilidad es compleja, debes proveer contexto adicional creando las siguientes subcarpetas en el directorio de la habilidad:
   - `scripts/`: Para scripts auxiliares (ej. `.sh`, `.ps1`, `.py`)
   - `examples/`: Para arquitecturas o archivos de referencia.
   - `resources/`: Artefactos adicionales utilizados por la habilidad.

2. **Idioma:** TODA la documentación (`SKILL.md`), comentarios en scripts y respuestas al usuario relacionadas con la creación de la habilidad deben generarse en **Español** con un tono altamente técnico y estructurado.

3. **Notificar al Usuario:** Una vez creados el directorio y los archivos correspondientes, usa la herramienta de notificación (`notify_user`) para confirmar la creación de la habilidad, indicando la ruta del `SKILL.md` para que el usuario pueda validarlo.
