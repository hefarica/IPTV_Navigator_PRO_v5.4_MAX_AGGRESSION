# SUPREMA 2026 PREMIUM — Doctrina

## Identidad

```text
skill: iptv-suprema-2026-premium
profile: IPTV_PREMIUM
base: creador_habilidades
version: 2026.1
```

## Leyes

1. **Evidencia primero.** Toda afirmación tiene estado: `declared`, `observed`, `resolved`, `applied`, `verified`.
2. **Cuatro ámbitos.** Fuente, clasificación APE, reconstrucción/presentación y variante de manifiesto.
3. **No fabricar.** Resolución, codec, HDR, audio, CMAF, latencia y calidad no se inventan.
4. **No degradar.** 4K se mantiene 4K; audio-only fallback debe declararse.
5. **No confundir.** `STREAM-INF` no es bitstream; tag CMAF no es fMP4; audio tag no es track.
6. **No martillar.** 10k URLs no se sondean sin rate-limit.
7. **No exponer.** Credenciales y tokens se redactan.
8. **No tocar producción.** VPS/LAB/listas no se modifican desde esta skill.
9. **No juzgar sin pedido.** Si el usuario pide mecánica, se describe; si pide veredicto, se declara criterio.
10. **Validar antes de declarar.** JSON, frontmatter, comandos y perfil.

## Matriz 0–100

| Nivel | Nombre | Evidencia mínima |
|---:|---|---|
| 0 | Sin datos | no hay lista/perfil |
| 10 | Inventario | bytes/líneas/canales/URLs |
| 20 | Modelo reversible | hashes, líneas, índice |
| 30 | Separación de ámbitos | fuente/APE/display/variant |
| 40 | Compilador de perfil | P0–P5 + capacidades |
| 50 | Pipeline de imagen | filtros/IA/HDR declarados |
| 60 | Transporte | buffer/prefetch/failover |
| 70 | LL/CMAF | MAP/PART/SERVER-CONTROL reales |
| 80 | Verificación | ffprobe/recibos por sesión |
| 90 | Confiabilidad | full health, 407/509, multi-CDN |
| 100 | Suprema | todo lo anterior verificado y reproducible |

## Estado actual del corpus

```text
documented_knowledge: 100
architecture: 100
list_structure: 100
channel_layer_mapping: 100
image_declarations: 100
transport_reliability: 80
bitstream_verification: 0
quality_measurement: 0
full_provider_health: 0
```

No se declara nivel 100 de calidad real.

## Modos

```text
/suprema-2026
/suprema-2026 audit <list-or-url>
/suprema-2026 channel <index|name> <list>
/suprema-2026 recipe <P0..P5>
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 verify <evidence-path>
```

## Relación con CREADOR

`creador_habilidades` define cómo crear una skill (analizar, estructurar, documentar, validar). `iptv-suprema-2026-premium` aplica esa disciplina a la arquitectura IPTV APE REA y al perfil `IPTV_PREMIUM`.
