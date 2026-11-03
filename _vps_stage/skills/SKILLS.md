# ARA · SKILLS VPS (FASE 0)

Gate de habilidades para las operaciones del VPS. **No** sustituye al contrato ARA-X ni a la
doctrina de producción: el VPS sigue siendo **metadata-only** (sin transcode en producción).
Este corpus sólo habilita el **canary aislado** FASE 1.

## Reglas

1. **Gate obligatorio**: `ape-canary@` y `ape-canaryctl start` ejecutan
   `ara-skill check --for-canary`. Si falla, el canary **no arranca**.
2. **Aislamiento**: el canary procesa **UN** canal y escribe en `/var/lib/ara/canary/<id>/`.
   No modifica `/lists/`, ni `/sync`, ni `/ara`, ni el catálogo global.
3. **Límites reales**: SoC S905X4 sin NPU; 8K sólo presentación; el canary no declara 8K.
   CPUQuota=40 %, MemoryMax=1G, RuntimeMaxSec=300 s.
4. **Honestidad**: si falta ffmpeg/libx265 o no se sostiene 4K/40 %, se declara FAIL con
   evidencia. No se finge un canary.
5. **Rollback**: `ape-canaryctl rollback <id>` detiene el servicio, limpia la salida y verifica
   que el canal sigue sirviendo su manifest original (sólo lectura).

## Corpus

- `corpus/vps-visual-emulate.md` — orden de filtros y límites del canary.
- `corpus/canary-isolation.md` — aislamiento, gate y rollback.
- `corpus/s905x4-limits.md` — límites reales del device/VPS y 8K presentación.

## Comprobación

```bash
ara-skill check            # corpus + binarios base
ara-skill check --for-canary
ara-skill status
```
