# El gate anti-degradación estaba rojo por castigar la documentación · 2026-11-13

**Severidad: MEDIA (gate) + ALTA (el hallazgo que dejó ver).**

## 1 · El falso positivo

`node tools/check_anti_degradation_policy.js` salía **exit 1**:

```
FAIL sin degradacion NUEVA en el codigo JIT
     · tools/lab/ape-jit/server.js :: stereo_locked 0 -> 3
```

Las tres coincidencias del patrón `/-ac['",\s]+2/` en ese fichero eran **texto que PROHÍBE degradar**:

```
L565 : // NO -ac 2 universal: eso degrada 5.1 a estereo
L998 : '5. NUNCA poner -ac 2 universal: degradaria 5.1 a estereo. audio_mode debe seguir passthrough_safe.'
L3242: reason: 'NO se fuerza -ac 2: eso degradaria 5.1 a estereo'
```

**El gate castigaba al código por documentar la regla.** Un gate rojo por el motivo equivocado es peor que uno verde falso: entrena a ignorarlo, y cuando la degradación sea real nadie mirará.

## 2 · La corrección, y el falso negativo que introdujo

Se exige contexto **negado** en la misma línea para descartar la coincidencia.

**Mi primera versión usaba una ventana de 48 caracteres hacia atrás, y la prueba la cazó:**

```js
// NO -ac 2: eso degrada        ← linea 1
const args = ['-ac', '2'];      ← linea 2, degradacion REAL
const reason = 'NUNCA -ac 2';   ← linea 3
```

Resultado con ventana libre: **0 coincidencias**. El «NO» de la línea 1 suprimía el `-ac 2` real de la línea 2.

> **Un falso negativo es peor que el falso positivo que se venía a corregir: deja el gate ciego a degradación verdadera.**

Corregido acotando la ventana a **la línea del match**. Ahora:

```
RESULT=PASS 10/10
A · degradacion REAL debe seguir contando   (3 casos)
B · texto que PROHIBE degradar no cuenta    (3 casos)
C · fps y downscale siguen contando         (3 casos)
D · 1 real + 2 negados = 1                  (el caso que encontro el bug)
```

Prueba: `tools/quality/test_anti_degradation_gate.js`.

Se añade al gate un modo `--scan=<ruta>` que devuelve los contadores de un fichero sin emitir juicio — existe para poder probar el gate, no para saltárselo.

## 3 · Lo que el gate ahora deja ver: las copias del VPS degradan audio de verdad

Con el falso positivo fuera, el informe es:

```
[DEGRADA] vps_jit/server.js                         fps_locked=2 stereo_locked=3 downscale_2k=0 scale_small=2 audio_passthrough=0
[DEGRADA] IPTV_v5.4.../vps/ape-jit/server.js        fps_locked=2 stereo_locked=3 downscale_2k=2 scale_small=2 audio_passthrough=0
[CUMPLE]  tools/lab/ape-jit/server.js               fps_locked=0 stereo_locked=0 downscale_2k=0 scale_small=0 audio_passthrough=1
```

Y esas coincidencias **no son documentación**, son código:

```
vps_jit/server.js
L220: ? (audioOk ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an'])
L222: ? (audioOk ? ['-c:a', 'aac', '-b:a', '256k', '-ac', '2'] : ['-an'])
L223: : (audioOk ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an'])

ramas -c:a copy: 0
```

**Todas las ramas fuerzan estéreo cuando hay audio, y quitan el audio entero (`-an`) cuando no.** No existe ninguna rama de copia.

Contra la ley: *«canales de audio reducidos»* está prohibido. Un 5.1 se entrega como 2.0, y un fallo de audio se resuelve **eliminando el audio** en vez de fallar.

**El motor vivo (`tools/lab`) sí cumple** (`audio_passthrough=1`, `stereo_locked=0`) — el problema está en las **dos copias desplegables** de `vps/`.

## 4 · Por qué esto no lo arreglo yo

Son las copias que un deploy instalaría. Cambiar los argumentos de ffmpeg ahí es un cambio de comportamiento en producción, necesita su A/B (¿el origen sirve 5.1 real?) y su autorización. Las tres líneas afectadas están localizadas y citadas.

Queda como **D-6** en el brief de decisiones.

## 5 · Lo que este episodio enseña sobre los gates

Un gate estático por regex no distingue *«hacer X»* de *«escribir que no se haga X»*. Cualquier patrón que busque una construcción prohibida va a tropezar con los comentarios que la explican, y el reflejo natural es relajar el patrón — que es exactamente cómo un gate se vuelve decorativo.

Lo que se hizo en su lugar: **exigir contexto negado, acotado a la línea, y probar que la degradación real sigue disparando**. La prueba no es un adorno: encontró un falso negativo en el propio arreglo antes de que llegara a `master`.
