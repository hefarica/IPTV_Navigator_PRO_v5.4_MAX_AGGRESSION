# APE CRYSTAL HYBRID v9.4 — integración del contrato + override del propietario

**Fecha:** 2026-11-24 · **Estado:** implementado en la app y en los generadores; **no desplegado al VPS** en esta ronda.  
**Entradas del propietario:**

- `APE_FUSION_HIBRIDO_OPTIMO_12P.json` — 1.913.242 B · SHA-256 `439e28447371cff6c849eef08989a5eed5403dd6ad001488527e9db3ada58c49`
- `ape-crystal-hybrid.cjs` — 1.900 B · SHA-256 `ed759f319c270b19cbc4287400445c2e61651a3ad338403120a62a7007fb1a1b`

## 1. Decisión vinculante

El contrato `ape.crystal.hybrid/1` define rutas `balanced` (P3.5, 1080p
emulado), `max` (P1.5, 4K simulado, `p=P1`) y `native` (fuente >1080 sin
escalar), con `max` solo para fuente medida/verificada.

El propietario **rechazó expresamente** ese gate:

> «NO NO NO NO. DEBE UPSCALING TODAS LAS RESOLUCIONES Y LO HACE ATRAVES DE VIDEO FILTER»

Regla aplicada:

| Fuente | Ruta | Cartucho | `p` | Salida declarada |
|---|---|---|---|---|
| 480p / 544p / 720p / 1080p | `max` | P1.5 | **P1** | 4K simulado + 6K emulado por video filters |
| 4K (2160p) | `max` | P1.5 | **P1** | 6K emulado por video filters |
| 8K (4320p) | `max8k` | P0 | **P0** | 8K conservado (techo, no se degrada) |
| desconocida | `max` | P1.5 | **P1** | 4K simulado |

No se declara que el bitstream de entrada sea 4K: el tag emite
`MODE=SIMULATED;EXECUTED=0` y `SOURCE_PX` real/desconocido.

## 2. Integración

