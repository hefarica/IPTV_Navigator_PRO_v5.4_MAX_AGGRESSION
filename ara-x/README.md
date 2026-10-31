# ARA-X — baseline verificable (Lead)

Estado: **v0.1 · baseline staged**. No hay despliegue en el VPS, no hay commit y no se tocó
`frontend/**` ni `IPTV_v5.4_MAX_AGGRESSION/vps/**` (scopes de otros workstreams activos).

## Qué resuelve

El objetivo del propietario es el flujo **ONN 4K (ARA-X) ⇄ VPS ⇄ origen**:

1. `GET` de la lista M3U8.
2. `POST /sync` cada 30 s con métricas.
3. Respuesta con ajustes dinámicos (ABR, perfil, buffer, levers).
4. Re-request de segmento con parámetros óptimos.

Este baseline entrega lo que **sí** es posible y verificable hoy:

- El **bloque `#EXT-X-ARA-*`** correcto para el catálogo real (sin duplicar tags, sin declarar 8K
  indescodificable, metadata inerte).
- El **contrato `/sync`** bidireccional (HMAC, TTL, idempotencia, replay, offline, fail-open).
- El **cliente de referencia** y los **schemas** con tests deterministas.
- La corrección explícita del paso 4: **el dispositivo nunca muta la URL del segmento**; aplica
  política en player/APK y el VPS sigue seleccionando variante en el `GET`.

## Verdad medida que manda el diseño

| Hecho medido (2026-10-30) | Consecuencia |
|---|---|
| `https://iptv-ape.duckdns.org/sync` → **404** | `/sync` no existe; hay que crearlo, no “activarlo”. |
| `/ara/version` → **200**, `/ara/events` → **401**, `/a/` → **200**, `/health` → **200** | Hay plano de metadata y auth Bearer; se reutilizan, no se duplican. |
| `/lists/APE_LISTA_4K.m3u8` → **200**, **572.170.477 B**, `#EXT-X-VERSION:9`, **10.631 canales**, footer `VALIDATED:RFC8216-STRICT,verdict=PASS` | El bloque propuesto (`VERSION:6`) era un downgrade; ya hay VERSION:9, `INDEPENDENT-SEGMENTS` y `START`. Un capture previo de 150 MB estaba truncado: no se usa como denominador. |
| VPS: nginx **1.24.0**, `ape-crystal-rust` **inactive**, sin `combined_body_filter.lua` / `ape_virtual_4k.lua` / `decision_engine.lua` | El plano vivo es **metadata-only**; el VPS no remuxea ni toca píxeles. |
| ONN 4K = Amlogic **S905X4** | Decode real hasta 4K@60; **8K solo presentación/emulación**, nunca wire 8K ni `L153` con 8K. |

## Archivos

```
ara-x/
  README.md
  spec/
    ARA_X_PLAYLIST_BLOCK.md      # gramática y placement del bloque ARA-X (catálogo real)
    ARA_X_SYNC_PROTOCOL.md       # contrato /sync bidireccional end-to-end
  playlist/
    ara_x_injector.js            # inserta el bloque global (fail-open, idempotente)
    ara_x_validator.js           # invariantes: canales, URLs, STREAM-INF, ARA, truncamiento
  vps/
    client/ara_sync_client.js    # cliente de referencia v2 (guards R1/R4/R5/R6, sin dependencias)
    schema/sync_features.json    # catálogo único: features, content, ack, SoC, levers
    schema/sync_request.schema.json
    schema/sync_response.schema.json
    schema/device_policy.example.json
    php/ara-sync.php             # endpoint /sync staged (NO desplegado)
    php/config/ara-sync-keys.example.json
    nginx/ara-sync.conf          # location = /sync staged (NO desplegado)
    nginx/ara-sync-zone.conf     # limit_req 3r/m burst 6 solo /sync
  scripts/playlist/
    inject_cli.js                # CLI de inyección
    validate_cli.js              # CLI de auditoría
    e2e_baseline.js              # E2E sobre la captura completa
  scripts/
    gen_sync_schemas.js          # genera ambos schemas desde sync_features.json (--check = drift)
  tests/
    helpers/mini_schema.js       # validador JSON-Schema mínimo (sin deps)
    helpers/mock_sync_server.js  # /sync local v2: nonce histórico, idempotencia, rate-limit
    sync_contract.test.js        # HMAC, schema, honestidad prov/conf, guards, artifact, ack D4
    sync_e2e.test.js             # E2E local request→firma→política→verify→apply
    sync_security.test.js        # matriz R6 §6 (23 casos: auth, replay, SSRF, rate, headers)
```

