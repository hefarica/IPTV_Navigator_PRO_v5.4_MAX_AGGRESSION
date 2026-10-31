# ARA-X · X1 — integración opt-in en el generador (STAGED, sin tocar el archivo caliente)

Estado: **staged**. El parche NO se aplicó: el write-scope del workstream es `ara-x/**` y
`IPTV_v5.4_MAX_AGGRESSION/frontend/**` está en `forbidden_scopes`; además el árbol tenía cambios
sin commitear en el generador (` M`) antes de X1. Por contrato: **parche exacto + comando de
aplicación, y cero ediciones fuera del scope.**

## Artefactos

| Fichero | Qué es |
|---|---|
| `ara-x-hook.js` | Módulo del hook (navegador + Node). Default **OFF** (`window.ARA_X_ENABLED`), fail-open, idempotente. Bloque de 27 líneas + directivas per-channel opt-in. |
| `ara-x-hook.patch` | Parche único (`git apply`): nuevo `frontend/js/ape-v9/ara-x-hook.js`, 2 guards en `m3u8-typed-arrays-ultimate.js` (tras el header y tras `_ca11ValidateEntry`) y el `<script>` en `index-v4.html` **antes** del generador. |
| `ara_x_adapter.js` | Adaptador canónico **streaming** (Node, bounded-memory) para cualquier lista y cualquier N. Comparte las reglas puras del hook. CLI: `node ara_x_adapter.js <in> <out> --on [--per] [--list-version V]`. |
| `verify_integration.js` | 23 checks: hot files intactos, OFF identidad, ON posición/líneas/URLs, equivalencia con `ara-x/playlist/ara_x_injector.js`, fail-open, y el parche aplicado en repo temporal + `node -c`. |
| `verify_synthetic.js` | 37 checks sobre catálogos sintéticos **N=100 y N=40.000**: OFF byte-idéntico, bloque 1 vez, idempotencia, isomorfía per-channel, CRLF, variantes de header, 0 pérdida/0 URL mutada/0 duplicados, streaming acotado, fail-open, sin hardcode. |
| `baseline.json` | sha256/bytes de los hot files y de los artefactos staged (invariante de «no se tocó»). |

## Aplicación (requiere claim previo)

```bash
# 1) claim autorizado sobre IPTV_v5.4_MAX_AGGRESSION/frontend/** (COORDINATION_PROTOCOL §4)
# 2) validar y aplicar:
git apply --check --whitespace=nowarn ara-x/integration/ara-x-hook.patch
git apply           --whitespace=nowarn ara-x/integration/ara-x-hook.patch
# 3) verificar:
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ara-x-hook.js
node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
# 4) rollback:
git apply -R ara-x/integration/ara-x-hook.patch   # y rm del hook si hiciera falta
```

Con el parche aplicado, la app sigue **idéntica** hasta que alguien ponga `window.ARA_X_ENABLED = true`
(consola o config). `window.ARA_X_PER_CHANNEL = true` activa además las directivas por canal.

## Garantías verificadas (medidas, no declaradas)

- **OFF ⇒ byte-idéntico** (hook identidad; el guard no ejecuta nada; `transformText` OFF devuelve el mismo string).
- **ON ⇒** bloque de 27 líneas **una vez**, entre el header global y el primer `#EXTINF`; **0 URLs mutadas**; **0 canales perdidos**; **0 duplicados**.
- **Idempotente:** segunda pasada byte-idéntica (texto y fichero), incluido per-channel.
- **Isomórfico:** cada canal recibe sus directivas desde su propia evidencia (`tvg-id` → CHANNEL-ID, `ape-profile` → PROFILE-HINT), en cualquier posición y con cualquier N.
- **Polimórfico:** LF/CRLF, header con o sin línea en blanco, con o sin evidencia per-channel.
- **Bounded memory:** `maxPending` en el transform de 40.000 canales < 1 MiB (una línea, nunca la lista).
- **Fail-open:** flag que lanza, entradas inválidas o línea > 1 MiB ⇒ se copia la entrada intacta.
- **Sin hardcode:** el hook/adaptador no contienen `10631` ni ningún N concreto.
- **Equivalencia:** el bloque y el texto transformado son byte-idénticos a `ara-x/playlist/ara_x_injector.js`.

## Evidencia ejecutada

```
node ara-x/integration/verify_integration.js   # 23/23 PASS · ALL_OK
node ara-x/integration/verify_synthetic.js     # 37/37 PASS · ALL_OK (100 y 40.000)
node -c <generador> <resolver> <prober>        # 0 / 0 / 0
python deliverables/LAB_2026-10-26/verify_bulletproof.py   # VERDICT PASS (read-only)
```

`verify_bulletproof.py` (read-only: 0 escrituras) devuelve **PASS**: 108 comprobaciones
Excel→bulletproof con 0 errores, `lost=0`, 21 claves top-level sin faltantes, sha del Excel original
`663ef44e…52806a` (esperado) y BP `345783e3…093094`.

## Límites declarados (NO PASS)

- **E2E en navegador**: NOT_RUN — sin claim no se aplica el parche y no hay DOM/headless en este entorno.
- **Re-ejecución de las listas A/B de 572/568 MB**: no repetida aquí; ya cubierta por V2 (10.631/10.586 canales, 0 URL mutada, byte-idéntico intra-generación).
- `php -l` / `luac -p` / `nginx -t`: N/A para este entregable.
