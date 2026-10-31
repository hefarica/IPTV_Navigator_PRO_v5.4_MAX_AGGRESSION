# ARA-X · Deploy Runbook

Estado: **repo/staged verificado; producción NO-GO** hasta cerrar F-01/F-05/F-09.

## Artefactos

- Integración aplicada: rama `feat/ara-x-canonical-integration`, commit `89efc0a`.
- Core: `7fd1da6`; artefactos: `083b07b`; parche limpio: `1eb1aac`.
- App: `0833af7`; `assembleDebug` OK; APK debug sha256 `391B00CB…F103B`.
- Paquete: `ARA_X_DELIVERY_20261030_224500.zip`, sha256 `26F8D629…AF6B7601`, 120/120.
- Tag de release: `ara-x-20261030` (integración).

## Precondiciones obligatorias

1. **F-01**: rotar credenciales del proveedor, regenerar 10.631 URLs, quitar `ACAO *`,
   `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`. Re-escanear 0 secretos.
2. **F-05**: primer deploy con `/sync` **404** (recomendado). No habilitar con clave global.
3. **F-09**: stage de deny/allowlist, backup, `nginx -t`, canary y rollback.
4. **App**: APK firmado e instalación por ADB autorizado.
5. **Ventana**: aprobación, backup final y responsable de rollback.

Si 1–3 no están cerrados: **detener**.

## Pre-deploy

```bash
git fetch origin
git checkout feat/ara-x-canonical-integration
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ara-x-hook.js
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node ara-x/integration/verify_integration.js   # 23/23
node ara-x/integration/verify_synthetic.js     # 37/37, 100 y 40k
python deliverables/LAB_2026-10-26/verify_bulletproof.py
```

- Backup: config nginx, lista actual, DB y APK anterior.
- `nginx -t` sobre staging; no reload de producción todavía.
- Confirmar que `/sync` sigue 404 y `/lists/` responde 200.

## App

```bash
cd IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent
./gradlew --offline :app:assembleDebug
# firmar release; instalar sólo en host ADB autorizado
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

ARA-X debe quedar **default OFF**; activar sólo en una lista de prueba.

## Deploy

1. CI/CD activo `_vps_stage/deploy`, modo **staging**, nunca `tools/cicd` legacy.
2. Aplicar sólo metadata/listas; no vídeo.
3. Canary 15–30 min.
4. Producción: backup final, `nginx -t`, reload.
5. No tocar `/lists/` contenido salvo la lista nueva; no CORS `*`.

## Verificación

- `/lists/` 200; mismo número de canales; **0 URL mutada**.
- `/sync` **404** (o 401 si se habilita) — nunca 200 sin HMAC.
- `/health` 200; `/ara/events` 401.
- Sin `Access-Control-Allow-Origin: *`; cache privada; 0 secretos.
- App: sin crash; ARA-X OFF; activar en prueba y medir.
- QoE: rebuffer/frame drops/errores; **no prometer 0 freezes**.

## Rollback

- Restaurar config nginx y lista anterior; `nginx -t`; reload.
- Reinstalar APK anterior.
- CI/CD rollback al commit/tag anterior.
- `/sync` vuelve a 404 si hubo problema.

## Límites físicos

- S905X4: decode máximo 4K; 8K sólo presentación.
- VPS: metadata/rebase, sin transcode ni mejora de píxeles.
- 6K HDR y LCEVC synthetic no son formatos reales de este stack; no declararlos.
