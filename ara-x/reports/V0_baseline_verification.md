# V0 · Verificación del baseline ARA-X (Lead)

Fecha: 2026-10-30 · Scope: `ara-x/**` · Entorno: Windows, Node `v24.12.0`
Resultado global: **PASS 32/32 tests** (17 contrato sync + 5 E2E sync + 10 playlist) · `node --check` OK ·
3/3 JSON válidos · **E2E de playlist sobre el catálogo completo: PASS** (10.631 canales, 0 pérdida, 0 URL mutada).

## 1. Comandos y resultados

```powershell
node --check ara-x/vps/client/ara_sync_client.js      # exit 0
node --check ara-x/tests/helpers/mini_schema.js       # exit 0
node --check ara-x/tests/helpers/mock_sync_server.js  # exit 0
node --check ara-x/tests/sync_contract.test.js        # exit 0
node --check ara-x/tests/sync_e2e.test.js             # exit 0

node -e "JSON.parse(...)"                              # OK sync_request.schema.json
                                                       # OK sync_response.schema.json
                                                       # OK device_policy.example.json

node --test ara-x/tests/sync_contract.test.js ara-x/tests/sync_e2e.test.js
node --test ara-x/tests/playlist.test.js                     # 10/10
node ara-x/scripts/playlist/e2e_baseline.js                  # catálogo completo
```

Salida de `node --test` (resumen):

```
tests 22
pass 22
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 291.014
```

Casos cubiertos:

| # | Caso | Estado |
|---|---|---|
| 1 | Vector HMAC de request (`0e5851ac…`) reproducido exacto | PASS |
| 2 | Vector HMAC de response (`2f00f129…`) verificado | PASS |
| 3 | Firma de response rechaza tampering | PASS |
| 4 | `buildSyncRequest` produce body schema-válido y < 16 KB | PASS |
| 5 | Schema rechaza campo requerido ausente y campo extra | PASS |
| 6 | `nonce` malformado rechazado | PASS |
| 7 | Política de ejemplo válida contra schema + guards | PASS |
| 8 | Wire 8K rechazado en `amlogic_s905x4` | PASS |
| 9 | Lever fuera de allowlist rechazado | PASS |
| 10 | Blend que no suma 1 rechazado | PASS |
| 11 | Clave tipo URL en la política rechazada | PASS |
| 12 | TTL > 120 s y política expirada rechazadas | PASS |
| 13 | Ventanas de replay (`seq`, `ts`, `nonce`) | PASS |
| 14 | Scheduler 30 s + jitter + backoff `[5,8,12.8,20.48,32.768,52.429,83.886,120] s` | PASS |
| 15 | Cache sirve última política hasta TTL y luego fail-open | PASS |
| 16 | Safe default schema-válido y conservador (`P2`, sin levers) | PASS |
| 17 | `applyPolicy` sólo devuelve knobs, nunca URLs/segmentos | PASS |
| 18 | E2E: request → HMAC → política → verify → apply (sin VPS) | PASS |
| 19 | E2E: thermal guard baja a P3, buffer 60 s, target 65 °C | PASS |
| 20 | E2E: replay de `seq` rechazado con 409 | PASS |
| 21 | E2E: firma inválida rechazada con 401 | PASS |
| 22 | E2E: timestamp fuera de ±300 s rechazado con 401 | PASS |

## 1b. Playlist E2E sobre el catálogo completo

La captura inicial de 150.410.194 B estaba **truncada** (2.795 `#EXTINF`, 2.794 URLs y un bloque final sin
URL). Se re-descargó el catálogo completo: **572.170.477 B**, sha256 `E27C03EB…E2A680`, con footer
`#EXT-X-APE-VALIDATED:RFC8216-STRICT,verdict=PASS,channels=10631`.

Composición medida del catálogo completo:

| Métrica | Valor |
|---|---|
| `#EXTINF` | 10.631 |
| URL únicas | 10.631 (0 duplicadas) |
| `tvg-id` únicos | 10.631 (0 duplicados) |
| `#EXT-X-STREAM-INF` | 10.631 (todos 4K/L153/PQ) |
| `#EXTATTRFROMURL` | 584.705 |
| `4KFALSE` | 42.524 |
| `#EXT-X-APE-8KFAKE` | 10.631 (`TARGET=DISPLAY`) |
| Perfiles | P1=808 · P3=2.300 · P4=7.523 |
| `#EXT-X-ARA-*` | 0 antes; 16 líneas después (1 bloque) |

Resultado del E2E (`node ara-x/scripts/playlist/e2e_baseline.js`, 147 s):

- `channels_preserved`: 10.631 → 10.631 PASS
- `capture_complete`: 10.631 = declarados PASS
- `url_bytes_preserved`: sha256 `f69a048f…f55f330` idéntico antes/después PASS
- `one_url_per_channel` (shape): 0 bloques malformados antes y después PASS
- `ara_block_exactly_once`: 0 → 1 PASS
- `no_duplicate_ara_directives`: PASS
- idempotencia: 2ª pasada `injected=false`, sha256 `3d7ed773…982b9130` byte-idéntica PASS

Evidencia completa: `ara-x/reports/V2_e2e_baseline.md` y `.json`.

**Hallazgo de verdad:** el catálogo declara 4K (`L153`) + `VIDEO-RANGE=PQ` en **los 10.631 canales**, y el
`4KFALSE` aparece 42.524 veces. Eso no es un defecto de la inyección, pero sí es material para la política
fail-closed (I5/D2): la declaración pública 4K/PQ debe gatearse por evidencia y por SoC, no asumirse.

## 2. Lo que esta verificación NO cubre (honesto)

- **Endpoint PHP `/sync`**: no implementado en este baseline; `php` no está instalado localmente
  (`php -l` = NOT_RUN). No se declara PASS.
- **Snippet nginx / deploy**: no desplegado, no probado contra el VPS. `/sync` en producción sigue
  siendo **404**.
- **Enrolamiento de claves**: bloqueantes B2 (`ENROLL_SECRET`) y B3 (`deviceId`) siguen abiertos;
  el modo token-only queda deshabilitado por defecto.
- **Integración en la lista servida**: el bloque `#EXT-X-ARA-*` está especificado e inyectado en una
  **copia local** del catálogo completo; NO se sirve todavía. Publicar requiere I2/V2 y
  aprobación/claim del workstream correspondiente.
- **ADC real** (fuzzy + Thompson + térmico): los valores de política del ejemplo son fijos; la
  decisión dinámica es D5/I1.

## 3. Reproducibilidad

Los vectores HMAC se calcularon con `node:crypto` y quedaron fijados en
`ara-x/tests/sync_contract.test.js`; cualquier cambio de canonicalización rompe el test 1 o 2, que es
exactamente lo que se busca. Los esquemas son autocontenidos (sin `$ref`) y se validan con un
validador mínimo propio (`ara-x/tests/helpers/mini_schema.js`), por lo que no hay dependencias npm.
