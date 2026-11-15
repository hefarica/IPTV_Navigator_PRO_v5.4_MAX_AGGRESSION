# VERIFICACIÓN DE ESTABILIDAD — integración sin regresiones

**Qué es este documento.** La verificación independiente de todo lo construido en la misión de
estabilidad 4K: sintaxis, skills, documento de pipeline, generador intacto, lista servida intacta,
gate del VPS, y el plugin anterior. Ninguna fila de este documento se declara PASS sin haber corrido
el comando; cada salida transcrita es la que devolvió el comando en esta sesión.

| Campo | Valor |
|---|---|
| Repo | `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` |
| Rama · HEAD | `deploy/engine-restart-20261112` · `2032ccbb` |
| Ventana de verificación | 2026-11-15 **07:22–07:31 UTC** (02:22–02:31 America/Bogota) |
| VPS verificado (sólo lectura) | `root@178.156.147.234` con `C:\Users\HFRC\.ssh\id_ed25519_hetzner` |
| Node / Python | `v24.12.0` · `3.12.10` (PyYAML `6.0.3`) |
| Escrituras de esta tarea | **una**: este fichero. Cero mutaciones en el VPS (sólo `ssh` de lectura + `GET`) |
| Mutaciones en producción | **ninguna** — no se instaló nada, no se reinició nada, no se tocó Docker ni ningún timer |

**Contrato de honestidad aplicado:** «no medido» no es cero, «sin productor» no es «sin hallazgos»,
«exit 0» no es «el evento ocurrió». Donde algo no se pudo medir, está en §6 con su razón — no arriba
como verde.

---

## 0. Resumen para decidir

| Resultado | Total |
|---|---|
| **Verificaciones PASS** | **14** |
| **Verificaciones FAIL** | **0** |
| Hallazgos abiertos (funcionales, **no** regresiones) | **1** (§5, F-1) |
| Observaciones de precisión sobre números de terceros | 3 (§5, F-2…F-4) |
| Puntos **NO VERIFICADOS** con razón | 7 (§6) |

Las seis verificaciones encargadas pasan, y las tres de refuerzo también. El plugin nuevo está
**habilitado, activo y sirviendo** su ruta; el generador y la lista servida están **byte-idénticos**
a lo que había; el gate del VPS devuelve el PASS 10/10 pedido.

El único defecto real que encontré está en el plugin nuevo y **no es una regresión**: su tarjeta de
«listas locales» nunca puede encontrar nada en este despliegue porque resuelve el workspace al
directorio del runtime del Harness, no al repo (§5, F-1). Todo lo demás del panel mide el VPS de
verdad.

---

## 1. Tabla maestra — cada verificación, su comando y su salida

| # | Verificación | Comando (exacto) | Salida medida | Veredicto |
|---|---|---|---|---|
| V1 | Sintaxis `index.js` del plugin nuevo | `node -c dsh-plugins/ape-stability-console/index.js` | sin salida · `exit=0` | **PASS** |
| V2 | Sintaxis `client.js` del plugin nuevo | `node -c dsh-plugins/ape-stability-console/client.js` | sin salida · `exit=0` | **PASS** |
| V3 | Selfcheck del plugin nuevo | `node dsh-plugins/ape-stability-console/selfcheck.mjs` | `75/75 checks passed` · `exit=0` | **PASS** |
| V4 | Frontmatter de las 3 skills nuevas | validador estructural (node) + `yaml.safe_load` (PyYAML 6.0.3) | `30 PASS \| 0 FAIL` · `3 PASS \| 0 FAIL` | **PASS** |
| V5 | `PIPELINE_ESTABILIDAD_4K.md` existe y no tiene cifras sin fuente | auditoría mecánica + re-medición en el VPS | 48.926 B · 642 líneas · 0 huérfanos reales | **PASS** |
| V6 | El generador y `ape-profiles-config.js` no se tocaron | `git status --porcelain -- <2 rutas>` + blob vs HEAD | vacío · `MATCH_HEAD=True` en ambos | **PASS** |
| V7 | La lista servida sigue intacta (HTTP) | `curl -sk -o NUL -w '…' -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' <URL>` | `http=200 size=4023576` | **PASS** |
| V8 | Gate del VPS | `ssh … 'bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json'` | `"verdict":"PASS","pass":10,"fail":0` · `GATE_EXIT=0` | **PASS** |
| V9 | Selfcheck del plugin anterior (Profile Studio) | `node dsh-plugins/ape-profile-studio/selfcheck.mjs` | `47/47 checks passed` · `exit=0` | **PASS** |
| V10 | Control negativo de `node -c` (¿la comprobación es real?) | `node -c <fichero con error de sintaxis>` | `SyntaxError: Unexpected end of input` · `exit=1` | **PASS** |
| V11 | Blob del worktree == blob de HEAD (prueba de no-modificación) | `git hash-object <ruta>` vs `git rev-parse HEAD:<ruta>` | `a9411998…` = `a9411998…` · `5a3a6304…` = `5a3a6304…` | **PASS** |
| V12 | Gates locales del repo (los que cita el doc de pipeline) | `bash tools/quality/gate_ape_crystal_flow.sh --quiet` · `node tools/check_anti_degradation_policy.js` | `VERDICT=PASS pass=6 fail=0` · `TOTAL=8 PASS=8 FAIL=0` | **PASS** |
| V13 | El plugin nuevo responde dentro del Harness (y control 404) | `curl http://127.0.0.1:3090/ape-stability-console/api/state` | `http=200 bytes=32972` + `http=404` en ruta inexistente | **PASS** |
| V14 | Las cifras de tráfico del doc de pipeline se reproducen | re-cálculo en el VPS sobre `playlist_access.log` | n=269 · suma 515.154 B · 0 respuestas 200 vacías · 1.190.394.064 B | **PASS** |

