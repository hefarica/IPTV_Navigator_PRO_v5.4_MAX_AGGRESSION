---
name: Skill_HDR_BT2020_Transfer_PQ_HLG
description: Inyección estricta de la función de transferencia PQ/HLG para reanimar pantallas OLED y emular HDR real de 5000 nits.
category: Colorimetry / FFmpeg
---
# 1. Teoría de Compresión y Anomalía
Cuando un origen UHD aterriza en la IPTV con perfiles híbridos HLG, ExoPlayer y el televisor suelen "perder la orden" de prender el modo de alto contraste porque el parámetro `color_trc` (Transfer Characteristic) no explícitamente ordena la curva SMPTE-ST-2084. Si no hay orden, la TV lee el brillo como SDR. Un SDR de 100 nits hace que hasta un panel QD-OLED parezca una pantalla de laptop vieja y gris.

# 2. Directiva de Ejecución (Código / Inyección)
Debemos gritarle explícitamente al procesador de la televisión que aplique la curva de Transferencia Perceptual Quantizer (PQ).

```bash
# Para HDR10 Real (Destruye restricciones):
-color_trc smpte2084 -color_primaries bt2020
```
Si el origen es deportivo en directo (generalmente HLG de un estadio):
```bash
# Para HLG Deportivo en Directo:
-color_trc arib-std-b67 -color_primaries bt2020
```

# 3. Flanco de Orquestación
(Doctrina del Cristal Roto). Prefiero que una TV antediluviana se apague a tolerar que mis OLEDs y Shield TVs emitan señal marchita. Al aplicar `smpte2084` forzado con `chroma_i444`, ExoPlayer transmite por eARC o HDMI 2.1 el meta-data original, haciendo que las zonas oscuras se vuelvan Agujeros Negros (0.000 nit) y el estadio brille a su máximo nivel.
