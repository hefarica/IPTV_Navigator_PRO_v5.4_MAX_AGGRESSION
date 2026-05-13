---
description: "Regla suprema inviolable para mantener la pureza de la Arquitectura OMEGA CRYSTAL V5 de 10 Capas (L0-L10, 796 líneas/canal). Actualizada de 4 capas → 10 capas."
---

# REGLA OBLIGATORIA: DOCTRINA DE LAS 10 CAPAS (OMEGA CRYSTAL V5)

> **Actualizado 2026-04-07**: Expandida de "4 Capas" a "10 Capas L0-L10" alineada al OMEGA CRYSTAL V5.

## 🔴 LEY ABSOLUTA DE ANTIBREACHING L7 (NO DUPLICAR DATOS EN CAPAS ERRÓNEAS)

La arquitectura OMEGA CRYSTAL V5 define **10 capas** estrictas (L0-L10). Cada directiva tiene una capa asignada y **no debe migrar** entre capas sin justificación técnica:

| Capa | Contenido | Quién lo lee | Rol |
|------|-----------|-------------|-----|
| L0 | EXTINF + STREAM-INF | Todos los parsers HLS | Identidad (RFC 8216) |
| L1 | EXTVLCOPT (110) | VLC, ExoPlayer | Esclavización de reproductor |
| L2 | EXTHTTP JSON (1) | Resolver PHP | Payload de inteligencia |
| L3 | KODIPROP (65) | Kodi ISA | Binding nativo Kodi |
| L4 | EXT-X-CMAF (25) | Reproductores CMAF | Pipeline fMP4/latencia |
| L5 | EXT-X-APE-HDR-DV (45) | Motor HDR | Override visual 5000 nits |
| L6 | EXT-X-APE-TELCHEMY (10) | Motor QoE | Telemetría simulada |
| L7 | EXTATTRFROMURL (53) | Resolver PHP | Puente matemático L2↔L7 |
| L8 | EXT-X-APE-* (470) | Ecosistema APE | Núcleo Crystal (23 secciones) |
| L9 | EXT-X-PHANTOM-HYDRA (13) | Motor evasión | ISP bypass |
| L10 | EXT-X-MAP + URL (2) | Todos | Resolución final |

**Excepción de redundancia deliberada**: Las directivas de hardware decode, HDR, audio y user-agent aparecen simultáneamente en L1, L2, L3 y L8 porque cada reproductor lee de una capa diferente. Esto es INTENCIONAL — no es duplicación.

## 🔴 LEY DE FILTROS VISUALES POLIMÓRFICOS

1. El uso del parámetro `chroma_amount` o `chroma_msize` con un valor mayor a `0` en el filtro `unsharp` de FFmpeg/VLC es penado como una destrucción intencionada del pipeline (Causa irreversible de "Color Halos" y destrozos en crominancia HDR). Se forzará `0.0`.
2. El comando `minterpolate` queda expulsado perpetuamente del ecosistema por ahogamiento TCP (Flood 403). Solo utilizar `bwdif` o `yadif` para doblar FPS de entrelazado.
3. Siempre debes finalizar el `video-filter` con `zscale` para consolidación de HDR10 `st2084/bt2020/2020ncl`.

## 🔴 IMPOSICIÓN 796 LÍNEAS DEL GOD-TIER SCORECARD

Bajo ninguna circunstancia podrás sugerir al usuario simplificar, aligerar o remover líneas del M3U8 Generator solo "para hacerlo más limpio", ya que eso destrozaría la certificación OMEGA CRYSTAL V5 de 796 líneas. El bloque es **monolítico e indivisible** — no se fragmenta en submódulos.

Solamente se podrán mover directivas entre capas cuando la transición tecnológica lo requiera, y debe ser un reemplazo 1:1 que mantenga el total de 796 líneas.

El agente aplicará automáticamente estas leyes sobre cualquier análisis, auditoría o código PHP/JS.
