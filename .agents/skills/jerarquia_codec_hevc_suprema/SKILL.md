---
name: Jerarquía HEVC Level Supremacy (M3U8 Generator)
description: Escalafón estricto que impone HEVC (H.265) como el códec universal de preferencia e inyecta la matriz full-fallback de Levels en todos los generadores.
---

# 🧬 Jerarquía HEVC Level Supremacy (6.1 Cascade)

## 📌 DOCTRINA PRINCIPAL

En todos los generadores del **APE ULTIMATE** y puentes backend proxy (`resolve.php`), está expresamente requerido inyectar **HEVC/H.265** como el rey de los códecs, y evitar encapsulamientos legacy (H.264) a menos que estemos lidiando con fallback de última milla dictados por el hardware.

Adicionalmente, el reproductor multimedia (VLC / ExoPlayer / OTT Navigator / Kodi InputStream) debe ser **forzado** desde las directivas a escanear a nivel interno todas las sub-variantes de calidad si el stream M3U8 fluye pesado o muy rápido, mediante el uso de la cuerda/string de **Escalafón Completo de Niveles (Fallback Array String)**.

## 🛠️ INSTRUCCIONES ESTRICTAS (NO ES OPCIONAL)

1. **Unificación Primaria**: Los Perfiles bajos (P3=FHD, P4=HD_STABLE, P5=SD_FAILSAFE) ya no pueden rebajarse asumiendo mediocridad. **Todos los perfiles de P0 a P5** deben utilizar:
   * `codec_primary: "HEVC"`
   * `codec_fallback: "H264"`
   * `codec_priority: "hevc,h265,h.265,av1,vp9,h264,mpeg2"`

2. **La Cuerda Cascade (Level Escalator)**:
   * Cada configuración local que anteriormente definía algo plano como `hevc_level: '4.1'` o `hevc_level: '5.1'`, ahora **DEBE** sustituirse por el arreglo escalado total:
   * `hevc_level: "6.1,5.1,5.0,4.1,4.0,3.1"`
   * Esto garantiza que los reproductores apliquen un bucle de descompresión flexible al inyectarse como `X-HEVC-Level=6.1,5.1,5.0...` o `#EXT-X-APE-HEVC-LEVEL:6.1,5.1,5.0...`.

3. **Compresión Mínima Indiscutible**:
   * Cualquier factor de compresión paramétrico que alimente algoritmos APE/Kodi (`compress`, `compression_level`) debe mantenerse absolutamente arrastrado al piso (`1`) para favorecer fidelidad visual frente a tamaño. Todo profile (P0 a P5) usa compresión 1.

Cualquier cambio a la lógica de perfiles APE debe ser medido contra esta directriz y nunca revertir a niveles H.264 primarios ciegos.
