# VERIFICACIÓN — 12 perfiles, clasificador, plugin y skills (sin regresiones)

**Fecha de medición:** 2026-11-15T02:00–02:03 −05:00
**Workspace:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Rama:** `deploy/engine-restart-20261112`
**HEAD:** `03bf4a67 fix(panel): el VPP decia "sin dato" cuando el device SI puede medirlo`
**Rol:** miembro `[verificar]` — integración y verificación independiente.
**Scope de escritura:** SOLO este archivo. No se modificó nada del trabajo de los otros tres.

Reglas aplicadas: (1) ningún PASS sin el comando corrido en esta sesión; (2) un FAIL se reporta,
no se tapa; (3) lo no medible se declara NO COMPUTADO con su razón; (4) no se toca el generador
(`m3u8-typed-arrays-ultimate.js`), ni `ape-profiles-config.js`, ni la lista servida.

---

## 0. Artefactos verificados (identidad)

| Artefacto | Bytes | SHA-256 |
|---|---:|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js` | 32.630 | `69969fa450ff7779009d20576fc66b4bb18f5da013d12b33146fd190353c38f8` |
| `dsh-plugins/ape-profile-studio/index.js` | 33.606 | `c4bca2fcd3abb05c76dedd6dd28c0f3bd6df8fe4bb57dc8511a85a0003d4f7b1` |
| `dsh-plugins/ape-profile-studio/client.js` | 44.490 | `a26ed8e393901c0017fc423d4a46f6790416b86974c87bc59f87f948e2f555e8` |
| `tools/quality/test_ape_profile_classifier.js` | 22.609 | `323cb9a76adbd859d635c6d694623c2027a492c6c8aee779a0675b04853bf186` |
| `contracts/ape_profiles_12.json` | 28.145 | `72fa47d27922eca4a47b826f501b24f0bac5f5578930cde2d2d78dff193dfcc7` |
| `artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json` (fuente citada por el contrato) | 586.587 | `71307d9a6ce49cf4d384c6c894093e15011891306107b970de6768efff953e30` |

El SHA-256 del LAB **coincide** con el declarado en `contracts/ape_profiles_12.json`
(`provenance.canonical_12_artifact.sha256`). Medido con `Get-FileHash -Algorithm SHA256` y
recalculado en Python; ambos dan el mismo valor.

Entorno: `node v24.12.0`, `python 3.12.10`, `python3 3.14.2`, PyYAML 6.0.3.

---

## 1. `node -c` sobre los tres archivos → **PASS (3/3)**

Comando (uno por archivo):

```powershell
node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js
node -c dsh-plugins/ape-profile-studio/index.js
node -c dsh-plugins/ape-profile-studio/client.js
```

Salida medida (sin stdout, exit code por archivo):

```
node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js -> EXIT 0
node -c dsh-plugins/ape-profile-studio/index.js -> EXIT 0
node -c dsh-plugins/ape-profile-studio/client.js -> EXIT 0
```

`-c` es el alias de `--check` en Node 24: valida sintaxis sin ejecutar. Cero salida = cero error de parseo.
**Veredicto: PASS.**

---

## 2. `node tools/quality/test_ape_profile_classifier.js` → **PASS (74/74, exit 0)**

Comando:

```powershell
node tools/quality/test_ape_profile_classifier.js
```

Cola de salida medida:

```
=== RESUMEN ===
PASS: 74
FAIL: 0

