# Canary — aislamiento, gate y rollback

## Aislamiento

| Recurso | Canary | Producción |
|---|---|---|
| Entrada | **UN** canal (primera URL de una lista local, sin modificarla) | 10.631 canales |
| Salida | `/var/lib/ara/canary/<id>/` | `/var/www/lists/` |
| `/lists/` | **sólo lectura** (no se reescribe) | intocable |
| `/sync`, `/ara` auth | **no se tocan** | intocable |
| Servicio | `ape-canary@<id>.service` | nginx/php existentes |

El canary no publica su salida, no cambia la URL del canal y no altera el catálogo global.

## Gate

1. `ara-skill check --for-canary` exige corpus íntegro + ffmpeg/ffprobe/libx265 + systemd.
2. `ape-canary@.service` tiene `ExecStartPre=/usr/local/bin/ara-skill check --for-canary`.
3. `ape-canaryctl start` repite el gate antes de escribir el env/arrancar.
4. Si falta cualquier requisito, **no se arranca** y se reporta `GATE_FAIL`.

## Límites

- `CPUQuota=40%`, `MemoryMax=1G`, `RuntimeMaxSec=300`, `TimeoutStopSec=30`.
- `User=www-data`, `NoNewPrivileges=yes`, `ProtectSystem=strict`,
  `ReadWritePaths=/var/lib/ara/canary`.
- La cuota garantiza CPU ≤40 % de un core; el estado se mide con `cpu.stat` del cgroup.

## Rollback

```bash
ape-canaryctl rollback <id>
```

Detiene el servicio, borra `env`/salida del canary (no toca el canal), verifica con un GET
que el manifest original sigue en 200 y deja constancia. `/lists/` no se reescribe en ningún
paso. Si el GET falla, se reporta `ROLLBACK_SOURCE_FAIL` sin fingir éxito.
