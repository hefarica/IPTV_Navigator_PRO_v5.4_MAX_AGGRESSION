# Freezeless · Visual Master Council — Reporte 401 (2026-06-18)

**Scope:** `quick` (debugging core S5/S10/S13 + verificación E2E) — fan-out completo de 13 PhDs
omitido por proporcionalidad (bug de auth acotado, no toca el pipeline de imagen). **Mode:** generate.
**Focus:** "revisar errores 401 y solucionarlo".

## Veredicto final: **PASS** (con nota de seguridad atendida)

Los `HTTP 401` **no eran un fallo del servidor** — eran la capa de auth del plano ARA/URL-2
**funcionando como diseñada**. El bug real era client-side: el secreto de enrolamiento del APK.

## Evidencia (read-only desde egress del VPS)

| Prueba | Resultado | Lectura |
|---|---|---|
| `/ara/enroll` secreto **bogus** | `401 BAD_SECRET` | auth rechaza credencial mala ✓ |
| `/ara/enroll` secreto **correcto** + pubkey bogus | `400 BAD_PUBKEY` | **auth PASA** → server sano ✓ |
| `/ara/events` **sin** Bearer | `401 UNAUTHORIZED` | auth rechaza sin token ✓ |
| `/ara/events` **con** Bearer correcto | `200` + stream SSE | **auth PASA** → server sano ✓ |
| nginx incluye `prisma-ara-{enroll,events}.conf` | sí | endpoints LIVE (ya no inertes) |
| `APE_ENROLL_SECRET` / `ARA_TOKEN` en pool php-fpm | seteados (48 chars) | env cargado en fpm ✓ |
| `ape-enroll-worker` + `/dev/shm/ape_enroll` | active + writable | cola operativa ✓ |

Logcat (06-18 10:55–10:58): 0 líneas `com.ape.crystalagent` → el APK **no corría**; los 401 venían
de pruebas `curl` por ADB (`/data/local/tmp/curl`), no del agente.

## Causa raíz

`EnrollClient.kt` enviaba a `/ara/enroll` un secreto que **no coincide** con `env[APE_ENROLL_SECRET]`
del VPS. Estado intermedio detectado en caliente: el secreto **real** quedó hardcodeado en el fuente
(`const val ENROLL_SECRET = "<48-hex>"`) — violación S10 (leak en git history al commitear).

## Fix aplicado (doctrina-compliant, sigue el patrón del commit b9703fa)

1. `app/build.gradle.kts` — `buildFeatures { buildConfig = true }` + `buildConfigField("String",
   "ENROLL_SECRET", …)` leído de **`local.properties` (`ape.enroll.secret`) → env `APE_ENROLL_SECRET`
   → placeholder inerte**.
2. `EnrollClient.kt` — usa `BuildConfig.ENROLL_SECRET`; **eliminado el literal** del fuente.
3. `local.properties` (gitignored ✓) — provisionado con el secreto real (sourced del VPS, no impreso).

`/ara/events` (Bearer `ARA_TOKEN`): **no requiere cambio de código** — `FeedForwardClient/IDataClient/
ListLoader/QoEReporter` ya mandan `Authorization: Bearer ${cfg.token}`; el token se provisiona por
archivo (`Config.kt`). El 401 por curl fue por no mandar el header.

## Pilares

- **FREEZELESS:** sin impacto. El plano ARA enroll/QoE es ortogonal a la reproducción
  (URL-1 verbatim intacta, 0 headers tóxicos, 0 cambios de codec/URL/manifest).
- **VISUAL MASTER:** sin impacto (no toca cascada/perfiles/probe).
- **SECURITY (S10):** secreto fuera del repo (solo en `local.properties` gitignored); 0 leaks en
  archivos trackeados verificado por grep en todo el repo.
- **VPS-TOUCH-NOTHING:** solo diagnóstico read-only; **0 modificaciones** al VPS.

## Verificación

- Secreto hex presente **solo** en `local.properties` (gitignored) — grep repo-wide: 0 leaks.
- `EnrollClient.kt:46` → `BuildConfig.ENROLL_SECRET`; companion sin literal.
- `build.gradle.kts` wiring correcto (imports + `buildConfig=true` + `buildConfigField`).
- Pendiente del usuario: `gradlew assembleDebug` (confirmación final de compilación) + provisionar
  el token del device (`/sdcard/ape/token` = `ARA_TOKEN`) para `/ara/events`.

## Nota de higiene (no barrer)

Los cambios **staged** (`conviva-event.php` −23, `conviva_qoe_server.php` −1, `visual_profiles.json` −1)
son un **rollback de `content_mode_delta`** independiente de esta tarea — NO incluir en un commit del
fix 401 (regla `surgical-commit`).
