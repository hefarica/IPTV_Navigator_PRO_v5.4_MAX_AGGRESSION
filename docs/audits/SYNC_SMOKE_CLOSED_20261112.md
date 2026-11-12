# El sync-smoke del deploy comprobaba 5 de 11 — cerrado · 2026-11-12

**Corrida:** `43176002787` (ref `deploy/engine-restart-20261112` @ `6b47af8f`) · **success**

## El defecto

`verify.sh` lee `ARA_SYNC_VERIFY_KEY`. El job de **verify** la tenia; el job de **deploy** solo tenia `ARA_SYNC_KEY`. Como `deploy.sh` invoca `verify.sh`, el smoke del deploy corria **sin clave** y las ramas SKIP solo hacian `console.log`: **no entraban en el recuento**.

Resultado: el job que **muta el sistema** comprobaba la mitad que el job de solo lectura, y su resumen decia `5/5 OK · 0 FAIL` — un verde que ocultaba 6 controles no ejecutados.

## Antes / despues, medidos

| | Job de deploy, corrida `43173128335` | Job de deploy, corrida `43176002787` |
|---|---|---|
| resumen | `5/5 OK · 0 FAIL` | `11/11 OK · 0 FAIL` |
| `200 HMAC valido` | **SKIP** | **ok 200** |
| `200 firma de respuesta` | **SKIP** | **ok 200** |
| `buffer_target_s=120` | no se ejecutaba | **ok** |
| `never_drop_resolution=true` | no se ejecutaba | **ok** |
| `retry_policy presente` | no se ejecutaba | **ok** |
| `degrade.order sin resolution` | no se ejecutaba | **ok** |
| `/ara/events con token` | SKIP | **SKIP** (falta `ARA_VERIFY_TOKEN`: credencial real ausente) |

**7 controles nuevos de /sync**, no 5: el HMAC y la firma mas los cinco campos de politica.

## Correccion de mi propio reporte

Yo habia estado citando *«paridad 33/33 · smoke 11/11»* como el resultado del deploy. **Ese 11/11 era del job de verify.** El job de deploy corria 5. Mismo script, dos conjuntos de comprobaciones distintos, y los trate como uno solo.

## Lo que `/sync` devuelve, por primera vez con autenticacion real

```
buffer_s=45  buffer_target_s=120
retry_policy = {"max_attempts":4,"backoff_ms":[400,1200,3000,6000],
                "retry_on":[429,500,502,503,504],
                "follow_redirects":true,"never_degrade":true}
never_downscale=true   never_drop_resolution=true
degrade.order=["fps","processing"]
```

Es la **primera prueba autenticada** de que el endpoint de sincronizacion sirve una politica que **no degrada resolucion**:

- `never_drop_resolution: true`
- `never_degrade: true`
- `degrade.order = ["fps","processing"]` — **sin** `"resolution"`

Eso concuerda con la Ley Anti-Degradacion del repo (`docs/policies/ANTI_DEGRADATION_LAW.md`) y con el gate `check_anti_degradation_policy.js`. Que el endpoint lo devuelva **y el smoke lo verifique en cada deploy** convierte la doctrina en una comprobacion de CI, no en un documento.

## Lo que sigue abierto

`SKIP /ara/events con token: falta SYNC_TOKEN` — `secrets.ARA_VERIFY_TOKEN` **no existe**. Es una credencial real que falta, no un error de cableado: no se puede arreglar desde el repositorio.

## Efecto en el pipeline

`6 · rollback` = `skipped`: el deploy paso el conjunto **completo** de 11 comprobaciones con el codigo mutando el VPS, no 5. El verde de hoy es mas estricto que el de ayer.
