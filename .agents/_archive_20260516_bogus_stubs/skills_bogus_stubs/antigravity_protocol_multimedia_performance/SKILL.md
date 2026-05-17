---
name: Protocolo ANTIGRAVITY - Ingeniería de Rendimiento Multimedia
description: Arquitectura técnica definitiva para optimización sistémica de flujos multimedia. Integra calibración HDR (TCL/Android TV), escalado IA (NVIDIA Shield), inyección de headers "Ultimate" para Throttling Bypass, FFmpeg fMP4 y DRM License Wrapping.
---

# 🌌 PROTOCOLO ANTIGRAVITY: INGENIERÍA DE RENDIMIENTO MULTIMEDIA 🌌

> [!IMPORTANT]
> **ESTADO: PROTOCOLO MAESTRO ACTIVO.**
> Este documento constituye la arquitectura técnica final del Protocolo ANTIGRAVITY. Actúa como marco operativo obligatorio para garantizar la máxima fidelidad cromática, reconstrucción temporal mediante IA y saturación de throughput en entornos críticos (129 Mbps+).

---

## 1. Calibración de Panel HDR y Optimización Visual (Chasis TCL P8M / Android TV)
Una configuración deficiente no solo introduce ruido, sino que desvía la colorimetría degradando la fuente original. Se exige emular un perfil "Color Vívido" en modo Dinámico forzando la expansión del gamut sin "black crush".

* **Brillo:** `90`
* **Contraste:** `100`
* **Saturación de Color:** `65`
* **Nivel de Negro:** `50` (Punto neutro para anclar la curva gamma)
* **Contraste Local / Micro Dimming:** `Alto`
* **Temperatura de Color:** `Cálida` (Preserva el estándar cinematográfico, evitando tonos fríos/azules que desaturan los colores orgánicos).
* **Nitidez (Sharpness):** `80%` (Máximo antes de generar artefactos de halo).
* **Filtros de Ruido:** `DESACTIVADOS` (Preserva texturas biológicas y grano cinematográfico).

---

## 2. Reconstrucción Temporal y Escalado IA (LSFG/DLSS & Shield TV)

* **NVIDIA Shield TV Pro:**
  * Modo: `Inteligencia Mejorada`
  * Nivel de Detalle: `Bajo` (Los niveles Medio/Alto introducen grumos digitales y ghosting en bitrates altos).
* **Lossless Scaling (LSFG):** Usado como bypass técnico para superar límites de FPS fijos (ej. 24/30 FPS), con escalado `BCAS` y factor de nitidez de `6-8`.
* **Jerarquía de Upscalers 2026:**
  1. `DLSS 4.5` (Preset L)
  2. `DLSS 4` (Preset J - Mitigación agresiva de ghosting)
  3. `XeSS 2` (XMX)
  4. `FSR 4`

---

## 3. INGENIERÍA DE BITRATE: COMMANDOS L7 PARA SÍNDROME CDN THROTTLING
Para dominar perfiles HLS/DASH 4K HDR P1 (129 Mbps+), se inyectan estos 10 Headers "Ultimate" mediante formato JSON dentro del EXTHTTP del playlist maestro, asfixiando las rutinas ABR (Adaptive Bitrate) del servidor de origen o CDN:

| Header | Valor | Impacto Arquitectónico |
| :--- | :--- | :--- |
| `X-Max-Bitrate` | `300000000` | Techo técnico de 300 Mbps para perfiles UHD. |
| `X-Initial-Bitrate`| `300000000` | Arranca la sesión forzando el pico de ancho de banda. |
| `X-Min-Bitrate` | `80000000` | Piso de 80 Mbps; extermina variantes SD. |
| `User-Agent` | `SHIELD TV Pro` | Ingeniería social contra CDN. Asume SoC de alto rendimiento. |
| `X-DSCP-Override` | `63` | QoS Routing Mode EF (Expedited Forwarding). Prioridad absoluta en ISP. |
| `X-Bypass-ABR` | `true` | Corta la lógica de downgrading en servidores Flussonic compatibles. |
| `X-Network-Caching`| `80000` | Buffer colosal en RAM para mitigar fallos transitorios. |
| `X-BW-Smooth-Factor`| `0.01` | Resistencia extrema al salto de perfil hacia abajo. |
| `X-Color-Space` | `BT2020` | Demanda soporte HDR, excluyendo cadenas SDR. |
| `X-Quality-Lock` | `NATIVA_MAXIMA`| Mantiene el codec principal amarrado al PES nativo. |

---

## 4. TRANSPORTE, FMP4 & PROTOCOLOS DE ACONDICIONAMIENTO

### Generación de Chunks y Muxing (FFmpeg)
* **Flags Requeridos:** `-movflags frag_keyframe+empty_moov`. Fragmentación desde el byte `0`, vital para Android TV.
* **GOP y Alineamiento:** `-g 52`. Mantener consistencia milimétrica entre Keyframes de Video y audio AAC/Dolby.
* **Byte Range Indexing (CMAF):** La convergencia a fMP4 minimiza latencia I/O al referenciar partes de un archivo usando offset de bytes en el Manifiesto DASH/CMAF, aboliendo millones de micro-archivos `.ts`.

### Post-Procesamiento (Capa Física y VLC)
* **VLC Strict:** Modo de desentrelazado `YADIF` para anular vibración de campo ("field jitter") y descartar filtros espaciales deficientes.
* **HDMI 2.1 (Hardware Sink):** Activación mandataria de `VRR` (elimina tearing) y `ALLM` (Modo Juego de baja latencia).

### Wrapping de Licencias (Shaka Player / EME Anti-Error)
* Para sortear las restricciones del API EME en la transmisión de metadatos custom:
  * El proxy intercepta y empaqueta metadatos y DRM payload mediante `License Wrapping` en JSON.
  * El filtro en el frontend cliente captura el Response, ejecuta un "Unwrapping" JSON y alimenta el CDM nativo de Widevine/Fairplay puramente con datos crudos.
  * *Prevención Quirúrgica:* Erradica definitivamente el **Error 6008** (CDM Rejecting JSON) y diagnostica el **Error 6007** (Network fetch failure).
