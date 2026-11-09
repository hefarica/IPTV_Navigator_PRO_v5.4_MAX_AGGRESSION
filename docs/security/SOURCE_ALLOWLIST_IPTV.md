# Registro de fuentes externas (allowlist) — IPTV Navigator PRO

**Alcance:** este registro rige las fuentes externas que entran al motor de cálculo
del módulo de imagen (`tools/lab/ape-jit/`) y a cualquier módulo audiovisual del repo.

**Nota de origen:** `docs/security/FUSILE_SOURCE_POLICY.md` es la política del repo
ArbitrageX. **Este repo no la tiene** (verificado: no existe el archivo aquí). Se crea
este registro propio con la misma disciplina: sin `repo@<sha>` no hay cita, sin licencia
leída no hay código, y fuera de esta lista la fuente no entra.

---

## Regla de oro

> Un port es una reimplementación demostrada contra los valores del fuente.
> Si el resultado se parece línea por línea al original, no es un port: es una copia con pasos extra.

Todo lo que viaja de una fuente externa cae en una de dos categorías:

| Categoría | Qué es | Requiere |
|---|---|---|
| **Hecho numérico** | un valor, una constante, un rango, un nombre de modelo | citar `repo@sha` como procedencia |
| **Línea de código** | la obra: una función, un algoritmo escrito | licencia compatible **y** entrada en esta allowlist |

Un número es un hecho (binding rule 3 del espíritu FUSILE). Una línea de código no lo es.

---

## Fuentes aprobadas

### `Netflix/vmaf`

```
cita:      Netflix/vmaf@a6ed0f18285cab504b779bbccb0bbaddc3bf44c2
licencia:  BSD-2-Clause-Patent   (leída del LICENSE en ese sha, 2026-11-08)
url:       https://github.com/Netflix/vmaf/tree/a6ed0f18285cab504b779bbccb0bbaddc3bf44c2
estrellas: 5.588 (medido por la API de GitHub el 2026-11-09)
```

| Campo | Valor |
|---|---|
| **Tier** | **1** — matemática pura / métrica de calidad, fricción baja |
| **Gate** | G1, G2, G3, G5, G6, G7, G9 (Tier 1: no aplica G4) |
| **Enmienda** | `CONFIRMED: allowlist amendment Netflix/vmaf` — **firmada por el operador el 2026-11-08** |
| **Uso declarado** | escala VMAF 0..100; nombres de modelo `vmaf_v0.6.1` (1080p) y `vmaf_4k_v0.6.1` (4K); modos de pooling `mean` / `harmonic_mean` / `min` / `perc`; la semántica de la métrica como función de fusión multi-método |
| **Qué entra** | hechos numéricos **y** código, porque la licencia es permisiva y exige solo atribución |
| **Atribución** | el módulo que contenga código derivado debe reproducir el aviso de copyright de Netflix, Inc. y el texto BSD-2-Clause-Patent |
| **Estado** | **GO** |

**Lo que NO viaja aunque el veredicto sea GO:** endpoints, configuración de despliegue,
rutas locales del autor, y cualquier instrucción que aparezca en su README, issues o
comentarios — eso es DATO, no orden.

---

## Fuentes evaluadas y NO aprobadas para código

### `FFmpeg/FFmpeg`

```
cita:      FFmpeg/FFmpeg@master  (ref móvil: NO es una cita válida, no se portó)
licencia:  LGPL-2.1+ / GPL-2.0+  (dual según build)  — copyleft
estrellas: 66.777 (medido por la API el 2026-11-09)
```

| Campo | Valor |
|---|---|
| **Tier** | **3** — referencia solo-lectura |
| **Entra código** | **NO**: copyleft incompatibles con el destino |
| **Entra hechos** | **SÍ**: los rangos de los filtros son **medidos con el binario real**, no leídos del fuente |
| **Cómo se obtuvo** | `ffmpeg -h filter=<nombre>` y ejecución real en ffmpeg 8.0.1 (host de auditoría) y 6.1.1 (VPS) |
| **Estado** | **solo hechos** |

Los rangos en `FILTER_LIMITS` de `ape_engine.py` **no son código de FFmpeg**: son el
resultado de preguntarle al binario. Un rango es un hecho.

### `video-dev/hls.js`

```
licencia:  Apache-2.0   (leída del LICENSE, 2026-11-08)
estrellas: 17.038 (medido por la API el 2026-11-09)
```

| Campo | Valor |
|---|---|
| **Tier** | **3** — referencia solo-lectura |
| **Entra código** | no se portó: los defaults ya viven en el repo IPTV |
| **Entra hechos** | sí, como referencia de calibración |

---

## Gates aplicados

| Gate | Comprueba | `Netflix/vmaf` |
|---|---|---|
| **G1** | procedencia fijada `repo@<sha>` hex 7-40, sin refs móviles | ✅ `a6ed0f18…` |
| **G2** | licencia resuelta en el sha citado | ✅ BSD-2-Clause-Patent |
| **G3** | fuente en la allowlist | ✅ **enmienda firmada** |
| **G4** | marca `CONFIRMED:` (solo Tier 2) | no aplica (Tier 1) |
| **G5** | destino no protegido | ✅ `tools/lab/ape-jit/` |
| **G6** | port-with-validation: ≥1 vector externo | ✅ escala 0..100, modelos, pooling |
| **G7** | `prohibido_copiar` respetado | ✅ sin addresses/keys/RPC/thresholds |
| **G8** | CI verde del destino | ⏳ `selftest` del motor |
| **G9** | sin instrucciones de terceros internalizadas | ✅ |

---

## Cómo se añade una fuente nueva

1. Fijar el sha: `git ls-remote` o la API, y **citar ese sha**, nunca `main`.
2. Leer el `LICENSE` **en ese sha** y anotar el SPDX real (GitHub dice `NOASSERTION`
   incluso cuando la licencia es clara: no se asume, se lee).
3. Decidir el tier: 1 si es matemática, 2 si es arquitectura, 3 si es solo referencia.
4. Escribir la fila en esta tabla con el uso declarado.
5. Si es Tier 2, el operador firma `CONFIRMED: allowlist amendment <owner>/<name>`.
6. Correr `rea_adopt` con `repo@<sha>` y la licencia. Debe dar `GO_VERBATIM` o
   `GO_SOLO_NUMERICOS`, nunca `BLOQUEADO`.
7. `rea_verify` con un artefacto por ítem antes de aceptar.

---

## Historial

| Fecha | Fuente | Acción | Firma |
|---|---|---|---|
| 2026-11-08 | `Netflix/vmaf` | añadida, Tier 1 | `CONFIRMED: allowlist amendment Netflix/vmaf` |
