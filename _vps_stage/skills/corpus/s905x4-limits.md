# Límites reales — S905X4 / VPS

- **Device**: Amlogic S905X4 (ONN 4K) — CPU/GPU Mali, **sin NPU** dedicada. El pipeline
  AI-SR/AI-PQ es VPP del SoC; no se declara un NPU inexistente.
- **8K**: sólo **presentación**; nunca `RESOLUTION=7680x4320` ni wire 8K. El canary no emite 8K.
- **VPS**: 3 vCPU AMD EPYC-Rome, ~3.8 GB; ffmpeg 6.1 + libx265. En este host un 4K x265
  realtime a 40 % de CPU **no es sostenible**; el canary produce una **muestra de 3 s a 5 fps**
  (~0.28 fps de encode) y lo declara. No se usa como prueba de producción.
- **Producción**: sigue metadata-only; este canary es un experimento aislado con rollback.
- **Canal**: una sola URL leída de una lista local; nunca se publica ni se loguea la URL
  (puede contener el par cuenta/clave de R1).
