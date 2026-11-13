# Recibo: la ley anti-degradación se ejecuta en CI · 2026-11-13

**Qué afirma este documento:** que el gate de la ley innegociable corre en cada push que toca lo que vigila, y que **se ejecutó de verdad** con su propia prueba.

## El recibo

```
run id      43362831699
commit      76d0fa1a
rama        deploy/engine-restart-20261112
evento      push
job         tests -> success
url         https://github.com/hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/actions/runs/43362831699
```

Steps del job, en orden:

```
success  Set up job
success  actions/checkout@v4
success  actions/setup-python@v5
success  actions/setup-node@v4
success  Python bridge / health / metadata tests
success  Node URL-GUARD / LAB / audio gates
success  Gate anti-degradacion (ley innegociable) + su propia prueba   <-- NUEVO
success  Contrato Canary-JIT (motor desplegado == lo pinado)           <-- NUEVO
success  Complete job
```

**Los dos steps nuevos aparecen, ejecutados y en verde.** No es que el workflow exista: es que corrió.

## ⚠️ Qué significa «verde», y qué NO significa

Un CI verde aquí **no dice que no haya degradación**. Dice que **no apareció ninguna nueva** respecto a la línea base.

El gate es un **trinquete**: compara contra `contracts/anti_degradation_jit_baseline.json` y solo falla si un contador **sube**. Hoy el informe sigue mostrando:

```
[DEGRADA] vps_jit/server.js                         stereo_locked=3 audio_passthrough=0
[DEGRADA] IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/...  stereo_locked=3 audio_passthrough=0
[CUMPLE]  tools/lab/ape-jit/server.js               stereo_locked=0 audio_passthrough=1
```

Esas dos filas **están degradadas y el job pasa igual**, porque ya estaban en la línea base cuando se midió (2026-11-08). Están ahí para que no desaparezcan del radar, pero **no bloquean**.

**Consecuencia práctica:** si alguien lee «CI verde» como «el sistema cumple la ley», se equivoca. Lo que está verificado es que **no empeora**. Lo que sigue pendiente es **mejorarlo** (D-6).

Es la misma trampa que el resto de la sesión: *«exit 0» no es «el evento ocurrió»*. Aquí: *«job success» no es «sin degradación»*.

## Lo que se corrigió para llegar aquí

1. **El gate estaba rojo por un falso positivo:** contaba como degradación los comentarios que **prohíben** degradar (`// NO -ac 2…`). Corregido exigiendo contexto negado en la misma línea.
2. **La prueba del gate encontró un falso negativo en su propio arreglo:** un `-ac 2` real quedaba suprimido por el «NO» de la línea anterior. Corregido acotando la ventana a la línea del match.
3. **Ningún workflow ejecutaba el gate.** Añadido a `ape-bridge-tests.yml`.
4. **Faltaban los paths que el gate vigila:** `tools/lab/ape-jit/**`, `vps_jit/**`, `contracts/anti_degradation_contract.json`, `AGENTS.md`, las tres leyes y `tools/quality/test_*.js`. Cambiar el motor no ejecutaba el gate que vigila el motor.

## Cómo verificarlo uno mismo

```bash
# los mismos comandos que corre el CI, en el mismo orden
node tools/quality/test_anti_degradation_gate.js   # 10/10
node tools/check_anti_degradation_policy.js        # 8/8
node tools/check_crystal_4k_law.js                 # 5/5
node tools/check_crystal_6k_law.js                 # 6/6
node tools/quality/test_canary_jit_contract.js     # PASS

# y el recibo del propio CI
gh run view 43362831699 --log
```

La prueba va **antes** del gate a propósito: si la prueba falla, el gate no es fiable y el job debe parar antes de creerle.

---

## Anexo · ¿era un caso aislado o un patrón? Comprobado: aislado

Después de encontrar que el gate anti-degradación no lo ejecutaba nadie, la pregunta obligada era si el resto estaba igual. Enumerados **todos** los `tools/check_*.js` y buscando **invocaciones reales** (`node tools/<gate>.js`), no menciones:

| Gate | ¿Invocado? | Dónde |
|---|---|---|
| `check_anti_degradation_policy.js` | **SÍ** | `ape-bridge-tests.yml:L72` ← el que faltaba, añadido hoy |
| `check_audio_safe_policy.js` | SÍ | `ape-bridge-tests.yml:L59` |
| `check_omega_directives.js` | SÍ | `ape-bridge-tests.yml:L60` |
| `check_crystal_4k_law.js` | SÍ | `ape-bridge-tests.yml:L74` |
| `check_crystal_6k_law.js` | SÍ | `ape-bridge-tests.yml:L75` |
| `check_app_continuity_wiring.js` | SÍ | `streaming-continuity.yml:L34` |
| `check_streaming_continuity.js` | SÍ | `streaming-continuity.yml:L40` |
| `check_single_assignment.js` | SÍ | `ape-deploy-frontend.yml:L264` (con 2 ficheros como argumento) |

**8 de 8 invocados.** El patrón **no** se repitió: la ley anti-degradación era el único gate huérfano, y quedó cerrado.

Se dice explícitamente porque el hallazgo anterior invitaba a sospechar de todo el sistema de gates, y **la evidencia no lo sostiene**. Lo que sí queda anotado como diferencia de alcance: `check_single_assignment.js` corre sobre dos ficheros concretos, no sobre el árbol — es su diseño, pero su cobertura es la de esos dos.

**Corrección del método:** la primera comprobación que hice usaba coincidencia de subcadena sobre todo el workflow, y eso no distingue *«la ruta `tools/check_*.js` está en el disparador»* de *«el gate se ejecuta»*. Rehecha con el patrón `node tools/<nombre>`, que es la invocación y no la mención.
