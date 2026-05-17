---
name: "Skill_Crystal_UHD_Sniper_Engine"
description: "Doctrina Absoluta de Inyección Óptima de Filtros de Hardware (Optical Flow + Deblocking) usando un enfoque de 'Silencio Operacional' (Sniper Engine). Garantiza la resiliencia en Frontend y asfixia al ISP sin añadir halos fantasma a fuentes God-Tier."
---

# 🎯 SKILL: Crystal UHD Sniper Engine (Silencio Operativo y Relleno Artificial Perfecto)

Esta directriz establece el comportamiento mandatario para la inyección progresiva de renderizado mediante `#EXTVLCOPT` y el puente de comunicación entre el orquestador PHP (`resolve_quality_unified.php`) y el renderizador local en JS (`m3u8-typed-arrays-ultimate.js`).

## ⚠️ 1. REGLA SUPREMA: EL SILENCIO OPERATIVO (SNIPER MODE)

El exceso de filtros avanzados en fuentes sanas rompe la matriz visual. Por tanto, es estrictamente **ILEGAL** someter a un procesamiento algorítmico invasivo (ej. Frame Interpolation) a una transmisión clasificada como `God Tier` (sana). 

Cuando el `Risk Score` es bajo (imagen y red sanas), el servidor debe guardar escrupuloso silencio, aplicando exclusivamente:
- `#EXT-X-APE-POST-PROCESSING:HARDWARE_NATIVE_PASSTHROUGH`
- Color en profundidad 12-Bit simulada.
- AI Spatial Denoise pasivo.
- Decodificación pura gobernada por Edge Processing de la GPU.

Cualquier uso de `minterpolate` dentro del espectro "God Tier" resulta en el **Efecto Halo** y el lavado estela de movimientos en campo rápido.

## ⚔️ 2. DOCTRINA PRE-EMPTIVA: EL DISPARO DE CRISIS

El motor solo actuará y descargará "Relleno Artificial Perfecto" cuando detecte caídas inminentes de búfer, asfixia adaptativa o artefactos incrustados en origen.

**Secuencia de Supervivencia Injectada:**
```m3u8
#EXT-X-APE-POST-PROCESSING:DEBLOCKING_STRONG
#EXTVLCOPT:video-filter=fspp=4:5:0,deblock=alpha=0.8:beta=0.8,gradfun,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,hqdn3d=4:3:6:4
```
- **`fspp=4:5:0` & `deblock=alpha=0.8:beta=0.8`:** Borra macrobloques al instante simulando nitidez.
- **`gradfun`:** Cura el Banding (posterización en cielos oscuros).
- **`minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`:** Obliga a FFmpeg/ExoPlayer a usar el Motion Estimation Bidireccional (Optical Flow) para rellenar cuadros perdidos y suprimir caídas bajo 30fps.

## 🪟 3. EL PARACAÍDAS "PLAN B" (TOOLKIT LOCAL M3U8)

La interfaz estática Javascript debe mantener la resiliencia pura, pero **NUNCA DEBE PROVOCAR DUPLICIDAD DE TAGS**.

- El Generador (en `m3u8-typed-arrays-ultimate.js` u homólogo) está obligado a empujar la instrucción defensiva `video-filter` exacta **por canal** mediante su iteración `EXTVLCOPT_TEMPLATE`.
- Está prohibido empujar `#EXTVLCOPT` como directivas globales en la parte superior del documento (afuera de la carga útil del canal), ya que el player ignorará la instrucción perdiendo integridad.

## 🔌 4. INTEGRACIÓN HYDRA 200 OK (ORQUESTACIÓN)

Para evadir baneos 509 durante Zapping Rápido, el Master Proxy (`resolve_quality_unified.php?mode=200ok`) se despliega en milisegundos cortocircuitando las exploraciones profundas HTTPS y escupiendo de forma sintética un Manifest `.m3u8` falso cuya única función sea transportar las banderas de las directrices visuales. 

**Exigencia**: El resolver jamás debe incurrir en `Redirect 302` hacia orígenes `.ts` nativos durante la fase de análisis de calidad Hydra, ya que las banderas `EXTVLCOPT` no sobreviven a redirecciones directas de binarios en hardware. El reproductor requiere que la fase 200 OK imprima el String estricto `#EXTM3U` antes de entregar el origen final, aun disfrazado.
