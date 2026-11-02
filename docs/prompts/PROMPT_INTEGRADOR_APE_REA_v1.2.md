# PROMPT INTEGRADOR — APE REA v1.2 ↔ IPTV NAVIGATOR PRO v5.4

**Rol:** Team Lead de integración APE REA / IPTV Suprema 2026.  
**Objetivo:** convertir el scaffold `ape_rea_v1.2_complete.zip` en una capa real, reversible y probada dentro de este repositorio, sin duplicar el generador existente, sin degradar imagen y sin fabricar evidencia.

---

## 0. Contexto fijo

Repositorio:

```text
hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION
rama actual: feat/adb-generic-visual-enhancement-installer
commit base: b1b94af
```

Lista objetivo:

```text
https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8
```

Evidencia local ya existente:

```text
artifacts/audit/2026-11-02_APE_LISTA_1793589060441/playlist.m3u8
SHA-256: 523D52A6D147F81CE5A212E47B9C55401FB409CD4A41AEE96F8BA80B5B5049D6
bytes: 604.593.696
lines: 10.315.662
channels: 10.573
unique URLs: 10.573
```

ZIP:

```text
ape_rea_v1.2_complete.zip
SHA-256: 8fe5a6c3fe74cfa720107e0e958f01a34cd330279a7edab8666dcbb7a3cb19ce
contenido: ape_rea_v1.2/M01..M18 + config.yaml + Dockerfile + requirements.txt
```

Estado del scaffold: **no es producción**. Varios módulos son stubs:

- M01 lee el archivo completo en memoria.
- M02 solo detecta `#EXTINF`, no conserva líneas ni atributos.
- M03 no parsea `tvg-*` reales.
- M05 solo cubre P1/P3/P4 y hardcodea tiers.
- M08 mapea opciones VLC a FFmpeg de forma incompleta.
- M09 devuelve strings `processed_N`, no frames.
- M10 devuelve bytes ficticios `upscaled_to_...`.
- M11 declara CMAF sin verificar `EXT-X-MAP`.
- M12 emite un HLS mínimo sin RESOLUTION/CODECS/validación.
- M16 devuelve `success: True` sin ejecutar la cadena.
- M18 devuelve `True` sin WebSocket real.

No se debe presentar ese scaffold como “terminado”.

---

## 1. Ley de integración (no negociable)

1. **No reemplazar el generador existente.** `m3u8-typed-arrays-ultimate.js`, `ape-fallback-resolver.js`, `ape-quality-prober.js` y el pipeline actual siguen siendo la médula. El ZIP se integra como adaptadores/orquestación, no como segunda arquitectura.
2. **No degradar imagen.** 4K sigue 4K. FHD no se declara 4K real. HEVC no se cambia a H.264 para ocultar fallos. HDR no se convierte a SDR para ocultar fallos. FPS y bitrate no se recortan.
3. **No fabricar.** Resolución, codec, HDR, audio, CMAF, latencia y calidad requieren `declared` u `observed`; nunca se presentan como `verified` sin bitstream y recibo.
4. **Cuatro ámbitos separados.** Fuente, clasificación APE, reconstrucción/presentación y variante de manifiesto no se colapsan.
5. **Reversibilidad.** Toda transformación M3U8/JSON/Markdown conserva bytes, orden, hashes y reverse-check.
6. **Idempotencia.** Misma entrada + misma configuración = mismo SHA-256 de salida.
7. **Evidencia.** Cada operación produce `requested`, `resolved`, `applied` y `verified`; si falta, se declara `unknown`.
8. **Rate-limit.** No se sondean 10.573 URLs sin control. Muestra inicial máxima 50–100; el full-scan requiere autorización explícita.
9. **Credenciales.** Las URLs de canal con usuario/password se redactan en reportes; no se copian a docs, tests ni logs.
10. **Rollback.** Todo cambio debe poder revertirse sin tocar la lista pública ni el VPS.

---

## 2. Diagnóstico que el integrador debe asumir

La lista actual demuestra:

```text
10.573 STREAM-INF con 3840x2160 + PQ + hvc1.2.4.L153.B0
9.720 canales con APE-RESOLUTION 1920x1080
808 canales con APE-RESOLUTION 3840x2160
9.535 EXTINF con codec-family h264
1.038 EXTINF con codec-family hevc
10.573 con 4KFALSE-MODE:ACTIVE
10.573 con 8KFAKE ... TARGET=DISPLAY
10.573 con audio Atmos/DTS-X/TrueHD/EAC3 enabled
10.573 con esos mismos formatos en KODIPROP=false
0 EXT-X-MAP en el catálogo
10.573 CMAF-CONTAINER:mpegts
10.573 EXTHTTP válidos; máximo 8.124 bytes
1 host: line.tivi-ott.net
100% HTTP
1 par de credenciales
muestra 50: 46×200, 4×407
re-fetch posterior: 461/509
```

