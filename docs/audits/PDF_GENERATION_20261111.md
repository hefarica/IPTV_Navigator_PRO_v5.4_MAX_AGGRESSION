# Generación de los entregables PDF 01 y 02 (Chrome headless, sin dependencias)

**Fecha:** 2026-11-11 · **Autor:** gate-runner (t22) · **Base git:** `472f7cc3`
**Workdir:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**Chrome:** `C:\Program Files\Google\Chrome\Application\chrome.exe` · versión **157.0.8103.39**

## 0 · Resultado en una línea

**Los dos PDF se han generado y verificado.** Cabecera `%PDF-`, `%%EOF` presente (no truncados), 18 y 15 páginas, 22 y 29 tablas renderizadas, y los H1 reales de las 6 fuentes presentes. Coste medido: **51,6 s – 109,0 s** la primera impresión de cada ráfaga y **1,7 s – 24,7 s** las siguientes (la variación es carga del host, no tamaño del documento).

| | Entregable | Bytes | sha256 | Páginas | Tiempo Chrome |
|---|---|---:|---|---:|---:|
| **01** | `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` | **1.685.154** | `70d6de7ca4ed83c8ccd0394f469acba55b92ba73f749bda346caa6495f4d0b8c` | 18 | **108,987 s** |
| **02** | `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | **1.593.602** | `c724300c2f496c5b19d80119173b06f9392d523ddbba77a3388ec592709dac8a` | 15 | **24,744 s** |

Los sha256 son de los ficheros **finales**, tras la última regeneración con la portada completa. Cualquier regeneración produce bytes distintos (la portada lleva fecha), así que estos hashes identifican **estos** PDF, no una plantilla.

---

## 1 · Procedencia de cada PDF

### 01 · Arquitectura (contrato + reconciliador + inversión de dirección)

| Fuente | Bytes | sha256 |
|---|---:|---|
| `docs/manifestos/CANARY_JIT_CONTRACT_20261111.md` | 32.264 | `96dd7f5714b315d00bc59c1914451e11dee445d14bfd38cfec76ee6689f443eb` |
| `docs/audits/DEPLOY_RECONCILER_20261111.md` | 15.139 | `ae8633437a63362f86e35cf1fafaa3d4edf110554898a29ac37bc894da6cbe88` |
| `docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md` | 31.615 | `8a62e7203a558c86e43996475db4ff117ba84eb6a38d4b64ae6d1020a287faae` |

Contenido renderizado: **3 H1** (uno por fuente) + 36 H2 + 15 H3, **21 tablas**, 14 bloques de código, 32 listas, 12 enlaces. HTML intermedio: 108.252 B.

### 02 · Manual de APK y reproductores

| Fuente | Bytes | sha256 |
|---|---:|---|
| `docs/audits/APK_FEASIBILITY_20261111.md` | 20.028 | `84ee21a5b758d874c56d7bf2b9652a2bfc8e7f5e8b099d7a11d7424778746407` |
| `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md` | 17.533 | `2e451d71fd275552720959cefc807bf2e7080511c3a02350a650406c0233b5f0` |
| `docs/audits/14_CANARY_FINAL_REPORT.md` | 32.324 | `79c3f8513964463c5c58dd2386a0cea6d667ace335548c76ad05a622156c8916` |

Contenido renderizado: **3 H1** + 35 H2 + 38 H3, **28 tablas**, 16 bloques de código, 29 listas. HTML intermedio: 98.842 B.

> **Nota de alcance sobre el 02.** El encargo pedía «la sección de reproductores del informe final». En vez de recortar esa sección a un fichero temporal —lo que rompería la reproducibilidad, porque el fichero temporal no tendría sha256 de repo— se incluye **el informe final completo**. La sección de reproductores (§17.9) llega íntegra y el sha256 de la portada corresponde a un fichero real del repositorio.

**Cada PDF declara en su primera página**: título, tabla de ficheros de origen con sus sha256, fecha ISO, base git `472f7cc3`, el **comando completo** (conversor + Chrome), el **comando exacto de impresión** de Chrome, y la línea de que el PDF se genera del markdown real y no es una reconstrucción.

---

## 2 · El conversor: `tools/canary/md_to_pdf.js`

**Requires del script — son tres y solo tres:**

```js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
```

No hay `node_modules`, no hay `puppeteer`, no se instala nada y no se descarga nada.

**Por qué no se usa `crypto`.** El listado de requires debía ser exactamente `fs`, `path`, `child_process`, y la portada necesita el sha256 de cada fuente. Se implementó **SHA-256 en JS puro** dentro del script y se autoverifica en cada arranque contra dos vectores conocidos:

```
node tools/canary/md_to_pdf.js --selftest
{"ok":true,"selftest":"sha256 vectores \"\" y \"abc\" OK","requires":["fs","path","child_process"]}
```

Si los vectores no casaran, el script sale con código 2 y no genera nada. Así el hash es verificable **sin** añadir un cuarto `require`.

**Aislamiento de red, medido.** El HTML renderizado no contiene un solo recurso externo:

| Comprobación | 01 | 02 |
|---|---:|---:|
| `<link rel=stylesheet>` | 0 | 0 |
| `<script src=…>` | 0 | 0 |
| `<img src=…>` | 0 | 0 |
| `@import` | 0 | 0 |
| `url(http…)` en CSS | 0 | 0 |
| `aislado_de_recursos_externos` | **true** | **true** |

Las únicas URLs que aparecen (`http://127.0.0.1:3099/`, `https://evil.example/jit/live/…`, `services.gradle.org/…`) están **dentro de bloques `<code>`**: son texto citado del contenido, no recursos que Chrome cargue. Además la impresión corre con `--offline --disable-background-networking`.

