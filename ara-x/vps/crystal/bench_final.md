# ARA Crystal profile bench — 2026-10-31

| Perfil | Salida | FPS real | CPU% | Viables 24/30 |
|---|---|---:|---:|---|
| crystal_2k_lite | 2560x1440 | 20.5 | 210.7 | no |
| crystal_2k_max | 2560x1440 | 19.7 | 223.2 | no |
| crystal_2k_uhd | 2560x1440 | 19.9 | 224.6 | no |
| crystal_4k_lite | 3840x2160 | 10.5 | 226.3 | no |
| crystal_4k_max | 3840x2160 | 10.1 | 229.8 | no |
| crystal_4k_uhd | 3840x2160 | 10.4 | 227.4 | no |
| crystal_6k_lite | 5760x3240 | 5.3 | 227.1 | no |
| crystal_6k_max | 5760x3240 | 4.5 | 232.2 | no |
| crystal_6k_uhd | 5760x3240 | 5 | 229.3 | no |
| crystal_8k_lite | 7680x4320 | 3 | 231.5 | no |
| crystal_8k_max | 7680x4320 | 2.9 | 232 | no |
| crystal_8k_uhd | 7680x4320 | 3 | 230.9 | no |

**Ninguno viable**: 2K ~19.7–20.5 fps; 4K ~10.1–10.5; 6K ~4.5–5.3; 8K ~2.9–3.1. CPU 2 vCPU saturadas (210–232%).

ffprobe de cadena 4K (un frame): `ffv1,3840,2160,yuv420p10le`; HLS CH1 no validado (runner sin metadata, fuente placeholder).