La documentación adjunta define **contradicción intencional por ámbito**. El integrador no debe “arreglar” esa separación borrando valores: debe conservarla y hacer que cada consumidor lea el ámbito correcto.

---

## 3. Mapa de integración M01–M18

| ZIP | Destino real | Decisión |
|---|---|---|
| M01 Ingesta | `tools/ape_rea/m01_ingest.py` | Hash incremental en streaming; no `read()` total. |
| M02 Parser | `tools/ape_rea/m02_parser.py` | Envolver `tools/m3u8_json_bridge.py`; no parser paralelo. |
| M03 Identidad | `tools/ape_rea/m03_identity.py` | Índice de lista ≠ `tvg-chno`; conservar ambos. |
| M04 Registro | `tools/ape_rea/m04_scopes.py` | Registro por ámbito, no “global”. |
| M05 Perfiles | `profiles/IPTV_PREMIUM.json` + generador | P0–P5 completos; no solo P1/P3/P4. |
| M06 Capacidades | `tools/ape_rea/m06_capabilities.py` | `supported/tested/measured` reales; no GPU inventada. |
| M07 Planificación | `tools/ape_rea/m07_planner.py` | Elige responsable por operación; no ruta fija. |
| M08 Adaptadores | `frontend/js/ape-v9/` + `tools/ape_rea/m08_adapters.py` | EXTVLCOPT/KODIPROP a motores reales; no mapeo VLC→FFmpeg falso. |
| M09 Pipeline | `frontend/js/ape-v9/` | Cadena VLC real: hqdn3d→yadif→unsharp→minterpolate. |
| M10 Superresolución | `tools/ape_rea/m10_sr.py` | Real-ESRGAN x4 con geometría y recibo; no bytes ficticios. |
| M11 Transporte | `tools/ape_rea/m11_transport.py` | Buffer/prefetch; CMAF solo con MAP/PART reales. |
| M12 Empaquetado | `m3u8-typed-arrays-ultimate.js` | No emitir HLS paralelo; usar el generador actual. |
| M13 Fallback | `ape-fallback-resolver.js` | Ladder por codec/resolución; no L123/L90/L60 como “niveles” sin semántica. |
| M14 Publicación | `tools/ape_rea/m14_publish.py` | Atomic swap + SHA-256; no `committed: True` sin escribir. |
| M15 Evidencia | `tools/ape_rea/m15_evidence.py` | Recibos con id, hash, scope, estado. |
| M16 Orquestador | `tools/ape_rea/m16_orchestrator.py` | Ejecuta la cadena; no `success=True` fijo. |
| M17 Limpieza | `tools/ape_rea/m17_cleanup.py` | GC/cache con métricas; no ciclo ciego. |
| M18 WBI | `tools/ape_rea/m18_wbi.py` | WebSocket real o declarar `unsupported`; no `True`. |

---

## 4. Ajustes de variantes que debe implementar

### 4.1 Matriz por fuente

| Perfil | Fuente esperada | Variante máxima | Regla |
|---|---|---|---|
| P0 | 8K/4K master | L186/L153 según resolución | 8K solo si fuente/cadena lo permiten |
| P1 | 4K premium | L153 | no usar para 720p/1080p |
| P2 | QHD | L150/L123 | sin claim 8K |
| P3 | FHD | L123/L120 | sin PQ falso |
| P4 | HD/720p | L93 | enhancement opt-in |
| P5 | SD | L90/L60 | sin claim 4K |

Regla dura:

```text
level declarado >= level requerido por resolución
nunca L153 sobre una fuente 720p como si fuera 4K real
```

### 4.2 Resolución y presentación

Separar:

```text
source_resolution
ape_classification
reconstruction_intermediate
presentation_target
manifest_variant
```

Si la lista usa `4KFALSE`/`8KFAKE` como **display enhancement**, se conserva el tag, pero el `STREAM-INF` no debe afirmar 4K/PQ real sin `observed`; debe emitir la variante que corresponde a la fuente o marcar la capa virtual como tal.

### 4.3 HDR/color

```text
SDR source -> no declarar PQ/DV verificado
BT2020/10-bit -> solo si soportado por la representación
PQ variant -> declarar como variante, no como bitstream
```

No eliminar el objetivo HDR; separarlo de la fuente.

### 4.4 Audio

```text
passthrough_safe
priority eac3,ac3,aac,mp3
fallback aac_lc_2ch 256k
downmix enabled
eARC auto
validation channels>0 / sample_rate>0
```

Prohibido declarar Atmos/DTS-X/TrueHD/EAC3 enabled y a la vez KODIPROP=false sin marcar los tres planos.

