# GATE DE COMMIT/PUSH — lo verificado vs lo que NO se toca

Fecha: 2026-10-25 23:0x America/Bogota · Capitán (toma de control de la tarea inyectada `t1`)
Repo: `hefarica/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION` · rama actual: `feat/adb-generic-visual-enhancement-installer`

## 1. Decisión

Se ejecutó **solo la vía segura**: publicar el commit que ya estaba verificado y que estaba
adelantado respecto de su propia rama remota. **No** se commiteó el working tree.

| Acción | Resultado |
|---|---|
| `git push origin HEAD:refs/heads/feat/adb-generic-visual-enhancement-installer` | **OK** — `db6ddc7..d322eb2` (fast-forward, sin `--force`) |
| Commits publicados | 1 (`d322eb2`) |
| Archivos publicados | 4 (`contracts/build_contracts.mjs`, `contracts/verify_contracts.mjs`, `contracts/crystal_contracts.json`, `docs/upscale_lab/crystal-upscale.ps1`) — 672 inserciones |
| Commits del working tree | **0** (excluidos, ver `EXCLUDED_WIP.md`) |
| `HEAD` local | `d322eb214b73134558c4f4964d776bc2bfac0e7c` |
| Remoto tras push | `d322eb214b73134558c4f4964d776bc2bfac0e7c` (ahead 0 / behind 0) |

## 2. Por qué ese commit califica como "verificado"

- El propio commit sustituye pins falsos (`codeHash "099A1707…"`, `manifestHash "a1b2c3d4…"`,
  `configHash "pending"`) por integridad real: SHA-256 de los 9 artefactos + pin del contrato
  = SHA-256 del JSON canónico.
- El verificador tiene gates que **pueden fallar** (12 comprobaciones) y el commit declara las
  pruebas en ambos sentidos (mutar 1 parámetro → FAIL exit 1; artefacto alterado → FAIL; manifest
  con 1 byte más → FAIL).
- Auditoría previa al push: 0 archivos `target/`, 0 `.env`/claves/secretos en el diff
  (scan de `AKIA…`, `BEGIN … PRIVATE KEY`, `ghp_…`, `sk-…`, `password=`, `api_key=`), 0 líneas
  añadidas sospechosas.

## 3. Colisión detectada (importante — no es un fallo del commit)

`node contracts/verify_contracts.mjs` **falla hoy en local** con:

```
FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh:
      contrato 9b774bffbe6c744f… vs real b558b1cdff883579…
RESULT=FAIL (1 fallos, 11 ok)   exit 1
```

Causa medida: el **working tree** de ese archivo está modificado por otra sesión
(`git status` → ` M _vps_stage/tests/fanout_concurrency.sh`, +23 líneas, 99.666 bytes vs 98.126)
mientras el contrato sigue pinneando los bytes **del commit**.

Prueba de que el commit es coherente (hash de bytes, no de disco):

| Fuente | SHA-256 | Bytes |
|---|---|---|
| Pin del contrato (9 artefactos) | `9b774bffbe6c744fc205136561c506e3bf93af8e1dea575304d16ae5601a6c94` | — |
| `git show HEAD:_vps_stage/tests/fanout_concurrency.sh` | `9b774bffbe6c744f…a6c94` (**= pin**) | 98.126 |
| Disco (working tree, otra sesión) | `b558b1cdff883579041391830318d424fc8d8d07323ef7a5167374055b7399fc` | 99.666 |

**Conclusión:** el commit publicado es autoconsistente; el FAIL local es drift no commiteado de
otra sesión. No se tocó, no se revirtió, no se commiteó ese archivo.

**Acción requerida de la sesión dueña de esa edición:** cuando termine, regenerar el contrato y
commitear **artefacto + `contracts/crystal_contracts.json` juntos**:

```
node contracts/build_contracts.mjs [--manifest …]
node contracts/verify_contracts.mjs      # debe dar PASS 12, exit 0
```

## 4. Regla de gate para el resto del trabajo (queda vigente)

1. Nada del working tree se commitea sin: (a) diff revisado archivo por archivo, (b) verificación
   real ejecutada y citada, (c) autoría/scope identificado (no se barre WIP de otra sesión).
2. Prohibido `git add -A`, `git add .`, `commit -a` y `push --force`.
3. Los borrados masivos (`/target/`) no se commitean: son artefactos de build; si se quiere
   limpiar el índice, va en un commit propio y explícito, nunca mezclado.
4. Cada push debe verificar `git ls-remote` == `git rev-parse HEAD` y quedar registrado aquí o en
   `docs/ops/session-coordination/notices.jsonl`.
