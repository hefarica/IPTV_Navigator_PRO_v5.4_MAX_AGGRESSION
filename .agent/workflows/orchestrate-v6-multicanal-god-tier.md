description: "Flujo Maestro de Trabajo para orquestar desarrollos en la arquitectura OMEGA CRYSTAL V6 (900 líneas/canal, 13 capas L0-L13) y el Balanced Scorecard."
---

# Flujo de Orquestación: OMEGA CRYSTAL V6 (900 Líneas, 13 capas L0-L13)

> **Actualizado 2026-04-07**: Migrado de "4 Capas" a "13 capas L0-L13" alineado al OMEGA CRYSTAL V6.

Este documento instruye al agente en el proceso escalonado de despliegue, modificación o auditoría de módulos en el ecosistema APE, garantizando la compatibilidad con la arquitectura de 13 capas y protegiendo la puntuación del Balanced Scorecard.

## PASO 1: Analizar la Modificación bajo las 13 capas (L0-L13)

**Antes de escribir código:** Si debes inyectar una nueva variable, escudo, o instrucción de reproductor:

| ¿Qué necesitas? | Capa Destino | Acción |
|---|---|---|
| Metadata básica (nombre, logo, resolución) | **L0** (EXTINF + STREAM-INF) | Modificar `generateEXTINF()` |
| Forzar comportamiento en VLC/ExoPlayer | **L1** (EXTVLCOPT, 110 líneas) | Agregar en la subsección correcta de L1 |
| Pasar datos al Resolver PHP o al backend | **L2** (EXTHTTP JSON) | Agregar al payload JSON en `build_exthttp()` |
| Forzar comportamiento en Kodi | **L3** (KODIPROP, 65 líneas) | Agregar en la sección correspondiente de L3 |
| Pipeline de transporte/latencia | **L4** (EXT-X-CMAF, 25 líneas) | Modificar bloque CMAF |
| Override visual HDR/DV/LCEVC | **L5** (HDR-DV, 45 líneas) | Agregar en bloque HDR |
| Telemetría QoS/QoE | **L6** (TELCHEMY, 10 líneas) | Agregar métrica QoE |
| Puente bidireccional frontend↔backend | **L7** (EXTATTRFROMURL, 53 líneas) | Agregar atributo de puente |
| Directiva APE custom (core del ecosistema) | **L8** (EXT-X-APE-*, 470 líneas) | Agregar en la sección temática correcta (23 secciones) |
| Evasión ISP / Phantom Hydra | **L9** (PHANTOM-HYDRA, 13 líneas) | Modificar bloque Hydra |
| Resolución de URL final | **L10** (MAP + URL, 2 líneas) | Modificar `buildChannelUrl()` |

> **REGLA CRÍTICA**: Si agregas líneas en una capa, **debes compensar** removiendo del mismo número en otra capa para mantener el total de **796 líneas exactas**. O actualizar las constantes de referencia si la arquitectura lo requiere.

## PASO 2: Respetar la Jerarquía Visual Inviolable (P1-P5)

Si la tarea implica tocar `#EXTVLCOPT:video-filter=` (Capa L1), aplica esta regla:

```
[P1] nlmeans (Denoise) -> [P2] bwdif/yadif (Desentrelazado) -> [P3] gradfun/deband (Anti-Banding) -> [P4] unsharp luma, chroma=0 (Afilado) -> [P5] zscale (Color/HDR)
```
- NUNCA insertes `zscale` al inicio.
- NUNCA insertes `minterpolate` bajo ninguna circunstancia.
- NUNCA asignes valores al `chroma_amount` mayores a `0` en `unsharp`.

## PASO 3: Validación## Reglas Absolutas (Invariantes de OMEGA)
1. **Un generador, todos los arrays**: No importan "clones ligeros" o APIs simples. Si se procesa en el entorno de testing o producción final, TODA generación hereda los parámetros God-Tier de L0 a L10.
2. **Lines/canal (10%)**: Exactamente 900 líneas por canal. Si `_omega_count !== 900`, investigar delta. 
3. **Strict Validation**: Lanza una alerta o previene la visualización en caso de fallo algorítmico, preservando el ecosistema de caídas L7.nonce + quality_levels presentes.
5. **L3 KODIPROP**: 65 directivas, DRM Widevine/FairPlay intactos.
6. **L8 APE**: 470 directivas, 23 secciones.
7. **WAF/URL (12%)**: 0 WAF triggers, URLs limpias.
8. **Multi-Server (10%)**: 0 mezcla de credenciales.
9. **Visual Perfection**: LCEVC Phase 4 y pipeline P1-P5 sin errores.
10. **Polimorfismo + Idempotencia**: `_nonce900` muta, `_sid900` es estable.

## PASO 4: Compromiso y Despliegue

1. Emitir los cambios al archivo `m3u8-typed-arrays-ultimate.js`.
2. Crear/actualizar `walkthrough.md` documentando cómo las modificaciones respetan las 13 capas L0-L13.
3. Si se modifica el backend PHP, verificar que `resolve_quality_unified.php` consume correctamente el `ape_sid` del L10.
4. Ejecutar una generación de prueba y verificar la consola por warnings `[OMEGA-900]`.
