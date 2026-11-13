# D-4 · El `.gitignore` no deja viajar los entregables

**Decisión:** D-4 · **Estado:** parche **producido y NO aplicado** · **Fichero objetivo:** `.gitignore` (raíz del repo)

## 1 · El defecto

La línea **173** del `.gitignore` es `deliverables/`. Sin barra inicial, ese patrón casa **cualquier** directorio llamado `deliverables` a cualquier profundidad — incluido `docs/canary/deliverables/`. Consecuencia medida: los 7 entregables existen en disco y **git no los ve**:

```text
$ git ls-files docs/canary
(sin salida)                                   -> 0 ficheros rastreados

$ git check-ignore -v docs/canary/deliverables/10_CANARY_ANDROID_APK.md
.gitignore:173:deliverables/	docs/canary/deliverables/10_CANARY_ANDROID_APK.md
$ echo $?
0
```

Los **7** ficheros dan `check-ignore` **exit 0** citando la misma línea.

> **Corrección al encargo, medida:** el encargo dice que el `.gitignore` tiene **0 negaciones**. No es exacto: tiene **1**, en la línea **187** (`!_docs/**/*.mp4`), que no tiene relación con esto. Lo que sí es cierto —y es lo que importa— es que **no existe negación para `docs/canary/deliverables/`**.
>
> También conviene saber que el fichero es **CRLF** (4.503 B, 207 líneas). El parche respeta ese final de línea; un parche generado con LF no aplicaría.

## 2 · El parche

`0005-gitignore-deliverables.patch` — **290 B** — `sha256 e31cf2219e943a2d69c925de7571ea7f860e98a9ad35a276beb7bbc6410d18d2`

```diff
diff --git a/.gitignore b/.gitignore
index 6b96edb..6d002c3 100644
--- a/.gitignore
+++ b/.gitignore
@@ -171,6 +171,7 @@ scratch/
 *-bak_*.json
 IPTV_v5.4_MAX_AGGRESSION/deliverables/
 deliverables/
+!docs/canary/deliverables/
 artifacts/
 /.claude/agents/*.bak
 /privacy_*_test.png
```

**Por qué va justo ahí:** en git gana el **último** patrón que casa. La negación tiene que ir **después** de la línea 173, o `deliverables/` vuelve a ganar. El parche inserta `!docs/canary/deliverables/` como línea **174**.

**No se puede re-incluir un fichero cuyo directorio padre está excluido**, pero aquí lo excluido *es el propio directorio* (`docs/canary/deliverables/`), y la negación lo nombra directamente — por eso funciona. Verificado abajo, no razonado.

## 3 · Aplicabilidad sobre el repo real (no escribe)

```text
$ git apply --check docs/canary/fixes/00_gitignore/0005-gitignore-deliverables.patch
exit=0

$ git apply --stat docs/canary/fixes/00_gitignore/0005-gitignore-deliverables.patch
 .gitignore |    1 +
 1 file changed, 1 insertion(+)
```

## 4 · Demostración en COPIA (el `.gitignore` real no se toca)

Árbol temporal con **copia real** del `.gitignore` y de los 7 entregables, replicando el repo real (donde `.gitignore` está **rastreado**).

**Antes del parche** — los 7 ignorados, y `git status` no ve nada:

```text
01_CANARY_JIT_ARCHITECTURE.pdf -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf
02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf
03_CANARY_JIT_INTEGRATION.patch -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch
07_CANARY_DEVICE_REGISTRATION.md -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md
10_CANARY_ANDROID_APK.md -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/10_CANARY_ANDROID_APK.md
12_CANARY_DEPLOYMENT_RECEIPT.json -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
TRANSPORT_MANIFEST_20261111.json -> exit=0 :: .gitignore:173:deliverables/ | docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json
git status --porcelain -uall -> 0 entrada(s)
```

**Aplicar en la copia:**

```text
$ git apply -v .../0005-gitignore-deliverables.patch
Checking patch .gitignore...
Applied patch .gitignore cleanly.
exit=0
```

**Después del parche** — los 7 dejan de estar ignorados:

