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

## 3.b · Alcance real: dos ficheros huérfanos, y NO todo `vps/` (cuadro definitivo)

**El manifiesto tiene 33 filas** (no 60: las líneas `#` de comentario no son filas). **Las 33 fuentes existen**, ninguna falta. Y de ellas, **6 sí apuntan a `vps/`** — entre ellas `vps/prisma/api/pulse.php`, que es el endpoint que se midió sirviendo `/pulse/`.

Por tanto **`vps/` no es una carpeta huérfana**: 6 de sus ficheros son los desplegados. Retirar `vps/` entero rompería seis ficheros vivos.

La copia del motor, en cambio, **no está en el manifiesto**:

| Fichero | ¿En el manifiesto? | Bytes | SHA-256 |
|---|---|---|---|
| **`tools/lab/ape-jit/server.js`** | **SÍ → `/opt/ape-jit/server.js`** | **449.392** | **`290b1103…`** (el pinado del contrato) |
| `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` | no | 45.535 | `8405f784…` |
| `vps_jit/server.js` | no | 29.624 | `e400fa19…` |

**No son versiones divergentes del mismo programa: son programas distintos.** 10× y 15× más pequeños que el desplegado — no tienen el guard de capacidad, ni el reconciliador, ni el resto del motor real.

Los tres hashes son distintos entre sí. El único que coincide con lo que el contrato pina (`290b1103…`) es el que el manifiesto instala.

### Conclusión de severidad

| | |
|---|---|
| **Riesgo vivo de degradación de audio** | **CERO.** Lo desplegado es `tools/lab`, que hace passthrough (`audio_passthrough=1`, `stereo_locked=0`) |
| **Riesgo latente** | **Dos ficheros muertos que degradan audio**, y `vps/ape-jit/server.js` está donde alguien buscaría «el server.js del VPS» |
| **Riesgo añadido** | Los dos huérfanos **no son versiones del motor**: son otro programa. Quien los lea para entender el sistema, lee código que no se ejecuta |

## 4 · Qué hay que hacer, y por qué no lo hago yo

**Solo dos ficheros, no la carpeta:**

```
retirar o marcar no-desplegable:  IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js
                                  vps_jit/server.js
NO tocar:                         vps/prisma/, vps/bin/  ← 6 filas del manifiesto, desplegadas
```

Elimina la trampa sin tocar ffmpeg y sin romper nada instalado. Alternativa equivalente: corregir las tres líneas con `-c:a copy` y su A/B.

**Ninguna de las dos la ejecuto yo:** son ficheros que un deploy podría instalar, y retirar código —aunque sea huérfano— es irreversible sin tu visto bueno. Queda como **D-6**.

## 4.b · Cómo cambió esta recomendación, y por qué

Tres precisiones sucesivas, cada una corrigiendo a la anterior:

1. «La APK degrada audio» → falso positivo del gate: eran comentarios.
2. «Las dos copias **desplegables** degradan audio» → falso: el manifiesto instala `tools/lab`.
3. «Retirar las copias de `vps/`» → falso: **6 filas del manifiesto sí son de `vps/`**.

El patrón del error es el mismo las tres veces: **generalizar de un fichero a una carpeta.** El gate lo hizo (de un patrón a un fichero), yo lo hice (de un fichero a `vps/`).

Lo que detuvo cada error fue contar y hashear en vez de razonar por analogía.

## 5 · Lo que este episodio enseña sobre los gates

Un gate estático por regex no distingue *«hacer X»* de *«escribir que no se haga X»*. Cualquier patrón que busque una construcción prohibida va a tropezar con los comentarios que la explican, y el reflejo natural es relajar el patrón — que es exactamente cómo un gate se vuelve decorativo.

Lo que se hizo en su lugar: **exigir contexto negado, acotado a la línea, y probar que la degradación real sigue disparando**. La prueba no es un adorno: encontró un falso negativo en el propio arreglo antes de que llegara a `master`.

---

## 5 · ¿Y hoy se pierde audio? Medido: no. Pero el código está mal igual

La ley prohíbe «canales de audio reducidos». Las copias huérfanas hacen `-ac 2`. **Pero `-ac 2` sobre una fuente de 2 canales no reduce nada.**

Medido con `ffprobe` sobre los mismos 7 flujos servidos:

| Canal | Canales | Layout | Códec |
|---|---|---|---|
| `AR\| BEIN SPORTS NEWS FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS NBA FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS 03 FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS 04 FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS 05 FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS 06 FHD` | 2 | stereo | aac |
| `AR\| BEIN SPORTS 07 FHD` | 2 | stereo | aac |

**Siete de siete estéreo. Cero con más de dos canales.**

Por tanto, con estas fuentes, **el `-ac 2` no quita nada**: es un no-op sobre 2.0.

### Lo que sí sigue siendo cierto

El código **fuerza estéreo sin condición y no tiene rama de copia** (`ramas -c:a copy: 0`). Eso significa:

- **Ante una fuente 5.1, la degradaría.** No he encontrado ninguna en esta muestra, pero la muestra es un bloque de un proveedor; **no es un censo**.
- Y hay una segunda rama que **sí** quita audio: `: ['-an']` cuando `audioOk` es falso. Eso convierte un fallo de audio en ausencia de audio en vez de en un fallo visible.

**Conclusión de severidad, cuarta y última precisión de este hilo:**

| Afirmación | Estado |
|---|---|
| «La APK degrada audio» | **FALSO** — el gate contaba comentarios |
| «Las copias desplegadas degradan audio» | **FALSO** — el manifiesto instala `tools/lab` |
| «Hay que retirar `vps/`» | **FALSO** — 6 filas del manifiesto son de `vps/` |
| «Hoy se pierde audio en producción» | **FALSO** — las fuentes medidas son 2.0 y lo desplegado hace passthrough |
| **«Las copias huérfanas tienen un downmix fijo y una rama que borra el audio»** | **CIERTO** — el riesgo es condicional al futuro, no una pérdida actual |

Lo que queda de D-6 no es una pérdida medida: es **código que perdería audio si la fuente lo tuviera**, en dos ficheros que no se despliegan. Eso rebaja la urgencia sin hacerlo desaparecer: un `-ac 2` fijo y un `-an` de reserva son la clase de cosa que un día muerde.