RESULTADO: PASS (todos los casos)
EXIT CODE TEST = 0
```

Los casos se muestran y cubren tres bloques:

- **§0 Integridad del contrato (10 casos):** 12 perfiles exactos, ids medidos en el LAB v24,
  `fallback_chain` como array, ninguna cadena que suba salvo la arista documentada `P0.5→P0`
  (downsample 8K), invariante `fuse_bps ≤ design_bps` en 12/12, 6 emulados con `base_profile` y `truth_guard`.
- **§1 Los 9 pares P+T reales (19 aserciones):** P3+T5 14.462, P3+T6 4.405, P3+T7 1.320,
  P1+T8 672, P1+T9 255, P3+T9 35, P4+T5 20, P1+T5 6, P5+T5 5 → todos al perfil declarado.
  Incluye la aserción honesta: **los 9 pares suman 21.180, no 21.224**, con la nota
  `hueco declarado: 44 canales sin par atribuido -> NO COMPUTADO, no se rellenan`.
- **§2 Casos borde (45 casos):** 4K real → P1 y nunca a FHD; fake-4k 1920×1080 → P3 y no P1;
  sin probe ni tokens → P5 `no_evidence`; premium sin probe → P1 con confidence baja declarada
  como HIPÓTESIS; 8K verificado → P0; L153 sobre 8K y L120 sobre 2160p disparan contradicción;
  fallback de un escalón según decoder; ningún probe de 3240p devuelve un `.5`; determinismo.

El test es coherente con el contrato: no hay ningún caso que afirme 21.224 como censo cerrado.
**Veredicto: PASS.**

---

## 3. `python3 -m json.tool contracts/ape_profiles_12.json` → **PASS (con salvedad de formato)**

Comando:

```powershell
python3 -m json.tool contracts/ape_profiles_12.json > $env:TEMP\ape_profiles_12.pretty.json
```

Salida: `EXIT = 0`, stderr vacío, **681 líneas** de JSON embellecido. Parsea.

Conteo y auditoría de `source` (script Python que recorre `profiles[]` y **resuelve cada
referencia**, no solo la mira):

| Perfil | `source` declarado | Referencia verificada |
|---|---|---|
| P0 | `measured:artifacts/LAB_...6K.json#/profiles_calibrated/P0` + `measured:...ape-profiles-config.js:559` | puntero resuelve (`id=P0`, `settings.resolution=7680x4320`); línea 559 = `"P0": {` |
| P0.5 | `measured:artifacts/LAB_...6K.json#/profiles_calibrated/P0.5` | puntero resuelve (`id=P0.5`, `name=6K Emulated (P0)`) |
| P1 | `#/profiles_calibrated/P1` + `config.js:1196` | puntero resuelve (`id=P1`); línea 1196 = `"name": "SUPREME_4K_HDR"` |
| P1.5 | `#/profiles_calibrated/P1.5` | puntero resuelve |
| P2 | `#/profiles_calibrated/P2` + `config.js:1830` | puntero resuelve; línea 1830 = `"name": "ELITE_4K_BALANCED"` |
| P2.5 | `#/profiles_calibrated/P2.5` | puntero resuelve |
| P3 | `#/profiles_calibrated/P3` + `config.js:2324` | puntero resuelve; línea 2324 = `"name": "ULTRA_FHD_STABLE"` |
| P3.5 | `#/profiles_calibrated/P3.5` | puntero resuelve |
| P4 | `#/profiles_calibrated/P4` + `config.js:2958` | puntero resuelve; línea 2958 = `"name": "HIGH_HD_COMPATIBLE"` |
| P4.5 | `#/profiles_calibrated/P4.5` | puntero resuelve |
| P5 | `#/profiles_calibrated/P5` + `config.js:3592` | puntero resuelve; línea 3592 = `"name": "SD_FAILSAFE_UNIVERSAL"` |
| P5.5 | `#/profiles_calibrated/P5.5` | puntero resuelve |

Resultados duros:

- **Perfiles declarados: 12** (`profiles` es un array; P0..P5 + P0.5..P5.5). Coincide con
  `profiles_calibrated` del LAB, que también tiene **12 claves** (medido: `Object.keys() = 12`).
- **`source` presente en 12/12.** Ninguno dice `measured` sin referencia: **12/12 referencias
  resuelven** (6 con `ruta:línea` de config + puntero JSON; 6 con puntero JSON solo).
