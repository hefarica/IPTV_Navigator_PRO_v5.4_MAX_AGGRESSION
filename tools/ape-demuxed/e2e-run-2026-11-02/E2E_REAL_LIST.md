# Cadena demuxed ejecutada de punta a punta sobre la lista real

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8` (604.593.696 B, sha256 `523d52a6…5049d6`)
**Herramientas:** `gen_demuxed_master.js` (80.697 B) → `verify_demuxed.js` (38.990 B). Node ≥18, cero dependencias.

---

## 1 · Resultado

| Paso | Salida | Exit |
|---|---|---|
| Generador (estricto) | `audio: NO_COMPUTADO` · 84.584 caps fuera · 0 downscale | **2** (AUDIO_NO_COMPUTADO) |
| Generador (`--allow-muxed-passthrough`) | muxed preservado **declarado, no simulado** | **0** |
| Arnés sobre el master emitido | `G2 PASS` · `G3 PASS` · G1/G4 NO_COMPUTADO | **2** (NO_COMPUTADO) |

**Master emitido:** 601.110.504 B · 10.231.079 líneas · sha256 `aa4a629ba652432e…` · modo catalogue.

El generador se niega a escribir credenciales dentro del repo: **exit 6** en el preflight de ruta, antes de crear
el fichero. La salida de esta corrida vive fuera del repositorio.

## 2 · Lo que el arnés confirma

| Gate | Veredicto | Razón |
|---|---|---|
| **G2 zero video downscale** | **PASS** | ninguna variante por debajo de la fuente (3840x2160) |
| **G3 zero video caps** | **PASS** | 0 líneas de cap en el master emitido |
| G1 estructura demuxed | NO_COMPUTADO | el master no declara `#EXT-X-MEDIA TYPE=AUDIO`: no hay estructura que verificar |
| G4 audio throughpass | NO_COMPUTADO | sin `--audio-segment` no hay recurso real que medir |

**G2 es la ley del operador y pasa.** G1/G4 no fallan: **no se pueden computar** porque el origen es MUXED.

## 3 · Censo de caps eliminados (medido, con valores)

**84.584 líneas** quitadas en 10.573 canales. **52.434 limitaban** de verdad; 32.150 no.

| Cap | Presente | Limitaban | Valores observados |
|---|---|---|---|
| `#KODIPROP:inputstream.adaptive.max_resolution` | 10.573 | **10.573** | `1920x1080` ×10.573 |
| `#KODIPROP:inputstream.adaptive.chooser_bandwidth_max` | 10.573 | 10.573 | `8000000` ×9.765 · `19800000` ×808 |
| `#EXTVLCOPT:adaptive-maxbitrate` | 10.573 | 10.573 | `8000000` ×9.765 · `19800000` ×808 |
| `#EXTVLCOPT:adaptive-maxwidth` | 10.573 | 0 | `7680` ×10.573 (por encima de la fuente: no capaba) |
| `#EXTVLCOPT:adaptive-maxheight` | 10.573 | 0 | `4320` ×10.573 (idem) |
| `#EXTVLCOPT:video-width` | 10.573 | **9.765** | `1280` ×7.457 · `1920` ×2.308 · `3840` ×808 |
| `#EXTVLCOPT:video-height` | 10.573 | **9.765** | `720` ×7.457 · `1080` ×2.308 · `2160` ×808 |
| `#KODIPROP:inputstream.adaptive.max_framerate` | 10.573 | 1.185 | `30` ×7.457 · `60` ×3.116 |

### El hallazgo que manda

> **`max_resolution=1920x1080` en los 10.573 canales, y limita en los 10.573.**
> Es un techo de 1080p sobre un bloque que declara 3840x2160. Mientras esté, ningún canal de esta lista
> puede entregar 4K por esa vía.

Y el segundo: **`video-width`/`video-height` capan 9.765 canales** (`1280x720` en 7.457, `1920x1080` en 2.308)
por debajo de los 2160 declarados. Solo los 808 de perfil P1 quedan sin capar por esa pareja.

## 4 · Candidatos que NO se tocaron (y por qué)

`adaptive-bandwidth-factor`, `adaptive-maxbw`, `video-display-fps`, `video-fps`,
`max_buffer_duration`, `preferred_video_resolution` — 10.573 apariciones cada uno, **conservados**:
no son caps de vídeo. Retirarlos habría sido «arreglar» lo que no estaba roto.

## 5 · El audio: NO_COMPUTADO, y es la respuesta correcta

```
"source": null, "renditions": 0, "demuxed": false, "status": "NO_COMPUTADO",
"reason": "#EXT-X-MEDIA TYPE=AUDIO con URI= = 0 en la entrada y no se aportó --audio;
           el origen es MUXED. No se inventa ninguna URI (anti-invención).
           Para audio demuxed real hay que aportar --audio con renditions medidas."
```

**No hay throughpass de audio posible en esta lista** porque no existe una rendition de audio separada.
El generador se niega a inventarla. Pasar a demuxed exige un packager que produzca las renditions —
y en un VPS metadata-only eso no existe (`.ts/.m4s/.mp4 → 404`).

## 6 · Reproducir

```bash
# estricto (falla cerrado si no hay audio real)
node tools/ape-demuxed/gen_demuxed_master.js --in <lista.m3u8> --out <fuera-del-repo>/master.m3u8 --report gen.json

# preservando el muxed, declarado
node tools/ape-demuxed/gen_demuxed_master.js --in <lista.m3u8> --out <fuera>/master.m3u8 \
     --report gen.json --allow-muxed-passthrough

# verificar el master emitido
node tools/ape-demuxed/verify_demuxed.js <fuera>/master.m3u8 --source-resolution 3840x2160 --json verify.json
```

## 7 · Artefactos de esta corrida

| Archivo | Contenido |
|---|---|
| `gen-report.json` | censo completo de caps, efectos, valores, y bloque de sensibilidad |
| `verify-report.json` | los cuatro gates con su veredicto y razón |

Ambos verificados: **0 apariciones** del host del proveedor, **0** de su IP. No contienen URIs reales.