---

## 2. Las seis verificaciones encargadas, en detalle

### V1 · V2 · V3 — Plugin `ape-stability-console`: sintaxis y selfcheck

**V1/V2.** `node -c` (alias de `node --check`) devuelve exit 0 sin imprimir nada para ambos ficheros.
Para no reportar un verde vacío, añadí el control negativo **V10**: el mismo comando sobre un fichero
con un paréntesis sin cerrar devuelve `SyntaxError` y `exit=1`. Es decir, el exit 0 de V1/V2 **significa
algo**.

```
=== node -c index.js ===
index.js exit=0
=== node -c client.js ===
client.js exit=0
=== NEGATIVE CONTROL: node -c on broken file ===
SyntaxError: Unexpected end of input
    at checkSyntax (node:internal/main/check_syntax:76:3)
negative control exit=1 (expected NON-ZERO)
```

**V3.** El selfcheck existe y pasa **75/75** (no 47/47: ese es el del plugin anterior). Verifica
montaje de rutas, que el script remoto sea de **sólo lectura** (sin `systemctl` que cambie estado, sin
`rm/mv/cp/tee/dd`, sin `sudo`, sin `nginx -s`), que rechace inyección de shell y traversal en la ruta
de la lista, el parseo de las 7 secciones del sondeo, la aritmética de la fórmula de estabilidad, que
**una muestra insuficiente sea SKIP y nunca un cero**, y que el primer pintado no lance el sondeo SSH.

```
75/75 checks passed
live round: skipped (set APE_STABILITY_CONSOLE_LIVE=1)

selfcheck exit=0
```

Ficheros: **10** en `dsh-plugins/ape-stability-console/`, **137.466 B** (134,2 KiB) medidos con
`Get-ChildItem -Recurse | Measure-Object Length -Sum`.

### V4 — Las 3 skills nuevas: frontmatter válido y `references.md`

Dos validadores independientes sobre los mismos 6 ficheros (2 por skill):

| Skill | SKILL.md | references.md | `name` == carpeta | `description` |
|---|---|---|---|---|
| `iptv-antifreeze-continuity-doctrine` | 14.218 B · 237 líneas | 8.372 B · 92 líneas | sí | escalar plano, 411 chars |
| `iptv-stream-stability-score` | 11.161 B · 236 líneas | 6.289 B · 87 líneas | sí | escalar plano, 304 chars |
| `iptv-failover-upstream-discipline` | 11.770 B · 198 líneas | 6.753 B · 84 líneas | sí | escalar plano, 311 chars |

Total **6 ficheros · 58.563 B** (coincide exactamente con lo que reportó la tarea de skills).

Validador estructural (comprueba delimitadores `---`, claves de primer nivel, ausencia de mapeos
anidados y de listas, `name` == nombre de carpeta, `description` no vacía y no bloque, LF sin CR):

```
30 PASS | 0 FAIL
exit=0
```

Parser YAML real (`yaml.safe_load` del bloque entre los delimitadores, PyYAML 6.0.3):