- `derived:` aparece donde corresponde (la `codec_ladder.source` de los `.5` declara que el LAB
  no publica ladder propio para el derivado y que se compone del `settings.codec_full` medido +
  la ladder de su `base_profile`). No se encontró ningún `measured` huérfano.

**Salvedad declarada (no es FAIL, es desviación de formato):** 6 de los 12 (los derivados `.5`)
no llevan `:línea`; su `source` es un **puntero JSON** `ruta#/profiles_calibrated/<id>`. Bajo una
lectura literal de “measured:<ruta>:<línea>”, esos 6 no cumplirían la forma; bajo el criterio de
verificabilidad —que es el que importa para no mentir— los 6 son verificables y los resolví, y el
objeto resuelto tiene `id` igual al perfil. Se deja escrito para que el capitán decida si exige
`:línea` también a los derivados. **No se reporta como fallo porque no hay `measured` sin artefacto
comprobable.**

**Veredicto: PASS** (12/12 perfiles, 12/12 fuentes verificables), con la salvedad de forma arriba.

---

## 4. El generador NO se tocó → **PASS (con prueba byte a byte)**

### 4.1 `git status --porcelain` completo (15 entradas)

```
?? .agents/skills/iptv-4k-pipeline-automation/
?? .agents/skills/iptv-4k-source-truth-audit/
?? .agents/skills/iptv-profile-fallback-doctrine/
?? .agents/skills/iptv-real-resolution-verifier/
?? .agents/skills/iptv-supreme-repos-4k/
?? .agents/skills/iptv-supreme-repos-atlas/
?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-metapack.sh
?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js
?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape_metapack.py
?? contracts/ape_profiles_12.json
?? dsh-plugins/ape-profile-studio/
?? dsh-plugins/iptv-4k-supremo/
?? dsh-plugins/upscale-lab/
?? tools/quality/check_sr_rules.js.bak-20261114T093438
?? tools/quality/test_ape_profile_classifier.js
```

**Ni `m3u8-typed-arrays-ultimate.js` ni `ape-profiles-config.js` aparecen** (ni como ` M`,
ni como `??`). Filtro regex explícito sobre la misma salida: `SIN COINCIDENCIAS`.

### 4.2 Prueba de identidad contra HEAD (más fuerte que “no aparece”)

```
FILE : .../ape-v9/m3u8-typed-arrays-ultimate.js
HEAD : a941199831680242b161575467d68c25ffac3524
WT   : a941199831680242b161575467d68c25ffac3524   IGUAL: True

FILE : .../ape-v9/ape-profiles-config.js
HEAD : 5a3a63044b00263b33ddd5e2d0250291f1d3e32d
WT   : 5a3a63044b00263b33ddd5e2d0250291f1d3e32d   IGUAL: True
```

`git diff --stat HEAD -- <los dos archivos>` → **vacío**. `git hash-object` del working tree ==
blob de HEAD en ambos: **cero bytes cambiados**, no solo “sin cambios detectados”.
Corroboración externa: el `selfcheck` del plugin mide `ape-profiles-config.js` con
SHA-256 `2961d1ba4d799c5ce13f58b383c151a6ac2b0d26f703522aff7d13f97409c1da`, idéntico al
`Get-FileHash` de esta verificación.

**Veredicto: PASS.**

---

## 5. Lista servida intacta + gate del VPS → **PASS**

### 5.1 Lista servida

Comando exacto:

```bash
curl -sk -o /dev/null -w '%{http_code} %{size_download}' \
  -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' \
  'https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'
```

Salida medida (se agregó `%{content_type}` para contexto):

```
200 4023576 application/vnd.apple.mpegurl
```

**200 y 4.023.576 B exactos** (el esperado era ~4.023.576 B). `HEAD` del mismo recurso:
`Content-Length: 186789613`, `Content-Type: application/vnd.apple.mpegurl`,
`Cache-Control: no-store`, `Accept-Ranges: bytes`, `ETag "6af94d56-b222eed"`.

### 5.2 Gate del VPS

Comando (`ssh` con la clave del operador, `BatchMode`, solo lectura):