**Lo que renderiza:** encabezados `#`..`######`, tablas GFM con pipes (incluye pipes escapados `\|` y pipes dentro de `` `código` ``), bloques con fences, negritas, cursivas, tachado, `código` inline, listas (con un nivel de anidación por indentación), blockquotes, reglas horizontales, enlaces y párrafos. CSS de impresión: A4, márgenes 16/14 mm, tabla con bordes y cabecera repetida por página (`thead { display: table-header-group }`), `code` con fondo, todo con fuentes **del sistema** (sin CDN).

---

## 3 · Tiempos medidos, y por qué cuesta lo que cuesta

Las seis impresiones de esta sesión, en orden:

| # | Doc | `--offline` | Chrome | Total (wall) | Nota |
|---:|---|---|---:|---:|---|
| 1 | 01 | no | 51,639 s | 51,826 s | primera de la sesión (frío) |
| 2 | 02 | no | 4,548 s | 4,777 s | seguida, perfil caliente |
| 3 | 01 | sí | 57,003 s | 57,283 s | primera de una ráfaga nueva |
| 4 | 02 | sí | 1,704 s | 1,863 s | seguida, perfil caliente |
| 5 | 01 | sí | **108,987 s** | 109,141 s | **final**; host con otros agentes corriendo |
| 6 | 02 | sí | **24,744 s** | 24,930 s | **final**; misma ráfaga |

**El motivo del coste es el arranque de Chrome, no el documento.** La prueba está en las filas: el **mismo** 01 tardó 51,6 s, 57,0 s y 109,0 s en tres ráfagas distintas, mientras el 02 —15 páginas, 29 tablas— tardó 1,7 s cuando iba detrás. Si el coste fuera el tamaño o la complejidad del HTML, el 02 (más tablas) sería el caro, y no lo es.

**Sobre la hipótesis del capitán (perfil compartido abarata):** se confirma **solo dentro de una ráfaga**. `--user-data-dir` compartido hace que la segunda invocación baje a 1,7–4,5 s (≈ 11–30× menos), pero **no** abarata la primera: Chrome paga el arranque completo en cuanto pasa un rato o el host está cargado.

**Sobre la cifra de referencia:** el banco del capitán reportó «83.009 ms». Interpretado como **83,0 s** (notación de millares con punto), es coherente con mis 51,6–109,0 s de primera invocación. Si se interpretara como 83 milisegundos, sería incompatible con cualquier arranque de Chrome y con las dos mediciones independientes de esta sesión.

---

## 4 · Verificación aplicada (y dos fallos que eran del verificador, no del PDF)

Para cada PDF, comprobado por script:

| Comprobación | 01 | 02 |
|---|---|---|
| Cabecera `%PDF-` | ✅ | ✅ |
| `%%EOF` al final (no truncado) | ✅ | ✅ |
| Tamaño > 100 KB | 1.685.154 B | 1.593.602 B |
| Páginas (`/Type /Page`) | 18 | 15 |
| Tablas en el HTML renderizado | 22 | 29 |
| `<h1>` = portada + 3 fuentes | ✅ 4 | ✅ 4 |
| H1 real de **cada** fuente presente | 3/3 | 3/3 |

**Resultado: `RESULT=PASS | fallos: 0`.**

**Honestidad sobre el proceso:** el verificador dio **tres falsos negativos** antes de pasar, y los tres eran suyos, no del PDF:

1. Contaba como H1 las líneas `#` que van **dentro de bloques de código** (comentarios de shell como `# copia a os.tmpdir…`). Se corrigió haciéndolo *fence-aware*.
2. Quitaba los guiones bajos al construir la aguja de búsqueda, así que `06_CANARY_PLAYLIST_ADAPTER/` nunca casaba.
3. Comparaba texto contiguo, pero el render envuelve los trozos en `` `código` `` en `<code>`, así que `RECONCILIADOR VPS — \`--audit\` / …` no aparecía como cadena seguida. Se corrigió comparando contra el **texto del `<h1>` sin etiquetas**.

