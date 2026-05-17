---
name: Skill_Telecine_Inverse_Sports_Bypass
description: Bypass estricto o evasión del Telecine (IVTC) destructivo sobre señales progresivas de 60fps (Aplastador del live football feed).
category: FFmpeg V-Filter
---
# 1. Teoría de Compresión y Anomalía
El Inverse Telecine (IVTC) o "pullup" fue diseñado para convertir películas de 24fps grabadas sobre transmisiones 60i norteamericanas en un progresivo de 24fps perfecto. Pero los deportes son capturados con sensores nativos de 50i o 60i progresados. Si un filtro o un codificador despistado o barato del lado del origen activa telecine sobre un feed de deportes `pullup=dp=1`, despedaza el fluido continuo de 60fps, y lo mutila dejándolo en 24fps. Ver jugadores saltando es como ver un cómic a tropezones.

# 2. Directiva de Ejecución (Código / Inyección)
Nos aseguramos de limpiar explícitamente cualquier flag intrusa, inyectando un muro algorítmico progresivo: si sospechas, asimila a 60fps o bwdif, nunca IVTC (Telecine).

```bash
# Obligar el Rechazo Estricto de Telecine a 60fps (O mitigarlo si un origen americano nos fuerza telecine fallido de 30 a 60):
-vf "fieldmatch=mode=pcn_ub:cthresh=11,bwdif=mode=send_field:deint=all"
# O evadir pullup asegurando:
-field_order progressive
```

# 3. Flanco de Orquestación
Con esta directiva blindamos las listas deportivas M3U8 para que ExoPlayer entienda sin dudas: "Este es un feed a la gloria de la velocidad. No hay marcos cineastas de 24fps escondidos aquí". El hardware activa VRR (Skill 67), CFR asíncrono puro (Skill 64), usa HDR de 5000 Nits forzados y desentrelaza a precisión cuántica de un milisegundo. Esta habilidad 70 consolida temporalmente todos los esfuerzos para el mejor feed de deportes en la historia de la IP.