```text
01_CANARY_JIT_ARCHITECTURE.pdf -> exit=1 :: (nada ignorado)
02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf -> exit=1 :: (nada ignorado)
03_CANARY_JIT_INTEGRATION.patch -> exit=1 :: (nada ignorado)
07_CANARY_DEVICE_REGISTRATION.md -> exit=1 :: (nada ignorado)
10_CANARY_ANDROID_APK.md -> exit=1 :: (nada ignorado)
12_CANARY_DEPLOYMENT_RECEIPT.json -> exit=1 :: (nada ignorado)
TRANSPORT_MANIFEST_20261111.json -> exit=1 :: (nada ignorado)

git status --porcelain -uall -> 8 entrada(s):
    M .gitignore
   ?? docs/canary/deliverables/01_CANARY_JIT_ARCHITECTURE.pdf
   ?? docs/canary/deliverables/02_CANARY_APK_OTT_TIVIMATE_MANUAL.pdf
   ?? docs/canary/deliverables/03_CANARY_JIT_INTEGRATION.patch
   ?? docs/canary/deliverables/07_CANARY_DEVICE_REGISTRATION.md
   ?? docs/canary/deliverables/10_CANARY_ANDROID_APK.md
   ?? docs/canary/deliverables/12_CANARY_DEPLOYMENT_RECEIPT.json
   ?? docs/canary/deliverables/TRANSPORT_MANIFEST_20261111.json
```

### Sobre el «1 → 7» del encargo

El encargo anticipa `git status -uall` de **1 a 7** entradas. El número medido depende de si `.gitignore` está rastreado:

| Configuración de la copia | Antes | Después |
|---|---:|---:|
| `.gitignore` **sin rastrear** (árbol nuevo, como en t27) | **1** (`?? .gitignore`) | **8** (`.gitignore` + los 7) |
| `.gitignore` **rastreado** (como el repo real) | **0** | **8** (`M .gitignore` + los 7) |

El «1 → 7» era correcto cuando había **6** entregables (1 `.gitignore` + 6). Hoy son **7** (se añadió `TRANSPORT_MANIFEST_20261111.json`), así que la cuenta honesta es **1 → 8** en árbol nuevo y **0 → 8** en el árbol con `.gitignore` rastreado. **Lo que no cambia es la propiedad que importa: los 7 pasan de `exit 0` a `exit 1`.**

## 5 · El `.gitignore` real queda byte-idéntico

```text
antes  : 4.503 B  sha256 4adb88ffe7912ccfce24cbb914a28a9ffdefe2bfeb0ab93f9ae6f3890edeca6b
después: 4.503 B  sha256 4adb88ffe7912ccfce24cbb914a28a9ffdefe2bfeb0ab93f9ae6f3890edeca6b
identico=true
```

## 6 · Lo que costaría aplicarlo — y qué NO hace

**El parche no commitea nada.** Solo hace visible lo invisible. Si se aplica:

| | |
|---|---|
| Ficheros que pasarían a verse | **7** |
| Peso total | **4.223.008 B = 4,03 MiB** |
| Desglose | 2 PDF 3.278.756 B · patch de integración 865.408 B · 4 documentos 68.844 B |

> Los **4.212.336 B = 4,02 MiB** del encargo corresponden a los **6** entregables sin el `TRANSPORT_MANIFEST` (10.672 B). Con los 7, la cifra medida es **4.223.008 B**.

**Commitearlos o no es decisión del operador.** Si se commitean, entran ~3,3 MB de PDF binario en la historia y un PDF no se diffea: cada regeneración es un blob nuevo. Si no se commitean, el hueco de entrega sigue abierto y un clon limpio seguirá sin los entregables. Las dos opciones son legítimas; lo que no lo es es creer que hoy viajan.

## 7 · Reversión

```bash
git apply -R docs/canary/fixes/00_gitignore/0005-gitignore-deliverables.patch
```

O simplemente borrar la línea `!docs/canary/deliverables/`. Reversión **ALTA**: si no se ha commiteado nada, el efecto desaparece sin rastro.
