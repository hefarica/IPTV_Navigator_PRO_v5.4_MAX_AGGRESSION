# APK · importador de solo lectura del JSON homologado Crystal Pulse

**Fecha:** 2026-11-25  
**APK:** `com.ape.crystalagent` 3.10.1 (`versionCode 676`)  
**Estado:** implementado y compilado; **no instalado ni publicado**.  
**JSON de referencia:** `APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO_LAB_CALIBRATED_BULLETPROOF_HOMOLOGADO (2).json`  
**SHA-256 del archivo entregado:** `bf36b4fb19de7405c8ca41093ac5441c22c051f250e4e3ba0190bbd14cc938b4`  
**SHA-256 interno canónico:** `38ffd7a8cdb5050e9424298303495fdd79b33d13e7912cf73f2f0310c8805577`

## Qué se implementó

- Pantalla de diagnóstico en la APK: **Validar JSON homologado**.
- Entrada manual desde `MainActivity`; la Activity **no** abre el selector al arrancar.
- `ACTION_OPEN_DOCUMENT` con `CATEGORY_OPENABLE`; sin `takePersistableUriPermission`.
- Lectura única en memoria, fuera del hilo de UI, máximo **8 MiB**.
- JSON estricto: UTF-8 (decoder con REPORT), sin claves duplicadas, profundidad máxima 64.
- Estructura: `_meta.type=all_profiles`, schema `ape.crystal.pulse.homologation/1`, revisión 1.
- **12 perfiles heredados**, **5 perfiles de filtros**, **60 planes**, y referencias de `profile_reference_map` que resuelven y coinciden con `profiles`.
- SHA-256 canónico exacto:
  - `_meta.integrity.self_sha256` se sustituye por `""`.
  - claves ordenadas, separadores `,`/`:`, UTF-8, `ensure_ascii=False`.
  - números preservados con su lexema; cadenas re-encodeadas compatibles con `json.dumps`.
- Planes como datos: 4K `3840×2160`, 6K `5760×3240`; muestras 4:3 con activo `2880×2160`/`4320×3240`; `bwdif` primero solo en entrelazado; `pad` exacto; `max_strong` solo cambia CAS en Micro-SD/SD (`0.34`/`0.30` frente a `0.19`/`0.17`).
- Resultado separado: Estructura / Integridad / Planes.
- Si todo pasa: **«Válido — no aplicado»**.
- Si falla: **«Rechazado»** con campo y motivo.
- El hash interno **no autentica el origen** (se muestra esa advertencia).

## Garantías de no efecto

Código revisado: no ejecuta cadenas, rutas, URLs ni directivas; no escribe preferencias, `FluidStore`, `Config`, ficheros ni estado; no toca la sesión de reproducción, el servicio ARA ni el player. No hay red. Al cancelar o reiniciar no se recupera el documento.

## Evidencia

- `./gradlew :app:testDebugUnitTest` → **5/5 PASS**:
  - referencia válida, 12/5/60, hash `38ffd7…`;
  - hash alterado rechazado sin cambiar estructura/planes;
  - geometría de plan alterada rechazada;
  - JSON truncado rechazado;
  - clave duplicada rechazada.
- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**.
- APK: `app/build/outputs/apk/debug/app-debug.apk` · 28.537.689 B · SHA-256 `3B8A08DC9DA4312C75ACA48A994DD5E3525C529547FF7CF535E45BA3D3603AA1`.
- `aapt dump badging`: `versionCode 676`, `versionName 3.10.1-homologation-validator-676`.
- `aapt dump xmltree`: `com.ape.crystalagent.HomologationValidationActivity`, `exported=false`, `parentActivityName=MainActivity`.

## Cómo se usa

1. Abrir **APE Crystal Agent** (`MainActivity`).
2. Bajar hasta **JSON HOMOLOGADO · SOLO LECTURA**.
3. Pulsar **Validar JSON homologado (solo lectura)**.
4. Pulsar **Seleccionar JSON para validar** y elegir el JSON con el selector de Android.
5. Leer el resultado. **No se aplica nada**.

## Límites honestos

- El SHA-256 interno demuestra coherencia del documento, no autenticidad del origen.
- No se validó el flujo en un dispositivo físico (ONN/Fire TV); solo compilación, tests JVM y manifiesto.
- No se ha instalado ni publicado este APK; producción sigue con la versión anterior.
- La casilla `apeUniversalToggle` del hilo del enlace es otra función (parser/universal) y no forma parte de este importador.
