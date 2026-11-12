# H-1 — el bloqueo, desglosado en dos decisiones separables · 2026-11-12

H-1 se venia describiendo como *"el bucle Canary<->JIT no esta desplegado"*. Eso mezcla dos cosas con riesgos muy distintos. Aqui queda la cadena medida y las dos decisiones que se pueden tomar por separado.

## La cadena real, medida sobre el codigo

```
ape-pulse-canary.timer            OnUnitActiveSec=20s · Unit=ape-pulse-canary.service
  |                               (vps/systemd/ape-pulse-canary.timer)
  v
ape-pulse-canary.service
  |
  v
ape-pulse-canary-worker.sh        L31: si hay un ape-canary@ activo, espera al siguiente tick (un solo slot)
  |                               L59: ape-canaryctl start <id> --source-url <url> --seconds <S>
  v
ape-canary@<id>.service           L13: ExecStartPre=/usr/local/bin/ara-skill check --for-canary
  |                               L14: ExecStart=/usr/local/bin/ape-visual-emulate.sh %i
  v
/usr/local/bin/ape-visual-emulate.sh
  |
  +-- HOY:   _vps_stage/canary/ape-visual-emulate.sh   -> 4.068 B · 0 menciones de jit
  +-- 0001:  vps/bin/ape-visual-emulate.sh             -> 6.714 B · 7 menciones de jit
```

**Lo unico que invoca ese script es `ape-canary@<id>.service`.** En todo el repositorio no hay otra referencia de ejecucion; el resto de apariciones son install.sh, el manifiesto, la fixture del contrato y el informe FASE01.

## Decision 1 — anadir la fila al manifiesto (parche `0001`)

**Riesgo ahora: NULO.** El timer esta `inactive` (medido: `MOTOR_ARRIBA ... timer=inactive`, corrida `43176002787`). Sin timer no corre el worker, sin worker no se instancia `ape-canary@`, sin instancia nadie ejecuta el script. El parche solo cambia **que fichero** queda en `/usr/local/bin/`.

**Efecto latente:** deja el bucle **armado**. Hoy, si alguien arrancara el timer, correria la copia de 4.068 B: un canary que **no** habla con el JIT. Con 0001, correria la de 6.714 B: un canary que **si** le pide trabajo al motor.

## Decision 2 — arrancar `ape-pulse-canary.timer`

**Riesgo: ALTO y ya materializado una vez.** Con el timer activo, cada 20 s el worker puede lanzar una sesion; cada sesion ejecuta la receta Canary completa. La cifra medida de esa receta es **0,1828 fps** (30 fotogramas en 164,1 s) frente a 25 fps de fuente: **~137x mas lenta que tiempo real**. En el VPS de 3 vCPU eso significa que una sesion no termina antes del siguiente tick, y el worker **espera** al haber un `ape-canary@` activo (L31) — o sea que se encola zapping detras de un trabajo que no puede alcanzar el ritmo de la fuente.

Es exactamente el camino del incidente **2026-11-09**: el bucle a 3,37 fps contra 25 fps de fuente y el operador perdio la television.

## Por que esto importa para el encargo

El encargo dice: *"CANARY DEFINE LA CALIDAD. JIT HEREDA Y EJECUTA."* Hoy el motor **no hereda** la receta: tiene la suya y declara `REA_EXECUTED=0`. El unico componente que implementa la herencia es la copia de 6.714 B — y es la que no esta en el manifiesto.

O sea: **H-1 no es un detalle de contabilidad.** Es la pieza que haria real la tesis del prompt. Y su despliegue (fila en el manifiesto) es seguro hoy; lo que no es seguro es **activarlo** con el presupuesto de CPU actual.

## Lo que hace falta para activarlo sin repetir el 2026-11-09

No es una decision binaria. Cualquiera de estas tres lo haria sostenible:

1. **Aceptar que el bucle corre a 0,18 fps**: sirve como medicion de calidad offline, no como camino de reproduccion. El canary ya no alimenta al player.
2. **Dar capacidad**: el techo medido es 3 vCPU; el encargo contempla arquitecturas de aceleracion alternativas.
3. **Adelgazar la receta** para una variante de bucle con menos etapas, midiendo el A/B — el prompt lo exige: *"No modifiques el orden ni los valores de esta receta de referencia sin producir una prueba A/B comparable."*

Ninguna de las tres esta decidida. Por eso H-1 sigue abierto: **no por falta de codigo, sino porque activarlo exige elegir cual de las tres.**

## Estado del codigo

`docs/canary/fixes/0001-manifest-row.patch` existe, `git apply --check` sale 0, y **no esta aplicado** (`aplicado: false`). Aplicarlo es una linea y no toca produccion: el siguiente deploy instalaria el fichero correcto.