```
PASS iptv-antifreeze-continuity-doctrine | keys=['description', 'kind', 'name', 'specialist'] | name=iptv-antifreeze-continuity-doctrine | description=str(411 chars) | kind=anchor | specialist=str
PASS iptv-stream-stability-score | … | description=str(304 chars) | kind=anchor | specialist=str
PASS iptv-failover-upstream-discipline | … | description=str(311 chars) | kind=anchor | specialist=str
---
3 PASS | 0 FAIL
exit=0
```

El parser YAML confirma lo que importa: `description` es **`str`**, no un diccionario ni una lista —
el modo de fallo que rompe el descubrimiento de skills. Las tres tienen `references.md` no trivial
(84–92 líneas cada uno).

### V5 — `docs/architecture/PIPELINE_ESTABILIDAD_4K.md` existe y no tiene cifras sin fuente

**Existe:** 48.926 B · 642 líneas · `sha256=cf560d3ca24b784239bddc2014ad6e499e788a7c4b5d261e956baba1694f5d5e`
· 35 tablas · 42 secciones numeradas.

La auditoría se hizo en dos pasadas, porque la primera regla que escribí (buscar «un número en una
línea sin backtick») daba falsos positivos con los encabezados y las tablas multicolumna. La regla
final, que es la que reporto:

1. **Contrato de tabla.** Cada tabla se abre por su cabecera; se identifica la columna de procedencia
   por nombre (`Cómo`, `Comando`, `Fuente`, `Evidencia`, `Procedencia`, `Origen`, `Salida`, `Base`,
   `Cálculo`) y se exige que la celda de esa columna esté poblada en toda fila que lleve un número.
2. **Contrato de prosa.** Cada párrafo con dígitos debe llevar marcador de procedencia (comando entre
   backticks, ruta, fichero con extensión, `§N` o referencia a código de salida).
3. **Caza de huérfanos.** Todo número de ≥3 dígitos que aparezca fuera de §1 (la tabla de evidencia
   maestra) y fuera de filas con procedencia se contrasta uno a uno contra §1 y contra el servidor.

Resultado: **21 tablas** con columna de procedencia nombrada; las 32 filas que el script marcó como
«sin procedencia reconocible» las leí una por una (§3). **0 huérfanos reales**: los 14 candidatos que
quedaron son referencias a líneas de código (`pulse.php:115`, `pulse.php:333-340`, `pulse.php:685`) o
aritmética cuyos insumos están citados dos líneas más arriba.

Todas las referencias cruzadas `§N` resuelven a una sección existente
(`§2.1 §3.4 §5.2 §5.3 §5.4 §5.6 §6 §6.4 §7 §8 §1.3` → 11/11 correctas; no hay `§` rota).

**No me limité a leer el documento: re-medí sus números en el VPS.** Detalle en §4.

### V6 — El generador y `ape-profiles-config.js` no se tocaron

Aquí no vale un `git status` a ojo, porque un `git status` vacío también puede significar «el fichero
no existe». Tres comprobaciones encadenadas:

```
=== paths exist? ===
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js -> True
IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js       -> True

=== git status --porcelain -- <gen> <cfg> ===
(vacio) OK
=== git diff --stat HEAD -- <gen> <cfg> ===
(vacio) OK

=== worktree blob vs HEAD blob ===
m3u8-typed-arrays-ultimate.js
  git_hash_object = a941199831680242b161575467d68c25ffac3524
  HEAD_blob       = a941199831680242b161575467d68c25ffac3524
  MATCH_HEAD      = True
ape-profiles-config.js
  git_hash_object = 5a3a63044b00263b33ddd5e2d0250291f1d3e32d
  HEAD_blob       = 5a3a63044b00263b33ddd5e2d0250291f1d3e32d
  MATCH_HEAD      = True

=== node -c sobre el generador ===
generator node -c exit=0
profiles  node -c exit=0
```

El hash del blob del **worktree** es idéntico al blob de **HEAD** en los dos ficheros: no hay
modificación, ni siquiera de un byte. Y ambos siguen parseando.

`git status --porcelain` completo del repo devuelve **5 líneas, todas `??` (sin seguimiento), 0 `M`/`A`/`D`**:

```
?? .agents/skills/iptv-antifreeze-continuity-doctrine/
?? .agents/skills/iptv-failover-upstream-discipline/
?? .agents/skills/iptv-stream-stability-score/
?? docs/architecture/PIPELINE_ESTABILIDAD_4K.md
?? dsh-plugins/ape-stability-console/
```

Ni el generador ni `ape-profiles-config.js` aparecen. **Ningún fichero con seguimiento fue modificado
por esta misión.**

### V7 · V8 — La lista servida y el gate del VPS

**V7 — HTTP desde el cliente del operador** (UA de OTT Navigator, `Accept-Encoding: gzip`):

