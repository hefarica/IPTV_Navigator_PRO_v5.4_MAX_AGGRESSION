# Idempotencia medida — segunda instalacion identica · 2026-11-12

**Prueba:** ejecutar el mismo deploy dos veces sobre el mismo estado (§12 IDEMPOTENTE · §14 P14).

| | Corrida 1 | Corrida 2 |
|---|---|---|
| run | `43170688357` | `43173128335` |
| commit | `34b78e84` | `8477f3f2` |
| resultado | success | **success** |
| backup stamp | `20261112T065023Z` | nuevo stamp (esperado) |

El commit cambia entre corridas solo por documentacion; **el contenido que el manifiesto instala es byte-identico**: mismo `manifest.tsv` (`5f5adcf1...`), 33 filas, 33 origenes presentes en local.

## Lo que la segunda pasada reporto

```
Sin cambios de ficheros (33/33 filas); continuo con /sync, reload y verify.
NO-STAGED   /etc/nginx/lua/ape_gateway.lua (sin cambios: no se toca)
... (todas las lua)
paridad completa: 33/33 ficheros repo == remoto
RESUMEN SYNC SMOKE: 11/11 OK · 0 FAIL
MOTOR_ARRIBA estado=active listeners=1 health=200 sha=290b1103... timer=inactive
```

## Huellas comparadas antes / despues

| Huella | Antes (02:08:37-05:00) | Despues | Igual |
|---|---|---|---|
| `/jit/health` | 200 · `{"ok":true,"active":null,"pid":null,"uptime_s":0}` | 200 · mismo cuerpo | **si** |
| `/jit/meta/1.json` | 200 · **817 bytes** | 200 · **817 bytes** | **si** |
| paridad repo↔VPS | 33/33 | 33/33 | **si** |
| sync-smoke | 11/11 | 11/11 | **si** |
| sha del motor en el VPS | `290b1103...` | `290b1103...` | **si** |
| servicio | active · :3099=1 · health 200 | active · :3099=1 · health 200 | **si** |

**No se duplicaron ficheros, ni servicios, ni procesos.** El instalador detecto por si mismo que no habia nada que cambiar y lo dijo.

## La clausula que NO queda probada

`P14` tiene dos partes: *"Repetir la operacion no duplica ni corrompe estado"* y *"ninguna lectura (GET) provoca mutacion"*.

- **Primera: VERIFICADA** con las seis huellas de arriba.
- **Segunda: PARCIAL.** Lo probado es que el GET concreto que **mataba el proceso** (`/jit/meta/<id valido>`) ahora devuelve 200 y el proceso sigue vivo — antes: ECONNRESET y proceso muerto; ahora: 200 y `exitCode` intacto. Eso demuestra que **ese** GET no muta. **No** se ha barrido el resto de rutas GET del motor, asi que "ninguna lectura" sigue sin ser universal.

Declararlo VERIFIED entero seria cambiar el criterio para que quepa la evidencia. Se queda en PARTIALLY con la separacion escrita.

## Nota sobre el reinicio

El job `4b` reinicia `ape-jit` en cada deploy. Un reinicio **no es idempotente por naturaleza** (vuelve a arrancar el proceso), pero **no altera el estado**: mismo binario, mismo sha, mismo listener, misma respuesta. Se declara para que nadie lo lea como un cambio del instalador.
