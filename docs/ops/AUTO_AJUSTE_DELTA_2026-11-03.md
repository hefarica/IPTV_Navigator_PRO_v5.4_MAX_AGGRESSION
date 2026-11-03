# El bloqueo del delta ya no es un callejón: calcula la salida y la aplica

**Fecha:** 2026-11-03
**Deploy:** runs `41653303368` y `41653892999` **success**
**Test:** `IPTV_v5.4_MAX_AGGRESSION/frontend/tests/ui-delta-autoajuste.verify.js` → **33 PASS · 0 FAIL**

---

## 1 · El problema

Al pulsar generar con el perfil activo por encima del enlace, el panel decía:

> `BLOQUEADO: el perfil activo no cumple el delta 10%`

**Y ahí se acababa.** Sin cuánto falta, sin qué cabría, sin forma de actuar. Una negativa sin salida no es un
guard: es un callejón.

## 2 · La teoría, despejada

Se despeja **la misma desigualdad que ya decidía**, para la variable que el operador sí puede mover:

```
inM ≥ requisito × (1 + delta/100)

inM / requisito ≥ 1 + delta/100

delta_max = (inM / requisito − 1) × 100
```

**No es una heurística: es el despeje exacto.**

### Comprobado en seis casos que bloqueaban

| Perfil · enlace · delta | Requería | Delta despejado | Con ese delta | |
|---|---:|---:|---:|---|
| P0 · 16 Mbps · 20 % | 18,00 | **6 %** | 15,90 | entra |
| P0 · 17 Mbps · 25 % | 18,75 | **13 %** | 16,95 | entra |
| P1 · 13 Mbps · 15 % | 13,80 | **8 %** | 12,96 | entra |
| P3 · 6 Mbps · 25 % | 6,25 | **19 %** | 5,95 | entra |
| P5 · 1,8 Mbps · 30 % | 1,95 | **19 %** | 1,78 | entra |
| P4 · 3,5 Mbps · 20 % | 3,60 | **16 %** | 3,48 | entra |

## 3 · Qué muestra ahora la UI

> **Bloqueado**: el perfil P0 necesita **18,0 Mbps** para arrancar (suelo 15 Mbps × 1,20) y el enlace mide
> **16,0 Mbps**. Faltan **2,0 Mbps**.
>
> **Dos salidas, elige una:**
> 1. Aplicar delta **6 %** — `[ Aplicar 6% ]`
> 2. Cambiar a perfil **P2** — `[ Cambiar a P2 ]`

**Cuando el delta no puede salvarlo** (el despeje da menos de 1 %):

> 1. Bajar el delta **no sirve**: ni al 1 % el enlace alcanza el suelo de este perfil (necesitaría 15 Mbps).

**Cuando ningún perfil entra:** *«Ningún perfil arranca con X Mbps y delta D %. Sube el enlace o baja el delta
al mínimo.»*

**Los botones aplican de verdad:** `Aplicar` pasa por el `applyDelta(true)` de siempre (guarda en
`localStorage` y sincroniza con el VPS); `Cambiar` fija `activeProfileId`, guarda, refresca las reglas
reactivas y el selector del PM9. La sugerencia se recalcula sola al cambiar el delta.

## 4 · Lo que el test encontró antes que el navegador

`renderSugerencia` lee `inM`, `floorM` y `outM` del resultado de `sugerirAjuste`, y **el objeto no los
llevaba**. En un navegador eso es un `TypeError` en cuanto un perfil bloquea — justo el estado que se reportó.

**Un test con DOM mockeado lo cazó antes del despliegue.**

## 5 · Cómo está probado

`ui-delta-autoajuste.verify.js` usa el **seam que el panel ya tenía** (`__APE_OUTPUT_TEST__`, inerte salvo
que el harness lo active). Fuerza ancho de banda y perfil activo, y **llama a los handlers de los botones y
comprueba el efecto**, no que existan.

Cobertura: bloqueo que el delta resuelve, bloqueo que ningún delta resuelve, bloqueo donde nada cabe, perfil
que arranca sin sostener el techo, y ausencia de medición.