| Archivo | Rol |
|---|---|
| `tools/pulse/APE_FUSION_HIBRIDO_OPTIMO_12P.json` | Contrato/copia del JSON del propietario |
| `tools/pulse/ape-crystal-hybrid.cjs` | Módulo de referencia, sin cambios |
| `tools/pulse/ape-crystal-hybrid-owner.cjs` | Override: todo `<8K` → `max`; 8K → `max8k`; `upscaleAll=false` recupera el contrato |
| `IPTV_v5.4_MAX_AGGRESSION/contracts/lab/APE_FUSION_HIBRIDO_OPTIMO_12P.json` | Copia versionada en el repo |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-crystal-hybrid.js` | Política de navegador (mismo contrato + owner); carga antes del generador |
| `tools/pulse/ape-pulse-wrap.js` | Carga JSON+módulo; `p` según ruta; tag `#EXT-X-APE-HYBRID-PULSE`; **no reescribe URLs firmadas** (`fp`/`sig`/`token`) |
| `tools/url2/ape-url-builder.js` | `setPulseProfile`, `omitProfile` para rutas sin `p` |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Usa `APECrystalHybrid.seleccionarHibridoOwner`; `p` + tag; fallback si el módulo no carga |
| `IPTV_v5.4_MAX_AGGRESSION/generate_m3u8_v54_max_aggression.py` | Toda URI por `/pulse` con `p=P1` (P0 en 8K); tag de ruta |
| `IPTV_v5.4_MAX_AGGRESSION/scripts/generate_m3u8_pep_v5.py` | Igual para el generador PEP |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/generation-output-panel.js` | JIT fuera del camino híbrido |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/profile-manager-v9.js` | Perfil por defecto P1; eleva P2..P5 guardados |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html` | Carga el módulo, banner "TODAS LAS RESOLUCIONES", `APE_HYBRID_UPSCALE_ALL=true`, `APE_USE_JIT=false` |

## 3. Verificación ejecutada

### 3.1 Envoltorio de servidor (fixture 1080p / 4K / 8K / 720p ya envuelto)

```json
{
  "hybrid_routes": {"max": 2, "max8k": 1},
  "hybrid_tag": 4,
  "hybrid_upgraded": 1,
  "hybrid_config_version": "APE_v9.4_CRYSTAL_HYBRID_12P"
}
```

| Canal | `p` | Tag |
|---|---|---|
| 1080p | `P1` | `ROUTE=max;CARTRIDGE=P1.5;P=P1;SOURCE_PX=1920x1080;TARGET=3840x2160;MODE=SIMULATED` |
| 4K | `P1` | `ROUTE=max;...SOURCE_PX=3840x2160;...MODE=SIMULATED` |
| 8K | `P0` | `ROUTE=max8k;CARTRIDGE=P0;P=P0;...MODE=NATIVE` |
| 720p ya envuelto | `P1` | se actualiza `p` sin duplicar el tag |

### 3.2 URL firmada

Entrada `/pulse/9.m3u8?u=…&d=abc&fp=deadbeef`:

- salida **idéntica** (`d=abc&fp=deadbeef`), sin `p`;
- `hybrid_skipped_signed: 1` (generator_contract).

### 3.3 Modo contrato (`APE_HYBRID_UPSCALE_ALL=0`)

| Canal | Ruta | `p` |
|---|---|---|
| 1080p | max | P1 |
| 4K | native | **ninguno** |
| 8K | native | **ninguno** |
| 720p ya envuelto | max | P1 |

`hybrid_routes={"max":1,"native":2}`; las rutas sin `p` usan `omitProfile`.

### 3.4 Tests

| Test | Resultado |
|---|---|
| `tools/url2/test_ape_url_builder.js` | **25 PASS / 0 FAIL** |
| `frontend/tests/rea-generation-dispatch.test.js` | **39 PASS / 0 FAIL** |
| `frontend/tests/ape-load-fast-and-pulse.test.js` | **44 PASS / 0 FAIL** |
| `frontend/tests/gen-output-panel-format.test.js` | **36 PASS / 0 FAIL** |
| `frontend/tests/ape-r17-doctrina-y-adyacencia.test.js` | **46 PASS / 0 FAIL** |
| `frontend/tests/ape-crystal-hybrid-owner.test.js` | **4 PASS / 0 FAIL** |
| `node -c` × 6 JS + `ast.parse` × 2 Python | OK |

### 3.5 App local (Live Server :5500)

```
index: ape-crystal-hybrid=True banner=TODAS LAS RESOLUCIONES
module: 200 len=9112 owner=True
generator: 200 len=994099 ownerRef=True
```

## 4. Rollback

```js
window.APE_HYBRID_CRYSTAL = false;       // app: desactiva p/tag
```

```bash
APE_HYBRID_PULSE=0 node tools/pulse/ape-pulse-wrap.js --in <src> --out <dst>
APE_HYBRID_UPSCALE_ALL=0 node tools/pulse/ape-pulse-wrap.js --in <src> --out <dst>  # contrato puro
APE_HYBRID_REQUEST_4K=0 ...                                                          # balanced (contrato)
```

## 5. Límites honestos

- `p=P1` **no** convierte el bitstream en 4K; declara la salida simulada por
  video filters del cartucho/display. `EXECUTED=0` lo dice.
- 8K se conserva en P0: no hay lienzo superior en el contrato; no se degrada a
  4K. "Todas las resoluciones" aplica a todo `< 8K`.
- El VPS no hace upscale de píxeles: selecciona el cartucho; el display ejecuta
  los filtros. El APK solo lee LAB + EXTINF + URL.
- `apply_to_all_generators` cubre el generador principal JS, el envoltorio de
  servidor, el builder y los dos generadores Python del pipeline. Los scripts
  legacy que no pasan por `/pulse` se cubren ejecutando `ape-pulse-wrap` sobre su
  salida; no se ha medido cada script histórico uno a uno.
- **No desplegado**: para producción hay que copiar
  `ape-pulse-wrap.js`, `ape-crystal-hybrid.cjs`, `ape-crystal-hybrid-owner.cjs` y
  `APE_FUSION_HIBRIDO_OPTIMO_12P.json` a `/opt/ape-pulse/`, y subir la
  `WRAPPER_VERSION` (y la del `ape-pulse-sync.sh`) o correr `--force`.
