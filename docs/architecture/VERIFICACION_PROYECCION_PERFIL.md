# VERIFICACIÓN — Proyección por plantilla de perfil + nonces (sin regresiones)

**Veredicto global: PASS.** Las 7 verificaciones exigidas se ejecutaron y pasaron. La reconstrucción
desde la proyección devuelve **el mismo sha256 que la lista de producción**.

- **Rama**: `deploy/engine-restart-20261112` · **HEAD**: `4abcae72`
- **Host de verificación**: Windows, Node **v24.12.0** (los tiempos son de este host, no del VPS)
- **Fecha**: 2026-11-15 (America/Bogota)
- **Regla aplicada**: nada se declara PASS sin comando ejecutado y salida pegada. Donde no se pudo
  verificar algo, está en la sección [§6](#6-lo-que-no-se-pudo-verificar-con-su-razón).

---

## 0. Artefactos verificados (identidad)

| artefacto | bytes | sha256 |
|---|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js` | 40.992 | `c38aca5e8b332613761cd4eca74217e6516eee0992029b98ea727a972070cf33` |
| `tools/quality/test_ape_profile_project.js` | 19.836 | `f2a7361ee47308fae1219a8414e64ac26c8924783cd678a071f14b3f1f62efd7` |

Ambos hashes coinciden exactamente con los declarados por la tarea de proyección. `git status --porcelain`
del repo contiene **solo esos dos ficheros, ambos untracked**:

```
?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js
?? tools/quality/test_ape_profile_project.js
```

### 0.1 Datos de entrada medidos (producción, no el enunciado)

| fichero | bytes | sha256 | canales | líneas |
|---|---|---|---|---|
| `/var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8` (original) | **1.298.222.092** | `08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373` | 21.224 | 22.190.344 |
| `/var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8` (servida) | 186.789.613 | `a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4` | 21.224 | — |

Medido en el VPS (`ssh … 'stat -c %s; sha256sum'`) y **reproducido en local** tras `scp` del `.gz`
(352.804.883 B) + gunzip: `bytes_descomprimidos=1298222092`, `sha256=08cb16fd…`. La copia sobre la que se
proyectó es, byte a byte, el fichero de producción. **Esto es lo que cierra la duda de "¿verificaste tu
espejo o producción?"**.

---

## 1. Tabla resumen de las 7 verificaciones

| # | Verificación | Comando | Salida | Veredicto |
|---|---|---|---|---|
| 1 | Sintaxis del proyector | `node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js` | `exit 0` | **PASS** |
| 2 | Test de calidad | `node tools/quality/test_ape_profile_project.js` | `exit 0` · **15 casos / 15 PASS / 0 FAIL** | **PASS** |
| 2b | ¿El test compara sha256 de verdad? | lectura del código, líneas 206/220/338/345/368/375/249/55 | **6 comparaciones de sha256 reales**, 0 de tamaño/conteo como criterio | **PASS** |
| 3 | `project` sobre la lista REAL de producción | `node … project $TEMP/APE_ORIG_VPS.m3u8 $TEMP/_p.m3u8` | `exit 0`, `verificado:true`, `sha256_reconstruido == sha256_in` | **PASS** |
| 3b | `verify` independiente | `node … verify $TEMP/_p.m3u8 $TEMP/APE_ORIG_VPS.m3u8` | `exit 0`, `ok:true`, sha256 iguales, 1.298.222.092 B | **PASS** |
| 4 | Ratio y tamaño absoluto vs lista servida | cálculo sobre salidas medidas | texto 0,189387 · gzip 0,013265 · LIGHT 186.789.613 B | **PASS** (el texto **pierde**) |
| 5 | El generador NO se tocó | `git status --porcelain` + `git hash-object` vs `HEAD:` | 11/11 ficheros trackeados **idénticos a HEAD** | **PASS** |
| 6 | Lista servida intacta + gate VPS | `curl … LIGHT.m3u8` · `ssh … gate_ape_crystal_flow.sh --json` | `200 / 4.023.576 B` · `verdict PASS pass 10 fail 0` | **PASS** |
| 7 | Plugin ape-stability-console activo | `curl -s -o NUL -w '%{http_code}' http://127.0.0.1:3090/ape-stability-console/api/state` | `200` | **PASS** |

Extra no exigido (y es el que más pesa): **reconstrucción independiente** con una implementación aparte
que no importa el tool, hash calculado por `.NET Get-FileHash` → **mismo sha256** [§3.1](#31-reconstrucción-independiente-el-que-más-pesa).

---

## 2. Detalle por verificación

### 2.1 [1] Sintaxis — PASS

```
$ node -c 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js'
node -c exit = 0
$ node -c 'tools/quality/test_ape_profile_project.js'
node -c exit = 0
```

### 2.2 [2] Test de calidad — PASS (15/15, exit 0)

```
=== test_ape_profile_project ===
lista real: C:\...\scratch\APE_LISTA_HARNESS.m3u8
  bytes=1311382485 sha256=199de252b6fc527dd9dddee9abcf22df7c4eb4a4d5e5fecf40f8db97e0a608a2

--- casos borde (fixtures derivados de la lista real) ---
  cabecera=208 lineas, canales capturados=6
[PASS] borde: sin nonces / sin portadores / perfil desconocido · verify(texto)  — exit=0 canales=4 sha=b5f7b9f2be74 ratio=0.9148…
[PASS] borde: sin nonces / sin portadores / perfil desconocido · verify(gzip)   — exit=0 ratio=0.2846…
[PASS] borde: fichero sin salto de linea final · verify(texto)                 — exit=0 canales=2 sha=09c6c0ff1851 ratio=1.0447…
[PASS] borde: fichero truncado a 502396 B · verify(texto)                       — exit=0 canales=7 sha=a61c151cab62
[PASS] borde: fichero truncado a 502396 B · verify(gzip)                        — exit=0 ratio=0.15623…

--- prueba negativa (el verificador tiene que fallar) ---
[PASS] negativo: proyeccion corrupta -> exit 5 y ok=false  — exit=5 error=sha256_no_coincide

--- lista real completa (1250.6 MB) ---
[PASS] real · project(texto) + autoverificacion  — canales=21224 plantillas=26 ratio=0.19121840337832482 74.3s
[PASS] real · verify(texto) == sha256 original  — exit=0 sha=199de252b6fc527d bytes=1311382485
[PASS] real · project(gzip) + autoverificacion  — canales=21224 plantillas=26 lineas_plantilla=1054 ratio=0.014482240854391159 77.2s
[PASS] real · verify(gzip) == sha256 original   — exit=0 sha=199de252b6fc527d
[PASS] real · canales reconstruidos == canales proyectados  — 21224 vs 21224
[PASS] real · bytes reconstruidos == bytes originales       — 1311382485 vs 1311382485
[PASS] real · la proyeccion es menor que el original        — 18991757 < 1311382485
[PASS] real · hay plantillas por forma (>= 1)               — plantillas=26
[PASS] real · lineas de la plantilla << lineas por canal    — lineas_plantilla=1054

=== RESUMEN ===
  casos: 15  PASS: 15  FAIL: 0
VEREDICTO: PASS — la lista proyectada reconstruye el original byte a byte (sha256).
=== EXIT TEST = 0 ===
```

**Ojo, y esto lo digo antes de que lo pregunte nadie:** este test corre sobre
`scratch/APE_LISTA_HARNESS.m3u8` (**1.311.382.485 B**, sha256 `199de252…`), **no** sobre la lista de
producción (**1.298.222.092 B**, sha256 `08cb16fd…`). Son ficheros distintos (§5, F-1). Por eso la
verificación [3] la repetí yo sobre los bytes exactos de producción.

### 2.3 [2b] ¿El test compara sha256 de verdad? — PASS (no es un test de tamaños)

Leído el código, no la prosa. Comparaciones **de hash**:

| línea | comparación |
|---|---|
| 55–66 | `sha256File()` — hash streaming propio del test, no reutiliza el del tool |
| 249 | `const realSha = sha256File(realList)` — hash de la lista calculado **por el test** |
| 206 | `v1.json.sha256_reconstruido === rc.json.sha256_in` |
| 220 | `v2.json.sha256_reconstruido === rg.json.sha256_in` (gzip) |
| 338 | `rc.json.verificado === true && rc.json.sha256_reconstruido === realSha` |
| 345 | `v.json.ok === true && v.json.sha256_reconstruido === realSha` |
| 368 | `s.verificado === true && s.sha256_reconstruido === realSha && s.contenedor === 'gzip'` |
| 375 | `v.json.sha256_reconstruido === realSha` (gzip) |
| 319 | prueba **negativa**: exige `code === 5 && ok === false` al corromper la proyección |

Las comparaciones de tamaño y de conteo **existen además** (líneas 381–383), pero **no sustituyen** al
hash: son invariantes adicionales. Y hay prueba negativa ejecutada y pasada (`exit=5
error=sha256_no_coincide`). **Un verificador que no falla no verifica: este falla cuando debe.**

### 2.4 [3] La prueba del operador: `project` + `verify` sobre la lista REAL de producción — PASS

Ejecutado por mí, sobre la copia de producción verificada por sha256 contra el VPS.
Adaptación honesta: el enunciado pide `/tmp/_p.m3u8`; en Windows es `$env:TEMP\_p.m3u8`.

```
$ node --max-old-space-size=6144 ape-profile-project.js project $TEMP/APE_ORIG_VPS.m3u8 $TEMP/_p.m3u8
{
 "ok": true,
 "canales": 21224,
 "plantillas": 26,
 "lineas_plantilla": 1046,
 "lineas_plantilla_rango": [1027, 1051],
 "bytes_in": 1298222092,
 "bytes_out": 245865882,
 "bytes_out_plain": 245865882,
 "contenedor": "texto",
 "ratio": 0.18938661074641458,
 "sha256_in": "08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373",
 "sha256_out": "fd27d896c8db52482551a40544fab75e49eb4464fe7faea3f7449e3e7c27df2a",
 "verificado": true,
 "sha256_reconstruido": "08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373",
 "lineas_in": 22190344,
 "lineas_cabecera": 207,
 "diccionario_entradas": 269788,
 "referencias_diccionario": 1033356,
 "parche_medio_lineas": 48.69,
 "vars": ["SID","NONCE","REQUEST","SESSION","HASH8","CHID"],
 "final_newline": true,
 "truncado_por_limite": false,
 "canales_reconstruidos": 21224,
 "bytes_reconstruidos": 1298222092,
 "ms": 68656
}
project exit = 0   (wall 69,0 s)

$ node --max-old-space-size=6144 ape-profile-project.js verify $TEMP/_p.m3u8 $TEMP/APE_ORIG_VPS.m3u8
{
 "ok": true,
 "sha256_reconstruido": "08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373",
 "sha256_declarado":   "08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373",
 "canales": 21224,
 "plantillas": 26,
 "diccionario_entradas": 269788,
 "bytes": 1298222092,
 "bytes_declarados": 1298222092,
 "ms": 24570,
 "sha256_original": "08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373",
 "bytes_original": 1298222092
}
verify exit = 0
```

**Los dos sha256 son IGUALES `08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373`.** No es
fallo bloqueante.

Contenedor gzip, también sobre producción:

```
$ node … project $TEMP/APE_ORIG_VPS.m3u8 $TEMP/_p.m3u8.gz --gz
 "bytes_out": 17220484, "ratio": 0.01326466719840722, "contenedor": "gzip",
 "verificado": true, "sha256_reconstruido": "08cb16fd…", "ms": 78878
project --gz exit = 0
$ node … verify $TEMP/_p.m3u8.gz $TEMP/APE_ORIG_VPS.m3u8
 "ok": true, "sha256_reconstruido": "08cb16fd…", "sha256_original": "08cb16fd…", "bytes": 1298222092
verify gz exit = 0
```

### 2.5 [4] Ratio medido y tamaño absoluto — PASS (con la parte incómoda)

| contenedor | bytes | ratio vs original | vs LIGHT (186.789.613 B) |
|---|---|---|---|
| original de producción | 1.298.222.092 | 1,000000 | 6,95x mayor |
| proyección **texto** (JSONL) | **245.865.882** | **0,189387** | **1,3163x → 31,63 % MÁS GRANDE que LIGHT (PIERDE)** |
| proyección **gzip** | **17.220.484** | **0,013265** | **0,09219x → 10,8469x MENOR que LIGHT (GANA)** |
| LIGHT servida hoy | 186.789.613 | 0,143881 | 1,0 |

Cálculo exacto (reproducible):

```
texto/original = 245865882/1298222092 = 0.189386611
gzip/original  = 17220484/1298222092  = 0.013264667
texto/LIGHT    = 245865882/186789613  = 1.316271703   →  +31.63 %
gzip/LIGHT     = 17220484/186789613   = 0.092191872   →  10.8469x menor
```

**Lectura directa:** el contenedor de texto **no bate** a la lista ligera que se sirve hoy (+31,63 % de
bytes). El que gana es el gzip: **17,2 MB frente a 186,8 MB**. Los dos números se declaran; no se esconde
el que pierde.

### 2.6 [5] El generador NO se tocó — PASS (identidad byte a byte, no "no aparece")

```
$ git status --porcelain
?? IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js
?? tools/quality/test_ape_profile_project.js
→ OK: ni m3u8-typed-arrays-ultimate.js ni ape-profiles-config.js estan en git status
```

Y la prueba fuerte: los **11 ficheros trackeados** con esos nombres tienen `git hash-object` idéntico a
`git rev-parse HEAD:<path>`:

| fichero | blob idéntico |
|---|---|
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `a941199831680242b161575467d68c25ffac3524` |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | `5a3a63044b00263b33ddd5e2d0250291f1d3e32d` |
| `IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | `83d06835f67b2b39d4e500b018bfecf82339e309` |
| `…/backup_master_v5.4_phantom_engine/…/ape-profiles-config.js` | `e47291f149cc256d6f56420abb679413970a56d8` |
| `IPTV_v5.4_MAX_AGGRESSION/scripts/m3u8-typed-arrays-ultimate.js` | `28dc76f54203db70a5f924b1bb836f481f767ec4` |
| `…/snapshots/2026-04-30_pre_coherence_fix/m3u8-typed-arrays-ultimate.js.PRE` | `0cc3c4e7244d52fb7a121a9b8f79b237e3d01640` |
| `…/snapshots/2026-04-30_pre_coherence_fix/ape-profiles-config.js.PRE` | `392e7f7d643bac496f91154af6fe02189a15051e` |
| `audit/equipo10_operativo_2026-10-26/snapshot/m3u8-typed-arrays-ultimate.js.HEAD.blob` | `c1277bdfdc46debfc762eb86e22f77b85b66e250` |
| `audit/…/snapshot/m3u8-typed-arrays-ultimate.js.HEAD.d81ddb3.blob` | `b7b594467c6ebc2df61b01515bbc288b3a0ee570` |
| `audit/…/snapshot/m3u8-typed-arrays-ultimate.js.WT.d29f62af.blob` | `892e14d9447b7514f299f4eaa3b89dc1f8f1a287` |
| `audit/…/snapshot/m3u8-typed-arrays-ultimate.js.WT.da442864.blob` | `a3a66370adf47dd4a791e4b019b6eb4d57ad3875` |

`git diff --stat HEAD -- <los dos sagrados>` → vacío, `exit 0`.

### 2.7 [6] Lista servida intacta + gate del VPS — PASS

```
$ curl.exe -sk -o NUL -w 'http_code=%{http_code} size_download=%{size_download} time_total=%{time_total}' \
    -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' \
    https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
http_code=200 size_download=4023576 time_total=5.663592

$ ssh -i ~/.ssh/id_ed25519_hetzner root@178.156.147.234 'bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json'
{"verdict":"PASS","pass":10,"fail":0,"base":"https://iptv-ape.duckdns.org","checks":[
 {"check":"health","status":"PASS","detail":"200|3|0.007102"},
 {"check":"jit-calidad","status":"PASS","detail":"206 · #EXT-X-APE-CHANNELS:21224"},
 {"check":"lista-cableada","status":"PASS","detail":"200 · #EXT-X-APE-CHANNELS:21224 · EXTINF(4MB)=68 · /pulse/=67"},
 {"check":"canary","status":"PASS","detail":"302|0|0.207597"},
 {"check":"pulse-canal","status":"SKIP","detail":"407|124|0.320182 (canal bloqueado por el proveedor, no por el flujo)"},
 {"check":"endpoint-canal","status":"PASS","detail":"200|273|0.013477"},
 {"check":"vigilante","status":"PASS","detail":"200|1529|0.025447"},
 {"check":"disco","status":"PASS","detail":"82% usado · 6.6G libre"},
 {"check":"cache-resolucion","status":"PASS","detail":"JSON valido · 28 canales medidos"},
 {"check":"vigilante-fresco","status":"PASS","detail":"OK · escrito hace 9s"},
 {"check":"proyeccion","status":"PASS","detail":"186789613B · 21224 canales · 21224 tags · 0 APE"}]}
=== ssh exit = 0 ===
```

Estado del fichero servido, medido en el VPS (baseline registrada, **no** comparación contra un "antes"
que no tengo):

```
186789613 bytes  mtime=2026-11-15 06:12:38 +0000
sha256 a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4
#EXTSHIMOTT = 21224   #EXTINF = 21224   #EXT-X-APE = 0
```

El gate lo confirma por su cuenta (`21224 tags · 0 APE`). La lista servida **no se tocó**.

### 2.8 [7] Plugin ape-stability-console — PASS

```
$ curl.exe -s -o NUL -w 'http_code=%{http_code}' http://127.0.0.1:3090/ape-stability-console/api/state
http_code=200   (curl exit = 0)
```

---

## 3. Pruebas adicionales que no se pidieron (y por eso valen más)

### 3.1 Reconstrucción independiente (el que más pesa)

El riesgo real de un verificador es **autoconfirmarse**: imprimir el hash que él mismo calculó. Lo rompí
con una implementación aparte —`recon_indep.js`, escrita desde la especificación del formato, **sin
importar ni ejecutar el tool**— que reconstruye a disco, y después hash **externo** con `.NET`:

```
$ node --max-old-space-size=6144 recon_indep.js $TEMP/_p.m3u8 $TEMP/_recon_indep.m3u8
{ "canales": 21224, "plantillas": 26, "diccionario": 269788,
  "bytes_out": 1298222092, "final_newline": true }

$ (Get-FileHash $TEMP/_recon_indep.m3u8 -Algorithm SHA256).Hash.ToLower()
08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
bytes: 1298222092

reconstruido_indep : 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
original_produccion: 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
IGUALES -> la reconstruccion independiente ES el original byte a byte
```

Cuatro medidas independientes del hash del original coinciden: `sha256sum` en el VPS, hash node tras
gunzip local, `Get-FileHash` local, y la reconstrucción hecha por otro programa medida por `.NET`.
Con sha256, coincidencia de hash **es** identidad de bytes.

### 3.2 Censo de bytes independiente (¿perdió líneas?)

```
bytes           : 1298222092
newlines (0x0A) : 22190344
#EXTINF         : 21224
```

Coincide exactamente con lo que el tool declara (`lineas_in: 22190344`, `canales: 21224`) — y sale de un
contador de bytes mío, no del tool. **No se perdió una línea**: el fichero reconstruido pesa
1.298.222.092 B sobre 1.298.222.092 B.

### 3.3 Medición de la premisa del enunciado (229 idénticas / 811 varían / 9 nonces)

Con un diff directo entre los canales **1 y 2** de producción (misma forma `P3+F2_HEVC_PREMIUM_HINT`,
1.044 líneas cada uno), sin pasar por el proyector:

```
lineas A=1044  B=1044
lineas IDENTICAS byte a byte : 945
lineas DISTINTAS             : 99

--- tras normalizar los 6 valores nonce de cada canal ---
lineas que SIGUEN DISTINTAS  : 46 de 1044
lineas derivables por nonce  : 53

#EXTHTTP — claves medida (canal A: 202, canal B: 202)
  claves en ambas : 193
  solo en A       : 9 -> CMCD-Object,CMCD-Request,CMCD-Session,CMCD-Status,X-QoE-Startup-Target-Ms,…
  solo en B       : 9 -> X-Retry-Count,X-Retry-Delay-Ms,X-Connection-Timeout-Ms,…
```

Confirmado lo que el enunciado **sí** acierta: los sids de los canales 1/2/3 son exactamente
`d854d32401d49800` / `7d1a60ec5a939800` / `9692ae5c622d7c00` — distintos y deterministas.

Corregido lo que el enunciado **no** reproduce: no son 229/811, son **945 idénticas / 99 distintas**; y de
las 99, solo **53** se derivan sustituyendo los 6 nonces. Las **46 restantes varían de FORMA**, no de
valor: `#EXTHTTP` lleva 202 claves y cada canal cambia el juego de 9 (CMCD/X-QoE vs Retry/Reconnect), más
`#EXTATTRFROMURL`, `#KODIPROP` y la familia `#EXT-X-APE-SPOOF*`. Esa es la razón medida por la que el
modelo necesita un diccionario (269.788 entradas, 1.033.356 referencias) y por la que el texto no baja de
245 MB.

### 3.4 Cobertura real de perfiles

Los 26 «shapes» de la lista de producción solo ejercitan **4 de los 12 perfiles declarados**:

| perfil · tier | canales |
|---|---|
| P3 · F3_HEVC_SAFE_1080P | 10.408 |
| P3 · F2_HEVC_PREMIUM_HINT | 9.814 |
| P1 · F2_HEVC_PREMIUM_HINT | 933 |
| P4 · F5_ORIGINAL_DIRECT_SAFE | 45 |
| P4 · F2_HEVC_PREMIUM_HINT | 12 |
| P5 · F3_HEVC_SAFE_1080P | 9 |
| P5 · F2_HEVC_PREMIUM_HINT | 2 |
| P4 · F3_HEVC_SAFE_1080P | 1 |

**Ausentes: P0 y P2, y los 6 emulados 6K (P0.5–P5.5).** La proyección es correcta para lo que hay, pero
**no está probada** sobre 8 de los 12 perfiles del contrato: no existen en esta lista.

---

## 4. Hallazgos

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| **F-1** | **MEDIA** | El sha256 headline del informe de proyección (`199de252…`, 1.311.382.485 B) es de `scratch/APE_LISTA_HARNESS.m3u8`, **no** de la lista de producción (`08cb16fd…`, 1.298.222.092 B). Son ficheros distintos: el harness tiene **+8 líneas de metadata por canal** (`#EXT-X-APE-LCEVC-PHASE:4`, `LCEVC-ENABLED`, `AI-SR`, `HDR10-PLUS`, `DOLBY-VISION`, `HDR-DV`, `MINTERPOLATE`, `ENHANCE-STATE`), URL de `/pulse/` distinta y **carece** de `#EXT-X-I-FRAME-STREAM-INF` que producción sí tiene. Δ = 13.160.393 B = 620,07 B/canal. | diff del canal 1 entre ambos ficheros |
| **F-2** | **BAJA** | En la ruta `--gz`, `bytes_out_plain` se declara **245.865.887 B** y el texto real en disco mide **245.865.882 B** (Δ +5 B). No afecta a la reconstrucción (mismo sha256), pero es un número impreso que no es exacto. | `project --gz` vs `Get-FileHash` del texto |
| **F-3** | **INFO** | El test **no** verifica que su lista de entrada sea la de producción; si `scratch/APE_LISTA_HARNESS.m3u8` desaparece, con `--allow-skip` sale **0 con SKIP** → falso verde posible en CI. Sin `--allow-skip` sale 2 (correcto). | líneas 241–247 del test |
| **F-4** | **INFO** | Líneas por canal medidas: rango **1.027–1.051**, moda **1.046**. El enunciado dice 1.040. | `lineas_plantilla_rango` |
| **F-5** | **INFO** | Cobertura: 4 de 12 perfiles (§3.4). El diseño no está probado sobre P0/P2 ni sobre los emulados 6K. | `plantillas_detalle` |

---

## 5. Lo que NO se pudo verificar (con su razón)

1. **No ejecuté el proyector en el VPS.** Subir un script a producción viola `iptv-vps-touch-nothing`. En
   su lugar descargué el original (`.gz`) y comprobé que mi copia tiene **el mismo sha256 que producción**;
   la proyección se ejecutó sobre esos bytes. El resultado (sha256) es independiente del host; **los
   tiempos no**: 69 s `project`, 24,6 s `verify`, 78,9 s `project --gz` son de este host Windows, **no**
   de los 3 vCPU del Hetzner.
2. **No sustituí la lista servida** — no estaba pedido y la regla 3 del enunciado lo condiciona a
   verificación por sha256. La verificación existe (§2.4, §3.1); la sustitución **no se ejecutó**.
3. **No verifiqué que la proyección sea servible**: por diseño declara
   `#EXT-X-APE-PROJECTION-MODE:projection-only-not-playable`. Es un contenedor, no una playlist. Servirla
   exigiría un reconstruidor en el edge que no forma parte de esta tarea.
4. **8 de los 12 perfiles no aparecen** en la lista de producción: no hay nada que verificar ahí.
5. **`metacog_audit`**: su atribuidor no aceptó el campo `objetivo` (2 intentos, mismo resultado). Reporto
   su salida tal cual en §7 sin "arreglarla" agregando citas que no leí; su propio texto advierte que
   `NO_SOPORTADO` = «no encontré el artefacto en lo que me diste», no «es falso».

---

## 6. LA RECONSTRUCCIÓN DA EL MISMO sha256: **SÍ**

```
sha256 original de produccion : 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
sha256 reconstruido (verify)  : 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
sha256 reconstruido (indep.)  : 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373
bytes                         : 1298222092 == 1298222092
canales                       : 21224 == 21224
lineas                        : 22190344 == 22190344
contenedores                  : texto (245.865.882 B) Y gzip (17.220.484 B), ambos verificados
```

**SÍ.** Tres medidas independientes del hash del original y de la reconstrucción coinciden. El fichero
reconstruido **es** el de producción byte a byte.

---

## 7. Oposición adversarial y auditoría de evidencia (regla permanente)

### 7.1 `adversarial_frame`

Contra-tesis devuelta: *«La copia verificada no es la lista de producción (es un espejo local con estado
distinto) y/o el verificador se autoconfirma: la reconstrucción que dice byte-exacta solo se compara
contra un hash que el propio tool imprime, así que el "sha256 idéntico" es un artefacto del instrumento y
no del mundo.»* — Es exactamente la objeción correcta, y se atacó por los dos flancos: `scp` del fichero
real + hash medido en el VPS (flaco el espejo), y reconstrucción por un programa aparte hasheada por
`.NET` (flaco la autoconfirmación).

### 7.2 `adversarial_verdict`

```
sobrevive : TESIS   (peso 14 vs 2)
items con artefacto verificable en el lado ganador: 5/5
evidencia con artefacto: 7 items, 0 sin artefacto
```

La tesis sobrevive; la contra pierde porque sus dos únicos items con artefacto son de severidad débil
(el `bytes_out_plain` +5 B y el harness ≠ producción) y **no tocan** la reconstrucción.

### 7.3 `metacog_audit`

Veredicto **MIXTO**: 7 fragmentos SOPORTADO, 4 NO_SOPORTADO, 0 CONTRADICHO. Los 4 no soportados son
artefactos del troceado por frases (el número quedó en un fragmento y su comando en el siguiente) y de un
atribuidor que no honró el campo `objetivo`; **cada uno de esos cuatro números tiene su comando y salida en
las tablas de §2**. Su hallazgo `ETIQUETA_MAL_LEIDA:exit_cero_leido_como_evento_ocurrido` se acepta como
recordatorio: **ningún claim de este documento se apoya en un exit code** — se apoya en sha256, bytes,
códigos HTTP y recuentos de bytes.

---

## 8. Reproducción completa (copiar y pegar)

```powershell
Set-Location 'C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION'

# 0. Identidad
git rev-parse HEAD ; git status --porcelain
Get-FileHash 'IPTV_v5.4_MAX_AGGRESSION\vps\bin\ape-profile-project.js' -Algorithm SHA256
Get-FileHash 'tools\quality\test_ape_profile_project.js' -Algorithm SHA256

# 1. Sintaxis
node -c 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js'
node -c 'tools/quality/test_ape_profile_project.js'

# 2. Test (15 casos)
node tools/quality/test_ape_profile_project.js

# 3. Original de PRODUCCION: descarga + identidad
$key='C:\Users\HFRC\.ssh\id_ed25519_hetzner'
scp -i $key root@178.156.147.234:/var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8.gz $env:TEMP\APE_ORIG_VPS.m3u8.gz
node -e "const fs=require('fs'),z=require('zlib'),c=require('crypto');const h=c.createHash('sha256');let n=0;const r=fs.createReadStream(process.argv[1]).pipe(z.createGunzip());r.on('data',x=>{h.update(x);n+=x.length});r.pipe(fs.createWriteStream(process.argv[2]));r.on('end',()=>console.log(n,h.digest('hex')))" $env:TEMP\APE_ORIG_VPS.m3u8.gz $env:TEMP\APE_ORIG_VPS.m3u8
#   -> 1298222092 08cb16fdf15a4674b7f3cf2812b4be682324f249df458a963c16edadef73a373

# 3b. La prueba del operador
node --max-old-space-size=6144 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js' project $env:TEMP\APE_ORIG_VPS.m3u8 $env:TEMP\_p.m3u8
node --max-old-space-size=6144 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js' verify  $env:TEMP\_p.m3u8 $env:TEMP\APE_ORIG_VPS.m3u8
#   -> exit 0 y sha256_reconstruido == sha256_original == 08cb16fd…

# 3c. Contenedor gzip
node --max-old-space-size=6144 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js' project $env:TEMP\APE_ORIG_VPS.m3u8 $env:TEMP\_p.m3u8.gz --gz
node --max-old-space-size=6144 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js' verify  $env:TEMP\_p.m3u8.gz $env:TEMP\APE_ORIG_VPS.m3u8

# 4. Generador intocado
git status --porcelain
foreach ($f in (git ls-files | Select-String -SimpleMatch 'm3u8-typed-arrays-ultimate.js','ape-profiles-config.js')) {
  "$((git rev-parse "HEAD:$f") -eq (git hash-object $f))  $f" }

# 5. Lista servida + gate
curl.exe -sk -o NUL -w '%{http_code} %{size_download}`n' -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' `
  'https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'
ssh -i $key root@178.156.147.234 'bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json'

# 6. Plugin local
curl.exe -s -o NUL -w '%{http_code}`n' 'http://127.0.0.1:3090/ape-stability-console/api/state'
```

Rollback: **no hay nada que revertir**. Esta tarea **no modificó ni un byte** del repo (solo escribió este
documento), no tocó el generador y no tocó la lista servida. Los artefactos temporales viven en
`%TEMP%` (`APE_ORIG_VPS.m3u8`, `_p.m3u8`, `_p.m3u8.gz`, `_recon_indep.m3u8`) y se pueden borrar.

---

## 9. Conteo final

| bloque | comprobaciones | PASS | FAIL |
|---|---|---|---|
| Las 7 exigidas por el operador | 9 comandos | 9 | 0 |
| Extra (reconstrucción independiente, censo, premisa, cobertura) | 4 | 4 | 0 |
| **Total** | **13** | **13** | **0** |

**Veredicto: PASS.** La proyección reconstruye la lista de producción byte a byte (mismo sha256, 21.224
canales, 22.190.344 líneas), no rompió el generador, no tocó la lista servida, el gate del VPS sigue en
PASS 10/10 y el plugin responde. El contenedor de texto **pierde** contra la lista ligera (+31,63 %); el
que gana es el gzip (17,2 MB vs 186,8 MB, 10,85x menor).
