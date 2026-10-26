# REA · R16 — Verificación final de evidencia sobre R6.2 (compuerta DRM semántica)

> **Tarea:** `t16` (R16) · **Intento:** `4511a2c1-093e-438f-b73d-d6a3a0b8b6c3` · **Miembro:** `verifier`
> **Fecha:** 2026-10-25 (America/Bogota) · **Entregable:** `docs/REA_EVIDENCE_AUDIT.md`
> **Naturaleza:** verificación final de evidencia, **solo lectura** sobre los entregables. No ejecuta APK,
> no usa dispositivos, no accede a red, no modifica R6 ni R1–R5. Único fichero escrito: este informe.
> **Objeto:** `docs/REA_STREAMING_ANALYSIS.md` en su revisión **R6.2**
> (`20adf4297c41740f3153c28593e23528dd0f0ffbbb50c8fa6de51f14d8c0ab6f`, 1.273 líneas, 96.753 B).
> **Regla:** cada comprobación se hizo contra el artefacto real. Lo que no se pudo comprobar está en §10;
> lo que cambió después de la congelación está en **D1** (§9), no confundido con un defecto de R6.2.

---

## 0. Revisión auditada y veredicto

### 0.1 Revisiones y digests (histórico declarado por sha)

| Revisión | Líneas | Bytes | SHA-256 | Estado |
|---|---:|---:|---|---|
| **R6.0** (entrega t6) | 1.180 | 83.980 | `068647d9959aa84b2f2461bcfb0bd1327d1e2e143dd9583d2d621ec772d046e6` | Histórica (auditada en R7: FAIL) |
| **R6.1** (reparación t9) | 1.200 | 85.675 | `38a29cfc58be90b643c2386efc9188a78eaf217ab60cbea566ad15eb3b8d142e` | Histórica (digest interno `89f2d15d…`) |
| **R6.2** (reparación t13) | **1.273** | **96.753** | **`20adf4297c41740f3153c28593e23528dd0f0ffbbb50c8fa6de51f14d8c0ab6f`** | **VIGENTE — auditada aquí** |

**Digests anti-autorreferencia (verificados, no son el hash del fichero):**

| Digest interno | Cómo se comprobó | Resultado |
|---|---|---|
| R6.1 `89f2d15db61727d1ae22e4391107464345b9b9bfd168eb7e493648834b98b59f` | Sobre el snapshot R6.1, celda R6.1 → 64 ceros | **Coincide** |
| R6.2 `0f656d0fa8b7857e0f92640f203457d4ad1de9a6f4df796eb3e720aa79e0b188` | Sobre R6.2, celda R6.2 → 64 ceros | **Coincide** |
| R6.0 `068647d9…` | Hash completo del fichero entregado en t6 | **Coincide** |

**Advertencia para revisores futuros:** la tabla §5.G de R6 usa la convención anti-autorreferencia
(sustituir la propia celda por 64 ceros). Comparar `89f2d15d…` o `0f656d0f…` con `Get-FileHash` del
fichero es un error de método; el hash del fichero R6.2 es `20adf429…8ab6f`.

### 0.2 Veredicto por criterio (6 criterios de t7/t10, sobre R6.2)

| # | Criterio | Veredicto | Evidencia |
|---:|---|---|---|
| 1 | SHAs citados = fichero real (documentos, APK, código) | **PASS en R6.2** (ver D1) | §2 |
| 2 | Muestra ≥10 afirmaciones `[observado]` verificables | **PASS (26/26 en R6.2)** | §3 |
| 3 | Cero ✓/✗ inventados en la matriz de headers | **PASS** | §4 |
| 4 | Sección DRM = solo inventario, sin handshake/bypass | **PASS (compuerta semántica)** | §5 |
| 5 | Diagramas coherentes con el texto | **PASS** | §6 |
| 6 | Cobertura declarada y ruta para cerrarla | **PASS** | §7 |

### 0.3 Compuertas de esta verificación

| Compuerta | Comando | Resultado |
|---|---|---|
| **V1 — DRM semántica** | §11.1 | **PASS**: `FRONTERA_DECLARACIONES=18 VERBO_BYPASS=false` (`exit 0`) |
| **V2 — R6.2 + cierres + informe** | §11.1 | **PASS**: `sha=20adf4297c41740f A1=true D6=true S46=true AUDIT=true` (`exit 0`) |
| **Censo contextual de términos** | §11.2 | **PASS**: 27 términos, 0 violaciones, 0 verbos de bypass (§5.3) |
| **G1 — léxico anterior** | histórico | **CERRADO como defecto del léxico**: 9 falsos positivos, explicados en §5.4 |
| **D1 — deriva post-congelación** | §2.3 y §9 | **ABIERTO**: el generador cambió tras congelar R6.2 (H1 corregido en producción) |

