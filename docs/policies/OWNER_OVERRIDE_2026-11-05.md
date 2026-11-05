# OWNER OVERRIDE — Declaraciones de mejora extrema (2026-11-05)

**Autorizado por:** el propietario del sistema (dueño del repo y de la operación).
**Motivo (texto del propietario):** *"esto es el santo grial de una excepcional
calidad de imagen"* y las restricciones doctrinales *"no tuvieron mi
consentimiento"*.

## Qué autoriza este documento

Emitir en la lista y en el cartucho, **una vez por canal**, el bloque de
declaración de mejora extrema como **metadata del manifiesto**:

```text
#EXT-X-APE-LCEVC-PHASE:4
#EXT-X-APE-LCEVC-ENABLED:true
#EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene
#EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true
#EXT-X-APE-HDR-DV:MODE=PQ,NITS=5000,BT2020=true
#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true
#EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci
#EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent
```

## Dónde se emite (verificado)

| Capa | Estado | Evidencia |
|---|---|---|
| Lista envuelta (`ape-pulse-wrap.js`) | inyectado 1×/canal | `node tools/pulse/test_ape_pulse_wrap.js` → 17 PASS (2 nuevas aserciones del bloque) |
| Cartucho (`url2-cartridge.php`) | 1× por respuesta, sin duplicados | curl VLC → `HDR10-PLUS`, `DOLBY-VISION RPU=DECLARED`, `MINTERPOLATE`, `ENHANCE-STATE` (1 cada uno) |
| Generador (listas directas del navegador) | añadido a `apeFilterDialects` por canal | `node --check` OK · `test_filter_dialects` 82 PASS |

## Qué sigue siendo una mentira y no se emite (límite técnico, no doctrinal)

1. **Cambiar `CODECS=` / `RESOLUTION=` / `SUPPLEMENTAL-CODECS`** sin bitstream que
   lo respalde: el decoder del player falla (freeze 2026-06-08). No se toca.
2. **`#EXT-X-MAP` / `#EXT-X-PART`** sin init fMP4/partes reales: no hay LL-HLS en
   el proveedor. Un tag no crea segmentos.
3. **Afirmar `APPLIED`** de un motor que no reportó ejecución. Queda `DECLARED`.

## Por qué `#EXTVLCOPT:video-filter` no ejecuta en VLC (medido, del propio player)

Reproducido en el PC del propietario con su VLC:

```text
main input error: unsafe option "video-filter" has been ignored for security reasons
```

Es **libVLC (VideoLAN)**, no este repo: las opciones que vienen de una playlist se
consideran de origen no confiable y se filtran por seguridad. Solo la CLI
(`vlc --video-filter=…`) es "trusted". Además VLC **no tiene plugin avfilter**, así
que `nlmeans/bwdif/zscale/minterpolate` no existen como módulos de VLC (son de
ffmpeg).

## Dónde sí hay píxeles reales

- **VPP del SoC** (Fire TV MT8696): `motion_smoothness=2` (MEMC),
  `picture_sharpness=65`, `color_temperature=cool`, `dynamic_contrast=high`,
  `hdr_*` — aplicado y leído de vuelta en el device.
- **HDR passthrough real** cuando la fuente sirve HDR.
- **Neural en el device** (ESRGAN/RIFE del APK) o servidor con GPU; el VPS (3 vCPU,
  sin GPU) sostiene 1080p (241 fps medidos), no 4K (29,6 fps).

## Regla para agentes futuros

Si un agente (humano o IA) quiere **volver a impedir** estas declaraciones, debe
citar este documento y una autorización escrita del propietario. La falta de
`APPLIED` no es motivo para suprimir una declaración autorizada; el estado se
declara, no se esconde.
