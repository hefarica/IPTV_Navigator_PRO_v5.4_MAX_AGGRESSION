# Ley de upscaling de la APK (REA) — fuente de verdad para alinear el LAB y la lista

**Estatus:** la **APK manda**. Este documento transcribe la ley desde el código que la ejecuta, no
desde la documentación que la describe. Donde la doc y el código discrepan, **gana el código**.

**Artefacto fuente:** `APE_REA_FUENTES_Y_FIRMA_PRIVADA_20261107.zip` · sha256 `df20e712…` ·
`integration/src/com/ape/rea/ReaAdaptiveEffect.java` · `ReaState.java` · `ReaLoadGovernor.java`
**APK que la contiene:** `com.ape.crystalagent.rea` v652 `3.9.6-rea-ott-test` · sha256 `79c7d1fd…`
**Medido:** 2026-11-07. Confianza: `observado` (leído del fuente que compila al DEX).

---

## 1 · La ley, literal

`ReaAdaptiveEffect.resolveGeometry()`, líneas **109-122**:

```java
int shortSide = Math.min(width, height);
int boxLong, boxShort;
if (shortSide <= 720)       { boxLong = 2560; boxShort = 1440; }
else if (shortSide < 2160)  { boxLong = 3840; boxShort = 2160; }
else if (shortSide == 2160) { boxLong = 5760; boxShort = 3240; }
else                        { boxLong = Math.max(width, height); boxShort = shortSide; }

int boxWidth  = width >= height ? boxLong  : boxShort;
int boxHeight = width >= height ? boxShort : boxLong;
double targetScale = Math.max(1.0, Math.min((double) boxWidth / width,
                                           (double) boxHeight / height));
int level = clampInt(scaleLevel, 0, 2);
double requestedScale = !upscale || level == 0 ? 1.0
    : (level == 1 ? 1.0 + (targetScale - 1.0) * .5
                  : targetScale);
```

**Selección por `shortSide` (el lado corto), no por el perfil, no por el nombre del canal, no por
el bitrate.** Tres niveles de `scaleLevel` (el `ReaState.scaleLevel` por defecto es **2**):

| `scaleLevel` | Escala aplicada | Nombre |
|---|---|---|
| 0 | `1.0` — sin upscale | nativo |
| 1 | `1.0 + (target−1.0)·0.5` — **mitad** del salto | equilibrado |
| 2 | `targetScale` — **salto completo** | detalle |

### La escalera, en una tabla

| `shortSide` de la fuente | Techo de procesado | Cuándo |
|---|---|---|
| **≤ 720** | **2560 × 1440** | 480p, 576p, 720p |
| **721 … 2159** | **3840 × 2160** | 1080p, 1440p |
| **= 2160 exacto** | **5760 × 3240** | 4K UHD |
| **> 2160** | **nativo, sin upscale** | 8K y superiores |

> **Ojo al `==` de la tercera rama.** Es **igualdad exacta**, no `>=`. Un `shortSide` de 2161..∞ cae
> en la cuarta rama y **no se upscala nada**. Consecuencia dura: **la APK no upscala 8K — lo deja
> nativo.** «8K Master» es un tier de *passthrough*, no de escalado.

La proporción se preserva con `scaledDimension()` (líneas 151-155):
`Math.floor(dim*scale + 1e-7)`, y nunca por debajo del nativo (`Math.max(dimension, ...)`).
Por eso **nunca hay downscale por esta vía** — coherente con la Ley Anti-Degradación.

---

## 2 · Lo que la APK produce, perfil por perfil del LAB

Fuente: hoja `6_NIVEL_2_PROFILES` del `APE_M3U8_LAB_v8_FIXED.xlsm` (fila 21, cols B..G = P0..P5),
leída sin COM el 2026-11-07. Cálculo con la ley de §1 y `maxProcessingHeight = 3240`.

| Perfil | Nombre LAB | Fuente | `target` | **L1 (mitad)** | **L2 (completo)** | Textura L2 |
|---|---|---|---|---|---|---|
| P0 | 8K Master | 7680×4320 | **1.0** | 7680×4320 | **7680×4320** | 443,1 MiB |
| P1 | 4K UHD | 3840×2160 | 1.5 | 4800×2700 | **5760×3240** | 211,8 MiB |
| P2 | 2K QHD | 3840×2160 | 1.5 | 4800×2700 | **5760×3240** | 211,8 MiB |
| P3 | FHD 1080p | 1920×1080 | 2.0 | 2880×1620 | **3840×2160** | 96,1 MiB |
| P4 | HD 720p | 1280×720 | 2.0 | 1920×1080 | **2560×1440** | 51,6 MiB |
| P5 | SD 480p | 854×480 | 2.998 | 1707×959 | **2560×1438** | 49,4 MiB |