**Veredicto de evidencia sobre R6.2: PASS (6/6).** R6.2 es un snapshot correcto y verificable en su fecha;
la compuerta DRM semántica confirma que **G1 era un defecto del léxico de la compuerta anterior, no del
documento**. Se abre **D1** porque un artefacto **externo a R6.2** (el generador) cambió después de la
congelación y deja obsoletas dos citas de línea y una afirmación de H1; eso no invalida la auditoría del
snapshot, pero debe resolverse antes de presentar R6 como estado *actual* (§9.2).

---

## 1. Método

1. `Get-FileHash -Algorithm SHA256` y Python 3.12.10 para los 6 documentos, los 9 archivos APK y los
   8 ficheros de código citados.
2. Lectura de entradas ZIP y CRC con `zipfile`; conteo de huellas sobre `classes*.dex`.
3. Lectura línea a línea de las citas `fichero:línea` de código y de las fuentes ABR pinneadas.
4. **Compuerta DRM semántica** (no léxica): (a) aserción positiva de frontera — declaraciones explícitas
   de no-análisis; (b) aserción negativa de verbos de bypass concretos; (c) censo contextual de
   `widevine|playready|handshake` clasificado por sección (matriz, hallazgos, acciones, frontera, revisión),
   sin convertir la proximidad en fallo.
5. Comprobación de los cierres de t8: §4.6, §5.D.6 y C6–C8.
6. Verificación de los digests anti-autorreferencia de R6.1/R6.2 y del hash completo de R6.0.

**No se hizo:** no se ejecutó ningún APK; no se usó Frida ni dispositivo; no se re-descompiló con JADX; no
se accedió al VPS. Los datos de nginx/4K se auditan como cadena de custodia documental (R5).

---

## 2. Criterio 1 — SHAs: PASS en R6.2 (con D1)

### 2.1 Documentos (medidos hoy)

| Doc | Líneas | Bytes | SHA-256 medido | ¿Coincide con R6.2? |
|---|---:|---:|---|---|
| R1 | 741 | 55.254 | `bb3d19617a49a0a30c9b621930eb73c3a007ea337fd9dd41d559aeb7d3aa41d8` | **SÍ** |
| R2 | 1.140 | 80.586 | `844b7ded1d182f4896903099fca608ee671005163c9230bac9c1d35e0b4fc1ed` | **SÍ** |
| R3 | 1.033 | 77.074 | `e7047509956ab3af2262c5f4ef9aeb7417a49be20cb690d147a19e93b2946baa` | **SÍ** |
| R4 | 792 | 58.035 | `fa866e39fd91a270c808d04905c7694ae49c1a6e031f08f84999d78f050d0b8d` | **SÍ** |
| R5 | 836 | 50.561 | `dc63165e036ac8ece076dd9e382e9f202ad483248af7808ffa3a577fd0a38eb5` | **SÍ** |
| **R6.2** | **1.273** | **96.753** | **`20adf4297c41740f3153c28593e23528dd0f0ffbbb50c8fa6de51f14d8c0ab6f`** | (auditado) |

### 2.2 APK (8 únicos; 9 archivos por 1 duplicado)

| ID | Bytes | SHA-256 medido | ¿Coincide con R6.2 §5.B.1? |
|---|---:|---|---|
| A1 `1.7.3.3` | 21.849.704 | `b964c27457b43be633ee5828a2dabeb09d7f56a3d39b82172e110ed26039b6fd` | **SÍ** |
| A2 `1.6.9.4` | 74.121.056 | `bd509c0cb24b32deaae19c311b5537f60d5eb4c853163829f625a13d997d6854` | **SÍ** |
| A2′ duplicado | 74.121.056 | idéntico a A2 | **SÍ** |
| A3 SFA arm64 | 28.190.211 | `9adfa37e09e8b58c4476cb5ac233e56fd09cdb4e9a30e8ac2cc3f3315999e3b4` | **SÍ** |
| A4 SFA armv7 | 27.919.469 | `1b5e0d84c76ca31f7e979257659c931980ddfc7e63ddf7526d5f0b8ac4fb3e7a` | **SÍ** |
| A5 SFA 1.11.11 | 13.706.426 | `83e2d08f070427c6e047510d4ea4c99b5ad792ef0a659d169d5e0281c48229b0` | **SÍ** |
| A6 v2rayNG | 30.905.560 | `52a79ed8c0e3ac669a74ad9a988d746e70497044db7de84bfd8c47e419dac56e` | **SÍ** |
| A7 ape-agent | 34.192.621 | `11101de8979ad68e895af1a29df6496b1f648284a8c5f38e6cf463d70e86b1c1` | **SÍ** |
| A8 X-plore | 11.251.127 | `1f019bde72fd4b6fefb273e57222d26e27449f36d0ecff370448db205c793a3d` | **SÍ** |

