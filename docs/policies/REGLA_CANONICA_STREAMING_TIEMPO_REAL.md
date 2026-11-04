# La Regla Canónica del Streaming en Tiempo Real

**Documento normativo.** Aplica a cualquier implementación de streaming en este repositorio y a cualquier sistema donde un componente declara algo sobre una fuente que no controla.

---

## LA REGLA

> ## Ningún consumidor se escribe antes de que su productor haya producido una vez.

**En una línea:** si el canary nunca escribió un `status.json`, el resolve que lo lee no se escribe. No se diseña, no se despliega, no se prueba en producción.

---

## Los cinco corolarios

### 1 · Un componente que nunca ejecutó no es un componente: es una intención

`/etc/ara/canary/` vacío no significa "listo para arrancar". Significa **que no arrancó**. Un unit `disabled` sin instancia no es un servicio en espera: es un servicio que no existe en runtime.

**Verificación:** el productor debe tener al menos una salida real en disco, con fecha, antes de que se escriba una línea del consumidor.

### 2 · Un código de estado esperado no es una confirmación

`302` en un endpoint que debía devolver `200` **no es éxito: es el fallback funcionando.** Un `302` dice «no pude medir, ve directo a la fuente». Confundirlo con funcionamiento fue el error que produjo tres deploys rotos seguidos.

**Verificación:** el contrato debe declarar **qué código es éxito y qué código es fallback**, y el test debe afirmar el código correcto, no «respondió algo».

### 3 · Sólo se declara lo que es físicamente posible

| Afirmación | ¿Es cierta? |
|---|---|
| `206` sobre un manifiesto generado al vuelo | **No.** No hay fichero que trocear. El 206 sólo existe sobre ficheros con `Range` |
| `200` sobre un manifiesto dinámico | **Sí.** Siempre |
| `302` cuando el productor no mide | **Sí.** Y es la respuesta honesta |

**Verificación:** cada código emitido debe corresponder a un mecanismo real del servidor, no a lo que el diseño imaginó.

### 4 · El dato medido manda sobre el dato declarado

Si el canary midió 1080p, el cartucho declara 1080p aunque el catálogo diga 4K. Si no midió nada, **no se declara nada**: se redirige.

**Verificación:** el valor que viaja al player debe poder rastrearse hasta una medición con fecha, o hasta un fallback explícitamente etiquetado como tal.

### 5 · Un fichero nuevo no se despliega: se ejecuta

`php -l` valida sintaxis. **No valida orden de constantes, ni scope de variables, ni que el fichero haga algo.** Un error de runtime pasa el lint y rompe producción.

**Verificación:** todo fichero nuevo se ejecuta contra un caso real **antes** de tocar el servidor que lo sirve.

---

## Por qué esta regla existe

Nace de un fallo concreto y medido en este repositorio (2026-11-04):

| # | Qué pasó | Qué violaba |
|---|---|---|
| 1 | Se escribió un endpoint de 435 líneas que consume el canary, **sin que el canary hubiera corrido nunca** | Regla 1 |
| 2 | Devolvió `302`. Se interpretó como éxito. **Era el fallback.** | Regla 2 |
| 3 | Se prometió `206` sobre un manifiesto generado. **Imposible.** | Regla 3 |
| 4 | Se desplegaron tres versiones más sin ejecutar ninguna. Terminó en `500` | Regla 5 |
| 5 | El `500` se propagó al endpoint que antes funcionaba | Regla 5 |

**El coste:** cuatro deploys, un revert completo, y un endpoint de producción caído durante la ventana.

**La causa no fue falta de código. Fue escribir el consumidor antes que el productor.**

---

## Checklist de la Regla

Antes de escribir **cualquier** consumidor, en este orden:

```
[ ] 1  El productor existe como ejecutable  →  test -x
[ ] 2  El productor tiene su configuración  →  el fichero de entorno, no "se creará"
[ ] 3  El productor ha corrido UNA vez      →  hay salida con fecha en disco
[ ] 4  La salida tiene la forma esperada    →  cat del fichero, campos presentes
[ ] 5  El consumidor se prueba contra ESA   →  no contra una inventada
[ ] 6  Recién entonces se despliega
```

**Si falla el paso 3, no se salta al 5. Se arregla el 3.**

---

## Cómo se aplica al Canary-Resolve

**El canary PREVALECE.** Es el productor, y sin él no hay dato. El resolve es su consumidor y no tiene autoridad para inventar lo que el canary no midió.

```
CANARY (productor)                    RESOLVE (consumidor)
  ape-visual-emulate.sh                 canary-resolve.php
  ├─ mide 6 s de la fuente real         ├─ lee status.json
  ├─ escribe status.json                ├─ elige perfil con lo MEDIDO
  └─ one-shot por invocación            └─ declara o redirige
```

**Estado actual medido:** el productor existe, **pero nunca ha corrido**. Por la Regla 1, el consumidor **no se escribe todavía**.

**Lo que desbloquea:** un `<id>.env` con una URL real y una ejecución manual del canary que produzca `status.json`. Ver `_vps_stage/canary/env.template`.

---

## La arquitectura one-shot por zapping

Cada cambio de canal es **una invocación independiente**, no un proceso permanente. No hay daemon, no hay puerto 9000, no hay estado en memoria que se pueda corromper.

```
zapping (player pide un canal)
   │
   ├─ ¿hay status.json fresco para (canal, device)?   [TTL 300 s]
   │     SÍ  → usar lo medido                      (coste: 1 lectura de disco)
   │     NO  → ape-canaryctl start r<hash> --source-url <u> --seconds 6
   │            (systemd one-shot: RuntimeMaxSec=300, Restart=no, CPUQuota=40%)
   │            → status.json
   │            → cachear
   │
   ├─ perfil = min(techo del DEVICE, resolución MEDIDA)
   │
   ├─ cartucho = lo medido + los 186 tags de paridad + los 18 del paquete
   │
   └─ responder:
        200  manifiesto con datos reales
        302  el canary no pudo medir  (fallback honesto, NO éxito)
```

**Por qué one-shot y no daemon:** un proceso permanente con estado es el que se cuelga, el que pierde memoria, el que hay que vigilar. Un one-shot que falla **falla limpio** y el `302` lo dice. La resiliencia está en el reintento por zapping, no en mantener un proceso vivo a la fuerza.

**Por qué no Redis:** no está instalado, y para este volumen un `file_put_contents` con `LOCK_EX` sobre `/var/cache/ara/resolve/` es suficiente. Añadir una dependencia sin necesidad es deuda, no arquitectura.

---

## Lo que este documento NO afirma

- **No afirma que el canary funcione.** Nunca ha corrido. Su primera ejecución es la prueba.
- **No afirma que `ape-visual-emulate.sh` produzca los campos que el resolve espera.** Eso se verifica en el paso 4 del checklist, no se asume.
- **No afirma nada sobre CPU/RAM reales** del canary con 3 vCPU y `CPUQuota=40%`.
- **No despliega nada.** Es normativo, no ejecutable.