```
http=200 size=4023576 ttfb=0.592901 total=1.345299

HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Content-Length: 4023576
Last-Modified: Sun, 15 Nov 2026 06:12:40 GMT
Content-Encoding: gzip
Cache-Control: no-store
X-APE-List-Source: pulse-wrapped-if-present
Accept-Ranges: bytes
```

`size_download = 4.023.576` — **exactamente** el valor esperado (~4.023.576 B), y coincide con el
`Content-Length` y con el ETag (`0x3d6518` = 4.023.576). `200`, no `304`, no `0`.

**V7-bis — identidad en disco** (para que el 4 MB no sea el único dato):

```
-rw-r--r-- 1 www-data www-data 186789613 Nov 15 06:12 …_LIGHT.m3u8
127380 186789613                    ← wc -lc: líneas y bytes
EXTINF=21224   EXTSHIMOTT=21224   STREAMINF=21224   APE_LINES=0
sha256 a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4
```

186.789.613 B · 127.380 líneas · **21.224 canales · 21.224 tags `#EXTSHIMOTT` · 0 líneas `#EXT-X-APE-`**:
los tres números que el operador declaró como «la buena» se confirman uno a uno.

**V8 — Gate del VPS**, ejecutado por SSH de lectura:

```
{"verdict":"PASS","pass":10,"fail":0,"base":"https://iptv-ape.duckdns.org","checks":[
 {"check":"health","status":"PASS","detail":"200|3|0.005452"},
 {"check":"jit-calidad","status":"PASS","detail":"206 · #EXT-X-APE-CHANNELS:21224"},
 {"check":"lista-cableada","status":"PASS","detail":"200 · #EXT-X-APE-CHANNELS:21224 · EXTINF(4MB)=68 · /pulse/=67"},
 {"check":"canary","status":"PASS","detail":"302|0|0.207659"},
 {"check":"pulse-canal","status":"SKIP","detail":"407|124|0.431360 (canal bloqueado por el proveedor, no por el flujo)"},
 {"check":"endpoint-canal","status":"PASS","detail":"200|272|0.013615"},
 {"check":"vigilante","status":"PASS","detail":"200|1530|0.029478"},
 {"check":"disco","status":"PASS","detail":"82% usado · 6.6G libre"},
 {"check":"cache-resolucion","status":"PASS","detail":"JSON valido · 28 canales medidos"},
 {"check":"vigilante-fresco","status":"PASS","detail":"OK · escrito hace 12s"},
 {"check":"proyeccion","status":"PASS","detail":"186789613B · 21224 canales · 21224 tags · 0 APE"}]}
GATE_EXIT=0
```

**PASS 10/10 confirmado**, con el matiz honesto: el gate tiene **11 checks**, no 10 — `pulse-canal`
sale **SKIP** porque el proveedor devuelve 407, y el gate (correctamente) no lo cuenta como fallo del
flujo. «10/10» es «10 PASS y 0 FAIL»; el SKIP es un caso declarado, no un verde escondido. El propio
gate re-mide la proyección servida y coincide con mi medición: `186789613B · 21224 canales · 21224 tags · 0 APE`.

### V9 — El plugin anterior (`ape-profile-studio`) sigue pasando

```
47/47 checks passed

selfcheck exit=0
```

Y aporta una comprobación cruzada útil: lee `ape-profiles-config.js` y calcula su
`sha256=2961d1ba4d799c5ce13f58b383c151a6ac2b0d26f703522aff7d13f97409c1da` — **el mismo** que obtuve yo
en esta sesión. Dos procesos independientes viendo el mismo byte en el fichero que el operador
prohibió tocar.

---

## 3. Las 32 filas «sin procedencia» del doc de pipeline: una por una

El script marcó 32 filas. Ninguna es una cifra inventada; se resuelven en tres clases:

