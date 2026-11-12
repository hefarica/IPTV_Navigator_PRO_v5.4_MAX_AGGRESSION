# Recibo de despliegue del motor JIT — 2026-11-12

**Hora de la medicion:** 2026-11-12T06:3x UTC (01:3x America/Bogota)
**Rama desplegada:** `deploy/engine-restart-20261112` @ `09922887`
**Corrida que lo logro:** `43168903918` — job `4b · reiniciar ape-jit y probar el motor` = **success**

## El recibo del propio job

```
sha del repo:  290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
sha en el VPS: 290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
MOTOR_INSTALADO sha=290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
--- estado antes: active
--- sha en disco:  290b11030f3b6bf944c14298f3fe8401c0f9bd773789e26afeca8bb9f8aeb492
--- estado despues: active
--- listeners 3099: 1 | /health: 200
MOTOR_ARRIBA estado=active listeners=1 health=200 sha=290b1103... timer=inactive
```

## Verificacion independiente desde internet

| Peticion | Resultado |
|---|---|
| `GET https://iptv-ape.duckdns.org/jit/health` | **200** · `{"ok":true,"active":null,"pid":null,"uptime_s":0}` |
| `GET https://iptv-ape.duckdns.org/jit/meta/1.json` | **200** |
| `GET /lists/APE_LISTA_1794100720046.m3u8` | **200** |

`/jit/meta/1.json` **era la peticion que mataba el proceso**. Hoy responde 200 desde la ruta publica. El DoS de la zona muerta temporal esta cerrado **en produccion**, no solo en loopback.

## Que cambio en el VPS

| | Antes | Ahora |
|---|---|---|
| `/opt/ape-jit/server.js` | 415.037 B · `242c0cda8b39...` (la version del incidente) | **449.392 B · `290b1103...`** |
| `ape-jit.service` | `inactive dead` | **`active`** |
| listener `:3099` | ninguno | **1** |
| `/jit/*` publico | upstream muerto | **200** |
| `ape-pulse-canary.timer` | `active` (cada 20 s) | **`inactive`** (detenido a proposito) |

## El detenido deliberado del timer

`ape-pulse-canary.timer` disparaba cada 20 s y su worker hace POST a `/jit/signal`. Con el motor muerto no hacia nada; con el motor arriba puede pedir trabajo y comerse la CPU — la cadena exacta del 2026-11-09 (3,37 fps del bucle 4K contra 25 fps de fuente; el operador se quedo sin TV). **Se detuvo ANTES de arrancar el motor.** Reversion:

```
sudo systemctl start ape-pulse-canary.timer
```

## Lo que sigue fallando, y no es esto

- `4 · deploy` sale con **failure** porque el `sync-smoke` da 4/5: **faltan `SYNC_KEY` y `SYNC_TOKEN` en el Environment `production`**, y dos casos quedan en SKIP. Con eso `mode=deploy` no puede pasar hoy, con o sin motor.
- `6 · rollback` sale con **failure** porque no hay stamp de la corrida: **se niega a revertir a ciegas**. Es la salvaguarda funcionando, no un fallo.
- `5 · verify` queda **skipped** porque depende de `deploy`. Su fallo en corridas que no despliegan es **paridad repo↔VPS**, no una caida.

## Lo que esto NO acredita

- **Calidad de imagen**: no hay dispositivo (`adb devices` vacio), no hay canal reproducido, no hay VMAF ni A/B. §14 sigue en **0 VERIFIED**.
- **Que `/jit/live/...` sirva video**: solo se probo `/health` y `/meta`; no se arranco ningun transcode a proposito.
- **Paridad visual Canary↔JIT**: la cadena Canary sigue sin ejecutarse a cadencia real.