Los PDF estaban bien desde la primera generación; lo que se depuró fue la comprobación. Se documenta porque «el test falla» y «el artefacto falla» son cosas distintas, y confundirlas es cómo se entrega un PDF roto con un verde en la mano.

---

## 5 · Comandos exactos (reproducibles)

Conversor + Chrome, tal como quedaron grabados en la portada de cada PDF:

```
node tools/canary/md_to_pdf.js --out docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf --title "Canary - JIT: Arquitectura del contrato y del reconciliador" --subtitle "Entregable 01 de la seccion 16 - contrato versionado, reconciliador de despliegue e inversion de direccion medida" --source docs/manifestos/CANARY_JIT_CONTRACT_20261111.md --source docs/audits/DEPLOY_RECONCILER_20261111.md --source docs/audits/ADVERSARIAL_CANARY_JIT_20261111.md --commit 472f7cc3
```

```
node tools/canary/md_to_pdf.js --out docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf --title "Canary - JIT: Manual de APK y reproductores (OTT / TiviMate / ExoPlayer)" --subtitle "Entregable 02 de la seccion 16 - viabilidad de la APK, inventario de entregables y estado real de los reproductores" --source docs/audits/APK_FEASIBILITY_20261111.md --source docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md --source docs/audits/14_CANARY_FINAL_REPORT.md --commit 472f7cc3
```

Impresión que ejecuta internamente el conversor:

```
chrome.exe --headless=new --disable-gpu --no-sandbox --no-first-run --disable-extensions --offline --disable-background-networking --no-pdf-header-footer --user-data-dir=<perfil> --print-to-pdf=<salida.pdf> "file:///<html>"
```

Verificación reproducible: `node tools/canary/md_to_pdf.js --selftest` (vectores SHA-256) y, para el contenido, `%%EOF` + `/Type /Page` + H1 por fuente en el HTML intermedio (el script lo imprime en su salida JSON).

---

## 6 · Límites conocidos (declarados, no escondidos)

1. **Es una impresión del markdown, no maquetación editorial.** No hay índice generado, ni numeración de páginas en el cuerpo, ni control de huérfanas/viudas más allá de `page-break-after: avoid` en los encabezados y `page-break-inside: avoid` en las filas.
2. **Las tablas anchas pueden partirse entre páginas.** El ancho útil es A4 menos márgenes; las tablas de 5–6 columnas con texto largo (por ejemplo la de riesgos del adversarial) son las candidatas. La cabecera se repite, pero una fila muy alta puede saltar.
3. **No se extrajo texto del PDF para verificar.** Los flujos de contenido de Chrome van comprimidos; sin un parser, una búsqueda de texto en crudo daría falsos negativos. La verificación de contenido se hizo sobre el **HTML renderizado** (22 y 29 tablas, H1 por fuente) más cabecera/`%%EOF`/páginas en el PDF. Queda declarado como límite, no como verde.
4. **Fuentes del sistema.** La pila es `-apple-system, "Segoe UI", Roboto, Arial` y, para código, `"Cascadia Mono", Consolas, "Courier New"`. Si el host no tiene la primera de cada grupo, cae a la siguiente; no se embebe ninguna fuente desde CDN.
5. **Los PDF pesan ~1,6 MB** porque Chrome embebe subconjuntos de fuentes. Es esperado y no indica error.
6. **El sha256 de la portada fija los orígenes.** Si cualquiera de los 6 markdown cambia, el PDF queda **detectablemente obsoleto**: basta recalcular el sha256 del origen y compararlo con el de la portada. Esa es la propiedad útil; el PDF no es un pin del repo.
7. **Regenerar cambia el sha256 del PDF** (la portada lleva fecha ISO al segundo). Los hashes de §0 identifican estos dos ficheros concretos.

---

## 7 · Estado de los dos entregables de la sección 16

| # | Nombre canónico | Estado | Ruta |
|---|---|---|---|
| 01 | `01_CANARY_JIT_ARCHITECTURE.pdf` | **EXISTE** | `docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf` |
| 02 | `02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | **EXISTE** | `docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` |

Esto actualiza el inventario `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md`, donde ambos figuraban como `NO_EXISTE` / `requisito_satisfecho=NO`. **Ese fichero no se ha tocado en esta tarea** (queda fuera del inScope): la actualización corresponde a quien lo posea.

De los 14 entregables de la sección 16 quedan cubiertos **9** (04, 05, 06, 08 parcial, 09, 11, 13, 14 y ahora 01 y 02). Siguen sin cubrir: **03** (patch de integración), **07** (registro de dispositivo), **10** (APK de Canary) y **12** (recibo de despliegue).
