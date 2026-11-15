# iptv-4k-pipeline-automation

Pipeline de cuatro pasos para producir una lista 4K que **no miente**.

## Por qué existe

El pipeline del catálogo original empezaba con
`curl -o 4k.m3u https://iptv-org.github.io/iptv/categories/4k.m3u` → **404 medido**.
El resto de pasos nunca se ejecutó, y el último (`generate-m3u.js`) no existe.
Esta skill lo reconstruye con la ruta que sí responde y con etiquetas honestas.

## Estructura

```
iptv-4k-pipeline-automation/
  SKILL.md                  # pipeline, regla etiqueta ≤ evidencia, verificación
  README.md                 # este archivo
  references.md             # fuentes, normas y estándares
  commands.md               # comandos permitidos / prohibidos
  checklist.md              # pre / during / post / rollback
  tests.md                  # casos de verificación
  examples/build_real_4k.sh # script ejecutable de los 4 pasos + invariantes
```

## Los cuatro pasos

1. **Adquirir** desde `api/streams.json` con `quality == "2160p"` (20 medidos).
2. **Medir** el bitstream con probe (sin probe → `declared`, nunca `verified`).
3. **Deduplicar** por URL, una URL por bloque `#EXTINF`.
4. **Emitir** M3U Plus con `#EXTM3U`, sin tags de master.

## Regla central

**La etiqueta nunca supera a la evidencia.** Un canal 1080p etiquetado 4K es la
degradación inversa que prohíbe `ANTI_DEGRADATION_LAW`. Si faltan canales 4K, el
problema es de fuente; no se arregla cambiando el texto.

## Estado

- Paso 1: **medido** (20 streams 2160p, 0 en 8K).
- Pasos 2-4: **escritos y verificables**, no ejecutados sobre el lote completo en la
  sesión de origen. El script `examples/build_real_4k.sh` los ejecuta de punta a punta
  si se corre.
