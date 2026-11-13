# El hueco de entrega: 6 entregables en disco, 0 en cualquier canal

**Fecha:** 2026-11-11 · **Autor:** gate-runner (t27) · **Snapshot:** `2026-11-11T03:28:28-05:00`
**Base git:** `472f7cc330e52dc2f7e3d16f6a451fd0b461949e` · **Manifiesto:** `docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json`

## 0 · El hallazgo en una línea

Los entregables de la sección 16 **existen en disco y no viajan por ningún canal**: `git ls-files docs/canary` devuelve **0**, el patch de integración tiene **0 ficheros** bajo `docs/canary`, y los seis están ocultos por la **misma línea** del `.gitignore`. Un clon limpio del repo no los tendría; el patch tampoco los lleva.

---

## 1 · La evidencia, literal

### 1.1 Git no los ve

```text
$ git ls-files docs/canary
(sin salida)
$ echo $?
0
ficheros rastreados = 0
```

### 1.2 En disco están

| # | Fichero | Bytes | sha256 |
|---:|---|---:|---|
| 01 | `01_CANARY_JIT_ARCHITECTURE.pdf` | 1.685.154 | `70d6de7ca4ed83c8ccd0394f469acba55b92ba73f749bda346caa6495f4d0b8c` |
| 02 | `02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 1.593.602 | `c724300c2f496c5b19d80119173b06f9392d523ddbba77a3388ec592709dac8a` |
| 03 | `03_CANARY_JIT_INTEGRATION.patch` | 865.408 | `a2ebec163172362a5be912f901e183e68f131de534e0461ab6c2aefc28163f89` |
| 07 | `07_CANARY_DEVICE_REGISTRATION.md` | 25.619 | `96eec6fd6a4969b68ad9e4bcaf80f6fc5ccbb0769ced16c17926008d5e26760c` |
| 10 | `10_CANARY_ANDROID_APK.md` | 16.793 | `8dc07a601da3639dba204ec419dcfc523d6d13ff2a9dc9dfaf23dd99694bc4ea` |
| 12 | `12_CANARY_DEPLOYMENT_RECEIPT.json` | 25.760 | `3d22513b8a77be5fccee1d6faa2a5c57b9852b6c485ee17dddfc058bcca6c65a` |
| | **TOTAL** | **4.212.336** | **4,02 MiB** |

**Canal de cada uno: `ninguno`.** Ninguno de los seis está rastreado y ninguno viaja como fichero en el patch.

> **Discrepancia con el encargo, dicha antes de que la descubra nadie.** El encargo habla de **5** (01, 02, 03, 10, 12). En el momento de esta medición hay **6**: `07_CANARY_DEVICE_REGISTRATION.md` (t25) apareció **después** de la medición del capitán. Inventarío los 6 reales; recortar la lista a 5 sería mentir sobre lo que hay en disco. Además 07 **cambió de tamaño durante la sesión** (24.972 → 25.619 B), así que su sha256 es un snapshot, no un pin.

### 1.3 La regla que los oculta

```text
$ git check-ignore -v docs/canary/deliverables/10_CANARY_ANDROID_APK.md
.gitignore:173:deliverables/	docs/canary/deliverables/10_CANARY_ANDROID_APK.md
$ echo $?
0
```

La línea **173** del `.gitignore` (4.503 B, 207 líneas) es `deliverables/`. Sin barra inicial, ese patrón casa **cualquier** directorio llamado `deliverables` a cualquier profundidad — incluido `docs/canary/deliverables/`. Los seis dan el mismo `exit 0` con la misma línea citada.

### 1.4 El patch tampoco los lleva

```text
diff --git encontrados : 31
  contracts : 4
  docs      : 21
  tools     : 6
  docs/canary : 0        <- ninguno
