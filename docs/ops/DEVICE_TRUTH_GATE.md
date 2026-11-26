# DEVICE TRUTH GATE — contrato del veredicto del device

> **Estado medido:** 2026-11-22T06:41:46Z (= 01:41 local) · `VEREDICTO: SIN_MEDIDA` ·
> `adb.exe: device '192.168.1.3:5555' not found`.

## Qué existe

| Pieza | Dónde | Estado |
|---|---|---|
| Watchdog | `tools/ops/ape-device-watchdog.ps1` | escrito |
| Tarea programada | `APE-Device-Watchdog` | `Ready`, última corrida 22/11 01:37:02, resultado `0` |
| Veredicto | `artifacts/device-truth/LATEST.json` | escrito cada 4–6 min |
| Alerta | `artifacts/device-truth/ALERTA.txt` | presente mientras el veredicto no sea `OK` (desaparece solo al volver a `OK`) |
| Histórico | `artifacts/device-truth/incidentes.log` | append-only |
| **Consumidor** | `tools/ops/check_device_truth.js` | **nuevo** — este documento lo integra |

## Cómo se lee el veredicto (contrato)

```bash
node tools/ops/check_device_truth.js
```

| exit | significado |
|---|---|
| `0` | veredicto `OK`: medido y verde |
| `2` | veredicto `SIN_*`: **no se pudo medir**. No es un sistema sano |
| `1` | `ROTO` / `DEGRADADO`, o `LATEST.json` ausente/ilegible |

`SIN_MEDIDA` nunca se degrada a verde. Ausencia de dato no es cero.

## Por qué NO está cableado al CI

Los runners de GitHub no tienen acceso al device de la LAN. Un gate en CI devolvería
`SIN_MEDIDA` siempre y quedaría como un rojo permanente que nadie lee: eso es peor que
no tener gate. El consumidor se ejecuta **donde vive el device** (esta máquina) o en un
runner self-hosted que sí lo alcance.

## Lo que falta, y no es código

El bloqueante es el transporte al device: `adb` no encuentra `192.168.1.3:5555`.
Causa no medida (device apagado, IP cambiada, `adb tcpip` caído, autorización RSA
perdida). Reintento manual, **no ejecutado** por ningún agente:

```bash
adb connect 192.168.1.3:5555
adb devices
```

Cuando responda, el watchdog vuelve a medir solo y `ALERTA.txt` desaparece cuando el
veredicto sea `OK`.

## Rollback

Nada de esta integración cambia el watchdog ni la tarea programada. Retirar el
consumidor es borrar `tools/ops/check_device_truth.js`; no hay estado que restaurar.
