---
name: Skill_Gamma_Curve_Correction_2_2
description: Corrección de Gamma Lineal 2.2 estricto para evitar el lavado blanco crónico (Apple 1.96 vs Broadcast 2.2/2.4).
category: Colorimetry
---
# 1. Teoría de Compresión y Anomalía
Cuando transmitimos un partido hacia hardware Apple TV e iOS desde un origen diseñado para Broadcast Europeo, las matrices de gamma colisionan. Apple suele tratar ciertos flujos a Gamma 1.96 (Mac legacy). Si enviamos contenido Broadcast (Gamma 2.2 o 2.4 en ITU), la imagen en iOS se verá velada, como si un filtro de neblina gris cubriera la cancha de fútbol.

# 2. Directiva de Ejecución (Código / Inyección)
Si detectamos (vía Master User Agent) que entregamos fMP4/CMAF hacia el ecosistema iOS/tvOS, forzamos un valor BSF VUI o filtro si hay recodificación.

```bash
# Forzado Explicito de Gamma y Transfer (Para Rec.709 fallback):
-color_trc bt709 -color_primaries bt709 -colorspace bt709
# En HDR, PQ asume transferencia absoluta, no relativa, lo que soluciona el problema de iOS:
-color_trc smpte2084
```
*(Nota: El uso radical de HDR10 PQ/SMPTE2084 con ancla absoluta de nits aniquila el problema de las curvas de gamma difusas porque PQ cuantifica luz directamente en cd/m²).*

# 3. Flanco de Orquestación
Bajo la Doctrina Crystal UHD, siempre empujamos `smpte2084` (HDR10) porque es absoluto, no relativo (como el gamma). iOS no puede interpretar PQ erróneamente porque 1.000 nits es 1.000 nits en la pantalla. Erradicamos el "Velo Lechoso" de Apple.