## Verificación local

```powershell
node ara-x/scripts/gen_sync_schemas.js --check
node --check ara-x/vps/client/ara_sync_client.js
node --check ara-x/playlist/ara_x_injector.js
node --check ara-x/playlist/ara_x_validator.js
node --test ara-x/tests/sync_contract.test.js ara-x/tests/sync_e2e.test.js ara-x/tests/sync_security.test.js ara-x/tests/playlist.test.js
node ara-x/scripts/playlist/e2e_baseline.js
```

Resultado del baseline + D3: **77/77 tests PASS** (contrato v2 + E2E v2 + matriz de seguridad R6 +
10 playlist) y E2E sobre el catálogo completo de **10.631 canales / 572.170.477 B** con 0 pérdida y
0 URL mutada (ver `reports/V0_baseline_verification.md` y `reports/V2_e2e_baseline.md`).
El E2E usa un servidor mock loopback: demuestra el ciclo completo sin tocar el VPS. **No** es el
endpoint de producción: ese sigue staged y `/sync` en producción sigue devolviendo 404.

## Truth-guards (no negociables)

1. `#EXT-X-ARA-*` es **metadata inerte** (RFC 8216 §6.3.1): ningún player ejecuta código desde la lista.
2. ADB **no** se habilita remoto (RSA por host autorizado).
3. El **VPS no toca píxeles**: selecciona variantes/metadata/QoE; el realce es hardware del device/APK.
4. **8K wire prohibido** en S905X4/S905X3/MT8696 **y en `amlogic` (4K-only)**: solo
   `TARGET=DISPLAY` / `PRESENTATION`; `never_downscale=true` y `min_resolution=3840x2160`.
5. `L153` = 4K@60 (techo); nunca declarar un nivel por debajo de la resolución.
6. `VIDEO-RANGE=PQ` es hint de display; **nunca** `hvc1` público sobre fuente AVC sin daemon (FZ-01).
7. Sin pérdida de canales, sin `URI=` extra por canal (anti-509), sin headers tóxicos.
8. Sin secretos en la lista ni en logs: la auth va en HMAC por dispositivo.
9. **Identidad del catálogo** = `ref.artifact_sha256` + `generation_id` (las listas son polimórficas);
   el ETag HTTP es el tamaño del gzip y `Range` devuelve 200 chunked — **no** identifican ni verifican.
10. Telemetría honesta: `value/prov/age_ms/conf`; `null`⇔`unavailable`; `content.*` solo del LAB SSOT.
11. `/sync` = único canal de política del APK; `/a/cfg` sigue siendo loopback del VPS.

## Pendiente (requiere decisión/ventana del propietario)

- **Deploy producción NO-GO** hasta cerrar R6-F01..F04 y R4-F01..F04 (ver
  `spec/ARA_X_SYNC_PROTOCOL.md` §13.10) y abrir ventana VPS (`nginx -t`, reload, smoke, rollback).
- Reconciliar el drift repo↔VPS de `ape-meta-public.conf` / `prisma-ara-enroll.conf` antes de tocar
  el snippet 443 (R3-R2) y **no** usar el mapa legacy `tools/cicd` (R3-R1).
- Enrolamiento por dispositivo (B2 `ENROLL_SECRET`, B3 `deviceId`) para el store de claves de `/sync`.
- Módulo Lua de `/sync` (t24 I3-LUA) es un entregable separado: sin `/lists/`, sin `resty.http`.
- El endpoint PHP y los snippets nginx quedan **staged**: no se despliega nada desde este workstream.
