# Re-pin del motor tras cerrar el DoS de `/meta` — 2026-11-12

**Rama:** `fix/engine-tdz-dos-20261112` (local, **no empujada**, **no desplegada**)
**Base:** `472f7cc3` · **Motor:** `tools/lab/ape-jit/server.js`

## Qué se hizo

1. Aplicados `0004-engine-tdz-dos.patch` y `0004b-engine-nice-fallback.patch`. Juntos y no por separado: los dos mueven el `sha256` que el contrato pina, así que aplicarlos sueltos obligaría a re-pinear dos veces.
2. `node -c` → **exit 0**.
3. Re-pin de los **4 sitios load-bearing**.
4. Gates: contrato **92/92 PASS** y bucle REA **HEALTHY**.

## El cambio, medido

| | Antes | Después |
|---|---|---|
| bytes | 447.943 | **449.392** |
| sha256 | `28352c508285b1eedfc889e5df40855e6e2c71207d7c806288ac8457de36ff67` | `290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492` |
| diff | — | 1 fichero · **+27 / −5** |

El sha nuevo **coincide exactamente** con el que `docs/canary/fixes/04_engine_dos/README.md` había predicho antes de aplicar nada. Dos cálculos independientes, mismo valor.

## Los 4 sitios que se actualizaron

| Fichero | Línea | Campo |
|---|---|---|
| `contracts/canary_jit_contract_v1.json` | 310 | `engine.deployable_engine_sha256` |
| `contracts/canary_jit_contract_v1.json` | 317 | `engine.candidates[0].bytes` → `449392` |
| `contracts/canary_jit_contract_v1.json` | 318 | `engine.candidates[0].sha256` |
| `tools/quality/test_canary_jit_contract.js` | 645, 672 | fixtures `base` (recibos válidos simulados) |

Los fixtures **tenían que** cambiar: el validador compara `engine_sha256` contra `contract.engine.deployable_engine_sha256` (`:368`) y rechaza con `E_ENGINE_SHA_UNVERIFIED` cualquier discrepancia. Dejar los fixtures con el sha viejo habría puesto en rojo los 5 casos de aceptación.

## Los 17 sitios que NO se tocaron, a propósito

`t36` recomendaba «volver a congelar las cifras en los 11 ficheros, informes incluidos». **No se hizo, y es deliberado.** Los ficheros que quedan con `28352c50…` son **informes de auditoría fechados** (`JIT_TRUTH`, `JIT_HTTP_PROBES`, `CANARY_TRUTH`, `VEREDICTO`, `ADVERSARIAL`, `ACCEPTANCE_MATRIX`, `14_CANARY_FINAL_REPORT`, el recibo `12_CANARY_DEPLOYMENT_RECEIPT.json`, el manifiesto del contrato y el `VPS_AUDIT_20261112`).

Esos documentos dicen, con fecha, **qué binario se auditó**. Reescribirles el hash haría que afirmaran haber auditado código que no existía cuando se escribieron: sería falsificar el registro para que cuadre con el presente. Este documento es la superación: a partir de `472f7cc3` el motor es `290b1103…`; antes de eso, todo lo fechado habla del `28352c50…` y sigue siendo cierto sobre lo que midió.

## La prueba de que el DoS está cerrado (independiente, no heredada)

Motor parcheado copiado a `%TEMP%`, catálogo de 2 ids, `PORT=3199 BIND=127.0.0.1`:

| Petición | Antes del parche | Con el parche |
|---|---|---|
| `GET /meta/1.json` | ECONNRESET · 0 bytes · proceso muerto | **200 · 799 bytes** |
| proceso tras la petición | muerto (`exit 1`) | **vivo** |
| `GET /health` después | ECONNREFUSED | **200 · 49 bytes** |
| `GET /meta/999999.json` | 404 y sobrevive | **404 y sobrevive** |
| stderr | `ReferenceError: Cannot access 'CAPACITY_FPS' before initialization` | **vacío** |

Limpieza verificada: 0 sockets en LISTEN sobre 3199, temporales borrados, ningún proceso residual.

## Gates

```
node tools/quality/test_canary_jit_contract.js
  fixtures: 55/55 PASS · coherencia 27/27 · load-bearing 10/10
  total: 92/92 | fallos: 0 | RESULT=PASS   EXIT=0

node tools/canary/rea_loop.js
  G1 KNOWN_PREEXISTING · G2 PASS · G3 PASS · G4 PASS · G5 PASS · G6 PASS
  result=HEALTHY   EXIT=0
```

## Lo que esto NO prueba

- **Que el motor desplegado sea este.** El VPS sigue con `/opt/ape-jit/server.js` de **415.037 B** (`242c0cda8b39…`, 2026-11-09 08:34:50), el binario que el informe del incidente señala como causa del corte. Su sha no aparece en el manifiesto.
- **Que el servicio esté arriba.** `ape-jit.service` sigue `inactive dead`; nada escucha en `:3099`.
- **Ninguna calidad de imagen.** No hay dispositivo conectado (`adb devices` vacío) ni canal reproducido. §14 permanece en **0 VERIFIED**.
- **Que el parche esté desplegado.** No hubo push, ni deploy, ni `systemctl restart`.

## Reversión

```powershell
git apply -R docs/canary/fixes/04_engine_dos/0004b-engine-nice-fallback.patch
git apply -R docs/canary/fixes/04_engine_dos/0004-engine-tdz-dos.patch
# más revertir el re-pin en los 4 sitios (contrato :310/:317/:318 y fixtures :645/:672)
```

O `git switch audit/rea-alignment-20261108` y borrar la rama: el árbol vuelve a `472f7cc3` con el motor en `28352c50…`.