### Los dos hallazgos que obligan a decidir

**H1 · COLAPSO P1 ≡ P2.** Ambos declaran `3840×2160`, y la ley de la APK sólo mira `shortSide`.
⇒ **la APK produce exactamente el mismo `5760×3240` para P1 y para P2.** No hay forma de que el
motor distinga «4K UHD» de «2K QHD»: la diferencia existe en el nombre y en los atributos del LAB,
**no en el camino de imagen**. Era el defecto que quedó abierto el turno anterior; ahora está
probado desde el código, no por inspección de la hoja.

**H2 · P5 no da 1440 exacto.** `854×480` con escala `2.998` produce **2560×1438**, no `2560×1440`.
La proporción manda. Cualquier tabla que declare `2560x1440` para P5 está redondeando una medición.

**H3 · P0 (8K) excede el presupuesto en casi todos los devices.** `estimateTextureBytes(7680,4320,
7680,4320,4)` = **443,1 MiB**, contra los tiers de `ReaBridge.memoryBudget()`:

| Tier de memoria | Presupuesto | 443,1 MiB | Resultado |
|---|---|---|---|
| ≥6 GB RAM y ≥2 GB libres | 448 MiB | cabe (98,9 %) | REA procesa 8K nativo |
| ≥4 GB y ≥1,5 GB libres | 384 MiB | no cabe | **`bypass REA`** |
| ≥3 GB y ≥1 GB | 256 MiB | no cabe | **bypass REA** |
| ≥2 GB y ≥512 MB | 192 MiB | no cabe | **bypass REA** |
| fallback / `lowMemory` | 112 / 96 MiB | no cabe | **bypass REA** |

⇒ **en cualquier device por debajo de 6 GB de RAM, el perfil P0 no recibe mejora de la APK.** No
degrada (el stream se sirve igual); simplemente **no se procesa**. Se declara, no se esconde.

---

## 3 · Los techos que pueden recortar la ley

La ley de §1 es el **máximo teórico**. `resolveGeometry` aplica después un `min()` con cinco límites
(líneas 123-135). El resultado real es `min(requested, precision, height, texture, viewport, memory)`:

| Límite | Origen | Efecto |
|---|---|---|
| `fragment highp` | `glGetShaderPrecisionFormat` | sin highp ⇒ **escala 1.0** (sin upscale). **HDR exige highp** o aborta (línea 199) |
| `maxProcessingHeight` | `ReaState`, default **3240**, clamp `[720, 3240]` | `max(1.0, 3240/shortSide)` → **no recorta nunca hacia abajo**; es piso, no techo efectivo |
| `GL_MAX_TEXTURE_SIZE` | GPU | `min(maxTex/w, maxTex/h)` |
| `GL_MAX_VIEWPORT_DIMS` | GPU | `min(maxVpW/w, maxVpH/h)` |
| Presupuesto de textura | `memoryBudget()` | `sqrt((budget−input)/(2·input))` |

Si el nativo no cabe (8K), lanza `"Native source exceeds REA texture budget; bypass REA"` →
`ReaBridge.effects()` captura y devuelve lista vacía ⇒ reproducción nativa. **Falla abierto, no
corta.**

### El gobernador defiende la resolución (esto es doctrina, no accidente)

`ReaLoadGovernor.sample()` degrada en este orden:

```
pérdida de frames (>1 %, 2 ventanas, ≥5 s entre cambios):
    q > 0        → baja CALIDAD de filtro   (q−1)
    scale > 0    → baja RESOLUCIÓN          (scale−1)   ← sólo después
    si no        → bypass nativo
térmica 3 (severa) → q=0, scale−1 cada 4 s
térmica ≥4 (crítica) → q=0, scale=0, bypass
```

**La resolución es lo ÚLTIMO que se sacrifica y lo primero que se recupera**: con 40 s estables y
térmica ≤1, restaura `scale` hasta 2 y luego sube `q` hasta `qualityCeiling`. Eso está alineado con
la Ley Anti-Degradación: se cae el filtro antes que el píxel. **No hay que «arreglar» esto.**

---

## 4 · Cómo se alinea el LAB sin mentir