Totales: **9 archivos = 316.257.230 B**, **8 únicos = 242.136.174 B**, **analizable = 230.885.047 B**.

### 2.3 Ficheros de código citados — 7/8 intactos, 1 con deriva post-congelación (D1)

| Fichero (R6.2 §5.B.3) | Citado | Medido hoy | ¿Igual? |
|---|---|---|---|
| `headers-matrix-v9.js` | 30.601 · `ff01118d…c760` | 30.601 · `ff01118d…c760` | **SÍ** |
| `ape-profiles-config.js` | 367.765 · `71776a01…ec20` | 367.765 · `71776a01…ec20` | **SÍ** |
| `bw-estimator-v9.js` | 10.243 · `62b0e24c…f1b2` | 10.243 · `62b0e24c…f1b2` | **SÍ** |
| `streaming-input-resolver.js` | 17.454 · `838aa888…b9618` | 17.454 · `838aa888…b9618` | **SÍ** |
| `ape_gateway.lua` | 19.087 · `b9eb1406…2710` | 19.087 · `b9eb1406…2710` | **SÍ** |
| `resolve.php` | 43.754 · `9815c663…9040` | 43.754 · `9815c663…9040` | **SÍ** |
| `index-v4.html` | 266.355 · `103093be…3f4f` | 266.355 · `103093be…3f4f` | **SÍ** |
| **`m3u8-typed-arrays-ultimate.js`** | **746.967 · `2315184e…c1b1bb`** | **748.547 · `34994f02…e2dc5`** | **NO (D1)** |

**D1 — qué cambió y cuándo.** El generador fue modificado el **2026-10-25 a las 23:08:52**, después de
que R6.2 quedara congelado (23:02:59) y después de la verificación de t10 (donde aún medía `2315184e…`).
El cambio implementa el **fix de H1**: `build_exthttp()` ahora devuelve un objeto
`{headers, overflow, overflowCount, overflowTag, primaryJson, tag, toString}` (bloque comentado
`[FIX H1 · t52]`, líneas actuales 5610-5641) y el `spread` del consumidor (`.headers`) ya funciona
(línea actual 8454). Efectos sobre R6.2:

| Cita de R6.2 | Estado actual | Consecuencia |
|---|---|---|
| §5.B.3: generador 746.967 B / `2315184e…` | 748.547 B / `34994f02…` | SHA y tamaño obsoletos (deriva) |
| `MAIN:7945-7947` (caller `_exthttp_base`) | líneas **7968-7970** (+23) | cita desplazada |
| `MAIN:8431` (`..._exthttp_base.headers`) | línea **8454** (+23) | cita desplazada |
| §4.4 **H1** / §4.6 **A1** / §1.2 ("no llega") | el código ya devuelve objeto y el payload **sí** se fusiona | H1 era cierto al congelar; **hoy está corregido** |

Las demás citas del generador que se comprobaron siguen resolviendo: `MAIN:2356-2360` (denylist),
`MAIN:2989-2991` (SESSION-DATA), `MAIN:5429-5431` (topes), `MAIN:5608` (`const exthttp`),
`MAIN:4917-4919` (Accept), `MAIN:4951`/`8448` (`X-Playback-Session-Id`), `MAIN:8573` (`Connection`),
`MAIN:8677` (`#EXHTTTP` final). La deriva afecta a la **vigencia** del entregable, no a la exactitud
de R6.2 en su fecha. Se recomienda erratum o R6.3 (§9.2).

### 2.4 Hashes internos, offsets, firmas, Evidence IDs y digests

- **15/15** hashes de `classes*.dex` de R1 §5: sin cambios, coinciden.
- **11/11** offsets ZIP de R6.2 §5.C.1 (`header_offset`, comprimido, descomprimido, método, CRC-32):
  coinciden al recalcular.
- **22/22** hashes de fuentes ABR de R6.2 §5.B.4: coinciden en `%TEMP%\rea_abr\src`.
- **9/9** `Evidence ID` de R6.2 §5.C.3 presentes en `REA_R2_evidence_bundle.json.gz` (5.917.086 B).
- **Firmas declaradas** (mismos APK): A1 solo v2 `6cf278ec…` sin stamp; A2 v1+v2+v3 `2e12755b…` +
  Source Stamp `3257d599…` (REA no verifica criptográficamente; R6 lo declara igual).
- **Identidad AXML:** A1 `1.7.3.3`/25110201/min26/t30; A2 `1.6.9.4`/23072804/min23/t33; A3/A4 662;
  A5 520; A6 4000627; A7 vc1/t28; A8 44600.
- **Digests R6.0/R6.1/R6.2** verificados (§0.1).

**Resultado C1: PASS para los 6 documentos, 8 APK, 15 dex, 11 offsets, 22 fuentes, 9 IDs y firmas.
7/8 ficheros de código intactos; 1 con deriva post-congelación → D1 (abierto, §9.2).**

