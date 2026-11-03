# BLOQUEADO: el perfil activo no cumple el delta — diagnóstico y corrección

**Fecha:** 2026-11-03
**Síntoma:** el panel de salida mostraba `BLOQUEADO: el perfil activo no cumple el delta 10%` e impedía generar.
**Commit del fix:** `15a9d8a4` · **Deploy:** run `41647598776` **success**

---

## 1 · De dónde salía el mensaje

`frontend/js/ape-v9/generation-output-panel.js`, función `checkGeneration()`:

```js
function guard() {
  var inM = inputMbps(), outM = activeBitrate();
  var has = inM > 0 && outM > 0;
  var ok  = has && inM >= outM * (1 + DELTA_PCT / 100);
  ...
}
```

- `inM` = ancho de banda medido (`window.APE_BW.snapshot().mbps`, en **Mbps**)
- `outM` = `settings.bitrate` del perfil activo, en **Mbps**
- `DELTA_PCT` = 10 en este equipo (por defecto 15)

**La comparación era dimensionalmente correcta.** El problema no eran unidades.

## 2 · El defecto real: comparaba contra el techo

`settings.bitrate` **no es el requisito del perfil: es el techo de su escalera**, la calidad máxima que puede
alcanzar. Del LAB canónico:

| Perfil | `bitrate` (Mbps) | `bandwidth_floor` (bps) |
|---|---:|---:|
| P0 | **200** | 15 000 000 → **15 Mbps** |
| P1 | 40 | 12 Mbps |
| P2 | 25 | 8 Mbps |
| P3 | 15 | 5 Mbps |
| P4 | 10 | 3 Mbps |
| P5 | 2 | 1.5 Mbps |

**Con P0 activo, el guard exigía 220 Mbps medidos para emitir una lista.** Nadie tiene eso. El bloqueo era
permanente.

**Y el dato que faltaba estaba en el LAB, no en la APP:** `bandwidth_floor` existe en
`contracts/lab/APE_LAB_CANONICAL_BULLETPROOF.json` y **no existía en `ape-profiles-config.js`**, que es lo que
el panel lee. Por eso nunca se usó.

## 3 · Por qué bloquear era el criterio equivocado

**Se estaba bloqueando la GENERACIÓN por el ancho de banda del equipo que genera.** El enlace relevante es el
del dispositivo que va a reproducir, no el del operador que emite la lista. Y aun siendo el mismo enlace, la
lista lleva **escalera de variantes**: el ABR elige una más baja y arranca igual.

## 4 · La corrección

El guard ahora responde dos preguntas en vez de una:

```
ok       = inM >= techo * (1 + delta)   -> ¿sostiene la calidad máxima?   (informativo)
canStart = inM >= suelo * (1 + delta)   -> ¿el perfil arranca?            (decide)
```

**Bloquea solo si `canStart` es falso.** Si arranca pero no sostiene el techo, genera y **avisa**.

`activeFloorMbps()` lee `settings.bandwidth_floor` (bps → Mbps) y, si el perfil no lo trae, usa la tabla del
LAB como respaldo.

### Simulación contra los valores reales

| Perfil | Entrada | Antes | Ahora |
|---|---:|---|---|
| P0 | 50 Mbps | **BLOQUEA** (pedía 220) | BUFFER RIESGO — **genera** |
| P0 | 18 Mbps | BLOQUEA | BUFFER RIESGO — **genera** |
| P0 | 10 Mbps | BLOQUEA | **BLOQUEA** (bajo 16.5) |
| P3 | 20 Mbps | OK | OK |
| P3 | 6 Mbps | BLOQUEA | BUFFER RIESGO — **genera** |
| P3 | 4 Mbps | BLOQUEA | **BLOQUEA** (bajo 5.5) |
| P5 | 3 Mbps | OK | OK |
| P5 | 1 Mbps | BLOQUEA | **BLOQUEA** (bajo 1.65) |

**La protección por debajo del suelo se mantiene intacta. El bloqueo indebido desaparece.**

## 5 · Sin regresiones

- `BUFFER OK` sigue significando lo mismo (sostiene el techo).
- `BUFFER RIESGO` ahora tiene un tercer estado hermano: `BUFFER INSUFICIENTE`.
- Sin medición (`has === false`) sigue permitiendo generar, igual que antes.
- El resto de la función (`applyDelta`, `runVps`, formatos) no se tocó.

## 6 · El despliegue, y por qué la primera verificación falló

El panel es frontend y **el pipeline de VPS no lo lleva**: hubo que crear `ape-deploy-frontend.yml`.

**Ese workflow ya existía para el generador; se extendió a los dos ficheros.** Tres verificaciones:

1. `node -c` y las correcciones presentes **en el fuente**
2. el sha instalado coincide con el del repo, o se restaura
3. la URL servida se descarga y **se inspecciona su contenido**

**La primera corrida marcó fallo con el panel ya instalado.** El diagnóstico posterior demostró que el
fichero en disco era el correcto (35.853 B, sha `1fe4afa1…`) y que la URL servía una copia cacheada. **La
segunda corrida pasó en verde.**

**Lección:** una verificación que corre inmediatamente después de escribir puede leer una copia vieja. Lo que
la salvó fue comparar **sha de contenido**, no tamaño ni código de estado.

## 7 · Verificación final

```
m3u8-typed-arrays-ultimate.js  827.257 B  sha servido == sha del repo
generation-output-panel.js      35.853 B  sha servido == sha del repo

panel servido:  activeFloorMbps = 2 · canStart = 7 · FLOOR_MBPS = 2

run 41647598776:  success
  success  Backup y despliegue
  success  Verificar lo que sirve HTTP (contenido, no solo tamano)
```

## 8 · Lo que NO se verificó

- **No probé el panel en un navegador real.** La lógica se validó por simulación con los valores del LAB; el
  render y el flujo de clic no se ejercitaron.
- **No sé qué ancho de banda mide `APE_BW` en la máquina del operador.** El cálculo de `canStart` depende de
  esa medición.
- **`bandwidth_floor` sigue sin estar en `ape-profiles-config.js`**: el respaldo es una tabla en el panel.
  Poblarlo desde el LAB sería la corrección de fondo, y no la hice.