```bash
ssh -i C:\Users\HFRC\.ssh\id_ed25519_hetzner -o BatchMode=yes -o ConnectTimeout=20 \
    root@178.156.147.234 "bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json"
```

Salida medida (exit 0):

```json
{"verdict":"PASS","pass":10,"fail":0,"base":"https://iptv-ape.duckdns.org","checks":[
 {"check":"health","status":"PASS","detail":"200|3|0.028536"},
 {"check":"jit-calidad","status":"PASS","detail":"206 · #EXT-X-APE-CHANNELS:21224"},
 {"check":"lista-cableada","status":"PASS","detail":"200 · #EXT-X-APE-CHANNELS:21224 · EXTINF(4MB)=68 · /pulse/=67"},
 {"check":"canary","status":"PASS","detail":"302|0|0.206447"},
 {"check":"pulse-canal","status":"SKIP","detail":"407|124|0.328484 (canal bloqueado por el proveedor, no por el flujo)"},
 {"check":"endpoint-canal","status":"PASS","detail":"200|273|0.058126"},
 {"check":"vigilante","status":"PASS","detail":"200|1530|0.034237"},
 {"check":"disco","status":"PASS","detail":"82% usado · 6.6G libre"},
 {"check":"cache-resolucion","status":"PASS","detail":"JSON valido · 28 canales medidos"},
 {"check":"vigilante-fresco","status":"PASS","detail":"OK · escrito hace 57s"},
 {"check":"proyeccion","status":"PASS","detail":"186789613B · 21224 canales · 21224 tags · 0 APE"}]}
```

**`verdict: PASS`, `pass: 10`, `fail: 0`.** Se declara el matiz: el JSON trae **11 entradas**
porque `pulse-canal` es **SKIP** (el proveedor devolvió 407, no el flujo). El script no lo cuenta
como pass ni como fail; por eso 10 PASS + 1 SKIP. No se convierte el SKIP en PASS: se reporta.
El check `proyeccion` **mide la propia lista**: 186.789.613 B, 21.224 canales, 21.224 tags
`#EXTINF`, 0 APE — corrobora que la lista servida sigue siendo la buena.

**Veredicto: PASS** (10/10, con 1 SKIP ajeno al flujo).

---

## 6. Las 3 skills nuevas: frontmatter válido → **PASS (3/3)**

Doble medición: el validador que entregó el compañero de skills **y** un parser independiente
(PyYAML 6.0.3, escrito en esta verificación).

Comando independiente:

```powershell
python $env:TEMP\verify_frontmatter.py
```

Salida:

```
[YAML] iptv-supreme-repos-atlas: parsea OK · claves=['name','description','specialist','kind']
       name=iptv-supreme-repos-atlas · desc_chars=407 · specialist=S1 · kind=anchor
[PASS] iptv-supreme-repos-atlas · fences=4 · bytes=8860
[YAML] iptv-real-resolution-verifier: parsea OK · claves=['name','description','specialist','kind']
       name=iptv-real-resolution-verifier · desc_chars=164 · specialist=S3 · kind=anchor
[PASS] iptv-real-resolution-verifier · fences=12 · bytes=11259
[YAML] iptv-profile-fallback-doctrine: parsea OK · claves=['name','description','specialist','kind']
       name=iptv-profile-fallback-doctrine · desc_chars=374 · specialist=S9 · kind=anchor
[PASS] iptv-profile-fallback-doctrine · fences=16 · bytes=11332

VEREDICTO FRONTMATTER: PASS
EXIT = 0
```