**La regla que no se rompe:** `RESOLUTION=` del `#EXT-X-STREAM-INF` describe el **stream**. Si se
escribe `5760x3240` sobre un stream de `3840x2160` es una mentira al parser, y viola
`ape-image-pipeline-truth` §15.1 y la Ley Anti-Degradación. **No se hace.**

Lo correcto: separar **fuente** de **procesado**.

| Capa | Qué declara | Dónde vive |
|---|---|---|
| Fuente | `resolution` real del tier (`3840x2160`, …) | `RESOLUTION=` del STREAM-INF · ya correcto |
| Procesado APK | techo que REA aplicará (`5760x3240`, …) | **tag nuevo**, `DECLARED` |

### Campos a añadir en `6_NIVEL_2_PROFILES`

| Campo | Tipo | P0 | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|---|---|
| `rea_target_l2` | `WxH` | `7680x4320` | `5760x3240` | `5760x3240` | `3840x2160` | `2560x1440` | `2560x1438` |
| `rea_target_l1` | `WxH` | `7680x4320` | `4800x2700` | `4800x2700` | `2880x1620` | `1920x1080` | `1707x959` |
| `rea_scale_max` | float | `1.0` | `1.5` | `1.5` | `2.0` | `2.0` | `2.998` |
| `rea_max_processing_height` | int | `3240` | `3240` | `3240` | `3240` | `3240` | `3240` |
| `rea_min_ram_mb` | int | `6144` | `2048` | `2048` | `2048` | `2048` | `2048` |
| `rea_bypass_below` | texto | `6 GB RAM` | `lowMemory` | `lowMemory` | — | — | — |

### Tag a emitir en la lista (declarado, **nunca** «aplicado»)

```
#EXT-X-APE-REA-TARGET:LAYOUT=5760x3240;SCALE=1.5;LEVEL_MAX=L2;MAX_H=3240;FROM=3840x2160;STATE=DECLARED
```

- `LAYOUT` = salida teórica según §1. `FROM` = resolución real de la fuente. `STATE=DECLARED`.
- Cuando el device no puede: `#EXT-X-APE-REA-BYPASS:REASON=texture_budget;NEED=443MiB;STATE=DECLARED`
- **Prohibido** emitirlo como `APPLIED`: el `state.status` real sólo existe en runtime
  (`"REA WxH > WxH (reason)"` en `ReaState`). `DECLARED` es honesto; `APPLIED` sería inventado.

---

## 5 · Decisiones que quedan para el propietario

1. **P1 ≡ P2 en imagen.** Opciones: (a) aceptar el colapso y documentar que P2 difiere sólo en
   atributos no visuales; (b) dar a P2 un `shortSide` distinto (p. ej. 1440) para que produzca
   `3840x2160` y quede escalón intermedio real; (c) retirar P2 de la escalera.
   **Sin decisión, el LAB promete una distinción que el motor no puede cumplir.**
2. **P0 sólo procesa en ≥6 GB.** Si se quiere 8K procesado en el parque real, hace falta bajar la
   huella de textura (una sola textura de salida en vez de dos) o declarar P0 como passthrough.
3. **¿Se emite el tag `#EXT-X-APE-REA-TARGET` en la lista?** Es aditivo y `DECLARED`; no toca
   `RESOLUTION=` ni `CODECS=`. Recomendado sí.

---

## 6 · Verificación reproducible

```bash
# la ley está en el fuente que compila al DEX
python -c "import zipfile;z=zipfile.ZipFile('APE_REA_FUENTES_Y_FIRMA_PRIVADA_20261107.zip');
print(z.read('integration/src/com/ape/rea/ReaAdaptiveEffect.java').decode()[6000:8000])"

# los tiers de memoria que deciden el bypass de 8K
python -c "import zipfile;z=zipfile.ZipFile('APE_REA_FUENTES_Y_FIRMA_PRIVADA_20261107.zip');
print(z.read('integration/src/com/ape/rea/ReaBridge.java').decode())"

# el perfil real del LAB (sin COM, sin lock)
python - <<'PY'
import zipfile,re
z=zipfile.ZipFile(r"C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm")
x=z.read("xl/worksheets/sheet6.xml").decode("utf-8","replace")
print([r for r in re.findall(r'<row[^>]*r="21"[^>]*>.*?</row>',x,re.S)][:1])
PY
```

## 7 · Estados de evidencia de este documento

