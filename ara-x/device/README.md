# `ara-x/device/` — aplicación en device (I4)

Compositor de payload de **D4** (`ara-x/spec/ara_x_device_apply.md`) que traduce la decisión del ADC
(`/sync`) a las **dos superficies reales** que existen hoy, sin inventar ninguna.

```
política (/sync)  ──▶  apply_composer.compose()  ──┬─▶ rows   "global <key> <int>"   → SettingsApplier (APK)
                             ▲                     ├─▶ cfg    {"pq":2,…,"ttl":120}    → POST /a/cfg (loopback VPS)
        medida del device ───┘                     └─▶ intents fps/never_downscale/tier/térmica/buffer_ms
```

| Archivo | Rol |
|---|---|
| `apply_composer.js` | compositor de referencia (JS, 0 dependencias) |
| `staged/ara_cfg_composer.php` | espejo **staged** para el VPS (no desplegado; `php -l` = NOT_RUN en este host) |
| `../scripts/device/compose_cli.js` | CLI: `--policy` / `--measured` / `--cfg` / `--selftest` |
| `../tests/device_apply.test.js` | 32 tests (allowlist, SoC, sensores null, duplicados, presupuesto) |

## Modelo honesto (leer antes de tocar)

1. **`rows` es lo único que llega al device.** Misma forma que `ape_mesh_device_settings()`: `<ns> <key> <val>`,
   con las 3 filas base (T0/T1/T2) y hasta 16 filas. El APK las aplica con su allowlist + `try-both-ns`.
2. **`cfg` NO lo consume el APK.** `/a/cfg` es loopback del VPS (`allow 127.0.0.1; deny all`) y alimenta `/a/`
   para los players; aquí sólo se compone y se valida su presupuesto (≤ 64 KB, TTL 1…3600, sin duplicados).
3. **`intents` no son settings.** `fps_target`, `never_downscale`, `processing_tier` y `thermal_limits` viajan
   como decisión al player/APK; `buffer_ms` es del player o `null` — **nunca** `buffer_health_pct` (modelo de red).
4. **Fail-closed de verdad:** una sola clave fuera de `actuator_allowlist.json` aborta **toda** la política
   (`rows: []`). SoC no medido / no canónico / distinto ⇒ `allowed:false` y cero filas. `never_downscale=false`
   o wire 8K ⇒ rechazo.
5. **Sin ADB, sin props, sin serial:** el compositor no ejecuta nada, no emite `setprop`/`getprop` y descarta
   `serial`/`chip` de la entrada (los lista en `ignored_inputs`).

## Uso

```powershell
node ara-x/scripts/device/compose_cli.js --selftest
node ara-x/scripts/device/compose_cli.js --policy p.json --measured m.json --cfg c.json --strict
node --test ara-x/tests/device_apply.test.js
```

`--strict` sale con 1 si `ok:false` o `allowed:false` (gate de CI).