Criterios comprobados en las 3: línea 1 = `---`, cierre `---` presente, YAML parseable a un
diccionario, `name` presente e igual al nombre de carpeta, `description` presente y > 40 chars,
fences ``` balanceados. El validador del equipo
(`.agents/skills/iptv-supreme-repos-atlas/scripts/validate_skills.js`) da además
**`RESUMEN PASS=54 FAIL=0`, exit 0** (incluye `references.md`, secciones numeradas 1..13, tamaño).
Única diferencia entre ambos: el validador cuenta 141/254/244 líneas y mi parser 140/253/243 por
el salto final; no es material.

**Veredicto: PASS.**

---

## 7. Verificación extra (no exigida): el plugin monta y se ejerce

No estaba en la lista de 6, pero es la prueba de que el plugin no solo compila: monta su mitad
Host y su mitad Cliente y las ejerce sin instalar nada en el Harness.

| Comando | Salida | Exit |
|---|---|---:|
| `node dsh-plugins/ape-profile-studio/selfcheck.mjs` | `47/47 checks passed` (rutas API, classify real, rechazos 400/405, lista con `no_computado` honesto) | 0 |
| `node dsh-plugins/ape-profile-studio/client-check.mjs` | `36/36 checks passed` (sidebar id/orden 21, panel, locale en/es con mismas claves, 12 filas del contrato, mismatch declarado-vs-lista) | 0 |

Bundle: `package.json`, `locale/en.json`, `locale/es.json` parsean como JSON; `cordis.patch.yml`
parsea como YAML (lista). El `selfcheck` reporta contrato `found` con `count: 12` y clasificador
`found` con SHA-256 `69969fa4…` (igual al de la tabla §0).

**Veredicto: PASS** (integración local; ver §9 para lo que NO cubre).

---

## 8. Hallazgo independiente F-1 — el clasificador NO reproduce el `ape-profile` de la lista en la muestra medida

No es una de las 6 verificaciones, pero es la comprobación que evita dar por bueno un número
declarado. Método: se pidió un **slice real** de la lista servida con `Range` y sin gzip
(`HTTP 206`, 400.000 B, 45 canales), se parseó la línea `#EXTINF` de cada canal y se clasificó
con el clasificador real, comparando contra el atributo `ape-profile=` que la lista ya trae.

```
curl.exe -sk -H 'Accept-Encoding: identity' -r 0-399999 \
  'https://iptv-ape.duckdns.org/lists/...CABLEADA_LIGHT.m3u8' -o slice.m3u8
HTTP=206 BYTES=400000   ·   45 canales en el slice
```

Distribución medida (declarado → clasificado):

```
P1 -> P1 : 22
P3 -> P1 : 23
```

Ejemplo textual de la respuesta del clasificador para un canal real
(`tvg-id=1`, `BEIN SPORTS FHD [EVEST]`, declarado `P3`):

> `probe ausente o fallido; se usa el perfil superior de la cadena implicada por los tokens
> [FHD, HD, BeIN, Sports] -> P1. ES UNA HIPOTESIS, no una medida: confidence baja.`

Lectura correcta del hallazgo:

1. **No es una regresión**: no se tocó la lista ni el generador; el clasificador es un artefacto
   nuevo y de solo lectura.
2. **No viola la ley anti-degradación**: las 23 divergencias **suben** (P3→P1), no bajan; y la
   respuesta se etiqueta `confidence: low` con `reason` que dice “ES UNA HIPOTESIS”.
3. **Pero la equivalencia “clasificador = perfil de la lista” es FALSA** para 23 de 45 canales
   de esta muestra. Si alguien usa el clasificador para reescribir perfiles, 23/45 de estos
   canales pasarían a declararse 4K (P1) sin probe que lo sostenga.
4. **La muestra está sesgada**: son los primeros 45 canales (grupo premium de deportes, todos
   con tokens `FHD/HD/BeIN/Sports`). La divergencia sobre los 21.224 canales es **NO COMPUTADO**
   (§9): exigiría bajar los 186 MB y clasificar 21k canales.

**Clasificación del hallazgo: OBSERVACIÓN / MEDIA, no bloqueante.** Lo que corresponde es que el
operador decida si la promoción por tokens debe ser opt-in o si el clasificador debe respetar el
`ape-profile` de la lista cuando no hay probe. Esta verificación **no** lo corrige (scope).

