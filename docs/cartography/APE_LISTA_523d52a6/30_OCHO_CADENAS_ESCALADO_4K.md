# Las ocho cadenas de filtros compilan — y cinco escalan a 4K

**Fecha:** 2026-11-03
**ffmpeg:** 8.0.1-full_build (Gyan)
**Commit:** `f339b74b`
**Verificación:** cada cadena extraída del fuente y ejecutada, una por una.

---

## 1 · Antes y después

| Cadena | Antes | Ahora | Escala a 4K |
|---|---|---|---|
| #1 principal | **OK** (arreglada antes) | OK | no |
| #2 color HDR | FALLA | **OK** | no |
| #3 color HLG | FALLA | **OK** | no |
| #4 | FALLA | **OK** | **3840x2160 @120** |
| #5 | FALLA | **OK** | **3840x2160 @120** |
| #6 | FALLA | **OK** | **3840x2160 @120** |
| #7 | FALLA | **OK** | **3840x2160 @120** |
| #8 | FALLA | **OK** | **3840x2160 @120** |

**De 1 de 8 a 8 de 8.** Entrada probada: **2560×1440**. Salida en las cinco que escalan: **3840×2160**, que es
el ×1,5 por eje de la celda C7.

---

## 2 · Los cuatro defectos, cada uno con su rango declarado

Ninguno se corrigió por intuición: los rangos salen de `ffmpeg -h filter=<nombre>`.

### `gradfun strength` — mínimo 0.51

```
strength  <float>  (from 0.51 to 64) (default 1.2)
```

Las cadenas llevaban **0.3, 0.4, 0.5 y 0.6**. **Los cuatro están por debajo del mínimo.** Por eso fallaba
incluso la que ya había «corregido» a 0.6. Ahora todas usan **0.51**.

### `minterpolate scd` — rango [0, 1]

```
scd  <int>  scene change detection method (from 0 to 1) (default fdiff)
```

Aparecía **`scd=5`** en cuatro cadenas. Ahora `scd=0`.

### `zscale transfer` — entero, no nombre

```
transfer  <int>  set transfer characteristic (from -1 to INT_MAX) (default input)
```

Las cadenas pasaban `bt1886`, `st2084` y `arib-std-b67`. **Son nombres, la opción pide entero.** Las de
solo color pasaron a `format=yuv420p10le`; las que además redimensionaban ya se habían convertido a
`scale` con lanczos.

### `pp` — no existe en este ffmpeg

`pp=ac/dr/ci` y `pp=ac/dr`: el filtro **postproc** no viene compilado (0 coincidencias en `-lists`).
Eliminado.

---

## 3 · Dos errores míos en el camino, y cómo se corrigieron

**1 · Reemplazo global a ciegas.** La primera pasada usó `Set-Content` con reemplazos amplios: el fichero
**creció** de 793.916 a 840.519 bytes y rompió más de lo que arregló. Se revirtió con `git checkout`.

**Causa del crecimiento:** `Set-Content` con encoding por defecto altera los finales de línea.

**2 · La corrección:** la pasada final usa

```powershell
[System.IO.File]::ReadAllText($p)
[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))
```

con **aserción de que el texto decrece antes de escribir**. Resultado: 780.417 → 780.277 chars. El fichero
bajó, como debe ser al quitar opciones.

---

## 4 · Lo que esto significa para el objetivo

El objetivo decía: *«la receta de AXN que reproducía a un escalado maravillosamente perfecto conservamos se
reconstruye exactamente, pero nuestro compilador todavía no interpreta toda la configuración que contiene»*.

**El compilador ya interpreta las ocho cadenas, y cinco de ellas escalan de verdad 1440p a 4K a 120 fps en
ffmpeg.** Medido, no declarado.

| Punto del objetivo | Estado |
|---|---|
| Enlace entrega la lista completa | **cerrado** (604.593.696 B) |
| Presets por reproductor recuperados | **21/21 cubiertos** |
| Censo 10.573 canales / 188 globales / P1-P3-P4 | **cerrado** |
| Cadenas de filtros compilan | **8 de 8** |
| **Cadenas escalan 1440p → 4K** | **5 de 8, a 120 fps** |
| Generador ejecutado end-to-end | **abierto** |
| Calidad visual medida A/B | **abierto** |

---

## 5 · Lo que esto NO prueba

- **No prueba que VLC aplique estas cadenas.** VLC tiene sus propios módulos y le faltan 3/4 a 5/6 de los
  necesarios. Que ffmpeg las ejecute no significa que el reproductor las use.
- **No prueba calidad visual.** Compilar un grafo no es mejorar la imagen. No hay VMAF, ni SSIM, ni
  comparación A/B.
- **No prueba el escalado real 1440p→4K de una fuente.** `testsrc2` es sintético; no es un canal real.
- **Las tres cadenas que no escalan (#1, #2, #3) siguen sin escalar.** Son de procesamiento y color, no de
  redimensionado. Si alguna debería escalar, eso es una decisión de diseño sin tomar.