| Clase | Filas | Cómo se resuelve |
|---|---|---|
| **Aritmética sobre insumos citados** | 201‑203 (8.802 / 61.168 / 189,6 B por canal), 465‑468 (2×/5×/10×), 472, 476, 484, 486, 507, 523, 392 | La columna «Base»/«Cálculo» muestra la operación y sus insumos están en §1.2/§1.1 con su comando. **Verifiqué la aritmética a mano**: 186.789.613 ÷ 21.224 = 8.802 ✓ · 1.298.222.092 ÷ 21.224 = 61.168 ✓ · 4.023.581 ÷ 21.224 = 189,6 ✓ · 5,49+2,77+1,09+3,64+0,469 = 13,46 ≈ 13,4 GB ✓ · 512/3.819 = 13,4 % y 512/3.170 = 16,2 % ✓ · (30+x)/36,6 = 0,90 → x = 2,94 ✓ |
| **Parámetro de diseño de una propuesta** | 246 (gap buffer 5–20 s), 274, 342 (histéresis 60 s) | No es un hecho medido: es la constante que se propone. Declarada como propuesta. |
| **Número heredado de §1 o de §2.1, o valor de una columna que ES la evidencia** | 261, 277, 278, 307, 313‑318, 379, 524, 527, 537, 538, 614 | 376 ms → §1.3 · 7 filas y 11 checks → §1.4 (los verifiqué yo: 7 módulos, 11 checks) · 21.224 → §1.2 · 61,8 % y 458 de 741 → §1.3 · 69 MB RSS → §2.1 con `ps: dockerd 40.420 KB + containerd 28.628 KB = 69.048 KB` ✓ · «Causa raíz NO COMPUTADA» está bien marcada como no computada |

---

## 4. Re-medición independiente de los números del doc (no sólo lectura: contraste)

En vez de fiarme del documento, recalculé sus cifras centrales sobre el log real del VPS. Resultado:

| Afirmación del doc | Su valor | Mi medición (07:26 UTC) | Veredicto |
|---|---|---|---|
| `200` con 0 bytes en `/pulse/` | **0 casos** | **0** | **idéntico** |
| Bytes de los 200 de `/pulse/` | n=269 · min 384 · max 3.917 · suma **515.154** · media 1.915 | n=269 · min 384 · max 3.917 · suma **515.154** · media 1.915,07 | **idéntico, las 5 cifras** |
| `/seg/` bytes relayados | **1.190.394.064 B** | **1.190.394.064 B** | **idéntico byte a byte** |
| `/seg/` peticiones | 141 · 139×200 · **2×404** | `grep -c "/seg/"` = **141** · `GET /seg/` = 139×200 · los **2** extra son `/pulse//seg/…` y `/pulse/seg/1`, **ambos 404** | **idéntico, y el detalle confirma el 404** |
| Códigos de `/pulse/` | 407×458 (**61,8 %**) · 200×269 · 499×10 · 404×3 · 403×1 | 407×**474** (**62,6 %**) · 200×**269** · 499×**10** · 404×**3** · 403×**1** | **200/499/404/403 idénticos**; 407 subió 16 y el % derivó |
| Latencia `/pulse/` | p50 0,376 s · p95 1,174 s · max 12,010 s | p50 **0,373** · p95 **1,103** · max **12,010** | max idéntico; p50/p95 derivan con la ventana |
| Timers `ape-*` | 11 · 10 activos · `ape-quality-watch.timer` inactive | 11 · 10 activos · `ape-quality-watch.timer` **inactive** | **idéntico** |
| Vigilante | 7 módulos · `verdict OK` · `fallos 0` | 7 módulos · `verdict OK` · `fallos 0` | **idéntico** |
| `pulse.php` | 39.039 B desplegado 2026-11-14 17:26 | 39.039 B · `Nov 14 17:26` | **idéntico** |
| Disco | 82 % · 6,6 G libres | gate: `82% usado · 6.6G libre` | **idéntico** |
| `/var` total | 16,1 G | `du -x -d1` → 16.119.400 KB = **16,1 G** | **idéntico** |
| Docker ocioso | 2,77 GB · 69 MB RSS | `du`: 2,4 G containerd + 295 M docker = **2,7 G** · `ps`: 37.768 + 24.088 = **60,4 MB** (RSS deriva) | cifras del doc correctas para su instante |

**Por qué derivan algunas y eso no es un fallo:** el documento declara su ventana
(`2026-11-15 07:00–07:20 UTC`) y su propia §10 dice que tres hechos caducan. El log es un fichero
vivo: entre su medición y la mía pasaron ~20 minutos y entraron 16 peticiones más, todas 407. Lo que
**no** deriva son los números estructurales (bytes, canales, tags, timers, módulos, tamaños de
fichero), y esos coinciden al dígito.

---

## 5. Hallazgos y observaciones (ninguno es una regresión)

### F-1 · ABIERTO — la tarjeta «listas locales» del plugin nuevo nunca encuentra nada en este despliegue

**Severidad: LOW** (una de las cuatro tarjetas del panel; el resto mide el VPS correctamente).
**No es una regresión**: el plugin es nuevo, no había nada antes que se rompiera.

Evidencia (`GET /ape-stability-console/api/state`, respuesta real):