---

## 9. Lo que NO se pudo verificar (con su razón)

| # | Ítem no verificado | Razón exacta |
|---|---|---|
| N-1 | Divergencia clasificador↔lista sobre los **21.224** canales | Requiere descargar los 186.789.613 B y clasificar 21k canales; fuera del alcance y del tiempo de esta verificación. Medido solo el slice de 45 canales (§8). **NO COMPUTADO**, no “cero divergencias”. |
| N-2 | Activación en vivo del plugin en el sidebar del Harness | No se instaló/reinició el plugin en runtime (prohibido tocar el Harness desde esta tarea). Verificado: sintaxis, bundle, montaje con stub y render del panel (`selfcheck`/`client-check`). La fila real del sidebar en la GUI **no se observó**. |
| N-3 | Carga real de las 3 skills por el runtime | Se validó el frontmatter y el contenido, no que el runtime las descubra y ejecute. |
| N-4 | Despliegue del clasificador al VPS | El artefacto es nuevo y local (`?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js`); no se copió al VPS ni se comprobó su presencia remota. No fue pedido y desplegar violaría “no tocar” sin autorización. |
| N-5 | Los **44 canales** sin par (Profile,Tier) atribuido | El propio contrato y el test los declaran NO COMPUTADO (21.180 ≠ 21.224). El artefacto que cierra el hueco no está en este entorno. No se rellenan. |
| N-6 | Contenido completo de la lista servida byte a byte | Solo se midieron status/size (gzip) y un slice `Range` de 400 KB. La igualdad byte a byte con una copia de referencia exigiría el artefacto de origen y su hash; no se dispone de él aquí. |
| N-7 | Gate del VPS en un segundo momento | Una sola corrida (02:01 −05:00), exit 0. No es una serie temporal; un PASS no prueba disponibilidad continua. |
| N-8 | `pulse-canal` del gate | El check fue **SKIP** (407 del proveedor). No se arregló ni se forzó: se reporta como ajeno al flujo. |

---

## 10. Conteo final

| Verificación exigida | Veredicto |
|---|---|
| 1. `node -c` × 3 | **PASS** (3/3, exit 0) |
| 2. Test del clasificador | **PASS** (74/74, exit 0) |
| 3. Contrato JSON (12 perfiles + `source`) | **PASS** (12 perfiles, 12/12 fuentes verificadas; salvedad de forma en 6) |
| 4. Generador/config intactos | **PASS** (no aparecen en `git status`; hash == HEAD en ambos) |
| 5. Lista servida + gate VPS | **PASS** (200 · 4.023.576 B; gate PASS 10/10 con 1 SKIP) |
| 6. Frontmatter de las 3 skills | **PASS** (3/3, PyYAML + validador 54/54) |

- **PASS: 6 / 6** verificaciones exigidas.
- **FAIL: 0.**
- **Extras verificados:** plugin `selfcheck` 47/47 y `client-check` 36/36 (PASS).
- **Hallazgos abiertos:** **1** (F-1, observación media, no bloqueante): el clasificador promueve
  P3→P1 por tokens en 23/45 canales de la muestra premium, declarándolo como hipótesis.
- **Salvedades declaradas:** 6/12 `source` usan puntero JSON en vez de `ruta:línea`;
  1 check del gate en SKIP; los 44 canales sin par siguen NO COMPUTADO.

**Veredicto global: PASS.** Nada de lo construido rompió el generador, el config ni la lista
servida, y los números que declaran (12 perfiles, 21.180 de 21.224, 4.023.576 B, 10/10 del gate,
54/54 de skills, 74/74 del test) se reprodujeron en esta sesión. El único desvío medido —el
clasificador no replica el `ape-profile` de la lista en la muestra— está declarado por el propio
código como hipótesis de baja confianza y no degrada nada; se entrega al capitán para decisión.

---

## 11. Reproducción completa (copiar y pegar)

