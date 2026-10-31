# IMPLEMENTATION — ARA continuidad

## I01 — Cursor ledger (G1)

**Estado:** VERIFIED (local; sin deploy al VPS).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_cursor.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_cursor_test.php`

**Contrato:** `/dev/shm/ape_cursor/`; clave `md5(clientIp + '+' + ch_id)`; TTL 300 s; campos `media_sequence`, `segment_uri`, `byte_offset`, `pts`, `program_date_time`, `last_delivered`.

**Diseño:**

- Escritura atómica `tmp + rename`; permisos `0640`.
- `read()` valida TTL con `clearstatcache(true, $path)` antes de `filemtime`.
- `startSequence()` devuelve `last_delivered + 1` o `1` sin cursor.
- `clear()` borra una clave.

**Matriz:**

- O1 ledgers nuevos PHP con pruebas de aislamiento/TTL · N4 · rev 5 · riesgo 0 · alineación 5 · coste 2 → ELEGIDA.
- O2 extender `ape_neuro_tracker.json` (strikes) · N1 · rev 3 · riesgo 2 · alineación 2 · coste 3 → descartada: mezcla strikes con cursor y no cumple store.
- O3 usar Redis/DB · N5 · rev 2 · riesgo 2 · alineación 1 · coste 5 → descartada: dependencia nueva.

**Verificación (VPS temporal, sin deploy):**

```text
No syntax errors detected in .../ape_cursor.php
No syntax errors detected in .../ape_cursor_test.php
PASS key is md5(ip+ch)
PASS different clients -> different keys
PASS write client A
PASS read client A
PASS client A resumes at 42
PASS client B is isolated
PASS client B starts at 1
PASS expired cursor is null
PASS expired cursor file removed
PASS cleanup A
PASS cleanup B
ALL_OK
test_exit=0
```

**No desplegado:** el archivo no se copió a `/var/www/html` ni a `/etc/nginx`; la prueba usó `/tmp/ara_i01_*` y `/dev/shm/ape_cursor` con claves de test, limpiadas.

## I02 — Ventana persistente (G2/G6)

**Estado:** VERIFIED (local; sin deploy).

**Archivos:**

- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/lib/ape_window.php`
- `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/ape_window_test.php`

**Política:** `keep=30`; `delete_threshold=10`; solo se poda cuando hay más de 40; se borran los más antiguos hasta 30. `resetOnChannelChange()` es el único camino que vacía la ventana completa.

**Verificación (VPS temporal `/tmp/ara_i02_*`):**

```text
PASS initial 45 segments
PASS prune deletes down to 30
PASS oldest removed
PASS newest retained
PASS normal prune is idempotent
PASS state write
PASS state read
PASS channel change clears 30 segments
PASS channel change clears state
ALL_OK
test_exit=0
```

**No desplegado:** solo `/dev/shm/ape_window_test_*`; no se tocó `/dev/shm/ape_cmaf_cache` de producción.

