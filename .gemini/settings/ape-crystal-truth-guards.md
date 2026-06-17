# APE VPS HEVC-UHD Crystal — Truth Guards (Gemini settings doctrine)

> Médula espinal. Vinculado a la skill **`ape-vps-hevc-crystal-integrator`** (inyectada en
> `/iptv-freezeless-visual-master-council` PHASE 0; revisada por el council: **WARN · 0 BLOCK ·
> preserva el flujo**). Normas primarias en la skill `references/web_authority.md`. Leer ANTES de
> tocar cualquier artefacto VPS/player/daemon/M3U8/installer/wake.

## Los 6 truth-guards (no negociables)

| Área | Permitido | PROHIBIDO |
|---|---|---|
| M3U8 installer | `#EXT-X-APE-INSTALLER` = metadata/puntero a una URL de bootstrap (RFC 8216 §6.3.1: los players ignoran tags desconocidos). | "la playlist instala o ejecuta código en el player". |
| Wake-on-playback | El playback dispara wake por observación GET del manifest o un beacon, **encolado y no-bloqueante**. | "el tag HLS por sí mismo despierta el device o ejecuta comandos". |
| ADB | El bootstrap requiere un host con ADB instalado, habilitado y **autorizado** (clave RSA por host). | "ADB se habilita remoto o se fuerza silenciosamente desde la playlist/VPS". |
| Rol visual del VPS | El VPS selecciona variantes, políticas, metadata, perfiles y fallback QoE. | "el VPS mejora píxeles en un player remoto sin un engine real de device/player". |
| Player ⇄ daemon | El daemon/sentinel corre en el device/host autorizado; el player manda beacons/metadata. | "el media player aloja un daemon a partir de metadata HLS". |
| HEVC-first (GOLDEN RULE) | `hvc1.*` SOLO en `#EXT-X-STREAM-INF CODECS=`; `hev1.*` SOLO en `#KODIPROP`/`#EXTVLCOPT`/`X-APE-CODEC`. | cruzarlos (`hev1.*` en STREAM-INF rompe Apple/Tizen/webOS; `hvc1.*` en KODIPROP rompe ExoPlayer ISA), o declarar codec/nivel imposible. |

## Ley Cardinal 1 — Nivel HEVC ↔ Resolución (vector del freeze 2026-06-08)

`level_idc = level × 30`. Declarar `hvc1.2.4.L<N>.B0` SOLO si el nivel puede cargar `RESOLUTION`+fps
(ITU-T H.265 Annex A): `L93`=720p · `L120`=1080p@30 · `L123`=1080p@60 · `L150`=4K@30 ·
**`L153`=4K@60 (CORONA / techo)** · `L156`=4K@120 · `L180`=8K@30 · `L183`=8K@60 · `L186`=8K@120.
`L153` en 8K@120 = imposible → el player rechaza la variante → **freeze** (commit `7103cfd`). AV1 sí
carga 8K (P1 = `av01.0.15M.10`).

## Invariantes adicionales

- **Sin fake HDR:** `VIDEO-RANGE=PQ` solo si probe halló TransferCharacteristics code point 16; `HLG` solo CP 18.
- **Sin fake CMAF:** `verified=true` solo con `EXT-X-MAP` + init segment + `EXT-X-VERSION ≥ 6`.
- **Sin `SUPPLEMENTAL-CODECS` inventados:** `lcev.1.1.1` PROHIBIDO; `dvh1`/`dvhe` solo si probados.
- **9 headers tóxicos EXTHTTP** prohibidos: `Range: bytes=0-`, `If-None-Match: *`, `If-Modified-Since`,
  `TE: trailers`, `Priority: u=0, i`, `Upgrade-Insecure-Requests`, multi-value `Connection`/`Keep-Alive` (OkHttp), `Sec-Fetch-*`.
- **SHIELDED (Ley 5):** URLs de canal VERBATIM al proveedor; SHIELDED = sufijo de archivo (`_SHIELDED.m3u8`), nunca `/shield/`.
- **NO-STRIP (Ley 4):** nunca borrar/reducir los ~945 headers funcionales por canal (cada uno tiene consumidor player o VPS-Lua).
- **Autopista:** wake en `log_by_lua` no-bloqueante (`io.open` en `/dev/shm` o `ngx.shared.DICT`); nada de I/O síncrona en el worker. Red: `bbr`, `initcwnd=400`, `proxy_read_timeout ≥ 60s`, `limit_conn xtream_slot ≥ 2`, `proxy_cache_valid 302 = 0`.

## Caveat obligatorio

> Los anchors de playlist son metadata; la instalación y el wake reales requieren ruta VPS desplegada +
> host/dispositivo ADB autorizado o runtime compatible. Las validaciones estáticas locales NO prueban
> systemd, Nginx, PHP-FPM, runtime Lua, autorización ADB ni comportamiento del device en el VPS de producción.
