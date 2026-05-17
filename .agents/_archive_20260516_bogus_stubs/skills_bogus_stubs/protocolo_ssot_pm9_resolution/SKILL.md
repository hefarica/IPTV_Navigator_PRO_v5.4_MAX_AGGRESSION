---
description: Protocolo SSOT pm9_resolution: Regla Inmutable de Anti-Downgrade desde UI hasta Backend
---

# 🛑 PROTOCOLO SSOT pm9_resolution (Regla Anti-Downgrade Absoluta)

## 📌 1. Doctrina de la "Primera y Única Verdad" (SSOT)

La interfaz de usuario despliega un control selector fundamental para la máxima calidad del ecosistema: el elemento `<select id="pm9_resolution">`.
Esta habilidad técnica decreta que el valor depositado en este campo (`3840x2160`, `1920x1080`, etc.) es la única fuente de verdad o **Single Source of Truth (SSOT)** respecto a la resolución elegida para cada perfil (P0-P5).

**Regla de Oro:** **Jamás, bajo ninguna circunstancia (ni en código de mapas `channels_map.json`, ni en el backend `resolve.php`, ni por sondas micro-probing), se debe efectuar un `Downgrade` (bajada de calidad) sobre el valor de resolución dictaminado por `pm9_resolution`.**

## ⚙️ 2. Reglas de Inyección en Generadores JS (El Puente Fuerte)

Los 3 motores principales del frontend deben asegurar que el valor `cfg.resolution` (heredado directamente de `pm9_resolution`) viaja a través del puente de manera asertiva, para evitar que el backend recurra a diccionarios hardcodeados que comprometan la calidad máxima:

```javascript
// La directiva resolutoria (El parámetro &res= es OBLIGATORIO)
const resParam = encodeURIComponent(cfg.resolution || '');
lines.push(`#EXTATTRFROMURL:${resolverBase}/resolve.php?...&p=${profileToPass}&res=${resParam}...`);
```

## 🛡️ 3. Reglas de Contención en el Executor VPS (`resolve.php`)

Cuando la solicitud llega al VPS en el archivo `resolve.php`, este debe recibir y respetar la resolución que envía el generador, colocándola como el tope mínimo del perfil, sin opción a un descenso:

1. **Recepción del Backend:**

   ```php
   $teleRes = q('res', '');
   if ($teleRes !== '') {
       $cfg['res'] = $teleRes; // Override absoluto a la configuración nativa de backend.
   }
   ```

2. **Prohibición de Downgrade por Micro-Probing:**
   Si la función `probeOriginResolution()` detecta que el origin *Xtream Codes* ofrece una resolución (ej: `1080p`), pero `$cfg['res']` recibida del JS exigía `4K` (3840x2160), la plataforma **no bajará a 1080p**. El Probe **solo actuará si puede mejorar** (Upgrade) la resolución, nunca si implica reducirla.

## 🚀 4. Impactos Finales en la Arquitectura

- **Resolución Determinista**: Lo que el usuario de IPTV Navigator PRO decide en la pestaña de `pm9_resolution` es exactamente lo que el reproductor (Ott Navigator / TiviMate) verá en la cabecera `#EXT-X-APE-RESOLUTION` y tratará de forzar contra el origen.
- **Armonía Completa**: Este protocolo asegura una total homogeneidad con las directivas de Latencia Rayo, Calidad Netflix Max y Jerarquía BWDIF.