```json
"workspace": {
  "root": "C:\\Users\\HFRC\\AppData\\Local\\DSH_HERRAMIENTAS\\DSH_SIMPLE\\runtime",
  "source": "cwd",
  "candidates": [ {"path":"…\\DSH_SIMPLE\\runtime","source":"cwd","markers":[]},
                  {"path":"…\\DSH_SIMPLE","source":"ancestor+1","markers":[]},
                  {"path":"…\\DSH_HERRAMIENTAS","source":"ancestor+2","markers":[]},
                  {"path":"…\\AppData\\Local","source":"ancestor+3","markers":[]} ]
},
"localLists": [ {"relative":"scratch/APE_LISTA_HARNESS.m3u8","status":"not_found","reason":"ENOENT"},
                {"relative":"scratch/LISTA_ACTUAL.m3u8","status":"not_found","reason":"ENOENT"} ]
```

**Mecanismo leído en el código** (`dsh-plugins/ape-stability-console/index.js:913-944`): `detectWorkspace()`
sólo considera (a) `APE_STABILITY_CONSOLE_WORKSPACE` y (b) `process.cwd()` más **tres** ancestros. El
proceso del Harness corre en `…\AppData\Local\DSH_HERRAMIENTAS\DSH_SIMPLE\runtime`, cuya rama **no llega**
al Desktop, y ninguno de sus candidatos tiene los marcadores (`dsh-plugins`, `contracts`,
`IPTV_v5.4_MAX_AGGRESSION`, `.git` — verificados: los cuatro dan `False` en el runtime y **`True` en el
repo**). Sin marcador, cae al primer candidato: el runtime.

**Consecuencia medida:** los dos ficheros existen en el repo
(`scratch/APE_LISTA_HARNESS.m3u8` = 1.311.382.485 B y `scratch/LISTA_ACTUAL.m3u8` = 604.593.696 B) y el
panel los reporta `ENOENT`, porque los busca bajo el runtime.

**Arreglo (no aplicado, fuera de mi scope de escritura):** definir
`APE_STABILITY_CONSOLE_WORKSPACE=C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` en el
entorno con que arranca el Harness. El código ya lo soporta y lo prioriza (`index.js:921-922, 935`). Es
decisión de configuración del operador, **no** un cambio de código, y no toqué el plugin.

### F-2 · OBSERVACIÓN — el `.gz` de 4.023.581 B y el `Content-Length` de 4.023.576 B son dos ficheros distintos

El doc (§1.2) empareja «`.gz` servido = 4.023.581 B» con un `ls -la`, y la URL pública sirve
`Content-Length: 4023576`. **Los dos números son reales**: son dos compresiones distintas del **mismo
contenido**.

```
…_LIGHT_CABLEADA.m3u8.gz  4023581 B   (root)
…_LIGHT.m3u8.gz           4023576 B   (www-data)  ← la que sirve gzip_static en la URL pública
sha256 del .m3u8 servido por la URL: a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4
sha256 del …_LIGHT_CABLEADA.m3u8   : a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4
cmp -s … → IDENTICAL_BYTES
```

Los dos `.m3u8` son **byte-idénticos** (mismo sha256); los `.gz` difieren 5 B porque gzip embebe
`mtime`/nombre. La etiqueta del doc («Fichero servido» sobre el nombre con `_CABLEADA` duplicado) es
imprecisa, pero **ninguna cifra es falsa**. No lo toqué: la lista servida es intocable.

### F-3 · OBSERVACIÓN — el informe del plugin declara 140,1 KB; medido 137.466 B

`dsh-plugins/ape-stability-console/` son **10 ficheros, 137.466 B (134,2 KiB)**. El informe de la tarea
del plugin dice «10 ficheros, 140,1 KB». Diferencia de ~2,6 KiB en el redondeo; el número de ficheros
sí coincide. Se reporta para que el número del informe no se propague.

### F-4 · OBSERVACIÓN — la cifra `61,8 %` es de su ventana, no un estado permanente

Confirmé el 61,8 % (458/741) como **correcto en su ventana**, y medí 62,6 % (474/757) veinte minutos
después. Cualquier documento que repita «61,8 %» sin fecha estará citando una foto, no una constante.
El propio doc lo advierte en §10; esta nota es para quien lo lea fuera de contexto.

---

## 6. Lo que NO se verificó (y por qué) — sin convertirlo en cero

