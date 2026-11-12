# Pipeline de deploy en VERDE — 2026-11-12T06:50Z

**Corrida:** `43170688357` · `mode=deploy` · `ref=deploy/engine-restart-20261112` @ `34b78e84`
**Resultado:** **success** — primera corrida completamente verde de toda la sesion.

| Job | Resultado | Recibo |
|---|---|---|
| 1 · inventory | success | — |
| 2 · preflight + dry-run | success | — |
| 3 · validate | success | — |
| **4 · deploy** | **success** | backup stamp `20261112T065023Z` |
| **5 · verify** | **success** | `paridad completa: 33/33 ficheros repo == remoto` · `RESUMEN SYNC SMOKE: 11/11 OK · 0 FAIL` |
| **4b · reiniciar ape-jit** | **success** | `MOTOR_ARRIBA estado=active listeners=1 health=200 sha=290b1103... timer=inactive` |
| 6 · rollback | **skipped** | correcto: no habia nada que revertir |

**Verificacion externa independiente:** `/jit/health` 200 · `/jit/meta/1.json` 200.

## La cadena causal del fallo, y donde se corto

El `4 · deploy` llevaba fallando desde antes de esta sesion. La causa **medida** no era
falta de credenciales:

```
FAIL /lists/APE_LISTA_1793589060441.m3u8: HTTP 404 (esperado 200)
RESUMEN SYNC SMOKE: 4/5 OK · 1 FAIL -> verify.sh exit 4 -> deploy.sh exit 9
```

`sync-smoke.js` probaba una lista **retirada**. Los dos SKIP (`SYNC_KEY`, `SYNC_TOKEN`)
no cuentan: solo `record()` entra en `results`. El deploy se caia por un 404 de fixture.

Y el "arreglo" del 2026-11-03 no arreglaba nada: su comentario decia *"se descubre la lista
viva desde el indice del servidor"* y ese descubrimiento **no existia** en el codigo
(`env || nombre fijo`). Tercera aparicion del mismo defecto, tras `gate_matrix.js` y
`verify.sh`.

**Arreglo aplicado:** `verify.sh:61` ya descubre la lista viva en disco; ahora la pasa por
`SYNC_LIVE_LIST` y `sync-smoke.js` la usa. Si no llega ninguna, declara SKIP con su razon
en vez de fallar por un nombre que nadie comprobo que exista.

## Estado tras el despliegue

| | Valor |
|---|---|
| `/opt/ape-jit/server.js` | 449.392 B · `290b11030f3b...` = el pineado por el contrato |
| `ape-jit.service` | `active` |
| listener `:3099` | 1 |
| `/health` | 200 (interno y publico) |
| `ape-pulse-canary.timer` | `inactive` — detenido a proposito (guardia del incidente 2026-11-09) |
| ficheros del manifiesto | 33/33 con paridad |
| backup | `20261112T065023Z` |

## Lo que sigue sin acreditarse

- **Calidad de imagen, reproductores, dispositivo**: `adb devices` vacio. §14 sigue en
  **2 de 17 VERIFIED** (P09 listas, P16 VPS). Un deploy verde no es una imagen validada.
- **El bucle Canary<->JIT**: sigue sin fila en el manifiesto (`loop_artifact.manifest_rows = 0`).
- **La comprobacion HMAC 200 y `/ara/events`**: los dos SKIP siguen. Activar el primero
  exige pasar `ARA_SYNC_VERIFY_KEY` al job de deploy — no se hizo aqui porque puede
  introducir un fallo nuevo y merece su propia decision.

## Reversion

```
# volver al estado anterior al deploy
bash _vps_stage/deploy/rollback.sh 20261112T065023Z --yes
# volver a arrancar el timer del canary
sudo systemctl start ape-pulse-canary.timer
```