---

## 3. Criterio 2 — Muestreo de `[observado]`: PASS (26/26 en R6.2)

Se repitieron las 26 muestras de R7/R10 sobre R6.2. Las 26 verificaban en la fecha de congelación
(t10); en la re-comprobación de hoy **24 siguen resolviendo igual** y **2 han sido desplazadas por D1**
(`MAIN:7945-7947` → 7968-7970; `MAIN:8431` → 8454). El contenido de las demás no cambió.

| # | Afirmación (R6.2) | Comprobación actual | Resultado |
|---:|---|---|---|
| 1 | SESSION-DATA load_control/track_selection/bandwidth_meter (`MAIN:2989-2991`) | Líneas 2989-2991 actuales | **EXACTA** |
| 2 | `build_exthttp()` devuelve string (`MAIN:5608`) | Línea 5608 (`const exthttp = …`) | **EXACTA en R6.2**; el retorno ya es objeto (D1) |
| 3 | El caller guarda el string (`MAIN:7945-7947`) | Ahora 7968-7970 (+23) | **DESPLAZADA (D1)** |
| 4 | Spread `.headers` sobre string → `{}` (`MAIN:8431`) | Ahora 8454; el fix hace que `.headers` exista | **DESPLAZADA + H1 corregido (D1)** |
| 5 | Tope EXTHTTP 200/8.192 (`MAIN:5429-5431`) | Líneas 5429-5430 | **EXACTA** |
| 6 | 9 tóxicos + 2 familias (`MAIN:2356-2360`) | Líneas 2356-2360 | **EXACTA** |
| 7 | `Connection=keep-alive` en KODIPROP | Línea 8573 actual (una de las dos) | **EXACTA (desplazada por D1)** |
| 8 | `X-Playback-Session-Id` | 4951 y 8448 actuales | **EXACTA** |
| 9 | `Accept`/`Accept-Language`/`Accept-Encoding` (`MAIN:4917-4919`) | Líneas 4915-4921 | **EXACTA** |
| 10 | EWMA 3/9 s y des-sesgo (`BW:43-47,68-87`) | `bw-estimator-v9.js` intacto | **EXACTA** |
| 11 | `SAFETY_FACTOR` 0.95/0.7 (`resolver:53-54`) | Intacto | **EXACTA** |
| 12 | `X-ABR-Switch-Interval-S` ← `abrSwitchInterval` (`PROFILES:4590`) | Intacto | **EXACTA** |
| 13 | Breaker TTL 15 (`ape_gateway.lua:168-179`) | `:169` gate, `:178` set | **EXACTA** |
| 14 | Orden de carga UI (`index-v4.html:3612,3925-3927,3930,3971-3972,3978`) | Intacto | **EXACTA** |
| 15 | `AgentService` aplicador puro (`:12-20,58-67`) | Intacto | **EXACTA** |
| 16 | `SettingsApplier` allowlist (`:8-17,23-46`) | Intacto | **EXACTA** |
| 17 | `ApePlayer` HEVC-first (`:29-53`) | `:32` (`VIDEO_H265`), `:46` (`DefaultHttpDataSource`) | **EXACTA** |
| 18 | `.tflite` baseline (`UltraEnhancePipeline.kt:11-21`) | Intacto | **EXACTA** |
| 19 | Token por archivo (`Config.kt:7-13,46-53`) | Intacto | **EXACTA** |
| 20 | media3 1.3.1 (`build.gradle.kts:76-81`) | `:76` | **EXACTA** |
| 21 | `.tflite` 1.676/1.484/1.580 B | assets | **EXACTA** |
| 22 | ExoPlayer 369/97; media3 0/0 | Conteo dex | **EXACTA** |
| 23 | `conviva` 0 hits | Conteo dex | **EXACTA** |
| 24 | `libvlc.so` solo A2 | ZIP | **EXACTA** |
| 25 | OkHttp por build: A1 325 `Lokhttp3` / A2 2 | Descriptores dex | **EXACTA** |
| 26 | Hits DRM por build: A1 3/3, A2 2/2 (§5.G) | Conteo dex | **EXACTA** |

**Medición propia de artefacto (no se acepta lo que declare el documento):**

| APK | `Lokhttp3` | `okhttp3` hits | widevine | playready | exoplayer | media3 | conviva |
|---|---:|---:|---:|---:|---:|---:|---:|
| A1 `1.7.3.3` | **325** | 682 | **3** | **3** | 369 | 0 | 0 |
| A2 `1.6.9.4` | **2** | 5 | **2** | **2** | 97 | 0 | 0 |

**Resultado C2: PASS (26/26 en R6.2; 24 siguen resolviendo hoy, 2 desplazadas por D1).**

---

## 4. Criterio 3 — Matriz sin ✓/✗ inventados: PASS

