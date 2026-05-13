---
name: Skill_Stream_Consistency_Scorer
description: Evaluador de fluctuaciones de framerate/bitrate perjudiciales al ojo.
category: Metadata Analysis
---
# 1. Teoría de Compresión y Anomalía
A veces el proveedor no usa CFR (Constant Frame Rate). Aunque inyectemos corrección en nuestro lado, si el orígen baja repentinamente de 60fps a 24fps porque su encoder se sobrecalentó, el ojo del humano (que estaba acostumbrado a la fluidez deportiva) percibe un mareo horrible (Pacing Glitch).

# 2. Directiva de Ejecución (Código / Inyección)
Usar el módulo de auditoria o un script L2 para extraer la desviación estándar de la métrica de bits a lo largo de 10 segundos de la fuente M3U8 original.

```javascript
// Evaluación L3 (Cortex Generator):
if (stream.fluctuationIndex > 0.15) { // 15% de asimetría detectada
    // Penalización. Este stream es basura para Deportes Vivos.
    demoteToP3(stream); 
}
```

# 3. Flanco de Orquestación
(Inteligencia Suprema). Si un canal de NBC Sports 4K empieza a portarse errático y bajar sus framerates, el Scorer lo penaliza en el ecosistema, ocultándolo o redirigiendo al usuario a un espejo (Mirror) 1080p nativo europeo a 50fps de roca sólida. "Es mejor FHD impecable fluido, que Falso F4K tropezando cada 3 segundos".
