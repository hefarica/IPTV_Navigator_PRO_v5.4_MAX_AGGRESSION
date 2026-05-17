---
name: iptv-generador-fusion-v21
description: Diagnostica bugs en generadores M3U8 JS, fusiona capas calibradas con 796 líneas OMEGA y orquesta la inyección desde arrays de origen. Úsala cuando el usuario pida arreglar el botón de generar listas, integrar 700+ líneas por canal, o cablear el generador desde arrays (UA, CDN, Profiles).
---

# Fusión V21: OMEGA CRYSTAL + 139 Líneas Calibradas

Esta habilidad automatiza el proceso de auditoría y fusión quirúrgica de un generador M3U8 JS, resolviendo bugs fatales y aplicando la arquitectura OMEGA CRYSTAL V5 completa (L0-L10).

## 1. Diagnóstico de Bugs Fatales

Antes de fusionar, el generador JS suele presentar problemas estructurales que impiden que el botón "Generar" funcione. El script de fusión corrige los 3 bugs fatales más comunes:

1. **Bug del Botón (Crash silencioso)**: `APEAtomicStealthEngine` no está definido en el scope global. Se inyecta un guard defensivo y un stub de emergencia.
2. **Córtex Obsoleto**: Referencias a `IPTV_SUPPORT_CORTEX_V3` impiden el arranque del motor de telemetría. Se actualiza a `IPTV_SUPPORT_CORTEX_V_OMEGA`.
3. **Pérdida de Autenticación**: `CLEAN_URL_MODE = true` elimina el JWT, SID y NONCE de la URL final. Se fuerza a `false`.

## 2. Fusión Quirúrgica: 887 Líneas por Canal

El núcleo de esta habilidad es el script `fusion_v21.py` que reemplaza la función `generateChannelEntry()` con una versión que orquesta las líneas calibradas del usuario junto con las 796 líneas OMEGA.

### Flujo de Trabajo

1. **Mapeo de Arrays**: El script asume que las variables del scope global del archivo original (`UAPhantomEngine`, `CDN_IP_RANGES`, `PROFILES`, `CAPACITY_OVERDRIVE`, `generateJWT68Fields`) están disponibles.
2. **Ejecución de la Fusión**: Ejecuta el script de fusión sobre el archivo JS objetivo:
   ```bash
   python /home/ubuntu/skills/iptv-generador-fusion-v21/scripts/fusion_v21.py /ruta/al/archivo.js
   ```
3. **Verificación**: Asegúrate de que el archivo resultante (`_V21_FUSION.js`) tenga ~7,600 líneas totales y que `linesPerChannel` esté seteado en 921.

## 3. Orquestación de Capas (L0-L10)

El `generateChannelEntry` fusionado inyecta las siguientes capas, cableadas dinámicamente desde los arrays de origen:

- **L0**: `#EXTINF` + `#EXT-X-STREAM-INF` (1 sola variante + 1 URL). FIX 2026-04-17: Múltiples variantes ABR con URLs separadas causaban HTTP 509 (proveedor bloqueaba conexiones excesivas). Failover via querystring, no URLs múltiples.
- **L1**: `#EXTVLCOPT` (VLC/ExoPlayer enslavement).
- **L2**: `#EXTHTTP` (JSON con 100 headers anabólicos).
- **L3**: `#KODIPROP` (Kodi InputStream Adaptive).
- **L4**: `#EXT-X-CMAF` (Pipeline fMP4 de baja latencia).
- **L5**: `#EXT-X-APE-HDR-DV` (Override HDR10+/Dolby Vision).
- **L6**: `#EXT-X-APE-TELCHEMY` (Telemetría simulada).
- **L7**: `#EXTATTRFROMURL` (Puente L2-L7).
- **L8**: `#EXT-X-APE-*` (Núcleo Crystal: Buffer Nuclear, Capacity Overdrive, TLS Coherence).
- **L9**: `#EXT-X-PHANTOM-HYDRA` (Evasión Swarm: UA rotation, DoH, SNI).
- **L10**: `#EXT-X-MEDIA` (metadata sin URI=) + `#EXT-X-I-FRAME-STREAM-INF` (metadata sin URI=) + `#EXT-X-STREAM-INF` + URL final única polimórfica (con SID y NONCE). REGLA: NUNCA poner URI= en EXT-X-MEDIA ni I-FRAME-STREAM-INF dentro del catálogo M3U8.

## 4. Entrega

Una vez generado y verificado el archivo `_V21_FUSION.js`, empaquétalo en un `.zip` y entrégalo al usuario con un resumen de los bugs corregidos y el conteo exacto de líneas por canal.
