# ARA-X · X1 — integración opt-in en el generador (STAGED, sin tocar el archivo caliente)

Estado: **staged y canónico**. El parche **aplica sobre un worktree limpio de HEAD `0833af7`**
(`git apply --check` ⇒ exit 0), sin depender de las +985 líneas no verificadas que el árbol de
trabajo principal tiene en el generador. El write-scope sigue siendo `ara-x/**` y
`IPTV_v5.4_MAX_AGGRESSION/frontend/**` está en `forbidden_scopes`: **no se edita `frontend/`**.

## Contexto (por qué hay un parche nuevo)

El parche anterior se generó contra el árbol de trabajo sucio (generador con **+985/−2** líneas) y
por eso fallaba sobre HEAD limpio en `m3u8-typed-arrays-ultimate.js:11200` e
`index-v4.html:3980`. Este parche se generó **dentro de un worktree `git worktree add --detach HEAD`**
y sus hunks usan los anclajes reales de HEAD:

| Fichero | Anclaje en HEAD | Hunk |
|---|---|---|
| `m3u8-typed-arrays-ultimate.js` | tras `controller.enqueue(encoded)` del header del stream | `@@ -10724,6 +10724,20 @@` |
| `m3u8-typed-arrays-ultimate.js` | tras `_ca11ValidateEntry(entry, index);` (+ `const`→`let`) | `@@ -10744,9 +10758,16 @@` |
| `index-v4.html` | antes de `<script src="js/ape-v9/m3u8-typed-arrays-ultimate.js…">` | `@@ -3980,6 +3980,8 @@` |

No se usa ningún contexto de las líneas sucias: los tres anclajes existen **una sola vez** en HEAD
(`git cat-file blob HEAD:…`), y el generador limpio es **LF** (`.gitattributes eol=lf`) mientras
`index-v4.html` va en **CRLF**; el parche respeta ambos.

## Artefactos

| Fichero | Qué es |
|---|---|
| `ara-x-hook.js` | Módulo del hook (navegador + Node). Default **OFF** (`window.ARA_X_ENABLED`), fail-open, idempotente. Bloque de 27 líneas + directivas per-channel opt-in. |
| `ara-x-hook.patch` | Parche único (`git apply`) para **HEAD limpio**: nuevo `frontend/js/ape-v9/ara-x-hook.js`, 2 guards en el generador y el `<script>` en `index-v4.html` antes del generador. 3 archivos / 4 hunks. |
| `ara_x_adapter.js` | Adaptador canónico **streaming** (Node, bounded-memory) para cualquier lista y cualquier N. Comparte las reglas puras del hook. CLI: `node ara_x_adapter.js <in> <out> --on [--per] [--list-version V]`. |
| `verify_integration.js` | **23 checks**: hot files intactos, OFF identidad, ON posición/líneas/URLs, equivalencia con `ara-x/playlist/ara_x_injector.js`, fail-open, y el parche aplicado en un **worktree limpio de HEAD** (`git worktree add --detach HEAD`) con `node -c`. |
| `verify_synthetic.js` | **37 checks** sobre catálogos sintéticos **N=100 y N=40.000**: OFF byte-idéntico, bloque 1 vez, idempotencia, isomorfía per-channel, CRLF, variantes de header, 0 pérdida/0 URL mutada/0 duplicados, streaming acotado, fail-open, sin hardcode. |
| `baseline.json` | sha256/bytes de los hot files del worktree **y de los blobs limpios de HEAD**, más los artefactos staged (invariante de «no se tocó» + base del parche). |

## Aplicación (requiere claim previo sobre `frontend/**`)

```bash
# 1) claim autorizado sobre IPTV_v5.4_MAX_AGGRESSION/frontend/** (COORDINATION_PROTOCOL §4)
# 2) validar sobre HEAD limpio y aplicar:
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
node ara-x/integration/verify_integration.js   # 23/23 PASS · ALL_OK (incluye worktree limpio de HEAD)
node ara-x/integration/verify_synthetic.js     # 37/37 PASS · ALL_OK (100 y 40.000)
node -c <hook> <generador>                     # 0 / 0 sobre el worktree parcheado
python deliverables/LAB_2026-10-26/verify_bulletproof.py   # VERDICT PASS (read-only, 0 escrituras)
```

`git apply --check` sobre un worktree limpio de HEAD `0833af7` ⇒ **exit 0**; tras aplicar,
`node -c` del hook y del generador ⇒ **0/0**, y el `<script>` del hook queda antes del generador.

## Límites declarados (NO PASS)

- **E2E en navegador**: NOT_RUN — sin claim no se aplica el parche en el árbol principal y no hay DOM/headless en este entorno.
- **Re-ejecución de las listas A/B de 572/568 MB**: no repetida aquí; ya cubierta por V2 (10.631/10.586 canales, 0 URL mutada, byte-idéntico intra-generación).
- `php -l` / `luac -p` / `nginx -t`: N/A para este entregable.