```powershell
# 0. Identidad
git rev-parse --abbrev-ref HEAD ; git log -1 --oneline
Get-FileHash IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js -Algorithm SHA256
Get-FileHash dsh-plugins/ape-profile-studio/index.js -Algorithm SHA256
Get-FileHash dsh-plugins/ape-profile-studio/client.js -Algorithm SHA256

# 1. Sintaxis
node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js ; $LASTEXITCODE
node -c dsh-plugins/ape-profile-studio/index.js ; $LASTEXITCODE
node -c dsh-plugins/ape-profile-studio/client.js ; $LASTEXITCODE

# 2. Test
node tools/quality/test_ape_profile_classifier.js ; $LASTEXITCODE

# 3. Contrato
python3 -m json.tool contracts/ape_profiles_12.json > $env:TEMP\ape.json ; $LASTEXITCODE
python $env:TEMP\verify_sources.py     # resuelve los 12 source (creado en esta verificación)

# 4. Generador intocado
git status --porcelain
git hash-object IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git rev-parse HEAD:IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git hash-object IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
git rev-parse HEAD:IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js

# 5. Lista y gate
curl.exe -sk -o NUL -w '%{http_code} %{size_download}\n' -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' 'https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'
ssh -i C:\Users\HFRC\.ssh\id_ed25519_hetzner -o BatchMode=yes root@178.156.147.234 "bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json"

# 6. Skills
node .agents/skills/iptv-supreme-repos-atlas/scripts/validate_skills.js ; $LASTEXITCODE
python $env:TEMP\verify_frontmatter.py ; $LASTEXITCODE

# 7. (extra) Plugin
node dsh-plugins/ape-profile-studio/selfcheck.mjs ; $LASTEXITCODE
node dsh-plugins/ape-profile-studio/client-check.mjs ; $LASTEXITCODE
```

Los scripts `verify_sources.py`, `verify_frontmatter.py`, `classify_real.js` y `pairs.js` se
crearon en `%TEMP%` durante esta verificación (no se escribió fuera de `docs/architecture/`).

---

## 12. Oposición adversarial y auditoría de evidencia (regla permanente)

Antes de firmar el veredicto se corrieron los dos filtros deterministas del arnés.

### 12.1 `adversarial_frame`

Contra-tesis devuelta: *“la correlación que sostiene la tesis es reversible o espuria; que los
checks pasen no prueba que los números declarados sean reales (el test puede ser tautológico), y
la verificación no cubre el universo completo (21.224 canales), solo un slice de 45”*.

### 12.2 `adversarial_verdict`

Resultado medido: **sobrevive la TESIS** (`pesos: tesis 24 · contra 3`; 8 ítems con artefacto
verificable del lado tesis frente a 1 del lado contra). El único ítem del lado contra con
artefacto es F-1 (§8, peso 2); el censo completo pesa 1 porque **no tiene artefacto**.

Evidencia faltante que el propio veredicto enumera (y que coincide con §9):

- artefacto del censo de los 21.224 canales (N-1) — hoy NO COMPUTADO;
- las pruebas discriminantes 1-2 (intervención causal / tercer factor) no aplican: esta tesis es
  de **verificación de artefactos**, no de causalidad; las 3-4 (reproducir cada cifra / ventana
  retenida) sí se ejecutaron para las cifras citadas.

### 12.3 `metacog_audit`

La afirmación con las cifras de las 6 verificaciones + F-1: **2/2 fragmentos SOPORTADO**,
0 no soportados, 0 contradichos, 0 evidencia sin artefacto. El filtro emitió dos avisos
heurísticos de forma —`exit 0` leído como “el evento ocurrió” y `NO COMPUTADO` leído como cero—
que **no aplican a este informe**: cada cifra va acompañada de su efecto observable (74 PASS
impresos, hashes iguales, HTTP 200 + bytes, JSON del gate) y el NO COMPUTADO está declarado como
desconocido, nunca como cero.

**Con esta evidencia no se declara “descartado” nada: F-1 queda abierto para decisión del capitán.**
