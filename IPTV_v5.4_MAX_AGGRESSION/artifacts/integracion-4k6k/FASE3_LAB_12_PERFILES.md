# Fase 3 — doce perfiles del LAB de fusión, verificación y staging

Continúa la fase 2. Todo lo que toca la app vive en el **worktree de staging**
(`C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING`); el árbol principal solo recibe documentos.

## 1 · Baseline revalidado en esta corrida (no citado de memoria)

| Comprobación | Resultado |
|---|---|
| commit reportado | `84f3231f` presente |
| adaptador | sha256 completo `7e72ee39eb98ce55a6e7f2acd077a1ac65fead7b4333afd5ecdf0f0eff5c198c` |
| documento fase 2 | `artifacts/integracion-4k6k/FASE2_LAB_REVIEW.md` existe |
| suite Node | `node frontend/tests/ape-4k6k-audit-adapter.test.js` → **PASS 204 · FAIL 0** |
| entorno | Windows 11 · Node (repo) · Chrome 157.0.8103.80 |

## 2 · Identidad del LAB de fusión (fijada antes de importar)

```
fichero  APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO(1).json
bytes    1702316
sha256   8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab
_meta    type=all_profiles · version=APE_v9.0 · exported=2026-11-20T03:52:30.647Z
root     _meta, profiles            (profiles_calibrated AUSENTE)
```

Copia privada en `%TEMP%\lab-rev\` con el mismo sha256; el original no se modifica y **no se copia al repo**.

Verificador del paquete ejecutado con el LAB real:

```
python verificar_lab.py --input <copia> --output-dir <out>
→ IDENTITY 1702316 8c11e781…
→ STRUCTURAL_CHECKS 9 / 9   (12 IDs exactos, sin claves duplicadas, rutas completas,
                             profiles_calibrated ausente, atomic_zapping declarativo)
```

`cascade_semantics` del propio LAB: P0 ruta `prefer_6k`, `source_larger_than_canvas=downsample_once`,
`preferred_fps=[120,60,30]`. **No se activa** el downsample ni la cascada de fps: quedan declarados.

## 3 · Importación de las dos familias — el defecto real y su arreglo

El importador activo no podía cargar este LAB por **dos** motivos medidos en el código:

| Línea | Comprobación | Consecuencia |
|---|---|---|
| `ape-lab-import-helper.js:197` | `if (!data.profiles_calibrated) throw` | «JSON inválido: falta profiles_calibrated» |
| `ape-lab-import-helper.js:199` | exige `lab_version` `omega_*` o `bulletproof===true` | este LAB no tiene ninguno |
| `profile-manager-v9.js:6151` | `data.profiles_calibrated \|\| {}` | diff del import a cero |
| `ape-profiles-config.js:5138` | `data.profiles_calibrated \|\| {}` | aplica cero perfiles |

Arreglo (staging, aditivo): nuevo `js/ape-lab-normalize.js` + uso del normalizador en el helper y en
los dos lectores. Reglas: acepta `profiles_calibrated` **o** `profiles`; si vienen **las dos y
distintas** ⇒ **BLOQUEA** sin elegir; IDs exactos (nada de `parseInt` ni recortar el `.5`); no
inventa campos; no muta la entrada. Cargado antes del helper en el index.

Medido con los dos LAB reales:

```
B familia=profiles ok=true ids=12 -> P0,P1,P2,P3,P4,P5,P0.5,P1.5,P2.5,P3.5,P4.5,P5.5
B lab_version=APE_v9.0 exported=2026-11-20T03:52:30.647Z   entrada intacta=true
A familia=profiles_calibrated ok=true ids=6  -> P0..P5
conflicto  ok=false  motivo=dos familias distintas … BLOQUEADA
sin perfiles ok=false motivo=falta profiles_calibrated o profiles
schema desconocido ok=false motivo=schema no soportado
```

## 4 · Matriz de los doce perfiles (medida contra el LAB real)

Procedencia del tuning: `profiles` del LAB de fusión (snapshot importado por el normalizador).
`linea_tag` = bytes de la línea `#EXT-X-APE-4K6K-INTENT:` que se emitiría.

| ID | perfil declara | objetivo sidecar | premium | `preserved` | línea_tag B | >4096 | importación | OFF equiv. | ON aditivo | export/reimport | restauración | consumidor | renderer | cadencia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 7680x4320 | **7680x4320** | **7680x4320** | true | 854 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P1 | 3840x2160 | 3840x2160 | 5760x3240 | false | 855 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P2 | 3840x2160 | 3840x2160 | 5760x3240 | false | 855 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P3 | 1920x1080 | 3840x2160 | 5760x3240 | false | 855 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P4 | 1280x720 | 3840x2160 | 5760x3240 | false | 854 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P5 | 854x480 | 3840x2160 | 5760x3240 | false | 853 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P0.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P1.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P2.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P3.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P4.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |
| P5.5 | 5760x3240 | 5760x3240 | 5760x3240 | false | 857 | no | PASS | PASS | PASS | PASS | PASS | BLOCKED | NOT_RUN | NOT_RUN |