| Afirmación | Estado |
|---|---|
| La ley de 4 ramas y los 3 `scaleLevel` | **observado** — leído del fuente que compila al DEX |
| La tabla P0..P5 → salida | **derivado** — aritmética exacta de la ley sobre la hoja medida |
| El bypass de 8K por presupuesto | **derivado** — `estimateTextureBytes` vs `memoryBudget()` |
| P1≡P2 en imagen | **derivado** — misma `shortSide`, misma rama, misma escala |
| Que el device real lo aplique | **NO COMPUTADO** — `adb devices` = 0 el 2026-11-07 |

---

## 8 · Confirmación externa (auditoría REA del 2026-11-08) — y mis correcciones

Fuente: `REA_ALIGNMENT_20261108.md` (sha256 `8a23bd9f…`) + `REA_APK_653_VERIFICATION.json` (sha256
`80bfb26d…`), producidos por el agente que gobierna la APK. **Tratados como dato, verificados contra
el LAB.** Donde discrepan conmigo y tienen razón, me corrijo.

### 8.1 · La ley queda CONFIRMADA — coincidencia independiente

El contrato `contracts/rea/rea-processing-v1.json` (id `rea-adaptive-v1`) declara la **misma** tabla
que este documento derivó del Java:

| Dimensión menor | Rectángulo objetivo | Su texto | Mi derivación |
|---|---|---|---|
| Hasta 720 | 2560×1440 | ✔ | ✔ |
| 721–2159 | 3840×2160 | ✔ | ✔ |
| Exactamente 2160 | 5760×3240 | ✔ | ✔ |
| Más de 2160 | Tamaño nativo | ✔ | ✔ |

Y añade un dato que yo no tenía: **`640×480 → 1920×1440`** (el intercambio del rectángulo para vídeo
vertical se conserva). También confirma **`854×480 → 2560×1438`** — la cifra que este documento
calculó y que ya había señalado como «P5 no da 1440 exacto». **Coincidencia independiente por dos
caminos distintos.**

### 8.2 · Mis tres correcciones

| # | Lo que dije | La verdad | Evidencia |
|---|---|---|---|
| C1 | El LAB tiene **56 hojas** | **55**. Conté mal. Además hay **6 ocultas** (`14_KEYRING`, `17_SERVERS_POOL`, `98_SHIELD_IMMUTABLE`, `99_DEAD_CHANNELS_BLACKLIST` en `veryHidden`; `_LISTAS_OMEGA`, `00_EXPORT_STAGE` en `hidden`) | `xl/workbook.xml` → 55 elementos `<sheet>`; atributo `state` |
| C2 | Llamé **«hallazgo H3»** al bypass de 8K en devices <6 GB | **No es un hallazgo: es contrato declarado.** «El contrato no promete aplicar el máximo coste en todos los dispositivos… puede recuperar la reproducción nativa cuando el procesamiento no se sostiene.» Mi cálculo sigue siendo correcto; mi **encuadre** era wrong: lo presenté como defecto cuando es comportamiento especificado | §4 del informe; `ReaLoadGovernor` |
| C3 | Dejé A3 abierta como posible bug (`==2160` vs `>=`) | **Intencional**: «Más de 2160 → Tamaño nativo. **Se evita reducir una fuente mayor**». Un DCI 4K (`4096×2304` → menor 2304) no se upscala **a propósito** | §2 del informe |

Lo que sí quedó validado de mi trabajo, sin cambios:

- **No falsificar `RESOLUTION=`.** El informe lo respalda literal: «Las dimensiones son objetivos
  sujetos a capacidad, **no dimensiones que se puedan atribuir a la fuente**».
- Separar fuente de procesado en capas distintas (fuente en `RESOLUTION=`, objetivo como metadata).

### 8.3 · Las preguntas que quedan contestadas

