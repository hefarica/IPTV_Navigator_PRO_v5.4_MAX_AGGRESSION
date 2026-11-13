# POLITICA: BUSQUEDA DE SECRETOS EN BINARIOS (ANTI-FALSO-LIMPIO)

**Estado: REGLA DE METODO PERMANENTE Y OBLIGATORIA.**
**Origen:** medicion real sobre 36 `.apk` del workspace el 2026-11-11 (tareas t17/t21). Detalle completo en [`docs/audits/APK_SECRET_SCAN_20261111.md`](../audits/APK_SECRET_SCAN_20261111.md).
**Alcance:** cualquier fichero comprimido o empaquetado — `.apk`, `.aab`, `.apks`, `.xapk`, `.jar`, `.aar`, `.zip`, `.ipa`, `.war`, `.whl`, imagenes Docker, y cualquier archivo con entradas comprimidas.
**Aplicacion:** toda verificacion de "no hay secretos en el binario", todo gate de CI, toda revision de seguridad y todo informe que afirme que un binario esta limpio.

---

## 1. LA REGLA, EN UNA FRASE

> **Escanear un `.apk` sin descomprimir sus entradas devuelve CERO SIEMPRE. Un cero obtenido asi no es evidencia de nada: es un falso "limpio".**

Un `.apk` es un ZIP y los `.dex`, recursos y assets van **deflactados**. Los bytes de un secreto **no existen** en el contenedor: existen en la entrada **descomprimida**. Un `grep` sobre el `.apk` busca una secuencia que el formato ha destruido.

---

## 2. LA EVIDENCIA (medida, no argumentada)

Barrido de **los 36 ficheros `.apk` del workspace** (= **34 binarios distintos**; hay 2 pares byte-identicos en rutas distintas) buscando el valor de `ape.enroll.secret`:

| Metodo | Resultado |
|---|---|
| **Contenedor `.apk` como bytes crudos** | **0 ocurrencias en 36 de 36 ficheros** |
| **Contenido DESCOMPRIMIDO, entrada por entrada** | **1 ocurrencia en 31 de 36 ficheros = 29 de 34 binarios distintos** |

> Las dos cifras se dicen juntas a proposito: **31 ficheros** (contando rutas) y **29 binarios distintos** (contando sha256). La diferencia son exactamente los 2 pares duplicados. Cualquiera de las dos cifras sola invita a confusion.

El metodo del contenedor no "casi acierta": **acerto 0 de 31 veces**. Su tasa de deteccion es **cero**, no baja. Por eso no es un atajo impreciso: es un metodo que **no puede** funcionar.

### 2.1 Testigo reproducible (usalo para probar que tu detector no esta ciego)

| Campo | Valor |
|---|---|
| Fichero | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\debug\app-debug.apk` |
| Tamano | 28.011.018 B |
| sha256 | `0787d5d105a98fae7777561e5628915b8954e0ca3b1b3ffe0eb942456142fbda` |
| Aguja | valor de `ape.enroll.secret` — **48 chars**, sha256 del valor `3a82184647badd50194cd074a7ef0cc67123bea106a0ac67d65882d5d0341ec1` |
| Contenedor crudo | **0 ocurrencias** |
| Entrada descomprimida | **`classes5.dex` (511.876 B descomprimidos) → 1 ocurrencia en offset 423.327** |

Salida literal de la demostracion ejecutada el 2026-11-11 (mismo fichero, dos metodos):

```
--- METODO INCORRECTO: leer el .apk entero como bytes (equivale a grep) ---
ocurrencias en el contenedor = 0   <-- FALSO LIMPIO

--- METODO CORRECTO: abrir el zip y escanear cada entrada descomprimida ---
  HIT entry=classes5.dex offset=423327