### 4.5 CMAF/LL-HLS

```text
CATALOG: tags APE/CMAF son metadata
MEDIA: EXT-X-MAP, EXT-X-PART, EXT-X-SERVER-CONTROL, PRELOAD-HINT
CMAF real solo si el manifiesto de medios lo demuestra
si no: classic HLS, no “CMAF” verificado
```

### 4.6 Fiabilidad

```text
un host = concentración, no multi-CDN
407 = restricción/suscripción
509 = límite de banda/conexión
461 = respuesta del proveedor; documentar
no convertir un 407/509 en “canal muerto”
```

---

## 5. Fases de ejecución

### Fase 0 — Inventario y congelado
- Leer ZIP, hashes, módulos y stubs.
- Congelar commit base y artefactos de la lista.
- Crear `docs/integration/APE_REA_v1.2_MAP.md`.

### Fase 1 — Núcleo reversible
- M01 streaming hash.
- M02 wrapper del bridge real.
- M03 identidad `tvg_id` + `source_list_position` + `tvg_chno`.
- Test: 10.573 canales y round-trip byte-idéntico.

### Fase 2 — Perfil y capacidades
- Completar P0–P5 y presets.
- M05/M06/M07 con `supported/tested/measured`.
- No hardcodear GPU ni tiers.

### Fase 3 — Variantes reales
- Compilar variante desde fuente observada.
- Ajustar `STREAM-INF`, `APE-RESOLUTION`, `HDCP`, `VIDEO-RANGE` por ámbito.
- Auditar los 10.573 bloques: 0 contradicciones no declaradas.

### Fase 4 — Imagen y audio
- M09/M10 con cadenas reales o `unsupported`.
- Audio safe y fallback.
- Recibos `requested/resolved/applied`.

### Fase 5 — Publicación y evidencia
- M14 atomic swap.
- M15 ledger.
- M16 orquestador real.
- M17/M18 con estado real.

### Fase 6 — Pruebas
- Ejecutar gates existentes y los nuevos.
- Muestra HTTP 50; no full-scan sin autorización.

---

## 6. Criterios de aceptación

```text
[ ] 10.573 canales, 10.573 URLs, 0 sin URL
[ ] 10.315.662 líneas conservadas
[ ] SHA-256 del catálogo estable en dos ejecuciones
[ ] round-trip M3U8↔JSON byte-idéntico
[ ] P0-P5 completos; presets 6
[ ] 0 L153 sobre fuente 720p declarada como 4K real
[ ] 0 PQ verificado sin evidencia
[ ] 0 CMAF verificado sin EXT-X-MAP/medias
[ ] 0 audio contradictorio sin marcar planos
[ ] EXTHTTP válido; máximo ≤8192 bytes
[ ] muestra HTTP clasificada; 407/509 no son “muerto”
[ ] IDs de evidencia requested/resolved/applied/verified
[ ] node -c sobre generador/resolver/prober
[ ] gates existentes verdes
[ ] rollback documentado
```

---

## 7. Entregables

```text
docs/integration/APE_REA_v1.2_MAP.md
tools/ape_rea/m01..m18 (adaptadores reales, no stubs)
profiles/IPTV_PREMIUM.json actualizado
presets/IPTV_PREMIUM.presets.json actualizado
tests para M01/M02/M03/M05/M12/M13/M15/M16
.agents/reports/ape-rea-integration-<timestamp>.md
```

---

## 8. Prohibiciones

- No reemplazar el generador actual.
- No tocar el VPS ni la lista pública sin autorización.
- No ejecutar el Dockerfile del ZIP como producción.
- No usar `torch`/`opencv` si no hay GPU/runtime medido.
- No declarar “success” sin recibo.
- No exponer credenciales.
- No borrar canales.
- No degradar 4K para “cuadrar” variantes.

---

## 9. Prompt de ejecución

> Integra `ape_rea_v1.2_complete.zip` en `IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` siguiendo esta ley. Primero produce el mapa M01–M18→repo y el inventario de stubs. Después implementa el núcleo reversible, el compilador de variantes P0–P5, los adaptadores de imagen/audio/transporte y el ledger de evidencia. No reemplaces el generador actual. No toques VPS ni lista pública. Valida con la lista `APE_LISTA_1793589060441`, su SHA-256 `523D52...`, sus 10.573 canales y una muestra HTTP de 50 URLs. Separa `declared/observed/resolved/applied/verified`; si falta evidencia, escribe `unknown`. No declares 4K/PQ/CMAF/calidad sin bitstream y recibo. Entrega mapa, código, tests, reporte y rollback. Si una operación no se puede ejecutar, márcala `unsupported`; no la simules.
