---
name: iptv-realtime-engine-integrator
description: "Integra el APE Realtime Engine v10.0 en el generador M3U8 APE Typed Arrays Ultimate. Produce perfiles P0-P5 con headers CMCD (CTA-5004), QoE (Mux Data), ABR multi-motor (HLS.js, Bitmovin, Shaka, ExoPlayer) y VLC/Kodi opts calibrados. Usar cuando el usuario pida: mejorar perfiles IPTV, integrar parámetros de HLS.js/Bitmovin/Shaka/ExoPlayer al generador, generar headers CMCD o QoE, actualizar network-caching por perfil, o producir un prompt/SOP de integración quirúrgica sin dañar la arquitectura existente."
---

# APE Realtime Engine Integrator

## Contexto del Ecosistema

El generador APE produce **883 líneas por canal** con este orden RFC 8216 **sagrado e inmutable**:
```
#EXTINF → #EXTVLCOPT (132) → #EXTHTTP (1 JSON) → #KODIPROP (73)
→ #EXT-X-CMAF-* → #EXT-X-APE-* → #EXTATTRFROMURL → #EXT-X-VNOVA-*
→ #EXT-X-PHANTOM-* → #EXT-X-MAP → #EXT-X-I-FRAME-STREAM-INF
→ #EXT-X-STREAM-INF + URL  ← SIEMPRE AL FINAL, PEGADOS
```

El Realtime Engine enriquece **únicamente** los bloques `#EXTHTTP` y `#EXTVLCOPT` sin tocar nada más.

## Flujo de Trabajo

### 1. Generar los perfiles JSON actualizados

```bash
python scripts/generate_profiles.py
# Salida: APE_ALL_PROFILES_v10_REALTIME_ENGINE.json (6 perfiles P0-P5)
```

### 2. Inyectar el módulo JS en el generador

Localizar el cierre del IIFE principal del generador y pegar el contenido de `templates/APE_REALTIME_ENGINE_MODULE_v10.js` **justo antes** de esa línea de cierre.

El módulo expone `window.ApeRealtimeEngine` con guard de doble ejecución incorporado.

### 3. Tres puntos de inyección quirúrgica en `generateChannelEntry`

**Punto A — Enriquecer `#EXTHTTP` (antes de `JSON.stringify`):**
```javascript
if (window.ApeRealtimeEngine) {
  window.ApeRealtimeEngine.injectHeaders(httpHeaders, _activeProfileId, channel.stream_id);
}
const extHttpJson = JSON.stringify(httpHeaders); // ← ya existía
```

**Punto B — Enriquecer `#EXTVLCOPT` (al final del bloque EXTVLCOPT):**
```javascript
if (window.ApeRealtimeEngine) {
  window.ApeRealtimeEngine.injectVlcopt(lines, _activeProfileId);
}
// ← aquí empieza el bloque #EXTHTTP (ya existía)
```

**Punto C — Exponer el perfil activo (donde el usuario lo selecciona en la UI):**
```javascript
window.__APE_ACTIVE_PROFILE__ = selectedProfileId; // 'P0' a 'P5'
```

### 4. Verificación post-integración (5 checks)

```bash
grep "CMCD-Object" lista.m3u8       # ✅ headers CMCD presentes
grep "X-QoE-Startup" lista.m3u8    # ✅ headers QoE presentes
grep "X-HLSjs-Config" lista.m3u8   # ✅ config HLS.js presente
grep "network-caching" lista.m3u8  # ✅ P0=90000, P5=10000
grep -n "^#EXT-X-STREAM-INF" lista.m3u8 # ✅ URL en línea siguiente
```

## Perfiles P0-P5 — Referencia Rápida

| Perfil | Resolución | Bitrate | Buffer | LL-HLS | network-caching | Uso |
|---|---|---|---|---|---|---|
| P0 | 7680×4320 | 150Mbps | 60s/120s | ON | 90000ms | 8K Dolby Vision, fibra 1Gbps |
| P1 | 3840×2160 | 80Mbps | 45s/90s | ON | 60000ms | 4K HEVC HDR10+, fibra 500Mbps |
| P2 | 3840×2160 | 40Mbps | 30s/60s | ON | 45000ms | 4K HEVC, cable 200Mbps |
| P3 | 1920×1080 | 20Mbps | 20s/45s | OFF | 30000ms | FHD H.264, cable 50Mbps |
| P4 | 1280×720 | 10Mbps | 15s/30s | OFF | 20000ms | HD H.264, DSL/4G |
| P5 | 854×480 | 5Mbps | 10s/20s | OFF | 10000ms | SD H.264, 3G/conexión débil |

## Garantías del Motor

- **Idempotente**: guard `__APE_REALTIME_ENGINE_v10__` + check de existencia en `injectVlcopt`
- **Polimórfico**: cada perfil produce headers distintos con valores calibrados por fuente
- **No destructivo**: solo `Object.assign()` y `push()`, nunca elimina ni reordena
- **Resiliente**: si el módulo no carga, los `if (window.ApeRealtimeEngine)` fallan silenciosamente

## Recursos Incluidos

- `templates/APE_REALTIME_ENGINE_MODULE_v10.js` — Módulo JS completo con `APE_PROFILE_MATRIX` P0-P5 y API pública
- `scripts/generate_profiles.py` — Regenera los perfiles JSON si se necesita ajustar valores
- `references/prompt_integracion_quirurgica.md` — Prompt con 1% de uniqueness, 5 pasos exactos con código
- `references/sop_integracion.md` — SOP operativo con checklist de verificación

Para integración completa con SOP y prompt, leer `references/prompt_integracion_quirurgica.md`.