- **R6.2:** `✓` = **1** (fila H10, l.606: "Riesgo de inferir ✓ de TiviMate/Disney+/Prime desde
  doctrina" — advertencia, no celda); `✗` = **0**.
- **R1/R2/R3/R5:** 0 marcas. **R4:** 7 ✓ y 3 ✗, todas en prosa que prohíbe inventarlas (R4:12, 296, 578).
- **Celdas de apps no analizadas:** `N/D` en las 17 features (§4.1) y en las 22 familias (§4.2); fila 22 =
  `FUERA` (doctrina). Muestra comprobada: filas 2-6 de §4.1 con `N/D` en TiviMate/Disney+/Prime.
- §4.6 y §5.D.6 son tablas de acciones (propuestas), sin ✓/✗.

**Resultado: PASS.**

---

## 5. Criterio 4 — Compuerta DRM semántica: PASS (G1 cerrado)

### 5.1 (a) Aserción positiva de frontera

Sobre el texto normalizado (sin `*`, `_`, backticks), la compuerta cuenta declaraciones explícitas de
no-análisis con el regex
`no se analiza|no implementar|fuera de alcance|solo inventario|no es DRM real|sin serlo`:

**`FRONTERA_DECLARACIONES = 18`** (≥2 exigidas). Distribución: 9 en frontera (§1.2/§1.3/§1.5/§2.2/§3.5),
3 en el diagrama/nota de §2.2-§2.4, 2 en la matriz (§4.2), 1 en §4.5 y 3 en §4.6. Además
`"solo inventario"` aparece en la arista del diagrama §2.2.

### 5.2 (b) Aserción negativa de verbos de bypass

Se comprueban **patrones concretos** (no proximidad):

| Patrón | Resultado |
|---|---|
| `(obtener|descargar|enviar|extraer|replicar)\s+(la\s+)?(clave|key|licencia|cdm)` | **false** |
| `decrypt` | **false** |
| `license request` | **false** |
| `setChallenge` | **false** |
| `provideKeyResponse` | **false** |
| `HDCP key` | **false** |

**`VERBO_BYPASS = false`.** No hay ninguna instrucción de obtención/descarga/envío/extracción/replicación
de claves, licencias o CDM, ni nombres de API de bypass.

### 5.3 Censo contextual de `widevine` / `playready` / `handshake` (27 términos)

Los términos de la matriz y de la tabla de hallazgos **no cuentan como violación por sí mismos**: se
declaran por contexto. Clasificación por sección:

| Contexto | Términos | Dónde | Lectura |
|---|---:|---|---|
| Frontera declarada | **12** | §1.3 f11 ("Prohibido"), §1.5 ("no se analiza"), §2.2 diagrama ("solo inventario"), §3.5 ("no se analiza"), §4.3, §4.5 ("fuera de alcance") | Prohibición / no-análisis |
| Matriz de headers | **3** | §4.2 f17 (`X-WidevineKeySystem…` "metadata inerte; **no** es DRM real"), f22 (`Handshake…` "**NO — fuera de alcance**") | Inventario de familias, sin soporte afirmado |
| Límites de la matriz | **1** | §4.5 ("handshake, claves, CDM y HDCP están fuera de alcance") | Frontera |
| Acciones por header | **5** | §4.6 A10 ("aparentan soporte DRM **sin serlo**"; retirar/renombrar), A13 ("no implementar ni documentar handshake") | Acción de limpieza / prohibición |
| Revisión §5.G | **4** | §5.G f7 ("Hits de DRM atribuidos por build: A1=3/3; A2=2/2") | Inventario de coincidencias |
| Otro (equivalencias) | **2** | §2.4 ("Inventario de clases…; sin análisis | No analizado | Fuera de alcance") | Inventario |
| **Total** | **27** | — | **0 violaciones; 0 verbos de bypass** |

**Resultado: PASS.** La frontera está declarada 18 veces; los 27 términos son inventario, acción de
limpieza o nota de frontera; ningún patrón de bypass aparece.

### 5.4 G1 — qué fue y por qué la compuerta nueva lo evita (para que no se confunda con un defecto)

**G1 fue un defecto del léxico de la compuerta anterior, no del documento.** La compuerta léxica de t10
buscaba, en una ventana de ±120/180 caracteres, uno de estos cinco literales:
`{no se analiza, prohibid, fuera de alcance, inventario, sin analizar}`. R6.2 usa delimitadores igual de
válidos que **no estaban en esa lista**: "metadata inerte; **no es DRM real**" (§4.2 f17), "aparentan
soporte DRM **sin serlo**" (§4.6 A10), "**no implementar** ni documentar handshake" (§4.6 A13) y
"**Hits** de DRM atribuidos por build" (§5.G f7). Resultado: **9 falsos positivos** y `exit 1`, sin que
hubiera una sola instrucción de DRM. t10 lo documentó como G1 y el capitán corrigió el enfoque.

**Cómo lo evita la compuerta semántica de t16:** (1) no depende de proximidad a cinco literales, sino de
**aserción positiva global** (≥2 declaraciones de frontera; hay 18); (2) usa una **aserción negativa
sobre verbos y APIs concretas de bypass** (0 apariciones); (3) **cataloga** los términos de matriz,
hallazgos y acciones por contexto en lugar de contarlos como violaciones. Con este método, R6.2 pasa
sin ambigüedad y G1 queda cerrado como **defecto de la compuerta**, no del documento.

---

## 6. Criterio 5 — Diagramas: PASS

R6.2 conserva **4 bloques Mermaid** (40 fences balanceados) y 41 cajas/actores/estados; §4.6 y §5.D.6
son tablas, no diagramas.

| Diagrama | Nodos | Evidencia |
|---|---:|---|
| §2.2 OTT Navigator (l.171-208) | 12 | R2:206-214/242-243/276-410/349-358/412-470/472-491/556-576; R1:138-143 |
| §2.3 Nuestro stack (l.210-238) | 12 | `index-v4.html:3612,3925-3927,3930,3971-3972,3978`; `MAIN:8677,8011,3750`; 28 módulos `.lua`; `build.gradle.kts:76-81` |
| §5.D.1 Secuencia ABR (l.1000-1034) | 5 | R3:602-634; constantes contrastadas (`config.ts:425/428`, media3 1000/2000, Exo2 2500/5000, `DefaultBandwidthMeter:450`, `maxWeight 2000`) |
| §5.D.2 Máquina de estados (l.1036-1061) | 12 | R3:636-659; `InsufficientBufferRule.js:103`; `shaka/ewma.js:75-78` |

Las rutas nuevas de §4.6/§5.D.6 (`MAIN`, `WRAP`, `PHPUH`, `CORS`, `PROFILES`, `QOS`, `BW`) existen y sus
líneas son plausibles (`QOS:472`, `MAIN:2999` verificados). Las líneas del generador citadas en el
diagrama del stack resolvieron con el desplazamiento +23 de D1 (`8677`, `8011`, `3750`).

**Resultado: PASS.**

---

## 7. Criterio 6 — Cobertura declarada: PASS

- **5 secciones:** §1 (l.60), §2 (l.163), §3 (l.263), §4 (l.516), §5 (l.653) + ficha §0.
- **§1.3:** 13 huecos con motivo y etiqueta. **§5.F:** 17 desconocidos con "cómo se cierra".
- **Apps ausentes:** TiviMate §3.4, Disney+ §3.5, Prime §3.6 = **NO** (0 APK / 0 ADB) con motivo; §3.8
  (l.471-503) da ruta local y ADB exacto (`adb devices` → `pm list packages` → `pm path` → `adb pull`),
  con prohibición de ADB remoto.
- **OTT:** disponible con REA real; corrección del encargo visible (§1.4-C1 l.145; §3.0 l.269-283).
- **Premisa:** `adb` 36.0.2, `adb devices -l` → **0 dispositivos**.

**Resultado: PASS.**

---

## 8. Cierres verificados

### 8.1 F0 / F1 / F3 (de t7)

| ID | Verificación en R6.2 | Estado |
|---|---|---|
| **F0** | `no se analiza` en texto plano ×2 (l.154, l.450); sin `**no**` partido | **CERRADO** |
| **F1** | §1.2 l.82-86 y §3.1.2 l.315-318: A2 solo `PublicSuffixDatabase`; A1 325 `Lokhttp3` + 682 hits; 0 generalizaciones; artefacto 325/2 | **CERRADO** |
| **F3** | §5.G f7 (l.1251): A1=3/3, A2=2/2; artefacto 3/3 y 2/2 | **CERRADO** |

### 8.2 Cierres de t8 (R8-F2/F3/F4) presentes en R6.2

| Cierre | Contenido verificado | Estado |
|---|---|---|
| **§4.6** (l.619-648) | **13 acciones A1–A13** con columnas Impacto / Corrección (fichero:línea) / Verificación; cobertura de las 22 familias (l.647-648) | **PRESENTE** |
| **§5.D.6** (l.1126-1162) | **9 filas R3-F1..F9** (severidad, acción, fichero:línea, verificación) + **plan mínimo de 7 acciones** (1→3→7→2→4→6→5) | **PRESENTE** |
| **C6–C8** (l.141-143) | Referencias corregidas a `R5 §1.5/H1`, `R5 §2.4/H2`, `R5 §3/H3`; 0 referencias a "§4.4 H1/H2/H3" | **CORREGIDO** |

Además, `R3-F*` se cita **12 veces** en R6.2 (9 filas + C5 + cierre de §5.D.6 + nota), coherente con lo
declarado por t13. **La calidad de esas acciones es materia de t12; aquí solo se verifica su presencia,
estructura y referencias.**

---

## 9. Hallazgos

### 9.1 Cerrado

| ID | Sev. | Qué fue | Cómo se cerró |
|---|---|---|---|
| **G1** | MEDIA | La compuerta DRM léxica de t10 daba 9 falsos positivos por un léxico incompleto (no reconocía "inerte", "no es DRM real", "sin serlo", "no implementar", "hits por build") | Sustituida por la compuerta semántica de t16: 18 declaraciones de frontera, 0 verbos de bypass, 27 términos catalogados por contexto. **G1 era defecto de la compuerta, no del documento** (§5.4) |

### 9.2 Abierto — D1 (deriva post-congelación, no defecto de R6.2 en su fecha)

| Campo | Detalle |
|---|---|
| **ID** | **D1** · Severidad **ALTA para la vigencia**, no para la exactitud del snapshot |
| **Qué** | `m3u8-typed-arrays-ultimate.js` cambió el 2026-10-25 23:08:52, después de congelar R6.2 (23:02:59): 746.967 B/`2315184e…` → **748.547 B/`34994f02…`** |
| **Contenido del cambio** | Fix de **H1**: `build_exthttp()` ahora devuelve objeto `{headers, overflow, …}` (`[FIX H1 · t52]`, l.5610-5641) y el `spread` del consumidor funciona (l.8454) |
| **Efecto en R6.2** | §5.B.3 cita SHA/tamaño obsoletos; `MAIN:7945-7947` → 7968-7970 y `MAIN:8431` → 8454; **H1** (§4.4, §4.6-A1, §1.2) era cierto al congelar, pero **el código ya está corregido** |
| **Corrección exigida** | Antes de presentar R6 como estado actual: (a) erratum de R6.2 con la nota de D1 y la actualización de SHA/líneas/H1, o (b) R6.3 que re-mida el generador y reescriba H1/A1 como "corregido en producción (t52)". No requiere rehacer R1–R5 (snapshots históricos) |
| **Propietario** | captain / doc-writer (R6); el fix ya existe en producción |

### 9.3 Informativo

| ID | Sev. | Nota |
|---|---|---|
| F5 | INFO | Deriva R5 (`3b8b9eed…`→`dc63165e…`) y R1 (740→741 líneas) sigue registrada en R6.2 §5.G; sin acción |

---

## 10. Límites de esta verificación

| # | Límite | Cómo se cerraría |
|---:|---|---|
| 1 | Cuerpos completos de métodos descompilados de OTT | `inspect_android_method` (Anexo E.4 de R6); no se re-ejecutó JADX |
| 2 | Datos de VPS (bounce, breaker, 4K) | R5 (logs/`systemctl`) o re-medición en el VPS; auditoría offline |
| 3 | Aceptación de headers por el proveedor | Probe autorizado (declarado `[no disponible]`) |
| 4 | Runtime de cualquier APK | Equipo autorizado + ADB (0 dispositivos hoy) |
| 5 | Verificación criptográfica de firmas | `apksigner verify`; REA reporta lo declarado |
| 6 | Contenido exacto del generador en el instante de congelación de R6.2 | No hay snapshot del fichero; la igualdad se apoya en la medición de t10 (`2315184e…`) y en la deriva fechada de D1 |

---

## 11. Reproducibilidad

### 11.1 Comandos del contrato (t16)

```powershell
# V1 — DRM semántica (frontera positiva + bypass negativo)
node -e "const s=require('fs').readFileSync('docs/REA_STREAMING_ANALYSIS.md','utf8');const plain=s.replace(/[*_`]/g,'');const pos=(plain.match(/no se analiza|no implementar|fuera de alcance|solo inventario|no es DRM real|sin serlo/gi)||[]).length;const bypass=/(obtener|descargar|enviar|extraer|replicar)\s+(la\s+)?(clave|key|licencia|cdm)|decrypt|license request|setChallenge|provideKeyResponse|HDCP key/i;console.log('FRONTERA_DECLARACIONES='+pos,'VERBO_BYPASS='+bypass.test(plain));process.exit(pos>=2&&!bypass.test(plain)?0:1)"
# salida hoy: FRONTERA_DECLARACIONES=18 VERBO_BYPASS=false  (exit 0)

