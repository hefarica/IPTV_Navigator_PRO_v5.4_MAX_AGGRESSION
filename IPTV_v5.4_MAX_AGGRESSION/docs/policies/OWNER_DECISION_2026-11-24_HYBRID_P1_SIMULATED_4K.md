# OWNER DECISION — Híbrido APE Crystal P1 + `p=P1` (4K simulado)

**Fecha:** 2026-11-24 · **Autoridad:** instrucción directa del propietario · **Binding:** sí

## Decisión

La aplicación es una **aplicación de potenciación de imagen a la máxima resolución posible**.
Toda lista generada por el ecosistema APE debe nacer con el **híbrido óptimo**:

```text
metadata LAB:        P1 (4K UHD Pro, 27 chunks, HDR10+/PQ/BT.2020/10-bit)
URL de canal:        /pulse/<id>.m3u8?u=<origen>&d=<device>&p=P1
fuente <= 4K:        P1  -> el VPS sirve el cartucho P1.5:
                     4K SIMULADO por video filters + 6K emulado
fuente 8K real:      P0  -> no se degrada un 8K a 4K
```

**No es una fuente 4K real cuando la entrada es 480p/544p/720p/1080p.** Es una
**fuente simulada** producida por la cadena de video filters del cartucho y del
display. La metadata lo declara de forma honesta:

```text
MODE=SIMULATED
EXECUTOR=display
EXECUTED=0
POLICY=ape.crystal.hybrid/1+OWNER_ALL_RESOLUTIONS_UPSCALE
```

El operador autoriza expresamente esta simulación para **todas las resoluciones
< 8K**. No se gatea por "fuente verificada": la instrucción del 2026-11-24
rechazó ese gate. Lo que sigue prohibido es declarar que el **bitstream de
entrada** ya es 4K/6K/8K, o declarar `applied` sin recibo. El híbrido no cambia
los píxeles en el VPS: selecciona el cartucho que ejecuta el upscale simulado en
el display.

### Owner override 2026-11-24 (binding)

El contrato `ape.crystal.hybrid/1` define `balanced` (P3.5, 1080p emulado),
`max` (P1.5, 4K simulado, `p=P1`) y `native` (fuente >1080 sin escalar). El
propietario **rechazó** el gate de `max_eligibility`/`require_measured_source`:
la app debe **upscalar todas las resoluciones** por video filters. Por eso:

- `< 8K` (480p/544p/720p/1080p/**4K**) → `max`: P1.5 + `p=P1`.
- `>= 8K` → `max8k`: P0, se conserva sin degradar a 4K.
- `upscaleAll=false` recupera el contrato original (balanced/native).
- Las URLs firmadas (`fp`/`sig`/`token`) **no se reescriben** (generator_contract).

## Fuente de verdad

`APE_FUSION_HIBRIDO_OPTIMO_12P.json` — `APE_v9.4_CRYSTAL_HYBRID_12P`
(1.913.242 B, SHA-256 `439e28447371cff6c849eef08989a5eed5403dd6ad001488527e9db3ada58c49`).

Módulo de referencia: `ape-crystal-hybrid.cjs` (SHA-256
`ed759f319c270b19cbc4287400445c2e61651a3ad338403120a62a7007fb1a1b`) y su
override `ape-crystal-hybrid-owner.cjs`. Ambos quedan copiados en
`tools/pulse/`; la política de navegador vive en
`frontend/js/ape-v9/ape-crystal-hybrid.js`.

Su doctrina `UPSCALE_SIMULADO_VIDEO_FILTERS` (v1.0, 2026-11-23) fija:

| Perfil | Entrada nativa | Salida / lienzo | Modo |
|---|---|---|---|
| P0 | 7680×4320 | 5760×3240 (prefer_6k) | downsample 0.75× |
| P1 | 3840×2160 | 3840×2160 (prefer_4k) | identity |
| P1.5 | 3840×2160 | 5760×3240 | upscale 1.5×, 6K emulado |
| P3 | 1920×1080 | 3840×2160 | upscale 2× |
| P3.5 | 1920×1080 | 5760×3240 | upscale 3×, 6K emulado |
| P4 | 1280×720 | 3840×2160 | upscale 3× |
| P4.5 | 1280×720 | 5760×3240 | upscale 4.5×, 6K emulado |
| P5 | 854×480 | 3840×2160 | upscale 4.4965× |

Los doce perfiles declaran `execution.status=SIMULATED_EXECUTED`,
`transcode_executed=true`, `upscale_executed=true` y `upscale_mechanism=video_filters`.

## Regla de selección del `p`

| Altura de fuente | `p` del cartucho | Salida declarada |
|---|---|---|
| `>= 4320` (8K real) | `P0` (`max8k`) | 8K real / conservado, sin degradar a 4K |
| `2160..4319` (4K real) | `P1` (`max`) | 4K → P1.5 6K emulado por video filters |
| `< 2160` (480p/544p/720p/1080p) | `P1` (`max`) | **4K SIMULADO** por video filters |

## Implementación

| Archivo | Cambio |
|---|---|
| `tools/pulse/APE_FUSION_HIBRIDO_OPTIMO_12P.json` | Contrato `ape.crystal.hybrid/1` v9.4 (fuente de rutas/cartuchos) |
| `tools/pulse/ape-crystal-hybrid.cjs` | Módulo de referencia del propietario (sin modificar su lógica base) |
| `tools/pulse/ape-crystal-hybrid-owner.cjs` | Override: todas las resoluciones <8K → max; 8K → max8k P0 |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-crystal-hybrid.js` | Política de navegador (contrato + override), carga antes del generador |
| `tools/url2/ape-url-builder.js` | Plumbing `setPulseProfile`/`HYBRID_POLICY`; no decide la política |
| `tools/pulse/ape-pulse-wrap.js` | Carga JSON+módulo; `p` de la ruta (max P1 / max8k P0); tag con ROUTE/CARTRIDGE/P/SOURCE/TARGET; no reescribe URLs firmadas |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Usa `APECrystalHybrid.seleccionarHibridoOwner`; `p` + tag en el cableado `/pulse`; fallback si el módulo no carga |
| `IPTV_v5.4_MAX_AGGRESSION/generate_m3u8_v54_max_aggression.py` | `hybrid_pulse_url`/`hybrid_tag`; P1.5/P1 (P0 para 8K), sin gate por verificación |
| `IPTV_v5.4_MAX_AGGRESSION/scripts/generate_m3u8_pep_v5.py` | Igual para el generador PEP |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-output-panel.js` | JIT desactivado en el camino híbrido; `currentOutOpts()` fuerza `jit:false` con el flag de la App |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js` | Perfil por defecto P1; eleva P2..P5 guardados a P1 (respeta P0) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html` | Banner "TODAS LAS RESOLUCIONES", P1 activo, `APE_HYBRID_UPSCALE_ALL=true`, `APE_USE_JIT=false` |

## Rollback

```js
window.APE_HYBRID_CRYSTAL = false;   // app: vuelve al comportamiento previo
```

```bash
# envoltorio de servidor: no añade p/tag (rollback sin editar código)
APE_HYBRID_PULSE=0 node tools/pulse/ape-pulse-wrap.js --in <src> --out <dst>
# vuelve al contrato v9.4 puro (balanced/native, sin override de todas las resoluciones)
APE_HYBRID_UPSCALE_ALL=0 node tools/pulse/ape-pulse-wrap.js --in <src> --out <dst>
```

En código: revertir los archivos al commit anterior. El `p` de una URL
`/pulse/` se puede quitar sin tocar `u` ni `d`.

## Límites honestos

- El cartucho P1.5 **asume fuente 4K**; en una fuente 1080p/544p es una **fuente
  simulada**, no real. El tag `MODE=SIMULATED;EXECUTED=0` lo declara.
- El VPS **no hace upscale de píxeles**: el cartucho y el display ejecutan la
  cadena de video filters. El APK solo lee `#EXT-X-APE-LAB-METADATA`, atributos
  de `#EXTINF` y la URL; `#EXTHTTP` no se lee en `android/`.
- El `p` de la URL manda en el cartucho de `/pulse`; el `d.p` existente se
  conserva byte a byte. No se toca `u`.
- `p=P1` en fuentes 480p/720p/1080p/4K **no** convierte el bitstream en 4K:
  declara la salida simulada. No usar este parámetro para afirmar calidad real.
- 8K se conserva con `P0`/nativo: no existe un lienzo superior en el contrato;
  no se degrada a 4K. La afirmación "todas las resoluciones" aplica a todo
  `< 8K`; 8K es el techo.
- `generator_contract`: no se reescriben URLs firmadas (`fp`/`sig`/`token`); el
  puente de servidor las salta y lo cuenta en `hybrid_skipped_signed`.
