# REA 31 — Filtros "Crystal UHD": qué es físico, qué es software y qué puede leer un player

## 1. Filtros ópticos (UV, CPL, ND, IR cut)

Son **física de la lente**: actúan sobre la luz **antes del sensor**. No se pueden aplicar a un stream ya capturado, ni por metadata, ni por ARA, ni por VPS.

- UV: protección del recubrimiento; no cambia píxeles de un stream existente.
- CPL: elimina reflejos con luz polarizada; requiere el filtro físico en la cámara.
- ND: reduce exposición; requiere el filtro físico.
- IR cut: está en el sensor/cámara; no es post-proceso.

**Conclusión:** no existe metadata que "aplique" UV/CPL/ND a un canal IPTV. Cualquier tag que lo insinúe es inerte.

## 2. Filtros software (los únicos aplicables)

Se aplican sobre el frame ya decodificado:

- LUT 3D (color), saturación, contraste, gamma, temperatura, tint.
- Sharpen, denoise, deblock (limitados por GPU).
- HDR tone mapping / passthrough.

**Dónde se aplican:**
| Player | ¿Lee filtros? |
|---|---|
| Nuestro `ApePlayer` (media3 + GL effect) | Sí, si el código los conecta |
| VLC/Kodi | Parcial: `#EXTVLCOPT` (no LUT arbitraria) |
| OTT Navigator / TiviMate | **No** leen LUT/GL; tags `#EXT-X-APE-*` inertes |
| DaVinci/Premiere | Post-producción, no tiempo real |

## 3. Metadata JSON propuesta (ape.filters.v1)

```json
{
  "schema": "ape.filters.v1",
  "note": "software color/sharpen metadata; optical filters are not applicable to captured streams",
  "target_resolution": "3840x2160",
  "real_8k": false,
  "profiles": {
    "crystal_uhd": {
      "lut": "none",
      "saturation": 1.12,
      "contrast": 1.08,
      "gamma": 0.98,
      "sharpness": 0.28,
      "denoise": 0.18,
      "temperature_k": 6500,
      "tint": 0,
      "hdr": "passthrough",
      "optical": { "uv": "n/a", "cpl": "n/a", "nd": "n/a" }
    },
    "sports": { "saturation": 1.06, "contrast": 1.05, "sharpness": 0.22, "denoise": 0.12 },
    "cinema": { "saturation": 1.00, "contrast": 1.04, "gamma": 0.96, "sharpness": 0.12, "denoise": 0.20 },
    "neutral": { "saturation": 1.0, "contrast": 1.0, "sharpness": 0.0, "denoise": 0.0 }
  }
}
```

Valores de arranque, no calibración certificada. El ONN S905Y4 no tiene AI-SR/AI-PQ expuesto; el GPU Mali-G31 puede hacer GL básico, no 8K ni LUT 3D pesada.

## 4. Cómo llega al player

- **Nuestro player:** lee el JSON (asset/intent/URL) y aplica uniforms GL.
- **OTT/TiviMate:** ignora `#EXT-X-APE-FILTER-*`; no hay estándar HLS para LUT.
- **ARA:** puede enviar el perfil al player propio; no puede inyectarlo en otra app sin root.
- **VPS:** puede hospedar el JSON y elegir perfil por device; no aplica píxeles.

## 5. Límites reales

- No se recupera detalle perdido; solo se realza lo decodificado.
- Sharpen agresivo = halos/ruido; denoise agresivo = plasticidad.
- HDR falso sobre SDR = color shift, no HDR real.
- 8K no existe en ONN S905Y4/HDMI 4K.
- "Crystal UHD" es un nombre de perfil, no una tecnología certificada.

## 6. Recomendación

1. Aplicar perfiles **solo en el player propio**; no prometer en OTT.
2. Empezar por `neutral`/`crystal_uhd` suave; validar con pares de frames y VMAF/SSIM si se puede.
3. No agregar tags ópticos falsos a la lista.
4. Si se quiere LUT real, usar mpv/VLC con shaders o un player con GL; en ONN, medir FPS/temperatura.