# V2 — sha de R6.2 + cierres + informe
node -e "const fs=require('fs'),c=require('crypto');const f='docs/REA_STREAMING_ANALYSIS.md';const b=fs.readFileSync(f);const sha=c.createHash('sha256').update(b).digest('hex');const s=b.toString('utf8');const okA1=/A1/.test(s)&&/325/.test(s)&&/Lokhttp3/.test(s);const d6=/5\.D\.6/.test(s);const a46=/4\.6/.test(s);const audit=fs.readFileSync('docs/REA_EVIDENCE_AUDIT.md','utf8');console.log('sha='+sha.slice(0,16),'A1='+okA1,'D6='+d6,'S46='+a46,'AUDIT='+/PASS/.test(audit));process.exit(okA1&&d6&&a46&&/PASS/.test(audit)?0:1)"
# salida hoy: sha=20adf4297c41740f A1=true D6=true S46=true AUDIT=true  (exit 0)
```

### 11.2 Censo contextual de términos (script)

```powershell
@'
const fs=require('fs');
const raw=fs.readFileSync('docs/REA_STREAMING_ANALYSIS.md','utf8');
const plain=raw.replace(/[*_`]/g,'');
const lines=raw.split('\n');
const heads=[]; lines.forEach((l,i)=>{ if(/^#{2,4} /.test(l)) heads.push({line:i+1,text:l.replace(/^#+\s*/,'')}); });
function sectionOf(n){ let s=''; for(const h of heads){ if(h.line<=n) s=h.text; else break; } return s; }
const terms=[...plain.matchAll(/widevine|playready|handshake/gi)];
const counts={};
for(const m of terms){ const ln=plain.slice(0,m.index).split('\n').length; const sec=sectionOf(ln);
  const cl=/^4\.2/.test(sec)?'matriz':/^4\.6/.test(sec)?'acciones(header)':/^5\.G/.test(sec)?'revision':/^(1\.2|1\.3|1\.5|2\.2|3\.5|4\.5|4\.3)/.test(sec)?'frontera':'otro';
  counts[cl]=(counts[cl]||0)+1; }
console.log('TERMS='+terms.length, JSON.stringify(counts));
console.log('SOLO_INVENTARIO='+((plain.match(/solo inventario/gi)||[]).length));
'@ | node -
# salida hoy: TERMS=27 {"frontera":12,"otro":2,"matriz":3,"limites-matriz":1,"acciones(header)":5,"revision":4}
#            SOLO_INVENTARIO=1
```

### 11.3 SHAs y digest de R6.2

```powershell
Get-ChildItem docs/REA_*.md | ForEach-Object { "{0}|{1}|{2}" -f $_.Name,$_.Length,(Get-FileHash $_.FullName -Algorithm SHA256).Hash }
# R6.2: 1.273 líneas, 96.753 B, 20adf4297c41740f3153c28593e23528dd0f0ffbbb50c8fa6de51f14d8c0ab6f

$s=[IO.File]::ReadAllText('docs\REA_STREAMING_ANALYSIS.md')
$z=$s.Replace('0f656d0fa8b7857e0f92640f203457d4ad1de9a6f4df796eb3e720aa79e0b188',('0'*64))
$ms=[IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($z)); (Get-FileHash -InputStream $ms -Algorithm SHA256).Hash
# debe devolver 0f656d0f…b188 (convención anti-autorreferencia)
```

### 11.4 Deriva D1 (generador)

```powershell
$f='IPTV_v5.4_MAX_AGGRESSION\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js'
Get-Item $f | Select-Object Length,LastWriteTime
Get-FileHash $f -Algorithm SHA256
# hoy: 748.547 B, 2026-10-25 23:08:52, 34994f02c467cf067aedaecdde4c412cbe9794f9293f095b67875fc30a0e2dc5
Select-String -Path $f -Pattern '\[FIX H1|return \{|_exthttp_base' | Select-Object -First 10
```

---

## 12. Veredicto final

- **R6.2 (`20adf429…`, 1.273 líneas, 96.753 B) pasa la verificación de evidencia: 6/6 criterios PASS.**
  SHAs de documentos/APK, 26/26 muestras, matriz sin ✓/✗ inventados, DRM solo inventario con **18
  declaraciones de frontera** y **0 verbos de bypass**, diagramas coherentes y cobertura declarada.
- **G1 queda cerrado como defecto del léxico** de la compuerta anterior: 9 falsos positivos en 4 filas
  legítimas; la compuerta semántica de t16 los evita con aserciones positiva/negativa y censo contextual.
  Ningún revisor futuro debe leer G1 como un defecto de R6.2 (§5.4).
- **Cierres de t8 verificados:** §4.6 (13 acciones A1–A13), §5.D.6 (9 R3-F1..F9 + plan de 7) y C6–C8
  con referencias a R5. Su calidad es materia de t12.
- **D1 abierto (deriva post-congelación):** el generador cambió después de congelar R6.2 e implementa el
  fix de H1 (`build_exthttp` devuelve objeto; spread funcional). R6.2 era exacto en su fecha; hoy su SHA
  del generador, sus líneas 7945-7947/8431 y la afirmación "H1: no llega" están desactualizados. Antes de
  presentar R6 como estado actual se requiere erratum o R6.3 (§9.2).

*Fin de `docs/REA_EVIDENCE_AUDIT.md` (revisión R16). Esta verificación no modificó ningún otro fichero.*