TOTAL entradas descomprimidas con el valor = 1   <-- DETECTADO
```

---

## 3. EL COMANDO INCORRECTO Y EL CORRECTO, LADO A LADO

### 3.1 INCORRECTO — no usar JAMAS como verificacion

```bash
# MAL: busca en el contenedor comprimido. Devuelve 0 SIEMPRE.
grep -c "EL_SECRETO" app-debug.apk          # -> 0   (falso limpio)
strings app-debug.apk | grep "EL_SECRETO"   # -> nada (falso limpio)
zcat app-debug.apk | grep "EL_SECRETO"      # -> nada (gzip no aplica a un zip)
```

```powershell
# MAL (PowerShell): leer el .apk entero y buscar
$t = [System.Text.Encoding]::Latin1.GetString([System.IO.File]::ReadAllBytes('app-debug.apk'))
$t.Contains('EL_SECRETO')     # -> False   (falso limpio)
```

**Por que falla:** las entradas van deflactadas. El `.dex` que contiene la cadena no esta en claro dentro del ZIP.

### 3.2 CORRECTO — abrir el zip, descomprimir CADA entrada y buscar ahi

**Bash / Linux (zip + unzip, sin dependencias raras):**

```bash
APK=app-debug.apk
NEEDLE="EL_SECRETO"                 # mejor: leerlo de una fuente, no escribirlo en el historial
TMP=$(mktemp -d)
unzip -qq -o "$APK" -d "$TMP"       # descomprime TODAS las entradas
grep -rc --binary-files=text "$NEEDLE" "$TMP" | awk -F: '$2>0{print "HIT "$1" x"$2; n+=$2} END{print "TOTAL="n+0}'
rm -rf "$TMP"
# TOTAL=0 solo vale como "limpio" DESPUES de comprobar que el metodo detecta (ver 5.2)
```

**Filtrando solo `.dex`** (mas rapido; en un APK los literales de codigo viven ahi):

```bash
APK=app-debug.apk
NEEDLE="EL_SECRETO"
TMP=$(mktemp -d)
unzip -qq -o "$APK" '*.dex' -d "$TMP"
grep -c --binary-files=text "$NEEDLE" "$TMP"/*.dex 2>/dev/null | awk -F: '$2>0{print "HIT "$1" x"$2; n+=$2} END{print "TOTAL="n+0}'
rm -rf "$TMP"
```

**PowerShell (Windows, sin dependencias; conserva offsets):**

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk    = 'app-debug.apk'
$needle = 'EL_SECRETO'          # leer de una fuente; no escribirlo en el historial
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
$total = 0
foreach ($e in $zip.Entries) {
  if ($e.Length -eq 0) { continue }
  $ms = New-Object System.IO.MemoryStream
  $s = $e.Open(); $s.CopyTo($ms); $s.Close()
  $txt = [System.Text.Encoding]::Latin1.GetString($ms.ToArray())
  $i = 0
  while (($i = $txt.IndexOf($needle, $i, [System.StringComparison]::Ordinal)) -ge 0) {
    "HIT entry=$($e.FullName) offset=$i"; $total++; $i++
  }
  $ms.Dispose()
}
$zip.Dispose()
"TOTAL=$total"
```

**Referencia lista para usar:** `scratch\apk_secret_scan_20261111\scan_apks.ps1` (escaneo de 36 APK, con offsets y sin imprimir valores).

### 3.3 Reglas del escaneo correcto

| # | Regla | Por que |
|---|---|---|
| 1 | **Descomprimir cada entrada** y buscar en el contenido | §2: el contenedor da 0 siempre |
| 2 | **Filtrar `.dex`** (y `.arsc`, `.so`, `assets/**` si se busca en general) | En un APK los literales de `BuildConfig` viven en el `.dex` |
| 3 | **Registrar entrada + offset + conteo**, nunca el valor | El informe no puede convertirse en la fuga |
| 4 | **La aguja debe ser discriminante** (longitud ≥ 8) | Un valor de 2 chars produce ruido no atribuible: medido con `SYNC_KEY_ID` = `k1` (2 chars) → se excluyo del escaneo y se declaro en vez de reportar coincidencias vacias de sentido |
| 5 | **Declarar los ficheros omitidos** (no legibles / binarios) | Omitido no es limpio. En t21: 24 de 10.496 ficheros rastreados quedaron omitidos y se declararon como tales |
| 6 | **No fiarse de un unico formato de aguja**: probar el valor y su codificacion alternativa (UTF-16LE, base64) si el riesgo lo justifica | Un `.dex` puede guardar la cadena en UTF-8 o UTF-16; buscar solo una forma es otra ceguera |

---

## 3-BIS. LOS TRES INSTRUMENTOS CIEGOS (Y EL CASO PDF)

Lo de §2 no es el unico escalon de ceguera. Al verificar los dos PDF de la entrega (t22) aparecio un **nivel mas profundo**: un PDF puede contener una cadena **6 veces** y dar **0** en los dos metodos anteriores a la vez. Esta seccion cubre esa familia y deja la regla que vale para todas.

### 3-bis.1 Los tres niveles

| Nivel | Metodo | Que alcanza a ver | Que se le escapa | Veredicto |
|---|---|---|---|---|
| **1** | Bytes crudos del fichero (`grep`, `strings`, `ReadAllBytes`) | Lo que va **sin comprimir y sin codificar** (metadatos, `/Title`, algun objeto suelto) | Todo lo comprimido y todo lo codificado | **NO VALE** |
| **2** | Inflar los streams `FlateDecode` y buscar ASCII | Lo **comprimido** (deshace el deflate) | El texto **codificado como glifos** con mapas `/ToUnicode` | **NO VALE** para texto de pagina |
| **3** | **Extraer la capa de texto** con la libreria del formato (`pypdf`) | El texto **tal como lo ve el lector** | Nada relevante para secretos en texto | **VALE**, con aguja de control |

**Por que el nivel 2 tambien falla:** en un PDF el contenido de pagina no guarda letras: guarda **codigos de glifo** y una tabla `/ToUnicode` que los traduce. Inflar el stream devuelve los codigos, no la cadena. Buscar `"FILTERGRAPH_IDENTICAL"` en bytes inflados es buscar una secuencia que **el formato no contiene en esa forma**.

### 3-bis.2 La evidencia medida (dos PDF reales)

Medido sobre los dos PDF de `docs/canary/deliverables/`, con `pypdf 6.16.1`. Re-medido de forma independiente el 2026-11-11; **reproduce exactamente** la medicion del capitan en t22.

| PDF | Bytes | N1 crudo `FILTERGRAPH_IDENTICAL` / `CANARY` | N2 streams inflados (ok/total) | N3 paginas / caracteres | N3 `FILTERGRAPH_IDENTICAL` | N3 `CANARY` | N3 SECRETO |
|---|---|---|---|---|---|---|---|
| `01_CANARY_JIT_ARCHITECTURE.pdf` | 1.685.154 | **0** / **1** | 274 / 287 | **18** / **70.609** | **6** | **40** | **0** |
| `02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 1.593.602 | **0** / **0** | 299 / 327 | **15** / **61.668** | **2** | **69** | **0** |

**Lectura:** la aguja de control `FILTERGRAPH_IDENTICAL` **esta** en los dos documentos (6 y 2 veces en la capa de texto). Los niveles 1 y 2 devuelven **0** en ambos. Quien hubiera verificado con los metodos de §3 habria declarado **"limpio"** un documento que la contiene **6 veces**.

**Matiz que la medicion destapo (y que hace el nivel 1 peor de lo que parece):** en el PDF 01, el nivel 1 dio `CANARY = 1`. Es decir, el nivel 1 **no es uniformemente ciego**: atrapa lo que por casualidad quedo sin comprimir (metadatos, titulos), y **falla en todo el texto de pagina**. Eso es peor que ser ciego del todo, porque un acierto accidental invita a confiar en un metodo que no ve el contenido real. Nota fina: en ese mismo fichero el nivel 2 dio `CANARY = 0`, asi que ese unico acierto vive **fuera** de los streams comprimidos.

### 3-bis.3 Comando INCORRECTO y CORRECTO para PDFs

**INCORRECTO** — dos variantes, ambas devuelven falso limpio:

```bash
# Nivel 1: bytes crudos
grep -c "FILTERGRAPH_IDENTICAL" doc.pdf                  # -> 0
strings doc.pdf | grep -c "FILTERGRAPH_IDENTICAL"        # -> 0

# Nivel 2: inflar FlateDecode y buscar ASCII
python - <<'PY'
import re, zlib
data = open("doc.pdf","rb").read()
blobs = [zlib.decompress(s) for s in re.findall(rb"stream\r?\n(.*?)endstream", data, re.S) if _try(s)]
# ... buscar b"FILTERGRAPH_IDENTICAL" en los blobs inflados -> 0
PY
```

**CORRECTO** — extraer la capa de texto, **con aguja de control obligatoria**:

```bash
python - <<'PY'
from pypdf import PdfReader

CONTROL = "FILTERGRAPH_IDENTICAL"   # aguja POSITIVA: se sabe que esta en el documento
SECRETO = "..."                     # leer de una fuente, nunca escribirla en el historial

r = PdfReader("doc.pdf")
txt = "\n".join((p.extract_text() or "") for p in r.pages)

print("paginas=%d caracteres=%d" % (len(r.pages), len(txt)))
n_ctl = txt.count(CONTROL)
print("CONTROL %s = %d   <-- debe ser > 0 o el test NO sirve" % (CONTROL, n_ctl))
print("SECRETO = %d" % (txt.count(SECRETO)))

if n_ctl == 0:
    raise SystemExit("METODO ROTO: el control no aparece; este cero no vale")
PY
```

**La linea que importa es la ultima:** si el control da 0, el test **no ha verificado nada** y su "SECRETO = 0" es basura. No se concluye "limpio": se concluye "el metodo no alcanza este artefacto".

### 3-bis.4 REGLA GENERAL (la que unifica los tres niveles)

> **Sin aguja de control positiva que se sepa presente en el artefacto, NINGUN cero es evidencia.**

Corolarios, todos operativos:

| # | Regla | Por que |
|---|---|---|
| 1 | **El control se elige del contenido real**, no se inventa | Una cadena inventada puede no estar en el documento por razones legitimas y darte un "roto" falso; una cadena que sabes que esta (un titulo, un identificador, una seccion concreta) separa "metodo roto" de "artefacto limpio" |
| 2 | **Un cero sin control positivo se reporta como "no verificado"**, nunca como "limpio" | Ausencia de hallazgo no es ausencia de contenido |
| 3 | **El control debe recorrer el MISMO camino que el secreto** | Si el secreto viviria en la capa de texto, el control tiene que estar en la capa de texto. Un control que vive en metadatos puede dar positivo en el nivel 1 mientras el nivel 1 sigue ciego para el contenido (es exactamente el `CANARY = 1` de §3-bis.2) |
| 4 | **Si el control da 0, se cambia de nivel; no se concluye** | El fallo puede ser del instrumento, del formato o de la aguja — nunca del artefacto por defecto |
| 5 | **Un acierto accidental no valida el metodo** | El `CANARY = 1` del nivel 1 lo demuestra: acerto una vez y fallo en las otras 105 (40 + 69 en la capa de texto) |

**Esta regla es la misma que ya exigia §5.2 para CI**, ahora con su forma general: el testigo positivo no es un extra del gate, es **la condicion que hace que un verde signifique algo**. Un gate que solo sabe decir "cero" no ha demostrado que detecta: ha demostrado que no se sabe si detecta.

### 3-bis.5 AMBITO GENERALIZADO

La regla no es de APK ni de PDF: es de **toda capa que transforma el contenido**. Tres familias, tres formas de mirar:

| Familia | Ejemplos | Por que el nivel 1 falla | Nivel valido |
|---|---|---|---|
| **Contenedores** | `.zip`, `.apk`, `.jar`, `.aab`, `.apks`, `.xapk`, `.ipa`, `.war`, `.whl`, imagenes Docker | Los miembros van **deflactados** | Descomprimir entradas (§3) |
| **Flujos comprimidos** | PDF `/FlateDecode`, `gzip`, `zlib`, `br`, `zstd` | El contenido va **comprimido** | Inflar el flujo |
| **Capas de texto codificadas** | **PDF con glifos + `/ToUnicode`** (este caso); **OOXML** (`.docx`, `.xlsx`, `.pptx`); DOC binario (OLE); PostScript con fuentes incrustadas; HTML con entidades | El texto **no existe como ASCII contiguo**: son codigos de glifo o runs partidos | Extraer la capa de texto con la libreria del formato |

**OOXML / DOCX tienen la MISMA clase de problema, y ademas doble:**

1. El XML va **dentro de un zip** → el nivel 1 falla por deflate (familia contenedor).
2. Y una vez descomprimido, el texto puede venir **partido en runs** (`<w:t>` consecutivos en `word/document.xml`, o `sharedStrings.xml` en `.xlsx`): un `grep` del literal completo sobre el XML descomprimido **tambien puede dar 0** aunque la cadena este ahi, porque esta troceada por el formato.

→ Para OOXML: descomprimir **y** reconstruir el texto (concatenar los `<w:t>` / leer `sharedStrings.xml` con `python-docx` / `openpyxl`). Aplicar la aguja de control de §3-bis.4 igual que en PDF.

**Regla de bolsillo:** antes de buscar un secreto en un artefacto, preguntarse **que transformaciones ha sufrido el texto** (comprimido, codificado, troceado) y elegir el instrumento que deshace **todas**. Si el instrumento no se ha probado con un control que se sabe presente, su cero no significa nada.

---

## 4. CONSECUENCIA OPERATIVA

> **Un `grep` sobre un `.apk` produce un falso "limpio". No vale como verificacion, no vale como evidencia y no vale como gate.**

Efectos concretos, medidos:

1. **Un informe que declare "el APK no lleva el secreto" basandose en un `grep` sobre el `.apk` es falso**, aunque el autor haya sido honesto. Le paso al capitan de este equipo y quedo corregido; este documento existe para que no vuelva a pasar.
2. **Los gates que usan `strings`/`grep` sobre el binario estan ciegos** para todo lo que viaje dentro de una entrada comprimida: practicamente todo el codigo.
3. **La verificacion posterior a una rotacion es el momento de mayor riesgo de autoengano**: es cuando mas se quiere ver "limpio". Si se usa el metodo del contenedor, la respuesta sera "limpio" siempre, incluso si no se roto nada.

---

## 5. COROLARIO PARA CI (obligatorio)

### 5.1 Todo gate debe descomprimir

Un gate que valide **ausencia de secretos en binarios** (`*.apk`, `*.aab`, `*.jar`, `*.aar`, `*.zip`, imagenes) **debe** abrir el archivo y escanear las entradas descomprimidas. Un gate que haga `grep` sobre el fichero comprimido **no es un gate: es un adorno que siempre pasa**.

### 5.2 Todo gate necesita un TESTIGO POSITIVO

> **Un detector que nunca ha disparado no ha demostrado que detecta: ha demostrado que no se sabe si funciona.**

Un gate de ausencia de secretos debe incluir, en el propio pipeline, una prueba de que **detecta**:

| Pieza | Contenido | Proposito |
|---|---|---|
| **Testigo positivo** | un artefacto **que se sabe que lleva** la aguja (p.ej. el `app-debug.apk` con sha256 `0787d5d1…f2bda`, o un `.apk` sintetico construido a proposito con una cadena centinela) | el gate **debe** salir ROJO |
| **Testigo negativo** | un artefacto que se sabe limpio (p.ej. `ottshim\app\build\outputs\apk\debug\app-debug.apk`, 1.419.782 B, sha256 `c31a1ffc857901803abb35090b1f841d700e3f64eca465e1445ea613de8b0404`) | el gate **debe** salir VERDE |
| **Prueba del metodo** | el mismo testigo positivo escaneado con el metodo del contenedor | debe dar **0** → demuestra que el metodo del contenedor es ciego |

Si el gate no se pone ROJO con el testigo positivo, **el gate esta roto** y hay que arreglarlo antes de creer ningun verde.

### 5.3 Esqueleto del gate

```bash
#!/usr/bin/env bash
# gate_secrets_in_binaries.sh — falla si algun binario contiene la aguja EN SUS ENTRADAS.
set -uo pipefail
NEEDLE_FILE="${1:?fichero con la aguja}"   # el valor NO va en la linea de comandos
NEEDLE="$(cat "$NEEDLE_FILE")"
fail=0; scanned=0

scan_archive() {                            # $1 = archivo
  local tmp; tmp=$(mktemp -d)
  unzip -qq -o "$1" -d "$tmp" 2>/dev/null
  local hits
  hits=$(grep -rc --binary-files=text -- "$NEEDLE" "$tmp" 2>/dev/null | awk -F: '$2>0{s+=$2} END{print s+0}')
  rm -rf "$tmp"
  scanned=$((scanned+1))
  if [ "$hits" -ne 0 ]; then echo "FAIL: $1 contiene la aguja ($hits)"; fail=1; fi
}

for f in $(git ls-files '*.apk' '*.aab' '*.jar' '*.aar' '*.zip'); do scan_archive "$f"; done

# TESTIGO POSITIVO: el gate TIENE que ponerse rojo con un artefacto que la lleva.
if ! scan_archive "testdata/known_leaky.apk" ; then :; else
  echo "FAIL: el testigo positivo NO disparo -> el detector esta ciego"; exit 2
fi

echo "binarios escaneados=$scanned"
exit "$fail"
```

### 5.4 Regla de honestidad del gate

- Un **verde** sin testigo positivo **no se reporta como "sin secretos"**: se reporta como **"el detector no disparo (no verificado que detecte)"**.
- Un **rojo** debe citar **entrada + offset**, nunca el valor.
- Los ficheros **omitidos** se cuentan y se declaran. Omitido no es limpio.

---

## 6. JERARQUIA (no se olvida, se repite)

> **La rotacion del servidor es lo que cierra la exposicion. Reconstruir el APK es continuidad, no seguridad.**

Un binario ya filtrado no se "arregla" rebuildandolo: se neutraliza **cambiando el valor en el servidor**. Cualquier verificacion de limpieza (con el metodo de §3) sirve para las **emisiones futuras**, no para lo que ya salio.

---

## 7. REFERENCIAS

| Documento | Que aporta |
|---|---|
| [`docs/audits/APK_SECRET_SCAN_20261111.md`](../audits/APK_SECRET_SCAN_20261111.md) | Medicion completa: 36 APK, 29/34 binarios con el valor, tabla por APK con entrada y offset |
| [`docs/ops/SECRET_ROTATION_PROCEDURE.md`](../ops/SECRET_ROTATION_PROCEDURE.md) | Que se rompe al rotar, orden, verificacion y re-escaneo con este metodo |
| [`docs/ops/RUNTIME_PROVISIONING_PROPOSAL.md`](../ops/RUNTIME_PROVISIONING_PROPOSAL.md) | La salida estructural: que el secreto no viaje en el binario |
| `scratch\apk_secret_scan_20261111\scan_apks.ps1` | Escaner de referencia (descomprime, offsets, sin imprimir valores) |

---

*Politica escrita el 2026-11-11 a partir de medicion propia (36 APK). No contiene ningun valor de secreto: solo longitudes, sha256, entradas y offsets.*