| # | No verificado | Razón exacta |
|---|---|---|
| N-1 | **Que el entry del sidebar se vea en la GUI** | No tengo DOM ni captura de la página desde esta sesión. Sí verifiqué lo verificable por API: el plugin está `enabled:true`, `fiberPhase:active` y su ruta responde 200 con JSON válido (V13). La visibilidad de un pixel concreto en el sidebar **queda NO VERIFICADA**; afirmar lo contrario sería exactamente el fallo que este documento evita. |
| N-2 | **Reproducción real de un canal 4K en el device** | Requiere el device autorizado, un player y una ventana de reproducción. En esta sesión no hay device: el freeze real (frame drops, errores de decoder) no es observable sin root en el dispositivo — el propio doc lo declara en su §7 (`Ver el freeze real del device: NO`). |
| N-3 | **Capacidad de egress del VPS** (§5.6 del doc: `curl` de 100 MB × 3 desde host externo) | No se ejecutó: consumiría ~300 MB de egress de producción y no está en mi encargo. El doc ya la marca **NO COMPUTADO** y declara una cota inferior de 25,8 Mbps; yo no añado un número nuevo. |
| N-4 | **Duración real del segmento del canal** (que fija el bitrate 6,6–13,1 Mbps) | Requiere descargar un segmento de vídeo del proveedor; el doc lo deja como rango honesto y lo declara supuesto. No se descargó nada. |
| N-5 | **Contenido correcto de las 3 skills** (más allá de estructura y frontmatter) | Verifiqué forma, tamaño, frontmatter, `references.md` y que no se copió código de los repos (las skills citan conceptos). **No** verifiqué la exactitud técnica de cada afirmación dentro de los 6 ficheros: eso exigiría contrastar cada referencia con su fuente, y las fuentes son externas y no se descargaron. |
| N-6 | **Los 11 repos** de estabilidad: licencias, estrellas, endpoints | Fuera de mi tarea (era la tarea de skills, que los citó como concepto). No re-verifiqué sus repos. |
| N-7 | **Que el VPS siga igual dentro de una hora** | Los timers corren cada 60 s (vigilante) y cada 10–15 min (proyección). Mi medición es de la ventana 07:22–07:31 UTC; el doc cita `62–64 min` de ranciedad de la proyección como síntoma vivo. Un snapshot no es una garantía de estado estable. |

Además: **no** verifiqué el plugin `upscale-lab` ni `iptv-4k-supremo` (la misión menciona que existen;
mi encargo nombraba el de referencia `ape-profile-studio`, que sí pasó 47/47).

---

## 7. Reproducción exacta (todo lo que afirmo, en el orden en que lo corrí)

```powershell
# --- local: sintaxis y selfchecks
cd C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION
node -c dsh-plugins/ape-stability-console/index.js          # exit 0
node -c dsh-plugins/ape-stability-console/client.js         # exit 0
node dsh-plugins/ape-stability-console/selfcheck.mjs        # 75/75, exit 0
node dsh-plugins/ape-profile-studio/selfcheck.mjs           # 47/47, exit 0
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js   # exit 0
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js           # exit 0

# --- local: gates del repo
bash tools/quality/gate_ape_crystal_flow.sh --quiet          # VERDICT=PASS pass=6 fail=0
node tools/check_anti_degradation_policy.js                  # TOTAL=8 PASS=8 FAIL=0

# --- local: el generador NO se tocó (blob == HEAD)
git status --porcelain -- IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js
git hash-object IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
git rev-parse  HEAD:IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js

# --- skills: frontmatter (estructural) + YAML real
node  <validador estructural>       # 30 PASS | 0 FAIL
python <validador PyYAML 6.0.3>     # 3 PASS | 0 FAIL

# --- producción por HTTP (sólo lectura)
curl.exe -sk -o NUL -w 'http=%{http_code} size=%{size_download}' -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
# http=200 size=4023576

# --- VPS (sólo lectura; clave id_ed25519_hetzner)
ssh -i C:\Users\HFRC\.ssh\id_ed25519_hetzner root@178.156.147.234 'bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json; echo GATE_EXIT=$?'
# {"verdict":"PASS","pass":10,"fail":0,…}   GATE_EXIT=0
ssh -i … root@178.156.147.234 'wc -lc < /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8; sha256sum /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'
# 127380 186789613   a0ffab645d4201c6d4552f03bb416a7d3a95370edc34e3929a53b346a4c6cbf4
ssh -i … root@178.156.147.234 'systemctl list-timers --all --no-pager | grep -c ape-'      # 11
ssh -i … root@178.156.147.234 'cat /var/lib/ape/module-watchdog.json'                    # 7 módulos, verdict OK

# --- plugin vivo dentro del Harness
curl.exe -s -o state.json -w 'http=%{http_code} bytes=%{size_download}' http://127.0.0.1:3090/ape-stability-console/api/state   # http=200 bytes=32972
curl.exe -s -o NUL -w 'http=%{http_code}' http://127.0.0.1:3090/ape-stability-console/api/does-not-exist                      # http=404
```

