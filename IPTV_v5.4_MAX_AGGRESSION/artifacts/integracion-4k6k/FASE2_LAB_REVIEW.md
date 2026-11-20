# Revisión del LAB del propietario — `APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json`

## 1 · Identidad medida

| Propiedad | Valor |
|---|---|
| bytes | 1.702.316 |
| sha256 | `8c11e78148b64a3a…` |
| `_meta.type` | `all_profiles` |
| `_meta.version` | `APE_v9.0` |
| `_meta.exported` | `2026-11-20T03:52:30.647Z` |
| claves de primer nivel | `_meta`, `profiles` (12) |
| `profiles_calibrated` | **AUSENTE** |

`_meta` trae además `display_cascade` (post-decode local, cadencia nativa → 120 → 60 → 30),
`atomic_zapping` (`ape.local.atomic_zapping/1`, **contrato declarativo**: «El adaptador necesita
implementar los eventos y las acciones»), `fusion` (Premium 6K/4K · 120/60/30 fps · zapping atómico)
y `source_sha256` de sus insumos (workbook `.xlsx` + `APE_ALL_PROFILES_…json`).

## 2 · Los 12 perfiles, medidos

| Perfil | Nombre | `settings.resolution` | codec | fps | buffer | bitrate | fitness |
|---|---|---|---|---|---|---|---|
| P0 | 8K Master | **7680x4320** | DVH1 | 30 | 19000 | 200 | 0,7398 |
| P1 | 4K UHD Pro | 3840x2160 | HVC1 | 60 | 12000 | 40 | 1 |
| P2 | 4K Balanced | 3840x2160 | HVC1 | 30 | 10000 | 37,3 | 1 |
| P3 | FHD 1080p | 1920x1080 | HVC1 | 60 | 8000 | 18,7 | 0,9909 |
| P4 | HD 720p | 1280x720 | HVC1 | 30 | 10000 | 4,1 | 0,2502 |
| P5 | SD 480p | 854x480 | AVC1 | 30 | 5000 | 1,8 | 0,2175 |
| P0.5 | 6K Emulated (P0) | 5760x3240 | AV1 | 60 | 15000 | 89,6 | 0,7398 |
| P1.5 | 6K Emulated (P1) | 5760x3240 | AV1 | 60 | 12000 | 89,6 | 1 |
| P2.5 | 6K Emulated (P2) | 5760x3240 | H265 | 60 | 10000 | 112 | 1 |
| P3.5 | 6K Emulated (P3) | 5760x3240 | H265 | 60 | 10000 | 112 | 0,9909 |
| P4.5 | 6K Emulated (P4) | 5760x3240 | H265 | 60 | 10000 | 112 | 0,2502 |
| P5.5 | 6K Emulated (P5) | 5760x3240 | H265 | 60 | 12000 | 112 | 0,2175 |

Cada perfil lleva 34 claves con `settings`, `vlcopt`, `kodiprop`, `headerOverrides`,
`prefetch_config`, `quality_levels`, `hlsjs`, `bounds`, `optimized_knobs` (presente en los 12),
`player_enslavement`, `actor_injections`, `lab_sync`, `buffer_aggression_policy`,
`error_decision_tree` y `error_407_specialized_tree`.

## 3 · Conflictos que este LAB destapó — y qué se corrigió

### 3.1 · P0 es 8K: mi sidecar declaraba 4K fijo ⇒ era una degradación de declaración

`buildIntent()` escribía `targetResolution: '3840x2160'` y `premiumResolution: '5760x3240'` para
**todos** los perfiles. Sobre P0 (`7680x4320`) eso declara un objetivo **por debajo** del perfil:
la ley anti-degradación no prohíbe solo recortar bitstream, también declarar menos de lo que el
perfil ya tiene.

Regla aplicada ahora, con la resolución real del perfil (`APE_PROFILES_CONFIG.profiles[pid].settings.resolution`):

> `objetivo = max(perfil, standard_4k)` · `premium = max(perfil, premium_6k)` · nunca por debajo.

Medido tras el cambio:

| Perfil | resolución del perfil | objetivo del sidecar | premium | `profileTargetPreserved` |
|---|---|---|---|---|
| P0 | 7680x4320 | **7680x4320** | **7680x4320** | `true` |
| P1 | 3840x2160 | 3840x2160 | 5760x3240 | `false` |
| P3 | 1920x1080 | 3840x2160 (simulado) | 5760x3240 | `false` |
| P2.5 | 5760x3240 | 5760x3240 | 5760x3240 | `false` |

Se añade `profileTarget` (lo que el perfil ya tenía) y `profileTargetPreserved` para que el consumidor
pueda comprobarlo sin leer el LAB.

### 3.2 · `profiles_calibrated` no existe: el E2E del repo no puede cargar este LAB

`frontend/tests/e2e-bulletproof-full-audit.js` hace `lab.profiles_calibrated` y fallaría con este
fichero. El arnés de comparación ahora acepta **las dos formas** (`profiles_calibrated || profiles`)
y declara cuál usó. No se tocó el test del propietario.

### 3.3 · `atomic_zapping` es un contrato **declarativo**

`_meta.atomic_zapping.activation` dice literalmente que el adaptador tiene que implementar eventos y
acciones. Este LAB **no** implementa zapping: describe. Mi integración no toca zapping (fase 1 §7), y
así queda declarado.

### 3.4 · Los perfiles 6K no se heredan desde el LAB (hueco real)

Mi `overlay()` **declara** `inherit_existing_visual_tuning: true` y construye P0.5..P5.5 heredando la
base de 6 perfiles del repo. Este LAB trae tuning propio para los 6K (AV1/H265, buffers 10000-15000,
bitrate 89,6-112). **No se leen**: leerlos y fusionarlos sin consumidor probado fue justo lo que la
fase 1 prohibió. Queda como pendiente explícito, no como hecho.

## 4 · Prueba con este LAB: OFF sigue siendo idéntico

Arnés `gen-4k6k-compare.js`, mismo LAB (`APE_LAB_JSON_PATH`), 10 canales, azar fijado:
`lab=profiles perfiles=12 version=APE_v9.0`.

| Estado | Bytes | Líneas | EXTINF | URIs | EXTSHIMOTT | Sidecar | sha256 |
|---|---|---|---|---|---|---|---|
| previo | 653.715 | 10.270 | 10 | 10 | 10 | 0 | `cab89726…` |
| OFF | 653.715 | 10.270 | 10 | 10 | 10 | 0 | `cab89726…` |
| ON | 662.205 | 10.280 | 10 | 10 | 10 | **10** | `dbe44ebe…` |

```
previo == off             : true
on − sidecar == previo    : true
sidecar en ON             : 10 (uno por canal)
EXTSHIMOTT previo / on    : 10 / 10
URIs previo / on          : 10 / 10
```

## 5 · Límites de esta revisión

- El arnés fuerza `forceProfile: 'P0'` (como el E2E del repo porque `determineProfile` necesita
  navegador), así que **se ejercitó la ruta de emisión P0 (8K)**, no las rutas P*.5. El objetivo 6K
  se verificó por separado en Node contra `settings.resolution` de los 12 perfiles (tabla §3.1).
- El LAB **no se ha copiado al repositorio**: es dato del propietario. Se cita por sha256.
- `_meta.source_sha256` liga este LAB a su workbook `.xlsx`; no se abrió el libro.
