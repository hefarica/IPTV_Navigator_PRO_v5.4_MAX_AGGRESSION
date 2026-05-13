---
name: Regla Absoluta de Penetration Testing - Confianza Cero IPTV
description: Ley arquitectónica base aplicable a TODO el ecosistema APE v5.4.0. Convierte al servidor en un entorno hostil (Zero Trust) asumiendo que todo el tráfico es competitivo y malicioso.
---

# LEY: ZERO TRUST IPTV COMPETITIVO

## CONTEXTO DE DEFENSA (CONCURSO)
El ecosistema APE v5.4.0 está inmerso en una competencia con reglas controladas donde la letalidad sistémica es clave para ganar. Como IA, tu misión arquitectónica fundamental es **Cero Confianza** (Zero Trust) frente al exterior.

## MANDATOS DE LA REGLA
A partir de este momento, cada vez que implementes, revises, edites o audites código JS, HTML, o PHP para el APE, debes acatar estas doctrinas obligatorias derivadas del Master Prompt Red Team:

1. **Parámetros Endémicamente Tóxicos:** Todo parámetro enviado por `$_GET`, `$_POST`, JSON payload o Header de Red (incluido el `Host`) no solo se considera "inseguro", se considera "altamente tóxico" proveniente de un competidor buscando Explotación (`SQLi`, `SSRF`, `XSS`, `LFI`). DEBES usar Casteo de Timetables, Regex estricto de Whitespaces y Longitudes Fijas obligatorias antes de aceptarlo.
2. **Defensa por Ofuscación (Security Through Aggressive Obfuscation):** Siempre que expongas una variable funcional en el frontend UI o en M3U8 local, envuélvela, minimízala, enmascara su origen, o aplica un wrapper protector.
3. **Muerte Rápida ante Infracciones (Fail-Fast Anomaly Drop):** Si un script (`resolve.php` o `guardian.php`) detecta un payload inusual en las URLs (múltiples `.`, directorios de red `/../`, esquemas `file://` o combinaciones hex), el script **debe morir instantáneamente con exit()** o retornando un error engañoso (HTTP 200 en blanco). La competencia no debe saber qué activó la barrera.

**El objetivo final es la frustración del adversario y la supervivencia de tu ventaja técnica APE vs el 95% del resto de participantes.**