Los validadores de frontmatter y de auditoría numérica son scripts efímeros en `%TEMP%` (no forman
parte del repo y no se escribieron ficheros fuera del scope). Su lógica está descrita en §2 (V4) y §2
(V5) para que se puedan re-escribir en una línea si hace falta.

---

## 8. Veredicto

| | |
|---|---|
| **PASS total** | **14** |
| **FAIL total** | **0** |
| **Hallazgos abiertos** | **1** (F-1, LOW, no es regresión: tarjeta de listas locales del plugin nuevo) |
| **NO VERIFICADO** | **7** (§6, cada uno con su razón) |
| **Regresiones detectadas** | **0** — ningún fichero con seguimiento fue modificado; el generador y la configuración de perfiles son byte-idénticos a HEAD; la lista servida conserva sus 21.224 canales y su sha256; el plugin anterior sigue en 47/47; el gate del VPS sigue en PASS con 10 checks verde |

Lo construido **no rompió nada medible**. Lo que no se puede afirmar todavía: que el entry del sidebar
se pinte en la GUI (N-1) y que un canal 4K reproduzca sin freeze en el device (N-2). Ambas cosas
necesitan ojos sobre una pantalla o un device, no un comando — y por eso están aquí, no en la columna
de PASS.

---

## 9. Contraste adversarial y auditoría de evidencia

Un veredicto de «sin regresiones» es de alto riesgo: el operador puede cerrar la misión con él. Antes
de entregarlo lo pasé por dos filtros deterministas del propio proyecto.

**Auditoría de evidencia (`metacog_audit`) sobre las 8 afirmaciones cuantitativas del veredicto:
8/8 SOPORTADO · 0 NO_SOPORTADO · 0 CONTRADICHO · 0 ítems sin artefacto · 0 no atribuidos.**
El único hallazgo de forma que levantó fue *«exit 0 leído como evento ocurrido»* — que es exactamente
el modo de fallo que neutralicé con el control negativo (V10) y con los efectos observables (sha256,
blobs, `Content-Length`), no con códigos de salida.

**Oposición de hipótesis (`adversarial_frame` + `adversarial_verdict`).** Contra-tesis planteada:
«la tesis confunde *el proceso corrió* con *el efecto existe*; los números son de una ventana que ya
rotó y el plugin nuevo tiene una tarjeta que no funciona, así que *no rompió nada* y *todo funciona*
no son lo mismo». Veredicto: **sobrevive la TESIS, 15 vs 3**, con **6 ítems con artefacto** del lado
ganador y **0 ítems sin artefacto** en todo el careo.

De las cuatro pruebas discriminantes que propone el marco, dos se ejecutaron y dos **no**:

| Prueba | Estado | Resultado / razón |
|---|---|---|
| Artefacto del número central (¿cada cifra se reproduce desde su origen?) | **EJECUTADA** | Pasó: blob == HEAD, sha256 del servido, `wc -lc`, `grep -c`, gate JSON, selfchecks. Coinciden al dígito las estructurales |
| Ventana retenida (¿el instrumento cubre el periodo que la tesis afirma?) | **EJECUTADA, parcial** | Mi ventana (07:22–07:31) **no cubre** la del doc (07:00–07:20): 61,8 %→62,6 % y p50 376→373 ms. Límite declarado en F-4 y N-7 |
| Intervención sobre el mecanismo | **NO EJECUTADA** | Exigiría mutar producción (forzar un 5xx o reiniciar un módulo) para ver si el consecuente se mueve. Prohibido por el alcance: sólo lectura, cero mutaciones |
| Búsqueda del tercer factor | **NO EJECUTADA** | La tesis es de **estado** (bytes, hashes, selfchecks), no de causalidad entre variables: no hay factor común que aislar al comparar hashes |

La contra-tesis aportó dos ítems con artefacto (F-1 y la deriva de ventana) y eso **bajó el margen pero
no invirtió el resultado**: ninguno de los dos toca los invariantes que hacen la diferencia —blob del
generador == HEAD, sha256 y conteos de la lista servida, gate del VPS en PASS—, que sí están
respaldados por artefacto reproducible. Donde no hay artefacto, este documento no afirma nada.