`IDS_IMPORTADOS=12 · max_linea_tag=857 bytes` (presupuesto de 4096 por línea: holgado).
`preserved=false` en P2.5 **no** significa pérdida: el perfil ya pedía 5760x3240 y el sidecar declara
ese mismo valor; el booleano solo marca «el perfil superaba al premium_6k» (ver §4).

OFF equivalente medido con el **generador real** y **los dos LAB**: `previo == off` byte a byte
(`a24ef8db…` con el bulletproof; `cab89726…` con el de fusión) y `on − sidecar == previo`.

## 5 · Conflictos que se PRESERVAN y se bloquean (no se maquillan)

| Conflicto | Estado | Qué hago |
|---|---|---|
| P0.5/P1.5 `settings.codec=AV1` vs `codec_full/codec_string` HEVC y `codec_primary=HEVC` | **BLOCKED** | el sidecar **no escribe** `settings.codec`; no resuelvo sin fuente autoritativa |
| `prefetch_config.aggression_levels` truncado con `...` en P0–P5 | **preservado opaco** | nunca `JSON.parse`/`eval` sobre él; no se sustituyen knobs por fragmentos |
| Cascada 120/60/30 y `downsample_once` del LAB | **declarado, no activado** | no se reducen fps ni se recorta lienzo |
| `atomic_zapping` | **declarativo** | no se llama a helpers ni se emiten POST/PUT |
| Herencia real del tuning 6K | **BLOCKED** | el overlay declara herencia pero hereda la base del repo, no el LAB de fusión |

## 6 · Límites de esta corrida (NOT_RUN, con motivo)

- **App-path por perfil en navegador**: no ejecutado. El arnés de Chrome carga el index real y prueba
  el adaptador (fase 2), pero recorrer los 12 IDs por la **selección real del profile manager** con
  fixtures de vídeo exige montar el flujo de importación completo + media local; no se hizo. Las
  columnas `renderer` y `cadencia` quedan NOT_RUN: la metadata no prueba frames, libavfilter ni VPP.
- **Consumidor del sidecar**: no existe uno probado (BLOCKED por diseño).
- **Memoria/cancelación del pipeline con 700 MB**: no medido en navegador.
- **Gates HTTP y device**: FAIL/NO COMPUTADO se conservan tal cual de la fase 2.

## 7 · Rollback

- Staging: `git worktree remove --force C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING`.
- Diff de esta fase: sólo añade `js/ape-lab-normalize.js`, su `<script>` y tres sustituciones con
  fallback (`if (global.APELabNormalize) … else <comportamiento anterior>`). Sin el fichero, el
  importador vuelve a comportarse como antes: la skill y el adaptador no se tocan.
- La habilidad instalada no se desinstala.

## 8 · Verificación del esquema por perfil (medida, no supuesta)

```
P0..P5   claves=34   faltan_vs_P0=0
P0.5..P4.5 claves=30 faltan_vs_P0=10 -> color,headers,lab_sync,calibration_version,
                       buffer_aggression_policy,error_decision_tree,error_407_specialized_tree,
                       multi_provider_integration,master_audit_unified,guarantees_10
P5.5     claves=29   + quality_levels (total 11 ausentes)
P5.5 tiene quality_levels=false
aggression_levels truncado con "..." en = P0,P1,P2,P3,P4,P5 (6)
```

La ausencia **no lanza** y **no cambia el ID**: el normalizador y el adaptador sólo leen `settings`,
`vlcopt`, `kodiprop` y las claves que cada perfil trae; los árboles 407/lab_sync ausentes en los `.5`
no se fabrican y el sidecar no los toca.

## 9 · Doce IDs en Chrome real (sin forzar P0)

Arnés [`fase3-browser-12perfiles.js`](fase3-browser-12perfiles.js): sirve el `frontend/` del worktree por
loopback y expone `/lab.json` apuntando a la **ruta privada** del LAB (no se copia al repo), abre
`_fase3_12perfiles.html` en Chrome 157 `--headless=old --dump-dom`, normaliza el LAB real con
`js/ape-lab-normalize.js`, lo aplica a `APE_PROFILES_CONFIG.profiles` y recorre los 12 IDs.

```
loaded=true family=profiles ids=12 error=none
P0   | 7680x4320 | 7680x4320 | true  | 854 bytes | offIdent=true
P1   | 3840x2160 | 5760x3240 | false | 855 | true
P2   | 3840x2160 | 5760x3240 | false | 855 | true
P3   | 3840x2160 | 5760x3240 | false | 855 | true
P4   | 3840x2160 | 5760x3240 | false | 854 | true
P5   | 3840x2160 | 5760x3240 | false | 853 | true
P0.5 | 5760x3240 | 5760x3240 | false | 857 | true
P1.5 | 5760x3240 | 5760x3240 | false | 857 | true
P2.5 | 5760x3240 | 5760x3240 | false | 857 | true
P3.5 | 5760x3240 | 5760x3240 | false | 857 | true
P4.5 | 5760x3240 | 5760x3240 | false | 857 | true
P5.5 | 5760x3240 | 5760x3240 | false | 857 | true
```

`offIdent=true` en los doce: con OFF no se emite sidecar en ningún perfil.

Lo que este arnés **no** es: no sustituye la selección del profile manager en la UI ni demuestra que
un perfil genere la lista por la ruta de la app. Eso sigue NOT_RUN, igual que renderer y cadencia.