# scripts/ — apuntadores, no duplicados

Los ejecutables viven en `tools/ape-image-recipes/` para que la skill se pueda usar desde fuera
del árbol de skills (generador, VPS, CI). **No se copian aquí**: un duplicado es drift.

| Script | Ruta canónica | Qué hace |
|---|---|---|
| `compile.js` | `tools/ape-image-recipes/compile.js` | receta → `vlc` / `ffmpeg` / `manifest` / bloque `m3u`. Falla cerrado. |
| `decode_lab_metadata.js` | `tools/ape-image-recipes/decode_lab_metadata.js` | decodifica los 20 chunks `#EXT-X-APE-LAB-METADATA` |
| `audit_vlcopt.js` | `tools/ape-image-recipes/audit_vlcopt.js` | audita nombres `#EXTVLCOPT` contra los binarios de VLC |

## Invocación rápida

```powershell
node tools/ape-image-recipes/compile.js --all
node tools/ape-image-recipes/compile.js --profile P3 --emit vlc
node tools/ape-image-recipes/decode_lab_metadata.js $lista --out $dir
node tools/ape-image-recipes/audit_vlcopt.js vlcopt_names.txt --root "C:\Program Files\VideoLAN\VLC"
```

## Contrato de los tres

- **Sin dependencias externas.** Solo `node:fs`, `node:path`, `node:readline`.
- **Streaming** para archivos de 600 MB (`readline`, no `readFileSync`).
- **Fallo cerrado:** `compile.js` aborta si una proyección `vlc` contiene un token que VLC no
  resuelve, o si una proyección `ffmpeg` tiene un parámetro fuera de rango medido.
- **Cero red.** Ninguno hace requests.
- **Redacción:** no imprimen credenciales; los ejemplos usan `USER`/`PASS` literales.