**Y se ejecutó también contra el fichero descargado de producción:** 33 PASS.

```
PASS  P0/16/20: el clic aplica delta 6%
PASS  P0/16/20: TRAS EL CLIC el perfil arranca
PASS  P0/12/10: el clic cambia a P2
PASS  los 6 casos bloqueantes encuentran un delta que hace entrar
RESULTADO: 33 PASS · 0 FAIL
```

## 6 · Lo que NO cambió

- El bloqueo sigue con la **misma condición**: `canStart` contra el suelo.
- El suelo sigue mandando; el techo solo avisa.
- **La salida no se reduce.** El delta baja el margen de **entrada**, nunca la calidad solicitada. Eso es
  literalmente lo que el panel declara: *«La salida NO se reduce: es la que pide la reproducción/imagen; el
  margen se reserva en entrada.»*

## 7 · Lo que NO se verificó

- **No se abrió en un navegador real.** El test valida la lógica y el markup generado con un DOM mockeado; el
  render visual y el clic físico no se ejercitaron.
- **No hay delta mínimo doctrinal documentado.** El código respeta el rango del input (1–90 %) y no baja de 1,
  pero no encontré una regla que fije un suelo de margen. Si debe existir, no está escrita.

---

# Adenda — verificación en navegador real y el bug que sólo ella encontró

**Rondas 2-3.** Se cerró el hueco declarado cuatro veces: nunca se había probado en un navegador de verdad.

## El bug que el DOM mockeado no podía ver

```
FAIL  TRAS EL CLIC el perfil arranca :: {p:"P3", d:15, canStart:false}
```

**El botón Aprobar no hacía nada en un navegador real.** El test mockeado lo daba por bueno.

```js
if (di) di.value = String(delta);   // si el input no existe, no escribe nada
applyDelta(true);                    // applyDelta LEE el delta del DOM → valor viejo
```

**Dependencia de un control que puede no existir todavía.** Si `#ape-delta-input` no está en el DOM, se aplicaba el delta viejo al perfil nuevo.

**Corregido:** `applyDelta(notify, valorExplicito)` recibe el valor por parámetro; sólo lee el DOM si no se le da.

## La suite de navegador

`ui-guard-navegador.verify.js` — sirve un harness y el panel real por loopback, lanza Chrome con
`--remote-debugging-port`, lo maneja por CDP y **pulsa los botones de verdad**.

**Si falta Chrome sale con código 2 (SKIP), no finge un PASS.**

`ape-ui-navegador.yml` corre en cada push que toque el panel:
1. Los 3 suites mockeados (**82 PASS**)
2. La suite de navegador real (**32 PASS**)

## Cobertura en navegador real

| Caso | Verifica |
|---|---|
| Bloqueo P3 · 5,2 Mbps · 15 % | bloquea, requisito 5,75, propone P3 con delta menor |
| **Clic en Aprobar** | **el perfil arranca tras el clic** |
| **Clic en Denegar** | **no cambia perfil ni delta** (bajo bloqueo provocado) |
| **Clic en Forzar** (caso de la captura: P3 · 1,3 Mbps) | marca el flag y **checkGeneration permite generar** |
| **Perfiles conflictivos** | P0 y P1 bloquean con 5,2; P3 y P5 arrancan; **cada uno usa SU suelo del LAB** |

## Cuatro correcciones del CI, y una del código

1. Chrome no estaba en `/usr/bin` → `browser-actions/setup-chrome@v1`
2. Chrome arrancaba sin CDP → `--no-sandbox --disable-dev-shm-usage`
3. Seam cerrado: `APE_OUTPUT_TEST__` sin el prefijo `__` → corregido
4. `localStorage` no cambia la variable en memoria → se fija por `applyDelta`
5. **Bug real del panel** → `applyDelta(notify, valorExplicito)`

## Lo que sigue sin cubrir

- **No cubre la generación completa de una lista desde el navegador.** Verifica el guard y sus botones, no el pipeline entero.
- **No cubre el render visual** (colores, layout). Verifica comportamiento, no estética.