```

**Matiz importante, porque el número del encargo era impreciso.** El encargo dice «0 apariciones de los 5 nombres en el patch». Eso **no es exacto**: los nombres **sí aparecen** como texto:

| Nombre | Apariciones en el patch |
|---|---:|
| `01_CANARY_JIT_ARCHITECTURE.pdf` | 6 |
| `02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf` | 5 |
| `03_CANARY_JIT_INTEGRATION.patch` | 5 |
| `07_CANARY_DEVICE_REGISTRATION.md` | 0 |
| `10_CANARY_ANDROID_APK.md` | 0 |
| `12_CANARY_DEPLOYMENT_RECEIPT.json` | 5 |

La razón es que el patch incluye en su contenido el JSON del manifiesto y el inventario S16, que **citan** esos nombres. Lo que es cierto —y es lo que importa— es que **`diff --git a/docs/canary/…` = 0**: **el nombre citado no es el fichero transportado**. Confundir ambas cosas es cómo se declara «entregado» un PDF que nadie recibió.

### 1.5 Ni siquiera `--exclude-standard` los ve

```text
$ git ls-files --others --exclude-standard | wc -l
33
$ git ls-files --others --exclude-standard | grep -c canary/deliverables
0
```

Git ve 33 ficheros sin seguimiento y **ninguno** es de `docs/canary/deliverables/`. Es coherente: `--exclude-standard` respeta el ignore.

---

## 2 · La propuesta: una línea, **no aplicada**

```gitignore
!docs/canary/deliverables/
```

Iría **después** de la línea 173: en git gana el **último** patrón que casa, así que la negación tiene que ir detrás del patrón que excluye.

### 2.1 Ensayada en una copia, no en el repo

Se hizo en `%TEMP%\gater27repo`: `git init`, **copia real** del `.gitignore` (4.503 B) y **copia real** del árbol `docs/canary` (6 ficheros). El `.gitignore` del repo **no se tocó**.

| | `git check-ignore -v` | `git status --porcelain -uall` |
|---|---|---|
| **Antes** de la negación | `exit 0` · `.gitignore:173:deliverables/` | **1** entrada (solo `.gitignore`) |
| **Después** de la negación | `exit 1` (**nada ignorado**) para los 6 | **7** entradas: `.gitignore` + **los 6 entregables** |

Los seis, uno por uno, pasan de `exit 0` a `exit 1`:

```text
01_CANARY_JIT_ARCHITECTURE.pdf          -> exit=1
02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf   -> exit=1
03_CANARY_JIT_INTEGRATION.patch         -> exit=1
07_CANARY_DEVICE_REGISTRATION.md        -> exit=1
10_CANARY_ANDROID_APK.md                -> exit=1
12_CANARY_DEPLOYMENT_RECEIPT.json       -> exit=1
```

`git status -uall` en la copia, ya con la negación, lista exactamente:

```text
?? .gitignore
?? docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf
?? docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf
?? docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch
?? docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md
?? docs/canary/deliverables/10_CANARY_ANDROID_APK.md
?? docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
```

**El `.gitignore` real quedó byte-idéntico** (comprobado comparando contenido antes/después) y **no contiene** la negación. El repo temporal se borró al terminar.

### 2.2 Lo que costaría, medido

Si se añadiera la línea, `git status` mostraría **6 ficheros nuevos** que suman **4.212.336 B (4,02 MiB)**:

| Bloque | Bytes | Equivalente |
|---|---:|---|
| PDF 01 + 02 | 3.278.756 | **3,3 MB** de PDF |
| patch 03 | 865.408 | **865 KB** de patch |
| md 07 + 10 | 42.412 | 41 KB |
| json 12 | 25.760 | 25 KB |
| **Total** | **4.212.336** | **4,02 MiB** |

> **Decisión del operador, no de este documento.** Añadir la negación no commitea nada: solo hace **visible** lo que hoy es invisible. Si se commitean, entran ~3,3 MB de PDF binario y 865 KB de patch en la historia de git, y un PDF binario no se diffea: cada regeneración es un blob nuevo. Si no se commitean, el hueco sigue abierto y un clon limpio seguirá sin tener los entregables. **Las dos opciones son legítimas; lo que no es legítimo es creer que hoy viajan.**

---

## 3 · La lección de método: tres instrumentos ciegos y uno que ve

Esto es el centro del informe, más que el hueco. Se quería verificar que los PDF **no** llevan el secreto de enrolamiento (`ape.enroll.secret`, 48 caracteres) que vive en claro dentro de la APK.

**La aguja se reconstruyó del binario, no se asumió:** `app-debug.apk` (28.011.018 B) → entrada `classes5.dex` (511.876 B descomprimidos) → 48 bytes en el offset **423.327** → `sha256 = 3a82184647badd50194cd074a7ef0cc67123bea106a0ac67d65882d5d0341ec1`, que **coincide con el documentado** en `APK_SECRET_SCAN_20261111.md:54`. Si la aguja fuese la equivocada, todo lo demás sería teatro. **El valor no se imprime** (`SECRETS_IN_BINARIES.md`: no se amplía la fuga; se publica la huella y los recuentos).

| Instrumento | Qué mide | 01 | 02 | ¿Veredicto? |
|---|---|---:|---:|---|
| **1. Bytes crudos** | `grep` sobre el fichero | secreto **0**, control `FILTERGRAPH_IDENTICAL` **0** | secreto **0**, control **0** | **CIEGO** — 274 y 299 filtros `FlateDecode`; el control también da 0 |
| **2. Inflar streams + ASCII** | descomprimir y buscar | 274 streams, 4.360.954 B inflados: secreto **0**, control **0**, `CANARY` **0** | 299 streams, 3.869.177 B: secreto **0**, control **0**, `CANARY` **0** | **CIEGO** — el texto va como glifos codificados, no ASCII |
| **3. Capa de texto (pypdf 6.16.1)** | extraer el texto real | 18 pág, 70.592 chars: secreto **0**, control **6**, `CANARY` **40** | 15 pág, 61.654 chars: secreto **0**, control **2**, `CANARY` **69** | **VÁLIDO** |

**La regla que hace esto ciencia y no fe:** un `0` solo es evidencia si el mismo instrumento encuentra un control positivo. Los instrumentos 1 y 2 devuelven `0` para **todo**, incluido lo que se sabe que está: son **falsos limpios**. Solo en el instrumento 3, donde `FILTERGRAPH_IDENTICAL` aparece **6** y **2** veces y `CANARY` **40** y **69**, el `0` del secreto significa algo.

> **Conclusión de la verificación:** los dos PDF **no contienen el secreto**. Y la conclusión solo se sostiene porque hay un control que sí aparece. Un informe que dijera «0 ocurrencias, estamos limpios» apoyándose en los instrumentos 1 o 2 estaría firmando un cheque sin fondos.

**Nota sobre las cifras del capitán.** Él midió 70.609 y 61.668 chars; yo mido 70.592 y 61.654 (17 y 14 chars menos, ~0,02%). Los recuentos de secreto (**0**, **0**) y de controles (**6/40** y **2/69**) coinciden **exactamente**. La diferencia es de extracción, no de contenido.

---

## 4 · La ironía que hay que declarar

**Este propio manifiesto está dentro de `docs/canary/deliverables/`, así que también está ignorado.**

```text
$ git check-ignore -v docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json
.gitignore:173:deliverables/	docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json
$ echo $?
0
```

Un documento que denuncia el hueco de entrega **no viaja por el mismo canal que denuncia**. Es la demostración más corta del problema: si este JSON se puede perder en un clon, el hueco es real y no es teórico.

---

## 5 · Límites

1. **El sha256 de 07 es un snapshot**: el fichero se editó durante la medición (24.972 → 25.619 B).
2. **El ensayo del `.gitignore` se hizo en un repo temporal** en `%TEMP%` con copia real del `.gitignore` y del árbol. El original quedó **byte-idéntico** y **sin** la negación: verificado, no prometido.
3. **No se ha commiteado, ni aplicado, ni hecho push.** El `git status` del repo real no cambió.
4. **La aguja depende del APK**: se reconstruyó del `app-debug.apk` presente hoy; si ese binario se recompila, el offset 423.327 deja de ser válido y hay que re-localizarla (su `sha256` documentado sigue sirviendo de oráculo para saber si la nueva aguja es la correcta).
5. **Los recuentos de pypdf dependen de la versión del extractor**. Se declara 6.16.1 sobre Python 3.12.10 porque un recuento sin su herramienta no es reproducible.
6. **El patch es una foto**: si alguien regenera el patch, los 31 `diff --git` cambiarán y este informe quedará obsoleto en ese punto — pero la propiedad que afirma (0 ficheros de `docs/canary`) es estructural, no de tamaño.

---

## 6 · Resumen para decidir

| Pregunta | Respuesta medida |
|---|---|
| ¿Cuántos entregables hay en disco? | **6** (el encargo decía 5; 07 apareció después) |
| ¿Cuántos viajan por git? | **0** |
| ¿Cuántos viajan en el patch? | **0** (0 `diff --git` bajo `docs/canary`) |
| ¿Por qué? | `.gitignore:173:deliverables/` casa `docs/canary/deliverables/` |
| ¿La negación `!docs/canary/deliverables/` funciona? | **Sí**, probado en copia: `check-ignore` pasa de `exit 0` a `exit 1` en los 6 |
| ¿Se ha aplicado? | **No.** Ni al `.gitignore` ni a git: decisión del operador |
| ¿Cuánto pesaría? | **4.212.336 B (4,02 MiB)**: 3,3 MB de PDF + 865 KB de patch |
| ¿Los PDF llevan el secreto? | **No**: 0 ocurrencias con controles vivos (6/40 y 2/69) |