| Pregunta | Respuesta recibida |
|---|---|
| **A1** · colapso P1≡P2 | **«En esta implementación, el nombre comercial "2K" se concreta como un rectángulo QHD 2560×1440; no se confunde con DCI 2048×1080.»** ⇒ el LAB, al declarar `P2 = 3840×2160` bajo el nombre «2K QHD», **contradice el contrato**. La opción (b) de mi A1 es la que el contrato implica: `P2 → 2560×1440`, que bajo la ley produce `3840×2160` y queda escalón intermedio real |
| **A2** · 8K | **Resuelto por contrato**: el máximo coste no se promete en todos los devices; la caída a nativo es válida. Queda pendiente de decisión del propietario si además se quiere *mejorar* P0 bajando huella de textura |
| **A3** · `==2160` | **Intencional** (ver C3) |
| **A4** · tag de destino | Hay contrato formal: `contracts/rea/rea-processing-v1.json` y `contracts/rea/formats-v1.json`. **No debo inventar un tag**: el nombre canónico vive ahí |
| **B1** · campo de destino en el LAB | **El LAB no tiene hoja REA** y «sus macros no exportan la extensión nueva». ⇒ no hay campo previo que reutilizar; el `XLSM original permanece pendiente de migración explícita» |
| **B2** · ¿Excel abierto? | Coincide: **no había dispositivo ADB ni sesión** en su revisión. Yo medí 0 procesos EXCEL y 0 `~$` |
| **B3** · device | **0 ADB** en ambos lados ⇒ validación en hardware = **NO COMPUTADO** |
| **B4** · rama | Confirmada base `272f417e88468183404569f8ae4d3ce8001abd05` en `feat/adb-generic-visual-enhancement-installer` |

### 8.4 · APK 653 — existe, está verificada y **no está publicada**

| Campo | Valor |
|---|---|
| Paquete | `com.ape.crystalagent.rea` |
| versionCode / Name | **653** / `3.9.7-rea-interop-test` |
| Bytes | 24.362.980 |
| SHA-256 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` |
| Base (pineada) | `8d3b1458…` — **la misma que sirve el VPS** |
| DEX / clases únicas | 9 / 14.685, sin duplicados |
| Inyección | 16 métodos, 19 puntos de llamada |
| Nativas | 20 conservadas byte por byte |
| Firma / alineación ZIP | verificadas |
| **Playback Android / HDR físico** | **false / false** |

Diferencia con la 652 que analicé: **+1 versionCode, +DASH 1.3.1, +recuperación nativa corregida**
(retirar efectos de Media3 no desmontaba el grafo de vídeo; ahora recrea la Activity conservando
Intent/URL/cabeceras/posición VOD). Y su propia advertencia: **«reemplazar únicamente `version.json`
sería insuficiente»** — la publicación exige unidad estática + backup/restore del lote y sus `.gz` +
verificación HTTP con y sin compresión.

### 8.5 · Los 2 gates bloqueados: yo reproduje el mismo `EPERM`

El informe deja **2 gates bloqueados** (no aprobados) porque Chrome 157 responde a `--version` pero
«al arrancar falla su socket con `EPERM`; el puerto CDP no está disponible».

**Esta sesión chocó con lo mismo de forma independiente** al intentar renderizar el enlace de
ChatGPT: `OpenProcess: Acceso denegado (0x5)` de crashpad, `Missing headless user data directory` y,
con `--user-data-dir` explícito, **0 bytes de salida**. ⇒ Es una **limitación del entorno**, no un
fallo del código auditado. Corrobora su decisión de no declarar esos gates verdes.

### 8.6 · Datos nuevos del LAB que confirman la incoherencia heredada

| Dato | Medido por mí | Qué significa |
|---|---|---|
| `6_NIVEL_2_PROFILES!A32 = settings.fps`, `B32:G32` = `120,120,120,120,120,120` | **confirmado** | los seis perfiles declaran **120 fps** |
| JSON certificado equivalente | P0…P5 = `30,60,30,60,30,30` | **desacuerdo XLSM ↔ JSON**, «configuraciones heredadas con semántica mezclada, no mediciones» |
| `ape-image-pipeline-truth` §9 | P1 4K medido = **29,6 fps** | un 120 declarado para los seis es **decorativo**, no sostenible |

⇒ **No se toca la fila 32 sin decisión del propietario.** Es el mismo patrón que la Ley Cardinal 1
(declarar un nivel que el decoder no sostiene).

## 9 · Lo que sigue bloqueado por física, no por código

| Falta | Estado | Por qué no se puede cerrar desde aquí |
|---|---|---|
| Reproducción real OTT → REA | NO COMPUTADO | `adb devices` = 0 |
| Dropped frames / térmica / rebuffering | NO COMPUTADO | requiere device |
| Dimensiones efectivas y HDR del panel | NO COMPUTADO | requiere device + metraje real |
| Los 2 gates de UI | BLOQUEADOS | `EPERM` del sandbox al arrancar Chrome (reproducido) |
| Publicación de la 653 | NO HECHA | exige unidad estática + backup del lote + verificación con/sin gzip |

**Y la frase que ordena todo el resto:** el informe **no crea commit ni PR** porque `AGENTS.md` exige
todos los gates verdes. Es la conducta correcta. Ninguna excepción autoriza por sí sola merge ni
despliegue.
