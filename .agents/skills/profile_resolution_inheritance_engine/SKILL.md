---
name: Profile Resolution Inheritance Engine (Omega Absolute)
description: Regla ABSOLUTA - Emparejamiento empírico y hereditario de resoluciones entre perfiles dinámicos y canales M3U8 durante la generación de listas.
---

# 🧬 Profile Resolution Inheritance Engine (OMEGA ABSOLUTE)

## 📌 Contexto
La arquitectura **OMEGA ABSOLUTE** ha suplantado la dependencia rígida de los literales "P0", "P1", "P2" por una **Jerarquía de Degradación Dinámica** basada estricta y matemáticamente en el volumen total de los píxeles declarados dentro de la configuración interior del perfil (e.g., `3840x2160`).

Por ende, el proceso de generación de listas M3U8 está obligado a emparejar iterativamente cada canal no con un "Alias de Perfil", sino con **los metadatos exactos de la resolución extraídos del motor dinámico**.

---

## ⚖️ Regla Maestra de Herencia en Tiempo de Generación

**CADA VEZ QUE SE ARME UNA LISTA M3U8 O UN RESOLVER, SE DEBE OBLIGATORIAMENTE HACER MATCH PARA EMPAREJAR ESTOS PERFILES CON EL DE LOS CANALES, DE MODO QUE CALCEN CON SU HERENCIA MATEMÁTICA EN EL MOMENTO DE LA INYECCIÓN.**

Cualquier generador que asigne "P0" a un canal simplemente asumiendo que "P0 es 4K" sin corroborar el volumen en la función `config.getDegradationHierarchy()` cometerá una violación de la pureza estructural.

---

## ⚙️ Protocolo de Implementación Obligatoria (El Match)

1. **Obtención Jerárquica:** El generador (Ej. `ui-connector-v9-custom.js` o `m3u8-typed-arrays-ultimate.js`) **DEBE** invocar a `getDegradationHierarchy()` para obtener el array dinámico.
2. **Emparejamiento / Herencia (Matching):**
   - El canal evaluado (Ej. `Canal XYZ [4K]`) debe someterse a evaluación de patrones (`RegExp`).
   - Una vez la identidad base del canal se confirma, este *heredará* los parámetros (LCEVC, Codec de Audio, Header Values) que el array jerárquico tenga mapeado de mayor a menor.
   - El primer perfil del array jerárquico que satisfaga la necesidad calzará su herencia sobre la variante top (`Top Tier Variant`) del canal en el `master.m3u8`.
3. **Escalera de Degradación:** Los subsecuentes elementos del array `getDegradationHierarchy()` proporcionarán las calidades para las capas inferiores (Fallback Chain) del canal de acuerdo a la matemática, **sin importar cómo fue nombrado cada perfil**.

## 🛡️ Anti-Corrupción
> [!WARNING]
> Nunca utilizar constructos fijos del estilo `const topProfile = profiles['P0'];` en generadores de producción. El `P0` ahora podría tener calidad `SD 854x480` dictado por el administrador. Todas las asignaciones dependen de cruzar el volumen matemático o extraer el Top [0] del array descendente de la jerarquía.
