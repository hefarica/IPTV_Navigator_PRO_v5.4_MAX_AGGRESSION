---
name: iptv-4k-pipeline-automation
description: Convierte una fuente IPTV en una lista 4K real y honesta en cuatro pasos medidos — adquisición desde api/streams.json filtrando quality 2160p (porque categories/4k.m3u no existe), medición con probe, deduplicación y emisión M3U Plus con una URL por canal y etiquetas de calidad que no mienten. Úsala cuando haya que generar o automatizar una lista 4K/8K, cuando un pipeline use URLs de categoría 4K, o cuando haya que decidir si una etiqueta «4K» se puede sostener.
---

# Pipeline 4K automatizado sin mentir

## El punto de partida

El catálogo original proponía cuatro pasos. Medido el 2026-11-15: **el paso 1 daba
404**, y los pasos 2-4 nunca se ejecutaron. Esta skill convierte esa intención en un
pipeline que sí arranca, y que etiqueta con lo que puede probar.

## Los cuatro pasos

### Paso 1 — Adquirir (medido)

**Prohibido:** `https://iptv-org.github.io/iptv/categories/4k.m3u` → **404**.
No existe categoría 4K: `api/categories.json` publica 30 categorías y ninguna lo es.

**La ruta real:** filtrar `api/streams.json` por `quality`.

```bash
curl -s https://iptv-org.github.io/api/streams.json \
  | jq -r '.[] | select(.quality == "2160p") | "#EXTINF:-1," + .title + "\n" + .url' \
  > real-4k.m3u
```

Medido: **20** streams con `quality == "2160p"`, **0** con 8K, sobre 18.689 streams
(14.712 declaran calidad). Si tu resultado se aleja > 20 % de 20, el upstream cambió:
re-medir y anotar la fecha.

### Paso 2 — Medir (no ejecutado en la medición de origen)

La etiqueta `quality: "2160p"` es **declaración del catálogo**, no del bitstream. Para
subir de declarado a verificado hace falta probe real (`ffprobe` sobre un segmento, o
un validador como `freearhey/iptv-checker`).

Regla: **sin probe, el canal se queda en `declared`**. No se asciende a `verified`
porque el título diga 4K ni porque `quality` lo diga.

### Paso 3 — Filtrar y deduplicar

```bash
# una URL por canal (Anti-509) y sin duplicados exactos
awk '/^#EXTINF/{inf=$0; next} /^https?:/{ if(!seen[$0]++) print inf "\n" $0 }' real-4k.m3u > real-4k.dedup.m3u
```

- **Una URL por bloque `#EXTINF`** (doctrina Anti-509 del repo).
- Dedupe por URL canónica; el título puede repetirse (dos "Fireplace Vibes" en 2160p
  son dos hosts distintos y es correcto conservarlos).
- No dedupliques por nombre: se pierden canales legítimos con el mismo nombre.

### Paso 4 — Emitir M3U Plus

```text
#EXTM3U
#EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="4K",Nombre
https://...
```

- Cabecera `#EXTM3U` presente.
- `group-title` coherente; si el grupo dice 4K, la `quality` de origen debe ser 2160p.
- **No** emitir `RESOLUTION=`/`CODECS=` inventados en una lista de catálogo de canales:
  ese atributo pertenece a un master HLS con variantes reales.
- Una lista de canales NO lleva `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA URI=` ni
  `#EXT-X-I-FRAME-STREAM-INF URI=` (ver `single-url-per-channel-enforcer`).

## La regla que no se rompe: etiqueta ≤ evidencia

| Evidencia que tengo | Etiqueta permitida |
|---|---|
| probe mide 3840x2160 | `4K` + `verified` |
| `quality == "2160p"` del catálogo | `4K (declarado)` |
| título contiene "4K" | nada: el título no es evidencia |
| probe mide 1920x1080 | `1080p`. **Nunca 4K** |
| no medí | sin etiqueta de resolución |

**Prohibido por ley del repo:** renombrar 1080p como 4K para "tener más 4K". Es la
degradación inversa (`ANTI_DEGRADATION_LAW`, `Skill_Fake_4K_Detector`). Si faltan
canales 4K, el problema es de fuente, no de etiqueta.

## Qué hacer cuando el 4K falta

1. Añadir otra fuente autorizada que sí sirva 2160p.
2. Mejorar ruta/buffer/proxy para que el 4K existente no caiga.
3. Declarar el inventario real (20) en vez de inflarlo.

Lo que **no** se hace: subir el techo de la etiqueta, recortar bitrate, ni convertir
FHD en 4K por nomenclatura.

## Verificación obligatoria

```bash
test "$(grep -c '^#EXTINF' real-4k.m3u)" = "$(grep -c '^https\?:' real-4k.m3u)"   # 1:1
test "$(head -1 real-4k.m3u)" = "#EXTM3U"
test -z "$(grep -c '^#EXT-X-STREAM-INF' real-4k.m3u | grep -v '^0$')"              # no master tags
node tools/check_anti_degradation_policy.js                                        # gate del repo
```

Y el gate de calidad visual: ningún canal etiquetado 4K cuya `quality` de origen no
sea 2160p.

## Relación con otras skills

- `iptv-supreme-repos-4k` — de dónde salen las fuentes y cuáles sobreviven.
- `iptv-4k-source-truth-audit` — cómo se mide antes de confiar.
- `single-url-per-channel-enforcer`, `extinf-line-formatter`, `extm3u-header-emitter`.
- `iptv-real-resolution-verifier` — declarar 4K real vs upscale.
- `iptv-hls-validator`, `iptv-m3u8-e2e-auditor` — validar la lista final.
- `iptv-exthttp-traps-checklist` — si la lista lleva `#EXTHTTP`.

## Límites honestos

- **Paso 1 ejecutado**: `streams.json` devolvió 18.689 streams, 14.712 con `quality`,
  **20** con `2160p`. **Pasos 3-4 ejecutados** con un equivalente PowerShell
  (2026-11-15): 20 `#EXTINF` / 20 URLs / 0 tags de master / `#EXTM3U` en la primera
  línea. **Paso 2 no ejecutado**: ningún bitstream se midió con probe, así que toda la
  lista queda etiquetada `declarado`.
- Los comandos exactos `jq`/`awk` y `examples/build_real_4k.sh` **no se corrieron**
  como tales: se ejecutó su equivalente en PowerShell. La equivalencia está verificada
  por invariantes, no por identidad byte a byte.
- `quality` del catálogo puede estar mal: es declaración de terceros.
- Los 20 streams 2160p incluyen canales de ambiente ("Fireplace Vibes"), no solo
  cadenas premium. Cantidad no es calidad.
